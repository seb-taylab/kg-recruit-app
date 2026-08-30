/**
 * Manual chairman reminder — ad-hoc nudge when the standard auto-nudge
 * interval is too slow (busy chairman, lost in inbox, etc.).
 *
 *   sendChairmanReminderAction — emails the branch's active chairman with
 *     a direct deep-link to /branch/sign/[id]. Audited as NUDGE_SENT with
 *     trigger='manual'. Status must be PENDING_CHAIRMAN.
 *
 * The copy-link path is purely client-side (navigator.clipboard) — no
 * server action needed there.
 */
"use server";

import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/send";
import { mintChairmanSignToken } from "@/lib/auth/chairman-link";
import { buildChairmanSignMessage, buildWhatsAppShareUrl } from "@/lib/invite/whatsapp";
import {
  chairmanReminderHtml,
  chairmanReminderSubject,
  chairmanReminderText,
} from "@/lib/email/templates/chairman-reminder";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  applicationId: z.string().uuid(),
});

const mintSchema = z.object({
  applicationId: z.string().uuid(),
  channel: z.enum(["copy_link", "whatsapp"]),
});

export interface MintLinkResult {
  ok: boolean;
  error?: string;
  /** The passwordless chairman sign URL. */
  url?: string;
  /** wa.me deep link (phone-less — sender picks the chairman contact). */
  waUrl?: string;
}

/**
 * Mint a fresh passwordless chairman sign link and log the share. Powers the
 * "Nudge the Chairman" card's Copy link / Share to WhatsApp buttons — the
 * chairman signs without logging in. Returns the raw URL (+ a WhatsApp deep
 * link) to the authenticated admin who will forward it.
 */
export async function mintChairmanSignLinkAction(
  input: z.input<typeof mintSchema>,
): Promise<MintLinkResult> {
  const parsed = mintSchema.safeParse(input);
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
  const { applicationId, channel } = parsed.data;

  const { data: appRow } = await admin
    .from("applications" as never)
    .select("id, branch_id, status, applicant_name_at_invite, surname, given_names")
    .eq("id", applicationId)
    .single();
  const app = appRow as
    | {
        id: string;
        branch_id: string;
        status: string;
        applicant_name_at_invite: string | null;
        surname: string | null;
        given_names: string | null;
      }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "PENDING_CHAIRMAN") {
    return {
      ok: false,
      error: `Application is in state ${app.status}. A sign link only works when it's PENDING_CHAIRMAN.`,
    };
  }

  const minted = await mintChairmanSignToken(applicationId, auth.branch.id, auth.userId);
  if (!minted) return { ok: false, error: "Couldn't create the sign link — try again." };

  // Log the share against the freshly-minted link.
  await admin.from("link_deliveries" as never).insert({
    magic_link_id: minted.magicLinkId,
    channel,
    delivered_by_id: auth.userId,
    metadata: { role: "chairman" },
  } as never);

  const applicantName =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "an applicant";
  const waMessage = buildChairmanSignMessage({
    applicantName,
    branchName: auth.branch.name,
    adminName: auth.profile.full_name ?? "your Branch Admin",
    link: minted.url,
  });

  return { ok: true, url: minted.url, waUrl: buildWhatsAppShareUrl(waMessage) };
}

export async function sendChairmanReminderAction(
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
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
  const { applicationId } = parsed.data;

  // 1. App must be in chairman-signing state.
  const { data: appRow } = await admin
    .from("applications" as never)
    .select("id, branch_id, status, applicant_name_at_invite, surname, given_names")
    .eq("id", applicationId)
    .single();
  const app = appRow as
    | {
        id: string;
        branch_id: string;
        status: string;
        applicant_name_at_invite: string | null;
        surname: string | null;
        given_names: string | null;
      }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "PENDING_CHAIRMAN") {
    return {
      ok: false,
      error: `Application is in state ${app.status}. Reminder only makes sense when it's PENDING_CHAIRMAN.`,
    };
  }

  // 2. Resolve the branch's active chairman email.
  const { data: chairProfile } = await admin
    .from("profiles" as never)
    .select("id")
    .eq("branch_id", auth.branch.id)
    .eq("role", "branch_chairman")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const chair = chairProfile as { id: string } | null;
  if (!chair) {
    return {
      ok: false,
      error: "No active Branch Chairman on this branch. Invite one from the Team tab first.",
    };
  }
  const { data: userRow } = await admin.auth.admin.getUserById(chair.id);
  const chairEmail = userRow?.user?.email;
  if (!chairEmail) {
    return { ok: false, error: "Chairman has no email on their auth record." };
  }

  // 3. Compose the email via the templates module so brand colours stay
  //    in lib/email (and out of validate-tokens' scan path).
  const applicantName =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "an applicant";
  // Send a passwordless sign link so the chairman can sign without logging
  // in — same trust model as the applicant/referral magic links.
  const minted = await mintChairmanSignToken(applicationId, auth.branch.id, auth.userId);
  if (!minted) {
    return { ok: false, error: "Couldn't create the sign link — try again." };
  }
  const vars = {
    applicantName,
    branchName: auth.branch.name,
    adminName: auth.profile.full_name ?? "your Branch Admin",
    link: minted.url,
  };

  const sent = await sendEmail({
    to: chairEmail,
    subject: chairmanReminderSubject(vars),
    text: chairmanReminderText(vars),
    html: chairmanReminderHtml(vars),
    fromDisplayName: auth.branch.email_from_display_name,
  });
  if (!sent.ok) {
    return { ok: false, error: `Couldn't send the email: ${sent.error}` };
  }

  // 4. Log to nudge_sends (trigger='manual') + audit.
  await admin.from("nudge_sends" as never).insert({
    application_id: applicationId,
    branch_id: auth.branch.id,
    stage: "chairman_unsigned",
    recipients: [chairEmail],
    trigger: "manual",
  } as never);
  await writeAuditLog({
    action: "NUDGE_SENT",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { stage: "chairman_unsigned", trigger: "manual", to: chairEmail },
  });

  return { ok: true };
}
