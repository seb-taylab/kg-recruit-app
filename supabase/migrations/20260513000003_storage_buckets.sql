-- =========================================================================
-- KG Recruit App — Storage buckets + policies
-- Source: PRD Section 6 (NRIC, photo, signatures, generated-pdfs).
-- All buckets PRIVATE. Access via presigned URLs from server only.
-- =========================================================================

insert into storage.buckets (id, name, public) values
  ('applicant-photos', 'applicant-photos', false),
  ('nric-uploads',     'nric-uploads',     false),
  ('signatures',       'signatures',       false),
  ('generated-pdfs',   'generated-pdfs',   false)
  on conflict (id) do nothing;

-- Storage object access is gated by RLS on storage.objects.
-- For Phase 1 we restrict to: service role (inserts/deletes) + taylab_staff +
-- same-branch branch users. Presigned URLs let applicants/referrals view
-- without auth via expiring signed links generated server-side.

create policy "applicant-photos: branch + taylab read"
  on storage.objects for select
  using (
    bucket_id = 'applicant-photos'
    and (
      public.is_taylab_staff()
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.is_active = true
           and p.role in (
             'branch_master_admin','branch_admin',
             'branch_team_member','branch_chairman'
           )
      )
    )
  );

create policy "nric-uploads: branch admin team + taylab read"
  on storage.objects for select
  using (
    bucket_id = 'nric-uploads'
    and (
      public.is_taylab_staff()
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.is_active = true
           and p.role in (
             'branch_master_admin','branch_admin',
             'branch_team_member','branch_chairman'
           )
      )
    )
  );

create policy "signatures: branch + taylab read"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and (
      public.is_taylab_staff()
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.is_active = true
           and p.role in (
             'branch_master_admin','branch_admin',
             'branch_team_member','branch_chairman'
           )
      )
    )
  );

create policy "generated-pdfs: branch + taylab read"
  on storage.objects for select
  using (
    bucket_id = 'generated-pdfs'
    and (
      public.is_taylab_staff()
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.is_active = true
           and p.role in (
             'branch_master_admin','branch_admin',
             'branch_team_member','branch_chairman'
           )
      )
    )
  );
