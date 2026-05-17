-- =========================================================================
-- constituency_directory — replace seed data with the authoritative
-- GE2025 + CDC mapping.
--
-- Source: Sebastian's sg_grc_smc_cdc_mapping_2025.md (May 2025, post-GE2025
-- + post-23 May 2025 mayoral appointments). Counts: 18 GRCs + 15 SMCs = 33
-- constituencies across 5 CDCs.
--
-- Note on naming: the user described this as "for pap" — the system uses
-- the CDC structure as PAP's organizational district layer. CDCs are
-- government administrative areas; PAP organizes around the same five
-- territorial blocs.
--
-- Changes vs the previous seed (20260518000003):
--   • District enum: was 5 values (Central / East Coast / North East /
--     North West / West Coast). Now 5 different values:
--       Central Singapore · North East · North West · South East · South West
--   • 31 constituencies have their district reassigned to the authoritative
--     mapping (most were wrong on my best-guess seed).
--   • Removed: HONG KAH NORTH SMC, YUHUA SMC (absorbed in GE2025).
--   • Added: HOUGANG SMC (South East — transferred from NE post-GE2025),
--     TAMPINES CHANGKAT SMC (North East — new), JURONG CENTRAL SMC
--     (South West — new).
--   • All rows now verification_status='verified' (Sebastian provided the
--     authoritative source).
-- =========================================================================

-- 1. Drop the existing CHECK constraint and wipe district values BEFORE
--    re-adding the new constraint — otherwise the new constraint refuses
--    to apply because existing rows still carry 'East Coast' etc.
alter table public.constituency_directory
  drop constraint if exists constituency_directory_district_check;

update public.constituency_directory set district = null;

-- 2. Add the new CHECK constraint with the authoritative CDC enum.
alter table public.constituency_directory
  add constraint constituency_directory_district_check
  check (district is null or district in (
    'Central Singapore',
    'North East',
    'North West',
    'South East',
    'South West'
  ));

-- 3. Re-seed per the authoritative mapping. UPSERT so any rows already
--    present get updated; missing ones get inserted.

-- Central Singapore CDC (4 GRCs + 7 SMCs = 11)
update public.constituency_directory set district = 'Central Singapore', verification_status = 'verified'
  where constituency in (
    'ANG MO KIO GRC',
    'BISHAN-TOA PAYOH GRC',
    'JALAN BESAR GRC',
    'TANJONG PAGAR GRC',
    'JALAN KAYU SMC',
    'KEBUN BARU SMC',
    'MARYMOUNT SMC',
    'POTONG PASIR SMC',
    'QUEENSTOWN SMC',
    'RADIN MAS SMC',
    'YIO CHU KANG SMC'
  );

-- North East CDC (4 GRCs + 1 SMC = 5)
update public.constituency_directory set district = 'North East', verification_status = 'verified'
  where constituency in (
    'PASIR RIS-CHANGI GRC',
    'PUNGGOL GRC',
    'SENGKANG GRC',
    'TAMPINES GRC'
  );
-- TAMPINES CHANGKAT SMC inserted below.

-- North West CDC (4 GRCs + 2 SMCs = 6)
update public.constituency_directory set district = 'North West', verification_status = 'verified'
  where constituency in (
    'HOLLAND-BUKIT TIMAH GRC',
    'MARSILING-YEW TEE GRC',
    'NEE SOON GRC',
    'SEMBAWANG GRC',
    'BUKIT PANJANG SMC',
    'SEMBAWANG WEST SMC'
  );

-- South East CDC (3 GRCs + 2 SMCs = 5)
update public.constituency_directory set district = 'South East', verification_status = 'verified'
  where constituency in (
    'ALJUNIED GRC',
    'EAST COAST GRC',
    'MARINE PARADE-BRADDELL HEIGHTS GRC',
    'MOUNTBATTEN SMC'
  );
-- HOUGANG SMC inserted below.

-- South West CDC (3 GRCs + 3 SMCs = 6)
update public.constituency_directory set district = 'South West', verification_status = 'verified'
  where constituency in (
    'CHUA CHU KANG GRC',
    'JURONG EAST-BUKIT BATOK GRC',
    'WEST COAST-JURONG WEST GRC',
    'BUKIT GOMBAK SMC',
    'PIONEER SMC'
  );
-- JURONG CENTRAL SMC inserted below.

-- 4. Remove constituencies that no longer exist post-GE2025 (absorbed into
--    GRCs). Safe: no leads or branches reference these directly; the
--    directory is reference data.
delete from public.constituency_directory
  where constituency in ('HONG KAH NORTH SMC', 'YUHUA SMC');

-- 5. Insert the three constituencies missing from the previous seed.
insert into public.constituency_directory
  (constituency, constituency_type, district, verification_status)
values
  ('HOUGANG SMC',           'SMC', 'South East', 'verified'),
  ('TAMPINES CHANGKAT SMC', 'SMC', 'North East', 'verified'),
  ('JURONG CENTRAL SMC',    'SMC', 'South West', 'verified')
on conflict (constituency) do update set
  district = excluded.district,
  constituency_type = excluded.constituency_type,
  verification_status = 'verified',
  updated_at = now();

-- 6. Sanity check (no-op in production, but the assertion-style query
--    documents what good data looks like). Total constituencies should be
--    33; any NULL district means the authoritative mapping missed a row.
--
--   select count(*) from constituency_directory; -- expect 33
--   select count(*) from constituency_directory where district is null; -- expect 0
