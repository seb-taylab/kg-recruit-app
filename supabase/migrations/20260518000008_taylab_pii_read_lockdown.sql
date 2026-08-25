-- =========================================================================
-- Security — remove taylab_staff's latent cross-tenant PII READ grants
--
-- Audit finding #12: RLS grants taylab_staff read access to every branch's
-- applications, NRIC scans, signatures, generated PDFs, and per-application
-- events. This capability is UNUSED — every taylab dashboard page reads via
-- the service-role admin client (createAdminClient, which bypasses RLS), not
-- the RLS-enforced authenticated client. So the grant does nothing for the
-- app but leaves a live path for a taylab JWT to pull any branch's PII
-- directly through the authenticated API, with no audit trail (RLS SELECT
-- cannot write an audit row).
--
-- This migration removes the `is_taylab_staff()` disjunct from the SELECT
-- policies on those PII tables + the four storage buckets, leaving the
-- branch-scoped access exactly as-is. Taylab retains: aggregate counts
-- (service-role), audit_log / nudge_log / platform_settings reads, and all
-- branch/profile/settings management — none of which are touched here.
--
-- Scope note: taylab WRITE grants (applications_update, nric_uploads
-- modify) are intentionally NOT changed here — they're a separate decision.
-- This migration is READ-only lockdown, matching the audit finding.
--
-- Reversible: re-add `public.is_taylab_staff() or` to each USING clause if a
-- future taylab application-viewer is built (and instrument it with a
-- TAYLAB_VIEW audit emit at that time).
-- =========================================================================

-- ── PII tables: drop the taylab disjunct, keep branch access ──────────────
alter policy applications_select on public.applications
  using ( public.is_branch_user(branch_id) );

alter policy nric_uploads_select on public.nric_uploads
  using ( public.is_branch_user(branch_id) );

alter policy signatures_select on public.signatures
  using ( public.is_branch_user(branch_id) );

alter policy application_events_select on public.application_events
  using ( public.is_branch_user(branch_id) );

alter policy generated_pdfs_select on public.generated_pdfs
  using ( public.is_branch_user(branch_id) );

-- ── Storage buckets: recreate each read policy without the taylab bypass ──
-- (Storage policies were originally created via drop/create with these exact
--  names in 20260516000004_storage_branch_scope.sql — mirror that pattern.)

drop policy if exists "applicant-photos: same-branch read" on storage.objects;
create policy "applicant-photos: same-branch read"
  on storage.objects for select
  using (
    bucket_id = 'applicant-photos'
    and public.is_branch_user(
      (
        select a.branch_id from public.applications a
         where a.id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "nric-uploads: same-branch admin team read" on storage.objects;
create policy "nric-uploads: same-branch admin team read"
  on storage.objects for select
  using (
    bucket_id = 'nric-uploads'
    and public.is_branch_admin_team(
      (
        select a.branch_id from public.applications a
         where a.id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "signatures: same-branch read" on storage.objects;
create policy "signatures: same-branch read"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and public.is_branch_user(
      (
        select a.branch_id from public.applications a
         where a.id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "generated-pdfs: same-branch read" on storage.objects;
create policy "generated-pdfs: same-branch read"
  on storage.objects for select
  using (
    bucket_id = 'generated-pdfs'
    and public.is_branch_user(
      (
        select a.branch_id from public.applications a
         where a.id::text = (storage.foldername(name))[1]
      )
    )
  );
