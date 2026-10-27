# ATT-01 #94 selective backport | Production NO-GO until independently verified

Base: `main` `9b5f3889b243f9ee795e4466a18f24cd896c162f`
Source: ATT-01 PR #112 `993ef6b2d42886a6c9d1d063ad1ed8555351fd51`
Upstream dependent PRs: #46 (RC17C Importer, unmerged) and #54 (atomic RPC, closed unmerged; final handler sourced from reviewed ATT-01).

## Chosen strategy: A plus C (selective backport, fail-closed feature gates)

No full RC19 branch, no unrelated feature migrations and no Production deployment.
Server `FEATURE_ATTENDANCE_IMPORT` and browser `NEXT_PUBLIC_FEATURE_ATTENDANCE_IMPORT` MUST **both** equal `true` to expose functionality. Defaults OFF. Admin/Leader require authenticated `requireRole`; Member may not preview/confirm.
The RC17C source migration is **NOT copied** into this release candidate. It is available for read-only comparison in upstream PR #46 / RC19. Production has already recorded an equivalent-named migration under a different version, so including the historical .sql file under `supabase/migrations/` could trigger accidental reapplication on a later main deployment. The test-only copy at `tests/fixtures/att01_rc17c_foundation.sql` is loaded into an isolated in-memory PGlite database by integration tests; it is not a deployable migration and is never applied to live Production. No SQL is executed against Production by this PR.

## Dependency matrix

| Scope | Class | Source | Reason |
| --- | --- | --- | --- |
| CSV/Excel/copied Sheets mapping and UI | REQUIRED | ATT-01 | Correct selected date precedence, numeric Excel serial, source tab selection |
| Historical parser/types/matcher/service | REQUIRED | ATT-01 | Actual evidence, strict dates, exact duplicate and intra-batch overlapping intervals |
| Import route / server handler | REQUIRED | ATT-01 | Admin/Leader auth, atomic RPC-only Confirm DRAFT, fingerprint, provenance |
| RC17C DB contract: batch/row tables + RLS + stage/confirm RPC | REQUIRED; LIVE METADATA SEEN; SEMANTIC PARITY BLOCKED | Production DB + PR #46 | Production records `20261021101021` for RC17C under a different version, so migration SQL is excluded from this candidate; do not reapply before a reviewed definition diff |
| Auth guard, admin client, shifts, staff, Workforce Actual, payroll base | ALREADY IN MAIN (source) | main | Reused, not overwritten; Production metadata confirms Actual/Payroll tables exist with RLS ON; full schema parity unverified |
| Self-service photo check-in and enhanced Payroll room rules | OPTIONAL | RC19 | Not needed for historical import |
| Reports, Storage, Swaps, Analytics, staff candidate filtering and other RC19 deltas | UNRELATED | RC19 | Excluded |
| Vercel domain/project/deployment SHA and environment key presence | BLOCKED | Production | Connector 404 project / 403 list-deployments; no authenticated identity |
| Role UAT, semantic migration parity, backup/restore | BLOCKED | Production | Migration ledger identified; semantic hash/actor permission and concurrency not independently validated |

## Data, RBAC and release safety

- Source migration creates provenance tables, policies and atomic SECURITY DEFINER stage/confirm RPCs. Direct `authenticated`/`anon` EXECUTE is revoked. The API first calls `requireRole(admin/leader)` then uses a server-only Supabase client.
- Only matched actual evidence is eligible; Confirm RPC rechecks completed shift, active worker and existing overlap, then inserts **DRAFT**, never approved Payroll.
- Exact duplicate rows and overlapping nonidentical times are exception-only; adjacent nonoverlapping splits are valid. The original fingerprint and atomic Confirm RPC are unchanged.
- **Read-only Supabase Production catalog evidence, 2026-10-27**: tables `workforce_attendance_import_batches`, `workforce_attendance_import_rows`, `workforce_actual_segments`, payroll periods/lines exist and have RLS ON; `stage_attendance_import_batch` and `confirm_attendance_import_batch` are SECURITY DEFINER, EXECUTE allowed to service_role but not anon/authenticated. Admin/Leader and service-role policies exist for import tables. Production migration ledger has a renamed entry `20261021101021` (`rc17c_attendance_import_foundation_production`). **Do not apply the included historical migration automatically or infer function body equivalence from matching names.**
- **Open technical risk requiring live gate**: verify actual Production function definitions/constraints against repo, effective actor policy behavior, concurrent replay and rollback evidence. Source tests and catalog metadata do not prove complete real role UAT.
- Production fingerprint index is **non-unique** according to read-only `pg_indexes` metadata; row-level locks/replay checks alone do not prove race-free first-import staging across concurrent requests. Independent parallel/replay UAT and, if required, separately authorized hardening remain **BLOCKED** before turning the flags ON. Never silently alter this schema in the selective PR.
- No migration file is part of this candidate; do not apply any SQL. Do not delete past attendance records or historical audit rows.
- Require authorized deployment mapping `ops5729.top → livestream-ops-demo → deployment ID → exact commit` and verified rollback ID prior to release approval.

## Release gates (not inferred from upstream SHA)

Exact candidate SHA: TypeScript, lint, attendance behavioral and atomic API tests, full main regression, browser mock, offline build.
Independent: migration compatibility and shadow rehearsal; role-specific authenticated Admin/Leader/Member tests; Vercel Production project/commit identity and Production-configured build; operator-reviewed flags and recovery plan.
Offline/CI success is **not** Production READY. Feature gates stay OFF through review.

Rollback plan: reverse backport commit only after owner approval, leave flags OFF, preserve all historical data, assess schema rollback separately without dropping provenance.
