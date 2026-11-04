import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'
import { permissionMatrix } from '@/lib/permissions'
import {
  AuthorizationError,
  authorizationErrorResponse,
  isAuthorizationError,
  requireUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { createClient } from '@/lib/supabase/server'

type Options = {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<Pick<SupabaseClient, 'rpc'>>
  auditTeamEnforcementEnabled?: () => boolean
}

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})

export function createRbacCapabilitiesHandler(options: Options = {}) {
  const db = options.createClient ?? createClient
  const auditTeamEnabled = options.auditTeamEnforcementEnabled
    ?? (() => process.env.FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT === 'true')

  return async (request: Request) => {
    try {
      const actor = await requireUser(request, options.resolveUser)
      if (!actor.businessUserId) {
        throw new AuthorizationError(403, 'PERMISSION_DENIED', 'A verified business account is required.')
      }

      const allowed = new Set(permissionMatrix[actor.systemPermission])
      let auditTeamSource: 'legacy_matrix' | 'database' = 'legacy_matrix'
      if (actor.systemPermission === 'leader' && auditTeamEnabled()) {
        const result = await (await db()).rpc('rbac01_effective_permission', { p_permission: 'audit.view_team' })
        if (result.error || typeof result.data !== 'boolean') {
          return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
        }
        if (result.data) allowed.add('audit.view_team')
        else allowed.delete('audit.view_team')
        auditTeamSource = 'database'
      }

      const permissions = ROLE_DEFAULTS_CATALOG.map(entry => ({
        permission: entry.permission,
        module: entry.module,
        action: entry.action,
        allowed: allowed.has(entry.permission),
        source: entry.permission === 'audit.view_team' ? auditTeamSource : 'legacy_matrix',
        locked: entry.locked,
        ...(entry.reason ? { reason: entry.reason } : {}),
      }))
      return json({ ok: true, role: actor.systemPermission, permissions })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
    }
  }
}
