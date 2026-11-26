# RC19 W4 — Release Engineering Handoff (2026-11-26)

## Scope and checkpoint

- Repository: `anhkienk4-max/live-app-main`
- Release engineering branch/worktree: `chore/rc19-w4-release-readiness` / `C:\Users\KienNguyen\Downloads\KIEN ADA code\OPS LIVESTREAM PLATFORM\rc19-w4-release-readiness`
- Base and current source HEAD: `54951ffb9ed34547dca93fbd077f22823a2dbe5a` (Unified D123 candidate supplied by Owner)
- `origin/main` observed locally: `9b5f3889b243f9ee795e4466a18f24cd896c162f`
- Target for local experiments: a new, marked disposable database only. No Production or Staging SQL/write occurred.
- Scoped changes are limited to this handoff and the two RC19 release workflow files; no Lane 01 business source, business migration, or shared authorization schema was changed.

This handoff distinguishes **implementation evidence**, **scoped acceptance**, and **final release acceptance**. Nothing here establishes Production READY.

**Candidate provenance check:** the supplied D1 reference `6923a0bd…` and D2 reference `5eb3992c…` exist locally but are not ancestors of `54951ffb…`; D2's workflow route/handler/migration paths are present at the candidate under the later local history, while the exact source commit is not. This is a provenance gap, not proof that the candidate lacks those changes. Lane 01 should map the source commits or patch-equivalent history before asserting D123 integration. The supplied D1 frontend review `d7fce3ef…` is an ancestor.

## Roadmap and integration PR state

The current [Owner roadmap linked from #173](https://github.com/anhkienk4-max/live-app-main/blob/docs/rc19-owner-uat-codex-gemini-20261111/docs/rc19/OWNER_UAT_2026-11-11_CODEX_GEMINI_ROADMAP.md) preserves #80 KAO requirements, separates Codex contracts from Gemini UI integration, and requires Admin/Leader/Member UI+API+database readback, audit, negative/edge tests and exact-SHA evidence. Its issue/roadmap text is requirement evidence, not acceptance.

- [PR #187](https://github.com/anhkienk4-max/live-app-main/pull/187) is open, targets `main` at `9b5f3889…`, and has head `8fab7eac…`; its body reports local PG17 restore and a 130-migration audit on that older head. The supplied candidate descends from that head, but these claims are not exact-`54951ffb…` restore or release acceptance.
- [PR #188](https://github.com/anhkienk4-max/live-app-main/pull/188) is open/mergeable, based on `8fab7eac…`, head `f28f94ff…`; current candidate descends from its head. It remains implementation/integration evidence, not Production acceptance.
- [PR #191](https://github.com/anhkienk4-max/live-app-main/pull/191) is draft; current PR head is `1065e070…`, while the PR body cites `85984b7a…` as its exact SHA. The supplied candidate descends from the current head, but that body/head mismatch must be reconciled before citing its evidence as exact. Issue [#189](https://github.com/anhkienk4-max/live-app-main/issues/189) remains a real-provider/live-media acceptance gate.
- Issue [#190](https://github.com/anhkienk4-max/live-app-main/issues/190) is new and not accepted; Deltas C/D and final A+B+C+D release acceptance remain distinct from the current D123 candidate until Lane 01 supplies the final integrated SHA.

## Current gate matrix

| Gate | Requirement | Current evidence / tested SHA | Environment | Owner / dependency | Status | Remaining work |
|---|---|---|---|---|---|---|
| A — GoTrue recovery | Identify image, migration checksums, Auth catalog/ledger, roles/config, clone completeness and actual DB target; prove cold start against a fresh database | User reports `supabase/auth:v2.197.0`, PG 17.11, 75 Auth receipts and startup `SQLSTATE 42703 column "client_id" does not exist`. Not independently observed. Supplied candidate HEAD `54951ffb…`; no runtime SHA evidence. | Named clone `rc19_d123_review_20261126_54951` not reachable/identified from this workspace | Codex; requires verified disposable target marker and sanitized Lane 01 ledger/catalog/runtime evidence | **BLOCKED** | Verify actual target marker first; collect Auth image digest, both migration ledgers/checksums and catalog; compare a known-good D1 runtime; then run fresh pinned stack cold start and synthetic login. Do not change managed Auth schema or fabricate receipts. |
| B — application migration reconciliation | Exact 140 local files vs 135 clone receipts, 116 common, 24 local-only, 19 remote-only, 43 unmatched; identify 16 cross-version SQL matches and 2 unknown provenances | Current checkout has 140 migration files. Other counts and mismatch facts are Owner-provided for the named clone; no per-version receipt export is available here. Prior report is dated 2026-11-18 and concerns a different 132-file / 117-Production-receipt snapshot. | Clone ledger not connected | Codex; Lane 01 reviews and approves any remediation | **BLOCKED** | Obtain read-only clone receipt export after target assertion. Produce row-level CSV with local and remote SQL hashes, statement identities, Git provenance, order/dependencies, schema impact, remediation and risk. No rename, replay, blanket repair or hand-written receipt. |
| C — fresh runtime | Fresh pinned Postgres, GoTrue and PostgREST; unique marker/ports; cold-start health; synthetic sign-in; JWT and API check | No local stack was started. Docker API is responsive; 9 containers are running including the existing RC19 recovery stack, but its target marker and actual DB connection were not queried. CLI tools are absent. Hosted rehearsal workflow is prepared but not run. | Local disk free 6.50–6.65 GiB; no local capacity for safe image/data pulls. | Codex; hosted runner and Lane 01 acceptance evidence required | **BLOCKED locally; READY for hosted rehearsal after trigger eligibility and push safety** | Route the sanitized Lane 01 evidence; run the isolated hosted rehearsal only from an eligible ref. Keep fresh stack separate from historical upgrade rehearsal.
| R — Official Restore | Run the official backup/restore path on an isolated, marked target with compatible PostgreSQL tools; record integrity and time/resource evidence | Existing runbook and CI fixture restore exist. New hosted job prepares only a synthetic PostgreSQL 17.11 dump/restore infrastructure smoke; it is not Official Restore. No approved source backup or exact official restore result exists. | Local Docker API responds but no local restore was attempted; hosted workflow is not run | Codex prepares evidence; runbook source owned by Antigravity; final exact-candidate restore waits for unified A+B+C+D | **NOT READY / NOT PASS** | Obtain approved sanitized/synthetic backup, exact final candidate, compatible pinned tools and measured capacity; complete separate official restore and parity review.
| CI — exact candidate gate | Correct trigger/allowlist, checked SHA vs PR head/merge SHA, type/lint/credential-free build, memory validation, PG17 suites, mandatory skip policy, restore, retention/failure reporting | Static YAML and SHA/security assertions pass locally. Current gate has required dispatch SHA, explicit source/test SHA, sanitized 14-day artifact, PG17.11/Ubuntu 24.04/Node 24.18.0/pnpm 10.26.0 pins; memory:validate remains. Separate hosted rehearsal has SHA guard and 14-day sanitized infra manifest. Neither workflow is on origin/main or has a remote run. | Exact HEAD 54951ffb…; no GitHub run | Codex; Vercel Preview trigger requires Owner decision | **READY for static review; NOT RUN** | Do not dispatch until workflow exists on default branch. No push until Owner decides Preview trigger handling. Official Restore stays separate.
| KAO #184 | Diagnose date ambiguity, wrong shift date, dropped staffing segments and downstream attendance/payroll/report links; prepare read-only query and dry-run repair | Issue #184 records historical Production evidence: source display `11/1/2026` (Sunday, Nov 1), normalized/persisted Jan 11; source has 3 K01–K03 lines while stored segment count was 0. This is issue evidence, not a fresh query or current-candidate acceptance. | Production read-only target not bound/queried | Codex read-only preflight; Lane 01 owns integration; Owner must approve any record repair | **WAITING FOR OWNER APPROVAL** for Production data access/repair; diagnostic plan ready | Use a verified read-only connection and exact batch/shift IDs to re-read source row, parent, segments and attendance/payroll/report references. Compute before fingerprint. Submit dry-run mapping and rollback plan; wait for explicit approval before any write. Never delete/re-import. |
| G11 #165 | Actual Google OAuth/provider upload/readback; folder hierarchy, metadata/checksum, persisted receipt, ancestor ACL and unauthorized denial, safe export, fresh-session readback | Existing [backup/recovery and G11 runbook](RC19_W4_PRODUCTION_BACKUP_AND_G11_RUNBOOK.md) is preparation only. Vercel project-scoped Production env inventory had 21 keys; no Production-scoped Google OAuth mode/refresh-token key was returned. No file was uploaded and no ACL changed. | Real Drive provider not verified | Antigravity owns source patch; Owner approval and real app OAuth/test folder/account required | **WAITING FOR OWNER APPROVAL** | Run a synthetic canary only in an Owner-approved folder after app OAuth identity is verified; record file/parent IDs, MIME, bytes, SHA-256, receipt readback, effective ancestor ACL, denial from a separate unauthorized session and fresh authorized readback. No synthetic-provider acceptance claim. |
| Production preflight / rollback | Verify deployment/source, project binding, environment-key inventory, Supabase identity/baseline, backup age, compatible rollback target, guards and health/smoke checks | Vercel project `livestream-ops-demo` (`prj_YSrsxfYK7skM17D3KtiXUGeim2kr`); `ops5729.top` verified on it. Latest listed Production deployment `dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E` is READY but `source=cli`, `meta={}` and has no Git source SHA. Supabase project listing returned `egdjnpmoasarrttvhgds` ACTIVE_HEALTHY PG 17.6.1.155 and `amagnzebmmuqiptmrjmc` ACTIVE_HEALTHY PG 17.6.1.155; app-to-project runtime binding was not proven. | Metadata-only Production checks; no app/database write | Owner / release owner; verified read-only app/DB binding and backup evidence required | **BLOCKED** | Verify deployment's Git/source provenance, Production branch, runtime variable binding (key names only; never export values), Supabase marker/project identity, migration baseline and backup freshness. Check feature guards and authenticated smoke tests only after approved read-only identities exist. |

## A. GoTrue and fresh-runtime investigation

The reported exception is not yet root-caused. Upstream Auth issue [#2251](https://github.com/supabase/auth/issues/2251) is an open user report with a log naming `20250731150234_add_oauth_clients_table.up.sql` and the same missing `client_id` error. The reporter's post speculates about a pre-existing/partial `auth.oauth_clients` table and column/index order; there is no maintainer-confirmed diagnosis in the issue. Treat it as a useful comparison, not proof that this clone has the same database state.

Read-only collection, after confirming the clone by database marker:

```sql
SELECT current_database(), inet_server_addr(), inet_server_port(),
       current_user, current_setting('search_path'), current_setting('server_version');
SELECT shobj_description(oid, 'pg_database') AS database_marker
FROM pg_database WHERE datname = current_database();
SELECT table_schema, table_name, column_name, ordinal_position, data_type
FROM information_schema.columns
WHERE (table_schema = 'auth' AND table_name IN ('oauth_clients', 'schema_migrations'))
   OR (table_schema = 'supabase_migrations' AND table_name = 'schema_migrations')
ORDER BY table_schema, table_name, ordinal_position;
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
FROM pg_roles WHERE rolname = current_user;
```

Then capture Auth and application migration ledgers independently, including exact stored statement text and empty/null statement status. Inspect the actual Auth catalog columns/constraints/index definitions and migration source/checksums. Inspect the Auth container's configured image tag and immutable digest plus effective DB host/name/schema/search path; never infer the target from a running process name. Compare with the known-good D1 runtime only after its connection target and image digest are separately attested.

Fresh-stack acceptance must show: unique database marker read through the same connection Auth uses; pinned Postgres/Auth/PostgREST versions; cold start logs with no migration error; Auth health endpoint; synthetic disposable user sign-up/login; locally verified JWT claims/signature; authenticated PostgREST request; anonymous/unauthorized denial where expected. Synthetic user and local credentials only. Never repair the existing managed Auth schema or insert synthetic Auth ledger receipts.

## B. Current-clone migration reconciliation

The historical [2026-11-18 migration report](RC19_W4_MIGRATION_LEDGER_RECONCILIATION.md) says 132 local migrations / 117 Production receipts / 98 common versions. It must not be reused as the named clone's 140 / 135 / 116 inventory. It contains useful historical Git/catalog evidence, including a prior note about `20261111200000`, but it does not establish that the current clone has the same catalog or provenance.

The exact current-clone reconciliation is not generated because the actual remote receipt rows and Auth ledger cannot be read here. The numbers supplied by Owner imply 24 local-only and 19 remote-only application versions (43 total unmatched); those are arithmetic from the supplied totals, not row-level verification. The 16 cross-version SQL matches, two unproven receipts and empty `20261111200000` remain unpaired pending raw export.

Once a read-only clone connection is available, export (without rewriting) every `supabase_migrations.schema_migrations` row ordered by version, preserving `name`, null/empty distinction, each statement's original text, and any receipt checksum. Discover the actual Auth ledger relation from the catalog before exporting it. Hash each statement client-side with SHA-256; hash each local file byte-for-byte; use `git log --all --follow` and historical manifests to establish source provenance. The handoff table must contain:

`Version | Filename | Local SQL SHA-256 | Remote receipt name | Remote statement SHA-256(s) | Statement identity/pair | Git provenance | Migration order | Dependency | Schema impact | Proposed remediation | Risk`

For `20261111200000`, retain `statements = '{}'` exactly as observed; do not reconstruct SQL from a historical note. Lane 01 reviews the proposed remediation before any integration. No renames, replays, blanket migration repair or manual receipt creation are authorized.

## C. Official Restore and CI

The current release gate uses a PostgreSQL 17.11 service on Ubuntu 24.04, checkout/setup-node pinned by Action SHA, Node 24.18.0 and pnpm 10.26.0. It retains mandatory memory:validate, typecheck, ESLint, separate PG17 disposable tests, canonical Node regression and a credential-free build; the build blanks Supabase URL/key/secret values. It runs synthetic fixture backup/restore, not Official Restore. The regression runner rejects test failures and unapproved skips; exact-skip accounting remains part of final gate evidence.

The release gate asserts checked-out SHA, explicit source-head SHA, tested/merge SHA and a required exact SHA for manual dispatch. A sanitized exact-SHA attestation artifact is retained for 14 days. The separate rc19-w4-infrastructure-rehearsal.yml adds a hosted infrastructure-only flow and its own 14-day sanitized artifact. Both workflows are absent from origin/main at this checkpoint; no workflow run or check status exists for the candidate. GitHub workflow_dispatch is not eligible until the workflow exists on the default branch. Neither artifact is an Official Restore report.
Official restore is still a separate, later gate: capture the exact timed-out command and logs, identify whether timeout came from Docker startup, database export or restore; record CLI/pg_dump/pg_restore versions and source PG major/minor; measure dump bytes and peak memory/disk; allocate a dedicated runner; verify the database marker before and after restore; compare schema, roles/ACL/default ACL, extensions, triggers, RLS, constraints/indexes/functions and all migration receipts; record restore time and retry/rollback evidence. The read-only Docker API responded at the 2026-11-26 checkpoint and showed active unrelated workloads plus an existing RC19 recovery stack. Available free disk is approximately 6.5 GiB, too low to assume a full database clone is safe. No Production data was exported.

## D. KAO #184 diagnostic and dry-run plan

The existing issue evidence identifies the historical defect before calendar display: ambiguous-looking `11/1/2026` was stored as January 11 while the sheet weekday and stable code identify November 1; the source preserved three slot lines while canonical child segments were absent. It does not authorize editing that row.

With a verified read-only Production connection, capture target identity and read the exact import batch/row, its raw source date/time/code/locale, `source_row` payload, parent shift date/start/end/status/capacities, child segment rows and all linked attendance, staffing, payroll and report identifiers. Resolve date from the actual Sheets serial/locale/timezone and stable business code; preserve the original source. Prepare a proposed mapping for K01–K03 and compare role capacities and planned names without converting planned names into assignments or pay. Hash canonical before/after query output client-side. The dry run must show expected parent/segment counts and downstream references. A later authorized repair must be transactional, audited and reversible from a captured before-image; never delete/re-import.

## E. G11 real-provider verification

Use only the app's real Google OAuth/provider identity. Before an Owner-approved canary, confirm a non-sensitive test folder and an authorized plus unauthorized test account. Upload a synthetic file with a unique run ID; record provider file ID, parent folder ID, MIME, size, SHA-256, persisted receipt, effective ACL including every ancestor, and external-safe export. Start a fresh session and read the file back; repeat under an unauthorized account and prove denial. Keep attendance photos private. No live upload or ACL mutation was performed, and connected Drive access outside the app is not app acceptance.

## F. Production preflight and rollback

Metadata-only current observations: verified domain-to-project binding for `ops5729.top`; latest listed deployment is READY but came from Vercel CLI without Git source metadata; project-level Production environment inventory returned 21 Production-scoped keys (names only). That inventory did not return Production-scoped `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, or `SUPABASE_SECRET_KEY`; runtime-injected values or other integrations were not tested, so treat this as a binding discrepancy to resolve, not proof of runtime absence. No variable values were read. Supabase project listing returned `egdjnpmoasarrttvhgds` as active PG 17.6.1.155, but this does not prove the deployed app uses it. Docker Desktop/backend processes were present, but container/volume identity could not be checked because the Docker API did not answer; no stack/volume was created, reset or deleted. Staging was not queried beyond project metadata.

Rollback candidate metadata: `dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E` is marked as a Vercel rollback candidate, but its source SHA is unattested. Before any future release, confirm its source/provenance, Vercel project and Production branch; confirm database migration compatibility and a fresh backup; verify all new features are guarded; prepare the prior deployment and owner contact. For an incident, stop rollout, capture current deployment/schema/health evidence, then use the approved Vercel rollback target only if schema remains backward-compatible. Do not roll back schema by replaying/reversing migrations without a separately reviewed recovery plan. Verify health, authentication, role-denied paths, calendar/import, reports and audit after an authorized rollback. No rollback/deployment was performed.

## Explicit dependency matrix

| Work item | Depends on | Unblocks |
|---|---|---|
| Identify current clone | Owner-provided read-only endpoint/path; target database marker; verified PG17.11 server identity | GoTrue root-cause review and exact ledger export |
| GoTrue fresh-stack proof | Responsive Docker engine; enough disk for pinned images and data; official pinned Supabase CLI/image references; unique ports/database marker | Auth runtime handoff to Lane 01 |
| Exact ledger artifact | Read-only clone application/Auth receipt export; local 140-file inventory; Git history/baseline manifests | Lane 01-approved migration remediation proposal |
| Official restore | Unified A+B+C+D exact SHA; authorized sanitized/synthetic backup source and size; compatible PG17 tools; measured isolated capacity | Final restore acceptance (never replaced by fixture-only CI restore) |
| Exact CI result | Remote ref or authorized dispatch at selected exact SHA; current workflow patch; mandatory suites complete | Candidate-level CI gate |
| KAO #184 | Verified read-only Production connection; exact batch/row; source date semantics; downstream reference set | Owner-reviewed dry-run repair and later separately authorized repair |
| G11 #165 | Real app Google OAuth; Owner-approved test folder and two test identities; fresh-session readback | Real-provider G11 scoped acceptance |
| Production preflight/rollback | Attested Vercel source and Production branch; runtime Supabase binding; migration baseline; fresh backup; schema-compatible rollback target | Owner GO review |

## Work ready now versus waiting

- **READY NOW:** isolated branch/worktree; local 140-file count; existing historical restore/G11 and migration reports preserved; read-only KAO diagnostic plan; workflow exact-SHA/trigger patch; Vercel/Supabase metadata inventory with secret values withheld.
- **WAITING FOR UNIFIED SHA:** official exact-candidate restore and final exact-SHA full CI/acceptance. Candidate provenance between supplied D1/D2 source refs and the D123 label also needs Lane 01 mapping.
- **WAITING FOR OWNER APPROVAL:** Production operational-record repair, real Drive canary upload/ACL test, and any Production-side acceptance requiring credentials.
- **BLOCKED:** fresh Docker/Supabase runtime, exact current-clone receipt reconciliation, and deployed-app-to-Supabase binding, because the relevant runtime/connection evidence is unavailable.

## Owner GO checklist and dependencies

- [ ] Lane 01 confirms and freezes the unified D123/A+B+C+D candidate SHA; reports above are not source or acceptance evidence.
- [ ] Clone owner supplies a safe read-only connection path to `rc19_d123_review_20261126_54951`; target marker and PG17.11 are proven before any query is treated as clone evidence.
- [ ] Runtime recovery: fresh pinned stack passes cold start, synthetic login, JWT and PostgREST checks against its unique database marker.
- [ ] Migration reconciliation: exact application and Auth ledgers are exported and row-level artifact is reviewed by Lane 01; no manual receipt/ledger edits.
- [ ] CI gate runs against exact final candidate SHA; PR merge SHA is reported separately; no mandatory test is skipped; official restore is not substituted by fixture restore.
- [ ] Official restore completes against a marked isolated target using the authorized synthetic/sanitized baseline and measured capacity.
- [ ] KAO read-only diagnostics and proposed repair are reviewed; any production record write waits for explicit Owner approval.
- [ ] G11 actual provider and ACL/readback acceptance runs only after Owner-approved canary folder/accounts.
- [ ] Production deployment SHA, branch, runtime Supabase target, backup freshness, schema compatibility and rollback target are attested.
- [ ] Owner authorizes final GO after all mandatory functional, security, database/Drive and recovery evidence is tied to the exact candidate.

**Current decision: NOT PRODUCTION READY.** Local handoff artifacts and a focused CI patch are prepared. Fresh runtime, exact current-clone reconciliation, official restore, KAO data readback, Drive acceptance, current deployed SHA and final Owner GO remain open.



## RC19 W4 infrastructure recovery checkpoint (2026-11-26)

### Safe resource preflight

Read-only measurements on this host varied between 6.50 and 6.65 GiB free on C: across the checks. Docker API responded to read-only inventory. Docker Desktop, its backend/build agents, Ubuntu 24.04 WSL, and docker-desktop WSL were already active.

Docker showed 14 images (10.74 GB; 0 reclaimable), 171 containers (9 running), 31 local volumes (14 in use; 4.761 GB total), and 61 build-cache entries. Nine running containers included six DTK services plus the existing RC19 recovery PostgREST, GoTrue v2.197.0, and PostgreSQL 17.11 containers. The recovery database has an attached existing volume. No container, volume, cache, image, or WSL state was changed. No Docker prune, restart, stack start, SQL, or database connection was attempted.

The release worktree has no `node_modules`; host `psql`, `pg_dump`, `pg_restore`, and `supabase` binaries were not found. The separate D123 review worktree's 1.44 GiB dependency directory is not linked and was not reused. There were many Node/WSL/Docker processes; name-based process inspection does not establish that no unrelated test task is active. These measurements leave no basis for a local rehearsal.

### Sanitized Lane 01 evidence request and reconciliation artifact

No Lane 01 thread could be identified from the available Codex thread history, so no message or database query was sent. Route this request in the Lane 01 task and provide its sanitized artifact by a local path:

> From the verified disposable database only, export: database name and unique marker; PostgreSQL server version; application migration versions and statement SHA-256 values; Auth migration versions; Auth catalog metadata limited to migration ledger and relevant OAuth client columns/indexes/constraints; runtime image tag/digest; and effective connection identity (database, host/service, schema, search_path, role). Include how the disposable target was verified. Exclude Auth user records, credentials, JWTs, secrets, and raw Production dumps. Preserve null versus empty statements. Do not alter schemas or migration receipts.

The current Owner-supplied counts remain unverified row-wise: 140 local files, 135 application receipts, 116 common versions, 24 local-only, 19 remote-only, and 43 unmatched versions. The 16 SQL-content matches at differing versions must be represented as cross-version pairs within those version sets, not silently collapsed. Two remote receipts have no proven source provenance. Preserve the empty `20261111200000` receipt exactly as reported. No matching receipt payloads or named-clone marker were exported here, so no exact reconciliation rows or remediation are fabricated.

The row-level artifact must include, for each local file and remote receipt: version, filename/name, SQL SHA-256 per statement, statement identity/pair classification, Git commit/path/branch or baseline-manifest provenance, migration order, dependencies, schema impact, proposed remediation, and risk. Include separate local-only, remote-only, common-version, cross-version-SQL-match, unproven-provenance, and empty-statements classifications. Derive local provenance from `git log --all --follow`, historical branches and baseline manifests. Record evidence source and target marker with each export. Lane 01 must review and approve proposed remediation before integration; do not rename, replay, rewrite, fabricate receipts, or perform blanket repair.

### Hosted rehearsal workflow (separate from final release gate)

Added `.github/workflows/rc19-w4-infrastructure-rehearsal.yml` for GitHub-hosted Ubuntu 24.04 only. It has branch push, PR-to-main, and required exact-SHA `workflow_dispatch` triggers; read-only repository permissions; an exact checkout/source-head/tested-merge/dispatch-SHA assertion; PostgreSQL 17.11 synthetic dump/restore infrastructure smoke; and a fresh Supabase CLI 3.4.0 binary verified against its published SHA-256 from the [official v3.4.0 release](https://github.com/supabase/cli/releases/tag/v3.4.0). The stack must cold-start, answer GoTrue health, create/login a synthetic `example.test` user, and read a unique database marker through authenticated PostgREST. It writes only a sanitized manifest (no DB dump, keys, JWT, raw logs, or user data) and keeps the artifact for 14 days. Supabase CLI 3.4.0's supported CLI stack is pinned as a unit; runtime image tags are recorded in the manifest.

This workflow is infrastructure rehearsal only. Its synthetic PostgreSQL dump/restore is not the Official Restore runbook and cannot yield Official Restore or final release PASS. The existing mandatory `rc19-unified-release-gate.yml` still runs `memory:validate`; that gate was kept. It uses an ephemeral PG service, synthetic fixture restore, regression/typecheck/lint/build and is not the full Official Restore. Its runner and database tags were tightened to Ubuntu 24.04 and PostgreSQL 17.11; Node and pnpm are exact-version pinned.

Neither this new workflow nor the current release gate exists on `origin/main` at the checkpointed ref. GitHub's manual-dispatch trigger only becomes available after a workflow file reaches the default branch. Do not attempt dispatch before that eligibility is verified. No remote run was started.

### Deployment safety and push decision

Vercel's `livestream-ops-demo` project is Git-linked to `anhkienk4-max/live-app-main`. The current Production deployment record is CLI-sourced, READY, and has empty Git metadata; deployed Git SHA remains UNVERIFIED. The repository `vercel.json` explicitly disables deployments for a list of branches but omits `chore/rc19-w4-release-readiness`; Vercel Git configuration documents that unspecified branches default to enabled ([Git configuration](https://vercel.com/docs/project-configuration/git-configuration); [Git deployment behavior](https://vercel.com/docs/git)). A push to this branch is therefore expected to trigger a Preview deployment. A read-only scan across `.github/workflows` found no Vercel deploy action/command, Vercel deployment token, `supabase db push`, or Production environment job. The exact Production branch and project-level deployment settings were not exposed by the read-only project record, so Production-branch behavior is not attested.

The new hosted rehearsal itself has no Vercel action, deploy command, Vercel secrets, or Production/Staging access. Still, pushing its branch is not a no-deploy operation because the linked Vercel Git integration can create a Preview. No push is made or recommended until Owner approves and the Preview trigger is disabled or otherwise explicitly accepted. Do not add CI artifacts containing dumps or secrets.

### Official Restore readiness, production preflight, and remaining approvals

**Official Restore: NOT READY / NOT PASS.** A hosted synthetic PG17.11 dump/restore smoke is prepared but not run. Official Restore still requires the approved sanitized/synthetic backup source, exact final candidate SHA, source and destination markers, actual `pg_dump`/`pg_restore` versions, measured dump size and hosted capacity, schema/roles/ACL/extensions/RLS/receipt parity, timings, and reviewed failure/rollback evidence. No current Production backup freshness proof or exact release restore report exists.

Read-only production metadata remains limited to deployment ID `dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E`, aliases `ops5729.top` and `livestream-ops-demo.vercel.app`, project Git linkage, CLI source, and no SHA in deployment metadata. HTTP 200 is not source identity. Runtime Supabase project binding and rollback candidate compatibility remain unverified. KAO/G11 still require their authorized credentials and Owner/policy approvals.

**Owner/Lane approvals still required:** Lane 01 must route the sanitized disposable evidence; Lane 01 must approve reconciliation remediation; Owner must decide whether a Vercel Preview is acceptable or disable that trigger before a branch push; Owner must authorize the backup artifact and distinct Official Restore rehearsal; KAO/G11 policy approvals and credentials; and final exact-SHA release/Production GO. No merge, deployment, Production/Staging write, or W5 work occurred.
