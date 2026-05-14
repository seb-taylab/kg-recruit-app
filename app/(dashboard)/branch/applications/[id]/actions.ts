"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/send";
import {
  inviteEmailHtml,
  inviteEmailSubject,
  inviteEmailText,
} from "@/lib/email/templates/invite";
import { toE164 } from "@/lib/format/phone";
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  ttlToExpiry,
} from "@/lib/auth/magic-link";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import { referralAssignmentSchema } from "@/lib/validation/referral";
import {
  referralInviteEmailHtml,
  referralInviteEmailSubject,
  referralInviteEmailText,
} from "@/lib/email/templates/referral-invite";

const deliverySchema = z.object({
  applicationId: z.string().uuid(),
  magicLinkId: z.string().uuid(),
  channel: z.enum(["email", "copy_link", "whatsapp"]),
  metadata: z.record(z.unknown()).optional(),
});

export interface DeliveryResult {
  ok: boolean;
  error?: string;
}

/** Records that the admin shared the magic link through a given channel. */
export async function logDeliveryAction(input: z.input<typeof deliverySchema>): Promise<DeliveryResult> {
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();

  // Confirm the magic link belongs to this branch — defence in depth, RLS
  // would also block it.
  const { data: link } = await admin
    .from("magic_links" as never)
    .select("id, branch_id, application_id")
    .eq("id", parsed.data.magicLinkId)
    .single();
  const linkRow = link as
    | { id: string; branch_id: string; application_id: string }
    | null;
  if (!linkRow || linkRow.branch_id !== auth.branch.id) {
    return { ok: false, error: "Link not found." };
  }

  const { error: insertErr } = await admin.from("link_deliveries" as never).insert({
    magic_link_id: parsed.data.magicLinkId,
    channel: parsed.data.channel,
    delivered_by_id: auth.userId,
    metadata: parsed.data.metadata ?? null,
  } as never);
  if (insertErr) return { ok: false, error: "Couldn't log the delivery." };

  // Track which channels were used on the application (denormalised).
  const { data: app } = await admin
    .from("applications" as never)
    .select("invite_delivery_channels")
    .eq("id", parsed.data.applicationId)
    .single();
  const existing =
    ((app as { invite_delivery_channels: string[] | null } | null)?.invite_delivery_channels) ?? [];
  if (!existing.includes(parsed.data.channel)) {
    await admin
      .from("applications" as never)
      .update({ invite_delivery_channels: [...existing, parsed.data.channel] } as never)
      .eq("id", parsed.data.applicationId);
  }

  await writeAuditLog({
    action: "LINK_DELIVERED",
    applicationId: parsed.data.applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { channel: parsed.data.channel },
  });

  revalidatePath(`/branch/applications/${parsed.data.applicationId}`);
  return { ok: true };
}

const sendInviteSchema = z.object({
  applicationId: z.string().uuid(),
  magicLinkId: z.string().uuid(),
  rawToken: z.string().min(20),
});

/** Sends the branded invite email via Resend, then logs delivery. */
export async function sendInviteEmailAction(
  input: z.input<typeof sendInviteSchema>,
): Promise<DeliveryResult> {
  const parsed = sendInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();
  const { data: appRow } = await admin
    .from("applications" as never)
    .select("id, branch_id, applicant_name_at_invite, applicant_email")
    .eq("id", parsed.data.applicationId)
    .single();
  const app = appRow as
    | {
        id: string;
        branch_id: string;
        applicant_name_at_invite: string | null;
        applicant_email: string | null;
      }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (!app.applicant_email) {
    return { ok: false, error: "No applicant email on file. Use Copy link or Share to WhatsApp instead." };
  }

  const { data: linkRow } = await admin
    .from("magic_links" as never)
    .select("id, expires_at, branch_id")
    .eq("id", parsed.data.magicLinkId)
    .single();
  const link = linkRow as
    | { id: string; expires_at: string; branch_id: string }
    | null;
  if (!link || link.branch_id !== auth.branch.id) {
    return { ok: false, error: "Link not found." };
  }

  const url = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/apply/${parsed.data.rawToken}`;
  const vars = {
    applicantName: app.applicant_name_at_invite ?? "there",
    adminName: auth.profile.full_name ?? "Your branch coordinator",
    link: url,
    expiresAt: link.expires_at,
  };

  const result = await sendEmail({
    to: app.applicant_email,
    subject: inviteEmailSubject(),
    html: inviteEmailHtml(vars),
    text: inviteEmailText(vars),
    fromDisplayName: auth.branch.email_from_display_name,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Email send failed." };

  return logDeliveryAction({
    applicationId: parsed.data.applicationId,
    magicLinkId: parsed.data.magicLinkId,
    channel: "email",
    metadata: { resend_id: result.id },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Referral assignment (Step 6 — admin side)
// ─────────────────────────────────────────────────────────────────────

export interface AssignReferralState {
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "assigned_referral_name"
      | "assigned_referral_phone"
      | "assigned_referral_email"
      | "assigned_referral_membership_no"
      | "assigned_referral_known_years"
      | "routing_choice",
      string
    >
  >;
}

/**
 * Mints a referral magic link, persists the pre-fill values + routing
 * fork, transitions the application to REFERRAL_INVITED, then redirects
 * the admin to the application detail page with the raw token so the
 * DeliveryPanel renders for the 3-channel share.
 */
export async function assignReferralAction(
  applicationId: string,
  _prev: AssignReferralState | undefined,
  formData: FormData,
): Promise<AssignReferralState> {
  // 1. Validate
  const parsed = referralAssignmentSchema.safeParse({
    assigned_referral_name: formData.get("assigned_referral_name"),
    assigned_referral_phone: formData.get("assigned_referral_phone"),
    assigned_referral_email: formData.get("assigned_referral_email"),
    assigned_referral_membership_no: formData.get("assigned_referral_membership_no"),
    assigned_referral_known_years: formData.get("assigned_referral_known_years"),
    routing_choice: formData.get("routing_choice"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { fieldErrors: fieldErrors as AssignReferralState["fieldErrors"] };
  }

  // 2. Normalise phone
  const e164 = toE164(parsed.data.assigned_referral_phone, "SG");
  if (!e164) {
    return {
      fieldErrors: {
        assigned_referral_phone: "Phone should be 8 digits, starting with 8 or 9",
      },
    };
  }

  // 3. Authorise
  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { error: "Branch admin team only." };
  }

  const admin = createAdminClient();

  // 4. Confirm the application belongs to this branch and is in the right state.
  const { data: appRow } = await admin
    .from("applications" as never)
    .select("id, branch_id, status")
    .eq("id", applicationId)
    .single();
  const app = appRow as { id: string; branch_id: string; status: string } | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { error: "Application not found." };
  }
  if (app.status !== "PENDING_REFERRAL_ASSIGNMENT" && app.status !== "REFERRAL_INVITED") {
    return {
      error: `Application is in state ${app.status}. Referral can only be assigned from PENDING_REFERRAL_ASSIGNMENT.`,
    };
  }

  // 5. Mint magic-link token (referral role)
  const settings = await getEffectiveSettings(auth.branch.id);
  const rawToken = generateMagicLinkToken();
  const tokenHash = hashMagicLinkToken(rawToken);
  const expiresAt = ttlToExpiry(settings.inviteTtlHours);
  const now = new Date().toISOString();

  const { error: linkErr } = await admin.from("magic_links" as never).insert({
    application_id: applicationId,
    branch_id: auth.branch.id,
    token_hash: tokenHash,
    intended_role: "referral",
    expires_at: expiresAt,
    generated_by_id: auth.userId,
  } as never);
  if (linkErr) {
    return { error: "Couldn't generate the referral link — try again in a minute." };
  }

  // 6. Persist pre-fill values + routing choice; transition status.
  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      assigned_referral_name: parsed.data.assigned_referral_name,
      assigned_referral_phone: e164,
      assigned_referral_email: parsed.data.assigned_referral_email ?? null,
      assigned_referral_membership_no: parsed.data.assigned_referral_membership_no,
      assigned_referral_known_years: parsed.data.assigned_referral_known_years,
      referral_assigned_at: now,
      referral_assigned_by_id: auth.userId,
      routing_choice: parsed.data.routing_choice,
      status: "REFERRAL_INVITED",
    } as never)
    .eq("id", applicationId);
  if (updateErr) {
    return { error: "Couldn't update the application — try again in a minute." };
  }

  // 7. Audit + event
  await writeAuditLog({
    action: "REFERRAL_ASSIGNED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { routing_choice: parsed.data.routing_choice },
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "REFERRAL_ASSIGNED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { routing_choice: parsed.data.routing_choice },
  });

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath(`/branch/inbox`);
  redirect(`/branch/applications/${applicationId}?token=${encodeURIComponent(rawToken)}`);
}

const sendReferralInviteSchema = z.object({
  applicationId: z.string().uuid(),
  magicLinkId: z.string().uuid(),
  rawToken: z.string().min(20),
});

/** Sends the branded referral invite email via Resend, then logs delivery. */
export async function sendReferralInviteEmailAction(
  input: z.input<typeof sendReferralInviteSchema>,
): Promise<DeliveryResult> {
  const parsed = sendReferralInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();
  const { data: appRow } = await admin
    .from("applications" as never)
    .select(
      "id, branch_id, applicant_name_at_invite, surname, given_names, assigned_referral_name, assigned_referral_email",
    )
    .eq("id", parsed.data.applicationId)
    .single();
  const app = appRow as
    | {
        id: string;
        branch_id: string;
        applicant_name_at_invite: string | null;
        surname: string | null;
        given_names: string | null;
        assigned_referral_name: string | null;
        assigned_referral_email: string | null;
      }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (!app.assigned_referral_email) {
    return {
      ok: false,
      error: "No referral email on file. Use Copy link or Share to WhatsApp instead.",
    };
  }

  const { data: linkRow } = await admin
    .from("magic_links" as never)
    .select("id, expires_at, branch_id")
    .eq("id", parsed.data.magicLinkId)
    .single();
  const link = linkRow as { id: string; expires_at: string; branch_id: string } | null;
  if (!link || link.branch_id !== auth.branch.id) {
    return { ok: false, error: "Link not found." };
  }

  const applicantName =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "the applicant";
  const url = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/referral/${parsed.data.rawToken}`;
  const vars = {
    referralName: app.assigned_referral_name ?? "there",
    applicantName,
    adminName: auth.profile.full_name ?? "Your branch coordinator",
    link: url,
    expiresAt: link.expires_at,
  };

  const result = await sendEmail({
    to: app.assigned_referral_email,
    subject: referralInviteEmailSubject(applicantName),
    html: referralInviteEmailHtml(vars),
    text: referralInviteEmailText(vars),
    fromDisplayName: auth.branch.email_from_display_name,
  });
  if (!result.ok) return { ok: false, error: result.error ?? "Email send failed." };

  return logDeliveryAction({
    applicationId: parsed.data.applicationId,
    magicLinkId: parsed.data.magicLinkId,
    channel: "email",
    metadata: { resend_id: result.id, recipient: "referral" },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Path-B admin review handoff (Step 7)
// ─────────────────────────────────────────────────────────────────────

export interface ForwardResult {
  ok: boolean;
  error?: string;
}

/**
 * After the referral signs on Path B (`via_branch_admin_review`), the
 * application sits in PENDING_BRANCH_ADMIN_REVIEW until a Branch Admin
 * team member clicks "Forward to Chairman". This action handles that
 * one-step transition.
 */
export async function forwardToChairmanAction(
  applicationId: string,
): Promise<ForwardResult> {
  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch || !isBranchAdminTeam(auth.profile.role)) {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("applications" as never)
    .select("id, branch_id, status")
    .eq("id", applicationId)
    .single();
  const app = row as { id: string; branch_id: string; status: string } | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "PENDING_BRANCH_ADMIN_REVIEW") {
    return {
      ok: false,
      error: `Application is in state ${app.status}. Only PENDING_BRANCH_ADMIN_REVIEW can be forwarded.`,
    };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      status: "PENDING_CHAIRMAN",
      branch_admin_review_at: now,
      branch_admin_review_by_id: auth.userId,
    } as never)
    .eq("id", applicationId);
  if (updateErr) return { ok: false, error: "Couldn't forward — try again in a minute." };

  await writeAuditLog({
    action: "ADMIN_REVIEWED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "ADMIN_REVIEWED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
  });

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath(`/branch/inbox`);
  return { ok: true };
}
