import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { OPERATIONAL_FILE_CATEGORIES } from '@/lib/files/operationalFileCatalog'
import registry from '@/docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json'
import routeMap from '@/docs/storage/ADA_OPS_STORAGE_ROUTE_MAP_V1.json'
import {
  domainFolderForCategory,
  domainFolderForReportGroup,
  REPORT_ARTIFACT_GROUPS,
  type ReportArtifactGroup,
} from '@/lib/files/operationalStorageDomainMap'
import { createOperationalStorageDomainRouteRepository } from '@/lib/server/operationalStorageRouteRepository'
import { createOperationalFileRouteHandler } from '@/lib/server/operationalFileRouteHandler'
import { createOperationalStorageDriveProbeHandler } from '@/lib/server/operationalStorageDriveProbeHandler'
import { createScheduleSourceStorageHandler } from '@/lib/server/scheduleSourceStorageHandler'

const files = new Map(registry.folders.map(folder => [folder.path, folder]))

function registryClient(overrides: Record<string, Partial<(typeof registry.folders)[number]>> = {}) {
  const requestedPaths: string[][] = []
  const client = {
    from(table: string) {
      assert.equal(table, 'operational_storage_domain_folders')
      const query = {
        select() { return query },
        async in(_column: string, paths: string[]) {
          requestedPaths.push(paths)
          return {
            error: null,
            data: paths.flatMap(path => {
              const entry = files.get(path)
              return entry ? [{
                folder_path: entry.path,
                folder_id: overrides[path]?.id ?? entry.id,
                parent_folder_id: overrides[path]?.parent_id ?? entry.parent_id,
                access_classification: overrides[path]?.access_classification ?? entry.access_classification,
                active: true,
                verified_created: true,
              }] : []
            }),
          }
        },
      }
      return query
    },
  }
  return { client: client as unknown as SupabaseClient, requestedPaths }
}

test('domain resolver covers all 15 categories and 9 report groups using exact registry IDs and parent paths', async () => {
  assert.equal(OPERATIONAL_FILE_CATEGORIES.length, 15)
  assert.equal(REPORT_ARTIFACT_GROUPS.length, 9)
  const state = registryClient()
  const resolver = createOperationalStorageDomainRouteRepository({ client: state.client })

  for (const category of OPERATIONAL_FILE_CATEGORIES) {
    const expected = domainFolderForCategory(category)
    const placement = await resolver.resolveDomainCategoryPlacement(category, 'uat.txt')
    assert.equal(placement.baseFolderId, expected.folderId, category)
    assert.equal(placement.expectedBaseParentId, expected.parentFolderId, category)
    assert.deepEqual(placement.folderSegments, [], category)
    assert.equal(placement.folderPath, routeMap.standard_category_routes[category].path, category)
  }

  for (const group of REPORT_ARTIFACT_GROUPS) {
    const expected = domainFolderForReportGroup(group)
    const placement = await resolver.resolveReportArtifactGroupPlacement({
      group: group as ReportArtifactGroup,
      shiftId: 'shift-123', shiftDate: '2026-10-31', brandId: 'brand-1', platformId: 'platform-1', fileName: 'report.png',
    })
    assert.equal(placement.baseFolderId, routeMap.report_root_id, group)
    assert.equal(placement.expectedBaseParentId, expected.parentFolderId, group)
    assert.deepEqual(placement.folderSegments, [
      'brand-1', 'platform-1', '2026', '10', 'SHIFT_20261031__shift-123', routeMap.report_artifact_groups[group],
    ], group)
    assert.equal(placement.folderSegments.includes('00_SHIFT_FOLDER_TEMPLATE'), false)
  }
  assert.ok(state.requestedPaths.every(paths => paths.length > 0 && paths[0] === '00_ADA_OPS_PLATFORM'))
})

test('domain resolver fails closed when a registry ID/parent/classification is not the approved mapping', async () => {
  const route = routeMap.standard_category_routes.sop_document
  for (const override of [
    { [route.path]: { id: 'different-id' } },
    { [route.path]: { parent_id: 'different-parent' } },
    { [route.path]: { access_classification: 'restricted_verified' } },
  ]) {
    const state = registryClient(override)
    const resolver = createOperationalStorageDomainRouteRepository({ client: state.client })
    await assert.rejects(resolver.resolveDomainCategoryPlacement('sop_document', 'uat.pdf'), /STORAGE_CATEGORY_NOT_CONFIGURED/u)
  }
})

test('operational file API sends resolved category folder to provider and verifies readback before metadata insert', async () => {
  const state = operationalClient()
  const routeState = registryClient()
  const domainRoutes = createOperationalStorageDomainRouteRepository({ client: routeState.client })
  const bytes = new Uint8Array([1, 2, 3, 4])
  const checksum = createHash('sha256').update(bytes).digest('hex')
  let placementFolder = ''
  const uploads: FileUploadInput[] = []
  const storage = {
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      uploads.push(input)
      return { asset: {
        id: 'drive-file-id', provider: 'google_drive', external_file_id: 'drive-file-id',
        external_parent_id: input.external_parent_id, name: input.name, mime_type: input.mime_type,
        size_bytes: input.size_bytes, checksum_sha256: input.checksum_sha256,
        entity_type: input.entity_type, entity_id: input.entity_id, status: 'active', created_by: input.created_by,
        created_at: new Date().toISOString(),
      } }
    },
    async getMetadata(reference: { external_file_id: string } | string) {
      const id = typeof reference === 'string' ? reference : reference.external_file_id
      return { id, kind: 'file' as const, parent_ids: [placementFolder], trashed: false }
    },
    async read() { return bytes },
    async delete() {},
    async ensureFolder() { throw new Error('unused') },
  }
  const handler = createOperationalFileRouteHandler({
    createClient: () => state.db,
    resolveUser: async () => ({ id: 'admin', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: storage as never,
    domainRoutes,
    materializeFolders: async placement => { placementFolder = placement.baseFolderId; return placement.baseFolderId },
    routingMode: 'domain_first',
  })
  const form = new FormData()
  form.set('brand_id', 'brand-1')
  form.set('platform_id', 'platform-1')
  form.set('period_date', '2026-10-31')
  form.set('execution_source', 'internal')
  form.set('category', 'sop_document')
  form.set('file', new File([bytes], 'guide.pdf', { type: 'application/pdf' }))
  const response = await handler.POST(new Request('https://example.test/api/operational-files', { method: 'POST', body: form }))
  assert.equal(response.status, 200)
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].external_parent_id, domainFolderForCategory('sop_document').folderId)
  assert.equal(state.rows[0]?.external_file_id, 'drive-file-id')
  assert.equal(state.rows[0]?.checksum_sha256, checksum)
})

test('schedule-source API requires no shift or execution_source and serves only verified provider readback', async () => {
  const state = scheduleClient()
  const bytes = new Uint8Array([9, 8, 7])
  const checksum = createHash('sha256').update(bytes).digest('hex')
  let uploadedParent = ''
  const storage = {
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      uploadedParent = input.external_parent_id ?? ''
      return { asset: { id: 'source-drive-id', provider: 'google_drive', external_file_id: 'source-drive-id',
        external_parent_id: uploadedParent, name: input.name, mime_type: input.mime_type,
        size_bytes: input.size_bytes, checksum_sha256: input.checksum_sha256, entity_type: 'schedule_import',
        entity_id: 'batch-1', status: 'active', created_by: 'admin', created_at: new Date().toISOString() } }
    },
    async getMetadata(reference: { external_file_id: string } | string) {
      const id = typeof reference === 'string' ? reference : reference.external_file_id
      return { id, kind: id === uploadedParent ? 'folder' as const : 'file' as const,
        parent_ids: id === uploadedParent ? ['1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh'] : [uploadedParent], trashed: false }
    },
    async read() { return bytes },
    async delete() {},
    async ensureFolder() { throw new Error('unused') },
  }
  const handler = createScheduleSourceStorageHandler({
    createClient: () => state.db,
    resolveUser: async () => ({ id: 'admin-auth', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: storage as never,
    domainRoutes: {
      async resolveDomainCategoryPlacement(category) {
        assert.equal(category, 'schedule_source')
        return { provider: 'google_drive', storageProfile: 'DOMAIN_CATEGORY_FOLDER',
          rootFolderId: '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh', baseFolderId: 'schedule-folder',
          folderSegments: [], folderPath: 'schedule_source', expectedBaseParentId: 'schedule-parent',
          accessClassification: 'shared', sensitive: false, fileName: 'original.xlsx',
          logicalCategory: 'data_source', periodLabel: '' }
      },
      async resolveReportArtifactGroupPlacement() { throw new Error('unused') },
    },
    materializeFolders: async () => 'schedule-folder',
  })
  const form = new FormData()
  form.set('batch_id', 'batch-1')
  form.set('file', new File([bytes], 'original.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const response = await handler.POST(new Request('https://example.test/api/schedule-source-files', { method: 'POST', body: form }))
  assert.equal(response.status, 200)
  assert.equal(uploadedParent, 'schedule-folder')
  assert.equal(state.rows[0]?.external_file_id, 'source-drive-id')
  assert.equal(state.rows[0]?.checksum_sha256, checksum)
  assert.equal(Object.hasOwn(state.rows[0] ?? {}, 'shift_id'), false)
  assert.equal(Object.hasOwn(state.rows[0] ?? {}, 'execution_source'), false)

  const read = await handler.GET(new Request(`https://example.test/api/schedule-source-files?file_id=${state.rows[0]?.id}`))
  assert.equal(read.status, 200)
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), bytes)
})

test('Drive probe is admin-only, feature-disabled by default, rate-limited, audited, readback-verified and cleaned up', async () => {
  const bytes = new TextEncoder().encode('ADA Ops RC19 synthetic Drive probe. No business or personal data.\n')
  const storageState = probeStorage(bytes)
  const dbState = probeClient(true)
  const handler = createOperationalStorageDriveProbeHandler({
    env: { RC19_STORAGE_DRIVE_PROBE_ENABLED: 'true' },
    createClient: () => dbState.client,
    resolveUser: async () => ({ id: 'admin-auth', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: storageState.storage as never,
  })
  const response = await handler(new Request('https://example.test/api/internal/storage-drive-probe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'upload_readback' }),
  }))
  assert.equal(response.status, 200)
  const result = await response.json() as Record<string, unknown>
  assert.equal(result.folder_id, '1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P')
  assert.equal(result.provider_parent_id, result.folder_id)
  assert.equal(result.checksum_sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(result.readback_verified, true)
  assert.equal(result.cleanup_status, 'trashed')
  assert.equal(storageState.uploads, 1)
  assert.equal(dbState.updated[0]?.status, 'passed')
  assert.equal(dbState.updated[0]?.provider_file_id, 'probe-file')

  let calls = 0
  const off = createOperationalStorageDriveProbeHandler({
    env: {}, createClient: () => { throw new Error('not reached') },
    resolveUser: async () => ({ id: 'admin-auth', systemPermission: 'admin', businessUserId: 'admin' }),
    storage: { ...storageState.storage, async getMetadata() { calls += 1; throw new Error('not reached') } } as never,
  })
  assert.equal((await off(new Request('https://example.test/api/internal/storage-drive-probe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'upload_readback' }),
  }))).status, 404)
  const denied = createOperationalStorageDriveProbeHandler({
    env: { RC19_STORAGE_DRIVE_PROBE_ENABLED: 'true' }, createClient: () => { throw new Error('not reached') },
    resolveUser: async () => ({ id: 'leader-auth', systemPermission: 'leader' as const }),
    storage: storageState.storage as never,
  })
  assert.equal((await denied(new Request('https://example.test/api/internal/storage-drive-probe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'metadata' }),
  }))).status, 403)
  assert.equal(calls, 0)
})

function operationalClient() {
  const rows: Array<Record<string, unknown>> = []
  const db = {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      let payload: Record<string, unknown> = {}
      let operation = 'select'
      let inserted: Record<string, unknown> | null = null
      const query = {
        select() { return query },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
        is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return query },
        insert(value: Record<string, unknown>) { operation = 'insert'; payload = value; return query },
        async maybeSingle() {
          if (table === 'brands') return { data: { id: 'brand-1', name: 'Brand' }, error: null }
          if (table === 'platforms') return { data: { id: 'platform-1', name: 'Platform' }, error: null }
          return { data: null, error: null }
        },
        async single() {
          if (operation !== 'insert') return { data: null, error: null }
          inserted = { id: 'file-row', created_at: new Date().toISOString(), ...payload }
          rows.push(inserted)
          return { data: inserted, error: null }
        },
        then(resolve: (value: unknown) => void) { return Promise.resolve({ data: [], error: null }).then(resolve) },
      }
      return query
    },
  }
  return { db: db as unknown as SupabaseClient, rows }
}

function scheduleClient() {
  const rows: Array<Record<string, unknown>> = []
  const db = {
    from(table: string) {
      let payload: Record<string, unknown> = {}
      let operation = 'select'
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      const query = {
        select() { return query },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
        insert(value: Record<string, unknown>) { operation = 'insert'; payload = value; return query },
        update(value: Record<string, unknown>) { operation = 'update'; payload = value; return query },
        async maybeSingle() {
          const row = rows.find(item => filters.every(filter => filter(item)))
          return { data: row ?? null, error: null }
        },
        async single() {
          const row = operation === 'insert'
          ? { id: '11111111-1111-4111-8111-111111111111', ...payload }
            : rows.find(item => filters.every(filter => filter(item)))
          if (row && operation === 'update') Object.assign(row, payload)
          else if (row) rows.push(row)
          return { data: row, error: null }
        },
        then(resolve: (value: unknown) => void) {
          if (operation === 'update') {
            const row = rows.find(item => filters.every(filter => filter(item)))
            if (row) Object.assign(row, payload)
          }
          return Promise.resolve({ data: null, error: null }).then(resolve)
        },
      }
      assert.equal(table, 'operational_schedule_source_files')
      return query
    },
  }
  return { db: db as unknown as SupabaseClient, rows }
}

function probeClient(allowed: boolean) {
  const updated: Array<Record<string, unknown>> = []
  const client = {
    async rpc(name: string) { assert.equal(name, 'claim_operational_storage_drive_probe_rate_limit'); return { data: allowed, error: null } },
    from(table: string) {
      assert.equal(table, 'operational_storage_drive_probe_runs')
      let payload: Record<string, unknown> = {}
      const query = {
        insert(value: Record<string, unknown>) { payload = value; return query },
        update(value: Record<string, unknown>) { updated.push(value); payload = value; return query },
        select() { return query },
        eq() { return query },
        async single() { return { data: { id: 'run-1', ...payload }, error: null } },
      }
      return query
    },
  }
  return { client: client as unknown as SupabaseClient, updated }
}

function probeStorage(bytes: Uint8Array) {
  let trashed = false
  let uploads = 0
  const storage = {
    async getMetadata(reference: string | { external_file_id: string }) {
      if (typeof reference === 'string') return {
        id: reference, kind: 'folder' as const, parent_ids: ['177g-GBHRY06rHx9ID8rpQOqR-uve9-kj'],
        capabilities: { canAddChildren: true }, trashed: false,
      }
      return { id: reference.external_file_id, kind: 'file' as const,
        parent_ids: ['1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P'], trashed }
    },
    async upload(input: FileUploadInput) {
      uploads += 1
      assert.equal(input.external_parent_id, '1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P')
      return { asset: { id: 'probe-file', provider: 'google_drive', external_file_id: 'probe-file',
        external_parent_id: input.external_parent_id, name: input.name, mime_type: 'text/plain', size_bytes: input.size_bytes,
        entity_type: 'attachment', entity_id: 'run-1', status: 'active', created_by: input.created_by,
        created_at: new Date().toISOString() } }
    },
    async read() { return bytes },
    async delete() { trashed = true },
  }
  return { storage, get uploads() { return uploads } }
}
