import assert from 'node:assert/strict'
import test from 'node:test'

import type { FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import {
  resolveOperationalStoragePlacement,
  type OperationalStoragePlacementInput,
  type OperationalStorageRoute,
} from '@/lib/files/operationalStoragePlacementResolver'
import { createReportArtifactRouteHandler } from '@/lib/server/reportArtifactRouteHandler'

const user = {
  id: 'auth-1',
  businessUserId: 'business-1',
  systemPermission: 'leader' as const,
}

const report = {
  id: 'report-1',
  shift_id: 'shift-1',
  submitted_by: 'business-1',
  status: 'reopened',
  metrics_confirmed: false,
  version_number: 4,
  revenue: 1000,
  orders: 2,
  peak_viewer: 10,
  average_viewer: 5,
  comments: 1,
  shares: 1,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}

const shift = {
  id: 'shift-1',
  date: '2026-09-14',
  start_time: '07:00',
  end_time: '09:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  execution_source: 'internal',
  status: 'completed',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

const canonicalRoute: OperationalStorageRoute = {
  id: 'route-1',
  provider: 'google_drive',
  execution_source: 'internal',
  brand_id: 'brand-1',
  platform_id: null,
  subbrand_key: null,
  storage_profile: 'CANONICAL_V1',
  root_folder_id: 'root-a',
  base_folder_id: 'root-a',
  folder_labels: {},
  period_naming_style: 'THANG_M_DOT_YEAR',
  active: true,
}

type StoredRow = Record<string, unknown>

function fakeClient(options: {
  report?: StoredRow
  existing?: StoredRow | null
  insertError?: { message: string } | null
} = {}) {
  const rows: StoredRow[] = []
  if (options.existing) rows.push(options.existing)
  let insertedRow: StoredRow | null = null

  const tableRows = (table: string) => {
    if (table === 'reports') return [options.report ?? report]
    if (table === 'shifts') return [shift]
    if (table === 'stored_files') return rows
    if (table === 'brands') return [{ id: 'brand-1', name: 'Female AI livestream' }]
    if (table === 'platforms') return [{ id: 'platform-1', name: 'Shopee Live' }]
    if (table === 'campaigns') return []
    if (table === 'shift_registrations') return []
    if (table === 'business_users') return [{ id: 'business-1', full_name: 'Test User' }]
    return []
  }

  const from = (table: string) => {
    const filters: Array<(row: StoredRow) => boolean> = []
    let payload: StoredRow | null = null
    let operation: 'select' | 'insert' | 'update' = 'select'

    const result = () => {
      let data = tableRows(table).filter(row => filters.every(predicate => predicate(row)))
      if (operation === 'insert' && payload) {
        if (options.insertError) return { data: null, error: options.insertError }
        insertedRow = {
          id: 'stored-1',
          created_at: '2026-10-08T00:00:00.000Z',
          updated_at: '2026-10-08T00:00:00.000Z',
          deleted_at: null,
          ...payload,
        }
        rows.push(insertedRow)
        data = [insertedRow]
      }
      if (operation === 'update' && payload) {
        data.forEach(row => Object.assign(row, payload))
      }
      return { data, error: null }
    }

    const query = {
      select() { return query },
      eq(column: string, value: unknown) {
        filters.push(row => row[column] === value)
        return query
      },
      is(column: string, value: unknown) {
        filters.push(row => (row[column] ?? null) === value)
        return query
      },
      in(column: string, values: unknown[]) {
        filters.push(row => values.includes(row[column]))
        return query
      },
      order() { return query },
      insert(value: StoredRow) {
        operation = 'insert'
        payload = value
        return query
      },
      update(value: StoredRow) {
        operation = 'update'
        payload = value
        return query
      },
      async maybeSingle() {
        const current = result()
        return { data: current.data?.[0] ?? null, error: current.error }
      },
      async single() {
        const current = result()
        return { data: current.data?.[0] ?? null, error: current.error }
      },
      then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve(result()).then(resolve, reject)
      },
    }
    return query
  }

  return {
    client: { from } as never,
    rows,
    get insertedRow() { return insertedRow },
  }
}

function routeResolver(inputs: OperationalStoragePlacementInput[]) {
  return {
    async resolvePlacement(input: OperationalStoragePlacementInput) {
      inputs.push(input)
      return resolveOperationalStoragePlacement(canonicalRoute, {
        ...input,
        brandLabel: 'Female AI livestream',
        platformLabel: 'Shopee Live',
      })
    },
  }
}

function sourceRequest(bytes = [1, 2, 3], fileName = 'source.xlsx') {
  const form = new FormData()
  form.set('report_id', 'report-1')
  form.set(
    'file',
    new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName,
  )
  return new Request('https://example.test/api/report-artifacts', {
    method: 'POST',
    body: form,
  })
}

test('DATA/SOURCE upload resolves canonical folder, writes provider bytes, and stores metadata only', async () => {
  const db = fakeClient()
  const routeInputs: OperationalStoragePlacementInput[] = []
  const placements: string[][] = []
  const uploads: FileUploadInput[] = []
  const storage = {
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      uploads.push(input)
      return {
        asset: {
          id: 'asset-1',
          provider: 'google_drive',
          external_file_id: 'drive-file-1',
          external_parent_id: input.external_parent_id,
          name: input.name,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          checksum_sha256: input.checksum_sha256,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          status: 'active',
          created_by: input.created_by,
          created_at: '2026-10-08T00:00:00.000Z',
          provider_metadata: { drive_id: 'drive-123' },
        },
      }
    },
    async read() { return new Uint8Array() },
    async delete() {},
    async ensureFolder() { throw new Error('unused') },
  }

  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => user,
    createClient: () => db.client,
    storage: storage as never,
    routeResolver: routeResolver(routeInputs),
    materializeFolders: async placement => {
      placements.push(placement.folderSegments)
      return 'source-parent'
    },
    routingMode: 'database',
  })

  const response = await handler.POST(sourceRequest())
  const payload = await response.json() as { ok: boolean; file: StoredRow }
  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(routeInputs[0].logicalCategory, 'data_source')
  assert.deepEqual(placements[0], [
    'Female AI livestream',
    'Shopee Live',
    'THÁNG 09.2026',
    'DATA',
    'SOURCE',
  ])
  assert.equal(uploads.length, 1)
  assert.equal(uploads[0].external_parent_id, 'source-parent')
  assert.match(uploads[0].name, /^20260914_data-source_[A-F0-9]{64}_source\.xlsx$/u)
  assert.equal(db.rows.length, 1)
  assert.equal(db.rows[0].external_file_id, 'drive-file-1')
  assert.deepEqual(db.rows[0].provider_metadata, { drive_id: 'drive-123' })
  assert.equal(Object.hasOwn(db.rows[0], 'content'), false)
  assert.equal(Object.hasOwn(db.rows[0], 'bytes'), false)
  assert.equal(Object.hasOwn(db.rows[0], 'base64'), false)
})

test('same DATA/SOURCE content is idempotent and skips a second provider upload', async () => {
  const bytes = new Uint8Array([1, 2, 3])
  const checksum = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')
  const existing = {
    id: 'stored-existing',
    provider: 'google_drive',
    external_file_id: 'drive-existing',
    external_parent_id: 'source-parent',
    provider_metadata: {},
    logical_category: 'data_source',
    folder_path: 'Female AI livestream/Shopee Live/THÁNG 09.2026/DATA/SOURCE',
    file_name: 'existing.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: 3,
    checksum_sha256: checksum,
    artifact_key: `source:${checksum}`,
    report_id: 'report-1',
    shift_id: 'shift-1',
    report_version: 4,
    uploaded_by: 'business-1',
    created_at: '2026-10-08T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
    deleted_at: null,
  }
  const db = fakeClient({ existing })
  let uploads = 0
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => user,
    createClient: () => db.client,
    storage: {
      async upload() { uploads += 1; throw new Error('should not upload') },
      async read() { return new Uint8Array() },
      async delete() {},
      async ensureFolder() { throw new Error('unused') },
    } as never,
    routeResolver: routeResolver([]),
    materializeFolders: async () => 'source-parent',
    routingMode: 'database',
  })

  const response = await handler.POST(sourceRequest())
  const payload = await response.json() as { file: { id: string } }
  assert.equal(response.status, 200)
  assert.equal(payload.file.id, 'stored-existing')
  assert.equal(uploads, 0)
})

test('confirmed reports reject DATA/SOURCE mutation before provider upload', async () => {
  const db = fakeClient({ report: { ...report, status: 'confirmed', metrics_confirmed: true } })
  let uploads = 0
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => user,
    createClient: () => db.client,
    storage: {
      async upload() { uploads += 1; throw new Error('should not upload') },
      async read() { return new Uint8Array() },
      async delete() {},
      async ensureFolder() { throw new Error('unused') },
    } as never,
    routeResolver: routeResolver([]),
    materializeFolders: async () => 'source-parent',
    routingMode: 'database',
  })

  const response = await handler.POST(sourceRequest())
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'REPORT_CONFIRMED')
  assert.equal(uploads, 0)
})
