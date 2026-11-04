import type { Permission } from '@/lib/permissions'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'

/** Permission names accepted by the matching authenticated RPC and RLS policy. */
export const ACCOUNT_OVERRIDE_GRANTABLE_PERMISSIONS = ['audit.view_team'] as const satisfies readonly Permission[]
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
