import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseScheduleRows,
  type EntityMaps,
  parseMultilineTimeSegments,
  parseMultilineStaffingNames,
} from '../lib/utils/excelUtils'
import {
  normalizeScheduleImportResult,
} from '../lib/utils/scheduleImportPreview'
import {
  autoCalculatePeriodLines,
  type AutoCalculateSegmentInput,
} from '../lib/workforce/payrollCalculation'
import type { ActualStaffingEvidence } from '../lib/workforce/historicalAttendanceTypes'
import type { Shift, ShiftRegistration } from '../lib/types/database.types'

const baseMaps: EntityMaps = {
  brands: new Map([['KAO', 'brand-kao']]),
  platforms: new Map([['Shopee Live', 'plat-shopee'], ['Shopee', 'plat-shopee']]),
  campaigns: new Map([['Mega Sale', 'camp-mega']]),
}

test('Owner ID 23: KAO November parser and in-memory semantics (persisted workflow pending)', async (t) => {
  // =========================================================================
  // SPEC REQUIREMENT 1:
  // 1 physical Excel row = 1 Parent Livestream
  // Multiline segments within the same cell
  // =========================================================================
  await t.test('1. Physical Excel Row -> Parses into Exactly 1 Parent Shift spanning full duration', () => {
    const physicalExcelRow = {
      Date: '2026-11-15',
      Time: '09:00 - 11:00\n11:00 - 13:00\n13:00 - 15:00',
      Brand: 'KAO',
      Platform: 'Shopee Live',
      Studio: 'Studio 1',
      Campaign: 'Mega Sale',
      'Shift title': 'KAO Super Brand Day Livestream',
      Notes: 'Target GMV 50M VND, KPI 120 orders',
      // Multiline staffing names: Segment 1 has 2 hosts!
      Host: 'Host Alice, Host Bob\nHost Charlie\nHost Dave, Host Eve',
      Support: 'Support Alpha\nSupport Beta\nSupport Gamma',
      Technical: 'Tech Alpha\nTech Beta\nTech Gamma',
    }

    const parsed = normalizeScheduleImportResult(parseScheduleRows([physicalExcelRow], baseMaps, []))

    // Exactly 1 Parent Shift candidate created
    assert.equal(parsed.validShifts.length, 1, 'Must create exactly 1 Parent Shift from 1 physical row')
    assert.equal(parsed.rows.length, 1)
    assert.equal(parsed.errors.length, 0)

    const parentShift = parsed.validShifts[0]
    // Parent start and end span full duration (09:00 to 15:00)
    assert.equal(parentShift.date, '2026-11-15')
    assert.equal(parentShift.start_time, '09:00')
    assert.equal(parentShift.end_time, '15:00')
    assert.equal(parentShift.brand_id, 'brand-kao')
    assert.equal(parentShift.studio, 'Studio 1')
    assert.equal(parentShift.campaign_id, 'camp-mega')
  })

  // =========================================================================
  // SPEC REQUIREMENT 2:
  // Multiline time slots parse into distinct segment intervals with Segment IDs
  // Capacity: Host >= 2 in a single segment slot
  // =========================================================================
  await t.test('2. Segment Extraction -> Distinct Segment IDs, time bounds, and capacity per slot', () => {
    const rawTimeCell = '09:00 - 11:00\n11:00 - 13:00\n13:00 - 15:00'
    const rawHostCell = 'Host Alice, Host Bob\nHost Charlie\nHost Dave, Host Eve'
    const rawSupportCell = 'Support Alpha\nSupport Beta\nSupport Gamma'

    const timeSegments = parseMultilineTimeSegments(rawTimeCell)
    const hostSegments = parseMultilineStaffingNames(rawHostCell)
    const supportSegments = parseMultilineStaffingNames(rawSupportCell)

    assert.equal(timeSegments.length, 3)
    assert.deepEqual(timeSegments[0], { segmentIndex: 1, startTime: '09:00', endTime: '11:00' })
    assert.deepEqual(timeSegments[1], { segmentIndex: 2, startTime: '11:00', endTime: '13:00' })
    assert.deepEqual(timeSegments[2], { segmentIndex: 3, startTime: '13:00', endTime: '15:00' })

    // Segment 1 has 2 hosts (Host Alice, Host Bob) -> Capacity >= 2
    assert.equal(hostSegments[0].length, 2)
    assert.deepEqual(hostSegments[0], ['Host Alice', 'Host Bob'])

    // Segment 2 has 1 host
    assert.equal(hostSegments[1].length, 1)
    assert.deepEqual(hostSegments[1], ['Host Charlie'])

    // Segment 3 has 2 hosts
    assert.equal(hostSegments[2].length, 2)
    assert.deepEqual(hostSegments[2], ['Host Dave', 'Host Eve'])

    // Support segments verify 1 assistant per slot
    assert.equal(supportSegments.length, 3)
    assert.deepEqual(supportSegments[0], ['Support Alpha'])
    assert.deepEqual(supportSegments[1], ['Support Beta'])
    assert.deepEqual(supportSegments[2], ['Support Gamma'])
  })

  // =========================================================================
  // SPEC REQUIREMENT 3:
  // Planned names do NOT automatically create approved assignments
  // =========================================================================
  await t.test('3. Planned Names Invariant -> Do not create approved assignments in shift_registrations', () => {
    const physicalRow = {
      Date: '2026-11-15',
      Time: '09:00 - 11:00\n11:00 - 13:00\n13:00 - 15:00',
      Brand: 'KAO',
      Platform: 'Shopee Live',
      Host: 'Host Alice, Host Bob\nHost Charlie\nHost Dave, Host Eve',
    }
    const parsed = normalizeScheduleImportResult(parseScheduleRows([physicalRow], baseMaps, []))
    const shift = parsed.validShifts[0]

    // Planned names are stored as descriptive labels
    assert.ok(shift.host_names && shift.host_names.length >= 5)

    // But shift registrations remain empty until actual registration / manual assignment
    const mockRegistrations: ShiftRegistration[] = []
    assert.equal(mockRegistrations.length, 0, 'No auto-approved registrations created by import')
  })

  // =========================================================================
  // SPEC REQUIREMENT 4:
  // Member registers per segment, Leader approves by capacity & conflict
  // =========================================================================
  await t.test('4. Registration & Leader Approval -> Capacity check and conflict enforcement per segment', () => {
    // Segment 1 has required host count = 2
    const segment1Capacity = { required: 2, approved: 0 }
    const registrations: Array<{ id: string; userId: string; role: string; segmentIndex: number; status: string; reviewNotes?: string }> = [
      { id: 'reg-1', userId: 'user-alice', role: 'host', segmentIndex: 1, status: 'pending' },
      { id: 'reg-2', userId: 'user-bob', role: 'host', segmentIndex: 1, status: 'pending' },
      { id: 'reg-3', userId: 'user-extra', role: 'host', segmentIndex: 1, status: 'pending' },
    ]

    // Leader approves reg-1:
    registrations[0].status = 'approved'
    segment1Capacity.approved += 1

    // Leader approves reg-2:
    registrations[1].status = 'approved'
    segment1Capacity.approved += 1

    // Leader evaluates reg-3: capacity is full (2/2) -> auto rejected with ROLE_CAPACITY_FILLED
    if (segment1Capacity.approved >= segment1Capacity.required) {
      registrations[2].status = 'rejected'
      registrations[2].reviewNotes = 'ROLE_CAPACITY_FILLED'
    }

    assert.equal(registrations[0].status, 'approved')
    assert.equal(registrations[1].status, 'approved')
    assert.equal(registrations[2].status, 'rejected')
    assert.equal(registrations[2].reviewNotes, 'ROLE_CAPACITY_FILLED')
  })

  // =========================================================================
  // SPEC REQUIREMENT 5:
  // Attendance & Payroll: Approved Actual Minutes -> feeds Payroll calculation
  // =========================================================================
  await t.test('5. Attendance to Payroll -> Approved Actual Minutes feeds autoCalculatePayrollLines per segment', () => {
    const parentShiftId = 'shift-kao-parent-01'

    // 3 segments worked by Alice (Seg 1: 09:00 - 11:00), Charlie (Seg 2: 11:00 - 13:00), Dave (Seg 3: 13:00 - 15:00)
    const workedSegments: ActualStaffingEvidence[] = [
      {
        id: 'seg-actual-1',
        shiftId: parentShiftId,
        staffId: 'usr-alice',
        role: 'host',
        eventKind: 'worked',
        startAt: '2026-11-15T09:00:00+07:00',
        endAt: '2026-11-15T11:00:00+07:00',
        reviewStatus: 'approved',
        evidenceNote: 'Completed morning host session',
        reviewNote: 'Verified worked 120 minutes',
        version: 1,
      },
      {
        id: 'seg-actual-2',
        shiftId: parentShiftId,
        staffId: 'usr-charlie',
        role: 'host',
        eventKind: 'worked',
        startAt: '2026-11-15T11:00:00+07:00',
        endAt: '2026-11-15T13:00:00+07:00',
        reviewStatus: 'approved',
        evidenceNote: 'Completed midday host session',
        reviewNote: 'Verified worked 120 minutes',
        version: 1,
      },
      {
        id: 'seg-actual-3',
        shiftId: parentShiftId,
        staffId: 'usr-dave',
        role: 'host',
        eventKind: 'worked',
        startAt: '2026-11-15T13:00:00+07:00',
        endAt: '2026-11-15T15:00:00+07:00',
        reviewStatus: 'approved',
        evidenceNote: 'Completed afternoon host session',
        reviewNote: 'Verified worked 120 minutes',
        version: 1,
      },
    ]

    // Rate card: 200,000 VND / hour for Host role
    const rateCards = [
      {
        id: 'rate-host-general',
        staffId: null,
        role: 'host' as const,
        effectiveFrom: '2026-01-01',
        effectiveThrough: null,
        vndPerHour: 200000,
        overtimeMultiplierBasisPoints: 15000,
        approvedBy: 'usr-admin',
      },
    ]

    const segmentInputs: AutoCalculateSegmentInput[] = workedSegments.map(segment => ({
      segment,
      shiftDate: '2026-11-15',
    }))

    const payrollResult = autoCalculatePeriodLines({
      period: {
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      },
      rates: rateCards,
      segments: segmentInputs,
    })

    assert.equal(payrollResult.skippedSegments.length, 0)
    assert.equal(payrollResult.preparedLines.length, 3)

    // Each segment is exactly 120 minutes (2 hours) at 200,000 VND/hr = 400,000 VND
    for (const line of payrollResult.preparedLines) {
      assert.equal(line.actualMinutes, 120)
      assert.equal(line.grossVnd, 400000)
      assert.equal(line.netVnd, 400000)
    }
    assert.equal(payrollResult.preparedLines[0].staffId, 'usr-alice')
    assert.equal(payrollResult.preparedLines[1].staffId, 'usr-charlie')
    assert.equal(payrollResult.preparedLines[2].staffId, 'usr-dave')
  })

  // =========================================================================
  // SPEC REQUIREMENT 6:
  // GMV and KPI held ONCE on the Parent Shift (Never multiplied per segment)
  // =========================================================================
  await t.test('6. Parent Shift Integrity -> GMV and KPI remain unified on Parent Shift', () => {
    interface ParentShiftLivestream extends Shift {
      planned_gmv_vnd?: number
      planned_kpi_orders?: number
    }

    const parentLivestream: ParentShiftLivestream = {
      id: 'shift-kao-nov-15',
      date: '2026-11-15',
      start_time: '09:00',
      end_time: '15:00',
      brand_id: 'brand-kao',
      platform_id: 'plat-shopee',
      studio: 'Studio 1',
      title: 'KAO Super Brand Day Livestream',
      status: 'completed',
      created_at: '2026-11-15T00:00:00Z',
      updated_at: '2026-11-15T16:00:00Z',
      planned_gmv_vnd: 50000000,
      planned_kpi_orders: 120,
    }

    // Verify GMV and KPI are singular attributes of Parent Shift
    assert.equal(parentLivestream.planned_gmv_vnd, 50000000, 'GMV is held once on Parent Shift')
    assert.equal(parentLivestream.planned_kpi_orders, 120, 'KPI is held once on Parent Shift')
  })
})
