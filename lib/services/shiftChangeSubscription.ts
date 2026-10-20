import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

export const SHIFT_DATA_CHANGED_EVENT = 'ada:shift-data-changed'

export function subscribeToShiftChanges(
  client: SupabaseClient,
  userId: string,
  onInvalidate: () => void,
): () => void {
  let channel: RealtimeChannel | null = null
  let stopped = false
  let retryDelay = 1000
  let retryTimer: number | undefined
  let debounceTimer: number | undefined

  const invalidate = () => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined
      onInvalidate()
    }, 200)
  }

  const scheduleReconnect = () => {
    if (stopped || retryTimer !== undefined) return
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined
      connect()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 30_000)
  }

  const connect = () => {
    if (stopped) return
    if (channel) void client.removeChannel(channel)
    channel = client
      .channel(`shift-refresh:${userId}`)
      // DELETE events cannot be filtered by RLS; soft-delete lifecycle changes arrive as UPDATE.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shifts' }, invalidate)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shifts' }, invalidate)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          retryDelay = 1000
          invalidate()
        } else {
          scheduleReconnect()
        }
      })
  }

  connect()
  const pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) invalidate()
  }, 30_000)

  const onOnline = () => {
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    retryTimer = undefined
    connect()
    invalidate()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') invalidate()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    if (pollTimer !== undefined) window.clearInterval(pollTimer)
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    if (channel) void client.removeChannel(channel)
    channel = null
  }
}
