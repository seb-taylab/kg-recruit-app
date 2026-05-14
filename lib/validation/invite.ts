/**
 * Zod schemas for the Branch Admin invite flow.
 *
 * Brand Execution §3.5 error patterns:
 *   - "Phone should be 8 digits, starting with 8 or 9"
 *   - "That doesn't look like a valid email — check the @ and the domain"
 *   - "This field is required"
 *
 * Phone storage is canonical E.164; the form validator accepts SG mobile
 * shorthand (8 digits) OR explicit `+65…` and converts to E.164 in the
 * server action via toE164(). Here we just sanity-check the input shape.
 */
import { z } from "zod";

const SG_LOCAL_MOBILE = /^[89]\d{7}$/;
const SG_E164_MOBILE = /^\+65[89]\d{7}$/;

export const inviteFormSchema = z.object({
  applicantName: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(120, "Name is too long"),
  applicantPhone: z
    .string()
    .trim()
    .min(1, "This field is required")
    .refine(
      (v) => SG_LOCAL_MOBILE.test(v) || SG_E164_MOBILE.test(v.replace(/\s+/g, "")),
      "Phone should be 8 digits, starting with 8 or 9",
    ),
  applicantEmail: z
    .string()
    .trim()
    .email("That doesn't look like a valid email — check the @ and the domain")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type InviteFormInput = z.input<typeof inviteFormSchema>;
export type InviteFormParsed = z.output<typeof inviteFormSchema>;
