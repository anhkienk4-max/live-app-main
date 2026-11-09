# RC19 C5.11 Persisted E2E — Local Execution Record

## Decision

`LOCAL_AUTH_RUNTIME: PASS`

`STAFFING_PERSISTENCE: PASS` (two isolated authenticated runs)

`ATTENDANCE_PERSISTENCE: BLOCKED`

`PAYROLL_PERSISTENCE: BLOCKED`

`END_TO_END_WORKFLOW: BLOCKED`

`SOURCE_READY: NO`

`PRODUCTION_GO: NO`

The exact source commit is `04d0e167a3ef0db9910117d2028c8a678d9fdbcc`. No Production or hosted Supabase credentials, data writes, deployment, or Drive I/O were used.

## Changes

- Added additive migration `supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql` for persisted staffing segments, segment registration, idempotent replacement, capacity checks, RLS, and atomic shift-plus-segment creation.
- Connected multiline schedule-import rows to the segment create RPC and added the authenticated segment-registration service path.
- Added Leader Brand scope checks to Workforce Actual read/write/review APIs. A planned `worked` approval also requires persisted check-in and check-out events.
- Added local PostgreSQL/Auth/PostgREST rehearsal scripts and focused parser, API, and service tests.
- Updated the in-memory PostgREST test query builder for the existing `.in()` and `.or()` calls used by open/overnight shift reads.

## Runtime and migration evidence

- PostgreSQL server: 17.11 (`server_version_num=170011`).
- Node: 24.18.0.
- Target DB: `rc19_c511_e2e_20261109122443`, marked `CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY`.
- Auth and PostgREST were local containers bound only to `127.0.0.1` ports 15543 and 15542.
- Rehearsal restored the previously verified 20-migration C4 schema-only snapshot (`eb40c3f3db6786f646ac4f6f0cbc94f042e5570be30b8c0c39a5b915292a7276`) and applied the C5.11 migration (`d7abbe6cce5356af5a134fb2cbf97b3d0d295a50bd737bd2737db7977d41bce0`). Auth users and Storage objects were zero before the run.
- Because a schema-only snapshot omits migration-seeded table data, the harness restores only the RBAC permission catalog seed `INSERT` from its canonical historical migration and records its checksum and row count. The historical migration file was not edited.
- DB receipt was inserted only after successful C5.11 migration execution. Full 89-migration Production replay was not repeated in this task.

## Persisted authenticated scenarios

Two independent synthetic scenarios used real local Auth sessions for Admin, Leader, and Member identities. Each created two Brands and an overnight parent shift with two segments through the schedule parser and authenticated RPC, then verified persisted rows and foreign keys through DB readback.

Both runs verified:

- Admin parent-shift creation and atomic segment persistence.
- Duplicate reimport prevention.
- Leader access and approval within the active Brand grant.
- Foreign and expired Brand scope denial.
- Member self-approval and mutation of another registration denied.
- Segment capacity overflow denied.
- The two scenarios used distinct synthetic actor, Brand, shift, segment, and registration IDs.

The authenticated `self_attendance_record` call was denied with `ATTENDANCE_PHOTO_REQUIRED`. This is expected: the existing check-in contract requires an immutable receipt backed by a verified Google Drive upload/readback. Drive I/O and a local Drive-compatible provider are excluded here. No fake receipt or direct SQL fixture was used. As a result, successful Attendance, approved actual minutes, and Payroll persistence remain unverified and blocked.

Full machine-readable records: [persisted E2E JSON](scripts/rc19-c4-migration-rehearsal/evidence/c5.11-local-pg1711/e2e/persisted-e2e-2026-11-09T122524938Z.json). Isolated DB receipt/log: [database rehearsal JSON](scripts/rc19-c4-migration-rehearsal/evidence/c5.11-local-pg1711/isolated-db-20261109T122443Z.json) and [log](scripts/rc19-c4-migration-rehearsal/evidence/c5.11-local-pg1711/isolated-db-20261109T122443Z.log).

## Verification on exact source SHA

| Check | Result | Evidence |
|---|---|---|
| Persisted staffing E2E | 1 test PASS; artifact result BLOCKED after 2 staffing runs | `node --import ./tests/typescript-alias-loader.mjs --test tests/rc19-c511-persisted-e2e.test.ts`; exit 0 |
| Focused regression | 96/96 PASS | Workforce, Payroll, segment, registration, attendance review, RBAC and Supabase shift service tests; exit 0 |
| RBAC UI regression | 7/7 PASS | `tests/rc19-c4.4-rbac-behavior.test.ts`; exit 0 (run without `react-server` condition) |
| TypeScript | PASS | `corepack pnpm exec tsc --noEmit --incremental false`; exit 0 |
| ESLint | PASS, 0 errors / 30 existing warnings | `corepack pnpm exec eslint .`; no warnings in C5.11-touched files |
| Production build | PASS | Credential-free offline path: `CI=true corepack pnpm build`; exit 0 |
| Memory validation | PASS after generated snapshot refresh | `corepack pnpm memory:validate` |
| Migration application | PASS | PostgreSQL 17.11 isolated database, C5.11 checksum above |

An early combined test invocation applied `NODE_OPTIONS=--conditions=react-server` to the UI-only RBAC test and failed while importing Lucide/React. Running that UI test without the server condition passed 7/7. An initial credential-free build without `CI=true` was stopped by the intended `ENV_SUPABASE_CONFIG_REQUIRED` guard; the repository-supported offline build path passed without any Supabase credentials.

## Remaining blocker and next action

To complete C5.11, provide an approved isolated test Drive identity/resource or an approved local Drive-compatible integration that exercises the existing photo handler’s upload, provider readback, metadata receipt, and cleanup contract. Until then, do not claim Attendance, Payroll, or the full workflow as PASS. No remote, Production, migration, or Drive operation is authorized or performed here.
