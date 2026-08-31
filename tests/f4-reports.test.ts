import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { deriveReportAttention } from '../lib/ui/operational-attention.ts'
import { buildReportActions } from '../lib/ui/action-priority.ts'
import { formatCurrency } from '../lib/utils/currency.ts'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const list = read('components/features/reports/ReportsList.tsx')
const detail = read('components/features/reports/ReportDetailModal.tsx')

test('F4 report list exposes operational identity and freshness without new data sources', () => {
  assert.match(list, /data-testid="report-card"/)
  assert.match(list, /shift\.title \|\| t\('finalReport'\)/)
  assert.match(list, /nameById\(brands, shift\.brand_id\)/)
  assert.match(list, /nameById\(platforms, shift\.platform_id\)/)
  assert.match(list, /nameById\(campaigns, shift\.campaign_id\)/)
  assert.match(list, /reportUpdatedAt/)
  assert.match(list, /Promise\.all\(/)
})

test('F4 uses canonical report statuses and keeps workflow status separate from metrics confirmation', () => {
  assert.match(detail, /function getReportStatus\(report: Report\): ReportStatus/)
  assert.match(detail, /translateReportStatus/)
  assert.match(detail, /data-testid="report-status-summary"/)
  assert.match(list, /const reportStatus = report\.status \|\| \(report\.metrics_confirmed \? 'confirmed' : 'draft'\)/)
  assert.match(list, /data-report-status=\{reportStatus\}/)
})

test('F4 action model keeps report mutations permission/state gated', () => {
  const actions = buildReportActions(
    { status: 'confirmed', canDelete: false, canExport: true },
    { onView: () => undefined, onExport: () => undefined },
    { view: 'View', archive: 'Archive', delete: 'Delete', export: 'Export' },
  )
  assert.deepEqual(actions.map(action => action.key), ['view', 'export'])
  assert.match(list, /hasPermission\(currentUser, 'reports\.review'\)/)
  assert.match(list, /hasPermission\(currentUser, 'reports\.export'\)/)
})

test('F4 attention excludes healthy and terminal reports', () => {
  assert.deepEqual(deriveReportAttention('r1', 'confirmed', '2032-01-01'), [])
  assert.deepEqual(deriveReportAttention('r2', 'archived', '2032-01-01'), [])
  assert.equal(deriveReportAttention('r3', 'draft', '2032-01-01').length, 1)
  assert.equal(deriveReportAttention('r4', 'reopened', '2032-01-01').length, 1)
})

test('F4 distinguishes empty data from filtered results and settles failures', () => {
  assert.match(list, /data-testid="reports-empty-state"/)
  assert.match(list, /t\('noReportsYet'\)/)
  assert.match(list, /t\('noMatchingReports'\)/)
  assert.match(list, /data-testid="reports-loading"/)
  assert.match(list, /reportLoadError/)
  assert.match(list, /PageLoadError/)
})

test('F4 preserves zero as a value and keeps unavailable optional data distinct', () => {
  assert.match(formatCurrency(0), /0/)
  assert.match(detail, /report\.likes\?\.toLocaleString\(\) \?\?/)
  assert.match(detail, /t\('noData'\)/)
})

test('F4 keeps OCR evidence progressive and report detail controls accessible', () => {
  assert.match(detail, /defaultCollapsed = true/)
  assert.match(detail, /data-testid="toggle-raw-ocr-collapse"/)
  assert.match(detail, /data-testid="export-report-detail"/)
  assert.match(detail, /DialogTitle/)
  assert.match(detail, /data-testid="report-summary"/)
})
