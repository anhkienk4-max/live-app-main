import assert from 'node:assert/strict'
import test from 'node:test'
import { createOperationalStorageSetupHandler } from '@/lib/server/operationalStorageSetupHandler'

type Row = Record<string, unknown>
function fixture() {
  const db: Record<string, Row[]> = {
    brands: [
      { id: 'brand-1', name: 'Brand 1', storage_profile: null, deleted_at: null },
      { id: 'brand-2', name: 'Brand 2', storage_profile: 'LEGACY_PERIOD_CATEGORY', deleted_at: null },
      { id: 'brand-3', name: 'Brand 3', storage_profile: 'CANONICAL_V1', deleted_at: null },
    ],
    platforms: [{ id: 'platform-1', name: 'Shopee Live', deleted_at: null }],
    shifts: [{
      id: 'shift-1', date: '2026-09-14', title: 'Fixture',
      version: 3, brand_id: 'brand-3', platform_id: 'platform-1',
      status: 'completed', execution_source: null, deleted_at: null,
    }],
    operational_storage_routes: [],
  }
  let insertCount = 0
  const conn = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let operation: 'read' | 'insert' | 'update' = 'read'
      let update: Row = {}
      const evaluate = () => {
        const rows = db[table] ?? []
        if (operation === 'insert') {
          const next = { id: 'route-' + (insertCount++), ...update }
          rows.push(next)
          return { data: [next], error: null }
        }
        const found = rows.filter(row => filters.every(fn => fn(row)))
        if (operation === 'update') for (const row of found) Object.assign(row, update)
        return { data: found, error: null }
      }
      const q = {
        select(_columns?: string) { return q },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return q },
        is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return q },
        order(_key: string, _opts?: unknown) { return q },
        limit(_n: number) { return q },
        insert(payload: Row) { operation = 'insert'; update = payload; return q },
        update(payload: Row) { operation = 'update'; update = payload; return q },
        async maybeSingle() { const r = evaluate(); return { data: r.data[0] ?? null, error: r.error } },
        async single() { const r = evaluate(); return { data: r.data[0] ?? null, error: r.error } },
        then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
          return Promise.resolve(evaluate()).then(resolve, reject)
        },
      }
      return q
    },
  }
  return { conn: conn as never, rows: db }
}

const request = (input: Record<string, unknown>) =>
  new Request('https://example.test/api/operational-storage-setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })

const routePayload = () => ({
  action: 'register_route', brand_id: 'brand-3', platform_id: 'platform-1',
  execution_source: 'internal', root_folder_id: 'approved-drive-root',
  confirmation: 'I_VERIFIED_PROVIDER_ROOT_AND_BRAND',
})

test('only authenticated Admin can inspect or change route/source setup', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    resolveUser: async () => ({ id: 'leader', systemPermission: 'leader', businessUserId: 'leader' }),
  })
  assert.equal((await handler.GET(new Request('https://example.test/api/operational-storage-setup'))).status, 403)
  assert.equal((await handler.POST(request(routePayload()))).status, 403)
  assert.equal(state.rows.operational_storage_routes.length, 0)
})

test('readiness inventory does not guess missing Shift source or brand profile', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn, getRoot: () => 'approved-drive-root',
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin' }),
  })
  const response = await handler.GET(new Request('https://example.test/api/operational-storage-setup'))
  assert.equal(response.status, 200)
  const body = await response.json() as {
    schema_ready: boolean; brands: Row[]; unclassified_shifts_sample: Row[]; root_configured: boolean
  }
  assert.equal(body.schema_ready, true)
  assert.equal(body.brands.find(b => b.id === 'brand-1')?.storage_profile, null)
  assert.equal(body.unclassified_shifts_sample[0]?.execution_source, null)
  assert.equal(body.root_configured, true)
  assert.equal(state.rows.shifts[0].execution_source, null)
})

test('explicit canonical brand approval never silently converts legacy profiles', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin' }),
  })
  const make = (brand: string, confirmation: string) => request({
    action: 'classify_brand_profile', brand_id: brand,
    storage_profile: 'CANONICAL_V1', confirmation,
  })
  assert.equal((await handler.POST(make('brand-1', 'not-reviewed'))).status, 400)
  assert.equal(state.rows.brands[0].storage_profile, null)
  assert.equal((await handler.POST(make('brand-2', 'I_VERIFIED_THIS_BRAND_USES_CANONICAL_FOLDERS'))).status, 409)
  assert.equal(state.rows.brands[1].storage_profile, 'LEGACY_PERIOD_CATEGORY')
  assert.equal((await handler.POST(make('brand-1', 'I_VERIFIED_THIS_BRAND_USES_CANONICAL_FOLDERS'))).status, 200)
  assert.equal(state.rows.brands[0].storage_profile, 'CANONICAL_V1')
})

test('route approval requires configured verified root, canonical brand, exact platform and source', async () => {
  const state = fixture()
  let metadataCalls = 0
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    getRoot: () => 'approved-drive-root',
    metadata: async (id: string) => {
      metadataCalls += 1
      return { id, name: 'LIVESTREAM REPORT', kind: 'folder' }
    },
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin' }),
  })
  assert.equal((await handler.POST(request({ ...routePayload(), root_folder_id: 'other' }))).status, 409)
  assert.equal((await handler.POST(request({ ...routePayload(), brand_id: 'brand-2' }))).status, 409)
  assert.equal((await handler.POST(request({ ...routePayload(), platform_id: 'unknown' }))).status, 404)
  assert.equal(metadataCalls, 0)

  const response = await handler.POST(request(routePayload()))
  assert.equal(response.status, 200)
  assert.equal(state.rows.operational_storage_routes.length, 1)
  const saved = state.rows.operational_storage_routes[0]
  assert.equal(saved.brand_id, 'brand-3')
  assert.equal(saved.platform_id, 'platform-1')
  assert.equal(saved.execution_source, 'internal')
  assert.equal(saved.provider, 'google_drive')
  assert.equal(saved.root_folder_id, 'approved-drive-root')
  assert.equal(saved.subbrand_key, null)
  assert.equal(saved.active, true)

  const repeated = await handler.POST(request(routePayload()))
  assert.equal(repeated.status, 409)
  assert.equal(state.rows.operational_storage_routes.length, 1)
})

test('shift source classification requires explicit review and matching CAS version; uses user-session RPC', async () => {
  const state = fixture()
  const rpcCalls: Array<{ id: string; version: number; source: string }> = []
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin' }),
    updateShift: async (id, version, source) => {
      rpcCalls.push({ id, version, source })
      return { data: { id, version: version + 1, execution_source: source }, error: null }
    },
  })
  const data = (version: number, source: string, confirmation = 'I_REVIEWED_THIS_SHIFT_SOURCE') =>
    ({ action: 'classify_shift', shift_id: 'shift-1', expected_version: version,
      execution_source: source, confirmation })
  assert.equal((await handler.POST(request(data(2, 'internal')))).status, 409)
  assert.equal((await handler.POST(request(data(3, 'unknown')))).status, 400)
  assert.equal((await handler.POST(request(data(3, 'agency', 'not-reviewed')))).status, 400)
  assert.equal(rpcCalls.length, 0)
  const good = await handler.POST(request(data(3, 'agency')))
  assert.equal(good.status, 200)
  assert.deepEqual(rpcCalls, [{ id: 'shift-1', version: 3, source: 'agency' }])
  assert.equal(state.rows.shifts[0].execution_source, null, 'must not use service-role shift UPDATE')
})
