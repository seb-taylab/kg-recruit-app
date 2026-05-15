/**
 * Applicant form zod schema.
 *
 * Authoritative against:
 *   - Addendum v1.3 Gap 7 (field length limits)
 *   - Addendum v1.3 Gap 9 (CHECK-locked tick values — pulled from FORM_TICK_VALUES)
 *   - Addendum v1.3 Gap 10 (NRIC / postal code / phone / DOB rules)
 *   - PRD §4.2 (mandatory fields per page)
 *   - Form Ownership Map Actor A (applicant scope only — no referral/chairman/HQ fields)
 *
 * Same schema runs client-side (react-hook-form resolver) and server-side
 * (server action re-validation). Never trust the client.
 */
import { z } from "zod";
import { FORM_TICK_VALUES } from "@/lib/pdf/form-coordinates-keys";
import {
  occupationOrganisationSchema,
  checkOccupationRequired,
} from "@/lib/validation/occupation-organisation";

const NRIC_REGEX = /^[STFG]\d{7}[A-Z]$/;
const SG_POSTAL = /^\d{6}$/;
const PHONE_REGEX = /^\+?[0-9 ]{8,15}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// SG unit numbers: #FLOOR-UNIT, e.g. #08-123 or #15-04A. Trailing letter
// (HDB stack suffix) is optional. Two-letter suffixes exist but are rare;
// applicants in that situation can fall back to entering it as part of
// block_number / building_name in manual mode.
const SG_UNIT_REGEX = /^#\d{1,3}-\d{1,4}[A-Z]?$/;
// Singapore bounding box for the OneMap-returned coords. Mirrors the DB
// CHECK constraint in migrations/20260516000001_structured_address.sql.
const SG_LAT_MIN = 1.0;
const SG_LAT_MAX = 1.6;
const SG_LNG_MIN = 103.4;
const SG_LNG_MAX = 104.2;

const minYears = (years: number) =>
  (val: string) => {
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return false;
    const ago = new Date();
    ago.setFullYear(ago.getFullYear() - years);
    return d.getTime() <= ago.getTime();
  };

const inThePast = (val: string) => {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

// Helpers accept `null` from the DB row in addition to undefined / "". When
// the schema runs against an applications row at submit time, missing
// optional fields come back as null — without the `.nullable()` zod would
// reject them with the default "Invalid input" message and the applicant
// would see a useless top-level error.
const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === null || v === "" ? undefined : v));

const optionalPhone = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === null || v === "" ? undefined : v))
  .refine(
    (v) => v === undefined || PHONE_REGEX.test(v),
    "Phone format isn't right — 8 digits, +65 optional",
  );

export const applicantPage1Schema = z.object({
  // NRIC is stored canonically uppercase. The wizard input also uppercases
  // live, but we transform here too so any other caller (draft autosave
  // with .partial(), future scripts) normalises before the regex fires —
  // downstream code can always assume uppercase.
  nric_no: z
    .string()
    .min(1, "This field is required")
    .transform((v) => v.toUpperCase())
    .refine(
      (v) => NRIC_REGEX.test(v),
      "NRIC format: letter + 7 digits + letter, e.g. S1234567A",
    ),
  surname: z.string().min(1, "This field is required").max(40, "Surname is too long"),
  given_names: z.string().min(1, "This field is required").max(60, "Given names are too long"),
  chinese_name: optionalString(30),
  // ─── Address (postal-code-first; see migrations/20260516000001) ──────
  // The applicant types postal_code → OneMap autofills block/street/
  // building → applicant types unit_number. The free-text home_address
  // is derived server-side from these structured fields at submit time
  // so the PDF renderer + the application-detail page (which read
  // home_address) keep working unchanged. home_address therefore stays
  // optional in this schema; the submit handler is authoritative.
  postal_code: z
    .string()
    .min(1, "This field is required")
    .regex(SG_POSTAL, "6-digit Singapore postal code"),
  block_number: z
    .string()
    .min(1, "Block / house number is required")
    .max(20, "Block number is too long"),
  street_name: z.string().min(1, "Street is required").max(120, "Street is too long"),
  building_name: optionalString(120),
  // Unit is conditionally-required: blank is fine for landed property,
  // but everyone else must fill it. Cross-field check in applicantFullSchema.
  unit_number: z
    .string()
    .max(15, "Unit is too long")
    .nullable()
    .optional()
    .transform((v) => (v === null || v === "" ? undefined : v))
    .refine(
      (v) => v === undefined || SG_UNIT_REGEX.test(v),
      "Format: #FLOOR-UNIT, e.g. #08-123 or #15-04A",
    ),
  latitude: z
    .number()
    .min(SG_LAT_MIN, "Coordinates out of Singapore range")
    .max(SG_LAT_MAX, "Coordinates out of Singapore range")
    .nullable()
    .optional()
    .transform((v) => (v === null ? undefined : v)),
  longitude: z
    .number()
    .min(SG_LNG_MIN, "Coordinates out of Singapore range")
    .max(SG_LNG_MAX, "Coordinates out of Singapore range")
    .nullable()
    .optional()
    .transform((v) => (v === null ? undefined : v)),
  // Kept for back-compat — populated server-side from the structured
  // fields above. Applicants can't type it directly any more.
  home_address: optionalString(200),
  housing_type: z.enum(FORM_TICK_VALUES.housing, {
    message: "Pick one",
  }),
  hdb_rooms: z
    .coerce.number({ message: "Number of rooms required" })
    .int()
    .min(1, "1 minimum")
    .max(9, "9 maximum")
    .nullable()
    .optional()
    .transform((v) => (v === null ? undefined : v)),
  date_of_birth: z
    .string()
    .regex(ISO_DATE, "Pick a date")
    .refine(inThePast, "Date must be in the past")
    .refine(minYears(16), "You must be at least 16"),
  place_of_birth: z
    .string()
    .min(1, "This field is required")
    .max(60, "Place of birth is too long"),
  race: z.enum(FORM_TICK_VALUES.race, { message: "Pick one" }),
  gender: z.enum(FORM_TICK_VALUES.gender, { message: "Pick one" }),
  marital_status: z.enum(FORM_TICK_VALUES.maritalStatus, { message: "Pick one" }),
  tel_home: optionalPhone,
  tel_office: optionalPhone,
  tel_hp: z
    .string()
    .min(1, "This field is required")
    .regex(PHONE_REGEX, "Phone format isn't right — 8 digits, +65 optional"),
  highest_edu: z.enum(FORM_TICK_VALUES.education, { message: "Pick one" }),
  written_languages: z
    .array(z.enum(FORM_TICK_VALUES.language))
    .min(1, "Pick at least one"),
  spoken_languages: z.array(z.enum(FORM_TICK_VALUES.language)).min(1, "Pick at least one"),
  // Form-field widths cap what fits before the PDF wraps/shrinks. The
  // renderer auto-shrinks as a safety net, but capping the input avoids
  // unreadable tiny text on the printed copy.
  facebook: optionalString(60),
  linkedin: optionalString(60),
  twitter: optionalString(60),
  blog: optionalString(60),
  email: z
    .string()
    .min(1, "This field is required")
    .email("That doesn't look like a valid email — check the @ and the domain")
    .max(120, "Email is too long for the form"),
});

export const applicantPage2Schema = z.object({
  // Structured occupation + organisation (replaces the old free-text
  // pair). The legacy `occupation` + `organisation` columns are still
  // populated server-side from these via lib/applications/occupation.ts
  // so the PDF renderer + Chairman sign page keep working unchanged.
  // Per-category required-ness lives in applicantFullSchema's
  // superRefine — not here — so partial draft autosaves don't bounce.
  ...occupationOrganisationSchema.shape,
  monthly_income: z.enum(FORM_TICK_VALUES.monthlyIncome, { message: "Pick a bracket" }),
  hobbies: z
    .array(z.string().max(40, "Hobby name is too long"))
    .max(3, "Up to 3")
    .nullable()
    .optional()
    .transform((v) => v ?? []),
  // Membership rows wrap to 2 lines on the PDF, so we can afford more room
  // than the social row (single-line) but still cap so it stays readable.
  trade_unions: optionalString(80),
  associations: optionalString(80),
  clubs: optionalString(80),
  ccc: optionalString(80),
  ccmc: optionalString(80),
  rnc: optionalString(80),
  grassroots: optionalString(80),
  consent_pdpa: z
    .boolean()
    .refine((v) => v === true, "You must agree before submitting"),
});

/**
 * Cross-page rules:
 *   - HDB rooms required when housing_type = 'HDB'.
 *   - Unit number required unless housing_type = 'Landed' (no unit for
 *     landed properties). This is the new postal-code-first invariant —
 *     spec says "Unit number is required for apartments." The wizard
 *     surfaces this error on the unit field, not the housing radio.
 */
export const applicantFullSchema = applicantPage1Schema
  .merge(applicantPage2Schema)
  .superRefine((data, ctx) => {
    if (data.housing_type === "HDB" && !data.hdb_rooms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hdb_rooms"],
        message: "Number of rooms required for HDB",
      });
    }
    if (data.housing_type !== "Landed" && !data.unit_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unit_number"],
        message:
          "Unit number is required for apartments. Pick 'Landed' below if you don't have one.",
      });
    }
    // Category-conditional required-ness for the new occupation +
    // organisation fields. checkOccupationRequired() returns one
    // issue per missing field; we surface each on its own path so
    // the wizard can highlight both fields when the category
    // requires both (e.g. employed → job title + company name).
    for (const issue of checkOccupationRequired(data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      });
    }
  });

export type ApplicantPage1 = z.infer<typeof applicantPage1Schema>;
export type ApplicantPage2 = z.infer<typeof applicantPage2Schema>;
export type ApplicantFull = z.infer<typeof applicantFullSchema>;

/** True when an NRIC capture step must appear after Page 1 (Addendum §4.2 / Gap 10). */
export function nricRequired(placeOfBirth: string | undefined | null): boolean {
  if (!placeOfBirth) return false;
  return placeOfBirth.trim().toLowerCase() !== "singapore";
}
