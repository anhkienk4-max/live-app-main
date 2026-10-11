/**
 * RC1.6 Workforce calculations, intentionally independent of Next.js, SQL and
 * platform KPI data. The scheduled shift is never evidence of actual work.
 *
 * Money: integer VND, half-up rounding; OT uses basis points (10000 = 1x).
 * Time: integer minute boundaries, capped at 24 hours per segment.
 */
export type WorkforceRole = 'host' | 'support' | 'technical'
export type ActualEventKind = 'worked' | 'no_show'
export type ActualReviewStatus = 'draft' | 'approved' | 'rejected'

export type VerifiedActual = {
  id: string
  shiftId: string
  staffId: string
  role: WorkforceRole
  eventKind: ActualEventKind
  reviewStatus: ActualReviewStatus
  actualStartAt: string | null
  actualEndAt: string | null
}

export type RateSnapshot = {
  vndPerHour: number
  overtimeMultiplierBasisPoints: number
}

export type PayrollInput = {
  segment: VerifiedActual
  rate: RateSnapshot | null
  payableMinutes: number | null
  overtimeMinutes: number | null
  adjustmentVnd?: number
  adjustmentReason?: string | null
}

export type PayrollDraftResult =
  | { eligible: false; code: string }
  | {
    eligible: true
    actualMinutes: number
    payableMinutes: number
    overtimeMinutes: number
    grossVnd: number
    adjustmentVnd: number
    netVnd: number
    calculationVersion: 'rc16-v1'
  }

function intBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= min && value <= max
}

function parseIsoInstant(value: string | null): number | null {
  // Timezones are mandatory to prevent environment-dependent calculations.
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

export function verifiedActualMinutes(actual: VerifiedActual): number | null {
  if (actual.reviewStatus !== 'approved' || actual.eventKind !== 'worked') return null
  const start = parseIsoInstant(actual.actualStartAt)
  const end = parseIsoInstant(actual.actualEndAt)
  if (start === null || end === null) return null
  const duration = end - start
  if (!Number.isSafeInteger(duration) || duration <= 0
      || duration > 24 * 60 * 60 * 1000 || duration % 60000 !== 0) return null
  return duration / 60000
}

function roundedNonnegativeDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator
}

export function computePayrollDraft(input: PayrollInput): PayrollDraftResult {
  const actualMinutes = verifiedActualMinutes(input.segment)
  if (actualMinutes === null) return { eligible: false, code: 'ACTUAL_NOT_APPROVED' }
  if (input.rate === null) return { eligible: false, code: 'RATE_NOT_APPROVED' }
  if (!intBetween(input.rate.vndPerHour, 0, 100000000)
      || !intBetween(input.rate.overtimeMultiplierBasisPoints, 10000, 50000)) {
    return { eligible: false, code: 'RATE_INVALID' }
  }
  const payable = input.payableMinutes
  const overtime = input.overtimeMinutes
  if (!intBetween(payable, 0, actualMinutes) || !intBetween(overtime, 0, payable)) {
    return { eligible: false, code: 'PAYABLE_MINUTES_UNVERIFIED' }
  }
  const adjustment = input.adjustmentVnd ?? 0
  if (!intBetween(adjustment, -1000000000, 1000000000)) {
    return { eligible: false, code: 'ADJUSTMENT_INVALID' }
  }
  if (adjustment !== 0 && (!input.adjustmentReason
      || input.adjustmentReason.trim().length < 8)) {
    return { eligible: false, code: 'ADJUSTMENT_REASON_REQUIRED' }
  }
  if (adjustment === 0 && input.adjustmentReason?.trim()) {
    return { eligible: false, code: 'ADJUSTMENT_REASON_UNEXPECTED' }
  }
  const base = BigInt(payable - overtime) * 10000n
    + BigInt(overtime) * BigInt(input.rate.overtimeMultiplierBasisPoints)
  const gross = roundedNonnegativeDivision(
    BigInt(input.rate.vndPerHour) * base, 600000n,
  )
  const net = gross + BigInt(adjustment)
  if (net < 0n || net > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { eligible: false, code: 'NET_VND_INVALID' }
  }
  return {
    eligible: true, actualMinutes, payableMinutes: payable,
    overtimeMinutes: overtime, grossVnd: Number(gross),
    adjustmentVnd: adjustment, netVnd: Number(net),
    calculationVersion: 'rc16-v1',
  }
}

export type ActualPerformanceRow = VerifiedActual & {
  /** The scheduled start is contextual ONLY, never actual attendance evidence. */
  scheduledStartAt: string | null
}

export type StaffPerformance = {
  staffId: string
  confirmedWorkedShifts: number
  confirmedNoShowShifts: number
  actualMinutes: number
  punctualityObserved: number
  onTimeObserved: number
  lateObserved: number
  punctualityRate: number | null
  /** A missing denominator is unknown, not 0%. */
  dataQuality: 'no_verified_attendance' | 'partial' | 'verified'
}

/**
 * One staff may have multiple worked segments in a shift. Count unique shifts
 * once; total minutes include each independently reviewed interval. A verified
 * no-show is separate from a missing or unsubmitted attendance record.
 */
export function summarizeStaffPerformance(
  staffId: string,
  rows: readonly ActualPerformanceRow[],
  graceMinutes: number,
): StaffPerformance {
  if (!intBetween(graceMinutes, 0, 120)) throw new Error('GRACE_MINUTES_INVALID')
  const shifts = new Set<string>()
  const noShows = new Set<string>()
  const firstActualByShift = new Map<string, number>()
  const scheduledByShift = new Map<string, number>()
  let actualMinutes = 0
  let approvedRows = 0

  for (const row of rows) {
    if (row.staffId !== staffId || row.reviewStatus !== 'approved') continue
    approvedRows += 1
    if (row.eventKind === 'no_show') {
      noShows.add(row.shiftId)
      continue
    }
    const minutes = verifiedActualMinutes(row)
    const start = parseIsoInstant(row.actualStartAt)
    if (minutes === null || start === null) continue
    shifts.add(row.shiftId)
    actualMinutes += minutes
    const prev = firstActualByShift.get(row.shiftId)
    if (prev === undefined || start < prev) firstActualByShift.set(row.shiftId, start)
    const scheduled = parseIsoInstant(row.scheduledStartAt)
    if (scheduled !== null) scheduledByShift.set(row.shiftId, scheduled)
  }

  // Punctuality is measured only when a verified clock-in AND scheduled start exist.
  let punctualityObserved = 0
  let onTimeObserved = 0
  for (const [shiftId, start] of firstActualByShift) {
    const scheduled = scheduledByShift.get(shiftId)
    if (scheduled === undefined) continue
    punctualityObserved += 1
    if (start <= scheduled + graceMinutes * 60000) onTimeObserved += 1
  }
  const classifiedShifts = shifts.size + noShows.size
  return {
    staffId, confirmedWorkedShifts: shifts.size,
    confirmedNoShowShifts: noShows.size,
    actualMinutes, punctualityObserved, onTimeObserved,
    lateObserved: punctualityObserved - onTimeObserved,
    punctualityRate: punctualityObserved
      ? Math.round(onTimeObserved / punctualityObserved * 10000) / 100 : null,
    dataQuality: approvedRows === 0 ? 'no_verified_attendance'
      : punctualityObserved === shifts.size && classifiedShifts > 0
        ? 'verified' : 'partial',
  }
}
