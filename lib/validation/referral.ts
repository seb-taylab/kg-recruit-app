/**
 * Zod schemas for the referral flow.
 *
 *  - `referralAssignmentSchema` runs when the Branch Admin assigns a
 *    referral (creates the magic link + persists pre-fill values).
 *  - `referralSignSchema` runs when the referral opens the magic link and
 *    edits/confirms before signing (Addendum Form Ownership Map Actor B —
 *    3 editable fields).
 *
 * The admin-supplied values are *defaults* — the referral can edit them
 * at sign time (per Gap 5 / Form Ownership Map).
 */
import { z } from "zod";

const SG_LOCAL_MOBILE = /^[89]\d{7}$/;
const SG_E164_MOBILE = /^\+65[89]\d{7}$/;

const knownYears = z.coerce
  .number({ message: "Number of years required" })
  .int()
  .min(0, "At least 0")
  .max(99, "Up to 99");

export const referralAssignmentSchema = z.object({
  assigned_referral_name: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(120, "Name is too long"),
  assigned_referral_phone: z
    .string()
    .trim()
    .min(1, "This field is required")
    .refine(
      (v) => SG_LOCAL_MOBILE.test(v) || SG_E164_MOBILE.test(v.replace(/\s+/g, "")),
      "Phone should be 8 digits, starting with 8 or 9",
    ),
  assigned_referral_email: z
    .string()
    .trim()
    .email("That doesn't look like a valid email — check the @ and the domain")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  assigned_referral_membership_no: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(40, "Membership number is too long"),
  assigned_referral_known_years: knownYears,
  routing_choice: z.enum(["direct_to_chairman", "via_branch_admin_review"], {
    message: "Pick a routing path",
  }),
});

export type ReferralAssignmentInput = z.input<typeof referralAssignmentSchema>;
export type ReferralAssignment = z.output<typeof referralAssignmentSchema>;

export const referralSignSchema = z.object({
  assigned_referral_name: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(120, "Name is too long"),
  assigned_referral_membership_no: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(40, "Membership number is too long"),
  assigned_referral_known_years: knownYears,
});

export type ReferralSignInput = z.input<typeof referralSignSchema>;
export type ReferralSign = z.output<typeof referralSignSchema>;
