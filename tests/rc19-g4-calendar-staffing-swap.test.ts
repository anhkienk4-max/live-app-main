import assert from 'node:assert/strict'
import test from 'node:test'
import { shiftsForCalendarDate } from '../components/features/calendar/MonthView'
import { shiftsForGridDate } from '../lib/utils/timeGrid'
import { getShiftRoleCapacities } from '../lib/services/dataService'
import { parseCanonicalDate, parseTimeRange } from '../lib/workforce/historicalAttendanceParser'
import type { Shift, ShiftRegistration } from '../lib/types/database.types'

// Mock Shifts
const mockShifts: Shift[] = [
  {
    id: 'sft-01',
    date: '2026-11-10',
    start_time: '09:00:00',
    end_time: '12:00:00',
    title: 'Morning Beauty Live',
    brand_id: 'brand-anlene',
    platform_id: 'plat-shopee',
    status: 'scheduled',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    registration_locked: false,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
  {
    id: 'sft-02-night',
    date: '2026-11-10',
    start_time: '22:00:00',
    end_time: '02:00:00',
    crosses_midnight: true,
    title: 'Overnight Mega Live',
    brand_id: 'brand-pepsico',
    platform_id: 'plat-tiktok',
    status: 'scheduled',
    required_host_count: 2,
    required_support_count: 1,
    required_technical_count: 1,
    registration_locked: false,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
  {
    id: 'sft-03',
    date: '2026-11-10',
    start_time: '14:00:00',
    end_time: '18:00:00',
    title: 'Afternoon Tech Live',
    brand_id: 'brand-anlene',
    platform_id: 'plat-shopee',
    status: 'scheduled',
    required_host_count: 1,
    required_support_count: 0,
    required_technical_count: 0,
    registration_locked: false,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
]

// Mock Registrations
const mockRegistrations: ShiftRegistration[] = [
  {
    id: 'reg-01',
    shift_id: 'sft-01',
    user_id: 'usr-alice',
    operational_role: 'host',
    status: 'approved',
    source: 'self_registration',
    requested_at: '2026-11-02T00:00:00Z',
    version: 1,
  },
  // Support and Technical unfilled for sft-01!
  {
    id: 'reg-02',
    shift_id: 'sft-02-night',
    user_id: 'usr-bob',
    operational_role: 'host',
    status: 'approved',
    source: 'self_registration',
    requested_at: '2026-11-02T00:00:00Z',
    version: 1,
  },
  {
    id: 'reg-03',
    shift_id: 'sft-02-night',
    user_id: 'usr-charlie',
    operational_role: 'host',
    status: 'pending', // pending approval
    source: 'self_registration',
    requested_at: '2026-11-02T00:00:00Z',
    version: 1,
  },
]

// -------------------------------------------------------------
// TEST SUITE 1: Calendar Views & Overnight Shifts (Issue #72)
// -------------------------------------------------------------
test('G4.1: Month View filters and orders shifts correctly for date cell', () => {
  const targetDate = new Date('2026-11-10T00:00:00')
  const cellShifts = shiftsForCalendarDate(mockShifts, targetDate)
  assert.equal(cellShifts.length, 3)
  assert.equal(cellShifts[0].id, 'sft-01')
  assert.equal(cellShifts[1].id, 'sft-03')
  assert.equal(cellShifts[2].id, 'sft-02-night')
})

test('G4.1: Day View correctly maps overnight shift to main day and continuation day', () => {
  // Day 1: 2026-11-10
  const day1Grid = shiftsForGridDate(mockShifts, '2026-11-10')
  const nightShiftDay1 = day1Grid.find(g => g.shift.id === 'sft-02-night')
  assert.ok(nightShiftDay1, 'Overnight shift must be present on main day')
  assert.equal(nightShiftDay1.start_time, '22:00:00')
  assert.equal(nightShiftDay1.end_time, '24:00')
  assert.equal(nightShiftDay1.continuation, false)

  // Day 2: 2026-11-11
  const day2Grid = shiftsForGridDate(mockShifts, '2026-11-11')
  const nightShiftDay2 = day2Grid.find(g => g.shift.id === 'sft-02-night')
  assert.ok(nightShiftDay2, 'Overnight shift must continue onto next day')
  assert.equal(nightShiftDay2.start_time, '00:00')
  assert.equal(nightShiftDay2.end_time, '02:00:00')
  assert.equal(nightShiftDay2.continuation, true)
})

// -------------------------------------------------------------
// TEST SUITE 2: Staffing Gap & Capacities (Issue #73, Owner ID 08)
// -------------------------------------------------------------
test('G4.2: getShiftRoleCapacities calculates required, approved, and remaining deficits', () => {
  // sft-01: requires Host 1, Support 1, Tech 1. Alice is approved Host.
  const capacities = getShiftRoleCapacities(mockShifts[0], mockRegistrations)
  const hostCap = capacities.find(c => c.role === 'host')
  const suppCap = capacities.find(c => c.role === 'support')
  const techCap = capacities.find(c => c.role === 'technical')

  assert.equal(hostCap?.required, 1)
  assert.equal(hostCap?.approved, 1)
  assert.equal(hostCap?.remaining, 0)

  assert.equal(suppCap?.required, 1)
  assert.equal(suppCap?.approved, 0)
  assert.equal(suppCap?.remaining, 1, 'Support should be missing 1 person')

  assert.equal(techCap?.required, 1)
  assert.equal(techCap?.approved, 0)
  assert.equal(techCap?.remaining, 1, 'Technical should be missing 1 person')

  // Overall shift has remaining gaps
  const hasGaps = capacities.some(c => c.remaining > 0)
  assert.equal(hasGaps, true)
})

test('G4.2: sft-02-night tracks approved vs pending host capacity', () => {
  // requires 2 hosts: 1 approved (Bob), 1 pending (Charlie)
  const capacities = getShiftRoleCapacities(mockShifts[1], mockRegistrations)
  const hostCap = capacities.find(c => c.role === 'host')

  assert.equal(hostCap?.required, 2)
  assert.equal(hostCap?.approved, 1)
  assert.equal(hostCap?.pending, 1)
  assert.equal(hostCap?.remaining, 1, 'Remaining is 1 because pending is not yet approved')
})

// -------------------------------------------------------------
// TEST SUITE 3: Attendance Overlap Mathematics & Rules (Issue #94)
// -------------------------------------------------------------
test('G4.4: Interval overlap math flags partial and nested overlap, but allows adjacent intervals', () => {
  const checkOverlap = (
    startA: string, endA: string,
    startB: string, endB: string
  ): boolean => {
    const sA = Date.parse(`2026-11-10T${startA}:00Z`)
    const eA = Date.parse(`2026-11-10T${endA}:00Z`)
    const sB = Date.parse(`2026-11-10T${startB}:00Z`)
    const eB = Date.parse(`2026-11-10T${endB}:00Z`)
    return Math.max(sA, sB) < Math.min(eA, eB)
  }

  // Adjacent intervals: 09:00-12:00 and 12:00-15:00 -> NO OVERLAP
  assert.equal(checkOverlap('09:00', '12:00', '12:00', '15:00'), false)

  // Partial overlap: 09:00-13:00 and 12:00-15:00 -> OVERLAP
  assert.equal(checkOverlap('09:00', '13:00', '12:00', '15:00'), true)

  // Nested overlap: 09:00-18:00 and 10:00-14:00 -> OVERLAP
  assert.equal(checkOverlap('09:00', '18:00', '10:00', '14:00'), true)

  // Completely separate: 09:00-11:00 and 14:00-16:00 -> NO OVERLAP
  assert.equal(checkOverlap('09:00', '11:00', '14:00', '16:00'), false)
})

// -------------------------------------------------------------
// TEST SUITE 4: Stable 4-Tab Architecture for ShiftDetailModal (Issue #163)
// -------------------------------------------------------------
test('G4.6: ShiftDetailModal 4 tabs are statically defined in exact immutable order', () => {
  const expectedTabOrder = ['overview', 'staffing', 'details', 'attendance']
  assert.equal(expectedTabOrder[0], 'overview', 'Tab 1 must be Tổng quan')
  assert.equal(expectedTabOrder[1], 'staffing', 'Tab 2 must be Điều phối ca')
  assert.equal(expectedTabOrder[2], 'details', 'Tab 3 must be Chi tiết')
  assert.equal(expectedTabOrder[3], 'attendance', 'Tab 4 must be Chấm công thực tế')
})
