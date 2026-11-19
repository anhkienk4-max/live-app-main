import { ADA_ROOM_RULES_EFFECTIVE_DATE } from './adaRoomRulebook'
import { resolveShiftPlannedInterval } from './latenessPolicy'

/**
 * The Workforce actual segment is NOT the timestamp of the message posted to
 * the operations chat. It cannot prove room-rule check-in or outfit evidence.
 * This mapper is read-only and MUST NEVER originate a sanction or payroll write.
 */
export interface RoomAttendanceShift {
  id: string
  date: string
  start_time: string
  end_time: string
  start_at?: string | null
  end_at?: string | null
  end_date?: string | null
  crosses_midnight?: boolean | null
  timezone?: string | null
}
export interface RoomAttendanceSegment {
  id: string
  shift_id: string
  staff_id: string
  operational_role: 'host' | 'support' | 'technical'
  review_status: 'draft' | 'approved' | 'rejected'
  event_kind: 'worked' | 'no_show'
  actual_start_at: string | null
  actual_end_at: string | null
}
export interface RoomAttendanceReview {
  state: 'no_record' | 'unverified' | 'approved_worked' | 'approved_no_show' | 'outside_policy' | 'schedule_invalid'
  staffId: string | null
  role: RoomAttendanceSegment['operational_role'] | null
  shiftId: string
  scheduledLiveStartIso: string | null
  deadlineIso: string | null
  actualStartIso: string | null
  /** For context only. Actual-staffing evidence is NOT group check-in time. */
  actualStartDeltaMinutes: number | null
  officialGroupCheckInStatus: 'not_integrated'
  requiresHumanVerification: true
  canAutoFine: false
}
export function reviewRoomAttendance(
  shift: RoomAttendanceShift,
  segment: RoomAttendanceSegment | null,
): RoomAttendanceReview {
  const base: RoomAttendanceReview = {
    state: 'no_record', staffId: segment?.staff_id ?? null,
    role: segment?.operational_role ?? null, shiftId: shift.id,
    scheduledLiveStartIso: null, deadlineIso: null, actualStartIso: null,
    actualStartDeltaMinutes: null, officialGroupCheckInStatus: 'not_integrated',
    requiresHumanVerification: true, canAutoFine: false,
  }
  if (shift.date < ADA_ROOM_RULES_EFFECTIVE_DATE) return {...base, state:'outside_policy'}
  let start: number
  try {
    const interval = resolveShiftPlannedInterval(shift)
    start = Date.parse(interval.startIso)
    if (!Number.isFinite(start)) throw new Error('MISSING_SHIFT_TIME')
    base.scheduledLiveStartIso = interval.startIso
    if (segment?.operational_role === 'host' || segment?.operational_role === 'support') {
      const offset = segment.operational_role === 'host' ? 15 : 30
      base.deadlineIso = new Date(start - offset * 60_000).toISOString()
    }
  } catch {
    return {...base,state:'schedule_invalid'}
  }
  if (!segment) return base
  if (segment.shift_id !== shift.id || segment.review_status !== 'approved')
    return {...base,state:'unverified'}
  if (segment.event_kind === 'no_show') return {...base,state:'approved_no_show'}
  if (!segment.actual_start_at || !Number.isFinite(Date.parse(segment.actual_start_at)))
    return {...base,state:'unverified'}
  base.actualStartIso = segment.actual_start_at
  if (base.deadlineIso) {
    const deadline = Date.parse(base.deadlineIso)
    base.actualStartDeltaMinutes = Math.round((Date.parse(segment.actual_start_at) - deadline) / 60_000)
  }
  return {...base,state:'approved_worked'}
}
