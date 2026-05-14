/**
 * Branch settings (Step 13) — Master Admin + Admin can override platform
 * defaults for the columns on `branches`. NULL = inherit from platform_settings.
 *
 * Settings covered here:
 *   - hq_email (no platform default; per-branch only)
 *   - email_from_display_name
 *   - invite_ttl_hours          (caps at platform max via platform_settings)
 *   - default_routing_mode
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { getEffectiveSettings } from "@/lib/settings/resolve";
import {
  NUDGE_STAGES,
  type NudgeStage,
  type NudgeConfig,
} from "@/lib/nudges/stages";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  hqEmail: z.string().trim().email("Invalid email").max(120).or(z.literal("")),
  emailFromDisplayName: z.string().trim().max(60).or(z.literal("")),
  inviteTtlHours: z
    .union([z.number().int().min(1), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  defaultRoutingMode: z
    .enum(["direct_to_chairman", "via_branch_admin_review"])
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
});

export type BranchSettingsInput = z.input<typeof schema>;

export async function saveBranchSettingsAction(
  input: BranchSettingsInput,
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { hqEmail, emailFromDisplayName, inviteTtlHours, defaultRoutingMode } = parsed.data;

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (
    !auth.branch ||
    (auth.profile.role !== "branch_master_admin" && auth.profile.role !== "branch_admin")
  ) {
    return { ok: false, error: "Branch admins only." };
  }

  // Enforce the platform-wide cap on invite TTL.
  if (inviteTtlHours !== null) {
    const effective = await getEffectiveSettings(auth.branch.id);
    if (inviteTtlHours > effective.inviteTtlMaxHours) {
      return {
        ok: false,
        error: `Invite TTL is capped at ${effective.inviteTtlMaxHours} hours by the platform.`,
      };
    }
  }

  const admin = createAdminClient();

  // Read current values so the audit metadata can show before/after.
  const { data: beforeRow } = await admin
    .from("branches" as never)
    .select("hq_email, email_from_display_name, invite_ttl_hours, default_routing_mode")
    .eq("id", auth.branch.id)
    .single();
  const before = beforeRow as Record<string, unknown> | null;

  const update: Record<string, unknown> = {
    hq_email: hqEmail.length > 0 ? hqEmail : null,
    email_from_display_name: emailFromDisplayName.length > 0 ? emailFromDisplayName : null,
    invite_ttl_hours: inviteTtlHours,
    default_routing_mode: defaultRoutingMode,
  };
  const { error: updateErr } = await admin
    .from("branches" as never)
    .update(update as never)
    .eq("id", auth.branch.id);
  if (updateErr) {
    return { ok: false, error: "Couldn't save — try again in a minute." };
  }

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { scope: "branch", before, after: update },
  });

  revalidatePath("/branch/settings");
  revalidatePath("/branch");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Branch nudge stage toggles

const nudgeStagesSchema = z.record(
  z.enum(NUDGE_STAGES),
  z.boolean(),
);

export async function saveBranchNudgeStagesAction(
  enabled: Record<NudgeStage, boolean>,
): Promise<ActionResult> {
  const parsed = nudgeStagesSchema.safeParse(enabled);
  if (!parsed.success) return { ok: false, error: "Bad input." };

  let auth;
  try {
    auth = await requireAuth();
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, error: err.message };
    throw err;
  }
  if (
    !auth.branch ||
    (auth.profile.role !== "branch_master_admin" && auth.profile.role !== "branch_admin")
  ) {
    return { ok: false, error: "Branch admins only." };
  }

  const admin = createAdminClient();

  // Pull the platform default to fill the intervals + recipients (we only
  // edit the enabled flag here — keep the rest in sync with platform).
  const { data: platRow } = await admin
    .from("platform_settings" as never)
    .select("value")
    .eq("key", "nudge_config")
    .single();
  const platformConfig = (platRow as { value: NudgeConfig } | null)?.value;
  if (!platformConfig) {
    return { ok: false, error: "Platform nudge config not seeded — ask Taylab to configure first." };
  }

  const nextConfig: NudgeConfig = { ...platformConfig };
  for (const stage of NUDGE_STAGES) {
    nextConfig[stage] = {
      ...platformConfig[stage],
      enabled: parsed.data[stage] ?? platformConfig[stage].enabled,
    };
  }

  const { data: beforeRow } = await admin
    .from("branches" as never)
    .select("nudge_config")
    .eq("id", auth.branch.id)
    .single();
  const before = (beforeRow as { nudge_config: NudgeConfig | null } | null)?.nudge_config;

  const { error: updateErr } = await admin
    .from("branches" as never)
    .update({ nudge_config: nextConfig } as never)
    .eq("id", auth.branch.id);
  if (updateErr) return { ok: false, error: "Couldn't save — try again in a minute." };

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    branchId: auth.branch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { scope: "branch", section: "nudge_stages", before, after: nextConfig },
  });

  revalidatePath("/branch/settings");
  return { ok: true };
}
