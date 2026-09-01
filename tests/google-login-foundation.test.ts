import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { googleOAuthCallbackUrl, resolveGoogleApplicationAccess, startGoogleOAuth } from '../lib/auth/googleOAuth.ts'
import { classifyGoogleOAuthError } from '../lib/auth/authError.ts'
import { GET as callbackGET, createGoogleCallbackGetHandler } from '../app/api/auth/callback/route.ts'
import type { AuthUserSource } from '../lib/auth/authIdentity.ts'
import type { GoogleCallbackClient, GoogleOAuthClient } from '../lib/auth/googleOAuth.ts'

const authUser = (
  permission: unknown = 'member',
  businessUserId: unknown = 'staff-1',
  overrides: Partial<AuthUserSource> = {},
): AuthUserSource => ({
  id: 'auth-1',
  email: 'person@example.test',
  app_metadata: {
    system_permission: permission,
    business_user_id: businessUserId,
  },
  user_metadata: {
    full_name: 'Google Profile',
    system_permission: 'admin',
    business_user_id: 'other-staff',
  },
  ...overrides,
})

const activeStaff = (overrides: Record<string, unknown> = {}) => ({
  id: 'staff-1',
  auth_user_id: 'auth-1',
  email: 'person@example.test',
  system_permission: 'member' as const,
  status: 'active' as const,
  account_status: 'active' as const,
  archived_at: null,
  deleted_at: null,
  ...overrides,
})

async function resolve(
  source: AuthUserSource | null | undefined,
  staff: Record<string, unknown> | null = activeStaff(),
) {
  return resolveGoogleApplicationAccess(source, async () => staff as never)
}

test('Google initiation uses provider google and the canonical callback', async () => {
  let request: unknown
  const client: GoogleOAuthClient = {
    auth: {
      async signInWithOAuth(options) {
        request = options
        return { data: { url: 'https://accounts.google.test/oauth' }, error: null }
      },
    },
  }

  const redirectTo = googleOAuthCallbackUrl('https://staging.example.test', '/reports?tab=draft')
  const url = await startGoogleOAuth(client, redirectTo)
  assert.equal(url, 'https://accounts.google.test/oauth')
  assert.deepEqual(request, {
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  })
})

test('Google callback URL remains an internal path and rejects external next values', () => {
  const callback = new URL(googleOAuthCallbackUrl('https://staging.example.test', 'https://attacker.test'))
  assert.equal(callback.origin, 'https://staging.example.test')
  assert.equal(callback.pathname, '/api/auth/callback')
  assert.equal(callback.searchParams.get('next'), '/')
})

test('linked active Admin is allowed', async () => {
  const result = await resolve(authUser('admin'), activeStaff({ system_permission: 'admin' }))
  assert.equal(result?.identity.system_permission, 'admin')
})

test('linked active Leader is allowed', async () => {
  const result = await resolve(authUser('leader'), activeStaff({ system_permission: 'leader' }))
  assert.equal(result?.identity.system_permission, 'leader')
})

test('linked active Member is allowed', async () => {
  const result = await resolve(authUser('member'))
  assert.equal(result?.identity.system_permission, 'member')
})

test('unknown Google Auth user is denied', async () => {
  assert.equal(await resolve(authUser(), null), null)
})

test('same-email Staff without the canonical link is denied', async () => {
  assert.equal(await resolve(authUser(), activeStaff({ auth_user_id: null })), null)
})

test('missing role is denied', async () => {
  assert.equal(await resolve({ ...authUser(), app_metadata: { business_user_id: 'staff-1' } }), null)
})

test('invalid role is denied', async () => {
  assert.equal(await resolve(authUser('owner')), null)
})

test('inactive Staff is denied', async () => {
  assert.equal(await resolve(authUser(), activeStaff({ status: 'inactive' })), null)
})

test('deleted or archived Staff is denied', async () => {
  assert.equal(await resolve(authUser(), activeStaff({ deleted_at: '2026-01-01' })), null)
  assert.equal(await resolve(authUser(), activeStaff({ archived_at: '2026-01-01' })), null)
})

test('deactivated account is denied', async () => {
  assert.equal(await resolve(authUser(), activeStaff({ account_status: 'pending_approval' })), null)
})

test('reactivated valid account is allowed', async () => {
  const result = await resolve(authUser(), activeStaff({ status: 'active', account_status: 'active' }))
  assert.ok(result)
})

test('role conflict is denied instead of trusting OAuth or stale metadata', async () => {
  assert.equal(await resolve(authUser('admin'), activeStaff({ system_permission: 'member' })), null)
})

test('Google profile metadata cannot elevate a canonical Member', async () => {
  const result = await resolve(authUser('member', 'staff-1', {
    user_metadata: { system_permission: 'admin', business_user_id: 'admin-staff' },
  }))
  assert.equal(result?.identity.system_permission, 'member')
  assert.equal(result?.staff.id, 'staff-1')
})

test('callback exchanges the code and redirects only after canonical authorization', async () => {
  let exchangedCode = ''
  let authorizedUser: AuthUserSource | null = null
  const client = {
    auth: {
      async exchangeCodeForSession(code: string) {
        exchangedCode = code
        return { data: { user: authUser('member') }, error: null }
      },
    },
  } as unknown as GoogleCallbackClient
  const handler = createGoogleCallbackGetHandler(
    async () => client,
    async (_client, user) => {
      authorizedUser = user
      return true
    },
  )

  const response = await handler(new Request(
    'https://staging.example.test/api/auth/callback?code=oauth-code&next=%2Freports',
  ))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location') || '').pathname, '/reports')
  assert.equal(exchangedCode, 'oauth-code')
  assert.equal(authorizedUser?.id, 'auth-1')
  assert.match(response.headers.get('cache-control') || '', /no-store/)
})

test('OAuth provider error fails safely without exposing provider details', async () => {
  let calls = 0
  const client = {
    auth: {
      async exchangeCodeForSession() {
        calls += 1
        return { data: { user: null }, error: new Error('provider secret') }
      },
    },
  } as unknown as GoogleCallbackClient
  const handler = createGoogleCallbackGetHandler(async () => client)
  const response = await handler(new Request(
    'https://staging.example.test/api/auth/callback?code=bad-code',
  ))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location') || '').pathname, '/auth/auth-code-error')
  assert.equal(response.headers.get('location')?.includes('provider secret'), false)
  assert.equal(calls, 1)
})

test('Before User Created Google denial gets a distinct callback error reason', async () => {
  const response = await callbackGET(new Request(
    'https://staging.example.test/api/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Google+account+creation+is+not+allowed.+Use+an+approved+invitation.',
  ))
  const location = new URL(response.headers.get('location') || '')
  assert.equal(location.pathname, '/auth/auth-code-error')
  assert.equal(location.searchParams.get('reason'), 'google_not_authorized')
  assert.equal(classifyGoogleOAuthError('provider failure'), 'oauth_error')
})

test('non-Google OAuth failures remain generic and cannot use the expired-link reason', async () => {
  const response = await callbackGET(new Request(
    'https://staging.example.test/api/auth/callback?error=server_error&error_description=provider+failure',
  ))
  const location = new URL(response.headers.get('location') || '')
  assert.equal(location.searchParams.get('reason'), 'oauth_error')
  assert.notEqual(location.searchParams.get('reason'), 'expired_link')
})

test('auth-code-error UI reserves expired copy for explicit recovery or invitation failures', async () => {
  const page = await readFile(new URL('../app/auth/auth-code-error/page.tsx', import.meta.url), 'utf8')
  const translations = await readFile(new URL('../lib/i18n.tsx', import.meta.url), 'utf8')
  assert.match(page, /reason === 'google_not_authorized'/)
  assert.match(page, /reason === 'expired_link'/)
  assert.match(translations, /googleAuthUnauthorized: 'This Google account is not authorized to access Livestream Operations\.'/)
  assert.match(translations, /authCodeErrorTitle: 'Authentication link expired'/)
})

test('missing callback code fails safely before client exchange', async () => {
  let calls = 0
  const handler = createGoogleCallbackGetHandler(async () => {
    calls += 1
    throw new Error('must not be called')
  })
  const response = await handler(new Request('https://staging.example.test/api/auth/callback?next=%2F'))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location') || '').pathname, '/auth/auth-code-error')
  assert.equal(calls, 0)
})

test('malicious external redirect is rejected before authorization', async () => {
  let calls = 0
  const client = {
    auth: {
      async exchangeCodeForSession() {
        calls += 1
        return { data: { user: authUser() }, error: null }
      },
    },
  } as unknown as GoogleCallbackClient
  const handler = createGoogleCallbackGetHandler(async () => client)
  const response = await handler(new Request(
    `https://staging.example.test/api/auth/callback?code=code&next=${encodeURIComponent('https://attacker.test')}`,
  ))
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location') || '').pathname, '/auth/auth-code-error')
  assert.equal(calls, 0)
})

test('OAuth initiation failure does not return a provider URL or token', async () => {
  const client: GoogleOAuthClient = {
    auth: {
      async signInWithOAuth() {
        return { data: { url: null }, error: new Error('oauth failure') }
      },
    },
  }
  assert.equal(await startGoogleOAuth(client, 'https://staging.example.test/api/auth/callback?next=%2F'), null)
})

test('email/password and recovery remain separate from Google initiation', async () => {
  const login = await readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8')
  const forgot = await readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8')
  const reset = await readFile(new URL('../app/reset-password/page.tsx', import.meta.url), 'utf8')
  assert.match(login, /establishPasswordSession/)
  assert.match(forgot, /resetPasswordForEmail/)
  assert.match(reset, /updateUser\(\{ password \}\)/)
})

test('Google login does not create Staff records or use Drive scopes', async () => {
  const login = await readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8')
  const callback = await readFile(new URL('../app/api/auth/callback/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(login, /business_users|create_staff|supabase\.auth\.signUp/)
  assert.doesNotMatch(callback, /drive\.readonly|drive\.file|insert\(['"]business_users|create_staff/)
})
