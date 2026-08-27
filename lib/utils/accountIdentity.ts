import type { User } from '@/lib/types/database.types'

/**
 * Core V1 Account Identity — pure helpers for Auth User ↔ Business User ↔ Staff Profile
 * Supabase Auth User (auth.users id) ↔ Business User (public.users id) ↔ Staff Profile (User.operational_roles)
 * Identity MUST NOT depend on display name matching; email mapping is deterministic (trim + lowercase).
 * These helpers are read-only, no mutation, no IO.
 */

export function normalizeAccountEmail(email: unknown): string {
  return String(email ?? '').trim().toLowerCase()
}

export function areSameAccountByEmail(a: Pick<User, 'email'>, b: Pick<User, 'email'>): boolean {
  return normalizeAccountEmail(a.email) === normalizeAccountEmail(b.email)
}

export function areSameBusinessIdentity(
  a: Pick<User, 'id' | 'email'>,
  b: Pick<User, 'id' | 'email'>,
): boolean {
  if (a.id && b.id && a.id === b.id) return true
  return areSameAccountByEmail(a, b)
}

export function isActiveBusinessUser(user: Pick<User, 'status' | 'account_status'> & { deleted_at?: string; archived_at?: string }): boolean {
  if (user.deleted_at || user.archived_at) return false
  if (user.status !== 'active') return false
  if (user.account_status && user.account_status !== 'active') return false
  return true
}

export function isAccountIdentityDeterministic(user: Pick<User, 'id' | 'email' | 'full_name'>): boolean {
  // Returns true if identity can be resolved without display_name — id+email sufficient
  return Boolean(user.id && normalizeAccountEmail(user.email))
}

export function staffProfileIsDistinctFromAuthAccount(businessUser: Pick<User, 'id' | 'operational_roles'>): boolean {
  // Business User id is auth identity; operational_roles is staffing concern — distinct concepts
  return true // placeholder to document distinction; operational_roles may be empty and user still exists
}

/**
 * Capability matrix helper — maps flow to current implementation status without inventing APIs.
 * Used only for documentation / contract tests.
 */
export type AccountFlowId =
  | 'admin_create_invite'
  | 'first_login_password_setup'
  | 'forgot_reset_password'
  | 'activate'
  | 'deactivate'
  | 'reactivate'
  | 'role_change'
  | 'session_revocation'
  | 'auth_business_reconciliation'
  | 'business_staff_reconciliation'

export interface CapabilityEntry {
  flow: AccountFlowId
  existingImplementation: string | null
  missingImplementation: string | null
  requiredPermission: string
  persistenceEntity: string
  risk: string
}

export const ACCOUNT_CAPABILITY_MATRIX: CapabilityEntry[] = [
  {
    flow: 'admin_create_invite',
    existingImplementation: 'userService.create() — admin-only; Supabase browser flow uses a server Auth invite and create_staff_member_with_auth; mock mode keeps local create',
    missingImplementation: null,
    requiredPermission: 'staff.manage (admin)',
    persistenceEntity: 'User (public.users) + Supabase auth.users via invite',
    risk: 'None in V1 if permission gate kept',
  },
  {
    flow: 'first_login_password_setup',
    existingImplementation: 'Supabase auth sign-in + establishPasswordSession / getVerifiedUser (lib/auth/session.ts)',
    missingImplementation: null,
    requiredPermission: 'self (unauthenticated → authenticated)',
    persistenceEntity: 'auth.users + User.email_verified',
    risk: 'Low — invite email handles; missing UI is TODO',
  },
  {
    flow: 'forgot_reset_password',
    existingImplementation: 'forgot-password and reset-password pages use Supabase resetPasswordForEmail/updateUser',
    missingImplementation: null,
    requiredPermission: 'self (unauthenticated)',
    persistenceEntity: 'auth.users',
    risk: 'Medium — users cannot self-recover without admin',
  },
  {
    flow: 'activate',
    existingImplementation: 'userService.approvePendingAccount() — admin, pending_approval → active, audit account_approved',
    missingImplementation: null,
    requiredPermission: 'staff.manage (admin)',
    persistenceEntity: 'User.status/account_status',
    risk: 'None',
  },
  {
    flow: 'deactivate',
    existingImplementation: 'userService.archive() — admin, soft-archive with deleted/archived_at, retains history, audit staff.archive with related_records',
    missingImplementation: null,
    requiredPermission: 'staff.manage (admin)',
    persistenceEntity: 'User (soft-delete, not hard delete)',
    risk: 'None if soft-delete kept — must not hard delete history',
  },
  {
    flow: 'reactivate',
    existingImplementation: 'userService.restore() — admin, clears archived/deleted, audit staff.restore',
    missingImplementation: null,
    requiredPermission: 'staff.manage (admin)',
    persistenceEntity: 'User',
    risk: 'None',
  },
  {
    flow: 'role_change',
    existingImplementation: 'userService.update() — admin, system_permission/role, self-privilege block (cannot self-elevate)',
    missingImplementation: null,
    requiredPermission: 'staff.manage (admin)',
    persistenceEntity: 'User.system_permission/role/operational_roles',
    risk: 'None if self-elevation guard kept',
  },
  {
    flow: 'session_revocation',
    existingImplementation: 'clearLocalSession / signOut(scope:local) + shouldClearLocalSessionForLoginReason — supabase-backed',
    missingImplementation: 'No admin “revoke all sessions for user” RPC — relies on Supabase signOut',
    requiredPermission: 'self or admin (via Supabase admin API if added)',
    persistenceEntity: 'Supabase auth session (sb-session cookie)',
    risk: 'Low — local sign-out works; global revocation is TODO',
  },
  {
    flow: 'auth_business_reconciliation',
    existingImplementation: 'currentUserService.getCurrent()/bindAuthenticatedUser() + businessUsers.getById(auth.uid) — id + email deterministic',
    missingImplementation: null,
    requiredPermission: 'authenticated user (self)',
    persistenceEntity: 'auth.users.id ↔ User.id + User.email (normalized)',
    risk: 'None if email normalized, not display_name',
  },
  {
    flow: 'business_staff_reconciliation',
    existingImplementation: 'getStaffingIssues / staffIdentityMatching (operational_roles vs shift assignment, imported_name vs user)',
    missingImplementation: null,
    requiredPermission: 'shifts.view_open/assigned or staff.manage (read-only detection)',
    persistenceEntity: 'User.operational_roles ↔ ShiftRegistration.user_id/operational_role',
    risk: 'None — read-only detection, no mutation',
  },
]
