-- =========================================================================
-- Lead route history — Sprint 5 of v4.1 lead routing.
--
-- Today a lead has ONE routed_to_branch_id. Per the v4.1 design, the wing's
-- expected operational rhythm is try → if no engagement → reroute → maybe
-- reroute again. This migration adds:
--   1. lead_route_history table  — full audit trail of every routing
--      decision (initial route + every reroute) with reason + actor.
--   2. leads.reroute_count       — denormalised counter, 0 on first route,
--      incremented on every reroute. Used by triage UI to surface
--      "rerouted 2 times" without an extra query.
--
-- Initial-route entries get written by the EXISTING routeLeadAction in
-- Sprint 2 (with reason='initial_route'). Reroute entries come from a new
-- rerouteLeadAction that ships alongside this migration.
--
-- RLS: wing team, FROM branch's admin team, and TO branch's admin team
-- can read history rows (so each branch sees the journey of leads they
-- touched). wing_admin + taylab can write.
-- =========================================================================

create table public.lead_route_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- Wing that owns the lead (denormalised from leads.wing_branch_id; lets
  -- RLS check without a join on every read).
  wing_branch_id uuid not null references public.branches(id),
  -- NULL on initial route (no previous branch). Required on every reroute
  -- — defence-in-depth via the trigger below.
  from_branch_id uuid references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  reason text not null check (reason in (
    'initial_route',
    'no_engagement',
    'branch_declined',
    'applicant_request',
    'wing_judgment',
    'other'
  )),
  reason_note text check (reason_note is null or char_length(reason_note) between 1 and 500),
  routed_by_user_id uuid not null references auth.users(id),
  routed_at timestamptz not null default now()
);

create index idx_lead_route_history_lead on public.lead_route_history(lead_id, routed_at desc);
create index idx_lead_route_history_to on public.lead_route_history(to_branch_id);
create index idx_lead_route_history_from on public.lead_route_history(from_branch_id)
  where from_branch_id is not null;

-- Trigger: initial_route MUST have from_branch_id NULL; every other reason
-- MUST have from_branch_id set. Keeps the table honest.
create or replace function public.enforce_route_history_invariants()
returns trigger
language plpgsql
as $$
begin
  if new.reason = 'initial_route' and new.from_branch_id is not null then
    raise exception 'initial_route entries must have from_branch_id = NULL';
  end if;
  if new.reason <> 'initial_route' and new.from_branch_id is null then
    raise exception 'reroute entries must have from_branch_id set (reason=%)', new.reason;
  end if;
  if new.from_branch_id is not null and new.from_branch_id = new.to_branch_id then
    raise exception 'from_branch_id and to_branch_id cannot be the same';
  end if;
  return new;
end
$$;

create trigger trg_enforce_route_history_invariants
  before insert or update on public.lead_route_history
  for each row execute function public.enforce_route_history_invariants();

-- Denormalised counter on leads. 0 on initial route, incremented per reroute.
-- Default 0 so existing leads (Sprint 2 captures) keep counting from zero.
alter table public.leads
  add column reroute_count int not null default 0;

-- RLS
alter table public.lead_route_history enable row level security;

create policy "lead_route_history: wing + touched branches + taylab read"
  on public.lead_route_history for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = lead_route_history.wing_branch_id
            and p.role in ('wing_admin', 'wing_chairman'))
          or (p.branch_id = lead_route_history.to_branch_id
            and p.role in ('branch_master_admin','branch_admin','branch_team_member','branch_chairman'))
          or (lead_route_history.from_branch_id is not null
            and p.branch_id = lead_route_history.from_branch_id
            and p.role in ('branch_master_admin','branch_admin','branch_team_member','branch_chairman'))
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "lead_route_history: wing admin + taylab insert"
  on public.lead_route_history for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = lead_route_history.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

comment on table public.lead_route_history is
  'Append-only audit of every routing decision for a lead (initial + reroutes). reason=initial_route marks the first entry; subsequent entries have from_branch_id set.';

comment on column public.leads.reroute_count is
  '0 on initial route, +1 per reroute. Derived from lead_route_history but denormalised for fast triage queries.';
