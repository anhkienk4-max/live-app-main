import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')

test('report filters are drafted until explicit Apply; API and export use applied values only', () => {
  assert.match(source, /\[draftFilters, setDraftFilters\] = React\.useState/)
  assert.match(source, /setDraftFilters\(next\)/)
  assert.match(source, /const applyFilters = React\.useCallback/)
  assert.match(source, /setFilters\(draftFilters\)/)
  assert.match(source, /data-testid="reports-apply-filters"/)
  assert.match(source, /reportService\.getFilteredPage\(\{ page: reportPage, pageSize: reportPageSize, filters: JSON\.parse\(encodedFilters\) \}\)/)
  assert.match(source, /reportService\.getAllFiltered\(JSON\.parse\(encodedFilters\)\)/)
})
test('applied filters reset pagination and display removable active chips', () => {
  assert.match(source, /const resetFilters = React\.useCallback/)
  assert.match(source, /setReportPage\(1\)/)
  assert.match(source, /setQueuePage\(1\)/)
  assert.match(source, /data-testid="reports-applied-filter-chips"/)
  assert.match(source, /removeAppliedFilter\(chip\.key\)/)
  assert.match(source, /onClick=\{resetFilters\}/)
})
test('date and multi-select editors change only drafts, not applied server filters', () => {
  for (const field of ['start','end','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses']) {
    assert.match(source, new RegExp('value=\\{draftFilters\\.' + field + '\\}'))
  }
  assert.match(source, /hasUnappliedChanges && <p role="status"/)
  assert.match(source, /event\.key === 'Enter'/)
})
