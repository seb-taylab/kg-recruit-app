/**
 * Renders the PDF with deliberately-long values so the auto-shrink + wrap
 * paths both fire. Writes the result to preview-overflow.pdf. Visually
 * compare to preview-out.pdf to confirm:
 *   - Name field shrinks to fit (no spill into HQ column)
 *   - occupation / organisation wrap to 2 lines if too long
 *   - Social row links truncate with ellipsis at minSize
 */
import { Module, register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
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

const { data: rows } = await sb
  .from("applications")
  .select("id, branches(name)")
  .order("created_at", { ascending: false })
  .limit(1);
const target = rows[0];
console.log(`Rendering app ${target.id} with stress-test inputs`);

// Build a synthetic application payload — long values everywhere.
const longApp = {
  branch_name: target.branches?.name ?? "Kampong Glam",
  nric_no: "S1234567A",
  surname: "ABDULLAHRAHMANSURNAMEVERYLONG",
  given_names: "Maximilian Christopher Alexander James Bartholomew Theodore",
  chinese_name: "",
  home_address: "1 Kampong Glam Road, Block 123A, #45-678 Singapore (extra-long for wrap test)",
  postal_code: "199000",
  housing_type: "HDB",
  hdb_rooms: 4,
  date_of_birth: "1990-01-15",
  place_of_birth: "South Eastern District of the Republic of Singapore",
  race: "Chinese",
  gender: "Male",
  marital_status: "Single",
  tel_home: "+65 6234 5678 ext 9012345",
  tel_office: "+65 6345 6789 ext 9012345",
  tel_hp: "+65 9123 4567 ext 9012345",
  highest_edu: "Degree",
  written_languages: ["English", "Chinese"],
  spoken_languages: ["English", "Chinese", "Malay"],
  facebook: "facebook.com/maximilian.christopher.alexander.james.long.handle",
  linkedin: "linkedin.com/in/maximilian-very-long-handle-2026",
  twitter: "@maximilianchristopher_thelongesthandleimaginable",
  blog: "very-long-blog-domain-name.substack.com/feed",
  email: "maximilian.christopher.alexander@a-very-long-corporate-domain.example.com",
  occupation: "Senior Director of Strategic Cross-Functional Partnerships and Innovation Architecture",
  organisation: "Acme Holdings International Pte Ltd (Asia-Pacific Regional Headquarters Division)",
  monthly_income: "$5,001 - $10,000",
  hobbies: [
    "Long-form historical biography reading",
    "Competitive amateur underwater photography",
    "Reverse-engineering vintage radio receivers",
  ],
  trade_unions: "National Trades Union Congress (NTUC) — Singapore Industrial & Services Employees' Union",
  associations: "Singapore Computer Society, Association of Information Security Professionals, IEEE Singapore Section",
  clubs: "Tanglin Club, The American Club, Singapore Cricket Club",
  ccc: "Kampong Glam Citizens' Consultative Committee",
  ccmc: "Kampong Glam Community Centre Management Committee",
  rnc: "Bras Basah Residents' Network Committee",
  grassroots: "Kampong Glam Grass Roots Organisation",
  applicant_signed_at: new Date().toISOString(),
  referral_signed_at: new Date().toISOString(),
  chairman_signed_at: new Date().toISOString(),
  assigned_referral_name: "Jane Wong Mei Ling (Long Referral Full Name)",
  assigned_referral_membership_no: "PAP-2020-99999-EXTRA-LONG",
  assigned_referral_known_years: 10,
  chairman_name_on_form: "Honourable Mr Tan Eng Hock Chairman of the Branch",
  chairman_known_years: 5,
};

const { data: photoBlob } = await sb.storage
  .from("applicant-photos")
  .download(`${target.id}/photo.jpg`);
const photoBytes = photoBlob
  ? new Uint8Array(await photoBlob.arrayBuffer())
  : new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mNk+M9Qz0AAMI4qpFwhAFQuAv3jH3SCAAAAAElFTkSuQmCC",
        "base64",
      ),
    );

const signatures = {};
for (const role of ["applicant", "referral", "chairman"]) {
  const { data } = await sb.storage.from("signatures").download(`${target.id}/${role}.png`);
  if (data) signatures[role] = { pngBytes: new Uint8Array(await data.arrayBuffer()) };
}

const { generateFilledMembershipPDF } = await import("../lib/pdf/generate.ts");
const pdfBytes = await generateFilledMembershipPDF({
  application: longApp,
  photoBytes,
  signatures,
});

const outPath = process.argv[2] ?? "preview-overflow.pdf";
writeFileSync(outPath, pdfBytes);
console.log(`✓ Wrote ${outPath} (${pdfBytes.byteLength} bytes)`);
