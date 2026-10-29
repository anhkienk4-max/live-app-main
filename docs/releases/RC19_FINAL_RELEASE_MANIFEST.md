# RC19 Final Release Manifest — Working Candidate

Status: **PREPARATION ONLY — NO PRODUCTION MERGE, DEPLOY, SEED, OR SQL APPLY**  
Updated: 2026-10-29

## Source identity

| Item | Value |
| --- | --- |
| RC baseline | PR #146, `9d72dc8f2eaeb63952d9ad2af155583e42b30d66` |
| Storage preparation branch | `integration/rc19-final-storage-prep` |
| Storage source-integration SHA before manifest metadata | `061f195cc4c80a82feeec898a34db7f1dace8dfc` |
| Final integrated SHA | Pending RBAC-01B exact-SHA PASS and final combined gate |
| Production identity / current rollback deployment | Re-verify at release approval; not asserted by this manifest |

PR #146 remains unchanged and is the RC source baseline. The Storage preparation branch is local-only and unpushed.

## Included and deferred scope

- **Included baseline:** PR #146 source candidate and its already reviewed Core/Reports/Payroll/Wave 2/Attendance source integrations. Their checks are not re-evaluated here.
- **Storage source prepared:** corrected STO-01 13-internal-route seed/preflight and STO-02 metadata registry, API/UI, proposal SQL, preflight, and tests.
- **RBAC:** PR #145 is not included. Dynamic permissions outside a separately reviewed API/RLS-protected slice are excluded.
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

- Final candidate must include the exact reviewed Core baseline, corrected STO-01 and STO-02 source, and RBAC only if PR #145's exact current head passes RBAC-01B and its supported scope is approved.
- Run one combined exact-SHA CI after that candidate is fixed. Separate Storage PR CI does not prove corrected-seed + STO-02 + RBAC combined compatibility.
- Application rollback target: capture the active Production deployment immediately before any future release; no stale deployment ID is assumed.
- Database rollback: Owner-approved compensation/restore plan is required before any SQL. Wave 2's test rollback does not replace rehearsed post-commit compensation. STO-02 remains proposal-only; the STO-01 seed is not automatically reversible by application rollback.

## Evidence and open gates

- STO-01 PR #141 exact head `506fff4a6e7624979fe05acd9098647aa17a2569`: GitHub Actions run [40849480873](https://github.com/anhkienk4-max/live-app-main/actions/runs/40849480873) SUCCESS.
- STO-02 PR #126 exact head `9c3265c05a111e1e89dbccc6dc5b42f7b47b7c6d`: GitHub Actions run [40542940836](https://github.com/anhkienk4-max/live-app-main/actions/runs/40542940836) SUCCESS. This was before the corrected STO-01 seed; combined compatibility remains unverified.
- Storage-prepared local HEAD `061f195c`: TypeScript PASS, ESLint PASS (0 errors, existing warnings), focused Storage tests 40/40 PASS, Storage Playwright mock 6/6 PASS, and `git diff --check` PASS before this manifest was added. PGlite results are mock/embedded evidence, not PostgreSQL 17 server evidence.
- RBAC PR #145 current head `3e46cba9490789d24462c10ab977adf296613af4`: RBAC-01 review workflow [40901299289](https://github.com/anhkienk4-max/live-app-main/actions/runs/40901299289) SUCCESS; RBAC-01B workflow [40901299356](https://github.com/anhkienk4-max/live-app-main/actions/runs/40901299356) FAILURE. Therefore RBAC is not eligible for integration yet.
- No combined Storage/Core/RBAC PostgreSQL 17 gate, full final-candidate CI, authenticated UAT, Production parity check, backup/restore rehearsal, or release approval has passed in this preparation.

**Decision:** `HOLD — STORAGE SOURCE PREPARED; FINAL RC AWAITS RBAC-01B PASS, COMBINED EXACT-SHA CI, AND RELEASE GATES.`
