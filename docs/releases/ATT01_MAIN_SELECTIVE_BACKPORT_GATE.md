# ATT-01 #94 selective backport | Production NO-GO until independently verified

Base: `main` `9b5f3889b243f9ee795e4466a18f24cd896c162f`
Source: ATT-01 PR #112 `993ef6b2d42886a6c9d1d063ad1ed8555351fd51`
Upstream dependent PRs: #46 (RC17C Importer, unmerged) and #54 (atomic RPC, closed unmerged; final handler sourced from reviewed ATT-01).

## Chosen strategy: A plus C (selective backport, fail-closed feature gates)

No full RC19 branch, no unrelated feature migrations and no Production deployment.
Server `FEATURE_ATTENDANCE_IMPORT` and browser `NEXT_PUBLIC_FEATURE_ATTENDANCE_IMPORT` MUST **both** equal `true` to expose functionality. Defaults OFF. Admin/Leader require authenticated `requireRole`; Member may not preview/confirm.
The source migration is included *unchanged* for review. It is **not executed** as part of CI or this PR.

## Dependency matrix

| Scope | Class | Source | Reason |
| --- | --- | --- | --- |
| CSV/Excel/copied Sheets mapping and UI | REQUIRED | ATT-01 | Correct selected date precedence, numeric Excel serial, source tab selection |
| Historical parser/types/matcher/service | REQUIRED | ATT-01 | Actual evidence, strict dates, exact duplicate and intra-batch overlapping intervals |
| Import route / server handler | REQUIRED | ATT-01 | Admin/Leader auth, atomic RPC-only Confirm DRAFT, fingerprint, provenance |
| RC17C migration: batch/row tables + RLS + stage/confirm RPC | REQUIRED / BLOCKED | RC17C #46 | Must reconcile against real Production schema before owner-authorized application |
| Auth guard, admin client, shifts, staff, Workforce Actual, payroll base | ALREADY IN MAIN (source) | main | Reused, not overwritten; live DB parity unverified |
| Self-service photo check-in and enhanced Payroll room rules | OPTIONAL | RC19 | Not needed for historical import |
| Reports, Storage, Swaps, Analytics, staff candidate filtering and other RC19 deltas | UNRELATED | RC19 | Excluded |
| Vercel domain/project/deployment SHA and environment key presence | BLOCKED | Production | Connector 404 project / 403 list-deployments; no authenticated identity |
| Role UAT, database migration ledger parity and backup/restore | BLOCKED | Production | No live evidence or authorization |

## Data, RBAC and release safety

- Source migration creates provenance tables, policies and atomic SECURITY DEFINER stage/confirm RPCs. Direct `authenticated`/`anon` EXECUTE is revoked. The API first calls `requireRole(admin/leader)` then uses a server-only Supabase client.
- Only matched actual evidence is eligible; Confirm RPC rechecks completed shift, active worker and existing overlap, then inserts **DRAFT**, never approved Payroll.
- Exact duplicate rows and overlapping nonidentical times are exception-only; adjacent nonoverlapping splits are valid. The original fingerprint and atomic Confirm RPC are unchanged.
- **Open technical risk requiring live gate**: verify the actual Production schema, security grants, concurrent replay behavior and audit ledger. Source tests do not prove live RLS or concurrency safety.
- Do not apply any SQL in this PR. Do not delete past attendance records or historical audit rows.
- Require authorized deployment mapping `ops5729.top → livestream-ops-demo → deployment ID → exact commit` and verified rollback ID prior to release approval.

## Release gates (not inferred from upstream SHA)

Exact candidate SHA: TypeScript, lint, attendance behavioral and atomic API tests, full main regression, browser mock, offline build.
Independent: migration compatibility and shadow rehearsal; role-specific authenticated Admin/Leader/Member tests; Vercel Production project/commit identity and Production-configured build; operator-reviewed flags and recovery plan.
Offline/CI success is **not** Production READY. Feature gates stay OFF through review.

Rollback plan: reverse backport commit only after owner approval, leave flags OFF, preserve all historical data, assess schema rollback separately without dropping provenance.
