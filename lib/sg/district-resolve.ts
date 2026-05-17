/**
 * Resolve a branch's constituency string → constituency_directory row
 * → district. Used by territorial branch surfaces (overview, settings,
 * taylab branches list) to show the hierarchical context:
 *
 *   Branch (e.g. Kampong Glam)
 *     → Constituency / GRC|SMC (e.g. Jalan Besar GRC)
 *       → District (e.g. Central Singapore)
 *
 * branches.constituency is free-text (operator-typed). The directory
 * stores canonical UPPERCASE names. Match is case-insensitive + supports
 * substring containment either direction (mirrors postal-suggest helper).
 *
 * Wing branches don't have a constituency in the geographic sense — they
 * sit ABOVE constituencies — so passing null returns null cleanly.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface BranchDistrictContext {
  /** Resolved canonical constituency name (UPPERCASE from directory). */
  constituency: string;
  constituency_type: "GRC" | "SMC";
  /** NULL when the directory row has no verified district yet. */
  district: string | null;
}

/**
 * Single-branch lookup. Returns null when constituency is empty or no
 * directory entry matches.
 */
export async function resolveBranchDistrict(
  constituency: string | null,
): Promise<BranchDistrictContext | null> {
  if (!constituency || constituency.trim().length === 0) return null;

  const admin = createAdminClient();
  const target = constituency.trim().toLowerCase();

  // Pull all directory rows once; case-insensitive match in-memory. Cheap
  // because the directory has ~33 rows.
  const { data } = await admin
    .from("constituency_directory" as never)
    .select("constituency, constituency_type, district");
  const rows = (data as Array<{
    constituency: string;
    constituency_type: "GRC" | "SMC";
    district: string | null;
  }> | null) ?? [];

  const match = rows.find((r) => {
    const candidate = r.constituency.toLowerCase();
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });

  if (!match) return null;
  return {
    constituency: match.constituency,
    constituency_type: match.constituency_type,
    district: match.district,
  };
}

/**
 * Bulk variant — for pages that render N branches and want N district
 * contexts without N round-trips. Returns a Map keyed by the INPUT
 * constituency string (not the canonical one) so callers can look up by
 * their branch.constituency value directly.
 */
export async function resolveBranchDistrictsForMany(
  constituencies: ReadonlyArray<string | null>,
): Promise<Map<string, BranchDistrictContext>> {
  const out = new Map<string, BranchDistrictContext>();
  const inputs = Array.from(
    new Set(
      constituencies
        .filter((c): c is string => c !== null && c.trim().length > 0)
        .map((c) => c.trim()),
    ),
  );
  if (inputs.length === 0) return out;

  const admin = createAdminClient();
  const { data } = await admin
    .from("constituency_directory" as never)
    .select("constituency, constituency_type, district");
  const rows = (data as Array<{
    constituency: string;
    constituency_type: "GRC" | "SMC";
    district: string | null;
  }> | null) ?? [];

  for (const input of inputs) {
    const target = input.toLowerCase();
    const match = rows.find((r) => {
      const candidate = r.constituency.toLowerCase();
      return candidate === target || candidate.includes(target) || target.includes(candidate);
    });
    if (match) {
      out.set(input, {
        constituency: match.constituency,
        constituency_type: match.constituency_type,
        district: match.district,
      });
    }
  }
  return out;
}
