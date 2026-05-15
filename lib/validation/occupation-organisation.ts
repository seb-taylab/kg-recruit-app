/**
 * @used-by lib/validation/applicant-form.ts, components/applicant/OccupationOrganisationFields
 *
 * Structured replacement for the legacy free-text `occupation` +
 * `organisation` applicant fields. Applicants pick a category, then a
 * conditional subset of detail fields opens — required-ness is keyed
 * off the category via the cross-field `superRefine` in
 * applicantFullSchema (NOT here, so the partial-autosave schema in the
 * wizard doesn't bounce drafts that have just started).
 *
 * No "Nil" / "N/A" option. Eight honest categories cover every
 * applicant Sebastian could think of.
 */
import { z } from "zod";

export const OCCUPATION_CATEGORIES = [
  "employed",
  "self_employed",
  "student",
  "national_service",
  "unemployed",
  "homemaker",
  "retired",
  "other",
] as const;
export type OccupationCategory = (typeof OCCUPATION_CATEGORIES)[number];

export const SCHOOL_LEVELS = [
  "primary",
  "secondary",
  "ite",
  "polytechnic",
  "jc",
  "undergraduate",
  "postgraduate",
  "other",
] as const;
export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];

/**
 * Helper that mirrors the optionalString pattern used in applicant-form.
 * DB columns may come back as NULL on partial autosaves — treat NULL
 * and "" as "not yet filled" rather than "Invalid input".
 */
const optionalDetail = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === null || v === "" ? undefined : v));

export const occupationOrganisationSchema = z.object({
  occupation_category: z.enum(OCCUPATION_CATEGORIES, {
    message: "Pick one",
  }),
  occupation_detail: optionalDetail(80),
  organisation_name: optionalDetail(100),
  school_level: z
    .enum(SCHOOL_LEVELS)
    .nullable()
    .optional()
    .transform((v) => (v === null ? undefined : v)),
});

export type OccupationInput = z.infer<typeof occupationOrganisationSchema>;

/**
 * Conditional required-ness — applied via `superRefine` on the FULL
 * applicant schema, not on the partial draft autosave. Returns an
 * array of zod issues the caller can `ctx.addIssue` onto its own
 * context.
 *
 *   Employed         → occupation_detail (job title) + organisation_name (company)
 *   Self-employed    → occupation_detail (nature)    + organisation_name (business)
 *   Student          → organisation_name (school)
 *                      school_level is OPTIONAL
 *   National Service → occupation_detail (service / unit)
 *   Unemployed       → both fields optional (last role + last employer)
 *   Homemaker        → no fields
 *   Retired          → occupation_detail (former occupation)
 *                      organisation_name (former employer) is OPTIONAL
 *   Other            → occupation_detail (describe)
 */
export interface OccupationRequiredCheck {
  path: ("occupation_detail" | "organisation_name")[];
  message: string;
}

export function checkOccupationRequired(
  input: OccupationInput,
): OccupationRequiredCheck[] {
  const issues: OccupationRequiredCheck[] = [];
  const requireDetail = (msg: string) => {
    if (!input.occupation_detail || input.occupation_detail.trim() === "") {
      issues.push({ path: ["occupation_detail"], message: msg });
    }
  };
  const requireOrg = (msg: string) => {
    if (!input.organisation_name || input.organisation_name.trim() === "") {
      issues.push({ path: ["organisation_name"], message: msg });
    }
  };

  switch (input.occupation_category) {
    case "employed":
      requireDetail("Job title is required");
      requireOrg("Company name is required");
      break;
    case "self_employed":
      requireDetail("Nature of business is required");
      requireOrg("Business name is required");
      break;
    case "student":
      requireOrg("School name is required");
      // school_level optional
      break;
    case "national_service":
      requireDetail("Service / unit is required");
      break;
    case "unemployed":
      // both optional
      break;
    case "homemaker":
      // no fields
      break;
    case "retired":
      requireDetail("Former occupation is required");
      // organisation optional
      break;
    case "other":
      requireDetail("Describe your occupation");
      break;
  }
  return issues;
}
