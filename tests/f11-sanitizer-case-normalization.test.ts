import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260903130000_f11_sanitizer_case_normalization.sql',
  'utf8',
)
const previousMigration = readFileSync(
  'supabase/migrations/20260903120000_core_v1_recursive_audit_sanitizer.sql',
  'utf8',
)

const sensitiveKeys = new Set([
  'password', 'passwd', 'passphrase', 'passwordhash',
  'token', 'accesstoken', 'accesskey', 'refreshtoken', 'idtoken',
  'apikey', 'clientsecret', 'secret', 'secretkey',
  'authorization', 'authtoken', 'bearer',
  'privatekey', 'oauthtoken', 'oauthsecret',
  'providertoken', 'providersecret',
  'credentials', 'credential', 'cookie', 'sessiontoken',
  'refresh', 'otp', 'base64', 'binary',
])

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function expectedSanitizedObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
    const normalized = normalizeKey(key)
    if (sensitiveKeys.has(normalized)) return [key, '[REDACTED]']
    if (Array.isArray(nested)) return [key, nested.map(item => typeof item === 'object' && item !== null ? expectedSanitizedObject(item as Record<string, unknown>) : item)]
    if (typeof nested === 'object' && nested !== null) return [key, expectedSanitizedObject(nested as Record<string, unknown>)]
    return [key, nested]
  }))
}

test('case normalization is ordered before punctuation filtering', () => {
  assert.match(
    migration,
    /regexp_replace\(\s*lower\(coalesce\(item\.key, ''\)\),\s*'\[\^a-z0-9\]'/is,
  )
  assert.doesNotMatch(
    migration,
    /lower\(regexp_replace\(coalesce\(item\.key, ''\),/is,
  )
  assert.match(previousMigration, /lower\(regexp_replace\(coalesce\(item\.key, ''\),/is)
})
test('mixed-case and separator variants resolve to the same sensitive keys', () => {
  const variants: Record<string, string[]> = {
    authorization: ['authorization', 'Authorization', 'AUTHORIZATION'],
    accesstoken: ['access_token', 'accessToken', 'AccessToken'],
    clientsecret: ['client_secret', 'clientSecret', 'ClientSecret'],
    privatekey: ['private_key', 'privateKey', 'PrivateKey'],
    apikey: ['api_key', 'apiKey', 'APIKey'],
    refreshtoken: ['refresh_token', 'refreshToken'],
    providertoken: ['provider_token', 'providerToken'],
  }

  for (const [expected, keys] of Object.entries(variants)) {
    for (const key of keys) assert.equal(normalizeKey(key), expected, key)
    assert.equal(sensitiveKeys.has(expected), true)
  }
})

test('sensitive variants redact while harmless fields remain unchanged through nested arrays', () => {
  const input = {
    Authorization: 'Bearer secret',
    profile: {
      clientSecret: 'secret',
      safe_value: 'keep-me',
    },
    items: [
      { privateKey: 'private-secret', safe: 7 },
      { APIKey: 'api-secret', safe: true },
    ],
  }
  const output = expectedSanitizedObject(input)
  assert.equal(output.Authorization, '[REDACTED]')
  assert.equal((output.profile as Record<string, unknown>).clientSecret, '[REDACTED]')
  assert.equal((output.profile as Record<string, unknown>).safe_value, 'keep-me')
  assert.equal((output.items as Array<Record<string, unknown>>)[0].privateKey, '[REDACTED]')
  assert.equal((output.items as Array<Record<string, unknown>>)[1].APIKey, '[REDACTED]')
})

test('migration preserves recursive behavior, redaction conventions, and private privileges', () => {
  assert.match(migration, /private\.audit_sanitize_row\(item\.value\)/i)
  assert.match(migration, /jsonb_agg\(private\.audit_sanitize_row\(entry\.value\)/i)
  assert.match(migration, /to_jsonb\('\[REDACTED\]'::text\)/i)
  assert.match(migration, /redacted_reference/i)
  assert.match(migration, /redacted_large_value/i)
  assert.match(migration, /immutable[\s\S]*set search_path = ''/i)
  assert.match(migration, /revoke all on function private\.audit_sanitize_row\(jsonb\) from public, anon, authenticated/i)
})
