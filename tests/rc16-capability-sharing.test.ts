import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readSharedWorkforceCapabilities,
  invalidateSharedWorkforceCapabilities,
} from '@/lib/services/sharedWorkforceCapabilities'

test('RC16L capability calls share one in-flight request for the same identity', async () => {
  const identity = 'auth-a:business-a:admin'
  invalidateSharedWorkforceCapabilities(identity)
  let calls = 0
  let resolve!: (value: { payroll: boolean }) => void
  const load = () => {
    calls++
    return new Promise<{ payroll: boolean }>(done => { resolve = done })
  }
  const first = readSharedWorkforceCapabilities(identity, load, 1000)
  const second = readSharedWorkforceCapabilities(identity, load, 1000)
  assert.strictEqual(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolve({ payroll: false })
  assert.deepEqual(await Promise.all([first, second]), [{ payroll: false }, { payroll: false }])
  invalidateSharedWorkforceCapabilities(identity)
})

test('RC16L capabilities are not shared across accounts, roles or auth identities', async () => {
  let calls = 0
  const load = async () => ++calls
  const values = await Promise.all([
    readSharedWorkforceCapabilities('auth-a:business-a:admin', load, 1000),
    readSharedWorkforceCapabilities('auth-a:business-a:leader', load, 1000),
    readSharedWorkforceCapabilities('auth-b:business-a:admin', load, 1000),
  ])
  assert.equal(calls, 3)
  assert.deepEqual(values, [1, 2, 3])
  invalidateSharedWorkforceCapabilities()
})

test('RC16L completed requests expire after the short deduplication window', async () => {
  const identity = 'expiry-fixture'
  let calls = 0
  const load = async () => ++calls
  const initial = await readSharedWorkforceCapabilities(identity, load, 1000)
  const reused = await readSharedWorkforceCapabilities(identity, load, 1999)
  const refreshed = await readSharedWorkforceCapabilities(identity, load, 2000)
  assert.equal(initial, 1)
  assert.equal(reused, 1)
  assert.equal(refreshed, 2)
  assert.equal(calls, 2)
  invalidateSharedWorkforceCapabilities(identity)
})

test('RC16L failed capability requests are never cached', async () => {
  const identity = 'failure-fixture'
  let calls = 0
  await assert.rejects(
    readSharedWorkforceCapabilities(identity, async () => {
      calls++
      throw new Error('AUTH_REVOKED')
    }, 1000),
    /AUTH_REVOKED/,
  )
  assert.equal(await readSharedWorkforceCapabilities(identity, async () => ++calls, 1001), 2)
  invalidateSharedWorkforceCapabilities(identity)
})

test('RC16L invalidation does not let a stale completion evict a new request', async () => {
  const identity = 'revocation-fixture'
  let finishOld!: (value: number) => void
  let finishFresh!: (value: number) => void
  const oldRequest = readSharedWorkforceCapabilities(identity, () => new Promise<number>(done => { finishOld = done }), 1000)
  invalidateSharedWorkforceCapabilities(identity)
  const newRequest = readSharedWorkforceCapabilities(identity, () => new Promise<number>(done => { finishFresh = done }), 1000)
  await Promise.resolve()
  finishOld(1)
  assert.equal(await oldRequest, 1)
  assert.strictEqual(readSharedWorkforceCapabilities(identity, async () => 3, 1001), newRequest)
  finishFresh(2)
  assert.equal(await newRequest, 2)
  invalidateSharedWorkforceCapabilities(identity)
})

test('RC16L missing capability identity fails closed', async () => {
  await assert.rejects(
    readSharedWorkforceCapabilities(' ', async () => ({ payroll: true })),
    /WORKFORCE_IDENTITY_REQUIRED/,
  )
})

test('RC16L slow in-flight capability reads remain coalesced beyond the short TTL', async () => {
  const identity = 'slow-request-fixture'
  let calls = 0
  let resolve!: (value: string) => void
  const load = () => {
    calls++
    return new Promise<string>(done => { resolve = done })
  }
  const first = readSharedWorkforceCapabilities(identity, load, 1000)
  const later = readSharedWorkforceCapabilities(identity, load, 6000)
  assert.strictEqual(first, later)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolve('approved-by-server')
  assert.equal(await later, 'approved-by-server')
  invalidateSharedWorkforceCapabilities(identity)
})
