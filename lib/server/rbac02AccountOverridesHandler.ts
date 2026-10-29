import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  authorizationErrorResponse,
  AuthorizationError,
  isAuthorizationError,
  requireRole,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { createClient } from '@/lib/supabase/server'

const permission = z.literal('audit.view_team')
const setSchema = z.object({
  action: z.literal('set'),
  targetId: z.string().min(1).max(100),
  permission,
  decision: z.enum(['allow', 'deny']),
  reason: z.string().trim().min(5).max(500),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  expectedVersion: z.number().int().min(0),
}).strict()
const resetSchema = z.object({
  action: z.literal('reset'),
  targetId: z.string().min(1).max(100),
  permission,
  reason: z.string().trim().min(5).max(500),
  expectedVersion: z.number().int().min(0),
}).strict()
const bodySchema = z.discriminatedUnion('action', [setSchema, resetSchema])
type RpcClient = Pick<SupabaseClient, 'rpc'>
type Options = {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<RpcClient>
  enabled?: () => boolean
}
const response = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})

/** Only audit.view_team is wired to database/RLS enforcement in RBAC-01B. */
export function createRbac02AccountOverridesHandler(options: Options = {}) {
  const enabled = options.enabled ?? (() => process.env.FEATURE_RBAC02_ACCOUNT_OVERRIDES === 'true')
  const createDb = options.createClient ?? createClient
  return {
    GET: async (request: Request) => {
      if (!enabled()) return response({ ok: false, error: { code: 'RBAC02_DISABLED' } }, 404)
      try {
        const actor = await requireRole(request, 'admin', options.resolveUser)
        if (!actor.businessUserId) throw new AuthorizationError(403, 'PERMISSION_DENIED', 'A verified business account is required.')
        const { data, error } = await (await createDb()).rpc('rbac02_list_account_overrides')
        if (error || !Array.isArray(data)) return response({ ok: false, error: { code: 'RBAC02_SCHEMA_UNAVAILABLE' } }, 503)
        return response({ ok: true, entries: data, supportedPermissions: ['audit.view_team'] })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return response({ ok: false, error: { code: 'RBAC02_UNAVAILABLE' } }, 503)
      }
    },
    POST: async (request: Request) => {
      if (!enabled()) return response({ ok: false, error: { code: 'RBAC02_DISABLED' } }, 404)
      try {
        const actor = await requireRole(request, 'admin', options.resolveUser)
        if (!actor.businessUserId) throw new AuthorizationError(403, 'PERMISSION_DENIED', 'A verified business account is required.')
        const rawLength = Number(request.headers.get('content-length') || 0)
        if (rawLength > 8192) return response({ ok: false, error: { code: 'BODY_TOO_LARGE' } }, 413)
        let input: unknown
        try { input = await request.json() } catch { return response({ ok: false, error: { code: 'INVALID_JSON' } }, 400) }
        const parsed = bodySchema.safeParse(input)
        if (!parsed.success) return response({ ok: false, error: { code: 'RBAC02_INPUT_INVALID' } }, 400)
        const db = await createDb()
        const result = parsed.data.action === 'set'
          ? await db.rpc('rbac02_set_account_override', {
            p_target_business_user_id: parsed.data.targetId,
            p_permission: parsed.data.permission,
            p_decision: parsed.data.decision,
            p_reason: parsed.data.reason,
            p_expires_at: parsed.data.expiresAt,
            p_expected_version: parsed.data.expectedVersion,
          })
          : await db.rpc('rbac02_reset_account_override', {
            p_target_business_user_id: parsed.data.targetId,
            p_permission: parsed.data.permission,
            p_reason: parsed.data.reason,
            p_expected_version: parsed.data.expectedVersion,
          })
        if (result.error || !result.data) return response({ ok: false, error: { code: 'RBAC02_UPDATE_REJECTED' } }, 409)
        return response({ ok: true, result: result.data })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return response({ ok: false, error: { code: 'RBAC02_UNAVAILABLE' } }, 503)
      }
    },
  }
}
