import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Get the Master Admin's user id for invited_by_admin_id.
const { data: profiles } = await sb.from("profiles").select("id, role");
const masterId = profiles.find((p) => p.role === "branch_master_admin").id;
const BRANCH_ID = "11111111-1111-4111-8111-111111111111";

const rawToken = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(rawToken).digest("hex");
const expiresAt = new Date(Date.now() + 168 * 60 * 60 * 1000).toISOString();

const { data: app, error: appErr } = await sb
  .from("applications")
  .insert({
    status: "APPLICANT_INVITED",
    branch_id: BRANCH_ID,
    invited_by_admin_id: masterId,
    applicant_name_at_invite: "Test Applicant (Step 5 smoke)",
    applicant_phone: "+6591234567",
    applicant_email: "applicant.test@example.com",
    applicant_invited_at: new Date().toISOString(),
    invite_delivery_channels: [],
  })
  .select("id")
  .single();
if (appErr) { console.error("app insert", appErr); process.exit(1); }

const { error: linkErr } = await sb.from("magic_links").insert({
  application_id: app.id,
  branch_id: BRANCH_ID,
  token_hash: tokenHash,
  intended_role: "applicant",
  expires_at: expiresAt,
  generated_by_id: masterId,
});
if (linkErr) { console.error("link insert", linkErr); process.exit(1); }

console.log("APPLICATION_ID:", app.id);
console.log("RAW_TOKEN:", rawToken);
console.log("URL: http://localhost:3000/apply/" + rawToken);
