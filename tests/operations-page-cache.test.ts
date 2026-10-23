import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
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

test('auth context changing during an in-flight load cannot populate another actor cache', async () => {
  invalidatePageCache()
  const key = pageCacheKey('old:admin:v1', 'shifts', query)
  await assert.rejects(
    readCachedListPage(
      { getPage: async () => ({ items: [{ id: 'private' }], page: 1, pageSize: 10, total: 1 }) },
      'old:admin:v1', 'shifts', query, undefined, async () => false,
    ),
    /LIST_IDENTITY_CHANGED/,
  )
  assert.equal(readPageCache(key), undefined)
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

test('RC19 #71 cached private rows are not returned after actor drift, and old cache is evicted', async () => {
  invalidatePageCache()
  const previousWarning = console.warn
  const warnings: unknown[][] = []
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  const identity = 'private-owner:member:2026-10-24'
  const key = pageCacheKey(identity, 'shifts', query)
  let fetches = 0
  const service = { async getPage(): Promise<ListPage<Item>> {
    fetches++
    return { items: [{ id: 'private-stale-row' }], page: 1, pageSize: 10, total: 1 }
  } }
  try {
    writePageCache(key, { items: [{ id: 'private-stale-row' }], page: 1, pageSize: 10, total: 1 })
    await assert.rejects(
      readCachedListPage(service, identity, 'shifts', query, undefined, async () => false),
      /LIST_IDENTITY_CHANGED/,
    )
    assert.equal(fetches, 0, 'cached response must never invoke network when actor is revoked')
    assert.equal(readPageCache(key), undefined, 'stale actor cache must be cleared')
    assert.deepEqual(warnings, [['OPS_LIST_IDENTITY_DIAGNOSTIC', {
      stage: 'cache_actor_changed_on_hit',
    }]])
    const logged = JSON.stringify(warnings)
    assert.equal(logged.includes(identity), false)
    assert.equal(logged.includes('private-stale-row'), false)

    const refreshed = await readCachedListPage(
      service, identity, 'shifts', query, undefined, async () => true,
    )
    assert.deepEqual(refreshed.items.map(item => item.id), ['private-stale-row'])
    assert.equal(fetches, 1)
  } finally {
    console.warn = previousWarning
    invalidatePageCache()
  }
})

test('RC19 #71 in-flight actor drift invalidates existing actor cache pages', async () => {
  invalidatePageCache()
  const previousWarning = console.warn
  console.warn = () => undefined
  const identity = 'private-session:member:v1'
  const olderPage = pageCacheKey(identity, 'shifts', { ...query, page: 2 })
  writePageCache(olderPage, { items: [{ id: 'stale-row' }], page: 2, pageSize: 10, total: 20 })
  try {
    await assert.rejects(
      readCachedListPage({
        getPage: async () => ({ items: [{ id: 'old-page-1' }], page: 1, pageSize: 10, total: 20 }),
      }, identity, 'shifts', query, undefined, async () => false),
      /LIST_IDENTITY_CHANGED/,
    )
    assert.equal(readPageCache(olderPage), undefined)
    assert.equal(readPageCache(pageCacheKey(identity, 'shifts', query)), undefined)
  } finally {
    console.warn = previousWarning
    invalidatePageCache()
  }
})

test('RC19 #71 every usePagedList render goes through verified actor cache reads', () => {
  const hook = readFileSync(new URL('../lib/hooks/usePagedList.ts', import.meta.url), 'utf8')
  // Synchronous readPageCache could directly render old private rows without
  // passing the stillSameActor guard. Only readCachedListPage may return them.
  assert.doesNotMatch(hook, /\breadPageCache\b/)
  assert.doesNotMatch(hook, /\bpageCacheKey\b/)
  assert.match(hook, /readCachedListPage\(service, identity, prefix, currentQuery, controller\.signal, stillSameActor\)/)
  assert.match(hook, /const result = active \? state\.result : undefined/)
  assert.match(hook, /if \(request !== version\.current \|\| controller\.signal\.aborted\) return/)
})
