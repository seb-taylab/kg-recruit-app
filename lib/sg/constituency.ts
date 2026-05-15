/**
 * Derive Singapore electoral constituency (GRC / SMC) from a postal code +
 * lat/lng. Called server-side at applicant-form submit time so each
 * row gets tagged with its constituency before HQ ever sees it.
 *
 * Strategy (per Sebastian's 2026-05-16 decision card):
 *   1. Check `postal_constituency_cache` for an existing row at the
 *      current BOUNDARY_VERSION. Hit → return; cost ~5ms.
 *   2. Miss → dynamic-import the ELD GeoJSON + turf, run point-in-
 *      polygon against the 33 features, find the match. Cost ~30-50ms
 *      including first-time GeoJSON parse.
 *   3. Write the result to the cache so the next call from the same
 *      postal_code (or any other call within this serverless invocation)
 *      skips the polygon test entirely.
 *
 * Boundary versioning:
 *   submission_* on `applications` is FROZEN at submit. The version
 *   stamp lets future-us tell "this row was tagged under GE2025
 *   boundaries" even after a 2030 redraw lands.
 *
 * Bundle hygiene:
 *   - GeoJSON (~1MB) is loaded via `await import()` so it isn't pulled
 *     into the bundle of every serverless function — only functions
 *     that call deriveConstituency() get it.
 *   - We import the two turf primitives directly
 *     (@turf/boolean-point-in-polygon + @turf/helpers) rather than the
 *     full @turf/turf metapackage. Saves ~10MB unpacked node_modules.
 */
import "server-only";
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from "geojson";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bump this string when ELD redraws boundaries (each general election
 * cycle). Cached rows with an older version are treated as stale and
 * lazily recomputed on next lookup. The current `applications` rows'
 * `constituency_boundary_version` lets you query "who joined under which
 * boundary set" without a join.
 */
export const BOUNDARY_VERSION = "ELD_GE2025_v1";

export type ConstituencyType = "GRC" | "SMC";

export interface ConstituencyResult {
  /** Bare name, e.g. "JURONG EAST-BUKIT BATOK" */
  name: string;
  type: ConstituencyType;
  /** Name + type suffix, e.g. "JURONG EAST-BUKIT BATOK GRC" */
  full_name: string;
}

interface CachedRow {
  constituency: string;
  constituency_type: string;
  boundary_version: string;
}

/** Properties on each Feature in the ELD GeoJSON. */
interface ElectoralFeatureProps {
  /** Bare name. */
  ED_DESC?: string;
  /** Name with " GRC" / " SMC" suffix. */
  ED_DESC_FU?: string;
  Name?: string;
  /** Internal ELD code, e.g. "JE". */
  NEW_ED?: string;
  FID?: number;
}

type ElectoralFeature = Feature<Polygon | MultiPolygon, ElectoralFeatureProps>;

/**
 * Module-level cache so a hot serverless instance only parses the
 * GeoJSON once across multiple invocations. The JSON parse is the
 * expensive part (~10-20ms); subsequent calls are essentially free.
 */
let cachedBoundaries: FeatureCollection<Polygon | MultiPolygon, ElectoralFeatureProps> | null =
  null;

async function loadBoundaries(): Promise<
  FeatureCollection<Polygon | MultiPolygon, ElectoralFeatureProps>
> {
  if (cachedBoundaries) return cachedBoundaries;
  // Dynamic import keeps the GeoJSON out of bundles that never derive
  // constituencies. The `with { type: "json" }` import attribute is
  // required for JSON modules in modern Node + Next.js 16.
  const mod = (await import("./data/electoral_boundaries_ge2025.geojson.json", {
    with: { type: "json" },
  })) as { default: FeatureCollection<Polygon | MultiPolygon, ElectoralFeatureProps> };
  cachedBoundaries = mod.default;
  return cachedBoundaries;
}

/**
 * Parse the "GRC" / "SMC" suffix off a full name. Returns null if the
 * feature didn't carry a recognisable suffix (defensive — every row in
 * the current ELD GeoJSON has it).
 */
function suffixToType(fullName: string): ConstituencyType | null {
  if (fullName.endsWith(" GRC")) return "GRC";
  if (fullName.endsWith(" SMC")) return "SMC";
  return null;
}

/**
 * Core derivation. Cache-first, point-in-polygon on miss. Writes back
 * to the cache so the next call is fast.
 *
 * Returns null if the lat/lng falls outside every ELD polygon — should
 * never happen for a valid SG postal code, but is defensible against
 * data corruption.
 */
export async function deriveConstituency(
  postalCode: string,
  latitude: number,
  longitude: number,
): Promise<ConstituencyResult | null> {
  const admin = createAdminClient();

  // ─── Step 1: cache lookup at the current boundary version ────────
  const { data: cachedRow } = await admin
    .from("postal_constituency_cache" as never)
    .select("constituency, constituency_type, boundary_version")
    .eq("postal_code", postalCode)
    .eq("boundary_version", BOUNDARY_VERSION)
    .maybeSingle();
  const cached = cachedRow as CachedRow | null;
  if (cached) {
    const type = cached.constituency_type as ConstituencyType;
    const name = cached.constituency.replace(/ (GRC|SMC)$/, "");
    return { name, type, full_name: cached.constituency };
  }

  // ─── Step 2: dynamic-load GeoJSON + turf, run PIP ────────────────
  const [boundaries, helpersMod, pipMod] = await Promise.all([
    loadBoundaries(),
    import("@turf/helpers"),
    import("@turf/boolean-point-in-polygon"),
  ]);
  // turf coords are [lng, lat], NOT [lat, lng] — easy to flip and get
  // a point in the South China Sea instead of Singapore. Don't reorder
  // without testing.
  const point = helpersMod.point([longitude, latitude]);
  const pip = pipMod.default;

  let match: ElectoralFeature | null = null;
  for (const feature of boundaries.features) {
    if (!feature.geometry) continue;
    if (
      feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "MultiPolygon"
    ) {
      continue;
    }
    if (pip(point, feature as ElectoralFeature)) {
      match = feature as ElectoralFeature;
      break;
    }
  }

  if (!match) return null;

  const fullName = match.properties?.ED_DESC_FU ?? match.properties?.Name ?? "";
  const type = suffixToType(fullName);
  if (!fullName || !type) return null;
  const name = fullName.replace(/ (GRC|SMC)$/, "");

  // ─── Step 3: write-through cache so the next lookup is instant ───
  // upsert keyed on postal_code so a boundary refresh (which keeps the
  // same postal codes but maps them to new constituencies) overwrites
  // cleanly. errors here are non-fatal — the result is still correct,
  // just uncached.
  await admin
    .from("postal_constituency_cache" as never)
    .upsert(
      {
        postal_code: postalCode,
        latitude,
        longitude,
        constituency: fullName,
        constituency_type: type,
        boundary_version: BOUNDARY_VERSION,
        source: "eld_geojson",
        derived_at: new Date().toISOString(),
      } as never,
      { onConflict: "postal_code" },
    );

  return { name, type, full_name: fullName };
}
