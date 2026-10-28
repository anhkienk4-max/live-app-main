import 'server-only'

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { requireUser, requireRole, authorizationErrorResponse, isAuthorizationError } from '@/lib/server/authGuards'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import { resolveGoogleDriveAuthMode } from '@/lib/server/googleDriveAuth'
import { assertPrivateAttendanceDriveRoot } from '@/lib/server/attendanceDriveAcl'
import { AttendanceDriveAclError } from '@/lib/utils/attendanceDriveAcl'
import { createFileStorageService } from '@/lib/services/fileStorageService'
import { readFormDataBody, RequestBodyError, consumeRateLimit, rateLimitResponse } from '@/lib/server/apiSecurity'
import { attendancePhotoFolder, attendancePhotoName } from '@/lib/utils/attendancePhotoNaming'
import { decodeSelfAttendanceEvent } from '@/lib/utils/selfAttendanceContract'

const LIMIT=4*1024*1024
const UUID=z.string().uuid()
const id=z.string().min(1).max(120)
const role=z.enum(['host','support','technical'])
const contextSchema=z.object({
  shift_id:id,staff_id:id,staff_name:z.string().min(1),
  role, date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:z.string(),end_time:z.string(),start_at:z.string(),end_at:z.string(),
  brand:z.string().min(1),platform:z.string().min(1),
  studio:z.string().nullable().optional(),title:z.string().nullable().optional(),
})
const ERROR_HEADERS={ 'Cache-Control':'no-store' }
function failed(code:string,status:number) {
  return Response.json({ok:false,error:{code}}, {status,headers:ERROR_HEADERS})
}
function mimeFromBytes(bytes:Uint8Array): {mime:string;ext:'jpg'|'png'|'webp'}|null {
  if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)
    return {mime:'image/jpeg',ext:'jpg'}
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))
    return {mime:'image/png',ext:'png'}
  if(bytes.length>=12&&new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'
      &&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP')
    return {mime:'image/webp',ext:'webp'}
  return null
}
function hasExactOrigin(request:Request) {
  const origin=request.headers.get('origin')
  return Boolean(origin&&origin===new URL(request.url).origin)
}
function photoProvider() {
  const root=process.env.GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID?.trim()
  if(!root||!/^[a-zA-Z0-9_-]{12,120}$/.test(root))
    throw new Error('ATTENDANCE_DRIVE_FOLDER_NOT_CONFIGURED')
  // Use the same OAuth/service-account identity that the operational report
  // provider already uses. No dedicated token or secret is required solely for
  // attendance when those server-only credentials are configured in runtime.
  // Health-check root ACLs after verifying the exact auth-mode prerequisites
  // so an absent credential is not misreported as a missing folder permission.
  const env: Record<string,string|undefined>={...process.env,GOOGLE_DRIVE_ROOT_FOLDER_ID:root}
  const authMode=resolveGoogleDriveAuthMode(env)
  const credentialKeys=authMode==='oauth_refresh_token'
    ? ['GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','GOOGLE_DRIVE_REFRESH_TOKEN']
    : ['GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL','GOOGLE_DRIVE_PRIVATE_KEY']
  if(!credentialKeys.every(key=>Boolean(env[key]?.trim())))
    throw new Error('ATTENDANCE_DRIVE_NOT_CONFIGURED')
  // Isolate attendance photos from the operational report root. This MUST be
  // the operator-verified existing CHECK IN/OUT root with private Drive ACLs.
  return {root,drive:createGoogleDriveFileProvider({env})}
}
function contextSnapshot(info:z.infer<typeof contextSchema>) {
  return {shift_id:info.shift_id,shift_date:info.date,live_start:info.start_at,
    live_end:info.end_at,start_time:info.start_time,end_time:info.end_time,
    brand:info.brand,platform:info.platform,studio:info.studio??null,title:info.title??null,
    staff_name:info.staff_name,role:info.role}
}

export async function POST(request:Request) {
  let uploadedId:string|null=null
  let committedMetadata=false
  let drive:ReturnType<typeof createGoogleDriveFileProvider>|null=null
  let currentEventKind:'check_in'|'check_out'='check_in'
  try {
    if(!hasExactOrigin(request))return failed('ATTENDANCE_PHOTO_ORIGIN_INVALID',403)
    const actor=await requireUser(request)
    if(!actor.businessUserId) return failed('ATTENDANCE_BUSINESS_ACTOR_REQUIRED',403)
    if(process.env.FEATURE_SELF_ATTENDANCE_PHOTO!=='true')
      return failed('ATTENDANCE_PHOTO_FEATURE_DISABLED',503)
    // Respect the global operational file-storage kill switch as well as the
    // separate sensitive photo-evidence flag. One must not bypass the other.
    // Unlike optional legacy read paths, employee photo writes require an
    // explicitly enabled global file-storage switch, not a missing/default.
    if(process.env.FILE_STORAGE_ENABLED!=='true')
      return failed('ATTENDANCE_FILE_STORAGE_DISABLED',503)
    const limit=consumeRateLimit({key:'attendance-photo:'+actor.businessUserId,limit:12,windowMs:60*60*1000})
    if(!limit.allowed)return rateLimitResponse(limit.resetAt)
    const form=await readFormDataBody(request,LIMIT+8192)
    const shiftId=id.parse(form.get('shift_id'))
    const kind=role.parse(form.get('role'))
    const eventKind=z.enum(['check_in','check_out']).parse(form.get('event_kind')??'check_in')
    currentEventKind=eventKind
    const requestId=UUID.parse(form.get('request_id'))
    const recoverOnly=form.get('recover_only')==='true'
    // The client may retry after a browser reload with no original image in
    // memory. Recovery is only permitted when the same actor already owns an
    // immutable provider object for the exact shift and role.
    if(form.has('recover_only')&&form.get('recover_only')!=='true')
      return failed('ATTENDANCE_PHOTO_REQUEST_INVALID',400)
    const captureSource=recoverOnly?null:
      z.enum(['camera','file_picker']).parse(form.get('capture_source'))
    const file=form.get('file')
    if(!recoverOnly&&(!(file instanceof File)||file.size<1||file.size>LIMIT))
      return failed('ATTENDANCE_PHOTO_REQUIRED',file instanceof File?413:400)

    const admin=createSupabaseAdminClient()
    const evidenceColumns='request_id,shift_id,staff_id,operational_role,event_kind,external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256'
    const [byRequest,byAssignment]=await Promise.all([
      admin.from('self_attendance_photo_evidence')
        .select(evidenceColumns).eq('request_id',requestId).maybeSingle(),
      admin.from('self_attendance_photo_evidence')
        .select(evidenceColumns).eq('shift_id',shiftId)
        .eq('staff_id',actor.businessUserId).eq('operational_role',kind).eq('event_kind',eventKind).maybeSingle(),
    ])
    if(byRequest.error||byAssignment.error)
      return failed('ATTENDANCE_PHOTO_STORAGE_UNAVAILABLE',503)
    if(byRequest.data&&
      (byRequest.data.staff_id!==actor.businessUserId||
       byRequest.data.shift_id!==shiftId||byRequest.data.operational_role!==kind||
       (byRequest.data.event_kind && byRequest.data.event_kind!==eventKind)))
      return failed('ATTENDANCE_PHOTO_REQUEST_REUSED',409)
    // Recover a reserved photo after a page reload/network timeout. The server
    // reuses the original request UUID without accepting a client-supplied
    // foreign staff or photo ID, and verifies the Drive bytes below.
    const existing={data:byAssignment.data??byRequest.data}
    const committedRequestId=existing.data?.request_id??requestId
    if(recoverOnly&&!existing.data)
      return failed('ATTENDANCE_PHOTO_RECOVERY_UNAVAILABLE',404)

    // A retry must not finalize check-in if the previously reserved Drive
    // image was removed, replaced or moved after the first upload.
    if(existing.data) {
      const {drive:priorDrive}=photoProvider()
      const stored=await priorDrive.getMetadata(existing.data.external_file_id)
      if(stored.id!==existing.data.external_file_id ||
        stored.parent_ids?.[0]!==existing.data.external_parent_id ||
        stored.name!==existing.data.file_name ||
        stored.size_bytes!==existing.data.size_bytes)
        return failed('ATTENDANCE_PHOTO_RETRY_INTEGRITY_FAILED',409)
      const priorBytes=await priorDrive.read(existing.data.external_file_id)
      if(priorBytes.byteLength!==existing.data.size_bytes ||
        createHash('sha256').update(priorBytes).digest('hex')!==existing.data.checksum_sha256 ||
        mimeFromBytes(priorBytes)?.mime!==existing.data.mime_type)
        return failed('ATTENDANCE_PHOTO_RETRY_INTEGRITY_FAILED',409)
    }

    const session=await createSessionClient()
    let prepared: z.infer<typeof contextSchema>|null=null
    if(!existing.data) {
      if(!(file instanceof File)||!captureSource)
        return failed('ATTENDANCE_PHOTO_REQUIRED',400)
      const bytes=new Uint8Array(await file.arrayBuffer())
      const type=mimeFromBytes(bytes)
      if(!type||(file.type&&file.type!==type.mime&&file.type!=='application/octet-stream'))
        return failed('ATTENDANCE_PHOTO_TYPE_INVALID',415)
      // Normalize photo and strip EXIF/GPS/device metadata before Drive upload.
      let cleanBytes:Uint8Array
      try{
        const sharpModule = await import('sharp')
        const sharp = (sharpModule.default || sharpModule) as unknown as typeof sharpModule.default
        cleanBytes=new Uint8Array(await sharp(bytes,{limitInputPixels:24_000_000,failOn:'error'})
          .rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true})
          .flatten({background:'#ffffff'}).jpeg({quality:82,mozjpeg:true}).toBuffer())
      }catch(err){
        console.error('[SHARP_FATAL_ERROR]', err)
        return failed('ATTENDANCE_PHOTO_IMAGE_INVALID',415)
      }
      if(cleanBytes.byteLength<1||cleanBytes.byteLength>LIMIT)
        return failed('ATTENDANCE_PHOTO_TOO_LARGE',413)
      const preflight=await session.rpc('get_self_attendance_photo_context',{
        p_shift_id:shiftId,p_operational_role:kind,p_event_kind:eventKind,
      })
      if(preflight.error)return failed('ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE',403)
      const parsed=contextSchema.safeParse(preflight.data)
      if(!parsed.success||parsed.data.staff_id!==actor.businessUserId||
        parsed.data.shift_id!==shiftId||parsed.data.role!==kind)
        return failed('ATTENDANCE_PHOTO_CONTEXT_INVALID',409)
      prepared=parsed.data
      const {root,drive:provider}=photoProvider()
      drive=provider
      // No writes outside the explicitly configured attendance root.
      const health=await drive.healthCheck()
      // Unknown write capability is not proof of permission. Never create
      // subfolders or upload staff photos without confirmed provider ACL.
      if(!health.ok||health.root_readable!==true||
        health.root_can_add_children!==true)
        return failed('ATTENDANCE_DRIVE_PERMISSION_DENIED',503)
      // A public Drive ACL is operator-accepted ONLY with the explicit
      // attendance-specific runtime opt-in. It remains externally accessible;
      // never confuse this flag with employee privacy or permission to write.
      try {
        await assertPrivateAttendanceDriveRoot(root,{
          ...process.env,GOOGLE_DRIVE_ROOT_FOLDER_ID:root,
        })
      } catch(error) {
        if(error instanceof AttendanceDriveAclError)
          return failed(error.code,error.code==='ATTENDANCE_DRIVE_ACL_PUBLIC'?409:503)
        return failed('ATTENDANCE_DRIVE_ACL_UNVERIFIED',503)
      }
      let parentId=root
      const folderSegments=attendancePhotoFolder(kind,prepared.date)
      for(const segment of folderSegments) {
        parentId=(await drive.ensureFolder(parentId,segment)).id
      }
      const fileName=attendancePhotoName({
        shiftDate:prepared.date,shiftId:prepared.shift_id,studio:prepared.studio,
        brand:prepared.brand,platform:prepared.platform,
        startTime:prepared.start_time,endTime:prepared.end_time,
        staffName:prepared.staff_name,role:kind,
        recordedAt:new Date().toISOString(),requestId,extension:'jpg',
        eventKind,
      })
      const hash=createHash('sha256').update(cleanBytes).digest('hex')
      const oppositeEventKind=eventKind==='check_in'?'check_out':'check_in'
      const oppositeEvidence=await admin.from('self_attendance_photo_evidence')
        .select('checksum_sha256')
        .eq('shift_id',shiftId)
        .eq('staff_id',actor.businessUserId)
        .eq('operational_role',kind)
        .eq('event_kind',oppositeEventKind)
        .maybeSingle()
      if(oppositeEvidence.data&&oppositeEvidence.data.checksum_sha256===hash) {
        return failed('ATTENDANCE_PHOTO_DUPLICATE_ACROSS_EVENTS',409)
      }
      // Use the SAME checked file-storage gateway used by operational report
      // images and data files. Its metadata/MIME/size contract applies even
      // though attendance has a separate authorized Drive root and photo flag.
      // The exact provider parent prevents accidental logical-path traversal.
      const storage=createFileStorageService({provider:drive})
      const uploaded=await storage.upload({
        name:fileName,mime_type:'image/jpeg',size_bytes:cleanBytes.byteLength,
        content:cleanBytes,checksum_sha256:hash,
        entity_type:'shift',entity_id:shiftId,created_by:actor.businessUserId,
        logical_path:folderSegments.join('/'),external_parent_id:parentId,
        destination:{provider:'google_drive',external_folder_id:parentId},
      })
      uploadedId=uploaded.asset.external_file_id
      if(uploaded.asset.provider!=='google_drive'||
        uploaded.asset.external_parent_id!==parentId||
        uploaded.asset.name!==fileName||
        uploaded.asset.mime_type!=='image/jpeg'||
        uploaded.asset.size_bytes!==cleanBytes.length||!uploadedId)
        throw new Error('ATTENDANCE_PHOTO_PROVIDER_MISMATCH')
      // Verify a real, readable provider object before accepting any metadata
      // as check-in proof. Provider upload ACK alone is insufficient evidence.
      const persisted=await drive.read(uploadedId)
      if(persisted.byteLength!==cleanBytes.length||
        mimeFromBytes(persisted)?.mime!=='image/jpeg'||
        createHash('sha256').update(persisted).digest('hex')!==hash)
        throw new Error('ATTENDANCE_PHOTO_PROVIDER_INTEGRITY_FAILED')
      const saved=await admin.from('self_attendance_photo_evidence').insert({
        request_id:requestId,shift_id:shiftId,staff_id:actor.businessUserId,
        operational_role:kind,event_kind:eventKind,provider:'google_drive',external_file_id:uploadedId,
        external_parent_id:parentId,file_name:fileName,mime_type:'image/jpeg',
        size_bytes:cleanBytes.byteLength,checksum_sha256:hash,
        shift_context:contextSnapshot(prepared),capture_source:captureSource,
      }).select('request_id').single()
      if(saved.error || saved.data?.request_id!==requestId)
        throw new Error('ATTENDANCE_PHOTO_METADATA_FAILED')
      committedMetadata=true
    }

    const recorded=await session.rpc('self_attendance_record',{
      p_shift_id:shiftId,p_operational_role:kind,p_event_kind:eventKind,
      p_request_id:committedRequestId,p_evidence_note:null,
    })
    if(recorded.error) {
      const code=eventKind==='check_out'?'ATTENDANCE_PHOTO_CHECKOUT_PENDING_RECONCILIATION':'ATTENDANCE_PHOTO_CHECKIN_PENDING_RECONCILIATION'
      return failed(code,409)
    }
    const event=decodeSelfAttendanceEvent(recorded.data)
    if(event.staff_id!==actor.businessUserId||event.shift_id!==shiftId||
      event.role!==kind||event.event!==eventKind) {
      const code=eventKind==='check_out'?'ATTENDANCE_PHOTO_CHECKOUT_RESPONSE_MISMATCH':'ATTENDANCE_PHOTO_CHECKIN_RESPONSE_MISMATCH'
      return failed(code,409)
    }
    return Response.json({ok:true,event:{...event,photo_available:true}},
      {headers:ERROR_HEADERS})
  } catch(error) {
    if(uploadedId&&!committedMetadata&&drive) {
      try{await drive.delete(uploadedId)}catch{console.error('ATTENDANCE_PHOTO_ORPHAN_CLEANUP_FAILED')}
    }
    if(isAuthorizationError(error))return authorizationErrorResponse(error)
    if(error instanceof RequestBodyError)return failed(error.code,error.status)
    if(error instanceof z.ZodError)return failed('ATTENDANCE_PHOTO_REQUEST_INVALID',400)
    console.error(currentEventKind==='check_out'?'ATTENDANCE_PHOTO_CHECKOUT_FAILED':'ATTENDANCE_PHOTO_CHECKIN_FAILED')
    return failed('ATTENDANCE_PHOTO_UPLOAD_FAILED',503)
  }
}

export async function GET(request:Request) {
  try {
    const actor=await requireUser(request)
    if(!actor.businessUserId)return failed('ATTENDANCE_BUSINESS_ACTOR_REQUIRED',403)
    // Photo bytes are personal evidence. Check current DB actor activity on
    // every image read, not just the auth cookie's existence.
    const session=await createSessionClient()
    const active=await session.rpc('get_my_self_attendance',{p_shift_id:null,p_limit:1})
    if(active.error)return failed('PERMISSION_DENIED',403)
    const url=new URL(request.url)
    const eventId=UUID.parse(url.searchParams.get('event_id'))
    const admin=createSupabaseAdminClient()
    const event=await admin.from('self_attendance_events')
      .select('request_id,shift_id,staff_id,event_kind').eq('id',eventId).maybeSingle()
    if(event.error||!event.data||!['check_in','check_out'].includes(event.data.event_kind))
      return failed('ATTENDANCE_PHOTO_NOT_FOUND',404)
    if(event.data.staff_id!==actor.businessUserId) {
      if(!['leader','admin'].includes(actor.systemPermission))
        return failed('PERMISSION_DENIED',403)
      // Non-owner reviewers must also be entitled to this shift under DB RLS.
      const visible=await session.from('shifts').select('id').eq('id',event.data.shift_id).maybeSingle()
      if(visible.error||!visible.data)return failed('PERMISSION_DENIED',403)
    }
    const metadata=await admin.from('self_attendance_photo_evidence')
      .select('external_file_id,mime_type,size_bytes,checksum_sha256')
      .eq('request_id',event.data.request_id).maybeSingle()
    if(metadata.error||!metadata.data)return failed('ATTENDANCE_PHOTO_NOT_FOUND',404)
    const {drive}=photoProvider()
    const bytes=await drive.read(metadata.data.external_file_id)
    if(bytes.byteLength!==metadata.data.size_bytes||
      mimeFromBytes(bytes)?.mime!==metadata.data.mime_type ||
      createHash('sha256').update(bytes).digest('hex')!==metadata.data.checksum_sha256)
      return failed('ATTENDANCE_PHOTO_INTEGRITY_FAILED',409)
    return new Response(Buffer.from(bytes),{status:200,headers:{
      ...ERROR_HEADERS,'Content-Type':metadata.data.mime_type,
      'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",
    }})
  }catch(e) {
    if(isAuthorizationError(e))return authorizationErrorResponse(e)
    if(e instanceof z.ZodError)return failed('ATTENDANCE_PHOTO_REQUEST_INVALID',400)
    return failed('ATTENDANCE_PHOTO_READ_FAILED',503)
  }
}


/** GET_PREFLIGHT: Admin-only, read-only runtime identity and Drive ACL check.
 * No folder creation, no upload, no raw folder identifiers or credentials in
 * response. Safe to call while the photo feature is OFF during preparation.
 */
export async function GET_PREFLIGHT(request:Request) {
  try {
    if(request.method!=='GET')return failed('METHOD_NOT_ALLOWED',405)
    const actor=await requireRole(request,'admin')
    if(!actor.businessUserId)return failed('PERMISSION_DENIED',403)
    const rate=consumeRateLimit({
      key:'attendance-photo-preflight:'+actor.businessUserId,
      limit:6,windowMs:60*60*1000,
    })
    if(!rate.allowed)return rateLimitResponse(rate.resetAt)
    const session=await createSessionClient()
    const active=await session.rpc('get_my_self_attendance',{p_shift_id:null,p_limit:1})
    if(active.error)return failed('PERMISSION_DENIED',403)

    let drive:ReturnType<typeof createGoogleDriveFileProvider>
    let root:string
    try {
      ({root,drive}=photoProvider())
    } catch {
      return failed('ATTENDANCE_DRIVE_NOT_CONFIGURED',503)
    }

    try {
      const health=await drive.healthCheck()
      if(health.provider!=='google_drive'||health.root_readable!==true||
        health.root_can_add_children!==true||health.ok!==true)
        return failed('ATTENDANCE_DRIVE_PERMISSION_DENIED',503)
    } catch {
      return failed('ATTENDANCE_DRIVE_PERMISSION_DENIED',503)
    }
    let publicAccess=false
    try {
      const acl=await assertPrivateAttendanceDriveRoot(root,{
        ...process.env,GOOGLE_DRIVE_ROOT_FOLDER_ID:root,
      })
      publicAccess=acl.publicAccess
    } catch(error) {
      if(error instanceof AttendanceDriveAclError)
        return failed(error.code,error.code==='ATTENDANCE_DRIVE_ACL_PUBLIC'?409:503)
      return failed('ATTENDANCE_DRIVE_ACL_UNVERIFIED',503)
    }
    return Response.json({
      ok:true,
      provider:'google_drive',
      root_readable:true,
      root_can_add_children:true,
      public_access:publicAccess,
      public_access_approved:publicAccess&&process.env.ATTENDANCE_DRIVE_ALLOW_PUBLIC_ACCESS==='true',
      feature_enabled:process.env.FEATURE_SELF_ATTENDANCE_PHOTO==='true',
    },{headers:ERROR_HEADERS})
  }catch(error) {
    if(isAuthorizationError(error))return authorizationErrorResponse(error)
    return failed('ATTENDANCE_DRIVE_PREFLIGHT_FAILED',503)
  }
}
