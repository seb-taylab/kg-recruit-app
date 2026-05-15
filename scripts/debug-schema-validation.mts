/**
 * Reproduce server-side full-schema validation against a specific row.
 * Hard-coded to dump WHICH path fails and WHAT the validator was looking
 * at. Helps diagnose "schema says missing but DB shows populated" cases.
 *
 * Run: npx tsx scripts/debug-schema-validation.mts
 */
// Use dynamic import so we can pull named exports from tsx's
// default-wrapped TypeScript module loading on this Node version.
const mod = await import("../lib/validation/applicant-form");
const applicantFullSchema =
  (mod as { applicantFullSchema?: unknown }).applicantFullSchema ??
  (mod as { default?: { applicantFullSchema?: unknown } }).default?.applicantFullSchema;
if (!applicantFullSchema || typeof (applicantFullSchema as { safeParse?: unknown }).safeParse !== "function") {
  throw new Error("Failed to resolve applicantFullSchema from module");
}

// EXACT row data pulled from production via MCP (id=9b5c882a)
const row = {
  nric_no: "S8729733J",
  surname: "TAY",
  given_names: "Jiaxiang sebastian",
  chinese_name: null,
  home_address: "Blk 102 RIVERVALE WALK, RIVERVALE COURT, #10-70",
  postal_code: "540102",
  block_number: "102",
  street_name: "RIVERVALE WALK",
  building_name: "RIVERVALE COURT",
  unit_number: "#10-70",
  latitude: "1.3818076",   // ← numeric in DB but Supabase returns as string for numeric columns
  longitude: "103.9008932", // ← same
  housing_type: "HDB",
  hdb_rooms: 5,
  date_of_birth: "1987-09-11",
  place_of_birth: "Malaysia",
  race: "Malay",
  gender: "Male",
  marital_status: "Married",
  tel_home: "82884141",
  tel_office: null,
  tel_hp: "82884141",
  highest_edu: "Post Grad",
  written_languages: ["English", "Malay"],
  spoken_languages: ["English", "Chinese"],
  facebook: null,
  linkedin: null,
  twitter: null,
  blog: null,
  email: "sebtay@msn.com",
  occupation: "Student",
  organisation: "Anglo chinese jc",
  occupation_category: "student",
  occupation_detail: null,
  organisation_name: "Anglo chinese jc",
  school_level: "jc",
  monthly_income: "Below $1,500",
  hobbies: ["Bowling"],
  trade_unions: null,
  associations: null,
  clubs: null,
  ccc: null,
  ccmc: null,
  rnc: null,
  grassroots: null,
  consent_pdpa: true,
};

const result = (applicantFullSchema as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: Array<{ path: (string | number)[]; code: string; message: string; received?: unknown; expected?: unknown }> } } }).safeParse(row);

if (result.success) {
  console.log("Schema validation passed");
  console.log("Output keys:", Object.keys(result.data as Record<string, unknown>));
} else {
  console.log("Schema validation FAILED");
  const issues = result.error?.issues ?? [];
  console.log(`${issues.length} issue(s):\n`);
  for (const issue of issues) {
    console.log(`  path:    ${issue.path.join(".")}`);
    console.log(`  code:    ${issue.code}`);
    console.log(`  message: ${issue.message}`);
    if (issue.received !== undefined) console.log(`  received: ${JSON.stringify(issue.received)}`);
    if (issue.expected !== undefined) console.log(`  expected: ${JSON.stringify(issue.expected)}`);
    console.log("");
  }
}
