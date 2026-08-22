import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildImportBatchRow,
  classifyRowOutcome,
  isRowImported,
  isRowRetryable,
  isScheduleImportDuplicateError,
  mapImportResultToBatchRows,
  rowIdFor,
  scheduleImportFailureCode,
  sourceRowFingerprint,
  summarizeBatchRows,
  summarizeImportResult,
  toPreviewCounters,
} from '../lib/utils/scheduleImportBatch.ts'
import {
  type EntityMaps,
  type ImportPreviewRow,
  parseScheduleTabularData,
} from '../lib/utils/excelUtils.ts'

const maps: EntityMaps = {
  brands: new Map([['Mars Wrigley', 'brand-1'], ['Snickers', 'brand-2']]),
  platforms: new Map([['Shopee Live', 'platform-1'], ['TikTok Shop', 'platform-2']]),
  campaigns: new Map([['World Cup', 'campaign-1']]),
}

const englishHeader = [
  'Date',
  'Start time',
  'End time',
  'Brand',
  'Platform',
  'Campaign',
  'Shift name',
  'Studio',
  'Required Host count',
  'Required Support count',
  'Required Technical count',
]

const scheduleRow = [
  '2026-09-01',
  '09:00',
  '13:00',
  'Mars Wrigley',
  'Shopee Live',
  'World Cup',
  'Morning shift',
  'Studio A',
  1,
  1,
  1,
]

const csvRow = (values: unknown[]) => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')
const withColumn = (row: unknown[], index: number, value: unknown) => row.map((cell, i) => (i === index ? value : cell))

test('stable source-row identity: same values produce the same fingerprint', () => {
  const first = sourceRowFingerprint({ Date: '2026-09-01', Brand: 'Mars Wrigley', Platform: 'Shopee Live' })
  const second = sourceRowFingerprint({ Date: '2026-09-01', Brand: 'Mars Wrigley', Platform: 'Shopee Live' })
  assert.equal(first, second)
})

test('stable source-row identity: different values produce different fingerprints', () => {
  const first = sourceRowFingerprint({ Date: '2026-09-01', Brand: 'Mars Wrigley' })
  const second = sourceRowFingerprint({ Date: '2026-09-02', Brand: 'Mars Wrigley' })
  assert.notEqual(first, second)
})

test('stable source-row identity: is independent of key ordering and dirty spacing', () => {
  const first = sourceRowFingerprint({ Date: '2026-09-01', Brand: 'Mars Wrigley', Platform: 'Shopee Live' })
  const second = sourceRowFingerprint({ Platform: '  shopee live  ', Brand: 'mars wrigley', Date: '2026-09-01' })
  assert.equal(first, second)
})

test('row id is derived from batch id and source row number', () => {
  assert.equal(rowIdFor('batch-1', 7), 'batch-1:7')
})

test('batch summary counts rows by classification', () => {
  const base: ImportPreviewRow = {
    row: {
      row_number: 1,
      date: '2026-09-01',
      start_time: '09:00',
      end_time: '13:00',
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: 'Morning shift',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    },
    shift: {
      date: '2026-09-01',
      start_time: '09:00',
      end_time: '13:00',
      brand_id: 'brand-1',
      platform_id: 'platform-1',
      title: 'Morning shift',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      registration_locked: false,
      allow_multi_role: false,
      status: 'scheduled',
    },
  }
  const imported = buildImportBatchRow('batch-1', base, '2026-08-20T00:00:00Z')
  const failed = buildImportBatchRow('batch-1', {
    ...base,
    shift: undefined,
    row: { ...base.row, row_number: 2, errors: ['Brand "X" was not found.'] },
  }, '2026-08-20T00:00:00Z')
  const skipped = buildImportBatchRow('batch-1', {
    ...base,
    shift: undefined,
    row: { ...base.row, row_number: 3, warnings: ['A shift with the same brand, platform, campaign, studio, date, and time already exists.'] },
  }, '2026-08-20T00:00:00Z')
  const warned = buildImportBatchRow('batch-1', {
    ...base,
    shift: undefined,
    row: { ...base.row, row_number: 4, warnings: ['Advisory note.'] },
  }, '2026-08-20T00:00:00Z')

  const summary = summarizeBatchRows([imported, failed, skipped, warned])
  assert.deepEqual(summary, {
    total_rows: 4,
    imported_rows: 1,
    failed_rows: 1,
    warning_rows: 1,
    duplicate_rows: 1,
    pending_rows: 0,
  })
})

test('imported row classification: a valid row with a shift is imported', () => {
  const result = parseScheduleTabularData(
    `${csvRow(englishHeader)}\n${csvRow(scheduleRow)}`,
    'string',
    maps,
  )
  assert.equal(result.validRows, 1)
  assert.equal(classifyRowOutcome(result.rows[0]), 'imported')
})

test('validation_failed classification: a row with errors is validation_failed', () => {
  const result = parseScheduleTabularData(
    `${csvRow(englishHeader)}\n${csvRow(withColumn(scheduleRow, 3, 'No Such Brand'))}`,
    'string',
    maps,
  )
  assert.equal(classifyRowOutcome(result.rows[0]), 'validation_failed')
})

test('duplicate_skipped classification: a true exact duplicate is skipped', () => {
  const result = parseScheduleTabularData(
    [englishHeader, scheduleRow, scheduleRow].map(csvRow).join('\n'),
    'string',
    maps,
  )
  assert.equal(result.validShifts.length, 1)
  assert.equal(classifyRowOutcome(result.rows[0]), 'imported')
  assert.equal(classifyRowOutcome(result.rows[1]), 'duplicate_skipped')
})

test('warning classification: a valid row without a shift and non-duplicate warnings is warning', () => {
  const preview: ImportPreviewRow = {
    row: {
      row_number: 9,
      date: '2026-09-01',
      start_time: '09:00',
      end_time: '13:00',
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: 'Morning shift',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: ['Advisory note.'],
      errors: [],
    },
  }
  assert.equal(classifyRowOutcome(preview), 'warning')
})

test('retryable logic: pending, validation-failed, and retryable rows can be retried', () => {
  const baseRow = {
    date: '2026-09-01',
    start_time: '09:00',
    end_time: '13:00',
    brand_name: 'Mars Wrigley',
    platform_name: 'Shopee Live',
    title: 'Morning shift',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    warnings: [] as string[],
    errors: [] as string[],
  }
  const rowFor = (row_number: number, status: 'validation_failed' | 'retryable' | 'imported' | 'duplicate_skipped' | 'pending') => ({
    id: `batch-1:${row_number}`,
    batch_id: 'batch-1',
    source_row_number: row_number,
    original_values: {},
    normalized_values: { ...baseRow, row_number },
    status,
    validation_issues: [],
    created_at: '2026-08-20T00:00:00Z',
  })
  assert.equal(isRowRetryable(rowFor(1, 'validation_failed')), true)
  assert.equal(isRowRetryable(rowFor(2, 'pending')), true)
  assert.equal(isRowRetryable(rowFor(3, 'retryable')), true)
  assert.equal(isRowRetryable(rowFor(4, 'imported')), false)
  assert.equal(isRowRetryable(rowFor(5, 'duplicate_skipped')), false)
  assert.equal(isRowImported(rowFor(4, 'imported')), true)
  assert.equal(isRowImported(rowFor(1, 'validation_failed')), false)
})

test('mapping preserves source row number, validation issues, and batch id', () => {
  const result = parseScheduleTabularData(
    `${csvRow(englishHeader)}\n${csvRow(withColumn(scheduleRow, 3, 'No Such Brand'))}`,
    'string',
    maps,
  )
  const rows = mapImportResultToBatchRows('batch-7', result, () => '2026-08-20T00:00:00Z')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].batch_id, 'batch-7')
  assert.equal(rows[0].id, 'batch-7:2')
  assert.equal(rows[0].source_row_number, 2)
  assert.equal(rows[0].status, 'validation_failed')
  assert.ok(rows[0].validation_issues.some(issue => issue.includes('was not found')))
})

test('summarizeImportResult matches parser counts and flags duplicates', () => {
  const result = parseScheduleTabularData(
    [englishHeader, scheduleRow, scheduleRow].map(csvRow).join('\n'),
    'string',
    maps,
  )
  const summary = summarizeImportResult(result)
  assert.equal(summary.total_rows, 2)
  assert.equal(summary.imported_rows, result.validShifts.length)
  assert.equal(summary.duplicate_rows, 1)
  assert.equal(summary.failed_rows, 0)
})

test('existing duplicate semantics remain intact', () => {
  const result = parseScheduleTabularData(
    [englishHeader, scheduleRow, withColumn(scheduleRow, 7, 'Studio B')].map(csvRow).join('\n'),
    'string',
    maps,
  )
  assert.equal(result.validRows, 2)
  assert.equal(result.warningRows, 0)
  assert.equal(result.validShifts.length, 2)
})

test('duplicate error detection only accepts the shifts active-slot constraint', () => {
  assert.equal(
    isScheduleImportDuplicateError({ code: '23505', message: 'duplicate key value violates unique constraint "shifts_active_slot_uidx"' }),
    true,
  )
  assert.equal(
    isScheduleImportDuplicateError(new Error('duplicate key value violates unique constraint "shifts_active_slot_uidx"')),
    true,
  )
  assert.equal(
    isScheduleImportDuplicateError({ code: '23505', message: 'duplicate key value violates unique constraint "shift_registrations_active_role_uidx"' }),
    false,
  )
  assert.equal(isScheduleImportDuplicateError({ code: '23505', message: 'duplicate key' }), false)
  assert.equal(isScheduleImportDuplicateError(new Error('network timeout')), false)
  assert.equal(isScheduleImportDuplicateError({ code: 'SHIFT_REQUEST_FAILED', message: 'permission denied' }), false)
})

test('failure code derivation prefers the error code and falls back to the message', () => {
  assert.equal(scheduleImportFailureCode({ code: 'SHIFT_CONFLICT' }), 'SHIFT_CONFLICT')
  assert.equal(scheduleImportFailureCode(new Error('network timeout')), 'network timeout')
  assert.equal(scheduleImportFailureCode(undefined), 'UNKNOWN')
  assert.equal(scheduleImportFailureCode(null), 'UNKNOWN')
})

test('a row with a shift and warnings classifies as warning, not imported', () => {
  const preview: ImportPreviewRow = {
    row: {
      row_number: 11,
      date: '2026-09-01',
      start_time: '22:00',
      end_time: '02:00',
      brand_name: 'Mars Wrigley',
      platform_name: 'Shopee Live',
      title: 'Overnight shift',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: ['Ends on the next day (2026-09-02).'],
      errors: [],
    },
    shift: {
      date: '2026-09-01',
      start_time: '22:00',
      end_time: '02:00',
      brand_id: 'brand-1',
      platform_id: 'platform-1',
      title: 'Overnight shift',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      registration_locked: false,
      allow_multi_role: false,
      status: 'scheduled',
    },
  }
  assert.equal(classifyRowOutcome(preview), 'warning')
})

test('toPreviewCounters matches the parser validRows and warningRows semantics', () => {
  const counters = toPreviewCounters({
    total_rows: 5,
    imported_rows: 2,
    failed_rows: 1,
    warning_rows: 1,
    duplicate_rows: 1,
    pending_rows: 0,
  })
  assert.deepEqual(counters, {
    total_rows: 5,
    valid_rows: 4,
    invalid_rows: 1,
    warning_rows: 2,
    duplicate_rows: 1,
  })
})
