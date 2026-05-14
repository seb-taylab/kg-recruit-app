/**
 * One-shot cloud bootstrap.
 *
 * What it seeds (idempotent — safe to re-run):
 *   1. platform_settings: 6 keys with default values
 *   2. branches: Kampong Glam
 *   3. auth users (via admin API): sebtay@msn.com + seb@taylab.com
 *   4. profiles: Master Admin + Taylab Staff
 *
 * Run from repo root: `node scripts/bootstrap-cloud.mjs`
 * Reads creds from .env.local. Service role key is required (NOT anon key).
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

const SEED_PASSWORD = "ChangeMe!2026";
const BRANCH_ID = "11111111-1111-4111-8111-111111111111";

async function step(label, fn) {
  process.stdout.write(`\n→ ${label}\n`);
  try {
    await fn();
  } catch (e) {
    console.error(`  ✗ failed: ${e.message}`);
    process.exit(1);
  }
}

await step("platform_settings", async () => {
  const rows = [
    { key: "invite_ttl_hours", value: 168, description: "Default magic-link TTL — 7 days." },
    { key: "invite_ttl_max_hours", value: 720, description: "Hard cap for per-application TTL override — 30 days." },
    { key: "default_routing_mode", value: "direct_to_chairman", description: "Routing fork default." },
    { key: "pdf_presigned_url_ttl_days", value: 30, description: "PDF presigned URL expiry." },
    { key: "default_pdf_recipients", value: { hq: true, self: true, custom: [] }, description: "Default Recipient Picker selection." },
    {
      key: "nudge_config",
      value: {
        applicant_link_unopened:   { enabled: true, intervals_hours: [168], recipients: ["applicant", "admin"] },
        applicant_form_in_draft:   { enabled: true, intervals_hours: [168], recipients: ["applicant", "admin"] },
        referral_unsigned:         { enabled: true, intervals_hours: [168], recipients: ["referral", "admin"] },
        chairman_unsigned:         { enabled: true, intervals_hours: [168], recipients: ["chairman", "all_admins"] },
        ready_to_send_unactioned:  { enabled: true, intervals_hours: [168], recipients: ["all_admins"] },
        at_hq_stalled:             { enabled: true, intervals_hours: [168], recipients: ["all_admins"] },
      },
      description: "Auto-nudge engine defaults — all 6 stages on, 168h interval.",
    },
  ];
  for (const r of rows) {
    const { error } = await sb.from("platform_settings").upsert(r, { onConflict: "key" });
    if (error) throw new Error(`${r.key}: ${error.message}`);
    console.log(`  ✓ ${r.key}`);
  }
});

await step("branches — Kampong Glam", async () => {
  const { error } = await sb.from("branches").upsert(
    {
      id: BRANCH_ID,
      name: "Kampong Glam",
      constituency: "Kampong Glam",
      hq_email: null,
      default_routing_mode: "direct_to_chairman",
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
  console.log(`  ✓ Kampong Glam branch upserted (${BRANCH_ID})`);
});

async function ensureUser(email, fullName, profile) {
  // Check if the user already exists. Supabase admin list paginates — fetch first 200.
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw new Error(`list: ${listErr.message}`);
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr) throw new Error(`create ${email}: ${createErr.message}`);
    user = created.user;
    console.log(`  ✓ created auth user ${email} (${user.id})`);
  } else {
    console.log(`  • auth user ${email} already exists (${user.id})`);
  }

  // Upsert the matching profile row.
  const { error: profErr } = await sb
    .from("profiles")
    .upsert({ id: user.id, full_name: fullName, is_active: true, ...profile }, { onConflict: "id" });
  if (profErr) throw new Error(`profile ${email}: ${profErr.message}`);
  console.log(`  ✓ profile upserted (${profile.role})`);
}

await step("auth user — Master Admin (sebtay@msn.com)", async () => {
  await ensureUser("sebtay@msn.com", "Sebastian Tay", {
    role: "branch_master_admin",
    branch_id: BRANCH_ID,
    position: "Other",
  });
});

await step("auth user — Taylab Staff (seb@taylab.com)", async () => {
  await ensureUser("seb@taylab.com", "Sebastian Tay", {
    role: "taylab_staff",
    branch_id: null,
  });
});

console.log(`\nBootstrap complete. Sign-in password for both seeded users: ${SEED_PASSWORD}`);
console.log(`Change it via /auth/forgot-password (or Supabase Studio) before sharing access.`);
