import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'
import { resolveEffectivePermission } from '@/lib/rbac/effectivePermission'
import { isAccountOverrideGrantable } from '@/lib/rbac/accountOverrideCatalog'
import {
  AuthorizationError,
  authorizationErrorResponse,
  isAuthorizationError,
  isDatabasePermissionDecision,
  requireUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { permissionMatrix, type Permission } from '@/lib/permissions'
import { HARD_RESTRICTED_PERMISSIONS } from '@/lib/rbac/effectivePermission'
import { createClient } from '@/lib/supabase/server'

type Options = {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<Pick<SupabaseClient, 'rpc'>>
  auditTeamEnforcementEnabled?: () => boolean
  dynamicEnforcementEnabled?: () => boolean
}

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})

export function createRbacCapabilitiesHandler(options: Options = {}) {
  const db = options.createClient ?? createClient
  const auditTeamEnabled = options.auditTeamEnforcementEnabled
    ?? (() => process.env.FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT === 'true')
  const dynamicEnabled = options.dynamicEnforcementEnabled
    ?? (() => process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT === 'true')

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
      const databaseDecisions = new Map<string, ReturnType<typeof parseDecision>>()
      if (dynamicEnabled()) {
        const result = await (await db()).rpc('rbac_permission_decisions')
        if (result.error || !Array.isArray(result.data) || result.data.length !== ROLE_DEFAULTS_CATALOG.length) {
          return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
        }
        for (const value of result.data) {
          const decision = parseDecision(value)
          const permission = decision?.permission as Permission | undefined
          if (!decision || decision.actor_business_user_id !== actor.businessUserId
            || decision.role !== actor.systemPermission
            || !ROLE_DEFAULTS_CATALOG.some(entry => entry.permission === decision.permission)
            || databaseDecisions.has(decision.permission)
            || (permission && HARD_RESTRICTED_PERMISSIONS.has(permission)
              && decision.allowed !== permissionMatrix[actor.systemPermission].has(permission))) {
            return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
          }
          databaseDecisions.set(decision.permission, decision)
        }
        if (databaseDecisions.size !== ROLE_DEFAULTS_CATALOG.length) {
          return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
        }
      } else if (actor.systemPermission === 'leader' && auditTeamEnabled()) {
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
        allowed: databaseDecisions.get(entry.permission)?.allowed
          ?? (entry.permission === 'audit.view_team' && auditTeamDatabaseResult !== null
            ? auditTeamDatabaseResult : effective.get(entry.permission)!.allowed),
        source: databaseDecisions.get(entry.permission)?.source
          ?? (entry.permission === 'audit.view_team' && auditTeamDatabaseResult !== null
            ? 'database' : effective.get(entry.permission)!.source),
        reason: databaseDecisions.get(entry.permission)?.reason
          ?? (entry.permission === 'audit.view_team' && auditTeamDatabaseResult !== null
            ? 'The signed-user policy RPC returned an effective result.' : effective.get(entry.permission)!.reason),
        expiresAt: databaseDecisions.get(entry.permission)?.expires_at ?? null,
        effectiveAt: databaseDecisions.get(entry.permission)?.effective_at ?? null,
        locked: entry.locked,
        accountOverrideGrantable: isAccountOverrideGrantable(entry.permission),
        ...(entry.reason ? { catalogReason: entry.reason } : {}),
      }))
      return json({ ok: true, role: actor.systemPermission, permissions })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      return json({ ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } }, 503)
    }
  }
}

function parseDecision(value: unknown) {
  return isDatabasePermissionDecision(value) ? value : null
}
