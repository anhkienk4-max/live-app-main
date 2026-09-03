import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import type { ImportBatchRow } from '../lib/utils/scheduleImportBatch.ts'
import {
  batchPresentationCounts,
  isNotImportedResultRow,
  isPersistedImportRow,
  persistedImportCount,
} from '../lib/utils/scheduleImportUx.ts'

const panel = readFileSync(resolve(process.cwd(), 'components/features/calendar/ScheduleImportPanel.tsx'), 'utf8')

function row(status: ImportBatchRow['status'], sourceRowNumber: number): ImportBatchRow {
  return {
    id: `batch:${sourceRowNumber}`,
    batch_id: 'batch',
    source_row_number: sourceRowNumber,
    original_values: {},
    normalized_values: {
      row_number: sourceRowNumber,
      date: '2026-09-05',
      start_time: '10:00',
      end_time: '13:00',
      brand_name: 'TechGear Pro',
      platform_name: 'TikTok Shop',
      title: 'Flash Sale Week',
      required_host_count: 1,
      required_support_count: 0,
      required_technical_count: 0,
      warnings: status === 'warning' ? ['Ends on the next day.'] : [],
      errors: [],
    },
    status,
    validation_issues: [],
    created_at: '2026-09-05T00:00:00.000Z',
  }
}

test('completion semantics count warning rows as persisted, not unimported', () => {
  const rows = [
    ...Array.from({ length: 44 }, (_, index) => row('imported', index + 1)),
    ...Array.from({ length: 3 }, (_, index) => row('warning', index + 45)),
    ...Array.from({ length: 3 }, (_, index) => row('duplicate_skipped', index + 48)),
  ]
  const counts = batchPresentationCounts(rows)

  assert.equal(persistedImportCount(counts), 47)
  assert.equal(rows.filter(isPersistedImportRow).length, 47)
  assert.equal(rows.filter(isNotImportedResultRow).length, 3)
  assert.equal(rows.filter(rowItem => rowItem.status === 'warning').length, 3)
})

test('warning-only completion has no not-imported rows', () => {
  const rows = [
    ...Array.from({ length: 47 }, (_, index) => row('imported', index + 1)),
    ...Array.from({ length: 3 }, (_, index) => row('warning', index + 48)),
  ]
  const counts = batchPresentationCounts(rows)

  assert.equal(persistedImportCount(counts), 50)
  assert.equal(rows.filter(isNotImportedResultRow).length, 0)
})

test('non-persisted outcomes remain in the not-imported collection', () => {
  const rows = ['duplicate_skipped', 'validation_failed', 'retryable'].map((status, index) => row(status as ImportBatchRow['status'], index + 1))
  assert.deepEqual(rows.filter(isNotImportedResultRow).map(item => item.status), [
    'duplicate_skipped',
    'validation_failed',
    'retryable',
  ])
  assert.equal(rows.filter(isPersistedImportRow).length, 0)
})

test('completion card renders separate persisted-warning and not-imported sections', () => {
  assert.match(panel, /importRowsImportedWithWarnings/)
  assert.match(panel, /importWarningPersistedHelp/)
  assert.match(panel, /schedule-import-warning-rows/)
  assert.match(panel, /schedule-import-not-imported-rows/)
  assert.match(panel, /isNotImportedResultRow/)
  assert.doesNotMatch(panel, /attentionRows/)
})
