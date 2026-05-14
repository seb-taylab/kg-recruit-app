-- =========================================================================
-- Step 10 — NRIC auto-purge (DB-side helpers only)
--
-- The actual file deletion has to go through the Supabase Storage API
-- (a `protect_delete` trigger on storage.objects blocks direct SQL deletes
-- to prevent orphaned files). So the heavy lifting lives in the
-- `purge-nric` Edge Function under supabase/functions/, which:
--
--   1. Finds eligible apps (sent_to_hq_at < now() - 24h, nric_purged_at is null)
--   2. Calls Storage API to remove the front/back files
--   3. Calls `mark_nric_purged()` below to clear the metadata row + write audit
--
-- This migration adds the metadata-side helper so the Edge Function (and the
-- ad-hoc Node test script) don't need to repeat the same multi-statement
-- update.
-- =========================================================================

create extension if not exists pg_cron;

-- Idempotent cleanup of any earlier attempt that tried to touch storage.objects.
drop function if exists public.purge_nric_uploads_for(uuid);
drop function if exists public.purge_eligible_nric_uploads();
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-nric') then
    perform cron.unschedule('purge-nric');
  end if;
end $$;

-- ── Metadata-side purge ───────────────────────────────────────────────────
-- Caller is responsible for deleting the underlying storage files BEFORE
-- invoking this (otherwise the file paths are lost and the files orphan).
-- Returns true if a row was purged, false if nothing matched.
create or replace function public.mark_nric_purged(_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _front text;
  _back text;
  _branch uuid;
begin
  select front_url, back_url, branch_id
    into _front, _back, _branch
    from public.nric_uploads
   where application_id = _application_id;
  if not found then
    return false;
  end if;

  delete from public.nric_uploads
   where application_id = _application_id;

  update public.applications
     set nric_purged_at = now()
   where id = _application_id;

  insert into public.audit_log
    (application_id, branch_id, actor_id, actor_email, actor_role, action, metadata)
  values
    (_application_id, _branch, null, 'system@kg-recruit', 'system', 'NRIC_PURGED',
     jsonb_build_object('front', _front, 'back', _back));

  return true;
end;
$$;

-- ── List eligible apps for the Edge Function to sweep ─────────────────────
-- Returned columns include the storage paths so the Edge Function can
-- delete the files without a second round-trip.
create or replace function public.list_nric_purge_candidates()
returns table (application_id uuid, front_url text, back_url text)
language sql
security definer
set search_path = public
as $$
  select a.id, u.front_url, u.back_url
    from public.applications a
    join public.nric_uploads u on u.application_id = a.id
   where a.sent_to_hq_at is not null
     and a.sent_to_hq_at < now() - interval '24 hours'
     and a.nric_purged_at is null;
$$;
