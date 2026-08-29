// tests/core-v1-3role-matrix.test.ts
// Deterministic Core V1 3-role E2E/smoke matrix — AUTOMATED, no credentials, no network.
// Covers: auth/protected routes, role matrix, Calendar, My Shifts, registration submit,
// staffing approval, swaps, notifications, Staff, Reports, Settings, inactive/archive fail-closed,
// refresh persistence. TEST INFRASTRUCTURE ONLY.

import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server'

import { hasPermission, permissionMatrix, resolveSystemPermission } from '../lib/permissions.ts'
import { createAuthIdentity, mapAuthIdentityToBusinessUser } from '../lib/auth/authIdentity.ts'
import { AuthorizationError, requirePermission, requireRole, requireUser } from '../lib/server/authGuards.ts'
import { resolveAuthMode, resolveSupabasePublicConfig } from '../lib/auth/authMode.ts'
import { createAuthProxy } from '../lib/auth/proxy.ts'
import { createSessionUpdater, isPublicAuthPath } from '../lib/supabase/middleware.ts'
import { resolveRegistrationCta } from '../lib/utils/shiftRegistration.ts'
import {
  CANONICAL_ADMIN_EXTRA,
  CANONICAL_COUNTS,
  CANONICAL_LEADER_EXTRA,
  CANONICAL_MEMBER_PERMISSIONS,
  CORE_ROLES,
  canonicalSetFor,
  makeArchivedUser,
  makeDeletedUser,
  makeInactiveUser,
  makeMockUser,
  productionSetFor,
} from './harness/coreV1Roles.ts'
import { CORE_V1_ROUTE_MATRIX } from './harness/routeAccessExpectations.ts'

// --- helpers ---------------------------------------------------------------
function permsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
function serverUser(role: 'admin' | 'leader' | 'member') {
  return { id: `u-${role}`, systemPermission: role as 'admin' | 'leader' | 'member' }
}
function mockResolver(role: 'admin' | 'leader' | 'member' | null) {
  return async () => (role ? serverUser(role) : null)
}

// ---------------------------------------------------------------------------
// 1. Permission matrix — frozen contract
// ---------------------------------------------------------------------------
test('Core V1: permissionMatrix counts match canonical (fail-closed on drift)', () => {
  for (const role of CORE_ROLES) {
    const prod = productionSetFor(role)
    const canonical = canonicalSetFor(role)
    assert.equal(prod.size, CANONICAL_COUNTS[role], `count drift for ${role}`)
    assert.ok(permsEqual(prod, canonical), `permission set drift for ${role}: prod=${[...prod].sort().join(',')}`)
  }
})

test('Core V1: leader strictly extends member; admin strictly extends leader', () => {
  const member = productionSetFor('member')
  const leader = productionSetFor('leader')
  const admin = productionSetFor('admin')
  for (const p of member) assert.ok(leader.has(p), `leader missing member perm ${p}`)
  for (const p of leader) assert.ok(admin.has(p), `admin missing leader perm ${p}`)
  assert.ok(leader.size > member.size, 'leader must be strict superset of member')
  assert.ok(admin.size > leader.size, 'admin must be strict superset of leader')
})

test('Core V1: no extra permissions outside canonical union', () => {
  const union = new Set([...CANONICAL_MEMBER_PERMISSIONS as unknown as string[], ...CANONICAL_LEADER_EXTRA as unknown as string[], ...CANONICAL_ADMIN_EXTRA as unknown as string[]])
  for (const role of CORE_ROLES) {
    for (const p of productionSetFor(role)) assert.ok(union.has(p), `unknown permission ${p} for ${role}`)
  }
})

// ---------------------------------------------------------------------------
// 2. hasPermission / resolveSystemPermission — role semantics
// ---------------------------------------------------------------------------
test('Core V1: hasPermission truth table mirrors matrix', () => {
  // member baseline
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'shifts.register'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'swaps.request'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'reports.submit'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'swaps.approve'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'staff.manage'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'settings.admin'), false)
  // leader
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'swaps.approve'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'shifts.approve_registration'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'reports.review'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'settings.leader'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'staff.manage'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'settings.admin'), false)
  // admin
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'staff.manage'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'settings.admin'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'data.force_delete'), true)
})

test('Core V1: resolveSystemPermission fallback (role -> system_permission, unknown -> member)', () => {
  assert.equal(resolveSystemPermission({ role: 'admin' } as unknown as Parameters<typeof resolveSystemPermission>[0]), 'admin')
  assert.equal(resolveSystemPermission({ role: 'leader' } as unknown as Parameters<typeof resolveSystemPermission>[0]), 'leader')
  assert.equal(resolveSystemPermission({ role: 'staff' } as unknown as Parameters<typeof resolveSystemPermission>[0]), 'member')
  assert.equal(resolveSystemPermission(null), 'member')
  assert.equal(resolveSystemPermission(undefined), 'member')
  // system_permission takes precedence over legacy role
  assert.equal(resolveSystemPermission({ role: 'admin', system_permission: 'member' } as unknown as Parameters<typeof resolveSystemPermission>[0]), 'member')
})

test('Core V1: permissionMatrix immutability contract — system_permission binding only', () => {
  // Ensures authIdentity system_permission is authoritative, not operational_roles
  const user = makeMockUser({ system_permission: 'member', operational_roles: ['host', 'support', 'technical'] })
  // operational_roles do NOT grant management perms
  assert.equal(hasPermission(user, 'staff.manage'), false)
  assert.equal(hasPermission(user, 'swaps.approve'), false)
})

// ---------------------------------------------------------------------------
// 3. Authentication / protected routes contract
// ---------------------------------------------------------------------------
test('Core V1: isPublicAuthPath gates exactly /login (refresh boundary)', () => {
  assert.equal(isPublicAuthPath('/login'), true)
  assert.equal(isPublicAuthPath('/'), false)
  assert.equal(isPublicAuthPath('/calendar'), false)
  assert.equal(isPublicAuthPath('/api/anything'), false)
  assert.equal(isPublicAuthPath('/login?next=%2F'), false) // path only
})

test('Core V1: auth proxy — mock mode bypasses Supabase refresh (deterministic, no network)', async () => {
  const proxy = createAuthProxy({
    getMode: () => 'mock',
    hasSupabaseConfig: () => false,
    refreshSession: async () => NextResponse.next(),
  })
  const req = new NextRequest('http://127.0.0.1:3101/calendar')
  const res = await proxy(req)
  // mock must not redirect
  assert.equal(res.status, 200)
})

test('Core V1: auth proxy — supabase mode without config redirects unauthenticated protected to /login', async () => {
  const proxy = createAuthProxy({
    getMode: () => 'supabase',
    hasSupabaseConfig: () => false,
    refreshSession: async () => NextResponse.next(),
  })
  const protectedReq = new NextRequest('http://127.0.0.1:3101/calendar')
  const res = await proxy(protectedReq)
  assert.equal(res.status, 307)
  assert.match(res.headers.get('location') ?? '', /\/login\?reason=auth_unavailable/)
  // login must remain accessible without redirect loop
  const loginReq = new NextRequest('http://127.0.0.1:3101/login')
  const loginRes = await proxy(loginReq)
  assert.equal(loginRes.status, 200)
  assert.ok((loginRes.headers.get('Cache-Control') ?? '').includes('no-store'))
})

test('Core V1: session updater — unauthenticated getClaims redirects to /login?reason=session_expired', async () => {
  const updater = createSessionUpdater(
    ((_req, _onResponse) => ({
      auth: {
        getClaims: async () => ({ data: null, error: { message: 'no session' } }) as unknown as never,
      },
    })) as unknown as Parameters<typeof createSessionUpdater>[0],
  )
  const req = new NextRequest('http://127.0.0.1:3101/swaps')
  const res = await updater(req)
  assert.equal(res.status, 307)
  assert.match(res.headers.get('location') ?? '', /\/login\?reason=session_expired/)
})

test('Core V1: session updater — authenticated claim passes through with no-store', async () => {
  const updater = createSessionUpdater(
    ((_req, _onResponse) => ({
      auth: {
        getClaims: async () => ({ data: { claims: { sub: 'user-1' } }, error: null }) as unknown as never,
      },
    })) as unknown as Parameters<typeof createSessionUpdater>[0],
  )
  const res = await updater(new NextRequest('http://127.0.0.1:3101/'))
  assert.equal(res.status, 200)
  assert.ok((res.headers.get('Cache-Control') ?? '').includes('no-store'))
})

// ---------------------------------------------------------------------------
// 4. authGuards — requireUser / requirePermission / requireRole fail-closed
// ---------------------------------------------------------------------------
test('Core V1: requireUser throws 401 when unauthenticated', async () => {
  await assert.rejects(() => requireUser(new Request('http://x/'), mockResolver(null)), (e: unknown) => {
    assert.ok(e instanceof AuthorizationError)
    assert.equal((e as AuthorizationError).status, 401)
    assert.equal((e as AuthorizationError).code, 'AUTHENTICATION_REQUIRED')
    return true
  })
})

test('Core V1: requirePermission enforces matrix per role', async () => {
  const req = new Request('http://x/')
  await assert.rejects(() => requirePermission(req, 'swaps.approve', mockResolver('member')), (e: unknown) => (e as AuthorizationError).status === 403)
  await assert.doesNotReject(() => requirePermission(req, 'swaps.approve', mockResolver('leader')))
  await assert.doesNotReject(() => requirePermission(req, 'staff.manage', mockResolver('admin')))
  await assert.rejects(() => requirePermission(req, 'staff.manage', mockResolver('leader')), (e: unknown) => (e as AuthorizationError).status === 403)
})

test('Core V1: requireRole allows list of roles, denies others', async () => {
  const req = new Request('http://x/')
  await assert.doesNotReject(() => requireRole(req, ['admin', 'leader'], mockResolver('leader')))
  await assert.rejects(() => requireRole(req, ['admin'], mockResolver('leader')), (e: unknown) => (e as AuthorizationError).status === 403)
})

// ---------------------------------------------------------------------------
// 5. Production safety — no mock fallback in production
// ---------------------------------------------------------------------------
test('Core V1: production cannot enable mock auth (no mock fallback in prod smoke)', () => {
  assert.equal(resolveAuthMode({ nodeEnv: 'production', useMockData: 'true' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'production' }), 'supabase')
  assert.equal(resolveAuthMode({ nodeEnv: 'development', useMockData: 'true' }), 'mock')
})

// ---------------------------------------------------------------------------
// 6. Inactive / archive fail-closed — mapAuthIdentityToBusinessUser
// ---------------------------------------------------------------------------
test('Core V1: inactive business_user fail-closed (no mapping)', () => {
  const identity = createAuthIdentity({ id: 'auth-1', email: 'a@test', app_metadata: { system_permission: 'member', business_user_id: 'biz-1' }, user_metadata: {} })!
  // inactive
  const inactive = makeInactiveUser('member', { id: 'biz-1' })
  assert.equal(mapAuthIdentityToBusinessUser(identity, [inactive]), null)
  // archived
  const archived = makeArchivedUser('member', { id: 'biz-1' })
  assert.equal(mapAuthIdentityToBusinessUser(identity, [archived]), null)
  // deleted
  const deleted = makeDeletedUser('member', { id: 'biz-1' })
  assert.equal(mapAuthIdentityToBusinessUser(identity, [deleted]), null)
  // active passes
  const active = makeMockUser({ id: 'biz-1', system_permission: 'member', status: 'active' })
  assert.notEqual(mapAuthIdentityToBusinessUser(identity, [active]), null)
})

test('Core V1: createAuthIdentity requires business_user_id and valid system_permission (fail-closed)', () => {
  assert.equal(createAuthIdentity({ id: 'auth-1', app_metadata: { system_permission: 'member' }, user_metadata: {} }), null) // missing biz id
  assert.equal(createAuthIdentity({ id: 'auth-1', app_metadata: { system_permission: 'unknown' as never, business_user_id: 'biz-1' }, user_metadata: {} }), null)
  assert.equal(createAuthIdentity({ id: '', app_metadata: { system_permission: 'member', business_user_id: 'biz-1' }, user_metadata: {} }), null)
  const ok = createAuthIdentity({ id: 'auth-1', app_metadata: { system_permission: 'admin', business_user_id: 'biz-1' }, user_metadata: {} })
  assert.ok(ok && ok.system_permission === 'admin' && ok.business_user_id === 'biz-1')
})

// ---------------------------------------------------------------------------
// 7. Coverage areas 3-12 — role-specific expectations
// ---------------------------------------------------------------------------
test('Core V1: Calendar / My Shifts — visible to all authenticated roles', () => {
  for (const id of ['calendar', 'my-shifts']) {
    const row = CORE_V1_ROUTE_MATRIX.find(r => r.id === id)
    assert.ok(row)
    for (const role of CORE_ROLES) assert.notEqual(row!.visibility[role], 'hidden', `${id} hidden for ${role}`)
  }
})

test('Core V1: registration submit — all roles can register when operationally eligible', () => {
  const shift = { id: 'shift-1', date: '2026-08-29', start_time: '10:00:00', end_time: '12:00:00', status: 'scheduled', registration_locked: false } as never
  const now = new Date('2026-08-29T08:00:00.000Z')
  for (const role of CORE_ROLES) {
    const user = makeMockUser({ system_permission: role, operational_roles: ['host'] })
    const cta = resolveRegistrationCta({ shift: shift as never, registrations: [], user: user as never, now })
    // member host should be eligible (not not_eligible); actual eligibility = hasPermission(shifts.register) ∧ operational role match
    const hostCta = cta.find(c => c.role === 'host')
    assert.ok(hostCta)
    assert.equal(hasPermission(user, 'shifts.register'), true)
    // shift is open and not closed
    assert.ok(hostCta!.state === 'eligible' || hostCta!.state === 'full' || hostCta!.state === 'pending', `${role} host state ${hostCta!.state}`)
  }
  // non-eligible operational role → not_eligible
  const userSupport = makeMockUser({ system_permission: 'member', operational_roles: ['support'] })
  const cta2 = resolveRegistrationCta({ shift: shift as never, registrations: [], user: userSupport as never, now })
  assert.equal(cta2.find(c => c.role === 'host')!.state, 'not_eligible')
})

test('Core V1: staffing approval visibility — member hidden, leader/admin visible', () => {
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'shifts.approve_registration'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'shifts.approve_registration'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'shifts.approve_registration'), true)
  const row = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'staffing-approval')!
  assert.equal(row.visibility.member, 'hidden')
  assert.equal(row.visibility.leader, 'visible')
  assert.equal(row.visibility.admin, 'visible')
})

test('Core V1: swaps — member can request, only leader/admin can approve', () => {
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'swaps.request'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'swaps.approve'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'swaps.approve'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'swaps.approve'), true)
  const swaps = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'swaps')!
  assert.equal(swaps.actionGate!.allowed.member, false)
  assert.equal(swaps.actionGate!.allowed.leader, true)
})

test('Core V1: notifications — visible to all authenticated (no permission gate, user-scoped)', () => {
  const row = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'notifications')!
  for (const role of CORE_ROLES) assert.equal(row.visibility[role], 'visible')
  // verify no permission required
  assert.equal(row.requiredPermissions, null)
})

test('Core V1: Staff — member read_only self, leader visible, only admin can staff.manage', () => {
  const staffRow = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'staff')!
  assert.equal(staffRow.visibility.member, 'read_only')
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'staff.manage'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'staff.manage'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'staff.manage'), true)
  // StaffList filtering: member sees only self (tested here via contract; integration verified in UAT)
  assert.equal(staffRow.actionGate!.allowed.admin, true)
  assert.equal(staffRow.actionGate!.allowed.leader, false)
})

test('Core V1: Reports — member submit only, leader/admin review', () => {
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'reports.submit'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'reports.review'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'reports.review'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'reports.review'), true)
  const reports = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'reports')!
  assert.equal(reports.actionGate!.allowed.member, false)
})

test('Core V1: Settings/Admin-only — personal for all, team for leader, system for admin', () => {
  // personal = settings.member (all have)
  for (const role of CORE_ROLES) assert.equal(hasPermission(makeMockUser({ system_permission: role }), 'settings.member'), true)
  // team
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'settings.leader'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'settings.leader'), true)
  // system
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'settings.admin'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'settings.admin'), true)
  const settings = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'settings')!
  assert.equal(settings.actionGate!.allowed.admin, true)
  assert.equal(settings.actionGate!.allowed.leader, false)
})

test('Core V1: Audit restricted nav — only leader/admin (audit.view_team / audit.view)', () => {
  const audit = CORE_V1_ROUTE_MATRIX.find(r => r.id === 'audit')!
  assert.equal(audit.visibility.member, 'hidden')
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'audit.view'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'member' }), 'audit.view_team'), false)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'leader' }), 'audit.view_team'), true)
  assert.equal(hasPermission(makeMockUser({ system_permission: 'admin' }), 'audit.view'), true)
})

// ---------------------------------------------------------------------------
// 8. Supabase config resolution — never hardcode tokens
// ---------------------------------------------------------------------------
test('Core V1: Supabase public config requires both url+anonKey and trims', () => {
  assert.equal(resolveSupabasePublicConfig({}), null)
  assert.equal(resolveSupabasePublicConfig({ url: 'https://x.supabase.co' }), null)
  assert.equal(resolveSupabasePublicConfig({ url: '  ', anonKey: ' k ' }), null)
  const cfg = resolveSupabasePublicConfig({ url: ' https://x.supabase.co ', anonKey: ' anon ' })
  assert.deepEqual(cfg, { url: 'https://x.supabase.co', anonKey: 'anon' })
})

// ---------------------------------------------------------------------------
// 9. Refresh persistence — session cookies are private/no-store and cache-persisted
// ---------------------------------------------------------------------------
test('Core V1: refresh persistence — protected paths require private no-store on pass-through', async () => {
  const updater = createSessionUpdater(
    ((_req, _onResponse) => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } }, error: null }) as unknown as never },
    })) as unknown as Parameters<typeof createSessionUpdater>[0],
  )
  const res = await updater(new NextRequest('http://127.0.0.1:3101/calendar'))
  assert.ok((res.headers.get('Cache-Control') ?? '').includes('no-store'))
  assert.ok((res.headers.get('Cache-Control') ?? '').includes('private'))
})

// ---------------------------------------------------------------------------
// 10. route matrix completeness — every bullet covered
// ---------------------------------------------------------------------------
test('Core V1: route matrix covers all required areas (no missing bullet)', () => {
  const areas = new Set(CORE_V1_ROUTE_MATRIX.map(r => r.area))
  const required = [
    'Calendar',
    'My Shifts',
    'registration submit',
    'staffing approval visibility',
    'swaps visibility/actions by role',
    'notifications visibility',
    'Staff access',
    'Reports access',
    'Settings/Admin-only access',
  ]
  for (const r of required) assert.ok(areas.has(r), `missing area ${r}`)
})
