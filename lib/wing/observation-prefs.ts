/**
 * Wing observation preferences — read with defaults fallback.
 *
 * The wing_observation_preferences table is populated lazily: a wing gets
 * its row only when an admin opens /wing/settings and submits the form
 * (or the first time triage UI / reroute policy logic calls into it). For
 * any wing without a row, this returns the same defaults baked into the
 * DB check constraints.
 *
 * Keep the defaults here in sync with the migration's default clauses.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WingObservationPreferences } from "@/types/database";

export interface ResolvedWingPrefs {
  ack_attention_days: number;
  engagement_attention_days: number;
  form_sent_attention_days: number;
  lead_aging_days: number;
  lead_cold_days: number;
  branch_saturation_threshold: number;
  /** true if read from DB; false if returned from defaults. */
  hasRow: boolean;
  /** Last update from DB (null when defaults). */
  updated_at: string | null;
}

export const WING_PREFS_DEFAULTS: Omit<ResolvedWingPrefs, "hasRow" | "updated_at"> = {
  ack_attention_days: 2,
  engagement_attention_days: 5,
  form_sent_attention_days: 7,
  lead_aging_days: 14,
  lead_cold_days: 30,
  branch_saturation_threshold: 10,
};

export async function getWingObservationPrefs(
  wingBranchId: string,
): Promise<ResolvedWingPrefs> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("wing_observation_preferences" as never)
    .select(
      "wing_branch_id, ack_attention_days, engagement_attention_days, form_sent_attention_days, lead_aging_days, lead_cold_days, branch_saturation_threshold, updated_at",
    )
    .eq("wing_branch_id", wingBranchId)
    .maybeSingle();
  const row = data as WingObservationPreferences | null;

  if (!row) {
    return { ...WING_PREFS_DEFAULTS, hasRow: false, updated_at: null };
  }

  return {
    ack_attention_days: row.ack_attention_days,
    engagement_attention_days: row.engagement_attention_days,
    form_sent_attention_days: row.form_sent_attention_days,
    lead_aging_days: row.lead_aging_days,
    lead_cold_days: row.lead_cold_days,
    branch_saturation_threshold: row.branch_saturation_threshold,
    hasRow: true,
    updated_at: row.updated_at,
  };
}
