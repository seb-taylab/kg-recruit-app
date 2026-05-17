/**
 * Convert a wing-routed lead into a full membership application.
 *
 * Branch admin's view of the lead: a row in /branch/inbox under "Inbound
 * leads". Clicking "Send membership invite" runs this action — it mirrors
 * the existing createInviteAction in initiate/actions.ts (same magic-link
 * mint, same audit pattern) but seeds the application from the lead's
 * captured fields and links it back via applications.lead_id.
 *
 * After conversion the lead is read-only (status = CONVERTED) and the
 * branch admin lands on the application detail page with the share token
 * cookie set, ready to deliver via email/WhatsApp/copy.
 */
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/format/phone";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  ttlToExpiry,
} from "@/lib/auth/magic-link";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { setShareTokenCookie } from "@/lib/auth/share-token-cookie";
import { isBranchAdminTeam } from "@/types/database";

const convertSchema = z.object({ leadId: z.string().uuid() });

export interface ConvertResult {
  ok: boolean;
  error?: string;
  applicationId?: string;
}

export async function convertLeadToApplicationAction(
  input: z.input<typeof convertSchema>,
): Promise<ConvertResult> {
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const auth = await requireAuth();
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();

  // Load the lead and confirm it's routed to this branch + ready to convert.
  const { data: leadRow } = await admin
    .from("leads" as never)
    .select(
      "id, wing_branch_id, routed_to_branch_id, status, full_name, mobile_number, postal_code, email, event_id, converted_to_application_id",
    )
    .eq("id", parsed.data.leadId)
    .single();
  const lead = leadRow as
    | {
        id: string;
        wing_branch_id: string;
        routed_to_branch_id: string | null;
        status: string;
        full_name: string;
        mobile_number: string;
        postal_code: string | null;
        email: string | null;
        event_id: string;
        converted_to_application_id: string | null;
      }
    | null;

  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.routed_to_branch_id !== auth.branch.id) {
    return { ok: false, error: "This lead isn't routed to your branch." };
  }
  if (lead.status === "CONVERTED" && lead.converted_to_application_id) {
    // Idempotent — if already converted, jump straight to the application.
    return { ok: true, applicationId: lead.converted_to_application_id };
  }
  if (lead.status === "ARCHIVED") {
    return { ok: false, error: "This lead was archived. Convert isn't allowed." };
  }

  // Canonicalise phone — leads were captured loosely; applications expect E.164.
  const e164 = toE164(lead.mobile_number, "SG");
  if (!e164) {
    return {
      ok: false,
      error: "Lead's mobile number isn't a valid SG phone. Archive and re-capture.",
    };
  }

  const settings = await getEffectiveSettings(auth.branch.id);
  const rawToken = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(rawToken);
  const expiresAt = ttlToExpiry(settings.inviteTtlHours);
  const now = new Date().toISOString();

  // Create the application, seeded from the lead.
  const { data: inserted, error: insertErr } = await admin
    .from("applications" as never)
    .insert({
      status: "APPLICANT_INVITED",
      branch_id: auth.branch.id,
      invited_by_admin_id: auth.userId,
      applicant_name_at_invite: lead.full_name,
      applicant_phone: e164,
      applicant_email: lead.email ?? null,
      postal_code: lead.postal_code ?? null,
      applicant_invited_at: now,
      invite_delivery_channels: [],
      lead_id: lead.id,
    } as never)
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      ok: false,
      error: insertErr?.message ?? "Couldn't create the application.",
    };
  }
  const applicationId = (inserted as { id: string }).id;

  const { error: linkErr } = await admin.from("magic_links" as never).insert({
    application_id: applicationId,
    branch_id: auth.branch.id,
    token_hash: tokenHash,
    intended_role: "applicant",
    expires_at: expiresAt,
    generated_by_id: auth.userId,
  } as never);
  if (linkErr) {
    // Roll back the application row — couldn't generate the link.
    await admin.from("applications" as never).delete().eq("id", applicationId);
    return { ok: false, error: "Couldn't generate the magic link." };
  }

  // Mark lead converted.
  const { error: leadUpdErr } = await admin
    .from("leads" as never)
    .update({
      status: "CONVERTED",
      converted_to_application_id: applicationId,
      converted_at: now,
    } as never)
    .eq("id", lead.id);
  if (leadUpdErr) {
    // Don't roll back the application — better to have an orphan converted
    // application than to lose the work. Surface a warning toast via error.
    return {
      ok: false,
      error:
        "Application created but couldn't mark the lead converted. Tell support.",
      applicationId,
    };
  }

  await writeAuditLog({
    action: "INVITED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      ttl_hours: settings.inviteTtlHours,
      from_lead_id: lead.id,
      from_event_id: lead.event_id,
    },
  });
  await writeAuditLog({
    action: "LEAD_CONVERTED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      lead_id: lead.id,
      application_id: applicationId,
      event_id: lead.event_id,
    },
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "INVITED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { source: "lead", lead_id: lead.id, event_id: lead.event_id },
  });

  // Set the share-token flash cookie so the application detail page can
  // display the raw link to the admin without putting it in the URL.
  await setShareTokenCookie(applicationId, rawToken);

  revalidatePath("/branch/inbox");
  revalidatePath("/wing/triage");

  // redirect() throws; nothing after this runs.
  redirect(`/branch/applications/${applicationId}`);
}
