import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { groupTimeGridShifts, shiftsForGridDate } from '@/lib/utils/timeGrid'
import { actualPickerInstant, actualPickerValue } from '@/lib/workforce/actualTime'
import { authorizedExportFields, selectExportFields, safeSpreadsheetValue, type ExportSheet, type ExportRecord } from '@/lib/utils/calendarExport'
import { buildCalendarExport } from '@/lib/utils/calendarExportWorkbook'
import { readCalendarWindow } from '@/lib/services/calendarWindow'
import { shiftService, brandService, platformService, campaignService, userService } from '@/lib/services/dataService'
import { getCalendarReferences, clearCalendarReferences } from '@/lib/services/calendarReferenceData'
import type { ShiftListPage } from '@/lib/services/operationsPageService'
import type { User } from '@/lib/types/database.types'

test('overnight projections preserve the original schedule and include adjacent dates', () => {
  const original = { id: 'overnight', date: '2026-10-14', start_time: '23:30', end_time: '02:30' }
  const next = shiftsForGridDate([original], '2026-10-15')
  assert.equal(next[0].continuation, true)
  assert.equal(next[0].start_time, '00:00')
  assert.equal(next[0].shift, original)
  assert.equal(original.start_time, '23:30')
  assert.equal(shiftsForGridDate([original], '2026-10-16').length, 0)
  assert.equal(shiftsForGridDate([{ ...original, end_time: '00:00' }], '2026-10-15').length, 0)
})
test('overlap clusters retain all real shifts and keep adjacent shifts separate', () => {
  const groups = groupTimeGridShifts([{ id: 'a', start_time: '09:00', end_time: '10:00' }, { id: 'b', start_time: '09:30', end_time: '11:00' }, { id: 'c', start_time: '11:00', end_time: '12:00' }])
  assert.deepEqual(groups.map(group => group.map(shift => shift.id)), [['a', 'b'], ['c']])
  assert.equal(groupTimeGridShifts(Array.from({ length: 100 }, (_, index) => ({ id: String(index), start_time: '10:00', end_time: '11:00' })))[0].length, 100)
})
test('actual date/time picker respects business timezone, overnight and invalid dates', () => {
  assert.equal(actualPickerInstant('2026-10-15T02:30'), '2026-10-14T19:30:00.000Z')
  assert.equal(actualPickerValue('2026-10-14T19:30:00Z'), '2026-10-15T02:30')
  assert.equal(actualPickerInstant('2026-10-15T02:30', 'UTC'), '2026-10-15T02:30:00.000Z')
  for (const value of ['2026-02-30T09:00', 'bad', '2026-10-15T25:00']) assert.throws(() => actualPickerInstant(value), /WORKFORCE_TIME_INVALID/)
  assert.throws(() => actualPickerInstant('2026-03-08T02:30', 'America/New_York'), /WORKFORCE_TIME_INVALID/)
})
test('field permissions fail closed before salary, PII or audit can enter a workbook', () => {
  assert.equal(authorizedExportFields('member', true).length, 0)
  assert.ok(!authorizedExportFields('leader', true).some(field => field.group === 'audit'))
  assert.ok(!authorizedExportFields('admin', false).some(field => field.group === 'actual'))
  for (const id of ['salary', 'email', 'audit.actor_id']) assert.throws(() => selectExportFields('leader', true, [id]), /EXPORT_FIELD_DENIED/)
})
test('XLSX and CSV preserve Vietnamese and times and neutralize formulas', () => {
  const fields = selectExportFields('admin', false, ['schedule.Shift ID', 'schedule.Date', 'schedule.Start Time', 'schedule.Title'])
  const data: Record<ExportSheet, ExportRecord[]> = { schedule: [{ 'Shift ID': 's1', Date: '2026-10-15', 'Start Time': '02:30', Title: '\t=HYPERLINK("evil","Tiếng Việt")' }], registrations: [], actual: [], audit: [] }
  const bytes = buildCalendarExport(data, fields, 'xlsx')
  const book = XLSX.read(bytes, { type: 'array' })
  const sheet = book.Sheets['Lịch ca']
  assert.equal(sheet.B2.v, '2026-10-15'); assert.equal(sheet.C2.v, '02:30'); assert.equal(sheet.C2.t, 's')
  assert.equal(sheet.D2.f, undefined); assert.ok(String(sheet.D2.v).startsWith("'"))
  assert.match(buildCalendarExport(data, fields, 'csv') as string, /Tiếng Việt/)
  for (const value of ['=1+1', '+cmd', '-cmd', '@sum', ' \r=1']) assert.equal(safeSpreadsheetValue(value), "'" + value)
  assert.equal(safeSpreadsheetValue(-1), -1)
  assert.throws(() => buildCalendarExport(data, selectExportFields('admin', false), 'csv'), /FLAT_FIELDS/)
})
for (const total of [0, 1, 50, 117, 1001]) test(`bounded Calendar window reads ${total} without duplicates`, async () => {
  const original = shiftService.getCalendarPage
  const calls: number[] = []
  shiftService.getCalendarPage = async query => {
    calls.push(query.page)
    assert.equal(query.pageSize, 50)
    const count = Math.max(0, Math.min(50, total - (query.page - 1) * 50))
    return { items: Array.from({ length: count }, (_, index) => ({ id: String((query.page - 1) * 50 + index) })), total, page: query.page, pageSize: 50, registrations: [], pendingTotal: 0, pendingPage: 1, pendingIds: [], studios: [], ownerKey: 'admin' } as ShiftListPage
  }
  try { const result = await readCalendarWindow({ from: '2026-10-01', to: '2026-10-31' }); assert.equal(result.items.length, total); assert.equal(calls.length, Math.max(1, Math.ceil(total / 50))) }
  finally { shiftService.getCalendarPage = original }
})
test('Calendar abort and changed owner/count fail closed', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readCalendarWindow({ from: '2026-10-01', to: '2026-10-31' }, controller.signal), /aborted/i)
  const original = shiftService.getCalendarPage
  shiftService.getCalendarPage = async query => ({ items: Array.from({ length: 50 }, (_, index) => ({ id: `${query.page}-${index}` })), total: 100, page: query.page, pageSize: 50, registrations: [], ownerKey: query.page === 1 ? 'admin' : 'member' }) as unknown as ShiftListPage
  try { await assert.rejects(readCalendarWindow({ from: '2026-10-01', to: '2026-10-31' }), /COLLECTION_CHANGED/) }
  finally { shiftService.getCalendarPage = original }
})
test('reference promises deduplicate same owner and isolate permission/identity', async () => {
  const originals = [brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAllFiltered] as const
  let calls = 0
  brandService.getAll = async () => { calls++; return [] }
  platformService.getAll = async () => []
  campaignService.getAll = async () => []
  userService.getAllFiltered = async () => []
  const user = { id: 'admin', role: 'admin', updated_at: 'v1' } as User
  try {
    clearCalendarReferences()
    const first = getCalendarReferences(user)
    assert.equal(first, getCalendarReferences(user)); await first; assert.equal(calls, 1)
    await getCalendarReferences({ ...user, system_permission: 'leader' }); assert.equal(calls, 2)
    await getCalendarReferences({ ...user, id: 'other' }); assert.equal(calls, 3)
  } finally { [brandService.getAll, platformService.getAll, campaignService.getAll, userService.getAllFiltered] = originals; clearCalendarReferences() }
})
