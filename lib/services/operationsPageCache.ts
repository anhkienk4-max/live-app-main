import type { ListPage, ListQuery } from './operationsPageService'

/**
 * Private, memory-only cache. Never persist user-visible operational rows in
 * localStorage, sessionStorage, a service worker or an HTTP shared cache.
 * Entries are scoped by business user, permission, update timestamp and query.
 */
export const OPERATIONS_PAGE_CACHE_TTL_MS = 30_000
const MAX_ENTRIES = 48

type Entry = { expires: number; value: unknown }
const entries = new Map<string, Entry>()
let invalidationEpoch = 0

export function pageCacheKey(identity: string, namespace: string, query: unknown): string {
  return JSON.stringify([identity, namespace, query])
}

export function readPageCache<T>(key: string): T | undefined {
  const entry = entries.get(key)
  if (!entry) return undefined
  if (entry.expires <= Date.now()) {
    entries.delete(key)
    return undefined
  }
  // Refresh insertion order for bounded LRU.
  entries.delete(key)
  entries.set(key, entry)
  return entry.value as T
}

export function writePageCache<T>(key: string, value: T): void {
  entries.delete(key)
  entries.set(key, { value, expires: Date.now() + OPERATIONS_PAGE_CACHE_TTL_MS })
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}

export function invalidatePageCache(identity?: string, namespace?: string): void {
  // In-flight reads from before a mutation must never repopulate stale rows.
  invalidationEpoch++
  if (!identity) { entries.clear(); return }
  for (const key of entries.keys()) {
    try {
      const [owner, scope] = JSON.parse(key) as [string, string]
      if (owner === identity && (!namespace || scope === namespace)) entries.delete(key)
    } catch { entries.delete(key) }
  }
}

export async function readCachedListPage<T>(
  service: { getPage(query: ListQuery, signal?: AbortSignal): Promise<ListPage<T>> },
  identity: string,
  namespace: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<ListPage<T>> {
  const key = pageCacheKey(identity, namespace, query)
  const previous = readPageCache<ListPage<T>>(key)
  if (previous) return previous
  const epoch = invalidationEpoch
  const result = await service.getPage(query, signal)
  if (!signal?.aborted && epoch === invalidationEpoch) writePageCache(key, result)
  return result
}

/** At most the next bounded page, only after the visible page has resolved. */
export function prefetchNextListPage<T>(
  service: { getPage(query: ListQuery, signal?: AbortSignal): Promise<ListPage<T>> },
  identity: string,
  namespace: string,
  query: ListQuery,
  visible: ListPage<T>,
  signal?: AbortSignal,
): void {
  if (signal?.aborted || visible.total <= visible.page * visible.pageSize || visible.page !== query.page) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  const next = { ...query, page: visible.page + 1 }
  const key = pageCacheKey(identity, namespace, next)
  if (readPageCache(key)) return
  void readCachedListPage(service, identity, namespace, next, signal).catch(() => {
    // Background prefetch is optional. The next page remains retryable on demand.
  })
}
