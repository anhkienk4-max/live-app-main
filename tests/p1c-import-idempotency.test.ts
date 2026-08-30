import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { Shift } from '../lib/types/database.types.ts'
import type { ImportPreviewRow } from '../lib/utils/excelUtils.ts'
import type { ImportBatchRow } from '../lib/utils/scheduleImportBatch.ts'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery.ts'

const MIGRATION = readFileSync(
  'supabase/migrations/20260830085911_core_v1_data_integrity_p1c.sql',
  'utf8',
)

const draft = {
  date: '2026-09-01',
  start_time: '09:00',
  end_time: '13:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  campaign_id: 'campaign-1',
  title: 'Morning',
  studio: 'Studio A',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  registration_locked: false,
  allow_multi_role: false,
  status: 'scheduled' as const,
}

function shift(id: string, importBatchId?: string, overrides: Partial<Shift> = {}): Shift {
  return {
    ...draft,
    id,
    import_batch_id: importBatchId,
    created_at: '2026-08-30T00:00:00.000Z',
    updated_at: '2026-08-30T00:00:00.000Z',
    ...overrides,
  }
}

function preview(rowNumber: number, overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    row: {
      row_number: rowNumber,
      date: draft.date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      brand_name: 'Mars',
      platform_name: 'Shopee',
      campaign_name: draft.campaign_id,
      title: draft.title,
      studio: draft.studio,
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: { ...draft },
    ...overrides,
  }
}

function batchRow(rowNumber: number, status: ImportBatchRow['status'] = 'pending'): ImportBatchRow {
  return {
    id: `batch-1:${rowNumber}`,
    batch_id: 'batch-1',
    source_row_number: rowNumber,
    original_values: {},
    normalized_values: preview(rowNumber).row,
    status,
    validation_issues: [],
    created_at: '2026-08-30T00:00:00.000Z',
  }
}

test('P1-C migration keeps finalized outcomes immutable but makes identical replays no-op', () => {
  assert.match(MIGRATION, /v_current_outcome in \('imported', 'warning', 'duplicate_skipped'\)/)
  assert.match(MIGRATION, /IMPORT_ROW_ALREADY_FINALIZED/)
  assert.match(MIGRATION, /v_batch\.status not in \('previewed', 'failed', 'confirmed'\)/)
  assert.match(MIGRATION, /if v_batch\.status = 'confirmed' then/)
  assert.match(MIGRATION, /status = 'confirmed'/)
  assert.doesNotMatch(MIGRATION, /create unique index .*schedule_import/i)
})

test('same imported row replay creates no second shift and leaves finalized state unchanged', async () => {
  const rows = [batchRow(2, 'imported')]
  let createCalls = 0
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview(2)],
    batchRows: rows,
    initialShifts: [shift('existing', 'batch-1')],
    createShift: async () => {
      createCalls += 1
      return shift('should-not-create', 'batch-1')
    },
    refreshShifts: async () => [],
    recordOutcome: async () => { throw new Error('finalized row must not be rewritten') },
  })
  assert.equal(createCalls, 0)
  assert.equal(result.finalizedSkipped, 1)
  assert.equal(rows[0]?.status, 'imported')
})

test('partial retry touches only the retryable row and preserves the imported row', async () => {
  const rows = [batchRow(2, 'imported'), batchRow(3, 'retryable')]
  rows[1]!.failure_code = 'NETWORK_TIMEOUT'
  const created: Shift[] = []
  const outcomes: Array<{ rowNumber: number; outcome: string; expectedOutcome: string }> = []
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [
      preview(2),
      preview(3, {
        row: { ...preview(3).row, start_time: '14:00', end_time: '18:00' },
        shift: { ...draft, start_time: '14:00', end_time: '18:00' },
      }),
    ],
    batchRows: rows,
    initialShifts: [shift('already-imported', 'batch-1')],
    createShift: async data => {
      const next = shift('retried-row', 'batch-1', data)
      created.push(next)
      return next
    },
    refreshShifts: async () => created,
    recordOutcome: async input => {
      outcomes.push({ rowNumber: input.rowNumber, outcome: input.outcome, expectedOutcome: input.expectedOutcome })
    },
  })
  assert.equal(result.finalizedSkipped, 1)
  assert.equal(result.imported, 1)
  assert.deepEqual(outcomes.map(item => item.rowNumber), [3])
  assert.equal(created.length, 1)
})

test('validation_failed remains non-importing until the preview is corrected', async () => {
  const rows = [batchRow(2, 'validation_failed')]
  const invalid = preview(2, { row: { ...preview(2).row, errors: ['Brand was not found.'] }, shift: undefined })
  let createCalls = 0
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [invalid],
    batchRows: rows,
    initialShifts: [],
    createShift: async () => {
      createCalls += 1
      return shift('unexpected')
    },
    refreshShifts: async () => [],
    recordOutcome: async () => { throw new Error('invalid row must not be imported') },
  })
  assert.equal(createCalls, 0)
  assert.equal(result.imported, 0)
  assert.equal(rows[0]?.status, 'validation_failed')
})

test('concurrent confirmation of the same row yields one active shift and an idempotent outcome', async () => {
  let createCalls = 0
  let releaseCreate!: () => void
  let arrived = 0
  const bothArrived = new Promise<void>(resolve => {
    releaseCreate = resolve
  })
  const created: Shift[] = []
  const rows: ImportBatchRow = batchRow(2)
  const recordOutcome = async ({ outcome, shiftId }: { outcome: string; shiftId?: string }) => {
    if (rows.status !== 'pending') {
      assert.equal(rows.status, outcome)
      assert.equal(rows.resulting_shift_id, shiftId)
      return
    }
    rows.status = outcome as ImportBatchRow['status']
    rows.resulting_shift_id = shiftId
  }
  const createShift = async (data: typeof draft) => {
    createCalls += 1
    arrived += 1
    if (arrived === 2) releaseCreate()
    await (arrived === 1 ? bothArrived : Promise.resolve())
    if (created.length > 0) {
      throw { code: '23505', message: 'duplicate key value violates unique constraint "shifts_active_slot_uidx"' }
    }
    const createdShift = shift('same-row-shift', 'batch-1', data)
    created.push(createdShift)
    return createdShift
  }
  const run = () => processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview(2)],
    batchRows: [rows],
    initialShifts: [],
    createShift,
    refreshShifts: async () => created,
    recordOutcome,
  })
  const [first, second] = await Promise.all([run(), run()])
  assert.equal(createCalls, 2)
  assert.equal(created.length, 1)
  assert.equal(rows.status, 'imported')
  assert.equal(first.imported + second.imported + first.recovered + second.recovered, 2)
})

test('campaign or studio differences cannot bypass the canonical slot duplicate', async () => {
  const existing = shift('external-slot', 'other-batch', { campaign_id: 'other-campaign', studio: 'Studio B' })
  let createCalls = 0
  const outcomes: Array<{ outcome: string; shiftId?: string }> = []
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview(2)],
    batchRows: [batchRow(2)],
    initialShifts: [existing],
    createShift: async () => {
      createCalls += 1
      return shift('unexpected')
    },
    refreshShifts: async () => [existing],
    recordOutcome: async item => outcomes.push({ outcome: item.outcome, shiftId: item.shiftId }),
  })
  assert.equal(createCalls, 0)
  assert.equal(result.duplicateSkipped, 1)
  assert.deepEqual(outcomes, [{ outcome: 'duplicate_skipped', shiftId: existing.id }])
})
