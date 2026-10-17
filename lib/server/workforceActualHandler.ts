import 'server-only'

import { isFeatureEnabled } from '@/lib/flags'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError,
  requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const id = z.string().trim().min(1).max(120)
const time = z.string().datetime({ offset: true })
const record = z.object({
  action: z.literal('record'),
  shift_id: id,
  staff_id: id,
  operational_role: z.enum(['host', 'support', 'technical']),
  event_kind: z.enum(['worked', 'no_show']),
  coverage_kind: z.enum(['planned', 'cover', 'replacement', 'extra']),
  actual_start_at: time.nullable(),
  actual_end_at: time.nullable(),
  evidence_note: z.string().trim().min(8).max(2000),
}).strict().superRefine((v, ctx) => {
  if (v.event_kind === 'no_show' && (v.actual_start_at !== null || v.actual_end_at !== null)) {
    ctx.addIssue({ code: 'custom', message: 'NO_SHOW_MUST_NOT_HAVE_ACTUAL_TIMES' })
  }
  if (v.event_kind === 'worked' && (!v.actual_start_at || !v.actual_end_at
    || Date.parse(v.actual_end_at) <= Date.parse(v.actual_start_at))) {
    ctx.addIssue({ code: 'custom', message: 'WORKED_REQUIRES_VALID_TIMES' })
  }
})
const review = z.object({
  action: z.literal('review'),
  segment_id: id,
  expected_version: z.number().int().min(1),
  decision: z.enum(['approved', 'rejected']),
  review_note: z.string().trim().min(8).max(2000),
}).strict()

type Depends = { client?: () => SupabaseClient; resolveUser?: ServerUserResolver; isEnabled?: () => boolean }
const noStore = { 'Cache-Control': 'no-store' }
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } },
  { status, headers: noStore })

export function createWorkforceActualHandler(deps: Depends = {}) {
  const db = deps.client ?? createSupabaseAdminClient
  async function guard<T extends Response>(execute: () => Promise<T>): Promise<Response> {
    try { return await execute() }
    catch (e) {
      if (isAuthorizationError(e)) return authorizationErrorResponse(e)
      if (e instanceof RequestBodyError) return fail(e.code, e.status)
      if (e instanceof z.ZodError) return fail('WORKFORCE_REQUEST_INVALID', 400)
      if (e instanceof Error) {
        if (e.message.includes('WORKFORCE_APPROVED_STAFF_OVERLAP')) {
          return fail('WORKFORCE_APPROVED_STAFF_OVERLAP', 409)
        }
        if (e.message.includes('WORKFORCE_APPROVED_NO_SHOW_CONFLICT')) {
          return fail('WORKFORCE_APPROVED_NO_SHOW_CONFLICT', 409)
        }
      }
      return fail('WORKFORCE_ACTUAL_FAILED', 500)
    }
  }
  return {
    GET(request: Request) {
      return guard(async () => {
        await requireRole(request, ['admin', 'leader'], deps.resolveUser)
        if (!(deps.isEnabled ?? (() => isFeatureEnabled('actual_staffing')))())
          return fail('WORKFORCE_FEATURE_DISABLED', 503)
        const search = new URL(request.url).searchParams
        const shiftId = id.safeParse(search.get('shift_id'))
        if (!shiftId.success) return fail('WORKFORCE_SHIFT_ID_REQUIRED', 400)
        const client = db()
        const [segmentsRes, shiftRes, regsRes] = await Promise.all([
          client.from('workforce_actual_segments')
            .select('id,shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,actual_end_at,review_status,evidence_note,review_note,created_by,reviewed_by,reviewed_at,version,created_at')
            .eq('shift_id', shiftId.data).order('created_at', { ascending: true }).limit(200),
          client.from('shifts')
            .select('id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,status,host_id,support_id,technical_id')
            .eq('id', shiftId.data).is('deleted_at', null).maybeSingle(),
          client.from('shift_registrations')
            .select('id,user_id,operational_role,status')
            .eq('shift_id', shiftId.data).in('status', ['approved', 'manually_assigned']),
        ])
        if (segmentsRes.error) return fail('WORKFORCE_ACTUAL_READ_FAILED', 503)

        const rawGrace = process.env.WORKFORCE_LATE_GRACE_MINUTES
        const parsedGrace = rawGrace !== undefined ? Number(rawGrace) : 0
        const safeGraceMinutes = Number.isSafeInteger(parsedGrace) && parsedGrace >= 0 && parsedGrace <= 180 ? parsedGrace : 0

        return Response.json({
          ok: true,
          segments: segmentsRes.data ?? [],
          shift_context: shiftRes?.data ?? null,
          planned_staff: regsRes?.data ?? [],
          lateness_policy: {
            grace_minutes: safeGraceMinutes,
            policy_status: rawGrace !== undefined ? 'configured' : 'pending_company_policy',
          },
        }, { headers: noStore })
      })
    },
    POST(request: Request) {
      return guard(async () => {
        const user = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
        if (!(deps.isEnabled ?? (() => isFeatureEnabled('actual_staffing')))())
          return fail('WORKFORCE_FEATURE_DISABLED', 503)
        const actor = user.businessUserId
        if (!actor) return fail('WORKFORCE_BUSINESS_USER_REQUIRED', 403)
        const body = await readJsonBody(request, 16 * 1024)
        const action = z.union([record, review]).parse(body)
        const client = db()
        if (action.action === 'record') {
          const [shift, staff] = await Promise.all([
            client.from('shifts').select('id,status,host_id,support_id,technical_id,deleted_at')
              .eq('id', action.shift_id).is('deleted_at', null).maybeSingle(),
            client.from('business_users').select('id,status,deleted_at')
              .eq('id', action.staff_id).is('deleted_at', null).maybeSingle(),
          ])
          if (shift.error || staff.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (!shift.data || !staff.data || staff.data.status !== 'active')
            return fail('WORKFORCE_SHIFT_OR_STAFF_INVALID', 409)
          // Future/scheduled shifts cannot be treated as completed attendance,
          // and a missing clock-in must not be called no-show automatically.
          if (shift.data.status !== 'completed')
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)

          // Coverage Kind Validation:
          // 'planned' coverage requires the staff member to be assigned as primary staff
          // on the shift (host/support/technical) or registered and approved in shift_registrations.
          if (action.coverage_kind === 'planned') {
            const isPlannedOnShift =
              shift.data.host_id === action.staff_id ||
              shift.data.support_id === action.staff_id ||
              shift.data.technical_id === action.staff_id

            let isPlannedRegistration = false
            if (!isPlannedOnShift) {
              const { data: reg, error: regErr } = await client.from('shift_registrations')
                .select('id')
                .eq('shift_id', action.shift_id)
                .eq('user_id', action.staff_id)
                .in('status', ['approved', 'manually_assigned'])
                .limit(1)
              if (regErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
              if (reg && reg.length > 0) isPlannedRegistration = true
            }

            if (!isPlannedOnShift && !isPlannedRegistration) {
              return fail('WORKFORCE_PLANNED_STAFF_UNSCHEDULED', 409)
            }
          }

          // Cross-shift Assistant / Staff Overlap Check:
          // A staff member cannot have overlapping approved worked intervals across any shift
          if (action.event_kind === 'worked' && action.actual_start_at && action.actual_end_at) {
            const { data: overlaps, error: overlapErr } = await client.from('workforce_actual_segments')
              .select('id,shift_id,operational_role,actual_start_at,actual_end_at')
              .eq('staff_id', action.staff_id)
              .eq('event_kind', 'worked')
              .eq('review_status', 'approved')
              .lt('actual_start_at', action.actual_end_at)
              .gt('actual_end_at', action.actual_start_at)
              .limit(1)
            if (overlapErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
            if (overlaps && overlaps.length > 0) return fail('WORKFORCE_APPROVED_STAFF_OVERLAP', 409)
          }

          // Check if contradictory approved record exists on the same shift
          const { data: contradictions, error: contraErr } = await client.from('workforce_actual_segments')
            .select('id')
            .eq('shift_id', action.shift_id)
            .eq('staff_id', action.staff_id)
            .eq('operational_role', action.operational_role)
            .eq('event_kind', action.event_kind === 'worked' ? 'no_show' : 'worked')
            .eq('review_status', 'approved')
            .limit(1)
          if (contraErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (contradictions && contradictions.length > 0) return fail('WORKFORCE_APPROVED_NO_SHOW_CONFLICT', 409)

          const { data, error } = await client.from('workforce_actual_segments').insert({
            shift_id: action.shift_id, staff_id: action.staff_id,
            operational_role: action.operational_role, event_kind: action.event_kind,
            coverage_kind: action.coverage_kind, actual_start_at: action.actual_start_at,
            actual_end_at: action.actual_end_at, evidence_note: action.evidence_note,
            created_by: actor, review_status: 'draft',
          }).select('id,shift_id,review_status,version').single()
          if (error) return fail('WORKFORCE_ACTUAL_CONFLICT_OR_INVALID', 409)
          return Response.json({ ok: true, segment: data }, { status: 201, headers: noStore })
        }
        // Review is optimistic and only draft evidence can be decided.
        const { data: current, error: lookup } = await client.from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,actual_start_at,actual_end_at,review_status,version,created_by')
          .eq('id', action.segment_id).maybeSingle()
        if (lookup) return fail('WORKFORCE_ACTUAL_READ_FAILED', 503)
        if (!current || current.review_status !== 'draft' || current.version !== action.expected_version)
          return fail('WORKFORCE_ACTUAL_STALE_OR_LOCKED', 409)
        // Separate reviewer from evidence submitter; no self-approval.
        // Unified rule across UI and Backend: creator cannot review their own segment
        // regardless of whether created_by matches businessUserId or auth_user_id.
        const isCreator =
          current.created_by === actor ||
          (Boolean(user.id) && current.created_by === user.id) ||
          (Boolean(user.businessUserId) && current.created_by === user.businessUserId)
        if (isCreator) return fail('WORKFORCE_SELF_REVIEW_BLOCKED', 403)

        // When approving, ensure shift is completed and no staff overlap has occurred
        if (action.decision === 'approved') {
          const { data: shift, error: shiftErr } = await client.from('shifts')
            .select('id,status').eq('id', current.shift_id).maybeSingle()
          if (shiftErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (!shift || shift.status !== 'completed')
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)

          if (current.event_kind === 'worked' && current.actual_start_at && current.actual_end_at) {
            const { data: overlaps, error: overlapErr } = await client.from('workforce_actual_segments')
              .select('id')
              .eq('staff_id', current.staff_id)
              .eq('event_kind', 'worked')
              .eq('review_status', 'approved')
              .neq('id', current.id)
              .lt('actual_start_at', current.actual_end_at)
              .gt('actual_end_at', current.actual_start_at)
              .limit(1)
            if (overlapErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
            if (overlaps && overlaps.length > 0) return fail('WORKFORCE_APPROVED_STAFF_OVERLAP', 409)
          }

          const { data: contradictions, error: contraErr } = await client.from('workforce_actual_segments')
            .select('id')
            .eq('shift_id', current.shift_id)
            .eq('staff_id', current.staff_id)
            .eq('operational_role', current.operational_role)
            .eq('event_kind', current.event_kind === 'worked' ? 'no_show' : 'worked')
            .eq('review_status', 'approved')
            .neq('id', current.id)
            .limit(1)
          if (contraErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (contradictions && contradictions.length > 0) return fail('WORKFORCE_APPROVED_NO_SHOW_CONFLICT', 409)
        }

        const { data, error } = await client.from('workforce_actual_segments')
          .update({
            review_status: action.decision,
            reviewed_by: actor, reviewed_at: new Date().toISOString(),
            review_note: action.review_note,
            version: action.expected_version + 1,
          }).eq('id', action.segment_id).eq('version', action.expected_version)
          .eq('review_status', 'draft').select('id,review_status,version').maybeSingle()

        if (error) {
          if (error.message?.includes('WORKFORCE_APPROVED_STAFF_OVERLAP')) {
            return fail('WORKFORCE_APPROVED_STAFF_OVERLAP', 409)
          }
          if (error.message?.includes('WORKFORCE_APPROVED_NO_SHOW_CONFLICT')) {
            return fail('WORKFORCE_APPROVED_NO_SHOW_CONFLICT', 409)
          }
          return fail('WORKFORCE_ACTUAL_STALE_OR_LOCKED', 409)
        }
        if (!data) return fail('WORKFORCE_ACTUAL_STALE_OR_LOCKED', 409)
        return Response.json({ ok: true, segment: data }, { headers: noStore })
      })
    },
  }
}
