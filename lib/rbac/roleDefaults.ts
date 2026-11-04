import type { SystemPermission } from '@/lib/types/database.types'
import { permissionMatrix, type Permission } from '@/lib/permissions'

export type RoleDefaultsDecision = 'inherit' | 'allow' | 'deny'
export type RoleDefaultsDomain = 'shifts' | 'reports' | 'swaps' | 'profile' | 'staff' | 'catalog' | 'settings' | 'audit' | 'data' | 'attendance' | 'storage' | 'payroll'
export type RoleDefaultsAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage' | 'restore' | 'request' | 'lock' | 'upload'
export type RoleDefaultsCatalogItem = {
  permission: Permission
  module: RoleDefaultsDomain
  action: RoleDefaultsAction
  /** Locked permissions are not mutable until server + every relevant DB policy is proven. */
  locked: boolean
  configurableRoles?: readonly SystemPermission[]
  reason?: string
}
const item = (permission: Permission, module: RoleDefaultsDomain, action: RoleDefaultsAction, reason?: string): RoleDefaultsCatalogItem =>
  ({ permission, module, action, locked: true, ...(reason ? { reason } : {}) })
const configurable = (permission: Permission, module: RoleDefaultsDomain, action: RoleDefaultsAction,
  roles: readonly SystemPermission[]): RoleDefaultsCatalogItem =>
  ({ ...item(permission, module, action), locked: false, configurableRoles: roles })

/**
 * Explicit complete mapping of the RC19 matrix. Catalog does NOT create
 * independent grants. Only permissions with authenticated server/RPC checks
 * and retained business scope are mutable; finance and bootstrap rights stay locked.
 */
export const ROLE_DEFAULTS_CATALOG: readonly RoleDefaultsCatalogItem[] = [
  configurable('shifts.view_assigned', 'shifts', 'view', ['member','leader','admin']), item('shifts.view_open', 'shifts', 'view'),
  item('shifts.register', 'shifts', 'create'), item('shifts.cancel_registration', 'shifts', 'delete'),
  item('shifts.approve_registration', 'shifts', 'approve'), configurable('shifts.assign_staff', 'shifts', 'edit', ['leader','admin']),
  item('shifts.edit', 'shifts', 'edit'), item('shifts.delete', 'shifts', 'delete'),
  item('shifts.lock', 'shifts', 'lock'), configurable('shifts.import', 'shifts', 'create', ['leader','admin']),
  configurable('shifts.export', 'shifts', 'export', ['leader','admin']),
  configurable('reports.submit', 'reports', 'create', ['member','leader','admin']),
  configurable('reports.review', 'reports', 'approve', ['leader','admin']),
  item('reports.export', 'reports', 'export', 'Leader Brand scope is not backed by an authoritative database relation.'),
  configurable('swaps.request', 'swaps', 'request', ['member','leader','admin']),
  configurable('swaps.approve', 'swaps', 'approve', ['leader','admin']),
  item('swaps.export', 'swaps', 'export'), item('profile.edit_own', 'profile', 'edit'),
  item('staff.manage', 'staff', 'manage', 'Admin management and last-admin protection'),
  item('brands.manage', 'catalog', 'manage'), item('platforms.manage', 'catalog', 'manage'),
  item('campaigns.manage', 'catalog', 'manage'), item('campaigns.edit_operational', 'catalog', 'edit'),
  item('settings.member', 'settings', 'view'), item('settings.leader', 'settings', 'view'),
  item('settings.admin', 'settings', 'manage', 'Bootstrap privilege locked'),
  item('permissions.manage', 'settings', 'manage', 'Bootstrap privilege locked; no self-escalation'),
  item('audit.view', 'audit', 'view'), { ...item('audit.view_team', 'audit', 'view'), locked: false, configurableRoles: ['leader'] },
  item('audit.restore', 'audit', 'restore', 'Audit integrity boundary locked'), item('audit.review', 'audit', 'approve', 'Audit approval boundary locked'),
  item('data.force_delete', 'data', 'delete', 'Destructive capability locked'),
  configurable('attendance.record_own', 'attendance', 'create', ['member','leader','admin']),
  configurable('storage.upload', 'storage', 'upload', ['member','leader','admin']),
  configurable('storage.edit_own', 'storage', 'edit', ['member','leader','admin']),
  configurable('storage.delete', 'storage', 'delete', ['leader','admin']),
  item('storage.resource_manage', 'storage', 'manage', 'Resource scope and ACL checks remain in the database RPC'),
  item('payroll.view_own', 'payroll', 'view', 'Self-only locked payslip reads remain authoritative'),
  item('payroll.manage', 'payroll', 'manage', 'Payroll administration is isolated from account overrides'),
] as const

export const RBAC01_ISOLATED_DOMAINS = ['finance', 'payroll', 'provider_credentials', 'private_storage'] as const
export type RoleDefaultConfiguration = {
  version: number
  role: SystemPermission
  decisions: Partial<Record<Permission, RoleDefaultsDecision>>
  status: 'proposed' | 'approved' | 'rolled_back'
  proposedBy?: string
  approvedBy?: string
  approvedAt?: string
}
/** Legacy matrix is authoritative when no approved configuration exists. */
export function previewRoleDefaults(
  role: SystemPermission,
  overrides: Partial<Record<Permission, RoleDefaultsDecision>> = {},
): Readonly<Record<Permission, { allowed: boolean; legacy: boolean; decision: RoleDefaultsDecision; locked: boolean; proposedAllowed: boolean }>> {
  const result = {} as Record<Permission, { allowed: boolean; legacy: boolean; decision: RoleDefaultsDecision; locked: boolean; proposedAllowed: boolean }>
  for (const entry of ROLE_DEFAULTS_CATALOG) {
    const legacy = permissionMatrix[role].has(entry.permission)
    const decision = overrides[entry.permission] ?? 'inherit'
    result[entry.permission] = {
      legacy,
      // Never unlock new privilege. Locked permissions stay exactly RC19.
      allowed: legacy, // Preview NEVER changes effective access before independently approved DB enforcement
      decision,
      locked: entry.locked,
      proposedAllowed: decision === 'deny' ? false : legacy,
    }
  }
  return result
}
export function validateRoleDefaultProposal(
  role: SystemPermission,
  decisions: Record<string, unknown>,
): { ok: true } | { ok: false; code: string } {
  if (!['member', 'leader', 'admin'].includes(role)) return { ok: false, code: 'ROLE_INVALID' }
  if (!decisions || Array.isArray(decisions) || typeof decisions !== 'object') return { ok: false, code: 'DECISIONS_INVALID' }
  const catalog = new Map(ROLE_DEFAULTS_CATALOG.map(entry => [entry.permission, entry]))
  for (const [key, value] of Object.entries(decisions)) {
    const permission = key as Permission
    const entry = catalog.get(permission)
    if (!entry || !['inherit', 'allow', 'deny'].includes(String(value))) return { ok: false, code: 'PERMISSION_INVALID' }
    if (value === 'allow' && !permissionMatrix[role].has(permission)) return { ok: false, code: 'PRIVILEGE_ESCALATION_DENIED' }
    if (value === 'deny' && !permissionMatrix[role].has(permission)) return { ok: false, code: 'NOT_A_LEGACY_GRANT' }
    if (entry.locked || (entry.configurableRoles && !entry.configurableRoles.includes(role))) {
      return { ok: false, code: 'SECURITY_BOUNDARY_LOCKED' }
    }
  }
  return { ok: true }
}
