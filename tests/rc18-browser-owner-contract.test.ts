import assert from 'node:assert/strict'
import test from 'node:test'
import { currentUserService } from '../lib/services/dataService.ts'
import { getCollectionPage, OperationsListError } from '../lib/services/operationsPageService.ts'
import type { User } from '../lib/types/database.types.ts'

const actor = {
  id: 'business-a', status: 'active', account_status: 'active',
  role: 'admin', system_permission: 'admin', updated_at: '2026-10-22T00:00:00Z',
} as User
const query = { page: 1, pageSize: 10 as const, filters: {} }

test('browser collection fail-closed owner contract, across missing/foreign/changed actors', async () => {
  const previousFetch = globalThis.fetch
  const windowBefore = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  try {
    currentUserService.bindAuthenticatedUser(actor)
    const provide = (ownerKey: string | undefined) => {
      globalThis.fetch = async () => new Response(JSON.stringify({
        items: [], total: 0, page: 1, pageSize: 10,
        ...(ownerKey === undefined ? {} : { ownerKey }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    provide('business-a:admin')
    const success = await getCollectionPage('brands', query)
    assert.equal(success.total, 0)
    assert.equal(success.ownerKey, 'business-a:admin')

    for (const invalidOwner of [undefined, 'auth-a:admin', 'business-b:admin', 'business-a:member']) {
      provide(invalidOwner)
      await assert.rejects(getCollectionPage('brands', query), (error: unknown) => {
        return error instanceof OperationsListError
          && error.code === 'LIST_IDENTITY_CHANGED'
          && error.status === 409
      })
    }

    globalThis.fetch = async () => {
      currentUserService.bindAuthenticatedUser({ ...actor, id: 'business-b' })
      return new Response(JSON.stringify({
        items: [], total: 0, page: 1, pageSize: 10, ownerKey: 'business-a:admin',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    await assert.rejects(getCollectionPage('brands', query), (error: unknown) => {
      return error instanceof OperationsListError && error.code === 'LIST_IDENTITY_CHANGED'
    })
  } finally {
    currentUserService.clearAuthenticatedUser()
    globalThis.fetch = previousFetch
    if (windowBefore) Object.defineProperty(globalThis, 'window', windowBefore)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})


test('member list ignores stale same-user provider cleanup but rejects a foreign actor', async () => {
  const previousFetch = globalThis.fetch
  const windowBefore = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  const member = { ...actor, id: 'business-member', role: 'staff', system_permission: 'member' } as User
  try {
    const oldLease = currentUserService.bindAuthenticatedUser(member)
    globalThis.fetch = async () => {
      const newLease = currentUserService.bindAuthenticatedUser(member)
      assert.ok(newLease > oldLease)
      currentUserService.clearAuthenticatedUser(member.id, oldLease)
      return new Response(JSON.stringify({
        items: [], total: 0, page: 1, pageSize: 10,
        ownerKey: 'business-member:member',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const result = await getCollectionPage('my_shifts', query)
    assert.equal(result.ownerKey, 'business-member:member')

    globalThis.fetch = async () => {
      currentUserService.bindAuthenticatedUser({ ...member, id: 'another-member' })
      return new Response(JSON.stringify({
        items: [], total: 0, page: 1, pageSize: 10,
        ownerKey: 'business-member:member',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    await assert.rejects(getCollectionPage('my_shifts', query), (error: unknown) =>
      error instanceof OperationsListError && error.code === 'LIST_IDENTITY_CHANGED')
  } finally {
    currentUserService.clearAuthenticatedUser()
    globalThis.fetch = previousFetch
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
    if (windowBefore) Object.defineProperty(globalThis, 'window', windowBefore)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('RC19 role switch during in-flight Member request rejects the stale owner', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  const member = { ...actor, id: 'stable-business-id', role: 'staff', system_permission: 'member' } as User
  try {
    currentUserService.bindAuthenticatedUser(member)
    globalThis.fetch = async () => {
      // A legitimate privilege change cannot reuse the response from the old role.
      currentUserService.bindAuthenticatedUser({
        ...member, role: 'leader', system_permission: 'leader',
      })
      return new Response(JSON.stringify({
        items: [{ id: 'sensitive-old-row' }], total: 1, page: 1, pageSize: 10,
        ownerKey: 'stable-business-id:member',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    await assert.rejects(
      getCollectionPage('my_shifts', query),
      (error: unknown) => error instanceof OperationsListError
        && error.code === 'LIST_IDENTITY_CHANGED'
        && error.status === 409,
    )
  } finally {
    currentUserService.clearAuthenticatedUser()
    globalThis.fetch = previousFetch
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
