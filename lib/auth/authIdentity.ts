import type { SystemPermission, User, UserRole } from '@/lib/types/database.types'
import { normalizeAccountEmail } from '@/lib/utils/accountIdentity'

export interface AuthIdentity {
  auth_user_id: string
  email?: string
  display_name?: string
  avatar_url?: string
  system_permission: SystemPermission
  business_user_id: string
}

export interface AuthUserSource {
  id?: unknown
  email?: unknown
  app_metadata?: unknown
  user_metadata?: unknown
}

function isSystemPermission(value: unknown): value is SystemPermission {
  return value === 'member' || value === 'leader' || value === 'admin'
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function businessUserId(value: unknown): string | undefined {
  const stringValue = nonEmptyString(value)
  if (stringValue) return stringValue
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : undefined
}

export function createAuthIdentity(source: AuthUserSource | null | undefined): AuthIdentity | null {
  if (!source) return null

  const authUserId = nonEmptyString(source.id)
  const appMetadata = record(source.app_metadata)
  const permission = appMetadata?.system_permission
  const mappedBusinessUserId = businessUserId(appMetadata?.business_user_id)

  if (
    !authUserId
    || !isSystemPermission(permission)
    || !mappedBusinessUserId
  ) {
    return null
  }

  const displayMetadata = record(source.user_metadata)
  return {
    auth_user_id: authUserId,
    email: nonEmptyString(source.email),
    display_name: nonEmptyString(displayMetadata?.full_name)
      || nonEmptyString(displayMetadata?.name),
    avatar_url: nonEmptyString(displayMetadata?.avatar_url)
      || nonEmptyString(displayMetadata?.picture),
    system_permission: permission,
    business_user_id: mappedBusinessUserId,
  }
}

function legacyRoleFor(permission: SystemPermission): UserRole {
  if (permission === 'admin') return 'admin'
  if (permission === 'leader') return 'leader'
  return 'staff'
}

export function mapAuthIdentityToBusinessUser(
  identity: AuthIdentity,
  businessUsers: readonly User[],
): User | null {
  const businessUser = businessUsers.find(candidate =>
    candidate.id === identity.business_user_id
    && candidate.status === 'active'
    && !candidate.archived_at
    && !candidate.deleted_at
  )
  if (!businessUser) return null

  return {
    ...businessUser,
    role: legacyRoleFor(identity.system_permission),
    system_permission: identity.system_permission,
    operational_roles: businessUser.operational_roles
      ? [...businessUser.operational_roles]
      : [],
  }
}

/** Server callers use this explicit check before accepting the mapping. */
export function isAuthBusinessIdentityConsistent(
  identity: AuthIdentity,
  businessUser: Pick<User, 'id' | 'email'>,
): boolean {
  return identity.business_user_id === businessUser.id
    && (!identity.email || normalizeAccountEmail(identity.email) === normalizeAccountEmail(businessUser.email))
}
