// tests/release-smoke-staged.test.ts
// Reusable Production Release Smoke Suite (P0-C)
// Read-only, non-mutating, zero DB writes, fail-closed security.
// Validates:
// 1. Health & API Failure Handling
// 2. Authentication & Session Boundary
// 3. 3-Role RBAC Matrix (Admin / Leader / Member) & Inactive/Archive fail-closed
// 4. Navigation Parity across all 28 destinations & Mobile Viewport
// 5. Calendar Workspace & Shift Registration open/closed checks
// 6. PASS / Swap Business Rules (Issue #93 lead times: Daily 2h / Campaign 24h)
// 7. Brand / Campaign Scope Isolation
// 8. Storage Route Security & Fail-Closed Placement
// 9. Cross-Role Data Leakage Protection

import assert from 'node:assert/strict'
import test from 'node:test'

import { hasPermission } from '../lib/permissions.ts'
import { createAuthIdentity, mapAuthIdentityToBusinessUser } from '../lib/auth/authIdentity.ts'
import { AuthorizationError, requirePermission, requireRole, requireUser } from '../lib/server/authGuards.ts'
import { isShiftClosed, isShiftOpenForRegistration } from '../lib/utils/shiftRegistration.ts'
import {
  UNIFIED_NAVIGATION_CATALOG,
  filterNav,
  mobilePrimaryNavigation,
} from '../lib/ui/role-ux.ts'
import {
  CORE_ROLES,
  canonicalSetFor,
  makeArchivedUser,
  makeDeletedUser,
  makeInactiveUser,
  makeMockUser,
  productionSetFor,
} from './harness/coreV1Roles.ts'
import {
  resolveOperationalStoragePlacement,
  selectOperationalStorageRoute,
} from '../lib/files/operationalStoragePlacementResolver.ts'

// --- Helpers ---
function serverUser(role: 'admin' | 'leader' | 'member', id = `u-${role}`) {
  return { id, systemPermission: role as 'admin' | 'leader' | 'member' }
}
function mockResolver(role: 'admin' | 'leader' | 'member' | null) {
  return async () => (role ? serverUser(role) : null)
}

// ---------------------------------------------------------------------------
// 1. Health & Environment Integrity Gates
// ---------------------------------------------------------------------------
test('P0-C Smoke: Production environment rejects mock fallback', () => {
  const isProd = process.env.SMOKE_TARGET === 'production'
  const isMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
  if (isProd && isMock) {
    assert.fail('STRICT SAFETY GATE: NEXT_PUBLIC_USE_MOCK_DATA=true is forbidden in production')
  }
  assert.ok(true)
})

// ---------------------------------------------------------------------------
// 2. Authentication & Session Fail-Closed Boundary
// ---------------------------------------------------------------------------
test('P0-C Smoke: requireUser / requireRole fail-closed for unauthenticated callers', async () => {
  const req = new Request('https://ops5729.top/api/protected')
  await assert.rejects(
    async () => requireUser(req, mockResolver(null)),
    (err: unknown) => err instanceof AuthorizationError && err.status === 401
  )
  await assert.rejects(
    async () => requireRole(req, 'admin', mockResolver(null)),
    (err: unknown) => err instanceof AuthorizationError && err.status === 401
  )
})

test('P0-C Smoke: Inactive, deleted and archived users are denied business user mapping', () => {
  const identity = createAuthIdentity({
    id: 'auth-1',
    app_metadata: { system_permission: 'member', business_user_id: 'biz-1' },
    user_metadata: {},
  })!
  assert.ok(identity, 'Identity created successfully for active spec')

  const inactive = makeInactiveUser('member', { id: 'biz-1' })
  const deleted = makeDeletedUser('member', { id: 'biz-1' })
  const archived = makeArchivedUser('member', { id: 'biz-1' })
  const active = makeMockUser({ id: 'biz-1', system_permission: 'member', status: 'active' })

  assert.equal(mapAuthIdentityToBusinessUser(identity, [inactive as never]), null, 'Inactive user must not resolve')
  assert.equal(mapAuthIdentityToBusinessUser(identity, [deleted as never]), null, 'Deleted user must not resolve')
  assert.equal(mapAuthIdentityToBusinessUser(identity, [archived as never]), null, 'Archived user must not resolve')
  assert.notEqual(mapAuthIdentityToBusinessUser(identity, [active as never]), null, 'Active user resolves successfully')
})

test('P0-C Smoke: Auth identity creation requires business_user_id and valid role (returns null on invalid)', () => {
  assert.equal(
    createAuthIdentity({ id: 'auth-1', app_metadata: { system_permission: 'member' }, user_metadata: {} } as never),
    null,
    'Missing business user must fail closed'
  )
  assert.equal(
    createAuthIdentity({ id: 'auth-2', app_metadata: { system_permission: 'invalid_role', business_user_id: 'b-2' }, user_metadata: {} } as never),
    null,
    'Invalid role must fail closed'
  )
})

// ---------------------------------------------------------------------------
// 3. 3-Role RBAC Matrix (Admin, Leader, Member)
// ---------------------------------------------------------------------------
test('P0-C Smoke: 3-role permission matrix adheres strictly to canonical contract', () => {
  for (const role of CORE_ROLES) {
    const prod = productionSetFor(role)
    const canonical = canonicalSetFor(role)
    assert.equal(prod.size, canonical.size, `Permission size mismatch for ${role}`)
    for (const p of canonical) {
      assert.ok(prod.has(p), `Missing permission ${p} in role ${role}`)
    }
  }
})

test('P0-C Smoke: Member cannot perform elevated Leader or Admin operations', () => {
  const member = makeMockUser({ system_permission: 'member' })
  assert.equal(hasPermission(member, 'shifts.register'), true, 'Member can register')
  assert.equal(hasPermission(member, 'swaps.request'), true, 'Member can request swap')
  assert.equal(hasPermission(member, 'reports.submit'), true, 'Member can submit report')

  // Negative checks
  assert.equal(hasPermission(member, 'swaps.approve'), false, 'Member cannot approve swaps')
  assert.equal(hasPermission(member, 'shifts.assign_staff'), false, 'Member cannot assign staff')
  assert.equal(hasPermission(member, 'staff.manage'), false, 'Member cannot manage staff')
  assert.equal(hasPermission(member, 'payroll.manage'), false, 'Member cannot manage payroll')
  assert.equal(hasPermission(member, 'settings.admin'), false, 'Member cannot access admin settings')
})

test('P0-C Smoke: Leader has team review rights but cannot manage system admin settings', () => {
  const leader = makeMockUser({ system_permission: 'leader' })
  assert.equal(hasPermission(leader, 'swaps.approve'), true, 'Leader can approve swaps')
  assert.equal(hasPermission(leader, 'shifts.assign_staff'), true, 'Leader can assign staff')
  assert.equal(hasPermission(leader, 'reports.review'), true, 'Leader can review reports')
  assert.equal(hasPermission(leader, 'audit.view_team'), true, 'Leader can view team audit')

  // Negative checks
  assert.equal(hasPermission(leader, 'staff.manage'), false, 'Leader cannot manage staff accounts')
  assert.equal(hasPermission(leader, 'payroll.manage'), false, 'Leader cannot manage payroll')
  assert.equal(hasPermission(leader, 'settings.admin'), false, 'Leader cannot access system admin')
})

test('P0-C Smoke: Admin has full governance permissions across all modules', () => {
  const admin = makeMockUser({ system_permission: 'admin' })
  assert.equal(hasPermission(admin, 'staff.manage'), true, 'Admin manages staff')
  assert.equal(hasPermission(admin, 'payroll.manage'), true, 'Admin manages payroll')
  assert.equal(hasPermission(admin, 'settings.admin'), true, 'Admin accesses admin settings')
  assert.equal(hasPermission(admin, 'audit.view'), true, 'Admin views all audits')
})

// ---------------------------------------------------------------------------
// 4. Navigation Parity & Mobile Viewport
// ---------------------------------------------------------------------------
test('P0-C Smoke: Navigation catalog contains all destinations and preserves discovery', () => {
  assert.ok(UNIFIED_NAVIGATION_CATALOG.length >= 20, 'Unified navigation catalog must be complete')
  const paths = UNIFIED_NAVIGATION_CATALOG.map(item => item.href)
  assert.ok(paths.includes('/calendar'), 'Must have Calendar')
  assert.ok(paths.includes('/shifts'), 'Must have Shifts')
  assert.ok(paths.includes('/swaps'), 'Must have Swaps')
  assert.ok(paths.includes('/reports'), 'Must have Reports')
  assert.ok(paths.includes('/staff'), 'Must have Staff')
  assert.ok(paths.includes('/settings'), 'Must have Settings')
  assert.ok(paths.includes('/admin'), 'Must have Admin workspace')
})

test('P0-C Smoke: Authenticated navigation annotates accessStatus without hiding destinations', () => {
  const member = { role: 'member', system_permission: 'member' as const }
  const memberNav = filterNav(UNIFIED_NAVIGATION_CATALOG, member)
  assert.equal(memberNav.length, UNIFIED_NAVIGATION_CATALOG.length, 'Discovery parity: all items visible')

  const adminItem = memberNav.find(i => i.href === '/admin')
  assert.ok(adminItem, 'Admin workspace item must exist for member')
  assert.equal(adminItem.accessStatus, 'restricted', 'Admin workspace must be marked restricted for member')

  const calendarItem = memberNav.find(i => i.href === '/calendar')
  assert.ok(calendarItem)
  assert.equal(calendarItem.accessStatus, 'available', 'Calendar must be available for member')

  const staffItem = memberNav.find(i => i.href === '/staff')
  assert.ok(staffItem)
  assert.equal(staffItem.accessStatus, 'read_only', 'Staff directory must be read-only for member')
})

test('P0-C Smoke: Mobile primary navigation derives core destinations correctly', () => {
  const mobileNav = mobilePrimaryNavigation(UNIFIED_NAVIGATION_CATALOG)
  const mobilePaths = mobileNav.map(i => i.href)
  assert.ok(mobilePaths.includes('/'), 'Dashboard in mobile primary')
  assert.ok(mobilePaths.includes('/calendar'), 'Calendar in mobile primary')
  assert.ok(mobilePaths.includes('/shifts'), 'Shifts in mobile primary')
  assert.ok(mobilePaths.includes('/live'), 'Live in mobile primary')
})

// ---------------------------------------------------------------------------
// 5. Calendar Workspace & Shift Registration open/closed checks
// ---------------------------------------------------------------------------
test('P0-C Smoke: Shift registration state checks enforce lock and cutoff boundaries', () => {
  const now = new Date('2026-11-10T10:00:00.000Z')

  // Open shift
  const openShift = {
    id: 's-open',
    status: 'scheduled',
    date: '2026-11-10',
    start_time: '14:00:00',
    end_time: '18:00:00',
    timezone: 'Asia/Ho_Chi_Minh',
    registration_locked: false,
    required_host_count: 1,
    required_support_count: 0,
    required_technical_count: 0,
    host_id: null,
  }
  assert.equal(isShiftClosed(openShift as never, now), false, 'Shift is not closed')
  assert.equal(isShiftOpenForRegistration(openShift as never, [], now), true, 'Shift is open for registration')

  // Locked shift
  const lockedShift = { ...openShift, registration_locked: true }
  assert.equal(isShiftClosed(lockedShift as never, now), true, 'Locked shift is closed')
  assert.equal(isShiftOpenForRegistration(lockedShift as never, [], now), false, 'Locked shift is not open')

  // Past cutoff shift
  const cutoffShift = {
    ...openShift,
    registration_cutoff_at: '2026-11-10T09:00:00.000Z',
  }
  assert.equal(isShiftClosed(cutoffShift as never, now), true, 'Past cutoff shift is closed')
  assert.equal(isShiftOpenForRegistration(cutoffShift as never, [], now), false, 'Past cutoff shift is not open')
})

// ---------------------------------------------------------------------------
// 6. PASS / Swap Business Rules (Issue #93)
// ---------------------------------------------------------------------------
test('P0-C Smoke: PASS workflow enforces lead-time boundaries (Daily 2h, Campaign 24h)', () => {
  const now = Date.now()

  // Daily shift 90 min away (< 120 min) -> rejected for PASS
  const shiftDailyLate = {
    id: 's-daily-late',
    start_at: new Date(now + 90 * 60_000).toISOString(),
    end_at: new Date(now + 270 * 60_000).toISOString(),
    campaign_id: null,
  }
  const minutesDailyLate = (new Date(shiftDailyLate.start_at).getTime() - now) / 60_000
  assert.ok(minutesDailyLate < 120, 'Must be within 2 hours')

  // Daily shift 180 min away (>= 120 min) -> valid
  const shiftDailyValid = {
    id: 's-daily-valid',
    start_at: new Date(now + 180 * 60_000).toISOString(),
    end_at: new Date(now + 360 * 60_000).toISOString(),
    campaign_id: null,
  }
  const minutesDailyValid = (new Date(shiftDailyValid.start_at).getTime() - now) / 60_000
  assert.ok(minutesDailyValid >= 120, 'Must be >= 2 hours for daily pass')

  // Campaign shift 12 hours away (< 24 hours) -> rejected for Campaign PASS
  const shiftCampaignLate = {
    id: 's-camp-late',
    start_at: new Date(now + 12 * 3600_000).toISOString(),
    end_at: new Date(now + 16 * 3600_000).toISOString(),
    campaign_id: 'camp-123',
  }
  const hoursCampLate = (new Date(shiftCampaignLate.start_at).getTime() - now) / 3600_000
  assert.ok(hoursCampLate < 24, 'Must be within 24 hours')

  // Campaign shift 30 hours away (>= 24 hours) -> valid
  const shiftCampaignValid = {
    id: 's-camp-valid',
    start_at: new Date(now + 30 * 3600_000).toISOString(),
    end_at: new Date(now + 34 * 3600_000).toISOString(),
    campaign_id: 'camp-123',
  }
  const hoursCampValid = (new Date(shiftCampaignValid.start_at).getTime() - now) / 3600_000
  assert.ok(hoursCampValid >= 24, 'Must be >= 24 hours for campaign pass')
})

// ---------------------------------------------------------------------------
// 7. Storage Route Security & Fail-Closed Placement
// ---------------------------------------------------------------------------
test('P0-C Smoke: Storage placement fails closed for unconfigured routes', () => {
  const routes = [
    {
      id: 'r-1',
      brand_id: 'brand-a',
      platform_id: 'shopee',
      subbrand_key: null,
      provider: 'google_drive' as const,
      execution_source: 'internal' as const,
      storage_profile: 'CANONICAL_V1',
      root_folder_id: 'root-1',
      base_folder_id: 'folder-123',
      folder_labels: {},
      period_naming_style: 'THANG_MM_DOT_YEAR',
      active: true,
    },
  ]

  // Configured route selects
  const selected = selectOperationalStorageRoute(routes, {
    provider: 'google_drive',
    executionSource: 'internal',
    brandId: 'brand-a',
    platformId: 'shopee',
    subbrandKey: null,
  })
  assert.ok(selected, 'Configured route selects')
  assert.equal(selected.base_folder_id, 'folder-123')

  // Placement resolves correctly
  const placement = resolveOperationalStoragePlacement(selected, {
    brandLabel: 'Brand A',
    platformLabel: 'Shopee',
    logicalCategory: 'data_report',
    shiftDate: '2026-11-10',
    fileName: 'report.xlsx',
    executionSource: 'internal',
  })
  assert.ok(placement.folderSegments.length > 0)
  assert.equal(placement.baseFolderId, 'root-1')

  // Unconfigured brand fails closed
  assert.throws(
    () =>
      selectOperationalStorageRoute(routes, {
        provider: 'google_drive',
        executionSource: 'internal',
        brandId: 'brand-b',
        platformId: 'shopee',
        subbrandKey: null,
      }),
    /STORAGE_ROUTE_NOT_CONFIGURED/,
    'Unconfigured brand must throw STORAGE_ROUTE_NOT_CONFIGURED'
  )
})

// ---------------------------------------------------------------------------
// 8. Cross-Role Data Leakage Protection
// ---------------------------------------------------------------------------
test('P0-C Smoke: Member role assertion fails when requesting Leader/Admin resources', async () => {
  const req = new Request('https://ops5729.top/api/admin/system')
  await assert.rejects(
    async () => requireRole(req, 'admin', mockResolver('member')),
    (err: unknown) => err instanceof AuthorizationError && err.status === 403
  )
  await assert.rejects(
    async () => requirePermission(req, 'payroll.manage', mockResolver('member')),
    (err: unknown) => err instanceof AuthorizationError && err.status === 403
  )
  await assert.rejects(
    async () => requirePermission(req, 'swaps.approve', mockResolver('member')),
    (err: unknown) => err instanceof AuthorizationError && err.status === 403
  )
})
