import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

export const SHIFT_DATA_CHANGED_EVENT = 'ada:shift-data-changed'
const DISCONNECTED_RECONCILE_MS = 30_000
const HEALTHY_RECONCILE_MS = 5 * 60_000

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
  let pollTimer: number | undefined
  let reconcileTimer: number | undefined
  let subscribed = false

  const invalidate = () => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined
      onInvalidate()
    }, 200)
  }

  const scheduleHealthyReconciliation = () => {
    if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer)
    reconcileTimer = window.setTimeout(() => {
      reconcileTimer = undefined
      if (subscribed && document.visibilityState === 'visible' && navigator.onLine) invalidate()
      if (subscribed) scheduleHealthyReconciliation()
    }, HEALTHY_RECONCILE_MS)
  }

  const startFallbackPolling = () => {
    if (pollTimer !== undefined) return
    pollTimer = window.setInterval(() => {
      if (!subscribed && document.visibilityState === 'visible' && navigator.onLine) invalidate()
    }, DISCONNECTED_RECONCILE_MS)
  }

  const stopFallbackPolling = () => {
    if (pollTimer === undefined) return
    window.clearInterval(pollTimer)
    pollTimer = undefined
  }

  const scheduleReconnect = () => {
    if (stopped || !navigator.onLine || retryTimer !== undefined) return
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined
      connect()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, 30_000)
  }

  const connect = () => {
    if (stopped) return
    subscribed = false
    if (channel) void client.removeChannel(channel)
    const onShiftChanged = () => {
      invalidate()
      if (subscribed) scheduleHealthyReconciliation()
    }
    const nextChannel = client
      .channel(`shift-refresh:${userId}`)
      // DELETE events cannot be filtered by RLS; soft-delete lifecycle changes arrive as UPDATE.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shifts' }, onShiftChanged)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shifts' }, onShiftChanged)
    channel = nextChannel
    nextChannel.subscribe(status => {
        if (stopped || channel !== nextChannel) return
        if (status === 'SUBSCRIBED') {
          if (retryTimer !== undefined) window.clearTimeout(retryTimer)
          retryTimer = undefined
          subscribed = true
          retryDelay = 1000
          stopFallbackPolling()
          scheduleHealthyReconciliation()
          invalidate()
        } else {
          subscribed = false
          if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer)
          reconcileTimer = undefined
          startFallbackPolling()
          scheduleReconnect()
        }
      })
  }

  connect()

  const onOnline = () => {
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    retryTimer = undefined
    startFallbackPolling()
    connect()
    invalidate()
  }
  const onOffline = () => {
    subscribed = false
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    retryTimer = undefined
    if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer)
    reconcileTimer = undefined
    startFallbackPolling()
  }
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    invalidate()
    if (subscribed) scheduleHealthyReconciliation()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    stopFallbackPolling()
    if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer)
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    if (channel) void client.removeChannel(channel)
    channel = null
  }
}
