# RC19 C5.9 — Release Readiness

**Captured:** 2026-11-09 08:40 UTC  
**Repository:** `anhkienk4-max/live-app-main`  
**Branch / baseline / final local HEAD:** `release/rc19-c5.4-candidate` / `2780719ec318495c757e3c722a6e354d59f395e1`  
**Production:** `ops5729.top`, Supabase project `egdjnpmoasarrttvhgds`  
**Decision:** `READY_FOR_OWNER_RELEASE_REVIEW: NO`; `PRODUCTION_GO: NO`

## Scope and safety

This report reuses the exact-SHA C5.8 CI and the existing PG17.6 rehearsal; it does not rerun those successful suites. No Production DDL/DML, migration, ledger edit, deploy, alias change, feature-flag change, Drive operation, or business-data write occurred. This report and its companion JSON are local evidence files only; no application source was changed or committed.

The candidate checkout was clean before these two evidence files were added. `HEAD` remains `2780719ec318495c757e3c722a6e354d59f395e1`, and `origin/release/rc19-c5.4-candidate` was observed at that same SHA. C5.7 `5a503c731cceb67219c829299d074fe53253a9f7` has the expected parent `dbb8b6c786a9a0c7056ab2aaf657c2e9854a7f61`; its diff is limited to the C5.8 gate workflow, verifier script, and `vercel.json`. The memory sync is the follow-up commit at current HEAD.

## Gate summary

| Gate | Status | Evidence / limitation |
|---|---|---|
| Candidate SHA, remote ref, clean source before report | PASS | Local and remote release ref both `2780719…`; no source changes made in C5.9. |
| C5.8 exact-SHA CI | PASS | [GitHub run 42580721243](https://github.com/anhkienk4-max/live-app-main/actions/runs/42580721243), exact SHA `2780719…`. TypeScript, full ESLint, focused C5.4 tests, isolated PostgreSQL 17 RBAC/Storage checks, credential-free build, memory validation, and 20/20 migration manifest checks passed. Not rerun. |
| Migration checksum/order | PASS | Manifest SHA-256 `4513aec1757b16e97133f3963e2667156c4b7a1c12cb2b971dbb4859cd8640b6`; all 20 SQL file hashes independently matched the current checkout and the prior rehearsal. |
| PG17.6 migration replay | PASS, SQL-only scope | Existing isolated run applied 20/20 on PG 17.6 to a marked disposable database. Run source SHA was `17ee41a…`; the effective migration file bytes are 20/20 identical to this candidate. It did not exercise the deployed application, real Auth, or provider bytes. |
| Production query safety | PASS, transaction-scoped | The current query call explicitly used `BEGIN TRANSACTION READ ONLY`; the same transaction returned `transaction_read_only=on`, database `postgres`, role/session role `postgres`, application `mgmt-api`. No dedicated read-only DB role was available through this connector. Further Production reads must keep the same wrapper; no writes were attempted. |
| Current Production baseline | PASS, selected metadata only | PostgreSQL 17.6; 89 receipts, ledger head `20261101073742`; 0 of the 20 candidate migration versions have receipts. Full schema parity remains partial/unverified. |
| Production source provenance | BLOCKED | Vercel confirms live deployment `dpl_H6YfLQLdMPaUJp8JvjTqeE7n4wmS`, READY and aliased to `ops5729.top`, but its `gitSource` and `meta` are null. File/build digests do not identify a Git SHA. |
| Leader → Brand authority | BLOCKED | Production relation `rc19_leader_brand_scopes` is absent because the candidate chain is unapplied; no Owner-approved grant list or authenticated Leader proof was supplied. Fail closed; do not infer or seed grants. |
| Staffing → Attendance → Payroll persistence | BLOCKED | No safe isolated application/Auth runtime is available. Owner #168's source tests explicitly describe in-memory semantics; they do not prove DB/RPC persistence and readback. |
| Import acceptance | BLOCKED | Parser/670-row unit coverage is present and exact-SHA CI passed, but there is no persisted import-confirm/readback/reimport E2E in a verified isolated runtime. |
| Storage / Google Drive | BLOCKED | No runtime principal/effective ACL or provider-byte readback/checksum proof. Production `operational_storage_routes` and `storage_resources` currently each have 0 rows; do not interpret that as OAuth/ACL verification. Storage must remain OFF. |
| Authenticated pre-migration UAT | BLOCKED | No current controllable authenticated Production Admin/Leader/Member session was available. The browser inventory contained an older staged C4 calendar tab, not a current live Production role session. |
| Candidate authenticated E2E | BLOCKED | Ubuntu WSL is stopped, Docker engine is unavailable, `supabase` CLI is not installed, and only `.env.example` is present. No new Staging/Docker project was created. |
| Backup/PITR and independent Production restore | NOT RUN | Owner-deferred per prior decision. Synthetic fixture restore is not Production backup/recovery proof. |
| Production feature-flag effective state | BLOCKED | Source migrations default the RBAC runtime gate off and seed storage folders/routes inactive, but current Vercel/runtime effective values were not verified. |
| Production migration execution | BLOCKED | `executable_allowlist` remains empty. No migration is authorized or applied. |

## Production provenance

Vercel CLI inspection confirms the live alias still resolves to `dpl_H6YfLQLdMPaUJp8JvjTqeE7n4wmS` (`READY`, target `production`, aliases include `ops5729.top`). A separate C4 staged deployment `dpl_52bJg9T1ErjZVmk3ngGFKRwFksEU` is READY and has no aliases. The release branch push did not produce a recent Preview deployment in the observed deployment list; the newest Preview entries were 11+ days old. `vercel.json` explicitly sets `release/rc19-c5.4-candidate` to `false`. Vercel's native Git link inventory was empty, and external webhook/automation inventory is incomplete; therefore suppression is configured and observed within available inventory, not a proof about every external system.

The checked-in admin-only diagnostics handler at `lib/server/fileProviderDiagnosticsRouteHandler.ts` reports `deployment_commit_sha` only when `VERCEL_GIT_COMMIT_SHA` is present and valid. Its route requires Admin and returns `no-store`, but its response also performs provider diagnostics. No authenticated current Admin session was available to call it safely, and the deployment has no Git metadata. The current SHA cannot be reconstructed from the observed Vercel deployment record or bundle digest. A future CLI release should bind a non-secret release SHA to its build artifact and deployment, then expose only that identifier through an authenticated, no-store provenance path; that would prove a future deployment, not retroactively attest this live one. No source fix was made because it cannot establish the existing deployment's SHA without a new deployment.

## Production read-only observations

All live SQL statements used for this C5.9 report ran inside explicit read-only transactions, and each returned `transaction_read_only=on`. The connector role is `postgres`, not a restricted SELECT-only role, so this is transaction-scoped protection rather than a credential-level restriction. No further Production reads should use this connector without the explicit transaction wrapper.

Latest safe aggregates: 89 ledger receipts at `20261101073742`; 0/20 candidate receipts; 0 rows in `operational_storage_routes`; 0 rows in `storage_resources`; 0 `public`-visibility rows. Candidate-created relations including `operational_storage_domain_folders`, `operational_schedule_source_files`, `rc19_leader_brand_scopes`, `rc19_report_artifact_deletions`, `rc19_report_export_audit`, and `shift_operational_notes` are absent. An aggregate counted 1,579 active shifts, with 0 old-slot duplicate groups and 0 canonical identity conflict groups. No shift identifiers or user data were selected.

Existing evidence compares selected catalog metadata against the 89-receipt replay baseline (172 columns, 98 constraints, 29 indexes, 15 policies, and selected routine metadata). It explicitly classifies whole-schema parity as `PARTIAL_UNVERIFIED`: trigger definitions, full function bodies, and complete grants/ownership are not fully represented. Do not treat selected parity as full Production equivalence.

## Migration-by-migration compatibility matrix

Classes: **A** = additive/backward-compatible under tested schema contract; **B** = conditional on preflight, security configuration, or activation; **C** = breaking/forward-only or unsafe for direct rollback. Every row has disposable PG17.6 SQL replay PASS and matching current SQL hash; **every Production execution decision remains BLOCKED** pending release gates.

| # / Version | Exact migration file | Dependency | Class / risk | Decision |
|---:|---|---|---|---|
| 1 / `20261102110001` | `20261102110001_rc19_batch05a_report_storage_expand.sql` | Existing `report_images` and `live_report_images` contracts | A. Adds storage metadata constraints/RPC while intentionally retaining the public dashboard-image contract. Runtime read behavior was not exercised. | BLOCKED until catalog/ACL parity and old-runtime read proof. |
| 2 / `20261102135047` | `20261102135047_rc19_batch05a3_domain_storage_routes.sql` | Existing operational storage and brand domain references | A. Adds domain-first registry entries inactive by design; registry metadata is not proof of Drive ACL. | BLOCKED until route ownership and ACL isolation are attested. |
| 3 / `20261102150000` | `20261102150000_rc19_batch05a4_storage_runtime.sql` | #2 registry | B. Changes registry classification and adds source-file/probe metadata; activation and provider authority must remain separately gated. | BLOCKED; keep Storage OFF. |
| 4 / `20261102160334` | `20261102160334_rc19_batch05a41_storage_release_blockers.sql` | #3 plus existing shift/import-batch tables | B. Adds receipt-enforcement functions/triggers; an old importer that does not persist a receipt first may be rejected. | BLOCKED until old/new importer compatibility is proven. |
| 5 / `20261102170608` | `20261102170608_rc19_batch05a42_registry_and_excel_integrity.sql` | #3–#4 registry and receipt guards | B. Adds folder reconciliation and immutable receipt checks; no registry row proves effective provider ACL. | BLOCKED pending exact preflight and inactive-route assertion. |
| 6 / `20261102190000` | `20261102190000_rc19_batch01_1_agency_code.sql` | Existing shifts/brands and `create_shift`/`update_shift` RPCs | A. Adds nullable `agency_code`; existing rows are not speculatively backfilled. RPC behavior still needs old/new caller compatibility. | BLOCKED pending ADA/SNAP/AI mapping and real persisted import proof. |
| 7 / `20261102200000` | `20261102200000_rc19_batch01_3_shift_identity_index.sql` | Existing shift identity columns and active-row data | C. Preflight blocks canonical duplicates; creates normal unique index then drops old slot index, with `lock_timeout=5s`. Once parallel same-slot shifts exist, restoring old index may be impossible without reconciliation. | BLOCKED pending current preflight at execution time, lock plan, and forward-only rollback approval. |
| 8 / `20261103093137` | `20261103093137_rc19_unified_import_agency_supplemental_fields.sql` | #6 `agency_code`, shifts and import RPC contract | A. Adds typed supplemental fields and replaces RPC implementations with the existing signatures. Existing rows get a default; real-file import/reimport is unverified. | BLOCKED pending import acceptance/readback. |
| 9 / `20261103195519` | `20261103195519_rc19_c2_resource_public_and_app_edit.sql` | Existing STO02 storage tables and exact C2 fingerprints | B. Fail-closed transactional reconciliation preserves existing tables; exact current fingerprint/ownership must be revalidated before execution. No automatic public visibility grant is allowed. | BLOCKED pending version/hash approval and complete current schema/ACL preflight. |
| 10 / `20261104085945` | `20261104085945_rc19_rbac01_role_permission_enforcement.sql` | Authenticated business-user identity and private schema | B. Adds versioned role catalog and runtime gate defaulting false; actual production effective state is unknown. | BLOCKED until approved role rules and identity mapping are verified. |
| 11 / `20261104085946` | `20261104085946_rc19_rbac02_account_permission_enforcement.sql` | #10 | B. Adds account override/version/audit RPC structures; deny, expiry, revoke and session invalidation require role tests. | BLOCKED; #104 remains open and no Production overrides were created. |
| 12 / `20261104093735` | `20261104093735_rc19_rbac03_supported_permission_enforcement.sql` | #10–#11 permission catalog | B. Restricts runtime mutation to catalog actions with matching server/RLS enforcement; does not satisfy the entire Owner #104 contract by itself. | BLOCKED pending full Admin/Leader/Member matrix. |
| 13 / `20261104110000` | `20261104110000_rc19_c3_scoped_action_catalog.sql` | #10–#12 | B. Updates only actions with matching handler/RPC guards; enabling catalog policy is a security boundary. | BLOCKED until exact policy-to-handler/RLS parity is reviewed. |
| 14 / `20261104113000` | `20261104113000_rc19_c3_staffing_permission_guard.sql` | #10–#13 plus shift registrations | B. Adds authoritative staffing permission trigger; runtime/client action compatibility and revoked-scope behavior require authenticated testing. | BLOCKED pending persisted staffing authorization tests. |
| 15 / `20261104120000` | `20261104120000_rc19_c3_leader_brand_scope_reports.sql` | Business users, brands and scoped report policies | B. Adds fail-closed Leader→Brand grants and events; no schedule/name inference and no grant rows are seeded. | BLOCKED_FOR_OWNER_DATA; explicit approved Leader→Brand mapping required. |
| 16 / `20261104174527` | `20261104174527_rc19_c3_report_artifact_deletion.sql` | Report artifact metadata, provider identity and authorization | B. Durable delete intent is transactional while provider I/O is external; provider uncertainty/recovery must remain auditable. | BLOCKED pending real provider failure/recovery and role tests. |
| 17 / `20261105120000` | `20261105120000_rc19_c3_scoped_report_export.sql` | #15 scope authority and report/revision/image RLS | B. Authenticated export-only RPC checks actor scope and records audit; current Production relation/RPC is absent until migration. | BLOCKED until active approved grants and authenticated export UAT. |
| 18 / `20261107000000` | `20261107000000_rc19_shift_operational_notes.sql` | #15 Leader Brand Scope definitions plus shifts | B. Additive notes table and scope functions; without explicit Leader assignments, access must deny. | BLOCKED; cannot be treated as independently compatible with the 89-migration baseline. |
| 19 / `20261107120000` | `20261107120000_rc19_open_shifts_server_selection.sql` | Existing `private.filtered_shift_ids(text,jsonb)` and shift access policy | B. Replaces the function body without changing its signature but changes which shifts qualify as open. | BLOCKED pending old/new runtime and result-contract verification. |
| 20 / `20261108135226` | `20261108135226_rc19_staffing_candidate_brand_scope.sql` | Current staffing-candidate RPC plus #15 authority | B. Reinstates a brand-scoped RPC and intentionally fails on an unexpected existing function; existing Production definition must be fingerprinted at execution time. | BLOCKED pending RPC drift/ACL preflight and scoped role UAT. |

The precise execution order and per-file hashes are in `c5.3-final-migration-manifest.json` (20 entries, manifest SHA above). The optional private-dashboard-image contract migration `20261108135227` is **not** part of this allowlist and remains excluded. The 20-migration rehearsal kept `live-dashboard-images` public with its public-read policy; do not change it in this release.

## RBAC and workflow acceptance

### Leader Brand authority / #103 / #104

The candidate includes DB-backed, gated RBAC policy structures and a fail-closed Leader Brand-scope migration. Current Production has no `public.rc19_leader_brand_scopes` relation because migrations are unapplied, so no active Production grant can be attested. No grants were inferred from schedule, team text, or request data. Master #80 and issues [#103](https://github.com/anhkienk4-max/live-app-main/issues/103), [#104](https://github.com/anhkienk4-max/live-app-main/issues/104) remain open. The owner permission contract also requires per-account allow/deny/expiry, object scope, and server/DB parity; passing SQL unit/RLS fixtures does not prove three-role authenticated application behavior.

**Status: BLOCKED.** Required: Owner-approved Leader→Brand grant list; independent Admin, two distinct Leaders/Brands, and Member sessions; test current grant, revoke, expiry, forged IDs, cross-Agency/Brand, export, workforce, and private file reads through app APIs/RPCs. Do not create these grants in Production in C5.9.

### Staffing → Attendance → Payroll / #168 / #76

The synthetic `tests/rc19-owner23-segmented-staffing.test.ts` explicitly labels its workflow “persisted workflow pending” and mutates in-memory arrays for approval/capacity. It is not persisted RPC/API proof. Issue #168's latest comment explicitly says parser PASS is not Owner ID23 workflow acceptance; #76 remains open and separates evidence review from final hours approval before Payroll. Current Production does not have the candidate Leader scope or notes migrations; the full staffing-segment contract and production readback were not exercised.

**Status: BLOCKED.** No verified disposable Supabase Auth + Postgres app runtime was available: WSL distributions were stopped; Docker Engine pipe was unavailable; `supabase` CLI was not installed (`pnpm exec supabase status` failed with command not found); only `.env.example` exists. No new environment was created. Required future E2E: one parent shift; stable segment IDs, overnight, two concurrent Hosts, open slots despite planned names; registration/cancel/Leader approval; actual check-in/out; separate evidence review and actual-minute approval; idempotent Payroll draft/lock; read back each API/DB transition and deny cross-Brand/foreign payslip IDs.

### Import acceptance

Current source and exact-SHA CI cover parser/mapping and synthetic 670-row in-memory cases (including Agency mapping and November KAO parsing). The current Production ledger lacks all 20 release receipts; the C5.9 environment has no isolated authenticated app runtime or workbook persistence target. No 670-row workbook was confirmed into a database, and no persisted reimport/idempotency or preservation of approved records was run in C5.9.

**Status: BLOCKED for acceptance; source/CI evidence PASS only.** Future synthetic UAT must cover ADA/SNAP/AI mapping, custom fields, inline/bulk edits, filters, export, reimport, stable identity, segment parse and preservation of approved attendance/Payroll without writes to Production.

## Storage and Drive

Production has 0 operational storage route rows and 0 storage resource rows in the guarded aggregate. The application-level diagnostic source is Admin-only; it reports configuration presence and health, but does not provide verified effective ancestor ACL or a provider-byte readback. Current Edge inventory had no authenticated live Ops session; no Drive action was attempted.

**Status: BLOCKED / keep Storage OFF.** Before a separately approved upload test: verify dedicated runtime OAuth principal, ancestor ACL, private Attendance evidence isolation, ADA/SNAP/AI folder routing, exact provider file/parent IDs, DB receipt, reload/readback and checksum. Never change ACL or write a Drive file in C5.9. Drive remains an independent release gate even if the core app is phased.

## UAT plan

### Pre-migration Production (read-only only)

Once an authenticated, role-appropriate session is available, inspect only already-live routes/permissions. Record deployment ID, authenticated role, route, HTTP result, and sanitized console/network errors. Do not create/edit/assign/import/delete. Do not mark candidate-only features failed merely because their migrations are unapplied. Before navigation, verify that the chosen route/API does not call any write RPC. No live application UAT was completed in this pass.

### Candidate E2E (isolated synthetic runtime)

Not run because the isolated runtime prerequisites above were absent. Do not substitute parser mocks or the standalone migration replay for app/Auth/API E2E. Required environment is an already-approved disposable full-schema Postgres 17 database, isolated Supabase Auth, synthetic Admin/Leader/Member users and two Brands, no Production credentials, and a separate test-only Drive target (Drive test still requires separate approval).

### Post-migration Production checklist (not executed)

Only after separate Owner authorization for the exact migration hashes and after recovery gates: confirm ledger receipts and catalog deltas; verify runtime gate and Storage remain off; run Admin/Leader/Member read-only tests; test approved Leader grants/revoke/expiry and cross-Brand denies; test current import/export and reports; verify old runtime compatibility before cutover; then separately authorize any synthetic write/UAT and Drive operation. Stop on hash mismatch, unledgered incompatible object, conflict, lock timeout, policy mismatch, unexpected route activation, or runtime error.

## Recovery and rollback

- The PG17.6 synthetic replay passed 20/20; C2 storage/RLS assertions passed; gated private-image contract correctly denied without attestation and rolled back in the disposable clone. These are migration/transaction evidence only.
- The exact Shift Identity migration comments mark the index change as forward-only once parallel same-slot shifts exist. Current protected aggregate found 0 old-slot duplicate groups and 0 canonical conflict groups among 1,579 active shifts, but this does not prove future compatibility or old-application rollback.
- The 20-migration expand rehearsal kept dashboard images public. Old runtime reading the actual post-migration application was not run. Private-image contract migration is excluded.
- No Production backup/PITR or independent Production restore was inspected or created: `OWNER_DEFERRED_BACKUP/PITR`. This is NOT a recovery PASS. Schema-only rollback is insufficient if a forward migration changes operational rows or if post-cutover writes are made; rollback may require a separately verified full restore.
- No application/database rollback pairing is certified. Abort cutover on migration hash/version mismatch, unexpected object fingerprint, lock timeout, missing runtime gate, unapproved grant, active storage route, application error, or any failed readback. Stop; do not blindly retry/drop objects.

## Remaining blockers, ordered by production impact

1. **P0 — Production source provenance:** current deployment has no Git metadata; cannot prove which code serves `ops5729.top`. Record a future release SHA in a CI-attested build/deployment artifact and verify through an authenticated admin-only path.
2. **P0 — Production schema and migration approval:** 0/20 candidate receipts; whole-schema parity is partial; current execution allowlist is empty. Complete trigger/function-body/grants/ownership parity and obtain explicit Owner approval for the exact ordered manifest.
3. **P0 — Recovery:** independent backup/restore is Owner-deferred. Keep it recorded as deferred, not pass. No irreversible/forward-only action until an approved recovery decision exists.
4. **P0 — RBAC/Leader grants:** no Owner-approved grant list or current production scope source; #103/#104 open. Do not infer grants.
5. **P0 — Staffing/Attendance/Payroll:** no persisted Owner #168 workflow or #76 final approval/payslip E2E. Keep financial/attendance features behind their existing safety gates.
6. **P0 — Google Drive:** no real OAuth principal/effective ACL/readback/checksum evidence; #165 open. Storage must remain off.
7. **P1 — Import:** generated 670-row parser tests are not persisted file import/readback/reimport. Run only in the approved isolated runtime.
8. **P1 — Authenticated role UAT / feature flags:** no current live app role sessions; effective Production flag values not independently verified. The CUA inventory found only a prior staged C4 Calendar tab, not a live authenticated role session.
9. **P1 — Old/new runtime compatibility:** image reads and Shift Identity rollback behavior are not fully verified against actual runtime artifacts.

## Source changes and final decision

No application source fix was made: the only immediate source-level enhancement that would help future provenance cannot retroactively identify the existing CLI deployment and would create a new SHA without closing the live-source blocker. No source commit, push, merge, deployment, or migration was made. Added local evidence only:

- `scripts/rc19-c4-migration-rehearsal/evidence/RC19_C5_9_RELEASE_READINESS.md`
- `scripts/rc19-c4-migration-rehearsal/evidence/RC19_C5_9_RELEASE_READINESS.json`

**`READY_FOR_OWNER_RELEASE_REVIEW: NO`** — P0 evidence is incomplete.  
**`PRODUCTION_GO: NO`** — no migration, deployment, role UAT, or Drive gate is authorized/ready.

## Evidence references

- Exact-SHA CI: [run 42580721243](https://github.com/anhkienk4-max/live-app-main/actions/runs/42580721243)
- Master acceptance and November KAO contract: [Issue #80](https://github.com/anhkienk4-max/live-app-main/issues/80)
- RBAC defaults/overrides: [#103](https://github.com/anhkienk4-max/live-app-main/issues/103), [#104](https://github.com/anhkienk4-max/live-app-main/issues/104)
- Attendance/payroll acceptance: [#76](https://github.com/anhkienk4-max/live-app-main/issues/76)
- Segmented staffing persisted workflow: [#168](https://github.com/anhkienk4-max/live-app-main/issues/168)
- Real Drive upload/readback: [#165](https://github.com/anhkienk4-max/live-app-main/issues/165)
- PG17.6 replay: `c5.3-final-pg176-20261108T191556Z/acceptance.md`, `result.json`, `progress.tsv`, and per-migration logs.
- Production baseline/rehearsal caveats: `rehearsal-findings.md`, `production-baseline-comparison-c42.json`, `production-execution-plan-c42.json`.
- 20-file ordered manifest: `c5.3-final-migration-manifest.json`.
- Current read-only DB facts: explicit `BEGIN TRANSACTION READ ONLY` queries executed on 2026-11-09; current transaction returned `on`; query output contains only aggregate counts/catalog metadata.

## C5.10 execution addendum — 2026-11-09

**Source baseline:** C5.9 HEAD `2780719ec318495c757e3c722a6e354d59f395e1`  
**Final local source HEAD:** `fc3202cfe146cd823c8f9aa0406bda01a4be6848` (`fix(rc19): scope workforce capabilities and attest release builds`)  
**Branch:** `release/rc19-c5.4-candidate`  
**Production mutation/deployment:** none.

### Source changes

- Fixed Leader Workforce capability resolution in `lib/server/workforceCapabilitiesHandler.ts`: an authenticated Leader now receives team capability only when the session-scoped `rc19_current_leader_brand_ids` RPC returns a valid, nonempty `workforce.read` Brand scope. Empty, malformed, or failed scope checks deny; Admin stays global and Member does not gain team access. This complements the existing server-side Workforce scope enforcement; it does not create grants.
- Added build provenance injection from the exact GitHub workflow SHA/run ID and an Admin-only no-store `/api/internal/release-provenance` endpoint. Missing or invalid build/deployment metadata reports incomplete. This provides a mechanism for a future build; it does not attest the currently served Production deployment.
- Added focused positive and negative tests for Leader scope and provenance access/data handling.

### Verification evidence

| Gate | Result | Evidence / scope |
|---|---|---|
| Focused Workforce authority + release provenance | PASS | 11/11 on exact source HEAD `fc3202cfe146cd823c8f9aa0406bda01a4be6848`; `tests/rc19-workforce-authority.test.ts`, `tests/release-provenance.test.ts`. |
| TypeScript | PASS | `corepack pnpm type-check`; ran against source identical to final commit. |
| ESLint | PASS | `corepack pnpm lint`; 0 errors, 30 existing warnings. Touched-file lint also passed. |
| Credential-free Production build | PASS | Next.js 16.2.10 production build on exact source commit; all routes generated, including the provenance endpoint. |
| Migration manifest | PASS | `node scripts/verify-c54-release-gate.mjs`; 20 migration hashes, private contract exclusion, empty execution allowlist, branch suppression checks passed. No migration bytes changed. |
| Storage/provider contract tests | PASS | Drive provider 39/39; storage and schedule-source contracts 30/30. These are contract tests, not provider-backed Drive I/O. |
| Staffing parser/in-memory semantics | PASS, limited scope | Owner #168 tests passed, but they remain in-memory and do not establish persisted segment/registration workflow. |
| Guarded Import PostgreSQL test | PASS, one fresh disposable DB | `tests/rc19-unified-import-postgres17.test.ts` passed 1/1 on isolated PostgreSQL **17.11** using a marked disposable database. It exercised the test SQL fixture and three Import-related migrations. It is not PostgreSQL 17.6 evidence and is not application/Auth E2E. A later repeat was not valid: WSL first refused the connection, then the one-shot DB fixture rejected duplicate schema objects. No DB was dropped. |
| Prior PG17.6 rehearsal | Reused | Existing 20/20 rehearsal on PostgreSQL 17.6 remains the migration evidence; migration SQL files are unchanged. It does not verify source application behavior. |
| Exact-SHA GitHub CI | NOT RUN | C5.8 run `42580721243` is for prior SHA `2780719…`; it is not evidence for `fc3202c…`. No push or dispatch was authorized. |
| Persisted authenticated application E2E | BLOCKED | No isolated Supabase Auth/PostgREST app runtime. Docker service is stopped; available Docker Desktop processes do not establish a running engine. The standalone disposable PostgreSQL test does not provide Auth or full application runtime. |

### Remaining release blockers

1. **P0 — Owner #168 persisted staffing:** planned staffing segments are not persisted and linked to registrations. Current parser/in-memory tests do not prove registration → approval → attendance → approved actual minutes → payroll persistence/readback. Do not claim C3/C5 workflow acceptance.
2. **P0 — Authenticated role E2E:** no isolated full application/Auth runtime for independent Admin, Leader, Member persisted workflows and negative authorization checks.
3. **P0 — Leader grant data:** no Owner-approved Leader→Brand grant list for real role UAT. The code fails closed on empty/missing grants.
4. **P0 — Production provenance:** new source supports a future attestation. The existing Production deployment `dpl_H6YfLQLdMPaUJp8JvjTqeE7n4wmS` has not been retroactively attested and no deployment was made.
5. **P0 — Production schema/recovery:** 20 candidate migrations remain unapplied per prior read-only evidence; allowlist stays empty. Backup/PITR and independent Production restore remain Owner-deferred/not proven.
6. **P0 — Google Drive:** OAuth runtime principal, effective ACL, real upload receipt and provider readback/checksum remain unverified. Storage stays OFF.
7. **P1 — Persisted Import acceptance:** 670-row tests are not persisted import/readback/reimport E2E.
8. **P1 — Exact-SHA remote CI:** not run for `fc3202c…`; requires separately authorized branch publication/CI.

### C5.10 decision

- `PERSISTED_E2E: BLOCKED`
- `SOURCE_READY: NO`
- `READY_FOR_OWNER_RELEASE_REVIEW: NO`
- `PRODUCTION_GO: NO`

No push, merge, deployment, Production SQL, Drive write, or business-data mutation occurred.
