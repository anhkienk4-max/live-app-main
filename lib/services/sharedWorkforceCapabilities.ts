/**
 * Short-lived, identity-scoped request coalescing for workforce capability reads.
 *
 * This is a client-side UX optimization, never an authorization source.
 * The server re-checks session and permissions for every privileged action.
 */
type Entry = { promise: Promise<unknown>; expiresAt: number; pending: boolean }
const requests = new Map<string, Entry>()
const DEDUPE_WINDOW_MS = 1000

export function readSharedWorkforceCapabilities<T>(
  identityKey: string,
  load: () => Promise<T>,
  nowMs: number = Date.now(),
): Promise<T> {
  if (!identityKey.trim()) return Promise.reject(new Error('WORKFORCE_IDENTITY_REQUIRED'))
  const current = requests.get(identityKey)
  if (current && (current.pending || current.expiresAt > nowMs)) return current.promise as Promise<T>
  const promise = Promise.resolve().then(load)
  const entry: Entry = { promise, expiresAt: nowMs + DEDUPE_WINDOW_MS, pending: true }
  requests.set(identityKey, entry)
  // Clear failures immediately. A late rejected request must not evict
  // a newer request created after an identity/visibility invalidation.
  void promise.then(() => {
    // Continue sharing only during the short post-request window.
    if (requests.get(identityKey) === entry) entry.pending = false
  }, () => {
    if (requests.get(identityKey) === entry) requests.delete(identityKey)
  })
  return promise
}

export function invalidateSharedWorkforceCapabilities(identityKey?: string | null): void {
  if (identityKey) requests.delete(identityKey)
  else requests.clear()
}
