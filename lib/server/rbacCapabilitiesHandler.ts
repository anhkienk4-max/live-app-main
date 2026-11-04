import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'
import { resolveEffectivePermission } from '@/lib/rbac/effectivePermission'
import { isAccountOverrideGrantable } from '@/lib/rbac/accountOverrideCatalog'
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

      const effective = new Map(ROLE_DEFAULTS_CATALOG.map(entry => [
        entry.permission,
        resolveEffectivePermission({ role: actor.systemPermission, permission: entry.permission }),
      ]))
      let auditTeamDatabaseResult: boolean | null = null
      if (actor.systemPermission === 'leader' && auditTeamEnabled()) {
        const result = await (await db()).rpc('rbac01_effective_permission', { p_permission: 'audit.view_team' })
        if (result.error || typeof result.data !== 'boolean') {
          return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
        }
        auditTeamDatabaseResult = result.data
      }

      const permissions = ROLE_DEFAULTS_CATALOG.map(entry => ({
        permission: entry.permission,
        module: entry.module,
        action: entry.action,
        allowed: entry.permission === 'audit.view_team' && auditTeamDatabaseResult !== null
          ? auditTeamDatabaseResult : effective.get(entry.permission)!.allowed,
        source: entry.permission === 'audit.view_team' && auditTeamDatabaseResult !== null
          ? 'database' : effective.get(entry.permission)!.source,
        reason: entry.permission === 'audit.view_team' && auditTeamDatabaseResult !== null
          ? 'The signed-user policy RPC returned an effective result; this RPC does not expose the underlying version source.'
          : effective.get(entry.permission)!.reason,
        locked: entry.locked,
        accountOverrideGrantable: isAccountOverrideGrantable(entry.permission),
        ...(entry.reason ? { reason: entry.reason } : {}),
      }))
      return json({ ok: true, role: actor.systemPermission, permissions })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
    }
  }
}
