import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAnalyticsSnapshotHandler } from '../lib/server/analyticsSnapshotHandler.ts'
import { operationsResponseOwnerKey } from '../lib/server/operationsResponseOwnerKey.ts'
import type { AuthenticatedServerUser } from '../lib/server/authGuards.ts'

const authUser: AuthenticatedServerUser = {
  id: 'auth-uuid-A',
  businessUserId: 'business-user-A',
  systemPermission: 'admin',
}
const filters = encodeURIComponent(JSON.stringify({ from: '2026-10-01', to: '2026-10-22' }))
const url = 'http://localhost/api/operations/analytics-snapshot?filters=' + filters

test('canonical API owner key is the verified business-user ID, not the auth UUID', () => {
  assert.equal(operationsResponseOwnerKey(authUser), 'business-user-A:admin')
  assert.notEqual(operationsResponseOwnerKey(authUser), authUser.id + ':admin')
})

test('owner scope cannot cross business users or permission boundaries', () => {
  const owner = operationsResponseOwnerKey(authUser)
  assert.notEqual(owner, operationsResponseOwnerKey({ ...authUser, businessUserId: 'business-user-B' }))
  assert.notEqual(owner, operationsResponseOwnerKey({ ...authUser, systemPermission: 'member' }))
  assert.throws(() => operationsResponseOwnerKey({ ...authUser, businessUserId: '', id: '' }), /LIST_IDENTITY_UNAVAILABLE/)
})

test('Analytics endpoint keeps RPC output and sends the mapped owner key', async () => {
  const snapshot = {
    totals: { revenue: null, reportCount: 0 },
    previous: { revenue: null, reportCount: 0 },
    trend: [], brands: [], platforms: [], campaigns: [], workload: [], hostPerformance: [],
  }
  let calls = 0
  const GET = createAnalyticsSnapshotHandler({
    resolveUser: async () => authUser,
    createClient: async () => ({
      rpc: async (name: string, args: unknown) => {
        calls += 1
        assert.equal(name, 'get_analytics_snapshot')
        assert.deepEqual(args, { p_filters: { from: '2026-10-01', to: '2026-10-22' } })
        return { data: snapshot, error: null }
      },
    }) as unknown as SupabaseClient,
  }).GET
  const response = await GET(new Request(url))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(await response.json(), { snapshot, ownerKey: 'business-user-A:admin' })
  assert.equal(calls, 1)
})

test('Analytics rejects unauthenticated reads without opening a database client', async () => {
  const GET = createAnalyticsSnapshotHandler({
    resolveUser: async () => null,
    createClient: async () => { throw new Error('must not open DB') },
  }).GET
  const response = await GET(new Request(url))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error?.code, 'AUTHENTICATION_REQUIRED')
})
