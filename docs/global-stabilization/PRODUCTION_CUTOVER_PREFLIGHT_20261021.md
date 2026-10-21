# ADA OPS — Production Cutover Preflight (21 October 2026)

## Scope, evidence and authorization

Owner requested Production push and real-world testing. This file records the *actual* observed state of the live environments before any database mutation or Git production-branch update. It does **not** authorize ignoring release gates or imply that integration tests are a Production UAT.

- Vercel project: `livestream-ops-demo` in team `livestream2`, live domain `ops5729.top`.
- Vercel currently served Production deployment `dpl_7FNqbr8AWimsF7PbJJneP1ibebkU` at GitHub `main` SHA `b96dcb6e1842e59f43170a1a8b15da712ee8a8e0` (READY).
- Integration source checked: `c6c4a1744d93100b465236d1e806e4fa975ecec7`, ahead by 85 commits / 244 changed files from `main`.
- Supabase Production project: `egdjnpmoasarrttvhgds`; Staging project `amagnzebmmuqiptmrjmc`. **Never assume Staging is a disposable clone of Production.**
- Production migration history: 69 entries. Repository integration migration files: 76. Comparison made using version prefixes, not verified SQL equivalence.
- Production state has an additional recorded migration `20261014173408` absent from repo migration filenames, apparently associated by name with RC16K; cannot assume equal SQL body to repo's `20261012171503`. Reconcile before attempting migration replay.

## Eight repository migration versions absent from Production history

All are **UNAPPLIED OR UNVERIFIED**, never execute them blindly.

| Migration | Primary reason for gate |
|---|---|
| `20260919074349_rc12_report_file_provider.sql` | Report file provider compatibility; may already have a manual/superseding schema equivalent |
| `20260924000000_rc13a_execution_source_storage_routes.sql` | Execution-source and Storage routing schema |
| `20261012171503_rc16k_bounded_shift_lists.sql` | Version drift with Production `20261014173408`; compare function bodies and behavior before applying |
| `20261020164351_rc18a_publish_shifts_realtime.sql` | Realtime publication and client freshness |
| `20261021000000_rc17c_attendance_import_foundation.sql` | Atomic historical attendance import RPCs |
| `20261021034515_shift_automatic_status_scheduling_and_read_safety.sql` | Shift auto-status scheduling, read/write separation and audit; operational side-effect risk |
| `20261021120000_global_report_obligation_page.sql` | Reports Inbox authorized pagination RPC |
| `20261021190000_global_report_notification_transition_keys.sql` | Notification revision and recipient idempotency keys |

Read-only Production catalog query confirmed `get_payroll_period_snapshot`, `workforce_rc16_transition_payroll` and `workforce_rc17b_register_rate_card` exist. It did **not** find `get_report_obligation_page`, `stage_attendance_import_batch` or `confirm_attendance_import_batch`. Schema compatibility with the integration code is therefore not established.

## Mandatory release sequence — no live-data test shortcuts

1. Capture and verify **Production database recovery**: current-state schema and data backup, exact restore steps, validation against a separate isolated database, retention and operator contact. Neither backups nor restore rehearsal were verified in this session. Vercel code rollback does **not** roll back database schema or operational writes.
2. Establish a disposable database with the **current Production schema + representative sanitized fixtures**, not an assumption that existing Staging is identical. Reconcile migration version drift against actual function/schema signatures.
3. Replay a reviewed forward-only migration plan in dependency order; verify permission/RLS, CAS, read-only GET, no unintended historical auto-status updates, payroll lock/transition and report-notification idempotency. Rehearse rollback/recovery.
4. Run complete automated release manifest, TypeScript, ESLint, Next production build, isolated PG16/17 matrix, negative role/security, plus provider-backed isolated Storage and authenticated Admin/Leader/Member workflows against one immutable release SHA.
5. Stage Production-environment build **without routing the public Production domain**. Only use safe no-write smoke checks and authorized isolated test records. Do not reuse real staff salaries, files or operational shifts for tests.
6. Verify deployment identity + database compatibility, monitor errors and obtain explicit release acceptance. Promote the same staged build/fast-forward `main` through controlled release, smoke test, then monitor and roll back application routing if needed.
7. After release, test actual workflows through approved test users and clearly labeled isolated fixtures; remove them only through audited teardown that cannot touch real operational data.

## Current decision

**BLOCKED / NO-GO:** Production DB has missing/unverified migrations and history drift; verified backup/restoration, full release manifest and authenticated final integrated UAT are not complete.

**DO NOT:** fast-forward `main`, assign `ops5729.top` to a new deployment, apply DDL to Production, change OAuth/realtime/cron settings, or write synthetic payroll/report/shift records to the live database before the above gates.

All earlier targeted PostgreSQL 16/17 passes are regression evidence for specific code SHAs, not proof of Production compatibility.
