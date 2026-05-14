/**
 * Advances the test app to READY_TO_SEND so we can exercise Step 8 end-to-end.
 * Fills the minimum required fields (so applicantFullSchema passes the
 * defensive re-validation in the action).
 *
 * Also uploads stub PNGs for the photo + 3 signatures so the bucket-download
 * step of the server action doesn't error.
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
    "PENDING_BRANCH_ADMIN_REVIEW",
    "SIGNED_BY_REFERRAL",
    "REFERRAL_INVITED",
    "PENDING_REFERRAL_ASSIGNMENT",
    "READY_TO_SEND",
    "SENT_TO_HQ",
  ])
  .order("created_at", { ascending: false })
  .limit(1);
if (!rows || rows.length === 0) {
  console.error("No test app found.");
  process.exit(1);
}
const target = rows[0];
console.log(`Target: ${target.id} currently ${target.status}`);

const now = new Date().toISOString();
const { error } = await sb
  .from("applications")
  .update({
    status: "READY_TO_SEND",
    surname: "TAN",
    given_names: "Test Applicant",
    name: "TAN Test Applicant",
    nric_no: "S1234567A",
    chinese_name: "陈测试",
    home_address: "1 Kampong Glam Road, Singapore",
    postal_code: "199000",
    housing_type: "HDB",
    hdb_rooms: 4,
    date_of_birth: "1990-01-15",
    place_of_birth: "Singapore",
    race: "Chinese",
    gender: "Male",
    marital_status: "Single",
    tel_home: "+6562345678",
    tel_office: "+6563456789",
    tel_hp: "+6591234567",
    highest_edu: "Degree",
    written_languages: ["English", "Chinese"],
    spoken_languages: ["English", "Chinese", "Malay"],
    facebook: "fb.com/test.applicant",
    linkedin: "linkedin.com/in/testapplicant",
    twitter: "@testapplicant",
    blog: "testapplicant.blog",
    email: "applicant.test@example.com",
    occupation: "Software Engineer",
    organisation: "Test Org Pte Ltd",
    monthly_income: "$5,001 - $10,000",
    hobbies: ["Reading", "Hiking", "Photography"],
    trade_unions: "NTUC",
    associations: "Singapore Computer Society",
    clubs: "Tanglin Club",
    ccc: "Kampong Glam CCC",
    ccmc: "Kampong Glam CCMC",
    rnc: "Bras Basah RC",
    grassroots: "Kampong Glam GRO",
    consent_pdpa: true,
    applicant_signed_at: now,
    referral_signed_at: now,
    chairman_signed_at: now,
    ready_to_send_at: now,
    assigned_referral_name: "Jane Referral",
    assigned_referral_membership_no: "PAP-2020-9999",
    assigned_referral_known_years: 10,
    chairman_name_on_form: "Test Chairman",
    chairman_known_years: 5,
    routing_choice: "direct_to_chairman",
    applicant_photo_url: `${target.id}/photo.jpg`,
  })
  .eq("id", target.id);
if (error) {
  console.error(error);
  process.exit(1);
}
console.log("✓ Status now READY_TO_SEND with full field set");

// 4×4 solid-black PNG, RGBA, no alpha — scales to a visible black block in
// pdf-lib's drawImage so we can verify photo + signature box positions in
// the rendered PDF without needing real signature scans.
const blackPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mNk+M9Qz0AAMI4qpFwhAFQuAv3jH3SCAAAAAElFTkSuQmCC";
const stubBytes = Buffer.from(blackPngBase64, "base64");

const photoUpload = await sb.storage
  .from("applicant-photos")
  .upload(`${target.id}/photo.jpg`, stubBytes, { contentType: "image/jpeg", upsert: true });
console.log("Photo:", photoUpload.error ? `✗ ${photoUpload.error.message}` : "✓ uploaded");

for (const role of ["applicant", "referral", "chairman"]) {
  const res = await sb.storage
    .from("signatures")
    .upload(`${target.id}/${role}.png`, stubBytes, { contentType: "image/png", upsert: true });
  console.log(`Sig ${role}:`, res.error ? `✗ ${res.error.message}` : "✓ uploaded");
}

console.log(`\nReady to send URL: http://localhost:3000/branch/ready-to-send/${target.id}`);
