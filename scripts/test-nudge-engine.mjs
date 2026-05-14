/**
 * Smoke-tests the nudge engine by:
 *   1. Backdating the test app's anchor timestamps so all stages look stale
 *   2. Running the engine with a stub `sendEmail` so no real emails fire
 *   3. Asserting nudge_sends rows + audit rows were written
 *
 * Uses the SAME engine that production runs (lib/nudges/engine.ts) — via
 * the same server-only loader hook trick from scripts/render-preview-pdf.mjs.
 */
import { Module, register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./_server-only-shim.mjs", import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHIM_CJS = path.join(__dirname, "_server-only-empty.cjs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return SHIM_CJS;
  return origResolve.call(this, request, ...rest);
};

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

// Find any application and force it into SENT_TO_HQ with a backdated
// sent_to_hq_at so `at_hq_stalled` fires. Also fill applicant_email so
// the recipient resolution finds someone.
const { data: rows } = await sb
  .from("applications")
  .select("id, branch_id")
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.error("No applications. Run a fixture first.");
  process.exit(1);
}
const target = rows[0];
console.log(`Target: ${target.id}`);

const farPast = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
await sb
  .from("applications")
  .update({
    status: "SENT_TO_HQ",
    sent_to_hq_at: farPast,
    applicant_email: "applicant.smoke@example.com",
  })
  .eq("id", target.id);
console.log("✓ Backdated sent_to_hq_at to 7d ago + set applicant_email");

// Clear any previous nudge_sends so we get a fresh decision.
await sb.from("nudge_sends").delete().eq("application_id", target.id);

const { runNudgeEngine } = await import("../lib/nudges/engine.ts");

const sentLog = [];
const stubSendEmail = async (params) => {
  sentLog.push({ to: params.to, subject: params.subject });
  return { ok: true };
};

const result = await runNudgeEngine(sb, stubSendEmail);
console.log("Result:", JSON.stringify(result, null, 2));
console.log(`Stub emails sent: ${sentLog.length}`);
for (const s of sentLog) console.log(`  → ${JSON.stringify(s.to)} : ${s.subject}`);

const { data: sends } = await sb
  .from("nudge_sends")
  .select("stage, recipients, sent_at")
  .eq("application_id", target.id)
  .order("sent_at", { ascending: false });
console.log("\nnudge_sends rows:", sends);

const { data: audit } = await sb
  .from("audit_log")
  .select("action, metadata")
  .eq("application_id", target.id)
  .eq("action", "NUDGE_SENT")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\nAudit rows:", audit);

const ok = result.total >= 1 && (sends?.length ?? 0) >= 1 && (audit?.length ?? 0) >= 1;
console.log(ok ? "\n✓ NUDGE ENGINE SMOKE TEST PASSED" : "\n✗ FAILED");
process.exit(ok ? 0 : 1);
