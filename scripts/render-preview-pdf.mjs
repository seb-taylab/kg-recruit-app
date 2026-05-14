/**
 * Standalone PDF render — loads the latest READY_TO_SEND test app, downloads
 * photo + signatures from Supabase storage, calls the same
 * generateFilledMembershipPDF used by the server action, writes the bytes
 * to ./preview-out.pdf. Bypasses auth (uses service role) and the
 * `server-only` marker (via a loader hook in _server-only-shim.mjs).
 */
import { Module, register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./_server-only-shim.mjs", import.meta.url);

// CJS fallback: tsx loads .ts as CJS, so require("server-only") bypasses
// the ESM resolve hook above. Patch _resolveFilename for that path.
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

const { data: rows } = await sb
  .from("applications")
  .select("*, branches(name)")
  .in("status", ["READY_TO_SEND", "SENT_TO_HQ", "COMPLETED", "HQ_REJECTED"])
  .not("applicant_photo_url", "is", null)
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.error("No READY_TO_SEND/SENT_TO_HQ app found. Run scripts/step8-fixture.mjs first.");
  process.exit(1);
}
const app = rows[0];
console.log(`Rendering app ${app.id}`);

if (!app.applicant_photo_url) {
  console.error("App has no photo URL.");
  process.exit(1);
}

const { data: photoBlob, error: photoErr } = await sb.storage
  .from("applicant-photos")
  .download(app.applicant_photo_url);
if (photoErr || !photoBlob) {
  console.error("Photo download failed:", photoErr);
  process.exit(1);
}
const photoBytes = new Uint8Array(await photoBlob.arrayBuffer());

const signatures = {};
for (const role of ["applicant", "referral", "chairman"]) {
  const { data } = await sb.storage.from("signatures").download(`${app.id}/${role}.png`);
  if (data) {
    signatures[role] = { pngBytes: new Uint8Array(await data.arrayBuffer()) };
  }
}

const { generateFilledMembershipPDF } = await import("../lib/pdf/generate.ts");

const pdfBytes = await generateFilledMembershipPDF({
  application: { ...app, branch_name: app.branches?.name ?? "Kampong Glam" },
  photoBytes,
  signatures,
});

writeFileSync("preview-out.pdf", pdfBytes);
console.log(`✓ Wrote preview-out.pdf (${pdfBytes.byteLength} bytes)`);
