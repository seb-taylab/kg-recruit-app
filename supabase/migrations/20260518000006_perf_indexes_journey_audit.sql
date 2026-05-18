-- =========================================================================
-- Perf indexes — 2026-05-18 audit pass.
--
-- Two queries today produce a "filter then sort-in-memory" plan because no
-- existing index covers both the predicate AND the order:
--
-- 1. /branch/journey (lib/journey/data.ts)
--      select ... from applications
--      where branch_id = $1
--      order by applicant_invited_at desc
--    Covered by:  idx_applications_branch_status(branch_id, status)
--      — wrong sort key. Branch+invited combo needs its own index.
--
-- 2. /taylab/audit (app/(dashboard)/taylab/audit/page.tsx)
--      select ... from audit_log
--      where action = $1
--      order by created_at desc
--      limit 100
--    Covered by:  idx_audit_log_application(application_id, created_at desc)
--                 idx_audit_log_branch(branch_id, created_at desc)
--      — neither helps a global action filter. Need an action-keyed index.
--
-- Both writes (applications + audit_log) are infrequent vs reads; index
-- maintenance cost is negligible. Both new indexes follow the existing
-- (key_column, sort_column desc) pattern in this schema.
-- =========================================================================

create index if not exists idx_applications_branch_invited
  on public.applications (branch_id, applicant_invited_at desc);

create index if not exists idx_audit_log_action_created
  on public.audit_log (action, created_at desc);

comment on index public.idx_applications_branch_invited is
  'Covers /branch/journey order-by-applicant_invited_at filter-by-branch_id.';

comment on index public.idx_audit_log_action_created is
  'Covers /taylab/audit filter-by-action order-by-created_at.';
