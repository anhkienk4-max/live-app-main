import test from 'node:test'
import assert from 'node:assert/strict'
import { subscribeToShiftChanges } from '@/lib/services/shiftChangeSubscription'

test('shift change subscription reconnects, invalidates INSERT/UPDATE views, polls and cleans up', () => {
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  }
  let timerId = 0
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const intervals = new Map<number, () => void>()
  const listeners = new Map<string, () => void>()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearTimeout: (id: number) => { timers.delete(id) },
    setInterval: (callback: () => void) => { const id = ++timerId; intervals.set(id, callback); return id },
    clearInterval: (id: number) => { intervals.delete(id) },
    addEventListener: (name: string, callback: () => void) => { listeners.set(name, callback) },
    removeEventListener: (name: string) => { listeners.delete(name) },
  } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    visibilityState: 'visible', addEventListener: () => undefined, removeEventListener: () => undefined,
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  let receive: (() => void) | undefined
  let status: ((value: string) => void) | undefined
  let attempts = 0
  let removed = false
  const handlers: Array<{ event: string; schema: string; table: string }> = []
  const channel = {
    on(_type: string, filter: { event: string; schema: string; table: string }, callback: () => void) {
      handlers.push(filter)
      receive = callback
      return this
    },
    subscribe(callback: (status: string) => void) {
      status = callback
      attempts += 1
      callback(attempts === 1 ? 'CHANNEL_ERROR' : 'SUBSCRIBED')
      return this
    },
  }
  const client = {
    channel(name: string) { assert.equal(name, 'shift-refresh:admin-1'); return channel },
    removeChannel() { removed = true; return Promise.resolve('ok') },
  }
  let invalidations = 0
  const unsubscribe = subscribeToShiftChanges(client as never, 'admin-1', () => { invalidations += 1 })
  assert.deepEqual(handlers, [
    { event: 'INSERT', schema: 'public', table: 'shifts' },
    { event: 'UPDATE', schema: 'public', table: 'shifts' },
  ])
  assert.equal(timers.values().next().value?.delay, 1000, 'initial connection failure schedules bounded reconnect')
  const reconnectId = [...timers.entries()].find(([, value]) => value.delay === 1000)?.[0]
  assert.ok(reconnectId)
  timers.get(reconnectId)?.callback()
  timers.delete(reconnectId)
  assert.equal(attempts, 2)
  status?.('SUBSCRIBED')
  receive?.()
  const debounceId = [...timers.entries()].find(([, value]) => value.delay === 200)?.[0]
  assert.ok(debounceId)
  timers.get(debounceId)?.callback()
  timers.delete(debounceId)
  assert.equal(invalidations, 1)
  intervals.values().next().value?.()
  const pollDebounceId = [...timers.entries()].find(([, value]) => value.delay === 200)?.[0]
  assert.ok(pollDebounceId, 'poll fallback invalidates after a bounded interval')
  timers.get(pollDebounceId)?.callback()
  timers.delete(pollDebounceId)
  assert.equal(invalidations, 2)
  unsubscribe()
  assert.equal(removed, true)
  assert.equal(intervals.size, 0, 'cleanup removes fallback polling')
  assert.equal(listeners.size, 0, 'cleanup removes browser listeners')
  for (const [key, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})
