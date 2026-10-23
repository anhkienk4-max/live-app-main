export type AttendanceEventKind = 'check_in' | 'check_out'
export type AttendanceRole = 'host' | 'support' | 'technical'
export interface SelfAttendanceEvent {
  event_id: string
  shift_id: string
  staff_id: string
  role: AttendanceRole
  event: AttendanceEventKind
  recorded_at: string
  verification_status: 'pending_verification'
  photo_available?: boolean
  replayed?: boolean
}
export function decodeSelfAttendanceEvent(data: unknown): SelfAttendanceEvent {
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('ATTENDANCE_RESPONSE_INVALID')
  const v = data as Record<string, unknown>
  if (['event_id','shift_id','staff_id','role','event','recorded_at','verification_status'].some(k=>typeof v[k]!=='string'||!(v[k] as string).trim()) ||
      !['host','support','technical'].includes(v.role as string) ||
      !['check_in','check_out'].includes(v.event as string) ||
      v.verification_status !== 'pending_verification' ||
      !Number.isFinite(Date.parse(v.recorded_at as string)) ||
      (v.photo_available!==undefined && typeof v.photo_available!=='boolean') ||
      (v.replayed!==undefined && typeof v.replayed!=='boolean')) throw new Error('ATTENDANCE_RESPONSE_INVALID')
  return v as unknown as SelfAttendanceEvent
}
export function decodeSelfAttendanceHistory(data: unknown): SelfAttendanceEvent[] {
  if (!Array.isArray(data) || data.length>100) throw new Error('ATTENDANCE_HISTORY_INVALID')
  const rows = data.map(decodeSelfAttendanceEvent)
  if (new Set(rows.map(r=>r.event_id)).size!==rows.length) throw new Error('ATTENDANCE_HISTORY_DUPLICATED')
  return rows
}
