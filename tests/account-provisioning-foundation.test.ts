import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createAuthIdentity, mapAuthIdentityToBusinessUser } from '@/lib/auth/authIdentity'
import { isActiveBusinessUser } from '@/lib/utils/accountIdentity'
import { createAccountProvisioningPostHandler } from '@/lib/server/accountProvisioningRouteHandler'
import {
  AccountProvisioningError,
  createAccountProvisioningService,
  type ProvisioningAuthUser,
} from '@/lib/server/accountProvisioningService'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'
import type { User } from '@/lib/types/database.types'

const migrationPath = new URL('../supabase/migrations/20260901120000_account_provisioning_foundation.sql', import.meta.url)
const auditMigrationPath = new URL('../supabase/migrations/20260830113000_core_v1_persistent_audit.sql', import.meta.url)

function staff(overrides: Partial<User> = {}): User {
  return {
    id: 'staff-1',
    email: 'person@example.com',
    full_name: 'Person One',
    role: 'staff',
    system_permission: 'member',
    operational_roles: [],
    status: 'active',
    account_status: 'active',
    email_verified: false,
    join_date: '2026-09-01',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

function createHarness(options: {
  staff?: User[]
  auth?: ProvisioningAuthUser[]
} = {}) {
  const staffRows = options.staff ? options.staff.map(row => ({ ...row })) : [staff()]
  const authRows = options.auth ? options.auth.map(row => ({ ...row })) : []
  const deletedAuthIds: string[] = []
  const auditEvents: Array<{ before: User; after: User }> = []
  let inviteNumber = 0

  const service = createAccountProvisioningService({
    auth: {
      async findUsersByEmail(email) {
        return authRows.filter(user => user.email?.trim().toLowerCase() === email)
      },
      async getUserById(authUserId) {
        return authRows.find(user => user.id === authUserId) || null
      },
      async inviteUserByEmail(email) {
        const invited = { id: `auth-new-${++inviteNumber}`, email, appMetadata: {} }
        authRows.push(invited)
        return invited
      },
      async deleteUser(authUserId) {
        deletedAuthIds.push(authUserId)
        const index = authRows.findIndex(user => user.id === authUserId)
        if (index >= 0) authRows.splice(index, 1)
      },
    },
    staff: {
      async getById(staffId) {
        const row = staffRows.find(item => item.id === staffId)
        return row ? { ...row } : null
      },
      async linkAuthUser(input) {
        const index = staffRows.findIndex(item => item.id === input.staffId)
        if (index < 0) throw new AccountProvisioningError('ACCOUNT_STAFF_NOT_FOUND')
        if (staffRows[index].auth_user_id) throw new AccountProvisioningError('ACCOUNT_STAFF_ALREADY_LINKED')
        if (staffRows.some(item => item.auth_user_id === input.authUserId)) {
          throw new AccountProvisioningError('ACCOUNT_AUTH_USER_ALREADY_LINKED')
        }
        const before = { ...staffRows[index] }
        staffRows[index] = {
          ...staffRows[index],
          auth_user_id: input.authUserId,
          system_permission: input.systemPermission,
          role: input.systemPermission === 'member' ? 'staff' : input.systemPermission,
          auth_provider: 'email',
          ...(input.mode === 'provision' ? {
            status: 'inactive' as const,
            account_status: 'pending_approval' as const,
            email_verified: false,
          } : {}),
        }
        auditEvents.push({ before, after: { ...staffRows[index] } })
        return { ...staffRows[index] }
      },
    },
  })

  return { service, staffRows, authRows, deletedAuthIds, auditEvents }
}

async function rejectsCode(promise: Promise<unknown>, code: AccountProvisioningError['code']) {
  await assert.rejects(promise, error => error instanceof AccountProvisioningError && error.code === code)
}

const admin: AuthenticatedServerUser = { id: 'admin-1', systemPermission: 'admin' }
const leader: AuthenticatedServerUser = { id: 'leader-1', systemPermission: 'leader' }
const member: AuthenticatedServerUser = { id: 'member-1', systemPermission: 'member' }

function request(body: unknown) {
  return new Request('http://localhost/api/staff/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('Admin provisions an existing active Staff record and establishes the canonical link and initial role', async () => {
  const harness = createHarness()
  const result = await harness.service.provisionExistingStaff({
    staffId: 'staff-1',
    email: 'PERSON@example.com',
    initialRole: 'leader',
    redirectTo: 'http://localhost/auth/confirm?next=/reset-password',
  })

  assert.equal(result.auth_user_id, 'auth-new-1')
  assert.equal(result.system_permission, 'leader')
  assert.equal(result.role, 'leader')
  assert.equal(result.status, 'inactive')
  assert.equal(result.account_status, 'pending_approval')
  assert.equal(harness.auditEvents.length, 1)
  assert.equal(harness.auditEvents[0].before.auth_user_id, undefined)
  assert.equal(harness.auditEvents[0].after.auth_user_id, 'auth-new-1')
})

test('duplicate provisioning is rejected without creating a second Auth identity', async () => {
  const harness = createHarness()
  await harness.service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' })
  await rejectsCode(
    harness.service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }),
    'ACCOUNT_STAFF_ALREADY_LINKED',
  )
  assert.equal(harness.authRows.length, 1)
})

test('missing, archived, inactive, and rejected Staff records fail closed', async () => {
  await rejectsCode(createHarness().service.provisionExistingStaff({ staffId: 'missing', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_STAFF_NOT_FOUND')
  await rejectsCode(createHarness({ staff: [staff({ archived_at: '2026-09-01T00:00:00Z' })] }).service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_STAFF_ARCHIVED')
  await rejectsCode(createHarness({ staff: [staff({ status: 'inactive' })] }).service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_STAFF_INACTIVE')
  await rejectsCode(createHarness({ staff: [staff({ status: 'active', account_status: 'rejected' })] }).service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_STAFF_INACTIVE')
})

test('provisioning rejects email mismatch and duplicate or ambiguous Auth email matches', async () => {
  await rejectsCode(createHarness().service.provisionExistingStaff({ staffId: 'staff-1', email: 'other@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_AUTH_EMAIL_MISMATCH')
  await rejectsCode(createHarness({ auth: [{ id: 'auth-1', email: 'person@example.com' }] }).service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_EMAIL_ALREADY_EXISTS')
  await rejectsCode(createHarness({ auth: [{ id: 'auth-1', email: 'person@example.com' }, { id: 'auth-2', email: 'person@example.com' }] }).service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_EMAIL_AMBIGUOUS')
})

test('an existing Auth user can be explicitly linked, while conflicting ownership and email are rejected', async () => {
  const success = createHarness({ auth: [{ id: 'auth-1', email: 'person@example.com', appMetadata: {} }] })
  const linked = await success.service.linkExistingAuthUser({ staffId: 'staff-1', authUserId: 'auth-1', initialRole: 'leader' })
  assert.equal(linked.auth_user_id, 'auth-1')
  assert.equal(linked.system_permission, 'leader')
  assert.equal(linked.status, 'active')

  await rejectsCode(
    createHarness({ auth: [{ id: 'auth-1', email: 'person@example.com', appMetadata: { business_user_id: 'other-staff' } }] }).service.linkExistingAuthUser({ staffId: 'staff-1', authUserId: 'auth-1' }),
    'ACCOUNT_AUTH_USER_ALREADY_LINKED',
  )
  await rejectsCode(
    createHarness({ auth: [{ id: 'auth-1', email: 'other@example.com', appMetadata: {} }] }).service.linkExistingAuthUser({ staffId: 'staff-1', authUserId: 'auth-1' }),
    'ACCOUNT_AUTH_EMAIL_MISMATCH',
  )
  await rejectsCode(createHarness().service.linkExistingAuthUser({ staffId: 'staff-1', authUserId: '00000000-0000-4000-8000-000000000001' }), 'ACCOUNT_AUTH_USER_NOT_FOUND')
})

test('role assignment is validated and missing Staff roles fail closed', async () => {
  await rejectsCode(createHarness().service.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'owner' as 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_ROLE_INVALID')
  await rejectsCode(createHarness({ staff: [staff({ system_permission: undefined })] }).service.linkExistingAuthUser({ staffId: 'staff-1', authUserId: 'auth-1' }), 'ACCOUNT_ROLE_MISSING')
})

test('Admin is allowed, while Leader, Member, and anonymous callers are denied by the route', async () => {
  const body = { action: 'link', staffId: 'staff-1', authUserId: '00000000-0000-4000-8000-000000000001' }
  const service = {
    async linkExistingAuthUser() { return staff({ auth_user_id: '00000000-0000-4000-8000-000000000001' }) },
    async provisionExistingStaff() { return staff() },
  }
  const adminResponse = await createAccountProvisioningPostHandler({ resolveUser: async () => admin, service })(request(body))
  assert.equal(adminResponse.status, 200)
  const leaderResponse = await createAccountProvisioningPostHandler({ resolveUser: async () => leader, service })(request(body))
  assert.equal(leaderResponse.status, 403)
  const memberResponse = await createAccountProvisioningPostHandler({ resolveUser: async () => member, service })(request(body))
  assert.equal(memberResponse.status, 403)
  const anonymousResponse = await createAccountProvisioningPostHandler({ resolveUser: async () => null, service })(request(body))
  assert.equal(anonymousResponse.status, 401)
})

test('route rejects arbitrary roles and does not call the service for malformed requests', async () => {
  let calls = 0
  const handler = createAccountProvisioningPostHandler({
    resolveUser: async () => admin,
    service: {
      async linkExistingAuthUser() { calls += 1; return staff() },
      async provisionExistingStaff() { calls += 1; return staff() },
    },
  })
  const response = await handler(request({ action: 'provision', staffId: 'staff-1', email: 'person@example.com', initialRole: 'owner' }))
  assert.equal(response.status, 400)
  assert.equal(calls, 0)
})

test('deactivated identities cannot authorize and a valid reactivated identity can', () => {
  const identity = createAuthIdentity({ id: 'auth-1', email: 'person@example.com', app_metadata: { business_user_id: 'staff-1', system_permission: 'member' } })
  assert.ok(identity)
  assert.equal(isActiveBusinessUser({ status: 'inactive', account_status: 'active' }), false)
  assert.equal(mapAuthIdentityToBusinessUser(identity!, [staff({ status: 'inactive' })]), null)
  const active = staff({ status: 'active', account_status: 'active' })
  assert.ok(mapAuthIdentityToBusinessUser(identity!, [active]))
})

test('provisioning migration is server-authorized, conflict-safe, and synchronizes app metadata', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /create or replace function public\.link_staff_auth_user\(/i)
  assert.match(sql, /private\.require_staff_admin\(\)/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /auth_user_id = p_auth_user_id/i)
  assert.match(sql, /lower\(btrim\(v_target\.email\)\) <> v_auth_email/i)
  assert.match(sql, /raw_app_meta_data = v_auth_metadata/i)
  assert.match(sql, /revoke all on function public\.link_staff_auth_user\(text, uuid, text, text\) from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.link_staff_auth_user\(text, uuid, text, text\) to authenticated/i)
})

test('existing database audit trigger captures the link before and after state in the same transaction', async () => {
  const migration = await readFile(migrationPath, 'utf8')
  const audit = await readFile(auditMigrationPath, 'utf8')
  assert.match(migration, /update public\.business_users[\s\S]*auth_user_id = p_auth_user_id/i)
  assert.match(audit, /create trigger audit_business_users_change after insert or update or delete on public\.business_users/i)
  assert.match(audit, /before_data, after_data/i)
})

test('public self-signup remains disabled in production while mock registration stays explicitly development-only', async () => {
  const register = await readFile(new URL('../app/register/page.tsx', import.meta.url), 'utf8')
  assert.match(register, /getAuthMode\(\) === 'mock'/)
  assert.match(register, /import \{ getAuthMode \} from '@\/lib\/auth\/authMode'/)
  assert.match(register, /if \(!useMockData\)/)
  assert.match(register, /setErrors\(\{ form: t\('supabaseNotConfigured'\) \}\)/)
  assert.doesNotMatch(register, /supabase\.auth\.signUp/)
})

test('failed linking cleans up a newly invited Auth identity and exposes no credentials', async () => {
  const harness = createHarness()
  const failingService = createAccountProvisioningService({
    auth: {
      async findUsersByEmail() { return [] },
      async getUserById() { return null },
      async inviteUserByEmail() { return { id: 'auth-new-1', email: 'person@example.com' } },
      async deleteUser(authUserId) { harness.deletedAuthIds.push(authUserId) },
    },
    staff: {
      async getById() { return staff() },
      async linkAuthUser() { throw new Error('provider secret must not escape') },
    },
  })
  await rejectsCode(failingService.provisionExistingStaff({ staffId: 'staff-1', email: 'person@example.com', initialRole: 'member', redirectTo: 'http://localhost/confirm' }), 'ACCOUNT_LINK_FAILED')
  assert.deepEqual(harness.deletedAuthIds, ['auth-new-1'])
})
