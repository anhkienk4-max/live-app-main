# ADA OPS P0.6 — Staging Shift Write RPC Parity & Rollback UAT

Date: 2026-10-18. Target: **existing free Clean Staging**
`amagnzebmmuqiptmrjmc`. Production project:
`egdjnpmoasarrttvhgds` remained **read-only** throughout.
No new service, Supabase paid branch or Vercel deployment was created.

## What changed, and why

Post-P0.5 schema reconciliation had restored all 14 RC16K reader
functions, Storage/Workforce tables and Payroll SQL business rules.
However, three **shift writer RPCs** still differed from live Production.
The three discrepancies blocked confidence in Calendar edit and
`execution_source` behavior on Staging:

- `public.create_shift(jsonb)` used a different
  `execution_source` presence predicate.
- `public.update_shift(text,jsonb,boolean)` was missing
  `execution_source` validation/assignment.
- `public.update_shift(text,jsonb,boolean,integer)` had
  different `execution_source` condition/formatting.

Production definitions were read with `pg_get_functiondef`
(**no Production writes**). Before editing Staging, the complete
definition/body MD5, `SECURITY DEFINER`, `search_path` and EXECUTE
ACL of all three signatures were independently inventoried on both
projects. The replacement SQL contains the **exact Production function
definitions** and has preflight guards for the known Staging hashes,
79 shifts, 12 users and prerequisite schema.

Applied on Staging as single additive/replace-body migration:
`ops_p06_staging_exact_prod_shift_write_rpc`.
The compatibility SQL stays outside `supabase/migrations/`, at:
`supabase/reconciliation/ops-p0-staging/p06_exact_prod_shift_write_rpc_staging.sql`.
It is **not a Production migration** and must not be automatically
replayed onto Production.

## Verified exact post-apply function parity

| Function | Production MD5 | Staging MD5 after | Auth execute |
| --- | --- | --- | --- |
| `create_shift(jsonb)` | `7f813fa9c9c4b25f2ed965ffc9fe872c` | MATCH | yes |
| `update_shift(text,jsonb,boolean)` | `052af1089ed967316d385007828e971c` | MATCH | **no**, intentionally |
| `update_shift(text,jsonb,boolean,integer)` | `ead3d98c97a4f293a521e1a6bf4aba3c` | MATCH | yes |

All three functions remain `SECURITY DEFINER` with
`search_path=''`. Their existing EXECUTE grants were preserved
(`anon=false` for all three). This is a privileged code path,
so auth/session and role validation inside `require_shift_actor`
must still pass end-to-end JWT tests.

## Transactional functional UAT

A **rehearsal with the replacement DDL** was first run using
`BEGIN` ... `ROLLBACK`. It returned expected Production MD5s
and unchanged role grants. A synthetic linked Admin claim under
PostgreSQL's `authenticated` role could:

1. Create a synthetic `2099-01-05` shift with
   `execution_source='internal'`.
2. Change source to `agency` using the version-checked four-argument
   `update_shift` RPC.
3. Explicitly clear source to `NULL` through the same RPC.
4. Reject unsupported source `outsourced` (SQLSTATE 22023).
5. Reject a stale expected version on the second mutation.

The script was rerun **after apply** from a checked-in source:
`tests/uat/ops-p06-staging-shift-write-rollback.sql`.
Result: **PASS**, 80 shifts temporarily *inside transaction*.
After `ROLLBACK`, an independent check confirmed **79 shifts**,
12 business users, 2 operational routes and **zero persisted fake
Payroll/Workforce rows**. No real shift was modified or archived.

A separate fingerprint-guarded rollback artifact contains the
**prior Staging function definitions**:
`supabase/reconciliation/ops-p0-staging/rollback_p06_shift_write_rpc_staging.sql`.
The rollback script itself was rehearsed inside
`BEGIN` ... `ROLLBACK` and restored the three original historical
Staging hashes in that transaction. It was **not** permanently run,
so Staging retains the current Production definitions.

## Wider function parity is NOT complete

Read-only all-function catalog inventory:
`scripts/performance/ops-p06-function-inventory.sql`.

- Production: **178** `public`/`private` functions.
- Staging: **177** functions.
- Missing on Staging: `public.rls_auto_enable()`.
- **61 matching-signature function-definition hashes still differ**.
- Across the 177 signatures common to both, no mismatch was detected in
  `SECURITY DEFINER` flag or `anon`, `authenticated` and
  `service_role` EXECUTE availability.

These 61 hash differences span Report/Image, Staffing/Auth,
Swap/Import and other historical handlers. Definition differences do
**not automatically imply an exploit or behavior divergence**;
they must be reviewed by risk and test scope before changing any
other Staging write RPC. Do **not** blindly replay old migrations
or replace the whole catalog just to force matching fingerprints.
The earlier catalog still had differences in constraints and triggers,
including intentional nullable historical storage approval records.

## Remaining integration gates — NO-GO

- Real Supabase Auth **signed JWT** and HTTP/Next.js staging Preview
  API + UI testing (not simulated claims).
- Real provider sandbox credentials for file upload/download routing,
  without touching Production Drive or OneDrive roots.
- Role revocation, constrained read scopes and concurrency under real
  sessions; integrity when account status changes.
- Review 61 unrelated function body hashes **selectively**, resolving
  only verified feature blockers, preserving old Staging business data.
- Full CI at updated PR head, Vercel Preview quota, and independent
  Finance/security review.

No Production migration, merge, deployment, Pro purchase, payroll
payment, Auth-user provisioning or folder mutation occurred.
