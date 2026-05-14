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

const sql = readFileSync("supabase/migrations/20260514000003_nudge_engine.sql", "utf8");
const c = new pg.Client({
  connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
try {
  await c.query(sql);
  console.log("✓ Migration applied");
} finally {
  await c.end();
}
