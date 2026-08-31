import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

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
