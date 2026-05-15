-- =============================================================================
-- Structured address + constituency versioning
-- =============================================================================
-- PR-1 of the postal-code-first address redesign. Replaces the free-text
-- `home_address` (which we keep populated as a back-compat / display column)
-- with structured columns: block / street / building / unit + lat/lng. The
-- new flow is: applicant types postal code → OneMap lookup → block/street/
-- building autofill → applicant fills unit. Server derives a flat
-- `home_address` string at submit time so the PDF renderer + the
-- application-detail page don't need to know about the new columns.
--
-- Constituency columns ship in this migration (rather than PR-2) so the
-- columns are in place when the GeoJSON derivation lands — no second
-- migration to coordinate with backfill / cache table.
--
-- Boundary versioning (per Sebastian's decision card 2026-05-16):
--   submission_*  →  frozen at submit time. Audit trail. Never mutated.
--   current_*     →  mutable. Re-derived after each ELD boundary refresh.
--   boundary_version → tag identifying which ELD set the current_* values
--                      came from (e.g. "ELD_GE2025_v1"). Lets future-you
--                      tell whether a row was tagged under 2020/2025/2030.
-- =============================================================================

alter table public.applications
  add column if not exists block_number   text,
  add column if not exists street_name    text,
  add column if not exists building_name  text,
  add column if not exists unit_number    text,
  add column if not exists latitude       numeric(10, 7),
  add column if not exists longitude      numeric(10, 7),
  add column if not exists submission_constituency       text,
  add column if not exists submission_constituency_type  text,
  add column if not exists current_constituency          text,
  add column if not exists current_constituency_type     text,
  add column if not exists constituency_boundary_version text;

-- GRC/SMC enum check on both constituency-type columns. Allows NULL so
-- rows submitted before the constituency-derivation feature ships
-- (i.e. anything in the PR-1 window before PR-2) don't fail the check.
alter table public.applications
  drop constraint if exists submission_constituency_type_check;
alter table public.applications
  add constraint submission_constituency_type_check
  check (submission_constituency_type is null
         or submission_constituency_type in ('GRC', 'SMC'));

alter table public.applications
  drop constraint if exists current_constituency_type_check;
alter table public.applications
  add constraint current_constituency_type_check
  check (current_constituency_type is null
         or current_constituency_type in ('GRC', 'SMC'));

-- Postal code is already a column (nullable). Enforce the 6-digit format
-- at the DB layer to match the zod check at the form layer. NULL is still
-- allowed because draft rows during the wizard's autosave have it unset.
alter table public.applications
  drop constraint if exists postal_code_format_check;
alter table public.applications
  add constraint postal_code_format_check
  check (postal_code is null or postal_code ~ '^\d{6}$');

-- Latitude / longitude range — Singapore's bounding box, with a small
-- buffer so border cases don't trip. Catches accidental swaps (which
-- would put the point in Indonesia / the South China Sea).
alter table public.applications
  drop constraint if exists latitude_sg_range_check;
alter table public.applications
  add constraint latitude_sg_range_check
  check (latitude is null or (latitude between 1.0 and 1.6));

alter table public.applications
  drop constraint if exists longitude_sg_range_check;
alter table public.applications
  add constraint longitude_sg_range_check
  check (longitude is null or (longitude between 103.4 and 104.2));

-- Indexes for the two reporting patterns this unlocks:
--   1. "Where are our members?" → group by current_constituency
--   2. "Find applications by postal code" → lookup by postal_code
create index if not exists idx_applications_postal_code
  on public.applications (postal_code)
  where postal_code is not null;

create index if not exists idx_applications_current_constituency
  on public.applications (current_constituency)
  where current_constituency is not null;

-- Column comments help future readers (the PRD now diverges from the spec
-- on address fields; the comments are the source-of-truth pointer).
comment on column public.applications.home_address is
  'Legacy / display free-text address. Server derives from block_number + '
  'street_name + building_name + unit_number at submit time. PDF renderer '
  'reads this column. Kept populated for back-compat.';

comment on column public.applications.block_number is
  'Block number from OneMap lookup (e.g. "102"). Editable in manual mode.';

comment on column public.applications.street_name is
  'Street name from OneMap lookup (e.g. "RIVERVALE WALK"). Editable in manual mode.';

comment on column public.applications.building_name is
  'Building name from OneMap lookup, if any (e.g. "RIVERVALE PRIDE"). Nullable.';

comment on column public.applications.unit_number is
  'Applicant-typed unit (e.g. "#08-123"). NULL when housing_type = Landed.';

comment on column public.applications.latitude is
  'Lat from OneMap. Used at submit time to derive constituency via '
  'point-in-polygon against ELD electoral boundaries.';

comment on column public.applications.longitude is
  'Lng from OneMap. See latitude comment.';

comment on column public.applications.submission_constituency is
  'Constituency at the moment this application was submitted. Frozen — '
  'never updated by boundary-refresh jobs. Audit trail / proof of which '
  'GRC/SMC the applicant joined under.';

comment on column public.applications.current_constituency is
  'Constituency under the LATEST ELD boundary set. Updated by the '
  'boundary-refresh job. Use this for "where are our members today?" '
  'reports.';

comment on column public.applications.constituency_boundary_version is
  'Tag identifying the ELD boundary set the current_* values came from '
  '(e.g. "ELD_GE2025_v1"). Bumped by the boundary-refresh job.';
