import { createClient } from '@/lib/supabase/client'
import { decodeSelfAttendanceEvent, decodeSelfAttendanceHistory, type AttendanceRole, type AttendanceEventKind } from '@/lib/utils/selfAttendanceContract'

export async function readMySelfAttendance(shiftId: string) {
  const { data,error }=await createClient().rpc('get_my_self_attendance',{p_shift_id:shiftId,p_limit:10})
  if(error)throw new Error(error.message || 'ATTENDANCE_READ_FAILED')
  const events=decodeSelfAttendanceHistory(data)
  if(events.some(e=>e.shift_id!==shiftId))throw new Error('ATTENDANCE_SCOPE_INVALID')
  return events
}

export async function writeSelfAttendance(shiftId:string,role:AttendanceRole,kind:AttendanceEventKind,requestId:string) {
  const { data,error }=await createClient().rpc('self_attendance_record',{
    p_shift_id:shiftId,p_operational_role:role,p_event_kind:kind,p_request_id:requestId,p_evidence_note:null,
  })
  if(error)throw new Error(error.message || 'ATTENDANCE_WRITE_FAILED')
  const event=decodeSelfAttendanceEvent(data)
  if(event.shift_id!==shiftId||event.role!==role||event.event!==kind)throw new Error('ATTENDANCE_SCOPE_INVALID')
  return event
}
