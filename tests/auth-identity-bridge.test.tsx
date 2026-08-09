import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  createAuthIdentity,
  mapAuthIdentityToBusinessUser,
  type AuthUserSource,
} from '../lib/auth/authIdentity.ts'
import { AuthIdentityProvider } from '../lib/auth/AuthIdentityProvider.tsx'
import { useCurrentUser } from '../lib/hooks/useCurrentUser.ts'
import { hasPermission } from '../lib/permissions.ts'
import { createVisionOcrPostHandler } from '../lib/server/visionOcrRouteHandler.ts'
import { currentUserService } from '../lib/services/dataService.ts'
import { mockUsers } from '../lib/services/mockData.ts'

const source = (
  systemPermission: unknown = 'member',
  mappedBusinessUserId: unknown = '3',
  overrides: Partial<AuthUserSource> = {},
): AuthUserSource => ({
  id: '9f89364c-3ccb-44db-a183-c7bb61dbb4a5',
  email: 'authenticated@example.test',
  app_metadata: {
    system_permission: systemPermission,
    business_user_id: mappedBusinessUserId,
  },
  user_metadata: {
    full_name: 'Authenticated Display Name',
    avatar_url: 'https://example.test/avatar.png',
  },
  ...overrides,
})

function mapped(sourceUser: AuthUserSource) {
  const identity = createAuthIdentity(sourceUser)
  return {
    identity,
    businessUser: identity ? mapAuthIdentityToBusinessUser(identity, mockUsers) : null,
  }
}

test('safe identity contains no session or token data and accepts only app_metadata authorization', () => {
  const { identity } = mapped(source('member', '3', {
    user_metadata: {
      full_name: 'Safe display name',
      system_permission: 'admin',
      business_user_id: '1',
      access_token: 'must-not-leak',
    },
  }))

  assert.ok(identity)
  assert.equal(identity.system_permission, 'member')
  assert.equal(identity.business_user_id, '3')
  assert.equal(identity.display_name, 'Safe display name')
  assert.deepEqual(Object.keys(identity).sort(), [
    'auth_user_id',
    'avatar_url',
    'business_user_id',
    'display_name',
    'email',
    'system_permission',
  ])
  assert.equal(JSON.stringify(identity).includes('must-not-leak'), false)
})

test('system permission is strict and missing identity claims fail closed', () => {
  assert.equal(createAuthIdentity(null), null)
  assert.equal(createAuthIdentity({ ...source(), id: '' }), null)
  assert.equal(createAuthIdentity({
    ...source('member', '3'),
    app_metadata: { business_user_id: '3' },
  }), null)
  for (const permission of [null, '', 'staff', 'owner', 'ADMIN']) {
    assert.equal(createAuthIdentity(source(permission, '3')), null)
  }
  assert.equal(createAuthIdentity({
    ...source('member', '3'),
    app_metadata: { system_permission: 'member' },
  }), null)
  assert.equal(createAuthIdentity(source('member', '  ')), null)
  assert.equal(createAuthIdentity(source('member', -1)), null)
})

test('business user mapping is exact, active and has no Admin fallback', () => {
  const unknown = createAuthIdentity(source('member', '999'))
  assert.ok(unknown)
  assert.equal(mapAuthIdentityToBusinessUser(unknown, mockUsers), null)

  const inactiveUsers = mockUsers.map(user => user.id === '3'
    ? { ...user, status: 'inactive' as const }
    : user)
  const member = createAuthIdentity(source('member', '3'))
  assert.ok(member)
  assert.equal(mapAuthIdentityToBusinessUser(member, inactiveUsers), null)

  const mappedAdminRecordAsMember = mapped(source('member', '1')).businessUser
  assert.ok(mappedAdminRecordAsMember)
  assert.equal(mappedAdminRecordAsMember.id, '1')
  assert.equal(mappedAdminRecordAsMember.system_permission, 'member')
  assert.equal(mappedAdminRecordAsMember.role, 'staff')
})

test('trusted system permission and mapped operational roles remain separate', () => {
  for (const permission of ['member', 'leader', 'admin'] as const) {
    const user = mapped(source(permission, '3')).businessUser
    assert.ok(user)
    assert.equal(user.system_permission, permission)
    assert.equal(user.role, permission === 'member' ? 'staff' : permission)
  }

  const leaderHost = mapped(source('leader', '3')).businessUser
  assert.ok(leaderHost)
  assert.equal(leaderHost.system_permission, 'leader')
  assert.equal(leaderHost.role, 'leader')
  assert.deepEqual(leaderHost.operational_roles, ['host'])
  assert.equal(hasPermission(leaderHost, 'reports.review'), true)

  const memberLeaderRecord = mapped(source('member', '2')).businessUser
  assert.ok(memberLeaderRecord)
  assert.equal(memberLeaderRecord.system_permission, 'member')
  assert.equal(hasPermission(memberLeaderRecord, 'reports.review'), false)
  assert.deepEqual(memberLeaderRecord.operational_roles, ['host', 'support', 'technical'])
})

test('provider keeps useCurrentUser compatible with the existing business User shape', () => {
  const { identity, businessUser } = mapped(source('leader', '5'))
  assert.ok(identity)
  assert.ok(businessUser)

  function Probe() {
    const current = useCurrentUser()
    return createElement('output', {
      'data-business-user': current.currentUser?.id,
      'data-auth-user': current.authIdentity?.auth_user_id,
      'data-permission': current.currentUser?.system_permission,
      'data-operational-roles': current.currentUser?.operational_roles?.join(','),
    })
  }

  const markup = renderToStaticMarkup(createElement(
    AuthIdentityProvider,
    { mode: 'supabase', identity, businessUser },
    createElement(Probe),
  ))
  assert.match(markup, /data-business-user="5"/)
  assert.match(markup, /data-auth-user="9f89364c-3ccb-44db-a183-c7bb61dbb4a5"/)
  assert.match(markup, /data-permission="leader"/)
  assert.match(markup, /data-operational-roles="support"/)
})

test('production current-user service ignores local Admin selection, survives reload and clears on logout', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => '1',
        setItem: () => undefined,
      },
      dispatchEvent: () => true,
    },
  })

  try {
    const businessUser = mapped(source('member', '3')).businessUser
    assert.ok(businessUser)
    currentUserService.bindAuthenticatedUser(businessUser)
    assert.equal(currentUserService.getId(), '3')
    assert.equal((await currentUserService.getCurrent())?.system_permission, 'member')
    assert.equal((await currentUserService.getCurrent())?.id, '3')
    assert.equal(await currentUserService.setCurrent('1'), null)
    assert.equal(currentUserService.getId(), '3')

    currentUserService.clearAuthenticatedUser('3')
    assert.throws(() => currentUserService.getId(), /unavailable/)
    await assert.rejects(currentUserService.getCurrent(), /unavailable/)
  } finally {
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('request claims cannot elevate a mapped member and Vision remains fail-closed', async () => {
  const validIdentity = createAuthIdentity(source('member', '3'))
  assert.ok(validIdentity)
  const validBusinessUser = mapAuthIdentityToBusinessUser(validIdentity, mockUsers)
  assert.ok(validBusinessUser)

  const resolveUser = async () => ({
    id: validIdentity.auth_user_id,
    businessUserId: validIdentity.business_user_id,
    systemPermission: validIdentity.system_permission,
  })
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const handler = createVisionOcrPostHandler({
      config: { enabled: true, provider: 'mock' },
      resolveUser,
    })
    const request = new Request('http://localhost/api/ocr/vision', {
      method: 'POST',
      headers: { 'x-user-role': 'admin' },
      body: JSON.stringify({ role: 'admin', user_metadata: { system_permission: 'admin' } }),
    })
    const authenticated = await handler(request)
    assert.equal(authenticated.status, 503)
    assert.equal(
      (await authenticated.json() as { error: { code: string } }).error.code,
      'AI_PROVIDER_NOT_CONFIGURED',
    )

    const anonymous = createVisionOcrPostHandler({
      config: { enabled: true, provider: 'mock' },
      resolveUser: async () => null,
    })
    const rejected = await anonymous(new Request('http://localhost/api/ocr/vision', { method: 'POST' }))
    assert.equal(rejected.status, 401)
    assert.equal(
      (await rejected.json() as { error: { code: string } }).error.code,
      'AUTHENTICATION_REQUIRED',
    )
  } finally {
    process.env.NODE_ENV = previousNodeEnv
  }
})
