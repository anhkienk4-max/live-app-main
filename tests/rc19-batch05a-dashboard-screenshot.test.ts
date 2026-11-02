import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { createDashboardScreenshotRouteHandler } from '@/lib/server/dashboardScreenshotRouteHandler'

const bytes = new Uint8Array([1, 2, 3])
const checksum = createHash('sha256').update(bytes).digest('hex')
const row = {
  id: 'file-1', shift_id: 'shift-1', category: 'live_snapshot', provider: 'google_drive',
  external_file_id: 'drive-file-1', external_parent_id: 'drive-parent', file_name: 'snapshot.png',
  mime_type: 'image/png', size_bytes: bytes.byteLength, checksum_sha256: checksum, deleted_at: null,
}

function queryResult(data: unknown) {
  const query = {
    select() { return query },
    eq() { return query },
    is() { return query },
    limit() { return query },
    async maybeSingle() { return { data, error: null } },
  }
  return query
}

function handler(linked = true, readBytes = bytes) {
  let reads = 0
  const route = createDashboardScreenshotRouteHandler({
    resolveUser: async () => ({ id: 'member-auth', systemPermission: 'member', businessUserId: 'member-1' }),
    createAdminClient: () => ({ from: (table: string) => {
      assert.equal(table, 'operational_files')
      return queryResult(row)
    } }) as never,
    createUserClient: async () => ({ from: (table: string) => {
      assert.equal(table, 'dashboard_updates')
      return queryResult(linked ? { id: 'update-1' } : null)
    } }) as never,
    storage: {
      async getMetadata() {
        return { id: 'drive-file-1', name: 'snapshot.png', kind: 'file', parent_ids: ['drive-parent'] }
      },
      async read() { reads += 1; return readBytes },
    } as never,
  })
  return { route, get reads() { return reads } }
}

test('dashboard screenshot readback requires an authenticated visible update and serves private verified bytes', async () => {
  const target = handler()
  const response = await target.route.GET(new Request('https://example.test/api/dashboard-screenshots?file_id=file-1'))
  assert.equal(response.status, 200)
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3])
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Content-Type'), 'image/png')
  assert.equal(target.reads, 1)

  const unlinked = handler(false)
  assert.equal((await unlinked.route.GET(new Request('https://example.test/api/dashboard-screenshots?file_id=file-1'))).status, 404)
  assert.equal(unlinked.reads, 0)

  const corrupt = handler(true, new Uint8Array([9]))
  assert.equal((await corrupt.route.GET(new Request('https://example.test/api/dashboard-screenshots?file_id=file-1'))).status, 502)
})

test('dashboard screenshot route rejects unauthenticated and invalid references before provider read', async () => {
  let reads = 0
  const route = createDashboardScreenshotRouteHandler({
    resolveUser: async () => null,
    storage: {
      async getMetadata() { throw new Error('must not read') },
      async read() { reads += 1; return bytes },
    } as never,
  })
  assert.equal((await route.GET(new Request('https://example.test/api/dashboard-screenshots?file_id=file-1'))).status, 401)
  const authenticated = createDashboardScreenshotRouteHandler({
    resolveUser: async () => ({ id: 'member-auth', systemPermission: 'member', businessUserId: 'member-1' }),
    storage: {
      async getMetadata() { throw new Error('must not read') },
      async read() { reads += 1; return bytes },
    } as never,
  })
  assert.equal((await authenticated.GET(new Request('https://example.test/api/dashboard-screenshots?file_id='))).status, 400)
  assert.equal((await authenticated.GET(new Request('https://example.test/api/dashboard-screenshots?storage_path=dashboard%2Fshift-1%2F..'))).status, 400)
  assert.equal(reads, 0)
})

test('legacy dashboard screenshots remain readable through a shift-authorized private proxy', async () => {
  let downloaded = ''
  const route = createDashboardScreenshotRouteHandler({
    resolveUser: async () => ({ id: 'member-auth', systemPermission: 'member', businessUserId: 'member-1' }),
    createUserClient: async () => ({
      from: () => queryResult({ id: 'update-legacy' }),
      storage: { from: (bucket: string) => {
        assert.equal(bucket, 'live-dashboard-images')
        return { async download(path: string) {
          downloaded = path
          return { data: new Blob([bytes], { type: 'image/png' }), error: null }
        } }
      } },
    }) as never,
  })
  const response = await route.GET(new Request('https://example.test/api/dashboard-screenshots?storage_path=dashboard%2Fshift-1%2Fold.png'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.headers.get('Content-Type'), 'image/png')
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3])
  assert.equal(downloaded, 'dashboard/shift-1/old.png')
})
