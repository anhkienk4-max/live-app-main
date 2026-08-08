import type { SystemPermission } from '@/lib/types/database.types'
import {
  permissionMatrix,
  type Permission,
} from '@/lib/permissions'

export interface AuthenticatedServerUser {
  id: string
  email?: string
  systemPermission: SystemPermission
}

export type ServerUserResolver = (
  request: Request,
) => Promise<AuthenticatedServerUser | null>

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: 'AUTHENTICATION_REQUIRED' | 'PERMISSION_DENIED',
    message: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export async function resolveServerUser(
  _request: Request,
): Promise<AuthenticatedServerUser | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL
    || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  // app_metadata is controlled by the auth server. Never authorize from
  // user_metadata, request bodies, query strings, or client-provided headers.
  const claimedPermission = user.app_metadata?.system_permission
    ?? user.app_metadata?.role
  const systemPermission: SystemPermission =
    claimedPermission === 'admin' || claimedPermission === 'leader'
      ? claimedPermission
      : 'member'

  return {
    id: user.id,
    email: user.email,
    systemPermission,
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
): Promise<AuthenticatedServerUser> {
  const user = await requireUser(request, resolveUser)
  if (!permissionMatrix[user.systemPermission].has(permission)) {
    throw new AuthorizationError(
      403,
      'PERMISSION_DENIED',
      'You do not have permission to perform this action.',
    )
  }
  return user
}

export async function requireRole(
  request: Request,
  roles: SystemPermission | readonly SystemPermission[],
  resolveUser: ServerUserResolver = resolveServerUser,
): Promise<AuthenticatedServerUser> {
  const user = await requireUser(request, resolveUser)
  const allowedRoles = Array.isArray(roles) ? roles : [roles]
  if (!allowedRoles.includes(user.systemPermission)) {
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
