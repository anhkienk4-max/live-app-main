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
function minuteDifference(start: string | null, end: string | null): number {
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
  guard(validMinutes(input.payableMinutes) && input.payableMinutes <= actualMinutes,
    'WORKFORCE_PAYABLE_MINUTES_INVALID')
  guard(validMinutes(input.overtimeMinutes) && input.overtimeMinutes <= input.payableMinutes,
    'WORKFORCE_OVERTIME_MINUTES_INVALID')
  // Compute in integer VND, single final half-up rounding:
  // (regular_minutes*hour_rate/60) +
  // (ot_minutes*hour_rate*overtime_bps/(60*10000)).
  const regularMinutes = input.payableMinutes - input.overtimeMinutes
  const denominator = 600_000n
  const numerator = BigInt(rate.vndPerHour)
    * (BigInt(regularMinutes) * 10_000n
      + BigInt(input.overtimeMinutes) * BigInt(rate.overtimeMultiplierBasisPoints))
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
    segmentId: segment.id, rateCardId: rate.id,
    staffId: segment.staffId, role: segment.role,
    actualMinutes, payableMinutes: input.payableMinutes,
    overtimeMinutes: input.overtimeMinutes, rateVndPerHour: rate.vndPerHour,
    overtimeMultiplierBasisPoints: rate.overtimeMultiplierBasisPoints,
    grossVnd: gross, adjustmentVnd: adjustment, netVnd: net,
    adjustmentReason: reason, calculationVersion: 'rc16-v1',
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
