import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "branches", "profiles", "applications", "nric_uploads", "signatures",
  "magic_links", "link_deliveries", "audit_log", "generated_pdfs",
  "application_events", "nudge_log", "platform_settings",
];
for (const t of tables) {
  const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) console.log(`  ✗ ${t}:`, error.code, error.message);
  else console.log(`  ✓ ${t}: ${count ?? 0} row(s)`);
}
