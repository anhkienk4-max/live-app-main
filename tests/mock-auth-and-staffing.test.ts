import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeCapacity } from '../lib/utils/shiftUtils.ts'

const storage = new Map<string, string>()
const storageApi = {
  getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
}

const mockWindow = {
  localStorage: storageApi,
  sessionStorage: storageApi,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
}

Object.defineProperty(globalThis, 'window', { value: mockWindow, configurable: true })
const cryptoMock = {
  randomUUID: () => `mock-${Math.random().toString(36).slice(2)}`,
  subtle: {
    digest: async (_algorithm: string, data: Uint8Array) => {
      const text = new TextDecoder().decode(data)
      const encoded = new TextEncoder().encode(text)
      return encoded
    },
  },
}
Object.defineProperty(globalThis, 'crypto', { value: cryptoMock, configurable: true })
Object.defineProperty(mockWindow, 'crypto', { value: cryptoMock, configurable: true })

test('mock registration stays pending until approval and then logs in', async () => {
  storage.clear()
  const { mockAuthService } = await import('../lib/services/mockAuthService')
  const { userService } = await import('../lib/services/dataService')

  const result = await mockAuthService.registerEmail({
    fullName: 'Pending Tester',
    email: 'pending-tester@example.com',
    password: 'secret1234',
  })

  assert.equal(result.ok, true)
  assert.equal(result.status, 'pending_approval')
  if (!result.ok) throw new Error('Expected registration to succeed')
  assert.equal(result.user.email_verified, true)
  assert.equal(result.user.account_status, 'pending_approval')

  const blocked = await mockAuthService.signInEmail('pending-tester@example.com', 'secret1234')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.status, 'pending_approval')

  const updated = await userService.approvePendingAccount(result.user.id)
  assert.equal(updated?.account_status, 'active')
  assert.equal(updated?.status, 'active')

  const allowed = await mockAuthService.signInEmail('pending-tester@example.com', 'secret1234')
  assert.equal(allowed.ok, true)
  assert.equal(allowed.status, 'active')
})

test('staffing defaults fall back to one and preserve explicit values', () => {
  assert.equal(normalizeCapacity(undefined), 1)
  assert.equal(normalizeCapacity(null), 1)
  assert.equal(normalizeCapacity(''), 1)
  assert.equal(normalizeCapacity('0'), 0)
  assert.equal(normalizeCapacity(0), 0)
  assert.equal(normalizeCapacity(NaN), 1)
  assert.equal(normalizeCapacity('2'), 2)
  assert.equal(normalizeCapacity('1'), 1)
  assert.equal(normalizeCapacity(-1), null)
})
