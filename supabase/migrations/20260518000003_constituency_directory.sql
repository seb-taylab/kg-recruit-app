-- =========================================================================
-- constituency_directory — the organizational layer above each constituency.
--
-- Singapore PAP hierarchy:
--   Branch (e.g. Kampong Glam)
--     → Constituency / GRC|SMC (e.g. Jalan Besar GRC)
--       → District (e.g. Central)
--
-- The branches table already has a free-text `constituency` column, and
-- postal_constituency_cache stores the constituency derived from a postal
-- code. This new table is the canonical "what district does each
-- constituency belong to?" mapping. Both branches.constituency and
-- postal_constituency_cache.constituency join here (case-insensitive in
-- application code; this table uses ELD-canonical UPPERCASE to match the
-- cache).
--
-- Districts are PAP-organizational, not Election Department. Five values:
--   Central · East Coast · North East · North West · West Coast
--
-- Seed data: all 32 GE2025 constituencies with best-guess district
-- assignments. Several are uncertain — taylab_staff should review via the
-- /taylab/directory editor (shipped with this migration) and correct.
-- =========================================================================

create table public.constituency_directory (
  constituency text primary key,
  constituency_type text not null check (constituency_type in ('GRC', 'SMC')),
  -- NULL = district not yet confirmed. The CHECK allows NULL OR one of
  -- the five PAP districts; admin UI surfaces NULL rows for verification.
  district text check (district is null or district in (
    'Central',
    'East Coast',
    'North East',
    'North West',
    'West Coast'
  )),
  -- ELD boundary version this row applies to. Matches
  -- postal_constituency_cache.boundary_version so a future boundary refresh
  -- can swap both tables atomically.
  boundary_version text not null default 'ELD_GE2025_v1',
  -- 'seed' for my best-guess entries below; 'verified' once taylab_staff
  -- confirms; 'manual' for entries added later by taylab_staff via the
  -- editor. UI uses this to flag rows that still need review.
  verification_status text not null default 'seed'
    check (verification_status in ('seed', 'verified', 'manual')),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users(id)
);

create index idx_constituency_directory_district on public.constituency_directory(district)
  where district is not null;

alter table public.constituency_directory enable row level security;

-- Read: any authenticated user. The directory is reference data — wing
-- admins + branch admins + chairmen all need to see "which district is my
-- constituency in" for triage + reports.
create policy "constituency_directory: authenticated read"
  on public.constituency_directory for select
  using (auth.uid() is not null);

-- Write: taylab_staff only. This is platform-level data, not per-tenant.
create policy "constituency_directory: taylab insert"
  on public.constituency_directory for insert
  with check (public.is_taylab_staff());

create policy "constituency_directory: taylab update"
  on public.constituency_directory for update
  using (public.is_taylab_staff());

create policy "constituency_directory: taylab delete"
  on public.constituency_directory for delete
  using (public.is_taylab_staff());

-- ─── Seed: GE2025 constituencies with best-guess district assignments ───
-- Names canonicalised UPPERCASE to match postal_constituency_cache.
-- District guesses are based on PAP's public district map + geography.
-- Anything uncertain stays NULL — review surface in /taylab/directory.

insert into public.constituency_directory (constituency, constituency_type, district, verification_status) values
  -- Central District
  ('JALAN BESAR GRC',                'GRC', 'Central',    'seed'),
  ('TANJONG PAGAR GRC',              'GRC', 'Central',    'seed'),
  ('BISHAN-TOA PAYOH GRC',           'GRC', 'Central',    'seed'),
  ('MARINE PARADE-BRADDELL HEIGHTS GRC', 'GRC', 'Central','seed'),
  ('MOUNTBATTEN SMC',                'SMC', 'Central',    'seed'),
  ('POTONG PASIR SMC',               'SMC', 'Central',    'seed'),
  ('MARYMOUNT SMC',                  'SMC', 'Central',    'seed'),
  ('RADIN MAS SMC',                  'SMC', 'Central',    'seed'),
  ('QUEENSTOWN SMC',                 'SMC', 'Central',    'seed'),

  -- East Coast District
  ('EAST COAST GRC',                 'GRC', 'East Coast', 'seed'),
  ('PASIR RIS-CHANGI GRC',           'GRC', 'East Coast', 'seed'),
  ('TAMPINES GRC',                   'GRC', 'East Coast', 'seed'),
  ('ALJUNIED GRC',                   'GRC', 'East Coast', 'seed'),

  -- North East District
  ('ANG MO KIO GRC',                 'GRC', 'North East', 'seed'),
  ('SENGKANG GRC',                   'GRC', 'North East', 'seed'),
  ('PUNGGOL GRC',                    'GRC', 'North East', 'seed'),
  ('NEE SOON GRC',                   'GRC', 'North East', 'seed'),
  ('JALAN KAYU SMC',                 'SMC', 'North East', 'seed'),
  ('YIO CHU KANG SMC',               'SMC', 'North East', 'seed'),
  ('KEBUN BARU SMC',                 'SMC', 'North East', 'seed'),

  -- North West District
  ('SEMBAWANG GRC',                  'GRC', 'North West', 'seed'),
  ('MARSILING-YEW TEE GRC',          'GRC', 'North West', 'seed'),
  ('HOLLAND-BUKIT TIMAH GRC',        'GRC', 'North West', 'seed'),
  ('SEMBAWANG WEST SMC',             'SMC', 'North West', 'seed'),

  -- West Coast District
  ('CHUA CHU KANG GRC',              'GRC', 'West Coast', 'seed'),
  ('WEST COAST-JURONG WEST GRC',     'GRC', 'West Coast', 'seed'),
  ('JURONG EAST-BUKIT BATOK GRC',    'GRC', 'West Coast', 'seed'),
  ('BUKIT GOMBAK SMC',               'SMC', 'West Coast', 'seed'),
  ('BUKIT PANJANG SMC',              'SMC', 'West Coast', 'seed'),
  ('HONG KAH NORTH SMC',             'SMC', 'West Coast', 'seed'),
  ('PIONEER SMC',                    'SMC', 'West Coast', 'seed'),
  ('YUHUA SMC',                      'SMC', 'West Coast', 'seed')
on conflict (constituency) do nothing;

comment on table public.constituency_directory is
  'Maps each GE2025 constituency to its PAP organizational district. Seed data is best-guess; taylab_staff should review via /taylab/directory and mark verified.';

comment on column public.constituency_directory.verification_status is
  'seed = auto-populated guess; verified = taylab confirmed; manual = added post-seed by taylab_staff. UI flags non-verified rows for review.';
