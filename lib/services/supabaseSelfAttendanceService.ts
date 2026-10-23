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


/** Browser posts the photo to our authenticated server endpoint. Never upload
 * with a public Drive key or send base64 through Supabase RPC/SQL. */
export async function writeSelfAttendancePhotoCheckIn(
  shiftId:string,role:AttendanceRole,requestId:string,
  photo:File,captureSource:'camera'|'file_picker'
) {
  if(photo.size<1||photo.size>4*1024*1024)throw new Error('Ảnh phải nhỏ hơn 4 MB.')
  const data=new FormData()
  data.set('shift_id',shiftId)
  data.set('role',role)
  data.set('request_id',requestId)
  data.set('capture_source',captureSource)
  data.set('file',photo)
  const response=await fetch('/api/workforce/self-attendance-photo',{
    method:'POST',body:data,credentials:'same-origin',cache:'no-store',
  })
  const payload=await response.json()
  if(!response.ok||payload?.ok!==true)
    throw new Error(payload?.error?.code || 'ATTENDANCE_PHOTO_UPLOAD_FAILED')
  const event=decodeSelfAttendanceEvent(payload.event)
  if(event.shift_id!==shiftId||event.role!==role||event.event!=='check_in'
    ||event.photo_available!==true)throw new Error('ATTENDANCE_PHOTO_RESPONSE_INVALID')
  return event
}


/** Resume a server-verified photo reservation after reload or network failure.
 * This deliberately sends no image bytes, Drive IDs, staff ID or provider path. */
export async function recoverSelfAttendancePhotoCheckIn(
  shiftId:string,role:AttendanceRole,requestId:string,
) {
  const form=new FormData()
  form.set('shift_id',shiftId)
  form.set('role',role)
  form.set('request_id',requestId)
  form.set('recover_only','true')
  const response=await fetch('/api/workforce/self-attendance-photo',{
    method:'POST',body:form,credentials:'same-origin',cache:'no-store',
  })
  const payload=await response.json()
  if(!response.ok||payload?.ok!==true)
    throw new Error(payload?.error?.code||'ATTENDANCE_PHOTO_RECOVERY_FAILED')
  const event=decodeSelfAttendanceEvent(payload.event)
  if(event.shift_id!==shiftId||event.role!==role||event.event!=='check_in'
    ||event.photo_available!==true)
    throw new Error('ATTENDANCE_PHOTO_RESPONSE_INVALID')
  return event
}
