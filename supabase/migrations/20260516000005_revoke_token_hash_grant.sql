-- =============================================================================
-- Defence-in-depth: revoke column SELECT on magic_links.token_hash
-- =============================================================================
-- Sebastian's 2026-05-16 audit, finding M5. RLS already restricts which
-- magic_links rows an authenticated user can see, but the SELECT policy
-- still allows the `token_hash` column to be read by any branch admin
-- of the owning branch. Hashes are one-way (the column doesn't grant
-- token forgery) but it's needless surface.
--
-- After this, any SELECT that names `token_hash` from a user-context
-- session is rejected at the PostgREST/Postgres layer. WHERE filters
-- (e.g. `.eq("token_hash", h)`) are unaffected — those are server-side
-- predicates that don't require column SELECT permission.
--
-- The service-role client (createAdminClient) is unaffected — it
-- bypasses both RLS and column grants. All current consumers of
-- token_hash already go through that path:
--   • lib/auth/magic-link-verify.ts (admin client)
--   • app/(dashboard)/branch/initiate/actions.ts (admin client, INSERT)
--   • app/(dashboard)/branch/applications/[id]/actions.ts (admin client, INSERT)
--   • app/apply/[token]/done/page.tsx (admin client, filter-only)
--   • app/referral/[token]/done/page.tsx (admin client, filter-only)
-- =============================================================================

revoke select (token_hash) on public.magic_links from authenticated;
revoke select (token_hash) on public.magic_links from anon;
