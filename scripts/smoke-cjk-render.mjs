/**
 * End-to-end smoke test: drive generate.ts with a Chinese-name applicant
 * and confirm the resulting PDF contains the CJK text in its content
 * stream. Local-only (no DB / network), so it's safe to run in CI.
 *
 *   node scripts/smoke-cjk-render.mjs
 * Exits non-zero on failure.
 */
import { Module, register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

register("./_server-only-shim.mjs", import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHIM_CJS = path.join(__dirname, "_server-only-empty.cjs");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return SHIM_CJS;
  return origResolve.call(this, request, ...rest);
};

const { generateFilledMembershipPDF } = await import("../lib/pdf/generate.ts");

// 1x1 black JPEG (smallest valid) — enough to exercise the photo embed path.
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgP//Z",
  "base64",
);

// 1x1 transparent PNG — minimum viable signature stub.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const app = {
  branch_name: "Kampong Glam",
  nric_no: "S8729733J",
  surname: "TAY",
  given_names: "Jiaxiang sebastian",
  chinese_name: "郑家翔", // ← the exact characters the user reported missing
  home_address: "Blk 102, rivervale walk",
  postal_code: "540102",
  housing_type: "HDB",
  hdb_rooms: 5,
  date_of_birth: "1987-09-11",
  place_of_birth: "Singapore",
  race: "Chinese",
  gender: "Male",
  marital_status: "Married",
  tel_home: null,
  tel_office: null,
  tel_hp: "91234567",
  highest_edu: "Degree",
  written_languages: ["English", "Chinese"],
  spoken_languages: ["English", "Chinese"],
  facebook: null,
  linkedin: null,
  twitter: null,
  blog: null,
  email: "seb@taylab.com",
  occupation: "Software Engineer",
  organisation: "Acme 公司", // mixed Latin+CJK org name
  monthly_income: "$5,001 - $10,000",
  hobbies: ["Reading"],
  trade_unions: null,
  associations: null,
  clubs: null,
  ccc: null,
  ccmc: null,
  rnc: null,
  grassroots: null,
  applicant_signed_at: "2026-05-14T10:00:00Z",
  referral_signed_at: "2026-05-14T11:00:00Z",
  chairman_signed_at: "2026-05-14T12:00:00Z",
  assigned_referral_name: "Jane Referral",
  assigned_referral_membership_no: "M12345",
  assigned_referral_known_years: 5,
  chairman_name_on_form: "李大伟", // pure CJK chairman name
  chairman_known_years: 10,
};

const pdfBytes = await generateFilledMembershipPDF({
  application: app,
  photoBytes: new Uint8Array(TINY_JPEG),
  signatures: {
    applicant: { pngBytes: new Uint8Array(TINY_PNG) },
    referral: { pngBytes: new Uint8Array(TINY_PNG) },
    chairman: { pngBytes: new Uint8Array(TINY_PNG) },
  },
});

const outPath = path.join(__dirname, "_cjk-render-smoke.pdf");
writeFileSync(outPath, pdfBytes);
console.log(`✓ Rendered ${(pdfBytes.byteLength / 1024).toFixed(1)} KB → ${outPath}`);

// Now read the PDF back via pdfjs-dist and confirm the CJK text is in the
// content stream — i.e. it didn't get silently stripped by the old WinAnsi
// fallback.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: pdfBytes, verbosity: 0 }).promise;
const page1 = await doc.getPage(1);
const content = await page1.getTextContent();
const allText = content.items.map((i) => i.str).join(" ");

const checks = [
  { needle: "郑家翔", what: "applicant chinese_name on page 1" },
  { needle: "TAY", what: "surname on page 1" },
];
let allPass = true;
for (const c of checks) {
  const found = allText.includes(c.needle);
  console.log(`  ${found ? "✓" : "✗"} ${c.what}: ${c.needle}`);
  if (!found) allPass = false;
}

const page2 = await doc.getPage(2);
const content2 = await page2.getTextContent();
const allText2 = content2.items.map((i) => i.str).join(" ");
const orgFound = allText2.includes("Acme") && allText2.includes("公司");
console.log(`  ${orgFound ? "✓" : "✗"} mixed Latin+CJK organisation on page 2: Acme 公司`);
if (!orgFound) allPass = false;

const chairFound = allText2.includes("李大伟");
console.log(`  ${chairFound ? "✓" : "✗"} pure CJK chairman name on page 2: 李大伟`);
if (!chairFound) allPass = false;

console.log(allPass ? "\nSMOKE TEST PASSED\n" : "\nSMOKE TEST FAILED\n");
process.exit(allPass ? 0 : 1);
