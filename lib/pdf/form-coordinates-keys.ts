/**
 * Canonical tick-group keys for MF_V1.0.
 *
 * SINGLE SOURCE OF TRUTH. These literal unions are referenced by:
 *   1. types/database.ts (or future generated types) for application-row enums
 *   2. lib/pdf/form-coordinates.ts (key parity for the coord map)
 *   3. scripts/validate-form-coordinates.ts (CI gate per Addendum v1.3 Gap 9)
 *   4. supabase/migrations/20260513000001_init_schema.sql CHECK constraints
 *
 * If any of these four diverge, the CI script fails the PR. Edit ONLY this
 * file when adding/changing a tick value, then propagate by hand to the
 * migration CHECK.
 */

export const FORM_TICK_VALUES = {
  race: ["Chinese", "Malay", "Indian", "Others"] as const,
  gender: ["Male", "Female"] as const,
  maritalStatus: ["Single", "Married", "Divorced"] as const,
  housing: ["HDB", "Condominium", "Landed"] as const,
  education: [
    "Primary",
    "Lower Sec / N / O Level",
    "Nitec",
    "Post Sec / A Level",
    "Diploma",
    "Degree",
    "Post Grad",
  ] as const,
  monthlyIncome: [
    "Below $1,500",
    "$1,501 - $5,000",
    "$5,001 - $10,000",
    "Above $10,000",
  ] as const,
  language: ["English", "Chinese", "Malay", "Tamil"] as const,
} satisfies Record<string, readonly string[]>;

export type TickGroupKeys = {
  [K in keyof typeof FORM_TICK_VALUES]: (typeof FORM_TICK_VALUES)[K][number];
};
