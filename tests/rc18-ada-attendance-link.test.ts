import assert from 'node:assert/strict'
import test from 'node:test'
import { ADA_ROOM_RULES_CATALOG } from '../lib/workforce/adaRoomRulesCatalog.ts'
import { reviewRoomAttendance } from '../lib/workforce/adaRoomAttendanceReview.ts'
import type { RoomAttendanceSegment, RoomAttendanceShift } from '../lib/workforce/adaRoomAttendanceReview.ts'

const shift: RoomAttendanceShift = {
  id:'shift-1', date:'2026-10-22', start_time:'10:00:00',end_time:'12:00:00',
  start_at:'2026-10-22T10:00:00+07:00',end_at:'2026-10-22T12:00:00+07:00',
  timezone:'Asia/Ho_Chi_Minh',
}
const actual: RoomAttendanceSegment = {
  id:'actual-1',shift_id:'shift-1',staff_id:'employee-1',
  operational_role:'host',event_kind:'worked',review_status:'approved',
  actual_start_at:'2026-10-22T09:50:00+07:00',
  actual_end_at:'2026-10-22T12:00:00+07:00',
}

test('all 6 ADA sections I–VI preserved for reference',()=>{
  assert.deepEqual(ADA_ROOM_RULES_CATALOG.map(s=>s.id),['I','II','III','IV','V','VI'])
  for(const section of ADA_ROOM_RULES_CATALOG){
    assert.ok(section.title.length>10)
    assert.ok(section.items.every(item=>item.details.every(d=>d.length>10)))
  }
  const all=ADA_ROOM_RULES_CATALOG.flatMap(s=>s.items.flatMap(x=>x.details)).join(' ')
  for(const t of ['15 phút','30 phút','24 giờ','3 ngày làm việc','70.000đ','Campaign','mía','48 giờ'])
    assert.ok(all.includes(t),'Missing source rule: '+t)
})

test('approved actual start displays difference from mandatory group deadline WITHOUT assuming official check-in',()=>{
  const result=reviewRoomAttendance(shift,actual)
  assert.equal(result.state,'approved_worked')
  assert.equal(result.actualStartDeltaMinutes,5)
  assert.equal(result.deadlineIso,'2026-10-22T02:45:00.000Z')
  assert.equal(result.officialGroupCheckInStatus,'not_integrated')
  assert.equal(result.canAutoFine,false)
  assert.equal(result.requiresHumanVerification,true)
})

test('Support deadline is T-30 instead of Host T-15',()=>{
  const result=reviewRoomAttendance(shift,{...actual,operational_role:'support'})
  assert.equal(result.actualStartDeltaMinutes,20)
  assert.equal(result.deadlineIso,'2026-10-22T02:30:00.000Z')
})

test('missing actual data never counts as no-show or fine',()=>{
  const result=reviewRoomAttendance(shift,null)
  assert.equal(result.state,'no_record')
  assert.equal(result.actualStartDeltaMinutes,null)
  assert.equal(result.canAutoFine,false)
})

test('draft/rejected or mismatched shift must not be trusted as verified attendance',()=>{
  for(const segment of [
    {...actual,review_status:'draft' as const},
    {...actual,review_status:'rejected' as const},
    {...actual,shift_id:'another-shift'},
  ]) {
    const result=reviewRoomAttendance(shift,segment)
    assert.equal(result.state,'unverified')
    assert.equal(result.actualStartDeltaMinutes,null)
  }
})

test('approved no-show is a review prompt, never a payroll sanction',()=>{
  const result=reviewRoomAttendance(shift,{
    ...actual,event_kind:'no_show',actual_start_at:null,actual_end_at:null,
  })
  assert.equal(result.state,'approved_no_show')
  assert.equal(result.canAutoFine,false)
  assert.equal(result.actualStartIso,null)
})

test('previous-date shifts are outside October rulebook version',()=>{
  const result=reviewRoomAttendance({...shift,date:'2026-10-21'},actual)
  assert.equal(result.state,'outside_policy')
  assert.equal(result.canAutoFine,false)
})

test('overnight shift deadline can fall on the previous calendar day',()=>{
  const overnight: RoomAttendanceShift = {...shift,date:'2026-10-23',
    start_time:'00:10:00',end_time:'02:15:00',
    start_at:'2026-10-23T00:10:00+07:00',end_at:'2026-10-23T02:15:00+07:00'}
  const result=reviewRoomAttendance(overnight,{...actual,actual_start_at:'2026-10-22T23:58:00+07:00'})
  assert.equal(result.state,'approved_worked')
  assert.equal(result.actualStartDeltaMinutes,3)
  assert.equal(result.deadlineIso,'2026-10-22T16:55:00.000Z')
})

test('invalid schedule is reported, never used to calculate a sanction',()=>{
  const result=reviewRoomAttendance({...shift,start_at:'bad',end_at:'bad'},actual)
  assert.equal(result.state,'schedule_invalid')
  assert.equal(result.canAutoFine,false)
})
