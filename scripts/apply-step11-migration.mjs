/**
 * Applies the Step 11 migration (pre_archive_status column) to cloud DB.
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
const sql = readFileSync("supabase/migrations/20260514000002_archive_ttl.sql", "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log("✓ Migration applied");
} catch (err) {
  console.error("✗", err.message);
  process.exit(1);
} finally {
  await client.end();
}
