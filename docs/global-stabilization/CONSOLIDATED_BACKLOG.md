# ADA OPS — Consolidated Global Stabilization Backlog

Baseline: `origin/main` `b96dcb6e1842e59f43170a1a8b15da712ee8a8e0` at start of this integration.
Integration: `integration/global-stabilization-20261021`.

Statuses describe implementation evidence in this candidate, not Production readiness.

| ID | Severity | Status | Routes / scope | Acceptance criteria and evidence |
|---|---|---|---|---|
| GS-P0-01 | P0 | IMPLEMENTED BUT UNVERIFIED | Calendar, Shifts, dashboard reads | Supabase reads no longer invoke `refresh_automatic_shift_statuses`; mock shift getters also remain read-only. First PostgreSQL 16/17 run `39544736481` failed before the DB proof because the workflow omitted dependency installation (`typescript` missing). The workflow now pins pnpm 10.26.0 and runs frozen install; verification is pending on the next run. The disposable fixture covers direct Auth/role/pg_cron contracts only, not a full Supabase restore or production-equivalent UAT. |
| GS-P1-01 | P1 | IMPLEMENTED BUT UNVERIFIED | Login, Register, Forgot/Reset Password, grouped navigation, Calendar, Payroll/Workforce surfaces | RC1.7D integrated; focused auth/navigation/Calendar/lifecycle tests pass. Actual provider round-trip and authenticated Admin/Leader/Member session UAT remain unverified; Production Google provider is not enabled. |
| GS-P1-02 | P1 | IMPLEMENTED BUT UNVERIFIED | Calendar, Shift List, Staffing, Registration, Swaps, Live Monitor | RC1.8A integrated; realtime-first refresh, sparse reconciliation, URL-persisted date/status/search/sort/page and PostgreSQL publication contract are implemented. Focused integrated suite passes; no isolated authenticated two-session UAT on this combined SHA. |
| GS-P1-03 | P1 | IMPLEMENTED BUT UNVERIFIED | Staffing > Attendance Import, Workforce, Payroll | RC1.7C integrated; PGlite/API importer and payroll evidence suite passes 36/36, including atomic rollback and concurrency. Real approved workbook/Sheets source access and authenticated workflow UAT are not verified. |
| GS-P1-04 | P1 | IMPLEMENTED BUT UNVERIFIED | Reports Inbox, Reports, Notifications | Replaced the 30-shift client candidate cap with `get_report_obligation_page`, a bounded SECURITY INVOKER RPC returning authorized shift/report pairs and filtering before count/page. Admin/Leader retain reviewer scope; Members require direct staffing, approved/manual registration, or their own submitted report while the shift remains readable under existing RLS. Open-registration/pending-only, inactive, deleted/archived, and finalized boundaries have synthetic PostgreSQL coverage prepared. Focused UI/API tests pass; PostgreSQL 16/17 hosted proof is pending. Reports lifecycle, notification idempotency, and complete export remain separate acceptance checks. |
| GS-P1-05 | P1 | IMPLEMENTED BUT UNVERIFIED | Analytics | Snapshot requests now abort on identity/filter change and stale success/error/finally settlements cannot overwrite the active request; logout clears loaded snapshot/reference state. Focused timezone/metric and source regression tests pass. Admin/Leader/Member runtime filtering, full filtered export and browser identity-switch UAT remain unverified. |
| GS-P1-06 | P1 | IMPLEMENTED BUT UNVERIFIED | Workforce Team, Individual, Leaderboard; Payroll | Three surfaces and payroll APIs exist. Verify monthly/yearly policy, drill-down attribution, approved evidence only, period transitions, locks, audit and export against PostgreSQL synthetic integration. |
| GS-P1-07 | P1 | IMPLEMENTED BUT UNVERIFIED | Storage, operational file APIs, Google Drive/OneDrive | Provider routing and folder/file flows exist. Physical create/list/upload/read/delete, metadata placement and access checks require disposable provider routes; no physical UAT evidence yet. |
| GS-P1-08 | P1 | IMPLEMENTED BUT UNVERIFIED | Brands, Platforms, Campaigns, Staff, Audit, Settings | Routes and persistence exist. Verify role-scoped CRUD/archive, cross-module references, audit before/after and exports in authenticated disposable UAT. |
| GS-P1-09 | P1 | EXTERNAL CONFIG REQUIRED | Check-in/out, actual-time correction | GPS consent, Studio radius/accuracy, PIN TTL/rate limits/lockout/anti-replay, exception reviewers and retention are business policy decisions. Keep disabled/pending until approved; no policy values are inferred here. |
| GS-P1-10 | P1 | EXTERNAL CONFIG REQUIRED | OAuth | Approved-account callback code is integrated; Production provider credentials/settings and real approved/unapproved round-trip remain external configuration and verification. Do not enable automatically. |
| GS-P1-11 | P1 | IMPLEMENTED BUT UNVERIFIED | Global layout and all routes | Grouped desktop/mobile navigation and responsive route surfaces are implemented. Consolidated 320–1440px role-authenticated visual and interaction UAT remains pending because Browser integration is unavailable. |
| GS-P2-01 | P2 | IMPLEMENTED BUT UNVERIFIED | Live Monitor | Current main has per-shift LIVE links and bounded visibility-aware refresh. Verify official embed availability, external-link fallback, video preview permissions, notes and report action without assuming platform embed support. |
| GS-P2-02 | P2 | IMPLEMENTED BUT UNVERIFIED | Shift and module exports | Verify all-pages filtered export, column selection, RBAC and no silent truncation across Calendar, Reports, Workforce and Payroll. |
| GS-OPS-01 | P0 | IMPLEMENTED BUT UNVERIFIED | Production status/audit history | Read-only audit and edge logs tied three automatic status changes at 00:16 ICT to a browser POST of `refresh_automatic_shift_statuses`; Rate Card creation at 00:09 was through its RPC. No rollback/deletion was performed. Confirm after isolated rehearsal that ordinary reads cannot repeat this. |

## Integration checkpoints

- P0 data-safety changes committed locally before feature integrations.
- RC1.7D (#50), RC1.8A (#48), RC1.7C (#46) integrated in dependency order on the dedicated branch.
- Analytics timezone fix branch is already an ancestor of current main; no cherry-pick needed.
- The old September Live Monitor feature branch is not an ancestor of main and has broad overlapping UI diffs; it is not merged wholesale pending selective scope review.
- No Production database, Auth, Realtime publication, secrets, main branch, or deployment has been changed.
- No Browser UAT is claimed. The Browser runtime is unavailable in this session.

## Candidate acceptance gate

The integrated candidate remains NO-GO until the P0 migration and read/write invariants run on disposable PostgreSQL/Supabase, the workflow-specific integration suites and final CI pass on one exact SHA, and the consolidated authenticated Admin/Leader/Member desktop/mobile UAT completes. Provider-backed Storage and business-policy-dependent attendance/OAuth remain separate gates.
