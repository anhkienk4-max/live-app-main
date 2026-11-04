import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADA_ROOM_RULES_EFFECTIVE_DATE, proposeAdaRoomRule, summarizeAdaRoomRecurrence,
  type RoomRuleProposalInput,
} from '../lib/workforce/adaRoomRulebook.ts'

const base: RoomRuleProposalInput = {
  rule: 'lateness', role: 'host', liveKind: 'daily',
  shiftDate: '2026-10-22', shiftFeeVnd: 200_000,
  liveStartAt: '2026-10-22T10:00:00+07:00',
  groupCheckInAt: '2026-10-22T09:45:00+07:00',
}
const rule = (changes: Partial<RoomRuleProposalInput> = {}) => proposeAdaRoomRule({...base,...changes})

test('ADA room policy is effective 22 Oct 2026, never retroactively', () => {
  assert.equal(ADA_ROOM_RULES_EFFECTIVE_DATE,'2026-10-22')
  assert.deepEqual([rule({shiftDate:'2026-10-21'}).state,rule().state],['outside_policy','no_violation'])
  assert.equal(rule({shiftDate:'2026-02-31'}).state,'needs_evidence')
  assert.equal(rule().payrollApplied,false)
})

test('case estimates do not establish evidence or apply to unsupported roles and dates', () => {
  const hypothetical=rule({rule:'general'})
  assert.equal(hypothetical.state,'proposed')
  assert.ok(hypothetical.requiredEvidence.length>0)
  assert.equal(hypothetical.payrollApplied,false)
  assert.equal(rule({role:'technical' as RoomRuleProposalInput['role']}).state,'manual_review')
  assert.equal(rule({role:'support'}).payrollApplied,false)
  assert.equal(rule({shiftDate:'2026-10-21'}).state,'outside_policy')
})

test('Host Daily lateness brackets calculate from 15-minute early check-in deadline, no 10-minute grace', () => {
  for(const [arrived,percentage] of [
    ['09:45:00',0],['09:45:01',10],['09:50:00',10],
    ['09:50:01',30],['10:00:00',30],['10:00:01',50],
    ['10:15:00',50],['10:15:01',100],
  ] as const) {
    const answer=rule({groupCheckInAt:'2026-10-22T'+arrived+'+07:00'})
    assert.equal(answer.suggestedVnd,200_000*percentage/100,arrived)
  }
})

test('Support Campaign 30-minute early deadline uses 25/50/100/100 bands',()=>{
  for(const [at,percentage] of [
    ['09:30:00',0],['09:30:01',25],['09:35:01',50],
    ['09:45:01',100],['10:00:01',100],
  ] as const){
    assert.equal(rule({role:'support',liveKind:'campaign',
      groupCheckInAt:'2026-10-22T'+at+'+07:00'}).suggestedVnd,percentage*2_000)
  }
  assert.equal(rule({groupCheckInAt:undefined}).state,'needs_evidence')
  assert.equal(rule({liveStartAt:undefined}).state,'needs_evidence')
  assert.equal(rule({airedLate:true,groupCheckInAt:undefined}).suggestedVnd,200_000)
})

test('Overnight check-in keeps correct date and timezone reference',()=>{
  assert.equal(rule({liveStartAt:'2026-10-23T00:10:00+07:00',
    groupCheckInAt:'2026-10-22T23:56:00+07:00'}).suggestedVnd,20_000)
})

test('Check-in / outfit is one case; Campaign doubles ONLY section II',()=>{
  assert.equal(rule({rule:'checkin_or_outfit_missing',liveKind:'daily'}).suggestedVnd,100_000)
  assert.equal(rule({rule:'checkin_or_outfit_missing',liveKind:'campaign'}).suggestedVnd,200_000)
  assert.equal(rule({rule:'checkout_or_recap_missing',liveKind:'campaign'}).suggestedVnd,200_000)
  assert.equal(rule({rule:'outfit_not_corrected',liveKind:'campaign'}).suggestedVnd,120_000)
  assert.equal(rule({rule:'conduct',liveKind:'campaign'}).suggestedVnd,60_000)
  assert.equal(rule({rule:'general',liveKind:'campaign'}).suggestedVnd,100_000)
  assert.equal(rule({rule:'outfit_not_corrected',shiftFeeVnd:undefined}).state,'needs_evidence')
})

test('Personal work monthly escalation overrides duplicate general / conduct for same incident',()=>{
  assert.equal(rule({rule:'personal_work',personalWorkOccurrence:1}).suggestedVnd,60_000)
  assert.equal(rule({rule:'personal_work',personalWorkOccurrence:2}).suggestedVnd,100_000)
  assert.equal(rule({rule:'personal_work',personalWorkOccurrence:3}).suggestedVnd,200_000)
  const third=rule({rule:'personal_work',personalWorkOccurrence:3,liveKind:'campaign'})
  assert.equal(third.suggestedVnd,200_000)
  assert.equal(third.warnings.some(w=>w.includes('THAY THẾ')),true)
  assert.equal(third.warnings.some(w=>w.includes('1 tuần')),true)
  assert.equal(rule({rule:'personal_work',personalWorkOccurrence:0}).state,'needs_evidence')
})

test('Host/Support daily/campaign cancellation brackets and authorized pass are distinct',()=>{
  const cancel={rule:'cancel_or_no_show' as const}
  assert.equal(rule({...cancel,cancellationNoticeHours:2.9}).suggestedVnd,1_000_000)
  assert.equal(rule({...cancel,cancellationNoticeHours:3}).suggestedVnd,300_000)
  assert.equal(rule({...cancel,cancellationNoticeHours:23.9}).suggestedVnd,300_000)
  assert.equal(rule({...cancel,cancellationNoticeHours:24}).suggestedVnd,0)
  assert.equal(rule({...cancel,liveKind:'campaign',role:'support',cancellationNoticeHours:2}).suggestedVnd,1_000_000)
  assert.equal(rule({...cancel,liveKind:'campaign',role:'support',cancellationNoticeHours:72}).suggestedVnd,400_000)
  assert.equal(rule({...cancel,liveKind:'campaign',cancellationNoticeHours:168}).suggestedVnd,0)
  assert.equal(rule({...cancel,liveKind:'campaign',replacementApproved:true,campaignPassApprovedHoursBefore:23,cancellationNoticeHours:3}).state,'manual_review')
  assert.equal(rule({...cancel,liveKind:'campaign',replacementApproved:true,campaignPassApprovedHoursBefore:24,cancellationNoticeHours:3}).suggestedVnd,0)
  assert.equal(rule({...cancel,replacementApproved:true,cancellationNoticeHours:2}).suggestedVnd,0)
  assert.equal(rule({...cancel}).state,'needs_evidence')
})

test('Force majeure, property damage and confidentiality require verification rather than estimated salary deduction',()=>{
  assert.equal(rule({rule:'cancel_or_no_show',cancellationNoticeHours:2,forceMajeureApproved:true}).state,'manual_review')
  for(const code of ['damage','confidentiality','cover_up'] as const){
    const proposed=rule({rule:code})
    assert.equal(proposed.suggestedVnd,null)
    assert.equal(proposed.direction,'none')
    assert.equal(proposed.payrollApplied,false)
  }
})

test('Verified first reporter bonus is 50% capped at 70k, false report 200k',()=>{
  const reward={rule:'verified_report_reward' as const,firstVerifiedReporter:true}
  assert.equal(rule({...reward,reviewedCaseAmountVnd:100_000}).suggestedVnd,50_000)
  assert.equal(rule({...reward,reviewedCaseAmountVnd:200_000}).suggestedVnd,70_000)
  assert.equal(rule({...reward,reviewedCaseAmountVnd:200_000}).direction,'review_bonus')
  assert.equal(rule({...reward,firstVerifiedReporter:false,reviewedCaseAmountVnd:100_000}).state,'needs_evidence')
  assert.equal(rule({rule:'false_report'}).suggestedVnd,200_000)
})

test('Tái phạm only returns manual scheduling/relationship proposals',()=>{
  assert.deepEqual(summarizeAdaRoomRecurrence({totalConfirmedIncidents:0,confirmedCampaignLate:0,confirmedUnannouncedNoShows:0}).proposals,[])
  const summary=summarizeAdaRoomRecurrence({totalConfirmedIncidents:5,confirmedCampaignLate:2,confirmedUnannouncedNoShows:2})
  assert.equal(summary.proposals.length,3)
  assert.throws(()=>summarizeAdaRoomRecurrence({totalConfirmedIncidents:-1,confirmedCampaignLate:2,confirmedUnannouncedNoShows:0}),/INVALID_VERIFIED_MONTHLY_COUNT/)
})
