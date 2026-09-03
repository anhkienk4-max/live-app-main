import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260903120000_core_v1_recursive_audit_sanitizer.sql',
  'utf8',
)
const auditMigration = readFileSync(
  'supabase/migrations/20260830113000_core_v1_persistent_audit.sql',
  'utf8',
)

test('F11 sanitizer keeps the existing private function contract and trigger boundary', () => {
  assert.match(migration, /create or replace function private\.audit_sanitize_row\(p_value jsonb\)/i)
  assert.match(migration, /language plpgsql[\s\S]*immutable[\s\S]*set search_path = ''/i)
  assert.match(migration, /revoke all on function private\.audit_sanitize_row\(jsonb\) from public, anon, authenticated/i)
  assert.match(migration, /private\.audit_sanitize_row\(item\.value\)/i)
})

test('F11 sanitizer recursively traverses objects, arrays, and scalar values', () => {
  assert.match(migration, /when 'object' then/i)
  assert.match(migration, /jsonb_each\(p_value\) as entry\(key, value\)/i)
  assert.match(migration, /when 'array' then/i)
  assert.match(migration, /jsonb_array_elements\(p_value\) with ordinality as entry\(value, ordinality\)/i)
  assert.match(migration, /when 'string' then/i)
  assert.match(migration, /else[\s\S]*return p_value;/i)
})

test('F11 sanitizer normalizes explicit sensitive key classes and redacts values', () => {
  for (const key of [
    'password', 'passwd', 'passphrase', 'token', 'accesstoken', 'refreshtoken',
    'idtoken', 'apikey', 'clientsecret', 'secret', 'secretkey', 'authorization',
    'authtoken', 'bearer', 'privatekey', 'oauthtoken', 'oauthsecret',
    'providertoken', 'providersecret', 'credentials', 'credential', 'cookie',
    'sessiontoken', 'otp', 'base64', 'binary',
  ]) {
    assert.match(migration, new RegExp(`'${key}'`))
  }
  assert.match(migration, /regexp_replace\(coalesce\(item\.key, ''\), '\[\^a-z0-9\]', '', 'g'\)/i)
  assert.match(migration, /to_jsonb\('\[REDACTED\]'::text\)/i)
})

test('F11 sanitizer preserves safe fields and existing URL/large-value redaction conventions', () => {
  assert.match(migration, /result := result \|\| jsonb_build_object\(item\.key, sanitized\)/i)
  assert.match(migration, /redacted_reference/i)
  assert.match(migration, /redacted_large_value/i)
  assert.match(migration, /length\(p_value #>> '\{\}'\) > 10000/i)
  assert.match(migration, /return p_value;/i)
})

test('F11 nested before/after snapshots continue through the database sanitizer', () => {
  assert.match(auditMigration, /before_row := private\.audit_sanitize_row\(/i)
  assert.match(auditMigration, /after_row := private\.audit_sanitize_row\(/i)
  assert.match(auditMigration, /before_data[\s\S]*after_data/i)
})

test('F11 sanitizer is deployed as a forward-only function replacement without audit table or trigger changes', () => {
  assert.doesNotMatch(migration, /create table|alter table|create trigger|drop trigger/i)
  assert.doesNotMatch(migration, /grant (execute|select|insert|update|delete).*authenticated/i)
})
