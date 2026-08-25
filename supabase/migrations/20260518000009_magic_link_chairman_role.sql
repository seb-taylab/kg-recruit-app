-- =========================================================================
-- Feature — passwordless Chairman sign link (magic_links.intended_role +='chairman')
--
-- Chairmen currently sign only through the authenticated dashboard route
-- /branch/sign/[id]. To let a busy chairman sign from a WhatsApp link
-- without logging in (same trust model as the applicant/referral magic
-- links), magic_links must be allowed to carry intended_role = 'chairman'.
--
-- The original CHECK only permitted ('applicant','referral'). Widen it.
-- signatures.role already allows 'chairman', so no other schema change is
-- needed. Audit actor columns are already nullable (anonymous sign path).
-- =========================================================================

alter table public.magic_links
  drop constraint if exists magic_links_intended_role_check;

alter table public.magic_links
  add constraint magic_links_intended_role_check
  check (intended_role in ('applicant', 'referral', 'chairman'));
