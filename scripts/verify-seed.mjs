import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

console.log("=== platform_settings keys ===");
const { data: ps } = await sb.from("platform_settings").select("key").order("key");
ps.forEach((r) => console.log(`  • ${r.key}`));

console.log("\n=== branches ===");
const { data: br } = await sb.from("branches").select("id, name, constituency, default_routing_mode, hq_email, is_active");
br.forEach((r) => console.log(`  • ${r.name} (${r.id.slice(0, 8)}…) routing=${r.default_routing_mode} hq_email=${r.hq_email ?? "—"} active=${r.is_active}`));

console.log("\n=== profiles ===");
const { data: pr } = await sb.from("profiles").select("id, full_name, role, branch_id, is_active");
pr.forEach((r) => console.log(`  • ${r.full_name} — ${r.role} (branch=${r.branch_id ? r.branch_id.slice(0, 8) + "…" : "none"}) active=${r.is_active}`));
