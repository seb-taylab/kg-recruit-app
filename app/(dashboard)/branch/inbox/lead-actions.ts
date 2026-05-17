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

export interface ActionResult {
  ok: boolean;
  error?: string;
}

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

// ─────────────────────────────────────────────────────────────────────
// Mark engaged (Sprint 5) — branch admin flags "we're in touch with this
// person but haven't sent the membership invite yet." Transitions
// ROUTED → ENGAGED, which buys the branch more time before the wing
// considers rerouting. Idempotent — re-engaging an already-ENGAGED
// lead is a no-op.

const markEngagedSchema = z.object({ leadId: z.string().uuid() });

export async function markLeadEngagedAction(
  input: z.input<typeof markEngagedSchema>,
): Promise<ActionResult> {
  const parsed = markEngagedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const auth = await requireAuth();
  if (!auth.activeBranch || !isBranchAdminTeam(auth.activeProfile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();

  const { data: leadRow } = await admin
    .from("leads" as never)
    .select("id, routed_to_branch_id, status")
    .eq("id", parsed.data.leadId)
    .single();
  const lead = leadRow as
    | { id: string; routed_to_branch_id: string | null; status: string }
    | null;
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.routed_to_branch_id !== auth.activeBranch.id) {
    return { ok: false, error: "This lead isn't routed to your branch." };
  }
  if (lead.status === "ENGAGED") return { ok: true }; // idempotent
  if (lead.status !== "ROUTED") {
    return {
      ok: false,
      error: `Lead is ${lead.status.toLowerCase()} — can't mark engaged.`,
    };
  }

  const { error: updErr } = await admin
    .from("leads" as never)
    .update({ status: "ENGAGED" } as never)
    .eq("id", lead.id);
  if (updErr) return { ok: false, error: updErr.message };

  await writeAuditLog({
    action: "LEAD_ENGAGED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: { lead_id: lead.id },
  });

  revalidatePath("/branch/inbox");
  revalidatePath("/wing/triage");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Return to wing (Sprint 6) — branch admin pushes a lead back to the wing
// when it isn't the right fit (wrong constituency, already a member,
// applicant doesn't reside here, etc.). The lead's status flips back to
// CAPTURED and routed_to_branch_id is cleared, so it reappears in the
// wing's triage "New" queue.
//
// Schema-wise this reuses lead_route_history with reason='branch_declined'
// — the specific reason text is captured in reason_note. No schema change.

const RETURN_REASONS = [
  "wrong_constituency",
  "already_member",
  "not_residing_here",
  "applicant_request",
  "quality_concern",
  "other",
] as const;

const returnSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.enum(RETURN_REASONS),
  reasonNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function returnLeadToWingAction(
  input: z.input<typeof returnSchema>,
): Promise<ActionResult> {
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { leadId, reason, reasonNote } = parsed.data;

  const auth = await requireAuth();
  if (!auth.activeBranch || !isBranchAdminTeam(auth.activeProfile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();

  const { data: leadRow } = await admin
    .from("leads" as never)
    .select("id, wing_branch_id, routed_to_branch_id, status")
    .eq("id", leadId)
    .single();
  const lead = leadRow as
    | {
        id: string;
        wing_branch_id: string;
        routed_to_branch_id: string | null;
        status: string;
      }
    | null;
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.routed_to_branch_id !== auth.activeBranch.id) {
    return { ok: false, error: "This lead isn't routed to your branch." };
  }
  if (lead.status === "CONVERTED") {
    return { ok: false, error: "Converted leads can't be returned." };
  }
  if (lead.status === "ARCHIVED") {
    return { ok: false, error: "Archived leads can't be returned." };
  }

  // Flip back: status → CAPTURED, clear routing fields so the lead surfaces
  // in the wing's "New" queue. reroute_count stays as-is (incremented later
  // by the wing if they re-route to a different branch).
  const { error: updErr } = await admin
    .from("leads" as never)
    .update({
      status: "CAPTURED",
      routed_to_branch_id: null,
      routed_at: null,
      routed_by_user_id: null,
    } as never)
    .eq("id", lead.id);
  if (updErr) return { ok: false, error: updErr.message };

  // History row — captures who returned, when, why. to_branch_id is the
  // wing because the lead is now back in the wing's queue. The trigger
  // permits this (no territorial constraint on history.to_branch_id,
  // only on leads.routed_to_branch_id).
  const composedNote = [
    `Reason: ${reason.replace(/_/g, " ")}`,
    reasonNote && reasonNote.trim().length > 0 ? reasonNote.trim() : null,
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 500);

  const { error: histErr } = await admin
    .from("lead_route_history" as never)
    .insert({
      lead_id: lead.id,
      wing_branch_id: lead.wing_branch_id,
      from_branch_id: auth.activeBranch.id,
      to_branch_id: lead.wing_branch_id,
      reason: "branch_declined",
      reason_note: composedNote,
      routed_by_user_id: auth.userId,
    } as never);
  if (histErr) {
    // Don't roll back the lead status — history is audit, not critical
    // path. Log and surface a soft warning.
    console.error("[returnLeadToWingAction] history insert failed:", histErr.message);
  }

  await writeAuditLog({
    action: "LEAD_RETURNED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      lead_id: lead.id,
      wing_branch_id: lead.wing_branch_id,
      reason,
      had_note: Boolean(reasonNote && reasonNote.trim().length > 0),
      previous_status: lead.status,
    },
  });

  revalidatePath("/branch/inbox");
  revalidatePath("/wing/triage");
  return { ok: true };
}
