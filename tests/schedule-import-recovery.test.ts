import assert from 'node:assert/strict'
import test from 'node:test'

import type { Shift } from '../lib/types/database.types.ts'
import type { ImportPreviewRow } from '../lib/utils/excelUtils.ts'
import type {
  ImportBatchRetryableRowStatus,
  ImportBatchRow,
  ImportBatchRecordedRowStatus,
} from '../lib/utils/scheduleImportBatch.ts'
import {
  hasExactScheduleImportIdentity,
  processScheduleImportRows,
  reconcileScheduleImportShift,
} from '../lib/utils/scheduleImportRecovery.ts'

const NOW = '2026-08-22T08:00:00.000Z'

const shiftDraft: NonNullable<ImportPreviewRow['shift']> = {
  date: '2026-09-01',
  start_time: '09:00',
  end_time: '13:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  campaign_id: 'campaign-1',
  title: 'Morning shift',
  studio: 'Studio A',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  registration_locked: false,
  allow_multi_role: false,
  status: 'scheduled',
}

function shift(id: string, batchId?: string, overrides: Partial<Shift> = {}): Shift {
  return {
    ...shiftDraft,
    id,
    import_batch_id: batchId,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

function preview(rowNumber = 2): ImportPreviewRow {
  return {
    row: {
      row_number: rowNumber,
      date: shiftDraft.date,
      start_time: shiftDraft.start_time,
      end_time: shiftDraft.end_time,
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      campaign_name: 'Campaign',
      title: shiftDraft.title ?? '',
      studio: shiftDraft.studio,
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: { ...shiftDraft },
  }
}

function batchRow(
  status: ImportBatchRow['status'] = 'pending',
  rowNumber = 2,
): ImportBatchRow {
  return {
    id: `batch-1:${rowNumber}`,
    batch_id: 'batch-1',
    source_row_number: rowNumber,
    original_values: {},
    normalized_values: preview(rowNumber).row,
    status,
    validation_issues: [],
    created_at: NOW,
  }
}

interface RecordedOutcome {
  rowNumber: number
  outcome: ImportBatchRecordedRowStatus
  expectedOutcome: ImportBatchRetryableRowStatus
  shiftId?: string
  failureCode?: string
}

function workflow(overrides: {
  rows?: ImportBatchRow[]
  initialShifts?: Shift[]
  createShift?: () => Promise<Shift>
  refreshShifts?: () => Promise<Shift[]>
} = {}) {
  const outcomes: RecordedOutcome[] = []
  let createCalls = 0
  return {
    outcomes,
    createCalls: () => createCalls,
    run: () => processScheduleImportRows({
      batchId: 'batch-1',
      previews: [preview()],
      batchRows: overrides.rows ?? [batchRow()],
      initialShifts: overrides.initialShifts ?? [],
      createShift: async () => {
        createCalls += 1
        return overrides.createShift
          ? overrides.createShift()
          : shift('created', 'batch-1')
      },
      refreshShifts: overrides.refreshShifts ?? (async () => []),
      recordOutcome: async outcome => {
        outcomes.push(outcome)
      },
    }),
  }
}

test('reconciliation uses exact identity and the same import batch only', () => {
  const exact = shift('exact', 'batch-1')
  assert.equal(hasExactScheduleImportIdentity(exact, shiftDraft), true)
  assert.equal(
    hasExactScheduleImportIdentity(shift('different-studio', 'batch-1', { studio: 'Studio B' }), shiftDraft),
    false,
  )
  assert.deepEqual(reconcileScheduleImportShift('batch-1', shiftDraft, [exact]), {
    kind: 'recovered',
    shift: exact,
  })
  assert.deepEqual(
    reconcileScheduleImportShift('batch-1', shiftDraft, [shift('external', 'other-batch')]),
    { kind: 'unresolved' },
  )
})

test('one exact same-batch shift is recovered before create', async () => {
  const existing = shift('recovered', 'batch-1')
  const flow = workflow({ initialShifts: [existing] })
  const result = await flow.run()

  assert.equal(flow.createCalls(), 0)
  assert.equal(result.recovered, 1)
  assert.deepEqual(flow.outcomes, [{
    rowNumber: 2,
    outcome: 'imported',
    expectedOutcome: 'pending',
    shiftId: 'recovered',
  }])
})

test('multiple exact same-batch shifts block as ambiguous', async () => {
  const flow = workflow({
    initialShifts: [shift('a', 'batch-1'), shift('b', 'batch-1')],
  })
  const result = await flow.run()

  assert.equal(flow.createCalls(), 0)
  assert.equal(result.retryable, 1)
  assert.equal(flow.outcomes[0]?.failureCode, 'IMPORT_RECONCILIATION_AMBIGUOUS')
})

test('same-batch slot with a different exact identity blocks instead of fuzzy recovery', async () => {
  const flow = workflow({
    initialShifts: [shift('different-studio', 'batch-1', { studio: 'Studio B' })],
  })
  const result = await flow.run()

  assert.equal(flow.createCalls(), 0)
  assert.equal(result.retryable, 1)
  assert.equal(flow.outcomes[0]?.failureCode, 'IMPORT_BATCH_SLOT_IDENTITY_CONFLICT')
})

test('23505 re-reconciles and recovers the shift created by the same batch', async () => {
  const recovered = shift('created-before-response', 'batch-1')
  const flow = workflow({
    createShift: async () => {
      throw {
        code: '23505',
        message: 'duplicate key value violates unique constraint "shifts_active_slot_uidx"',
      }
    },
    refreshShifts: async () => [recovered],
  })
  const result = await flow.run()

  assert.equal(result.recovered, 1)
  assert.equal(result.duplicateSkipped, 0)
  assert.equal(flow.outcomes[0]?.shiftId, recovered.id)
})

test('external slot duplicate is skipped without linking it to the batch row', async () => {
  const flow = workflow({ initialShifts: [shift('external', 'other-batch')] })
  const result = await flow.run()

  assert.equal(flow.createCalls(), 0)
  assert.equal(result.duplicateSkipped, 1)
  assert.deepEqual(flow.outcomes, [{
    rowNumber: 2,
    outcome: 'duplicate_skipped',
    expectedOutcome: 'pending',
  }])
})

test('23505 followed by an external slot match is duplicate_skipped', async () => {
  const external = shift('external-after-race', 'other-batch')
  const flow = workflow({
    createShift: async () => {
      throw {
        code: '23505',
        message: 'duplicate key value violates unique constraint "shifts_active_slot_uidx"',
      }
    },
    refreshShifts: async () => [external],
  })
  const result = await flow.run()

  assert.equal(result.duplicateSkipped, 1)
  assert.equal(result.recovered, 0)
  assert.equal(flow.outcomes[0]?.outcome, 'duplicate_skipped')
  assert.equal(flow.outcomes[0]?.shiftId, undefined)
})

test('validation_failed is a retryable current state when the corrected preview is valid', async () => {
  const flow = workflow({ rows: [batchRow('validation_failed')] })
  const result = await flow.run()

  assert.equal(result.imported, 1)
  assert.equal(flow.outcomes[0]?.expectedOutcome, 'validation_failed')
  assert.equal(flow.outcomes[0]?.outcome, 'imported')
})

test('transient create failures stay retryable and preserve the current-outcome CAS value', async () => {
  const flow = workflow({
    rows: [batchRow('retryable')],
    createShift: async () => {
      throw { code: 'NETWORK_TIMEOUT', message: 'timed out' }
    },
  })
  const result = await flow.run()

  assert.equal(result.retryable, 1)
  assert.deepEqual(flow.outcomes, [{
    rowNumber: 2,
    outcome: 'retryable',
    expectedOutcome: 'retryable',
    failureCode: 'NETWORK_TIMEOUT',
  }])
})

test('finalized rows are never created or overwritten by retry processing', async () => {
  const flow = workflow({ rows: [batchRow('imported')] })
  const result = await flow.run()

  assert.equal(flow.createCalls(), 0)
  assert.equal(result.finalizedSkipped, 1)
  assert.deepEqual(flow.outcomes, [])
})
