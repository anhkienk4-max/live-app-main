import assert from 'node:assert/strict'
import test from 'node:test'
import {
  autoCalculatePeriodLines, calculatePayrollAmounts, calculatePayrollAmountsFromSeconds,
  calculatePayrollLine, calculateRecalculationDiffs, calculateSecondPrecisionPayrollLine,
  nextPayrollState, selectApprovedRate,
  type ActualStaffingEvidence, type ApprovedPayrollRate,
} from '@/lib/workforce/payrollCalculation'
import { summarizeWorkforcePerformance } from '@/lib/workforce/workforcePerformance'
import { aggregateWorkforceTeam, rankVerifiedWorkforce } from '@/lib/workforce/workforceOverview'

const verified: ActualStaffingEvidence = {
  id:'segment-1',shiftId:'shift-1',staffId:'staff-1',role:'host',
  eventKind:'worked',reviewStatus:'approved',
  startAt:'2026-09-30T21:30:00+07:00',endAt:'2026-09-30T23:00:00+07:00',
}
const rate: ApprovedPayrollRate = {
  id:'rate-1',staffId:'staff-1',role:'host',effectiveFrom:'2026-09-01',
  effectiveThrough:null,vndPerHour:100000,overtimeMultiplierBasisPoints:15000,approvedBy:'finance-1',
}

test('Draft correction uses the same integer rounding and money bounds as preparation',()=>{
  for(const [payableMinutes,overtimeMinutes] of [[0,0],[1,0],[61,30],[90,90]]){
    const line=calculatePayrollLine({segment:verified,shiftDate:'2026-09-30',rate,
      payableMinutes,overtimeMinutes})
    const amounts=calculatePayrollAmounts({actualMinutes:90,rateVndPerHour:100000,
      overtimeMultiplierBasisPoints:15000,payableMinutes,overtimeMinutes})
    assert.equal(amounts.grossVnd,line.grossVnd)
    assert.equal(amounts.netVnd,line.netVnd)
  }
  assert.throws(()=>calculatePayrollAmounts({actualMinutes:90,rateVndPerHour:100000,
    overtimeMultiplierBasisPoints:15000,payableMinutes:60,overtimeMinutes:0,
    adjustmentVnd:1000000000000,adjustmentReason:'Explicitly approved amount'}),
  {message:'WORKFORCE_NET_INVALID'})
})

test('payroll: 90 actual minutes; 30 overtime minutes; one final VND rounding', () => {
  const item=calculatePayrollLine({
    segment:verified,shiftDate:'2026-09-30',rate,payableMinutes:90,overtimeMinutes:30,
  })
  assert.equal(item.actualMinutes,90)
  assert.equal(item.grossVnd,175000) // 60 regular + 30 overtime * 150%
  assert.equal(item.netVnd,175000)
  assert.equal(item.calculationVersion,'rc16-v1')
})
test('payroll: single-round VND exact 61-minute rate; no JS floating currency drift', () => {
  const item=calculatePayrollLine({
    segment:{...verified,endAt:'2026-09-30T22:31:00+07:00'},
    shiftDate:'2026-09-30',rate,payableMinutes:61,overtimeMinutes:0,
  })
  assert.equal(item.grossVnd,101667)
})
test('payroll: actual time crossing midnight is computed from timezone offsets', () => {
  const item=calculatePayrollLine({
    segment:{...verified,startAt:'2026-09-30T23:30:00+07:00',
      endAt:'2026-10-01T01:00:00+07:00'},
    shiftDate:'2026-09-30',rate,payableMinutes:90,overtimeMinutes:0,
  })
  assert.equal(item.actualMinutes,90)
  assert.equal(item.grossVnd,150000)
})
test('RC19 seconds: owner example keeps exact seconds and rounds only final VND',()=>{
  const line=calculateSecondPrecisionPayrollLine({
    segment:{...verified,startAt:'2026-11-10T10:03:27+07:00',endAt:'2026-11-10T14:00:12+07:00'},
    shiftDate:'2026-11-10',rate,payableSeconds:14205,overtimeSeconds:0,
  })
  assert.equal(line.actualSeconds,14205)
  assert.equal(line.payableSeconds,14205)
  assert.equal(line.actualMinutes,236) // compatibility projection only
  assert.equal(line.grossVnd,394583)
  assert.equal(line.calculationVersion,'rc19-seconds-v1')
})
test('RC19 seconds: one and fifty-nine seconds remain distinct, including overnight',()=>{
  assert.equal(calculateSecondPrecisionPayrollLine({
    segment:{...verified,startAt:'2026-11-10T23:59:59+07:00',endAt:'2026-11-11T00:00:00+07:00'},
    shiftDate:'2026-11-10',rate,payableSeconds:1,overtimeSeconds:0,
  }).actualSeconds,1)
  assert.equal(calculateSecondPrecisionPayrollLine({
    segment:{...verified,startAt:'2026-11-10T23:59:01+07:00',endAt:'2026-11-11T00:00:00+07:00'},
    shiftDate:'2026-11-10',rate,payableSeconds:59,overtimeSeconds:0,
  }).actualSeconds,59)
  assert.equal(calculateSecondPrecisionPayrollLine({
    segment:{...verified,startAt:'2026-11-10T10:00:00.001+07:00',endAt:'2026-11-10T10:00:01+07:00'},
    shiftDate:'2026-11-10',rate,payableSeconds:1,overtimeSeconds:0,
  }).actualSeconds,1)
})
test('RC19 auto payroll never grants post-cutover overtime from free-text notes',()=>{
  const result=autoCalculatePeriodLines({
    period:{periodStart:'2026-11-10',periodEnd:'2026-11-10'},
    segments:[{shiftDate:'2026-11-10',segment:{...verified,
      startAt:'2026-11-10T10:00:00+07:00',endAt:'2026-11-10T11:00:01+07:00',
      reviewNote:'OT approved 1 hour',evidenceNote:'overtime'},
      payrollEvidenceCompleteness:'verified_complete'}],
    rates:[rate],
  })
  assert.equal(result.preparedLines[0]?.actualSeconds,3601)
  assert.equal(result.preparedLines[0]?.overtimeSeconds,0)
  assert.equal(result.unapprovedOtExceptions[0]?.reason,'STRUCTURED_OVERTIME_APPROVAL_REQUIRED')
})
test('RC19 post-cutover OT is paid only from an approved structured interval and keeps its classification',()=>{
  const segment={...verified,startAt:'2026-11-10T10:00:00+07:00',endAt:'2026-11-10T11:00:01+07:00',
    reviewNote:'OT approved 1 hour',evidenceNote:'Overtime request'}
  const base={period:{periodStart:'2026-11-10',periodEnd:'2026-11-10'},
    segments:[{shiftDate:'2026-11-10',segment,payrollEvidenceCompleteness:'verified_complete' as const}],rates:[rate]}
  const denied=autoCalculatePeriodLines(base)
  assert.equal(denied.preparedLines[0]?.overtimeSeconds,0)
  const approved=autoCalculatePeriodLines({...base,approvedOvertimeBySegment:new Map([['segment-1',{
    id:'ot-1',overtimeSeconds:61,dayClass:'weekday' as const,timeClass:'day' as const,multiplierBasisPoints:20000,
  }]])})
  assert.equal(approved.preparedLines[0]?.overtimeSeconds,61)
  assert.equal(approved.preparedLines[0]?.overtimeRequestId,'ot-1')
  assert.equal(approved.preparedLines[0]?.overtimeDayClass,'weekday')
  assert.equal(approved.preparedLines[0]?.overtimeTimeClass,'day')
  assert.equal(approved.preparedLines[0]?.overtimeMultiplierBasisPoints,20000)
  assert.equal(approved.preparedLines[0]?.grossVnd,101722)
})
test('RC19 post-cutover shifts without verified report completeness enter Payroll Hold',()=>{
  const result=autoCalculatePeriodLines({
    period:{periodStart:'2026-11-10',periodEnd:'2026-11-10'},
    segments:[{shiftDate:'2026-11-10',segment:{...verified,
      startAt:'2026-11-10T10:00:00+07:00',endAt:'2026-11-10T11:00:00+07:00'}}],
    rates:[rate],
  })
  assert.equal(result.preparedLines.length,0)
  assert.equal(result.payrollHolds[0]?.reason,'REQUIRED_EVIDENCE_COMPLETENESS_UNVERIFIED')
  assert.equal(result.skippedSegments[0]?.reason,'PAYROLL_HOLD_REQUIRED_EVIDENCE_COMPLETENESS_UNVERIFIED')
})
test('RC19 second payroll money uses one integer half-up VND rounding',()=>{
  assert.equal(calculatePayrollAmountsFromSeconds({actualSeconds:14205,payableSeconds:14205,
    overtimeSeconds:0,rateVndPerHour:100000,overtimeMultiplierBasisPoints:15000}).grossVnd,394583)
  assert.throws(()=>calculatePayrollAmountsFromSeconds({actualSeconds:59,payableSeconds:60,
    overtimeSeconds:0,rateVndPerHour:100000,overtimeMultiplierBasisPoints:15000}),
  {message:'WORKFORCE_PAYABLE_SECONDS_INVALID'})
})
test('RC19 rate recalculation preview uses stored seconds, not minute projections',()=>{
  const {diffs}=calculateRecalculationDiffs({
    lines:[{id:'line-seconds',periodId:'p',segmentId:'s',rateCardId:'old-rate',staffId:'staff-1',
      role:'host',version:1,shiftDate:'2026-11-10',actualMinutes:236,payableMinutes:236,
      overtimeMinutes:0,actualSeconds:14205,payableSeconds:14205,overtimeSeconds:0,
      rateVndPerHour:100000,overtimeMultiplierBasisPoints:15000,grossVnd:394583,
      adjustmentVnd:0,netVnd:394583,adjustmentReason:null}],
    rates:[{...rate,id:'new-rate',effectiveFrom:'2026-11-10',vndPerHour:120000}],
  })
  assert.equal(diffs[0]?.newGrossVnd,473500)
})
test('payroll refuses draft, no-show, out-of-scope rates, fabricated time and OT', () => {
  const original={segment:verified,shiftDate:'2026-09-30',rate,payableMinutes:90,overtimeMinutes:0}
  assert.throws(()=>calculatePayrollLine({...original,segment:{...verified,reviewStatus:'draft'}}),
    {message:'WORKFORCE_ATTENDANCE_NOT_APPROVED'})
  assert.throws(()=>calculatePayrollLine({...original,segment:{...verified,eventKind:'no_show',startAt:null,endAt:null}}),
    {message:'WORKFORCE_ATTENDANCE_NOT_APPROVED'})
  assert.throws(()=>calculatePayrollLine({...original,rate:{...rate,staffId:'other'}}),
    {message:'WORKFORCE_RATE_SCOPE_MISMATCH'})
  assert.throws(()=>calculatePayrollLine({...original,payableMinutes:91}),
    {message:'WORKFORCE_PAYABLE_MINUTES_INVALID'})
  assert.throws(()=>calculatePayrollLine({...original,overtimeMinutes:91}),
    {message:'WORKFORCE_OVERTIME_MINUTES_INVALID'})
  assert.throws(()=>calculatePayrollLine({...original,segment:{...verified,endAt:'bad'}}),
    {message:'WORKFORCE_ACTUAL_TIMES_REQUIRED'})
  assert.throws(()=>calculatePayrollLine({...original,segment:{...verified,startAt:'2026-09-30T21:30:00'}}),
    {message:'WORKFORCE_TIMEZONE_REQUIRED'})
  assert.throws(()=>calculatePayrollLine({...original,shiftDate:'2026-10-01',
    rate:{...rate,effectiveThrough:'2026-09-30'}}),
    {message:'WORKFORCE_RATE_OUTSIDE_VALIDITY'})
})
test('payroll manual adjustment requires reason and cannot make payable negative', () => {
  const args={segment:verified,shiftDate:'2026-09-30',rate,payableMinutes:90,overtimeMinutes:0}
  assert.throws(()=>calculatePayrollLine({...args,adjustmentVnd:-1000}),
    {message:'WORKFORCE_ADJUSTMENT_REASON_REQUIRED'})
  assert.throws(()=>calculatePayrollLine({...args,adjustmentVnd:-200000,adjustmentReason:'Verified penalty'}),
    {message:'WORKFORCE_NET_INVALID'})
  assert.equal(calculatePayrollLine({...args,adjustmentVnd:2500,adjustmentReason:'Approved adjustment'}).netVnd,152500)
})
test('effective rate selects staff-specific approved scope; overlapping candidates fail closed', () => {
  const broad={...rate,id:'role-default',staffId:null,vndPerHour:50000}
  assert.equal(selectApprovedRate(verified,'2026-09-30',[broad,rate]).id,rate.id)
  assert.equal(selectApprovedRate({...verified,staffId:'staff-2'},'2026-09-30',[broad]).id,'role-default')
  assert.throws(()=>selectApprovedRate(verified,'2026-09-30',[rate,{...rate,id:'duplicate'}]),
    {message:'WORKFORCE_RATE_AMBIGUOUS'})
  assert.throws(()=>selectApprovedRate(verified,'2026-08-31',[rate]),
    {message:'WORKFORCE_RATE_NOT_APPROVED'})
})
test('payroll approval flow follows review confirm ready lock with no skipping or reopen', () => {
  assert.equal(nextPayrollState('draft','reviewed'),'reviewed')
  assert.equal(nextPayrollState('reviewed','confirmed'),'confirmed')
  assert.equal(nextPayrollState('confirmed','payroll_ready'),'payroll_ready')
  assert.equal(nextPayrollState('payroll_ready','locked'),'locked')
  assert.throws(()=>nextPayrollState('draft','locked'),{message:'WORKFORCE_PAYROLL_INVALID_TRANSITION'})
  assert.throws(()=>nextPayrollState('locked','draft'),{message:'WORKFORCE_PAYROLL_INVALID_TRANSITION'})
})
test('workforce: verified late, explicit no-show and missing evidence are distinct', () => {
  const planned=[
    {shiftId:'shift-1',staffId:'staff-1',role:'host' as const,
      shiftDate:'2026-09-30',scheduledStartAt:'2026-09-30T21:00:00+07:00'},
    {shiftId:'shift-2',staffId:'staff-1',role:'host' as const,
      shiftDate:'2026-09-29',scheduledStartAt:'2026-09-29T21:00:00+07:00'},
    {shiftId:'shift-3',staffId:'staff-1',role:'host' as const,
      shiftDate:'2026-09-28',scheduledStartAt:'2026-09-28T21:00:00+07:00'},
  ]
  const evidence=[verified,{...verified,id:'no-show-1',shiftId:'shift-2',
    eventKind:'no_show' as const,startAt:null,endAt:null}]
  const p=summarizeWorkforcePerformance('staff-1','host',planned,evidence,{lateGraceMinutes:5})
  assert.equal(p.assignedShifts,3)
  assert.equal(p.verifiedShifts,2)
  assert.equal(p.unknownAttendanceShifts,1)
  assert.equal(p.approvedNoShows,1)
  assert.equal(p.approvedWorkedShifts,1)
  assert.equal(p.approvedActualMinutes,90)
  assert.equal(p.lateShifts,1)
  assert.equal(p.punctualityPct,0)
  assert.equal(p.knownReliabilityPct,50)
  assert.equal(p.attendanceCoveragePct,66.67)
  assert.equal(p.isComplete,false)
  assert.equal(p.warning,'INCOMPLETE_ATTENDANCE_EVIDENCE')
})
test('workforce: no evidence means unknown, never no-show and never a fabricated score', () => {
  const planned=[{shiftId:'shift-1',staffId:'staff-1',role:'host' as const,
    shiftDate:'2026-09-30',scheduledStartAt:'2026-09-30T21:00:00+07:00'}]
  const p=summarizeWorkforcePerformance('staff-1','host',planned,[],{lateGraceMinutes:0})
  assert.equal(p.approvedNoShows,0)
  assert.equal(p.punctualityPct,null)
  assert.equal(p.knownReliabilityPct,null)
  assert.equal(p.unknownAttendanceShifts,1)
})
test('workforce: approved overlapping evidence and conflicting no-show fail closed', () => {
  const planned=[{shiftId:'shift-1',staffId:'staff-1',role:'host' as const,
    shiftDate:'2026-09-30',scheduledStartAt:'2026-09-30T21:00:00+07:00'}]
  assert.throws(()=>summarizeWorkforcePerformance('staff-1','host',planned,[
    verified,{...verified,id:'seg-2',startAt:'2026-09-30T22:00:00+07:00',
      endAt:'2026-09-30T22:45:00+07:00'}],{lateGraceMinutes:5}),
  {message:'WORKFORCE_OVERLAPPING_APPROVED_SEGMENTS'})
  assert.throws(()=>summarizeWorkforcePerformance('staff-1','host',planned,[
    verified,{...verified,id:'no-show',eventKind:'no_show',startAt:null,endAt:null},
  ],{lateGraceMinutes:5}),{message:'WORKFORCE_CONFLICTING_APPROVED_EVIDENCE'})
})

test('team overview weights denominators correctly and leaderboard excludes incomplete evidence', () => {
  const complete={
    staffId:'a',role:'host' as const,assignedShifts:10,verifiedShifts:10,
    unknownAttendanceShifts:0,approvedNoShows:1,approvedWorkedShifts:9,
    approvedActualMinutes:900,lateShifts:1,onTimeShifts:8,
    attendanceCoveragePct:100,punctualityPct:88.89,knownReliabilityPct:90,
    isComplete:true,warning:null,
  }
  const incomplete={
    ...complete,staffId:'b',assignedShifts:3,verifiedShifts:1,
    unknownAttendanceShifts:2,approvedNoShows:0,approvedWorkedShifts:1,
    approvedActualMinutes:40,lateShifts:0,onTimeShifts:1,
    attendanceCoveragePct:33.33,punctualityPct:100,knownReliabilityPct:100,
    isComplete:false,warning:'INCOMPLETE_ATTENDANCE_EVIDENCE' as const,
  }
  const overview=aggregateWorkforceTeam([complete,incomplete])
  assert.equal(overview.assignedShifts,13)
  assert.equal(overview.verifiedShifts,11)
  assert.equal(overview.unknownAttendanceShifts,2)
  assert.equal(overview.knownReliabilityPct,90.91)
  assert.equal(overview.punctualityPct,90)
  assert.equal(overview.incompleteStaffCount,1)
  assert.deepEqual(rankVerifiedWorkforce([complete,incomplete],5).map(s=>s.staffId),['a'])
  assert.throws(()=>rankVerifiedWorkforce([complete],0),{
    message:'WORKFORCE_LEADERBOARD_POLICY_REQUIRED',
  })
})
