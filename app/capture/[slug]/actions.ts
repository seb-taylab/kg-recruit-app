/**
 * Capture-server action — booth-admin-attributed lead insert.
 *
 * Auth is double-checked in the page (server component) AND here, because
 * server actions are independently callable. Wing-admin scoping is enforced
 * via the leads INSERT RLS policy too (defence in depth).
 *
 * The consent_text_version we record is a constant baked into this file. If
 * the consent copy changes, bump the version so we can audit which version
 * each lead saw.
 */
"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
// Constants live in their own file because Next.js Turbopack rejects
// non-async value exports from "use server" files. Type-only exports
// (interface, type) are fine because they erase at runtime.
import { CAPTURE_CONSENT_VERSION } from "./consent";

export interface CaptureResult {
  ok: boolean;
  error?: string;
  leadId?: string;
  fieldErrors?: Partial<
    Record<"full_name" | "mobile_number" | "postal_code" | "nric_last_4" | "email" | "consent", string>
  >;
}

const SG_POSTAL = /^\d{6}$/;
const NRIC_LAST_4 = /^\d{3}[A-Z]$/i;
const PHONE = /^\+?[0-9 ]{8,20}$/;

const captureSchema = z.object({
  eventSlug: z.string().min(1).max(50),
  full_name: z
    .string()
    .trim()
    .min(2, "Name is too short")
    .max(100, "Name is too long"),
  mobile_number: z
    .string()
    .trim()
    .regex(PHONE, "Mobile number — 8-20 digits, +65 optional"),
  postal_code: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || SG_POSTAL.test(v), "6-digit Singapore postal code"),
  nric_last_4: z
    .string()
    .trim()
    .toUpperCase()
    .regex(NRIC_LAST_4, "Last 4 of NRIC — 3 digits then letter, e.g. 123A"),
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine(
      (v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "That doesn't look like an email",
    ),
  consent_pdpa: z.boolean(),
});

export async function captureLeadAction(
  input: z.input<typeof captureSchema>,
): Promise<CaptureResult> {
  const parsed = captureSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: CaptureResult["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<CaptureResult["fieldErrors"]>;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;
  if (!data.consent_pdpa) {
    return {
      ok: false,
      fieldErrors: { consent: "Tick the consent box to submit." },
    };
  }

  const auth = await requireAuth();
  // Wing admins of the event's wing — DB RLS will reject mismatches too,
  // but we check here so the error is friendlier.
  if (
    auth.profile.role !== "wing_admin" &&
    auth.profile.role !== "taylab_staff"
  ) {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.branch) {
    return { ok: false, error: "No branch context." };
  }

  const admin = createAdminClient();

  // Look up the event by slug, scoped to the booth admin's wing.
  const { data: eventRow } = await admin
    .from("events" as never)
    .select("id, branch_id, is_active")
    .eq("slug", data.eventSlug)
    .eq("branch_id", auth.branch.id)
    .single();
  const event = eventRow as { id: string; branch_id: string; is_active: boolean } | null;
  if (!event) {
    return { ok: false, error: "Event not found in your wing." };
  }
  if (!event.is_active) {
    return { ok: false, error: "This event is closed — capture is disabled." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = hdrs.get("user-agent") ?? null;

  const { data: inserted, error: insErr } = await admin
    .from("leads" as never)
    .insert({
      event_id: event.id,
      wing_branch_id: auth.branch.id,
      full_name: data.full_name,
      mobile_number: data.mobile_number,
      postal_code: data.postal_code ?? null,
      nric_last_4: data.nric_last_4,
      email: data.email ?? null,
      consent_pdpa: true,
      consent_text_version: CAPTURE_CONSENT_VERSION,
      captured_by_user_id: auth.userId,
      ip_address: ip,
      user_agent: ua,
      status: "CAPTURED",
    } as never)
    .select("id")
    .single();
  const row = inserted as { id: string } | null;
  if (insErr || !row) {
    return { ok: false, error: insErr?.message ?? "Couldn't save the capture." };
  }

  // Audit metadata stays scrubbed of PII (NRIC last-4 + phone) — the scrubber
  // in lib/audit/log.ts redacts well-known keys, but lead-specific keys are
  // not on the list. Pass only non-PII context here.
  await writeAuditLog({
    action: "LEAD_CAPTURED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      event_id: event.id,
      event_slug: data.eventSlug,
      lead_id: row.id,
      consent_version: CAPTURE_CONSENT_VERSION,
      has_postal: data.postal_code !== undefined,
      has_email: data.email !== undefined,
    },
  });

  revalidatePath("/wing/triage");
  revalidatePath("/wing/events");
  return { ok: true, leadId: row.id };
}
