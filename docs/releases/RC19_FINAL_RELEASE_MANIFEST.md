# RC19 Final Release Manifest — Working Candidate

Status: **PREPARATION ONLY — NO PRODUCTION MERGE, DEPLOY, SEED, OR SQL APPLY**
Updated: 2026-10-29

## Source identity

| Item | Value |
| --- | --- |
| RC baseline | PR #146, `9d72dc8f2eaeb63952d9ad2af155583e42b30d66` |
| Storage preparation branch | `integration/rc19-final-storage-prep` |
| Storage source-integration SHA before manifest metadata | `061f195cc4c80a82feeec898a34db7f1dace8dfc` |
| Final integrated SHA | Pending final exact-SHA combined Storage/Core gate |
| Production identity / current rollback deployment | Re-verify at release approval; not asserted by this manifest |

PR #146 remains unchanged and is the RC source baseline. The Storage branch is stacked on that source and will be published only after exact-branch Preview suppression is verified.

## Included and deferred scope

- **Included baseline:** PR #146 source candidate and its already reviewed Core/Reports/Payroll/Wave 2/Attendance source integrations. Their checks are not re-evaluated here.
- **Storage source prepared:** corrected STO-01 13-internal-route seed/preflight and STO-02 metadata registry, API/UI, proposal SQL, preflight, and tests.
- **RBAC:** PR #145 is not included. Its current Playwright gate is failing; RBAC remains OFF/deferred and does not block this Storage candidate. Any later RBAC inclusion requires a separate next candidate after exact-SHA RBAC-01B PASS and review.
- **Deferred/off:** attendance import and photo review, Agency #133, multi-root Storage activation, STO-01 seed execution, STO-02 schema installation, Payroll/payslip flags, and RBAC overrides. Feature defaults in `lib/flags.ts` remain false; environment-level flag values have not been inspected here.

## Database artifacts and order

The existing Core candidate migration additions remain, in timestamp order:

1. `20261028010000_rc19_reg02_multi_applicant_approval.sql` — Registration #128.
2. `20261029120000_rc19_staffing_role_scoped_gap_filter.sql` — Staffing #73.

Use the reviewed Wave 2 release checklist: legacy auto-approval remains controlled by the existing setting; do not enable competitive pending policy as a side effect.

Storage adds **no file under `supabase/migrations/`**:

- `scripts/storage/seed-v1-production-routes.sql` is a separately approved, fail-closed 13-route seed script, not an automatic migration. It has not been run. Physical-root identity/write ACL readiness remains unverified.
- STO-02 `20261027150000_rc19_sto02_resource_registry.sql` stays under `supabase/proposals/rc19-sto02-resource-registry/`; `manifest.json` sets `auto_apply: false`. Its preflight requires the existing route relation, required authorization helpers, no registry-object collision, and an unapplied migration version. It is not in the migration runner.
- The seed is not a prerequisite to create the STO-02 registry: STO-02 preflight requires the route schema and helpers, not seeded rows. If both operations are separately approved, validate the STO-02 schema preflight first; run the route seed only after its own physical-root/ACL approval.

No Production migration ledger, database backup, post-commit compensation, or restore rehearsal was verified in this preparation.

## Feature and deployment controls

- No Production flags or environment values were changed or inspected.
- Source defaults in `lib/flags.ts` keep unfinished Actual Staffing, self-attendance review, Payroll, and payslip features OFF unless explicitly configured.
- Attendance import/photo, Agency, RBAC dynamic overrides, and Storage activation remain excluded from release activation.
- Vercel branch deployment suppression is present in source for `integration/rc19-final-storage-prep`; platform-side first-push suppression has **not** been verified. No push was made.

## Dependencies and rollback

- This Storage candidate includes the exact reviewed Core baseline and corrected STO-01/STO-02 source. RBAC is not a dependency for this candidate.
- Run the existing Wave 2, Attendance, Payroll and Storage gates on the same exact pushed SHA. The Storage gate runs both PostgreSQL 17 checks on one disposable PostgreSQL 17 server, in separate disposable databases; it does not represent Production schema/UAT proof.
- Application rollback target: capture the active Production deployment immediately before any future release; no stale deployment ID is assumed.
- Database rollback: Owner-approved compensation/restore plan is required before any SQL. Wave 2's test rollback does not replace rehearsed post-commit compensation. STO-02 remains proposal-only; the STO-01 seed is not automatically reversible by application rollback.

## Evidence and open gates

- STO-01 PR #141 exact head `506fff4a6e7624979fe05acd9098647aa17a2569`: GitHub Actions run [40849480873](https://github.com/anhkienk4-max/live-app-main/actions/runs/40849480873) SUCCESS.
- STO-02 PR #126 exact head `9c3265c05a111e1e89dbccc6dc5b42f7b47b7c6d`: GitHub Actions run [40542940836](https://github.com/anhkienk4-max/live-app-main/actions/runs/40542940836) SUCCESS. This was before the corrected STO-01 seed; combined compatibility remains unverified.
- Storage-prepared local HEAD `061f195c`: TypeScript PASS, ESLint PASS (0 errors, existing warnings), focused Storage tests 40/40 PASS, Storage Playwright mock 6/6 PASS, and `git diff --check` PASS before this manifest was added. PGlite results are mock/embedded evidence, not PostgreSQL 17 server evidence.
- RBAC PR #145 current head `3e46cba9490789d24462c10ab977adf296613af4`: RBAC-01 review workflow [40901299289](https://github.com/anhkienk4-max/live-app-main/actions/runs/40901299289) SUCCESS; RBAC-01B workflow [40901299356](https://github.com/anhkienk4-max/live-app-main/actions/runs/40901299356) FAILURE. Therefore RBAC is not eligible for integration yet.
- No final exact-SHA Storage/Core gate, authenticated UAT, Production parity check, backup/restore rehearsal, or release approval has passed in this preparation. RBAC is explicitly excluded from this candidate.

**Decision:** `HOLD — STORAGE RC AWAITS EXACT-SHA COMBINED CI AND RELEASE GATES; RBAC IS DEFERRED AND OFF.`
