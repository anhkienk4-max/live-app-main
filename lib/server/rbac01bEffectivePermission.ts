import type { SupabaseClient } from '@supabase/supabase-js'
import type { Permission } from '@/lib/permissions'
import { permissionMatrix } from '@/lib/permissions'
import {
  AuthorizationError,
  requireUser,
  type AuthenticatedServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'

export const RBAC01B_SLICE_PERMISSION = 'audit.view_team' as const

type ReadOnlyRpcClient = Pick<SupabaseClient, 'rpc'>
type ResolverOptions = {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<ReadOnlyRpcClient>
  enabled?: () => boolean
}

/** Only the audit team-read permission is supported. All other domains retain RC19. */
export async function requireEffectiveAuditTeamPermission(
  request: Request,
  options: ResolverOptions = {},
): Promise<AuthenticatedServerUser> {
  const actor = await requireUser(request, options.resolveUser)
  const permission: Permission = RBAC01B_SLICE_PERMISSION
  if (!permissionMatrix[actor.systemPermission].has(permission)) {
    throw new AuthorizationError(403, 'PERMISSION_DENIED', 'Audit visibility is not granted to this role.')
  }
  // The Admin audit.view path is independent and not subject to Leader-only override.
  if (actor.systemPermission === 'admin') return actor
  const enabled = options.enabled ?? (() => process.env.FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT === 'true')
  if (!enabled()) return actor  // exact legacy parity, with no DB request
  try {
    // Use the signed-user Supabase client, NEVER service_role and NEVER client-supplied role.
    const client = options.createClient
      ? await options.createClient()
      : await (await import('@/lib/supabase/server')).createClient()
    const { data, error } = await client.rpc('rbac01_effective_permission', { p_permission: permission })
    // No cache: a revoked active version is observed on the next request.
    if (error || data !== true) throw new Error('RBAC01B_DB_DENIED')
  } catch {
    throw new AuthorizationError(403, 'PERMISSION_DENIED', 'Audit visibility is not permitted.')
  }
  return actor
}
