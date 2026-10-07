import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift, User } from '../lib/types/database.types.ts'
import { clearReportShiftQuery, initialReportShift, loadReportTarget, reportShiftHref } from '../lib/utils/reportTarget.ts'
import { limitReportCandidates } from '../lib/utils/reportQueue.ts'
import { deriveReportAttention } from '../lib/ui/operational-attention.ts'
import { getReportIssues, recoveryActionFor } from '../lib/utils/dataQuality.ts'

const oldShift: Shift = {
  id: 'd706b643-0965-4308-a46f-6e97f5cada0a', date: '2026-09-14',
  start_time: '07:00', end_time: '09:00', status: 'completed',
  brand_id: 'female-ai', platform_id: 'shopee',
  created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:00:00Z',
}
const draft: Report = {
  id: '7e544141-5d7c-4319-b87a-59b0ca4f6659', shift_id: oldShift.id,
  status: 'draft', metrics_confirmed: false, submitted_by: 'member',
  created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:00:00Z',
}
const admin = { id: 'admin', role: 'admin', system_permission: 'admin' } as User
const member = { id: 'member', role: 'staff', system_permission: 'member' } as User
const recent = Array.from({ length: 30 }, (_, i): Shift => ({
  ...oldShift, id: `recent-${i}`, date: i < 12 ? '2026-09-30' : i < 22 ? '2026-09-29' : '2026-09-28',
}))
const lookup = (shift: Shift | null = oldShift, report: Report | null = draft) => ({
  getShift: async () => shift, getReport: async () => report,
})

test('Calendar deep link resolves the September 14 draft independently of all 30 recent candidates', async () => {
  const queue = limitReportCandidates([...recent, oldShift], 671)
  assert.equal(queue.length, 30)
  assert.equal(queue.some(shift => shift.id === oldShift.id), false)
  const href = reportShiftHref(oldShift.id)
  const shiftId = new URL(href, 'https://example.test').searchParams.get('shiftId')!
  const calls: string[] = []
  const target = await loadReportTarget(shiftId, {
    getShift: async id => { calls.push(`shift:${id}`); return oldShift },
    getReport: async id => { calls.push(`report:${id}`); return draft },
  }, admin, new Set())
  assert.deepEqual(calls, [`shift:${oldShift.id}`, `report:${oldShift.id}`])
  assert.equal(target.mode, 'form')
  assert.equal(target.report?.id, draft.id)
  const formOptions = [target.shift, ...queue]
  assert.equal(initialReportShift(formOptions, target.report, target.shift.id)?.id, draft.shift_id)
  assert.equal(initialReportShift(formOptions, target.report)?.date, '2026-09-14')
  assert.equal(queue.length, 30)
})

test('historical reopened report continues its exact editable form', async () => {
  const report = { ...draft, status: 'reopened' as const }
  const target = await loadReportTarget(oldShift.id, lookup(oldShift, report), member, new Set())
  assert.equal(target.mode, 'form')
  assert.equal(target.report, report)
})

test('historical finalized and review-only reports open exact detail', async () => {
  for (const report of [{ ...draft, status: 'confirmed' as const, metrics_confirmed: true },
    { ...draft, status: 'in_review' as const }, { ...draft, metrics_confirmed: true }]) {
    const target = await loadReportTarget(oldShift.id, lookup(oldShift, report), member, new Set())
    assert.equal(target.mode, 'detail')
    assert.equal(target.shift.id, report.shift_id)
    assert.equal(target.report, report)
  }
})

test('authorized historical shift without report opens an exact new form', async () => {
  for (const [user, shift, staffed] of [
    [admin, oldShift, new Set<string>()],
    [member, oldShift, new Set([oldShift.id])],
    [member, { ...oldShift, host_id: member.id }, new Set<string>()],
  ] as const) {
    const target = await loadReportTarget(oldShift.id, lookup(shift, null), user, staffed)
    assert.equal(target.mode, 'form')
    assert.equal(target.report, undefined)
    assert.equal(initialReportShift([target.shift, ...recent], undefined, target.shift.id)?.id, oldShift.id)
  }
})

test('unassigned staff and another report owner cannot open an editable target', async () => {
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, null), member, new Set()), /REPORT_TARGET_FORBIDDEN/)
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, { ...draft, submitted_by: 'someone-else' }), member, new Set([oldShift.id])), /REPORT_TARGET_FORBIDDEN/)
})

test('missing, inaccessible, deleted, archived and mismatched targets never resolve another shift', async () => {
  for (const shift of [null, { ...oldShift, deleted_at: '2026-10-07' },
    { ...oldShift, archived_at: '2026-10-07' }, recent[0]]) {
    await assert.rejects(loadReportTarget(oldShift.id, lookup(shift), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  }
  await assert.rejects(loadReportTarget('bad-shift-id', lookup(null, null), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  await assert.rejects(loadReportTarget('', lookup(), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, { ...draft, shift_id: recent[0].id }), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, { ...draft, deleted_at: '2026-10-07' }), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
})

test('nonreportable historical shift cannot start a new report', async () => {
  await assert.rejects(loadReportTarget(oldShift.id, lookup({ ...oldShift, status: 'scheduled' }, null), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
})

test('explicit form targets never fall back to the first recent shift', () => {
  assert.equal(initialReportShift(recent, draft), undefined)
  assert.equal(initialReportShift(recent, undefined, oldShift.id), undefined)
  assert.equal(initialReportShift(recent, undefined, ''), undefined)
  assert.equal(initialReportShift([oldShift, ...recent], draft, recent[0].id), undefined)
  assert.equal(initialReportShift(recent)?.id, recent[0].id)
})

test('target links encode identifiers and closing consumes only shiftId', () => {
  assert.equal(reportShiftHref('id/with ?&'), '/reports?shiftId=id%2Fwith%20%3F%26')
  assert.equal(clearReportShiftQuery('/reports', `page=2&shiftId=${oldShift.id}&filter=draft`), '/reports?page=2&filter=draft')
  assert.equal(clearReportShiftQuery('/reports', `shiftId=${oldShift.id}`), '/reports')
})

test('report-specific attention and recovery links preserve their known shift', () => {
  assert.equal(deriveReportAttention(draft.id, 'draft', oldShift.date, oldShift.id)[0].href, reportShiftHref(oldShift.id))
  const issue = getReportIssues([draft], [oldShift]).find(issue => issue.issue_code === 'incomplete_report')!
  assert.equal(issue.action_url, reportShiftHref(oldShift.id))
  assert.equal(recoveryActionFor(issue).url, reportShiftHref(oldShift.id))
})

test('desktop/mobile Calendar and report page wire exact targets without an eager all-shift fetch', () => {
  const calendar = readFileSync(new URL('../components/features/calendar/DaySessionsDialog.tsx', import.meta.url), 'utf8')
  const list = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')
  const form = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
  assert.equal(calendar.match(/router\.push\(reportShiftHref\(shift\.id\)\)/g)?.length, 2)
  assert.doesNotMatch(calendar, /location\.assign\('\/reports'\)/)
  assert.match(list, /shiftService\.getReportCandidates\(30\)/)
  assert.match(list, /getShift: id => shiftService\.getById\(id\)/)
  assert.match(list, /getReport: id => reportService\.getByShift\(id\)/)
  assert.doesNotMatch(list, /shiftService\.getAll\(|reportService\.getAll\(/)
  assert.match(list, /completedShifts=\{formShifts\}/)
  assert.match(list, /router\.replace\(clearReportShiftQuery/)
  assert.match(list, /handledTarget\.current === deepLinkShiftId/)
  assert.match(list, /targetRequest\.current\.promise/)
  assert.match(form, /initialReportShift\(completedShiftsRef\.current, initialReport, initialShiftId\)/)
  assert.match(form, /disabled=\{explicitShiftId !== undefined\}/)
  assert.match(form, /targetUnavailable && <p role="alert"/)
})
