import assert from 'node:assert/strict'
import test from 'node:test'
import { ROLE_DEFAULTS_CATALOG } from '../lib/rbac/roleDefaults.ts'
import { ACCOUNT_OVERRIDE_CATALOG, ACCOUNT_OVERRIDE_GRANTABLE_PERMISSIONS } from '../lib/rbac/accountOverrideCatalog.ts'
import { HARD_RESTRICTED_PERMISSIONS, resolveEffectivePermission } from '../lib/rbac/effectivePermission.ts'

const base = {
  role: 'leader' as const,
  permission: 'reports.review' as const,
  now: Date.parse('2026-11-04T00:00:00.000Z'),
}
const approvedRoleDeny = {
  decision: 'deny' as const, status: 'approved', version: 3, currentVersion: 3,
  effectiveAt: '2026-11-03T00:00:00.000Z', approvedAt: '2026-11-02T00:00:00.000Z',
  proposedBy: 'admin-a', approvedBy: 'admin-b',
}

test('effective permission resolver keeps legacy fallback and independent approved role changes', () => {
  assert.deepEqual(resolveEffectivePermission(base), {
    allowed: true, source: 'legacy_default', reason: 'No approved role override; the legacy role matrix applies.',
  })
  const denied = resolveEffectivePermission({ ...base, roleOverride: approvedRoleDeny })
  assert.equal(denied.allowed, false)
  assert.equal(denied.source, 'role_override')
})

test('account deny wins; allow cannot exceed role baseline; reset, expiry and revoke fall back', () => {
  const denied = resolveEffectivePermission({ ...base, roleOverride: { ...approvedRoleDeny, decision: 'allow' },
    accountOverride: { decision: 'deny', version: 2, currentVersion: 2 } })
  assert.equal(denied.allowed, false)
  assert.equal(denied.source, 'account_deny')

  const noBaseline = resolveEffectivePermission({ role: 'member', permission: 'reports.review', now: base.now,
    accountOverride: { decision: 'allow', version: 1, currentVersion: 1 } })
  assert.equal(noBaseline.allowed, false)
  assert.equal(noBaseline.source, 'account_allow')

  for (const [override, expectedSource] of [
    [{ decision: 'deny', version: 1, currentVersion: 1, expiresAt: '2026-11-03T00:00:00Z' }, 'expired'],
    [{ decision: 'deny', version: 1, currentVersion: 1, revokedAt: '2026-11-03T00:00:00Z' }, 'revoked'],
    [{ decision: 'reset', version: 1, currentVersion: 1 }, 'legacy_default'],
  ] as const) {
    const result = resolveEffectivePermission({ ...base, accountOverride: override as never })
    assert.equal(result.allowed, true)
    assert.equal(result.source, expectedSource)
  }
})

test('hard restrictions, stale versions, self-approval and business scope fail closed', () => {
  assert.ok(HARD_RESTRICTED_PERMISSIONS.has('permissions.manage'))
  assert.ok(HARD_RESTRICTED_PERMISSIONS.has('payroll.manage'))
  assert.equal(resolveEffectivePermission({ role: 'admin', permission: 'permissions.manage',
    roleOverride: { ...approvedRoleDeny, decision: 'deny' } }).allowed, true)
  assert.equal(resolveEffectivePermission({ ...base, inBusinessScope: false }).source, 'business_scope')
  assert.equal(resolveEffectivePermission({ ...base, accountOverride: {
    decision: 'allow', version: 1, currentVersion: 2,
  } }).source, 'invalid_version')
  assert.equal(resolveEffectivePermission({ ...base, roleOverride: {
    ...approvedRoleDeny, approvedBy: approvedRoleDeny.proposedBy,
  } }).source, 'invalid_version')
  assert.equal(resolveEffectivePermission({ ...base, roleOverride: {
    ...approvedRoleDeny, status: 'proposed',
  } }).allowed, false)
})

test('account override grantability is explicit and excludes hard admin permissions', () => {
  assert.deepEqual(ACCOUNT_OVERRIDE_GRANTABLE_PERMISSIONS, ['audit.view_team'])
  assert.equal(ACCOUNT_OVERRIDE_CATALOG.some(item => item.permission === 'permissions.manage' && item.grantable), false)
  assert.equal(ACCOUNT_OVERRIDE_CATALOG.some(item => item.permission === 'payroll.manage' && item.grantable), false)
  assert.equal(ACCOUNT_OVERRIDE_CATALOG.length, ROLE_DEFAULTS_CATALOG.length)
})
