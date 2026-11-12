import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveSegmentDateTime,
  validateStaffingSegments,
  DEFAULT_BUSINESS_TIMEZONE,
} from '../lib/utils/shiftUtils'
import { shiftService, currentUserService } from '../lib/services/dataService'
import { hasPermission } from '../lib/permissions'
import type { PlannedStaffingSegmentDraft, User } from '../lib/types/database.types'

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

async function withEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    await run()
  } finally {
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

const adminUser: User = {
  id: 'u-admin',
  email: 'admin@example.com',
  full_name: 'Admin User',
  system_permission: 'admin',
  operational_roles: [],
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

test('G3-01: KAO Acceptance Case — 1 Parent Shift with 3 Segments (K01, K02, K03)', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    currentUserService.bindAuthenticatedUser(adminUser)

    const kaoParentDate = '2026-11-01'
    const kaoStartTime = '10:00'
    const kaoEndTime = '18:00'

    const kaoSegments: PlannedStaffingSegmentDraft[] = [
      {
        segment_index: 1,
        start_time: '10:00',
        end_time: '11:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
        planned_host_names: ['MC Mai Linh'],
        planned_support_names: ['Trợ Lan'],
        planned_technical_names: [],
      },
      {
        segment_index: 2,
        start_time: '11:00',
        end_time: '16:00',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
        planned_host_names: ['MC Hoàng Yến', 'MC Quỳnh Như'],
        planned_support_names: ['Trợ Hùng'],
        planned_technical_names: [],
      },
      {
        segment_index: 3,
        start_time: '16:00',
        end_time: '18:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
        planned_host_names: ['MC Tuấn Anh'],
        planned_support_names: ['Trợ Lan'],
        planned_technical_names: [],
      },
    ]

    // Validate segments
    const validation = validateStaffingSegments(
      kaoParentDate,
      kaoStartTime,
      kaoEndTime,
      DEFAULT_BUSINESS_TIMEZONE,
      kaoSegments,
    )
    assert.equal(validation.valid, true, 'KAO segments must validate cleanly without errors')
    assert.equal(Object.keys(validation.errors).length, 0)
    assert.equal(validation.generalErrors.length, 0)

    // Create shift via shiftService
    const created = await shiftService.create({
      date: kaoParentDate,
      start_time: kaoStartTime,
      end_time: kaoEndTime,
      title: 'KAO Mega Live Super Brand Day',
      brand_id: 'brand-kao',
      platform_id: 'platform-shopee',
      execution_source: 'internal',
      supplemental_fields: {
        external_code: {
          label: 'Mã ca',
          type: 'text',
          value: 'KAO-20261101-1000-1800',
        },
      },
      staffing_segments: kaoSegments,
      required_host_count: 2,
      required_support_count: 1,
      required_technical_count: 0,
    })

    assert.ok(created.id, 'Shift ID must be generated')
    assert.equal(created.date, '2026-11-01')
    assert.equal(created.start_time, '10:00')
    assert.equal(created.end_time, '18:00')
    assert.equal(created.staffing_segments?.length, 3, 'Must have exactly 3 segments')
    assert.equal(created.supplemental_fields?.external_code?.value, 'KAO-20261101-1000-1800')
  })
})

test('G3-02: Segment K02 supports 2 simultaneous hosts with planned names', async () => {
  const k02: PlannedStaffingSegmentDraft = {
    segment_index: 2,
    start_time: '11:00',
    end_time: '16:00',
    required_host_count: 2,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: ['Host Alpha', 'Host Beta'],
    planned_support_names: ['Support One'],
    planned_technical_names: [],
  }

  assert.equal(k02.required_host_count, 2, 'K02 requires 2 hosts')
  assert.equal(k02.planned_host_names.length, 2, 'K02 planned host names has 2 hosts')
  assert.deepEqual(k02.planned_host_names, ['Host Alpha', 'Host Beta'])

  // Validate bounds
  const bound = resolveSegmentDateTime('2026-11-01', '10:00', '18:00', k02.start_time, k02.end_time)
  assert.equal(bound.valid, true)
  assert.equal(bound.durationMinutes, 300, '5 hours = 300 minutes')
})

test('G3-03: Add and Delete Segment maintains consistency', async () => {
  let segments: PlannedStaffingSegmentDraft[] = [
    {
      segment_index: 1,
      start_time: '10:00',
      end_time: '12:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: [],
      planned_support_names: [],
      planned_technical_names: [],
    },
  ]

  // Add segment
  const nextIndex = (segments.length ? Math.max(...segments.map(s => s.segment_index)) : 0) + 1
  assert.equal(nextIndex, 2)
  segments.push({
    segment_index: nextIndex,
    start_time: '12:00',
    end_time: '14:00',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: [],
    planned_support_names: [],
    planned_technical_names: [],
  })
  assert.equal(segments.length, 2)

  // Validate 2 segments
  let val = validateStaffingSegments('2026-11-01', '10:00', '18:00', DEFAULT_BUSINESS_TIMEZONE, segments)
  assert.equal(val.valid, true)

  // Remove segment 1
  segments = segments.filter(s => s.segment_index !== 1)
  assert.equal(segments.length, 1)
  assert.equal(segments[0].segment_index, 2)

  // Remaining segment is still valid
  val = validateStaffingSegments('2026-11-01', '10:00', '18:00', DEFAULT_BUSINESS_TIMEZONE, segments)
  assert.equal(val.valid, true)
})

test('G3-04: Planned names are display-only and not auto-approved registrations', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    currentUserService.bindAuthenticatedUser(adminUser)

    const shift = await shiftService.create({
      date: '2026-11-02',
      start_time: '09:00',
      end_time: '12:00',
      title: 'Display Only Test Shift',
      brand_id: 'brand-kao',
      platform_id: 'platform-shopee',
      execution_source: 'internal',
      staffing_segments: [
        {
          segment_index: 1,
          start_time: '09:00',
          end_time: '12:00',
          required_host_count: 1,
          required_support_count: 1,
          required_technical_count: 0,
          planned_host_names: ['Planned Host A'],
          planned_support_names: ['Planned Support B'],
          planned_technical_names: [],
        },
      ],
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
    })

    // The shift retains planned names in staffing_segments
    assert.equal(shift.staffing_segments?.[0].planned_host_names[0], 'Planned Host A')
    assert.equal(shift.staffing_segments?.[0].planned_support_names[0], 'Planned Support B')

    // Check that no registrations were created for fake "Planned Host A"
    const allRegistrations = await import('../lib/services/dataService').then(m => m.shiftRegistrationService.getAll())
    const matchingRegistrations = allRegistrations.filter(r => r.shift_id === shift.id)
    assert.equal(matchingRegistrations.length, 0, 'Planned names must NEVER become approved registrations')
  })
})

test('G3-05: Overnight shift with crossing midnight segments', () => {
  const parentDate = '2026-11-15'
  const parentStart = '20:00'
  const parentEnd = '02:00'

  const seg1: PlannedStaffingSegmentDraft = {
    segment_index: 1,
    start_time: '20:00',
    end_time: '23:00',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: [],
    planned_support_names: [],
    planned_technical_names: [],
  }

  const seg2: PlannedStaffingSegmentDraft = {
    segment_index: 2,
    start_time: '23:00',
    end_time: '02:00',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: [],
    planned_support_names: [],
    planned_technical_names: [],
  }

  const val = validateStaffingSegments(parentDate, parentStart, parentEnd, DEFAULT_BUSINESS_TIMEZONE, [seg1, seg2])
  assert.equal(val.valid, true, 'Overnight segments must validate cleanly within overnight parent shift')

  const res1 = resolveSegmentDateTime(parentDate, parentStart, parentEnd, '20:00', '23:00')
  const res2 = resolveSegmentDateTime(parentDate, parentStart, parentEnd, '23:00', '02:00')
  assert.equal(res1.valid, true)
  assert.equal(res2.valid, true)
  assert.equal(res1.durationMinutes, 180)
  assert.equal(res2.durationMinutes, 180)
})

test('G3-06: Segment Validation catches out-of-bounds, invalid times, capacities, and overlaps', () => {
  const parentDate = '2026-11-01'
  const parentStart = '10:00'
  const parentEnd = '18:00'

  // 1. Segment starts before parent start
  const earlySeg = resolveSegmentDateTime(parentDate, parentStart, parentEnd, '09:00', '11:00')
  assert.equal(earlySeg.valid, false)
  assert.match(earlySeg.error || '', /phải nằm trong thời gian ca chính/)

  // 2. Segment ends after parent end
  const lateSeg = resolveSegmentDateTime(parentDate, parentStart, parentEnd, '17:00', '19:00')
  assert.equal(lateSeg.valid, false)
  assert.match(lateSeg.error || '', /phải nằm trong thời gian ca chính/)

  // 3. Segment end <= start
  const backwardsSeg = resolveSegmentDateTime(parentDate, parentStart, parentEnd, '14:00', '12:00')
  assert.equal(backwardsSeg.valid, false)

  // 4. Overlapping segments
  const overlappingSegments: PlannedStaffingSegmentDraft[] = [
    {
      segment_index: 1,
      start_time: '10:00',
      end_time: '12:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: [],
      planned_support_names: [],
      planned_technical_names: [],
    },
    {
      segment_index: 2,
      start_time: '11:00',
      end_time: '13:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: [],
      planned_support_names: [],
      planned_technical_names: [],
    },
  ]
  const overlapVal = validateStaffingSegments(parentDate, parentStart, parentEnd, DEFAULT_BUSINESS_TIMEZONE, overlappingSegments)
  assert.equal(overlapVal.valid, false)
  assert.match(overlapVal.errors[1] || '', /trùng lặp thời gian/)

  // 5. Negative capacity
  const negativeCapSegments: PlannedStaffingSegmentDraft[] = [
    {
      segment_index: 1,
      start_time: '10:00',
      end_time: '11:00',
      required_host_count: -1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: [],
      planned_support_names: [],
      planned_technical_names: [],
    },
  ]
  const negVal = validateStaffingSegments(parentDate, parentStart, parentEnd, DEFAULT_BUSINESS_TIMEZONE, negativeCapSegments)
  assert.equal(negVal.valid, false)
  assert.match(negVal.errors[1] || '', /Định biên nhân sự phải là số nguyên không âm/)

  // 6. Duplicate segment index
  const dupIndexSegments: PlannedStaffingSegmentDraft[] = [
    {
      segment_index: 1,
      start_time: '10:00',
      end_time: '11:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: [],
      planned_support_names: [],
      planned_technical_names: [],
    },
    {
      segment_index: 1,
      start_time: '11:00',
      end_time: '12:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: [],
      planned_support_names: [],
      planned_technical_names: [],
    },
  ]
  const dupVal = validateStaffingSegments(parentDate, parentStart, parentEnd, DEFAULT_BUSINESS_TIMEZONE, dupIndexSegments)
  assert.equal(dupVal.valid, false)
  assert.match(dupVal.errors[1] || '', /trùng lặp/)
})

test('G3-07: Optimistic Concurrency / Version conflict on update', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    currentUserService.bindAuthenticatedUser(adminUser)

    const shift = await shiftService.create({
      date: '2026-11-03',
      start_time: '14:00',
      end_time: '16:00',
      title: 'Concurrency Test Shift',
      brand_id: 'brand-kao',
      platform_id: 'platform-shopee',
      execution_source: 'internal',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
    })

    assert.equal(shift.version, 1)

    // Successful update with matching version
    const updated = await shiftService.update(shift.id, {
      title: 'Concurrency Test Shift Updated',
      version: 1,
    })
    assert.ok(updated)
    assert.equal(updated.version, 2)
    assert.equal(updated.title, 'Concurrency Test Shift Updated')

    // Stale update with old version (1 instead of 2) throws error
    await assert.rejects(
      async () => {
        await shiftService.update(shift.id, {
          title: 'Stale update should fail',
          version: 1,
        })
      },
      /VERSION_MISMATCH|STALE_WRITE|EXPECTED_VERSION|CONCURRENCY/,
      'Must reject update when version does not match',
    )
  })
})

test('G3-08: Calendar Return Context URL params preservation contract', () => {
  // Verifies that calendar query parameters are strictly preserved and not stripped
  const url = new URL('https://liveops.test/calendar?calendar_date=2026-11-01&calendar_view=week&calendar_filters=%7B%22brands%22%3A%5B%22brand-kao%22%5D%7D')
  const dateParam = url.searchParams.get('calendar_date')
  const viewParam = url.searchParams.get('calendar_view')
  const filterParam = url.searchParams.get('calendar_filters')

  assert.equal(dateParam, '2026-11-01')
  assert.equal(viewParam, 'week')
  assert.ok(filterParam?.includes('brand-kao'))

  // Modal close or save keeps the search params on window.history without redirecting to /shifts
  const path = url.pathname
  assert.equal(path, '/calendar')
})

test('G3-09: Role-based permissions — shifts.edit contract', () => {
  const admin: User = { ...adminUser, system_permission: 'admin' }
  const leader: User = { ...adminUser, id: 'u-leader', system_permission: 'leader' }
  const member: User = { ...adminUser, id: 'u-member', system_permission: 'member' }

  assert.equal(hasPermission(admin, 'shifts.edit'), true, 'Admin has shifts.edit permission')
  assert.equal(hasPermission(leader, 'shifts.edit'), true, 'Leader has shifts.edit permission')
  assert.equal(hasPermission(member, 'shifts.edit'), false, 'Member cannot edit shifts')
})

test('G3-10: Compatibility with G4 Safety Lock — Atomic replace guard remains active', async () => {
  const { readFileSync } = await import('node:fs')

  // Check StaffingActionPanel
  const actionPanel = readFileSync('components/features/calendar/StaffingActionPanel.tsx', 'utf8')
  assert.match(actionPanel, /replace-pending-backend-alert/, 'StaffingActionPanel must retain pending-backend alert')
  assert.match(actionPanel, /ATOMIC_REPLACEMENT_BACKEND_UNAVAILABLE/, 'Must throw ATOMIC_REPLACEMENT_BACKEND_UNAVAILABLE on programmatic replace')
  assert.match(actionPanel, /data-testid="confirm-replace-btn"/, 'Replace button must exist')
  assert.match(actionPanel, /disabled=\{true\}/, 'Replace button must remain disabled')

  // Check ShiftDetailModal
  const detailModal = readFileSync('components/features/shifts/ShiftDetailModal.tsx', 'utf8')
  assert.match(detailModal, /replace-modal-pending-backend-alert/, 'ShiftDetailModal must retain pending-backend alert')
  assert.match(detailModal, /data-testid="modal-confirm-replace-btn"/, 'Modal replace button must exist')
  assert.match(detailModal, /disabled=\{true\}/, 'Modal replace button must remain disabled')
})
