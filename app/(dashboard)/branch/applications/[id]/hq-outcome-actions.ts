/**
 * HQ outcome recording (Step 9) — Branch Admin Team records what HQ replied
 * after we emailed the PDF.
 *
 *   SENT_TO_HQ → COMPLETED  (record approval: date, membership no, optional notes)
 *   SENT_TO_HQ → HQ_REJECTED (record rejection: date, reason, optional details)
 *
 * `reverseHqOutcomeAction` un-does either terminal state back to SENT_TO_HQ
 * with a mandatory reason — covers the "wrong outcome typed in" case
 * called out in PRD §6 feature 21.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";
import { HQ_REJECTION_REASONS } from "@/lib/validation/hq-outcome";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const approveSchema = z.object({
  applicationId: z.string().uuid(),
  outcome: z.literal("approved"),
  approvedDate: z.string().regex(ISO_DATE, "Use YYYY-MM-DD"),
  membershipNo: z.string().trim().min(1, "Membership number is required").max(40),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

const rejectSchema = z.object({
  applicationId: z.string().uuid(),
  outcome: z.literal("rejected"),
  rejectedDate: z.string().regex(ISO_DATE, "Use YYYY-MM-DD"),
  reason: z.enum(HQ_REJECTION_REASONS),
  reasonDetails: z.string().trim().max(500).optional().or(z.literal("")),
});

const recordSchema = z.discriminatedUnion("outcome", [approveSchema, rejectSchema]);

export type RecordHqOutcomeInput = z.input<typeof recordSchema>;

export interface RecordOutcomeResult {
  ok: boolean;
  error?: string;
}

export async function recordHqOutcomeAction(
  input: RecordHqOutcomeInput,
): Promise<RecordOutcomeResult> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }

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

  const { data: row } = await admin
    .from("applications" as never)
    .select("id, branch_id, status")
    .eq("id", applicationId)
    .single();
  const app = row as { id: string; branch_id: string; status: string } | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "SENT_TO_HQ") {
    return {
      ok: false,
      error: `Application is in state ${app.status}. Only SENT_TO_HQ can have an outcome recorded.`,
    };
  }

  const now = new Date().toISOString();

  if (parsed.data.outcome === "approved") {
    const { approvedDate, membershipNo, notes } = parsed.data;
    const { error: updateErr } = await admin
      .from("applications" as never)
      .update({
        status: "COMPLETED",
        hq_outcome_recorded_at: now,
        hq_outcome_recorded_by_id: auth.userId,
        hq_approved_date: approvedDate,
        hq_approved_membership_no: membershipNo,
        hq_approved_notes: notes && notes.length > 0 ? notes : null,
        completed_at: now,
      } as never)
      .eq("id", applicationId);
    if (updateErr) {
      return { ok: false, error: "Couldn't save the outcome — try again in a minute." };
    }
    await writeAuditLog({
      action: "HQ_OUTCOME_RECORDED_APPROVED",
      applicationId,
      branchId: auth.branch.id,
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.profile.role,
      metadata: { approved_date: approvedDate, membership_no: membershipNo },
    });
    await writeApplicationEvent({
      applicationId,
      branchId: auth.branch.id,
      eventType: "HQ_OUTCOME_RECORDED_APPROVED",
      actorId: auth.userId,
      actorRole: auth.profile.role,
      metadata: { approved_date: approvedDate, membership_no: membershipNo },
    });
  } else {
    const { rejectedDate, reason, reasonDetails } = parsed.data;
    const { error: updateErr } = await admin
      .from("applications" as never)
      .update({
        status: "HQ_REJECTED",
        hq_outcome_recorded_at: now,
        hq_outcome_recorded_by_id: auth.userId,
        hq_rejected_date: rejectedDate,
        hq_rejected_reason: reason,
        hq_rejected_reason_details:
          reasonDetails && reasonDetails.length > 0 ? reasonDetails : null,
      } as never)
      .eq("id", applicationId);
    if (updateErr) {
      return { ok: false, error: "Couldn't save the outcome — try again in a minute." };
    }
    await writeAuditLog({
      action: "HQ_OUTCOME_RECORDED_REJECTED",
      applicationId,
      branchId: auth.branch.id,
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.profile.role,
      metadata: { rejected_date: rejectedDate, reason },
    });
    await writeApplicationEvent({
      applicationId,
      branchId: auth.branch.id,
      eventType: "HQ_OUTCOME_RECORDED_REJECTED",
      actorId: auth.userId,
      actorRole: auth.profile.role,
      metadata: { rejected_date: rejectedDate, reason },
    });
  }

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath("/branch/inbox");
  revalidatePath("/branch/history");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────

const reverseSchema = z.object({
  applicationId: z.string().uuid(),
  reason: z.string().trim().min(3, "Tell us why").max(500),
});

export type ReverseHqOutcomeInput = z.input<typeof reverseSchema>;

export async function reverseHqOutcomeAction(
  input: ReverseHqOutcomeInput,
): Promise<RecordOutcomeResult> {
  const parsed = reverseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }

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
  const { applicationId, reason } = parsed.data;

  const { data: row } = await admin
    .from("applications" as never)
    .select("id, branch_id, status")
    .eq("id", applicationId)
    .single();
  const app = row as { id: string; branch_id: string; status: string } | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "COMPLETED" && app.status !== "HQ_REJECTED") {
    return {
      ok: false,
      error: `Application is in state ${app.status}. Only COMPLETED or HQ_REJECTED can be reversed.`,
    };
  }

  const now = new Date().toISOString();
  const previousStatus = app.status;
  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      status: "SENT_TO_HQ",
      hq_outcome_reversed_at: now,
      hq_outcome_reversed_by_id: auth.userId,
      hq_outcome_reversal_reason: reason,
      // Clear the previously-recorded outcome so the form re-prompts cleanly.
      hq_outcome_recorded_at: null,
      hq_outcome_recorded_by_id: null,
      hq_approved_date: null,
      hq_approved_membership_no: null,
      hq_approved_notes: null,
      hq_rejected_date: null,
      hq_rejected_reason: null,
      hq_rejected_reason_details: null,
      completed_at: null,
    } as never)
    .eq("id", applicationId);
  if (updateErr) {
    return { ok: false, error: "Couldn't reverse the outcome — try again in a minute." };
  }

  await writeAuditLog({
    action: "HQ_OUTCOME_REVERSED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { previous_status: previousStatus, reason },
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "HQ_OUTCOME_REVERSED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { previous_status: previousStatus, reason },
  });

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath("/branch/inbox");
  revalidatePath("/branch/history");
  return { ok: true };
}
