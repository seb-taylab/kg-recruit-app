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
  /** PAP district resolved via constituency_directory. NULL if the
   * directory row doesn't have a verified district yet. */
  district: string | null;
  /** Branch IDs whose constituency string matches the cache hit. May be []
   * if no territorial branch has been provisioned for that constituency. */
  suggestedBranchIds: string[];
  /** Same-district branches that fall back when no exact constituency
   * match exists. These are the "closest fit" routing hint. */
  sameDistrictBranchIds: string[];
}

export async function suggestBranchFromPostal(
  postalCode: string | null,
): Promise<PostalSuggestion> {
  const empty: PostalSuggestion = {
    constituency: null,
    constituency_type: null,
    district: null,
    suggestedBranchIds: [],
    sameDistrictBranchIds: [],
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

  // Resolve district via constituency_directory (Sprint 6).
  const { data: dirRow } = await admin
    .from("constituency_directory" as never)
    .select("district")
    .eq("constituency", cache.constituency)
    .maybeSingle();
  const district = (dirRow as { district: string | null } | null)?.district ?? null;

  // Fetch all active territorial branches + their directory entries in
  // parallel so we can compute same-district fallback in-memory.
  const [{ data: branchRows }, { data: allDirRows }] = await Promise.all([
    admin
      .from("branches" as never)
      .select("id, constituency")
      .eq("branch_type", "territorial")
      .eq("is_active", true),
    district
      ? admin
          .from("constituency_directory" as never)
          .select("constituency, district")
          .eq("district", district)
      : Promise.resolve({ data: [] as Array<{ constituency: string; district: string }> }),
  ]);
  const branches = (branchRows as Array<{ id: string; constituency: string | null }> | null) ?? [];

  const target = cache.constituency.toLowerCase();
  const exactMatches = branches.filter((b) => {
    if (!b.constituency) return false;
    const candidate = b.constituency.toLowerCase();
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });

  // Same-district fallback: branches whose constituency is in the same
  // district per the directory. Exclude exact matches (they already get
  // the ★ in UI).
  const sameDistrictConstituencies = new Set(
    ((allDirRows as Array<{ constituency: string; district: string }> | null) ?? [])
      .map((r) => r.constituency.toLowerCase()),
  );
  const exactIds = new Set(exactMatches.map((m) => m.id));
  const sameDistrictMatches = branches.filter((b) => {
    if (exactIds.has(b.id)) return false;
    if (!b.constituency) return false;
    return sameDistrictConstituencies.has(b.constituency.toLowerCase());
  });

  return {
    constituency: cache.constituency,
    constituency_type: cache.constituency_type,
    district,
    suggestedBranchIds: exactMatches.map((m) => m.id),
    sameDistrictBranchIds: sameDistrictMatches.map((m) => m.id),
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
  const [{ data: cacheRows }, { data: branchRows }, { data: dirRows }] = await Promise.all([
    admin
      .from("postal_constituency_cache" as never)
      .select("postal_code, constituency, constituency_type")
      .in("postal_code", valid),
    admin
      .from("branches" as never)
      .select("id, constituency")
      .eq("branch_type", "territorial")
      .eq("is_active", true),
    // Only rows with a verified district contribute to same-district
    // fallback — unverified rows are noise. Filtering at the DB keeps the
    // payload small as the directory grows beyond GE2025's 33 entries.
    admin
      .from("constituency_directory" as never)
      .select("constituency, district")
      .not("district", "is", null),
  ]);
  const branches = (branchRows as Array<{ id: string; constituency: string | null }> | null) ?? [];
  // Directory lookup: constituency (lowercased) → district. Lets us
  // resolve "what district is this postal code in?" in one pass.
  const districtByConstituency = new Map<string, string | null>();
  for (const r of (dirRows as Array<{ constituency: string; district: string | null }> | null) ?? []) {
    districtByConstituency.set(r.constituency.toLowerCase(), r.district);
  }
  // Reverse-lookup: which constituencies belong to each district. Used
  // to compute same-district fallback per lead.
  const constituenciesByDistrict = new Map<string, Set<string>>();
  for (const [c, d] of districtByConstituency.entries()) {
    if (!d) continue;
    const set = constituenciesByDistrict.get(d) ?? new Set<string>();
    set.add(c);
    constituenciesByDistrict.set(d, set);
  }

  for (const row of (cacheRows as Array<{
    postal_code: string;
    constituency: string | null;
    constituency_type: "GRC" | "SMC" | null;
  }> | null) ?? []) {
    if (!row.constituency) {
      out.set(row.postal_code, {
        constituency: null,
        constituency_type: row.constituency_type,
        district: null,
        suggestedBranchIds: [],
        sameDistrictBranchIds: [],
      });
      continue;
    }
    const target = row.constituency.toLowerCase();
    const district = districtByConstituency.get(target) ?? null;

    const exactMatches = branches.filter((b) => {
      if (!b.constituency) return false;
      const c = b.constituency.toLowerCase();
      return c === target || c.includes(target) || target.includes(c);
    });
    const exactIds = new Set(exactMatches.map((m) => m.id));

    const districtConstituencies = district ? constituenciesByDistrict.get(district) : null;
    const sameDistrictMatches = districtConstituencies
      ? branches.filter((b) => {
          if (exactIds.has(b.id)) return false;
          if (!b.constituency) return false;
          return districtConstituencies.has(b.constituency.toLowerCase());
        })
      : [];

    out.set(row.postal_code, {
      constituency: row.constituency,
      constituency_type: row.constituency_type,
      district,
      suggestedBranchIds: exactMatches.map((m) => m.id),
      sameDistrictBranchIds: sameDistrictMatches.map((m) => m.id),
    });
  }
  return out;
}
