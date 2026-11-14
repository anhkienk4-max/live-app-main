import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseScheduleRows, parseScheduleTabularData, type EntityMaps } from '../lib/utils/excelUtils'
import { mapImportResultToBatchRows } from '../lib/utils/scheduleImportBatch'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery'
import type { Shift } from '../lib/types/database.types'

const maps: EntityMaps = {
  brands: new Map([['KAO', 'brand-kao']]),
  platforms: new Map([['Shopee Live', 'platform-shopee']]),
  campaigns: new Map(),
}

const staffingDefinitions = [
  'K01 10:00-11:00 H1 T1 KT0',
  'K02 11:00-16:00 H2 T1 KT0',
  'K03 16:00-18:00 H1 T1 KT0',
].join('\n')

function kaoWorkbookRow(overrides: Record<string, unknown> = {}) {
  return {
    Date: '11/1/2026',
    Time: '10:00 - 18:00',
    Brand: 'KAO',
    Platform: 'Shopee Live',
    'Shift title': 'KAO livestream',
    'External Shift ID': 'KAO-20261101-1000-1800',
    Weekday: 'Sunday',
    'Số khung': 3,
    'Khung nhân sự': staffingDefinitions,
    Host: 'K01: Planned Host A\nK02: Planned Host B, Planned Host C\nK03: Planned Host A',
    Support: 'K01: Planned Support A\nK02: Planned Support B\nK03: Planned Support A',
    Technical: '',
    ...overrides,
  }
}

function parseWorkbookRow(row: Record<string, unknown>, existingShifts: Shift[] = []) {
  const headers = Object.keys(row)
  const worksheet = XLSX.utils.aoa_to_sheet([headers, headers.map(header => row[header])])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'KAO Import')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return parseScheduleTabularData(bytes, 'array', maps, existingShifts)
}

test('Issue 184: KAO source date resolves from weekday and external shift identity before preview', () => {
  const result = parseWorkbookRow(kaoWorkbookRow())

  assert.equal(result.errors.length, 0)
  assert.equal(result.validShifts.length, 1)
  assert.equal(result.validShifts[0].date, '2026-11-01')
  assert.equal(result.rows[0].row.date, '2026-11-01')
  assert.equal(result.validShifts[0].start_at, '2026-11-01T03:00:00.000Z')
  assert.equal(result.validShifts[0].end_at, '2026-11-01T11:00:00.000Z')
})

test('Issue 184: ambiguous dates and date, weekday, or external identity conflicts fail preview', () => {
  const ambiguous = parseScheduleRows([{
    Date: '11/1/2026', Time: '10:00 - 18:00', Brand: 'KAO', Platform: 'Shopee Live', 'Shift title': 'KAO live',
  }], maps)
  assert.equal(ambiguous.validShifts.length, 0)
  assert.match(ambiguous.errors.map(error => error.message).join(' '), /ambiguous/i)

  const conflict = parseWorkbookRow(kaoWorkbookRow({ Weekday: 'Monday' }))
  assert.equal(conflict.validShifts.length, 0)
  assert.match(conflict.errors.map(error => error.message).join(' '), /conflicts with its weekday/i)

  const timeConflict = parseWorkbookRow(kaoWorkbookRow({ Time: '10:00 - 17:00' }))
  assert.equal(timeConflict.validShifts.length, 0)
  assert.match(timeConflict.errors.map(error => error.message).join(' '), /do not match External Shift ID times/i)

  const externalDateConflict = parseWorkbookRow(kaoWorkbookRow({ 'External Shift ID': 'KAO-20261102-1000-1800' }))
  assert.equal(externalDateConflict.validShifts.length, 0)
  assert.match(externalDateConflict.errors.map(error => error.message).join(' '), /conflicts with its weekday/i)
})

test('Issue 184: K01-K03 definitions become planned child segments without creating assignments', async () => {
  const parsed = parseWorkbookRow(kaoWorkbookRow())
  assert.equal(parsed.errors.length, 0)
  const draft = parsed.validShifts[0]
  assert.deepEqual(draft.staffing_segments, [
    { segment_index: 1, start_time: '10:00', end_time: '11:00', required_host_count: 1, required_support_count: 1, required_technical_count: 0,
      planned_host_names: ['Planned Host A'], planned_support_names: ['Planned Support A'], planned_technical_names: [] },
    { segment_index: 2, start_time: '11:00', end_time: '16:00', required_host_count: 2, required_support_count: 1, required_technical_count: 0,
      planned_host_names: ['Planned Host B', 'Planned Host C'], planned_support_names: ['Planned Support B'], planned_technical_names: [] },
    { segment_index: 3, start_time: '16:00', end_time: '18:00', required_host_count: 1, required_support_count: 1, required_technical_count: 0,
      planned_host_names: ['Planned Host A'], planned_support_names: ['Planned Support A'], planned_technical_names: [] },
  ])
  assert.equal(draft.required_host_count, 2)
  assert.equal(draft.required_support_count, 1)
  assert.equal(draft.required_technical_count, 0)
  assert.equal('shift_registrations' in draft, false)

  const importResult = parseWorkbookRow(kaoWorkbookRow())
  const batchRows = mapImportResultToBatchRows('synthetic-batch', importResult)
  batchRows[0].status = 'pending'
  let createCount = 0
  let created: Shift | undefined
  const recovery = await processScheduleImportRows({
    batchId: 'synthetic-batch',
    previews: importResult.rows,
    batchRows,
    initialShifts: [],
    async createShift(data) {
      createCount += 1
      assert.deepEqual(data.staffing_segments, draft.staffing_segments)
      const row = { ...data, id: 'synthetic-parent-shift', created_at: '', updated_at: '' } as Shift
      created = row
      return row
    },
    async refreshShifts() { return created ? [created] : [] },
    async recordOutcome() {},
  })
  assert.equal(recovery.imported, 1)
  assert.equal(createCount, 1)
})

test('Issue 184: reimport keeps one parent and does not rewrite existing segment or operational history', async () => {
  const first = parseWorkbookRow(kaoWorkbookRow())
  const draft = first.validShifts[0]
  const existing = {
    ...draft,
    id: 'existing-parent-shift',
    import_batch_id: 'original-batch',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    version: 4,
    staffing_segments: draft.staffing_segments,
  } as Shift
  const before = structuredClone(existing)
  const reimport = parseWorkbookRow(kaoWorkbookRow(), [existing])
  assert.equal(reimport.validShifts.length, 0)
  assert.deepEqual(reimport.rows[0].duplicateCandidate?.staffing_segments, draft.staffing_segments)
  const batchRows = mapImportResultToBatchRows('retry-batch', reimport)
  batchRows[0].status = 'pending'
  let createCount = 0
  let updateCount = 0
  let outcome = ''
  const result = await processScheduleImportRows({
    batchId: 'retry-batch',
    previews: reimport.rows,
    batchRows,
    initialShifts: [existing],
    async createShift() { createCount += 1; throw new Error('must not create a duplicate parent') },
    async refreshShifts() { return [existing] },
    async recordOutcome(input) { outcome = input.outcome },
    async updateShift() { updateCount += 1; return null },
    async updateStaffingLabels() { updateCount += 1; return null },
  })

  assert.equal(result.duplicateSkipped, 1)
  assert.equal(outcome, 'duplicate_skipped')
  assert.equal(createCount, 0)
  assert.equal(updateCount, 0)
  assert.deepEqual(existing, before)
})

test('Issue 184: invalid K slot count, overlap, containment, or capacity is rejected', () => {
  const mismatchedCount = parseWorkbookRow(kaoWorkbookRow({ 'Số khung': 2 }))
  assert.equal(mismatchedCount.validShifts.length, 0)
  assert.match(mismatchedCount.errors.map(error => error.message).join(' '), /slot count 2 does not match 3 definitions/i)

  const overlap = parseWorkbookRow(kaoWorkbookRow({
    'Khung nhân sự': 'K01 10:00-12:00 H1 T1 KT0\nK02 11:00-16:00 H2 T1 KT0\nK03 16:00-18:00 H1 T1 KT0',
  }))
  assert.equal(overlap.validShifts.length, 0)
  assert.match(overlap.errors.map(error => error.message).join(' '), /overlaps or falls outside/i)

  const outside = parseWorkbookRow(kaoWorkbookRow({
    'Khung nhân sự': 'K01 09:00-11:00 H1 T1 KT0\nK02 11:00-16:00 H2 T1 KT0\nK03 16:00-18:00 H1 T1 KT0',
  }))
  assert.equal(outside.validShifts.length, 0)
  assert.match(outside.errors.map(error => error.message).join(' '), /overlaps or falls outside/i)

  const overCapacity = parseWorkbookRow(kaoWorkbookRow({ Host: 'K01: Host A, Host B\nK02: Host C\nK03: Host D' }))
  assert.equal(overCapacity.validShifts.length, 0)
  assert.match(overCapacity.errors.map(error => error.message).join(' '), /exceed the capacity/i)

  const namesWithoutSlotMapping = parseWorkbookRow(kaoWorkbookRow({ Host: 'Planned Host A, Planned Host B' }))
  assert.equal(namesWithoutSlotMapping.validShifts.length, 0)
  assert.match(namesWithoutSlotMapping.errors.map(error => error.message).join(' '), /staffing name lines must match/i)
})

test('Issue 184: overnight K slots remain inside one parent shift on the next business date', () => {
  const result = parseWorkbookRow(kaoWorkbookRow({
    Time: '22:00 - 03:00',
    'External Shift ID': 'KAO-20261101-2200-0300',
    'Số khung': 3,
    'Khung nhân sự': 'K01 22:00-23:00 H1 T1 KT0\nK02 23:00-01:00 H1 T1 KT0\nK03 01:00-03:00 H1 T1 KT0',
    Host: 'K01: Planned Host A\nK02: Planned Host B\nK03: Planned Host A',
    Support: 'K01: Planned Support A\nK02: Planned Support B\nK03: Planned Support A',
  }))

  assert.equal(result.errors.length, 0)
  assert.equal(result.validShifts[0].date, '2026-11-01')
  assert.equal(result.validShifts[0].end_at, '2026-11-01T20:00:00.000Z')
  assert.deepEqual(result.validShifts[0].staffing_segments?.map(segment => [segment.start_time, segment.end_time]), [
    ['22:00', '23:00'], ['23:00', '01:00'], ['01:00', '03:00'],
  ])
})
