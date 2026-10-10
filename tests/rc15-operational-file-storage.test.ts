import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OPERATIONAL_FILE_CATEGORIES,
  OPERATIONAL_FILE_CATEGORY_FOLDERS,
  resolveOperationalFileMime,
  type OperationalFileCategory,
} from '@/lib/files/operationalFileCatalog'
import { resolveOperationalFilePlacement } from '@/lib/files/operationalFilePlacement'
import { createOperationalFileRouteHandler } from '@/lib/server/operationalFileRouteHandler'
import type { FileUploadInput } from '@/lib/files/fileProvider'
import { selectOperationalStorageRoute, type OperationalStoragePlacement, type OperationalStorageRoute }
  from '@/lib/files/operationalStoragePlacementResolver'

const base = {
  provider: 'google_drive',
  storageProfile: 'CANONICAL_V1',
  rootFolderId: 'root',
  baseFolderId: 'root',
  folderSegments: ['Female AI livestream', 'Shopee Live', 'THÁNG 09.2026', 'DATA', 'SOURCE'],
  folderPath: 'Female AI livestream/Shopee Live/THÁNG 09.2026/DATA/SOURCE',
  fileName: 'source.csv',
  logicalCategory: 'data_source',
  periodLabel: 'THÁNG 09.2026',
} as OperationalStoragePlacement

test('subbrand-scoped files must not fallback to a shared NULL-subbrand route', () => {
  const generic: OperationalStorageRoute = {
    id: 'generic', provider: 'google_drive', execution_source: 'internal',
    brand_id: 'brand-1', platform_id: 'platform-1', subbrand_key: null,
    storage_profile: 'LEGACY_PERIOD_CATEGORY', root_folder_id: 'root',
    base_folder_id: 'base', folder_labels: {}, period_naming_style: 'THANG_M_DASH_YEAR',
    active: true,
  }
  const key = {
    provider: 'google_drive' as const, executionSource: 'internal' as const,
    brandId: 'brand-1', platformId: 'platform-1', subbrandKey: 'verified-subbrand',
  }
  assert.throws(() => selectOperationalStorageRoute([generic], key), {
    message: 'STORAGE_ROUTE_NOT_CONFIGURED',
  })
  const approved = { ...generic, id: 'verified-subbrand-route', subbrand_key: 'verified-subbrand' }
  assert.equal(selectOperationalStorageRoute([generic, approved], key).id, approved.id)
  assert.equal(selectOperationalStorageRoute([generic, approved], { ...key, subbrandKey: null }).id, generic.id)
})

test('V2 categories have unique canonical folders under the same brand/platform/month', () => {
  assert.equal(OPERATIONAL_FILE_CATEGORIES.length, 15)
  const all = new Set<string>()
  for (const category of OPERATIONAL_FILE_CATEGORIES) {
    const placement = resolveOperationalFilePlacement(base, category)
    assert.deepEqual(placement.folderSegments.slice(0, 3), base.folderSegments.slice(0, 3))
    const suffix = placement.folderSegments.slice(3).join('/')
    assert.equal(suffix, OPERATIONAL_FILE_CATEGORY_FOLDERS[category].join('/'))
    assert.equal(all.has(suffix), false, category)
    all.add(suffix)
  }
})

test('V2 refuses to invent a folder tree for a legacy storage profile', () => {
  assert.throws(() => resolveOperationalFilePlacement({
    ...base,
    storageProfile: 'LEGACY_PERIOD_CATEGORY',
  }, 'video_recording'), { message: 'STORAGE_CATEGORY_NOT_CONFIGURED' })
})

test('legacy category-order routes use a separate ID-scoped V2 namespace without touching source folders', () => {
  const profiles = [
    'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD', 'LEGACY_PERIOD_CATEGORY',
  ] as const
  for (const profile of profiles) {
    const input = {
      ...base, storageProfile: profile,
      rootFolderId: 'verified-main-root', baseFolderId: 'historical-base',
      folderSegments: ['DATA', 'SOURCE', 'Tháng 9 - 2026'],
      folderPath: 'DATA/SOURCE/Tháng 9 - 2026', periodLabel: 'Tháng 9 - 2026',
    } as OperationalStoragePlacement
    const original = JSON.stringify(input)
    const resolved = resolveOperationalFilePlacement(input, 'production_asset', {
      brandId: 'brand-1', platformId: 'platform-1', executionSource: 'internal',
    })
    assert.equal(resolved.baseFolderId, 'verified-main-root')
    assert.deepEqual(resolved.folderSegments, [
      'ADA_STORAGE_V2', 'brand-1', 'platform-1', 'INTERNAL',
      'Tháng 9 - 2026', 'PRODUCTION', 'ASSETS',
    ])
    assert.equal(JSON.stringify(input), original, 'legacy input must remain unchanged')
    const anotherBrand = resolveOperationalFilePlacement(input, 'production_asset', {
      brandId: 'brand-2', platformId: 'platform-1', executionSource: 'internal',
    })
    const agency = resolveOperationalFilePlacement(input, 'production_asset', {
      brandId: 'brand-1', platformId: 'platform-1', executionSource: 'agency',
    })
    assert.notEqual(resolved.folderPath, anotherBrand.folderPath)
    assert.notEqual(resolved.folderPath, agency.folderPath)
    assert.throws(() => resolveOperationalFilePlacement(input, 'production_asset', {
      brandId: '../brand', platformId: 'platform-1', executionSource: 'internal',
    }), { message: 'STORAGE_ROUTE_CONFIG_INVALID' })
  }
})

test('MIME validation allows only category-compatible extensions', () => {
  assert.equal(resolveOperationalFileMime('video_recording', 'clip.mp4', 'video/mp4'), 'video/mp4')
  assert.equal(resolveOperationalFileMime('schedule_source', 'planning.xlsx', ''), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(resolveOperationalFileMime('ai_output', 'caption.txt', 'text/plain'), 'text/plain')
  assert.throws(() => resolveOperationalFileMime('video_recording', 'payload.js', 'text/javascript'))
  assert.throws(() => resolveOperationalFileMime('payment_document', 'script.mp4', 'video/mp4'))
  assert.throws(() => resolveOperationalFileMime('content_script', 'script.pdf', 'image/png'))
})

type Row = Record<string, unknown>
function client() {
  const rows: Row[] = []
  let counter = 0
  const get = (table: string): Row[] => {
    if (table === 'brands') return [{ id: 'brand-1', name: 'Female AI livestream', deleted_at: null }]
    if (table === 'platforms') return [
      { id: 'platform-1', name: 'Shopee Live', deleted_at: null },
      { id: 'platform-2', name: 'TikTok Shop', deleted_at: null },
    ]
    if (table === 'shifts') return [{ id: 'shift-1', brand_id: 'brand-1', platform_id: 'platform-1', date: '2026-09-14', execution_source: 'internal', deleted_at: null }]
    if (table === 'campaigns') return [
      { id: 'campaign-1', name: 'Fall Campaign', brand_id: 'brand-1',
        start_date: '2026-09-01', end_date: '2026-09-30',
        platform_ids: ['platform-1'], platform_source: '', deleted_at: null },
      { id: 'campaign-2', name: 'Fall Campaign Variant', brand_id: 'brand-1',
        start_date: '2026-09-01', end_date: '2026-09-30',
        platform_ids: ['platform-1'], platform_source: '', deleted_at: null },
    ]
    if (table === 'operational_files') return rows
    return []
  }
  const db = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let operation: 'select' | 'insert' | 'update' = 'select'
      let payload: Row = {}
      const evaluate = () => {
        let chosen = get(table).filter(row => filters.every(fn => fn(row)))
        if (operation === 'insert') {
          const next = { id: 'operational-' + ++counter, deleted_at: null, created_at: '2026-10-09T00:00:00.000Z', ...payload }
          rows.push(next)
          chosen = [next]
        }
        if (operation === 'update') for (const row of chosen) Object.assign(row, payload)
        return { data: chosen, error: null }
      }
      const q = {
        select(_cols?: string) { return q },
        eq(key: string, val: unknown) { filters.push(row => row[key] === val); return q },
        is(key: string, val: unknown) { filters.push(row => (row[key] ?? null) === val); return q },
        order(_name: string, _opts?: unknown) { return q },
        insert(value: Row) { operation = 'insert' as const; payload = value; return q },
        update(value: Row) { operation = 'update' as const; payload = value; return q },
        async single() { const result = evaluate(); return { data: result.data[0] ?? null, error: result.error } },
        async maybeSingle() { const result = evaluate(); return { data: result.data[0] ?? null, error: result.error } },
        then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
          return Promise.resolve(evaluate()).then(resolve, reject)
        },
      }
      return q
    },
  }
  return { db: db as never, rows }
}

function form(category: OperationalFileCategory, filename: string, mime: string, bytes: Uint8Array) {
  const data = new FormData()
  data.set('brand_id', 'brand-1')
  data.set('platform_id', 'platform-1')
  data.set('period_date', '2026-09-14')
  data.set('execution_source', 'internal')
  data.set('category', category)
  data.set('file', new File([bytes], filename, { type: mime }))
  return new Request('https://example.test/api/operational-files', { method: 'POST', body: data })
}

test('operational file lifecycle uses external object, no duplicate, metadata-only, cleanup and admin guard', async () => {
  const state = client()
  const providerUploads: FileUploadInput[] = []
  const providerDeletes: string[] = []
  const auth = (role: 'leader' | 'admin') => async () => ({
    id: role, systemPermission: role, businessUserId: role,
  })
  const dependencies = {
    createClient: () => state.db,
    storage: {
      async upload(input: FileUploadInput) {
        providerUploads.push(input)
        return { asset: {
          id: 'asset-1', provider: 'google_drive' as const,
          external_file_id: 'drive-id-1', external_parent_id: input.external_parent_id,
          name: input.name, mime_type: input.mime_type, size_bytes: input.size_bytes,
          checksum_sha256: input.checksum_sha256, entity_type: input.entity_type,
          entity_id: input.entity_id, status: 'active' as const,
          created_by: input.created_by, created_at: '2026-10-09T00:00:00Z',
        } }
      },
      async read() { return new Uint8Array([1, 2, 3]) },
      async delete(ref: { external_file_id: string }) { providerDeletes.push(ref.external_file_id) },
      async ensureFolder() { return { id: 'folder-id', name: 'folder', provider: 'google_drive' } },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'parent-id',
    routingMode: 'database' as const,
  }

  const leader = createOperationalFileRouteHandler({ ...dependencies, resolveUser: auth('leader') })
  const invoice = await leader.POST(form('payment_document', 'invoice.pdf', 'application/pdf', new Uint8Array([1, 2, 3])))
  assert.equal(invoice.status, 403)

  const upload = () => form('schedule_source', 'source.csv', 'text/csv', new Uint8Array([1, 2, 3]))
  const first = await leader.POST(upload())
  assert.equal(first.status, 200)
  assert.equal((await first.json() as { reused: boolean }).reused, false)
  const second = await leader.POST(upload())
  assert.equal(second.status, 200)
  assert.equal((await second.json() as { reused: boolean }).reused, true)
  assert.equal(providerUploads.length, 1)
  assert.equal(state.rows.length, 1)
  assert.equal('content' in state.rows[0], false)
  assert.equal('bytes' in state.rows[0], false)
  assert.equal(state.rows[0].external_file_id, 'drive-id-1')
  assert.equal(state.rows[0].folder_path,
    'Female AI livestream/Shopee Live/THÁNG 09.2026/OPS/SCHEDULE/SOURCE')

  const listed = await leader.GET(new Request('https://example.test/api/operational-files?shift_id=shift-1'))
  assert.equal(listed.status, 200)
  // Scoped by shift, a period-level file must not be returned.
  assert.deepEqual((await listed.json() as { files: unknown[] }).files, [])

  const listedByPeriod = await leader.GET(new Request('https://example.test/api/operational-files?brand_id=brand-1&platform_id=platform-1&period_date=2026-09-14&execution_source=internal'))
  assert.equal((await listedByPeriod.json() as { files: unknown[] }).files.length, 1)

  const downloaded = await leader.GET(new Request('https://example.test/api/operational-files?file_id=operational-1'))
  assert.equal(downloaded.status, 200)
  assert.deepEqual(Array.from(new Uint8Array(await downloaded.arrayBuffer())), [1, 2, 3])

  const deleted = await leader.DELETE(new Request('https://example.test/api/operational-files', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: 'operational-1' }),
  }))
  assert.equal(deleted.status, 200)
  assert.deepEqual(providerDeletes, ['drive-id-1'])
  assert.equal(typeof state.rows[0].deleted_at, 'string')

  const admin = createOperationalFileRouteHandler({ ...dependencies, resolveUser: auth('admin') })
  const cat = await admin.GET(new Request('https://example.test/api/operational-files?catalog=1'))
  const catalog = await cat.json() as { categories: Array<{ id: string }> }
  assert.ok(catalog.categories.some(entry => entry.id === 'payment_document'))
  const leaderCat = await leader.GET(new Request('https://example.test/api/operational-files?catalog=1'))
  const leaderCatalog = await leaderCat.json() as { categories: Array<{ id: string }> }
  assert.equal(leaderCatalog.categories.some(entry => entry.id === 'payment_document'), false)
})


test('linked provider object must be in exact planned folder; native Docs are metadata-only', async () => {
  const state = client()
  let wrongParent = true
  const handler = createOperationalFileRouteHandler({
    createClient: () => state.db,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: {
      async upload() { throw new Error('Unexpected upload') },
      async read() { throw new Error('Native Google files should open provider viewer') },
      async delete() { throw new Error('Unexpected delete') },
      async ensureFolder() { return { id: 'folder-id', name: 'folder', provider: 'google_drive' } },
      async getViewUrl() { return 'https://drive.google.com/file/d/linked-doc/view' },
      async getMetadata() {
        return {
          id: 'linked-doc', name: 'Meeting Notes', kind: 'file',
          mime_type: 'application/vnd.google-apps.document',
          parent_ids: [wrongParent ? 'another-folder' : 'parent-id'],
          provider_metadata: { drive_file_id: 'linked-doc' },
        }
      },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'parent-id',
    routingMode: 'database',
  })

  const attach = () => new Request('https://example.test/api/operational-files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'attach_existing', category: 'content_script',
      provider: 'google_drive', external_file_id: 'linked-doc',
      brand_id: 'brand-1', platform_id: 'platform-1',
      period_date: '2026-09-14', execution_source: 'internal',
    }),
  })
  const rejected = await handler.POST(attach())
  assert.equal(rejected.status, 409)
  assert.equal(state.rows.length, 0)

  wrongParent = false
  const accepted = await handler.POST(attach())
  assert.equal(accepted.status, 200)
  assert.equal(state.rows.length, 1)
  assert.equal(state.rows[0].checksum_sha256, null)
  assert.equal(state.rows[0].integrity_status, 'provider_reference')
  assert.equal(state.rows[0].size_bytes, 0)
  assert.equal(state.rows[0].external_parent_id, 'parent-id')

  const retry = await handler.POST(attach())
  assert.equal((await retry.json() as { reused: boolean }).reused, true)
  assert.equal(state.rows.length, 1)

  const view = await handler.GET(new Request('https://example.test/api/operational-files?file_id=operational-1'))
  assert.equal(view.status, 302)
  assert.match(view.headers.get('Location') ?? '', /drive\.google\.com/u)
})

test('leader cannot read existing finance artifact by guessing file ID', async () => {
  const state = client()
  state.rows.push({
    id: 'finance-1', category: 'payment_document', deleted_at: null,
    scope_key: 'period:brand-1:platform-1:internal:2026-09-14',
    provider: 'google_drive', external_file_id: 'secret-drive-id',
  })
  const handler = createOperationalFileRouteHandler({
    createClient: () => state.db,
    resolveUser: async () => ({ id: 'leader', systemPermission: 'leader', businessUserId: 'leader' }),
    storage: {
      async read() { throw new Error('Forbidden provider read') },
      async upload() { throw new Error('Unexpected upload') },
      async delete() { throw new Error('Unexpected delete') },
      async ensureFolder() { throw new Error('Unexpected folder creation') },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'parent-id',
    routingMode: 'database',
  })
  const response = await handler.GET(new Request('https://example.test/api/operational-files?file_id=finance-1'))
  assert.equal(response.status, 403)
})


test('Campaign Content/Production files enforce brand, platform, dates and isolated campaign keys', async () => {
  const state = client()
  let uploadCount = 0
  const handler = createOperationalFileRouteHandler({
    createClient: () => state.db,
    resolveUser: async () => ({ id: 'leader', systemPermission: 'leader', businessUserId: 'leader' }),
    storage: {
      async upload(input: FileUploadInput) {
        return { asset: {
          provider: 'google_drive', external_file_id: 'campaign-file-' + ++uploadCount,
          provider_metadata: {}, external_parent_id: input.external_parent_id,
        } }
      },
      async read() { return new Uint8Array([1, 2, 3]) },
      async delete() { throw new Error('Unexpected delete') },
      async ensureFolder() { throw new Error('Folder injection not allowed') },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'parent-id',
    routingMode: 'database',
  })
  const campaignUpload = (campaignId: string, overrides: Record<string, string> = {}) => {
    const req = form('content_script', 'livecut.txt', 'text/plain', new Uint8Array([1, 2, 3]))
    return req.formData().then(body => {
      body.set('campaign_id', campaignId)
      for (const [key, value] of Object.entries(overrides)) body.set(key, value)
      return new Request('https://example.test/api/operational-files', { method: 'POST', body })
    })
  }
  const wrongBrand = await handler.POST(await campaignUpload('campaign-1', { brand_id: 'brand-2' }))
  assert.equal(wrongBrand.status, 409)
  assert.equal(uploadCount, 0)
  const wrongMonth = await handler.POST(await campaignUpload('campaign-1', { period_date: '2026-10-09' }))
  assert.equal(wrongMonth.status, 409)
  assert.equal(uploadCount, 0)
  const wrongPlatform = await handler.POST(await campaignUpload('campaign-1', { platform_id: 'platform-2' }))
  assert.equal(wrongPlatform.status, 409)
  assert.equal(uploadCount, 0)

  const first = await handler.POST(await campaignUpload('campaign-1'))
  assert.equal(first.status, 200)
  const retry = await handler.POST(await campaignUpload('campaign-1'))
  assert.equal((await retry.json() as { reused: boolean }).reused, true)
  const otherCampaign = await handler.POST(await campaignUpload('campaign-2'))
  assert.equal(otherCampaign.status, 200)
  assert.equal(uploadCount, 2)
  assert.equal(state.rows.length, 2)
  assert.equal(state.rows[0].campaign_id, 'campaign-1')
  assert.equal(state.rows[1].campaign_id, 'campaign-2')
  assert.notEqual(state.rows[0].scope_key, state.rows[1].scope_key)
  const list = await handler.GET(new Request('https://example.test/api/operational-files'
    + '?campaign_id=campaign-1&brand_id=brand-1&platform_id=platform-1&period_date=2026-09-14&execution_source=internal'))
  assert.equal(list.status, 200)
  const result = await list.json() as { files: Array<{ id: string }> }
  assert.equal(result.files.length, 1)
  assert.equal(result.files[0].id, 'operational-1')
})


test('large provider-linked MP4 uses exact-parent verification, never buffers video or claims SHA-256', async () => {
  const state = client()
  let parent = 'incorrect-folder'
  let reads = 0
  const handler = createOperationalFileRouteHandler({
    createClient: () => state.db,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: {
      async getMetadata() {
        return {
          id: 'large-video-id', kind: 'file', name: '2026-live.mp4',
          mime_type: 'video/mp4', size_bytes: 312 * 1024 * 1024,
          parent_ids: [parent], provider_metadata: {},
        }
      },
      async getViewUrl() { return 'https://drive.google.com/file/d/large-video-id/view' },
      async read() { reads += 1; throw new Error('Large files must not be buffered') },
      async upload() { throw new Error('Large files must not pass serverless upload') },
      async delete() { throw new Error('Unexpected delete') },
      async ensureFolder() { throw new Error('Unexpected folder creation') },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'verified-folder',
    routingMode: 'database',
  })
  const attach = () => new Request('https://example.test/api/operational-files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'attach_existing', category: 'video_recording',
      external_file_id: 'large-video-id', provider: 'google_drive',
      brand_id: 'brand-1', platform_id: 'platform-1',
      period_date: '2026-09-14', execution_source: 'internal' }),
  })
  const denied = await handler.POST(attach())
  assert.equal(denied.status, 409)
  assert.equal(state.rows.length, 0)

  parent = 'verified-folder'
  const accepted = await handler.POST(attach())
  assert.equal(accepted.status, 200)
  assert.equal(state.rows.length, 1)
  assert.equal(state.rows[0].size_bytes, 312 * 1024 * 1024)
  assert.equal(state.rows[0].mime_type, 'video/mp4')
  assert.equal(state.rows[0].integrity_status, 'provider_reference')
  assert.equal(state.rows[0].checksum_sha256, null)
  const access = await handler.GET(new Request('https://example.test/api/operational-files?file_id=operational-1'))
  assert.equal(access.status, 302)
  assert.equal(access.headers.get('Location'), 'https://drive.google.com/file/d/large-video-id/view')
  assert.equal(reads, 0)
})


test('concurrent provider-deduplicated upload NEVER trashes the winning shared object', async () => {
  const baseState = client()
  let lookupCount = 0
  let providerDeletes = 0
  const winner = {
    id: 'existing-file', provider: 'google_drive', external_file_id: 'shared-drive-object',
    category: 'schedule_source', file_name: 'source.csv', deleted_at: null,
  }
  const fakeDb = {
    from(table: string) {
      if (table !== 'operational_files') return baseState.db.from(table)
      const query = {
        select() { return query },
        eq() { return query },
        is() { return query },
        async maybeSingle() {
          lookupCount += 1
          return { data: lookupCount > 1 ? winner : null, error: null }
        },
        insert() {
          return { select() {
            return { async single() { return { data: null, error: { message: 'unique constraint conflict' } } } }
          } }
        },
      }
      return query
    },
  }
  const handler = createOperationalFileRouteHandler({
    createClient: () => fakeDb as never,
    resolveUser: async () => ({ id: 'leader', systemPermission: 'leader', businessUserId: 'leader' }),
    storage: {
      async upload() { return { asset: { external_file_id: 'shared-drive-object', provider_metadata: {} } } },
      async read() { return new Uint8Array([]) },
      async delete() { providerDeletes += 1 },
      async ensureFolder() { throw new Error('must reuse existing folder') },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'parent-id',
    routingMode: 'database',
  })
  const uploaded = await handler.POST(form('schedule_source', 'source.csv', 'text/csv', new Uint8Array([1, 2, 3])))
  assert.equal(uploaded.status, 200)
  assert.equal((await uploaded.json() as { reused: boolean }).reused, true)
  assert.equal(providerDeletes, 0)
  assert.equal(lookupCount, 2)
})


test('confidential Finance writes fail closed until separately approved, including provider-linked files', async () => {
  const state = client()
  let uploads = 0
  let metadataReads = 0
  const handler = (approved: boolean) => createOperationalFileRouteHandler({
    createClient: () => state.db,
    allowConfidentialWrites: () => approved,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: {
      async upload(input: FileUploadInput) {
        uploads += 1
        return { asset: { external_file_id: 'finance-drive-' + uploads, provider_metadata: {} } }
      },
      async getMetadata() {
        metadataReads += 1
        return { id: 'linked-finance', name: 'invoice.pdf', kind: 'file',
          mime_type: 'application/pdf', size_bytes: 2048, parent_ids: ['verified-parent'] }
      },
      async read() { return new Uint8Array([1, 2, 3]) },
      async delete() { throw new Error('Unexpected delete') },
    } as never,
    routes: { async resolvePlacement() { return base } },
    materializeFolders: async () => 'verified-parent',
    routingMode: 'database',
  })
  const finance = () => form('payment_document', 'invoice.pdf',
    'application/pdf', new Uint8Array([1, 2, 3]))
  const link = () => new Request('https://example.test/api/operational-files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'attach_existing', category: 'payment_document',
      external_file_id: 'linked-finance', provider: 'google_drive',
      brand_id: 'brand-1', platform_id: 'platform-1',
      period_date: '2026-09-14', execution_source: 'internal',
    }),
  })
  assert.equal((await handler(false).POST(finance())).status, 423)
  assert.equal((await handler(false).POST(link())).status, 423)
  assert.equal(uploads, 0)
  assert.equal(metadataReads, 0)
  assert.equal(state.rows.length, 0)

  const approved = handler(true)
  const uploaded = await approved.POST(finance())
  assert.equal(uploaded.status, 200)
  assert.equal(uploads, 1)
  assert.equal(state.rows.length, 1)
  const linked = await approved.POST(link())
  assert.equal(linked.status, 200)
  assert.equal(metadataReads, 1)
  assert.equal(state.rows.length, 2)
  const catalog = await handler(false).GET(new Request('https://example.test/api/operational-files?catalog=1'))
  const body = await catalog.json() as { confidential_write_ready: boolean }
  assert.equal(body.confidential_write_ready, false)
})
