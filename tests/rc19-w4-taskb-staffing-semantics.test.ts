import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computePeakConcurrentRequired,
  computeShiftStaffingMetrics,
  formatWallTimeInTimezone,
  normalizeShiftSegments,
  persistedSegmentToDraft,
} from '../lib/utils/staffingSemantics.ts'
import { resolveShiftDateTime } from '../lib/utils/shiftUtils.ts'
import { parseScheduleRows } from '../lib/utils/excelUtils.ts'
import { verifyImportedShiftReadback } from '../lib/utils/scheduleImportReadback.ts'
import {
  processScheduleImportRows,
  reconcileScheduleImportRows,
  type PersistedScheduleImportResult,
} from '../lib/utils/scheduleImportRecovery.ts'
import type { PersistedStaffingSegment, Shift } from '../lib/types/database.types.ts'
import type { ImportBatchRow } from '../lib/utils/scheduleImportBatch.ts'

import type { EntityMaps } from '../lib/utils/excelUtils.ts'

const entityMaps: EntityMaps = {
  brands: new Map([['KAO', 'brand-kao']]),
  platforms: new Map([['TikTok', 'plat-tt'], ['TikTok Shop', 'plat-tt']]),
  campaigns: new Map(),
}

const baseShift: Shift = {
  id: 'shift-kao-1',
  date: '2026-11-25',
  start_time: '08:00',
  end_time: '22:00',
  timezone: 'Asia/Ho_Chi_Minh',
  brand_id: 'brand-kao',
  platform_id: 'plat-tt',
  agency_code: 'ada',
  execution_source: 'internal',
  required_host_count: 2,
  required_support_count: 1,
  required_technical_count: 0,
  status: 'scheduled',
  created_at: '2026-11-24T00:00:00Z',
  updated_at: '2026-11-24T00:00:00Z',
  version: 1,
  staffing_segments: [
    {
      segment_index: 1,
      start_time: '08:00',
      end_time: '12:00',
      required_host_count: 2,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: ['Host A', 'Host B'],
      planned_support_names: ['Sup A'],
      planned_technical_names: [],
    },
    {
      segment_index: 2,
      start_time: '12:00',
      end_time: '17:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: ['Host C'],
      planned_support_names: ['Sup B'],
      planned_technical_names: [],
    },
    {
      segment_index: 3,
      start_time: '17:00',
      end_time: '22:00',
      required_host_count: 2,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: ['Host A', 'Host D'],
      planned_support_names: ['Sup A'],
      planned_technical_names: [],
    },
  ],
}

test('computePeakConcurrentRequired handles contiguous vs overlapping intervals accurately', () => {
  const contiguous = [
    { startMs: Date.parse('2026-11-25T01:00:00Z'), endMs: Date.parse('2026-11-25T05:00:00Z'), count: 2 },
    { startMs: Date.parse('2026-11-25T05:00:00Z'), endMs: Date.parse('2026-11-25T10:00:00Z'), count: 1 },
    { startMs: Date.parse('2026-11-25T10:00:00Z'), endMs: Date.parse('2026-11-25T15:00:00Z'), count: 2 },
  ]
  assert.equal(computePeakConcurrentRequired(contiguous), 2)

  const overlapping = [
    { startMs: Date.parse('2026-11-25T01:00:00Z'), endMs: Date.parse('2026-11-25T06:00:00Z'), count: 2 },
    { startMs: Date.parse('2026-11-25T05:00:00Z'), endMs: Date.parse('2026-11-25T10:00:00Z'), count: 1 },
  ]
  assert.equal(computePeakConcurrentRequired(overlapping), 3)
  assert.equal(computePeakConcurrentRequired([]), 0)
})

test('computeShiftStaffingMetrics distinguishes peak, positions, unique people, per-segment remaining, KT0, and staff-hours', () => {
  const persistedSegs: PersistedStaffingSegment[] = [
    {
      id: 'seg-1',
      shift_id: baseShift.id,
      segment_index: 1,
      start_at: '2026-11-25T01:00:00.000Z',
      end_at: '2026-11-25T05:00:00.000Z',
      required_host_count: 2,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: ['Host A', 'Host B'],
      planned_support_names: ['Sup A'],
      planned_technical_names: [],
    },
    {
      id: 'seg-2',
      shift_id: baseShift.id,
      segment_index: 2,
      start_at: '2026-11-25T05:00:00.000Z',
      end_at: '2026-11-25T10:00:00.000Z',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: ['Host C'],
      planned_support_names: ['Sup B'],
      planned_technical_names: [],
    },
    {
      id: 'seg-3',
      shift_id: baseShift.id,
      segment_index: 3,
      start_at: '2026-11-25T10:00:00.000Z',
      end_at: '2026-11-25T15:00:00.000Z',
      required_host_count: 2,
      required_support_count: 1,
      required_technical_count: 0,
      planned_host_names: ['Host A', 'Host D'],
      planned_support_names: ['Sup A'],
      planned_technical_names: [],
    },
  ]

  // Assign User 1 to BOTH K01 (host, capacity 2 -> remaining 1) and K02 (host, capacity 1 -> full).
  // Assign User 2 extra into K02 as well to ensure overfill in K02 does NOT mask missing slots in K01/K03!
  const metrics = computeShiftStaffingMetrics(
    { ...baseShift, persisted_staffing_segments: persistedSegs },
    [
      { id: 'r1', shift_id: baseShift.id, staffing_segment_id: 'seg-1', user_id: 'u-1', operational_role: 'host', status: 'approved' },
      { id: 'r2', shift_id: baseShift.id, staffing_segment_id: 'seg-2', user_id: 'u-1', operational_role: 'host', status: 'manually_assigned' },
      { id: 'r3', shift_id: baseShift.id, staffing_segment_id: 'seg-2', user_id: 'u-2', operational_role: 'host', status: 'approved' },
      { id: 'r4', shift_id: baseShift.id, staffing_segment_id: 'seg-3', user_id: 'u-3', operational_role: 'host', status: 'pending' },
    ],
  )

  assert.equal(metrics.roles.host.peak_concurrent_required, 2)
  assert.equal(metrics.roles.host.total_positions_required, 5)
  assert.equal(metrics.roles.host.unique_assigned_people, 2) // u-1 + u-2
  assert.equal(metrics.roles.host.approved_assignments, 3)
  assert.equal(metrics.roles.host.pending_assignments, 1)
  // Per-segment remaining: K01 (2-1=1) + K02 (max(0,1-2)=0) + K03 (2-0=2) = 3!
  assert.equal(metrics.roles.host.remaining_vacancies, 3)
  assert.equal(metrics.roles.host.required_staff_hours, 23) // 2*4 + 1*5 + 2*5 = 23h

  assert.equal(metrics.roles.support.peak_concurrent_required, 1)
  assert.equal(metrics.roles.support.total_positions_required, 3)
  assert.equal(metrics.roles.support.required_staff_hours, 14)

  // KT0 = 0 strictly preserved
  assert.equal(metrics.roles.technical.peak_concurrent_required, 0)
  assert.equal(metrics.roles.technical.total_positions_required, 0)
  assert.equal(metrics.roles.technical.remaining_vacancies, 0)
  assert.equal(metrics.roles.technical.required_staff_hours, 0)
})

test('overnight segments and UTC calendar day math remain deterministic across timezones', () => {
  assert.equal(resolveShiftDateTime('2026-03-08', '22:00', '02:00')?.endDate, '2026-03-09')
  assert.equal(resolveShiftDateTime('2024-02-28', '22:00', '02:00')?.endDate, '2024-02-29')
  assert.equal(resolveShiftDateTime('2024-02-29', '22:00', '02:00')?.endDate, '2024-03-01')

  const normalized = normalizeShiftSegments({
    date: '2026-11-25',
    start_time: '22:00',
    end_time: '02:00',
    timezone: 'Asia/Ho_Chi_Minh',
    staffing_segments: [
      {
        segment_index: 1,
        start_time: '22:00',
        end_time: '00:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 0,
      },
      {
        segment_index: 2,
        start_time: '00:00',
        end_time: '02:00',
        required_host_count: 2,
        required_support_count: 1,
        required_technical_count: 0,
      },
    ],
  })
  assert.equal(normalized.length, 2)
  assert.equal(normalized[0].duration_minutes, 120)
  assert.equal(normalized[1].duration_minutes, 120)
  assert.equal(formatWallTimeInTimezone(normalized[0].start_at, 'Asia/Ho_Chi_Minh'), '22:00')
  assert.equal(formatWallTimeInTimezone(normalized[1].end_at, 'Asia/Ho_Chi_Minh'), '02:00')

  const roundtrip = persistedSegmentToDraft({
    id: 'seg-ov',
    shift_id: 'sh-ov',
    segment_index: 2,
    start_at: normalized[1].start_at,
    end_at: normalized[1].end_at,
    required_host_count: 2,
    required_support_count: 1,
    required_technical_count: 0,
    planned_host_names: [],
    planned_support_names: [],
    planned_technical_names: [],
  })
  assert.equal(roundtrip.start_time, '00:00')
  assert.equal(roundtrip.end_time, '02:00')
  assert.equal(roundtrip.required_technical_count, 0)
})

test('excel date parser rejects invalid/Lotus-60 serials cleanly and single bad slash row does not abort sheet', () => {
  const parsed = parseScheduleRows(
    [
      {
        Brand: 'KAO',
        Platform: 'TikTok',
        Date: 46351, // 2026-11-25 in Excel serial epoch
        'Start Time': '09:00',
        'End Time': '12:00',
        'Required Host': 1,
        'Required Support': 1,
        'Required Technical': 0,
      },
      {
        Brand: 'KAO',
        Platform: 'TikTok',
        Date: 60, // Lotus 1-2-3 1900-02-29 invalid leap day
        'Start Time': '13:00',
        'End Time': '16:00',
        'Required Host': 1,
        'Required Support': 1,
        'Required Technical': 0,
      },
      {
        Brand: 'KAO',
        Platform: 'TikTok',
        Date: '99/99/2026', // invalid slash row should only invalidate this row
        'Start Time': '13:00',
        'End Time': '16:00',
      },
      {
        Brand: 'KAO',
        Platform: 'TikTok',
        Date: '26/11/2026',
        'Start Time': '14:00',
        'End Time': '18:00',
        'Required Host': 1,
        'Required Support': 1,
        'Required Technical': 0,
      },
    ],
    entityMaps,
    [],
  )

  assert.equal(parsed.rows.length, 4)
  assert.equal(parsed.rows[0].row.errors.length, 0)
  assert.equal(parsed.rows[0].row.date, '2026-11-25')
  assert.equal(parsed.rows[0].row.required_technical_count, 0)
  assert.ok(parsed.rows[1].row.errors.length > 0)
  assert.ok(parsed.rows[2].row.errors.length > 0)
  assert.equal(parsed.rows[3].row.errors.length, 0)
  assert.equal(parsed.rows[3].row.date, '2026-11-26')
})

test('verifyImportedShiftReadback detects KT0->KT1 mutation and dropped segment references', () => {
  const { created_at: _c, updated_at: _u, id: _id, ...expected } = baseShift
  void _c
  void _u
  void _id
  const validPersistedSegs: PersistedStaffingSegment[] = baseShift.staffing_segments!.map(s => ({
    id: `seg-${s.segment_index}`,
    shift_id: baseShift.id,
    segment_index: s.segment_index,
    start_at: normalizeShiftSegments(baseShift)[s.segment_index - 1].start_at,
    end_at: normalizeShiftSegments(baseShift)[s.segment_index - 1].end_at,
    required_host_count: s.required_host_count,
    required_support_count: s.required_support_count,
    required_technical_count: s.required_technical_count,
    planned_host_names: s.planned_host_names,
    planned_support_names: s.planned_support_names,
    planned_technical_names: s.planned_technical_names,
  }))

  const pass = verifyImportedShiftReadback({
    expected,
    persisted: { ...baseShift, persisted_staffing_segments: validPersistedSegs },
    persistedSegments: validPersistedSegs,
    registrations: [],
    staffingSummary: [
      { shift_id: baseShift.id, role: 'host', required: 5, approved: 0, pending: 0, remaining: 5, approved_staff: [] },
      { shift_id: baseShift.id, role: 'support', required: 3, approved: 0, pending: 0, remaining: 3, approved_staff: [] },
      { shift_id: baseShift.id, role: 'technical', required: 0, approved: 0, pending: 0, remaining: 0, approved_staff: [] },
    ],
  })
  assert.equal(pass.ok, true)
  assert.equal(pass.mismatches.length, 0)

  const tampered = verifyImportedShiftReadback({
    expected,
    persisted: { ...baseShift, required_technical_count: 1 },
    persistedSegments: validPersistedSegs.map((s, idx) =>
      idx === 0 ? { ...s, id: 'different-seg-id', required_technical_count: 1 } : s,
    ),
    previousRegistrations: [
      { id: 'reg-1', shift_id: baseShift.id, staffing_segment_id: 'seg-1', user_id: 'u-1', operational_role: 'host', status: 'approved' },
    ],
    previousSegments: validPersistedSegs,
    registrations: [
      { id: 'reg-1', shift_id: baseShift.id, staffing_segment_id: 'seg-1', user_id: 'u-1', operational_role: 'host', status: 'approved' },
    ],
  })
  assert.equal(tampered.ok, false)
  assert.ok(tampered.mismatches.some(m => m.includes('K01_tech_mismatch:0->1')))
  assert.ok(tampered.mismatches.some(m => m.includes('parent_peak_tech_mismatch:0->1')))
  assert.ok(tampered.mismatches.some(m => m.includes('dropped_referenced_segment_id:seg-1')))
})

test('reconcileScheduleImportRows tracks 5 outcomes and keeps processScheduleImportRows 5-key compatible', async () => {
  const parsed = parseScheduleRows(
    [
      { Brand: 'KAO', Platform: 'TikTok', Date: '2026-11-25', 'Start Time': '08:00', 'End Time': '12:00', Studio: 'S1' },
      { Brand: 'KAO', Platform: 'TikTok', Date: '2026-11-26', 'Start Time': '08:00', 'End Time': '12:00', Studio: 'S2' },
      { Brand: 'KAO', Platform: 'TikTok', Date: '2026-11-27', 'Start Time': '08:00', 'End Time': '12:00', Studio: 'S3' },
      { Brand: 'KAO', Platform: 'TikTok', Date: '2026-11-28', 'Start Time': '08:00', 'End Time': '12:00', Studio: 'S4' },
      { Brand: 'KAO', Platform: 'TikTok', Date: '2026-11-29', 'Start Time': '08:00', 'End Time': '12:00', Studio: 'S5' },
    ],
    entityMaps,
    [],
  )

  const batchRows: ImportBatchRow[] = parsed.rows.map(p => ({
    id: `row-${p.row.row_number}`,
    batch_id: 'b-1',
    source_row_number: p.row.row_number,
    original_values: {},
    normalized_values: p.row,
    status: 'pending',
    validation_issues: [],
    created_at: '2026-11-24T00:00:00Z',
  }))

  const outcomesByRow = new Map<number, PersistedScheduleImportResult>([
    [2, { kind: 'created', shift: { ...baseShift, id: 's-1' }, outcome: 'imported', batchRowRecorded: true }],
    [3, { kind: 'updated', shift: { ...baseShift, id: 's-2', version: 2 }, outcome: 'imported', batchRowRecorded: true }],
    [4, { kind: 'duplicate_skipped', shiftId: 's-3', batchRowRecorded: true }],
    [5, { kind: 'review_required', failureCode: 'IMPORT_CROSS_AGENCY_CONFLICT', shiftId: 's-4', batchRowRecorded: true }],
    [
      6,
      {
        kind: 'readback_mismatch',
        shiftId: 's-5',
        failureCode: 'IMPORT_DB_READBACK_MISMATCH',
        mismatches: ['parent_peak_tech_mismatch:0->1'],
        batchRowRecorded: true,
      },
    ],
  ])

  const progressSteps: number[] = []
  const recordedClientSide: Array<{ rowNumber: number; outcome: string }> = []
  const detailed = await reconcileScheduleImportRows({
    batchId: 'b-1',
    previews: parsed.rows,
    batchRows,
    initialShifts: [],
    createShift: async s => ({ ...s, id: 'unused', created_at: '', updated_at: '' }),
    reconcileShiftFromImport: async rowNum => outcomesByRow.get(rowNum)!,
    refreshShifts: async () => [],
    recordOutcome: async input => {
      recordedClientSide.push({ rowNumber: input.rowNumber, outcome: input.outcome })
    },
    onProgress: ({ processed }) => progressSteps.push(processed),
  })

  assert.equal(recordedClientSide.length, 0)
  assert.deepEqual(progressSteps, [1, 2, 3, 4, 5])
  assert.equal(detailed.created, 1)
  assert.equal(detailed.updated, 1)
  assert.equal(detailed.unchanged, 1)
  assert.equal(detailed.conflict, 1)
  assert.equal(detailed.failed, 1)
  assert.equal(detailed.readbackVerified, 2)
  assert.equal(detailed.readbackFailed, 1)
  assert.equal(detailed.rowResults.length, 5)

  // Verify legacy processScheduleImportRows return shape remains exact 5 keys
  const compat = await processScheduleImportRows({
    batchId: 'b-compat',
    previews: [parsed.rows[0]],
    batchRows: [batchRows[0]],
    initialShifts: [],
    createShift: async s => ({ ...s, id: 'unused', created_at: '', updated_at: '' }),
    createShiftFromImport: async () => outcomesByRow.get(2)!,
    refreshShifts: async () => [],
    recordOutcome: async () => {},
  })
  assert.deepEqual(compat, {
    imported: 1,
    recovered: 0,
    duplicateSkipped: 0,
    retryable: 0,
    finalizedSkipped: 0,
  })
})
