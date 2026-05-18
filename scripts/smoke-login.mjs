import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const { createClient } = await import("@supabase/supabase-js");

const cases = [
  { email: "sebtay@msn.com", expectedRole: "branch_master_admin" },
  { email: "seb@taylab.com", expectedRole: "taylab_staff" },
];

for (const { email, expectedRole } of cases) {
  console.log(`\n--- ${email} ---`);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: "ChangeMe!2026" });
  if (error) {
    console.log(`  ✗ sign-in failed: ${error.message}`);
    continue;
  }
  console.log(`  ✓ signed in (uid: ${data.user.id.slice(0, 8)}…)`);

  // The session is on the client; query profile WITH the user's JWT to confirm RLS lets them read it.
  const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  // Multi-profile model: match on user_id, not id (profiles.id is now an
  // independent UUID per profile). maybeSingle() because a future test
  // account could have N profiles; for this smoke harness we take the first.
  const { data: profile, error: pErr } = await userClient
    .from("profiles")
    .select("role, branch_id, is_active")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pErr) console.log(`  ✗ RLS denied profile read: ${pErr.message}`);
  else {
    const ok = profile.role === expectedRole;
    console.log(`  ${ok ? "✓" : "✗"} role=${profile.role} (expected ${expectedRole})  branch=${profile.branch_id ? profile.branch_id.slice(0, 8) + "…" : "none"}  active=${profile.is_active}`);
  }

  // RLS cross-tenant check: branch user querying branches table → only see own branch
  const { data: branches } = await userClient.from("branches").select("id, name");
  console.log(`  visible branches via RLS: ${branches?.map((b) => b.name).join(", ") ?? "(none)"}`);
}
