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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://kg.taylab.com";
  const link = `${baseUrl}/branch/sign/${applicationId}`;
  const vars = {
    applicantName,
    branchName: auth.branch.name,
    adminName: auth.profile.full_name ?? "your Branch Admin",
    link,
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
