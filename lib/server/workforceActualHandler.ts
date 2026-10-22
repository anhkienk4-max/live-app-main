import 'server-only'

import { isFeatureEnabled } from '@/lib/flags'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError,
  requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { WORKFORCE_LATE_GRACE_MINUTES } from '@/lib/workforce/workforcePolicy'

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

type Depends = { client?: () => SupabaseClient; resolveUser?: ServerUserResolver; isEnabled?: () => boolean; isAttendanceReviewEnabled?: () => boolean }
const noStore = { 'Cache-Control': 'no-store' }
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } },
  { status, headers: noStore })


export interface SwapRecord {
  id: string
  requester_id: string
  counterpart_id?: string | null
  replacement_staff_id?: string | null
  source_shift_id?: string | null
  target_shift_id?: string | null
  shift_id?: string | null
  operational_role?: string | null
  mode?: string | null
  status: string
  deleted_at?: string | null
}

export interface ShiftRegistrationRecord {
  id?: string
  user_id: string
  operational_role?: string | null
  status: string
}

export interface ShiftContextRecord {
  id: string
  host_id?: string | null
  support_id?: string | null
  technical_id?: string | null
}

export interface StaffAssignmentVerification {
  assignment_verified: boolean
  is_exception: boolean
  requires_exception_approval: boolean
  matched_source: 'shift_roster' | 'shift_registration' | 'swap_request' | 'unverified_exception'
  exception_reason: string | null
}

export function resolveStaffAssignmentVerification(params: {
  shiftId: string
  staffId: string
  operationalRole: 'host' | 'support' | 'technical'
  shift: ShiftContextRecord
  registrations: ShiftRegistrationRecord[]
  swaps: SwapRecord[]
}): StaffAssignmentVerification {
  const { shiftId, staffId, operationalRole, shift, registrations, swaps } = params

  // 1. Filter valid approved swaps for this shift:
  // Must have status in ('approved', 'completed') and not soft-deleted.
  // 'accepted' is NOT yet approved by admin/leader.
  // 'pending', 'rejected', 'cancelled' are NOT valid assignments.
  // Operational role MUST strictly match operationalRole (no NULL/undefined wildcard matching!).
  // Mode MUST be strictly 'replacement' or 'exchange' (legacy 'move' or NULL mode fail-closed!).
  const validSwaps = swaps.filter(
    (s) =>
      ['approved', 'completed'].includes(s.status) &&
      !s.deleted_at &&
      s.operational_role === operationalRole &&
      (s.mode === 'replacement' || s.mode === 'exchange')
  )

  // 2. CHECK FOR SURRENDERED SHIFT (Task 5: Handover staff cannot override approved swap via old roster):
  // Did staffId surrender this shiftId in an approved swap?
  // - If source_shift_id === shiftId and requester_id === staffId: staff surrendered this source shift!
  // - If target_shift_id === shiftId and counterpart_id === staffId (ONLY in exchange): staff surrendered this target shift!
  const surrenderedThisShift = validSwaps.some((s) => {
    const sourceId = s.source_shift_id || s.shift_id
    if (sourceId === shiftId && s.requester_id === staffId) {
      return true
    }
    if (s.mode === 'exchange' && s.target_shift_id === shiftId && s.counterpart_id === staffId) {
      return true
    }
    return false
  })

  if (surrenderedThisShift) {
    return {
      assignment_verified: false,
      is_exception: true,
      requires_exception_approval: true,
      matched_source: 'unverified_exception',
      exception_reason: 'Staff surrendered shift in an approved swap request',
    }
  }

  // 3. CHECK FOR SWAP REPLACEMENT / INCOMING ASSIGNMENT:
  // Is staffId the authorized incoming / replacement staff on this shift?
  // - If source_shift_id === shiftId: the authorized staff is counterpart_id (or replacement_staff_id).
  //   Requester_id CANNOT be the replacement staff on source shift.
  // - If target_shift_id === shiftId: ONLY verified when mode === 'exchange' and staff is requester_id.
  //   Counterpart_id CANNOT be the incoming staff on target shift.
  //   In replacement (PASS), target_shift_id is NEVER verified for incoming staff.
  const isSwapReplacement = validSwaps.some((s) => {
    const sourceId = s.source_shift_id || s.shift_id
    if (sourceId === shiftId) {
      const incomingId = s.counterpart_id || s.replacement_staff_id
      return incomingId === staffId && incomingId !== s.requester_id
    }
    if (s.mode === 'exchange' && s.target_shift_id === shiftId) {
      return s.requester_id === staffId && s.requester_id !== s.counterpart_id
    }
    return false
  })

  if (isSwapReplacement) {
    return {
      assignment_verified: true,
      is_exception: false,
      requires_exception_approval: false,
      matched_source: 'swap_request',
      exception_reason: null,
    }
  }

  // 4. CHECK DIRECT ROSTER ASSIGNMENT (Only if not surrendered):
  const isRosterAssigned =
    (operationalRole === 'host' && shift.host_id === staffId) ||
    (operationalRole === 'support' && shift.support_id === staffId) ||
    (operationalRole === 'technical' && shift.technical_id === staffId)

  if (isRosterAssigned) {
    return {
      assignment_verified: true,
      is_exception: false,
      requires_exception_approval: false,
      matched_source: 'shift_roster',
      exception_reason: null,
    }
  }

  // 5. CHECK SHIFT REGISTRATIONS:
  const isRegistrationAssigned = registrations.some(
    (r) =>
      r.user_id === staffId &&
      ['approved', 'manually_assigned'].includes(r.status) &&
      (!r.operational_role || r.operational_role === operationalRole)
  )

  if (isRegistrationAssigned) {
    return {
      assignment_verified: true,
      is_exception: false,
      requires_exception_approval: false,
      matched_source: 'shift_registration',
      exception_reason: null,
    }
  }

  // 6. FALLBACK: UNVERIFIED EXCEPTION
  return {
    assignment_verified: false,
    is_exception: true,
    requires_exception_approval: true,
    matched_source: 'unverified_exception',
    exception_reason: 'No approved roster, registration, or swap assignment found',
  }
}

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
        const shiftId = search.get('shift_id')
        if (!shiftId) return fail('WORKFORCE_SHIFT_ID_REQUIRED', 400)

        const client = db()
        const attendanceReviewEnabled = (deps.isAttendanceReviewEnabled ?? (() => isFeatureEnabled('self_attendance_review')))()
        const [segmentsRes, shiftRes, regsRes, swapsRes, attendanceRes] = await Promise.all([
          client.from('workforce_actual_segments')
            .select('id,shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,actual_end_at,review_status,evidence_note,review_note,created_by,reviewed_by,reviewed_at,version,created_at')
            .eq('shift_id', shiftId).order('created_at', { ascending: true }).limit(200),
          client.from('shifts')
            .select('id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,status,host_id,support_id,technical_id,timezone')
            .eq('id', shiftId).is('deleted_at', null).maybeSingle(),
          client.from('shift_registrations')
            .select('id,user_id,operational_role,status')
            .eq('shift_id', shiftId).in('status', ['approved', 'manually_assigned']),
          client.from('swap_requests')
            .select('id,requester_id,counterpart_id,replacement_staff_id,source_shift_id,target_shift_id,shift_id,operational_role,mode,status,deleted_at')
            .or(`source_shift_id.eq.${shiftId},target_shift_id.eq.${shiftId},shift_id.eq.${shiftId}`),
          // Production may not have the staging-only attendance journal migration.
          // Leave existing Workforce reads fully functional unless explicitly enabled.
          attendanceReviewEnabled
            ? client.from('self_attendance_events')
              .select('id,shift_id,staff_id,operational_role,event_kind,recorded_at,verification_status')
              .eq('shift_id', shiftId).order('recorded_at', {ascending: true}).limit(201)
            : Promise.resolve({data: [], error: null}),
        ])
        if (segmentsRes.error) return fail('WORKFORCE_ACTUAL_READ_FAILED', 503)
        if (attendanceRes.error) return fail('SELF_ATTENDANCE_REVIEW_UNAVAILABLE', 503)
        // A truncated source must never be represented as a complete evidence set.
        if ((attendanceRes.data?.length ?? 0) > 200) return fail('SELF_ATTENDANCE_REVIEW_LIMIT_EXCEEDED', 409)
        if (swapsRes?.error || regsRes?.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
        if (!shiftRes?.data) return fail('WORKFORCE_SHIFT_NOT_FOUND', 404)

        const safeGraceMinutes = WORKFORCE_LATE_GRACE_MINUTES

        const enrichedSegments = (segmentsRes.data ?? []).map((seg) => {
          const verification = resolveStaffAssignmentVerification({
            shiftId,
            staffId: seg.staff_id,
            operationalRole: seg.operational_role,
            shift: shiftRes.data!,
            registrations: regsRes.data ?? [],
            swaps: swapsRes.data ?? [],
          })

          const isException = !verification.assignment_verified || (seg.evidence_note && seg.evidence_note.includes('[EXCEPTION'))
          const requiresExceptionApproval = isException && seg.review_status === 'draft'

          return {
            ...seg,
            coverage_verification: {
              coverage_kind: seg.coverage_kind,
              assignment_verified: verification.assignment_verified,
              is_exception: isException,
              requires_exception_approval: requiresExceptionApproval,
              matched_source: verification.matched_source,
              exception_reason: verification.exception_reason ?? (isException ? seg.evidence_note : null),
            },
          }
        })

        return Response.json({
          ok: true,
          segments: enrichedSegments,
          attendance_events: attendanceRes.data ?? [],
          attendance_review_enabled: attendanceReviewEnabled,
          shift_context: shiftRes.data,
          planned_staff: regsRes?.data ?? [],
          lateness_policy: {
            grace_minutes: safeGraceMinutes,
            policy_status: 'configured',
          },
        }, { headers: noStore })
      })
    },

    POST(request: Request) {
      return guard(async () => {
        const user = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
        if (!(deps.isEnabled ?? (() => isFeatureEnabled('actual_staffing')))())
          return fail('WORKFORCE_FEATURE_DISABLED', 503)

        const actor = user.businessUserId ?? user.id
        const body = await readJsonBody(request, 16 * 1024)
        const parsed = (body as { action?: string }).action === 'record'
          ? record.safeParse(body)
          : review.safeParse(body)
        if (!parsed.success) return fail('WORKFORCE_REQUEST_INVALID', 400)
        const action = parsed.data
        const client = db()

        if (action.action === 'record') {
          // Scope shifts to completed, non-deleted, and active staff
          const [shift, staff] = await Promise.all([
            client.from('shifts')
              .select('id,status,host_id,support_id,technical_id')
              .eq('id', action.shift_id).is('deleted_at', null).maybeSingle(),
            client.from('business_users')
              .select('id,status').eq('id', action.staff_id).is('deleted_at', null).maybeSingle(),
          ])
          if (shift.error || staff.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (!shift.data || !staff.data || staff.data.status !== 'active')
            return fail('WORKFORCE_SHIFT_OR_STAFF_INVALID', 409)
          // Future/scheduled shifts cannot be treated as completed attendance,
          // and a missing clock-in must not be called no-show automatically.
          if (shift.data.status !== 'completed')
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)

          const [regsRes, swapsRes] = await Promise.all([
            client.from('shift_registrations')
              .select('id,user_id,operational_role,status')
              .eq('shift_id', action.shift_id)
              .in('status', ['approved', 'manually_assigned']),
            client.from('swap_requests')
              .select('id,requester_id,counterpart_id,replacement_staff_id,source_shift_id,target_shift_id,shift_id,operational_role,mode,status,deleted_at')
              .or(`source_shift_id.eq.${action.shift_id},target_shift_id.eq.${action.shift_id},shift_id.eq.${action.shift_id}`),
          ])
          if (regsRes?.error || swapsRes?.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)

          const verification = resolveStaffAssignmentVerification({
            shiftId: action.shift_id,
            staffId: action.staff_id,
            operationalRole: action.operational_role,
            shift: shift.data,
            registrations: regsRes.data ?? [],
            swaps: swapsRes.data ?? [],
          })

          if (action.coverage_kind === 'planned') {
            if (!verification.assignment_verified) {
              return fail('WORKFORCE_PLANNED_STAFF_UNSCHEDULED', 409)
            }
          } else {
            // cover, replacement, extra: if unverified, require explicit exception note >= 15 chars
            if (!verification.assignment_verified && action.evidence_note.trim().length < 15) {
              return fail('WORKFORCE_EXCEPTION_REASON_REQUIRED', 400)
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

          // Persist exception marker in evidence_note if unverified
          const storedEvidenceNote = !verification.assignment_verified && !action.evidence_note.startsWith('[EXCEPTION:UNVERIFIED]')
            ? `[EXCEPTION:UNVERIFIED] ${action.evidence_note}`
            : action.evidence_note

          const { data, error } = await client.from('workforce_actual_segments').insert({
            shift_id: action.shift_id, staff_id: action.staff_id,
            operational_role: action.operational_role, event_kind: action.event_kind,
            coverage_kind: action.coverage_kind, actual_start_at: action.actual_start_at,
            actual_end_at: action.actual_end_at, evidence_note: storedEvidenceNote,
            created_by: actor, review_status: 'draft',
          }).select('id,shift_id,review_status,version').single()
          if (error) return fail('WORKFORCE_ACTUAL_CONFLICT_OR_INVALID', 409)

          return Response.json({
            ok: true,
            segment: data,
            coverage_verification: {
              coverage_kind: action.coverage_kind,
              assignment_verified: verification.assignment_verified,
              is_exception: verification.is_exception,
              requires_exception_approval: verification.requires_exception_approval,
              matched_source: verification.matched_source,
              exception_reason: verification.exception_reason ?? (!verification.assignment_verified ? action.evidence_note : null),
            },
          }, { status: 201, headers: noStore })
        }

        // Review is optimistic and only draft evidence can be decided.
        const { data: current, error: lookup } = await client.from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,coverage_kind,evidence_note,actual_start_at,actual_end_at,review_status,version,created_by')
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
            .select('id,status,host_id,support_id,technical_id').eq('id', current.shift_id).maybeSingle()
          if (shiftErr) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (!shift || shift.status !== 'completed')
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)

          const [regsRes, swapsRes] = await Promise.all([
            client.from('shift_registrations')
              .select('id,user_id,operational_role,status')
              .eq('shift_id', current.shift_id)
              .in('status', ['approved', 'manually_assigned']),
            client.from('swap_requests')
              .select('id,requester_id,counterpart_id,replacement_staff_id,source_shift_id,target_shift_id,shift_id,operational_role,mode,status,deleted_at')
              .or(`source_shift_id.eq.${current.shift_id},target_shift_id.eq.${current.shift_id},shift_id.eq.${current.shift_id}`),
          ])
          if (regsRes?.error || swapsRes?.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)

          const verification = resolveStaffAssignmentVerification({
            shiftId: current.shift_id,
            staffId: current.staff_id,
            operationalRole: current.operational_role,
            shift,
            registrations: regsRes.data ?? [],
            swaps: swapsRes.data ?? [],
          })

          // Planned coverage without verified assignment CAN NEVER be approved
          if (current.coverage_kind === 'planned' && !verification.assignment_verified) {
            return fail('WORKFORCE_PLANNED_STAFF_UNSCHEDULED', 409)
          }

          // If unverified exception, reviewer note must be >= 15 chars justifying the exception approval
          const isException = !verification.assignment_verified || (current.evidence_note && current.evidence_note.includes('[EXCEPTION'))
          if (isException) {
            if (!action.review_note || action.review_note.trim().length < 15) {
              return fail('WORKFORCE_EXCEPTION_APPROVAL_NOTE_REQUIRED', 400)
            }
          }

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
