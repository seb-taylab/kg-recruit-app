/**
 * Apply the pg_cron schedule for the two deployed Edge Functions.
 * Idempotent — replaces any existing job with the same name.
 *
 * The Bearer token is embedded directly in the cron command because
 * Supabase doesn't allow `ALTER DATABASE postgres SET app.cron_secret`.
 * cron.job is only readable by the `postgres` role, so this still keeps
 * the secret out of end-user view.
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

const url = env.DIRECT_URL ?? env.DATABASE_URL;
const cronSecret = env.CRON_SECRET;
const projectUrl = "https://twxfixwoplyctvwtbpkm.supabase.co/functions/v1";
if (!cronSecret) throw new Error("CRON_SECRET missing in .env.local");

const escSecret = cronSecret.replace(/'/g, "''");
const bearer = `Bearer ${escSecret}`;

const jobs = [
  { name: "purge-nric",    schedule: "*/15 * * * *", path: "purge-nric" },
  { name: "process-nudges", schedule: "*/15 * * * *", path: "process-nudges" },
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("create extension if not exists pg_cron");
  await client.query("create extension if not exists pg_net");

  for (const j of jobs) {
    // Unschedule any existing job with this name (cron.unschedule errors if missing).
    await client.query(
      `do $$ begin
         if exists (select 1 from cron.job where jobname = $1) then
           perform cron.unschedule($1);
         end if;
       end $$;`,
    ).catch(async () => {
      // The do-block above doesn't accept params — fall back to a plpgsql wrap.
      await client.query(
        `do $$ begin
           if exists (select 1 from cron.job where jobname = '${j.name}') then
             perform cron.unschedule('${j.name}');
           end if;
         end $$;`,
      );
    });

    const cmd = `select net.http_post(
        url := '${projectUrl}/${j.path}',
        headers := jsonb_build_object('Authorization', '${bearer}', 'Content-Type', 'application/json')
      )`;
    await client.query(`select cron.schedule($1, $2, $3)`, [j.name, j.schedule, cmd]);
    console.log(`✓ Scheduled ${j.name} (${j.schedule})`);
  }

  const { rows } = await client.query(
    `select jobname, schedule, active from cron.job where jobname in ('purge-nric','process-nudges') order by jobname`,
  );
  console.log("Final state:", rows);
} catch (err) {
  console.error("✗", err.message);
  process.exit(1);
} finally {
  await client.end();
}
