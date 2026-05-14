/**
 * Effective settings resolver.
 *
 * PRD §1D Platform Settings + Branch Overrides:
 *   effective = COALESCE(branch_override, platform_default)
 *
 * Hard-coded fallbacks (last line of defence) match the seed.sql values
 * so an un-seeded local DB still returns sensible numbers in dev.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

interface EffectiveSettings {
  inviteTtlHours: number;
  inviteTtlMaxHours: number;
  defaultRoutingMode: "direct_to_chairman" | "via_branch_admin_review";
  pdfPresignedUrlTtlDays: number;
}

const FALLBACK: EffectiveSettings = {
  inviteTtlHours: 168,
  inviteTtlMaxHours: 720,
  defaultRoutingMode: "direct_to_chairman",
  pdfPresignedUrlTtlDays: 30,
};

interface BranchOverrideRow {
  invite_ttl_hours: number | null;
  default_routing_mode: "direct_to_chairman" | "via_branch_admin_review" | null;
}

interface PlatformSettingRow {
  key: string;
  value: unknown;
}

export async function getEffectiveSettings(branchId: string | null): Promise<EffectiveSettings> {
  const supabase = await createClient();

  const [{ data: platformRows }, { data: branchRow }] = await Promise.all([
    supabase.from("platform_settings").select("key, value"),
    branchId
      ? supabase
          .from("branches")
          .select("invite_ttl_hours, default_routing_mode")
          .eq("id", branchId)
          .single()
      : Promise.resolve({ data: null as BranchOverrideRow | null }),
  ]);

  const platform = new Map<string, unknown>();
  for (const row of (platformRows as PlatformSettingRow[] | null) ?? []) {
    platform.set(row.key, row.value);
  }

  const platformTtl = typeof platform.get("invite_ttl_hours") === "number"
    ? (platform.get("invite_ttl_hours") as number)
    : FALLBACK.inviteTtlHours;
  const platformMaxTtl = typeof platform.get("invite_ttl_max_hours") === "number"
    ? (platform.get("invite_ttl_max_hours") as number)
    : FALLBACK.inviteTtlMaxHours;
  const platformRouting = (platform.get("default_routing_mode") as
    | EffectiveSettings["defaultRoutingMode"]
    | undefined) ?? FALLBACK.defaultRoutingMode;
  const platformPdfTtl = typeof platform.get("pdf_presigned_url_ttl_days") === "number"
    ? (platform.get("pdf_presigned_url_ttl_days") as number)
    : FALLBACK.pdfPresignedUrlTtlDays;

  const branch = branchRow as BranchOverrideRow | null;

  return {
    inviteTtlHours: branch?.invite_ttl_hours ?? platformTtl,
    inviteTtlMaxHours: platformMaxTtl,
    defaultRoutingMode: branch?.default_routing_mode ?? platformRouting,
    pdfPresignedUrlTtlDays: platformPdfTtl,
  };
}
