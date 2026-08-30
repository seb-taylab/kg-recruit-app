# Migration drift — repo vs. live database (twxfixwoplyctvwtbpkm)

_Recorded 2026-08-30. The repo's `supabase/migrations/` history has diverged
from the linked production database. Read this before running any
`supabase db push` against production — a naive push is unsafe._

## Summary of the divergence

1. **Only the first three migrations share version numbers** with the live
   DB: `20260513000001_init_schema`, `..2_rls_policies`, `..3_storage_buckets`.

2. **After that, the same logical migrations carry different version
   numbers** in the repo vs. the DB. The repo uses synthetic sequential
   versions (`20260514000001`, `20260516000004`, …); the live DB tracked them
   with real timestamps. Examples (same `name`, different `version`):

   | Migration name                | Repo version     | Live DB version   |
   |-------------------------------|------------------|-------------------|
   | storage_branch_scope          | 20260516000004   | 20260515190719    |
   | multi_profile_model           | 20260517000003   | 20260517154045    |
   | perf_indexes_journey_audit    | 20260518000006   | 20260517190329    |

   Because the version bookkeeping differs, `supabase db push` would treat
   almost every repo migration as "unapplied" and try to re-run it → errors
   / double-applies.

3. **The live DB has migrations that are NOT in the repo at all** (applied
   out-of-band, ahead of `main`):

   | Live version      | Name                                   | Nature            |
   |-------------------|----------------------------------------|-------------------|
   | 20260518160907    | chairman_in_person_link                | feature (adds `chairman_in_person` intended_role) |
   | 20260614090241    | enable_rls_nudge_sends_postal_cache    | security (RLS)    |
   | 20260616005847    | revoke_anon_execute_nric_functions     | security (grants) |
   | 20260616010002    | scope_nudge_sends_to_branch            | security (scoping)|
   | 20260616010102    | lock_nric_functions_from_public        | security (grants) |

4. **The repo has migrations that were never applied to the live DB under
   these version numbers** — notably the recent `20260518000007` (nric_purge
   number), `20260518000008` (taylab PII RLS lockdown), and `20260518000009`
   (chairman role). Of these, only the chairman-role constraint has been
   reconciled to production so far (see below).

## What has been applied to production so far

- **2026-08-30** — an additive constraint on `magic_links.intended_role`
  allowing `('applicant','referral','chairman','chairman_in_person')`, applied
  via the MCP migration runner so the passwordless chairman WhatsApp link
  (role `chairman`) works without dropping the pre-existing
  `chairman_in_person`. Repo file `20260518000009` was corrected to match
  (superset). **The runner recorded this under a fresh timestamp version, not
  `20260518000009`.**

- **NOT yet applied:** `20260518000007` (nric_purge number — needs
  re-checking against the live `mark_nric_purged`, which the out-of-band NRIC
  lockdown migrations may have changed) and `20260518000008` (taylab PII RLS
  read lockdown — the live `applications_select` policy still carries the
  `is_taylab_staff()` disjunct, so this is still valid to apply).

## Recommended remediation (needs the Supabase CLI + DB password locally)

The clean fix for a divergent history is to re-baseline from the live schema:

```bash
supabase link --project-ref twxfixwoplyctvwtbpkm
supabase db pull            # generates a migration capturing the live schema
# review the generated baseline, then reconcile repo history:
supabase migration list     # compare local vs remote applied versions
```

Then decide, with the generated baseline in hand:

- **Option A (recommended): squash to a live baseline.** Replace the divergent
  `supabase/migrations/` files with the single `db pull` baseline (which
  already includes the 5 out-of-band migrations), and keep only genuinely-new
  migrations (nric_purge number, taylab RLS lockdown) on top of it.
- **Option B: `supabase migration repair`** to align the version bookkeeping
  entry-by-entry — more surgical, more error-prone.

Whichever path: **never `supabase db push` the current repo history at
production as-is**, and **never drop `chairman_in_person` or the out-of-band
security migrations** (NRIC function locks, nudge_sends scoping/RLS).

## Still-open items after reconciliation

- Apply / re-derive `20260518000008` (taylab PII RLS lockdown) against the
  reconciled schema.
- Re-check `20260518000007` (nric_no purge) against the live `mark_nric_purged`
  definition, since out-of-band NRIC migrations exist.
