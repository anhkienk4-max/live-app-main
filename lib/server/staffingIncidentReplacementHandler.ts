import 'server-only'

import { z } from 'zod'
import { authorizationErrorResponse, isAuthorizationError, requirePermission, type ServerUserResolver } from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { createClient } from '@/lib/supabase/server'

const requestSchema = z.object({
  shiftId: z.string().trim().min(1).max(120),
  staffingSegmentId: z.string().trim().min(1).max(120).nullable(),
  registrationId: z.string().trim().min(1).max(120),
  replacementUserId: z.string().trim().min(1).max(120),
  role: z.enum(['host', 'support', 'technical']),
  expectedShiftVersion: z.number().int().positive(),
  expectedRegistrationVersion: z.number().int().positive(),
  effectiveAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(1000),
  isEmergency: z.boolean(),
  idempotencyKey: z.string().uuid(),
  incidentType: z.enum(['skip', 'absent', 'authorized_absence', 'late', 'early_leave', 'approved_pass', 'approved_swap', 'planned_reassignment', 'other']),
  evidenceReferenceId: z.string().trim().min(1).max(120).nullable(),
}).strict()

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } }, { status, headers })
function hasExactOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const reqOrigin = new URL(request.url).origin
  if (origin === reqOrigin) return true
  if (process.env.NODE_ENV !== 'production') {
    const isLoopback = (u: string) => u.startsWith('http://127.0.0.1:') || u.startsWith('http://localhost:')
    if (isLoopback(origin) && isLoopback(reqOrigin)) {
      return new URL(origin).port === new URL(request.url).port
    }
  }
  return false
}
type Dependencies = { resolveUser?: ServerUserResolver; createClient?: typeof createClient }
const incidentResultSchema = z.object({
  replacement_id: z.string().uuid(),
  registration: z.object({ id: z.string().min(1) }).passthrough(),
  canonical_incident: z.object({
    id: z.string().uuid(), shift_id: z.string(), staffing_segment_id: z.string().nullable(),
    original_registration_id: z.string(), original_staff_id: z.string(),
    replacement_registration_id: z.string().nullable(), replacement_staff_id: z.string().nullable(),
    role: z.enum(['host', 'support', 'technical']), business_date: z.string(),
    incident_type: requestSchema.shape.incidentType,
    review_state: z.enum(['pending', 'confirmed', 'rejected', 'corrected']),
    verified_late_minutes: z.number().int().nonnegative().nullable(), version: z.number().int().positive(),
  }),
}).passthrough()

export function createStaffingIncidentReplacementHandler(deps: Dependencies = {}) {
  const getClient = deps.createClient ?? createClient
  return async (request: Request) => {
    try {
      if (!hasExactOrigin(request)) return fail('STAFFING_REPLACEMENT_ORIGIN_INVALID', 403)
      const actor = await requirePermission(request, 'shifts.assign_staff', deps.resolveUser, getClient)
      if (!actor.businessUserId) return fail('STAFFING_REPLACEMENT_ACTOR_REQUIRED', 403)
      const parsed = requestSchema.safeParse(await readJsonBody(request, 8_192))
      if (!parsed.success) return fail('INCIDENT_REQUEST_INVALID', 400)
      const input = parsed.data
      const result = await (await getClient()).rpc('replace_shift_assignment_with_incident_v1', {
        p_shift_id: input.shiftId, p_staffing_segment_id: input.staffingSegmentId,
        p_registration_id: input.registrationId, p_replacement_user_id: input.replacementUserId,
        p_role: input.role, p_expected_shift_version: input.expectedShiftVersion,
        p_expected_registration_version: input.expectedRegistrationVersion,
        p_effective_at: input.effectiveAt, p_reason: input.reason, p_is_emergency: input.isEmergency,
        p_idempotency_key: input.idempotencyKey, p_incident_type: input.incidentType,
        p_evidence_reference_id: input.evidenceReferenceId,
      }).single()
      if (result.error) {
        console.error('[staffingIncidentReplacementHandler RPC error]', JSON.stringify(result.error))
        const known = ['SHIFT_VERSION_CONFLICT', 'REGISTRATION_VERSION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED',
          'EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT', 'REPLACEMENT_EFFECTIVE_TIME_INVALID',
          'INCIDENT_REQUEST_INVALID', 'INCIDENT_EVIDENCE_REFERENCE_UNAVAILABLE', 'LEADER_BRAND_SCOPE_REQUIRED',
          'EMERGENCY_REPLACEMENT_ADMIN_ONLY', 'STAFFING_PERMISSION_REQUIRED', 'ACTOR_NOT_AUTHORIZED']
          .find(code => result.error?.message?.includes(code))
        if (known && (result.error.code === '40001' || result.error.code === '23505')) return fail(known, 409)
        if (result.error.code === '42501') return fail(known ?? 'PERMISSION_DENIED', 403)
        if (result.error.code === '22023') return fail(known ?? 'INCIDENT_REQUEST_INVALID', 400)
        return fail('STAFFING_INCIDENT_REPLACEMENT_FAILED', 503)
      }
      const checked = incidentResultSchema.safeParse(result.data)
      if (!checked.success) return fail('STAFFING_REPLACEMENT_READBACK_REQUIRED', 503)
      const row = checked.data.canonical_incident
      const canonicalIncident = {
        id: row.id, shiftId: row.shift_id, staffingSegmentId: row.staffing_segment_id,
        originalRegistrationId: row.original_registration_id, originalStaffId: row.original_staff_id,
        replacementRegistrationId: row.replacement_registration_id, replacementStaffId: row.replacement_staff_id,
        role: row.role, businessDate: row.business_date, incidentType: row.incident_type,
        reviewState: row.review_state, verifiedLateMinutes: row.verified_late_minutes, version: row.version,
      }
      return Response.json({ ok: true, data: { ...checked.data, canonicalIncident, receiptId: checked.data.replacement_id }, readbackRequired: true }, { headers })
    } catch (error) {
      console.error('[staffingIncidentReplacementHandler catch error]', error)
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return fail(error.code, error.status)
      return fail('STAFFING_INCIDENT_REPLACEMENT_FAILED', 503)
    }
  }
}
