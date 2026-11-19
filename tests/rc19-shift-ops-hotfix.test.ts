import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'development'
process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'

import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import {
  isShiftOpenForRegistration,
  isShiftClosed,
  canSelfCancelRegistration,
  formatRegistrationErrorMessage,
} from '@/lib/utils/shiftRegistration'
import { shiftsForCalendarDate } from '@/components/features/calendar/MonthView'
import { shiftService, shiftRegistrationService } from '@/lib/services/dataService'
import { shiftNoteService, ShiftNoteServiceError } from '@/lib/services/shiftNoteService'

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'user1@example.com',
  full_name: 'Nguyen Van A',
  role: 'staff',
  system_permission: 'member',
  operational_roles: ['host', 'support'],
  status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeShift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'shift-test-1',
  title: 'Ca Livestream Sáng',
  date: '2026-09-20',
  start_time: '09:00',
  end_time: '12:00',
  start_at: '2026-09-20T02:00:00.000Z',
  end_at: '2026-09-20T05:00:00.000Z',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  status: 'scheduled',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 0,
  registration_locked: false,
  version: 1,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

const makeRegistration = (overrides: Partial<ShiftRegistration> = {}): ShiftRegistration => ({
  id: 'reg-test-1',
  shift_id: 'shift-test-1',
  user_id: 'user-1',
  operational_role: 'host',
  status: 'pending',
  source: 'self_registration',
  version: 1,
  requested_at: '2026-09-10T00:00:00.000Z',
  created_at: '2026-09-10T00:00:00.000Z',
  updated_at: '2026-09-10T00:00:00.000Z',
  ...overrides,
})

test('RC19 Shift Ops: Open Shifts Filtering Logic (Contract Aligned)', async (t) => {
  const referenceNow = new Date('2026-09-15T00:00:00.000Z')

  await t.test('shift is open when unlocked, future, scheduled, and has vacant roles', () => {
    const s = makeShift()
    assert.equal(isShiftOpenForRegistration(s, [], referenceNow), true)
  })

  await t.test('shift is NOT open when registration_locked is true', () => {
    const s = makeShift({ registration_locked: true })
    assert.equal(isShiftOpenForRegistration(s, [], referenceNow), false)
  })

  await t.test('shift is NOT open when registration cutoff has passed', () => {
    const s = makeShift({
      registration_cutoff_at: '2026-09-14T12:00:00.000Z',
    })
    assert.equal(isShiftOpenForRegistration(s, [], referenceNow), false)
  })

  await t.test('shift remains open when start_at has passed but cutoff is null and end_at is future (No invented start_at cutoff)', () => {
    const s = makeShift({
      start_at: '2026-09-14T00:00:00.000Z',
      end_at: '2026-09-16T00:00:00.000Z',
      registration_cutoff_at: undefined,
    })
    // Server checks s.status = 'scheduled' and s.end_at > now(). There is no start_at cutoff.
    assert.equal(isShiftOpenForRegistration(s, [], referenceNow), true)
  })

  await t.test('shift is closed when end_at has passed', () => {
    const s = makeShift({
      start_at: '2026-09-13T00:00:00.000Z',
      end_at: '2026-09-14T00:00:00.000Z',
      registration_cutoff_at: undefined,
    })
    assert.equal(isShiftOpenForRegistration(s, [], referenceNow), false)
  })

  await t.test('shift is strictly NOT open for registration when status is not scheduled (rejects preparing)', () => {
    // Production RPC register_for_shift strictly accepts status === 'scheduled'
    assert.equal(isShiftOpenForRegistration(makeShift({ status: 'preparing' }), [], referenceNow), false)
    assert.equal(isShiftOpenForRegistration(makeShift({ status: 'cancelled' }), [], referenceNow), false)
    assert.equal(isShiftOpenForRegistration(makeShift({ status: 'completed' }), [], referenceNow), false)
    assert.equal(isShiftOpenForRegistration(makeShift({ status: 'live' }), [], referenceNow), false)
    assert.equal(isShiftOpenForRegistration(makeShift({ status: 'paused' }), [], referenceNow), false)
  })

  await t.test('shift is NOT open when all required roles are filled', () => {
    const s = makeShift({
      required_host_count: 1,
      required_support_count: 0,
      required_technical_count: 0,
    })
    const filledRegs = [
      makeRegistration({
        id: 'reg-approved-1',
        operational_role: 'host',
        status: 'approved',
      }),
    ]
    assert.equal(isShiftOpenForRegistration(s, filledRegs, referenceNow), false)
  })

  await t.test('role-scoped filtering checks vacancy specifically for target roles', () => {
    const s = makeShift({
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
    })
    const hostFilledRegs = [
      makeRegistration({
        id: 'reg-approved-1',
        operational_role: 'host',
        status: 'approved',
      }),
    ]
    // Host is filled, support is still vacant
    assert.equal(isShiftOpenForRegistration(s, hostFilledRegs, referenceNow, ['host']), false, 'Host should be closed')
    assert.equal(isShiftOpenForRegistration(s, hostFilledRegs, referenceNow, ['support']), true, 'Support should be open')
    assert.equal(isShiftOpenForRegistration(s, hostFilledRegs, referenceNow), true, 'Unscoped should be open')
  })

  await t.test('isShiftClosed properly detects closed state', () => {
    assert.equal(isShiftClosed(makeShift({ registration_locked: true }), referenceNow), true)
    assert.equal(isShiftClosed(makeShift({ status: 'cancelled' }), referenceNow), true)
    assert.equal(isShiftClosed(makeShift({ status: 'completed' }), referenceNow), true)
    assert.equal(isShiftClosed(makeShift({ status: 'preparing' }), referenceNow), true)
    assert.equal(isShiftClosed(makeShift({ status: 'scheduled', registration_locked: false }), referenceNow), false)
  })
})

test('RC19 Shift Ops: Real Open Shifts Read Path (Finding 1)', async (t) => {
  await t.test('shiftService.getRegistrationPage("open") invokes correct read path and applies role filtering before pagination', async () => {
    const uniqueBrandId = 'brand-readpath-test'
    const openHostShift = await shiftService.create(makeShift({
      id: 'shift-open-host-1',
      brand_id: uniqueBrandId,
      date: '2026-12-01',
      required_host_count: 1,
      required_support_count: 0,
      registration_locked: false,
      status: 'scheduled',
      end_at: '2026-12-01T23:59:59.000Z',
    }))

    const openSupportShift = await shiftService.create(makeShift({
      id: 'shift-open-supp-1',
      brand_id: uniqueBrandId,
      date: '2026-12-01',
      required_host_count: 0,
      required_support_count: 1,
      registration_locked: false,
      status: 'scheduled',
      end_at: '2026-12-01T23:59:59.000Z',
    }))

    // Query for host roles
    const hostPage = await shiftService.getRegistrationPage('open', {
      page: 1,
      pageSize: 50,
      filters: { brands: [uniqueBrandId], roles: ['host'] },
    })
    assert.ok(hostPage.items.some(s => s.id === openHostShift.id), 'Host shift should be returned')
    assert.ok(!hostPage.items.some(s => s.id === openSupportShift.id), 'Support-only shift should NOT be returned for host filter')

    // Query for support roles
    const supportPage = await shiftService.getRegistrationPage('open', {
      page: 1,
      pageSize: 50,
      filters: { brands: [uniqueBrandId], roles: ['support'] },
    })
    assert.ok(supportPage.items.some(s => s.id === openSupportShift.id), 'Support shift should be returned')
    assert.ok(!supportPage.items.some(s => s.id === openHostShift.id), 'Host-only shift should NOT be returned for support filter')
  })
})

test('RC19 Shift Ops: Self-Cancellation vs Manager Removal Rules (Finding 3)', async (t) => {
  const referenceNow = new Date('2026-09-15T00:00:00.000Z')
  const validScheduledShift = makeShift({
    status: 'scheduled',
    registration_locked: false,
    end_at: '2026-09-20T05:00:00.000Z',
  })

  await t.test('canSelfCancelRegistration allows self_registration in pending or approved status on open scheduled shift', () => {
    const regPending = makeRegistration({ source: 'self_registration', status: 'pending' })
    const regApproved = makeRegistration({ source: 'self_registration', status: 'approved' })
    assert.equal(canSelfCancelRegistration(regPending, validScheduledShift, referenceNow), true)
    assert.equal(canSelfCancelRegistration(regApproved, validScheduledShift, referenceNow), true)
  })

  await t.test('canSelfCancelRegistration BLOCKS manual assignees from self-cancelling (Requires Manager Removal)', () => {
    const regManualSource = makeRegistration({ source: 'manual_assignment', status: 'approved' })
    const regManualStatus = makeRegistration({ source: 'self_registration', status: 'manually_assigned' })
    assert.equal(canSelfCancelRegistration(regManualSource, validScheduledShift, referenceNow), false, 'source manual_assignment must be blocked')
    assert.equal(canSelfCancelRegistration(regManualStatus, validScheduledShift, referenceNow), false, 'status manually_assigned must be blocked')
  })

  await t.test('canSelfCancelRegistration BLOCKS cancellation when shift is locked, non-scheduled, or past cutoff/end', () => {
    const reg = makeRegistration({ source: 'self_registration', status: 'pending' })
    assert.equal(canSelfCancelRegistration(reg, makeShift({ registration_locked: true }), referenceNow), false, 'Locked shift must block self-cancel')
    assert.equal(canSelfCancelRegistration(reg, makeShift({ status: 'completed' }), referenceNow), false, 'Completed shift must block self-cancel')
    assert.equal(canSelfCancelRegistration(reg, makeShift({ status: 'preparing' }), referenceNow), false, 'Preparing shift must block self-cancel')
    assert.equal(canSelfCancelRegistration(reg, makeShift({ registration_cutoff_at: '2026-09-14T00:00:00.000Z' }), referenceNow), false, 'Past cutoff must block self-cancel')
    assert.equal(canSelfCancelRegistration(reg, makeShift({ end_at: '2026-09-14T00:00:00.000Z' }), referenceNow), false, 'Past end_at must block self-cancel')
  })
})

test('RC19 Shift Ops: Registration Error Formatting', async (t) => {
  await t.test('formats known server/postgres error codes into friendly Vietnamese', () => {
    assert.match(formatRegistrationErrorMessage('REGISTRATION_CLOSED'), /đã đóng đăng ký/)
    assert.match(formatRegistrationErrorMessage('SHIFT_CAPACITY_EXCEEDED'), /đã đủ.*người|đã đủ số lượng người/)
    assert.match(formatRegistrationErrorMessage('REGISTRATION_CONFLICT'), /trùng lịch|cùng khoảng thời gian/)
    assert.match(formatRegistrationErrorMessage('ROLE_NOT_ELIGIBLE'), /không có vai trò|chưa được cấp quyền/)
    assert.match(formatRegistrationErrorMessage('ALREADY_REGISTERED'), /đã đăng ký/)
    assert.match(formatRegistrationErrorMessage('Không thể đăng ký: double registration'), /đã đăng ký/)
  })

  await t.test('preserves readable general error message', () => {
    assert.equal(formatRegistrationErrorMessage('Lỗi hệ thống không xác định'), 'Lỗi hệ thống không xác định')
  })
})

test('RC19 Shift Ops: Overnight Shifts Calendar Visibility', async (t) => {
  const overnightShift: Shift = makeShift({
    id: 'shift-overnight-1',
    title: 'Ca Đêm Xuyên Ngày',
    date: '2026-09-15',
    start_time: '23:00',
    end_date: '2026-09-16',
    end_time: '02:00',
    crosses_midnight: true,
  })

  await t.test('shiftsForCalendarDate includes overnight shift on start date (2026-09-15)', () => {
    const results = shiftsForCalendarDate([overnightShift], '2026-09-15')
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'shift-overnight-1')
  })

  await t.test('shiftsForCalendarDate includes overnight shift on the following date (2026-09-16)', () => {
    const results = shiftsForCalendarDate([overnightShift], '2026-09-16')
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 'shift-overnight-1')
  })

  await t.test('shiftsForCalendarDate does NOT include overnight shift on Day + 2 (2026-09-17)', () => {
    const results = shiftsForCalendarDate([overnightShift], '2026-09-17')
    assert.equal(results.length, 0)
  })

  await t.test('dataService.getByDate and getByDateRange include overnight shift spanning into date', async () => {
    const createdOvernight = await shiftService.create(overnightShift)

    const day2Shifts = await shiftService.getByDate('2026-09-16')
    assert.ok(day2Shifts.some(s => s.id === createdOvernight.id), 'Overnight shift should be returned for 2026-09-16')

    const rangeShifts = await shiftService.getByDateRange('2026-09-16', '2026-09-17')
    assert.ok(rangeShifts.some(s => s.id === createdOvernight.id), 'Overnight shift should be returned in date range')
  })
})

test('RC19 Shift Ops: Registration, Cancellation, and Staff Assignment Removal with Lock Emulation', async (t) => {
  const testShift = makeShift({
    id: 'shift-registration-flow-r2',
    title: 'Ca Test Đăng ký & Gỡ R2',
    date: '2026-11-25',
    start_time: '14:00',
    end_time: '17:00',
    start_at: '2026-11-25T07:00:00.000Z',
    end_at: '2026-11-25T10:00:00.000Z',
    registration_cutoff_at: '2026-11-25T06:00:00.000Z',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 0,
    registration_locked: false,
    version: 1,
  })

  const createdTestShift = await shiftService.create(testShift)

  const user1Id = '3'
  const user2Id = '5'

  await t.test('user can register for an open role successfully', async () => {
    const reg = await shiftRegistrationService.register(createdTestShift.id, user1Id, 'host')
    assert.equal(reg.user_id, user1Id)
    assert.equal(reg.operational_role, 'host')
    assert.equal(reg.status, 'pending')
  })

  await t.test('prevent double registration for the same user on the same shift', async () => {
    await assert.rejects(
      async () => {
        await shiftRegistrationService.register(createdTestShift.id, user1Id, 'host')
      },
      /ALREADY_REGISTERED|already has this role|đã đăng ký/i
    )
  })

  await t.test('cancelling registration sets status to cancelled and frees slot', async () => {
    const registrations = await shiftRegistrationService.getForShift(createdTestShift.id)
    const user1Reg = registrations.find(r => r.user_id === user1Id && r.status === 'pending')
    assert.ok(user1Reg, 'Registration should exist')

    const cancelled = await shiftRegistrationService.cancel(user1Reg.id, user1Id, undefined, user1Reg.version ?? 1)
    assert.equal(cancelled.status, 'cancelled')

    const reReg = await shiftRegistrationService.register(createdTestShift.id, user1Id, 'host')
    assert.equal(reReg.status, 'pending')
  })

  await t.test('manual assignment removal restores registration vacancy and correctly emulates lock refresh', async () => {
    // Approve user1 as host
    const regs = await shiftRegistrationService.getForShift(createdTestShift.id)
    const activeReg = regs.find(r => r.user_id === user1Id && r.status === 'pending')!
    await shiftRegistrationService.approve(activeReg.id, '1', 'Approved host', activeReg.version)

    // Assign user2 as support
    const currentShift = (await shiftService.getById(createdTestShift.id))!
    const assigned2 = await shiftRegistrationService.assignManually(
      createdTestShift.id,
      user2Id,
      'support',
      '1',
      currentShift.version
    )
    assert.equal(assigned2.status, 'manually_assigned')

    // Lock the shift as it is fully staffed
    await shiftService.lock(createdTestShift.id, '1', (await shiftService.getById(createdTestShift.id))!.version)
    const lockedShift = (await shiftService.getById(createdTestShift.id))!
    assert.equal(lockedShift.registration_locked, true, 'Shift should be locked when fully staffed')

    // Now remove user2 assignment via removeAssignment
    const removed = await shiftRegistrationService.removeAssignment(
      assigned2.id,
      '1',
      'User requested sick leave',
      assigned2.version
    )
    assert.equal(removed.status, 'removed')

    // Emulated refresh_shift_registration_lock unlocks the shift because it became understaffed!
    const reloadedShift = (await shiftService.getById(createdTestShift.id))!
    assert.equal(reloadedShift.registration_locked, false, 'Shift should be unlocked because support is now understaffed')

    // Shift should now be open again in getRegistrationPage('open')
    const openPageAfterRemoval = await shiftService.getRegistrationPage('open', { page: 1, pageSize: 50 })
    assert.ok(openPageAfterRemoval.items.some(s => s.id === createdTestShift.id), 'Shift should be open again after assignment removal')
  })
})

test('RC19 Shift Ops: Daily Shift Operational Notes Durability (Finding 4)', async (t) => {
  const shiftId = 'shift-notes-durability-test'

  await t.test('creates operational note with full durable fields: business_date, actual_event_time, version', async () => {
    const note = await shiftNoteService.create({
      shift_id: shiftId,
      business_date: '2026-11-20',
      author_id: 'leader-1',
      author_name: 'Leader Test',
      category: 'incident',
      note: 'Mất kết nối OBS trong 2 phút do mạng chập chờn.',
      actual_event_time: '2026-11-20T08:15:00.000Z',
    })

    assert.equal(note.shift_id, shiftId)
    assert.equal(note.business_date, '2026-11-20')
    assert.equal(note.category, 'incident')
    assert.equal(note.author_name, 'Leader Test')
    assert.equal(note.note, 'Mất kết nối OBS trong 2 phút do mạng chập chờn.')
    assert.equal(note.actual_event_time, '2026-11-20T08:15:00.000Z')
    assert.equal(note.version, 1)
    assert.ok(note.created_at)
  })

  await t.test('rejects empty or whitespace note', async () => {
    await assert.rejects(
      async () => {
        await shiftNoteService.create({
          shift_id: shiftId,
          author_id: 'leader-1',
          author_name: 'Leader Test',
          category: 'normal',
          note: '   ',
        })
      },
      /NOTE_EMPTY/
    )
  })

  await t.test('retrieves notes for shift in chronological order', async () => {
    await shiftNoteService.create({
      shift_id: shiftId,
      business_date: '2026-11-20',
      author_id: 'staff-1',
      author_name: 'Host Test',
      category: 'sales',
      note: 'Cháy hàng SKU Áo thun đen sau 15 phút.',
      actual_event_time: '2026-11-20T09:00:00.000Z',
    })

    const notes = await shiftNoteService.getForShift(shiftId)
    assert.equal(notes.length, 2)
    assert.equal(notes[0].category, 'sales')
    assert.equal(notes[1].category, 'incident')
  })

  await t.test('instantiates ShiftNoteServiceError with schema-not-deployed code and validates user fixture', () => {
    const err = new ShiftNoteServiceError('Relation missing', 'SCHEMA_NOT_DEPLOYED')
    assert.equal(err.name, 'ShiftNoteServiceError')
    assert.equal(err.code, 'SCHEMA_NOT_DEPLOYED')
    assert.equal(err.message, 'Relation missing')

    const user = makeUser({ id: 'user-ops-fixture' })
    assert.equal(user.id, 'user-ops-fixture')
    assert.equal(user.role, 'staff')
  })
})
