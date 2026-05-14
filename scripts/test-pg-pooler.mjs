import pg from "pg";
const { Client } = pg;
const urls = [
  "postgresql://postgres.twxfixwoplyctvwtbpkm:ZFu76l4qsJsjiX9H@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
  "postgresql://postgres.twxfixwoplyctvwtbpkm:ZFu76l4qsJsjiX9H@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  "postgresql://postgres.twxfixwoplyctvwtbpkm:ZFu76l4qsJsjiX9H@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres",
];
for (const url of urls) {
  const sanitized = url.replace(/:[^:@]+@/, ":***@");
  process.stdout.write(`\nTrying ${sanitized}\n`);
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    const { rows } = await c.query("select current_user, current_database()");
    console.log("  ✓ connected:", rows[0]);
    await c.end();
  } catch (e) {
    console.log("  ✗ error:", e.message);
  }
}
