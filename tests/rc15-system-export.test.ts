import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileUploadInput } from '@/lib/files/fileProvider'
import {
  loadOperationalSystemExport, encodeOperationalSystemExport, SYSTEM_EXPORT_ROW_LIMIT,
} from '@/lib/server/operationalSystemExport'
import { createOperationalFileRouteHandler } from '@/lib/server/operationalFileRouteHandler'

type Row = Record<string, unknown>
const scope = {
  brand_id: 'brand-a', platform_id: 'shopee',
  period_date: '2026-09-14', execution_source: 'internal' as const,
}

const fixture = () => ({
  brands: [{ id: 'brand-a', name: 'Brand A', deleted_at: null }],
  platforms: [{ id: 'shopee', name: 'Shopee Live', deleted_at: null }],
  shifts: [
    { id: 'shift-1', ...scope, date: scope.period_date, status: 'completed', deleted_at: null },
    { id: 'shift-2', brand_id: 'brand-b', platform_id: 'shopee', date: scope.period_date, execution_source: 'internal' },
  ],
  reports: [{ id: 'report-1', shift_id: 'shift-1', normalized_metrics: { total_viewers: 1164, add_to_cart: 251 }, platform_metrics: { sales: 13416434 }, status: 'reopened', version_number: 14 }],
  dashboard_updates: [{ id: 'snapshot-1', shift_id: 'shift-1', time: '07:50', normalized_metrics: { gpm: 99000 }, revenue: 4000000 }],
  report_images: [{ id: 'image-1', report_id: 'report-1', storage_path: 'DASHBOARD/September/test.png' }],
  live_report_images: [{ id: 'live-1', report_id: 'report-1', file_url: 'https://drive.google.com/file/d/live1/view' }],
  stored_files: [{ id: 'source-1', report_id: 'report-1', logical_category: 'data_source', external_file_id: 'source-id', checksum_sha256: 'abcd' }],
  operational_files: [] as Row[],
})

function makeDb(seed = fixture()) {
  const db = seed as Record<string, Row[]>
  let counter = 0
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let operation: 'read' | 'write' = 'read'
      let payload: Row = {}
      let rowLimit = Infinity
      const evaluate = () => {
        const source = db[table] ?? []
        if (operation === 'write') {
          const row: Row = { id: 'stored-' + (++counter), created_at: '2026-09-14T23:00:00Z', deleted_at: null, ...payload }
          source.push(row)
          return { data: [row], error: null }
        }
        return { data: source.filter(row => filters.every(filter => filter(row))).slice(0, rowLimit), error: null }
      }
      const chain = {
        select(_columns?: string) { return chain },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return chain },
        in(key: string, values: string[]) { filters.push(row => values.includes(String(row[key]))); return chain },
        is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return chain },
        limit(value: number) { rowLimit = value; return chain },
        order() { return chain },
        insert(row: Row) { operation = 'write'; payload = row; return chain },
        async single() { const r = evaluate(); return { data: r.data[0] ?? null, error: r.error } },
        async maybeSingle() { const r = evaluate(); return { data: r.data[0] ?? null, error: r.error } },
        then(resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) {
          return Promise.resolve(evaluate()).then(resolve, reject)
        },
      }
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient, records: db }
}

test('Admin snapshot gathers exact-day shift reports, full KPI dictionaries and provider evidence metadata', async () => {
  const state = makeDb()
  const bundle = await loadOperationalSystemExport(state.client, scope)
  assert.equal(bundle.counts.shifts, 1)
  assert.equal(bundle.counts.reports, 1)
  assert.equal(bundle.counts.dashboard_updates, 1)
  assert.equal(bundle.counts.report_images, 1)
  assert.equal(bundle.counts.live_report_images, 1)
  assert.equal(bundle.counts.stored_files, 1)
  assert.equal(bundle.data.shifts[0].id, 'shift-1')
  assert.deepEqual(bundle.data.reports[0].normalized_metrics, { total_viewers: 1164, add_to_cart: 251 })
  assert.deepEqual(bundle.data.reports[0].platform_metrics, { sales: 13416434 })
  assert.equal(bundle.data.dashboard_updates[0].revenue, 4000000)
  const encoded = encodeOperationalSystemExport(bundle)
  assert.deepEqual(JSON.parse(new TextDecoder().decode(encoded)).counts, bundle.counts)
  assert.equal(bundle.data.shifts.some(row => row.brand_id === 'brand-b'), false)
})

test('system snapshot fails closed when DB returns a cross-scope shift', async () => {
  const db = makeDb()
  const leakedClient = {
    from(table: string) {
      const query = db.client.from(table)
      if (table !== 'shifts') return query
      return {
        select() {
          return {
            eq() { return this },
            limit() { return Promise.resolve({ data: [
              { id: 'shift-1', ...scope, date: scope.period_date },
              { id: 'wrong-1', brand_id: 'brand-b', platform_id: scope.platform_id,
                date: scope.period_date, execution_source: 'internal' },
            ], error: null }) },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  await assert.rejects(loadOperationalSystemExport(leakedClient, scope), /OPERATIONAL_FILE_EXPORT_SCOPE_MISMATCH/)
})

test('system snapshot rejects potentially truncated result rather than claiming complete backup', async () => {
  const data = fixture()
  data.shifts = Array.from({ length: SYSTEM_EXPORT_ROW_LIMIT }, (_, i) =>
    ({ id: 'shift-' + i, ...scope, date: scope.period_date, status: 'completed', deleted_at: null }))
  await assert.rejects(loadOperationalSystemExport(makeDb(data).client, scope), /OPERATIONAL_FILE_EXPORT_ROW_LIMIT/)
})

test('system snapshot enforces max bytes, without partial uploads', () => {
  const blob = {
    schema: 'operational_system_export_v1',
    scope,
    counts: {},
    data: { shifts: [], reports: [], dashboard_updates: [], report_images: [],
      live_report_images: [], stored_files: [{ id: 'huge', payload: 'x'.repeat(4 * 1024 * 1024) }] },
  } as never
  assert.throws(() => encodeOperationalSystemExport(blob), /OPERATIONAL_FILE_EXPORT_TOO_LARGE/)
})

test('generate_system_export requires Admin and indexes one checksum-scoped provider object', async () => {
  const db = makeDb()
  const uploaded: FileUploadInput[] = []
  const handler = (systemPermission: 'admin' | 'leader', approved = false) => createOperationalFileRouteHandler({
    allowConfidentialWrites: () => approved,
    createClient: () => db.client,
    resolveUser: async () => ({ id: 'operator', systemPermission, businessUserId: 'operator' }),
    storage: {
      async upload(input: FileUploadInput) {
        uploaded.push(input)
        return { asset: { external_file_id: 'drive-export-1', provider_metadata: {} } }
      },
      async read() { throw new Error('should not read') },
      async delete() { throw new Error('should not delete') },
      async ensureFolder() { throw new Error('unexpected') },
    } as never,
    routes: { async resolvePlacement() {
      return {
        provider: 'google_drive', storageProfile: 'CANONICAL_V1', logicalCategory: 'data_source',
        folderSegments: ['Brand A', 'Shopee Live', 'THÁNG 09.2026', 'DATA', 'SOURCE'],
        folderPath: 'Brand A/Shopee Live/THÁNG 09.2026/DATA/SOURCE',
        fileName: 'source.csv',
      } as never
    } },
    materializeFolders: async () => 'parent-folder',
    routingMode: 'database',
  })
  const request = () => new Request('https://example.test/api/operational-files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate_system_export', ...scope, provider: 'google_drive' }),
  })
  assert.equal((await handler('leader').POST(request())).status, 403)
  const blocked = await handler('admin').POST(request())
  assert.equal(blocked.status, 423)
  assert.equal((await blocked.json() as { error: { code: string } }).error.code,
    'OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED')
  assert.equal(uploaded.length, 0)
  const first = await handler('admin', true).POST(request())
  assert.equal(first.status, 200)
  const firstBody = await first.json() as { counts: Record<string, number>; reused: boolean }
  assert.equal(firstBody.reused, false)
  assert.equal(firstBody.counts.shifts, 1)
  assert.equal(uploaded.length, 1)
  assert.equal(uploaded[0].mime_type, 'application/json')
  assert.equal(uploaded[0].external_parent_id, 'parent-folder')
  assert.equal(uploaded[0].logical_path.includes('/SYSTEM/EXPORTS/'), true)
  assert.equal(db.records.operational_files.length, 1)
  assert.equal(db.records.operational_files[0].integrity_status, 'sha256_verified')
  assert.equal('content' in db.records.operational_files[0], false)
  const second = await handler('admin', true).POST(request())
  assert.equal((await second.json() as { reused: boolean }).reused, true)
  assert.equal(uploaded.length, 1)
})
