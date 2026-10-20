import test from 'node:test'
import assert from 'node:assert/strict'
import { pageRange, readPage, readPageSize } from '@/lib/utils/pagination'

for (const total of [0, 1, 10, 20, 50, 117, 1000]) {
  for (const size of [10, 20, 50]) test('Exact page ranges for ' + total + ' records at ' + size, () => {
    const ranges = Array.from({ length: Math.max(1, Math.ceil(total / size)) }, (_, i) => pageRange(total, i + 1, size))
    assert.equal(ranges[0].from, total ? 1 : 0)
    assert.equal(ranges.at(-1)!.to, total)
    assert.equal(ranges.reduce((sum, row) => sum + (row.from ? row.to - row.from + 1 : 0), 0), total)
    for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].from, ranges[i - 1].to + 1)
    assert.equal(pageRange(total, 10000, size).page, ranges.length)
  })
}
test('Untrusted page inputs stay bounded and sizes only accept 10/20/50', () => {
  for (const value of [null, '', '-1', '0', '1.5', 'NaN', 'Infinity', '100001']) assert.equal(readPage(value), 1)
  assert.equal(readPage('12'), 12)
  for (const value of [null, '', '5', '100', '-1']) assert.equal(readPageSize(value, 20), 20)
  assert.equal(readPageSize('50', 10), 50)
})

import { assertCollectionResponseOwner, getCompleteCollection, localListPage } from '@/lib/services/operationsPageService'
import { createOperationsCollectionHandler, listFiltersSchema, operationsOwnerKey } from '@/lib/server/operationsCollectionHandler'
import { createRegistrationReviewContextHandler } from '@/lib/server/registrationReviewContextHandler'
import { createAnalyticsSnapshotHandler } from '@/lib/server/analyticsSnapshotHandler'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'

test('Paginated collection owner uses business UUID, not the distinct Supabase auth UUID', () => {
  const auth = { id: 'auth-user-42', businessUserId: 'business-user-9', systemPermission: 'member' as const }
  assert.equal(operationsOwnerKey(auth), 'business-user-9:member')
  assert.equal(operationsOwnerKey({ id: 'synthetic', systemPermission: 'admin' }), 'synthetic:admin')
})

test('Collection rejects mismatched identity, role and missing owner metadata before exposing rows', () => {
  assert.doesNotThrow(() => assertCollectionResponseOwner('business-user-9:member', 'business-user-9:member'))
  for (const ownerKey of ['auth-user-42:member', 'business-user-10:member', 'business-user-9:admin', '', null, undefined]) {
    assert.throws(
      () => assertCollectionResponseOwner('business-user-9:member', ownerKey),
      /LIST_IDENTITY_CHANGED/,
    )
  }
  // Node-only fixtures have no authenticated browser identity to compare.
  assert.doesNotThrow(() => assertCollectionResponseOwner(undefined, undefined))
})

test('Export All reads three bounded chunks for 117 rows, not the visible page', async () => {
  const fixture = Array.from({ length: 117 }, (_, i) => ({ id: String(i) }))
  const original = globalThis.fetch
  const calls: number[] = []
  globalThis.fetch = async input => {
    const query = new URL(String(input), 'http://local.test').searchParams
    const page = Number(query.get('page'))
    calls.push(page)
    assert.equal(query.get('pageSize'), '50')
    return Response.json(localListPage(fixture, { page, pageSize: 50 }))
  }
  try { assert.deepEqual(await getCompleteCollection('shifts'), fixture); assert.deepEqual(calls, [1, 2, 3]) }
  finally { globalThis.fetch = original }
})
test('Export All rejects a changing dataset and duplicated pages', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async input => {
    const page = Number(new URL(String(input), 'http://local.test').searchParams.get('page'))
    return Response.json({ items: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })), total: 100, page, pageSize: 50 })
  }
  try { await assert.rejects(getCompleteCollection('shifts'), /EXPORT_COLLECTION_CHANGED/) }
  finally { globalThis.fetch = original }
})
test('Endpoint rejects unbounded queries before touching the database for every role', async () => {
  for (const systemPermission of ['admin', 'leader', 'member'] as const) {
    const GET = createOperationsCollectionHandler({
      resolveUser: async () => ({ id: 'auth', businessUserId: 'actor', systemPermission }),
      createClient: async () => { throw new Error('Database must not be called') },
    }).GET
    for (const query of ['entity=shifts&pageSize=1000', 'entity=payroll&pageSize=20', 'entity=shifts&page=0', 'entity=shifts&pageSize=50&filters=%7B%22user_id%22%3A%22other%22%7D']) {
      assert.equal((await GET(new Request('http://local.test/api?' + query))).status, 400)
    }
  }
})
test('Endpoint cannot trust forged client identity and denies Member staff records', async () => {
  const anonymous = createOperationsCollectionHandler({ resolveUser: async () => null }).GET
  assert.equal((await anonymous(new Request('http://local.test/api?entity=shifts', { headers: { 'x-mock-user-id': 'admin' } }))).status, 401)
  const GET = createOperationsCollectionHandler({ resolveUser: async () => ({ id: 'auth', systemPermission: 'member' }) as AuthenticatedServerUser }).GET
  assert.equal((await GET(new Request('http://local.test/api?entity=staff'))).status, 403)
  assert.equal((await GET(new Request('http://local.test/api?entity=registration_reviews'))).status, 403)
  const context = createRegistrationReviewContextHandler({ resolveUser: async () => ({ id: 'auth', systemPermission: 'member' }) as AuthenticatedServerUser }).GET
  assert.equal((await context(new Request('http://local.test/api/operations/registration-context?id=own-1'))).status, 403)
})

test('Analytics response owner matches the business user identity for all roles', async () => {
  const filters = encodeURIComponent(JSON.stringify({ from: '2099-01-01', to: '2099-01-02' }))
  for (const systemPermission of ['admin', 'leader', 'member'] as const) {
    const GET = createAnalyticsSnapshotHandler({
      resolveUser: async () => ({ id: 'auth-uuid-different', businessUserId: 'business-17', systemPermission }),
      createClient: async () => ({
        rpc: async () => ({ data: { totals: { reportCount: 0 } }, error: null }),
      }) as never,
    }).GET
    const response = await GET(new Request('http://local.test/api?filters=' + filters))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ownerKey, 'business-17:' + systemPermission)
    assert.notEqual(body.ownerKey, 'auth-uuid-different:' + systemPermission)
  }
})

test('Analytics aggregate accepts valid date filters for each role and rejects extra filters before SQL', async () => {
  for (const systemPermission of ['admin', 'leader', 'member'] as const) {
    const calls: unknown[] = []
    const GET = createAnalyticsSnapshotHandler({
      resolveUser: async () => ({ id: 'auth', businessUserId: 'actor', systemPermission }),
      createClient: async () => ({ rpc: async (_name: string, args: unknown) => { calls.push(args); return { data: { totals: { reportCount: 0 } }, error: null } } }) as never,
    }).GET
    const filters = encodeURIComponent(JSON.stringify({ from: '2099-01-01', to: '2099-01-02' }))
    assert.equal((await GET(new Request('http://local.test/api?filters=' + filters))).status, 200)
    assert.equal(calls.length, 1)
    assert.equal((await GET(new Request('http://local.test/api?filters=' + encodeURIComponent(JSON.stringify({ from: '2099-01-01', to: '2099-01-02', requesterIds: ['other'] }))))).status, 400)
    assert.equal(calls.length, 1)
  }
})
test('Filters reject invalid dates, inverted ranges and unsupported roles', () => {
  for (const input of [{ from: '2026-02-30' }, { from: '2026-10-13', to: '2026-10-12' }, { roles: ['admin'] }, { brandIds: Array(51).fill('brand') }, { search: 'a'.repeat(257) }]) assert.equal(listFiltersSchema.safeParse(input).success, false)
})

import { scheduleArchiveFailureMessage } from '@/lib/utils/scheduleArchiveMessage'
test('Archive warning identifies persisted shifts and independent file failure', () => {
  const message = scheduleArchiveFailureMessage(new Error('STORAGE_ROUTE_NOT_CONFIGURED'), 33)
  assert.match(message, /Đã ghi 33 dòng ca/)
  assert.match(message, /không bị hoàn tác/)
  assert.match(message, /cùng batch, không import lại ca/)
  assert.match(message, /Brand\/Platform/)
  assert.doesNotMatch(scheduleArchiveFailureMessage(new Error('secret token=private'), 1), /private|token=/)
})

test('Export rejects pages resolved for a different authenticated owner', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async input => {
    const page = Number(new URL(String(input), 'http://local.test').searchParams.get('page'))
    return Response.json({items:Array.from({length:50},(_,i)=>({id:String((page-1)*50+i)})),total:100,page,pageSize:50,ownerKey:page===1?'admin':'member'})
  }
  try { await assert.rejects(getCompleteCollection('shifts'), /EXPORT_IDENTITY_CHANGED/) }
  finally {globalThis.fetch=original}
})

import {selectMyShiftEntries} from '@/lib/utils/myShifts'
import {calculateOverlaps,calculateShiftPosition} from '@/lib/utils/timeGrid'
import type {Shift,ShiftRegistration} from '@/lib/types/database.types'
for(const total of [0,1,10,20,50,117,1000])test('My Shifts canonical paging covers '+total+' without duplicates',()=>{
  const shifts=Array.from({length:total},(_,i)=>({
    id:String(i).padStart(4,'0'),date:'2099-01-01',start_time:'10:00',end_time:'11:00',brand_id:'brand',platform_id:'platform',
    status:'scheduled',required_host_count:1,required_support_count:1,required_technical_count:1,registration_locked:false,created_at:'2099-01-01',updated_at:'2099-01-01',
  })) as Shift[]
  const registrations=shifts.flatMap(shift=>['host','support'].map(role=>({
    id:shift.id+'-'+role,shift_id:shift.id,user_id:'member',operational_role:role,status:'approved',source:'self_registration',requested_at:'2098-01-01',created_at:'2098-01-01',updated_at:'2098-01-01',
  }))) as ShiftRegistration[]
  const items=selectMyShiftEntries({shifts,registrations,userId:'member',filters:{date:'',brand:'all',platform:'all',campaign:'all',role:'all'}})
  for(const pageSize of [10,20,50] as const){
    const ids=[]
    for(let page=1;page<=Math.max(1,Math.ceil(total/pageSize));page++){
      const result=localListPage(items,{page,pageSize})
      assert.ok(result.items.every(item=>item.registrations.length===2))
      ids.push(...result.items.map(item=>item.shift.id))
    }
    assert.equal(ids.length,total);assert.equal(new Set(ids).size,total)
  }
})
test('Week visual minimum and overlap packing agree for short adjacent real shifts',()=>{
  const shifts=[{id:'a',start_time:'10:00',end_time:'10:15'},{id:'b',start_time:'10:30',end_time:'10:45'}]
  const layouts=calculateOverlaps(shifts,60)
  assert.equal(calculateShiftPosition('10:00','10:15',false,60).height,72)
  assert.notEqual(layouts.a.left,layouts.b.left)
})

test('Financial and administrative auxiliary collections deny Leader/Member before DB reads',async()=>{
  for(const systemPermission of ['leader','member'] as const){
    const GET=createOperationsCollectionHandler({resolveUser:async()=>({id:'auth',businessUserId:'actor',systemPermission}),createClient:async()=>{throw Error('DB must not be read')}}).GET
    for(const entity of ['archives','account_requests'])assert.equal((await GET(new Request('http://local.test/api?entity='+entity))).status,403)
  }
})
