-- =========================================================================
-- PDPA fix — purge the raw NRIC NUMBER, not just the scan images
--
-- mark_nric_purged() (20260514000001_nric_purge.sql) deletes the
-- nric_uploads row + the two scan files and stamps nric_purged_at, but it
-- never cleared applications.nric_no. The advertised "NRIC purge" therefore
-- left the most sensitive field — the raw NRIC string — retained
-- indefinitely, a data-retention violation.
--
-- Timing is safe: the purge only runs 24h after sent_to_hq_at, by which
-- point the PDF has already been rendered from nric_no and stored as a
-- durable artefact in generated-pdfs. nric_no is not read after SENT_TO_HQ,
-- so nulling it here cannot break the form.
--
-- This migration only adds `nric_no = null` to the existing UPDATE. Every
-- other statement (nric_uploads delete, nric_purged_at stamp, audit row) is
-- reproduced verbatim so the function stays a single source of truth.
-- =========================================================================

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
     set nric_purged_at = now(),
         nric_no = null   -- PDPA: purge the raw NRIC string, not just scans
   where id = _application_id;

  insert into public.audit_log
    (application_id, branch_id, actor_id, actor_email, actor_role, action, metadata)
  values
    (_application_id, _branch, null, 'system@kg-recruit', 'system', 'NRIC_PURGED',
     jsonb_build_object('front', _front, 'back', _back));

  return true;
end;
$$;
