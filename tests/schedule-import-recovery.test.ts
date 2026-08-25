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

test('external slot duplicate is skipped but linked to existing shift for staffing reconciliation', async () => {
  const flow = workflow({ initialShifts: [shift('external', 'other-batch')] })
  const result = await flow.run()

  assert.equal(flow.createCalls(), 0)
  assert.equal(result.duplicateSkipped, 1)
  assert.deepEqual(flow.outcomes, [{
    rowNumber: 2,
    outcome: 'duplicate_skipped',
    expectedOutcome: 'pending',
    shiftId: 'external',
  }])
})

test('23505 followed by an external slot match is duplicate_skipped and linked', async () => {
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
  assert.equal(flow.outcomes[0]?.shiftId, 'external-after-race')
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

test('existing shift staffing labels are merged when external duplicate is reconciled', async () => {
  const existing = shift('existing-1', undefined, { host_names: [], assistant_names: [], technical_names: [] })
  let updatedLabels: { host_names: string[]; assistant_names: string[]; technical_names: string[] } | null = null
  const previewWithStaffing: ImportPreviewRow = {
    row: {
      row_number: 2,
      date: shiftDraft.date,
      start_time: shiftDraft.start_time,
      end_time: shiftDraft.end_time,
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: shiftDraft.title ?? '',
      studio: shiftDraft.studio,
      host_names: ['Kiên'],
      assistant_names: ['A'],
      technical_names: ['B'],
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: {
      ...shiftDraft,
      host_names: ['Kiên'],
      assistant_names: ['A'],
      technical_names: ['B'],
    },
  }
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [previewWithStaffing],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [existing],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [existing],
    recordOutcome: async () => {},
    updateStaffingLabels: async (id, labels) => {
      updatedLabels = labels
      return { ...existing, ...labels, updated_at: NOW }
    },
  })
  assert.deepEqual(updatedLabels, { host_names: ['Kiên'], assistant_names: ['A'], technical_names: ['B'] })
  assert.equal(result.duplicateSkipped, 1)
})

test('Host-only import preserves other staffing fields on existing shift', async () => {
  const existing = shift('existing-2', undefined, { host_names: [], assistant_names: ['ExistingSupport'], technical_names: ['ExistingTech'] })
  let updatedLabels: { host_names: string[]; assistant_names: string[]; technical_names: string[] } | null = null
  const preview: ImportPreviewRow = {
    row: {
      row_number: 2,
      date: shiftDraft.date,
      start_time: shiftDraft.start_time,
      end_time: shiftDraft.end_time,
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: shiftDraft.title ?? '',
      studio: shiftDraft.studio,
      host_names: ['Kiên'],
      assistant_names: [],
      technical_names: [],
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: { ...shiftDraft, host_names: ['Kiên'], assistant_names: [], technical_names: [] },
  }
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [existing],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [existing],
    recordOutcome: async () => {},
    updateStaffingLabels: async (id, labels) => {
      updatedLabels = labels
      return { ...existing, ...labels, updated_at: NOW }
    },
  })
  assert.deepEqual(updatedLabels, { host_names: ['Kiên'], assistant_names: ['ExistingSupport'], technical_names: ['ExistingTech'] })
})

test('re-import same staffing does not duplicate names and is idempotent', async () => {
  const existing = shift('existing-3', undefined, { host_names: ['Kiên'], assistant_names: ['A'], technical_names: ['B'] })
  let updateCalled = false
  const preview: ImportPreviewRow = {
    row: {
      row_number: 2,
      date: shiftDraft.date,
      start_time: shiftDraft.start_time,
      end_time: shiftDraft.end_time,
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: shiftDraft.title ?? '',
      studio: shiftDraft.studio,
      host_names: ['Kiên'],
      assistant_names: ['A'],
      technical_names: ['B'],
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: { ...shiftDraft, host_names: ['Kiên'], assistant_names: ['A'], technical_names: ['B'] },
  }
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [existing],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [existing],
    recordOutcome: async () => {},
    updateStaffingLabels: async () => {
      updateCalled = true
      throw new Error('should not be called when labels equal')
    },
  })
  assert.equal(updateCalled, false)
})

test('blank imported staffing preserves existing metadata', async () => {
  const existing = shift('existing-4', undefined, { host_names: ['Kiên'], assistant_names: ['A'], technical_names: ['B'] })
  let updatedLabels: { host_names: string[]; assistant_names: string[]; technical_names: string[] } | null = null
  const preview: ImportPreviewRow = {
    row: {
      row_number: 2,
      date: shiftDraft.date,
      start_time: shiftDraft.start_time,
      end_time: shiftDraft.end_time,
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: shiftDraft.title ?? '',
      studio: shiftDraft.studio,
      host_names: [],
      assistant_names: [],
      technical_names: [],
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: { ...shiftDraft, host_names: [], assistant_names: [], technical_names: [] },
  }
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [existing],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [existing],
    recordOutcome: async () => {},
    updateStaffingLabels: async (id, labels) => {
      updatedLabels = labels
      return { ...existing, ...labels, updated_at: NOW }
    },
  })
  // blank import should not trigger update at all (maybeMerge returns early)
  assert.equal(updatedLabels, null)
})

test('SUCCESS PATH: exact identity with campaign and studio match merges staffing', async () => {
  const existing = shift('success-exact', 'other-batch', { campaign_id: 'campaign-1', studio: 'Studio A', host_names: [], assistant_names: [], technical_names: [] })
  let updated: { host_names: string[] } | null = null
  const preview: ImportPreviewRow = {
    row: { row_number: 2, date: shiftDraft.date, start_time: shiftDraft.start_time, end_time: shiftDraft.end_time, brand_name: 'Mars', platform_name: 'Shopee', title: 'Morning', studio: 'Studio A', campaign_name: 'campaign-1', host_names: ['Kiên'], assistant_names: ['A'], technical_names: ['B'], required_host_count: 1, required_support_count: 1, required_technical_count: 1, warnings: [], errors: [] },
    shift: { ...shiftDraft, campaign_id: 'campaign-1', studio: 'Studio A', host_names: ['Kiên'], assistant_names: ['A'], technical_names: ['B'] },
  }
  const outcomes: unknown[] = []
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [existing],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [existing],
    recordOutcome: async o => { outcomes.push(o) },
    updateStaffingLabels: async (id, labels) => { updated = labels; return { ...existing, ...labels, updated_at: NOW } },
  })
  assert.deepEqual(updated?.host_names, ['Kiên'])
  assert.equal((outcomes[0] as { outcome: string }).outcome, 'duplicate_skipped')
})

test('FAILED PATH: campaign null vs populated with single slot still merges via slot unique (safe)', async () => {
  // Existing shift has no campaign, imported has campaign-1 but slot is unique -> should still merge via slot fallback
  const existing = shift('failed-campaign-null', 'other-batch', { campaign_id: undefined, studio: 'Studio A', host_names: [] })
  let updated: { host_names: string[] } | null = null
  const preview: ImportPreviewRow = {
    row: { row_number: 2, date: shiftDraft.date, start_time: shiftDraft.start_time, end_time: shiftDraft.end_time, brand_name: 'Mars', platform_name: 'Shopee', title: 'Morning', studio: 'Studio A', campaign_name: 'campaign-1', host_names: ['Kiên'], assistant_names: [], technical_names: [], required_host_count: 1, required_support_count: 1, required_technical_count: 1, warnings: [], errors: [] },
    shift: { ...shiftDraft, campaign_id: 'campaign-1', studio: 'Studio A', host_names: ['Kiên'] },
  }
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [existing],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [existing],
    recordOutcome: async () => {},
    updateStaffingLabels: async (id, labels) => { updated = labels; return { ...existing, ...labels, updated_at: NOW } },
  })
  // With unique slot, staffing is merged even though campaign differs (single safe candidate)
  assert.deepEqual(updated?.host_names, ['Kiên'])
})

test('FAILED PATH: studio blank vs Studio A with multiple slot mates is ambiguous and does not merge', async () => {
  const s1 = shift('s1-studio-a', 'other-batch', { studio: 'Studio A', campaign_id: 'campaign-1', host_names: [] })
  const s2 = shift('s2-studio-b', 'other-batch', { studio: 'Studio B', campaign_id: 'campaign-1', host_names: [] })
  let mergeCalled = false
  const preview: ImportPreviewRow = {
    row: { row_number: 2, date: shiftDraft.date, start_time: shiftDraft.start_time, end_time: shiftDraft.end_time, brand_name: 'Mars', platform_name: 'Shopee', title: 'Morning', studio: '', campaign_name: 'campaign-1', host_names: ['Kiên'], assistant_names: [], technical_names: [], required_host_count: 1, required_support_count: 1, required_technical_count: 1, warnings: [], errors: [] },
    shift: { ...shiftDraft, studio: '', campaign_id: 'campaign-1', host_names: ['Kiên'] },
  }
  const outcomes: Array<{ outcome: string; failureCode?: string }> = []
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [s1, s2],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [s1, s2],
    recordOutcome: async o => { outcomes.push(o as { outcome: string; failureCode?: string }) },
    updateStaffingLabels: async () => { mergeCalled = true; return null },
  })
  assert.equal(mergeCalled, false, 'ambiguous slot must not merge to wrong shift')
  assert.equal(outcomes[0].outcome, 'retryable')
  assert.equal(outcomes[0].failureCode, 'IMPORT_RECONCILIATION_AMBIGUOUS')
})

test('duplicateCandidate ambiguous slot does not first-match wrong shift', async () => {
  const s1 = shift('dup-s1', 'other-batch', { studio: 'Studio A', campaign_id: 'campaign-1', host_names: [] })
  const s2 = shift('dup-s2', 'other-batch', { studio: 'Studio B', campaign_id: 'campaign-1', host_names: [] })
  // Simulate Excel duplicate: preview has duplicateCandidate with blank studio (no exact)
  const preview: ImportPreviewRow = {
    row: { row_number: 2, date: shiftDraft.date, start_time: shiftDraft.start_time, end_time: shiftDraft.end_time, brand_name: 'Mars', platform_name: 'Shopee', title: 'Morning', studio: '', campaign_name: 'campaign-1', host_names: ['Kiên'], assistant_names: [], technical_names: [], required_host_count: 1, required_support_count: 1, required_technical_count: 1, warnings: ['duplicate'], errors: [] },
    shift: undefined,
    duplicateCandidate: { ...shiftDraft, studio: '', campaign_id: 'campaign-1', host_names: ['Kiên'] },
  }
  let mergeCalled = false
  const outcomes: Array<{ outcome: string; failureCode?: string }> = []
  await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow('pending', 2)],
    initialShifts: [s1, s2],
    createShift: async () => { throw new Error('should not create') },
    refreshShifts: async () => [s1, s2],
    recordOutcome: async o => { outcomes.push(o as { outcome: string; failureCode?: string }) },
    updateStaffingLabels: async () => { mergeCalled = true; return null },
  })
  assert.equal(mergeCalled, false)
  assert.equal(outcomes[0].outcome, 'retryable')
  assert.equal(outcomes[0].failureCode, 'IMPORT_RECONCILIATION_AMBIGUOUS')
})
