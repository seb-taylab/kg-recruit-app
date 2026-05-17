/**
 * Branch creation + activation toggle (Step 15) — Taylab Staff only.
 *
 * `createBranchAction` provisions the branch row, invites an initial
 * Master Admin via Supabase Auth, and inserts the matching profile row.
 * Without that initial admin a freshly-created branch is unmanageable.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

export interface ActionResult {
  ok: boolean;
  error?: string;
  branchId?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Branch name is too short").max(80),
  // 'territorial' = constituency branch (KG, Tampines). 'wing' = parent layer
  // (Young PAP) that runs events + routes leads. See migration
  // 20260517000001_wing_events_primitive.sql. Default 'territorial' to keep
  // existing flow unchanged for any caller that doesn't yet pass the field.
  branchType: z.enum(["territorial", "wing"]).default("territorial"),
  constituency: z.string().trim().max(80).optional().or(z.literal("")),
  hqEmail: z.string().trim().email("Invalid HQ email").optional().or(z.literal("")),
  masterAdminEmail: z.string().trim().email("Invalid email"),
  masterAdminName: z.string().trim().min(2, "Admin name is too short").max(100),
});

export async function createBranchAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { name, branchType, constituency, hqEmail, masterAdminEmail, masterAdminName } =
    parsed.data;

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Taylab staff only." };
  }

  const admin = createAdminClient();

  // For wing branches the first admin is a `wing_admin` (operational); for
  // territorial branches it's a `branch_master_admin` (the existing default).
  // Chairman invites go through the team-management flow, not here.
  const firstAdminRole = branchType === "wing" ? "wing_admin" : "branch_master_admin";

  // Insert the branch first so we have an id for the profile.
  const { data: branchRow, error: branchErr } = await admin
    .from("branches" as never)
    .insert({
      name,
      branch_type: branchType,
      constituency: constituency && constituency.length > 0 ? constituency : null,
      hq_email: hqEmail && hqEmail.length > 0 ? hqEmail : null,
      is_active: true,
    } as never)
    .select("id")
    .single();
  const branch = branchRow as { id: string } | null;
  if (branchErr || !branch) {
    return { ok: false, error: branchErr?.message ?? "Couldn't create the branch." };
  }

  // Multi-profile model (Sprint 3): an existing auth user CAN be a new
  // branch's first admin. They just get a second profile row in the new
  // branch. Pre-multi-profile this was rejected outright; now we branch
  // on user-exists.
  const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existingUser = existingList?.users?.find(
    (u) => u.email?.toLowerCase() === masterAdminEmail.toLowerCase(),
  );

  let firstAdminUserId: string;
  let sentInvite = false;

  if (existingUser) {
    // Existing auth user — reuse their auth row. They get a NEW profile
    // (id = gen_random_uuid()) for THIS branch. The active-profile picker
    // surfaces it at next login.
    firstAdminUserId = existingUser.id;

    // Guard: did they ALREADY have an active profile for this brand new
    // branch? Should be impossible (we just created the branch) but the
    // partial unique index would also reject — friendly error first.
    const { data: existingProfile } = await admin
      .from("profiles" as never)
      .select("id")
      .eq("user_id", firstAdminUserId)
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .maybeSingle();
    if (existingProfile) {
      await admin.from("branches" as never).delete().eq("id", branch.id);
      return {
        ok: false,
        error: "That account is already an active member of this branch.",
      };
    }
  } else {
    // Fresh email — invite them via Supabase Auth. They'll get a magic
    // link to set a password and land on the picker (or directly into
    // /branch | /wing if this is their only profile).
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      masterAdminEmail,
      { data: { full_name: masterAdminName } },
    );
    if (inviteErr || !invite?.user) {
      await admin.from("branches" as never).delete().eq("id", branch.id);
      return { ok: false, error: inviteErr?.message ?? "Couldn't send the invite." };
    }
    firstAdminUserId = invite.user.id;
    sentInvite = true;
  }

  // Insert the profile row. profiles.id auto-generated by the new
  // gen_random_uuid() default; we just provide user_id + role + branch.
  const { error: profErr } = await admin.from("profiles" as never).insert({
    user_id: firstAdminUserId,
    full_name: masterAdminName,
    role: firstAdminRole,
    branch_id: branch.id,
    is_active: true,
    created_by_id: auth.userId,
  } as never);
  if (profErr) {
    // Roll back: delete the branch. If we sent a fresh invite, also delete
    // the auth user so we don't strand them as a credential-less account.
    if (sentInvite) {
      await admin.auth.admin.deleteUser(firstAdminUserId).catch(() => undefined);
    }
    await admin.from("branches" as never).delete().eq("id", branch.id);
    return { ok: false, error: "Couldn't save the admin profile." };
  }

  await writeAuditLog({
    action: "USER_INVITED",
    branchId: branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      via: "branch_creation",
      branch_name: name,
      branch_type: branchType,
      invited_email: masterAdminEmail,
      invited_role: firstAdminRole,
      existing_user_added: !sentInvite,
    },
  });

  revalidatePath("/taylab/branches");
  revalidatePath("/taylab");
  return { ok: true, branchId: branch.id };
}

// ─────────────────────────────────────────────────────────────────────

const toggleSchema = z.object({ branchId: z.string().uuid(), active: z.boolean() });

export async function setBranchActiveAction(
  input: z.input<typeof toggleSchema>,
): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Taylab staff only." };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("branches" as never)
    .update({ is_active: parsed.data.active } as never)
    .eq("id", parsed.data.branchId);
  if (updErr) return { ok: false, error: updErr.message };

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    branchId: parsed.data.branchId,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { scope: "branch_activation", new_active: parsed.data.active },
  });

  revalidatePath("/taylab/branches");
  return { ok: true };
}
