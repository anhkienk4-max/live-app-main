import assert from 'node:assert/strict'
import test from 'node:test'
import { createAttendancePhotoReviewHandler } from '../lib/server/attendancePhotoReviewHandler.ts'
import { readFileSync } from 'node:fs'

const manager = async () => ({ id:'auth-leader', businessUserId:'leader-1', systemPermission:'leader' as const })
function query(data: unknown, error: unknown = null) {
  const q: Record<string, unknown> = {}
  for (const method of ['select','eq','in','order','limit']) q[method] = () => q
  q.maybeSingle = async () => ({data,error})
  q.then = (resolve: (v:unknown)=>unknown, reject?: (e:unknown)=>unknown) => Promise.resolve({data,error}).then(resolve,reject)
  return q
}

test('attendance photo review is hidden while its server feature flag is off', async () => {
  const handler = createAttendancePhotoReviewHandler({resolveUser:manager,isEnabled:()=>false,
    createClient:(async()=>{throw new Error('must not access database')}) as never})
  const response = await handler.GET(new Request('https://unit.test/api/workforce/attendance-photo-review?shift_id=s1'))
  assert.equal(response.status,404)
  assert.equal(response.headers.get('cache-control'),'private, no-store')
})

test('member cannot submit supervisor review decisions', async () => {
  const member = async () => ({id:'auth-member',businessUserId:'member-1',systemPermission:'member' as const})
  const handler = createAttendancePhotoReviewHandler({resolveUser:member,isEnabled:()=>true})
  const post = await handler.POST(new Request('https://unit.test/api/workforce/attendance-photo-review',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://unit.test'},body:JSON.stringify({event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expected_version:0,decision:'approved',reason:'valid evidence',idempotency_key:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})}))
  assert.equal(post.status,403)
})

test('review POST uses the session RPC with version, decision, reason and idempotency key', async () => {
  let args: Record<string,unknown>|null = null
  const session = {rpc:async (_name:string, value:Record<string,unknown>)=>{args=value;return {data:{version:1},error:null}}}
  const handler = createAttendancePhotoReviewHandler({resolveUser:manager,isEnabled:()=>true,
    createClient:(async()=>session) as never})
  const response = await handler.POST(new Request('https://unit.test/api/workforce/attendance-photo-review',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://unit.test'},body:JSON.stringify({event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expected_version:0,expected_evidence_revision:1,decision:'correction_requested',reason:'Photo needs a clearer view',idempotency_key:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})}))
  assert.equal(response.status,200)
  assert.deepEqual(args,{p_event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_expected_version:0,p_expected_evidence_revision:1,p_decision:'correction_requested',p_reason:'Photo needs a clearer view',p_idempotency_key:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})
})

test('review GET requires a shift visible to the signed-in reviewer and fails closed on missing schema', async () => {
  const scopeClient = {from:()=>query({id:'s1'})}
  const handler = createAttendancePhotoReviewHandler({resolveUser:manager,isEnabled:()=>true,
    createClient:(async()=>scopeClient) as never,
    createAdminClient:(()=>({from:(table:string)=>table==='self_attendance_events'
      ? query([{id:'evt',request_id:'req',shift_id:'s1',staff_id:'member-1',operational_role:'host',event_kind:'check_in',recorded_at:'2026-10-29T00:00:00Z'}])
      : table==='self_attendance_photo_evidence' ? query([{request_id:'req'}])
        : query(null,{code:'42P01'})})) as never})
  const response = await handler.GET(new Request('https://unit.test/api/workforce/attendance-photo-review?shift_id=s1'))
  assert.equal(response.status,503)
})

test('member correction queue is limited to session-owned events and omits provider identifiers', async () => {
  const member = async () => ({id:'auth-member',businessUserId:'member-1',systemPermission:'member' as const})
  const session = {rpc:async()=>({data:[
    {event_id:'own-event',shift_id:'s1',staff_id:'member-1',role:'host',event:'check_in',recorded_at:'2026-10-29T00:00:00Z'},
    {event_id:'foreign-event',shift_id:'s1',staff_id:'member-2',role:'support',event:'check_out',recorded_at:'2026-10-29T01:00:00Z'},
  ],error:null})}
  const review={attendance_event_id:'own-event',evidence_request_id:'own-request',decision:'correction_requested',
    reason:'Please submit a clearer image.',reviewer_id:'leader-1',version:1,evidence_revision:1,created_at:'2026-10-29T02:00:00Z'}
  const handler=createAttendancePhotoReviewHandler({resolveUser:member,isEnabled:()=>true,
    createClient:(async()=>session) as never,
    createAdminClient:(()=>({from:(table:string)=>table==='self_attendance_events'
      ? query([{id:'own-event',request_id:'own-request'}])
      : table==='self_attendance_photo_review_events' ? query([review])
        : table==='self_attendance_photo_evidence_revisions' ? query([])
          : query([{request_id:'own-request',created_at:'2026-10-29T00:00:00Z',external_file_id:'private-drive-id'}])})) as never})
  const response=await handler.GET(new Request('https://unit.test/api/workforce/attendance-photo-review?shift_id=s1'))
  const body=await response.json()
  assert.equal(response.status,200)
  assert.deepEqual(body.corrections.map((row:{id:string})=>row.id),['own-event'])
  assert.equal(JSON.stringify(body).includes('private-drive-id'),false)
})

test('decision payload rejects short reasons and unexpected fields', async () => {
  const handler = createAttendancePhotoReviewHandler({resolveUser:manager,isEnabled:()=>true})
  for (const payload of [
    {event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expected_version:0,decision:'approved',reason:'short',idempotency_key:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
    {event_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expected_version:0,decision:'approved',reason:'valid reason text',idempotency_key:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',staff_id:'other-user'},
  ]) {
    const response = await handler.POST(new Request('https://unit.test/api/workforce/attendance-photo-review',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://unit.test'},body:JSON.stringify(payload)}))
    assert.equal(response.status,400)
  }
})

test('review migration is append-only, scoped, versioned and independent from Actual/Payroll', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261029140000_rc19_p2_04_attendance_photo_review.sql', import.meta.url),'utf8')
  assert.match(sql,/private\.require_shift_actor\(true\)/)
  assert.match(sql,/private\.can_read_shift\(v_event\.shift_id\)/)
  assert.match(sql,/v_event\.staff_id=v_actor/)
  assert.match(sql,/ATTENDANCE_REVIEW_VERSION_CONFLICT/)
  assert.match(sql,/ATTENDANCE_REVIEW_EVIDENCE_VERSION_CONFLICT/)
  assert.match(sql,/ATTENDANCE_CORRECTION_VERSION_CONFLICT/)
  assert.match(sql,/idempotency_key uuid not null unique/)
  assert.match(sql,/before update or delete on public\.self_attendance_photo_review_events/)
  assert.match(sql,/before update or delete on public\.self_attendance_photo_evidence_revisions/)
  assert.match(sql,/private\.require_shift_actor\(false\)/)
  assert.match(sql,/p_previous_request_id<>v_previous_request_id/)
  assert.doesNotMatch(sql,/workforce_actual_segments|payroll_lines/i)
})

test('review UI keeps decisions independent from Actual and Payroll, and prevents empty-reason submission', () => {
  const ui = readFileSync(new URL('../components/features/attendance/AttendancePhotoReviewPanel.tsx',import.meta.url),'utf8')
  assert.match(ui,/does not approve Actual Staffing or Payroll/)
  assert.match(ui,/correction_requested/)
  assert.match(ui,/reason\[item\.id\]\?\.trim\(\)\.length\?\?0\)<8/)
  assert.match(ui,/expected_version:item\.version/)
  assert.match(ui,/expected_evidence_revision:item\.evidence_revision/)
  assert.match(ui,/crypto\.randomUUID\(\)/)
})

test('correction upload is owner-scoped, versioned and leaves original check-in untouched', () => {
  const api = readFileSync(new URL('../lib/server/selfAttendancePhotoHandler.ts',import.meta.url),'utf8')
  const correctionUi = readFileSync(new URL('../components/features/attendance/AttendanceCorrectionPanel.tsx',import.meta.url),'utf8')
  assert.match(api,/get_self_attendance_photo_correction_context/)
  assert.match(api,/commit_self_attendance_photo_correction/)
  assert.match(api,/p_expected_revision:correctionContext\.expected_revision/)
  assert.match(api,/ATTENDANCE_CORRECTION_COMMIT_UNCONFIRMED/)
  assert.match(correctionUi,/correction_event_id/)
  assert.match(correctionUi,/Gửi ảnh bổ sung/)
  assert.match(correctionUi,/selectedFiles\.current/)
})

test('reviewer UI tells the employee to resubmit instead of claiming the flow is unavailable', () => {
  const ui = readFileSync(new URL('../components/features/attendance/AttendancePhotoReviewPanel.tsx',import.meta.url),'utf8')
  assert.match(ui,/Waiting for the employee to submit a replacement photo/)
  assert.doesNotMatch(ui,/resubmission is not available until/i)
})
