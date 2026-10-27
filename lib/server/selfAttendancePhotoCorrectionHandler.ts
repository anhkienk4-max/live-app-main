import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { requireUser, authorizationErrorResponse, isAuthorizationError } from '@/lib/server/authGuards'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import { resolveGoogleDriveAuthMode } from '@/lib/server/googleDriveAuth'
import { assertPrivateAttendanceDriveRoot } from '@/lib/server/attendanceDriveAcl'
import { AttendanceDriveAclError } from '@/lib/utils/attendanceDriveAcl'
import { createFileStorageService } from '@/lib/services/fileStorageService'
import { attendancePhotoFolder, attendancePhotoName } from '@/lib/utils/attendancePhotoNaming'
import { readFormDataBody, RequestBodyError, consumeRateLimit, rateLimitResponse } from '@/lib/server/apiSecurity'

const uuid=z.string().uuid()
const headers={'Cache-Control':'no-store'}
const fail=(code:string,status:number)=>Response.json({ok:false,error:{code}},{status,headers})
function provider() {
  const root=process.env.GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID?.trim()
  if(!root||!/^[a-zA-Z0-9_-]{12,120}$/.test(root))throw new Error('ATTENDANCE_DRIVE_NOT_CONFIGURED')
  const env={...process.env,GOOGLE_DRIVE_ROOT_FOLDER_ID:root}
  const mode=resolveGoogleDriveAuthMode(env)
  const keys=mode==='oauth_refresh_token'?['GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','GOOGLE_DRIVE_REFRESH_TOKEN']:['GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL','GOOGLE_DRIVE_PRIVATE_KEY']
  if(!keys.every(key=>Boolean(env[key as keyof typeof env]?.trim())))throw new Error('ATTENDANCE_DRIVE_NOT_CONFIGURED')
  return {root,drive:createGoogleDriveFileProvider({env})}
}

export async function GET(request:Request) {
  try {
    const actor=await requireUser(request)
    if(!actor.businessUserId)return fail('PERMISSION_DENIED',403)
    const eventId=uuid.parse(new URL(request.url).searchParams.get('event_id'))
    const session=await createSessionClient()
    const result=await session.rpc('get_my_self_attendance_photo_review_context',{p_event_id:eventId})
    if(result.error)return fail('ATTENDANCE_REVIEW_CONTEXT_UNAVAILABLE',403)
    return Response.json({ok:true,context:result.data},{headers})
  } catch(error) {
    if(isAuthorizationError(error))return authorizationErrorResponse(error)
    return fail('ATTENDANCE_REVIEW_CONTEXT_UNAVAILABLE',400)
  }
}

export async function POST(request:Request) {
  let drive:ReturnType<typeof createGoogleDriveFileProvider>|null=null
  let fileId:string|null=null
  let metadataSaved=false
  let pendingRequestId:string|null=null
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)return fail('ATTENDANCE_PHOTO_ORIGIN_INVALID',403)
    const actor=await requireUser(request)
    if(!actor.businessUserId)return fail('PERMISSION_DENIED',403)
    if(process.env.FEATURE_SELF_ATTENDANCE_REVIEW!=='true'||process.env.FEATURE_SELF_ATTENDANCE_PHOTO!=='true'||process.env.FILE_STORAGE_ENABLED!=='true')return fail('ATTENDANCE_REVIEW_DISABLED',503)
    const rate=consumeRateLimit({key:`attendance-photo-correction:${actor.businessUserId}`,limit:6,windowMs:60*60*1000})
    if(!rate.allowed)return rateLimitResponse(rate.resetAt)
    const form=await readFormDataBody(request,4*1024*1024+8192)
    const eventId=uuid.parse(form.get('event_id'))
    const requestId=uuid.parse(form.get('request_id'))
    pendingRequestId=requestId
    const capture=z.enum(['camera','file_picker']).parse(form.get('capture_source'))
    const file=form.get('file')
    if(!(file instanceof File)||file.size<1||file.size>4*1024*1024)return fail('ATTENDANCE_PHOTO_REQUIRED',413)
    const session=await createSessionClient()
    const contextResult=await session.rpc('get_my_self_attendance_photo_review_context',{p_event_id:eventId})
    if(contextResult.error)return fail('ATTENDANCE_CORRECTION_NOT_REQUESTED',403)
    const context=contextResult.data as {event_id:string;shift_id:string;role:'host'|'support'|'technical';event:'check_in'|'check_out';decision:string|null;evidence_request_id:string|null;can_submit_correction:boolean}
    if(!context.can_submit_correction)return fail('ATTENDANCE_CORRECTION_NOT_REQUESTED',409)
    const admin=createSupabaseAdminClient()
    const event=await admin.from('self_attendance_events').select('request_id,staff_id,shift_id,operational_role,event_kind').eq('id',eventId).maybeSingle()
    if(event.error||!event.data||event.data.staff_id!==actor.businessUserId||event.data.shift_id!==context.shift_id||event.data.operational_role!==context.role||event.data.event_kind!==context.event)return fail('ATTENDANCE_REVIEW_CONTEXT_INVALID',409)
    const previousRequestId=context.evidence_request_id||event.data.request_id
    const existing=await admin.from('self_attendance_photo_evidence_addenda').select('request_id,event_id,previous_request_id,submitted_by').eq('request_id',requestId).maybeSingle()
    if(existing.data) { if(existing.data.event_id!==eventId||existing.data.previous_request_id!==previousRequestId||existing.data.submitted_by!==actor.businessUserId)return fail('ATTENDANCE_CORRECTION_REQUEST_REUSED',409); return Response.json({ok:true,request_id:requestId,replayed:true},{headers}) }
    const oldEvidence=await admin.from('self_attendance_photo_evidence').select('shift_context').eq('request_id',event.data.request_id).maybeSingle()
    if(oldEvidence.error||!oldEvidence.data)return fail('ATTENDANCE_PHOTO_NOT_FOUND',404)
    const savedContext=z.object({shift_id:z.string(),shift_date:z.string(),start_time:z.string(),end_time:z.string(),brand:z.string(),platform:z.string(),staff_name:z.string(),role:z.enum(['host','support','technical']),studio:z.string().nullable(),title:z.string().nullable()}).safeParse(oldEvidence.data.shift_context)
    if(!savedContext.success)return fail('ATTENDANCE_REVIEW_CONTEXT_INVALID',409)
    const bytes=new Uint8Array(await file.arrayBuffer())
    const signature=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'image/jpeg':bytes[0]===137&&bytes[1]===80&&bytes[2]===78?'image/png':new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP'?'image/webp':null
    if(!signature||(file.type&&file.type!==signature&&file.type!=='application/octet-stream'))return fail('ATTENDANCE_PHOTO_TYPE_INVALID',415)
    const sharpModule=await import('sharp')
    const sharp=(sharpModule.default||sharpModule) as unknown as typeof sharpModule.default
    const clean=new Uint8Array(await sharp(bytes,{limitInputPixels:24_000_000,failOn:'error'}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:82,mozjpeg:true}).toBuffer())
    if(clean.byteLength<1||clean.byteLength>4*1024*1024)return fail('ATTENDANCE_PHOTO_TOO_LARGE',413)
    const configured=provider();drive=configured.drive
    const health=await drive.healthCheck()
    if(!health.ok||health.root_readable!==true||health.root_can_add_children!==true)return fail('ATTENDANCE_DRIVE_PERMISSION_DENIED',503)
    try{await assertPrivateAttendanceDriveRoot(configured.root,{...process.env,GOOGLE_DRIVE_ROOT_FOLDER_ID:configured.root})}catch(error){if(error instanceof AttendanceDriveAclError)return fail(error.code,409);return fail('ATTENDANCE_DRIVE_ACL_UNVERIFIED',503)}
    const folder=attendancePhotoFolder(context.role,savedContext.data.shift_date)
    let parent=configured.root
    for(const segment of folder)parent=(await drive.ensureFolder(parent,segment)).id
    const fileName=attendancePhotoName({shiftDate:savedContext.data.shift_date,shiftId:context.shift_id,studio:savedContext.data.studio,brand:savedContext.data.brand,platform:savedContext.data.platform,startTime:savedContext.data.start_time,endTime:savedContext.data.end_time,staffName:savedContext.data.staff_name,role:context.role,recordedAt:new Date().toISOString(),requestId,extension:'jpg',eventKind:context.event})
    const checksum=createHash('sha256').update(clean).digest('hex')
    const uploaded=await createFileStorageService({provider:drive}).upload({name:fileName,mime_type:'image/jpeg',size_bytes:clean.length,content:clean,checksum_sha256:checksum,entity_type:'shift',entity_id:context.shift_id,created_by:actor.businessUserId,logical_path:folder.join('/'),external_parent_id:parent,destination:{provider:'google_drive',external_folder_id:parent}})
    fileId=uploaded.asset.external_file_id
    const verified=await drive.read(fileId)
    if(uploaded.asset.provider!=='google_drive'||uploaded.asset.external_parent_id!==parent||uploaded.asset.name!==fileName||verified.byteLength!==clean.length||createHash('sha256').update(verified).digest('hex')!==checksum)throw new Error('ATTENDANCE_PHOTO_PROVIDER_INTEGRITY_FAILED')
    const result=await session.rpc('attach_self_attendance_photo_evidence_addendum',{p_request_id:requestId,p_event_id:eventId,p_previous_request_id:previousRequestId,p_provider:'google_drive',p_external_file_id:fileId,p_external_parent_id:parent,p_file_name:fileName,p_mime_type:'image/jpeg',p_size_bytes:clean.length,p_checksum_sha256:checksum,p_shift_context:oldEvidence.data.shift_context,p_capture_source:capture})
    if(result.error)throw new Error(result.error.message)
    metadataSaved=true
    return Response.json({ok:true,request_id:requestId},{headers})
  } catch(error) {
    if(fileId&&!metadataSaved&&drive&&pendingRequestId)try{
      const committed=await createSupabaseAdminClient().from('self_attendance_photo_evidence_addenda').select('request_id').eq('request_id',pendingRequestId).maybeSingle()
      if(!committed.error&&!committed.data)await drive.delete(fileId)
      else if(committed.error)console.error('ATTENDANCE_CORRECTION_ORPHAN_STATE_UNKNOWN')
    }catch{console.error('ATTENDANCE_CORRECTION_ORPHAN_CLEANUP_FAILED')}
    if(isAuthorizationError(error))return authorizationErrorResponse(error)
    if(error instanceof RequestBodyError)return fail(error.code,error.status)
    if(error instanceof z.ZodError)return fail('ATTENDANCE_PHOTO_REQUEST_INVALID',400)
    console.error('ATTENDANCE_PHOTO_CORRECTION_FAILED')
    return fail('ATTENDANCE_PHOTO_CORRECTION_FAILED',503)
  }
}
