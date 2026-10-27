import type { SystemPermission } from '@/lib/types/database.types'
import { permissionMatrix, type Permission } from '@/lib/permissions'

export type RoleDefaultsDecision = 'inherit' | 'allow' | 'deny'
export type RoleDefaultsDomain = 'shifts' | 'reports' | 'swaps' | 'profile' | 'staff' | 'catalog' | 'settings' | 'audit' | 'data'
export type RoleDefaultsAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'manage' | 'restore' | 'request' | 'lock'
export type RoleDefaultsCatalogItem = {
  permission: Permission
  module: RoleDefaultsDomain
  action: RoleDefaultsAction
  /** Locked permissions are not mutable until server + every relevant DB policy is proven. */
  locked: boolean
  reason?: string
}
const item = (permission: Permission, module: RoleDefaultsDomain, action: RoleDefaultsAction, reason?: string): RoleDefaultsCatalogItem =>
  ({ permission, module, action, locked: true, ...(reason ? { reason } : {}) })

/**
 * Explicit complete mapping of the RC19 matrix. Catalog does NOT create
 * independent grants. Every item is locked for live activation until its
 * API, RLS/RPC and privileged-service paths are validated and approved.
 */
export const ROLE_DEFAULTS_CATALOG: readonly RoleDefaultsCatalogItem[] = [
  item('shifts.view_assigned', 'shifts', 'view'), item('shifts.view_open', 'shifts', 'view'),
  item('shifts.register', 'shifts', 'create'), item('shifts.cancel_registration', 'shifts', 'delete'),
  item('shifts.approve_registration', 'shifts', 'approve'), item('shifts.assign_staff', 'shifts', 'edit'),
  item('shifts.edit', 'shifts', 'edit'), item('shifts.delete', 'shifts', 'delete'),
  item('shifts.lock', 'shifts', 'lock'), item('shifts.import', 'shifts', 'create'),
  item('shifts.export', 'shifts', 'export'),
  item('reports.submit', 'reports', 'create', 'REPORTS #84 RLS/RPC scope must remain intact'),
  item('reports.review', 'reports', 'approve', 'REPORTS #84 RLS/RPC scope must remain intact'),
  item('reports.export', 'reports', 'export', 'REPORTS #84 export and artifacts policy'),
  item('swaps.request', 'swaps', 'request'), item('swaps.approve', 'swaps', 'approve'),
  item('swaps.export', 'swaps', 'export'), item('profile.edit_own', 'profile', 'edit'),
  item('staff.manage', 'staff', 'manage', 'Admin management and last-admin protection'),
  item('brands.manage', 'catalog', 'manage'), item('platforms.manage', 'catalog', 'manage'),
  item('campaigns.manage', 'catalog', 'manage'), item('campaigns.edit_operational', 'catalog', 'edit'),
  item('settings.member', 'settings', 'view'), item('settings.leader', 'settings', 'view'),
  item('settings.admin', 'settings', 'manage', 'Bootstrap privilege locked'),
  item('permissions.manage', 'settings', 'manage', 'Bootstrap privilege locked; no self-escalation'),
  item('audit.view', 'audit', 'view'), item('audit.view_team', 'audit', 'view'),
  item('audit.restore', 'audit', 'restore'), item('audit.review', 'audit', 'approve'),
  item('data.force_delete', 'data', 'delete', 'Destructive capability locked'),
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
      allowed: entry.locked ? legacy : (decision === 'deny' ? false : legacy),
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
    // Non-privileged deny proposals may be saved for review but NEVER become effective
    // while the DB/server enforcement attestation gate remains disabled.
    if (entry.reason && value === 'deny') return { ok: false, code: 'SECURITY_BOUNDARY_LOCKED' }
    if (value === 'allow' && !permissionMatrix[role].has(permission)) return { ok: false, code: 'PRIVILEGE_ESCALATION_DENIED' }
  }
  return { ok: true }
}
