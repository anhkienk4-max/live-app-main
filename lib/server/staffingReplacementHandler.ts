import 'server-only'

import { z } from 'zod'
import { authorizationErrorResponse, isAuthorizationError, requirePermission, type ServerUserResolver } from '@/lib/server/authGuards'
import { hasExactOrigin, readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { createClient } from '@/lib/supabase/server'

const replacementSchema = z.object({
  shiftId: z.string().trim().min(1).max(120),
  staffingSegmentId: z.string().trim().min(1).max(120),
  registrationId: z.string().trim().min(1).max(120),
  replacementUserId: z.string().trim().min(1).max(120),
  role: z.enum(['host', 'support', 'technical']),
  expectedShiftVersion: z.number().int().positive(),
  expectedRegistrationVersion: z.number().int().positive(),
  effectiveAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
  emergency: z.boolean(),
  idempotencyKey: z.string().uuid(),
}).strict()

const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } }, { status, headers: noStore })

type Dependencies = {
  resolveUser?: ServerUserResolver
  createClient?: typeof createClient
}

export function createStaffingReplacementHandler(deps: Dependencies = {}) {
  const getClient = deps.createClient ?? createClient

  return async (request: Request) => {
    try {
      if (!hasExactOrigin(request)) return fail('STAFFING_REPLACEMENT_ORIGIN_INVALID', 403)
      const actor = await requirePermission(request, 'shifts.assign_staff', deps.resolveUser, getClient)
      if (!actor.businessUserId) return fail('STAFFING_REPLACEMENT_ACTOR_REQUIRED', 403)
      const parsed = replacementSchema.safeParse(await readJsonBody(request, 8_192))
      if (!parsed.success) return fail('STAFFING_REPLACEMENT_REQUEST_INVALID', 400)

      const input = parsed.data
      const result = await (await getClient()).rpc('replace_shift_assignment', {
        p_shift_id: input.shiftId,
        p_staffing_segment_id: input.staffingSegmentId,
        p_registration_id: input.registrationId,
        p_replacement_user_id: input.replacementUserId,
        p_role: input.role,
        p_expected_shift_version: input.expectedShiftVersion,
        p_expected_registration_version: input.expectedRegistrationVersion,
        p_effective_at: input.effectiveAt,
        p_reason: input.reason,
        p_is_emergency: input.emergency,
        p_idempotency_key: input.idempotencyKey,
      }).single()

      if (result.error) {
        const versionConflict = ['SHIFT_VERSION_CONFLICT', 'REGISTRATION_VERSION_CONFLICT']
          .find(code => result.error?.message?.includes(code))
        if (result.error.code === '40001' && versionConflict) {
          return fail(versionConflict, 409)
        }
        if (result.error.code === '42501') return fail('PERMISSION_DENIED', 403)
        if (result.error.code === '22023') return fail(result.error.message || 'STAFFING_REPLACEMENT_REQUEST_INVALID', 400)
        return fail('STAFFING_REPLACEMENT_FAILED', 503)
      }
      if (!result.data || typeof result.data !== 'object') return fail('STAFFING_REPLACEMENT_READBACK_REQUIRED', 503)
      return Response.json({ ok: true, data: result.data }, { headers: noStore })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof z.ZodError) return fail('STAFFING_REPLACEMENT_REQUEST_INVALID', 400)
      return fail(error instanceof RequestBodyError ? error.code : 'STAFFING_REPLACEMENT_FAILED', error instanceof RequestBodyError ? error.status : 503)
    }
  }
}
