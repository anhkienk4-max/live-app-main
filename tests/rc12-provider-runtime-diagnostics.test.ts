import assert from 'node:assert/strict'
import test from 'node:test'

import { createFileProviderRegistry } from '@/lib/server/fileProviderRegistry'
import { createFileProviderDiagnosticsGetHandler } from '@/lib/server/fileProviderDiagnosticsRouteHandler'

const configuredEnv = {
  NODE_ENV: 'production',
  FILE_STORAGE_ENABLED: 'true',
  FILE_PROVIDER: 'google_drive',
  GOOGLE_DRIVE_AUTH_MODE: 'oauth_refresh_token',
  GOOGLE_DRIVE_ROOT_FOLDER_ID: 'google-root-secret',
  GOOGLE_DRIVE_CLIENT_ID: 'google-client-secret',
  GOOGLE_DRIVE_CLIENT_SECRET: 'google-client-secret-value',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'google-refresh-secret',
  ONEDRIVE_CLIENT_ID: 'microsoft-client-secret',
  ONEDRIVE_CLIENT_SECRET: 'microsoft-client-secret-value',
  ONEDRIVE_REFRESH_TOKEN: 'microsoft-refresh-secret',
  ONEDRIVE_TENANT_ID: 'tenant-secret',
}

const admin = { id: 'admin-auth', systemPermission: 'admin' as const }
const leader = { id: 'leader-auth', systemPermission: 'leader' as const, businessUserId: 'business-2' }

function request() {
  return new Request('https://preview.example.test/api/internal/file-provider-diagnostics')
}

function handlerFor(
  env: Record<string, string | undefined> = configuredEnv,
  resolveUser: Parameters<typeof createFileProviderDiagnosticsGetHandler>[0]['resolveUser'] = async () => admin,
) {
  return createFileProviderDiagnosticsGetHandler({ env, resolveUser })
}

test('diagnostics require authentication and admin permission', async () => {
  const unauthenticated = await handlerFor(configuredEnv, async () => null)(request())
  assert.equal(unauthenticated.status, 401)
  assert.deepEqual(await unauthenticated.json(), {
    supabase_url_present: false,
    supabase_anon_key_present: false,
    auth_cookie_present: false,
    authenticated_user_resolved: false,
    business_user_mapped: false,
  })

  const unauthorized = await handlerFor(configuredEnv, async () => leader)(request())
  assert.equal(unauthorized.status, 403)
  assert.deepEqual(await unauthorized.json(), {
    supabase_url_present: false,
    supabase_anon_key_present: false,
    auth_cookie_present: false,
    authenticated_user_resolved: true,
    business_user_mapped: true,
  })
  assert.equal((await handlerFor()(request())).status, 200)
})

test('diagnostics expose only safe provider presence booleans and no-store responses', async () => {
  const response = await handlerFor()(request())
  const body = await response.json() as Record<string, unknown>
  const serialized = JSON.stringify(body)

  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  for (const secret of [
    configuredEnv.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    configuredEnv.GOOGLE_DRIVE_CLIENT_ID,
    configuredEnv.GOOGLE_DRIVE_CLIENT_SECRET,
    configuredEnv.GOOGLE_DRIVE_REFRESH_TOKEN,
    configuredEnv.ONEDRIVE_CLIENT_ID,
    configuredEnv.ONEDRIVE_CLIENT_SECRET,
    configuredEnv.ONEDRIVE_REFRESH_TOKEN,
    configuredEnv.ONEDRIVE_TENANT_ID,
  ]) {
    assert.equal(serialized.includes(secret), false)
  }
  assert.deepEqual(body.google_drive, {
    auth_mode: 'oauth_refresh_token',
    root_folder_id_present: true,
    client_id_present: true,
    client_secret_present: true,
    refresh_token_present: true,
    service_account_email_present: false,
    private_key_present: false,
    configured: true,
  })
  assert.deepEqual(body.onedrive, {
    client_id_present: true,
    client_secret_present: true,
    refresh_token_present: true,
    tenant_id_present: true,
    configured: true,
  })
})

test('auth diagnostics expose only booleans and never cookie or Supabase values', async () => {
  const env = {
    ...configuredEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://staging-secret.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-secret',
  }
  const cookie = 'sb-secret-auth-token=refresh-token-secret'
  const response = await handlerFor(env, async () => null)(new Request(request(), {
    headers: { cookie },
  }))
  const body = await response.json() as Record<string, unknown>
  const serialized = JSON.stringify(body)

  assert.equal(response.status, 401)
  assert.deepEqual(body, {
    supabase_url_present: true,
    supabase_anon_key_present: true,
    auth_cookie_present: true,
    authenticated_user_resolved: false,
    business_user_mapped: false,
  })
  assert.equal(serialized.includes(env.NEXT_PUBLIC_SUPABASE_URL), false)
  assert.equal(serialized.includes(env.NEXT_PUBLIC_SUPABASE_ANON_KEY), false)
  assert.equal(serialized.includes(cookie), false)
  assert.equal(serialized.includes('refresh-token-secret'), false)
})

test('missing Google input reports its boolean as false and configured as false', async () => {
  const env = { ...configuredEnv, GOOGLE_DRIVE_REFRESH_TOKEN: undefined }
  const body = await (await handlerFor(env)(request())).json() as { google_drive: Record<string, unknown> }
  assert.equal(body.google_drive.refresh_token_present, false)
  assert.equal(body.google_drive.configured, false)
})

test('registry diagnostics match the existing provider registry availability', async () => {
  const body = await (await handlerFor()(request())).json() as {
    registry: { default_provider: string; google_drive_available: boolean; onedrive_available: boolean }
  }
  const registry = createFileProviderRegistry({ env: configuredEnv })
  const availability = registry.getAvailability()
  assert.equal(body.registry.default_provider, registry.defaultProviderName)
  assert.equal(body.registry.google_drive_available, availability.google_drive)
  assert.equal(body.registry.onedrive_available, availability.onedrive)
})
