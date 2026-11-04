import type { Permission } from '@/lib/permissions'
import type { SystemPermission } from '@/lib/types/database.types'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'

/** Permission names accepted by the matching authenticated RPC and RLS policy. */
export const ACCOUNT_OVERRIDE_GRANTABLE_ROLES = {
  'audit.view_team': ['leader'],
} as const satisfies Partial<Record<Permission, readonly SystemPermission[]>>
export const ACCOUNT_OVERRIDE_GRANTABLE_PERMISSIONS = Object.keys(ACCOUNT_OVERRIDE_GRANTABLE_ROLES) as [keyof typeof ACCOUNT_OVERRIDE_GRANTABLE_ROLES]
const grantable = new Set<Permission>(ACCOUNT_OVERRIDE_GRANTABLE_PERMISSIONS)

export const ACCOUNT_OVERRIDE_CATALOG = ROLE_DEFAULTS_CATALOG.map(entry => ({
  permission: entry.permission,
  grantable: grantable.has(entry.permission),
  reason: grantable.has(entry.permission)
    ? 'Authenticated database enforcement is available for this permission.'
    : entry.reason ?? 'Account changes remain locked until server, RPC, and RLS enforcement are covered.',
}))

export function isAccountOverrideGrantable(permission: Permission): boolean {
  return grantable.has(permission)
}

export function isAccountOverrideGrantableForRole(permission: Permission, role: SystemPermission): boolean {
  const roles = (ACCOUNT_OVERRIDE_GRANTABLE_ROLES as Partial<Record<Permission, readonly SystemPermission[]>>)[permission]
  return roles?.includes(role) ?? false
}
