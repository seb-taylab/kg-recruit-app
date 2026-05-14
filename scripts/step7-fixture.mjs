/**
 * Step 7 cloud fixture:
 *   1. Ensures a test Chairman user exists in Kampong Glam.
 *   2. Advances the test app to PENDING_CHAIRMAN with a fake referral signed_at
 *      + routing_choice so the Path-B review path is also reachable.
 *
 * Idempotent — re-running advances any of our test apps that aren't already at
 * PENDING_CHAIRMAN to that state.
 */
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

const BRANCH_ID = "11111111-1111-4111-8111-111111111111";
const PASSWORD = "ChangeMe!2026";
const EMAIL = "chairman.test@taylab.com";
const FULL_NAME = "Test Chairman";

// 1. Ensure Chairman user
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
let user = list.users.find((u) => u.email?.toLowerCase() === EMAIL);
if (!user) {
  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });
  if (error) throw error;
  user = data.user;
  console.log(`✓ created Chairman user ${EMAIL} (${user.id})`);
} else {
  console.log(`• Chairman user ${EMAIL} already exists (${user.id})`);
}
const { error: profErr } = await sb
  .from("profiles")
  .upsert(
    {
      id: user.id,
      full_name: FULL_NAME,
      role: "branch_chairman",
      branch_id: BRANCH_ID,
      is_active: true,
    },
    { onConflict: "id" },
  );
if (profErr) throw profErr;
console.log(`✓ Chairman profile upserted (branch=${BRANCH_ID.slice(0, 8)}…)`);

// 2. Advance our test app
const { data: rows } = await sb
  .from("applications")
  .select("id, status, applicant_name_at_invite")
  .in("status", [
    "PENDING_REFERRAL_ASSIGNMENT",
    "REFERRAL_INVITED",
    "SIGNED_BY_REFERRAL",
    "PENDING_BRANCH_ADMIN_REVIEW",
    "PENDING_CHAIRMAN",
  ])
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.log("• No in-flight test application to advance.");
  process.exit(0);
}
const target = rows[0];
console.log(`\nAdvancing ${target.id} from ${target.status} → PENDING_CHAIRMAN…`);
const now = new Date().toISOString();
const { error: updErr } = await sb
  .from("applications")
  .update({
    status: "PENDING_CHAIRMAN",
    referral_signed_at: now,
    branch_admin_review_at: now,
    routing_choice: "direct_to_chairman",
  })
  .eq("id", target.id);
if (updErr) throw updErr;
console.log("✓ Status now PENDING_CHAIRMAN");
console.log(`\nSign URL: http://localhost:3000/branch/sign/${target.id}`);
console.log(`Chairman login: ${EMAIL} / ${PASSWORD}`);
