import test from 'node:test'
import assert from 'node:assert/strict'
import { searchCollections } from '@/components/features/search/GlobalSearch'
import { createOperationsCollectionHandler } from '@/lib/server/operationsCollectionHandler'

for (const role of ['admin', 'leader', 'member'] as const) {
  test(`Global Search ${role} uses bounded, filtered server pages`, async () => {
    const calls: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = async input => {
      const params = new URL(String(input), 'http://local.test').searchParams
      const entity = params.get('entity')!
      calls.push(entity)
      assert.equal(params.get('page'), '1')
      assert.equal(params.get('pageSize'), '10')
      assert.deepEqual(JSON.parse(params.get('filters')!), { search: 'needle' })
      return Response.json({ items: [], total: 0, page: 1, pageSize: 10 })
    }
    try {
      const result = await searchCollections(' needle ', role)
      assert.deepEqual(result, { shifts: [], staff: [], brands: [], campaigns: [], reports: [] })
      assert.deepEqual(calls.sort(), (role === 'admin'
        ? ['shifts', 'staff', 'brands', 'campaigns', 'reports']
        : ['shifts', 'brands', 'campaigns', 'reports']).sort())
    } finally { globalThis.fetch = original }
  })
}

test('Global Search staff endpoint rejects Member before database access', async () => {
  for (const systemPermission of ['member'] as const) {
    const GET = createOperationsCollectionHandler({
      resolveUser: async () => ({ id: systemPermission, systemPermission }),
      createClient: async () => { throw new Error('unauthorized database access') },
    }).GET
    assert.equal((await GET(new Request('http://local.test/api/operations/collection?entity=staff&page=1&pageSize=10&filters=%7B%22search%22%3A%22needle%22%7D'))).status, 403)
  }
})
