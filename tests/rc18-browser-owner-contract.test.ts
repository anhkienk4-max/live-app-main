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

test('RC19 #71 browser owner diagnostics identify mismatch stage without emitting identity values', async () => {
  const previousFetch = globalThis.fetch
  const previousWarning = console.warn
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  const warnings: unknown[][] = []
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  console.warn = (...args: unknown[]) => { warnings.push(args) }
  const own = { ...actor, id: 'private-business-id', role: 'staff', system_permission: 'member' } as User
  const payload = (ownerKey: string | undefined) =>
    new Response(JSON.stringify({
      items: [], total: 0, page: 1, pageSize: 10,
      ...(ownerKey === undefined ? {} : { ownerKey }),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  try {
    currentUserService.bindAuthenticatedUser(own)
    globalThis.fetch = async () => payload('private-business-id:member')
    assert.equal((await getCollectionPage('my_shifts', query)).total, 0)
    assert.equal(warnings.length, 0, 'valid owner produces no diagnostic')

    globalThis.fetch = async () => payload(undefined)
    await assert.rejects(getCollectionPage('my_shifts', query), (error: unknown) =>
      error instanceof OperationsListError && error.code === 'LIST_IDENTITY_CHANGED')
    assert.deepEqual(warnings.at(-1), ['OPS_LIST_IDENTITY_DIAGNOSTIC', {
      entity: 'my_shifts', stage: 'server_owner_missing', httpStatus: 200,
    }])

    globalThis.fetch = async () => payload('foreign-sensitive-id:member')
    await assert.rejects(getCollectionPage('my_shifts', query), (error: unknown) =>
      error instanceof OperationsListError && error.code === 'LIST_IDENTITY_CHANGED')
    assert.deepEqual(warnings.at(-1), ['OPS_LIST_IDENTITY_DIAGNOSTIC', {
      entity: 'my_shifts', stage: 'server_owner_mismatch', httpStatus: 200,
    }])

    globalThis.fetch = async () => {
      currentUserService.bindAuthenticatedUser({ ...own, id: 'changed-private-id' })
      return payload('private-business-id:member')
    }
    await assert.rejects(getCollectionPage('my_shifts', query), (error: unknown) =>
      error instanceof OperationsListError && error.code === 'LIST_IDENTITY_CHANGED')
    assert.deepEqual(warnings.at(-1), ['OPS_LIST_IDENTITY_DIAGNOSTIC', {
      entity: 'my_shifts', stage: 'actor_changed_during_request', httpStatus: 200,
    }])
    const recorded = JSON.stringify(warnings)
    for(const privateValue of ['private-business-id', 'changed-private-id',
      'foreign-sensitive-id', 'member:member', 'Bearer ', 'access_token']) {
      assert.equal(recorded.includes(privateValue), false, 'diagnostic must not contain private actor state')
    }
  } finally {
    console.warn = previousWarning
    currentUserService.clearAuthenticatedUser()
    globalThis.fetch = previousFetch
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('RC19 #71 stable Member Leader Admin across 20 mock navigation cycles never falsely changes owner', async () => {
  // This is an isolated mocked-list contract, NOT authenticated Playwright UAT.
  const originalFetch = globalThis.fetch
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldNodeEnv = process.env.NODE_ENV
  const oldMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  const entities = ['my_shifts', 'open_shifts', 'shifts', 'live_shifts',
    'notifications', 'swaps', 'reports'] as const
  let totalReads = 0
  try {
    for (const role of ['member', 'leader', 'admin'] as const) {
      const businessId = 'stable-' + role
      currentUserService.bindAuthenticatedUser({
        ...actor, id: businessId, role: role === 'member' ? 'staff' : role,
        system_permission: role,
      } as User)
      const expectedOwner = businessId + ':' + role
      globalThis.fetch = async input => {
        const url = new URL(String(input), 'https://example.test')
        const entity = url.searchParams.get('entity')
        assert.ok(entity && entities.some(candidate => candidate === entity))
        totalReads++
        return new Response(JSON.stringify({
          items: [], total: 0, page: 1, pageSize: 10,
          ownerKey: expectedOwner,
          ...(entity === 'reports' ? { historicalShiftContexts: {} } : {}),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      for (let cycle = 0; cycle < 20; cycle++) {
        const pages = await Promise.all(entities.map(entity => getCollectionPage(entity, query)))
        assert.equal(pages.length, entities.length)
        assert.ok(pages.every(page => page.ownerKey === expectedOwner && page.total === 0))
      }
      currentUserService.clearAuthenticatedUser(businessId)
    }
    assert.equal(totalReads, 3 * 20 * entities.length)
  } finally {
    currentUserService.clearAuthenticatedUser()
    globalThis.fetch = originalFetch
    process.env.NODE_ENV = oldNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = oldMock
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
