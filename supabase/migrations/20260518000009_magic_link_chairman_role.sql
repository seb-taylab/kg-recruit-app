-- =========================================================================
-- Feature — passwordless Chairman sign link (magic_links.intended_role)
--
-- Lets a busy chairman sign from a WhatsApp link without logging in (same
-- trust model as the applicant/referral magic links) by allowing
-- intended_role = 'chairman'.
--
-- IMPORTANT: the live database already carried a value 'chairman_in_person'
-- (added out-of-band, ahead of this repo — see the migration-drift
-- reconciliation). This constraint is therefore a SUPERSET: it keeps every
-- previously-allowed value and only ADDS 'chairman'. Never drop
-- 'chairman_in_person' here or existing rows / the other feature break.
--
-- signatures.role already allows 'chairman'; audit actor columns are
-- nullable (anonymous sign path). No other schema change needed.
-- =========================================================================

alter table public.magic_links
  drop constraint if exists magic_links_intended_role_check;

alter table public.magic_links
  add constraint magic_links_intended_role_check
  check (intended_role in ('applicant', 'referral', 'chairman', 'chairman_in_person'));
