-- =============================================================================
-- Storage RLS — branch_id scoping
-- =============================================================================
-- Sebastian's 2026-05-16 security audit finding C1: the original storage
-- policies (migrations/20260513000003) only check that the caller is any
-- active branch user of any branch. They don't scope by branch_id. An
-- admin from Branch A could call createSignedUrl for an object owned by
-- Branch B and the policy would allow it.
--
-- Server code already gates every signing call by branch ownership, but
-- RLS is the second wall. This migration closes the hole.
--
-- All four buckets use the same path convention:
--   applicant-photos:  <application_id>/photo.jpg
--   nric-uploads:      <application_id>/<side>.<ext>
--   signatures:        <application_id>/<role>.png
--   generated-pdfs:    <application_id>/membership.pdf
--
-- Extract the application_id with storage.foldername(name)[1], cast to
-- UUID, look up applications.branch_id, then call is_branch_user() with
-- it. Taylab staff bypass via is_taylab_staff() (the existing semantic).
-- =============================================================================

-- Drop the old per-bucket policies first so we can recreate cleanly.
drop policy if exists "applicant-photos: branch + taylab read" on storage.objects;
drop policy if exists "nric-uploads: branch admin team + taylab read" on storage.objects;
drop policy if exists "signatures: branch + taylab read" on storage.objects;
drop policy if exists "generated-pdfs: branch + taylab read" on storage.objects;

-- ─── applicant-photos ────────────────────────────────────────────────
-- Note: new applicant photos go to Cloudinary (lib/cloudinary/client.ts);
-- this bucket only holds legacy / fixture rows. Same branch-scoping
-- applies regardless.
create policy "applicant-photos: same-branch read"
  on storage.objects for select
  using (
    bucket_id = 'applicant-photos'
    and (
      public.is_taylab_staff()
      or public.is_branch_user(
        (
          select a.branch_id from public.applications a
           where a.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

-- ─── nric-uploads ────────────────────────────────────────────────────
-- Branch-Admin-team-only read (excludes Chairman — NRIC scans aren't
-- needed for signing). Original policy used the broader branch-user
-- check; we tighten to admin team AND scope by branch.
create policy "nric-uploads: same-branch admin team read"
  on storage.objects for select
  using (
    bucket_id = 'nric-uploads'
    and (
      public.is_taylab_staff()
      or public.is_branch_admin_team(
        (
          select a.branch_id from public.applications a
           where a.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

-- ─── signatures ──────────────────────────────────────────────────────
-- Chairman needs to read prior signatures (applicant + referral) before
-- signing — so this stays at the broader is_branch_user level, just
-- branch-scoped.
create policy "signatures: same-branch read"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and (
      public.is_taylab_staff()
      or public.is_branch_user(
        (
          select a.branch_id from public.applications a
           where a.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );

-- ─── generated-pdfs ──────────────────────────────────────────────────
-- Same as signatures — Chairman + admins of the same branch.
create policy "generated-pdfs: same-branch read"
  on storage.objects for select
  using (
    bucket_id = 'generated-pdfs'
    and (
      public.is_taylab_staff()
      or public.is_branch_user(
        (
          select a.branch_id from public.applications a
           where a.id::text = (storage.foldername(name))[1]
        )
      )
    )
  );
