-- =========================================================================
-- KG Recruit App — Row Level Security
-- Source: PAP_Membership_App_PRD_BuildPrompt.md v3.6, Section 6 RLS POLICIES.
--
-- Branch users = profiles with role in (
--   branch_master_admin, branch_admin, branch_team_member, branch_chairman
-- ) where branch_id matches.
-- Taylab Staff = profiles.role = 'taylab_staff', cross-tenant with audit.
--
-- Service role bypasses RLS implicitly (Supabase platform).
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper functions (security definer, schema-qualified)
-- -------------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
   where id = auth.uid() and is_active = true
   limit 1
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.profiles
   where id = auth.uid() and is_active = true
   limit 1
$$;

create or replace function public.is_taylab_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role = 'taylab_staff'
       and is_active = true
  )
$$;

create or replace function public.is_branch_user(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and is_active = true
       and branch_id = target_branch
       and role in (
         'branch_master_admin',
         'branch_admin',
         'branch_team_member',
         'branch_chairman'
       )
  )
$$;

create or replace function public.is_branch_admin_team(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and is_active = true
       and branch_id = target_branch
       and role in (
         'branch_master_admin',
         'branch_admin',
         'branch_team_member'
       )
  )
$$;

-- -------------------------------------------------------------------------
-- Enable RLS on every public table
-- -------------------------------------------------------------------------
alter table public.platform_settings    enable row level security;
alter table public.branches             enable row level security;
alter table public.profiles             enable row level security;
alter table public.applications         enable row level security;
alter table public.nric_uploads         enable row level security;
alter table public.signatures           enable row level security;
alter table public.magic_links          enable row level security;
alter table public.link_deliveries      enable row level security;
alter table public.audit_log            enable row level security;
alter table public.generated_pdfs       enable row level security;
alter table public.application_events   enable row level security;
alter table public.nudge_log            enable row level security;

-- -------------------------------------------------------------------------
-- platform_settings — Taylab Staff CRUD only
-- -------------------------------------------------------------------------
create policy platform_settings_taylab_select on public.platform_settings
  for select using (public.is_taylab_staff());

create policy platform_settings_taylab_modify on public.platform_settings
  for all using (public.is_taylab_staff())
  with check (public.is_taylab_staff());

-- -------------------------------------------------------------------------
-- branches — branch users read own; master+admin update own; taylab CRUD all
-- -------------------------------------------------------------------------
create policy branches_select on public.branches
  for select using (
    public.is_taylab_staff()
    or public.is_branch_user(id)
  );

create policy branches_insert_taylab on public.branches
  for insert with check (public.is_taylab_staff());

create policy branches_update on public.branches
  for update using (
    public.is_taylab_staff()
    or (
      public.is_branch_user(id)
      and public.current_role() in ('branch_master_admin','branch_admin')
    )
  )
  with check (
    public.is_taylab_staff()
    or (
      public.is_branch_user(id)
      and public.current_role() in ('branch_master_admin','branch_admin')
    )
  );

create policy branches_delete_taylab on public.branches
  for delete using (public.is_taylab_staff());

-- -------------------------------------------------------------------------
-- profiles — self read; same-branch team read each other; taylab read all
-- -------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_branch on public.profiles
  for select using (
    branch_id is not null
    and public.is_branch_user(branch_id)
  );

create policy profiles_select_taylab on public.profiles
  for select using (public.is_taylab_staff());

create policy profiles_insert_taylab on public.profiles
  for insert with check (public.is_taylab_staff());

create policy profiles_insert_branch_master_admin on public.profiles
  for insert with check (
    branch_id is not null
    and public.is_branch_user(branch_id)
    and public.current_role() in ('branch_master_admin','branch_admin')
  );

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy profiles_update_branch_master_admin on public.profiles
  for update using (
    branch_id is not null
    and public.is_branch_user(branch_id)
    and public.current_role() in ('branch_master_admin','branch_admin')
  );

create policy profiles_update_taylab on public.profiles
  for update using (public.is_taylab_staff());

-- -------------------------------------------------------------------------
-- applications — branch users see own branch; taylab see all
-- (Applicant access via magic link is service-role, not RLS path)
-- -------------------------------------------------------------------------
create policy applications_select on public.applications
  for select using (
    public.is_taylab_staff()
    or public.is_branch_user(branch_id)
  );

create policy applications_insert_branch_admin on public.applications
  for insert with check (
    public.is_branch_admin_team(branch_id)
  );

create policy applications_update_branch_admin on public.applications
  for update using (
    public.is_taylab_staff()
    or public.is_branch_admin_team(branch_id)
    or (
      public.is_branch_user(branch_id)
      and public.current_role() = 'branch_chairman'
    )
  );

-- -------------------------------------------------------------------------
-- nric_uploads — branch users read; admin team write. NOT referral.
-- -------------------------------------------------------------------------
create policy nric_uploads_select on public.nric_uploads
  for select using (
    public.is_taylab_staff()
    or public.is_branch_user(branch_id)
  );

create policy nric_uploads_modify_admin on public.nric_uploads
  for all using (
    public.is_branch_admin_team(branch_id)
    or public.is_taylab_staff()
  )
  with check (
    public.is_branch_admin_team(branch_id)
    or public.is_taylab_staff()
  );

-- -------------------------------------------------------------------------
-- signatures — branch users + taylab read; service-role inserts
-- -------------------------------------------------------------------------
create policy signatures_select on public.signatures
  for select using (
    public.is_taylab_staff()
    or public.is_branch_user(branch_id)
  );

-- -------------------------------------------------------------------------
-- magic_links — never readable by client (service role only)
-- -------------------------------------------------------------------------
-- Branch admin team can list links for their applications (no token_hash leak)
create policy magic_links_select_branch on public.magic_links
  for select using (
    public.is_branch_admin_team(branch_id)
    or public.is_taylab_staff()
  );

-- -------------------------------------------------------------------------
-- link_deliveries — branch users + taylab read
-- -------------------------------------------------------------------------
create policy link_deliveries_select on public.link_deliveries
  for select using (
    exists (
      select 1 from public.magic_links ml
       where ml.id = magic_link_id
         and (
           public.is_taylab_staff()
           or public.is_branch_user(ml.branch_id)
         )
    )
  );

-- -------------------------------------------------------------------------
-- application_events — branch + taylab read-only; service-role inserts
-- -------------------------------------------------------------------------
create policy application_events_select on public.application_events
  for select using (
    public.is_taylab_staff()
    or public.is_branch_user(branch_id)
  );

-- -------------------------------------------------------------------------
-- nudge_log — taylab read only; service-role inserts
-- -------------------------------------------------------------------------
create policy nudge_log_select_taylab on public.nudge_log
  for select using (public.is_taylab_staff());

-- -------------------------------------------------------------------------
-- generated_pdfs — branch users + taylab read
-- -------------------------------------------------------------------------
create policy generated_pdfs_select on public.generated_pdfs
  for select using (
    public.is_taylab_staff()
    or public.is_branch_user(branch_id)
  );

-- -------------------------------------------------------------------------
-- audit_log — read by taylab only; insert via service role only
-- -------------------------------------------------------------------------
create policy audit_log_select_taylab on public.audit_log
  for select using (public.is_taylab_staff());
