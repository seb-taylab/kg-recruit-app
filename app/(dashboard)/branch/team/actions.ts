/**
 * Team management (Step 12) — invite, deactivate / reactivate, change role,
 * trigger password reset. Tenant-scoped: master/admin can only act on
 * profiles within their own branch.
 *
 * Permission summary:
 *   master_admin → all operations, all roles (incl. promoting to master,
 *                  which auto-demotes the current master to admin)
 *   admin        → invite team_member, deactivate/reactivate team_member +
 *                  chairman, trigger password reset for non-master users.
 *                  Cannot change roles.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";
import { writeAuditLog } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Roles a master_admin can invite. We never invite directly to master_admin —
// that's via promotion-only (which auto-demotes the current master).
const INVITABLE_ROLES = [
  "branch_admin",
  "branch_team_member",
  "branch_chairman",
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const inviteSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  fullName: z.string().trim().min(2, "Full name is too short").max(100),
  role: z.enum(INVITABLE_ROLES),
  position: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function inviteUserAction(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { email, fullName, role, position } = parsed.data;

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch) return { ok: false, error: "Branch admin team only." };

  // Permission check: master can invite any non-master role.
  // Admin can only invite team_member (cannot create peers/chairmen).
  if (auth.profile.role === "branch_master_admin") {
    // ok
  } else if (auth.profile.role === "branch_admin") {
    if (role !== "branch_team_member") {
      return {
        ok: false,
        error: "Only the Master Admin can invite Admins or Chairmen.",
      };
    }
  } else {
    return { ok: false, error: "Branch admin team only." };
  }

  const admin = createAdminClient();

  // Multi-profile model: an existing auth user CAN be invited as a team
  // member of THIS branch — they just get a new profile row in this branch.
  // Pre-multi-profile this was rejected outright.
  const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = existingList?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  let targetUserId: string;
  let sentInvite = false;

  if (existingUser) {
    targetUserId = existingUser.id;

    // Guard: do they ALREADY have an active profile for this branch?
    // The partial unique index would reject too, but a friendly error is
    // better than the SQL bubble-up.
    const { data: existingProfile } = await admin
      .from("profiles" as never)
      .select("id, role")
      .eq("user_id", targetUserId)
      .eq("branch_id", auth.branch.id)
      .eq("is_active", true)
      .maybeSingle();
    if (existingProfile) {
      const cur = existingProfile as { id: string; role: string };
      return {
        ok: false,
        error: `That account is already a ${cur.role.replace(/_/g, " ")} of this branch.`,
      };
    }
  } else {
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });
    if (inviteErr || !invite?.user) {
      return { ok: false, error: inviteErr?.message ?? "Couldn't send the invite." };
    }
    targetUserId = invite.user.id;
    sentInvite = true;
  }

  // Insert profile — gen_random_uuid() default supplies id; only user_id +
  // role + branch + metadata needed.
  const { error: profErr } = await admin.from("profiles" as never).insert({
    user_id: targetUserId,
    full_name: fullName,
    role,
    branch_id: auth.branch.id,
    position: position && position.length > 0 ? position : null,
    is_active: true,
    created_by_id: auth.userId,
  } as never);
  if (profErr) {
    // Only delete the auth user if WE created it just now. Don't strand
    // existing users.
    if (sentInvite) {
      await admin.auth.admin.deleteUser(targetUserId).catch(() => undefined);
    }
    return { ok: false, error: "Couldn't save the profile." };
  }

  await writeAuditLog({
    action: "USER_INVITED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      invited_email: email,
      invited_role: role,
      invited_name: fullName,
      existing_user_added: !sentInvite,
    },
  });

  revalidatePath("/branch/team");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Deactivate / Reactivate

const idSchema = z.object({ profileId: z.string().uuid() });

async function loadTargetProfile(profileId: string, branchId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("profiles" as never)
    .select("id, branch_id, role, is_active, full_name")
    .eq("id", profileId)
    .single();
  return row as
    | { id: string; branch_id: string; role: UserRole; is_active: boolean; full_name: string | null }
    | null;
}

function canManageTarget(
  callerRole: UserRole,
  targetRole: UserRole,
  callerId: string,
  targetId: string,
): string | null {
  if (callerId === targetId) {
    return "You can't act on your own account here.";
  }
  if (callerRole === "branch_master_admin") return null;
  if (callerRole === "branch_admin") {
    if (targetRole === "branch_master_admin" || targetRole === "branch_admin") {
      return "Only the Master Admin can act on other admins.";
    }
    return null;
  }
  return "Branch admin team only.";
}

export async function deactivateUserAction(
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
  if (!auth.branch) return { ok: false, error: "Branch admin team only." };

  const target = await loadTargetProfile(parsed.data.profileId, auth.branch.id);
  if (!target || target.branch_id !== auth.branch.id) {
    return { ok: false, error: "Profile not found." };
  }
  const denied = canManageTarget(auth.profile.role, target.role, auth.userId, target.id);
  if (denied) return { ok: false, error: denied };
  if (!target.is_active) return { ok: false, error: "Already deactivated." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("profiles" as never)
    .update({
      is_active: false,
      deactivated_at: now,
      deactivated_by_id: auth.userId,
    } as never)
    .eq("id", target.id);
  if (updErr) {
    return { ok: false, error: "Couldn't deactivate — try again in a minute." };
  }

  await writeAuditLog({
    action: "USER_DEACTIVATED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { target_id: target.id, target_role: target.role, target_name: target.full_name },
  });

  revalidatePath("/branch/team");
  return { ok: true };
}

export async function reactivateUserAction(
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
  if (!auth.branch) return { ok: false, error: "Branch admin team only." };

  const target = await loadTargetProfile(parsed.data.profileId, auth.branch.id);
  if (!target || target.branch_id !== auth.branch.id) {
    return { ok: false, error: "Profile not found." };
  }
  const denied = canManageTarget(auth.profile.role, target.role, auth.userId, target.id);
  if (denied) return { ok: false, error: denied };
  if (target.is_active) return { ok: false, error: "Already active." };

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("profiles" as never)
    .update({
      is_active: true,
      deactivated_at: null,
      deactivated_by_id: null,
    } as never)
    .eq("id", target.id);
  if (updErr) {
    return { ok: false, error: "Couldn't reactivate — try again in a minute." };
  }

  await writeAuditLog({
    action: "USER_REACTIVATED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { target_id: target.id, target_role: target.role },
  });

  revalidatePath("/branch/team");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Change role (master_admin only; promoting to master auto-demotes caller)

const CHANGEABLE_ROLES = [
  "branch_master_admin",
  "branch_admin",
  "branch_team_member",
  "branch_chairman",
] as const;

const changeRoleSchema = z.object({
  profileId: z.string().uuid(),
  newRole: z.enum(CHANGEABLE_ROLES),
});

export async function changeUserRoleAction(
  input: z.input<typeof changeRoleSchema>,
): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };
  const { profileId, newRole } = parsed.data;

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch) return { ok: false, error: "Branch admin team only." };
  if (auth.profile.role !== "branch_master_admin") {
    return { ok: false, error: "Only the Master Admin can change roles." };
  }
  if (profileId === auth.userId) {
    return {
      ok: false,
      error: "Promote someone else to Master Admin first — your role flips automatically.",
    };
  }

  const target = await loadTargetProfile(profileId, auth.branch.id);
  if (!target || target.branch_id !== auth.branch.id) {
    return { ok: false, error: "Profile not found." };
  }
  if (target.role === newRole) {
    return { ok: false, error: "Already in that role." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Promoting to master_admin: demote current master in the same call so
  // we never have zero or two masters at any visible moment.
  if (newRole === "branch_master_admin") {
    const { error: demoteErr } = await admin
      .from("profiles" as never)
      .update({
        role: "branch_admin",
      } as never)
      .eq("id", auth.userId);
    if (demoteErr) {
      return { ok: false, error: "Couldn't swap Master Admin — try again." };
    }
  }

  const { error: updErr } = await admin
    .from("profiles" as never)
    .update({
      role: newRole,
      promoted_at: now,
      promoted_by_id: auth.userId,
    } as never)
    .eq("id", target.id);
  if (updErr) {
    return { ok: false, error: "Couldn't change role — try again in a minute." };
  }

  await writeAuditLog({
    action: newRole === "branch_master_admin" ? "USER_PROMOTED" : "USER_DEMOTED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      target_id: target.id,
      from_role: target.role,
      to_role: newRole,
      master_handover: newRole === "branch_master_admin",
    },
  });

  revalidatePath("/branch/team");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Change email
// Only the Master Admin can do this (it's identity, not just access).
// The Supabase Auth `users.email` row is updated directly with
// `email_confirm: true` so we don't punt a confirmation email at the
// target user — the Master Admin is acting on their behalf.

const changeEmailSchema = z.object({
  profileId: z.string().uuid(),
  newEmail: z.string().trim().email("Invalid email").max(120),
});

export async function changeUserEmailAction(
  input: z.input<typeof changeEmailSchema>,
): Promise<ActionResult> {
  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { profileId, newEmail } = parsed.data;

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch) return { ok: false, error: "Branch admin team only." };
  if (auth.profile.role !== "branch_master_admin") {
    return { ok: false, error: "Only the Master Admin can change email addresses." };
  }
  if (profileId === auth.userId) {
    return {
      ok: false,
      error: "Use your account settings to change your own email — not the Team tab.",
    };
  }

  const target = await loadTargetProfile(profileId, auth.branch.id);
  if (!target || target.branch_id !== auth.branch.id) {
    return { ok: false, error: "Profile not found." };
  }

  const admin = createAdminClient();

  // Read the existing email so the audit log has before/after.
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(target.id);
  if (getErr || !existing?.user) {
    return { ok: false, error: "Couldn't load the target user." };
  }
  const oldEmail = existing.user.email ?? null;
  if (oldEmail?.toLowerCase() === newEmail.toLowerCase()) {
    return { ok: false, error: "That's already their email." };
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(target.id, {
    email: newEmail,
    email_confirm: true,
  });
  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  await writeAuditLog({
    // Reuse the closest existing action verb. Schema-wise this is more
    // accurately "EMAIL_CHANGED" but adding a new verb requires touching
    // the audit enum + downstream filters — defer.
    action: "USER_INVITED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      subaction: "email_changed",
      target_id: target.id,
      target_role: target.role,
      target_name: target.full_name,
      from_email: oldEmail,
      to_email: newEmail,
    },
  });

  revalidatePath("/branch/team");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Trigger password reset

const pwResetSchema = z.object({ profileId: z.string().uuid() });

export async function triggerPasswordResetAction(
  input: z.input<typeof pwResetSchema>,
): Promise<ActionResult> {
  const parsed = pwResetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (!auth.branch) return { ok: false, error: "Branch admin team only." };

  const target = await loadTargetProfile(parsed.data.profileId, auth.branch.id);
  if (!target || target.branch_id !== auth.branch.id) {
    return { ok: false, error: "Profile not found." };
  }
  const denied = canManageTarget(auth.profile.role, target.role, auth.userId, target.id);
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data: authRow, error: getErr } = await admin.auth.admin.getUserById(target.id);
  if (getErr || !authRow?.user?.email) {
    return { ok: false, error: "Couldn't find an email for this user." };
  }

  const { error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: authRow.user.email,
  });
  if (linkErr) {
    return { ok: false, error: linkErr.message };
  }

  await writeAuditLog({
    action: "PASSWORD_RESET_TRIGGERED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { target_id: target.id, target_email: authRow.user.email },
  });

  return { ok: true };
}
