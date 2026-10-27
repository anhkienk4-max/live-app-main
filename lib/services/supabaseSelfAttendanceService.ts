import { createClient } from '@/lib/supabase/client'
import { decodeSelfAttendanceEvent, decodeSelfAttendanceHistory, type AttendanceRole, type AttendanceEventKind } from '@/lib/utils/selfAttendanceContract'

export async function readMySelfAttendance(shiftId: string, actorId?: string) {
  const { data,error }=await createClient().rpc('get_my_self_attendance',{p_shift_id:shiftId,p_limit:10})
  if(error)throw new Error(error.message || 'ATTENDANCE_READ_FAILED')
  const events=decodeSelfAttendanceHistory(data)
  if(events.some(e=>e.shift_id!==shiftId||(actorId && e.staff_id!==actorId)))throw new Error('ATTENDANCE_SCOPE_INVALID')
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
export async function writeSelfAttendancePhoto(
  shiftId:string,role:AttendanceRole,kind:AttendanceEventKind,requestId:string,
  photo:File,captureSource:'camera'|'file_picker'
) {
  if(photo.size<1||photo.size>4*1024*1024)throw new Error('Ảnh phải nhỏ hơn 4 MB.')
  const data=new FormData()
  data.set('shift_id',shiftId)
  data.set('role',role)
  data.set('event_kind',kind)
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
  if(event.shift_id!==shiftId||event.role!==role||event.event!==kind
    ||event.photo_available!==true)throw new Error('ATTENDANCE_PHOTO_RESPONSE_INVALID')
  return event
}

export async function writeSelfAttendancePhotoCheckIn(
  shiftId:string,role:AttendanceRole,requestId:string,
  photo:File,captureSource:'camera'|'file_picker'
) {
  return writeSelfAttendancePhoto(shiftId,role,'check_in',requestId,photo,captureSource)
}

export async function writeSelfAttendancePhotoCheckOut(
  shiftId:string,role:AttendanceRole,requestId:string,
  photo:File,captureSource:'camera'|'file_picker'
) {
  return writeSelfAttendancePhoto(shiftId,role,'check_out',requestId,photo,captureSource)
}

export interface SelfAttendancePhotoReviewContext {
  event_id:string; shift_id:string; role:AttendanceRole; event:AttendanceEventKind
  review_version:number; decision:'approved'|'rejected'|'correction_requested'|null
  reason:string|null; evidence_request_id:string|null; can_submit_correction:boolean
}

export async function readSelfAttendancePhotoReviewContext(eventId:string):Promise<SelfAttendancePhotoReviewContext> {
  const response=await fetch(`/api/workforce/self-attendance-photo/correction?event_id=${encodeURIComponent(eventId)}`,{credentials:'same-origin',cache:'no-store'})
  const payload=await response.json()
  if(!response.ok||payload?.ok!==true)throw new Error(payload?.error?.code||'ATTENDANCE_REVIEW_CONTEXT_UNAVAILABLE')
  return payload.context as SelfAttendancePhotoReviewContext
}

export async function submitSelfAttendancePhotoCorrection(eventId:string,requestId:string,file:File,captureSource:'camera'|'file_picker') {
  const form=new FormData();form.set('event_id',eventId);form.set('request_id',requestId);form.set('capture_source',captureSource);form.set('file',file)
  const response=await fetch('/api/workforce/self-attendance-photo/correction',{method:'POST',body:form,credentials:'same-origin',cache:'no-store'})
  const payload=await response.json()
  if(!response.ok||payload?.ok!==true)throw new Error(payload?.error?.code||'ATTENDANCE_PHOTO_CORRECTION_FAILED')
  return payload as {ok:true;request_id:string;replayed?:boolean}
}
/** Resume a server-verified photo reservation after reload or network failure.
 * This deliberately sends no image bytes, Drive IDs, staff ID or provider path. */
export async function recoverSelfAttendancePhoto(
  shiftId:string,role:AttendanceRole,kind:AttendanceEventKind,requestId:string,
) {
  const form=new FormData()
  form.set('shift_id',shiftId)
  form.set('role',role)
  form.set('event_kind',kind)
  form.set('request_id',requestId)
  form.set('recover_only','true')
  const response=await fetch('/api/workforce/self-attendance-photo',{
    method:'POST',body:form,credentials:'same-origin',cache:'no-store',
  })
  const payload=await response.json()
  if(!response.ok||payload?.ok!==true)
    throw new Error(payload?.error?.code||'ATTENDANCE_PHOTO_RECOVERY_FAILED')
  const event=decodeSelfAttendanceEvent(payload.event)
  if(event.shift_id!==shiftId||event.role!==role||event.event!==kind
    ||event.photo_available!==true)
    throw new Error('ATTENDANCE_PHOTO_RESPONSE_INVALID')
  return event
}

export async function recoverSelfAttendancePhotoCheckIn(
  shiftId:string,role:AttendanceRole,requestId:string,
) {
  return recoverSelfAttendancePhoto(shiftId,role,'check_in',requestId)
}

export async function recoverSelfAttendancePhotoCheckOut(
  shiftId:string,role:AttendanceRole,requestId:string,
) {
  return recoverSelfAttendancePhoto(shiftId,role,'check_out',requestId)
}
