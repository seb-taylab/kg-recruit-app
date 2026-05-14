-- =========================================================================
-- Step 11 — Archive flow needs a `pre_archive_status` column so unarchive
-- can restore the application to where it was before. Without this, an
-- unarchive would have to guess the right state.
-- =========================================================================

alter table public.applications
  add column if not exists pre_archive_status text;
