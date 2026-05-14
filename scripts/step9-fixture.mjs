/**
 * Pushes the latest test app to SENT_TO_HQ so Step 9's "Record HQ outcome"
 * surface has something to render against. Run after step8-fixture.mjs.
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
  .in("status", ["READY_TO_SEND", "SENT_TO_HQ", "COMPLETED", "HQ_REJECTED"])
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.error("No test app found. Run step8-fixture.mjs first.");
  process.exit(1);
}
const target = rows[0];
console.log(`Target: ${target.id} currently ${target.status}`);

const now = new Date().toISOString();
const { error } = await sb
  .from("applications")
  .update({
    status: "SENT_TO_HQ",
    sent_to_hq_at: now,
    hq_pdf_url: `${target.id}/membership.pdf`,
    // Clear any previously-recorded outcome so the form re-prompts.
    hq_outcome_recorded_at: null,
    hq_outcome_recorded_by_id: null,
    hq_approved_date: null,
    hq_approved_membership_no: null,
    hq_approved_notes: null,
    hq_rejected_date: null,
    hq_rejected_reason: null,
    hq_rejected_reason_details: null,
    hq_outcome_reversed_at: null,
    hq_outcome_reversed_by_id: null,
    hq_outcome_reversal_reason: null,
    completed_at: null,
  })
  .eq("id", target.id);
if (error) {
  console.error(error);
  process.exit(1);
}
console.log("✓ Status now SENT_TO_HQ");
console.log(`\nInbox: http://localhost:3000/branch/inbox`);
console.log(`Detail page: http://localhost:3000/branch/applications/${target.id}`);
