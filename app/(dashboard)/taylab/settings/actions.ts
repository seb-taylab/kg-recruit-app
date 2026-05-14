/**
 * Platform settings (Step 13) — Taylab Staff edits the global defaults in
 * `platform_settings`. Each row is upserted by `key` so partial updates
 * leave untouched keys alone.
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, PermissionError } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { NUDGE_STAGES, type NudgeStage, type NudgeConfig } from "@/lib/nudges/stages";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const schema = z.object({
  inviteTtlHours: z.number().int().min(1).max(720),
  inviteTtlMaxHours: z.number().int().min(1).max(8760),
  defaultRoutingMode: z.enum(["direct_to_chairman", "via_branch_admin_review"]),
  pdfPresignedUrlTtlDays: z.number().int().min(1).max(365),
});

export type PlatformSettingsInput = z.input<typeof schema>;

export async function savePlatformSettingsAction(
  input: PlatformSettingsInput,
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }
  const { inviteTtlHours, inviteTtlMaxHours, defaultRoutingMode, pdfPresignedUrlTtlDays } =
    parsed.data;

  if (inviteTtlHours > inviteTtlMaxHours) {
    return {
      ok: false,
      error: "Default TTL can't be higher than the platform max.",
    };
  }

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

  const { data: beforeRows } = await admin
    .from("platform_settings" as never)
    .select("key, value");
  const beforeMap = new Map<string, unknown>();
  for (const r of (beforeRows as Array<{ key: string; value: unknown }> | null) ?? []) {
    beforeMap.set(r.key, r.value);
  }

  const rows = [
    { key: "invite_ttl_hours", value: inviteTtlHours },
    { key: "invite_ttl_max_hours", value: inviteTtlMaxHours },
    { key: "default_routing_mode", value: defaultRoutingMode },
    { key: "pdf_presigned_url_ttl_days", value: pdfPresignedUrlTtlDays },
  ];

  const now = new Date().toISOString();
  for (const r of rows) {
    const { error: upsertErr } = await admin.from("platform_settings" as never).upsert(
      {
        key: r.key,
        value: r.value,
        updated_at: now,
        updated_by_id: auth.userId,
      } as never,
      { onConflict: "key" },
    );
    if (upsertErr) {
      return { ok: false, error: `Couldn't save ${r.key}: ${upsertErr.message}` };
    }
  }

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: {
      scope: "platform",
      before: Object.fromEntries(beforeMap),
      after: Object.fromEntries(rows.map((r) => [r.key, r.value])),
    },
  });

  revalidatePath("/taylab/settings");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Platform-wide nudge stage toggles

const nudgeStagesSchema = z.record(z.enum(NUDGE_STAGES), z.boolean());

export async function savePlatformNudgeStagesAction(
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
  if (auth.profile.role !== "taylab_staff") {
    return { ok: false, error: "Taylab staff only." };
  }

  const admin = createAdminClient();

  const { data: beforeRow } = await admin
    .from("platform_settings" as never)
    .select("value")
    .eq("key", "nudge_config")
    .single();
  const before = (beforeRow as { value: NudgeConfig } | null)?.value;
  if (!before) {
    return { ok: false, error: "Platform nudge_config row is missing — re-seed first." };
  }

  const next: NudgeConfig = { ...before };
  for (const stage of NUDGE_STAGES) {
    next[stage] = { ...before[stage], enabled: parsed.data[stage] ?? before[stage].enabled };
  }

  const now = new Date().toISOString();
  const { error: upsertErr } = await admin.from("platform_settings" as never).upsert(
    {
      key: "nudge_config",
      value: next,
      updated_at: now,
      updated_by_id: auth.userId,
    } as never,
    { onConflict: "key" },
  );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.profile.role,
    metadata: { scope: "platform", section: "nudge_stages", before, after: next },
  });

  revalidatePath("/taylab/settings");
  return { ok: true };
}
