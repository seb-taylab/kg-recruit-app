/**
 * Wing settings — update observation preferences.
 *
 * Upserts a row in wing_observation_preferences for the active wing. Bounds
 * mirror the DB CHECK constraints; aging_lt_cold cross-field check enforced
 * here too so the error surfaces as a friendly toast rather than a SQLSTATE
 * bubble-up.
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

const prefsSchema = z
  .object({
    ack_attention_days: z.coerce.number().int().min(1).max(60),
    engagement_attention_days: z.coerce.number().int().min(1).max(90),
    form_sent_attention_days: z.coerce.number().int().min(1).max(90),
    lead_aging_days: z.coerce.number().int().min(3).max(180),
    lead_cold_days: z.coerce.number().int().min(7).max(365),
    branch_saturation_threshold: z.coerce.number().int().min(1).max(100),
  })
  .refine(
    (v) => v.lead_aging_days < v.lead_cold_days,
    {
      message: "Aging threshold must be less than cold threshold.",
      path: ["lead_aging_days"],
    },
  );

export async function updateWingObservationPrefsAction(
  input: z.input<typeof prefsSchema>,
): Promise<ActionResult> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Bad input." };
  }

  const auth = await requireAuth();
  if (auth.activeProfile.role !== "wing_admin" && auth.activeProfile.role !== "taylab_staff") {
    return { ok: false, error: "Wing Admin only." };
  }
  if (!auth.activeBranch || auth.activeBranch.branch_type !== "wing") {
    return { ok: false, error: "Wing workspace only." };
  }

  const admin = createAdminClient();
  const payload = {
    wing_branch_id: auth.activeBranch.id,
    ...parsed.data,
    updated_at: new Date().toISOString(),
    updated_by_user_id: auth.userId,
  };

  // Upsert by PK (wing_branch_id) — onConflict on PK means "create if
  // absent, otherwise update".
  const { error: upsertErr } = await admin
    .from("wing_observation_preferences" as never)
    .upsert(payload as never, { onConflict: "wing_branch_id" });
  if (upsertErr) return { ok: false, error: upsertErr.message };

  await writeAuditLog({
    action: "SETTINGS_CHANGED",
    branchId: auth.activeBranch.id,
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.activeProfile.role,
    metadata: {
      scope: "wing_observation_preferences",
      values: parsed.data,
    },
  });

  revalidatePath("/wing/settings");
  revalidatePath("/wing/triage");
  return { ok: true };
}
