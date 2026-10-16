import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { createCalendarExportHandler } from '@/lib/server/calendarExportHandler'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'
import { createWorkforceCapabilitiesHandler } from '@/lib/server/workforceCapabilitiesHandler'
import type { ServerUserResolver } from '@/lib/server/authGuards'

const admin = async () => ({ id: 'auth-admin', businessUserId: 'admin', systemPermission: 'admin' as const })
const post = (body: object) => new Request('http://localhost/api/operations/calendar-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
test('export checks anonymous, Member and unauthorized fields before database reads', async () => {
  for (const [role, fields, status] of [[null, undefined, 401], ['member', undefined, 403], ['leader', ['audit.actor_id'], 403], ['admin', ['salary'], 403], ['admin', ['actual.actual_start_at'], 403]] as const) {
    const resolveUser: ServerUserResolver = async () => role ? { id: 'actor', businessUserId: 'actor', systemPermission: role } : null
    const handler = createCalendarExportHandler({ resolveUser, createClient: async () => { throw new Error('UNAUTHORIZED_DB_READ') } })
    assert.equal((await handler.POST(post({ scope: 'filtered', format: 'xlsx', ...(fields ? { fields } : {}) }))).status, status)
  }
})

function exportClient(total: number, changed = false) {
  let listReads = 0
  const shifts = Array.from({ length: total }, (_, index) => ({ id: 's' + index, date: '2026-10-15', start_time: '23:00', end_time: '01:00', brand_id: 'brand', platform_id: 'platform', title: index === 0 ? '=1+1' : 'Tiếng Việt ' + index, status: 'completed' }))
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_shift_staffing_summary') return { data: [], error: null }
      assert.equal(name, 'get_shift_list_page'); assert.equal(args.p_page_size, 50); listReads++
      const start = (Number(args.p_page) - 1) * 50
      return { data: { rows: shifts.slice(start, start + 50), registrations: [], total: changed && listReads > 1 ? total + 1 : total, page: args.p_page, pageSize: 50 }, error: null }
    },
    from: (table: string) => {
      let ids: string[] = [], start = 0, end = 199
      const query = {
        select: () => query, in: (_column: string, values: string[]) => { ids = values; return query }, order: () => query,
        range: (a: number, b: number) => { start = a; end = b; return query },
        then: (resolve: (result: unknown) => unknown) => {
          const rows = table === 'shift_registrations' ? [] : ids.map(id => ({ id, name: 'Tiếng Việt', full_name: 'Nhân sự' }))
          return Promise.resolve(resolve({ data: rows.slice(start, end + 1), count: rows.length, error: null }))
        },
      }
      return query
    },
  }
}
for (const total of [0, 1, 117, 1001]) test(`export XLSX verifies all ${total} records with bounded reads`, async () => {
  const handler = createCalendarExportHandler({ resolveUser: admin, createClient: async () => exportClient(total) as never })
  const response = await handler.POST(post({ scope: 'filtered', format: 'xlsx', fields: ['schedule.Shift ID', 'schedule.Date', 'schedule.Start Time', 'schedule.Title'] }))
  assert.equal(response.status, 200, await (response.status !== 200 ? response.clone().text() : Promise.resolve('')))
  assert.equal(response.headers.get('X-Export-Record-Count'), String(total))
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' })
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Lịch ca']).length, total)
  if (total) { assert.equal(workbook.Sheets['Lịch ca'].D2.f, undefined); assert.equal(workbook.Sheets['Lịch ca'].D2.v, "'=1+1") }
})
test('export refuses changed collection and an inaccessible selected shift', async () => {
  const changed = createCalendarExportHandler({ resolveUser: admin, createClient: async () => exportClient(117, true) as never })
  assert.equal((await changed.POST(post({ scope: 'filtered', format: 'xlsx' }))).status, 409)
  const missing = createCalendarExportHandler({ resolveUser: admin, createClient: async () => exportClient(0) as never })
  assert.equal((await missing.POST(post({ scope: 'one', shiftIds: ['private'], format: 'xlsx' }))).status, 409)
})
test('Actual Staffing and Payroll APIs fail closed before any database access', async () => {
  const denyDatabase = () => { throw new Error('FEATURE_OFF_DB_READ') }
  const actual = createWorkforceActualHandler({ resolveUser: admin, isEnabled: () => false, client: denyDatabase })
  const payroll = createWorkforcePayrollHandler({ resolveUser: admin, isEnabled: () => false, createClient: denyDatabase })
  const actualGet = await actual.GET(new Request('http://localhost/api/workforce/actual?shift_id=shift'))
  const actualPost = await actual.POST(post({ action: 'record' }))
  const payrollGet = await payroll.GET(new Request('http://localhost/api/workforce/payroll'))
  const payrollPost = await payroll.POST(post({ action: 'register_rate' }))
  assert.equal(actualGet.status, 503); assert.equal((await actualGet.json()).error.code, 'WORKFORCE_FEATURE_DISABLED')
  assert.equal(actualPost.status, 503); assert.equal((await actualPost.json()).error.code, 'WORKFORCE_FEATURE_DISABLED')
  assert.equal(payrollGet.status, 503); assert.equal((await payrollGet.json()).error.code, 'WORKFORCE_PAYROLL_FEATURE_DISABLED')
  assert.equal(payrollPost.status, 503); assert.equal((await payrollPost.json()).error.code, 'WORKFORCE_PAYROLL_FEATURE_DISABLED')
})

test('workforce capability response keeps Actual Staffing and Payroll hidden when flags are off', async () => {
  const handler = createWorkforceCapabilitiesHandler({ resolveUser: admin, enabled: () => false })
  const response = await handler.GET(new Request('http://localhost/api/workforce/capabilities'))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).capabilities, {
    actual_staffing: false, team_performance: false, own_performance: false, payroll: false,
  })
})
