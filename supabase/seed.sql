-- =========================================================================
-- KG Recruit App — Local seed
--   Kampong Glam branch
--   sebtay@msn.com → Kampong Glam Master Admin
--   seb@taylab.com → Taylab Staff (cross-tenant)
--
-- Run via `supabase db reset` (executes after migrations).
--
-- Production bootstrap MUST NOT use this file — passwords are placeholder.
-- Use Supabase Admin API (service-role) to invite the bootstrap users with
-- a password-reset email instead.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) platform_settings — Phase 1 defaults
-- -------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
  ('invite_ttl_hours',
    to_jsonb(168),
    'Default magic-link TTL — 7 days.'),
  ('invite_ttl_max_hours',
    to_jsonb(720),
    'Hard cap for per-application TTL override — 30 days.'),
  ('default_routing_mode',
    to_jsonb('direct_to_chairman'::text),
    'Routing fork default: direct to Chairman, or via Branch Admin review.'),
  ('pdf_presigned_url_ttl_days',
    to_jsonb(30),
    'PDF presigned URL expiry — 30 days from generation.'),
  ('default_pdf_recipients',
    '{"hq":true,"self":true,"custom":[]}'::jsonb,
    'Default Recipient Picker selection on Ready to Send.'),
  ('nudge_config',
    '{
      "applicant_link_unopened":   {"enabled": true, "intervals_hours": [168], "recipients": ["applicant","admin"]},
      "applicant_form_in_draft":   {"enabled": true, "intervals_hours": [168], "recipients": ["applicant","admin"]},
      "referral_unsigned":         {"enabled": true, "intervals_hours": [168], "recipients": ["referral","admin"]},
      "chairman_unsigned":         {"enabled": true, "intervals_hours": [168], "recipients": ["chairman","all_admins"]},
      "ready_to_send_unactioned":  {"enabled": true, "intervals_hours": [168], "recipients": ["all_admins"]},
      "at_hq_stalled":             {"enabled": true, "intervals_hours": [168], "recipients": ["all_admins"]}
    }'::jsonb,
    'Auto-nudge engine defaults — all 6 stages on, 168h interval.')
on conflict (key) do nothing;

-- -------------------------------------------------------------------------
-- 2) Kampong Glam branch
-- -------------------------------------------------------------------------
insert into public.branches (id, name, constituency, hq_email, default_routing_mode, is_active)
values (
  '11111111-1111-4111-8111-111111111111',
  'Kampong Glam',
  'Kampong Glam',
  null,                         -- Master Admin configures via UI
  'direct_to_chairman',
  true
)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 3) Seed users — direct auth.users insert (local-dev only)
--    Password: 'ChangeMe!2026' for both. Reset on first login.
-- -------------------------------------------------------------------------
do $$
declare
  master_admin_id uuid := 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  taylab_staff_id uuid := 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  seed_password text := 'ChangeMe!2026';
begin
  -- Master Admin (Kampong Glam)
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    master_admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'sebtay@msn.com',
    crypt(seed_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sebastian Tay"}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    master_admin_id,
    jsonb_build_object('sub', master_admin_id::text, 'email', 'sebtay@msn.com'),
    'email',
    'sebtay@msn.com',
    now(),
    now(),
    now()
  )
  on conflict do nothing;

  insert into public.profiles (
    id, full_name, role, branch_id, position, is_active, created_at
  ) values (
    master_admin_id,
    'Sebastian Tay',
    'branch_master_admin',
    '11111111-1111-4111-8111-111111111111',
    'Other',
    true,
    now()
  )
  on conflict (id) do nothing;

  -- Taylab Staff (cross-tenant)
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    taylab_staff_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'seb@taylab.com',
    crypt(seed_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sebastian Tay"}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    taylab_staff_id,
    jsonb_build_object('sub', taylab_staff_id::text, 'email', 'seb@taylab.com'),
    'email',
    'seb@taylab.com',
    now(),
    now(),
    now()
  )
  on conflict do nothing;

  insert into public.profiles (
    id, full_name, role, branch_id, is_active, created_at
  ) values (
    taylab_staff_id,
    'Sebastian Tay',
    'taylab_staff',
    null,
    true,
    now()
  )
  on conflict (id) do nothing;
end $$;
