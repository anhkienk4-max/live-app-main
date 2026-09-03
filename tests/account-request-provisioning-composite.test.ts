import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const migrationUrl = new URL(
  '../supabase/migrations/20260903085439_fix_account_request_identity_composite_assignment.sql',
  import.meta.url,
)
const stagingRef = 'amagnzebmmuqiptmrjmc'
const productionRef = 'egdjnpmoasarrttvhgds'
const runStaging = process.env.ACCOUNT_REQUEST_COMPOSITE_RUN_STAGING === '1'
const requiredNames = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'ACCOUNT_REQUEST_COMPOSITE_ADMIN_EMAIL',
  'ACCOUNT_REQUEST_COMPOSITE_ADMIN_PASSWORD',
] as const
const missing = requiredNames.filter(name => !process.env[name]?.trim())
const skipReason = !runStaging
  ? 'Set ACCOUNT_REQUEST_COMPOSITE_RUN_STAGING=1 to opt into the staging database test.'
  : missing.length
    ? `Missing staging test variables: ${missing.join(', ')}`
    : undefined

type DbClient = SupabaseClient

function client(url: string, key: string): DbClient {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function assertStaging(url: string): void {
  assert.ok(url.includes(stagingRef), 'Composite regression must target staging.')
  assert.ok(!url.includes(productionRef), 'Composite regression must never target production.')
}

type AccountRequestRow = {
  id: string
  status: string
  version: number
  staff_id: string | null
  auth_user_id: string | null
  provisioning_status: string
}

async function rpc<T = unknown>(db: DbClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return data as T
}

test('composite assignment migration uses an expanded business_users row and FK invariant', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /select\s+created_staff\.\*\s+into\s+v_staff\s+from\s+public\.create_staff_member_with_auth/i)
  assert.match(sql, /v_staff\.id\s+is\s+null\s+or\s+not\s+exists/i)
  assert.match(sql, /created_user\.auth_user_id\s*=\s*p_auth_user_id/i)
  assert.match(sql, /ACCOUNT_PROVISIONING_FAILED/i)
  assert.doesNotMatch(sql, /select\s+public\.create_staff_member_with_auth\([\s\S]*\)\s+into\s+v_staff/i)
})

test('existing Auth identity provisions one linked member Staff row without FK failure', { skip: skipReason }, async () => {
  const url = process.env.SUPABASE_URL!.trim()
  const anonKey = process.env.SUPABASE_ANON_KEY!.trim()
  const secretKey = process.env.SUPABASE_SECRET_KEY!.trim()
  assertStaging(url)

  const adminEmail = process.env.ACCOUNT_REQUEST_COMPOSITE_ADMIN_EMAIL!.trim()
  const adminPassword = process.env.ACCOUNT_REQUEST_COMPOSITE_ADMIN_PASSWORD!
  const adminSession = client(url, anonKey)
  const signedIn = await adminSession.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
  assert.ifError(signedIn.error)
  assert.ok(signedIn.data.user?.id)
  const adminAuthUserId = signedIn.data.user!.id

  const service = client(url, secretKey)
  const prefix = `account-request-composite-${Date.now()}-${randomUUID().slice(0, 8)}`
  const email = `${prefix}@example.invalid`
  let authUserId: string | null = null
  let staffId: string | null = null
  let requestId: string | null = null

  try {
    const createdAuth = await service.auth.admin.createUser({ email, password: `${randomUUID()}Aa1!`, email_confirm: true })
    assert.ifError(createdAuth.error)
    assert.ok(createdAuth.data.user?.id)
    authUserId = createdAuth.data.user!.id

    const submittedResponse = await rpc<{ ok: boolean; message: string }>(client(url, anonKey), 'submit_account_request', {
      p_email: email,
      p_full_name: 'Composite Regression Fixture',
      p_phone: null,
      p_department: 'QA',
    })
    assert.equal(submittedResponse.ok, true)

    const { data: submitted, error: submitReadError } = await service
      .from('account_requests')
      .select('id,status,version,staff_id,auth_user_id,provisioning_status')
      .eq('email', email)
      .eq('status', 'pending')
      .single()
    assert.ifError(submitReadError)
    assert.ok(submitted)
    requestId = String(submitted.id)
    assert.equal(submitted.status, 'pending')

    const approved = await rpc(adminSession, 'approve_account_request', {
      p_request_id: requestId,
      p_expected_version: submitted.version,
    })
    const started = await rpc<AccountRequestRow>(service, 'server_begin_account_request_provisioning', {
      p_request_id: requestId,
      p_expected_version: approved.version,
      p_retry: false,
      p_actor_auth_user_id: adminAuthUserId,
    })
    const linked = await rpc<AccountRequestRow>(service, 'server_ensure_account_request_identity', {
      p_request_id: requestId,
      p_expected_version: started.version,
      p_auth_user_id: authUserId,
      p_staff_id: null,
      p_actor_auth_user_id: adminAuthUserId,
    })
    assert.ok(linked.staff_id)
    assert.equal(linked.auth_user_id, authUserId)
    staffId = String(linked.staff_id)

    const { data: staffRows, error: staffError } = await service
      .from('business_users')
      .select('id,auth_user_id,email,system_permission')
      .eq('id', staffId)
    assert.ifError(staffError)
    assert.equal(staffRows?.length, 1)
    assert.equal(staffRows?.[0].auth_user_id, authUserId)
    assert.equal(staffRows?.[0].system_permission, 'member')

    const completed = await rpc<AccountRequestRow>(service, 'server_complete_account_request_provisioning', {
      p_request_id: requestId,
      p_expected_version: linked.version,
      p_provisioning_status: 'linked',
      p_actor_auth_user_id: adminAuthUserId,
    })
    assert.equal(completed.provisioning_status, 'linked')

    const users = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
    assert.ifError(users.error)
    assert.equal(users.data.users.filter(user => user.email?.toLowerCase() === email).length, 1)
  } finally {
    if (requestId) {
      await service.from('notifications').delete().eq('related_entity_type', 'account_requests').eq('related_entity_id', requestId)
      await service.from('audit_logs').delete().eq('entity_type', 'account_requests').eq('entity_id', requestId)
      await service.from('account_requests').delete().eq('id', requestId)
    }
    if (staffId) await service.from('business_users').delete().eq('id', staffId)
    if (authUserId) await service.auth.admin.deleteUser(authUserId)
  }
})
