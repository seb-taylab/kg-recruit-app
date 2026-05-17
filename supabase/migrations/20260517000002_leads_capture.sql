-- =========================================================================
-- Sprint 2 of v4.1 Lead Routing build — Leads table + capture-to-application
-- linkage.
--
-- Builds on 20260517000001 (wing + events primitives). A lead is a
-- pre-application contact captured at an event by a booth admin. The wing
-- admin then routes the lead to a territorial branch for follow-up. When
-- the branch admin sends a membership magic link to the lead, the standard
-- application flow takes over and the lead's status flips to CONVERTED.
--
-- See KG_LeadReroute_RealisticPath.md for the design rationale. Sprint 2
-- ships first-route only (no reroute history table yet — that's Sprint 3+).
-- =========================================================================

-- 1) Leads status enum (text + CHECK, matches the existing pattern from
--    applications.status). 7 states cover the lifecycle from capture to
--    terminal.
--    CAPTURED  → just captured, no route yet (wing's "New" inbox)
--    ROUTED    → wing routed to a territorial branch, watching engagement
--    ENGAGED   → branch admin confirmed contact (manual flag or magic link sent)
--    CONVERTED → became an application; lead is now read-only
--    STALLED   → no engagement past observation threshold (Sprint 3 sets this)
--    COLD      → multiple reroute attempts failed (Sprint 4)
--    ARCHIVED  → terminal manual close (applicant unreachable, etc.)

create table public.leads (
  id uuid primary key default gen_random_uuid(),

  -- Origin
  event_id uuid not null references public.events(id),
  wing_branch_id uuid not null references public.branches(id),

  -- Captured fields (the 6 booth-form inputs)
  full_name text not null check (char_length(full_name) between 2 and 100),
  mobile_number text not null check (char_length(mobile_number) between 8 and 20),
  postal_code text check (postal_code is null or postal_code ~ '^\d{6}$'),
  nric_last_4 text not null check (nric_last_4 ~ '^\d{3}[A-Z]$' or nric_last_4 ~ '^[A-Z0-9]{4}$'),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),

  -- Consent + audit
  consent_pdpa boolean not null default false,
  consent_text_version text not null,
  captured_by_user_id uuid references auth.users(id),
  captured_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,

  -- Routing state
  status text not null default 'CAPTURED' check (status in (
    'CAPTURED',
    'ROUTED',
    'ENGAGED',
    'CONVERTED',
    'STALLED',
    'COLD',
    'ARCHIVED'
  )),
  routed_to_branch_id uuid references public.branches(id),
  routed_at timestamptz,
  routed_by_user_id uuid references auth.users(id),

  -- Conversion
  converted_to_application_id uuid references public.applications(id),
  converted_at timestamptz,

  -- Soft-archive
  archived_at timestamptz,
  archived_by_user_id uuid references auth.users(id),
  archive_reason text
);

-- 2) Indexes for the hot query paths
create index idx_leads_wing_status on public.leads(wing_branch_id, status);
create index idx_leads_routed_branch on public.leads(routed_to_branch_id, status)
  where routed_to_branch_id is not null;
create index idx_leads_dedup on public.leads(nric_last_4, mobile_number);
create index idx_leads_event on public.leads(event_id, captured_at desc);

-- 3) Trigger: wing_branch_id must match the event's branch (i.e. the wing
--    that owns the event). Cross-wing leads are nonsense.
create or replace function public.enforce_lead_wing_matches_event()
returns trigger
language plpgsql
as $$
declare
  event_wing uuid;
begin
  select branch_id into event_wing
  from public.events
  where id = new.event_id;

  if event_wing is null then
    raise exception 'lead event_id % does not exist', new.event_id;
  end if;

  if event_wing <> new.wing_branch_id then
    raise exception 'lead.wing_branch_id must match event.branch_id (event %, expected wing %, got %)',
      new.event_id, event_wing, new.wing_branch_id;
  end if;

  return new;
end
$$;

create trigger trg_enforce_lead_wing_matches_event
  before insert or update of event_id, wing_branch_id on public.leads
  for each row execute function public.enforce_lead_wing_matches_event();

-- 4) Trigger: routed_to_branch_id must point at a TERRITORIAL branch.
--    Routing a lead to a wing is nonsense.
create or replace function public.enforce_lead_routed_to_territorial()
returns trigger
language plpgsql
as $$
declare
  target_type text;
begin
  if new.routed_to_branch_id is null then
    return new;
  end if;

  select branch_type into target_type
  from public.branches
  where id = new.routed_to_branch_id;

  if target_type is null then
    raise exception 'routed_to_branch_id % does not exist', new.routed_to_branch_id;
  end if;

  if target_type <> 'territorial' then
    raise exception 'leads.routed_to_branch_id must reference a territorial branch (got %)', target_type;
  end if;

  return new;
end
$$;

create trigger trg_enforce_lead_routed_to_territorial
  before insert or update of routed_to_branch_id on public.leads
  for each row execute function public.enforce_lead_routed_to_territorial();

-- 5) Application linkage (two-way FK so we can navigate both directions
--    without a JOIN). NULL when the application wasn't created from a lead
--    (i.e. the existing branch-driven invite flow).
alter table public.applications
  add column lead_id uuid references public.leads(id);

create index idx_applications_lead on public.applications(lead_id)
  where lead_id is not null;

-- 6) RLS — three reader paths, three writer paths.
--
--    Read access:
--      • wing team (wing_admin, wing_chairman) of the OWNING wing
--      • territorial branch admin team of the ROUTED-TO branch
--      • taylab_staff (cross-tenant)
--
--    Insert (capture):
--      • wing_admin of the wing — booth admin model
--      • taylab_staff
--      (Branch-admin-at-booth is Sprint 3+ — for YP40, only the YP wing's
--       admins capture.)
--
--    Update:
--      • wing_admin (route, engage, archive)
--      • branch admin team of the routed-to branch (engage flag,
--        post-conversion mark)
--      • taylab_staff
--
--    Delete:
--      • taylab_staff only (data ownership stays with the platform)
alter table public.leads enable row level security;

create policy "leads: wing team + routed branch + taylab read"
  on public.leads for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          -- wing team of the owning wing
          (p.branch_id = leads.wing_branch_id and p.role in ('wing_admin', 'wing_chairman'))
          -- territorial branch admin team of the routed branch
          or (leads.routed_to_branch_id is not null
              and p.branch_id = leads.routed_to_branch_id
              and p.role in ('branch_master_admin', 'branch_admin', 'branch_team_member', 'branch_chairman'))
          -- taylab cross-tenant
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "leads: wing admin + taylab insert"
  on public.leads for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = leads.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "leads: wing admin + routed branch admin + taylab update"
  on public.leads for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = leads.wing_branch_id and p.role = 'wing_admin')
          or (leads.routed_to_branch_id is not null
              and p.branch_id = leads.routed_to_branch_id
              and p.role in ('branch_master_admin', 'branch_admin', 'branch_team_member'))
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "leads: taylab delete"
  on public.leads for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and p.role = 'taylab_staff'
    )
  );

-- 7) Self-documentation
comment on table public.leads is
  'Pre-application contact records captured at wing-run events (YP40, etc.). Routed by wing admin to a territorial branch; converted to an application when the branch admin sends a membership magic link.';

comment on column public.leads.nric_last_4 is
  'Last 4 of NRIC (3 digits + check letter) — used as a strong dedup key alongside mobile_number. Full NRIC is captured later in the standard application flow.';

comment on column public.leads.consent_text_version is
  'Identifier for the consent string the applicant saw at capture time. Lets us evolve the consent text without losing audit history.';

comment on column public.leads.status is
  '7-state lifecycle. CAPTURED → ROUTED → ENGAGED → CONVERTED (or STALLED → COLD → ARCHIVED for non-success paths).';

comment on column public.applications.lead_id is
  'When set, this application was converted from a lead. Lets the wing dashboard show conversion outcomes per lead source.';
