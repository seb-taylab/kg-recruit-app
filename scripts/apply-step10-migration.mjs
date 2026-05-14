/**
 * One-shot: apply the Step 10 NRIC-purge migration to the cloud DB via the
 * session pooler (Supabase CLI is unauthenticated in this environment).
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
if (!url) {
  console.error("No DIRECT_URL / DATABASE_URL in .env.local");
  process.exit(1);
}

const sql = readFileSync(
  "supabase/migrations/20260514000001_nric_purge.sql",
  "utf8",
);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration applied");
  const { rows } = await client.query(
    "select jobname, schedule from cron.job where jobname = 'purge-nric'",
  );
  console.log("Scheduled jobs:", rows);
} catch (err) {
  console.error("✗ Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
