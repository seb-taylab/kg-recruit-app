-- =========================================================================
-- Step 14 — Auto-nudge engine
--
-- The engine itself lives in TypeScript (lib/nudges/engine.ts) so each
-- stage can resolve its own anchor timestamp + recipients. This migration
-- only adds the `nudge_sends` log so the engine knows what's already been
-- sent and doesn't spam recipients.
-- =========================================================================

create table if not exists public.nudge_sends (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  stage text not null check (stage in (
    'applicant_link_unopened',
    'applicant_form_in_draft',
    'referral_unsigned',
    'chairman_unsigned',
    'ready_to_send_unactioned',
    'at_hq_stalled'
  )),
  recipients jsonb not null,
  sent_at timestamptz not null default now(),
  trigger text not null default 'scheduled' check (trigger in ('scheduled','manual'))
);

create index if not exists idx_nudge_sends_app_stage
  on public.nudge_sends (application_id, stage, sent_at desc);

create index if not exists idx_nudge_sends_branch
  on public.nudge_sends (branch_id, sent_at desc);
