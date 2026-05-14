/**
 * Resets the test app to PENDING_CHAIRMAN so the chairman-sign e2e test
 * has something to act on. Idempotent.
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
  .select("id, status")
  .in("status", [
    "PENDING_CHAIRMAN",
    "SIGNED_BY_CHAIRMAN",
    "READY_TO_SEND",
    "SENT_TO_HQ",
    "COMPLETED",
    "HQ_REJECTED",
    "ARCHIVED",
  ])
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.error("No suitable application found.");
  process.exit(1);
}
const target = rows[0];
console.log(`Resetting ${target.id} (was ${target.status}) → PENDING_CHAIRMAN`);

await sb
  .from("applications")
  .update({
    status: "PENDING_CHAIRMAN",
    chairman_signed_at: null,
    chairman_name_on_form: null,
    chairman_known_years: null,
    ready_to_send_at: null,
    sent_to_hq_at: null,
    hq_pdf_url: null,
    hq_outcome_recorded_at: null,
    hq_outcome_recorded_by_id: null,
    hq_approved_date: null,
    hq_approved_membership_no: null,
    hq_approved_notes: null,
    hq_rejected_date: null,
    hq_rejected_reason: null,
    hq_rejected_reason_details: null,
    completed_at: null,
    archived_at: null,
    archived_by_id: null,
    archive_reason: null,
    pre_archive_status: null,
  })
  .eq("id", target.id);

// Wipe existing chairman signature so the e2e test produces a fresh one.
await sb.storage.from("signatures").remove([`${target.id}/chairman.png`]);

console.log(`✓ Ready: http://localhost:3000/branch/sign/${target.id}`);
