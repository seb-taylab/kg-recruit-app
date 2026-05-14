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
try {
  const { data, error } = await sb.from("profiles").select("count").limit(1);
  if (error) console.log("REST error:", error.code, "—", error.message);
  else console.log("REST ok, sample:", JSON.stringify(data));
} catch (e) {
  console.log("Exception:", e.message);
}
