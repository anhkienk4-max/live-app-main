import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CloudAssetReferenceError,
  decodeCloudAssetReference,
  encodeCloudAssetReference,
  projectCloudAssetReference,
  projectPublicReportImageRow,
} from '@/lib/files/cloudAssetReference'
import {
  OperationalStoragePlacementError,
  resolveOperationalStoragePlacement,
  type OperationalStoragePlacementInput,
  type OperationalStorageRoute,
} from '@/lib/files/operationalStoragePlacementResolver'
import { createReportImageRouteHandler } from '@/lib/server/reportImageRouteHandler'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import { resolveOperationalStorageRoutingMode } from '@/lib/server/operationalStorageRoutingMode'
import {
  createStaticOperationalStorageRouteRepository,
  parseStaticOperationalStorageRoutes,
} from '@/lib/server/staticOperationalStorageRouteRepository'
import { createSupabaseShiftRepository } from '@/lib/services/supabaseShiftService'
import { createSupabaseReportRepository } from '@/lib/services/supabaseReportService'
import { parseScheduleRows } from '@/lib/utils/excelUtils'
import { ExecutionSourceError, resolveExecutionSource } from '@/lib/utils/executionSource'

const user = { id: 'auth-1', businessUserId: 'business-1', systemPermission: 'member' as const }
const staticRoute = {
  provider: 'google_drive',
  execution_source: 'internal',
  brand: 'Mars Snacking',
  platform: null,
  subbrand_key: null,
  storage_profile: 'LEGACY_CATEGORY_PERIOD',
  root_folder_id: 'root-a',
  base_folder_id: 'base-a',
  folder_labels: { dashboard: 'DASHBOARD', live_visual_internal: 'VISIBILITY' },
  period_naming_style: 'THANG_M_DASH_YEAR',
  active: true,
} as const

function jsonRoutes(...routes: object[]) {
  return JSON.stringify(routes)
}

function routeFor(input: OperationalStoragePlacementInput): OperationalStorageRoute {
  const agency = input.executionSource === 'agency'
  return {
    id: 'compat-route',
    provider: input.provider,
    execution_source: input.executionSource,
    brand_id: input.brandId,
    platform_id: null,
    subbrand_key: null,
    storage_profile: agency ? 'LEGACY_PERIOD_CATEGORY' : 'LEGACY_CATEGORY_PERIOD',
    root_folder_id: agency ? 'root-b' : 'root-a',
    base_folder_id: agency ? 'agency-base' : 'internal-base',
    folder_labels: {
      dashboard: 'DASHBOARD',
      live_visual_internal: 'VISIBILITY',
      live_visual_agency: 'VISUAL HOST',
    },
    period_naming_style: agency ? 'THANG_M_DOT_YEAR' : 'THANG_M_DASH_YEAR',
    active: true,
  }
}

test('execution source uses explicit values and standalone Agency studio tokens only', () => {
  for (const studio of ['Agency', 'AGENCY', 'Agency Studio', 'Studio Agency', 'ADA Agency - Room 1', 'studio agency']) {
    assert.equal(resolveExecutionSource({ studio }), 'agency')
  }
  assert.equal(resolveExecutionSource({ studio: 'interagency' }), 'internal')
  assert.equal(resolveExecutionSource({ studio: 'agency123' }), 'internal')
  assert.equal(resolveExecutionSource({ studio: 'myagency' }), 'internal')
  assert.equal(resolveExecutionSource({ studio: 'Studio 1' }), 'internal')
  assert.equal(resolveExecutionSource({ explicit: 'internal', studio: 'Agency Studio' }), 'internal')
  assert.throws(() => resolveExecutionSource({ explicit: 'Vendor', studio: 'Agency' }), ExecutionSourceError)
})

test('routing mode defaults to database and accepts only the server compatibility selector', () => {
  assert.equal(resolveOperationalStorageRoutingMode(undefined), 'database')
  assert.equal(resolveOperationalStorageRoutingMode('compat'), 'compat')
  assert.throws(
    () => resolveOperationalStorageRoutingMode('legacy'),
    (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_CONFIG_INVALID',
  )
})

test('imports derive Agency from Studio while rejecting an invalid explicit source', () => {
  const maps = {
    brands: new Map([['Brand', 'brand-1']]),
    platforms: new Map([['Platform', 'platform-1']]),
    campaigns: new Map<string, string>(),
  }
  const source = {
    Date: '2026-10-01', 'Start time': '09:00', 'End time': '10:00',
    Brand: 'Brand', Platform: 'Platform', Studio: 'ADA Agency - Room 1',
  }
  const derived = parseScheduleRows([source], maps)
  assert.equal(derived.validShifts[0].execution_source, 'agency')
  assert.doesNotMatch(derived.rows[0].row.warnings.join(' '), /remain unclassified/)
  const invalid = parseScheduleRows([{ ...source, 'Execution Source': 'Vendor' }], maps)
  assert.equal(invalid.invalidRows, 1)
  assert.match(invalid.rows[0].row.errors.join(' '), /must be Internal or Agency/)
})

test('static route configuration validates strictly and resolves exact normalized labels', async () => {
  const repository = createStaticOperationalStorageRouteRepository(jsonRoutes(
    staticRoute,
    { ...staticRoute, platform: 'TikTok   Shop', base_folder_id: 'platform-base' },
  ))
  const placement = await repository.resolvePlacement({
    provider: 'google_drive', executionSource: 'internal', brandId: 'ignored-id', platformId: 'ignored-platform-id',
    subbrandKey: null, shiftDate: '2026-10-01', logicalCategory: 'dashboard', fileName: 'test.png',
    brandLabel: '  MARS   SNACKING ', platformLabel: 'tiktok shop',
  })
  assert.equal(placement.baseFolderId, 'platform-base')
  assert.deepEqual(placement.folderSegments, ['DASHBOARD', 'Tháng 10 - 2026'])

  await assert.rejects(() => repository.resolvePlacement({
    provider: 'google_drive', executionSource: 'internal', brandId: 'ignored', platformId: null,
    subbrandKey: null, shiftDate: '2026-10-01', logicalCategory: 'dashboard', fileName: 'test.png',
    brandLabel: 'Other Brand', platformLabel: 'TikTok Shop',
  }), (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_NOT_CONFIGURED')
})

test('Female AI canonical route uses brand/platform/month/category while Mars legacy routes stay unchanged', async () => {
  const adaRoot = '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm'
  const repository = createStaticOperationalStorageRouteRepository(jsonRoutes(
    {
      provider: 'google_drive', execution_source: 'internal', brand: 'Female AI livestream',
      platform: null, subbrand_key: null, storage_profile: 'CANONICAL_V1',
      root_folder_id: adaRoot, base_folder_id: adaRoot, folder_labels: {},
      period_naming_style: 'THANG_M_DOT_YEAR', active: true,
    },
    {
      ...staticRoute, root_folder_id: adaRoot, base_folder_id: '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5',
      storage_profile: 'LEGACY_CATEGORY_PERIOD',
    },
    {
      ...staticRoute, execution_source: 'agency', root_folder_id: adaRoot,
      base_folder_id: '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE',
      storage_profile: 'LEGACY_PERIOD_CATEGORY',
      folder_labels: { dashboard: 'DASHBOARD', live_visual_agency: 'VISUAL HOST' },
      period_naming_style: 'THANG_M_DOT_YEAR',
    },
  ))
  const resolve = (brandLabel: string, executionSource: 'internal' | 'agency', logicalCategory: 'dashboard' | 'live_visual') =>
    repository.resolvePlacement({
      provider: 'google_drive', executionSource, brandId: 'brand-id', platformId: 'shopee-id',
      subbrandKey: null, shiftDate: '2026-09-14', logicalCategory, fileName: 'image.png',
      brandLabel, platformLabel: 'Shopee Live',
    })

  for (const category of ['dashboard', 'live_visual'] as const) {
    const placement = await resolve('Female AI livestream', 'internal', category)
    assert.equal(placement.baseFolderId, adaRoot)
    assert.deepEqual(placement.folderSegments, [
      'Female AI livestream', 'Shopee Live', 'THÁNG 09.2026', category === 'dashboard' ? 'DASHBOARD' : 'VISIBILITY',
    ])
  }
  assert.deepEqual((await resolve('Mars Snacking', 'internal', 'dashboard')).folderSegments, ['DASHBOARD', 'Tháng 9 - 2026'])
  assert.deepEqual((await resolve('Mars Snacking', 'agency', 'dashboard')).folderSegments, ['THÁNG 9.2026', 'DASHBOARD'])
  assert.deepEqual((await resolve('Mars Snacking', 'internal', 'live_visual')).folderSegments, ['VISIBILITY', 'Tháng 9 - 2026'])
  assert.deepEqual((await resolve('Mars Snacking', 'agency', 'live_visual')).folderSegments, ['THÁNG 9.2026', 'VISUAL HOST'])
})

test('static route configuration rejects malformed, duplicate, and ambiguous routes', async () => {
  const invalidRoutes = [
    { ...staticRoute, provider: 'dropbox' },
    { ...staticRoute, execution_source: 'vendor' },
    { ...staticRoute, brand: ' ' },
    { ...staticRoute, storage_profile: 'LEGACY_UNKNOWN' },
    { ...staticRoute, root_folder_id: '' },
    { ...staticRoute, folder_labels: { dashboard: ['DASHBOARD'] } },
    { ...staticRoute, period_naming_style: 'MONTH_YEAR' },
  ]
  for (const route of invalidRoutes) {
    assert.throws(
      () => parseStaticOperationalStorageRoutes(jsonRoutes(route)),
      (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_CONFIG_INVALID',
    )
  }
  assert.throws(
    () => parseStaticOperationalStorageRoutes(jsonRoutes(staticRoute, staticRoute)),
    (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_AMBIGUOUS',
  )

  const ambiguous = createStaticOperationalStorageRouteRepository(jsonRoutes(
    { ...staticRoute, platform: 'TikTok Shop' },
    { ...staticRoute, subbrand_key: 'xmen' },
  ))
  await assert.rejects(() => ambiguous.resolvePlacement({
    provider: 'google_drive', executionSource: 'internal', brandId: 'id', platformId: 'platform-id', subbrandKey: 'XMEN',
    shiftDate: '2026-10-01', logicalCategory: 'dashboard', fileName: 'test.png',
    brandLabel: 'Mars Snacking', platformLabel: 'TikTok Shop',
  }), (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_AMBIGUOUS')
})

test('folder materialization reuses provider folders and creates a new month only through ensureFolder', async () => {
  const calls: string[] = []
  const known = new Map([['internal-base/DASHBOARD', 'dashboard-id']])
  const materialize = createOperationalStorageFolderMaterializer(async (parentId, name, provider) => {
    calls.push(`${provider}:${parentId}:${name}`)
    const key = `${parentId}/${name}`
    const id = known.get(key) ?? `created-${name}`
    known.set(key, id)
    return { provider, id, name, parentId }
  })
  const input: OperationalStoragePlacementInput = {
    provider: 'google_drive', executionSource: 'internal', brandId: 'brand', platformId: null, subbrandKey: null,
    shiftDate: '2026-11-01', logicalCategory: 'dashboard', fileName: 'test.png',
  }
  const finalParent = await materialize(resolveOperationalStoragePlacement(routeFor(input), input))
  assert.equal(finalParent, 'created-Tháng 11 - 2026')
  assert.deepEqual(calls, [
    'google_drive:internal-base:DASHBOARD',
    'google_drive:dashboard-id:Tháng 11 - 2026',
  ])
})

test('compat shift reads and writes omit execution_source while retaining in-memory semantics', async () => {
  const selects: string[] = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const base = {
    id: 'shift-1', date: '2026-10-01', start_time: '09:00', end_time: '10:00', timezone: 'Asia/Ho_Chi_Minh',
    brand_id: 'brand-1', platform_id: 'platform-1', studio: 'Agency Studio', status: 'scheduled',
    crosses_midnight: false, duration_minutes: 60, end_date: '2026-10-01', required_host_count: 1,
    required_support_count: 1, required_technical_count: 1, registration_locked: false, allow_multi_role: false,
    host_names: [], assistant_names: [], technical_names: [], created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z', version: 1,
  }
  const client = {
    from() {
      const query = {
        select(columns: string) { selects.push(columns); return query },
        eq() { return query },
        maybeSingle: async () => ({ data: base, error: null }),
      }
      return query
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      return { single: async () => ({ data: name === 'refresh_automatic_shift_statuses' ? true : base, error: null }) }
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseShiftRepository(client, { routingMode: 'compat' })
  assert.equal((await repository.getById('shift-1'))?.execution_source, 'agency')
  await repository.create({ ...base, execution_source: 'internal' })
  await repository.update('shift-1', { execution_source: 'agency', studio: 'Agency Studio' }, false, 1)
  assert.equal(selects.some(columns => columns.includes('execution_source')), false)
  const writes = rpcCalls.filter(call => call.name === 'create_shift' || call.name === 'update_shift')
  assert.equal(Object.hasOwn(writes[0].args.p_data as object, 'execution_source'), false)
  assert.equal(Object.hasOwn(writes[1].args.p_patch as object, 'execution_source'), false)
})

function formRequest(fields: Record<string, string>, name = 'compat.png', bytes = [1, 2, 3]) {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => form.set(key, value))
  form.set('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), name)
  return new Request('https://example.test/api/report-images', { method: 'POST', body: form })
}

function compatHarness(options: {
  actor?: typeof user
  providerDeleteFails?: boolean
  metadataRemoveFails?: boolean
  externalFileId?: string
  routeError?: string
  concurrentUploads?: boolean
  metadataUploadFails?: boolean
} = {}) {
  const selects: Array<{ table: string; columns: string }> = []
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const storageCalls: string[] = []
  const routeInputs: OperationalStoragePlacementInput[] = []
  let uploadCount = 0
  let releaseUploads!: () => void
  const uploadBarrier = new Promise<void>(resolve => { releaseUploads = resolve })
  const rows: Record<string, Record<string, unknown>[]> = {
    reports: [{
      id: 'report-1', shift_id: 'shift-1', submitted_by: 'business-1', metrics_confirmed: false,
      status: 'draft', deleted_at: null, archived_at: null,
    }],
    shifts: [{ id: 'shift-1', date: '2026-10-01', brand_id: 'brand-1', platform_id: 'platform-1', studio: 'Agency Studio' }],
    brands: [{ id: 'brand-1', name: 'Mars Snacking' }],
    platforms: [{ id: 'platform-1', name: 'TikTok Shop' }],
    report_images: [],
    live_report_images: [],
  }
  function query(table: string) {
    const filters: Array<[string, unknown]> = []
    let limit = Number.POSITIVE_INFINITY
    const execute = async () => ({
      data: (rows[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value)).slice(0, limit),
      error: null,
    })
    const builder = {
      select(columns: string) { selects.push({ table, columns }); return builder },
      eq(column: string, value: unknown) { filters.push([column, value]); return builder },
      is(column: string, value: unknown) { filters.push([column, value]); return builder },
      limit(value: number) { limit = value; return builder },
      maybeSingle: async () => {
        const result = await execute()
        return { data: result.data[0] ?? null, error: null }
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return execute().then(resolve, reject)
      },
    }
    return builder
  }
  const client = {
    from: query,
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      return { single: async () => {
        if (name === 'upload_report_image') {
          const row = {
            id: 'report-image-1', report_id: args.p_report_id, storage_path: args.p_storage_path,
            image_url: args.p_image_url, original_name: args.p_original_name, mime_type: args.p_mime_type,
            image_type: args.p_image_type, uploaded_by: 'business-1',
          }
          rows.report_images.push(row)
          return { data: row, error: null }
        }
        if (name === 'upsert_live_report_image') {
          if (options.metadataUploadFails) return { data: null, error: { message: 'metadata insert failed' } }
          const data = args.p_data as Record<string, unknown>
          const existing = rows.live_report_images.find(row => row.report_id === data.report_id
            && row.storage_idempotency_key === data.storage_idempotency_key)
          if (existing) return { data: existing, error: null }
          const row = { id: `live-image-${rows.live_report_images.length + 1}`, uploaded_by: 'business-1', ...data }
          rows.live_report_images.push(row)
          return { data: row, error: null }
        }
        if (name === 'remove_report_image' || name === 'remove_live_report_image') {
          if (options.metadataRemoveFails) return { data: null, error: { message: 'metadata removal failed' } }
          if (name === 'remove_report_image') rows.report_images = rows.report_images.filter(row => row.id !== args.p_image_id)
          if (name === 'remove_live_report_image') rows.live_report_images = rows.live_report_images.filter(row => row.id !== args.p_image_id)
        }
        return { data: true, error: null }
      } }
    },
    storage: {
      from() {
        return {
          async download(path: string) {
            storageCalls.push(`legacy-read:${path}`)
            return { data: new Blob([new Uint8Array([9, 8])]), error: null }
          },
          async remove(paths: string[]) { storageCalls.push(`legacy-delete:${paths.join(',')}`); return { error: null } },
        }
      },
    },
  }
  const storage = {
    async ensureFolder(parentId: string, name: string, provider: string) {
      storageCalls.push(`ensure:${provider}:${parentId}:${name}`)
      return { provider, id: `${parentId}/${name}`, name, parentId }
    },
    async upload(input: { destination?: { provider?: string }; external_parent_id?: string; name: string }) {
      storageCalls.push(`upload:${input.destination?.provider}:${input.external_parent_id}:${input.name}`)
      const uploadNumber = ++uploadCount
      if (options.concurrentUploads) {
        if (uploadCount === 2) releaseUploads()
        await uploadBarrier
      }
      return { asset: {
        id: 'asset', provider: input.destination?.provider,
        external_file_id: options.externalFileId ?? (options.concurrentUploads ? `race-file-${uploadNumber}` : `file-${input.destination?.provider}`),
        name: input.name, mime_type: 'image/png', size_bytes: 3, entity_type: 'report', entity_id: 'report-1',
        status: 'active', created_by: 'business-1', created_at: '2026-10-01T00:00:00Z',
      } }
    },
    async read(reference: { provider: string; external_file_id: string }) {
      storageCalls.push(`read:${reference.provider}:${reference.external_file_id}`)
      return new Uint8Array([1, 2, 3])
    },
    async delete(reference: { provider: string; external_file_id: string }) {
      storageCalls.push(`delete:${reference.provider}:${reference.external_file_id}`)
      if (options.providerDeleteFails) throw new Error('provider failure detail')
    },
  }
  const handler = createReportImageRouteHandler({
    routingMode: 'compat',
    resolveUser: async () => options.actor ?? user,
    createClient: async () => client as never,
    storage: storage as never,
    routeResolver: {
      async resolvePlacement(input) {
        routeInputs.push(input)
        if (options.routeError) throw new OperationalStoragePlacementError(options.routeError as never)
        return resolveOperationalStoragePlacement(routeFor(input), input)
      },
    },
  })
  return { client, handler, rows, rpcCalls, routeInputs, selects, storageCalls }
}

test('compat report upload uses existing schema, Studio routing, and exact-parent provider upload', async () => {
  const h = compatHarness()
  const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  assert.equal(response.status, 200)
  assert.equal(h.routeInputs[0].executionSource, 'agency')
  assert.equal(h.routeInputs[0].brandLabel, 'Mars Snacking')
  assert.equal(h.routeInputs[0].platformLabel, 'TikTok Shop')
  assert.equal(h.selects.find(call => call.table === 'shifts')?.columns, 'date,brand_id,platform_id,studio')
  assert.equal(h.selects.some(call => call.table === 'operational_storage_routes'), false)
  assert.equal(h.selects.some(call => call.columns.includes('storage_profile')), false)
  assert.equal(h.selects.some(call => /provider|external_file_id/u.test(call.columns)), false)
  assert.deepEqual(h.rpcCalls.map(call => call.name), ['upload_report_image'])
  assert.equal(decodeCloudAssetReference(h.rows.report_images[0].image_url)?.provider, 'google_drive')
  const storedName = h.rows.report_images[0].storage_path.split('/').at(-1)
  assert.match(storedName, /^20261001_dashboard_[A-F0-9]{64}_compat\.png$/u)
  assert.equal(h.rpcCalls[0].args.p_original_name, 'compat.png')
  assert.equal(h.rows.report_images[0].storage_path, `THÁNG 10.2026/DASHBOARD/${storedName}`)
  assert.ok(h.storageCalls.includes(`upload:google_drive:agency-base/THÁNG 10.2026/DASHBOARD:${storedName}`))
})

test('compat live upload uses the legacy RPC and supports Google/OneDrive exact-parent parity', async () => {
  for (const provider of ['google_drive', 'onedrive'] as const) {
    const h = compatHarness()
    const response = await h.handler.POST(formRequest({
      kind: 'live', report_id: 'report-1', category: 'key_visual', provider,
    }, `${provider}.png`))
    assert.equal(response.status, 200)
    assert.deepEqual(h.rpcCalls.map(call => call.name), ['upsert_live_report_image'])
    assert.equal(decodeCloudAssetReference(h.rows.live_report_images[0].file_url)?.provider, provider)
    assert.ok(h.storageCalls.some(call => call.startsWith(`upload:${provider}:agency-base/THÁNG 10.2026/VISUAL HOST:`)))
    assert.equal(h.rpcCalls.some(call => call.name.includes('_with_provider')), false)
  }
})

test('compat POST responses project cloud references to safe report and live image URLs', async () => {
  const report = compatHarness({ externalFileId: 'gd-secret-id-123' })
  const reportResponse = await report.handler.POST(formRequest({
    kind: 'report', report_id: 'report-1', image_type: 'dashboard',
  }, 'report-safe.png'))
  const reportBody = await reportResponse.json()
  assert.equal(reportBody.image.image_url, '/api/report-images?kind=report&image_id=report-image-1')
  assert.doesNotMatch(JSON.stringify(reportBody), /gd-secret-id-123|cloudref:/u)

  const live = compatHarness({ externalFileId: 'od-secret-id-456' })
  const liveResponse = await live.handler.POST(formRequest({
    kind: 'live', report_id: 'report-1', category: 'key_visual', provider: 'onedrive',
  }, 'live-safe.png'))
  const liveBody = await liveResponse.json()
  assert.equal(liveBody.image.file_url, '/api/report-images?kind=live&image_id=live-image-1')
  assert.doesNotMatch(JSON.stringify(liveBody), /od-secret-id-456|cloudref:/u)
  const liveUrl = new URL(liveBody.image.file_url, 'https://example.test')
  assert.equal(liveUrl.pathname, '/api/report-images')
  const params = liveUrl.searchParams
  assert.deepEqual([...params.keys()], ['kind', 'image_id'])
  assert.deepEqual([...params.entries()], [['kind', 'live'], ['image_id', 'live-image-1']])
})

test('public row projection also hides RC1.2 provider columns and preserves ordinary paths', () => {
  const report = projectPublicReportImageRow({
    id: 'report-provider-row', image_url: 'DASHBOARD/test.png',
    provider: 'google_drive', external_file_id: 'gd-secret-id-123',
  }, 'report')
  const live = projectPublicReportImageRow({
    id: 'live-provider-row', file_url: 'VISUAL HOST/test.png',
    provider: 'onedrive', external_file_id: 'od-secret-id-456',
  }, 'live')
  assert.equal(report.image_url, '/api/report-images?kind=report&image_id=report-provider-row')
  assert.equal(live.file_url, '/api/report-images?kind=live&image_id=live-provider-row')
  assert.equal(Object.hasOwn(report, 'provider'), false)
  assert.equal(Object.hasOwn(report, 'external_file_id'), false)
  assert.equal(Object.hasOwn(live, 'provider'), false)
  assert.equal(Object.hasOwn(live, 'external_file_id'), false)
  assert.equal(projectPublicReportImageRow({ id: 'legacy', image_url: 'reports/r1/dashboard/file.png' }, 'report').image_url, 'reports/r1/dashboard/file.png')
})

test('browser report repository mappings hide cloud references and preserve legacy Storage paths', async () => {
  const reportRows = [{
    id: 'report-image-r1', report_id: 'r1', image_url: encodeCloudAssetReference({
      provider: 'google_drive', external_file_id: 'gd-secret-id-123',
    }), storage_path: 'DASHBOARD/test.png', image_type: 'dashboard', created_at: '2026-10-01T00:00:00Z', deleted_at: null,
  }, {
    id: 'report-image-legacy', report_id: 'r1', image_url: 'reports/r1/dashboard/file.png',
    storage_path: 'reports/r1/dashboard/file.png', image_type: 'dashboard', created_at: '2026-10-01T00:00:01Z', deleted_at: null,
  }]
  const liveRows = [{
    id: 'live-image-r1', report_id: 'r1', file_url: encodeCloudAssetReference({
      provider: 'onedrive', external_file_id: 'od-secret-id-456',
    }), thumbnail_url: encodeCloudAssetReference({
      provider: 'onedrive', external_file_id: 'od-secret-id-456',
    }), file_name: 'live.png', mime_type: 'image/png', sort_order: 2, is_cover: true,
    created_at: '2026-10-01T00:00:00Z',
  }, {
    id: 'live-image-legacy', report_id: 'r1', file_url: 'live/r1/file.png',
    file_name: 'legacy.png', mime_type: 'image/png', sort_order: 3, is_cover: false,
    created_at: '2026-10-01T00:00:01Z',
  }]
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      const builder = {
        select() { return builder },
        eq(column: string, value: unknown) { filters.push([column, value]); return builder },
        is(column: string, value: unknown) { filters.push([column, value]); return builder },
        order() { return builder },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const rows = table === 'report_images' ? reportRows : liveRows
          const data = rows.filter(row => filters.every(([column, value]) => row[column as keyof typeof row] === value))
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }
  const repository = createSupabaseReportRepository(client as never)
  const reports = await repository.getReportImages('r1')
  const live = await repository.getLiveReportImages('r1')

  assert.equal(reports[0].image_url, '/api/report-images?kind=report&image_id=report-image-r1')
  assert.equal(reports[1].image_url, 'reports/r1/dashboard/file.png')
  assert.equal(live[0].file_url, '/api/report-images?kind=live&image_id=live-image-r1')
  assert.equal(live[0].thumbnail_url, '/api/report-images?kind=live&image_id=live-image-r1')
  assert.equal(live[1].file_url, 'live/r1/file.png')
  assert.equal(live[0].is_cover, true)
  assert.equal(live[0].sort_order, 2)
  assert.doesNotMatch(JSON.stringify({ reports, live }), /gd-secret-id-123|od-secret-id-456|cloudref:/u)

  const malformedRepository = createSupabaseReportRepository({
    from() {
      const builder = {
        select() { return builder },
        eq() { return builder },
        is() { return builder },
        order() { return builder },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve({ data: [{
            id: 'bad-cloudref', report_id: 'r1', image_url: 'cloudref:v1:google_drive:%ZZ',
            image_type: 'dashboard', created_at: '2026-10-01T00:00:00Z', deleted_at: null,
          }], error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  } as never)
  await assert.rejects(() => malformedRepository.getReportImages('r1'), CloudAssetReferenceError)
})

test('compat idempotency is provider-aware and rejects live physical aliases before upload', async () => {
  const report = compatHarness()
  const reportRequest = { kind: 'report', report_id: 'report-1', image_type: 'dashboard' }
  assert.equal((await report.handler.POST(formRequest(reportRequest))).status, 200)
  assert.equal((await report.handler.POST(formRequest(reportRequest))).status, 200)
  const reportConflict = await report.handler.POST(formRequest({ ...reportRequest, provider: 'onedrive' }))
  assert.equal(reportConflict.status, 409)
  assert.equal((await reportConflict.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.equal(report.storageCalls.filter(call => call.startsWith('upload:')).length, 1)

  const live = compatHarness()
  const first = { kind: 'live', report_id: 'report-1', category: 'key_visual' }
  assert.equal((await live.handler.POST(formRequest(first))).status, 200)
  assert.equal((await live.handler.POST(formRequest(first))).status, 200)
  const categoryConflict = await live.handler.POST(formRequest({ ...first, category: 'live_session' }))
  assert.equal(categoryConflict.status, 200)
  assert.equal(live.rows.live_report_images.length, 2)
  assert.equal(live.rows.live_report_images[0].file_name, live.rows.live_report_images[1].file_name)
  assert.notEqual(live.rows.live_report_images[0].storage_file_name, live.rows.live_report_images[1].storage_file_name)
  const providerConflict = await live.handler.POST(formRequest({ ...first, provider: 'onedrive' }))
  assert.equal(providerConflict.status, 409)
  assert.equal(live.storageCalls.filter(call => call.startsWith('upload:')).length, 2)
})

test('compat uploads support live category other and unique names for repeated original names with different bytes', async () => {
  const h = compatHarness()
  const first = await h.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'other' }, 'same.jpg', [1, 2, 3]))
  const second = await h.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'other' }, 'same.jpg', [3, 2, 1]))

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(h.rows.live_report_images.length, 2)
  const rows = h.rows.live_report_images
  assert.ok(rows.every(row => row.category === 'other'))
  assert.ok(rows.every(row => row.file_name === 'same.jpg'))
  assert.notEqual(rows[0].storage_file_name, rows[1].storage_file_name)
  assert.ok(h.storageCalls.some(call => call.includes('/THÁNG 10.2026/VISUAL HOST:')))
})

test('compat route-not-configured has a safe Vietnamese message and identity context', async () => {
  const h = compatHarness({ routeError: 'STORAGE_ROUTE_NOT_CONFIGURED' })
  const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  const payload = await response.json()

  assert.equal(response.status, 409)
  assert.equal(payload.error.code, 'STORAGE_ROUTE_NOT_CONFIGURED')
  assert.equal(payload.error.message, 'Chưa cấu hình thư mục lưu ảnh cho thương hiệu này.')
  assert.deepEqual(payload.error.context, {
    brand: 'Mars Snacking', platform: 'TikTok Shop', execution_source: 'agency',
  })
  assert.equal(h.storageCalls.some(call => call.startsWith('upload:')), false)
})

test('cloud references round trip, GET provider bytes, and DELETE provider object before legacy metadata', async () => {
  const encoded = encodeCloudAssetReference({ provider: 'google_drive', external_file_id: 'file:id/1' })
  assert.deepEqual(decodeCloudAssetReference(encoded), { provider: 'google_drive', external_file_id: 'file:id/1' })
  const h = compatHarness()
  h.rows.report_images.push({
    id: 'report-image-1', report_id: 'report-1', image_url: encoded, storage_path: 'DASHBOARD/test.png',
    image_type: 'dashboard', mime_type: 'image/png', uploaded_by: 'business-1',
  })
  const get = await h.handler.GET(new Request('https://example.test/api/report-images?kind=report&image_id=report-image-1'))
  assert.deepEqual([...new Uint8Array(await get.arrayBuffer())], [1, 2, 3])
  const remove = await h.handler.DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE', body: JSON.stringify({ kind: 'report', image_id: 'report-image-1' }),
  }))
  assert.equal(remove.status, 200)
  assert.ok(h.storageCalls.includes('delete:google_drive:file:id/1'))
  assert.equal(h.rows.report_images.length, 0)
  assert.equal(h.rpcCalls.some(call => call.name === 'authorize_report_image_delete'), false)
  assert.ok(h.rpcCalls.some(call => call.name === 'remove_report_image'))
})

test('compat cloud deletion preserves authorization and metadata-on-provider-failure contracts', async () => {
  const encoded = encodeCloudAssetReference({ provider: 'google_drive', external_file_id: 'file-1' })
  const unauthorized = compatHarness()
  unauthorized.rows.report_images.push({
    id: 'foreign-image', report_id: 'report-1', image_url: encoded, storage_path: 'DASHBOARD/test.png',
    image_type: 'dashboard', uploaded_by: 'business-2',
  })
  const denied = await unauthorized.handler.DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE', body: JSON.stringify({ kind: 'report', image_id: 'foreign-image' }),
  }))
  assert.equal(denied.status, 403)
  assert.equal(unauthorized.storageCalls.some(call => call.startsWith('delete:')), false)
  assert.equal(unauthorized.rpcCalls.some(call => call.name === 'remove_report_image'), false)

  const failed = compatHarness({ providerDeleteFails: true })
  failed.rows.report_images.push({
    id: 'retry-image', report_id: 'report-1', image_url: encoded, storage_path: 'DASHBOARD/test.png',
    image_type: 'dashboard', uploaded_by: 'business-1',
  })
  const response = await failed.handler.DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE', body: JSON.stringify({ kind: 'report', image_id: 'retry-image' }),
  }))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'REPORT_IMAGE_PROVIDER_DELETE_FAILED')
  assert.equal(failed.rows.report_images.length, 1)
  assert.equal(failed.rpcCalls.some(call => call.name === 'remove_report_image'), false)
})

test('compat delete reports provider success when legacy metadata removal fails', async () => {
  const h = compatHarness({ metadataRemoveFails: true, externalFileId: 'gd-secret-id-123' })
  h.rows.report_images.push({
    id: 'partial-delete', report_id: 'report-1',
    image_url: encodeCloudAssetReference({ provider: 'google_drive', external_file_id: 'gd-secret-id-123' }),
    storage_path: 'DASHBOARD/test.png', image_type: 'dashboard', uploaded_by: 'business-1',
  })
  const response = await h.handler.DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE', body: JSON.stringify({ kind: 'report', image_id: 'partial-delete' }),
  }))
  const body = await response.json()
  assert.equal(response.status, 502)
  assert.equal(body.error.code, 'REPORT_IMAGE_METADATA_DELETE_FAILED')
  assert.match(body.error.message, /provider file was deleted/u)
  assert.equal(h.storageCalls.filter(call => call === 'delete:google_drive:gd-secret-id-123').length, 1)
  assert.equal(h.storageCalls.some(call => call.startsWith('legacy-delete:')), false)
  assert.equal(h.rows.report_images.length, 1)
})

test('malformed cloud references fail closed while ordinary Supabase Storage images still read', async () => {
  assert.throws(() => decodeCloudAssetReference('cloudref:v1:dropbox:file-1'), CloudAssetReferenceError)
  assert.throws(() => decodeCloudAssetReference('cloudref:v1:google_drive:%ZZ'), CloudAssetReferenceError)
  assert.throws(() => decodeCloudAssetReference('cloudref:v1:onedrive:%E0%A4%A'), CloudAssetReferenceError)
  assert.throws(() => projectCloudAssetReference('cloudref:v1:google_drive:%ZZ', 'report', 'bad-id'), CloudAssetReferenceError)
  const malformed = compatHarness()
  malformed.rows.live_report_images.push({
    id: 'live-1', report_id: 'report-1', file_url: 'cloudref:v1:google_drive:', file_name: 'bad.png',
    category: 'key_visual', mime_type: 'image/png', uploaded_by: 'business-1',
  })
  const failed = await malformed.handler.GET(new Request('https://example.test/api/report-images?kind=live&image_id=live-1'))
  assert.equal(failed.status, 409)
  assert.equal((await failed.json()).error.code, 'CLOUD_ASSET_REFERENCE_INVALID')
  assert.equal(malformed.storageCalls.length, 0)

  const legacy = compatHarness()
  legacy.rows.live_report_images.push({
    id: 'live-2', report_id: 'report-1', file_url: 'legacy/path.png', file_name: 'path.png',
    category: 'key_visual', mime_type: 'image/png', uploaded_by: 'business-1',
  })
  const response = await legacy.handler.GET(new Request('https://example.test/api/report-images?kind=live&image_id=live-2'))
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [9, 8])
  assert.deepEqual(legacy.storageCalls, ['legacy-read:legacy/path.png'])

  const reportLegacy = compatHarness()
  reportLegacy.rows.report_images.push({
    id: 'report-legacy', report_id: 'report-1', image_url: 'reports/r1/dashboard/file.png',
    storage_path: 'reports/r1/dashboard/file.png', image_type: 'dashboard', mime_type: 'image/png',
  })
  const reportResponse = await reportLegacy.handler.GET(new Request('https://example.test/api/report-images?kind=report&image_id=report-legacy'))
  assert.deepEqual([...new Uint8Array(await reportResponse.arrayBuffer())], [9, 8])
  assert.deepEqual(reportLegacy.storageCalls, ['legacy-read:reports/r1/dashboard/file.png'])
})


test('live retry uses category and full content digest independent of the original display filename', async () => {
  const h = compatHarness()
  const fields = { kind: 'live', report_id: 'report-1', category: 'other' }
  const first = await h.handler.POST(formRequest(fields, 'same: file.png'))
  const retry = await h.handler.POST(formRequest(fields, 'renamed.png'))
  assert.equal(first.status, 200)
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).image.file_name, 'same- file.png')
  assert.equal(h.rows.live_report_images.length, 1)
  assert.equal(h.storageCalls.filter(call => call.startsWith('upload:')).length, 1)
  const row = h.rows.live_report_images[0]
  const digest = createHash('sha256').update(new Uint8Array([1, 2, 3])).digest('hex')
  assert.equal(row.storage_idempotency_key, `other:${digest}`)
  assert.equal(row.storage_file_name, `20261001_other_${digest.toUpperCase()}_same- file.png`)
  assert.equal(row.file_name, 'same- file.png')
})

test('concurrent live retry returns the winner and deletes only the redundant provider object', async () => {
  const h = compatHarness({ concurrentUploads: true })
  const fields = { kind: 'live', report_id: 'report-1', category: 'live_session' }
  const responses = await Promise.all([
    h.handler.POST(formRequest(fields, 'first.png')),
    h.handler.POST(formRequest(fields, 'second.png')),
  ])
  assert.deepEqual(responses.map(response => response.status), [200, 200])
  const bodies = await Promise.all(responses.map(response => response.json()))
  assert.equal(bodies[0].image.id, bodies[1].image.id)
  assert.equal(h.rows.live_report_images.length, 1)
  const winnerId = decodeCloudAssetReference(h.rows.live_report_images[0].file_url)?.external_file_id
  const deletes = h.storageCalls.filter(call => call.startsWith('delete:'))
  assert.equal(deletes.length, 1)
  assert.notEqual(deletes[0], `delete:google_drive:${winnerId}`)
  assert.equal(h.storageCalls.filter(call => call.startsWith('upload:')).length, 2)
})

test('live metadata rejection deletes the uploaded provider object', async () => {
  const h = compatHarness({ metadataUploadFails: true })
  const response = await h.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'other' }))
  assert.equal(response.status, 502)
  assert.equal(h.rows.live_report_images.length, 0)
  assert.ok(h.storageCalls.includes('delete:google_drive:file-google_drive'))
})

test('redundant provider cleanup failure is reported rather than accepted as a successful retry', async () => {
  const h = compatHarness({ concurrentUploads: true, providerDeleteFails: true })
  const fields = { kind: 'live', report_id: 'report-1', category: 'other' }
  const responses = await Promise.all([h.handler.POST(formRequest(fields)), h.handler.POST(formRequest(fields))])
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 502])
  const failure = responses.find(response => response.status === 502)!
  assert.equal((await failure.json()).error.code, 'REPORT_IMAGE_UPLOAD_CLEANUP_FAILED')
  assert.equal(h.rows.live_report_images.length, 1)
  assert.equal(h.storageCalls.filter(call => call.startsWith('delete:')).length, 1)
})
