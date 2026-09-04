import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { clearMultiSelect, matchesMultiSelect, normalizeMultiSelect, selectAllMultiSelect, toggleMultiSelect } from '../lib/utils/multiSelectFilter.ts'

test('multi-select canonical state removes the all sentinel and duplicates', () => {
  assert.deepEqual(normalizeMultiSelect(['all', 'brand-a', 'brand-a', '']), ['brand-a'])
})

test('empty selection means all and values within one dimension are ORed', () => {
  assert.equal(matchesMultiSelect('brand-a', []), true)
  assert.equal(matchesMultiSelect('brand-a', ['brand-a', 'brand-b']), true)
  assert.equal(matchesMultiSelect('brand-c', ['brand-a', 'brand-b']), false)
})

test('toggle, clear, select all, and reset produce canonical empty-or-values state', () => {
  assert.deepEqual(toggleMultiSelect([], 'brand-a'), ['brand-a'])
  assert.deepEqual(toggleMultiSelect([], 'brand-a', ['brand-a', 'brand-b']), ['brand-b'])
  assert.deepEqual(toggleMultiSelect(['brand-a'], 'brand-a'), [])
  assert.deepEqual(clearMultiSelect(), [])
  assert.deepEqual(selectAllMultiSelect(), [])
})

test('multi-select filter component exposes search, checkbox selection, count/chips, and persistent menu controls', () => {
  const source = readFileSync(new URL('../components/ui/multi-select-filter.tsx', import.meta.url), 'utf8')
  assert.match(source, /DropdownMenuCheckboxItem/)
  assert.match(source, /Search \$\{label\.toLowerCase\(\)\}/)
  assert.match(source, /Select all/)
  assert.match(source, /Clear all/)
  assert.match(source, /closeOnClick=\{false\}/)
  assert.match(source, /selectedOptions\.slice\(0, 3\)/)
})

test('requested operational surfaces use the shared categorical filter foundation', () => {
  const surfaces = [
    'components/features/calendar/CalendarView.tsx',
    'components/features/calendar/ShiftRegistrationBoard.tsx',
    'components/features/calendar/ScheduleImportPanel.tsx',
    'components/features/swaps/SwapRequestList.tsx',
    'components/features/staff/StaffList.tsx',
    'components/features/reports/ReportsList.tsx',
    'components/features/live/LiveMonitoringDashboard.tsx',
    'components/features/analytics/DashboardAnalytics.tsx',
    'components/features/audit/AuditHistory.tsx',
  ]
  for (const path of surfaces) {
    const surface = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    assert.match(surface, /MultiSelectFilter/)
  }
})

test('Calendar carries every categorical dimension as an array', () => {
  const source = readFileSync(new URL('../components/features/calendar/CalendarView.tsx', import.meta.url), 'utf8')
  for (const key of ['brandIds', 'platformIds', 'campaignIds', 'studios', 'statuses', 'hostIds', 'supportIds', 'technicalIds']) {
    assert.match(source, new RegExp(`${key}: \\[\\]`))
  }
})
