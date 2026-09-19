import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import type { FileProviderName, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { createReportImageRouteHandler } from '@/lib/server/reportImageRouteHandler'

const user = {
  id: 'auth-1',
  businessUserId: 'business-1',
  systemPermission: 'member' as const,
}

function fakeStorage(options: {
  uploadProvider?: FileProviderName
  uploadError?: Error
  deleteError?: Error
  readBytes?: Uint8Array
  calls?: string[]
} = {}) {
  const calls = options.calls || []
  return {
    calls,
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      if (options.uploadError) throw options.uploadError
      const provider = input.destination?.provider || options.uploadProvider || 'google_drive'
      calls.push(`${provider}:upload`)
      return {
        asset: {
          id: `${provider}-asset`,
          provider,
          external_file_id: `${provider}-file`,
          name: input.name,
          mime_type: input.mime_type,
          size_bytes: input.size_bytes,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          status: 'active',
          created_by: input.created_by,
          created_at: '2026-09-19T00:00:00.000Z',
        },
      }
    },
    async read(reference: { provider: FileProviderName; external_file_id: string }) {
      calls.push(`${reference.provider}:read:${reference.external_file_id}`)
      return options.readBytes || new Uint8Array([1, 2, 3])
    },
    async delete(reference: { provider: FileProviderName; external_file_id: string }) {
      calls.push(`${reference.provider}:delete:${reference.external_file_id}`)
      if (options.deleteError) throw options.deleteError
    },
  }
}

function fakeClient(options: {
  imageRow?: Record<string, unknown> | null
  rpcData?: Record<string, unknown> | boolean
  rpcError?: { message: string }
  rpcErrors?: Record<string, { message: string }>
  calls?: string[]
}) {
  const calls = options.calls || []
  const row = options.imageRow === undefined
    ? null
    : options.imageRow
  return {
    calls,
    from(table: string) {
      const query = {
        select() { return query },
        eq() { return query },
        maybeSingle: async () => ({
          data: table === 'reports'
            ? { id: 'report-1', created_at: '2026-09-19T00:00:00.000Z', submitted_by: 'business-1', metrics_confirmed: false, status: 'draft' }
            : row,
          error: null,
        }),
      }
      return query
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push(`${name}:${JSON.stringify(args)}`)
      return {
        single: async () => ({ data: options.rpcData ?? null, error: options.rpcErrors?.[name] || options.rpcError || null }),
      }
    },
    storage: {
      from() {
        return {
          async download() {
            return { data: new Blob([new Uint8Array([9])], { type: 'image/png' }), error: null }
          },
          async remove(paths: string[]) {
            calls.push(`supabase:delete:${paths[0]}`)
            return { error: null }
          },
        }
      },
    },
  }
}

function handlerFor(client: ReturnType<typeof fakeClient>, storage = fakeStorage()) {
  return createReportImageRouteHandler({
    resolveUser: async () => user,
    createClient: async () => client as never,
    storage,
  })
}

function uploadRequest(fields: Record<string, string>, name = 'dashboard.png') {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => form.set(key, value))
  form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), name)
  return new Request('https://example.test/api/report-images', { method: 'POST', body: form })
}

test('RC1.2 report and live uploads use the selected provider once and persist its immutable reference', async () => {
  for (const [kind, fields, provider] of [
    ['report', { kind: 'report', report_id: 'report-1', image_type: 'dashboard' }, 'google_drive'],
    ['live', { kind: 'live', report_id: 'report-1', category: 'live_session', is_cover: 'true' }, 'onedrive'],
  ] as const) {
    const calls: string[] = []
    const storage = fakeStorage({ calls })
    const client = fakeClient({
      calls,
      rpcData: { id: `${kind}-1`, report_id: 'report-1', image_url: 'logical/path', file_url: 'logical/path', provider, external_file_id: `${provider}-file` },
    })
    const response = await handlerFor(client, storage).POST(uploadRequest({ ...fields, ...(provider === 'onedrive' ? { provider } : {}) }))
    const payload = await response.json() as { ok?: boolean; image?: Record<string, unknown> }
    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.image?.external_file_id, undefined, 'provider IDs stay server-side')
    assert.deepEqual(calls.filter(call => call.endsWith(':upload')), [`${provider}:upload`])
    const rpcCall = calls.find(call => call.startsWith(kind === 'report' ? 'upload_report_image_with_provider' : 'upsert_live_report_image_with_provider'))
    assert.match(rpcCall || '', new RegExp(`"p_provider":"${provider}"|"provider":"${provider}"`))
  }
})

test('RC1.2 metadata failure attempts cleanup through the same provider', async () => {
  const calls: string[] = []
  const storage = fakeStorage({ calls })
  const client = fakeClient({ calls, rpcError: { message: 'metadata failed' } })
  const response = await handlerFor(client, storage).POST(uploadRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  assert.equal(response.status, 502)
  assert.deepEqual(calls.filter(call => call.includes(':delete:')), ['google_drive:delete:google_drive-file'])
})

test('RC1.2 persisted provider reads and deletes ignore the current default', async () => {
  for (const provider of ['google_drive', 'onedrive'] as const) {
    const calls: string[] = []
    const client = fakeClient({
      calls,
      imageRow: { id: 'image-1', report_id: 'report-1', provider, external_file_id: `${provider}-file`, mime_type: 'image/png' },
      rpcData: true,
    })
    const storage = fakeStorage({ calls })
    const handler = handlerFor(client, storage)
    const read = await handler.GET(new Request(`https://example.test/api/report-images?kind=report&image_id=image-1`))
    assert.equal(read.status, 200)
    await handler.DELETE(new Request('https://example.test/api/report-images', {
      method: 'DELETE',
      body: JSON.stringify({ kind: 'report', image_id: 'image-1' }),
      headers: { 'content-type': 'application/json' },
    }))
    assert.ok(calls.includes(`${provider}:read:${provider}-file`))
    assert.ok(calls.includes(`${provider}:delete:${provider}-file`))
  }
})

test('RC1.2 provider delete failure preserves metadata and retry identity', async () => {
  const calls: string[] = []
  const metadata = { id: 'image-1', report_id: 'report-1', provider: 'onedrive', external_file_id: 'drive-item-1', mime_type: 'image/png' }
  const client = fakeClient({
    calls,
    imageRow: metadata,
    rpcData: true,
  })
  const storage = fakeStorage({ calls, deleteError: new Error('provider unavailable') })
  const response = await handlerFor(client, storage).DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE',
    body: JSON.stringify({ kind: 'report', image_id: 'image-1' }),
    headers: { 'content-type': 'application/json' },
  }))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'REPORT_IMAGE_PROVIDER_DELETE_FAILED')
  assert.deepEqual(calls.map(call => call.split(':')[0]), ['authorize_report_image_delete', 'onedrive'])
  assert.equal(calls.some(call => call.startsWith('remove_report_image')), false)
  assert.equal(metadata.provider, 'onedrive')
  assert.equal(metadata.external_file_id, 'drive-item-1')
})

test('RC1.2 provider delete succeeds before metadata removal', async () => {
  const calls: string[] = []
  const client = fakeClient({
    calls,
    imageRow: { id: 'image-1', report_id: 'report-1', provider: 'google_drive', external_file_id: 'drive-file-1', mime_type: 'image/png' },
    rpcData: true,
  })
  const response = await handlerFor(client, fakeStorage({ calls })).DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE',
    body: JSON.stringify({ kind: 'report', image_id: 'image-1' }),
    headers: { 'content-type': 'application/json' },
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls.map(call => call.split(':')[0]), ['authorize_report_image_delete', 'google_drive', 'remove_report_image'])
})

test('RC1.2 metadata delete failure is explicit after provider deletion', async () => {
  const calls: string[] = []
  const client = fakeClient({
    calls,
    imageRow: { id: 'image-1', report_id: 'report-1', provider: 'onedrive', external_file_id: 'drive-item-1', mime_type: 'image/png' },
    rpcData: true,
    rpcErrors: { remove_report_image: { message: 'metadata delete failed' } },
  })
  const response = await handlerFor(client, fakeStorage({ calls })).DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE',
    body: JSON.stringify({ kind: 'report', image_id: 'image-1' }),
    headers: { 'content-type': 'application/json' },
  }))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'REPORT_IMAGE_METADATA_DELETE_FAILED')
  assert.deepEqual(calls.map(call => call.split(':')[0]), ['authorize_report_image_delete', 'onedrive', 'remove_report_image'])
})

test('RC1.2 legacy rows continue through Supabase Storage for read and delete', async () => {
  const calls: string[] = []
  const client = fakeClient({
    calls,
    imageRow: { id: 'image-1', report_id: 'report-1', storage_path: 'reports/report-1/legacy.png', mime_type: 'image/png' },
    rpcData: true,
  })
  const response = await handlerFor(client, fakeStorage({ calls })).GET(new Request('https://example.test/api/report-images?kind=report&image_id=image-1'))
  assert.equal(response.status, 200)
  await handlerFor(client, fakeStorage({ calls })).DELETE(new Request('https://example.test/api/report-images', {
    method: 'DELETE',
    body: JSON.stringify({ kind: 'report', image_id: 'image-1' }),
    headers: { 'content-type': 'application/json' },
  }))
  assert.ok(calls.includes('supabase:delete:reports/report-1/legacy.png'))
})

test('RC1.2 migration is one non-destructive provider-pair contract', () => {
  const files = readdirSync(resolve(process.cwd(), 'supabase/migrations')).filter(name => name.includes('rc12_report_file_provider'))
  assert.deepEqual(files, ['20260919000000_rc12_report_file_provider.sql'])
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations', files[0]), 'utf8')
  assert.match(sql, /alter table public\.report_images[\s\S]*add column if not exists provider/i)
  assert.match(sql, /alter table public\.live_report_images[\s\S]*add column if not exists provider/i)
  assert.match(sql, /report_images_file_provider_pair[\s\S]*provider in \('google_drive', 'onedrive'\)/i)
  assert.match(sql, /live_report_images_file_provider_pair[\s\S]*provider in \('google_drive', 'onedrive'\)/i)
  assert.match(sql, /create or replace function public\.authorize_report_image_delete\(p_image_id text\)/i)
  assert.match(sql, /create or replace function public\.authorize_live_report_image_delete\(p_image_id text\)/i)
  assert.match(sql, /grant execute on function public\.authorize_report_image_delete\(text\) to authenticated/i)
  assert.match(sql, /grant execute on function public\.authorize_live_report_image_delete\(text\) to authenticated/i)
  assert.doesNotMatch(sql, /\b(drop\s+table|truncate|delete\s+from)\b/i)
})
