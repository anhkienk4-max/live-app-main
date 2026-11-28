import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const reportsListSource = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')
const reportDetailModalSource = readFileSync(new URL('../components/features/reports/ReportDetailModal.tsx', import.meta.url), 'utf8')
const reportNotesReviewSource = readFileSync(new URL('../components/features/reports/ReportOperationalNotesReview.tsx', import.meta.url), 'utf8')

test('Agency filter contract: options match Lane01 backend allowlist [ada, snap, live_ai]', () => {
  // Option definitions must strictly provide ada, snap, live_ai
  assert.match(reportsListSource, /data-testid="filter-agency"/)
  assert.match(reportsListSource, /\{ id: 'ada', name: 'ADA' \}/)
  assert.match(reportsListSource, /\{ id: 'snap', name: 'SNAP' \}/)
  assert.match(reportsListSource, /\{ id: 'live_ai', name: 'Live AI' \}/)
})

test('Agency filter contract: empty array omitted, non-empty array serialized without client fallback', () => {
  // Encoded filters must omit empty array so backend Zod .min(1) is not violated
  assert.match(reportsListSource, /agencyCodes: filters\.agencyCodes\.length \? filters\.agencyCodes : undefined/)
  // URL serialization handles comma-joined string or null
  assert.match(reportsListSource, /changes\[key\] = Array\.isArray\(field\) \? \(field\.length \? field\.join\(','\) : null\) : \(field \|\| null\)/)
})

test('Agency filter contract: filter apply/reset resets pagination and protects against stale async responses', () => {
  assert.match(reportsListSource, /const applyFilters = React\.useCallback\(\(\) => \{/)
  assert.match(reportsListSource, /setReportPage\(1\)/)
  assert.match(reportsListSource, /setQueuePage\(1\)/)
  assert.match(reportsListSource, /const requestVersion = React\.useRef\(0\)/)
  assert.match(reportsListSource, /const version = \+\+requestVersion\.current/)
  assert.match(reportsListSource, /if \(version !== requestVersion\.current\) return/)
})

test('Agency filter contract: scope banners cover Admin, Leader, and Member roles', () => {
  assert.match(reportsListSource, /data-testid="reports-admin-scope-banner"/)
  assert.match(reportsListSource, /data-testid="reports-leader-scope-banner"/)
  assert.match(reportsListSource, /data-testid="reports-member-scope-banner"/)
})

test('Deep link report selection: supports reports_report_id and report_id with automatic detail loader', () => {
  assert.match(reportsListSource, /searchParams\.get\('reports_report_id'\) \|\| searchParams\.get\('report_id'\)/)
  assert.match(reportsListSource, /reportService\.getById\(deepLinkReportId\)/)
  assert.match(reportDetailModalSource, /initialTab\?: string/)
  assert.match(reportDetailModalSource, /availableRevisions=\{loadedRevisions\.map\(r => \(\{ version: r\.version, createdAt: r\.created_at \}\)\)\}/)
})

test('External report summary: renders approved external summary with privacy boundary and revision comparison', () => {
  assert.match(reportNotesReviewSource, /data-testid="report-approved-external-summary"/)
  assert.match(reportNotesReviewSource, /data-testid="preview-audience-external-btn"/)
  assert.match(reportNotesReviewSource, /data-testid="preview-audience-internal-btn"/)
  assert.match(reportNotesReviewSource, /data-testid="report-revision-selector-bar"/)
  assert.match(reportNotesReviewSource, /data-testid="immutable-revision-badge"/)
  assert.match(reportNotesReviewSource, /data-testid="historical-revision-immutable-notice"/)
})
