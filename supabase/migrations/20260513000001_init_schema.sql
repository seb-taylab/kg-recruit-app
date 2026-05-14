-- =========================================================================
-- KG Recruit App — initial schema
-- Source of truth: PAP_Membership_App_PRD_BuildPrompt.md v3.6, Section 3.
-- All tables tenant-scoped via branch_id (Taylab Staff is the only cross-tenant role).
-- =========================================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- platform_settings — global defaults (Taylab-managed)
-- -------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now(),
  updated_by_id uuid references auth.users(id)
);

-- -------------------------------------------------------------------------
-- branches — tenants (with per-branch override columns; NULL = inherit)
-- -------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  constituency text,
  hq_email text,
  email_from_display_name text,
  invite_ttl_hours int,
  default_routing_mode text
    check (default_routing_mode is null
           or default_routing_mode in ('direct_to_chairman','via_branch_admin_review')),
  nudge_config jsonb,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- profiles — branch admin team (3-tier) + chairman + taylab staff
-- -------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null
    check (role in (
      'branch_master_admin',
      'branch_admin',
      'branch_team_member',
      'branch_chairman',
      'taylab_staff'
    )),
  branch_id uuid references public.branches(id),  -- NULL for taylab_staff
  position text,
  position_other text,
  membership_no text,
  is_active boolean default true,
  deactivated_at timestamptz,
  deactivated_by_id uuid references auth.users(id),
  promoted_at timestamptz,
  promoted_by_id uuid references auth.users(id),
  created_at timestamptz default now(),
  created_by_id uuid references auth.users(id)
);

create index idx_profiles_active on public.profiles(branch_id, role) where is_active = true;

-- -------------------------------------------------------------------------
-- applications — the heart of the state machine
-- -------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT'
    check (status in (
      'DRAFT','APPLICANT_INVITED','APPLICANT_FILLING','SIGNED_BY_APPLICANT',
      'PENDING_REFERRAL_ASSIGNMENT','REFERRAL_INVITED','SIGNED_BY_REFERRAL',
      'PENDING_BRANCH_ADMIN_REVIEW','PENDING_CHAIRMAN','SIGNED_BY_CHAIRMAN',
      'READY_TO_SEND','SENT_TO_HQ',
      'COMPLETED','HQ_REJECTED',
      'REJECTED','EXPIRED','ARCHIVED'
    )),
  branch_id uuid not null references public.branches(id),

  -- invite metadata
  invited_by_admin_id uuid references auth.users(id),
  applicant_email text,
  applicant_phone text not null,
  applicant_name_at_invite text,
  invite_delivery_channels text[],

  -- personal particulars
  -- Addendum v1.3 Gap 1: surname + given_names captured separately so we
  -- can underline the surname on the printed PDF. `name` is kept as a
  -- denormalised derived column (UPPER(surname) || ' ' || given_names).
  nric_no text,
  surname text,
  given_names text,
  name text,
  chinese_name text,
  home_address text,
  postal_code text,
  -- Addendum v1.3 Gap 9: CHECK constraints lock tick-box values to the
  -- form-coordinates.ts keys byte-for-byte. Misspelt value would draw the
  -- tick at NaN. validate-form-coordinates.ts enforces parity in CI.
  housing_type text
    check (housing_type is null
           or housing_type in ('HDB','Condominium','Landed')),
  hdb_rooms int,
  date_of_birth date,
  place_of_birth text,
  race text
    check (race is null
           or race in ('Chinese','Malay','Indian','Others')),
  gender text
    check (gender is null
           or gender in ('Male','Female')),
  marital_status text
    check (marital_status is null
           or marital_status in ('Single','Married','Divorced')),
  tel_home text,
  tel_office text,
  tel_hp text,

  -- education (Addendum v1.3 Gap 9 CHECK lock)
  highest_edu text
    check (highest_edu is null or highest_edu in (
      'Primary',
      'Lower Sec / N / O Level',
      'Nitec',
      'Post Sec / A Level',
      'Diploma',
      'Degree',
      'Post Grad'
    )),
  written_languages text[],
  spoken_languages text[],

  -- social
  facebook text,
  linkedin text,
  twitter text,
  blog text,
  email text,

  -- employment (Addendum v1.3 Gap 9 CHECK lock on monthly_income)
  occupation text,
  organisation text,
  monthly_income text
    check (monthly_income is null or monthly_income in (
      'Below $1,500',
      '$1,501 - $5,000',
      '$5,001 - $10,000',
      'Above $10,000'
    )),
  hobbies text[],

  -- memberships
  trade_unions text,
  associations text,
  clubs text,
  ccc text,
  ccmc text,
  rnc text,
  grassroots text,

  -- Addendum v1.3 Gap 11: is_yp / is_papsg / is_ww / is_ppf columns from
  -- PRD v3.6 §3 are OMITTED. They belong to the "For Official Use Only"
  -- column on page 1 of the form — HQ's space, not captured by the
  -- system. PDF generator renders nothing in that region.

  -- photo
  applicant_photo_url text,
  applicant_photo_captured_method text,

  -- referral assignment (post-applicant-signature)
  assigned_referral_email text,
  assigned_referral_phone text,
  assigned_referral_name text,
  assigned_referral_membership_no text,
  assigned_referral_known_years int,
  referral_invite_delivery_channels text[],
  referral_assigned_at timestamptz,
  referral_assigned_by_id uuid references auth.users(id),

  -- routing fork
  routing_choice text
    check (routing_choice is null
           or routing_choice in ('direct_to_chairman','via_branch_admin_review')),
  branch_admin_review_at timestamptz,
  branch_admin_review_by_id uuid references auth.users(id),

  -- chairman (Addendum v1.3 Gap 5: name-on-form is captured separately
  -- from profiles.full_name so the Chairman can override the printed
  -- name at the sign step without renaming their account)
  chairman_name_on_form text,
  chairman_known_years int,

  -- chairman sign + recipient picker step
  chairman_signed_at timestamptz,
  ready_to_send_at timestamptz,
  pdf_recipients jsonb,
  sent_by_id uuid references auth.users(id),
  sent_to_hq_at timestamptz,
  hq_pdf_url text,

  -- HQ outcome (recorded by Branch Admin Team)
  hq_outcome_recorded_at timestamptz,
  hq_outcome_recorded_by_id uuid references auth.users(id),
  hq_approved_date date,
  hq_approved_membership_no text,
  hq_approved_notes text,
  hq_rejected_date date,
  hq_rejected_reason text,
  hq_rejected_reason_details text,
  hq_outcome_reversed_at timestamptz,
  hq_outcome_reversed_by_id uuid references auth.users(id),
  hq_outcome_reversal_reason text,

  -- per-phase timestamps (denormalised for fast dashboard queries)
  applicant_invited_at timestamptz,
  applicant_link_opened_at timestamptz,
  applicant_filling_started_at timestamptz,
  applicant_signed_at timestamptz,
  referral_link_opened_at timestamptz,
  referral_signed_at timestamptz,

  -- NRIC purge
  nric_purged_at timestamptz,

  -- rejection / archive
  rejected_at timestamptz,
  rejected_by_id uuid references auth.users(id),
  rejected_reason text,
  archived_at timestamptz,
  archived_by_id uuid references auth.users(id),
  archive_reason text,

  -- meta
  consent_pdpa boolean default false,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index idx_applications_branch_status on public.applications(branch_id, status);
create index idx_applications_sent_to_hq_at on public.applications(branch_id, sent_to_hq_at)
  where status = 'SENT_TO_HQ';
create index idx_applications_completed_at on public.applications(branch_id, completed_at)
  where status = 'COMPLETED';

-- -------------------------------------------------------------------------
-- nric_uploads — auto-purged 24h after SENT_TO_HQ (Edge Function)
-- -------------------------------------------------------------------------
create table public.nric_uploads (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  front_url text not null,
  back_url text not null,
  uploaded_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- signatures — 3 per application (applicant / referral / chairman)
-- -------------------------------------------------------------------------
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  role text check (role in ('applicant','referral','chairman')),
  signer_name text not null,
  signature_png_url text not null,
  signed_at timestamptz default now(),
  ip_address inet,
  user_agent text
);

-- -------------------------------------------------------------------------
-- magic_links — time-bounded, single-use, no gate, no revoke
-- -------------------------------------------------------------------------
create table public.magic_links (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  token_hash text unique not null,
  intended_role text check (intended_role in ('applicant','referral')),
  expires_at timestamptz not null,
  expires_at_history jsonb default '[]'::jsonb,
  link_opened_at timestamptz,
  consumed_at timestamptz,
  generated_by_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_magic_links_application on public.magic_links(application_id);

-- -------------------------------------------------------------------------
-- link_deliveries — audit trail per channel
-- -------------------------------------------------------------------------
create table public.link_deliveries (
  id uuid primary key default gen_random_uuid(),
  magic_link_id uuid references public.magic_links(id) on delete cascade,
  channel text check (channel in ('email','copy_link','whatsapp')),
  delivered_by_id uuid references auth.users(id),
  delivered_at timestamptz default now(),
  metadata jsonb
);

-- -------------------------------------------------------------------------
-- audit_log — every action; service-role inserts, taylab-staff reads
-- -------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid,
  branch_id uuid,
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

create index idx_audit_log_application on public.audit_log(application_id, created_at desc);
create index idx_audit_log_branch on public.audit_log(branch_id, created_at desc);

-- -------------------------------------------------------------------------
-- generated_pdfs — one per completed-PDF send
-- -------------------------------------------------------------------------
create table public.generated_pdfs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) unique,
  branch_id uuid not null references public.branches(id),
  pdf_url text not null,
  emailed_to_hq_at timestamptz,
  generated_at timestamptz default now()
);

-- -------------------------------------------------------------------------
-- application_events — canonical milestone timeline
-- -------------------------------------------------------------------------
create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  event_type text not null,
  actor_id uuid,
  actor_role text,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  occurred_at timestamptz default now()
);

create index idx_application_events_app_time on public.application_events(application_id, occurred_at);
create index idx_application_events_branch_type on public.application_events(branch_id, event_type);

-- -------------------------------------------------------------------------
-- nudge_log — dedup unique index prevents duplicate sends
-- -------------------------------------------------------------------------
create table public.nudge_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  stage text not null,
  interval_hours int not null,
  recipient_type text not null,
  recipient_email text not null,
  sent_at timestamptz default now()
);

create unique index idx_nudge_dedup on public.nudge_log(
  application_id, stage, interval_hours, recipient_type, recipient_email
);
