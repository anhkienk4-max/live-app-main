import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScheduleImportRow, Shift } from '../lib/types/database.types.ts'
import { parseScheduleRows, type ImportPreviewRow } from '../lib/utils/excelUtils.ts'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery.ts'
import type { ImportBatchRow } from '../lib/utils/scheduleImportBatch.ts'

const maps = {
  brands: new Map([['Brand A', 'brand-a']]),
  platforms: new Map([['Platform A', 'platform-a']]),
  campaigns: new Map([['Campaign A', 'campaign-a'], ['Campaign B', 'campaign-b']]),
}

const baseShift = {
  date: '2026-09-05',
  start_time: '10:00',
  end_time: '13:00',
  brand_id: 'brand-a',
  platform_id: 'platform-a',
  campaign_id: 'campaign-a',
  title: 'Original title',
  studio: 'Studio A',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  host_names: [],
  assistant_names: [],
  technical_names: [],
  registration_locked: false,
  allow_multi_role: false,
  status: 'scheduled' as const,
  timezone: 'Asia/Ho_Chi_Minh',
}

function shift(id: string, overrides: Partial<Shift> = {}): Shift {
  return {
    ...baseShift,
    id,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  }
}

function row(overrides: Partial<ScheduleImportRow> = {}): ScheduleImportRow {
  return {
    row_number: 2,
    date: baseShift.date,
    start_time: baseShift.start_time,
    end_time: baseShift.end_time,
    brand_name: 'Brand A',
    platform_name: 'Platform A',
    campaign_name: 'Campaign A',
    title: 'Original title',
    studio: 'Studio A',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    host_names: [],
    assistant_names: [],
    technical_names: [],
    warnings: [],
    errors: [],
    ...overrides,
  }
}

function batchRow(): ImportBatchRow {
  return {
    id: 'batch-1:2',
    batch_id: 'batch-1',
    source_row_number: 2,
    original_values: {},
    normalized_values: row(),
    status: 'pending',
    validation_issues: [],
    created_at: '2026-09-01T00:00:00.000Z',
  }
}

async function runEnrichment(existing: Shift, imported: Partial<Shift>, sourcePresence: ScheduleImportRow['source_presence'] = {}) {
  let current = existing
  let creates = 0
  let updateCalls = 0
  let staffingVersion: number | undefined
  const outcomes: string[] = []
  const preview: ImportPreviewRow = {
    row: row({
      campaign_name: imported.campaign_id === 'campaign-b' ? 'Campaign B' : 'Campaign A',
      title: imported.title ?? existing.title ?? '',
      studio: imported.studio ?? existing.studio,
      required_host_count: imported.required_host_count ?? existing.required_host_count ?? 1,
      required_support_count: imported.required_support_count ?? existing.required_support_count ?? 1,
      required_technical_count: imported.required_technical_count ?? existing.required_technical_count ?? 1,
      notes: imported.product_notes ?? '',
      host_names: imported.host_names ?? [],
      assistant_names: imported.assistant_names ?? [],
      technical_names: imported.technical_names ?? [],
      source_presence: sourcePresence,
    }),
    shift: { ...baseShift, ...imported },
  }
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [batchRow()],
    initialShifts: [existing],
    createShift: async data => {
      creates += 1
      return shift('created', data)
    },
    refreshShifts: async () => [current],
    updateShift: async (id, patch) => {
      updateCalls += 1
      assert.equal(id, existing.id)
      assert.equal(patch.version, current.version)
      current = { ...current, ...patch, version: (current.version ?? 0) + 1 }
      return current
    },
    updateStaffingLabels: async (id, labels, expectedVersion) => {
      assert.equal(id, existing.id)
      staffingVersion = expectedVersion
      current = { ...current, ...labels, version: (current.version ?? 0) + 1 }
      return current
    },
    recordOutcome: async input => outcomes.push(input.outcome),
  })
  return { current, creates, updateCalls, staffingVersion, outcomes, result }
}

const enrichmentCases: Array<[string, Partial<Shift>, NonNullable<ScheduleImportRow['source_presence']>]> = [
  ['campaign', { campaign_id: 'campaign-b' }, { campaign_name: true }],
  ['studio', { studio: 'Studio B' }, { studio: true }],
  ['title', { title: 'Updated title' }, { title: true }],
  ['notes', { product_notes: 'New notes' }, { notes: true }],
  ['host count', { required_host_count: 3 }, { required_host_count: true }],
  ['support count', { required_support_count: 4 }, { required_support_count: true }],
  ['technical count', { required_technical_count: 5 }, { required_technical_count: true }],
  ['staffing names', { host_names: ['Host'], assistant_names: ['Support'], technical_names: ['Tech'] }, { host_names: true, assistant_names: true, technical_names: true }],
]

for (const [field, imported, sourcePresence] of enrichmentCases) {
  test(`same slot with changed ${field} enriches the existing shift`, async () => {
    const run = await runEnrichment(shift('existing'), imported, sourcePresence)
    assert.equal(run.creates, 0)
    assert.equal(run.result.recovered, 1)
    assert.deepEqual(run.outcomes, ['imported'])
    for (const [key, value] of Object.entries(imported)) assert.deepEqual(run.current[key as keyof Shift], value)
  })
}

test('multiple explicit metadata changes produce one canonical Shift update', async () => {
  const run = await runEnrichment(
    shift('existing'),
    { campaign_id: 'campaign-b', studio: 'Studio B', title: 'New title', product_notes: 'New notes' },
    { campaign_name: true, studio: true, title: true, notes: true },
  )
  assert.equal(run.updateCalls, 1)
  assert.equal(run.result.recovered, 1)
  assert.equal(run.current.campaign_id, 'campaign-b')
  assert.equal(run.current.studio, 'Studio B')
  assert.equal(run.current.title, 'New title')
  assert.equal(run.current.product_notes, 'New notes')
})

test('same slot with no explicit changes remains duplicate_skipped', async () => {
  const run = await runEnrichment(shift('existing'), {}, {})
  assert.equal(run.updateCalls, 0)
  assert.equal(run.result.duplicateSkipped, 1)
  assert.deepEqual(run.outcomes, ['duplicate_skipped'])
})

test('blank metadata and defaulted staffing values preserve existing fields', async () => {
  const existing = shift('existing', {
    campaign_id: 'campaign-b', studio: 'Studio B', title: 'Existing title', product_notes: 'Existing notes',
    required_host_count: 3, required_support_count: 4, required_technical_count: 5,
  })
  const parsed = parseScheduleRows([{
    Date: baseShift.date, Start: baseShift.start_time, End: baseShift.end_time,
    Brand: 'Brand A', Platform: 'Platform A', Campaign: '', 'Shift title': '', Studio: '', Notes: '',
    'Host count': '', 'Support count': '', 'Technical count': '',
  }], maps, [existing])
  const preview = parsed.rows[0]
  assert.ok(preview?.duplicateCandidate)
  assert.equal(preview?.row.source_presence?.campaign_name, false)
  assert.equal(preview?.row.source_presence?.studio, false)
  assert.equal(preview?.row.source_presence?.title, false)
  assert.equal(preview?.row.source_presence?.notes, false)
  assert.equal(preview?.row.source_presence?.required_host_count, false)
  const run = await processScheduleImportRows({
    batchId: 'batch-1', previews: [preview!], batchRows: [batchRow()], initialShifts: [existing],
    createShift: async () => { throw new Error('must not create') }, refreshShifts: async () => [existing],
    updateShift: async () => { throw new Error('must not update') },
    updateStaffingLabels: async () => { throw new Error('must not update labels') },
    recordOutcome: async input => assert.equal(input.outcome, 'duplicate_skipped'),
  })
  assert.equal(run.duplicateSkipped, 1)
})

test('warning-only cross-midnight rows remain importable for new and existing shifts', async () => {
  const parsed = parseScheduleRows([{
    Date: '2026-09-05', Start: '22:00', End: '02:00', Brand: 'Brand A', Platform: 'Platform A',
    Campaign: 'Campaign A', 'Shift title': 'Overnight', Studio: 'Studio A',
  }], maps)
  assert.equal(parsed.invalidRows, 0)
  assert.equal(parsed.warningRows, 1)
  assert.ok(parsed.rows[0]?.shift)

  const existing = shift('existing', { start_time: '22:00', end_time: '02:00', title: 'Old overnight' })
  const existingPreview = parsed.rows[0]!
  const outcomes: string[] = []
  const existingResult = await processScheduleImportRows({
    batchId: 'batch-1', previews: [existingPreview], batchRows: [batchRow()], initialShifts: [existing],
    createShift: async () => { throw new Error('must not create') }, refreshShifts: async () => [existing],
    updateShift: async (id, patch) => ({ ...existing, ...patch, id, version: 2 }),
    recordOutcome: async input => outcomes.push(input.outcome),
  })
  assert.equal(existingResult.recovered, 1)
  assert.equal(outcomes[0], 'warning')
})

test('metadata update uses the current version before staffing synchronization', async () => {
  const run = await runEnrichment(
    shift('existing'),
    { title: 'Updated', host_names: ['Host'] },
    { title: true, host_names: true },
  )
  assert.equal(run.updateCalls, 1)
  assert.equal(run.staffingVersion, 2)
  assert.equal(run.current.version, 3)
})
