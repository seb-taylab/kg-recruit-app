/**
 * Wing team management — invite + deactivate + reactivate.
 *
 * Wing roles:
 *   wing_admin    — operational, can invite + manage team
 *   wing_chairman — oversight, read-only on this surface
 *
 * Multi-profile aware: an existing auth user (e.g. a KG branch_admin) can
 * be invited here as a wing role — they get a new profile row in this
 * wing. The login flow surfaces the workspace picker so they pick which
 * workspace to enter.
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

const WING_INVITABLE_ROLES = ["wing_admin", "wing_chairman"] as const;
export type WingInvitableRole = (typeof WING_INVITABLE_ROLES)[number];

const inviteSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  fullName: z.string().trim().min(2, "Full name is too short").max(100),
  role: z.enum(WING_INVITABLE_ROLES),
  position: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function inviteWingMemberAction(
  input: z.input<typeof inviteSchema>,
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { email, fullName, role, position } = parsed.data;

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    return { ok: false, error: "Wing workspace only." };
  }

  const admin = createAdminClient();

  // Multi-profile model — existing user → new profile in this wing.
  const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = existingList?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  let targetUserId: string;
  let sentInvite = false;

  if (existingUser) {
    targetUserId = existingUser.id;
    const { data: existingProfile } = await admin
      .from("profiles" as never)
      .select("id, role")
      .eq("user_id", targetUserId)
      .eq("branch_id", auth.activeBranch.id)
      .eq("is_active", true)
      .maybeSingle();
    if (existingProfile) {
      const cur = existingProfile as { id: string; role: string };
      return {
        ok: false,
        error: `That account is already a ${cur.role.replace(/_/g, " ")} of this wing.`,
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

  const { error: profErr } = await admin.from("profiles" as never).insert({
    user_id: targetUserId,
    full_name: fullName,
    role,
    branch_id: auth.activeBranch.id,
    position: position && position.length > 0 ? position : null,
    is_active: true,
    created_by_id: auth.userId,
  } as never);
  if (profErr) {
    if (sentInvite) {
      await admin.auth.admin.deleteUser(targetUserId).catch(() => undefined);
    }
    return { ok: false, error: "Couldn't save the profile." };
  }

  await writeAuditLog({
    action: "USER_INVITED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      invited_email: email,
      invited_role: role,
      invited_name: fullName,
      existing_user_added: !sentInvite,
      surface: "wing_team",
    },
  });

  revalidatePath("/wing/team");
  return { ok: true };
}

const toggleSchema = z.object({ profileId: z.string().uuid() });

export async function setWingMemberActiveAction(
  input: z.input<typeof toggleSchema> & { active: boolean },
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    return { ok: false, error: "Wing workspace only." };
  }

  const admin = createAdminClient();
  const { data: targetRow } = await admin
    .from("profiles" as never)
    .select("id, user_id, branch_id, role, is_active")
    .eq("id", parsed.data.profileId)
    .single();
  const target = targetRow as
    | { id: string; user_id: string; branch_id: string; role: string; is_active: boolean }
    | null;
  if (!target || target.branch_id !== auth.activeBranch.id) {
    return { ok: false, error: "Profile not found." };
  }
  // Multi-profile self-check via user_id.
  if (target.user_id === auth.userId) {
    return { ok: false, error: "You can't deactivate your own wing access." };
  }

  const now = new Date().toISOString();
  const updatePayload = input.active
    ? { is_active: true, deactivated_at: null, deactivated_by_id: null }
    : { is_active: false, deactivated_at: now, deactivated_by_id: auth.userId };
  const { error: updErr } = await admin
    .from("profiles" as never)
    .update(updatePayload as never)
    .eq("id", target.id);
  if (updErr) {
    return { ok: false, error: "Couldn't update — try again in a minute." };
  }

  await writeAuditLog({
    action: input.active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: { target_id: target.id, target_role: target.role, surface: "wing_team" },
  });

  revalidatePath("/wing/team");
  return { ok: true };
}
