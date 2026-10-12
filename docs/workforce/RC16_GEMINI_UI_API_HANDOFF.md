# RC1.6 — Payroll & Workforce Performance backend-to-Gemini UI handoff

Date: 2026-10-11
Repository: anhkienk4-max/live-app-main
Branch: feat/rc16-payroll-workforce-backend
Draft PR: https://github.com/anhkienk4-max/live-app-main/pull/25
Base: fix/rc14-data-report-export-fidelity (Storage PR #24)
Status: staged, no Production deployment or Payroll DDL applied.

## RC1.6H current integration target (2026-10-12)

Owner chose direct Production release; Staging/Preview is no longer a prerequisite.
This does not authorize deployment, DDL, provisioning or feature activation.
Antigravity now owns the upcoming UI; its final approved branch/SHA is still pending.
Earlier Gemini/C/F checkpoints below are historical. See the current
[Production readiness](RC16H_PRODUCTION_READINESS.md),
[Antigravity capabilities/error contract](RC16H_ANTIGRAVITY_INTEGRATION.md) and
[Production approval package](RC16H_PRODUCTION_APPROVAL.md).

Actual/performance/overview use existing FEATURE_ACTUAL_STAFFING; Payroll uses
FEATURE_PAYROLL independently. Both default OFF. Authorized disabled calls return
503 WORKFORCE_FEATURE_DISABLED or WORKFORCE_PAYROLL_FEATURE_DISABLED, no-store,
before privileged client access. Anonymous401 and unauthorized403 remain unchanged.
GET /api/workforce/capabilities returns authenticated role-filtered booleans for
actual_staffing, team_performance, own_performance and payroll; no salary/configuration.
UI must use this response to hide/disable surfaces, and fail closed on read errors.
All ON-state payloads/correction/replay/discovery/CSV contracts below remain intact.

## RC1.6C integration checkpoint (2026-10-11)

Backend baseline `2be8cfd56f0bb8dbb76baa4fa23021d5e1eb1f63`: GitHub
[CI PASS](https://github.com/anhkienk4-max/live-app-main/actions/runs/38139343311),
25/25 synthetic tests. The older checkpoint counts below are historical.
Official Gemini RC16 branch/SHA is not yet established; no UI integration was
performed. At the RC1.6C baseline Payroll GET required period_id and lacked
list-periods/list-rates discovery; RC1.6D adds the contract below. Browser clients must not query
privileged payroll tables directly to work around this gap.

Read the [RC1.6C readiness report](RC16C_INTEGRATION_READINESS.md),
[UI/API parity matrix](RC16C_UI_API_PARITY_MATRIX.md),
[environment/ledger snapshot](RC16C_ENVIRONMENT_IDENTITY.md) and
[synthetic E2E checklist](RC16C_SYNTHETIC_UAT_CHECKLIST.md) before integration.
Staging identity exists, but RC16 deployment/runtime isolation is unproven and
staging lacks RC15/RC16 migrations. Production RC15 migrations are already
present; both RC16 migrations remain absent. No migration/deployment is
authorized by this documentation checkpoint. UUID historical replay applies
to correct_line/void_line only; other actions require read reconciliation.

## RC1.6D Admin Payroll discovery contract

Both discovery operations extend existing GET `/api/workforce/payroll`.
No ID is needed to open the period/rate manager. All reads authenticate and
require Admin before creating the server client. Leader/Member receive 403,
anonymous receives 401; every response uses `Cache-Control: no-store`.
No new role, schema, salary mutation, UI integration or deployment is included.

### Period discovery

```http
GET /api/workforce/payroll?action=list_periods&page=1&page_size=50&date_from=2026-09-01&date_to=2026-09-30&status=draft
```

`action=list_periods` is required. Optional `page` defaults to 1 (1..1000000),
`page_size` defaults to 50 (1..100). Both are canonical positive integer strings:
no signs, decimal, exponent, whitespace or leading zero. Optional date_from/
date_to are real calendar dates `YYYY-MM-DD`, year 0001..9999; inverted ranges
fail 400. Dates select **inclusive overlap**, not containment:
period_end >= date_from AND period_start <= date_to. Either bound can stand alone.
Optional status is draft/reviewed/confirmed/payroll_ready/locked, exactly as stored.
No status filter returns all five states. Fixed order: period_start DESC,
period_end DESC, revision DESC, id ASC. Listing a Locked period does not unlock it.

HTTP 200 example:

```json
{
  "ok": true,
  "periods": [{
    "id": "PERIOD_ID", "period_start": "2026-09-01", "period_end": "2026-09-30",
    "status": "draft", "revision": 1, "created_by": "ADMIN_A",
    "reviewed_by": null, "confirmed_by": null, "locked_by": null, "locked_at": null,
    "created_at": "2026-10-11T10:00:00+00:00", "updated_at": "2026-10-11T10:00:00+00:00"
  }],
  "pagination": {"page":1,"page_size":50,"total_count":1,"total_pages":1,
    "has_next":false,"has_previous":false}
}
```

Period summaries contain no lines or salary totals. Open one with the unchanged
GET `?period_id=PERIOD_ID` to read period/lines/audit. Locked-only CSV remains
GET `?period_id=PERIOD_ID&export=csv`; existing POST actions are unchanged.
Bare GET without action or period_id retains its previous 400 behavior.

### Approved rate discovery

```http
GET /api/workforce/payroll?action=list_rates&page=1&page_size=50&staff_id=STAFF_ID&role=host&effective_date=2026-09-30
```

Only approved_by AND approved_at nonnull cards are listed. Pagination has the
same bounds/defaults. Optional staff_id is trimmed, nonblank, max120 characters;
it matches **that staff exactly** and does not implicitly include role defaults.
Optional role is host/support/technical; optional effective_date is a valid
calendar date selecting effective_from <= date AND (effective_through is null
OR effective_through >= date), including both validity boundaries.

Optional scope is staff_specific (staff_id nonnull) or role_default (staff_id
null); without scope both are included. scope=role_default together with a
staff_id is invalid400. To inspect defaults for a staff member's role, use a
separate role+scope=role_default query. Discovery does not choose the authoritative
payroll rate: preparation still applies staff-specific precedence and validates
overlaps against the approved date/attendance snapshot.

Fixed order: effective_from DESC, id ASC. HTTP 200 example for the staff query:

```json
{
  "ok": true,
  "rates": [{
    "id": "RATE_ID", "staff_id": "STAFF_ID", "scope": "staff_specific",
    "operational_role": "host", "effective_from": "2026-09-01", "effective_through": "2026-09-30",
    "vnd_per_hour": 100000, "overtime_multiplier_basis_points": 15000,
    "approved_by": "ADMIN_B", "approved_at": "2026-08-31T10:00:00+00:00",
    "approval_note": "Approved synthetic example rate", "created_at": "2026-08-31T10:00:00+00:00"
  }],
  "pagination": {"page":1,"page_size":50,"total_count":1,"total_pages":1,
    "has_next":false,"has_previous":false}
}
```

Role-default cards have staff_id=null and scope=role_default. Null effective_through
means open-ended validity. OT multiplier is integer basis points (15000 = 1.5x),
hourly VND is an integer; do not modify cards or derive new pay amounts in discovery.

### Pagination, empty states and errors

Both arrays contain one bounded page. total_count is the **exact filtered** count,
total_pages=ceil(total_count/page_size), has_previous=(page>1), has_next indicates
more rows after this page. Empty dataset: periods=[] or rates=[], total_count=0,
total_pages=0, has_next=false; page1 has_previous=false. An out-of-range page also
returns an empty array with the verified count, never invented count0. The server
recounts with identical filters when PostgREST rejects an out-of-range offset.

```ts
type PayrollDiscoveryPagination = {
  page: number; page_size: number; total_count: number; total_pages: number;
  has_next: boolean; has_previous: boolean;
}
type PayrollDiscoveryErrorCode =
  | 'AUTHENTICATION_REQUIRED' | 'PERMISSION_DENIED'
  | 'WORKFORCE_PAYROLL_DISCOVERY_QUERY_INVALID'
  | 'WORKFORCE_PAYROLL_DISCOVERY_READ_FAILED'
  | 'WORKFORCE_PAYROLL_DISCOVERY_READ_INCOMPLETE'
  | 'WORKFORCE_PAYROLL_FAILED'
// Error envelope: { ok: false, error: { code: PayrollDiscoveryErrorCode } }
```

| HTTP | Code / UI behavior |
| --- | --- |
| 400 | WORKFORCE_PAYROLL_DISCOVERY_QUERY_INVALID: unknown/duplicate keys, unknown action, conflicting scope/staff, invalid date/range/enum/page; fix request |
| 401 | AUTHENTICATION_REQUIRED: reauthenticate; no salary response |
| 403 | PERMISSION_DENIED: Admin-only; never grant Leader salary access |
| 503 | WORKFORCE_PAYROLL_DISCOVERY_READ_FAILED: DB/query unavailable; retry GET, preserve filters |
| 503 | WORKFORCE_PAYROLL_DISCOVERY_READ_INCOMPLETE: missing exact count or truncated/inconsistent page; do not display returned list as complete |
| 500 | WORKFORCE_PAYROLL_FAILED: unexpected existing handler failure; show error, no mock fallback |

Discovery queries reject unknown/duplicate parameters, including mixing action
with period_id/export. No 409 mutation/replay semantics apply to discovery GET;
existing CSV/correction/void 409 behavior remains. Results must be reloaded after
period/rate changes. Pagination is deterministic for an unchanged dataset, not
an immutable snapshot across requests; concurrent insertion can shift offsets.
Do not use discovery totals as proof of a fixed export dataset.

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
  An empty Draft cannot pass Review; a segment can appear in only one payroll
  period (including overlapping periods) to block double payment. A Locked
  period cannot be edited or silently reopened. A future audited reissue or
  correction flow must be designed before a segment can be paid again.
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
require different actors. Review, Ready and Lock each require at least one
verified line. A segment cannot be entered in two payroll periods, even if
their date ranges overlap; duplicate submissions return HTTP 409.

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

## RC1.6B Draft correction and void contract

Existing actions remain supported. New actions use POST `/api/workforce/payroll`
and are Admin-only. Leader/Member must never receive salary snapshots or audit.
All responses have `Cache-Control: no-store`.

### Correct an active Draft line

```json
{
  "action": "correct_line",
  "period_id": "PERIOD_ID",
  "line_id": "LINE_ID",
  "expected_version": 1,
  "request_id": "10000000-0000-4000-8000-000000000001",
  "payable_minutes": 60,
  "overtime_minutes": 30,
  "adjustment_vnd": -1000,
  "adjustment_reason": "Independent adjustment approved",
  "reason": "Verified payable and OT correction"
}
```

The request is a full replacement of the four editable fields, not a partial
patch. Required: nonblank IDs (up to 120 characters), UUID request_id, integer
expected_version in 1..2147483646 and trimmed reason of 8..2000 characters.
Payable/OT minutes must be integers in 0..1440, payable <= stored actual minutes,
OT <= payable. Adjustment is an integer between -1e12 and 1e12 VND; its reason
is null when adjustment is zero, otherwise trimmed 8..1000 characters. Net must
remain in 0..1e12 VND. No invented tax/break/overtime policy is applied.

UI MUST NOT send gross_vnd, net_vnd, actual_minutes, rate, actor, segment identity
or calculation version; unknown fields are rejected. The server reuses the
stored immutable attendance/rate snapshot and integer half-up VND calculator.
PostgreSQL independently calculates and validates gross before writing.
Rate changes effective after the shift business date do not rewrite a snapshot.

### Void an active Draft line

```json
{
  "action": "void_line",
  "period_id": "PERIOD_ID",
  "line_id": "LINE_ID",
  "expected_version": 2,
  "request_id": "10000000-0000-4000-8000-000000000002",
  "reason": "Void claim with preserved evidence"
}
```

Void accepts no amount fields. It sets voided_at and increments version while
preserving all original monetary and attendance evidence. It is terminal:
there is no delete, unvoid, reissue or transfer to another period. Global
segment uniqueness remains intact even after void. A voided segment cannot
be prepared again anywhere; a future reissue needs a separately approved design.

### Success response and audit

HTTP 200 for both first execution and identical retry:

```json
{
  "ok": true,
  "line": {
    "id": "LINE_ID", "period_id": "PERIOD_ID", "segment_id": "SEGMENT_ID",
    "rate_card_id": "RATE_ID", "staff_id": "STAFF_ID", "operational_role": "host",
    "actual_minutes": 90, "payable_minutes": 60, "overtime_minutes": 30,
    "rate_vnd_per_hour": 100000, "overtime_multiplier_basis_points": 15000,
    "gross_vnd": 125000, "adjustment_vnd": -1000, "net_vnd": 124000,
    "adjustment_reason": "Independent adjustment approved",
    "calculation_version": "rc16-v1", "version": 2, "voided_at": null,
    "created_at": "2026-10-11T10:00:00+00:00", "updated_at": "2026-10-11T10:05:00+00:00"
  },
  "audit": {
    "id": 7, "period_id": "PERIOD_ID", "line_id": "LINE_ID", "line_version": 2,
    "action": "correct_line", "actor_id": "ADMIN_ID",
    "reason": "Verified payable and OT correction", "from_status": "draft", "to_status": "draft",
    "created_at": "2026-10-11T10:05:00+00:00",
    "request_id": "10000000-0000-4000-8000-000000000001",
    "request_payload": { "action": "correct_line" },
    "previous_values": { "version": 1, "payable_minutes": 90, "gross_vnd": 175000 },
    "updated_values": { "version": 2, "payable_minutes": 60, "gross_vnd": 125000 }
  },
  "replayed": false
}
```

The example abbreviates request_payload and the audit snapshots: actual
previous_values and updated_values contain the full line objects, and
request_payload contains the normalized RPC inputs (including the server
computed expected gross). audit.updated_values equals line. Void returns the
same envelope with action=void_line and non-null voided_at, retaining amounts.
Existing transition audit rows have null line-specific fields.
`prepare_line` responses additionally contain version=1 and voided_at=null.
GET payroll still returns `{ok, period, lines, audit}`; lines include active and
voided evidence, and audit includes both transitions and line corrections.

The line UPDATE and audit INSERT are one transaction. Each success increments
the line version once; it does not change period.revision (that identifies the
period). expected_version is the line version, not the period revision.
No unaudited line UPDATE/DELETE is exposed; audit UPDATE/DELETE is blocked.

### Retry, conflict and visible states

- Generate one UUID per intended user mutation and retain the exact request
  while retrying a timeout/503. The key is scoped to the authenticated Admin.
- Identical retries return the original line/audit and replayed=true, including
  after later correction, void or Review/Lock. This is a historical receipt;
  refresh GET after replay to obtain the current line/period state.
- Reusing that UUID with a different payload returns HTTP 409. After a stale
  conflict refresh GET, show before/after, obtain a new user decision and send
  the current version with a new UUID. Never automatically overwrite changes.
- Only Draft + active line permits correction/void. Reviewed, Confirmed,
  Payroll Ready and Locked permit neither. A period with only voided lines
  cannot enter Review. Review/Confirm restrictions remain independent: the
  period creator and any correction/void author cannot Review that period.
- Show Active/Voided separately, the correction reason and audit before/after.
  Never sum voided evidence into payable totals: use only lines with
  voided_at=null. Locked CSV excludes voided lines and preserves negative
  numeric adjustments with text formula protection.

Error envelope is `{ "ok": false, "error": { "code": "..." } }`:

| HTTP | Meaning / codes |
| --- | --- |
| 400 | WORKFORCE_REQUEST_INVALID (schema/unknown salary fields); MALFORMED_REQUEST; WORKFORCE_PAYROLL_CORRECTION_INVALID (DB validation) |
| 401 | AUTHENTICATION_REQUIRED |
| 403 | PERMISSION_DENIED; WORKFORCE_BUSINESS_USER_REQUIRED; WORKFORCE_PAYROLL_ACTOR_FORBIDDEN |
| 409 | WORKFORCE_PAYROLL_STALE_LINE; WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT; WORKFORCE_PAYROLL_LINE_VOIDED; WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT; WORKFORCE_PAYROLL_LINE_NOT_FOUND; WORKFORCE_PAYROLL_GROSS_MISMATCH; existing calculation validation codes such as WORKFORCE_PAYABLE_MINUTES_INVALID / WORKFORCE_OVERTIME_MINUTES_INVALID / WORKFORCE_ADJUSTMENT_REASON_REQUIRED / WORKFORCE_NET_INVALID |
| 409 | Existing transition failures remain WORKFORCE_PAYROLL_TRANSITION_REJECTED, including empty/all-void periods and self-review/self-confirm |
| 413 | PAYLOAD_TOO_LARGE (JSON >16 KiB) |
| 503 | WORKFORCE_PAYROLL_LINE_READ_FAILED / WORKFORCE_PAYROLL_CORRECTION_FAILED; retry exact request safely, do not assume success |

Additive migration, after the foundation:
`supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql`.
No Preview/UAT or Production migration has been run by this task. The existing
development-environment ledger has not been queried; do not assume it matches Git.
See [RC1.6B business-rule audit](RC16B_BUSINESS_RULE_AUDIT.md) for source findings
and integration gates. One authorized Admin remains an approval blocker per
the previous checkpoint; current Production users were not queried again.

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

RC1.6H supersedes the F Staging/Preview path. All37 browser cases remain NOT RUN;
isolated fixtures are not authorized for cloud seeding. Both Staging-only RC16G
SQL files are excluded from the Production Payroll manifest.

1. Exact final integrated UI/backend SHA, owner-approved source, Node22/24 and PG16/17 gates.
2. Production schema/provider compatibility, backup/restore and candidate/key/routing proof.
3. HR-approved rate basis, overtime, payable breaks, lateness and independent Admin reviewer.
4. Explicit terminal void/reissue acceptance; keep global segment reservation.
5. Separate owner approvals for Production DDL, merge/deploy and module activation.
6. Both flags OFF until applicable gates pass; validate existing operational functions first.
7. Storage physical provider checks and browser acceptance need separate authorized evidence.

## Previous RC1.6 checkpoint (recorded 2026-10-11; Production not re-queried for RC1.6B)

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
