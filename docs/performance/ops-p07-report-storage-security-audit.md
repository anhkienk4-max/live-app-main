# ADA OPS P0.7 — Reports / Image Storage Authorization Audit and Staging Fix

**Date:** 2026-10-18. **Environment:** existing Clean Staging
`amagnzebmmuqiptmrjmc`; **Production remained SELECT-only**.
**Decision:** narrow Staging authorization fix **APPLIED and tested**.
Real signed JWT/HTTP/provider/upload E2E remains NO-GO.

## Why the 61 raw function-hash differences were misleading

The prior P0.6 audit found 61 `public` / `private` function definition
MD5 mismatches. Direct read-only inspection of all 178 Production and
177 Staging `pg_get_functiondef` texts established:

- **58** discrepancies are **only CRLF vs LF line endings**.
- **1** discrepancy is only SQL comments in
  `public.record_schedule_import_batch_outcomes`; executable text
  matched after removing full-line `--` comments.
- **2** are **actual executable authorization differences**:
  `public.authorize_report_image_delete(text)` and
  `public.authorize_live_report_image_delete(text)`.

After applying the two targeted function replacements, a read-only
function comparison found **59 raw MD5 mismatches**, but **zero
differences after CRLF normalization and removing full-line comments**.
Staging still lacks one Production helper:
`public.rls_auto_enable()`. This does NOT prove full environment parity,
nor does normalization with a simple comment filter formally prove full
SQL semantic equivalence. No mass rewrite or migration replay was made.

## Verified vulnerable behavior on prior Staging implementation

The two Staging image-delete preflight functions had logic like
`target_image.uploaded_by <> actor_id` and
`target_report.submitted_by <> actor_id` without explicit NULL checks.
In PostgreSQL, `NULL <> actor_id` evaluates to NULL; an
`IF NULL THEN` block does not raise an access-denied exception.

A **transaction-only synthetic proof** inserted one fake draft report
referencing an existing Shift (as FK only) and two fake image metadata
records, with `uploaded_by=NULL` and `submitted_by=NULL`.
Under one linked Member's **simulated** `request.jwt.claim.sub`
and `SET LOCAL ROLE authenticated` the pre-fix Staging functions
returned `true` for **both** image delete authorizations.

This was an authorization bypass **in Staging**, not evidence of an
active exploit, a successful deletion or a Production vulnerability.
No actual file was deleted. The entire synthetic SQL transaction rolled
back without changing any real records.

## Narrow staged fix — exact Production behavior

Installed migration on existing free Staging:
`ops_p07_staging_image_delete_null_owner_auth_fix`.

Source and fingerprint-guarded rollback:
- `supabase/reconciliation/ops-p0-staging/p07_image_delete_null_owner_auth.sql`
- `supabase/reconciliation/ops-p0-staging/rollback_p07_image_delete_null_owner_auth.sql`

Both replacement definitions were read **SELECT-only** from Production's
existing functions. New check for Member:
`uploaded_by IS NULL OR uploaded_by <> actor_id` and
`submitted_by IS NULL OR submitted_by <> actor_id`.
The dashboard image authorizer also now rejects
`report.status='confirmed'` even when `metrics_confirmed=false`,
matching existing Production behavior.

After apply, Staging's function MD5 hashes exactly match Production:
- `authorize_report_image_delete`:
  `3fcdbef68cb7337abc358ce67d84a0af`
- `authorize_live_report_image_delete`:
  `a97baa988556a0b164af1a89a470527e`

Both remain `SECURITY DEFINER` with `search_path=''`,
`anon EXECUTE=false`, `authenticated EXECUTE=true`, and server
actor checks. The ACLs were not widened. The protective change is
**Staging only**; Production already had these protections.

## Actual Staging regression evidence

Executed `tests/uat/ops-p07-staging-image-delete-auth-rollback.sql`
against existing Staging, under one simulated active linked Member
auth claim. All synthetic records stayed in a `BEGIN/ROLLBACK`
transaction. The test isolated each independent null-owner condition
for both Dashboard and Live images:

| Authorization case | Dashboard | Live |
| --- | --- | --- |
| Image uploader=NULL, report submitter=NULL | 42501 denial | 42501 denial |
| Image uploader=NULL, report submitted by Member | 42501 denial | 42501 denial |
| Image uploaded by Member, report submitter=NULL | 42501 denial | 42501 denial |
| Both uploaded/submitted by the same Member on draft | Allowed | Allowed |

**PASS — eight simulated-session assertions.**
The test only called authorization preflight, **not** provider object
deletion, file uploads, public HTTP endpoints or real signed JWTs.

Separate review: trying to fabricate a `confirmed` report with
`metrics_confirmed=false` was independently blocked by the existing
`private.enforce_report_required_metrics` trigger
(`REPORT_CONFIRMATION_STATE_INVALID`), therefore that inconsistent
state was **NOT** marked as a passed runtime test. The SQL predicate
itself matches Production.

Guarded rollback source was exercised within a rollback-only
transaction and produced all original Staging function hashes.
Rollback **was not permanently applied**, because it would restore
the authorization weakness; use only under explicit security review.

## Data preservation, governance and blockers

An independent post-apply SELECT confirmed the Staging table counts:
**9 reports, 3 Dashboard images, 1 Live image, 79 shifts, 12 users,
zero Payroll lines**. Exactly one `ops_p07_staging_image_delete_null_owner_auth_fix`
migration ledger entry exists. The four functions are not newly
granted to any roles; only two existing function bodies were changed.

The reconciliation artifacts live under
`supabase/reconciliation/` (NOT `supabase/migrations/`).
Do not merge/apply this schema patch onto Production, which already
contains these exact definitions. No Supabase Pro, database clone, Vercel
deployment or paid capacity was purchased.

Further release gates: real Supabase-signed JWT login and role
revocation, HTTP Next.js authorization, partner Drive/OneDrive
file-provider sandbox upload/delete, UI acceptance on a verified
Staging-bound Preview, complete Payroll Finance signoff, and
performance/concurrency evidence. The final verdict remains
**Production NO-GO for P0 changes**.
