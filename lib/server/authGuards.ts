import type { SystemPermission } from '@/lib/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuthIdentity, mapAuthIdentityToBusinessUser } from '@/lib/auth/authIdentity'
import { createSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'
import { permissionMatrix, type Permission } from '@/lib/permissions'
import { HARD_RESTRICTED_PERMISSIONS, resolveEffectivePermission } from '@/lib/rbac/effectivePermission'
import { createClient } from '@/lib/supabase/server'

export interface AuthenticatedServerUser {
  id: string
  email?: string
  systemPermission: SystemPermission
  businessUserId?: string
  role?: string
  isOwner?: boolean
}

export type ServerUserResolver = (
  request: Request,
) => Promise<AuthenticatedServerUser | null>

export interface ServerUserResolutionDiagnostics {
  authenticatedUserResolved: boolean
  businessUserMapped: boolean
}

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403 | 503,
    public readonly code: 'AUTHENTICATION_REQUIRED' | 'PERMISSION_DENIED' | 'RBAC_AUTHORIZATION_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export async function resolveServerUser(
  request: Request,
  diagnostics?: ServerUserResolutionDiagnostics,
): Promise<AuthenticatedServerUser | null> {
  void request
  if (diagnostics) {
    diagnostics.authenticatedUserResolved = false
    diagnostics.businessUserMapped = false
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL
    || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null
  }

  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) return null
    if (diagnostics) diagnostics.authenticatedUserResolved = true

    const identity = createAuthIdentity(user)
    if (!identity) return null
    const persistedBusinessUser = await createSupabaseMasterDataRepository(supabase)
      .businessUsers.getByAuthIdentity(identity)
    if (
      !persistedBusinessUser
      || !mapAuthIdentityToBusinessUser(identity, [persistedBusinessUser])
    ) return null
    if (diagnostics) diagnostics.businessUserMapped = true

    const businessUserRecord = persistedBusinessUser as unknown as Record<string, unknown>
    const appMetadata = user.app_metadata as Record<string, unknown> | undefined
    return {
      id: identity.auth_user_id,
      email: identity.email,
      systemPermission: identity.system_permission,
      businessUserId: identity.business_user_id,
      role: typeof businessUserRecord.role === 'string' ? businessUserRecord.role : undefined,
      isOwner: Boolean(businessUserRecord.role === 'owner' || appMetadata?.is_owner === true),
    }
  } catch {
    return null
  }
}

export async function requireUser(
  request: Request,
  resolveUser: ServerUserResolver = resolveServerUser,
): Promise<AuthenticatedServerUser> {
  const user = await resolveUser(request)
  if (!user) {
    throw new AuthorizationError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    )
  }
  return user
}

export async function requirePermission(
  request: Request,
  permission: Permission,
  resolveUser: ServerUserResolver = resolveServerUser,
  createPermissionClient: () => Promise<Pick<SupabaseClient, 'rpc'>> = createClient,
): Promise<AuthenticatedServerUser> {
  const user = await requireUser(request, resolveUser)
  let effective = resolveEffectivePermission({ role: user.systemPermission, permission })
  if (process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT === 'true') {
    if (!user.businessUserId) {
      throw new AuthorizationError(403, 'PERMISSION_DENIED', 'A verified business account is required.')
    }
    try {
      const { data, error } = await (await createPermissionClient()).rpc(
        'rbac_permission_decision', { p_permission: permission },
      )
      if (error || !isDatabasePermissionDecision(data)
        || data.actor_business_user_id !== user.businessUserId
        || data.role !== user.systemPermission
        || data.permission !== permission
        || (HARD_RESTRICTED_PERMISSIONS.has(permission)
          && data.allowed !== permissionMatrix[user.systemPermission].has(permission))) {
        throw new Error('RBAC_PERMISSION_DECISION_INVALID')
      }
      effective = { allowed: data.allowed, source: data.source, reason: data.reason,
        ...(typeof data.version === 'number' ? { version: data.version } : {}) }
    } catch {
      throw new AuthorizationError(
        503,
        'RBAC_AUTHORIZATION_UNAVAILABLE',
        'Permission state is temporarily unavailable.',
      )
    }
  }
  if (!effective.allowed) {
    console.warn('OPS_PERMISSION_DENIED', {
      route: new URL(request.url).pathname,
      requiredPermission: permission,
      actorPermission: user.systemPermission,
      source: effective.source,
    })
    throw new AuthorizationError(
      403,
      'PERMISSION_DENIED',
      'You do not have permission to perform this action.',
    )
  }
  return user
}

const permissionSources = new Set([
  'legacy_default', 'role_override', 'account_allow', 'account_deny',
  'hard_restriction', 'expired', 'revoked', 'business_scope', 'invalid_version',
])

export type DatabasePermissionDecision = {
  actor_business_user_id: string
  role: SystemPermission
  permission: string
  allowed: boolean
  source: 'legacy_default' | 'role_override' | 'account_allow' | 'account_deny'
    | 'hard_restriction' | 'expired' | 'revoked' | 'business_scope' | 'invalid_version'
  reason: string
  version: number | null
  expires_at: string | null
  effective_at: string | null
}

export function isDatabasePermissionDecision(value: unknown): value is DatabasePermissionDecision {
  if (!value || typeof value !== 'object') return false
  const decision = value as Record<string, unknown>
  return typeof decision.actor_business_user_id === 'string'
    && ['member', 'leader', 'admin'].includes(String(decision.role))
    && typeof decision.permission === 'string'
    && typeof decision.allowed === 'boolean'
    && typeof decision.source === 'string' && permissionSources.has(decision.source)
    && typeof decision.reason === 'string'
    && (decision.version === null || (typeof decision.version === 'number' && Number.isSafeInteger(decision.version)))
    && (decision.expires_at === null || (typeof decision.expires_at === 'string' && Number.isFinite(Date.parse(decision.expires_at))))
    && (decision.effective_at === null || (typeof decision.effective_at === 'string' && Number.isFinite(Date.parse(decision.effective_at))))
}

export async function requireRole(
  request: Request,
  roles: SystemPermission | readonly SystemPermission[],
  resolveUser: ServerUserResolver = resolveServerUser,
): Promise<AuthenticatedServerUser> {
  const user = await requireUser(request, resolveUser)
  const allowedRoles = Array.isArray(roles) ? roles : [roles]
  if (!allowedRoles.includes(user.systemPermission)) {
    console.warn('OPS_ROLE_DENIED', { route: new URL(request.url).pathname, requiredRoles: allowedRoles, actorPermission: user.systemPermission })
    throw new AuthorizationError(
      403,
      'PERMISSION_DENIED',
      'You do not have permission to perform this action.',
    )
  }
  return user
}

export function authorizationErrorResponse(error: AuthorizationError) {
  return Response.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    },
    {
      status: error.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError
}
