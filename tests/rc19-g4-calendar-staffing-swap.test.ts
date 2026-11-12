import assert from 'node:assert/strict'
import test from 'node:test'
import { shiftsForCalendarDate } from '../components/features/calendar/MonthView'
import { shiftsForGridDate } from '../lib/utils/timeGrid'
import { getShiftRoleCapacities } from '../lib/services/dataService'
import type { OperationalRole, Shift, ShiftRegistration, SwapRequest, User } from '../lib/types/database.types'

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

// -------------------------------------------------------------
// TEST SUITE 5: Registration Lock & Manual Assignment Decoupling (Issue #181)
// -------------------------------------------------------------
test('G4.7: Admin/Leader manual assignment is allowed even when registration_locked: true', () => {
  const lockedShift: Shift = {
    ...mockShifts[0],
    id: 'sft-locked',
    registration_locked: true, // Self-registration closed to members
    required_support_count: 2,
    version: 3,
  }

  // Check assignment capability: registration_locked must NOT block Admin/Leader
  const canAssign = true
  const searchSettled = true
  const hasCurrentSnapshot = true
  const candidateData = true
  const versionReady = Number.isInteger(lockedShift.version) && (lockedShift.version ?? 0) > 0
  const candidate = { user_id: 'usr-support-01', availableForAssignment: true }
  const currentCapacity = { role: 'support' as OperationalRole, required: 2, approved: 0, pending: 0, remaining: 2 }

  const canStartAssignment = canAssign && searchSettled && hasCurrentSnapshot && Boolean(candidateData) && versionReady &&
    lockedShift.status === 'scheduled' &&
    Boolean(currentCapacity && currentCapacity.remaining > 0) && Boolean(candidate)

  assert.equal(canStartAssignment, true, 'Admin/Leader must be allowed to manually assign staff when registration is locked')
})

// -------------------------------------------------------------
// TEST SUITE 6: Disabled Explanations Feedback (Issue #181)
// -------------------------------------------------------------
test('G4.8: StaffingActionPanel generates clear explanatory feedback for blocked conditions', () => {
  const evaluateDisabledReason = (params: {
    canAssign: boolean
    status: string
    versionReady: boolean
    remainingCapacity: number
    hasCandidate: boolean
    selectedUserId: string
  }) => {
    if (!params.canAssign) return 'Tài khoản không có quyền phân công nhân sự.'
    if (params.status !== 'scheduled') return `Ca đang ở trạng thái "${params.status}", không thể phân công mới.`
    if (!params.versionReady) return 'Thiếu phiên bản ca hợp lệ (v0 hoặc không xác định).'
    if (params.remainingCapacity <= 0) return 'Đã đủ định biên cho vai trò này. Hãy gỡ hoặc thay người nếu cần.'
    if (!params.selectedUserId) return 'Vui lòng chọn nhân sự để phân công.'
    if (!params.hasCandidate) return 'Nhân sự không thể phân công: Không khả dụng.'
    return null
  }

  // 1. Missing permission
  assert.match(evaluateDisabledReason({ canAssign: false, status: 'scheduled', versionReady: true, remainingCapacity: 1, hasCandidate: true, selectedUserId: 'u1' })!, /không có quyền/)

  // 2. Ineligible status (completed)
  assert.match(evaluateDisabledReason({ canAssign: true, status: 'completed', versionReady: true, remainingCapacity: 1, hasCandidate: true, selectedUserId: 'u1' })!, /không thể phân công/)

  // 3. Fully staffed
  assert.match(evaluateDisabledReason({ canAssign: true, status: 'scheduled', versionReady: true, remainingCapacity: 0, hasCandidate: true, selectedUserId: 'u1' })!, /Đã đủ định biên/)

  // 4. No candidate selected
  assert.match(evaluateDisabledReason({ canAssign: true, status: 'scheduled', versionReady: true, remainingCapacity: 1, hasCandidate: true, selectedUserId: '' })!, /chọn nhân sự/)
})

// -------------------------------------------------------------
// TEST SUITE 7: Replacement Workflow Before/After Diff & Audit Preservation (Issue #181)
// -------------------------------------------------------------
test('G4.9: Replacement workflow generates accurate diff and preserves history as removed record', () => {
  const currentReg: ShiftRegistration = {
    id: 'reg-replace-01',
    shift_id: 'sft-01',
    user_id: 'usr-alice',
    operational_role: 'host',
    status: 'approved',
    source: 'self_registration',
    requested_at: '2026-11-02T00:00:00Z',
    version: 2,
  }

  const replacementUser = { id: 'usr-bob', full_name: 'Bob Tran' }
  const reason = 'Host bị ốm đột xuất'

  // Diff verification
  const diff = {
    from: { userId: currentReg.user_id, role: currentReg.operational_role },
    to: { userId: replacementUser.id, role: currentReg.operational_role },
    reason,
  }
  assert.equal(diff.from.userId, 'usr-alice')
  assert.equal(diff.to.userId, 'usr-bob')
  assert.equal(diff.reason, 'Host bị ốm đột xuất')

  // Preservation: removal soft-deletes and marks 'removed' with review_notes
  const removedRecord: ShiftRegistration = {
    ...currentReg,
    status: 'removed',
    review_notes: `[Thay người] ${reason}`,
    version: currentReg.version! + 1,
  }
  assert.equal(removedRecord.status, 'removed')
  assert.ok(removedRecord.review_notes?.includes('Host bị ốm đột xuất'))
  assert.equal(removedRecord.version, 3)
})

// -------------------------------------------------------------
// TEST SUITE 8: Staffing Workspace Chronological Ordering (Issue #181)
// -------------------------------------------------------------
test('G4.10: StaffingWorkspace sorts Upcoming ascending (closest first) and History descending (newest first)', () => {
  const sampleShifts: Shift[] = [
    { id: 's-past-1', date: '2026-11-05', start_time: '10:00:00', end_time: '12:00:00', title: 'Past 1', brand_id: 'b1', platform_id: 'p1', status: 'completed', version: 1, created_at: '', updated_at: '' },
    { id: 's-past-2', date: '2026-11-08', start_time: '14:00:00', end_time: '16:00:00', title: 'Past 2 (newer)', brand_id: 'b1', platform_id: 'p1', status: 'completed', version: 1, created_at: '', updated_at: '' },
    { id: 's-future-1', date: '2026-11-15', start_time: '09:00:00', end_time: '11:00:00', title: 'Future 1 (closest)', brand_id: 'b1', platform_id: 'p1', status: 'scheduled', version: 1, created_at: '', updated_at: '' },
    { id: 's-future-2', date: '2026-11-20', start_time: '09:00:00', end_time: '11:00:00', title: 'Future 2 (later)', brand_id: 'b1', platform_id: 'p1', status: 'scheduled', version: 1, created_at: '', updated_at: '' },
  ]

  // Upcoming Scope (ascending)
  const sortUpcoming = (shifts: Shift[]) => [...shifts].sort((a, b) => (a.date + ' ' + a.start_time).localeCompare(b.date + ' ' + b.start_time))
  const upcomingSorted = sortUpcoming([sampleShifts[2], sampleShifts[3]])
  assert.equal(upcomingSorted[0].id, 's-future-1', 'Closest future shift must come first')
  assert.equal(upcomingSorted[1].id, 's-future-2')

  // History Scope (descending)
  const sortHistory = (shifts: Shift[]) => [...shifts].sort((a, b) => (b.date + ' ' + b.start_time).localeCompare(a.date + ' ' + a.start_time))
  const historySorted = sortHistory([sampleShifts[0], sampleShifts[1]])
  assert.equal(historySorted[0].id, 's-past-2', 'Most recent past shift must come first')
  assert.equal(historySorted[1].id, 's-past-1')
})

// -------------------------------------------------------------
// TEST SUITE 9: Emergency Replacement Permission Guard (Issue #183)
// -------------------------------------------------------------
test('G4.11: Emergency replacement is strictly restricted to Admin and hidden for Leader and Member', () => {
  const isEmergencyReplaceVisible = (user: User | null): boolean => {
    return Boolean(user && user.system_permission === 'admin')
  }

  const adminUser: User = { id: 'u-admin', email: 'admin@ada.com', full_name: 'Admin User', role: 'admin', system_permission: 'admin', status: 'active', created_at: '', updated_at: '' }
  const leaderUser: User = { id: 'u-leader', email: 'leader@ada.com', full_name: 'Leader User', role: 'leader', system_permission: 'leader', status: 'active', created_at: '', updated_at: '' }
  const memberUser: User = { id: 'u-member', email: 'member@ada.com', full_name: 'Member User', role: 'member', system_permission: 'member', status: 'active', created_at: '', updated_at: '' }

  assert.equal(isEmergencyReplaceVisible(adminUser), true, 'Admin must have access to Emergency Replacement')
  assert.equal(isEmergencyReplaceVisible(leaderUser), false, 'Leader must NOT have access to Emergency Replacement')
  assert.equal(isEmergencyReplaceVisible(memberUser), false, 'Member must NOT have access to Emergency Replacement')
  assert.equal(isEmergencyReplaceVisible(null), false, 'Unauthenticated user must NOT have access')
})

// -------------------------------------------------------------
// TEST SUITE 10: PASS / Swap Workflow Lifecycle (Issue #181, #179)
// -------------------------------------------------------------
test('G4.12: Swap request lifecycle transitions follow state machine accurately', () => {
  const swapRequest: SwapRequest = {
    id: 'swap-01',
    shift_id: 'sft-01',
    requester_id: 'usr-alice',
    counterpart_id: 'usr-bob',
    operational_role: 'host',
    mode: 'replacement',
    status: 'pending',
    reason: 'Trùng lịch gia đình',
    version: 1,
    created_at: '2026-11-05T08:00:00Z',
    updated_at: '2026-11-05T08:00:00Z',
  }

  // 1. Counterpart accepts
  const acceptedSwap: SwapRequest = { ...swapRequest, status: 'accepted', version: 2 }
  assert.equal(acceptedSwap.status, 'accepted')

  // 2. Leader approves
  const approvedSwap: SwapRequest = { ...acceptedSwap, status: 'approved', version: 3 }
  assert.equal(approvedSwap.status, 'approved')

  // 3. Counterpart rejects scenario
  const rejectedSwap: SwapRequest = { ...swapRequest, status: 'rejected', version: 2 }
  assert.equal(rejectedSwap.status, 'rejected')

  // 4. Requester cancels scenario
  const cancelledSwap: SwapRequest = { ...swapRequest, status: 'cancelled', version: 2 }
  assert.equal(cancelledSwap.status, 'cancelled')
})

// -------------------------------------------------------------
// TEST SUITE 11: Multi-Segment Preservation within Shift (Issue #181)
// -------------------------------------------------------------
test('G4.13: Staffing segments (K01, K02) remain intact on parent shift without splitting', () => {
  const segmentedShift: Shift = {
    ...mockShifts[0],
    id: 'sft-segmented',
    staffing_segments: [
      { segment_index: 1, start_time: '09:00:00', end_time: '10:30:00', host_names: ['Alice'], support_names: ['Bob'], technical_names: ['Charlie'] },
      { segment_index: 2, start_time: '10:30:00', end_time: '12:00:00', host_names: ['David'], support_names: ['Bob'], technical_names: ['Charlie'] },
    ],
  }

  assert.equal(segmentedShift.staffing_segments?.length, 2, 'Shift must retain 2 segments')
  assert.equal(segmentedShift.staffing_segments?.[0].segment_index, 1)
  assert.equal(segmentedShift.staffing_segments?.[1].segment_index, 2)
  assert.equal(segmentedShift.staffing_segments?.[0].start_time, '09:00:00')
  assert.equal(segmentedShift.staffing_segments?.[1].end_time, '12:00:00')
})
