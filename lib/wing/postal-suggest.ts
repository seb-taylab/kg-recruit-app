/**
 * Postal-code → constituency → suggested-branch resolver.
 *
 * Queries `postal_constituency_cache` (populated by an earlier migration
 * from ELD GeoJSON boundaries) for a given postal code, then looks for
 * territorial branches whose `constituency` column matches the cache hit.
 *
 * Pragmatic match logic: case-insensitive equality OR substring containment
 * (so "Sengkang GRC" in cache matches branch.constituency "Sengkang" — the
 * branch-level constituency field is free-text and often less specific
 * than the GeoJSON name).
 *
 * Used by the wing route + reroute dialogs to show the wing admin which
 * branch the system thinks the lead should land at. The admin still picks
 * — this is a hint, not an enforced choice.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PostalSuggestion {
  /** ELD-derived constituency name (e.g. "SENGKANG GRC"). */
  constituency: string | null;
  /** 'GRC' | 'SMC' — useful for display labels. */
  constituency_type: "GRC" | "SMC" | null;
  /** Branch IDs whose constituency string matches the cache hit. May be []
   * if no territorial branch has been provisioned for that constituency. */
  suggestedBranchIds: string[];
}

export async function suggestBranchFromPostal(
  postalCode: string | null,
): Promise<PostalSuggestion> {
  const empty: PostalSuggestion = {
    constituency: null,
    constituency_type: null,
    suggestedBranchIds: [],
  };
  if (!postalCode || !/^\d{6}$/.test(postalCode)) return empty;

  const admin = createAdminClient();

  const { data: cacheRow } = await admin
    .from("postal_constituency_cache" as never)
    .select("constituency, constituency_type")
    .eq("postal_code", postalCode)
    .maybeSingle();
  const cache = cacheRow as
    | { constituency: string | null; constituency_type: "GRC" | "SMC" | null }
    | null;
  if (!cache || !cache.constituency) return empty;

  // Fetch all active territorial branches once; match against the
  // constituency in-memory (small list — branch count grows slowly).
  const { data: branchRows } = await admin
    .from("branches" as never)
    .select("id, constituency")
    .eq("branch_type", "territorial")
    .eq("is_active", true);
  const branches = (branchRows as Array<{ id: string; constituency: string | null }> | null) ?? [];

  const target = cache.constituency.toLowerCase();
  const matches = branches.filter((b) => {
    if (!b.constituency) return false;
    const candidate = b.constituency.toLowerCase();
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });

  return {
    constituency: cache.constituency,
    constituency_type: cache.constituency_type,
    suggestedBranchIds: matches.map((m) => m.id),
  };
}

/**
 * Bulk variant — for a triage page rendering many leads, fetch all
 * suggestions in one round-trip.
 */
export async function suggestBranchesForPostals(
  postalCodes: ReadonlyArray<string | null>,
): Promise<Map<string, PostalSuggestion>> {
  const out = new Map<string, PostalSuggestion>();
  const valid = Array.from(
    new Set(postalCodes.filter((p): p is string => p !== null && /^\d{6}$/.test(p))),
  );
  if (valid.length === 0) return out;

  const admin = createAdminClient();
  const [{ data: cacheRows }, { data: branchRows }] = await Promise.all([
    admin
      .from("postal_constituency_cache" as never)
      .select("postal_code, constituency, constituency_type")
      .in("postal_code", valid),
    admin
      .from("branches" as never)
      .select("id, constituency")
      .eq("branch_type", "territorial")
      .eq("is_active", true),
  ]);
  const branches = (branchRows as Array<{ id: string; constituency: string | null }> | null) ?? [];

  for (const row of (cacheRows as Array<{
    postal_code: string;
    constituency: string | null;
    constituency_type: "GRC" | "SMC" | null;
  }> | null) ?? []) {
    if (!row.constituency) {
      out.set(row.postal_code, {
        constituency: null,
        constituency_type: row.constituency_type,
        suggestedBranchIds: [],
      });
      continue;
    }
    const target = row.constituency.toLowerCase();
    const matches = branches.filter((b) => {
      if (!b.constituency) return false;
      const c = b.constituency.toLowerCase();
      return c === target || c.includes(target) || target.includes(c);
    });
    out.set(row.postal_code, {
      constituency: row.constituency,
      constituency_type: row.constituency_type,
      suggestedBranchIds: matches.map((m) => m.id),
    });
  }
  return out;
}
