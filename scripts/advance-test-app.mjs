import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Find our test invite (most recent APPLICANT_INVITED or APPLICANT_FILLING) and bump it to PENDING_REFERRAL_ASSIGNMENT so we can smoke-test Step 6.
const { data: rows } = await sb
  .from("applications")
  .select("id, status, applicant_name_at_invite")
  .in("status", ["APPLICANT_INVITED", "APPLICANT_FILLING", "PENDING_REFERRAL_ASSIGNMENT"])
  .order("created_at", { ascending: false })
  .limit(5);

console.log("Candidate applications:");
for (const r of rows ?? []) console.log(`  • ${r.id} — ${r.applicant_name_at_invite} (${r.status})`);

if (!rows || rows.length === 0) { console.log("No test application found."); process.exit(1); }
const target = rows[0];
console.log(`\nFast-forwarding ${target.id} to PENDING_REFERRAL_ASSIGNMENT…`);
const { error } = await sb
  .from("applications")
  .update({
    status: "PENDING_REFERRAL_ASSIGNMENT",
    applicant_signed_at: new Date().toISOString(),
    surname: "TAN",
    given_names: "Test Applicant",
    name: "TAN Test Applicant",
  })
  .eq("id", target.id);
if (error) { console.error(error); process.exit(1); }
console.log("Done. URL: http://localhost:3000/branch/applications/" + target.id);
