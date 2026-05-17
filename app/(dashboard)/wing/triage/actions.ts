/**
 * Wing triage actions — first-route + archive.
 *
 * Sprint 2 ships ONLY first-route (CAPTURED → ROUTED) and archive
 * (CAPTURED → ARCHIVED). Reroute mechanics + cold-path land in Sprint 3.
 *
 * Branch-side mark-engaged + lead → application conversion live in their
 * own action files (branch/inbox actions). Triage actions stay wing-side.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const routeSchema = z.object({
  leadId: z.string().uuid(),
  targetBranchId: z.string().uuid(),
});

export async function routeLeadAction(
  input: z.input<typeof routeSchema>,
): Promise<ActionResult> {
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };
  const { leadId, targetBranchId } = parsed.data;

  const auth = await requireAuth();
  if (auth.profile.role !== "wing_admin" && auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.branch) return { ok: false, error: "No branch context." };

  const admin = createAdminClient();

  // Confirm the lead is owned by this wing and is in a routable status.
  const { data: leadRow } = await admin
    .from("leads" as never)
    .select("id, wing_branch_id, status, routed_to_branch_id")
    .eq("id", leadId)
    .single();
  const lead = leadRow as
    | { id: string; wing_branch_id: string; status: string; routed_to_branch_id: string | null }
    | null;
  if (!lead) return { ok: false, error: "Lead not found." };

  if (
    auth.profile.role !== "taylab_staff" &&
    lead.wing_branch_id !== auth.branch.id
  ) {
    return { ok: false, error: "This lead doesn't belong to your wing." };
  }
  if (lead.status === "CONVERTED" || lead.status === "ARCHIVED") {
    return { ok: false, error: `Lead is already ${lead.status.toLowerCase()}.` };
  }

  // Confirm the target branch exists and is territorial. The DB trigger
  // also enforces this; the explicit check here lets us surface a clean
  // error rather than the trigger's SQLSTATE bubble-up.
  const { data: branchRow } = await admin
    .from("branches" as never)
    .select("id, branch_type, is_active")
    .eq("id", targetBranchId)
    .single();
  const branch = branchRow as
    | { id: string; branch_type: string; is_active: boolean }
    | null;
  if (!branch) return { ok: false, error: "Target branch not found." };
  if (branch.branch_type !== "territorial") {
    return { ok: false, error: "Leads can only be routed to a territorial branch." };
  }
  if (!branch.is_active) {
    return { ok: false, error: "Target branch is inactive." };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("leads" as never)
    .update({
      routed_to_branch_id: targetBranchId,
      routed_at: now,
      routed_by_user_id: auth.userId,
      status: "ROUTED",
    } as never)
    .eq("id", leadId);
  if (updErr) return { ok: false, error: updErr.message };

  // Write the initial-route history row (Sprint 5). reason='initial_route'
  // pairs with from_branch_id=NULL — the trigger enforces this invariant.
  await admin.from("lead_route_history" as never).insert({
    lead_id: leadId,
    wing_branch_id: lead.wing_branch_id,
    from_branch_id: null,
    to_branch_id: targetBranchId,
    reason: "initial_route",
    routed_by_user_id: auth.userId,
    routed_at: now,
  } as never);

  await writeAuditLog({
    action: "LEAD_ROUTED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      lead_id: leadId,
      target_branch_id: targetBranchId,
      previous_status: lead.status,
      is_reroute: false,
    },
  });

  revalidatePath("/wing/triage");
  revalidatePath("/branch/inbox");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Reroute (Sprint 5) — wing admin moves a lead from one territorial branch
// to another. Increments leads.reroute_count and writes a history entry
// with a required reason. The previous branch's inbox loses the row;
// the new branch's inbox gains it.

const REROUTE_REASONS = [
  "no_engagement",
  "branch_declined",
  "applicant_request",
  "wing_judgment",
  "other",
] as const;

const rerouteSchema = z.object({
  leadId: z.string().uuid(),
  targetBranchId: z.string().uuid(),
  reason: z.enum(REROUTE_REASONS),
  reasonNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function rerouteLeadAction(
  input: z.input<typeof rerouteSchema>,
): Promise<ActionResult> {
  const parsed = rerouteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { leadId, targetBranchId, reason, reasonNote } = parsed.data;

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch) return { ok: false, error: "No branch context." };

  const admin = createAdminClient();

  const { data: leadRow } = await admin
    .from("leads" as never)
    .select("id, wing_branch_id, status, routed_to_branch_id, reroute_count")
    .eq("id", leadId)
    .single();
  const lead = leadRow as
    | {
        id: string;
        wing_branch_id: string;
        status: string;
        routed_to_branch_id: string | null;
        reroute_count: number;
      }
    | null;
  if (!lead) return { ok: false, error: "Lead not found." };

  if (
    auth.activeProfile.role !== "taylab_staff" &&
    lead.wing_branch_id !== auth.activeBranch.id
  ) {
    return { ok: false, error: "This lead doesn't belong to your wing." };
  }
  if (!lead.routed_to_branch_id) {
    return { ok: false, error: "This lead hasn't been routed yet — use Route, not Reroute." };
  }
  if (lead.routed_to_branch_id === targetBranchId) {
    return { ok: false, error: "Already routed to that branch." };
  }
  if (lead.status === "CONVERTED" || lead.status === "ARCHIVED") {
    return { ok: false, error: `Lead is already ${lead.status.toLowerCase()}.` };
  }

  // Confirm the new target is an active territorial branch.
  const { data: branchRow } = await admin
    .from("branches" as never)
    .select("id, branch_type, is_active")
    .eq("id", targetBranchId)
    .single();
  const branch = branchRow as
    | { id: string; branch_type: string; is_active: boolean }
    | null;
  if (!branch) return { ok: false, error: "Target branch not found." };
  if (branch.branch_type !== "territorial") {
    return { ok: false, error: "Leads can only be routed to a territorial branch." };
  }
  if (!branch.is_active) return { ok: false, error: "Target branch is inactive." };

  const now = new Date().toISOString();
  const previousBranchId = lead.routed_to_branch_id;

  // Reset status to ROUTED (in case it had progressed to ENGAGED on the
  // previous branch — engagement doesn't survive a reroute).
  const { error: updErr } = await admin
    .from("leads" as never)
    .update({
      routed_to_branch_id: targetBranchId,
      routed_at: now,
      routed_by_user_id: auth.userId,
      status: "ROUTED",
      reroute_count: lead.reroute_count + 1,
    } as never)
    .eq("id", leadId);
  if (updErr) return { ok: false, error: updErr.message };

  // History row — captures both ends + the reason.
  const { error: histErr } = await admin
    .from("lead_route_history" as never)
    .insert({
      lead_id: leadId,
      wing_branch_id: lead.wing_branch_id,
      from_branch_id: previousBranchId,
      to_branch_id: targetBranchId,
      reason,
      reason_note: reasonNote && reasonNote.length > 0 ? reasonNote : null,
      routed_by_user_id: auth.userId,
      routed_at: now,
    } as never);
  if (histErr) {
    // History is for audit, not core flow. Log + continue — we don't want
    // a missing history row to abort an otherwise-correct reroute.
    console.error("[rerouteLeadAction] history insert failed:", histErr.message);
  }

  await writeAuditLog({
    action: "LEAD_ROUTED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      lead_id: leadId,
      target_branch_id: targetBranchId,
      previous_branch_id: previousBranchId,
      reason,
      is_reroute: true,
      new_reroute_count: lead.reroute_count + 1,
    },
  });

  revalidatePath("/wing/triage");
  revalidatePath("/branch/inbox");
  return { ok: true };
}

const archiveSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(2, "Reason is too short").max(200),
});

export async function archiveLeadAction(
  input: z.input<typeof archiveSchema>,
): Promise<ActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }

  const auth = await requireAuth();
  if (auth.profile.role !== "wing_admin" && auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.branch) return { ok: false, error: "No branch context." };

  const admin = createAdminClient();

  const { data: leadRow } = await admin
    .from("leads" as never)
    .select("id, wing_branch_id, status")
    .eq("id", parsed.data.leadId)
    .single();
  const lead = leadRow as
    | { id: string; wing_branch_id: string; status: string }
    | null;
  if (!lead) return { ok: false, error: "Lead not found." };
  if (
    auth.profile.role !== "taylab_staff" &&
    lead.wing_branch_id !== auth.branch.id
  ) {
    return { ok: false, error: "This lead doesn't belong to your wing." };
  }
  if (lead.status === "CONVERTED") {
    return { ok: false, error: "Converted leads can't be archived." };
  }

  const { error: updErr } = await admin
    .from("leads" as never)
    .update({
      status: "ARCHIVED",
      archived_at: new Date().toISOString(),
      archived_by_user_id: auth.userId,
      archive_reason: parsed.data.reason,
    } as never)
    .eq("id", parsed.data.leadId);
  if (updErr) return { ok: false, error: updErr.message };

  await writeAuditLog({
    action: "LEAD_ARCHIVED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      lead_id: parsed.data.leadId,
      reason: parsed.data.reason,
      previous_status: lead.status,
    },
  });

  revalidatePath("/wing/triage");
  return { ok: true };
}
