/**
 * RC1.6 Workforce Performance: evidence-based and denominated metrics only.
 * No payroll guesses, imputed attendance or unverified shift→GMV attribution.
 */
import {
  WorkforceCalculationError,
  type ActualStaffingEvidence, type WorkforceRole,
} from './payrollCalculation'

export interface ScheduledStaffing {
  shiftId: string
  staffId: string
  role: WorkforceRole
  scheduledStartAt: string // Zoned ISO string
  shiftDate: string         // YYYY-MM-DD in the shift's business timezone
  cancelled?: boolean
}

export interface WorkforcePerformanceSummary {
  staffId: string
  role: WorkforceRole
  assignedShifts: number
  verifiedShifts: number
  unknownAttendanceShifts: number
  approvedNoShows: number
  approvedWorkedShifts: number
  approvedActualMinutes: number
  lateShifts: number
  onTimeShifts: number
  attendanceCoveragePct: number | null
  punctualityPct: number | null
  knownReliabilityPct: number | null
  isComplete: boolean
  warning: 'INCOMPLETE_ATTENDANCE_EVIDENCE' | null
}

function fail(code: string): never { throw new WorkforceCalculationError(code) }
function percentage(num: number, den: number): number | null {
  return den === 0 ? null : Math.round(num * 10_000 / den) / 100
}
function epoch(zoned: string): number {
  if (!/(Z|[+-]\d{2}:\d{2})$/u.test(zoned)) return fail('WORKFORCE_TIMEZONE_REQUIRED')
  const n = Date.parse(zoned)
  if (!Number.isFinite(n)) return fail('WORKFORCE_TIME_INVALID')
  return n
}
function approvedEvidence(rows: readonly ActualStaffingEvidence[]): ActualStaffingEvidence[] {
  return rows.filter(r => r.reviewStatus === 'approved')
}
function minutesOf(row: ActualStaffingEvidence): number {
  if (row.eventKind !== 'worked' || !row.startAt || !row.endAt) {
    fail('WORKFORCE_APPROVED_WORKED_TIMES_REQUIRED')
  }
  const duration = epoch(row.endAt) - epoch(row.startAt)
  if (!(duration > 0 && duration <= 86_400_000 && duration % 60_000 === 0)) {
    fail('WORKFORCE_DURATION_INVALID')
  }
  return duration / 60_000
}

/** Aggregates one staff+role, based on approved Actual Staffing only.
 *
 * Unknown schedule attendance is never called no-show, late or "completed".
 * A percentage over verified subsets is clearly marked incomplete.
 * Multiple approved worked segments in one shift count as one attended shift.
 */
export function summarizeWorkforcePerformance(
  staffId: string,
  role: WorkforceRole,
  planned: readonly ScheduledStaffing[],
  evidence: readonly ActualStaffingEvidence[],
  options: { lateGraceMinutes: number },
): WorkforcePerformanceSummary {
  if (!staffId || !['host','support','technical'].includes(role)) fail('WORKFORCE_SCOPE_INVALID')
  if (!Number.isSafeInteger(options.lateGraceMinutes)
    || options.lateGraceMinutes < 0 || options.lateGraceMinutes > 120) {
    fail('WORKFORCE_GRACE_POLICY_REQUIRED')
  }
  const assignment = planned.filter(p => p.staffId === staffId && p.role === role && !p.cancelled)
  const byShift = new Map<string, ScheduledStaffing>()
  for (const p of assignment) {
    if (byShift.has(p.shiftId)) fail('WORKFORCE_DUPLICATE_PLANNED_ASSIGNMENT')
    epoch(p.scheduledStartAt)
    byShift.set(p.shiftId,p)
  }
  const verified = approvedEvidence(evidence)
    .filter(e => e.staffId === staffId && e.role === role)
  const evidenceByShift = new Map<string, ActualStaffingEvidence[]>()
  for (const row of verified) {
    // Ignore unassigned cover shifts for planned-rate denominator; they require
    // explicit inclusion as scheduled staffing to avoid inflating reliability.
    if (!byShift.has(row.shiftId)) continue
    evidenceByShift.set(row.shiftId,[...(evidenceByShift.get(row.shiftId) ?? []),row])
  }
  let observed = 0, noShows = 0, attended = 0, minutes = 0, late = 0, onTime = 0
  for (const [shiftId, p] of byShift) {
    const rows = evidenceByShift.get(shiftId) ?? []
    if (rows.length === 0) continue
    const noShowRows = rows.filter(r => r.eventKind === 'no_show')
    const workedRows = rows.filter(r => r.eventKind === 'worked')
    if (noShowRows.length > 1 || (noShowRows.length && workedRows.length)) {
      fail('WORKFORCE_CONFLICTING_APPROVED_EVIDENCE')
    }
    if (noShowRows.length) {
      observed++; noShows++; continue
    }
    observed++; attended++
    const ordered = workedRows.map(row => ({
      start: epoch(row.startAt ?? fail('WORKFORCE_ACTUAL_TIMES_REQUIRED')),
      end: epoch(row.endAt ?? fail('WORKFORCE_ACTUAL_TIMES_REQUIRED')),
      actual: minutesOf(row),
    })).sort((a,b) => a.start - b.start)
    for (let i=0; i<ordered.length; i++) {
      if (i>0 && ordered[i].start < ordered[i-1].end) {
        fail('WORKFORCE_OVERLAPPING_APPROVED_SEGMENTS')
      }
      minutes += ordered[i].actual
    }
    if (ordered[0].start - epoch(p.scheduledStartAt) > options.lateGraceMinutes * 60_000) late++
    else onTime++
  }
  const unknown = byShift.size - observed
  return {
    staffId,role,assignedShifts:byShift.size,verifiedShifts:observed,
    unknownAttendanceShifts:unknown,approvedNoShows:noShows,approvedWorkedShifts:attended,
    approvedActualMinutes:minutes,lateShifts:late,onTimeShifts:onTime,
    attendanceCoveragePct:percentage(observed,byShift.size),
    punctualityPct:percentage(onTime,attended),
    knownReliabilityPct:percentage(attended,observed),
    isComplete:unknown===0 && byShift.size>0,
    warning:unknown>0 ? 'INCOMPLETE_ATTENDANCE_EVIDENCE' : null,
  }
}
