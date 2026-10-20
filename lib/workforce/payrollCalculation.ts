/**
 * RC1.6: Pure, auditable payroll calculation. No DB queries, automatic rate
 * assumptions, implicit overtime, taxes, or schedule-to-actual inference.
 */
export type WorkforceRole = 'host' | 'support' | 'technical'
export type ActualEventKind = 'worked' | 'no_show'
export type ReviewStatus = 'draft' | 'approved' | 'rejected'

export interface ActualStaffingEvidence {
  id: string
  shiftId: string
  staffId: string
  role: WorkforceRole
  eventKind: ActualEventKind
  reviewStatus: ReviewStatus
  startAt: string | null
  endAt: string | null
}

export interface ApprovedPayrollRate {
  id: string
  staffId: string | null // null means an explicitly approved role-level rate
  role: WorkforceRole
  effectiveFrom: string
  effectiveThrough: string | null
  vndPerHour: number
  overtimeMultiplierBasisPoints: number
  approvedBy: string
}

export interface PayrollLineSnapshot {
  segmentId: string
  rateCardId: string
  staffId: string
  role: WorkforceRole
  actualMinutes: number
  payableMinutes: number
  overtimeMinutes: number
  rateVndPerHour: number
  overtimeMultiplierBasisPoints: number
  grossVnd: number
  adjustmentVnd: number
  netVnd: number
  adjustmentReason: string | null
  calculationVersion: 'rc16-v1'
}

export class WorkforceCalculationError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'WorkforceCalculationError'
  }
}

function guard(condition: unknown, code: string): asserts condition {
  if (!condition) throw new WorkforceCalculationError(code)
}
function isIsoDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
function validMinutes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1440
}
function validMoney(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000_000
}
export function minuteDifference(start: string | null, end: string | null): number {
  guard(start && end && Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)),
    'WORKFORCE_ACTUAL_TIMES_REQUIRED')
  // ISO offset required: avoid timezone-dependent Date.parse for local text.
  guard(/(?:Z|[+-]\d{2}:\d{2})$/u.test(start) && /(?:Z|[+-]\d{2}:\d{2})$/u.test(end),
    'WORKFORCE_TIMEZONE_REQUIRED')
  const ms = Date.parse(end) - Date.parse(start)
  guard(ms > 0 && ms <= 86_400_000 && ms % 60_000 === 0, 'WORKFORCE_DURATION_INVALID')
  return ms / 60_000
}

/** Reject overlapping approved rates. A person-specific approved rate takes
 * priority over an approved role rate, but ambiguity at either level is fatal. */
export function selectApprovedRate(
  segment: Pick<ActualStaffingEvidence, 'staffId' | 'role'>,
  shiftDate: string,
  rates: readonly ApprovedPayrollRate[],
): ApprovedPayrollRate {
  guard(isIsoDate(shiftDate), 'WORKFORCE_SHIFT_DATE_INVALID')
  const applicable = rates.filter(r => r.role === segment.role
    && (r.staffId === null || r.staffId === segment.staffId)
    && r.effectiveFrom <= shiftDate
    && (r.effectiveThrough === null || shiftDate <= r.effectiveThrough)
    && Boolean(r.approvedBy)
    && isIsoDate(r.effectiveFrom)
    && (r.effectiveThrough === null || isIsoDate(r.effectiveThrough)))
  const scoped = applicable.filter(r => r.staffId === segment.staffId)
  const candidates = scoped.length ? scoped : applicable.filter(r => r.staffId === null)
  guard(candidates.length !== 0, 'WORKFORCE_RATE_NOT_APPROVED')
  guard(candidates.length === 1, 'WORKFORCE_RATE_AMBIGUOUS')
  return candidates[0]
}

export function calculatePayrollLine(input: {
  segment: ActualStaffingEvidence
  shiftDate: string
  rate: ApprovedPayrollRate
  payableMinutes: number
  overtimeMinutes: number
  adjustmentVnd?: number
  adjustmentReason?: string | null
}): PayrollLineSnapshot {
  const { segment, rate, shiftDate } = input
  guard(segment.reviewStatus === 'approved' && segment.eventKind === 'worked',
    'WORKFORCE_ATTENDANCE_NOT_APPROVED')
  guard(isIsoDate(shiftDate) && shiftDate >= rate.effectiveFrom
    && (rate.effectiveThrough === null || shiftDate <= rate.effectiveThrough),
    'WORKFORCE_RATE_OUTSIDE_VALIDITY')
  guard(rate.role === segment.role
    && (rate.staffId === null || rate.staffId === segment.staffId) && Boolean(rate.approvedBy),
    'WORKFORCE_RATE_SCOPE_MISMATCH')
  guard(Number.isSafeInteger(rate.vndPerHour)
    && rate.vndPerHour >= 0 && rate.vndPerHour <= 100_000_000,
    'WORKFORCE_RATE_INVALID')
  guard(Number.isSafeInteger(rate.overtimeMultiplierBasisPoints)
    && rate.overtimeMultiplierBasisPoints >= 10_000
    && rate.overtimeMultiplierBasisPoints <= 50_000, 'WORKFORCE_OT_RATE_INVALID')
  const actualMinutes = minuteDifference(segment.startAt, segment.endAt)
  const amounts = calculatePayrollAmounts({
    ...input, actualMinutes, rateVndPerHour: rate.vndPerHour,
    overtimeMultiplierBasisPoints: rate.overtimeMultiplierBasisPoints,
  })
  return {
    segmentId: segment.id, rateCardId: rate.id,
    staffId: segment.staffId, role: segment.role,
    actualMinutes, payableMinutes: input.payableMinutes,
    overtimeMinutes: input.overtimeMinutes, rateVndPerHour: rate.vndPerHour,
    overtimeMultiplierBasisPoints: rate.overtimeMultiplierBasisPoints,
    ...amounts, calculationVersion: 'rc16-v1',
  }
}

/** Draft corrections reuse the immutable attendance/rate snapshot. */
export function calculatePayrollAmounts(input: {
  actualMinutes: number
  rateVndPerHour: number
  overtimeMultiplierBasisPoints: number
  payableMinutes: number
  overtimeMinutes: number
  adjustmentVnd?: number
  adjustmentReason?: string | null
}): Pick<PayrollLineSnapshot, 'grossVnd' | 'adjustmentVnd' | 'netVnd' | 'adjustmentReason'> {
  guard(validMinutes(input.actualMinutes), 'WORKFORCE_DURATION_INVALID')
  guard(Number.isSafeInteger(input.rateVndPerHour) && input.rateVndPerHour >= 0
    && input.rateVndPerHour <= 100_000_000, 'WORKFORCE_RATE_INVALID')
  guard(Number.isSafeInteger(input.overtimeMultiplierBasisPoints)
    && input.overtimeMultiplierBasisPoints >= 10_000
    && input.overtimeMultiplierBasisPoints <= 50_000, 'WORKFORCE_OT_RATE_INVALID')
  guard(validMinutes(input.payableMinutes) && input.payableMinutes <= input.actualMinutes,
    'WORKFORCE_PAYABLE_MINUTES_INVALID')
  guard(validMinutes(input.overtimeMinutes) && input.overtimeMinutes <= input.payableMinutes,
    'WORKFORCE_OVERTIME_MINUTES_INVALID')
  // Compute in integer VND, single final half-up rounding:
  // (regular_minutes*hour_rate/60) +
  // (ot_minutes*hour_rate*overtime_bps/(60*10000)).
  const regularMinutes = input.payableMinutes - input.overtimeMinutes
  const denominator = 600_000n
  const numerator = BigInt(input.rateVndPerHour)
    * (BigInt(regularMinutes) * 10_000n
      + BigInt(input.overtimeMinutes) * BigInt(input.overtimeMultiplierBasisPoints))
  const gross = Number((numerator + denominator / 2n) / denominator)
  guard(validMoney(gross), 'WORKFORCE_GROSS_OUT_OF_RANGE')
  const adjustment = input.adjustmentVnd ?? 0
  guard(validMoney(adjustment), 'WORKFORCE_ADJUSTMENT_INVALID')
  const reason = input.adjustmentReason?.trim() || null
  guard(adjustment === 0 ? reason === null : !!reason && reason.length >= 8 && reason.length <= 1000,
    'WORKFORCE_ADJUSTMENT_REASON_REQUIRED')
  const net = gross + adjustment
  guard(validMoney(net) && net >= 0, 'WORKFORCE_NET_INVALID')
  return {
    grossVnd: gross, adjustmentVnd: adjustment, netVnd: net,
    adjustmentReason: reason,
  }
}

/** Payroll must have a complete approval chain. UI must never calculate
 * locked or payable totals from unreviewed lines. */
export type PayrollStatus = 'draft' | 'reviewed' | 'confirmed' | 'payroll_ready' | 'locked'
const transitions: Readonly<Record<PayrollStatus, PayrollStatus | null>> = {
  draft: 'reviewed', reviewed: 'confirmed', confirmed: 'payroll_ready',
  payroll_ready: 'locked', locked: null,
}
export function nextPayrollState(current: PayrollStatus, target: PayrollStatus): PayrollStatus {
  guard(transitions[current] === target, 'WORKFORCE_PAYROLL_INVALID_TRANSITION')
  return target
}

/**
 * Approved Overtime Evidence Contract
 * Overtime is NEVER inferred simply because actual time exceeded scheduled shift.
 * Staff-submitted notes (evidenceNote) alone CANNOT grant overtime pay.
 * Overtime must be explicitly approved by an authorized supervisor via reviewNote.
 * If evidenceNote claims OT but reviewNote does not approve it, OT is 0 and flagged as an unapproved exception.
 */
export interface ApprovedOtEvidenceContract {
  approvedOvertimeMinutes: number
  hasUnapprovedOtClaim: boolean
  unapprovedClaimReason?: string
}

export function evaluateApprovedOtEvidence(input: {
  reviewNote?: string | null
  evidenceNote?: string | null
  actualMinutes?: number
}): ApprovedOtEvidenceContract {
  const review = (input.reviewNote ?? '').trim()
  const evidence = (input.evidenceNote ?? '').trim()

  // 1. Explicit supervisor rejection or negative phrasing check
  const rejectionPattern = /(?:không\s+duyệt|khong\s+duyet|từ\s+chối|tu\s+choi|chưa\s+duyệt|chua\s+duyet|chưa\s+được|chua\s+duoc|không\s+được|khong\s+duoc|không\s+cho|khong\s+cho|bác\s+bỏ|bac\s+bo|no\s+ot|not\s+approved|rejected)/i
  if (rejectionPattern.test(review)) {
    return {
      approvedOvertimeMinutes: 0,
      hasUnapprovedOtClaim: true,
      unapprovedClaimReason: 'SUPERVISOR_REJECTED_OT',
    }
  }

  // 2. Explicit reviewer approval verification
  // Overtime requires an explicit approval keyword from the authorized reviewer (e.g. duyệt, approved, xác nhận, đồng ý).
  // Notes merely stating "OT 30p" or "tăng ca" without an approval keyword are ambiguous and strictly non-authoritative.
  const explicitApprovalPattern = /(?:duyệt|duyet|phê\s+duyệt|phe\s+duyet|approved?|xác\s+nhận|xac\s+nhan|đồng\s+ý|dong\s+y|chấp\s+thuận|chap\s+thuan)/i
  const otMentionPattern = /(?:ot|tăng\s+ca|tang\s+ca|overtime|làm\s+thêm|lam\s+them)/i

  let supervisorApprovedMins = 0
  if (review) {
    if (explicitApprovalPattern.test(review) && otMentionPattern.test(review)) {
      // Reviewer explicitly approved OT - extract hours or minutes
      const hourMatch = review.match(/(?:ot|tăng\s+ca|tang\s+ca|overtime|làm\s+thêm|lam\s+them)[^\d]*?(\d+(?:\.\d+)?)\s*(?:h|gio|giờ|hours?)(?:\b|$)/i)
        || review.match(/(\d+(?:\.\d+)?)\s*(?:h|gio|giờ|hours?)[^\d]*?(?:ot|tăng\s+ca|tang\s+ca|overtime|làm\s+thêm|lam\s+them)/i)

      if (hourMatch && hourMatch[1]) {
        const hours = parseFloat(hourMatch[1])
        if (Number.isFinite(hours) && hours > 0) {
          supervisorApprovedMins = Math.round(hours * 60)
        }
      } else {
        const minMatch = review.match(/(?:ot|tăng\s+ca|tang\s+ca|overtime|làm\s+thêm|lam\s+them)[^\d]*?(\d+)\s*(?:p|phut|phút|m|min|mins|minutes?)(?:\b|$)/i)
          || review.match(/(\d+)\s*(?:p|phut|phút|m|min|mins|minutes?)[^\d]*?(?:ot|tăng\s+ca|tang\s+ca|overtime|làm\s+thêm|lam\s+them)/i)
          || review.match(/(?:ot|tăng\s+ca|tang\s+ca|overtime|làm\s+thêm|lam\s+them)[:\s]+(\d+)(?:\b|$)/i)

        if (minMatch && minMatch[1]) {
          const mins = parseInt(minMatch[1], 10)
          if (Number.isFinite(mins) && mins > 0) {
            supervisorApprovedMins = mins
          }
        }
      }
    } else if (otMentionPattern.test(review)) {
      // Supervisor note mentions OT or extra hours without an explicit approval keyword (e.g. "OT 30p", "tăng ca")
      return {
        approvedOvertimeMinutes: 0,
        hasUnapprovedOtClaim: true,
        unapprovedClaimReason: 'AMBIGUOUS_SUPERVISOR_NOTE',
      }
    }
  }

  if (supervisorApprovedMins > 0) {
    const capped = input.actualMinutes !== undefined ? Math.min(supervisorApprovedMins, input.actualMinutes) : supervisorApprovedMins
    return {
      approvedOvertimeMinutes: capped,
      hasUnapprovedOtClaim: false,
    }
  }

  // 3. Supervisor did not explicitly approve OT. Check if staff claimed OT in evidenceNote
  const staffOtClaim = otMentionPattern.test(evidence)
  if (staffOtClaim) {
    return {
      approvedOvertimeMinutes: 0,
      hasUnapprovedOtClaim: true,
      unapprovedClaimReason: 'STAFF_CLAIMED_OT_WITHOUT_SUPERVISOR_APPROVAL',
    }
  }

  return {
    approvedOvertimeMinutes: 0,
    hasUnapprovedOtClaim: false,
  }
}

export function parseApprovedOvertimeMinutes(
  reviewNote?: string | null,
  evidenceNote?: string | null,
  actualMinutes?: number,
): number {
  return evaluateApprovedOtEvidence({ reviewNote, evidenceNote, actualMinutes }).approvedOvertimeMinutes
}

export interface AutoCalculateSegmentInput {
  segment: ActualStaffingEvidence & {
    reviewNote?: string | null
    evidenceNote?: string | null
  }
  shiftDate: string
}

export interface AutoCalculateResult {
  preparedLines: PayrollLineSnapshot[]
  skippedSegments: Array<{
    segmentId: string
    reason: string
  }>
  unapprovedOtExceptions: Array<{
    segmentId: string
    staffId: string
    shiftDate: string
    reason: string
  }>
}

/**
 * Pure auto-calculation engine for a payroll period:
 * Scans approved worked segments, resolves approved rate cards,
 * computes exact gross and net amounts with BigInt integer rounding,
 * extracts approved overtime minutes strictly from supervisor review notes,
 * and skips unapproved attendance or unapproved rates fail-closed.
 */
export function autoCalculatePeriodLines(input: {
  period: { periodStart: string; periodEnd: string }
  segments: readonly AutoCalculateSegmentInput[]
  rates: readonly ApprovedPayrollRate[]
  existingSegmentIds?: ReadonlySet<string>
}): AutoCalculateResult {
  const preparedLines: PayrollLineSnapshot[] = []
  const skippedSegments: Array<{ segmentId: string; reason: string }> = []
  const unapprovedOtExceptions: Array<{ segmentId: string; staffId: string; shiftDate: string; reason: string }> = []
  const existing = input.existingSegmentIds ?? new Set<string>()

  for (const item of input.segments) {
    const { segment, shiftDate } = item

    if (existing.has(segment.id)) {
      skippedSegments.push({ segmentId: segment.id, reason: 'ALREADY_EXISTS_IN_PERIOD' })
      continue
    }

    if (segment.reviewStatus !== 'approved' || segment.eventKind !== 'worked') {
      skippedSegments.push({ segmentId: segment.id, reason: 'ATTENDANCE_NOT_APPROVED_WORKED' })
      continue
    }

    if (shiftDate < input.period.periodStart || shiftDate > input.period.periodEnd) {
      skippedSegments.push({ segmentId: segment.id, reason: 'SHIFT_OUTSIDE_PERIOD' })
      continue
    }

    try {
      const selectedRate = selectApprovedRate(segment, shiftDate, input.rates)
      const actualMinutes = minuteDifference(segment.startAt, segment.endAt)
      const otContract = evaluateApprovedOtEvidence({
        reviewNote: segment.reviewNote,
        evidenceNote: segment.evidenceNote,
        actualMinutes,
      })

      if (otContract.hasUnapprovedOtClaim) {
        unapprovedOtExceptions.push({
          segmentId: segment.id,
          staffId: segment.staffId,
          shiftDate,
          reason: otContract.unapprovedClaimReason ?? 'STAFF_CLAIMED_OT_WITHOUT_SUPERVISOR_APPROVAL',
        })
      }

      const line = calculatePayrollLine({
        segment,
        shiftDate,
        rate: selectedRate,
        payableMinutes: actualMinutes,
        overtimeMinutes: otContract.approvedOvertimeMinutes,
      })
      preparedLines.push(line)
    } catch (err: unknown) {
      const code = err instanceof WorkforceCalculationError ? err.code : 'CALCULATION_FAILED'
      skippedSegments.push({ segmentId: segment.id, reason: code })
    }
  }

  return { preparedLines, skippedSegments, unapprovedOtExceptions }
}

export interface ExistingPayrollLineForRecalc {
  id: string
  periodId: string
  segmentId: string
  rateCardId: string
  staffId: string
  role: WorkforceRole
  version: number
  shiftDate: string
  actualMinutes: number
  payableMinutes: number
  overtimeMinutes: number
  rateVndPerHour: number
  overtimeMultiplierBasisPoints: number
  grossVnd: number
  adjustmentVnd: number
  netVnd: number
  adjustmentReason: string | null
}

export interface RecalculationLineDiff {
  lineId: string
  segmentId: string
  staffId: string
  role: WorkforceRole
  version: number
  shiftDate: string
  actualMinutes: number
  payableMinutes: number
  overtimeMinutes: number
  oldRateCardId: string
  oldRateVndPerHour: number
  newRateCardId: string | null
  newRateVndPerHour: number | null
  oldGrossVnd: number
  newGrossVnd: number | null
  grossDeltaVnd: number
  adjustmentVnd: number
  adjustmentReason: string | null
  oldNetVnd: number
  newNetVnd: number | null
  netDeltaVnd: number
  rateChanged: boolean
  errorReason: string | null
}

export interface RecalculationDiffSummary {
  totalLines: number
  changedLinesCount: number
  totalGrossDeltaVnd: number
  totalNetDeltaVnd: number
  preservedAdjustmentsCount: number
  unresolvedCount: number
}

/**
 * Calculates preview diffs for draft lines before applying recalculation.
 * Preserves accountant adjustments (adjustmentVnd, adjustmentReason) exactly.
 */
export function calculateRecalculationDiffs(input: {
  lines: readonly ExistingPayrollLineForRecalc[]
  rates: readonly ApprovedPayrollRate[]
}): {
  diffs: RecalculationLineDiff[]
  summary: RecalculationDiffSummary
} {
  const diffs: RecalculationLineDiff[] = []
  let changedLinesCount = 0
  let totalGrossDeltaVnd = 0
  let totalNetDeltaVnd = 0
  let preservedAdjustmentsCount = 0
  let unresolvedCount = 0

  for (const line of input.lines) {
    let newRate: ApprovedPayrollRate | null = null
    let errorReason: string | null = null

    try {
      newRate = selectApprovedRate(
        { staffId: line.staffId, role: line.role },
        line.shiftDate,
        input.rates,
      )
    } catch (err: unknown) {
      errorReason = err instanceof WorkforceCalculationError ? err.code : 'RATE_RESOLUTION_FAILED'
      unresolvedCount++
    }

    if (line.adjustmentVnd !== 0) {
      preservedAdjustmentsCount++
    }

    if (!newRate) {
      diffs.push({
        lineId: line.id,
        segmentId: line.segmentId,
        staffId: line.staffId,
        role: line.role,
        version: line.version,
        shiftDate: line.shiftDate,
        actualMinutes: line.actualMinutes,
        payableMinutes: line.payableMinutes,
        overtimeMinutes: line.overtimeMinutes,
        oldRateCardId: line.rateCardId,
        oldRateVndPerHour: line.rateVndPerHour,
        newRateCardId: null,
        newRateVndPerHour: null,
        oldGrossVnd: line.grossVnd,
        newGrossVnd: null,
        grossDeltaVnd: 0,
        adjustmentVnd: line.adjustmentVnd,
        adjustmentReason: line.adjustmentReason,
        oldNetVnd: line.netVnd,
        newNetVnd: null,
        netDeltaVnd: 0,
        rateChanged: false,
        errorReason,
      })
      continue
    }

    const rateChanged =
      newRate.id !== line.rateCardId ||
      newRate.vndPerHour !== line.rateVndPerHour ||
      newRate.overtimeMultiplierBasisPoints !== line.overtimeMultiplierBasisPoints

    if (!rateChanged) {
      diffs.push({
        lineId: line.id,
        segmentId: line.segmentId,
        staffId: line.staffId,
        role: line.role,
        version: line.version,
        shiftDate: line.shiftDate,
        actualMinutes: line.actualMinutes,
        payableMinutes: line.payableMinutes,
        overtimeMinutes: line.overtimeMinutes,
        oldRateCardId: line.rateCardId,
        oldRateVndPerHour: line.rateVndPerHour,
        newRateCardId: newRate.id,
        newRateVndPerHour: newRate.vndPerHour,
        oldGrossVnd: line.grossVnd,
        newGrossVnd: line.grossVnd,
        grossDeltaVnd: 0,
        adjustmentVnd: line.adjustmentVnd,
        adjustmentReason: line.adjustmentReason,
        oldNetVnd: line.netVnd,
        newNetVnd: line.netVnd,
        netDeltaVnd: 0,
        rateChanged: false,
        errorReason: null,
      })
      continue
    }

    // Recompute amounts with new rate card while preserving exact adjustments
    const amounts = calculatePayrollAmounts({
      actualMinutes: line.actualMinutes,
      rateVndPerHour: newRate.vndPerHour,
      overtimeMultiplierBasisPoints: newRate.overtimeMultiplierBasisPoints,
      payableMinutes: line.payableMinutes,
      overtimeMinutes: line.overtimeMinutes,
      adjustmentVnd: line.adjustmentVnd,
      adjustmentReason: line.adjustmentReason,
    })

    const grossDelta = amounts.grossVnd - line.grossVnd
    const netDelta = amounts.netVnd - line.netVnd

    changedLinesCount++
    totalGrossDeltaVnd += grossDelta
    totalNetDeltaVnd += netDelta

    diffs.push({
      lineId: line.id,
      segmentId: line.segmentId,
      staffId: line.staffId,
      role: line.role,
      version: line.version,
      shiftDate: line.shiftDate,
      actualMinutes: line.actualMinutes,
      payableMinutes: line.payableMinutes,
      overtimeMinutes: line.overtimeMinutes,
      oldRateCardId: line.rateCardId,
      oldRateVndPerHour: line.rateVndPerHour,
      newRateCardId: newRate.id,
      newRateVndPerHour: newRate.vndPerHour,
      oldGrossVnd: line.grossVnd,
      newGrossVnd: amounts.grossVnd,
      grossDeltaVnd: grossDelta,
      adjustmentVnd: line.adjustmentVnd,
      adjustmentReason: line.adjustmentReason,
      oldNetVnd: line.netVnd,
      newNetVnd: amounts.netVnd,
      netDeltaVnd: netDelta,
      rateChanged: true,
      errorReason: null,
    })
  }

  return {
    diffs,
    summary: {
      totalLines: input.lines.length,
      changedLinesCount,
      totalGrossDeltaVnd,
      totalNetDeltaVnd,
      preservedAdjustmentsCount,
      unresolvedCount,
    },
  }
}

/**
 * Live Salary Preview & Simulator for rate and shift adjustments.
 * Allows UI to compute salary preview immediately when typing rates or hours.
 */
export function calculateLivePreview(input: {
  rateVndPerHour: number
  overtimeMultiplierBasisPoints: number
  regularMinutes: number
  overtimeMinutes: number
  adjustmentVnd?: number
}): {
  regularVnd: number
  overtimeVnd: number
  grossVnd: number
  adjustmentVnd: number
  netVnd: number
  formulaDescription: string
} {
  const payableMinutes = input.regularMinutes + input.overtimeMinutes
  const amounts = calculatePayrollAmounts({
    actualMinutes: payableMinutes,
    rateVndPerHour: input.rateVndPerHour,
    overtimeMultiplierBasisPoints: input.overtimeMultiplierBasisPoints,
    payableMinutes,
    overtimeMinutes: input.overtimeMinutes,
    adjustmentVnd: input.adjustmentVnd ?? 0,
    adjustmentReason: (input.adjustmentVnd ?? 0) !== 0 ? 'Mô phỏng lương dự kiến' : null,
  })

  const regNum = BigInt(input.rateVndPerHour) * BigInt(input.regularMinutes)
  const regularVnd = Number((regNum + 30n) / 60n)
  const otNum = BigInt(input.rateVndPerHour) * BigInt(input.overtimeMinutes) * BigInt(input.overtimeMultiplierBasisPoints)
  const overtimeVnd = Number((otNum + 300_000n) / 600_000n)

  const otMultiplier = (input.overtimeMultiplierBasisPoints / 10000).toFixed(2)
  const formulaDescription =
    `(${input.regularMinutes}p × ${input.rateVndPerHour.toLocaleString('vi-VN')} đ/h ÷ 60) + ` +
    `(${input.overtimeMinutes}p OT × ${input.rateVndPerHour.toLocaleString('vi-VN')} đ/h × ${otMultiplier}x ÷ 60)` +
    (input.adjustmentVnd ? ` + (${input.adjustmentVnd.toLocaleString('vi-VN')} đ)` : '')

  return {
    regularVnd,
    overtimeVnd,
    grossVnd: amounts.grossVnd,
    adjustmentVnd: amounts.adjustmentVnd,
    netVnd: amounts.netVnd,
    formulaDescription,
  }
}
