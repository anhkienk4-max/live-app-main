import assert from 'node:assert/strict'
import test from 'node:test'
import { createOperationsCollectionHandler } from '@/lib/server/operationsCollectionHandler'
import { getCompleteCollection } from '@/lib/services/operationsPageService'
import { mockShifts } from '@/lib/services/mockData'

const filters = { brandIds: ['b1'], platformIds: ['p1'], statuses: ['scheduled'] }

test('Shift collection passes both filters and page size to the bounded RPC for every role', async () => {
  for (const systemPermission of ['admin', 'leader', 'member'] as const) {
    for (const pageSize of [10, 20, 50] as const) {
      const calls: Array<{ name: string; args: unknown }> = []
      const GET = createOperationsCollectionHandler({
        resolveUser: async () => ({ id: 'auth', businessUserId: 'actor', systemPermission }),
        createClient: async () => ({ rpc: async (name: string, args: unknown) => {
          calls.push({ name, args })
          return { data: { rows: [], registrations: [], total: 0, page: 1, pageSize }, error: null }
        } }) as never,
      }).GET
      const params = new URLSearchParams({ entity: 'shifts', page: '1', pageSize: String(pageSize), filters: JSON.stringify(filters) })
      const response = await GET(new Request('http://local.test/api?' + params))
      assert.equal(response.status, 200)
      assert.deepEqual(calls, [{ name: 'get_shift_list_page', args: { p_scope: 'all', p_page: 1, p_page_size: pageSize, p_filters: filters, p_pending_page: 1, p_include_live: false } }])
      const body = await response.json()
      assert.equal(body.total, 0)
      assert.deepEqual(body.items, [])
    }
  }
})

test('Filtered export preserves both filters across all bounded pages', async () => {
  const fixture = Array.from({ length: 117 }, (_, index) => ({ ...mockShifts[0], id: `filter-${index}` }))
  const original = globalThis.fetch
  const pages: number[] = []
  globalThis.fetch = async input => {
    const params = new URL(String(input), 'http://local.test').searchParams
    const page = Number(params.get('page'))
    pages.push(page)
    assert.equal(params.get('pageSize'), '50')
    assert.deepEqual(JSON.parse(params.get('filters') ?? '{}'), filters)
    return Response.json({ items: fixture.slice((page - 1) * 50, page * 50), page, pageSize: 50, total: fixture.length })
  }
  try {
    assert.deepEqual(await getCompleteCollection('shifts', filters), fixture)
    assert.deepEqual(pages, [1, 2, 3])
  } finally { globalThis.fetch = original }
})
