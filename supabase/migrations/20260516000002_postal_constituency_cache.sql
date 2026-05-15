-- =============================================================================
-- postal_constituency_cache — per-postal lookup cache for deriveConstituency
-- =============================================================================
-- PR-2 of the postal-code-first address redesign. The submit-time
-- constituency derivation does a point-in-polygon test against the ELD
-- electoral-boundary GeoJSON (~1MB, 33 features). That's cheap (~5-10ms)
-- but loading and parsing the GeoJSON on every cold-start adds latency.
-- This table caches the per-postal_code result so the second+ submission
-- in a given postal code skips the PIP entirely.
--
-- Cache invalidation strategy: each row records the `boundary_version`
-- under which it was computed. When ELD redraws boundaries (each general
-- election cycle), we bump the version constant in lib/sg/constituency.ts.
-- Reads with a stale version trigger recomputation + cache overwrite.
-- =============================================================================

create table if not exists public.postal_constituency_cache (
  postal_code        text primary key,
  latitude           numeric(10, 7) not null,
  longitude          numeric(10, 7) not null,
  constituency       text not null,
  constituency_type  text not null,
  boundary_version   text not null,
  source             text not null default 'eld_geojson',
  derived_at         timestamptz not null default now(),
  -- GRC / SMC are the only valid types — Singapore has no other electoral
  -- division flavours. NULL is rejected.
  constraint constituency_type_check
    check (constituency_type in ('GRC', 'SMC')),
  -- Source identifies which derivation method produced the row. Future
  -- work might add 'manual' (admin override) or 'onemap' (if we ever
  -- get constituency back directly from OneMap).
  constraint source_check
    check (source in ('eld_geojson', 'manual', 'onemap'))
);

comment on table public.postal_constituency_cache is
  'Cache layer for postal_code → constituency lookups. Keyed by '
  'postal_code, scoped by boundary_version. Rows older than the current '
  'BOUNDARY_VERSION (see lib/sg/constituency.ts) are treated as stale '
  'and recomputed lazily on next lookup.';

comment on column public.postal_constituency_cache.boundary_version is
  'Tag identifying which ELD boundary set this row was computed against '
  '(e.g. ELD_GE2025_v1). Bump when boundaries refresh; stale rows are '
  'transparently re-derived.';

-- Future query patterns:
--   1. SELECT * FROM postal_constituency_cache WHERE postal_code = ? AND boundary_version = ?
--      → primary read path. Already PK-indexed.
--   2. SELECT constituency, COUNT(*) FROM postal_constituency_cache GROUP BY constituency
--      → "how widely have we cached constituencies?" debug query. Sequential
--      scan is fine here — table is at most ~80k rows even in steady state.
