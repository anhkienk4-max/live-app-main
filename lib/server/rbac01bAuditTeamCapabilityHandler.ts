import { requireEffectiveAuditTeamPermission } from '@/lib/server/rbac01bEffectivePermission'
import { authorizationErrorResponse, isAuthorizationError, type ServerUserResolver } from '@/lib/server/authGuards'
import type { SupabaseClient } from '@supabase/supabase-js'

type Dependencies = {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<Pick<SupabaseClient, 'rpc'>>
  enabled?: () => boolean
}

/** Authenticated no-store capability preflight; no data or actor details returned. */
export function createRbac01bAuditTeamCapabilityHandler(deps: Dependencies = {}) {
  return {
    GET: async (request: Request) => {
      try {
        await requireEffectiveAuditTeamPermission(request, deps)
        return Response.json({ ok: true, allowed: true, permission: 'audit.view_team' }, {
          headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return Response.json({ ok: false, error: { code: 'PERMISSION_DENIED' } }, {
          status: 403, headers: { 'Cache-Control': 'no-store' },
        })
      }
    },
  }
}
