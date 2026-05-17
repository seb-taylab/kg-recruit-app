-- =========================================================================
-- Sprint 1 of v4.1 Lead Routing build — Wing + Events primitives.
--
-- Background: PAP organisation has WING branches (e.g. Young PAP) that sit
-- ABOVE territorial branches (e.g. KG, Tampines). Wings run events that
-- generate inbound leads, which get routed to territorial branches for
-- follow-up. See KG_LeadReroute_RealisticPath.md (v4.1) for the full design.
--
-- This migration ONLY adds the wing/events primitives. The leads table +
-- routing logic ships in Sprint 2 (20260518000001_lead_capture.sql).
--
-- Backwards-compat: every existing row in `branches` gets branch_type =
-- 'territorial' and parent_wing_id = NULL. KG Kampong Glam (the only
-- existing branch) is unaffected.
-- =========================================================================

-- 1) Branch type taxonomy ----------------------------------------------------
-- 'territorial' = constituency branch (KG, Tampines, etc.) — the existing
--                 default; runs its own pipeline, can receive routed leads.
-- 'wing'        = parent layer (Young PAP, Women's Wing, etc.) — runs events,
--                 routes leads to territorial branches, has dispatcher role.
alter table public.branches
  add column branch_type text not null default 'territorial'
    check (branch_type in ('territorial', 'wing'));

-- 2) Wing parent link --------------------------------------------------------
-- Territorial branches CAN reference a wing they're affiliated with. NULL is
-- valid (standalone territorials with no wing). Wings themselves have NULL
-- (they aren't children of another wing — single-level hierarchy only).
alter table public.branches
  add column parent_wing_id uuid references public.branches(id);

-- Enforce that parent_wing_id (when set) points to a row with
-- branch_type = 'wing'. PG can't express this as a CHECK because CHECKs can't
-- subquery, so we use a trigger. Wing's hierarchy is single-level — a wing
-- can't have a parent wing — also enforced here.
create or replace function public.enforce_parent_wing_constraint()
returns trigger
language plpgsql
as $$
declare
  parent_type text;
begin
  if new.parent_wing_id is null then
    return new;
  end if;

  -- Self-reference would create an infinite loop.
  if new.parent_wing_id = new.id then
    raise exception 'parent_wing_id cannot equal branch id';
  end if;

  select branch_type into parent_type
  from public.branches
  where id = new.parent_wing_id;

  if parent_type is null then
    raise exception 'parent_wing_id % does not exist', new.parent_wing_id;
  end if;

  if parent_type <> 'wing' then
    raise exception 'parent_wing_id must reference a branch with branch_type = wing (got %)', parent_type;
  end if;

  -- Wings themselves cannot have a parent wing (single-level hierarchy).
  if new.branch_type = 'wing' then
    raise exception 'wing branches cannot have a parent_wing_id';
  end if;

  return new;
end
$$;

create trigger trg_enforce_parent_wing_constraint
  before insert or update of parent_wing_id, branch_type on public.branches
  for each row execute function public.enforce_parent_wing_constraint();

create index idx_branches_parent_wing on public.branches(parent_wing_id)
  where parent_wing_id is not null;

create index idx_branches_type on public.branches(branch_type);

-- 3) Wing-specific roles -----------------------------------------------------
-- wing_admin    = operational role; routes leads, manages reroutes,
--                 configures observation thresholds.
-- wing_chairman = oversight + chairman-level decisions for the wing.
--
-- The constraint is rewritten in place — `add constraint` after `drop` so
-- existing rows are re-validated against the new list. None should fail
-- because no existing role is removed.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in (
    'branch_master_admin',
    'branch_admin',
    'branch_team_member',
    'branch_chairman',
    'wing_admin',
    'wing_chairman',
    'taylab_staff'
  ));

-- 4) Events table ------------------------------------------------------------
-- Events belong to a WING branch. Territorial branches don't run events in
-- the lead-routing model — they receive leads, they don't capture them. A
-- check constraint enforces this via the trigger below.
--
-- Slug is per-branch unique (so two wings can each have an event with slug
-- 'yp40' without collision). Slug is the URL handle for the capture form:
-- /event/[slug] under the wing's subdomain (TBD; for now, branch-id-scoped).
create table public.events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  slug text not null,
  event_date date,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_id uuid references auth.users(id),
  unique (branch_id, slug)
);

create index idx_events_branch_active on public.events(branch_id, is_active);

-- Trigger: enforce that events.branch_id points to a wing.
create or replace function public.enforce_event_belongs_to_wing()
returns trigger
language plpgsql
as $$
declare
  parent_type text;
begin
  select branch_type into parent_type
  from public.branches
  where id = new.branch_id;

  if parent_type is null then
    raise exception 'event branch_id % does not exist', new.branch_id;
  end if;

  if parent_type <> 'wing' then
    raise exception 'events.branch_id must reference a wing branch (got %)', parent_type;
  end if;

  return new;
end
$$;

create trigger trg_enforce_event_belongs_to_wing
  before insert or update of branch_id on public.events
  for each row execute function public.enforce_event_belongs_to_wing();

-- 5) RLS on events -----------------------------------------------------------
-- Read: wing team members (wing_admin, wing_chairman) of the owning wing,
--       plus taylab_staff (cross-tenant). Territorial branches CANNOT read
--       events directly — they see leads (Sprint 2) which carry routing
--       context. Events are wing-internal organisation.
-- Write: wing_admin only (chairman is oversight, not operations). Plus
--        taylab_staff.
alter table public.events enable row level security;

create policy "events: wing team + taylab read"
  on public.events for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = events.branch_id and p.role in ('wing_admin', 'wing_chairman'))
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "events: wing admin + taylab insert"
  on public.events for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = events.branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "events: wing admin + taylab update"
  on public.events for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = events.branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "events: wing admin + taylab delete"
  on public.events for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = events.branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

-- 6) Comments for self-documentation -----------------------------------------
comment on column public.branches.branch_type is
  'territorial = constituency branch (KG, Tampines). wing = parent layer (Young PAP) that runs events and routes leads.';

comment on column public.branches.parent_wing_id is
  'For territorial branches: optional reference to the wing they affiliate with. Enforced by trigger to point at a wing-type branch only.';

comment on table public.events is
  'Wing-organised events (e.g. YP40). Generates leads (Sprint 2). Belongs to a wing branch; territorial branches cannot own events.';

comment on column public.profiles.role is
  '5 branch roles + 2 wing roles + 1 taylab_staff cross-tenant role. wing_admin = ops, wing_chairman = oversight.';
