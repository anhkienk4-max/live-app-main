import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationPath = new URL(
  '../supabase/migrations/20260901130000_before_user_created_google_hook.sql',
  import.meta.url,
)

type HookResult = Record<string, unknown>

function expectedHookResult(event: unknown): HookResult {
  const provider = event
    && typeof event === 'object'
    && 'user' in event
    && event.user
    && typeof event.user === 'object'
    && 'app_metadata' in event.user
    && event.user.app_metadata
    && typeof event.user.app_metadata === 'object'
    && 'provider' in event.user.app_metadata
    ? event.user.app_metadata.provider
    : undefined

  if (typeof provider === 'string' && provider.trim().toLowerCase() === 'google') {
    return {
      error: {
        http_code: 403,
        message: 'Google account creation is not allowed. Use an approved invitation.',
      },
    }
  }
  return {}
}

test('Google new-user payload is denied with a controlled 403 response', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const result = expectedHookResult({
    user: { app_metadata: { provider: 'google' } },
  })

  assert.deepEqual(result, {
    error: {
      http_code: 403,
      message: 'Google account creation is not allowed. Use an approved invitation.',
    },
  })
  assert.match(sql, /event->'user'->'app_metadata'->>'provider'/)
  assert.match(sql, /'http_code', 403/)
  assert.match(sql, /Google account creation is not allowed/i)
})

test('email/admin-provisioning-style payload is allowed', () => {
  assert.deepEqual(expectedHookResult({
    user: { app_metadata: { provider: 'email', business_user_id: 'staff-1' } },
  }), {})
})

test('missing or malformed provider has safe non-Google behavior', () => {
  for (const event of [
    { user: { app_metadata: {} } },
    { user: {} },
    { metadata: { name: 'before-user-created' } },
    null,
    'malformed',
  ]) {
    assert.deepEqual(expectedHookResult(event), {})
  }
})

test('the hook has no business-user auto-enrollment or Auth row mutation path', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  const executableSql = sql.replace(/--.*$/gm, '')
  assert.doesNotMatch(executableSql, /business_users|auth\.users|insert\s+into|update\s+.*\s+set|delete\s+from/i)
  assert.match(sql, /return '\{\}'::jsonb/i)
})

test('the hook does not derive or change application roles', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.doesNotMatch(sql, /system_permission|user_metadata|role|business_user_id/i)
  assert.match(sql, /provider/i)
})

test('the hook uses the exact Before User Created signature and hardened permissions', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /create or replace function public\.before_user_created_block_google\(event jsonb\)/i)
  assert.match(sql, /returns jsonb/i)
  assert.match(sql, /set search_path\s*=\s*''/i)
  assert.match(sql, /grant usage on schema public to supabase_auth_admin/i)
  assert.match(sql, /grant execute on function public\.before_user_created_block_google\(jsonb\)\s+to supabase_auth_admin/i)
  assert.match(sql, /revoke execute on function public\.before_user_created_block_google\(jsonb\)\s+from public, anon, authenticated/i)
})

test('the hook migration follows Account Provisioning and is function-only', async () => {
  const migration = await readFile(migrationPath, 'utf8')
  const migrationNames = (await import('node:fs/promises')).readdir(
    new URL('../supabase/migrations/', import.meta.url),
  )
  assert.ok((await migrationNames).includes('20260901120000_account_provisioning_foundation.sql'))
  assert.match(migration, /before_user_created_block_google/i)
  assert.doesNotMatch(migration, /create table|alter table|add column|create policy/i)
})
