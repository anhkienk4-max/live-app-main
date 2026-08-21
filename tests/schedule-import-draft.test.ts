import assert from 'node:assert/strict'
import test from 'node:test'

import {
  type EntityMaps,
  parseScheduleRows,
} from '../lib/utils/excelUtils.ts'
import {
  buildScheduleImportPreviewSourceRow,
  normalizeScheduleImportResult,
} from '../lib/utils/scheduleImportPreview.ts'
import {
  commitRowDraftToSource,
  removeRowDraft,
  rowDraftValue,
  updateRowDraft,
} from '../lib/utils/scheduleImportDraft.ts'

const maps: EntityMaps = {
  brands: new Map([['Mars Wrigley', 'brand-1']]),
  platforms: new Map([['Shopee Live', 'platform-1']]),
  campaigns: new Map([['World Cup', 'campaign-1']]),
}

const sourceRow = (overrides: Record<string, unknown> = {}) => ({
  Date: '2026-09-01',
  'Start time': '09:00',
  'End time': '13:00',
  Brand: 'Mars Wrigley',
  Platform: 'Shopee Live',
  Campaign: 'World Cup',
  'Shift title': 'Morning shift',
  Studio: 'Studio A',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  Notes: '',
  ...overrides,
})

const parseSourceRows = (rows: Record<string, unknown>[]) =>
  normalizeScheduleImportResult(parseScheduleRows(rows, maps))

const commitDraft = (committed: ReturnType<typeof parseSourceRows>, rowNumber: number, draftRow: ReturnType<typeof updateRowDraft>[number]) => {
  const sourceRows = [buildScheduleImportPreviewSourceRow(committed.rows[0].row)]
  sourceRows[0] = commitRowDraftToSource(sourceRows[0], draftRow)
  return parseSourceRows(sourceRows)
}

test('editing a time does not recompute committed validity mid-type', () => {
  const committed = parseSourceRows([sourceRow()])
  assert.equal(committed.validRows, 1)
  const committedJson = JSON.stringify(committed)
  const row = committed.rows[0].row
  const rowNumber = row.row_number

  const draft = updateRowDraft({}, rowNumber, row, 'end_time', '1')

  assert.equal(JSON.stringify(committed), committedJson)
  assert.equal(committed.validRows, 1)
  assert.equal(committed.rows[0].row.errors.length, 0)
  assert.equal(rowDraftValue(draft, rowNumber, 'end_time', row.end_time), '1')
  assert.equal(row.end_time, '13:00')
})

test('an unconfirmed draft is not persisted and leaves committed counts unchanged', () => {
  const committed = parseSourceRows([sourceRow({ Brand: 'Missing Brand' })])
  assert.equal(committed.validRows, 0)
  assert.equal(committed.invalidRows, 1)
  const row = committed.rows[0].row
  const rowNumber = row.row_number

  const draft = updateRowDraft({}, rowNumber, row, 'end_time', '14:00')

  assert.equal(committed.validRows, 0)
  assert.equal(committed.invalidRows, 1)
  assert.equal(committed.rows[0].row.errors.length, row.errors.length)
  assert.equal(rowDraftValue(draft, rowNumber, 'end_time', row.end_time), '14:00')
})

test('confirming a draft commits it once and revalidates the row', () => {
  const committed = parseSourceRows([sourceRow()])
  const row = committed.rows[0].row
  const rowNumber = row.row_number

  const draft = updateRowDraft({}, rowNumber, row, 'end_time', '14:00')
  const draftRow = draft[rowNumber]
  assert.ok(draftRow)
  const next = commitDraft(committed, rowNumber, draftRow)

  assert.equal(next.rows[0].row.end_time, '14:00')
  assert.equal(next.rows[0].row.errors.length, 0)
  assert.equal(next.validRows, 1)
  assert.equal(next.validShifts[0].end_time, '14:00')
})

test('cancelling a draft restores the committed value and validation', () => {
  const committed = parseSourceRows([sourceRow()])
  const row = committed.rows[0].row
  const rowNumber = row.row_number

  const draft = updateRowDraft({}, rowNumber, row, 'end_time', '14:00')
  const afterCancel = removeRowDraft(draft, rowNumber)

  assert.ok(!(rowNumber in afterCancel))
  assert.equal(rowDraftValue(afterCancel, rowNumber, 'end_time', row.end_time), row.end_time)
  assert.equal(committed.rows[0].row.end_time, '13:00')
  assert.equal(committed.validRows, 1)
})

test('fixing one field leaves unrelated row errors intact', () => {
  const committed = parseSourceRows([sourceRow({ Brand: 'No Such Brand', 'End time': '25:00' })])
  const row = committed.rows[0].row
  const rowNumber = row.row_number
  assert.match(row.errors.join(' '), /was not found/)
  assert.match(row.errors.join(' '), /End time/)

  const draft = updateRowDraft({}, rowNumber, row, 'end_time', '14:00')
  const draftRow = draft[rowNumber]
  assert.ok(draftRow)
  const next = commitDraft(committed, rowNumber, draftRow)
  const errors = next.rows[0].row.errors.join(' ')

  assert.equal(next.rows[0].row.end_time, '14:00')
  assert.match(errors, /was not found/)
  assert.doesNotMatch(errors, /End time/)
})

test('import button enablement uses committed validation only', () => {
  const committed = parseSourceRows([sourceRow({ Brand: 'No Such Brand', 'End time': '25:00' })])
  const row = committed.rows[0].row
  const rowNumber = row.row_number

  const draft = updateRowDraft({}, rowNumber, row, 'end_time', '14:00')
  const fixed = updateRowDraft(draft, rowNumber, row, 'brand_name', 'Mars Wrigley')

  assert.equal(committed.validRows, 0)
  assert.equal(committed.invalidRows, 1)

  const draftRow = fixed[rowNumber]
  assert.ok(draftRow)
  const next = commitDraft(committed, rowNumber, draftRow)
  assert.equal(next.validRows, 1)
  assert.equal(next.invalidRows, 0)
})