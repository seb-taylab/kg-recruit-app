"use server";

/**
 * Out-of-band "mark as sent" escape hatch for the READY_TO_SEND state.
 *
 * Normal flow is /branch/ready-to-send/[id] → sendApplicationToHqAction,
 * which renders the PDF, stores it, emails it, and transitions the state
 * to SENT_TO_HQ. This action does everything EXCEPT the email — for cases
 * where the admin has already forwarded the PDF some other way (printed,
 * Telegram, hand-delivered) and just wants the system to reflect that.
 *
 * Audited with `metadata: { skipped_email: true, reason }` so it's
 * traceable why no email went out.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { renderApplicationPdf } from "@/lib/pdf/render-application";

const schema = z.object({
  applicationId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export interface MarkSentResult {
  ok: boolean;
  error?: string;
}

export async function markSentWithoutEmailAction(
  input: z.input<typeof schema>,
): Promise<MarkSentResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Tell us briefly why no email is going out (3+ chars)." };
  }
  const { applicationId, reason } = parsed.data;

  // 1. Auth — Branch Admin team only.
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

  // 2. State gate — must currently be READY_TO_SEND.
  const { data: stateRow } = await admin
    .from("applications" as never)
    .select("status, branch_id")
    .eq("id", applicationId)
    .single();
  const stateApp = stateRow as { status: string; branch_id: string } | null;
  if (!stateApp || stateApp.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (stateApp.status !== "READY_TO_SEND") {
    return {
      ok: false,
      error: `Application is in state ${stateApp.status}. Only READY_TO_SEND can be marked as sent.`,
    };
  }

  // 3. Still render + store the PDF — the artefact is what makes the row
  // re-downloadable + previewable later, regardless of how the file was
  // actually delivered.
  const render = await renderApplicationPdf(applicationId, auth.branch.id, auth.branch.name);
  if (!render.ok) return { ok: false, error: render.error };

  const pdfPath = `${applicationId}/membership.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("generated-pdfs")
    .upload(pdfPath, render.pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    return { ok: false, error: "Couldn't save the generated PDF." };
  }

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

  // 4. Transition state — same shape as the email-path action, but with
  // pdf_recipients flagged as out-of-band.
  await admin
    .from("applications" as never)
    .update({
      status: "SENT_TO_HQ",
      sent_to_hq_at: now,
      sent_by_id: auth.userId,
      pdf_recipients: {
        hq: false,
        self: false,
        custom: [],
        resolved: [],
        skipped_email: true,
        reason,
      },
      hq_pdf_url: pdfPath,
    } as never)
    .eq("id", applicationId);

  // 5. Audit + events. Trail explicitly marks the email was skipped on
  // purpose so future reads of the log don't read this as a bug.
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "SENT_TO_HQ",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { recipients_count: 0, email_ok: false, skipped_email: true },
  });
  await writeAuditLog({
    action: "SENT_TO_HQ",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      recipients: [],
      pdf_path: pdfPath,
      email_ok: false,
      skipped_email: true,
      reason,
    },
  });

  revalidatePath("/branch/inbox");
  revalidatePath(`/branch/applications/${applicationId}`);
  return { ok: true };
}
