// tests/harness/routeAccessExpectations.ts
// Declarative Core V1 route/feature matrix — test infrastructure only.
// Each entry encodes authoritative expectation for automated checks.
// Derive expectations from actual code inspections of lib/permissions, components, and pages.
// If product behavior changes intentionally, update this file in same PR.

import type { CoreRole } from './coreV1Roles.ts'

export type AccessExpectation = 'visible' | 'hidden' | 'read_only' | 'manage'

export interface RouteExpectation {
  id: string
  // human-readable area mapping to task bullet
  area: string
  path: string
  // null = any authenticated user can view (no permission gate)
  requiredPermissions: readonly string[] | null
  // for visibility checks: which roles can see the page/nav
  visibility: Record<CoreRole, AccessExpectation>
  // optional action gate separate from page visibility
  actionGate?: { action: string; requiredPermissions: readonly string[]; allowed: Record<CoreRole, boolean> }
  notes?: string
}

// Canonical Core V1 matrix (13 bullet areas)
export const CORE_V1_ROUTE_MATRIX: readonly RouteExpectation[] = [
  // 1. Calendar — visible to all authenticated (shifts.view_*), but import/bulk-staffing gated to leader+
  {
    id: 'calendar',
    area: 'Calendar',
    path: '/calendar',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    actionGate: { action: 'staffing approval (approve/assign)', requiredPermissions: ['shifts.approve_registration', 'shifts.assign_staff'], allowed: { admin: true, leader: true, member: false } },
    notes: 'CalendarWorkspace; BulkStaffingApprovalDialog requires shifts.approve_registration',
  },
  // 2. My Shifts — derived from Calendar/shift-registration; same visibility
  {
    id: 'my-shifts',
    area: 'My Shifts',
    path: '/calendar',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    notes: 'My Shifts is a filtered view within Calendar; eligibility via operational_roles + shifts.register',
  },
  // 3. Registration submit
  {
    id: 'registration-submit',
    area: 'registration submit',
    path: '/calendar',
    requiredPermissions: ['shifts.register'],
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    notes: 'shifts.register present for all 3 roles (member baseline). Eligibility additionally requires operational_roles.',
  },
  // 4. Staffing approval visibility
  {
    id: 'staffing-approval',
    area: 'staffing approval visibility',
    path: '/calendar',
    requiredPermissions: ['shifts.approve_registration'],
    visibility: { admin: 'visible', leader: 'visible', member: 'hidden' },
    notes: 'Pending registrations review / BulkStaffingApproval visible only to leader+admin; member must not see approval queue',
  },
  // 5. Swaps visibility/actions
  {
    id: 'swaps',
    area: 'swaps visibility/actions by role',
    path: '/swaps',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    actionGate: { action: 'swaps.approve', requiredPermissions: ['swaps.approve'], allowed: { admin: true, leader: true, member: false } },
    notes: 'All roles can view/swap request (swaps.request). Only leader/admin can approve (swaps.approve) when status=accepted.',
  },
  // 6. Notifications visibility
  {
    id: 'notifications',
    area: 'notifications visibility',
    path: '/notifications',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    notes: 'No permission gate; filtered to current user via notificationService.getForCurrentUser()',
  },
  // 7. Staff access
  {
    id: 'staff',
    area: 'Staff access',
    path: '/staff',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'read_only' },
    actionGate: { action: 'staff.manage', requiredPermissions: ['staff.manage'], allowed: { admin: true, leader: false, member: false } },
    notes: 'Member sees only self (StaffList visibleStaff filter). Admin can manage/archived. Leader visible but no manage.',
  },
  // 8. Reports access
  {
    id: 'reports',
    area: 'Reports access',
    path: '/reports',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    actionGate: { action: 'reports.review', requiredPermissions: ['reports.review'], allowed: { admin: true, leader: true, member: false } },
    notes: 'All can submit (reports.submit includes member). Only leader/admin can review (reports.review).',
  },
  // 9. Settings/Admin-only
  {
    id: 'settings',
    area: 'Settings/Admin-only access',
    path: '/settings',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
    actionGate: { action: 'settings.admin tabs', requiredPermissions: ['settings.admin'], allowed: { admin: true, leader: false, member: false } },
    notes: 'Personal tab for all; team tab requires settings.leader; system/audit/integrations require settings.admin (admin only).',
  },
  // 10. Dashboard/analytics (additional; implied)
  {
    id: 'dashboard',
    area: 'Dashboard',
    path: '/',
    requiredPermissions: null,
    visibility: { admin: 'visible', leader: 'visible', member: 'visible' },
  },
  // 11. Audit (restricted nav item)
  {
    id: 'audit',
    area: 'Audit restricted',
    path: '/audit',
    requiredPermissions: ['audit.view', 'audit.view_team'],
    visibility: { admin: 'visible', leader: 'visible', member: 'hidden' },
    notes: 'Sidebar filters Audit nav to hasAnyPermission(audit.view|audit.view_team)',
  },
] as const

// --- Helper predicates that mirror production gating logic (for deterministic tests) ---
export function expectVisibleFor(role: CoreRole, id: string): boolean {
  const row = CORE_V1_ROUTE_MATRIX.find(r => r.id === id)
  if (!row) throw new Error(`Unknown route id: ${id}`)
  return row.visibility[role] !== 'hidden'
}

export const PROTECTED_PATHS = CORE_V1_ROUTE_MATRIX.map(r => r.path)
