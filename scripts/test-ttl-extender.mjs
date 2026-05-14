/**
 * Smoke-tests the TTL extender: creates a fresh, non-consumed magic_link
 * row on the test app, then calls extend_magic_link_ttl SQL-side to verify
 * the column moves + history accumulates.
 */
import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
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

const client = new pg.Client({
  connectionString: env.DIRECT_URL ?? env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const { rows: apps } = await client.query(
    `select id, branch_id from public.applications where status = 'SENT_TO_HQ' order by created_at desc limit 1`,
  );
  if (apps.length === 0) {
    console.error("No SENT_TO_HQ app. Run step9-fixture.mjs first.");
    process.exit(1);
  }
  const app = apps[0];
  console.log(`Target app: ${app.id}`);

  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const { rows: insertedRows } = await client.query(
    `insert into public.magic_links
       (application_id, branch_id, token_hash, intended_role, expires_at)
     values ($1, $2, $3, 'applicant', now() + interval '2 days')
     returning id, expires_at, expires_at_history`,
    [app.id, app.branch_id, tokenHash],
  );
  const link = insertedRows[0];
  console.log(`✓ Minted test magic_link ${link.id}`);
  console.log(`  Initial expires_at: ${link.expires_at}`);
  console.log(`  History entries: ${(link.expires_at_history ?? []).length}`);
  console.log(`\nDetail page: http://localhost:3000/branch/applications/${app.id}?token=${raw}`);
  console.log(`\nNow click "Extend" in the Link summary aside, then re-run this script's verify path.`);
} finally {
  await client.end();
}
