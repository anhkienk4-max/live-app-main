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
  assert.match(panel,/if\(lock\.current\|\|!ready\|\|nextAction!=='check_in'\|\|!photoFeatureReady\)return/)
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
  assert.doesNotMatch(preflight,/\.upload\(|\.ensureFolder\(|\.delete\(|external_file_id|root_folder_id|refresh_token|private_key/i)
  assert.match(route,/export const GET = GET_PREFLIGHT/)
  assert.doesNotMatch(route,/export const POST|export const PUT|export const DELETE/)
})
