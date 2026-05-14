/**
 * Smoke-tests the NRIC purge by replicating exactly what the
 * supabase/functions/purge-nric Edge Function does:
 *   1. Backdate the test app's sent_to_hq_at to 25h ago
 *   2. Call list_nric_purge_candidates() — should now include this app
 *   3. For each candidate: storage.remove() + mark_nric_purged()
 *   4. Assert nric_uploads row gone, nric_purged_at set, audit row written
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const pgClient = new pg.Client({
  connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await pgClient.connect();
try {
  const { rows: apps } = await pgClient.query(
    `select a.id from public.applications a
        join public.nric_uploads u on u.application_id = a.id
       where a.status = 'SENT_TO_HQ' order by a.created_at desc limit 1`,
  );
  if (apps.length === 0) {
    console.error("No SENT_TO_HQ app with NRIC scans. Run step10-fixture.mjs first.");
    process.exit(1);
  }
  const appId = apps[0].id;
  console.log(`Target: ${appId}`);

  await pgClient.query(
    `update public.applications set sent_to_hq_at = now() - interval '25 hours' where id = $1`,
    [appId],
  );
  console.log("✓ Backdated sent_to_hq_at by 25h");

  const { rows: candidates } = await pgClient.query(
    `select * from public.list_nric_purge_candidates()`,
  );
  console.log(`  Candidates returned: ${candidates.length}`);

  let purged = 0;
  for (const c of candidates) {
    const { error: storageErr } = await sb.storage
      .from("nric-uploads")
      .remove([c.front_url, c.back_url]);
    if (storageErr) {
      console.error(`  ✗ storage.remove failed for ${c.application_id}:`, storageErr.message);
      continue;
    }
    const { rows: markRows } = await pgClient.query(
      `select public.mark_nric_purged($1) as purged`,
      [c.application_id],
    );
    if (markRows[0].purged) purged++;
  }
  console.log(`✓ Purged ${purged} app(s)`);

  const { rows: after } = await pgClient.query(
    `select a.nric_purged_at,
            exists(select 1 from public.nric_uploads u where u.application_id = a.id) as has_nric,
            (select count(*) from public.audit_log
              where application_id = a.id and action = 'NRIC_PURGED') as audit_rows
       from public.applications a where a.id = $1`,
    [appId],
  );
  const r = after[0];
  console.log(`  After: has_nric=${r.has_nric}, nric_purged_at=${r.nric_purged_at}, audit_rows=${r.audit_rows}`);

  const ok =
    r.has_nric === false &&
    r.nric_purged_at !== null &&
    Number(r.audit_rows) >= 1;
  console.log(ok ? "\n✓ PURGE SMOKE TEST PASSED" : "\n✗ PURGE SMOKE TEST FAILED");
  process.exit(ok ? 0 : 1);
} finally {
  await pgClient.end();
}
