# RC19 G11 → C11 Payslip Read Contract Proposal

Status: proposal for Codex C11 review. This is not an implemented API contract.

## Current response

`GET /api/workforce/my-payslip?year=YYYY` requires `payroll.view_own`, derives the owner from the authenticated server actor, accepts no actor/Brand/Platform filter, and returns only locked statements (up to 12). It includes stored line money/rate, approved actual interval, minute and nullable second totals, overtime classification, attendance review, locked timestamp, and confirmed cancellation adjustments. Existing data is owner-scoped and the UI must display the persisted totals without recalculation.

The current line response omits the payroll line's `segment_id`, scheduled interval, original check-in/out receipts, correction history, review/confirmation history, payroll hold/correction state, policy cases, and Brand/Platform relationships. `actual_start_at`/`actual_end_at` are from the approved `workforce_actual_segments` row; they are not original attendance receipts or proof of a correction. The handler currently excludes holds by returning locked statements only.

## Proposed additive contract

```ts
type ISODate = string // YYYY-MM-DD
type ISOInstant = string
type Pending<T> = { status: 'available'; value: T } | { status: 'pending' | 'unavailable'; reason?: string }

type ScheduledInterval = {
  shiftId: string
  staffingSegmentId: string
  shiftDate: ISODate
  startAt: ISOInstant
  endAt: ISOInstant
  timeZone: 'Asia/Ho_Chi_Minh'
  brandId: string | null
  platformId: string | null
}

type AttendanceReceipt = {
  eventId: string
  kind: 'check_in' | 'check_out'
  recordedAt: ISOInstant
  photoAvailable: boolean
  verificationStatus: string
}

type AttendanceCorrection = {
  correctionId: string
  eventId: string
  effectiveAt: ISOInstant | null
  status: 'pending' | 'approved' | 'rejected'
  authorizedBy: string | null
  decidedAt: ISOInstant | null
  reason: string | null
}

type ApprovedActualInterval = {
  actualSegmentId: string
  staffingSegmentId: string
  startAt: ISOInstant
  endAt: ISOInstant
  actualSeconds: number
  reviewStatus: 'approved'
  approvedBy: string | null
  approvedAt: ISOInstant | null
}

type PayrollLineValues = {
  payableSeconds: number | null
  overtimeSeconds: number | null
  overtimeApprovalId: string | null
  overtimeMultiplierBasisPoints: number | null
  approvedRateVndPerHour: number
  grossVnd: number
  adjustmentVnd: number
  netVnd: number
  calculationVersion: string
}

type PayrollDecision = {
  eventId: string
  action: 'created' | 'reviewed' | 'confirmed' | 'locked' | 'corrected' | 'voided'
  actorId: string
  at: ISOInstant
  reason: string | null
  priorVersion: number | null
  version: number
}

type PayrollHold = {
  status: 'held' | 'cleared'
  code: string
  missingEvidence: string[]
  openedAt: ISOInstant
  clearedAt: ISOInstant | null
  clearedBy: string | null
}

type AuthorizedPolicyCase = {
  caseId: string
  staffingSegmentId: string
  shiftId: string
  shiftDate: ISODate
  staffId: string
  operationalRole: 'host' | 'support' | 'technical'
  reason: string
  policyCode: string
  status: 'pending' | 'confirmed' | 'rejected' | 'appealed'
  amountVnd: number | null
  decidedBy: string | null
  decidedAt: ISOInstant | null
}

type MyPayslipLineV2 = {
  lineId: string
  staffingSegmentId: string
  shiftId: string
  scheduled: Pending<ScheduledInterval>
  attendanceReceipts: Pending<AttendanceReceipt[]>
  corrections: Pending<AttendanceCorrection[]>
  approvedActual: Pending<ApprovedActualInterval>
  payroll: PayrollLineValues // immutable persisted values for locked periods
  decisions: Pending<PayrollDecision[]>
  hold: Pending<PayrollHold>
  policyCases: Pending<AuthorizedPolicyCase[]>
}

type MyPayslipResponseV2 = {
  ok: true
  scope: 'own_locked_only'
  effectiveDate: '2026-11-10'
  statements: Array<{
    periodId: string
    status: 'locked'
    lockedAt: ISOInstant
    totalNetVnd: number // persisted statement total; never derived by the client
    lines: MyPayslipLineV2[]
  }>
}
```

## Authority and invariants

- Resolve staff identity and every related row on the server. Never accept a client actor ID or infer missing actuals, receipts, corrections, rates, or statuses from a planned shift.
- Apply the existing `payroll.view_own` policy plus authoritative Brand/Platform scope where the C11 endpoint exposes cross-staff or team views. A UI-hidden control is not authorization.
- Each payroll line belongs to exactly one `staffingSegmentId`; segment-level actuals and pay must not multiply GMV or create duplicate payroll lines when a livestream has multiple staffing segments.
- Keep persisted locked amounts, payable seconds, rate, OT approval, and total immutable in the read model. The client formats these values only.
- Represent absent or not-yet-authorized records with `pending`/`unavailable`; do not substitute planned interval values or imply a successful evidence receipt.
- Policy cases are read-only and only server-authorized, decided cases may carry a payable adjustment. No automatic fine or early-arrival bonus is implied by attendance data.
- The repository's payroll second-precision effective date is `2026-11-10` (10 November 2026). Treat older locked periods as stored historical results; never silently recalculate October payroll. Confirm this ISO interpretation with the C11 owner if the requested `10/11/2026` meant 11 October.

## C11 decisions required

Confirm whether the response should be additive to the personal endpoint or a separate authorized review endpoint; define the server-side scope for each field; identify the authoritative correction/decision history sources and retention; define pagination for policy cases/history; and approve the effective-date interpretation before UI work consumes the proposal.
