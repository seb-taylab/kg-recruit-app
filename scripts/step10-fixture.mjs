/**
 * Step 10 fixture — flips the test app's place_of_birth to a non-Singapore
 * value (so the NRIC card renders) and uploads stub NRIC scans (visible
 * black rectangles so the card thumbnails aren't blank).
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

const { data: rows } = await sb
  .from("applications")
  .select("id, branch_id, status, place_of_birth")
  .in("status", ["SENT_TO_HQ", "READY_TO_SEND", "COMPLETED", "HQ_REJECTED"])
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.error("No test app found. Run step8-fixture.mjs first.");
  process.exit(1);
}
const target = rows[0];
console.log(`Target: ${target.id} (status ${target.status})`);

await sb.from("applications").update({ place_of_birth: "Malaysia" }).eq("id", target.id);
console.log("✓ place_of_birth set to Malaysia (triggers NRIC requirement)");

// 8×5 solid-black PNG — large enough to look like a NRIC card thumbnail.
const blackPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAYAAACWbxRwAAAAFklEQVR42mP8z8BQz0BHwDiqkH4KAaFqAg+kQjr5AAAAAElFTkSuQmCC";
const stubBytes = Buffer.from(blackPngBase64, "base64");

const frontPath = `${target.id}/nric-front.jpg`;
const backPath = `${target.id}/nric-back.jpg`;
for (const [path, label] of [
  [frontPath, "front"],
  [backPath, "back"],
]) {
  const res = await sb.storage
    .from("nric-uploads")
    .upload(path, stubBytes, { contentType: "image/jpeg", upsert: true });
  console.log(`NRIC ${label}:`, res.error ? `✗ ${res.error.message}` : "✓ uploaded");
}

// Upsert nric_uploads row.
const { data: existing } = await sb
  .from("nric_uploads")
  .select("id")
  .eq("application_id", target.id)
  .maybeSingle();
if (existing) {
  await sb
    .from("nric_uploads")
    .update({ front_url: frontPath, back_url: backPath })
    .eq("id", existing.id);
  console.log("✓ nric_uploads row updated");
} else {
  await sb.from("nric_uploads").insert({
    application_id: target.id,
    branch_id: target.branch_id,
    front_url: frontPath,
    back_url: backPath,
  });
  console.log("✓ nric_uploads row inserted");
}

// Clear nric_purged_at in case the purge job already ran on this row.
await sb.from("applications").update({ nric_purged_at: null }).eq("id", target.id);

console.log(`\nDetail page: http://localhost:3000/branch/applications/${target.id}`);
