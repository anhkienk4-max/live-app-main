import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift } from '../lib/types/database.types'
import type { ListFilters, ListPage } from '../lib/services/operationsPageService'
import type { ReportObligation } from '../lib/services/dataService'
import { collectAuthorizedReportCalendar, reportCalendarWindow } from '../lib/utils/reportMultiView'

const shift = (id: string, date = '2026-10-15'): Shift => ({
  id, date, title: 'Synthetic shift ' + id, start_time: '09:00', end_time: '11:00',
  brand_id: 'brand-1', platform_id: 'platform-1', status: 'completed',
  created_at: date, updated_at: date,
} as Shift)
const report = (id: string, shiftId: string, status: Report['status'] = 'confirmed'): Report => ({
  id, shift_id: shiftId, status, metrics_confirmed: status === 'confirmed',
  created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:00:00Z',
} as Report)

function mockApis(queue: ReportObligation[], reports: Report[], allShifts: Shift[], user = 'member-a') {
  const calls: Array<{ type: string; page: number; pageSize: number; from?: string; to?: string }> = []
  const filteredQueue = queue
  const reportRows = reports
  function page<T>(rows: T[], number: number, size: 50): ListPage<T> {
    return { items: rows.slice((number - 1) * size, number * size), total: rows.length,
      page: number, pageSize: size, ownerKey: user + ':member' }
  }
  return {
    calls,
    getQueuePage: async (query: { page: number; pageSize: 50; filters: ListFilters }) => {
      calls.push({ type: 'queue', page: query.page, pageSize: query.pageSize, from: query.filters.from, to: query.filters.to })
      return page(filteredQueue, query.page, query.pageSize)
    },
    getReportsPage: async (query: { page: number; pageSize: 50; filters: ListFilters }) => {
      calls.push({ type: 'reports', page: query.page, pageSize: query.pageSize, from: query.filters.from, to: query.filters.to })
      return page(reportRows, query.page, query.pageSize)
    },
    getShiftsByIds: async (ids: string[]) => allShifts.filter(s => ids.includes(s.id)),
  }
}

test('REPORT-01 Month/Week/Day windows are stable and clipped to applied dates', () => {
  assert.deepEqual(reportCalendarWindow('2026-10-15', 'month'),
    { from: '2026-09-28', to: '2026-11-01', empty: false })
  assert.deepEqual(reportCalendarWindow('2026-10-15', 'week'),
    { from: '2026-10-12', to: '2026-10-18', empty: false })
  assert.deepEqual(reportCalendarWindow('2026-10-15', 'day'),
    { from: '2026-10-15', to: '2026-10-15', empty: false })
  assert.deepEqual(reportCalendarWindow('2026-10-15', 'month', {from:'2026-10-10',to:'2026-10-20'}),
    { from: '2026-10-10', to: '2026-10-20', empty: false })
  assert.equal(reportCalendarWindow('2026-10-15', 'month', {from:'2027-01-01'})?.empty, true)
  assert.equal(reportCalendarWindow('2026-02-30', 'month'), null)
})

test('REPORT-01 0/1/20/120/210 shifts: no page-20 truncation; multi-shift day retained', async () => {
  for (const total of [0, 1, 20, 120, 210]) {
    const rows = Array.from({length:total},(_,i) => ({shift:shift('s'+i), report:null}))
    const api = mockApis(rows, [], rows.map(x=>x.shift))
    const result = await collectAuthorizedReportCalendar('2026-10-15', 'month', {}, api)
    assert.equal(result.entries.length,total)
    assert.equal(result.queueTotal,total)
    assert.equal(new Set(result.entries.map(x=>x.shift.id)).size,total)
    assert.equal(api.calls.filter(c=>c.type==='queue').length,Math.max(1, Math.ceil(total/50)))
    assert.ok(api.calls.every(c=>c.pageSize===50 && c.from==='2026-09-28' && c.to==='2026-11-01'))
    if(total>0)assert.ok(result.entries.every(x=>x.report===null),'not-started shifts must appear')
  }
})

test('REPORT-01 report merge keeps distinct workflow and metrics state, no duplicate shift', async () => {
  const s=shift('a'), confirmed=report('r-a','a','confirmed'), draft=report('r-b','b','draft')
  const api=mockApis([{shift:s,report:null}],[confirmed,draft],[s,shift('b')])
  const result=await collectAuthorizedReportCalendar('2026-10-15','day',{},api)
  assert.equal(result.entries.length,2)
  assert.equal(result.entries.find(x=>x.shift.id==='a')?.report?.id,'r-a')
  assert.equal(result.entries.find(x=>x.shift.id==='b')?.report?.status,'draft')
  assert.equal(result.reportTotal,2)
  assert.equal(result.queueTotal,1)
})

test('REPORT-01 no cross-role bypass: collection returns only server-authorized report and shifts', async () => {
  const memberRows=[{shift:shift('own'),report:null}]
  const member=mockApis(memberRows,[],[shift('own'),shift('foreign')])
  const result=await collectAuthorizedReportCalendar('2026-10-15','month',{},member)
  assert.deepEqual(result.entries.map(e=>e.shift.id),['own'])
  assert.equal(member.calls.filter(x=>x.type==='reports').length,1)
})

test('REPORT-01 guard fails closed on paginated total drift, owner change, or cap', async () => {
  const rows=Array.from({length:110},(_,i)=>({shift:shift('s'+i),report:null}))
  for (const change of ['total','owner','limit'] as const) {
    const api=mockApis(rows,[],rows.map(x=>x.shift))
    const original=api.getQueuePage
    api.getQueuePage=async query=>{
      const result=await original(query)
      if(query.page===2 && change==='total')return {...result,total:111}
      if(query.page===2 && change==='owner')return {...result,ownerKey:'foreign:member'}
      if(query.page===1 && change==='limit')return {...result,total:5001}
      return result
    }
    await assert.rejects(collectAuthorizedReportCalendar('2026-10-15','month',{},api),/REPORT_CALENDAR_COLLECTION_CHANGED/)
  }
})

test('REPORT-01 URL views share applied filters; existing Table/Cards and REPORT-02 remain', () => {
  const ui=readFileSync(new URL('../components/features/reports/ReportsList.tsx',import.meta.url),'utf8')
  const component=readFileSync(new URL('../components/features/reports/ReportsMultiView.tsx',import.meta.url),'utf8')
  assert.match(ui,/modeParam = searchParams\.get\('reports_view'\)/)
  assert.match(ui,/scaleParam = searchParams\.get\('reports_calendar_scale'\)/)
  assert.match(ui,/reports_calendar_date/)
  assert.match(ui,/createdViewMode === 'list'/)
  assert.match(ui,/createdViewMode === 'calendar'/)
  assert.match(ui,/createdViewMode === 'table'/)
  assert.match(ui,/createdViewMode === 'cards'/)
  assert.match(ui,/getReportObligationPage\(query, signal\)/)
  assert.match(ui,/getReportsPage: \(query, signal\) => reportService\.getFilteredPage\(query, signal\)/)
  assert.match(ui,/getAllFilteredWithHistoricalContext\(JSON\.parse\(encodedFilters\)\)/)
  assert.match(ui,/report\.status === 'confirmed' && report\.metrics_confirmed === true/)
  assert.match(ui,/onHistorical=\{setSelectedHistoricalReport\}/)
  assert.match(ui,/setSelectedReport\(report\)/)
  assert.match(component,/items\.length > 3/)
  assert.match(component,/Số liệu chưa xác nhận/)
})
