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
  assert.match(source,/attendance_events: attendanceRes\.data/)
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

function managerQueryClient(params: {rows?: number; journalError?: boolean}) {
  const calls:string[]=[]
  const client=()=>({
    from(name:string) {
      calls.push(name)
      const dataFor=()=>name==='shifts'?{id:'shift-1',status:'completed',host_id:'staff-1'}:
        name==='self_attendance_events'?
          Array.from({length:params.rows??0},(_,i)=>({
            id:'evt-'+i,shift_id:'shift-1',staff_id:'staff-1',operational_role:'host',
            event_kind:i%2?'check_out':'check_in',recorded_at:'2026-10-23T02:00:00Z',
            verification_status:'pending_verification'
          })):[]
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
  assert.equal((await response.json()).attendance_events.length,0)
  assert.equal(db.calls.includes('self_attendance_events'),false)
})
test('enabled manager review reads raw evidence without marking it as approved wages',async()=>{
  const db=managerQueryClient({rows:2})
  const handler=createWorkforceActualHandler({client:db.client as never,isEnabled:()=>true,
    isAttendanceReviewEnabled:()=>true,resolveUser:manager})
  const response=await handler.GET(request())
  assert.equal(response.status,200)
  const body=await response.json()
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
