import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DAILY_PASS_MIN_LEAD_MINUTES,
  CAMPAIGN_PASS_MIN_LEAD_MINUTES,
  isCampaignShift,
  validateSwapTiming,
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

test('Issue #93: isCampaignShift correctly distinguishes daily from campaign shifts', () => {
  const dailyShift = createSampleShift({ campaign_id: undefined })
  const dailyShiftEmpty = createSampleShift({ campaign_id: '' })
  const campaignShift = createSampleShift({ campaign_id: 'camp-123' })

  assert.equal(isCampaignShift(dailyShift), false, 'Shift without campaign_id is daily')
  assert.equal(isCampaignShift(dailyShiftEmpty), false, 'Shift with empty campaign_id is daily')
  assert.equal(isCampaignShift(campaignShift), true, 'Shift with campaign_id is campaign')
})

test('Issue #93: Daily PASS >= 120 minutes before live is ALLOWED', () => {
  // Shift starts at 14:00 on 2026-11-20
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })

  // Request at 11:30 (150 minutes before live)
  const requestTime = new Date('2026-11-20T11:30:00+07:00')
  const result = validateSwapTiming(shift, requestTime)

  assert.equal(result.allowed, true, 'Daily PASS requested 150m before live should be allowed')
})

test('Issue #93: Daily PASS exactly at 120 minutes threshold is ALLOWED', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })
  // Request at 12:00 (120 minutes before live)
  const requestTime = new Date('2026-11-20T12:00:00+07:00')
  const result = validateSwapTiming(shift, requestTime)

  assert.equal(result.allowed, true, 'Daily PASS requested exactly 120m before live should be allowed')
})

test('Issue #93: Daily PASS < 120 minutes before live is REJECTED with DAILY_PASS_DEADLINE_EXCEEDED', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })

  // Request at 12:01 (119 minutes before live)
  const request119 = new Date('2026-11-20T12:01:00+07:00')
  const res119 = validateSwapTiming(shift, request119)
  assert.equal(res119.allowed, false)
  assert.equal(res119.code, 'DAILY_PASS_DEADLINE_EXCEEDED')
  assert.match(res119.messageVi!, /tối thiểu 2 giờ \(120 phút\)/)

  // Request at 13:30 (30 minutes before live)
  const request30 = new Date('2026-11-20T13:30:00+07:00')
  const res30 = validateSwapTiming(shift, request30)
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

  // Request 25 hours before live (2026-11-19 13:00)
  const requestTime = new Date('2026-11-19T13:00:00+07:00')
  const result = validateSwapTiming(shift, requestTime)

  assert.equal(result.allowed, true, 'Campaign PASS requested 25h before live should be allowed')
})

test('Issue #93: Campaign PASS < 24 hours before live is REJECTED with CAMPAIGN_PASS_DEADLINE_EXCEEDED', () => {
  const shift = createSampleShift({
    date: '2026-11-20',
    start_time: '14:00',
    end_time: '18:00',
    campaign_id: 'campaign-mega-sale',
  })

  // Request 23 hours before live (2026-11-19 15:00)
  const requestTime = new Date('2026-11-19T15:00:00+07:00')
  const result = validateSwapTiming(shift, requestTime)

  assert.equal(result.allowed, false)
  assert.equal(result.code, 'CAMPAIGN_PASS_DEADLINE_EXCEEDED')
  assert.match(result.messageVi!, /tối thiểu 24 giờ/)
})

test('Issue #93: Ordinary PASS during live is PROHIBITED (Emergency Backup Reassignment required)', () => {
  const shift = createSampleShift({ date: '2026-11-20', start_time: '14:00', end_time: '18:00' })

  // Request at 15:30 (while live is ongoing)
  const requestTime = new Date('2026-11-20T15:30:00+07:00')
  const result = validateSwapTiming(shift, requestTime)

  assert.equal(result.allowed, false)
  assert.equal(result.code, 'PASS_DURING_LIVE_NOT_ALLOWED')
  assert.equal(result.isEmergencyBackupEligible, true)
  assert.match(result.messageVi!, /Emergency Backup Reassignment/i)
})

test('Issue #93: Overnight shift crossing midnight correctly evaluates start time and lead time', () => {
  // Overnight shift: 22:00 on 2026-11-20 to 02:00 on 2026-11-21
  const overnightShift = createSampleShift({
    date: '2026-11-20',
    start_time: '22:00',
    end_time: '02:00',
  })

  // Request at 19:30 (2.5 hours = 150 mins before live at 22:00) -> ALLOWED
  const req150m = new Date('2026-11-20T19:30:00+07:00')
  assert.equal(validateSwapTiming(overnightShift, req150m).allowed, true)

  // Request at 20:30 (1.5 hours = 90 mins before live at 22:00) -> REJECTED
  const req90m = new Date('2026-11-20T20:30:00+07:00')
  const res90m = validateSwapTiming(overnightShift, req90m)
  assert.equal(res90m.allowed, false)
  assert.equal(res90m.code, 'DAILY_PASS_DEADLINE_EXCEEDED')

  // Request at 23:30 (during overnight live) -> REJECTED with live prohibition
  const reqLive = new Date('2026-11-20T23:30:00+07:00')
  const resLive = validateSwapTiming(overnightShift, reqLive)
  assert.equal(resLive.allowed, false)
  assert.equal(resLive.code, 'PASS_DURING_LIVE_NOT_ALLOWED')

  // Request at 02:30 next morning (after shift end) -> REJECTED
  const reqAfter = new Date('2026-11-21T02:30:00+07:00')
  const resAfter = validateSwapTiming(overnightShift, reqAfter)
  assert.equal(resAfter.allowed, false)
  assert.equal(resAfter.code, 'SHIFT_ALREADY_ENDED')
})

test('Issue #93: Substitute staff role matching and validation rules', () => {
  const sourceShift = createSampleShift()

  const requester: User = {
    id: 'user-requester',
    auth_user_id: 'auth-1',
    email: 'host1@ada.test',
    full_name: 'Main Host',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    status: 'active',
    account_status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const technicalOnlyStaff: User = {
    id: 'user-tech',
    auth_user_id: 'auth-tech',
    email: 'tech@ada.test',
    full_name: 'Tech Specialist',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'], // Only technical, not host
    status: 'active',
    account_status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const inactiveStaff: User = {
    id: 'user-inactive',
    auth_user_id: 'auth-inactive',
    email: 'inactive@ada.test',
    full_name: 'Inactive Staff',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    status: 'suspended',
    account_status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  const qualifiedFreeHost: User = {
    id: 'user-free-host',
    auth_user_id: 'auth-host-2',
    email: 'host2@ada.test',
    full_name: 'Backup Host',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host', 'support'],
    status: 'active',
    account_status: 'active',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }

  // 1. Role mismatch
  const roleCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: technicalOnlyStaff,
    existingRegistrations: [],
    allShifts: [sourceShift],
  })
  assert.equal(roleCheck.valid, false)
  assert.equal(roleCheck.code, 'SUBSTITUTE_ROLE_MISMATCH')

  // 2. Inactive staff
  const inactiveCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: inactiveStaff,
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

  // 4. Already assigned
  const alreadyAssignedReg: ShiftRegistration = {
    id: 'reg-assigned',
    shift_id: sourceShift.id,
    user_id: qualifiedFreeHost.id,
    operational_role: 'support',
    status: 'approved',
    source: 'manual_assignment',
    requested_at: '2026-11-20T00:00:00Z',
    created_at: '2026-11-20T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
  }
  const alreadyCheck = validateSubstituteStaff({
    sourceShift,
    role: 'host',
    requesterId: requester.id,
    substitute: qualifiedFreeHost,
    existingRegistrations: [alreadyAssignedReg],
    allShifts: [sourceShift],
  })
  assert.equal(alreadyCheck.valid, false)
  assert.equal(alreadyCheck.code, 'SUBSTITUTE_ALREADY_ASSIGNED')

  // 5. Qualified and free substitute -> VALID
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

test('Issue #93: swapRequestService enforces lead times and preserves pending status without auto-approval', async () => {
  // Create a future shift in 2035 (well in advance)
  const shift = await shiftService.create({
    date: '2035-06-15',
    start_time: '14:00',
    end_time: '18:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    title: 'Future Valid Shift',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    status: 'scheduled',
  } as unknown as Shift)

  const reg = await shiftRegistrationService.assignManually(shift.id, '2', 'host', '1', shift.version)

  // 1. Attempt to create with request_time within 30 minutes of shift -> MUST FAIL
  const failRequestTime = new Date('2035-06-15T13:30:00+07:00')
  await assert.rejects(
    () =>
      swapRequestService.create({
        requester_id: '2',
        shift_id: shift.id,
        source_registration_id: reg.id,
        replacement_staff_id: '3',
        operational_role: 'host',
        mode: 'replacement',
        reason: 'Short notice test',
        request_time: failRequestTime,
      } as never),
    /tối thiểu 2 giờ/i,
  )

  // 2. Attempt with request_time 3 hours before live -> MUST SUCCEED
  const validRequestTime = new Date('2035-06-15T11:00:00+07:00')
  const createdSwap = await swapRequestService.create({
    requester_id: '2',
    shift_id: shift.id,
    source_registration_id: reg.id,
    replacement_staff_id: '3',
    operational_role: 'host',
    mode: 'replacement',
    reason: 'Valid advance notice request',
    request_time: validRequestTime,
  } as never)

  assert.ok(createdSwap.id)
  assert.equal(createdSwap.status, 'pending', 'Must remain in pending status; no auto-approval')
  assert.equal(createdSwap.approval_history?.length, 1, 'Approval history preserved')
  assert.equal(createdSwap.approval_history?.[0]?.action, 'created')
})

test('Issue #93: SQL migration file exists and enforces lead times and live prohibition', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261110123000_rc19_issue93_pass_swap_lead_times.sql', import.meta.url),
    'utf8',
  )

  assert.match(sql, /create or replace function public\.create_shift_swap_request/)
  assert.match(sql, /PASS_DURING_LIVE_NOT_ALLOWED/)
  assert.match(sql, /DAILY_PASS_DEADLINE_EXCEEDED/)
  assert.match(sql, /CAMPAIGN_PASS_DEADLINE_EXCEEDED/)
  assert.match(sql, /interval '2 hours'/)
  assert.match(sql, /interval '24 hours'/)
  assert.match(sql, /grant execute on function public\.create_shift_swap_request.*to authenticated/)
})
