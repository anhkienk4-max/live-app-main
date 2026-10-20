import { currentPageCacheGeneration, pageCacheKey, readPageCache, writePageCache } from './operationsPageCache'

type Request<T> = { generation: number; promise: Promise<T> }
const pending = new Map<string, Request<unknown>>()
const MAX_PENDING = 48

/**
 * 30-second, memory-only value cache with in-flight request coalescing.
 * All callers must use a verified business identity in their key.
 * Changing the page-cache generation invalidates this cache as well.
 */
export function readTransientData<T>(
  identity: string,
  namespace: string,
  loader: () => Promise<T>,
  verifyActor: () => Promise<boolean> = async () => true,
): Promise<T> {
  if (!identity) return Promise.reject(new Error('CACHE_IDENTITY_REQUIRED'))
  const key = pageCacheKey(identity, 'transient:' + namespace, {})
  const saved = readPageCache<T>(key)
  if (saved !== undefined) return Promise.resolve(saved)
  const generation = currentPageCacheGeneration()
  const existing = pending.get(key) as Request<T> | undefined
  if (existing && existing.generation === generation) return existing.promise
  const request: Request<T> = {
    generation,
    promise: Promise.resolve().then(loader).then(async value => {
      // No stale response may enter the cache following logout/mutation.
      if (!(await verifyActor())) throw new Error('CACHE_IDENTITY_CHANGED')
      if (generation !== currentPageCacheGeneration()) throw new Error('CACHE_INVALIDATED')
      writePageCache(key, value)
      return value
    }),
  }
  pending.set(key, request)
  // Errors are never cached; pending requests are bounded and removed on settlement.
  void request.promise.then(() => {
    if (pending.get(key) === request) pending.delete(key)
  }, () => {
    if (pending.get(key) === request) pending.delete(key)
  })
  while (pending.size > MAX_PENDING) {
    const oldest = pending.keys().next().value
    if (oldest === undefined) break
    pending.delete(oldest)
  }
  return request.promise
}
