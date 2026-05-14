/**
 * Calibration self-test. Renders a PDF directly from the test app's data
 * via the shared helper, writes to /tmp, and extracts text positions to
 * confirm fields landed close to their labels.
 *
 *   tsx scripts/render-calibration-test.ts
 */
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { generateFilledMembershipPDF } from "../lib/pdf/generate";

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

const APP_ID = "c2218fdc-15d6-4ac9-a792-4c2b4630601f";
const { data: app } = await sb
  .from("applications")
  .select(
    "id, surname, given_names, name, applicant_name_at_invite, nric_no, chinese_name, home_address, postal_code, housing_type, hdb_rooms, date_of_birth, place_of_birth, race, gender, marital_status, tel_home, tel_office, tel_hp, highest_edu, written_languages, spoken_languages, facebook, linkedin, twitter, blog, email, occupation, organisation, monthly_income, hobbies, trade_unions, associations, clubs, ccc, ccmc, rnc, grassroots, applicant_signed_at, applicant_photo_url, assigned_referral_name, assigned_referral_membership_no, assigned_referral_known_years, referral_signed_at, chairman_name_on_form, chairman_known_years, chairman_signed_at",
  )
  .eq("id", APP_ID)
  .single();
if (!app) {
  console.error("Test app not found");
  process.exit(1);
}

// Load stub photo + signatures from storage so the render is realistic.
const photoBlob = await sb.storage.from("applicant-photos").download(`${APP_ID}/photo.jpg`);
const photoBytes = new Uint8Array(await photoBlob.data!.arrayBuffer());

const signatures: Record<string, { pngBytes: Uint8Array }> = {};
for (const role of ["applicant", "referral", "chairman"] as const) {
  const { data } = await sb.storage.from("signatures").download(`${APP_ID}/${role}.png`);
  if (data) signatures[role] = { pngBytes: new Uint8Array(await data.arrayBuffer()) };
}

const pdfBytes = await generateFilledMembershipPDF({
  application: {
    ...app,
    branch_name: "Kampong Glam",
  },
  photoBytes,
  signatures: signatures as never,
});

const outPath = path.join("/tmp", "calibrated-preview.pdf");
writeFileSync(outPath, pdfBytes);
console.log(`✓ Wrote ${pdfBytes.byteLength} bytes → ${outPath}`);

// Extract the resulting text positions and report.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";
const doc = await pdfjs.getDocument({ data: pdfBytes, verbosity: 0 }).promise;

const probe = [
  // [page, search string, expected approximate (x, y)]
  ["page1 NRIC", "S1234567A", "near (130, 641)"],
  ["page1 surname+given", "TAN Test Applicant", "near (130, 617)"],
  ["page1 home address", "Kampong Glam Road", "near (130, 555)"],
  ["page1 postal code", "199000", "near (335, 499)"],
  ["page1 dob", "15/01/1990", "near (130, 415)"],
  ["page1 place of birth", "Singapore", "near (310, 411)"],
  ["page1 HP", "+6591234567", "near (345, 298)"],
  ["page1 email", "applicant.test@example.com", "near (115, 44)"],
  ["page2 occupation", "Software Engineer", "near (200, 768)"],
  ["page2 organisation", "Test Org Pte Ltd", "near (200, 739)"],
  ["page2 referral", "Jane Referral", "near (160, 306)"],
  ["page2 chairman", "Test Chairman", "near (200, 182)"],
];

console.log("\nExtracted text positions on the rendered PDF:");
for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  console.log(`\n── Page ${pageNum} ──`);
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const matches = probe.filter(
      ([p, s]) => p.startsWith(`page${pageNum}`) && item.str.includes(s as string),
    );
    if (matches.length) {
      const x = item.transform[4].toFixed(1);
      const y = item.transform[5].toFixed(1);
      console.log(`  ✓ "${item.str}" → (${x}, ${y})  expected ${matches[0][2]}`);
    }
  }
}
