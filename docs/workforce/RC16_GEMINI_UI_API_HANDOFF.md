# RC1.6 — Payroll & Workforce Performance backend-to-Gemini UI handoff

Date: 2026-10-11
Repository: anhkienk4-max/live-app-main
Branch: feat/rc16-payroll-workforce-backend
Draft PR: https://github.com/anhkienk4-max/live-app-main/pull/25
Base: fix/rc14-data-report-export-fidelity (Storage PR #24)
Status: staged, no Production deployment or Payroll DDL applied.

## Canonical data flow
Shift → ShiftRegistration → Actual Staffing → Approved Actual Hours →
Approved Effective Rate → Payroll Draft → Reviewed → Confirmed → Payroll Ready →
Locked → CSV Export.

Workforce Overview and individual performance read only approved actual evidence.

## Security and calculation contract
- Planned shift hours are not worked/paid hours. No automatic backfill from schedules.
- A missing attendance row is unknown, not a no-show. An explicit no-show has
  event_kind=no_show, null actual_start_at/end_at, a note and independent review.
- Only a Shift with status `completed` can enter the approved-attendance
  workflow. Future/scheduled/cancelled Shift attempts fail closed with HTTP 409.
- Approved and rejected evidence decisions are immutable; approved worked
  segments cannot overlap for the same staff across shifts. The evidence author
  cannot self-review. A rejected claim must be resubmitted as a fresh draft.
- Rate cards must be explicitly approved. VND amounts use integer minutes,
  integer VND and one final integer rounding. Overtime minutes are explicitly
  supplied and validated; no automatic legal OT or break-deduction rule.
- Each approved rate has a validity range and optional staff scope; a staff
  rate supersedes a role default, but overlapping applicable rates are rejected.
- Period transitions use an atomic PostgreSQL RPC and append-only audit.
  A Locked period cannot be edited or silently reopened.
- Salary and rates: Admin only. Actual Staffing: Admin and Leader.
  Individual performance: Admin/Leader or the staff member themselves.
  Team performance: Admin/Leader only.
- Salary CSV is downloaded over authenticated HTTPS from a Locked period;
  it is NOT uploaded to the broadly shared LIVESTREAM REPORT Drive root.
- No tax/PIT, fund transfer, automatic bonus or live pay disbursement.

## API contract

1. GET /api/workforce/actual?shift_id=...
Admin/Leader. Returns ok and segments containing staff_id, shift_id,
operational_role, event_kind, coverage_kind, actual_start_at, actual_end_at,
evidence_note, review_note, review_status, reviewer, version.

2. POST /api/workforce/actual with JSON:
{"action":"record","shift_id":"TEST","staff_id":"TEST",
"operational_role":"host","event_kind":"worked","coverage_kind":"planned",
"actual_start_at":"2026-09-30T21:30:00+07:00",
"actual_end_at":"2026-09-30T23:00:00+07:00",
"evidence_note":"Observed and verified session times"}

For no-show the two actual times must be null. coverage_kind values:
planned, cover, replacement, extra.

3. POST /api/workforce/actual with JSON:
{"action":"review","segment_id":"TEST","expected_version":1,
"decision":"approved","review_note":"Verified by independent lead"}
Self-review is 403; stale/locked/conflicting evidence 409. Evidence notes
are immutable and separate from reviewer notes.

4. GET /api/workforce/payroll?period_id=...
Admin-only. Returns period, lines and append-only audit history.

5. POST /api/workforce/payroll (create period):
{"action":"create_period","period_start":"2026-09-01","period_end":"2026-09-30"}

6. POST /api/workforce/payroll (approve rate):
{"action":"register_rate","staff_id":"TEST","operational_role":"host",
"effective_from":"2026-09-01","effective_through":"2026-09-30",
"vnd_per_hour":100000,"overtime_multiplier_basis_points":15000,
"approval_note":"Rate approved against signed agreement"}
staff_id null denotes a specifically approved role default, not one
assumed by the app. 15000 basis points means a 1.5x OT multiplier.

7. POST /api/workforce/payroll (one approved segment):
{"action":"prepare_line","period_id":"TEST","segment_id":"TEST",
"payable_minutes":90,"overtime_minutes":30,
"adjustment_vnd":0,"adjustment_reason":null}
Never send an authoritative gross/net value from the UI. The API and DB
independently recalculate rates, minutes and VND, rejecting mismatches.

8. POST /api/workforce/payroll (transition):
{"action":"transition","period_id":"TEST","expected_status":"draft",
"target_status":"reviewed",
"reason":"Verified attendance evidence against reports"}
Then reviewed → confirmed → payroll_ready → locked. Review and Confirm
require different actors. Ready and Lock require at least one verified line.

9. GET /api/workforce/payroll?period_id=...&export=csv
Admin-only, locked only. UTF-8 BOM CSV compatible with Excel; formula
injection protection. Not an XLSX file.

10. GET /api/workforce/performance?staff_id=...&role=host&month=2026-09
Returns approved actual minutes, verified/missing shifts, verified no-shows,
on-time and late counts, punctuality, known reliability and attendance
coverage, plus incomplete-evidence warning. Unverified GMV/hour and
orders/hour are null until session attribution is approved.

11. GET /api/workforce/overview?month=2026-09&role=host
Leader/Admin team summary and individual rows; weighted performance KPIs
rather than averaging percentages, data-coverage warnings and a
conditional leaderboard. Missing chấm công never lowers an unverified
worker's rank or pretends that their data is zero.

## Deployment policies requiring owner decision

WORKFORCE_LATE_GRACE_MINUTES: mandatory integer 0–120. No hidden default.
WORKFORCE_LEADERBOARD_MIN_VERIFIED_SHIFTS: optional integer 1–100; when
absent, leaderboard remains empty and marked unconfigured.

Migration file:
supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql
This is not applied to Production. Apply only after explicit owner approval.

## Gemini UI requirements (do not change backend branch)

Actual Staffing: planned vs actual, cover/replacement and no-show, duration,
evidence notes, review, conflict/stale errors, independent reviewer.
Payroll: Admin-only period and rate manager, payable/OT minutes and notes,
review→confirm→ready→lock status, audit timeline and locked CSV export.
Workforce: team and individual views, role/month filter, verified workload,
punctuality, known missing evidence, reliable sample size and fair leaderboard.
Unverified KPI must show N/A rather than 0%. Permission failures 401/403,
stale records and missing configuration 409 must be handled explicitly.

Do not create UI as if these are finished: shift-based/brand-specific rate
policies, paid breaks, PIT/tax, payment disbursement, reopened Locked periods,
XLSX payroll exports and verified per-host GMV attribution.

## Pre-Go-live release gates

1. CI and PostgreSQL 16 business-rule gates PASS on the exact PR SHA.
2. Finance/HR approve rate basis, overtime, break policy and confirmation rights.
3. Actual Staffing confirmed from real evidence, including split shifts and no-show.
4. Preview data/provider isolation confirmed; run one physical end-to-end UAT.
5. Review and authorize Payroll migration on Production separately.
6. Merge Gemini UI under this API contract, then request Production approval.
7. Storage RC1.5 physical provider UAT remains a separate open release gate.

## Go-live validation (2026-10-11, latest RC1.6 PR revision)

- PostgreSQL16 isolated DDL gate: PASS, including stored VND calculation,
  immutable locked payroll, reviewed attendance immutability, independent
  reviewers, and rejecting approvals for an uncompleted Shift.
- RC1.6 synthetic tests: **17/17 PASS**, TypeScript PASS,
  Next.js production build PASS (without Production credentials).
- PR #25 remains Draft and separate from Gemini frontend changes.
- Payroll migration is **NOT** applied to Supabase Production.
- Current read-only Production user count: **1 Admin, 1 Leader, 5 Members**
  active. Payroll API access is **Admin-only**, and creator cannot review their
  own period. Therefore this approval chain cannot complete with the present
  single Admin; owner must approve a second authorized payroll reviewer or a
  narrowly scoped independent finance approval role in a separately reviewed
  RBAC change. **Do not silently grant Leader access to salary data.**
- No actual staffing rows or approved rates exist under RC1.6 in Production
  because this migration is not deployed. UI must show "Chưa có dữ liệu xác minh"
  instead of simulating staff performance or pay.
- Workforce attendance/punctuality metrics need an explicit grace-minutes
  policy before activation. Never infer GMV/hour without a validated session
  attribution mapping.
