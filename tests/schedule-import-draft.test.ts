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
  'Execution Source': 'Internal',
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

test('editing Agency synchronizes Execution Source and preserves custom fields', () => {
  for (const [code, expectedSource, expectedLabel] of [
    ['ada', 'internal', 'ADA'],
    ['snap', 'agency', 'SNAP'],
    ['live_ai', 'agency', 'Live AI'],
  ] as const) {
    const committed = parseSourceRows([sourceRow({ 'Execution Source': '' })])
    const row = committed.rows[0].row
    const draft = updateRowDraft({}, row.row_number, row, 'agency_code', code)
    const nextSource = commitRowDraftToSource(buildScheduleImportPreviewSourceRow(row), draft[row.row_number])
    const parsed = parseSourceRows([nextSource])

    assert.equal(parsed.rows[0].row.execution_source, expectedSource)
    assert.equal(parsed.rows[0].row.agency_code, code)
    assert.equal(parsed.rows[0].row.custom_fields?.Agency, expectedLabel)
  }
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

test('draft changes remain preserved across simulated page navigation', () => {
  const rows = Array.from({ length: 60 }, (_, i) =>
    sourceRow({ 'Shift title': `Shift #${i + 1}` }),
  )
  const committed = parseSourceRows(rows)
  const rowPage1 = committed.rows[0].row
  const rowNumber = rowPage1.row_number

  // User edits row on page 1
  const drafts = updateRowDraft({}, rowNumber, rowPage1, 'title', 'Renamed Morning Shift')

  // User navigates to page 2 (rows 51-60)
  const page2Slice = committed.rows.slice(50, 60)
  assert.equal(page2Slice.length, 10)

  // Drafts map is not cleared by page navigation
  assert.ok(rowNumber in drafts)

  // User navigates back to page 1
  const activeValue = rowDraftValue(drafts, rowNumber, 'title', rowPage1.title)
  assert.equal(activeValue, 'Renamed Morning Shift')
})

test('adding, modifying and removing a custom column preserves canonical fields', () => {
  const committed = parseSourceRows([sourceRow()])
  let row = buildScheduleImportPreviewSourceRow(committed.rows[0].row)

  // 1. Add custom column
  row.custom_fields = { ...((row.custom_fields as Record<string, string> | undefined) ?? {}), 'Ghi chú vận hành': 'Cần chuẩn bị quà' }
  let parsed = parseSourceRows([row])
  assert.equal(parsed.rows[0].row.custom_fields?.['Ghi chú vận hành'], 'Cần chuẩn bị quà')
  assert.equal(parsed.rows[0].row.title, 'Morning shift')

  // 2. Modify custom column via draft
  const draft = updateRowDraft({}, parsed.rows[0].row.row_number, parsed.rows[0].row, 'custom:Ghi chú vận hành', 'Đã chuẩn bị xong quà')
  const draftRow = draft[parsed.rows[0].row.row_number]
  assert.ok(draftRow)
  row = commitRowDraftToSource(row, draftRow)
  parsed = parseSourceRows([row])
  assert.equal(parsed.rows[0].row.custom_fields?.['Ghi chú vận hành'], 'Đã chuẩn bị xong quà')

  // 3. Remove custom column
  const fields = { ...((row.custom_fields as Record<string, string> | undefined) ?? {}) }
  delete fields['Ghi chú vận hành']
  row.custom_fields = fields
  parsed = parseSourceRows([row])
  assert.equal(parsed.rows[0].row.custom_fields?.['Ghi chú vận hành'], undefined)
  assert.equal(parsed.rows[0].row.brand_name, 'Mars Wrigley')
  assert.equal(parsed.rows[0].row.validRows ?? parsed.validRows, 1)
})

test('bulk updates apply to selected rows while preserving unselected rows and unrelated fields', () => {
  const rows = [
    sourceRow({ 'Shift title': 'Shift 1', 'Execution Source': 'Internal' }),
    sourceRow({ 'Shift title': 'Shift 2', 'Execution Source': 'Internal' }),
    sourceRow({ 'Shift title': 'Shift 3', 'Execution Source': 'Internal' }),
  ]
  const committed = parseSourceRows(rows)
  const sourceRows = committed.rows.map(p => buildScheduleImportPreviewSourceRow(p.row))

  // Select row 1 and row 3, bulk update Agency and Execution Source
  const selected = new Set([committed.rows[0].row.row_number, committed.rows[2].row.row_number])

  sourceRows.forEach((row, index) => {
    const rowNum = committed.rows[index].row.row_number
    if (selected.has(rowNum)) {
      row['Execution Source'] = 'agency'
      const customFields = { ...((row.custom_fields as Record<string, string> | undefined) ?? {}) }
      customFields.Agency = 'SNAP'
      row.custom_fields = customFields
    }
  })

  const updated = parseSourceRows(sourceRows)
  assert.equal(updated.rows[0].row.execution_source, 'agency')
  assert.equal(updated.rows[0].row.custom_fields?.Agency, 'SNAP')
  assert.equal(updated.rows[0].row.title, 'Shift 1')

  assert.equal(updated.rows[1].row.execution_source, 'internal')
  assert.equal(updated.rows[1].row.custom_fields?.Agency, undefined)
  assert.equal(updated.rows[1].row.title, 'Shift 2')

  assert.equal(updated.rows[2].row.execution_source, 'agency')
  assert.equal(updated.rows[2].row.custom_fields?.Agency, 'SNAP')
  assert.equal(updated.rows[2].row.title, 'Shift 3')
})
