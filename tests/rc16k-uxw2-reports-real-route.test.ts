import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync('lib/utils/lazyComponents.tsx', 'utf8')
const container = readFileSync('components/features/reports/ReportsContainer.tsx', 'utf8')
const view = readFileSync('components/features/reports/ReportsView.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20261014233900_rc16k_reports_summary.sql', 'utf8')

test('real /reports entrypoint fetches bounded pages', () => {
  assert.match(route, /import\('@\/components\/features\/reports\/ReportsContainer'\)/)
  assert.match(container, /reportService\.getFilteredPage\(/)
  assert.match(container, /<ReportShiftPicker/)
  assert.doesNotMatch(container, /getReportCandidates\(/)
  assert.match(container, /shiftRegistrationService\.getForShifts\(/)
  assert.doesNotMatch(container, /(?:reportService|shiftService|shiftRegistrationService)\.getAll\(\)/)
  assert.match(view, /serverPaged \? reports : reports\.slice/)
  assert.match(view, /total=\{total\}/)
})
test('aggregates and full exports cannot silently become page-only results', () => {
  assert.match(container, /reportTotal\.toLocaleString\(\)/)
  assert.match(container, /reportSummary\?\.revenue/)
  assert.match(container, /reportSummary\?\.aov/)
  assert.match(container, /reportService\.getAllFiltered\(/)
  assert.match(container, /exportReportsToExcel\(allReports, context\)/)
  assert.match(migration, /'summary'/)
  assert.match(migration, /s\.title/)
})
test('deep links may target reports outside the visible page', () => {
  assert.match(container, /loadReportTarget\(/)
  assert.match(container, /reportService\.getByShift\(id\)/)
  assert.match(container, /version !== requestVersion\.current/)
})
