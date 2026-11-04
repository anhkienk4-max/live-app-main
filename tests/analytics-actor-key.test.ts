import assert from 'node:assert/strict'
import test from 'node:test'
import { operationsActorCacheKey } from '../lib/auth/operationsActorKey.ts'

const actor = { id: 'u-1', role: 'staff' as const, updated_at: '2026-10-22T00:00:00Z' }

test('cache verification uses the same permission fallback as its initial request', () => {
  const initial = operationsActorCacheKey(actor)
  const reread = operationsActorCacheKey({ ...actor, system_permission: undefined })
  assert.equal(initial, reread)
  assert.equal(initial, 'u-1:staff:2026-10-22T00:00:00Z')
})

test('an explicit system permission scopes the cache independent of legacy role', () => {
  const admin = operationsActorCacheKey({ ...actor, system_permission: 'admin' })
  const member = operationsActorCacheKey({ ...actor, system_permission: 'member' })
  assert.notEqual(admin, member)
  assert.notEqual(admin, operationsActorCacheKey(actor))
})

test('different business users and user record versions cannot share a cache scope', () => {
  const initial = operationsActorCacheKey(actor)
  assert.notEqual(initial, operationsActorCacheKey({ ...actor, id: 'u-2' }))
  assert.notEqual(initial, operationsActorCacheKey({ ...actor, updated_at: '2026-10-22T01:00:00Z' }))
})

test('unverifiable actor keys fail closed and cannot write into a shared cache slot', () => {
  assert.throws(() => operationsActorCacheKey({ ...actor, id: '' }), /LIST_IDENTITY_UNAVAILABLE/)
  assert.throws(() => operationsActorCacheKey({ ...actor, updated_at: '' }), /LIST_IDENTITY_UNAVAILABLE/)
})
