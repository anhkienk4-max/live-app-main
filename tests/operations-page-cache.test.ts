import assert from 'node:assert/strict'
import test from 'node:test'
import {
  invalidatePageCache, pageCacheKey, readCachedListPage, readPageCache,
  writePageCache, prefetchNextListPage,
} from '../lib/services/operationsPageCache.ts'
import type { ListQuery, ListPage } from '../lib/services/operationsPageService.ts'

type Item = { id: string }
const query: ListQuery = { page: 1, pageSize: 10, filters: { from: '2026-10-20' } }

test('page cache avoids refetching a fresh visible page on navigation', async () => {
  invalidatePageCache()
  let reads = 0
  const service = { async getPage(q: ListQuery): Promise<ListPage<Item>> {
    reads++
    return { items: [{ id: String(q.page) }], page: q.page, pageSize: q.pageSize, total: 20 }
  } }
  const first = await readCachedListPage(service, 'user-a:admin:v1', 'shifts', query)
  const second = await readCachedListPage(service, 'user-a:admin:v1', 'shifts', query)
  assert.equal(first, second)
  assert.equal(reads, 1)
  assert.equal((await readCachedListPage(service, 'user-b:member:v1', 'shifts', query)).items[0].id, '1')
  assert.equal(reads, 2, 'different business identities must not share cached rows')
})

test('separate filters, pages, permissions and invalidation never reuse private rows', () => {
  invalidatePageCache()
  const a = pageCacheKey('user-a:admin:v1', 'shifts', query)
  const b = pageCacheKey('user-a:member:v2', 'shifts', query)
  const c = pageCacheKey('user-a:admin:v1', 'reports', query)
  const d = pageCacheKey('user-a:admin:v1', 'shifts', { ...query, page: 2 })
  writePageCache(a, ['admin'])
  writePageCache(b, ['member'])
  writePageCache(c, ['report'])
  writePageCache(d, ['next'])
  invalidatePageCache('user-a:admin:v1', 'shifts')
  assert.equal(readPageCache(a), undefined)
  assert.equal(readPageCache(d), undefined)
  assert.deepEqual(readPageCache(b), ['member'])
  assert.deepEqual(readPageCache(c), ['report'])
  invalidatePageCache()
  assert.equal(readPageCache(c), undefined)
})

test('next-page prefetch is bounded and does not load all pages', async () => {
  invalidatePageCache()
  const seen: number[] = []
  const service = { async getPage(q: ListQuery): Promise<ListPage<Item>> {
    seen.push(q.page)
    return { items: [{ id: String(q.page) }], page: q.page, pageSize: q.pageSize, total: 1000 }
  } }
  const visible = await readCachedListPage(service, 'a', 'shifts', query)
  prefetchNextListPage(service, 'a', 'shifts', query, visible)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(seen, [1, 2])
  assert.ok(readPageCache(pageCacheKey('a', 'shifts', { ...query, page: 2 })))
  assert.equal(readPageCache(pageCacheKey('a', 'shifts', { ...query, page: 3 })), undefined)
})

test('aborted requests and failed queries must not poison the cache', async () => {
  invalidatePageCache()
  const key = pageCacheKey('actor', 'shifts', query)
  const controller = new AbortController()
  const service = { async getPage(): Promise<ListPage<Item>> {
    controller.abort()
    return { items: [{ id: 'x' }], page: 1, pageSize: 10, total: 1 }
  } }
  await readCachedListPage(service, 'actor', 'shifts', query, controller.signal)
  assert.equal(readPageCache(key), undefined)
  await assert.rejects(readCachedListPage({ getPage: async () => { throw new Error('denied') } }, 'actor', 'shifts', query), /denied/)
  assert.equal(readPageCache(key), undefined)
})
