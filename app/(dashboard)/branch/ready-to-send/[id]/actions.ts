"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/send";
import {
  completionEmailHtml,
  completionEmailSubject,
  completionEmailText,
} from "@/lib/email/templates/completion";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import { renderApplicationPdf } from "@/lib/pdf/render-application";

const sendSchema = z.object({
  applicationId: z.string().uuid(),
  sendToHq: z.boolean(),
  sendToSelf: z.boolean(),
  customRecipients: z.array(z.string().email()).max(10),
});

export interface SendResult {
  ok: boolean;
  error?: string;
}

/**
 * Generate the filled MF_V1.0 PDF, persist it to the `generated-pdfs`
 * bucket, email a presigned URL to the chosen recipients, transition the
 * application to SENT_TO_HQ, and record the canonical event + audit.
 *
 * PRD §6 feature 19 — triggered ONLY here, never on Chairman sign.
 * Form Ownership Map invariant: HQ regions are blank on the rendered PDF.
 */
export async function sendApplicationToHqAction(
  input: z.input<typeof sendSchema>,
): Promise<SendResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };
  const { applicationId, sendToHq, sendToSelf, customRecipients } = parsed.data;

  // 1. Auth
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

  // 2. Status gate. The shared renderer also verifies branch + photo.
  const { data: stateRow } = await admin
    .from("applications" as never)
    .select("status")
    .eq("id", applicationId)
    .single();
  const stateApp = stateRow as { status: string } | null;
  if (!stateApp) return { ok: false, error: "Application not found." };
  if (stateApp.status !== "READY_TO_SEND") {
    return {
      ok: false,
      error: `Application is in state ${stateApp.status}. Only READY_TO_SEND can be sent.`,
    };
  }

  // 3. Build recipients
  const recipients: string[] = [];
  if (sendToHq) {
    if (!auth.branch.hq_email) {
      return {
        ok: false,
        error: "HQ email not configured. Either uncheck Send to HQ or set it in Branch Settings.",
      };
    }
    recipients.push(auth.branch.hq_email);
  }
  if (sendToSelf && auth.email) recipients.push(auth.email);
  for (const r of customRecipients) recipients.push(r);
  const uniqueRecipients = Array.from(new Set(recipients));
  if (uniqueRecipients.length === 0) {
    return { ok: false, error: "Pick at least one recipient." };
  }

  // 4 + 5. Load + render via the shared helper.
  const render = await renderApplicationPdf(applicationId, auth.branch.id, auth.branch.name);
  if (!render.ok) return { ok: false, error: render.error };
  const { pdfBytes, applicantDisplayName } = render;

  // We also need the chairman name for the completion email.
  const { data: chairRow } = await admin
    .from("applications" as never)
    .select("chairman_name_on_form")
    .eq("id", applicationId)
    .single();
  const chairmanName =
    (chairRow as { chairman_name_on_form: string | null } | null)?.chairman_name_on_form ??
    "Branch Chairman";

  // 6. Upload to generated-pdfs bucket + presigned URL.
  const pdfPath = `${applicationId}/membership.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("generated-pdfs")
    .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (uploadErr) {
    return { ok: false, error: "Couldn't save the generated PDF." };
  }

  const settings = await getEffectiveSettings(auth.branch.id);
  const ttlSeconds = settings.pdfPresignedUrlTtlDays * 24 * 60 * 60;
  const { data: signed } = await admin.storage
    .from("generated-pdfs")
    .createSignedUrl(pdfPath, ttlSeconds);
  const pdfUrl = signed?.signedUrl;
  if (!pdfUrl) {
    return { ok: false, error: "Couldn't create the PDF download URL." };
  }

  // 7. Record generated_pdfs row.
  const now = new Date().toISOString();
  await admin.from("generated_pdfs" as never).upsert(
    {
      application_id: applicationId,
      branch_id: auth.branch.id,
      pdf_url: pdfPath,
      emailed_to_hq_at: now,
      generated_at: now,
    } as never,
    { onConflict: "application_id" },
  );

  // 8. Email recipients.
  const emailVars = {
    applicantName: applicantDisplayName,
    branchName: auth.branch.name,
    chairmanName,
    submittedAt: now,
    pdfUrl,
    pdfTtlDays: settings.pdfPresignedUrlTtlDays,
  };
  const emailResult = await sendEmail({
    to: uniqueRecipients,
    subject: completionEmailSubject(applicantDisplayName),
    html: completionEmailHtml(emailVars),
    text: completionEmailText(emailVars),
    fromDisplayName: auth.branch.email_from_display_name,
  });
  if (!emailResult.ok) {
    console.warn("Completion email failed:", emailResult.error);
  }

  // 9. Transition state + record pdf_recipients.
  await admin
    .from("applications" as never)
    .update({
      status: "SENT_TO_HQ",
      sent_to_hq_at: now,
      sent_by_id: auth.userId,
      pdf_recipients: {
        hq: sendToHq,
        self: sendToSelf,
        custom: customRecipients,
        resolved: uniqueRecipients,
      },
      hq_pdf_url: pdfPath,
    } as never)
    .eq("id", applicationId);

  // 10. Audit + events.
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "SENT_TO_HQ",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { recipients_count: uniqueRecipients.length, email_ok: emailResult.ok },
  });
  await writeAuditLog({
    action: "SENT_TO_HQ",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      recipients: uniqueRecipients,
      pdf_path: pdfPath,
      email_ok: emailResult.ok,
      email_error: emailResult.ok ? undefined : emailResult.error,
    },
  });

  revalidatePath("/branch/ready-to-send");
  revalidatePath(`/branch/applications/${applicationId}`);
  // READY_TO_SEND → SENT_TO_HQ — also surfaces on /branch/inbox (still in
  // the active pipeline) and /branch/journey (kanban column change).
  revalidatePath("/branch/inbox");
  revalidatePath("/branch/journey");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Preview-before-send + download-after-send
// ─────────────────────────────────────────────────────────────────────

const idSchema = z.object({ applicationId: z.string().uuid() });

export interface PreviewResult {
  ok: boolean;
  /** Base64-encoded PDF bytes — caller decodes + triggers a browser download. */
  pdfBase64?: string;
  filename?: string;
  error?: string;
}

/**
 * Render a draft PDF from current data WITHOUT persisting or transitioning
 * state. Available at any status — earlier states just render with blank
 * fields for anything not yet captured. The renderer still requires the
 * applicant's photo; without it, a clear error surfaces to the caller.
 */
export async function previewPdfAction(
  input: z.input<typeof idSchema>,
): Promise<PreviewResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };
  const { applicationId } = parsed.data;

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
    .select("branch_id")
    .eq("id", applicationId)
    .single();
  const stateRow = row as { branch_id: string } | null;
  if (!stateRow || stateRow.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }

  const render = await renderApplicationPdf(applicationId, auth.branch.id, auth.branch.name);
  if (!render.ok) return { ok: false, error: render.error };

  const pdfBase64 = Buffer.from(render.pdfBytes).toString("base64");
  const filename = `${slugify(render.applicantDisplayName)}-preview.pdf`;
  return { ok: true, pdfBase64, filename };
}

export interface StoredPdfUrlResult {
  ok: boolean;
  url?: string;
  filename?: string;
  error?: string;
}

/**
 * Sign a 1-hour URL for the PDF previously persisted by sendApplicationToHqAction.
 * Available once the application has reached SENT_TO_HQ.
 */
export async function getStoredPdfUrlAction(
  input: z.input<typeof idSchema>,
): Promise<StoredPdfUrlResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };
  const { applicationId } = parsed.data;

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
    .select(
      "branch_id, hq_pdf_url, status, surname, given_names, applicant_name_at_invite",
    )
    .eq("id", applicationId)
    .single();
  const app = row as
    | {
        branch_id: string;
        hq_pdf_url: string | null;
        status: string;
        surname: string | null;
        given_names: string | null;
        applicant_name_at_invite: string | null;
      }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (!app.hq_pdf_url) {
    return {
      ok: false,
      error: "No PDF on file yet — send to HQ first to generate one.",
    };
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("generated-pdfs")
    .createSignedUrl(app.hq_pdf_url, 60 * 60);
  if (signErr || !signed) {
    return { ok: false, error: "Couldn't create the download URL." };
  }

  const displayName =
    (app.given_names && app.surname
      ? `${app.given_names} ${app.surname}`
      : app.applicant_name_at_invite) ?? "applicant";
  const filename = `${slugify(displayName)}-membership.pdf`;
  return { ok: true, url: signed.signedUrl, filename };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "application";
}
