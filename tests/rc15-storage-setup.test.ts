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
        return { data: found, error: null, count: found.length }
      }
      const q = {
        select(_columns?: string) { return q },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return q },
        is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return q },
        order(_key: string, _opts?: unknown) { return q },
        limit(_n: number) { return q },
        range(_from: number, _to: number) { return q },
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
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
  })
  const response = await handler.GET(new Request('https://example.test/api/operational-storage-setup'))
  assert.equal(response.status, 200)
  const body = await response.json() as {
    schema_ready: boolean; brands: Row[]; unclassified_shifts_sample: Row[]; root_configured: boolean
  }
  assert.equal(body.schema_ready, true)
  assert.equal(body.brands.find(b => b.id === 'brand-1')?.storage_profile, null)
  assert.equal(body.unclassified_shifts_sample[0]?.execution_source, null)
  assert.equal((body as typeof body & { unclassified_shifts_count: number }).unclassified_shifts_count, 1)
  assert.equal(body.root_configured, true)
  assert.equal(state.rows.shifts[0].execution_source, null)
})

test('explicit canonical brand approval never silently converts legacy profiles', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
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
  assert.equal(state.rows.brands[0].storage_profile_reviewed_by, 'admin')
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
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
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
  assert.equal(saved.approved_by, 'admin')

  const repeated = await handler.POST(request(routePayload()))
  assert.equal(repeated.status, 409)
  assert.equal(state.rows.operational_storage_routes.length, 1)
})

test('shift source classification requires explicit review and matching CAS version; uses user-session RPC', async () => {
  const state = fixture()
  const rpcCalls: Array<{ id: string; version: number; source: string }> = []
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
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


test('reviewed legacy route requires exact historical folder labels and real base-folder ancestry', async () => {
  const state = fixture()
  const checked: string[] = []
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    getRoot: () => 'approved-drive-root',
    metadata: async folderId => {
      checked.push(folderId)
      if (folderId === 'approved-drive-root') return { id: folderId, name: 'Root', kind: 'folder', parent_ids: [] }
      if (folderId === 'historical-base') return {
        id: folderId, name: 'Existing Brand Files', kind: 'folder', parent_ids: ['approved-drive-root'],
      }
      return { id: folderId, name: 'Unrelated', kind: 'folder', parent_ids: ['external-parent'] }
    },
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
  })
  const make = (overrides: Record<string, unknown> = {}) => request({
    action: 'register_legacy_route', brand_id: 'brand-2', platform_id: 'platform-1',
    execution_source: 'agency', root_folder_id: 'approved-drive-root',
    base_folder_id: 'historical-base', storage_profile: 'LEGACY_PERIOD_CATEGORY',
    period_naming_style: 'THANG_M_DASH_YEAR',
    folder_labels: {
      dashboard: 'DASHBOARD', live_visual_internal: 'VISIBILITY',
      live_visual_agency: 'VISUAL HOST',
      data_report: ['DATA', 'REPORT'], data_source: ['DATA', 'SOURCE'],
    },
    confirmation: 'I_VERIFIED_LEGACY_PROVIDER_BASE_AND_PATHS',
    ...overrides,
  })
  assert.equal((await handler.POST(make({ base_folder_id: 'unrelated' }))).status, 409)
  assert.equal(state.rows.operational_storage_routes.length, 0)
  assert.equal((await handler.POST(make({ folder_labels: {
    dashboard: '../escape', live_visual_internal: 'VISIBILITY',
    live_visual_agency: 'VISUAL HOST', data_report: ['DATA', 'REPORT'],
    data_source: ['DATA', 'SOURCE'],
  } }))).status, 400)
  assert.equal(state.rows.operational_storage_routes.length, 0)
  assert.equal((await handler.POST(make({ storage_profile: 'LEGACY_CATEGORY_PERIOD' }))).status, 409)
  assert.equal((await handler.POST(make())).status, 200)
  assert.deepEqual(checked.slice(-2), ['approved-drive-root', 'historical-base'])
  const stored = state.rows.operational_storage_routes[0]
  assert.equal(stored.storage_profile, 'LEGACY_PERIOD_CATEGORY')
  assert.equal(stored.root_folder_id, 'approved-drive-root')
  assert.equal(stored.base_folder_id, 'historical-base')
  assert.deepEqual(stored.folder_labels.data_source, ['DATA', 'SOURCE'])
  assert.equal(stored.approved_by, 'admin')
  assert.equal((await handler.POST(make())).status, 409)
  assert.equal(state.rows.operational_storage_routes.length, 1)
})

test('unknown profile may be classified legacy but an existing canonical/legacy profile cannot be overwritten', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
  })
  const response = await handler.POST(request({
    action: 'classify_brand_profile', brand_id: 'brand-1',
    storage_profile: 'LEGACY_CATEGORY_PERIOD',
    confirmation: 'I_VERIFIED_THIS_BRAND_FOLDER_PROFILE',
  }))
  assert.equal(response.status, 200)
  assert.equal(state.rows.brands[0].storage_profile, 'LEGACY_CATEGORY_PERIOD')
  assert.equal((await handler.POST(request({
    action: 'classify_brand_profile', brand_id: 'brand-1',
    storage_profile: 'CANONICAL_V1',
    confirmation: 'I_VERIFIED_THIS_BRAND_USES_CANONICAL_FOLDERS',
  }))).status, 409)
  assert.equal(state.rows.brands[0].storage_profile, 'LEGACY_CATEGORY_PERIOD')
})


test('legacy route preview applies exact monthly exceptions without creating routes or files', async () => {
  const state = fixture()
  let metadataReads = 0
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    getRoot: () => 'approved-drive-root',
    metadata: async id => {
      metadataReads += 1
      if (id === 'approved-drive-root') return { id, kind: 'folder', name: 'Root', parent_ids: [] }
      if (id === 'historic-base') return {
        id, kind: 'folder', name: 'Mars Wrigley', parent_ids: ['approved-drive-root'],
      }
      return { id, kind: 'folder', name: 'Unrelated', parent_ids: ['unknown'] }
    },
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
  })
  const candidate = {
    action: 'preview_legacy_route', brand_id: 'brand-2', platform_id: 'platform-1',
    execution_source: 'agency', root_folder_id: 'approved-drive-root',
    base_folder_id: 'historic-base', storage_profile: 'LEGACY_PERIOD_CATEGORY',
    period_naming_style: 'THANG_M_DASH_YEAR', shift_date: '2026-07-20',
    period_label_overrides: { '2026-07': { default: 'Tháng 7-2026' } },
    folder_labels: {
      dashboard: 'DASHBOARD', live_visual_internal: 'VISIBILITY',
      live_visual_agency: 'VISUAL HOST',
      data_report: ['DATA', 'REPORT'], data_source: ['DATA', 'SOURCE'],
    },
  }
  const result = await handler.POST(request(candidate))
  assert.equal(result.status, 200)
  const json = await result.json() as {
    ok: boolean; read_only: boolean;
    legacy: { dashboard: string; data_source: string };
    v2: { folder_path: string; base_folder_id: string }
  }
  assert.equal(json.read_only, true)
  assert.equal(json.legacy.dashboard, 'Tháng 7-2026/DASHBOARD')
  assert.equal(json.legacy.data_source, 'Tháng 7-2026/DATA/SOURCE')
  assert.equal(json.v2.base_folder_id, 'approved-drive-root')
  assert.equal(json.v2.folder_path,
    'ADA_STORAGE_V2/brand-2/platform-1/AGENCY/Tháng 7-2026/PRODUCTION/ASSETS')
  assert.equal(metadataReads, 2)
  assert.equal(state.rows.operational_storage_routes.length, 0)

  const invalid = await handler.POST(request({
    ...candidate, period_label_overrides: { '2026-13': { default: 'Invalid month' } },
  }))
  assert.equal(invalid.status, 400)
  assert.equal(state.rows.operational_storage_routes.length, 0)

  const outsideRoot = await handler.POST(request({ ...candidate, base_folder_id: 'outside-root' }))
  assert.equal(outsideRoot.status, 409)
  assert.equal(state.rows.operational_storage_routes.length, 0)
})


test('explicit P-period spans April-May only for the approved category', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    getRoot: () => 'approved-drive-root',
    metadata: async id => ({
      id, kind: 'folder', name: id,
      parent_ids: id === 'legacy-root' ? ['approved-drive-root'] : [],
    }),
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
  })
  const payload = {
    action: 'preview_legacy_route', brand_id: 'brand-2', platform_id: 'platform-1',
    execution_source: 'internal', root_folder_id: 'approved-drive-root',
    base_folder_id: 'legacy-root', storage_profile: 'LEGACY_PERIOD_CATEGORY',
    period_naming_style: 'THANG_M_DASH_YEAR',
    shift_date: '2026-05-02',
    period_date_ranges: [
      { start_date: '2026-04-20', end_date: '2026-05-16', category: 'dashboard',
        label: 'P5 | 20-04 - 16-05' },
    ],
    folder_labels: {
      dashboard: 'DASHBOARD', live_visual_internal: 'VISIBILITY',
      live_visual_agency: 'VISUAL HOST', data_report: ['DATA', 'REPORT'],
      data_source: ['DATA', 'SOURCE'],
    },
  }
  const preview = await handler.POST(request(payload))
  assert.equal(preview.status, 200)
  const body = await preview.json() as {
    read_only: boolean; legacy: { dashboard: string; data_source: string };
    v2: { folder_path: string }
  }
  assert.equal(body.read_only, true)
  assert.equal(body.legacy.dashboard, 'P5 | 20-04 - 16-05/DASHBOARD')
  assert.equal(body.legacy.data_source, 'Tháng 5 - 2026/DATA/SOURCE')
  assert.match(body.v2.folder_path, /Tháng 5 - 2026/)
  assert.equal(state.rows.operational_storage_routes.length, 0)

  const crossing = await handler.POST(request({ ...payload, shift_date: '2026-05-17' }))
  assert.equal(crossing.status, 200)
  const regular = await crossing.json() as { legacy: { dashboard: string } }
  assert.equal(regular.legacy.dashboard, 'Tháng 5 - 2026/DASHBOARD')
})

test('P-period validation rejects overlap, bad calendar dates and traversal without DB writes', async () => {
  const state = fixture()
  const handler = createOperationalStorageSetupHandler({
    createClient: () => state.conn,
    getRoot: () => 'approved-drive-root',
    metadata: async id => ({
      id, kind: 'folder', name: id,
      parent_ids: id === 'legacy-root' ? ['approved-drive-root'] : [],
    }),
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
  })
  const route = {
    action: 'register_legacy_route', brand_id: 'brand-2', platform_id: 'platform-1',
    execution_source: 'internal', root_folder_id: 'approved-drive-root',
    base_folder_id: 'legacy-root', storage_profile: 'LEGACY_PERIOD_CATEGORY',
    period_naming_style: 'THANG_M_DASH_YEAR',
    folder_labels: {
      dashboard: 'DASHBOARD', live_visual_internal: 'VISIBILITY',
      live_visual_agency: 'VISUAL HOST', data_report: ['DATA', 'REPORT'],
      data_source: ['DATA', 'SOURCE'],
    },
    confirmation: 'I_VERIFIED_LEGACY_PROVIDER_BASE_AND_PATHS',
  }
  const validRange = {
    start_date: '2026-04-20', end_date: '2026-05-16',
    category: 'dashboard', label: 'P5 April-May',
  }
  const cases = [
    [validRange, { ...validRange, start_date: '2026-05-16', end_date: '2026-06-15' }],
    [{ ...validRange, start_date: '2026-02-30' }],
    [{ ...validRange, label: '../another brand' }],
  ]
  for (const ranges of cases) {
    const r = await handler.POST(request({ ...route, period_date_ranges: ranges }))
    assert.equal(r.status, 400)
    assert.equal(state.rows.operational_storage_routes.length, 0)
  }
})
