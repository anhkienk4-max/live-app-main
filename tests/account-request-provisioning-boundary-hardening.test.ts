import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../supabase/migrations/20260913125000_account_request_provisioning_boundary_hardening.sql', import.meta.url),
  'utf8',
)
const boundary = await readFile(
  new URL('../supabase/migrations/20260902160000_account_request_provisioning_boundary.sql', import.meta.url),
  'utf8',
)
const provisioningService = await readFile(
  new URL('../lib/server/accountRequestProvisioningService.ts', import.meta.url),
  'utf8',
)
const activeLifecycle = await readFile(
  new URL('../supabase/migrations/20260913130000_account_request_active_lifecycle.sql', import.meta.url),
  'utf8',
)

const internalFunctions = [
  'begin_account_request_provisioning(uuid, integer, boolean)',
  'complete_account_request_provisioning(uuid, integer, text)',
  'ensure_account_request_identity(uuid, integer, uuid, text)',
  'fail_account_request_provisioning(uuid, integer, text)',
]

const serverFunctions = [
  'server_begin_account_request_provisioning(uuid, integer, boolean, uuid)',
  'server_complete_account_request_provisioning(uuid, integer, text, uuid)',
  'server_ensure_account_request_identity(uuid, integer, uuid, text, uuid)',
  'server_fail_account_request_provisioning(uuid, integer, text, uuid)',
]

function escaped(value: string) {
  return value.replace(/[().]/g, '\\$&')
}

test('all internal provisioning transitions deny anon, authenticated, and service_role direct execution', () => {
  for (const signature of internalFunctions) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${escaped(signature)}\\s+from public, anon, authenticated, service_role`, 'i'),
    )
  }
})

test('only the server wrappers retain service_role execution', () => {
  for (const signature of serverFunctions) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${escaped(signature)}\\s+from public, anon, authenticated`, 'i'),
    )
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${escaped(signature)}\\s+to service_role`, 'i'),
    )
  }
})

test('the canonical server path remains wrapper-only and compatible with active lifecycle completion', () => {
  for (const name of ['server_begin_account_request_provisioning', 'server_ensure_account_request_identity', 'server_complete_account_request_provisioning', 'server_fail_account_request_provisioning']) {
    assert.match(provisioningService, new RegExp(`rpc<AccountRequest>\\('${name}'`))
  }
  assert.match(boundary, /security definer[\s\S]*private\.set_provisioning_actor/i)
  assert.match(activeLifecycle, /create or replace function public\.complete_account_request_provisioning/i)
})

test('boundary hardening changes ACLs only and does not fabricate confirmation or mutate lifecycle data', () => {
  assert.doesNotMatch(migration, /drop|truncate|delete|update|insert|alter table|email_verified|auth\.users|business_users/i)
})
