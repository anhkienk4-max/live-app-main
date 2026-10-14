import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localListPage } from '@/lib/services/operationsPageService'

const picker = readFileSync('components/features/reports/ReportShiftPicker.tsx', 'utf8')
const container = readFileSync('components/features/reports/ReportsContainer.tsx', 'utf8')
const view = readFileSync('components/features/reports/ReportsView.tsx', 'utf8')

test('shift picker remains reachable when the newest 30 shifts already have reports', () => {
  assert.match(container, /setShowShiftPicker\(true\)/)
  assert.doesNotMatch(container, /getReportCandidates\(30\)/)
  assert.match(container, /<ReportShiftPicker/)
  assert.match(view, /\{onCreateReport \? \(/)
})

test('picker uses bounded, searchable server pages with business permission scoping', () => {
  assert.match(picker, /shiftService\.getPage\(/)
  assert.match(picker, /shiftService\.getRegistrationPage\('mine'/)
  assert.match(picker, /reportService\.getForShifts\(ids\)/)
  assert.match(picker, /shiftRegistrationService\.getForShifts\(ids\)/)
  assert.match(picker, /loadReportTarget\(shift\.id/)
  assert.match(picker, /loadedIdentity === identity/)
  assert.match(picker, /loadedFilterKey === filterKey/)
  assert.match(picker, /search === deferredSearch && !invalidDates/)
  assert.match(picker, /requestVersion\.current/)
})

test('page 5 exists for 117 reportable shifts, rather than silently dropping older shifts', () => {
  const shifts = Array.from({ length: 117 }, (_, i) => ({ id: 'shift-' + i }))
  const page5 = localListPage(shifts, { page: 5, pageSize: 20 })
  assert.equal(page5.total, 117)
  assert.equal(page5.page, 5)
  assert.deepEqual(page5.items.map(item => item.id), shifts.slice(80, 100).map(item => item.id))
  assert.equal(localListPage(shifts, { page: 6, pageSize: 20 }).items.length, 17)
  assert.equal(localListPage([], { page: 2, pageSize: 20 }).total, 0)
})

test('Member can select candidate shifts from staffed registration, direct host/support/tech assignment, or submitted report', () => {
  assert.match(picker, /canSelect\s*=\s*\(shift:\s*Shift\)\s*=>/)
  assert.match(picker, /\[shift\.host_id,\s*shift\.support_id,\s*shift\.technical_id\]\.includes\(currentUser\.id\)/)
  assert.match(picker, /isStaffedRegistration\(registration\)/)
  assert.match(picker, /reportsByShift\.get\(shift\.id\)\?\.submitted_by\s*===\s*currentUser\.id/)
})
