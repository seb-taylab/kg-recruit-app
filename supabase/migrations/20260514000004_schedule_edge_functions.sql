-- =========================================================================
-- Schedule the two Edge Functions via pg_cron + pg_net.
--
-- Run this AFTER the functions are deployed:
--   supabase functions deploy purge-nric --no-verify-jwt
--   supabase functions deploy process-nudges --no-verify-jwt
--   supabase secrets set CRON_SECRET=<value>
--   supabase secrets set RESEND_API_KEY=<value>   -- nudges only
--
-- Replace <CRON_SECRET> below with the same value passed to
-- `supabase secrets set`. We store it as a custom Postgres setting so the
-- cron job can read it without leaking it through pg_cron's job list.
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Per-database setting so the cron jobs don't hard-code the secret ──
-- Run once with your real CRON_SECRET, then never touch again.
-- alter database postgres set app.cron_secret = '<CRON_SECRET>';
-- alter database postgres set app.project_url = 'https://twxfixwoplyctvwtbpkm.functions.supabase.co';

-- ── purge-nric: every 15 minutes ──
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-nric') then
    perform cron.unschedule('purge-nric');
  end if;
  perform cron.schedule(
    'purge-nric',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url     := current_setting('app.project_url') || '/purge-nric',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
          'Content-Type',  'application/json'
        )
      )
    $job$
  );
end $$;

-- ── process-nudges: every 15 minutes ──
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-nudges') then
    perform cron.unschedule('process-nudges');
  end if;
  perform cron.schedule(
    'process-nudges',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url     := current_setting('app.project_url') || '/process-nudges',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
          'Content-Type',  'application/json'
        )
      )
    $job$
  );
end $$;
