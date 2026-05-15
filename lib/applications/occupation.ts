/**
 * @used-by app/apply/[token]/actions.ts (legacy-column derivation),
 *          lib/pdf/generate.ts (PDF field rendering),
 *          app/(dashboard)/branch/sign/[id]/page.tsx (admin display)
 *
 * Two related helpers consolidated:
 *
 *   1. buildLegacyOccupationString  — produces the single flat string
 *      we write to the legacy `applications.occupation` column at submit
 *      time. Keeps old readers (PDF, sign page) compatible without each
 *      one needing to know the new structured shape.
 *
 *   2. pdfOccupationLines           — produces the two strings the PDF
 *      template overlay writes into its dedicated occupation +
 *      organisation slots. Diverges slightly from the legacy string
 *      (e.g. homemaker → empty organisation line vs not-rendered) so
 *      the printed form reads cleanly.
 *
 *   3. categoryDisplay              — admin-view label for "what
 *      goes on the second line of the occupation card?" (Company for
 *      employed, School for student, etc.). Used on the Chairman
 *      sign page.
 *
 * Single file for these because they share the same `switch(category)`
 * pivot. Splitting them would invite drift when a future category
 * lands.
 */
import type { OccupationCategory } from "@/lib/validation/occupation-organisation";

interface OccupationFields {
  occupation_category: OccupationCategory | null;
  occupation_detail: string | null;
  organisation_name: string | null;
  school_level?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// 1. Legacy single-string composer
// ─────────────────────────────────────────────────────────────────────

/**
 * Compose the human-readable string we persist to the legacy
 * `applications.occupation` column. Mirrors how a Chairman or HQ reader
 * would describe the applicant's role in a sentence.
 */
export function buildLegacyOccupationString(input: OccupationFields): string {
  const cat = input.occupation_category;
  const detail = input.occupation_detail?.trim() ?? "";
  if (!cat) return "";

  switch (cat) {
    case "employed":         return detail || "Employed";
    case "self_employed":    return detail || "Self-employed";
    case "student":          return "Student";
    case "national_service": return "National Service";
    case "unemployed":       return "Unemployed";
    case "homemaker":        return "Homemaker";
    case "retired":          return detail ? `Retired — formerly ${detail}` : "Retired";
    case "other":            return detail || "Other";
  }
}

// ─────────────────────────────────────────────────────────────────────
// 2. PDF two-line mapping
// ─────────────────────────────────────────────────────────────────────

export interface PdfOccupationLines {
  occupation: string;
  organisation: string;
}

/**
 * Map the structured fields to the two flat strings the PDF needs.
 * Each line is rendered by the existing pdf-lib drawField helper,
 * which short-circuits on empty strings — so a blank organisation
 * field (homemaker, other) leaves the corresponding row visually
 * empty. Consistent with the spec's "no concatenation" rule.
 */
export function pdfOccupationLines(input: OccupationFields): PdfOccupationLines {
  const cat = input.occupation_category;
  const detail = input.occupation_detail?.trim() ?? "";
  const org = input.organisation_name?.trim() ?? "";
  if (!cat) {
    // Legacy row submitted before this redesign shipped — fall back to
    // whatever's in the row already (which the caller passed in
    // separately, not via this helper).
    return { occupation: detail, organisation: org };
  }

  switch (cat) {
    case "employed":         return { occupation: detail, organisation: org };
    case "self_employed":    return { occupation: detail, organisation: org };
    case "student":          return { occupation: "Student", organisation: org };
    case "national_service": return { occupation: "National Service", organisation: org };
    case "unemployed":       return { occupation: "Unemployed", organisation: org };
    case "homemaker":        return { occupation: "Homemaker", organisation: "" };
    case "retired":
      return {
        occupation: detail ? `Retired — formerly ${detail}` : "Retired",
        organisation: org,
      };
    case "other":            return { occupation: detail, organisation: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 3. Admin-view labels (Chairman sign page)
// ─────────────────────────────────────────────────────────────────────

export interface AdminOccupationDisplay {
  occupationLine: string;
  secondaryLabel: string | null;
  secondaryValue: string | null;
}

const SCHOOL_LEVEL_LABEL: Record<string, string> = {
  primary: "Primary",
  secondary: "Secondary",
  ite: "ITE",
  polytechnic: "Polytechnic",
  jc: "Junior College",
  undergraduate: "Undergraduate",
  postgraduate: "Postgraduate",
  other: "Other",
};

/**
 * Produce the two-line display for the admin / Chairman view. The
 * secondary line's LABEL varies by category ("Company" vs "School" vs
 * "Business") so the reader doesn't get a misleading "Organisation:
 * NUS" row. Returns null fields when there's nothing to show on the
 * second line (homemaker, other-with-no-org).
 */
export function categoryDisplay(input: OccupationFields): AdminOccupationDisplay {
  const cat = input.occupation_category;
  const detail = input.occupation_detail?.trim() ?? "";
  const org = input.organisation_name?.trim() ?? "";

  // Legacy rows (no category) — fall back to flat occupation field so
  // the sign page doesn't show "—" for pre-redesign applications.
  if (!cat) {
    return {
      occupationLine: detail || "—",
      secondaryLabel: org ? "Organisation" : null,
      secondaryValue: org || null,
    };
  }

  switch (cat) {
    case "employed":
      return {
        occupationLine: detail || "Employed",
        secondaryLabel: "Company",
        secondaryValue: org || null,
      };
    case "self_employed":
      return {
        occupationLine: detail || "Self-employed",
        secondaryLabel: "Business",
        secondaryValue: org || null,
      };
    case "student": {
      const level = input.school_level ? SCHOOL_LEVEL_LABEL[input.school_level] : null;
      const secondary = [org, level].filter(Boolean).join(" · ");
      return {
        occupationLine: "Student",
        secondaryLabel: "School",
        secondaryValue: secondary || null,
      };
    }
    case "national_service":
      return {
        occupationLine: "National Service",
        secondaryLabel: "Unit",
        secondaryValue: detail || null,
      };
    case "unemployed": {
      const parts = [detail && `${detail}`, org && `at ${org}`].filter(Boolean);
      return {
        occupationLine: "Unemployed",
        secondaryLabel: parts.length > 0 ? "Last role" : null,
        secondaryValue: parts.join(" ") || null,
      };
    }
    case "homemaker":
      return {
        occupationLine: "Homemaker",
        secondaryLabel: null,
        secondaryValue: null,
      };
    case "retired":
      return {
        occupationLine: detail ? `Retired — formerly ${detail}` : "Retired",
        secondaryLabel: org ? "Former employer" : null,
        secondaryValue: org || null,
      };
    case "other":
      return {
        occupationLine: detail || "Other",
        secondaryLabel: null,
        secondaryValue: null,
      };
  }
}
