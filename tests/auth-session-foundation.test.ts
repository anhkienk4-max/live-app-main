import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server'

import {
  resolveAuthMode,
  resolveSupabasePublicConfig,
  safeLocalRedirect,
} from '../lib/auth/authMode.ts'
import { createAuthProxy } from '../lib/auth/proxy.ts'
import {
  clearLocalSession,
  establishPasswordSession,
  getVerifiedUser,
  shouldClearLocalSessionForLoginReason,
  type PasswordSessionClient,
} from '../lib/auth/session.ts'
import {
  AuthorizationError,
  requireRole,
} from '../lib/server/authGuards.ts'
import { createVisionOcrPostHandler } from '../lib/server/visionOcrRouteHandler.ts'
import {
  createSessionUpdater,
  type SessionClientFactory,
} from '../lib/supabase/middleware.ts'

test('production cannot enable mock auth and development requires an explicit flag', () => {
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'production' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'development', useMockData: 'false' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'development' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' }), 'mock')
})

test('Supabase public configuration requires both non-empty values', () => {
  assert.equal(resolveSupabasePublicConfig({}), null)
  assert.equal(resolveSupabasePublicConfig({ url: 'https://project.supabase.co' }), null)
  assert.equal(resolveSupabasePublicConfig({ url: ' ', anonKey: 'key' }), null)
  assert.deepEqual(resolveSupabasePublicConfig({
    url: ' https://project.supabase.co ',
    anonKey: ' public-key ',
  }), {
    url: 'https://project.supabase.co',
    anonKey: 'public-key',
  })
})

test('post-login redirects remain local', () => {
  assert.equal(safeLocalRedirect('/reports?tab=draft'), '/reports?tab=draft')
  assert.equal(safeLocalRedirect('//attacker.example'), '/')
  assert.equal(safeLocalRedirect('https://attacker.example'), '/')
  assert.equal(safeLocalRedirect(null), '/')
})

test('password login, reload verification and logout use one Supabase session', async () => {
  let active = false
  let signedInEmail = ''
  let signOutScope = ''
  const user = { id: 'supabase-user-1', email: 'member@example.test' }
  const client: PasswordSessionClient = {
    auth: {
      async signInWithPassword(credentials) {
        signedInEmail = credentials.email
        active = credentials.password === 'correct-password'
        return active
          ? { data: { session: { access_token: 'cookie-backed' }, user }, error: null }
          : { data: { session: null, user: null }, error: new Error('invalid') }
      },
      async signOut(options) {
        signOutScope = options.scope
        active = false
        return { error: null }
      },
    },
  }

  assert.equal(await establishPasswordSession(
    client,
    ' Member@Example.Test ',
    'correct-password',
  ), true)
  assert.equal(signedInEmail, 'member@example.test')
  assert.deepEqual(await getVerifiedUser(async () => ({
    data: { user: active ? user : null },
    error: null,
  })), user)

  assert.equal(await clearLocalSession(client), true)
  assert.equal(signOutScope, 'local')
  assert.equal(await getVerifiedUser(async () => ({
    data: { user: active ? user : null },
    error: null,
  })), null)
})

test('login recovery reasons use the supported local Supabase sign-out boundary', () => {
  for (const reason of ['session_expired', 'authentication_required', 'signed_out']) {
    assert.equal(shouldClearLocalSessionForLoginReason(reason), true)
  }
  for (const reason of [null, '', 'auth_unavailable', 'identity_unavailable']) {
    assert.equal(shouldClearLocalSessionForLoginReason(reason), false)
  }
})

test('sequential account switching clears each local session before the next login', async () => {
  let activeEmail: string | null = null
  const client: PasswordSessionClient = {
    auth: {
      async signInWithPassword(credentials) {
        activeEmail = credentials.email
        return {
          data: {
            session: { kind: 'test-session' },
            user: { id: `auth-${credentials.email}`, email: credentials.email },
          },
          error: null,
        }
      },
      async signOut(options) {
        assert.equal(options.scope, 'local')
        activeEmail = null
        return { error: null }
      },
    },
  }

  for (const email of [
    'admin@livestream.com',
    'leader@livestream.com',
    'host1@livestream.com',
  ]) {
    assert.equal(await establishPasswordSession(client, email, 'valid-password'), true)
    assert.equal(activeEmail, email)
    assert.equal(await clearLocalSession(client), true)
    assert.equal(activeEmail, null)
  }
})

test('anonymous, expired and failed user verification fail closed', async () => {
  assert.equal(await getVerifiedUser(async () => ({
    data: { user: null },
    error: null,
  })), null)
  assert.equal(await getVerifiedUser(async () => ({
    data: { user: { id: 'expired' } },
    error: new Error('expired'),
  })), null)
  assert.equal(await getVerifiedUser(async () => {
    throw new Error('auth unavailable')
  }), null)
})

function sessionFactory(
  result:
    | { data: { claims: { sub?: unknown } }; error: null }
    | { data: null; error: unknown | null },
  refreshedCookie?: string,
): SessionClientFactory {
  return (request, onResponse) => {
    if (refreshedCookie) {
      const response = NextResponse.next({ request })
      response.cookies.set('sb-session', refreshedCookie, { path: '/' })
      response.headers.set('Cache-Control', 'private, no-store')
      onResponse(response)
    }
    return {
      auth: {
        async getClaims() {
          return result
        },
      },
    }
  }
}

test('session refresh preserves cookie-backed identity for an authenticated dashboard', async () => {
  const update = createSessionUpdater(sessionFactory({
    data: { claims: { sub: 'supabase-user-1' } },
    error: null,
  }, 'refreshed-token'))
  const response = await update(new NextRequest('http://localhost/reports'))

  assert.equal(response.status, 200)
  assert.equal(response.cookies.get('sb-session')?.value, 'refreshed-token')
  assert.match(response.headers.get('cache-control') || '', /no-store/)
})

test('anonymous and expired dashboard sessions redirect to login', async () => {
  const anonymous = createSessionUpdater(sessionFactory({ data: null, error: null }))
  const expired = createSessionUpdater(sessionFactory({
    data: null,
    error: new Error('expired'),
  }))

  for (const update of [anonymous, expired]) {
    const response = await update(new NextRequest('http://localhost/reports?tab=draft'))
    assert.equal(response.status, 307)
    const location = new URL(response.headers.get('location') || '')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('reason'), 'session_expired')
    assert.equal(location.searchParams.get('next'), '/reports?tab=draft')
  }
})

test('login is a stable recovery boundary even when stale claims appear authenticated', async () => {
  let claimsChecks = 0
  const update = createSessionUpdater((request, onResponse) => {
    claimsChecks += 1
    return sessionFactory({
      data: { claims: { sub: 'stale-supabase-user' } },
      error: null,
    })(request, onResponse)
  })

  for (const path of [
    '/login',
    '/login?reason=session_expired',
    '/login?reason=authentication_required',
    '/login?reason=signed_out',
    '/login?reason=identity_unavailable',
  ]) {
    const response = await update(new NextRequest(`http://localhost${path}`))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('location'), null)
    assert.match(response.headers.get('cache-control') || '', /no-store/)
  }
  assert.equal(claimsChecks, 0)
})

test('authenticated users can view the fail-closed business identity error', async () => {
  const authenticated = createSessionUpdater(sessionFactory({
    data: { claims: { sub: 'supabase-user-without-business-link' } },
    error: null,
  }))

  const response = await authenticated(new NextRequest(
    'http://localhost/login?reason=identity_unavailable',
  ))
  assert.equal(response.status, 200)
})

test('auth proxy allows mock mode only through the resolved development boundary', async () => {
  let refreshCalls = 0
  const mockProxy = createAuthProxy({
    getMode: () => resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' }),
    hasSupabaseConfig: () => false,
    refreshSession: async request => {
      refreshCalls += 1
      return NextResponse.next({ request })
    },
  })
  assert.equal((await mockProxy(new NextRequest('http://localhost/reports'))).status, 200)
  assert.equal(refreshCalls, 0)

  const productionProxy = createAuthProxy({
    getMode: () => resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }),
    hasSupabaseConfig: () => false,
    refreshSession: async request => NextResponse.next({ request }),
  })
  const response = await productionProxy(new NextRequest('http://localhost/reports'))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location') || '').searchParams.get('reason'), 'auth_unavailable')
})

test('client-controlled roles cannot pass a server role guard', async () => {
  const request = new Request('http://localhost/api/admin', {
    method: 'POST',
    headers: { 'x-user-role': 'admin' },
    body: JSON.stringify({ role: 'admin', user_metadata: { system_permission: 'admin' } }),
  })

  await assert.rejects(
    requireRole(request, 'admin', async () => ({
      id: 'supabase-member',
      systemPermission: 'member',
    })),
    (error: unknown) => error instanceof AuthorizationError && error.status === 403,
  )
})

test('protected Vision route receives cookie-backed identity and logout returns it to 401', async () => {
  let active = true
  const handler = createVisionOcrPostHandler({
    config: { enabled: false },
    resolveUser: async request => {
      const hasCookie = request.headers.get('cookie') === 'sb-session=verified'
      return active && hasCookie
        ? { id: 'supabase-user-1', systemPermission: 'member' as const }
        : null
    },
  })
  const request = () => new Request('http://localhost/api/ocr/vision', {
    method: 'POST',
    headers: { cookie: 'sb-session=verified' },
  })

  const authenticated = await handler(request())
  assert.equal(authenticated.status, 503)
  assert.equal((await authenticated.json() as { error: { code: string } }).error.code, 'AI_PROVIDER_DISABLED')

  active = false
  const afterLogout = await handler(request())
  assert.equal(afterLogout.status, 401)
  assert.equal((await afterLogout.json() as { error: { code: string } }).error.code, 'AUTHENTICATION_REQUIRED')
})
