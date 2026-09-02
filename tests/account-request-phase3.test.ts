import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import type { User } from '@/lib/types/database.types'
import type { AccountRequest } from '@/lib/types/accountRequest.types'
import {
  AccountRequestProvisioningError,
  createAccountRequestProvisioningService,
  type ProvisioningAuthGateway,
  type ProvisioningAuthUser,
  type ProvisioningStaffGateway,
} from '@/lib/server/accountRequestProvisioningService'
import { createAccountRequestProvisioningPostHandler } from '@/lib/server/accountRequestProvisioningRouteHandler'

const migration = await readFile(
  new URL('../supabase/migrations/20260902140000_account_request_provisioning.sql', import.meta.url),
  'utf8',
)
const boundaryMigration = await readFile(
  new URL('../supabase/migrations/20260902160000_account_request_provisioning_boundary.sql', import.meta.url),
  'utf8',
)
const phase1Migration = await readFile(
  new URL('../supabase/migrations/20260901190744_account_requests_foundation.sql', import.meta.url),
  'utf8',
)
const phase2Migration = await readFile(
  new URL('../supabase/migrations/20260902110000_account_request_review.sql', import.meta.url),
  'utf8',
)
const lifecycleMigration = await readFile(
  new URL('../supabase/migrations/20260827094704_core_account_lifecycle.sql', import.meta.url),
  'utf8',
)
const auditMigration = await readFile(
  new URL('../supabase/migrations/20260830113000_core_v1_persistent_audit.sql', import.meta.url),
  'utf8',
)

const requestId = '11111111-1111-4111-8111-111111111111'

function requestFixture(overrides: Partial<AccountRequest> = {}): AccountRequest {
  return {
    id: requestId,
    version: 0,
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
    ...overrides,
  }
}

function staffFixture(overrides: Partial<User> = {}): User {
  return {
    id: 'staff-1',
    auth_user_id: null,
    email: 'person@example.com',
    full_name: 'Example Person',
    phone: null,
    department: null,
    role: 'staff',
    system_permission: 'member',
    operational_roles: [],
    status: 'active',
    account_status: 'active',
    archived_at: null,
    deleted_at: null,
    ...overrides,
  } as User
}

function authFixture(overrides: Partial<ProvisioningAuthUser> = {}): ProvisioningAuthUser {
  return {
    id: 'auth-1',
    email: 'person@example.com',
    appMetadata: {},
    hasGoogleIdentity: false,
    ...overrides,
  }
}

class FakeProvisioningStaff implements ProvisioningStaffGateway {
  request: AccountRequest
  users: User[]
  ensureCalls = 0
  completeCalls = 0
  failCalls = 0
  stateHistory: string[] = []

  constructor(request = requestFixture(), users: User[] = []) {
    this.request = request
    this.users = users
  }

  async findByEmail(email: string) {
    return this.users.filter(user => user.email.trim().toLowerCase() === email)
  }

  async getById(staffId: string) {
    return this.users.find(user => user.id === staffId) ?? null
  }

  async begin(input: { requestId: string; expectedVersion: number; retry: boolean; actorAuthUserId?: string }) {
    this.assertRequest(input.requestId)
    if (this.request.status !== 'approved') throw new AccountRequestProvisioningError('ACCOUNT_REQUEST_NOT_APPROVED')
    if (this.request.provisioning_status === 'invited' || this.request.provisioning_status === 'linked') return this.request
    if (this.request.provisioning_status === 'in_progress') throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_IN_PROGRESS')
    if (this.request.version !== input.expectedVersion) throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_STALE')
    if (this.request.provisioning_status === 'failed' && !input.retry) throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_RETRY_REQUIRED')
    if (input.retry && this.request.provisioning_status !== 'failed') throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_RETRY_INVALID')
    if (!['not_started', 'failed'].includes(this.request.provisioning_status)) throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_STATE_INVALID')
    this.request = { ...this.request, provisioning_status: 'in_progress', provisioning_error_code: null, version: this.request.version + 1 }
    this.stateHistory.push('in_progress')
    return this.request
  }

  async ensureIdentity(input: { requestId: string; expectedVersion: number; authUserId: string; staffId: string | null; actorAuthUserId?: string }) {
    this.assertRequest(input.requestId)
    if (this.request.version !== input.expectedVersion) throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_STALE')
    this.ensureCalls += 1
    let staff = input.staffId ? await this.getById(input.staffId) : (await this.findByEmail(this.request.email.trim().toLowerCase()))[0] ?? null
    if (staff && staff.auth_user_id && staff.auth_user_id !== input.authUserId) throw new AccountRequestProvisioningError('ACCOUNT_STAFF_ALREADY_LINKED')
    if (!staff) {
      staff = staffFixture({ id: `staff-${this.users.length + 1}`, auth_user_id: input.authUserId, email: this.request.email })
      this.users.push(staff)
    } else if (!staff.auth_user_id) {
      staff = { ...staff, auth_user_id: input.authUserId }
      this.users = this.users.map(user => user.id === staff!.id ? staff! : user)
    }
    this.request = { ...this.request, staff_id: staff.id, auth_user_id: input.authUserId, version: this.request.version + 1 }
    return this.request
  }

  async complete(input: { requestId: string; expectedVersion: number; provisioningStatus: 'invited' | 'linked'; actorAuthUserId?: string }) {
    this.assertRequest(input.requestId)
    if (this.request.version !== input.expectedVersion) throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_STALE')
    this.completeCalls += 1
    this.request = { ...this.request, provisioning_status: input.provisioningStatus, version: this.request.version + 1 }
    this.stateHistory.push(input.provisioningStatus)
    return this.request
  }

  async fail(input: { requestId: string; expectedVersion: number; errorCode: string; actorAuthUserId?: string }) {
    this.assertRequest(input.requestId)
    if (this.request.version !== input.expectedVersion) throw new AccountRequestProvisioningError('ACCOUNT_PROVISIONING_STALE')
    this.failCalls += 1
    this.request = { ...this.request, provisioning_status: 'failed', provisioning_error_code: input.errorCode, version: this.request.version + 1 }
    this.stateHistory.push('failed')
    return this.request
  }

  private assertRequest(id: string) {
    if (id !== this.request.id) throw new AccountRequestProvisioningError('ACCOUNT_REQUEST_NOT_FOUND')
  }
}

class FakeAuth implements ProvisioningAuthGateway {
  users: ProvisioningAuthUser[]
  invites = 0
  metadataUpdates = 0
  deleted: string[] = []
  failMetadata = false

  constructor(users: ProvisioningAuthUser[] = []) { this.users = users }

  async findUsersByEmail(email: string) {
    return this.users.filter(user => user.email?.trim().toLowerCase() === email)
  }

  async getUserById(id: string) { return this.users.find(user => user.id === id) ?? null }

  async inviteUserByEmail(email: string) {
    this.invites += 1
    const user = authFixture({ id: `auth-${this.invites}`, email })
    this.users.push(user)
    return user
  }

  async updateAppMetadata(id: string, metadata: Record<string, unknown>) {
    this.metadataUpdates += 1
    if (this.failMetadata) throw new AccountRequestProvisioningError('ACCOUNT_METADATA_SYNC_FAILED')
    this.users = this.users.map(user => user.id === id ? { ...user, appMetadata: metadata } : user)
  }

  async deleteUser(id: string) {
    this.deleted.push(id)
    this.users = this.users.filter(user => user.id !== id)
  }
}

function serviceFor(staff: FakeProvisioningStaff, auth: FakeAuth) {
  return createAccountRequestProvisioningService({ staff, auth })
}

async function provision(staff: FakeProvisioningStaff, auth: FakeAuth, input: Partial<Parameters<ReturnType<typeof serviceFor>['provision']>[0]> = {}) {
  return serviceFor(staff, auth).provision({
    requestId,
    expectedVersion: 0,
    retry: false,
    redirectTo: 'https://example.com/auth/confirm',
    actorAuthUserId: 'admin-auth',
    ...input,
  })
}

test('migration exposes Admin-only server-side provisioning RPCs with hardened permissions', () => {
  const boundarySql = boundaryMigration.replace(/\s+/g, ' ')
  for (const name of ['begin_account_request_provisioning', 'ensure_account_request_identity', 'complete_account_request_provisioning', 'fail_account_request_provisioning']) {
    const body = migration.slice(migration.indexOf(`create or replace function public.${name}`))
    assert.match(body, /language plpgsql[\s\S]*security definer[\s\S]*set search_path = ''/i)
    assert.match(body, /private\.require_staff_admin\(\)/i)
    assert.match(boundarySql, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role`, 'i'))
    assert.doesNotMatch(boundarySql, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (public|anon|authenticated|service_role)`, 'i'))
  }
  assert.doesNotMatch(boundarySql, /grant execute on function public\.[^(]+\([^)]*\) to (public|anon|authenticated)/i)
})

test('provision endpoint is Admin-only and rejects browser-controlled identity fields', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth()
  const service = serviceFor(staff, auth)
  const role = (value: string | null) => async () => value
    ? { id: `${value}-auth`, systemPermission: value as 'admin' | 'leader' | 'member' }
    : null

  for (const [value, expected] of [['admin', 200], ['leader', 403], ['member', 403], [null, 401]] as const) {
    const handler = createAccountRequestProvisioningPostHandler({ resolveUser: role(value), service })
    const request = new Request(`https://example.com/api/account-requests/${requestId}/provision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expected_version: 0 }),
    })
    assert.equal((await handler(request, requestId)).status, expected)
  }

  const handler = createAccountRequestProvisioningPostHandler({ resolveUser: role('admin'), service })
  const forged = new Request(`https://example.com/api/account-requests/${requestId}/provision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: 0, staff_id: 'forged', auth_user_id: 'forged', provisioned_by: 'forged', provisioning_status: 'linked' }),
  })
  assert.equal((await handler(forged, requestId)).status, 400)
})

test('new identity is invited once, defaults to member, and reaches invited', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth()
  const result = await provision(staff, auth)
  assert.equal(result.provisioning_status, 'invited')
  assert.equal(auth.invites, 1)
  assert.equal(staff.users.length, 1)
  assert.equal(auth.users[0].appMetadata?.system_permission, 'member')
  assert.equal(auth.users[0].appMetadata?.business_user_id, result.staff_id)
  assert.deepEqual(staff.stateHistory, ['in_progress', 'invited'])
})

test('Staff-only identity is reused without duplicate Staff', async () => {
  const staff = new FakeProvisioningStaff(requestFixture(), [staffFixture()])
  const auth = new FakeAuth()
  const result = await provision(staff, auth)
  assert.equal(result.provisioning_status, 'invited')
  assert.equal(auth.invites, 1)
  assert.equal(staff.users.length, 1)
  assert.equal(staff.users[0].auth_user_id, result.auth_user_id)
})

test('Auth-only identity is linked and does not receive a duplicate Auth user', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth([authFixture()])
  const result = await provision(staff, auth)
  assert.equal(result.provisioning_status, 'linked')
  assert.equal(auth.invites, 0)
  assert.equal(staff.users.length, 1)
  assert.equal(result.auth_user_id, 'auth-1')
})

test('already linked identity is idempotent and does not invite or duplicate Staff', async () => {
  const staff = new FakeProvisioningStaff(requestFixture({ staff_id: 'staff-1', auth_user_id: 'auth-1' }), [staffFixture({ auth_user_id: 'auth-1' })])
  const auth = new FakeAuth([authFixture()])
  const result = await provision(staff, auth)
  assert.equal(result.provisioning_status, 'linked')
  assert.equal(auth.invites, 0)
  assert.equal(staff.users.length, 1)
})

test('ambiguous identity fails closed and records only a safe code', async () => {
  const staff = new FakeProvisioningStaff(requestFixture({ email: 'duplicate@example.com' }), [
    staffFixture({ id: 'staff-a', email: 'duplicate@example.com' }),
    staffFixture({ id: 'staff-b', email: 'DUPLICATE@example.com' }),
  ])
  const auth = new FakeAuth()
  await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_EMAIL_AMBIGUOUS')
  assert.equal(auth.invites, 0)
  assert.equal(staff.request.provisioning_status, 'failed')
  assert.equal(staff.request.provisioning_error_code, 'ACCOUNT_EMAIL_AMBIGUOUS')
})

test('ambiguous Auth identity fails closed without Staff or invite side effects', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth([
    authFixture({ id: 'auth-a', email: 'person@example.com' }),
    authFixture({ id: 'auth-b', email: 'PERSON@example.com' }),
  ])
  await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_EMAIL_AMBIGUOUS')
  assert.equal(auth.invites, 0)
  assert.equal(staff.users.length, 0)
  assert.equal(staff.request.provisioning_error_code, 'ACCOUNT_EMAIL_AMBIGUOUS')
})

test('conflicting Staff/Auth identities fail closed without overwriting either identity', async () => {
  const staff = new FakeProvisioningStaff(
    requestFixture({ auth_user_id: 'auth-other' }),
    [staffFixture({ auth_user_id: 'auth-staff' })],
  )
  const auth = new FakeAuth([
    authFixture({ id: 'auth-other' }),
    authFixture({ id: 'auth-staff' }),
  ])
  await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_STAFF_ALREADY_LINKED')
  assert.equal(auth.invites, 0)
  assert.equal(staff.users[0].auth_user_id, 'auth-staff')
  assert.equal(staff.request.provisioning_error_code, 'ACCOUNT_STAFF_ALREADY_LINKED')
})

test('pending, rejected, and cancelled requests cannot be provisioned', async () => {
  for (const status of ['pending', 'rejected', 'cancelled'] as const) {
    const staff = new FakeProvisioningStaff(requestFixture({ status }))
    const auth = new FakeAuth()
    await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_REQUEST_NOT_APPROVED')
    assert.equal(auth.invites, 0)
  }
})

test('failed provisioning requires explicit retry and retry is controlled', async () => {
  const staff = new FakeProvisioningStaff(requestFixture({ provisioning_status: 'failed', provisioning_error_code: 'ACCOUNT_INVITE_FAILED' }))
  const auth = new FakeAuth()
  await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_PROVISIONING_RETRY_REQUIRED')
  assert.equal(auth.invites, 0)
  const result = await provision(staff, auth, { expectedVersion: 0, retry: true })
  assert.equal(result.provisioning_status, 'invited')
  assert.equal(auth.invites, 1)
})

test('stale CAS is rejected without side effects', async () => {
  const staff = new FakeProvisioningStaff(requestFixture({ version: 3 }))
  const auth = new FakeAuth()
  await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_PROVISIONING_STALE')
  assert.equal(auth.invites, 0)
})

test('concurrent attempts expose one in-progress claim and perform at most one invite', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth()
  const service = serviceFor(staff, auth)
  const first = service.provision({ requestId, expectedVersion: 0, retry: false, redirectTo: 'https://example.com/auth/confirm', actorAuthUserId: 'admin-auth' })
  await assert.rejects(
    () => service.provision({ requestId, expectedVersion: 0, retry: false, redirectTo: 'https://example.com/auth/confirm', actorAuthUserId: 'admin-auth' }),
    error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_PROVISIONING_IN_PROGRESS',
  )
  await first
  assert.equal(auth.invites, 1)
  assert.equal(staff.users.length, 1)
})

test('repeated successful provisioning is terminal-idempotent with no duplicate invite or Staff', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth()
  const service = serviceFor(staff, auth)
  const first = await service.provision({ requestId, expectedVersion: 0, retry: false, redirectTo: 'https://example.com/auth/confirm', actorAuthUserId: 'admin-auth' })
  const second = await service.provision({ requestId, expectedVersion: first.version, retry: false, redirectTo: 'https://example.com/auth/confirm', actorAuthUserId: 'admin-auth' })
  assert.equal(second.provisioning_status, 'invited')
  assert.equal(auth.invites, 1)
  assert.equal(staff.users.length, 1)
  assert.deepEqual(staff.stateHistory, ['in_progress', 'invited'])
})

test('metadata failure preserves the linked identity and controlled retry can proceed', async () => {
  const staff = new FakeProvisioningStaff()
  const auth = new FakeAuth()
  auth.failMetadata = true
  await assert.rejects(() => provision(staff, auth), error => error instanceof AccountRequestProvisioningError && error.code === 'ACCOUNT_METADATA_SYNC_FAILED')
  assert.equal(auth.invites, 1)
  assert.deepEqual(auth.deleted, [])
  assert.equal(staff.request.provisioning_status, 'failed')
  auth.failMetadata = false
  const result = await provision(staff, auth, { expectedVersion: staff.request.version, retry: true })
  assert.equal(result.provisioning_status, 'linked')
  assert.equal(auth.invites, 1)
})

test('migration preserves lifecycle, Phase 1 neutrality, Google hook, audit and no duplicate notification path', () => {
  assert.match(migration, /approved[\s\S]*not_started[\s\S]*in_progress[\s\S]*invited[\s\S]*linked/i)
  assert.match(migration, /set provisioning_status = 'in_progress'[\s\S]*version = request_row\.version \+ 1/i)
  assert.match(migration, /set provisioning_status = 'failed'[\s\S]*provisioning_error_code = v_error_code/i)
  assert.match(migration, /create or replace function public\.ensure_account_request_identity\([\s\S]*p_auth_user_id uuid[\s\S]*p_staff_id text default null/i)
  assert.doesNotMatch(migration, /p_system_permission|p_role|p_provisioned_by|notify|insert_notification/i)
  assert.match(phase2Migration, /create trigger audit_account_requests_change[\s\S]*after insert or update or delete on public\.account_requests/i)
  assert.match(migration, /public\.create_staff_member_with_auth\([\s\S]*'email'[\s\S]*'full_name'/i)
  assert.doesNotMatch(migration, /insert into public\.business_users/i)
  assert.match(phase1Migration, /If your request is eligible, it has been recorded for review\./i)
  assert.match(phase2Migration, /reviewed_by = v_actor_id/i)
  assert.match(phase2Migration, /provisioning_status = 'not_started'/i)
  assert.match(migration, /provider = 'google'|provider = 'google'/i)
  assert.match(lifecycleMigration, /coalesce\(nullif\(btrim\(p_data ->> 'system_permission'\), ''\), 'member'\)/i)
  assert.match(lifecycleMigration, /'inactive', 'pending_approval',[\s\S]*false, 'email'/i)
  assert.match(auditMigration, /create trigger audit_business_users_change[\s\S]*after insert or update or delete on public\.business_users/i)
})

test('existing Google identity remains linkable without invite and preserves canonical metadata', async () => {
  const staff = new FakeProvisioningStaff(requestFixture({ staff_id: 'staff-1', auth_user_id: 'auth-1' }), [staffFixture({ auth_user_id: 'auth-1' })])
  const auth = new FakeAuth([authFixture({ appMetadata: { existing_claim: 'preserve' }, hasGoogleIdentity: true })])
  const result = await provision(staff, auth)
  assert.equal(result.provisioning_status, 'linked')
  assert.equal(auth.invites, 0)
  assert.equal(auth.users[0].appMetadata?.existing_claim, 'preserve')
  assert.match(migration, /from auth\.identities[\s\S]*provider = 'google'[\s\S]*then 'google' else 'email'/i)
})

test('audit contract exposes provisioning before/after state and actor is database-derived', () => {
  assert.match(migration, /update public\.account_requests[\s\S]*provisioning_status = 'in_progress'/i)
  assert.match(migration, /update public\.account_requests[\s\S]*provisioning_status = p_provisioning_status/i)
  assert.match(migration, /update public\.account_requests[\s\S]*provisioning_status = 'failed'/i)
  assert.doesNotMatch(migration, /p_actor|p_provisioned_by|p_reviewed_by/i)
  assert.match(phase2Migration, /private\.capture_audit_row_change\(\)/i)
})
