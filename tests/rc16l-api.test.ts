import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { createCalendarExportHandler } from '@/lib/server/calendarExportHandler'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import type { ServerUserResolver } from '@/lib/server/authGuards'

const admin = async () => ({ id: 'auth-admin', businessUserId: 'admin', systemPermission: 'admin' as const })
const post = (body: object) => new Request('http://localhost/api/operations/calendar-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
test('export checks anonymous, Member and unauthorized fields before database reads', async () => {
  for (const [role, fields, status] of [[null, undefined, 401], ['member', undefined, 403], ['leader', ['audit.actor_id'], 403], ['admin', ['salary'], 403]] as const) {
    const resolveUser: ServerUserResolver = async () => role ? { id: 'actor', businessUserId: 'actor', systemPermission: role } : null
    const handler = createCalendarExportHandler({ resolveUser, createClient: async () => { throw new Error('UNAUTHORIZED_DB_READ') }, actualEnabled: () => true })
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
  const handler = createCalendarExportHandler({ resolveUser: admin, createClient: async () => exportClient(total) as never, actualEnabled: () => false })
  const response = await handler.POST(post({ scope: 'filtered', format: 'xlsx', fields: ['schedule.Shift ID', 'schedule.Date', 'schedule.Start Time', 'schedule.Title'] }))
  assert.equal(response.status, 200, await (response.status !== 200 ? response.clone().text() : Promise.resolve('')))
  assert.equal(response.headers.get('X-Export-Record-Count'), String(total))
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' })
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Lịch ca']).length, total)
  if (total) { assert.equal(workbook.Sheets['Lịch ca'].D2.f, undefined); assert.equal(workbook.Sheets['Lịch ca'].D2.v, "'=1+1") }
})
test('export refuses changed collection and an inaccessible selected shift', async () => {
  const changed = createCalendarExportHandler({ resolveUser: admin, createClient: async () => exportClient(117, true) as never, actualEnabled: () => false })
  assert.equal((await changed.POST(post({ scope: 'filtered', format: 'xlsx' }))).status, 409)
  const missing = createCalendarExportHandler({ resolveUser: admin, createClient: async () => exportClient(0) as never, actualEnabled: () => false })
  assert.equal((await missing.POST(post({ scope: 'one', shiftIds: ['private'], format: 'xlsx' }))).status, 409)
})
test('actual amendment authenticates actor, forwards CAS/UUID, and retains 409 conflicts', async () => {
  const request = { action: 'amend', segment_id: 'source', expected_version: 2, request_id: '16000000-0000-4000-8000-000000000001', reason: 'Verified overtime correction', patch: { staff_id: 'staff', operational_role: 'host', event_kind: 'worked', coverage_kind: 'extra', actual_start_at: '2026-10-14T23:30:00+07:00', actual_end_at: '2026-10-15T02:30:00+07:00', evidence_note: 'Verified actual overtime' } }
  let args: Record<string, unknown> | undefined
  const handler = createWorkforceActualHandler({ resolveUser: admin, isEnabled: () => true, client: () => ({ rpc: async (_name: string, input: Record<string, unknown>) => { args = input; return { data: null, error: { message: 'WORKFORCE_ACTUAL_STALE_OR_LOCKED' } } } }) as never })
  assert.equal((await handler.POST(post(request))).status, 409)
  assert.equal(args?.p_actor_id, 'admin'); assert.equal(args?.p_expected_version, 2); assert.equal(args?.p_request_id, request.request_id)
  assert.equal((await handler.POST(post({ ...request, actor_id: 'forged' }))).status, 400)
  const disabled = createWorkforceActualHandler({ resolveUser: admin, isEnabled: () => false, client: () => { throw new Error('FEATURE_OFF_DB_READ') } })
  assert.equal((await disabled.POST(post(request))).status, 503)
})

test('actual GET reads 501 segments in bounded chunks and rejects an incomplete count', async () => {
  for (const incomplete of [false, true]) {
    const offsets: number[] = []
    const handler = createWorkforceActualHandler({ resolveUser: admin, isEnabled: () => true, client: () => ({ from: () => {
      const query = { select: () => query, eq: () => query, order: () => query, range: async (start: number) => {
        offsets.push(start)
        const count = incomplete && start > 0 ? 500 : 501
        return { count, error: null, data: Array.from({ length: Math.min(200, 501 - start) }, (_, index) => ({ id: String(start + index) })) }
      } }
      return query
    } }) as never })
    const response = await handler.GET(new Request('http://localhost/api/workforce/actual?shift_id=shift'))
    assert.equal(response.status, incomplete ? 503 : 200)
    if (!incomplete) { assert.equal((await response.json()).segments.length, 501); assert.deepEqual(offsets, [0, 200, 400]) }
  }
})

test('original evidence creator cannot review somebody else’s amendment', async () => {
  const handler = createWorkforceActualHandler({ resolveUser: admin, isEnabled: () => true, client: () => ({ from: () => {
    let id = ''
    const query = { select: () => query, eq: (_key: string, value: string) => { id = value; return query }, maybeSingle: async () => ({ data: id === 'candidate' ? { id, review_status: 'draft', version: 1, created_by: 'other', supersedes_segment_id: 'original' } : { created_by: 'admin' }, error: null }), update: () => { throw new Error('SELF_REVIEW_MUST_NOT_WRITE') } }
    return query
  } }) as never })
  const response = await handler.POST(post({ action: 'review', segment_id: 'candidate', expected_version: 1, decision: 'approved', review_note: 'Original author attempts review' }))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'WORKFORCE_SELF_REVIEW_BLOCKED')
})
