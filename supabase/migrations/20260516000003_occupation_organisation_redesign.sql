-- =============================================================================
-- Occupation + organisation restructure
-- =============================================================================
-- Replaces the two free-text columns (`occupation` + `organisation`) with a
-- structured representation: applicants pick a category from a fixed
-- 8-value enum, then fill the conditionally-revealed detail / org name.
--
-- Forward-only — legacy columns are kept populated by the server (the
-- submit handler derives them from the new fields) so:
--   • the PDF renderer's existing coordinates keep working
--   • old applications stay readable on the Chairman sign page
--   • no backfill required for in-flight or historical rows
--
-- Eliminates "Nil" / "N/A" as accepted occupation values — applicants
-- now have to pick a real category, with "Homemaker" / "Unemployed" /
-- "Retired" as honest options.
-- =============================================================================

alter table public.applications
  add column if not exists occupation_category text,
  add column if not exists occupation_detail   text,
  add column if not exists organisation_name   text,
  add column if not exists school_level        text;

alter table public.applications
  drop constraint if exists occupation_category_check;
alter table public.applications
  add constraint occupation_category_check
  check (
    occupation_category is null
    or occupation_category in (
      'employed','self_employed','student','national_service',
      'unemployed','homemaker','retired','other'
    )
  );

alter table public.applications
  drop constraint if exists school_level_check;
alter table public.applications
  add constraint school_level_check
  check (
    school_level is null
    or school_level in (
      'primary','secondary','ite','polytechnic','jc',
      'undergraduate','postgraduate','other'
    )
  );

-- Reporting use case: "how many of our applicants are students vs employed?"
-- Cheap to maintain (low cardinality), useful for branch demographics.
create index if not exists idx_applications_occupation_category
  on public.applications (occupation_category)
  where occupation_category is not null;

comment on column public.applications.occupation is
  'LEGACY free-text. Server-derived from occupation_category + occupation_detail '
  'at submit time so PDF renderer + Chairman sign page keep working unchanged. '
  'Forward-only: no backfill of historical rows.';

comment on column public.applications.organisation is
  'LEGACY free-text. Server-derived from organisation_name (with category-aware '
  'logic for homemaker/other where org is blank). See lib/applications/occupation.ts.';

comment on column public.applications.occupation_category is
  'Applicant''s employment status. One of: employed, self_employed, student, '
  'national_service, unemployed, homemaker, retired, other. Drives the '
  'conditional reveal in components/applicant/OccupationOrganisationFields.';

comment on column public.applications.occupation_detail is
  'Free-text detail conditional on category. For employed/self_employed: job '
  'title or nature of business. For student: redundant with organisation_name '
  '(= school name). For national_service: service / unit. For unemployed: '
  'last occupation. For retired: former occupation. For other: free description.';

comment on column public.applications.organisation_name is
  'Company / employer / school / business name. NULL for homemaker + most '
  '"other" categories where there''s no organisation.';

comment on column public.applications.school_level is
  'Level of study, only meaningful when occupation_category = student. '
  'Optional even then. Surfaces in the admin detail view as "School: NUS '
  '· Undergraduate" — not printed on the PDF.';
