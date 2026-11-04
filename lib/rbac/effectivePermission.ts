import type { SystemPermission } from '@/lib/types/database.types'
import { permissionMatrix, type Permission } from '@/lib/permissions'

export type EffectivePermissionSource =
  | 'legacy_default'
  | 'role_override'
  | 'account_allow'
  | 'account_deny'
  | 'hard_restriction'
  | 'expired'
  | 'revoked'
  | 'business_scope'
  | 'invalid_version'

export type ApprovedPermissionOverride = {
  decision: 'allow' | 'deny'
  status: string
  version: number
  currentVersion: number
  effectiveAt: string
  approvedAt: string
  proposedBy: string
  approvedBy: string
  revokedAt?: string | null
}

export type AccountPermissionOverride = {
  decision: 'allow' | 'deny' | 'reset'
  version: number
  currentVersion: number
  expiresAt?: string | null
  revokedAt?: string | null
}

export type EffectivePermission = {
  allowed: boolean
  source: EffectivePermissionSource
  reason: string
  version?: number
}

/** These grants can only be changed by an independently reviewed security release. */
export const HARD_RESTRICTED_PERMISSIONS: ReadonlySet<Permission> = new Set([
  'staff.manage', 'settings.admin', 'permissions.manage', 'audit.restore',
  'audit.review', 'data.force_delete', 'storage.resource_manage',
  'payroll.view_own', 'payroll.manage',
])

const validVersion = (version: number, currentVersion: number) =>
  Number.isSafeInteger(version) && version > 0
  && Number.isSafeInteger(currentVersion) && currentVersion === version

const validDate = (value: string) => Number.isFinite(Date.parse(value))

/** Shared fail-closed policy order used by server guards and capability reporting. */
export function resolveEffectivePermission(input: {
  role: SystemPermission
  permission: Permission
  roleOverride?: ApprovedPermissionOverride | null
  accountOverride?: AccountPermissionOverride | null
  inBusinessScope?: boolean
  now?: number
}): EffectivePermission {
  const { role, permission } = input
  const legacyAllowed = permissionMatrix[role].has(permission)

  if (HARD_RESTRICTED_PERMISSIONS.has(permission)) {
    return {
      allowed: legacyAllowed,
      source: 'hard_restriction',
      reason: 'This permission cannot be changed by role or account overrides.',
    }
  }

  let roleResult: EffectivePermission = {
    allowed: legacyAllowed,
    source: 'legacy_default',
    reason: 'No approved role override; the legacy role matrix applies.',
  }
  const roleOverride = input.roleOverride
  if (roleOverride) {
    if (roleOverride.status !== 'approved'
      || !validVersion(roleOverride.version, roleOverride.currentVersion)
      || !validDate(roleOverride.effectiveAt)
      || !validDate(roleOverride.approvedAt)
      || Date.parse(roleOverride.approvedAt) > (input.now ?? Date.now())
      || Date.parse(roleOverride.effectiveAt) < Date.parse(roleOverride.approvedAt)
      || !roleOverride.proposedBy.trim()
      || !roleOverride.approvedBy.trim()
      || roleOverride.proposedBy === roleOverride.approvedBy
      || (roleOverride.revokedAt != null && !validDate(roleOverride.revokedAt))) {
      return { allowed: false, source: 'invalid_version', reason: 'The approved role configuration is invalid.' }
    }
    if (roleOverride.revokedAt) {
      roleResult = { allowed: legacyAllowed, source: 'revoked', reason: 'The role override was revoked.', version: roleOverride.version }
    } else if (Date.parse(roleOverride.effectiveAt) > (input.now ?? Date.now())) {
      roleResult = { allowed: legacyAllowed, source: 'legacy_default', reason: 'The role override is not effective yet.', version: roleOverride.version }
    } else {
      roleResult = {
        allowed: roleOverride.decision === 'allow',
        source: 'role_override',
        reason: `Approved role override v${roleOverride.version} applies.`,
        version: roleOverride.version,
      }
    }
  }

  const accountOverride = input.accountOverride
  if (accountOverride) {
    if (!validVersion(accountOverride.version, accountOverride.currentVersion)
      || (accountOverride.revokedAt != null && !validDate(accountOverride.revokedAt))) {
      return { allowed: false, source: 'invalid_version', reason: 'The account permission version is invalid.' }
    }
    if (accountOverride.revokedAt) {
      roleResult = { ...roleResult, source: 'revoked', reason: 'The account override was revoked; the role default applies.' }
    } else if (accountOverride.decision === 'reset') {
      roleResult = { ...roleResult, reason: 'The account override was reset; the role default applies.' }
    } else if (accountOverride.expiresAt && !validDate(accountOverride.expiresAt)) {
      return { allowed: false, source: 'invalid_version', reason: 'The account permission expiry is invalid.' }
    } else if (accountOverride.expiresAt && Date.parse(accountOverride.expiresAt) <= (input.now ?? Date.now())) {
      roleResult = { ...roleResult, source: 'expired', reason: 'The account override expired; the role default applies.' }
    } else if (accountOverride.decision === 'deny') {
      roleResult = { allowed: false, source: 'account_deny', reason: 'An active account deny takes precedence.', version: accountOverride.version }
    } else if (!roleResult.allowed) {
      roleResult = { allowed: false, source: 'account_allow', reason: 'Account allow cannot exceed the effective role grant.', version: accountOverride.version }
    } else {
      roleResult = { allowed: true, source: 'account_allow', reason: 'An active account allow applies within the role grant.', version: accountOverride.version }
    }
  }

  if (input.inBusinessScope === false) {
    return { allowed: false, source: 'business_scope', reason: 'The resource is outside the actor business scope.', version: roleResult.version }
  }
  return roleResult
}
