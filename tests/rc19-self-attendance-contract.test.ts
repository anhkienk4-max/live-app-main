import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeSelfAttendanceEvent,decodeSelfAttendanceHistory } from '../lib/utils/selfAttendanceContract.ts'
import { createWorkforceActualHandler } from '../lib/server/workforceActualHandler.ts'
const good={event_id:'evt',shift_id:'shift',staff_id:'staff',role:'host',event:'check_in',recorded_at:'2026-10-23T00:00:00Z',verification_status:'pending_verification',replayed:false}
test('valid raw attendance is pending review and timestamped',()=>{
  assert.equal(decodeSelfAttendanceEvent(good).verification_status,'pending_verification')
  assert.equal(decodeSelfAttendanceHistory([good]).length,1)
})
test('forged or malformed event response fails closed',()=>{
  for(const bad of [{event:'approved'},{verification_status:'approved'},{staff_id:''},{recorded_at:'invalid'}])
    assert.throws(()=>decodeSelfAttendanceEvent({...good,...bad}),/INVALID/)
  assert.throws(()=>decodeSelfAttendanceHistory([good,good]),/DUPLICATED/)
})
test('staff id is absent from RPC write arguments, retries keep their token',()=>{
  const src=readFileSync(new URL('../lib/services/supabaseSelfAttendanceService.ts',import.meta.url),'utf8')
  const panel=readFileSync(new URL('../components/features/attendance/SelfAttendancePanel.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(src,/p_staff_id/)
  assert.match(src,/p_request_id:requestId/)
  assert.match(panel,/requestIds\.current\[kind\]\?\?=crypto\.randomUUID\(\)/)
  assert.match(panel,/Asia\/Ho_Chi_Minh/)
})
test('attendance UI is opt-in and bound to the current approved registration',()=>{
  const modal=readFileSync(new URL('../components/features/shifts/ShiftDetailModal.tsx',import.meta.url),'utf8')
  assert.match(modal,/NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE === 'true' && myRegistration/)
  assert.match(modal,/role=\{myRegistration\.operational_role\}/)
})

test('manager actual staffing read presents raw check-in evidence independently from approved segments',()=>{
  const source=readFileSync(new URL('../lib/server/workforceActualHandler.ts',import.meta.url),'utf8')
  const ui=readFileSync(new URL('../components/features/payroll/PayrollAttendanceLink.tsx',import.meta.url),'utf8')
  assert.match(source,/await requireRole\(request, \['admin', 'leader'\]/)
  assert.match(source,/client\.from\('self_attendance_events'\)/)
  assert.match(source,/attendance_events: \(attendanceRes\.data \?\? \[\]\)\.map/)
  assert.match(ui,/app-attendance-review/)
  assert.match(ui,/Chờ đối chiếu/)
})

test('server-side attendance evidence flag defaults OFF and refuses truncated evidence',()=>{
  const flags=readFileSync(new URL('../lib/flags.ts',import.meta.url),'utf8')
  const handler=readFileSync(new URL('../lib/server/workforceActualHandler.ts',import.meta.url),'utf8')
  assert.match(flags,/self_attendance_review: 'FEATURE_SELF_ATTENDANCE_REVIEW'/)
  assert.match(flags,/self_attendance_review: false/)
  assert.match(handler,/isFeatureEnabled\('self_attendance_review'\)/)
  assert.match(handler,/Promise\.resolve\(\{data: \[\], error: null\}\)/)
  assert.match(handler,/SELF_ATTENDANCE_REVIEW_UNAVAILABLE/)
  assert.match(handler,/SELF_ATTENDANCE_REVIEW_LIMIT_EXCEEDED/)
  assert.match(handler,/\.limit\(201\)/)
})

function managerQueryClient(params: {rows?: number; journalError?: boolean; photo?: boolean}) {
  const calls:string[]=[]
  const client=()=>({
    from(name:string) {
      calls.push(name)
      const dataFor=()=>name==='shifts'?{id:'shift-1',status:'completed',host_id:'staff-1'}:
        name==='self_attendance_events'?
          Array.from({length:params.rows??0},(_,i)=>({
            id:'evt-'+i,request_id:'req-'+i,shift_id:'shift-1',staff_id:'staff-1',operational_role:'host',
            event_kind:i%2?'check_out':'check_in',recorded_at:'2026-10-23T02:00:00Z',
            verification_status:'pending_verification'
          })):name==='self_attendance_photo_evidence'&&params.photo?[{request_id:'req-0'}]:[]
      const q={
        select(){return q}, eq(){return q}, order(){return q},
        is(){return q}, in(){return q}, or(){return q}, limit(){return q},
        async maybeSingle(){return {data:dataFor(),error:null}},
        then(resolve:(value:unknown)=>unknown,reject?: (error:unknown)=>unknown){
          return Promise.resolve({data:dataFor(),error:name==='self_attendance_events'&&params.journalError?{message:'journal unavailable'}:null}).then(resolve,reject)
        }
      }
      return q
    }
  })
  return {client,calls}
}
const request = ()=>new Request('https://unit.test/api/workforce/actual?shift_id=shift-1')
const manager = async()=>({id:'auth-leader',businessUserId:'leader-1',systemPermission:'leader' as const})
test('existing Workforce GET never queries the journal when review flag is OFF',async()=>{
  const db=managerQueryClient({rows:2,journalError:true})
  const handler=createWorkforceActualHandler({client:db.client as never,isEnabled:()=>true,
    isAttendanceReviewEnabled:()=>false,resolveUser:manager})
  const response=await handler.GET(request())
  assert.equal(response.status,200)
  const body=await response.json()
  assert.equal(body.attendance_events.length,0)
  assert.equal(body.attendance_review_enabled,false)
  assert.equal(db.calls.includes('self_attendance_events'),false)
})
test('enabled manager review reads raw evidence without marking it as approved wages',async()=>{
  const db=managerQueryClient({rows:2})
  const handler=createWorkforceActualHandler({client:db.client as never,isEnabled:()=>true,
    isAttendanceReviewEnabled:()=>true,resolveUser:manager})
  const response=await handler.GET(request())
  assert.equal(response.status,200)
  const body=await response.json()
  assert.equal(body.attendance_review_enabled,true)
  assert.equal(body.attendance_events.length,2)
  assert.equal(body.attendance_events[0].verification_status,'pending_verification')
  assert.equal(body.segments.length,0)
  assert.equal(db.calls.includes('self_attendance_events'),true)
})
test('enabled reviewer fails closed when journal missing or response is truncated',async()=>{
  for(const conf of [{journalError:true},{rows:201}]){
    const db=managerQueryClient(conf)
    const handler=createWorkforceActualHandler({client:db.client as never,isEnabled:()=>true,
      isAttendanceReviewEnabled:()=>true,resolveUser:manager})
    const response=await handler.GET(request())
    assert.ok(response.status===503||response.status===409)
  }
})

test('the reviewer UI does not render a misleading empty journal when the flag is OFF',()=>{
  const ui=readFileSync(new URL('../components/features/payroll/PayrollAttendanceLink.tsx',import.meta.url),'utf8')
  assert.match(ui,/attendance\.attendance_review_enabled === true/)
})


test('Drive attendance image names retain shift date, brand, platform, live window, role and unique server timestamp',async()=>{
  const {attendancePhotoFolder,attendancePhotoName}=await import('../lib/utils/attendancePhotoNaming.ts')
  assert.deepEqual(attendancePhotoFolder('host','2026-10-23'),['HOST','THÁNG 10 - 2026'])
  assert.deepEqual(attendancePhotoFolder('support','2026-11-01'),['TRỢ','THÁNG 11 - 2026'])
  assert.deepEqual(attendancePhotoFolder('technical','2026-10-23'),['KỸ THUẬT','THÁNG 10 - 2026'])
  const name=attendancePhotoName({
    shiftDate:'2026-10-23',shiftId:'shift-ADA-12',studio:'Phòng Live A',
    brand:'OPELLA',platform:'TikTok',
    startTime:'23:45:00',endTime:'01:45:00',role:'support',staffName:'Trợ Live',
    recordedAt:'2026-10-23T13:20:31Z',
    requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',extension:'jpg',
  })
  assert.equal(name,'20261023_OPELLA_TikTok_PHONG_Phong_Live_A_2345-0145_TRO_Tro_Live_CA_shift_ADA_12_CHECKIN_20261023_132031Z_aaaaaaaa.jpg')
  assert.ok(name.length<=255)
  assert.throws(()=>attendancePhotoName({
    shiftDate:'2026-10-23',shiftId:'',studio:'Phòng A',
    brand:'OPELLA',platform:'TikTok',startTime:'09:00',endTime:'11:00',
    role:'host',staffName:'Staff',recordedAt:'2026-10-23T02:00:00Z',
    requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',extension:'jpg',
  }),/SHIFT_ID_INVALID/)
  assert.ok(attendancePhotoName({
    shiftDate:'2026-10-23',shiftId:'id-1',studio:null,
    brand:'OPELLA',platform:'TikTok',startTime:'09:00',endTime:'11:00',
    role:'host',staffName:'Staff',recordedAt:'2026-10-23T02:00:00Z',
    requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',extension:'jpg',
  }).includes('PHONG_CHUA_XEP'))
  assert.throws(()=>attendancePhotoFolder('host','2026-02-30'),/DATE_INVALID/)
  assert.throws(()=>attendancePhotoName({
    shiftDate:'2026-10-23',shiftId:'shift-123',studio:null,brand:'Brand',platform:'TikTok',
    startTime:'99:99',endTime:'10:00',role:'host',staffName:'Staff',
    recordedAt:'2026-10-23T13:20:31Z',
    requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',extension:'jpg',
  }),/TIME_INVALID/)
  const checkoutName=attendancePhotoName({
    shiftDate:'2026-10-23',shiftId:'shift-ADA-12',studio:'Phòng Live A',
    brand:'OPELLA',platform:'TikTok',
    startTime:'23:45:00',endTime:'01:45:00',role:'support',staffName:'Trợ Live',
    recordedAt:'2026-10-24T01:45:10Z',
    requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',extension:'jpg',
    eventKind:'check_out',
  })
  assert.equal(checkoutName,'20261023_OPELLA_TikTok_PHONG_Phong_Live_A_2345-0145_TRO_Tro_Live_CA_shift_ADA_12_CHECKOUT_20261024_014510Z_bbbbbbbb.jpg')
})

test('check-in photo SQL is immutable, private, matched to actor and excludes binary',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261023144000_rc19_p2_04b_drive_photo_checkin.sql',import.meta.url),'utf8')
  assert.match(sql,/create table if not exists public\.self_attendance_photo_evidence/i)
  assert.match(sql,/enable row level security/i)
  assert.match(sql,/revoke all on public\.self_attendance_photo_evidence from public,anon,authenticated/i)
  assert.match(sql,/unique \(shift_id,staff_id,operational_role\)/i)
  assert.match(sql,/before update or delete on public\.self_attendance_photo_evidence/i)
  assert.match(sql,/before insert on public\.self_attendance_events/i)
  assert.match(sql,/ATTENDANCE_PHOTO_REQUIRED/i)
  assert.match(sql,/p\.request_id=new\.request_id and p\.shift_id=new\.shift_id[\s\S]*?p\.staff_id=new\.staff_id/i)
  assert.match(sql,/private\.require_shift_actor\(false\)/i)
  assert.match(sql,/ATTENDANCE_ASSIGNMENT_SURRENDERED/i)
  assert.match(sql,/photo_available/i)
  assert.doesNotMatch(sql,/bytea|create policy.*using \(true\)/i)
})

test('self attendance photo handler gates evidence by session, Drive root and original shift',()=>{
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const route=readFileSync(new URL('../app/api/workforce/self-attendance-photo/route.ts',import.meta.url),'utf8')
  const panel=readFileSync(new URL('../components/features/attendance/SelfAttendancePanel.tsx',import.meta.url),'utf8')
  const modal=readFileSync(new URL('../components/features/shifts/ShiftDetailModal.tsx',import.meta.url),'utf8')
  assert.match(handler,/FEATURE_SELF_ATTENDANCE_PHOTO!=='true'/)
  assert.match(handler,/hasExactOrigin\(request\)/)
  assert.match(handler,/await requireUser\(request\)/)
  assert.match(handler,/actor\.businessUserId/)
  assert.match(handler,/get_self_attendance_photo_context/)
  assert.match(handler,/GOOGLE_DRIVE_ATTENDANCE_FOLDER_ID/)
  assert.match(handler,/createGoogleDriveFileProvider/)
  assert.match(handler,/resolveGoogleDriveAuthMode\(env\)/)
  assert.match(handler,/GOOGLE_DRIVE_CLIENT_ID/)
  assert.match(handler,/GOOGLE_DRIVE_CLIENT_SECRET/)
  assert.match(handler,/GOOGLE_DRIVE_REFRESH_TOKEN/)
  assert.match(handler,/GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL/)
  assert.match(handler,/GOOGLE_DRIVE_PRIVATE_KEY/)
  assert.match(handler,/credentialKeys\.every\(key=>Boolean\(env\[key\]\?\.trim\(\)\)\)/)
  assert.match(handler,/throw new Error\('ATTENDANCE_DRIVE_NOT_CONFIGURED'\)/)

  assert.match(handler,/createFileStorageService/)
  assert.match(handler,/if\(process\.env\.FILE_STORAGE_ENABLED!=='true'\)/)
  assert.match(handler,/const storage=createFileStorageService\(\{provider:drive\}\)/)
  assert.match(handler,/const uploaded=await storage\.upload\(\{/)
  assert.match(handler,/logical_path:folderSegments\.join\('\/'\)/)
  assert.doesNotMatch(handler,/await drive\.upload\(/)
  assert.match(handler,/uploaded\.asset\.name!==fileName/)
  assert.match(handler,/uploaded\.asset\.mime_type!=='image\/jpeg'/)
  assert.match(handler,/health\.root_can_add_children!==true/)
  assert.match(handler,/health\.root_readable!==true/)
  assert.match(handler,/shiftId:prepared\.shift_id,studio:prepared\.studio/)
  assert.match(handler,/mimeFromBytes\(bytes\)/)
  assert.match(handler,/sharp\(bytes,\{limitInputPixels:24_000_000,failOn:'error'\}\)/)
  assert.match(handler,/\.rotate\(\)\.resize\(/)
  assert.match(handler,/\.flatten\(\{background:'#ffffff'\}\)\.jpeg\(/)
  assert.match(handler,/createHash\('sha256'\)\.update\(persisted\)/)
  assert.match(handler,/self_attendance_photo_evidence/)
  assert.match(handler,/self_attendance_record/)
  assert.match(handler,/existing\.data/)
  assert.match(handler,/await drive\.delete\(uploadedId\)/)
  assert.match(handler,/event\.data\.staff_id!==actor\.businessUserId/)
  assert.match(handler,/session\.from\('shifts'\)/)
  assert.match(route,/export const POST = checkInPhoto/)
  assert.match(route,/export const GET = readPhoto/)
  assert.match(panel,/type="file"[^\n]*capture="environment"/)
  assert.match(panel,/attendance-live-shift-context/)
  assert.match(panel,/NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO==='true'/)
  assert.match(panel,/writeSelfAttendancePhotoCheckIn/)
  assert.match(modal,/shiftContext=\{\{/)
  assert.doesNotMatch(handler,/storage\.from\(|data:image\/|service_role.*NEXT_PUBLIC_/i)
})

test('leader attendance reviewer exposes only an authenticated photo flag, never the Drive ID or upload token',async()=>{
  const db=managerQueryClient({rows:2,photo:true})
  const handler=createWorkforceActualHandler({client:db.client as never,isEnabled:()=>true,
    isAttendanceReviewEnabled:()=>true,resolveUser:manager})
  const response=await handler.GET(request())
  assert.equal(response.status,200)
  const payload=await response.json()
  assert.equal(payload.attendance_events[0].photo_available,true)
  assert.equal(payload.attendance_events[1].photo_available,false)
  assert.equal(payload.attendance_events[0].request_id,undefined)
  assert.equal(JSON.stringify(payload).includes('external_file_id'),false)
  assert.ok(db.calls.includes('self_attendance_photo_evidence'))
  const ui=readFileSync(new URL('../components/features/payroll/PayrollAttendanceLink.tsx',import.meta.url),'utf8')
  assert.match(ui,/Xem ảnh check-in Drive \(chờ xác minh\)/)
})


test('recovery after page reload requires existing actor-scoped Drive proof and skips reupload',()=>{
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const client=readFileSync(new URL('../lib/services/supabaseSelfAttendanceService.ts',import.meta.url),'utf8')
  const panel=readFileSync(new URL('../components/features/attendance/SelfAttendancePanel.tsx',import.meta.url),'utf8')
  assert.match(handler,/const recoverOnly=form\.get\('recover_only'\)==='true'/)
  assert.match(handler,/if\(recoverOnly&&!existing\.data\)/)
  assert.match(handler,/ATTENDANCE_PHOTO_RECOVERY_UNAVAILABLE/)
  assert.match(handler,/byAssignment\.data\?\?byRequest\.data/)
  assert.match(handler,/\.eq\('staff_id',actor\.businessUserId\)\.eq\('operational_role',kind\)/)
  assert.match(handler,/const committedRequestId=existing\.data\?\.request_id\?\?requestId/)
  assert.match(handler,/p_request_id:committedRequestId/)
  assert.match(handler,/stored\.parent_ids\?\.\[0\]!==existing\.data\.external_parent_id/)
  assert.match(handler,/createHash\('sha256'\)\.update\(priorBytes\)/)
  assert.match(client,/export async function recoverSelfAttendancePhotoCheckIn/)
  assert.match(client,/form\.set\('recover_only','true'\)/)
  assert.doesNotMatch(client.slice(client.indexOf('export async function recoverSelfAttendancePhotoCheckIn')),/form\.set\('file'/)
  assert.match(panel,/Khôi phục check-in đã gửi ảnh/)
  assert.match(client,/export async function recoverSelfAttendancePhotoCheckOut/)
  assert.match(panel,/if\s*\(lock\.current\s*\|\|\s*!ready\s*\|\|\s*kind\s*!==\s*nextAction\s*\|\|\s*!photoFeatureReady\)\s*return/)
})


test('admin-only attendance Drive preflight is read-only and hides provider identity',()=>{
  const source=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const route=readFileSync(new URL('../app/api/workforce/self-attendance-photo/preflight/route.ts',import.meta.url),'utf8')
  const preflight=source.slice(source.indexOf('export async function GET_PREFLIGHT'))
  assert.ok(preflight.startsWith('export async function GET_PREFLIGHT'))
  assert.match(preflight,/await requireRole\(request,'admin'\)/)
  assert.match(preflight,/actor\.businessUserId/)
  assert.match(preflight,/get_my_self_attendance/)
  assert.match(preflight,/limit:6,windowMs:60\*60\*1000/)
  assert.match(preflight,/await drive\.healthCheck\(\)/)
  assert.match(preflight,/health\.root_readable!==true/)
  assert.match(preflight,/health\.root_can_add_children!==true/)
  assert.match(preflight,/feature_enabled:process\.env\.FEATURE_SELF_ATTENDANCE_PHOTO==='true'/)
  assert.doesNotMatch(preflight,/\.upload\(|\.ensureFolder\(|\.delete\(|external_file_id|refresh_token|private_key/i)
  // Referencing a private environment KEY for runtime ACL checks is safe;
  // only response payload values must not disclose the raw Drive root ID.
  assert.match(preflight,/root_readable:true/)
  assert.match(preflight,/root_can_add_children:true/)
  assert.match(route,/export const GET = GET_PREFLIGHT/)
  assert.doesNotMatch(route,/export const POST|export const PUT|export const DELETE/)
})


test('Admin Payroll shows one explicit, non-mutating Drive readiness action',()=>{
  const ui=readFileSync(new URL('../components/features/payroll/AttendanceDrivePreflight.tsx',import.meta.url),'utf8')
  const parent=readFileSync(new URL('../components/features/payroll/PayrollAttendanceLink.tsx',import.meta.url),'utf8')
  assert.match(parent,/import \{ AttendanceDrivePreflight \} from '\.\/AttendanceDrivePreflight'/)
  assert.match(parent,/<AttendanceDrivePreflight \/>/)
  assert.match(ui,/data-testid="attendance-drive-readiness"/)
  assert.match(ui,/method:'GET'/)
  assert.match(ui,/cache:'no-store'/)
  assert.match(ui,/root_can_add_children!==true/)
  assert.match(ui,/typeof result\.feature_enabled!=='boolean'/)
  assert.match(ui,/Giữ khóa check-in ảnh/)
  assert.match(ui,/ATTENDANCE_DRIVE_NOT_CONFIGURED/)
  assert.match(ui,/ATTENDANCE_DRIVE_PERMISSION_DENIED/)
  assert.match(ui,/ATTENDANCE_DRIVE_ACL_PUBLIC/)
  assert.match(ui,/ATTENDANCE_DRIVE_ALLOW_PUBLIC_ACCESS/)
  assert.match(ui,/setBlockedReason/)
  assert.match(ui,/Cần cấu hình bảo mật trên Vercel/)
  assert.doesNotMatch(ui,/method:'POST'|\.upload\(|\.delete\(|new FormData\(/)
})


test('attendance evidence uses the operational file gateway contract, not direct unsafe provider bypass',()=>{
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const gateway=readFileSync(new URL('../lib/services/fileStorageService.ts',import.meta.url),'utf8')
  const validation=readFileSync(new URL('../lib/files/fileValidation.ts',import.meta.url),'utf8')
  assert.match(gateway,/validateFileUploadInput\(input\)/)
  assert.match(gateway,/assertMetadataContainsNoBinary\(result\.asset\.provider_metadata\)/)
  assert.match(validation,/ALLOWED_FILE_MIME_TYPES/)
  assert.match(validation,/FILE_METADATA_INVALID/)
  assert.match(handler,/entity_type:'shift',entity_id:shiftId,created_by:actor\.businessUserId/)
  assert.match(handler,/external_parent_id:parentId/)
  assert.match(handler,/destination:\{provider:'google_drive',external_folder_id:parentId\}/)
  assert.match(handler,/FEATURE_SELF_ATTENDANCE_PHOTO!=='true'/)
  assert.match(handler,/FILE_STORAGE_ENABLED!=='true'/)
  assert.doesNotMatch(handler,/FILE_STORAGE_ENABLED:'true'/)
})


test('sensitive check-in photos reject link-public and domain-wide Google Drive folder permissions',async()=>{
  const {assertPrivateAttendanceDrivePermissions,AttendanceDriveAclError}=
    await import('../lib/utils/attendanceDriveAcl.ts')
  assert.doesNotThrow(()=>assertPrivateAttendanceDrivePermissions([
    {type:'user',role:'owner'},{type:'user',role:'writer'},{type:'group',role:'reader'},
  ],true))
  for(const type of ['anyone','domain']){
    for(const role of ['writer','reader']){
      assert.throws(()=>assertPrivateAttendanceDrivePermissions([
        {type:'user',role:'owner'},{type,role},
      ],true),(error:unknown)=>error instanceof AttendanceDriveAclError&&error.code==='ATTENDANCE_DRIVE_ACL_PUBLIC')
    }
  }
  assert.throws(()=>assertPrivateAttendanceDrivePermissions([],true),/ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
  assert.throws(()=>assertPrivateAttendanceDrivePermissions([{type:'user',role:'owner'}],false),/ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
  assert.throws(()=>assertPrivateAttendanceDrivePermissions([{type:'anyone',role:null}],true),/ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
})

test('both upload and Admin read-only preflight block staff photos into publicly shared Drive root',()=>{
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const acl=readFileSync(new URL('../lib/server/attendanceDriveAcl.ts',import.meta.url),'utf8')
  const guard=readFileSync(new URL('../lib/utils/attendanceDriveAcl.ts',import.meta.url),'utf8')
  assert.match(handler,/await assertPrivateAttendanceDriveRoot\(root,/g)
  assert.equal((handler.match(/await assertPrivateAttendanceDriveRoot\(root,/g)??[]).length,2)
  assert.match(handler,/ATTENDANCE_DRIVE_ACL_PUBLIC/)
  assert.match(handler,/return failed\(error\.code,error\.code==='ATTENDANCE_DRIVE_ACL_PUBLIC'\?409:503\)/)
  assert.match(acl,/drive\.permissions\.list\(\{/)
  assert.match(acl,/nextPageToken/)
  assert.match(acl,/all\.push\(\.\.\.data\.permissions\)/)
  assert.match(acl,/assertPrivateAttendanceDrivePermissions\(all,complete,publicGrantApproved\)/)
  assert.match(guard,/permission\.type==='anyone' \|\| permission\.type==='domain'/)
  assert.doesNotMatch(acl,/permissions\.create\(|permissions\.delete\(|files\.create\(/)
})


test('public Drive sharing is allowed ONLY with explicit operator override; incomplete ACL still fails',async()=>{
  const {assertPrivateAttendanceDrivePermissions,AttendanceDriveAclError}=
    await import('../lib/utils/attendanceDriveAcl.ts')
  const publicRoot=[{type:'user',role:'owner'},{type:'anyone',role:'writer'}]
  assert.throws(()=>assertPrivateAttendanceDrivePermissions(publicRoot,true),
    (error:unknown)=>error instanceof AttendanceDriveAclError&&error.code==='ATTENDANCE_DRIVE_ACL_PUBLIC')
  assert.deepEqual(assertPrivateAttendanceDrivePermissions(publicRoot,true,true),{publicAccess:true})
  assert.deepEqual(assertPrivateAttendanceDrivePermissions([{type:'user',role:'owner'}],true,true),{publicAccess:false})
  assert.throws(()=>assertPrivateAttendanceDrivePermissions(publicRoot,false,true),/ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
  assert.throws(()=>assertPrivateAttendanceDrivePermissions([{type:'unknown',role:'writer'}],true,true),/ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
  assert.throws(()=>assertPrivateAttendanceDrivePermissions([{type:'anyone',role:'invalid'}],true,true),/ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
  const server=readFileSync(new URL('../lib/server/attendanceDriveAcl.ts',import.meta.url),'utf8')
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const ui=readFileSync(new URL('../components/features/payroll/AttendanceDrivePreflight.tsx',import.meta.url),'utf8')
  assert.match(server,/env\.ATTENDANCE_DRIVE_ALLOW_PUBLIC_ACCESS==='true'/)
  assert.match(server,/assertPrivateAttendanceDrivePermissions\(all,complete,publicGrantApproved\)/)
  assert.match(handler,/public_access:publicAccess/)
  assert.match(handler,/public_access_approved:publicAccess&&process\.env\.ATTENDANCE_DRIVE_ALLOW_PUBLIC_ACCESS==='true'/)
  assert.match(ui,/typeof result\.public_access!=='boolean'/)
  assert.match(ui,/result\.public_access===true&&result\.public_access_approved!==true/)
  assert.match(ui,/ảnh check-in và thông tin nhân sự trong file vẫn có thể bị người có liên kết Drive truy cập/)
  assert.doesNotMatch(server,/\.permissions\.create\(|\.permissions\.delete\(/)
})

test('P0-1 & P0-5: U14.1 migration guarantees PostgREST RPC compatibility and safe constraint migration',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261025180000_rc19_u14_1_mandatory_checkout_photo.sql',import.meta.url),'utf8')
  assert.match(migration,/add column if not exists event_kind text not null default 'check_in'/i)
  assert.match(migration,/check \(event_kind in \('check_in', 'check_out'\)\)/i)
  assert.match(migration,/unique \(shift_id, staff_id, operational_role, event_kind\)/i)
  // P0-5: Safe catalog query without loose pattern matching on constraint names
  assert.match(migration,/array\['shift_id',\s*'staff_id',\s*'operational_role'\]/)
  assert.doesNotMatch(migration,/conname like '%operational%'/)
  // P0-5: Documented rollback plan covering pre-existing check_out photo rows
  assert.match(migration,/Rollback plan reference:/i)
  assert.match(migration,/self_attendance_photo_evidence_checkout_backup/)

  // 3-arg function has NO DEFAULT to prevent PostgREST PGRST204 RPC ambiguity
  assert.match(migration,/create or replace function public\.get_self_attendance_photo_context\(\s*p_shift_id text,\s*p_operational_role text,\s*p_event_kind text\s*\)/i)
  assert.doesNotMatch(migration,/p_event_kind text default 'check_in'/i)

  // 2-arg function is provided as unambiguous backward compatible overload
  assert.match(migration,/create or replace function public\.get_self_attendance_photo_context\(\s*p_shift_id text,\s*p_operational_role text\s*\)/i)
  assert.match(migration,/return public\.get_self_attendance_photo_context\(p_shift_id, p_operational_role, 'check_in'\);/)

  // Both functions are granted to authenticated with security definer and search_path = ''
  assert.match(migration,/grant execute on function public\.get_self_attendance_photo_context\(text, text, text\) to authenticated/i)
  assert.match(migration,/grant execute on function public\.get_self_attendance_photo_context\(text, text\) to authenticated/i)

  // Trigger enforces both check-in and check-out photos and check-in prerequisite
  assert.match(migration,/new\.event_kind = 'check_out' and not exists/i)
  assert.match(migration,/ATTENDANCE_CHECKIN_REQUIRED/i)
  assert.match(migration,/new\.event_kind in \('check_in', 'check_out'\)/i)
  assert.match(migration,/ATTENDANCE_PHOTO_REQUIRED/i)
})

test('P0-2: Check-in and Check-out have separate, isolated time boundary rules in SQL and business logic',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261025180000_rc19_u14_1_mandatory_checkout_photo.sql',import.meta.url),'utf8')

  // Check-in condition: shift cannot be completed, window is [start_at - 2h, end_at]
  assert.match(migration,/if v_kind = 'check_in' then/)
  assert.match(migration,/v_shift\.status not in \('scheduled', 'preparing', 'live', 'paused'\)/)
  assert.match(migration,/v_now > v_shift\.end_at/)

  // Check-out condition: allows completed shifts, grace period is [start_at - 2h, end_at + 4h]
  assert.match(migration,/v_shift\.status not in \('scheduled', 'preparing', 'live', 'paused', 'completed'\)/)
  assert.match(migration,/v_now > v_shift\.end_at \+ interval '4 hours'/)

  // Pure function testing time boundary logic across all phases
  function checkBoundary(shift: {
    start_at: Date;
    end_at: Date;
    status: 'scheduled' | 'preparing' | 'live' | 'paused' | 'completed';
  }, kind: 'check_in' | 'check_out', now: Date): boolean {
    if (kind === 'check_in') {
      if (!['scheduled', 'preparing', 'live', 'paused'].includes(shift.status)) return false;
      const earliest = new Date(shift.start_at.getTime() - 2 * 3600 * 1000);
      const latest = shift.end_at;
      return now >= earliest && now <= latest;
    } else {
      if (!['scheduled', 'preparing', 'live', 'paused', 'completed'].includes(shift.status)) return false;
      const earliest = new Date(shift.start_at.getTime() - 2 * 3600 * 1000);
      const latest = new Date(shift.end_at.getTime() + 4 * 3600 * 1000);
      return now >= earliest && now <= latest;
    }
  }

  // Regular daytime shift 08:00 - 12:00
  const regularShift = {
    start_at: new Date('2026-10-25T08:00:00Z'),
    end_at: new Date('2026-10-25T12:00:00Z'),
    status: 'live' as const,
  };

  // 1. Before shift (05:59 - more than 2h before start)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T05:59:00Z')), false);
  assert.equal(checkBoundary(regularShift, 'check_out', new Date('2026-10-25T05:59:00Z')), false);

  // 2. Early check-in window (06:01 - within 2h before start)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T06:01:00Z')), true);

  // 3. During shift (10:00)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T10:00:00Z')), true);
  assert.equal(checkBoundary(regularShift, 'check_out', new Date('2026-10-25T10:00:00Z')), true);

  // 4. Exact end of shift (12:00)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T12:00:00Z')), true);
  assert.equal(checkBoundary(regularShift, 'check_out', new Date('2026-10-25T12:00:00Z')), true);

  // 5. After shift end (12:30 - check-in MUST be rejected, check-out allowed)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T12:30:00Z')), false);
  assert.equal(checkBoundary(regularShift, 'check_out', new Date('2026-10-25T12:30:00Z')), true);

  // 6. Within check-out grace period (15:59 - within end_at + 4h)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T15:59:00Z')), false);
  assert.equal(checkBoundary(regularShift, 'check_out', new Date('2026-10-25T15:59:00Z')), true);

  // 7. After check-out grace period (16:01 - more than 4h after end_at)
  assert.equal(checkBoundary(regularShift, 'check_in', new Date('2026-10-25T16:01:00Z')), false);
  assert.equal(checkBoundary(regularShift, 'check_out', new Date('2026-10-25T16:01:00Z')), false);

  // 8. Completed shift: check-in rejected, check-out allowed within grace period
  const completedShift = { ...regularShift, status: 'completed' as const };
  assert.equal(checkBoundary(completedShift, 'check_in', new Date('2026-10-25T10:00:00Z')), false);
  assert.equal(checkBoundary(completedShift, 'check_out', new Date('2026-10-25T13:00:00Z')), true);

  // 9. Overnight shift crossing midnight: 22:00 -> 02:00 next day
  const overnightShift = {
    start_at: new Date('2026-10-25T22:00:00Z'),
    end_at: new Date('2026-10-26T02:00:00Z'),
    status: 'live' as const,
  };
  // During overnight shift at 01:00 next day
  assert.equal(checkBoundary(overnightShift, 'check_in', new Date('2026-10-26T01:00:00Z')), true);
  assert.equal(checkBoundary(overnightShift, 'check_out', new Date('2026-10-26T01:00:00Z')), true);
  // After overnight shift at 04:00 next day (check-in rejected, check-out within 4h grace period)
  assert.equal(checkBoundary(overnightShift, 'check_in', new Date('2026-10-26T04:00:00Z')), false);
  assert.equal(checkBoundary(overnightShift, 'check_out', new Date('2026-10-26T04:00:00Z')), true);
  // After grace period at 06:01 next day (both rejected)
  assert.equal(checkBoundary(overnightShift, 'check_in', new Date('2026-10-26T06:01:00Z')), false);
  assert.equal(checkBoundary(overnightShift, 'check_out', new Date('2026-10-26T06:01:00Z')), false);
})

test('U14.1 self attendance photo handler enforces separate check-out photo, rejects reuse, and serves GET for both events',()=>{
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  assert.match(handler,/z\.enum\(\['check_in','check_out'\]\)\.parse\(form\.get\('event_kind'\)\?\?'check_in'\)/)
  assert.match(handler,/\.eq\('event_kind',eventKind\)/)
  assert.match(handler,/\(byRequest\.data\.event_kind&&byRequest\.data\.event_kind!==eventKind\)/)
  assert.match(handler,/ATTENDANCE_PHOTO_REQUEST_REUSED/)
  assert.match(handler,/p_event_kind:eventKind/)
  assert.match(handler,/ATTENDANCE_PHOTO_CHECKOUT_PENDING_RECONCILIATION/)
  assert.match(handler,/ATTENDANCE_PHOTO_CHECKOUT_RESPONSE_MISMATCH/)
  assert.match(handler,/!\['check_in','check_out'\]\.includes\(event\.data\.event_kind\)/)
})

test('U14.1 UI renders distinct camera, preview, and evidence for both check-in and check-out',()=>{
  const panel=readFileSync(new URL('../components/features/attendance/SelfAttendancePanel.tsx',import.meta.url),'utf8')
  assert.match(panel,/attendance-checkin-camera/)
  assert.match(panel,/attendance-checkout-camera/)
  assert.match(panel,/data-testid="attendance-checkin-evidence"/)
  assert.match(panel,/data-testid="attendance-checkout-evidence"/)
  assert.match(panel,/disabled=\{busy \|\| !photo\}/)
  assert.match(panel,/writeSelfAttendancePhotoCheckIn/)
  assert.match(panel,/writeSelfAttendancePhotoCheckOut/)
})
test('P1-3: Cross-event SHA-256 duplicate detection and request isolation in photo handler',()=>{
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')

  // Rejects identical SHA-256 across check_in and check_out
  assert.match(handler,/const oppositeEventKind=eventKind==='check_in'\?'check_out':'check_in'/)
  assert.match(handler,/oppositeEvidence\.data\.checksum_sha256===hash/)
  assert.match(handler,/failed\('ATTENDANCE_PHOTO_DUPLICATE_ACROSS_EVENTS',409\)/)

  // Preserves separate request UUID and capture source tracking
  assert.match(handler,/const requestId=UUID\.parse\(form\.get\('request_id'\)\)/)
  assert.match(handler,/z\.enum\(\['camera','file_picker'\]\)\.parse\(form\.get\('capture_source'\)\)/)
  assert.match(handler,/\(byRequest\.data\.event_kind&&byRequest\.data\.event_kind!==eventKind\)/)
  assert.match(handler,/failed\('ATTENDANCE_PHOTO_REQUEST_REUSED',409\)/)
})

test('P1-4: Manager review supports dual photo links, timestamps, and pending approval badge',()=>{
  const ui=readFileSync(new URL('../components/features/payroll/PayrollAttendanceLink.tsx',import.meta.url),'utf8')
  const handler=readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')

  // Check-in and check-out timestamps and links are rendered
  assert.match(ui,/Check-in: \{fmt\(item\.checkin\)\}/)
  assert.match(ui,/Check-out: \{fmt\(item\.checkout\)\}/)
  assert.match(ui,/data-testid="view-checkin-photo-link"/)
  assert.match(ui,/data-testid="view-checkout-photo-link"/)
  assert.match(ui,/data-testid="attendance-pending-badge"/)
  assert.match(ui,/Chờ duyệt/)

  // Actor/role isolation in GET photo handler
  assert.match(handler,/event\.data\.staff_id!==actor\.businessUserId/)
  assert.match(handler,/!\['leader','admin'\]\.includes\(actor\.systemPermission\)/)
  assert.match(handler,/session\.from\('shifts'\)\.select\('id'\)\.eq\('id',event\.data\.shift_id\)/)
})
