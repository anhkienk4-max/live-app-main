import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decodeSelfAttendanceEvent,decodeSelfAttendanceHistory } from '../lib/utils/selfAttendanceContract.ts'
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
