import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { currentUserService, userService } from '../lib/services/dataService.ts'
import { permissionMatrix } from '../lib/permissions.ts'
import {
  setSupabaseMasterDataRepositoryForTests,
  type SupabaseMasterDataRepository,
} from '../lib/services/supabaseMasterDataService.ts'
import type { OperationalRole, SystemPermission, User } from '../lib/types/database.types.ts'

const migrationUrl = new URL(
  '../supabase/migrations/20260823120000_s2b_staff_management_writes.sql',
  import.meta.url,
)

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

function staffInput(overrides: Partial<User> = {}): Omit<User, 'id' | 'created_at' | 'updated_at'> {
  return {
    email: `s2b-${Math.random().toString(36).slice(2)}@example.test`,
    full_name: 'S2B Staff',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    status: 'active',
    account_status: 'active',
    email_verified: false,
    auth_provider: 'email',
    join_date: '2026-08-23',
    ...overrides,
  }
}

function remoteUser(overrides: Partial<User> = {}): User {
  return {
    id: 'remote-target',
    email: 'remote-target@example.test',
    full_name: 'Remote Target',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2026-08-23',
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    ...overrides,
  }
}

test('Permission Matrix v2 keeps system permission independent from operational roles', () => {
  assert.equal(permissionMatrix.admin.has('staff.manage'), true)
  assert.equal(permissionMatrix.leader.has('staff.manage'), false)
  assert.equal(permissionMatrix.member.has('staff.manage'), false)

  const systemPermissions: SystemPermission[] = ['admin', 'leader', 'member']
  const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']
  assert.deepEqual(systemPermissions, ['admin', 'leader', 'member'])
  assert.deepEqual(operationalRoles, ['host', 'support', 'technical'])
})

test('mock Staff writes enforce Admin policy, no self escalation, and full lifecycle parity', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    setAuthMode('mock')

    await assert.rejects(userService.create(staffInput(), '2'), /Only Admin/)
    await assert.rejects(userService.update('4', { full_name: 'Forbidden' }, '3'), /Only Admin/)
    await assert.rejects(userService.update('1', { system_permission: 'member' }, '1'), /Self privilege/)
    await assert.rejects(userService.archive('1', '1'), /Self archive/)

    const created = await userService.create(staffInput({ operational_roles: ['host', 'support'] }), '1')
    assert.equal(created.system_permission, 'member')
    assert.equal(created.role, 'staff')
    assert.deepEqual(created.operational_roles, ['host', 'support'])

    const updated = await userService.update(created.id, {
      system_permission: 'leader',
      operational_roles: ['technical'],
    }, '1')
    assert.equal(updated?.system_permission, 'leader')
    assert.equal(updated?.role, 'leader')
    assert.deepEqual(updated?.operational_roles, ['technical'])

    const pending = await userService.create(staffInput({
      status: 'inactive',
      account_status: 'pending_approval',
    }), '1')
    const approved = await userService.approvePendingAccount(pending.id, '1')
    assert.equal(approved?.status, 'active')
    assert.equal(approved?.account_status, 'active')

    const pendingRejected = await userService.create(staffInput({
      status: 'inactive',
      account_status: 'pending_approval',
    }), '1')
    const rejected = await userService.rejectPendingAccount(pendingRejected.id, '1')
    assert.equal(rejected?.status, 'inactive')
    assert.equal(rejected?.account_status, 'rejected')

    const archived = await userService.archive(created.id, '1', 'S2B test')
    assert.ok(archived?.archived_at)
    assert.equal((await userService.getAll()).some(user => user.id === created.id), false)
    const restored = await userService.restore(created.id, '1', 'S2B restore')
    assert.equal(restored?.archived_at, undefined)
    assert.equal(restored?.status, 'active')

    const ownProfile = await userService.update('3', { full_name: 'Own Profile Update' }, '3')
    assert.equal(ownProfile?.full_name, 'Own Profile Update')
  } finally {
    setSupabaseMasterDataRepositoryForTests(undefined)
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('Supabase mode routes every Staff mutation through the repository and never falls back to mock', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  const calls: string[] = []
  let target = remoteUser()
  const businessUsers: SupabaseMasterDataRepository['businessUsers'] = {
    async getAll() { return [target] },
    async getById(id) { return id === target.id ? target : null },
    async getByAuthIdentity() { return null },
    async create(data) {
      calls.push('create')
      target = remoteUser({ ...data, id: 'remote-created' })
      return target
    },
    async update(id, data) {
      calls.push('update')
      if (id !== target.id) return null
      target = { ...target, ...data }
      return target
    },
    async approvePendingAccount() { calls.push('approve'); return target },
    async rejectPendingAccount() { calls.push('reject'); return target },
    async archive() { calls.push('archive'); return target },
    async restore() { calls.push('restore'); return target },
  }
  const repository = { businessUsers } as unknown as SupabaseMasterDataRepository

  try {
    setAuthMode('supabase')
    setSupabaseMasterDataRepositoryForTests(repository)
    currentUserService.bindAuthenticatedUser(remoteUser({
      id: 'remote-admin',
      email: 'remote-admin@example.test',
      full_name: 'Remote Admin',
      role: 'admin',
      system_permission: 'admin',
      operational_roles: [],
    }))

    const created = await userService.create(staffInput(), 'remote-admin')
    await userService.update(created.id, { operational_roles: ['technical'] }, 'remote-admin')
    await userService.approvePendingAccount(created.id, 'remote-admin')
    await userService.rejectPendingAccount(created.id, 'remote-admin')
    await userService.archive(created.id, 'remote-admin', 'test')
    await userService.restore(created.id, 'remote-admin', 'test')
    assert.deepEqual(calls, ['create', 'update', 'approve', 'reject', 'archive', 'restore'])

    currentUserService.bindAuthenticatedUser(remoteUser({ id: created.id }))
    await userService.update(created.id, { full_name: 'Own Remote Profile' }, created.id)
    assert.equal(target.full_name, 'Own Remote Profile')

    currentUserService.bindAuthenticatedUser(remoteUser({ id: 'remote-member' }))
    await assert.rejects(
      userService.update(created.id, { system_permission: 'admin' }, 'remote-member'),
      /Only Admin/,
    )
    assert.deepEqual(calls, ['create', 'update', 'approve', 'reject', 'archive', 'restore', 'update'])
  } finally {
    setSupabaseMasterDataRepositoryForTests(undefined)
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('S2B migration enforces server-derived Admin RPCs and preserves auth linkage', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const rpcNames = [
    'create_staff_member',
    'update_staff_member',
    'approve_staff_account',
    'reject_staff_account',
    'archive_staff_member',
    'restore_staff_member',
  ]

  assert.match(sql, /create or replace function private\.require_staff_admin\(\)/i)
  assert.match(sql, /private\.current_business_user_id\(\)/i)
  assert.match(sql, /private\.is_admin\(\)/i)
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i)
  assert.match(sql, /revoke insert, update, delete on table public\.business_users from authenticated/i)
  for (const name of rpcNames) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`, 'i'))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(`, 'i'))
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(`, 'i'))
  }

  const updateRpc = sql.match(/create or replace function public\.update_staff_member[\s\S]*?\n\$\$;/i)?.[0] || ''
  assert.match(updateRpc, /STAFF_SELF_PRIVILEGE_ESCALATION_DENIED/i)
  assert.match(updateRpc, /'full_name', 'avatar_url', 'avatar_storage_path', 'phone', 'department'/i)
  assert.doesNotMatch(updateRpc, /set[\s\S]*auth_user_id\s*=/i)
  assert.doesNotMatch(updateRpc, /'auth_user_id'/i)
  assert.match(updateRpc, /operational_roles = v_roles/i)
  assert.match(updateRpc, /system_permission = v_permission/i)
})

test('Staff UI exposes separate permission/role controls and lifecycle actions without self-action controls', async () => {
  const [formSource, listSource, repositorySource] = await Promise.all([
    readFile(new URL('../components/features/staff/StaffFormDialog.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/features/staff/StaffList.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/services/supabaseMasterDataService.ts', import.meta.url), 'utf8'),
  ])
  assert.match(formSource, /systemPermissions[\s\S]*operationalRoles/)
  assert.match(formSource, /disabled=\{isSelf\}/)
  assert.match(listSource, /data-testid="toggle-archived-staff"/)
  assert.match(listSource, /data-testid=\{`archive-staff-/)
  assert.match(listSource, /data-testid=\{`restore-staff-/)
  assert.match(listSource, /row\.id !== currentUser\?\.id/)
  assert.match(repositorySource, /rpc\('create_staff_member'/)
  assert.match(repositorySource, /rpc\('update_staff_member'/)
})
