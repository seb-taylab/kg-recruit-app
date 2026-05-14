/**
 * Zod schema for the Chairman sign step.
 *
 * Form Ownership Map Actor C (Chairman):
 *   - chairman_name_on_form  (editable; pre-populated from profiles.full_name)
 *   - chairman_known_years   (Chairman enters fresh)
 *   - signature              (handled separately via the SignaturePad)
 */
import { z } from "zod";

export const chairmanSignSchema = z.object({
  chairman_name_on_form: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(120, "Name is too long"),
  chairman_known_years: z.coerce
    .number({ message: "Number of years required" })
    .int()
    .min(0, "At least 0")
    .max(99, "Up to 99"),
});

export type ChairmanSignInput = z.input<typeof chairmanSignSchema>;
export type ChairmanSign = z.output<typeof chairmanSignSchema>;
