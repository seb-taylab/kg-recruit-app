-- =========================================================================
-- wing_observation_preferences — per-wing configurable thresholds for
-- triage scoring + reroute / cold-path policy. Replaces the "sensible
-- defaults" placeholder in /wing/settings.
--
-- One row per wing (PK = wing_branch_id). Wing admins read + write their
-- own row; wing_chairman + taylab read; no one else.
--
-- Default values match the v4.1 design doc (KG_LeadReroute_RealisticPath.md
-- §Lead-phase observation thresholds): 2/5/7/14/30 day buckets.
-- =========================================================================

create table public.wing_observation_preferences (
  wing_branch_id uuid primary key references public.branches(id) on delete cascade,
  -- Lead routed but no acknowledgment from the branch (no Mark engaged
  -- yet, no convert). Past this, wing UI dots the row yellow.
  ack_attention_days int not null default 2 check (ack_attention_days between 1 and 60),
  -- Acknowledged (Engaged) but no application invite sent yet. Past this,
  -- wing sees a soft warning.
  engagement_attention_days int not null default 5 check (engagement_attention_days between 1 and 90),
  -- Application invite sent but applicant hasn't started filling. Past this,
  -- wing sees a soft warning (the applicant, not the branch, is the bottleneck).
  form_sent_attention_days int not null default 7 check (form_sent_attention_days between 1 and 90),
  -- Aging in any pre-conversion state. Past this, lead is a strong reroute
  -- candidate (status flips to STALLED via the Sprint 6 cron, when shipped).
  lead_aging_days int not null default 14 check (lead_aging_days between 3 and 180),
  -- Total lifecycle ceiling. Past this, lead enters COLD path — wing
  -- decides archive / direct contact / re-route / re-engagement.
  lead_cold_days int not null default 30 check (lead_cold_days between 7 and 365),
  -- Branch is "saturated" when it holds this many or more pre-engagement
  -- leads aged > ack_attention_days. Auto-suggest deprioritises saturated
  -- branches (Sprint 6 work).
  branch_saturation_threshold int not null default 10 check (branch_saturation_threshold between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users(id),
  -- Invariant: aging < cold. Caught at insert/update time.
  constraint aging_lt_cold check (lead_aging_days < lead_cold_days)
);

-- One row per wing — enforced by PK on wing_branch_id. No additional index
-- needed; lookups are always by wing_branch_id (PK).

alter table public.wing_observation_preferences enable row level security;

-- Read: wing_admin + wing_chairman of THIS wing, plus taylab_staff.
create policy "wing_obs_prefs: wing team + taylab read"
  on public.wing_observation_preferences for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_observation_preferences.wing_branch_id
            and p.role in ('wing_admin', 'wing_chairman'))
          or p.role = 'taylab_staff'
        )
    )
  );

-- Write (insert/update/delete): wing_admin only; taylab_staff bypass.
create policy "wing_obs_prefs: wing admin + taylab insert"
  on public.wing_observation_preferences for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_observation_preferences.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "wing_obs_prefs: wing admin + taylab update"
  on public.wing_observation_preferences for update
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_observation_preferences.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

comment on table public.wing_observation_preferences is
  'Per-wing thresholds for triage scoring + reroute policy. One row per wing; absence ⇒ defaults (matched to the CHECK defaults above).';
