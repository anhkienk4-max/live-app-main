# P0.9 Security Audit — Direct image deletion RPCs, Production risk

**Date:** 2026-10-18. **Owner scope:** ADA OPS.
**Database modified:** existing Clean Staging `amagnzebmmuqiptmrjmc`
only. **Production `egdjnpmoasarrttvhgds`: read-only inspection only.**
**Severity for review:** HIGH (authenticated unauthorized metadata deletion
path in a `SECURITY DEFINER` RPC). **Production release remains NO-GO.**

## Executive finding

P0.7 corrected two image-delete *authorization preflight* RPCs on
Staging. P0.8 correctly mapped preflight PostgreSQL `42501` to HTTP
403 before a cloud provider delete. **That preflight is not a complete
security boundary.** Two independently callable PostgREST RPCs:

- `public.remove_report_image(text)`
- `public.remove_live_report_image(text)`

remain granted EXECUTE to `authenticated` and implement their **own**
ownership check with SQL `uploaded_by <> actor_id` /
`submitted_by <> actor_id`. When either owner is NULL, PostgreSQL
three-valued logic evaluates `NULL <> actor_id` as unknown, so a
PL/pgSQL `IF` fails to reject the operation.

A caller with a valid Member identity could therefore delete image
metadata for a NULL-owned draft report by invoking these RPCs
**directly**, bypassing the application's preflight. The external cloud
file is **not necessarily removed** by this direct database call; the
effect is an unauthorized metadata deletion, with potential revision/
cover-image side effects.

**Important Production implication:** SELECT-only inspection of the
live Production definitions showed **the same unsafe executable owner
predicates in both direct removal functions**, and `authenticated`
has EXECUTE. We did **not** call the vulnerable mutation on Production
and did not inspect any individual customer's reports. Actual
Production exploitability with real signed JWTs requires independent
verification; the shared code logic creates an actionable security
risk. Do not interpret P0.7/P0.8 green tests as Production secure.

## Safe reproduction — existing Staging only

Within a `BEGIN` / `ROLLBACK` transaction:

1. Created one synthetic draft report referencing an existing shift only
   as a foreign-key target (no existing shift changed).
2. Inserted one synthetic Dashboard image and one Live image, with
   `uploaded_by=NULL` and `submitted_by=NULL`.
3. Set the *simulated* PostgreSQL authenticated role with an existing
   linked Member `request.jwt.claim.sub`.
4. Directly called the two mutation RPCs. **Both returned `true`**
   and deleted their synthetic metadata (remaining synthetic images
   `0/0` inside the transaction).
5. Rolled the transaction back. No real images, report, cloud files
   or user credentials were altered.

This validates the database logic path, **not a signed-JWT HTTP exploit**.

## Narrow applied STAGING fix

Migration ledger entry:
`ops_p09_staging_direct_image_delete_owner_guard`.

Source:
`supabase/reconciliation/ops-p0-staging/p09_direct_image_delete_null_owner_hotfix.sql`.

The patch modifies **only two existing function bodies** on Staging.
It replaces both Member owner tests with explicit NULL denial:
`(uploaded_by IS NULL OR uploaded_by <> actor_id)` and
`(submitted_by IS NULL OR submitted_by <> actor_id)`.
It also makes the Dashboard removal RPC reject reports with
`status='confirmed'`, not only `metrics_confirmed=true`, consistent
with its already-hardened authorization preflight.

Preserved: `SECURITY DEFINER`, `search_path=''`, authenticated-only
EXECUTE, all original audit/revision/cover-image logic, and
`anon EXECUTE=false`. Migration preflights require exact former
Staging function hashes, expected Staging row counts and RC16 tables.
Migration was rehearsed inside a rolled-back DDL transaction before
being applied once to Staging.

After applying:
- `remove_report_image(text)` MD5:
  `61361b3f2ff6ed2a4f4f71e1be3f6436`.
- `remove_live_report_image(text)` MD5:
  `7b4c1af5cf810d1d30fac246c7315c37`.

## Actual Staging functional regression

Reproducible transaction-only test:
`tests/uat/ops-p09-staging-direct-image-delete-rollback.sql`.

Result **PASS**, covering **8 checks** (two image types for four
ownership scenarios):
- Both owners NULL: both RPCs deny with `42501`.
- Only uploader NULL: both deny.
- Only report submitter NULL: both deny.
- Both owners equal the authenticated Member, report is draft:
  both metadata deletes succeed and synthetic image rows disappear.

No provider APIs or real Auth credentials were called. A fresh database
query after rollback confirmed 79 shifts, 12 staff, 9 reports,
3 Dashboard images, 1 Live image, zero Payroll lines, and **one**
Staging P0.9 migration-history entry. No synthetic metadata persisted.

## Production remediation review — **NOT DEPLOYED**

A bounded production source-based **review candidate only** is at:
`docs/security/p09-production-direct-image-delete-hotfix.REVIEW_ONLY.sql`.

This file is **NOT** in `supabase/migrations/` and has not been executed
on Production. It preflights both present Production function hashes and
will refuse to run after drift. The actual fix syntax and functional
behavior were exercised on **Staging**, not Production. The candidate
requires independent security/DBA review, a tested release/rollback plan,
and explicit authorization to modify Production; do not bundle it into
the larger P0.9/PR #36 branch release.

Production source hashes before any remediation:
- `remove_report_image(text)`: `682c1b6e46c34c7f84da888f7fd18eb7`
- `remove_live_report_image(text)`: `0567a626eba1314940d628cdc72046e5`

**Avoid an automatic rollback of the Staging fix**: restoring old
functions reintroduces the verified authorization defect. In case of
unexpected behavior, freeze mutations and assess an independently
reviewed forward fix or controlled recovery instead.

## Remaining release gates

Real Supabase-signed Admin/Leader/Member/disabled JWT tests through
Next.js and PostgREST, zero-side-effect Drive/OneDrive sandbox tests,
metadata/provider rollback/retry and concurrent requests, effective
Preview environment verification, full CI at current HEAD, and
independent security and Finance acceptance. Existing free Staging is
sufficient for the SQL UAT; no project, tier or billable infrastructure
was created.

**GO verdict: NO-GO for Production P0 changes and for the currently
unremediated direct-removal risk on Production.**


## P0.9b — additional independently confirmed Report archive bypass

A follow-up **read-only Production function-catalog scan** located
the same NULL-ownership pattern in additional publicly callable
`SECURITY DEFINER` report/workforce RPCs. Those functions must be
reviewed individually; do not assume the three P0.9 repairs cover all
report mutation endpoints.

One additional vulnerability was **independently reproduced on Staging**:
`public.soft_delete_report(text,text)`, available to
`authenticated`, accepted a Member actor for a synthetic draft report
with `submitted_by=NULL`, returned an archived/deleted row, and
mutated the synthetic report. Transaction was fully rolled back.

Narrow Staging-only migration **successfully applied**:
`ops_p09b_staging_soft_delete_report_owner_guard`, file
`supabase/reconciliation/ops-p0-staging/p09b_soft_delete_report_null_owner_hotfix.sql`.
It adds explicit `submitted_by IS NULL` denial for Member and preserves
the rest of the existing `soft_delete_report` procedure.

Staging UAT **PASS**: missing submitter yields SQLSTATE 42501;
the same synthetic report, after setting `submitted_by` to the Member,
can be archived normally. All synthetic changes ROLLBACK.
Source: `tests/uat/ops-p09b-staging-soft-delete-rollback.sql`.
Post-rollback counts remained 79 shifts, 12 users, 9 reports,
3 Dashboard images, 1 Live image and zero Payroll lines.

Production `soft_delete_report` was **NOT MODIFIED**. A second
fingerprint-guarded **REVIEW-ONLY** production SQL candidate is
`docs/security/p09b-production-report-soft-delete-hotfix.REVIEW_ONLY.sql`.
Its initial Production fingerprint is
`0814efda83fd5b89e531dfe7056ed63a`. Do not run without
independent security/DBA approval and an authorized Production hotfix
window. Other exposed mutators with nullable-owner comparisons need
a broader code/role audit before GO.
