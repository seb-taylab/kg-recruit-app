/**
 * Archive + TTL extender (Step 11).
 *
 *   archiveApplicationAction    — any non-ARCHIVED → ARCHIVED (stores prior state)
 *   unarchiveApplicationAction  — ARCHIVED → previously-stored state
 *   extendMagicLinkTtlAction    — bumps a non-consumed magic link's expires_at,
 *                                 preserves history, audits
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBranchAdminTeam } from "@/types/database";
import { writeAuditLog, writeApplicationEvent } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Archive

const archiveSchema = z.object({
  applicationId: z.string().uuid(),
  reason: z.string().trim().min(3, "Tell us why").max(500),
});

export async function archiveApplicationAction(
  input: z.input<typeof archiveSchema>,
): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input);
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
  if (app.status === "ARCHIVED") {
    return { ok: false, error: "Already archived." };
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      status: "ARCHIVED",
      pre_archive_status: app.status,
      archived_at: now,
      archived_by_id: auth.userId,
      archive_reason: reason,
    } as never)
    .eq("id", applicationId);
  if (updateErr) {
    return { ok: false, error: "Couldn't archive — try again in a minute." };
  }

  await writeAuditLog({
    action: "ARCHIVED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { from_status: app.status, reason },
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "ARCHIVED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { from_status: app.status, reason },
  });

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath("/branch/history");
  // Journey is the kanban + table over every non-archived row; archiving
  // hides this app from it. Without a refresh, the row lingers visually.
  revalidatePath("/branch/journey");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Unarchive

const idSchema = z.object({ applicationId: z.string().uuid() });

export async function unarchiveApplicationAction(
  input: z.input<typeof idSchema>,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
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

  const { data: row } = await admin
    .from("applications" as never)
    .select("id, branch_id, status, pre_archive_status")
    .eq("id", applicationId)
    .single();
  const app = row as
    | { id: string; branch_id: string; status: string; pre_archive_status: string | null }
    | null;
  if (!app || app.branch_id !== auth.branch.id) {
    return { ok: false, error: "Application not found." };
  }
  if (app.status !== "ARCHIVED") {
    return { ok: false, error: `Application is in state ${app.status}, not ARCHIVED.` };
  }
  // Fallback to REJECTED if the pre-archive state wasn't captured (legacy rows).
  const restoreTo = app.pre_archive_status ?? "REJECTED";

  const { error: updateErr } = await admin
    .from("applications" as never)
    .update({
      status: restoreTo,
      pre_archive_status: null,
      archived_at: null,
      archived_by_id: null,
      archive_reason: null,
    } as never)
    .eq("id", applicationId);
  if (updateErr) {
    return { ok: false, error: "Couldn't unarchive — try again in a minute." };
  }

  await writeAuditLog({
    action: "UNARCHIVED",
    applicationId,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { restored_to: restoreTo },
  });
  await writeApplicationEvent({
    applicationId,
    branchId: auth.branch.id,
    eventType: "UNARCHIVED",
    actorId: auth.userId,
    actorRole: auth.profile.role,
    metadata: { restored_to: restoreTo },
  });

  revalidatePath(`/branch/applications/${applicationId}`);
  revalidatePath("/branch/history");
  // Unarchive restores a row that's been hidden from /branch/journey.
  revalidatePath("/branch/journey");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// TTL extender

const EXTEND_OPTIONS = [3, 7, 14] as const;
export type ExtendDays = (typeof EXTEND_OPTIONS)[number];

const extendSchema = z.object({
  magicLinkId: z.string().uuid(),
  daysToAdd: z.number().int().refine((d) => (EXTEND_OPTIONS as readonly number[]).includes(d), {
    message: "Pick 3, 7 or 14 days.",
  }),
});

export async function extendMagicLinkTtlAction(
  input: z.input<typeof extendSchema>,
): Promise<ActionResult> {
  const parsed = extendSchema.safeParse(input);
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
  const { magicLinkId, daysToAdd } = parsed.data;

  const { data: row } = await admin
    .from("magic_links" as never)
    .select("id, branch_id, application_id, expires_at, consumed_at, expires_at_history")
    .eq("id", magicLinkId)
    .single();
  const link = row as
    | {
        id: string;
        branch_id: string;
        application_id: string;
        expires_at: string;
        consumed_at: string | null;
        expires_at_history: Array<Record<string, unknown>> | null;
      }
    | null;
  if (!link || link.branch_id !== auth.branch.id) {
    return { ok: false, error: "Link not found." };
  }
  if (link.consumed_at) {
    return { ok: false, error: "Link was already used — mint a new one instead." };
  }

  const now = Date.now();
  const currentExpiry = new Date(link.expires_at).getTime();
  // Start from the later of "now" and current expiry so a long-expired link
  // gets a usable window instead of being extended into the past.
  const base = Math.max(now, currentExpiry);
  const newExpiry = new Date(base + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

  const history = Array.isArray(link.expires_at_history) ? link.expires_at_history : [];
  history.push({
    previous_expires_at: link.expires_at,
    extended_at: new Date(now).toISOString(),
    extended_by_id: auth.userId,
    days_added: daysToAdd,
  });

  const { error: updateErr } = await admin
    .from("magic_links" as never)
    .update({
      expires_at: newExpiry,
      expires_at_history: history,
    } as never)
    .eq("id", magicLinkId);
  if (updateErr) {
    return { ok: false, error: "Couldn't extend — try again in a minute." };
  }

  await writeAuditLog({
    action: "TTL_EXTENDED",
    applicationId: link.application_id,
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      magic_link_id: magicLinkId,
      previous_expires_at: link.expires_at,
      new_expires_at: newExpiry,
      days_added: daysToAdd,
    },
  });

  revalidatePath(`/branch/applications/${link.application_id}`);
  return { ok: true };
}
