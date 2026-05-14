/**
 * Supabase Edge Function — silently deletes NRIC scans 24h after SENT_TO_HQ.
 *
 * Deploy:
 *   supabase functions deploy purge-nric --no-verify-jwt
 *   supabase secrets set CRON_SECRET=<random>
 *
 * Schedule (in supabase/migrations or via dashboard):
 *   select cron.schedule(
 *     'purge-nric',
 *     '*\/15 * * * *',
 *     $$select net.http_post(
 *        url := '<project-url>/functions/v1/purge-nric',
 *        headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
 *      )$$
 *   );
 *
 * Smoke-test locally:
 *   curl -X POST $URL/functions/v1/purge-nric -H "Authorization: Bearer $CRON_SECRET"
 */
// @ts-expect-error — Deno globals resolve at edge-runtime, not in this Next project's TS env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-expect-error — Deno global
Deno.serve(async (req: Request) => {
  // @ts-expect-error — Deno.env
  const secret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createClient(
    // @ts-expect-error
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: candidates, error: listErr } = await sb.rpc(
    "list_nric_purge_candidates",
  );
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let purged = 0;
  const failures: string[] = [];
  for (const row of (candidates ?? []) as Array<{
    application_id: string;
    front_url: string;
    back_url: string;
  }>) {
    const { error: storageErr } = await sb.storage
      .from("nric-uploads")
      .remove([row.front_url, row.back_url]);
    if (storageErr) {
      failures.push(`${row.application_id}: ${storageErr.message}`);
      continue;
    }
    const { error: markErr } = await sb.rpc("mark_nric_purged", {
      _application_id: row.application_id,
    });
    if (markErr) {
      failures.push(`${row.application_id}: ${markErr.message}`);
      continue;
    }
    purged++;
  }

  return new Response(
    JSON.stringify({ purged, failures }),
    { headers: { "content-type": "application/json" } },
  );
});
