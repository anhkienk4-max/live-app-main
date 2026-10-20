import test from 'node:test'
import assert from 'node:assert/strict'
import { subscribeToShiftChanges } from '@/lib/services/shiftChangeSubscription'

function setup() {
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  }
  let timerId = 0
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const intervals = new Map<number, { callback: () => void; delay: number }>()
  const listeners = new Map<string, () => void>()
  const documentListeners = new Map<string, () => void>()
  const browser = { online: true, visibility: 'visible' }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, delay }); return id },
    clearTimeout: (id: number) => { timers.delete(id) },
    setInterval: (callback: () => void, delay: number) => { const id = ++timerId; intervals.set(id, { callback, delay }); return id },
    clearInterval: (id: number) => { intervals.delete(id) },
    addEventListener: (name: string, callback: () => void) => { listeners.set(name, callback) },
    removeEventListener: (name: string) => { listeners.delete(name) },
  } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    get visibilityState() { return browser.visibility },
    addEventListener: (name: string, callback: () => void) => { documentListeners.set(name, callback) },
    removeEventListener: (name: string) => { documentListeners.delete(name) },
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { get onLine() { return browser.online } } })
  const restore = () => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  return { timers, intervals, listeners, documentListeners, browser, restore }
}

test('healthy subscription uses event invalidation and only a sparse reconciliation timer', () => {
  const env = setup()
  try {
    let receive: (() => void) | undefined
    const handlers: Array<{ event: string; schema: string; table: string }> = []
    const channel = {
      on(_type: string, filter: { event: string; schema: string; table: string }, callback: () => void) {
        handlers.push(filter)
        receive = callback
        return this
      },
      subscribe(callback: (status: string) => void) { callback('SUBSCRIBED'); return this },
    }
    const client = {
      channel(name: string) { assert.equal(name, 'shift-refresh:admin-1'); return channel },
      removeChannel() { return Promise.resolve('ok') },
    }
    let invalidations = 0
    const unsubscribe = subscribeToShiftChanges(client as never, 'admin-1', () => { invalidations += 1 })
    assert.deepEqual(handlers, [
      { event: 'INSERT', schema: 'public', table: 'shifts' },
      { event: 'UPDATE', schema: 'public', table: 'shifts' },
    ])
    assert.equal(env.intervals.size, 0, 'healthy channel has no 30-second polling')
    assert.ok([...env.timers.values()].some(timer => timer.delay === 5 * 60_000), 'healthy channel gets a 5-minute reconciliation')
    receive?.()
    assert.equal(env.timers.size, 2, 'one debounce timer coalesces events while one reconciliation remains scheduled')
    const debounce = [...env.timers.entries()].find(([, timer]) => timer.delay === 200)?.[0]
    assert.ok(debounce)
    env.timers.get(debounce)?.callback()
    env.timers.delete(debounce)
    assert.equal(invalidations, 1)
    unsubscribe()
    assert.equal(env.timers.size, 0)
    assert.equal(env.intervals.size, 0)
    assert.equal(env.listeners.size, 0)
    assert.equal(env.documentListeners.size, 0)
  } finally { env.restore() }
})

test('disconnected channel polls only while visible and online, then stops after reconnect', () => {
  const env = setup()
  try {
    let attempts = 0
    let removed = 0
    const channel = {
      on() { return this },
      subscribe(callback: (status: string) => void) { attempts += 1; callback(attempts === 1 ? 'CHANNEL_ERROR' : 'SUBSCRIBED'); return this },
    }
    const client = {
      channel() { return channel },
      removeChannel() { removed += 1; return Promise.resolve('ok') },
    }
    let invalidations = 0
    const unsubscribe = subscribeToShiftChanges(client as never, 'member-1', () => { invalidations += 1 })
    assert.equal(env.intervals.size, 1)
    assert.equal([...env.intervals.values()][0]?.delay, 30_000)
    env.browser.visibility = 'hidden'
    ;[...env.intervals.values()][0]?.callback()
    assert.equal(invalidations, 0, 'hidden tab does not poll')
    env.browser.visibility = 'visible'
    ;[...env.intervals.values()][0]?.callback()
    const debounce = [...env.timers.entries()].find(([, timer]) => timer.delay === 200)?.[0]
    assert.ok(debounce)
    env.timers.get(debounce)?.callback()
    env.timers.delete(debounce)
    assert.equal(invalidations, 1)
    const retry = [...env.timers.entries()].find(([, timer]) => timer.delay === 1000)?.[0]
    assert.ok(retry)
    env.timers.get(retry)?.callback()
    env.timers.delete(retry)
    assert.equal(attempts, 2)
    assert.equal(env.intervals.size, 0, 'fallback polling stops once the channel is healthy')
    assert.ok(removed >= 1)
    unsubscribe()
  } finally { env.restore() }
})

test('offline pauses reconnect and fallback requests until the browser returns online', () => {
  const env = setup()
  try {
    let attempts = 0
    const channel = {
      on() { return this },
      subscribe(callback: (status: string) => void) { attempts += 1; callback('CHANNEL_ERROR'); return this },
    }
    const client = { channel: () => channel, removeChannel: () => Promise.resolve('ok') }
    let invalidations = 0
    const unsubscribe = subscribeToShiftChanges(client as never, 'member-2', () => { invalidations += 1 })
    env.browser.online = false
    env.listeners.get('offline')?.()
    assert.equal(env.timers.size, 0, 'offline does not schedule reconnect')
    ;[...env.intervals.values()][0]?.callback()
    assert.equal(invalidations, 0, 'offline fallback does not issue refresh')
    env.browser.online = true
    env.listeners.get('online')?.()
    assert.equal(attempts, 2)
    unsubscribe()
  } finally { env.restore() }
})
