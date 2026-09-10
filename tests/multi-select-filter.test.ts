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

test('individual toggles enter explicit mode, accumulate, remove, and return to All', () => {
  assert.deepEqual(toggleMultiSelect([], 'brand-a'), ['brand-a'])
  assert.deepEqual(toggleMultiSelect(['brand-a'], 'brand-b'), ['brand-a', 'brand-b'])
  assert.deepEqual(toggleMultiSelect(['brand-a', 'brand-b'], 'brand-a'), ['brand-b'])
  assert.deepEqual(toggleMultiSelect(['brand-a'], 'brand-a'), [])
})

test('All, clear, reset, and legacy values always produce canonical state', () => {
  assert.deepEqual(clearMultiSelect(), [])
  assert.deepEqual(selectAllMultiSelect(), [])
  assert.deepEqual(toggleMultiSelect(['all'], 'brand-a'), ['brand-a'])
  assert.deepEqual(toggleMultiSelect(['brand-a'], 'all'), ['brand-a'])
  assert.deepEqual(normalizeMultiSelect(['all', ...toggleMultiSelect([], 'brand-a')]), ['brand-a'])
})

test('multi-select renders All as the only checked row for an empty value', () => {
  const source = readFileSync(new URL('../components/ui/multi-select-filter.tsx', import.meta.url), 'utf8')
  assert.match(source, /checked=\{selected\.length === 0\}/)
  assert.match(source, /checked=\{selectedSet\.has\(option\.value\)\}/)
  assert.doesNotMatch(source, /allSelected \|\| selectedSet\.has/)
})

test('multi-select filter exposes search, count/chips, All, clear, and persistent menu controls', () => {
  const source = readFileSync(new URL('../components/ui/multi-select-filter.tsx', import.meta.url), 'utf8')
  assert.match(source, /DropdownMenuCheckboxItem/)
  assert.match(source, /Search \$\{label\.toLowerCase\(\)\}/)
  assert.match(source, /onCheckedChange=\{\(\) => update\(\[\]\)\}/)
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
