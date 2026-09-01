import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { importShiftsFromGoogleSheetsUrl, parseScheduleRows } from '../lib/utils/excelUtils.ts'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery.ts'
import { mapImportResultToBatchRows, summarizeImportResult } from '../lib/utils/scheduleImportBatch.ts'
import { scheduleImportBatchPort } from '../lib/services/scheduleImportBatchPort.ts'
import type { Shift } from '../lib/types/database.types.ts'
import {
  batchPresentationCounts,
  previewPresentationCounts,
  previewPresentationStatus,
  presentationStatusIsException,
} from '../lib/utils/scheduleImportUx.ts'
import type { ImportBatchRow } from '../lib/utils/scheduleImportBatch.ts'
import type { ImportPreviewRow, ImportResult } from '../lib/utils/excelUtils.ts'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const panel = read('components/features/calendar/ScheduleImportPanel.tsx')
const excelUtils = read('lib/utils/excelUtils.ts')
const scheduleExport = read('lib/utils/scheduleExportUtils.ts')
const history = panel.slice(panel.indexOf('export function ImportHistoryPanel'))

function preview(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    row: {
      row_number: 2,
      date: '2026-08-25',
      start_time: '14:00',
      end_time: '16:00',
      end_date: '2026-08-25',
      crosses_midnight: false,
      duration_minutes: 120,
      brand_id: 'brand-1',
      brand_name: 'Brand',
      platform_id: 'platform-1',
      platform_name: 'Platform',
      campaign_id: 'campaign-1',
      campaign_name: 'Campaign',
      title: 'Shift',
      studio: 'Studio',
      notes: '',
      host_names: [],
      assistant_names: [],
      technical_names: [],
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      errors: [],
      warnings: [],
    },
    ...overrides,
  }
}

function result(rows: ImportPreviewRow[]): ImportResult {
  return {
    success: true,
    rows,
    validShifts: rows.flatMap(row => row.shift ? [row.shift] : []),
    errors: [],
    warnings: [],
    totalRows: rows.length,
    validRows: rows.filter(row => row.row.errors.length === 0).length,
    invalidRows: rows.filter(row => row.row.errors.length > 0).length,
    warningRows: rows.filter(row => row.row.warnings.length > 0).length,
  }
}

test('F6 defines explicit input formats and business-time guidance', () => {
  assert.match(panel, /accept="\.xlsx,\.xls"/)
  assert.match(panel, /importShiftsFromGoogleSheetsUrl/)
  assert.match(panel, /importDateTimeHelp/)
  assert.match(panel, /aria-label=\{t\('importFormatExcel'\)\}/)
  assert.match(panel, /aria-label=\{t\('importFormatGoogle'\)\}/)
})

test('F6 uses the package-supported XLSX namespace import across import/export utilities', () => {
  assert.match(excelUtils, /^import \* as XLSX from 'xlsx'/m)
  assert.match(scheduleExport, /^import \* as XLSX from 'xlsx'/m)
  assert.doesNotMatch(excelUtils, /^import XLSX from 'xlsx'/m)
  assert.doesNotMatch(scheduleExport, /^import XLSX from 'xlsx'/m)
  assert.doesNotMatch(excelUtils, /XLSX\.default/)
})

test('F6 separates preview from persistence and requires an explicit confirmation action', () => {
  assert.match(panel, /batchPreviewState/)
  assert.match(panel, /data-testid="schedule-import-preview-state"/)
  assert.match(panel, /data-testid="schedule-import-confirm-summary"/)
  assert.match(panel, /scheduleImportBatchPort\.createBatch/)
  assert.match(panel, /scheduleImportBatchPort\.markBatchStatus\(batch\.id, 'confirmed'\)/)
  assert.match(panel, /disabled=\{busy \|\| result\.invalidRows > 0 \|\| result\.validRows === 0\}/)
})

test('F6 maps row outcomes to human states and preserves duplicate/retryable semantics', () => {
  const ready = preview({ shift: { id: 'shift-1' } as ImportPreviewRow['shift'] })
  const warning = preview({ row: { ...preview().row, warnings: ['Needs review'] } })
  const invalid = preview({ row: { ...preview().row, errors: [{ row: 2, field: 'date', message: 'Invalid date' }] } })
  const duplicate = preview({ duplicateCandidate: { id: 'existing' } as ImportPreviewRow['duplicateCandidate'] })
  assert.equal(previewPresentationStatus(ready), 'ready')
  assert.equal(previewPresentationStatus(warning), 'warning')
  assert.equal(previewPresentationStatus(invalid), 'invalid')
  assert.equal(previewPresentationStatus(duplicate), 'duplicate')
  assert.equal(presentationStatusIsException('retryable'), true)
  assert.equal(presentationStatusIsException('ready'), false)
  assert.deepEqual(previewPresentationCounts(result([ready, warning, invalid, duplicate])), {
    total: 4, ready: 1, warning: 1, invalid: 1, duplicate: 1, retryable: 0, imported: 0,
  })
  assert.match(panel, /duplicatePreserved/)
  assert.match(panel, /retryableRecovery/)
  assert.doesNotMatch(panel, /row\.failure_code\.replaceAll/)
})

test('F6 completion summary distinguishes imported rows from exceptions', () => {
  const rows = [
    { id: '1', batch_id: 'b', source_row_number: 2, original_values: {}, normalized_values: {} as never, status: 'imported', validation_issues: [], created_at: '' },
    { id: '2', batch_id: 'b', source_row_number: 3, original_values: {}, normalized_values: {} as never, status: 'retryable', validation_issues: [], failure_code: 'SHIFT_CREATE_FAILED', created_at: '' },
    { id: '3', batch_id: 'b', source_row_number: 4, original_values: {}, normalized_values: {} as never, status: 'duplicate_skipped', validation_issues: [], created_at: '' },
  ] satisfies ImportBatchRow[]
  assert.deepEqual(batchPresentationCounts(rows), {
    total: 3, ready: 0, warning: 0, invalid: 0, duplicate: 1, retryable: 1, imported: 1,
  })
  assert.match(panel, /data-testid="schedule-import-result"/)
  assert.match(panel, /importPartialSuccess/)
  assert.match(panel, /importNothingPersisted/)
  assert.match(panel, /importRowsNotCreated/)
})

test('F6 prevents duplicate submit and keeps loading/error/empty states accessible', () => {
  assert.match(panel, /disabled=\{busy \|\| !masterGate\.allowed\}/)
  assert.match(panel, /role="status" aria-live="polite" data-testid="schedule-import-processing"/)
  assert.match(panel, /role="alert" data-testid="schedule-import-master-error"/)
  assert.match(panel, /data-testid="schedule-import-mobile-rows"/)
  assert.match(panel, /importNoRows/)
  assert.match(panel, /importNoMatchingRows/)
  assert.match(panel, /importSearchRows/)
  assert.match(panel, /previewSearch\.trim\(\)\.toLocaleLowerCase\(\)/)
  assert.match(history, /data-testid="schedule-import-history-loading"/)
  assert.match(history, /new Error\(t\('importLoadError'\)\)/)
  assert.match(history, /batchStatusLabel\(batch\.status, t\)/)
  assert.match(history, /Asia\/Ho_Chi_Minh/)
})

test('F6 gives import actions and editable rows unique accessible names', () => {
  assert.match(panel, /aria-label=\{`\$\{t\('confirmImport'\)\} \(\$\{result\.validRows\}\)`\}/)
  assert.match(panel, /aria-label=\{t\('confirmImport'\)\}/)
  assert.equal((panel.match(/onClick=\{confirmImport\}/g) || []).length, 2)
  assert.match(panel, /aria-label=\{`Row \$\{rowNumber\} date`\}/)
  assert.match(panel, /aria-label=\{`Row \$\{rowNumber\} start time`\}/)
  assert.match(panel, /aria-label=\{ariaLabel\}/)
  assert.doesNotMatch(panel, /tabIndex=\{?\d/)
})

test('F6 retains native tab semantics, filter pressed state, and live completion status', () => {
  assert.match(history, /<Tabs defaultValue="imports">/)
  assert.match(history, /<TabsList>/)
  assert.match(history, /<TabsTrigger value="imports">/)
  assert.match(panel, /aria-pressed=\{previewFilter === filter\}/)
  assert.match(panel, /<Card data-testid="schedule-import-result" role="status" aria-live="polite"/)
  assert.match(panel, /completedImportRef\.current\?\.focus\(\)/)
  assert.match(panel, /ref=\{completedImportRef\} tabIndex=\{-1\}/)
  assert.match(panel, /role="status" aria-live="polite" data-testid="schedule-import-processing"/)
  assert.match(panel, /role="alert" data-testid="schedule-import-master-error"/)
  assert.match(panel, /role="status">\{result\.rows\.length === 0 \? t\('importNoRows'\) : t\('importNoMatchingRows'\)\}/)
})

test('F6 keeps import access behind the existing permission contract and does not add fetch loops', () => {
  assert.match(panel, /hasPermission\(currentUser, 'shifts\.import'\)/)
  assert.match(panel, /Promise\.all\(\[/)
  assert.doesNotMatch(panel, /setInterval\(/)
  assert.doesNotMatch(panel, /setTimeout\(/)
})

test('F6 retains E/F architecture integration points', () => {
  const dashboard = read('components/features/calendar/CalendarView.tsx')
  const reports = read('components/features/reports/ReportFormModal.tsx')
  const live = read('components/features/live/LiveMonitoringDashboard.tsx')
  assert.match(dashboard, /FileSpreadsheet/)
  assert.match(panel, /ImportHistoryPanel/)
  assert.match(reports, /useTranslation|hasPermission/)
  assert.match(live, /live-session-attention|Promise\.all/)
})

test('F6 mock confirmation persists one shift, history, and is repeat-safe', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'

  try {
    const brands = new Map([['TechGear Pro', 'brand-techgear']])
    const platforms = new Map([['TikTok Shop', 'platform-tiktok']])
    const campaigns = new Map([['Flash Sale Week', 'campaign-flash-sale']])
    const previewResult = await importShiftsFromGoogleSheetsUrl(
      'mock://schedule',
      brands,
      platforms,
      campaigns,
    )

    assert.equal(previewResult.validRows, 1)
    assert.equal(previewResult.invalidRows, 0)
    assert.equal(previewResult.rows[0]?.row.brand_name, 'TechGear Pro')
    assert.equal(previewResult.rows[0]?.row.platform_name, 'TikTok Shop')
    assert.equal(previewResult.rows[0]?.row.campaign_name, 'Flash Sale Week')
    const candidate = previewResult.rows[0]?.shift
    assert.ok(candidate)
    assert.equal(candidate.brand_id, 'brand-techgear')
    assert.equal(candidate.platform_id, 'platform-tiktok')
    assert.equal(candidate.campaign_id, 'campaign-flash-sale')
    assert.equal(candidate.start_time, '10:00')
    assert.equal(candidate.end_time, '13:00')
    assert.equal(candidate.start_at, `${candidate.date}T10:00:00`)
    assert.equal(candidate.end_at, `${candidate.date}T13:00:00`)

    const batch = await scheduleImportBatchPort.createBatch({
      source: 'google_sheets',
      sourceName: 'mock://schedule',
      createdBy: '1',
      summary: summarizeImportResult(previewResult),
      previewRows: previewResult.rows.map(item => item.row),
    })
    await scheduleImportBatchPort.recordBatchRows(
      batch.id,
      mapImportResultToBatchRows(batch.id, previewResult),
    )

    const calendarShifts: Shift[] = []
    let createCalls = 0
    const firstRun = await processScheduleImportRows({
      batchId: batch.id,
      previews: previewResult.rows,
      batchRows: await scheduleImportBatchPort.listBatchRows(batch.id),
      initialShifts: [],
      createShift: async data => {
        createCalls += 1
        const created = {
          ...data,
          id: `mock-import-shift-${createCalls}`,
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-09-01T00:00:00.000Z',
        } as Shift
        calendarShifts.push(created)
        return created
      },
      refreshShifts: async () => [...calendarShifts],
      recordOutcome: async ({ rowNumber, outcome, expectedOutcome, shiftId, failureCode }) => {
        await scheduleImportBatchPort.recordRowOutcome(batch.id, rowNumber, outcome, {
          expectedOutcome,
          shiftId,
          failureCode,
        })
      },
    })

    assert.equal(firstRun.imported, 1)
    assert.equal(firstRun.retryable, 0)
    assert.equal(calendarShifts.length, 1)
    const confirmed = await scheduleImportBatchPort.markBatchStatus(batch.id, 'confirmed')
    assert.equal(confirmed?.status, 'confirmed')
    const history = await scheduleImportBatchPort.listBatches()
    const historyEntry = history.find(item => item.id === batch.id)
    assert.equal(historyEntry?.source_name, 'mock://schedule')
    assert.equal(historyEntry?.total_rows, 1)
    assert.equal(historyEntry?.imported_rows, 1)
    assert.equal(historyEntry?.failed_rows, 0)
    assert.equal(historyEntry?.status, 'confirmed')

    const finalRows = await scheduleImportBatchPort.listBatchRows(batch.id)
    assert.equal(finalRows.length, 1)
    assert.equal(finalRows[0]?.status, 'imported')
    assert.equal(finalRows[0]?.resulting_shift_id, calendarShifts[0]?.id)
    assert.equal(calendarShifts[0]?.title, 'Imported Google Sheets shift')
    assert.equal(calendarShifts[0]?.date, previewResult.rows[0]?.row.date)
    assert.equal(calendarShifts[0]?.brand_id, 'brand-techgear')
    assert.equal(calendarShifts[0]?.platform_id, 'platform-tiktok')
    assert.equal(calendarShifts[0]?.campaign_id, 'campaign-flash-sale')

    const secondRun = await processScheduleImportRows({
      batchId: batch.id,
      previews: previewResult.rows,
      batchRows: finalRows,
      initialShifts: calendarShifts,
      createShift: async data => {
        createCalls += 1
        return { ...data, id: `unexpected-${createCalls}` } as Shift
      },
      refreshShifts: async () => [...calendarShifts],
      recordOutcome: async ({ rowNumber, outcome, expectedOutcome, shiftId, failureCode }) => {
        await scheduleImportBatchPort.recordRowOutcome(batch.id, rowNumber, outcome, {
          expectedOutcome,
          shiftId,
          failureCode,
        })
      },
    })
    assert.equal(secondRun.finalizedSkipped, 1)
    assert.equal(createCalls, 1)
    assert.equal((await scheduleImportBatchPort.listBatchRows(batch.id)).length, 1)
  } finally {
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('F6 aggregates mixed outcomes without contradicting row states', () => {
  const ready = preview({ shift: { id: 'ready' } as ImportPreviewRow['shift'] })
  const warning = preview({
    row: { ...preview().row, row_number: 3, warnings: ['Ends on the next day.'] },
    shift: { id: 'warning' } as ImportPreviewRow['shift'],
  })
  const invalid = preview({
    row: { ...preview().row, row_number: 4, errors: [{ row: 4, field: 'date', message: 'Date is required.' }] },
  })
  const duplicate = preview({
    row: { ...preview().row, row_number: 5, warnings: ['A matching shift already exists.'] },
    duplicateCandidate: { id: 'existing' } as ImportPreviewRow['duplicateCandidate'],
  })
  const rows = mapImportResultToBatchRows('mixed-batch', result([ready, warning, invalid, duplicate]), () => '2026-09-01T00:00:00.000Z')
  rows.push({ ...rows[0]!, id: 'mixed-batch:6', source_row_number: 6, status: 'retryable', failure_code: 'TEMPORARY_FAILURE' })

  assert.deepEqual(batchPresentationCounts(rows), {
    total: 5,
    ready: 0,
    warning: 1,
    invalid: 1,
    duplicate: 1,
    retryable: 1,
    imported: 1,
  })
  const counts = batchPresentationCounts(rows)
  assert.equal(
    counts.imported + counts.warning + counts.invalid + counts.duplicate + counts.retryable,
    counts.total,
  )
})

test('F6 validation failure is preserved without creating a shift', async () => {
  const invalid = preview({
    row: { ...preview().row, errors: [{ row: 2, field: 'brand', message: 'Brand is required.' }] },
  })
  const batchRows = mapImportResultToBatchRows('invalid-batch', result([invalid]))
  let createCalls = 0
  const processed = await processScheduleImportRows({
    batchId: 'invalid-batch',
    previews: [invalid],
    batchRows,
    initialShifts: [],
    createShift: async data => {
      createCalls += 1
      return { ...data, id: 'unexpected' } as Shift
    },
    refreshShifts: async () => [],
    recordOutcome: async () => { throw new Error('validation row must not be written') },
  })

  assert.equal(createCalls, 0)
  assert.equal(processed.imported, 0)
  assert.equal(processed.retryable, 0)
  assert.equal(batchRows[0]?.status, 'validation_failed')
  assert.deepEqual(batchRows[0]?.validation_issues, [{ row: 2, field: 'brand', message: 'Brand is required.' }])
})

test('F6 warning remains importable and is persisted as warning', async () => {
  const warning = preview({
    row: { ...preview().row, warnings: ['Ends on the next day.'] },
    shift: { id: 'candidate' } as ImportPreviewRow['shift'],
  })
  const batchRows = mapImportResultToBatchRows('warning-batch', result([warning]))
  batchRows[0] = { ...batchRows[0]!, status: 'pending' }
  const outcomes: string[] = []
  const processed = await processScheduleImportRows({
    batchId: 'warning-batch',
    previews: [warning],
    batchRows,
    initialShifts: [],
    createShift: async data => ({ ...data, id: 'warning-shift' } as Shift),
    refreshShifts: async () => [],
    recordOutcome: async ({ outcome }) => { outcomes.push(outcome) },
  })

  assert.equal(processed.imported, 1)
  assert.equal(processed.retryable, 0)
  assert.deepEqual(outcomes, ['warning'])
})

test('F6 empty import produces a controlled zero-row result', () => {
  const empty = parseScheduleRows([], {
    brands: new Map(),
    platforms: new Map(),
    campaigns: new Map(),
  })
  assert.equal(empty.success, true)
  assert.equal(empty.totalRows, 0)
  assert.equal(empty.validRows, 0)
  assert.equal(empty.invalidRows, 0)
  assert.deepEqual(empty.rows, [])
})
