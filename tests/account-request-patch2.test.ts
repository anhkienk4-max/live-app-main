import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import type { AccountRequestProvisioningService } from '@/lib/server/accountRequestProvisioningService'
import type { AccountRequest } from '@/lib/types/accountRequest.types'
import { createAccountRequestProvisioningPostHandler as createPostHandler } from '@/lib/server/accountRequestProvisioningRouteHandler'

const boundaryMigration = await readFile(
  new URL('../supabase/migrations/20260902160000_account_request_provisioning_boundary.sql', import.meta.url),
  'utf8',
)
const phase3Migration = await readFile(
  new URL('../supabase/migrations/20260902140000_account_request_provisioning.sql', import.meta.url),
  'utf8',
)
const phase2Migration = await readFile(
  new URL('../supabase/migrations/20260902110000_account_request_review.sql', import.meta.url),
  'utf8',
)
const auditMigration = await readFile(
  new URL('../supabase/migrations/20260831130000_core_v1_audit_update_before_state.sql', import.meta.url),
  'utf8',
)
const persistentAuditMigration = await readFile(
  new URL('../supabase/migrations/20260830113000_core_v1_persistent_audit.sql', import.meta.url),
  'utf8',
)
const serviceSource = await readFile(
  new URL('../lib/server/accountRequestProvisioningService.ts', import.meta.url),
  'utf8',
)

const internalRpcSignatures = [
  'begin_account_request_provisioning(uuid, integer, boolean)',
  'ensure_account_request_identity(uuid, integer, uuid, text)',
  'complete_account_request_provisioning(uuid, integer, text)',
  'fail_account_request_provisioning(uuid, integer, text)',
]

const serverRpcSignatures = [
  'server_begin_account_request_provisioning(uuid, integer, boolean, uuid)',
  'server_ensure_account_request_identity(uuid, integer, uuid, text, uuid)',
  'server_complete_account_request_provisioning(uuid, integer, text, uuid)',
  'server_fail_account_request_provisioning(uuid, integer, text, uuid)',
]

function compact(value: string) {
  return value.replace(/\s+/g, ' ')
}

function requestFixture(): AccountRequest {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    version: 1,
    email: 'person@example.com',
    full_name: 'Example Person',
    phone: null,
    department: null,
    status: 'approved',
    provisioning_status: 'not_started',
    staff_id: null,
    auth_user_id: null,
    submitted_at: '2026-09-02T00:00:00.000Z',
    reviewed_at: '2026-09-02T00:01:00.000Z',
    reviewed_by: 'admin-business-id',
    rejection_reason: null,
    provisioning_error_code: null,
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:01:00.000Z',
  }
}

test('historical Phase-3 RPCs are no longer executable by browser roles', () => {
  const sql = compact(boundaryMigration)
  for (const signature of internalRpcSignatures) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, '\\$&')} from public, anon, authenticated, service_role`))
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, '\\$&')} to (public|anon|authenticated|service_role)`))
  }
})

test('only service-role wrappers can invoke the internal state machine', () => {
  const sql = compact(boundaryMigration)
  for (const signature of serverRpcSignatures) {
    const name = signature.slice(0, signature.indexOf('('))
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`))
    assert.match(sql, new RegExp(`public\\.${name}\\([^)]+\\) returns public\\.account_requests language plpgsql security definer set search_path = ''`))
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(${signature.slice(signature.indexOf('(') + 1, -1)}\\) from public, anon, authenticated, service_role`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(${signature.slice(signature.indexOf('(') + 1, -1)}\\) to service_role`))
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (public|anon|authenticated)`))
  }
  assert.match(sql, /private\.set_provisioning_actor\(p_actor_auth_user_id\)/g)
  assert.match(sql, /pg_catalog\.set_config\( 'request\.jwt\.claim\.sub', p_actor_auth_user_id::text, true \)/)
})

test('database validates the actor through the canonical Admin guard before state mutation', () => {
  const sql = compact(boundaryMigration)
  assert.match(sql, /create or replace function private\.require_staff_admin_for_auth_user\( p_actor_auth_user_id uuid \)/)
  assert.match(sql, /perform pg_catalog\.set_config\( 'request\.jwt\.claim\.sub', p_actor_auth_user_id::text, true \); v_actor_id := private\.require_staff_admin\(\)/)
  assert.match(phase3Migration, /private\.require_staff_admin\(\)/)
  assert.doesNotMatch(boundaryMigration, /p_actor_auth_user_id.*from auth\.users|p_actor_auth_user_id.*system_permission/i)
})

test('canonical HTTP path derives actor and rejects privileged identity/status fields', async () => {
  let captured: Parameters<AccountRequestProvisioningService['provision']>[0] | undefined
  const service: AccountRequestProvisioningService = {
    async provision(input) {
      captured = input
      return requestFixture()
    },
  }
  const resolveUser = async () => ({ id: 'real-admin-auth', systemPermission: 'admin' as const })
  const handler = createPostHandler({ resolveUser, service })
  const valid = new Request('https://example.com/api/account-requests/11111111-1111-4111-8111-111111111111/provision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: 1, retry: false }),
  })
  assert.equal((await handler(valid, requestFixture().id)).status, 200)
  assert.equal(captured?.actorAuthUserId, 'real-admin-auth')
  assert.equal(captured?.redirectTo, 'https://example.com/auth/confirm?next=/reset-password')

  for (const field of ['auth_user_id', 'staff_id', 'actor', 'provisioning_status', 'provisioning_error_code', 'system_permission', 'role']) {
    const forged = new Request('https://example.com/api/account-requests/11111111-1111-4111-8111-111111111111/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_version: 1, [field]: 'forged' }),
    })
    assert.equal((await handler(forged, requestFixture().id)).status, 400, field)
  }
})

test('server provisioning uses the server-only privileged DB client and wrappers', () => {
  assert.match(serviceSource, /createSupabaseAdminClient/)
  for (const name of ['server_begin_account_request_provisioning', 'server_ensure_account_request_identity', 'server_complete_account_request_provisioning', 'server_fail_account_request_provisioning']) {
    assert.match(serviceSource, new RegExp(`rpc<AccountRequest>\\('${name}'`))
  }
  assert.match(serviceSource, /p_actor_auth_user_id: input\.actorAuthUserId/)
  assert.doesNotMatch(serviceSource, /rpc<AccountRequest>\('(begin|ensure_account_request_identity|complete_account_request_provisioning|fail_account_request_provisioning)'/)
})

test('state machine and lifecycle remain in the historical migration', () => {
  assert.match(phase3Migration, /approved[\s\S]*not_started[\s\S]*in_progress[\s\S]*invited[\s\S]*linked/i)
  assert.match(phase3Migration, /set provisioning_status = 'in_progress'/i)
  assert.match(phase3Migration, /set provisioning_status = 'failed'/i)
  assert.match(phase3Migration, /retry=true|p_retry/i)
  assert.match(phase3Migration, /public\.create_staff_member_with_auth/i)
  assert.doesNotMatch(boundaryMigration, /update public\.account_requests|insert into public\.business_users|auth\.admin/i)
})

test('Staff/Auth linkage uses the persistent business_users audit trigger', () => {
  assert.match(auditMigration, /before_row := private\.audit_sanitize_row\(case when tg_op <> 'INSERT' then to_jsonb\(old\) else null end\)/i)
  assert.match(auditMigration, /after_row := private\.audit_sanitize_row\(case when tg_op <> 'DELETE' then to_jsonb\(new\) else null end\)/i)
  assert.match(auditMigration, /actor_auth_id := auth\.uid\(\)/i)
  assert.match(auditMigration, /actor_business_id := private\.current_business_user_id\(\)/i)
  assert.match(persistentAuditMigration, /create trigger audit_business_users_change[\s\S]*after insert or update or delete on public\.business_users/i)
  assert.match(auditMigration, /private\.audit_sanitize_row/)
  assert.doesNotMatch(auditMigration, /insert into public\.audit_logs[\s\S]*raw_app_meta_data/i)

  const before = { id: 'staff-1', auth_user_id: null }
  const after = { id: 'staff-1', auth_user_id: 'auth-1' }
  assert.equal(before.id, after.id)
  assert.equal(before.auth_user_id, null)
  assert.equal(after.auth_user_id, 'auth-1')
})

test('account request audit mapping is staff/account_requests and preserves actor-safe reason fields', () => {
  assert.match(phase2Migration, /when 'account_requests' then 'staff'/i)
  assert.match(phase2Migration, /case when tg_table_name = 'account_requests' then 'account_requests'/i)
  assert.match(phase2Migration, /coalesce\(after_row->>'deletion_reason', after_row->>'rejection_reason', after_row->>'review_notes'\)/i)
  assert.match(phase2Migration, /reviewed_by = v_actor_id/i)
  assert.match(phase2Migration, /status = 'approved'/i)
  assert.match(phase2Migration, /status = 'rejected'/i)
})

test('repeated idempotent provisioning has no fabricated linkage mutation', () => {
  const sql = compact(phase3Migration)
  assert.match(sql, /if v_request\.provisioning_status in \('invited', 'linked'\) then return v_request/)
  assert.match(sql, /elsif v_staff\.auth_user_id is null then update public\.business_users set auth_user_id = p_auth_user_id/)
  assert.match(sql, /where id = v_staff\.id and auth_user_id is null|where id = v_staff\.id/) // linkage is conditional in the state machine
})
