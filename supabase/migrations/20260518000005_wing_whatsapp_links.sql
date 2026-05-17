-- =========================================================================
-- wing_whatsapp_links — per-wing WhatsApp community invites surfaced on the
-- capture confirmation panel.
--
-- Wings configure 0..N links. Granularity per link:
--   • district = NULL AND constituency = NULL → "main" / always shown
--   • district set                           → shown to leads whose postal
--                                              resolves to that district
--   • constituency set                       → shown to leads whose postal
--                                              resolves to that constituency
-- A link can be either district-scoped OR constituency-scoped, but not both
-- (CHECK constraint below).
--
-- Territorial branches don't get this feature (per Sebastian: branch admins
-- prefer to add people to WhatsApp manually rather than publish a join URL).
-- Enforced at the application layer; schema is wing-only via the trigger.
-- =========================================================================

create table public.wing_whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  wing_branch_id uuid not null references public.branches(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 100),
  invite_url text not null check (invite_url ~* '^https://chat\.whatsapp\.com/'),

  -- Granularity. At most ONE of (district, constituency) can be set.
  district text check (district is null or district in (
    'Central Singapore', 'North East', 'North West', 'South East', 'South West'
  )),
  -- References the canonical constituency in the directory so a typo'd
  -- constituency name can't be saved.
  constituency text references public.constituency_directory(constituency)
    on update cascade on delete set null,

  display_order int not null default 100 check (display_order between 0 and 9999),
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) between 1 and 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),

  -- A link is at most ONE granularity (or main if both null).
  constraint wing_whatsapp_links_one_scope check (
    district is null or constituency is null
  )
);

create index idx_wing_whatsapp_wing_active on public.wing_whatsapp_links(wing_branch_id, display_order)
  where is_active = true;
create index idx_wing_whatsapp_district on public.wing_whatsapp_links(wing_branch_id, district)
  where district is not null and is_active = true;
create index idx_wing_whatsapp_constituency on public.wing_whatsapp_links(wing_branch_id, constituency)
  where constituency is not null and is_active = true;

-- Trigger: wing_branch_id must point to a branch with branch_type='wing'.
-- Territorial branches don't get WhatsApp links.
create or replace function public.enforce_whatsapp_link_belongs_to_wing()
returns trigger
language plpgsql
as $$
declare
  target_type text;
begin
  select branch_type into target_type
  from public.branches
  where id = new.wing_branch_id;

  if target_type is null then
    raise exception 'wing_branch_id % does not exist', new.wing_branch_id;
  end if;

  if target_type <> 'wing' then
    raise exception 'wing_whatsapp_links can only attach to wing branches (got %)', target_type;
  end if;

  -- updated_at auto-touch.
  new.updated_at = now();
  return new;
end
$$;

create trigger trg_enforce_whatsapp_link_belongs_to_wing
  before insert or update on public.wing_whatsapp_links
  for each row execute function public.enforce_whatsapp_link_belongs_to_wing();

alter table public.wing_whatsapp_links enable row level security;

-- Read: wing team (wing_admin + wing_chairman) + taylab. The capture flow
-- runs as the booth admin (a wing role), so they have read access via this
-- policy. No public read — links never leak.
create policy "wing_whatsapp_links: wing team + taylab read"
  on public.wing_whatsapp_links for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_whatsapp_links.wing_branch_id
            and p.role in ('wing_admin', 'wing_chairman'))
          or p.role = 'taylab_staff'
        )
    )
  );

-- Write: wing_admin + taylab.
create policy "wing_whatsapp_links: wing admin + taylab insert"
  on public.wing_whatsapp_links for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_whatsapp_links.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "wing_whatsapp_links: wing admin + taylab update"
  on public.wing_whatsapp_links for update
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_whatsapp_links.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

create policy "wing_whatsapp_links: wing admin + taylab delete"
  on public.wing_whatsapp_links for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
        and (
          (p.branch_id = wing_whatsapp_links.wing_branch_id and p.role = 'wing_admin')
          or p.role = 'taylab_staff'
        )
    )
  );

comment on table public.wing_whatsapp_links is
  'Per-wing WhatsApp community invites surfaced on the capture confirmation panel. Granularity per link: main (no scope) | district-scoped | constituency-scoped. At most one scope per row (CHECK constraint).';

comment on column public.wing_whatsapp_links.district is
  'When set, link shows only for leads whose postal resolves to this district. NULL means no district scoping.';

comment on column public.wing_whatsapp_links.constituency is
  'When set, link shows only for leads whose postal resolves to this constituency. Must reference an entry in constituency_directory.';
