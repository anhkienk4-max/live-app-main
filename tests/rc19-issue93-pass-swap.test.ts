import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DAILY_PASS_MIN_LEAD_MINUTES,
  CAMPAIGN_PASS_MIN_LEAD_MINUTES,
  isCampaignShift,
  validateSwapTiming,
  validateSwapApprovalTiming,
  validateSubstituteStaff,
} from '../lib/utils/swapValidation.ts'
import {
  shiftRegistrationService,
  shiftService,
  swapRequestService,
  userService,
} from '../lib/services/dataService.ts'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'

process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
process.env.NODE_ENV = 'development'

function createSampleShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: `shift-${Math.random().toString(36).substring(7)}`,
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
    timezone: 'Asia/Ho_Chi_Minh',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    status: 'scheduled',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    ...overrides,
  }
}

test('Issue #93: isCampaignShift correctly distinguishes daily from campaign shifts without heuristics', () => {
  const dailyShift = createSampleShift({ campaign_id: undefined })
  const dailyShiftEmpty = createSampleShift({ campaign_id: '' })
  const dailyShiftNone = createSampleShift({ campaign_id: 'none' })
  const campaignShift = createSampleShift({ campaign_id: 'camp-123' })

  assert.equal(isCampaignShift(dailyShift), false, 'Shift without campaign_id is daily')
  assert.equal(isCampaignShift(dailyShiftEmpty), false, 'Shift with empty campaign_id is daily')
  assert.equal(isCampaignShift(dailyShiftNone), false, 'Shift with none campaign_id is daily')
  assert.equal(isCampaignShift(campaignShift), true, 'Shift with campaign_id is campaign')

  // Validation with active campaigns list
  const knownCampaigns = [{ id: 'camp-123', status: 'active' }, { id: 'camp-archived', status: 'archived' }]
  assert.equal(isCampaignShift(campaignShift, knownCampaigns), true)
  assert.equal(isCampaignShift(createSampleShift({ campaign_id: 'camp-archived' }), knownCampaigns), true, 'Shift with archived campaign must NOT become daily')
})

test('Issue #93: Shift with archived campaign enforces Campaign 24h deadline and NEVER degrades to Daily 2h', () => {
  const shiftWithArchivedCampaign = createSampleShift({
    campaign_id: 'camp-archived',
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
  })
  const knownCampaigns = [{ id: 'camp-archived', status: 'archived', archived_at: '2026-11-01T00:00:00Z' }]

  // 180 minutes (3 hours) before live:
  // For Daily: 180m >= 120m -> would be allowed.
  // For Campaign: 180m < 1440m -> MUST BE REJECTED with CAMPAIGN_PASS_DEADLINE_EXCEEDED!
  const requestTime = new Date('2026-11-20T11:00:00+07:00')
  const result = validateSwapTiming(shiftWithArchivedCampaign, requestTime, 'replacement', knownCampaigns)

  assert.equal(result.allowed, false)
  assert.equal(result.code, 'CAMPAIGN_PASS_DEADLINE_EXCEEDED')
})

test('Issue #93: Daily PASS >= 120 minutes before live is ALLOWED', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })
  const requestTime = new Date('2026-11-20T11:30:00+07:00') // 150m before live
  const result = validateSwapTiming(shift, requestTime, 'replacement')
  assert.equal(result.allowed, true)
})

test('Issue #93: Daily PASS exactly at 120 minutes threshold is ALLOWED', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })
  const requestTime = new Date('2026-11-20T12:00:00+07:00') // exactly 120m
  const result = validateSwapTiming(shift, requestTime, 'replacement')
  assert.equal(result.allowed, true)
})

test('Issue #93: Daily PASS < 120 minutes before live is REJECTED with DAILY_PASS_DEADLINE_EXCEEDED', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })

  const request119 = new Date('2026-11-20T12:01:00+07:00') // 119m
  const res119 = validateSwapTiming(shift, request119, 'replacement')
  assert.equal(res119.allowed, false)
  assert.equal(res119.code, 'DAILY_PASS_DEADLINE_EXCEEDED')

  const request30 = new Date('2026-11-20T13:30:00+07:00') // 30m
  const res30 = validateSwapTiming(shift, request30, 'replacement')
  assert.equal(res30.allowed, false)
  assert.equal(res30.code, 'DAILY_PASS_DEADLINE_EXCEEDED')
})

test('Issue #93: Campaign PASS >= 24 hours before live is ALLOWED', () => {
  const shift = createSampleShift({
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
    campaign_id: 'campaign-mega-sale',
  })
  const requestTime = new Date('2026-11-19T13:00:00+07:00') // 25h before live
  const result = validateSwapTiming(shift, requestTime, 'replacement')
  assert.equal(result.allowed, true)
})

test('Issue #93: Campaign PASS < 24 hours before live is REJECTED at creation', () => {
  const shift = createSampleShift({
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
    campaign_id: 'campaign-mega-sale',
  })
  const requestTime = new Date('2026-11-19T15:00:00+07:00') // 23h before live
  const result = validateSwapTiming(shift, requestTime, 'replacement')
  assert.equal(result.allowed, false)
  assert.equal(result.code, 'CAMPAIGN_PASS_DEADLINE_EXCEEDED')
})

test('Issue #93: Campaign PASS MUST be approved at least 24 hours (1440 minutes) before live', () => {
  const shift = createSampleShift({
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
    campaign_id: 'campaign-mega-sale',
  })

  // Approval attempted 25 hours before live -> ALLOWED
  const validApproval = validateSwapApprovalTiming({
    sourceShift: shift,
    mode: 'replacement',
    approvalTime: new Date('2026-11-19T13:00:00+07:00'),
  })
  assert.equal(validApproval.allowed, true)

  // Approval attempted 23 hours before live (late Leader review) -> MUST BE REJECTED
  const lateApproval = validateSwapApprovalTiming({
    sourceShift: shift,
    mode: 'replacement',
    approvalTime: new Date('2026-11-19T15:00:00+07:00'),
  })
  assert.equal(lateApproval.allowed, false)
  assert.equal(lateApproval.code, 'CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED')
  assert.match(lateApproval.messageVi!, /tối thiểu 24 giờ/)
})

test('Issue #93: Exchange is NOT subject to PASS deadlines (120m / 1440m)', () => {
  const sourceShift = createSampleShift({
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
  })
  // Request exchange at 13:00 (60 minutes before live, which would fail Daily PASS)
  const requestTime = new Date('2026-11-20T13:00:00+07:00')
  const result = validateSwapTiming(sourceShift, requestTime, 'exchange')
  assert.equal(result.allowed, true, 'Exchange is allowed within 2 hours as long as live has not started')

  // But Exchange during live is prohibited
  const duringLive = new Date('2026-11-20T15:00:00+07:00')
  const duringLiveRes = validateSwapTiming(sourceShift, duringLive, 'exchange')
  assert.equal(duringLiveRes.allowed, false)
  assert.equal(duringLiveRes.code, 'EXCHANGE_DURING_LIVE_NOT_ALLOWED')
})

test('Issue #93: Ordinary PASS during live is PROHIBITED (Emergency Backup Reassignment required)', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })
  const duringLiveTime = new Date('2026-11-20T15:00:00+07:00')
  const result = validateSwapTiming(shift, duringLiveTime, 'replacement')

  assert.equal(result.allowed, false)
  assert.equal(result.code, 'PASS_DURING_LIVE_NOT_ALLOWED')
  assert.equal(result.isEmergencyBackupEligible, true)
  assert.match(result.messageVi!, /Emergency Backup Reassignment/)
})

test('Issue #93: Overnight shift crossing midnight correctly evaluates start time and lead time', () => {
  const overnightShift = createSampleShift({
    date: '2026-11-20',
    start_time: '22:00',
    end_time: '02:00',
    crosses_midnight: true,
  })

  // 1. Request at 20:00 (120 minutes before 22:00) -> ALLOWED
  const resAllowed = validateSwapTiming(overnightShift, new Date('2026-11-20T20:00:00+07:00'), 'replacement')
  assert.equal(resAllowed.allowed, true)

  // 2. Request at 20:30 (90 minutes before 22:00) -> REJECTED
  const resRejected = validateSwapTiming(overnightShift, new Date('2026-11-20T20:30:00+07:00'), 'replacement')
  assert.equal(resRejected.allowed, false)
  assert.equal(resRejected.code, 'DAILY_PASS_DEADLINE_EXCEEDED')

  // 3. Request at 23:00 (during overnight live) -> PROHIBITED
  const resLive = validateSwapTiming(overnightShift, new Date('2026-11-20T23:00:00+07:00'), 'replacement')
  assert.equal(resLive.allowed, false)
  assert.equal(resLive.code, 'PASS_DURING_LIVE_NOT_ALLOWED')
})

test('Issue #93: Substitute staff role matching and validation rules', () => {
  const sourceShift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })
  const requester: User = {
    id: 'user-requester',
    email: 'req@example.com',
    full_name: 'Requester Staff',
    role: 'staff',
    system_permission: 'member',
    status: 'active',
    account_status: 'active',
    operational_roles: ['host'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  const wrongRoleUser: User = {
    ...requester,
    id: 'user-wrong-role',
    operational_roles: ['support'],
  }

  const inactiveUser: User = {
    ...requester,
    id: 'user-inactive',
    status: 'inactive',
  }

  const qualifiedFreeHost: User = {
    ...requester,
    id: 'user-substitute-host',
    operational_roles: ['host'],
  }

  // 1. Role mismatch
  const roleCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: wrongRoleUser,
    existingRegistrations: [],
    allShifts: [sourceShift],
  })
  assert.equal(roleCheck.valid, false)
  assert.equal(roleCheck.code, 'SUBSTITUTE_ROLE_MISMATCH')

  // 2. Inactive user
  const inactiveCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: inactiveUser,
    existingRegistrations: [],
    allShifts: [sourceShift],
  })
  assert.equal(inactiveCheck.valid, false)
  assert.equal(inactiveCheck.code, 'SUBSTITUTE_INACTIVE')

  // 3. Self-substitution
  const selfCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: requester,
    existingRegistrations: [],
    allShifts: [sourceShift],
  })
  assert.equal(selfCheck.valid, false)
  assert.equal(selfCheck.code, 'SUBSTITUTE_SELF_NOT_ALLOWED')

  // 4. Qualified and free substitute -> VALID
  const validCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: qualifiedFreeHost,
    existingRegistrations: [],
    allShifts: [sourceShift],
  })
  assert.equal(validCheck.valid, true)
})

test('Issue #93: swapRequestService enforces approval lead time on Campaign and blocks late approval', async () => {
  // Create Campaign shift in 2035
  const campShift = await shiftService.create({
    date: '2035-08-20',
    start_time: '14:00',
    end_time: '18:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    campaign_id: 'c1', // valid mock campaign
    title: 'Future Campaign Mega Sale',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    status: 'scheduled',
  } as unknown as Shift)

  const reg = await shiftRegistrationService.assignManually(campShift.id, '2', 'host', '1', campShift.version)

  // 1. Create request 30 hours in advance -> SUCCEEDS
  const createTime = new Date('2035-08-19T08:00:00+07:00') // 30h before live
  const request = await swapRequestService.create({
    requester_id: '2',
    shift_id: campShift.id,
    source_registration_id: reg.id,
    replacement_staff_id: '3',
    operational_role: 'host',
    mode: 'replacement',
    reason: 'Advance campaign pass',
    request_time: createTime,
  } as never)

  // Counterpart accepts
  const accepted = await swapRequestService.respond(request.id, '3', 'accept', request.version)
  assert.equal(accepted?.status, 'accepted')

  // 2. Leader attempts approval with only 20 hours remaining (< 24 hours) -> MUST FAIL
  const lateApprovalTime = new Date('2035-08-19T18:00:00+07:00') // 20h before live
  await assert.rejects(
    () => swapRequestService.approve(request.id, '1', accepted?.version, lateApprovalTime),
    /tối thiểu 24 giờ|CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED/i,
  )

  // 3. Leader approves on time (26 hours remaining) -> MUST SUCCEED
  const onTimeApproval = new Date('2035-08-19T12:00:00+07:00') // 26h before live
  const completed = await swapRequestService.approve(request.id, '1', accepted?.version, onTimeApproval)
  assert.equal(completed?.status, 'completed')
})

test('Issue #93: SQL migration file exists and enforces create and approval lead times', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261110123000_rc19_issue93_pass_swap_lead_times.sql', import.meta.url),
    'utf8',
  )

  assert.match(sql, /create or replace function public\.create_shift_swap_request/)
  assert.match(sql, /create or replace function public\.approve_shift_swap_request/)
  assert.match(sql, /PASS_DURING_LIVE_NOT_ALLOWED/)
  assert.match(sql, /EXCHANGE_DURING_LIVE_NOT_ALLOWED/)
  assert.match(sql, /DAILY_PASS_DEADLINE_EXCEEDED/)
  assert.match(sql, /CAMPAIGN_PASS_DEADLINE_EXCEEDED/)
  assert.match(sql, /CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED/)
  assert.match(sql, /interval '2 hours'/)
  assert.match(sql, /interval '24 hours'/)
  assert.match(sql, /grant execute on function public\.create_shift_swap_request.*to authenticated/)
  assert.match(sql, /grant execute on function public\.approve_shift_swap_request.*to authenticated/)
})
