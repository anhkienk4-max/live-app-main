import 'server-only'

import { isFeatureEnabled } from '@/lib/flags'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError,
  requirePermission, requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
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
const confirmPayroll = z.object({
  action: z.literal('confirm_payroll'),
  segment_id: id,
  expected_version: z.number().int().min(0),
  idempotency_key: z.string().uuid(),
  reason: z.string().trim().min(8).max(2000),
}).strict()
const requestOvertime = z.object({
  action:z.literal('request_overtime'),segment_id:id,
  overtime_start_at:time,overtime_end_at:time,
  day_class:z.enum(['weekday','weekend','holiday']),time_class:z.enum(['day','night']),
  reason:z.string().trim().min(8).max(2000),evidence_receipt_id:id,
  idempotency_key:z.string().uuid(),
}).strict().superRefine((v,ctx)=>{
  if(Date.parse(v.overtime_end_at)<=Date.parse(v.overtime_start_at))
    ctx.addIssue({code:'custom',message:'C515_OT_INTERVAL_INVALID'})
})
const decideOvertime = z.object({
  action:z.literal('decide_overtime'),request_id:z.string().uuid(),
  expected_version:z.number().int().min(1),decision:z.enum(['leader_preapprove','admin_confirm','reject']),
  idempotency_key:z.string().uuid(),
  reason:z.string().trim().min(8).max(2000),
}).strict()
const proposeCancellationCompensation = z.object({
  action:z.literal('propose_cancellation_compensation'),shift_id:id,staff_id:id,
  operational_role:z.enum(['host','support','technical']),actual_segment_id:id.nullable(),registration_id:id.nullable(),
  period_id:id,cancellation_reason:z.string().trim().min(8).max(2000),reason:z.string().trim().min(8).max(2000),
  evidence_receipt_id:id,proposed_amount_vnd:z.number().int().min(1).max(1_000_000_000_000),idempotency_key:z.string().uuid(),
}).strict().refine(v=>(v.actual_segment_id!==null)!==(v.registration_id!==null))
const decideCancellationCompensation = z.object({
  action:z.literal('decide_cancellation_compensation'),case_id:z.string().uuid(),
  expected_version:z.number().int().min(1),decision:z.enum(['edit','admin_confirm','reject']),
  reason:z.string().trim().min(8).max(2000),new_amount_vnd:z.number().int().min(1).max(1_000_000_000_000).nullable(),
  idempotency_key:z.string().uuid(),
}).strict().refine(v=>(v.decision==='edit')===(v.new_amount_vnd!==null))

type LeaderScopeClient = Pick<SupabaseClient, 'rpc'>
type Depends = {
  client?: () => SupabaseClient
  resolveUser?: ServerUserResolver
  isEnabled?: () => boolean
  isPayrollEnabled?: () => boolean
  isAttendanceReviewEnabled?: () => boolean
  createScopeClient?: (request: Request) => Promise<LeaderScopeClient> | LeaderScopeClient
}
const noStore = { 'Cache-Control': 'no-store' }
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } },
  { status, headers: noStore })

async function leaderScopeDenial(
  request: Request,
  user: { systemPermission: string; businessUserId?: string },
  scopeKey: 'workforce.read' | 'staff.manage',
  brandId: string,
  createScopeClient?: Depends['createScopeClient'],
): Promise<Response | null> {
  if (user.systemPermission !== 'leader') return null
  if (!user.businessUserId) return fail('WORKFORCE_LEADER_SCOPE_UNAVAILABLE', 503)
  try {
    const scopeClient = createScopeClient
      ? await createScopeClient(request)
      : await (await import('@/lib/supabase/server')).createClient()
    const scope = await scopeClient.rpc('rc19_current_leader_brand_ids', { p_scope_key: scopeKey })
    if (scope.error || !Array.isArray(scope.data)
      || scope.data.some(value => typeof value !== 'string' || !value.trim())) {
      return fail('WORKFORCE_LEADER_SCOPE_UNAVAILABLE', 503)
    }
    return scope.data.includes(brandId) ? null : fail('WORKFORCE_LEADER_SCOPE_DENIED', 403)
  } catch {
    return fail('WORKFORCE_LEADER_SCOPE_UNAVAILABLE', 503)
  }
}


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
        const user = await requirePermission(request, 'shifts.assign_staff', deps.resolveUser)
        if (!(deps.isEnabled ?? (() => isFeatureEnabled('actual_staffing')))())
          return fail('WORKFORCE_FEATURE_DISABLED', 503)
        const search = new URL(request.url).searchParams
        if (search.get('action') === 'cancellation_compensation_cases') {
          const page = Number(search.get('page') ?? 1)
          const pageSize = Number(search.get('page_size') ?? 25)
          const dateFrom = search.get('date_from')
          const dateTo = search.get('date_to')
          const brandId = search.get('brand_id')
          const staffId = search.get('staff_id')
          const state = search.get('state')
          const reason = search.get('reason')?.trim()
          if (!Number.isSafeInteger(page) || page < 1 || page > 10000
            || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
            || (dateFrom && !/^\d{4}-\d{2}-\d{2}$/u.test(dateFrom))
            || (dateTo && !/^\d{4}-\d{2}-\d{2}$/u.test(dateTo))
            || (dateFrom && dateTo && dateFrom > dateTo)
            || (state && !['pending_admin_confirmation', 'admin_confirmed', 'rejected'].includes(state))
            || (reason && (reason.length > 100 || /[%_,()]/u.test(reason)))
            || [...search.keys()].some(key => search.getAll(key).length !== 1))
            return fail('C515_COMPENSATION_FILTER_INVALID', 400)

          const roleUser = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
          const user = await requirePermission(request, 'shifts.assign_staff', async () => roleUser)
          if (!user.businessUserId) return fail('WORKFORCE_BUSINESS_USER_REQUIRED', 403)
          let allowedBrandIds: string[] | null = null
          if (user.systemPermission === 'leader') {
            try {
              const session = deps.createScopeClient
                ? await deps.createScopeClient(request)
                : await (await import('@/lib/supabase/server')).createClient()
              const scope = await session.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'staff.manage' })
              if (scope.error || !Array.isArray(scope.data)
                || scope.data.some(value => typeof value !== 'string' || !value.trim()))
                return fail('WORKFORCE_LEADER_SCOPE_UNAVAILABLE', 503)
              allowedBrandIds = [...new Set(scope.data)]
            } catch {
              return fail('WORKFORCE_LEADER_SCOPE_UNAVAILABLE', 503)
            }
            if (brandId && !allowedBrandIds.includes(brandId))
              return fail('WORKFORCE_LEADER_SCOPE_DENIED', 403)
            if (allowedBrandIds.length === 0)
              return Response.json({ ok: true, cases: [], brand_ids: [], pagination: {
                page, page_size: pageSize, total_count: 0, total_pages: 0,
                has_next: false, has_previous: false,
              } }, { headers: noStore })
          }

          const client = db()
          const buildQuery = (head = false) => {
            let query = client.from('workforce_cancellation_compensation_cases')
              .select('id,shift_id,staff_id,operational_role,actual_seconds,actual_earnings_vnd,actual_segment_id,registration_id,cancellation_reason,reason,evidence_receipt_id,proposed_amount_vnd,proposed_by,leader_preapproved_by,admin_confirmed_by,state,version,created_at,shift:shifts!inner(id,date,title,brand_id,agency_code,platform_id,status)', { count: 'exact', head })
              .eq('cancellation_source', 'brand_ada')
              .eq('shift.status', 'cancelled')
            if (allowedBrandIds) query = query.in('shift.brand_id', allowedBrandIds)
            if (brandId) query = query.eq('shift.brand_id', brandId)
            if (dateFrom) query = query.gte('shift.date', dateFrom)
            if (dateTo) query = query.lte('shift.date', dateTo)
            if (staffId) query = query.eq('staff_id', staffId)
            if (state) query = query.eq('state', state)
            if (reason) query = query.ilike('reason', `%${reason}%`)
            return query.order('created_at', { ascending: false }).order('id', { ascending: true })
          }
          const total = await buildQuery(true)
          if (total.error || !Number.isSafeInteger(total.count) || total.count === null || total.count < 0)
            return fail('C515_COMPENSATION_READ_FAILED', 503)
          const totalCount = total.count
          const totalPages = Math.ceil(totalCount / pageSize)
          const actualPage = totalPages === 0 ? 1 : Math.min(page, totalPages)
          const offset = (actualPage - 1) * pageSize
          const result = await buildQuery().range(offset, offset + pageSize - 1)
          if (result.error || !Array.isArray(result.data)
            || result.data.length !== Math.min(pageSize, Math.max(0, totalCount - offset)))
            return fail('C515_COMPENSATION_READ_INCOMPLETE', 503)
          const caseIds = result.data.map(row => row.id)
          const eventsRes = caseIds.length
            ? await client.from('workforce_cancellation_compensation_events')
              .select('id,case_id,actor_id,action,from_state,to_state,reason,amount_vnd,version,created_at')
              .in('case_id', caseIds).order('created_at', { ascending: true }).limit(201)
            : { data: [], error: null }
          if (eventsRes.error || (eventsRes.data?.length ?? 0) > 200)
            return fail('C515_COMPENSATION_HISTORY_READ_FAILED', 503)
          const eventsByCase = new Map<string, Array<Record<string, unknown>>>()
          for (const event of eventsRes.data ?? []) {
            const list = eventsByCase.get(event.case_id) ?? []
            list.push(event)
            eventsByCase.set(event.case_id, list)
          }
          return Response.json({ ok: true,
            cases: result.data.map(row => ({ ...row, history: eventsByCase.get(row.id) ?? [] })),
            brand_ids: allowedBrandIds,
            pagination: { page: actualPage, page_size: pageSize, total_count: totalCount,
              total_pages: totalPages, has_next: offset + result.data.length < totalCount,
              has_previous: actualPage > 1 },
          }, { headers: noStore })
        }
        const shiftId = search.get('shift_id')
        if (!shiftId) return fail('WORKFORCE_SHIFT_ID_REQUIRED', 400)

        const client = db()
        const attendanceReviewEnabled = (deps.isAttendanceReviewEnabled ?? (() => isFeatureEnabled('self_attendance_review')))()
        const shiftRes = await client.from('shifts')
          .select('id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,status,host_id,support_id,technical_id,timezone,brand_id,platform_id')
          .eq('id', shiftId).is('deleted_at', null).maybeSingle()
        if (shiftRes.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
        if (!shiftRes.data) return fail('WORKFORCE_SHIFT_NOT_FOUND', 404)
        const shiftContext = shiftRes.data
        const scopeDenied = await leaderScopeDenial(request, user, 'workforce.read', shiftContext.brand_id, deps.createScopeClient)
        if (scopeDenied) return scopeDenied

        const cancellationFeatureEnabled = shiftContext.status === 'cancelled'
          && (deps.isPayrollEnabled ?? (() => isFeatureEnabled('payroll')))()
        const compensationScopeDenied = cancellationFeatureEnabled
          ? await leaderScopeDenial(request,user,'staff.manage',shiftContext.brand_id,deps.createScopeClient)
          : null
        const cancellationEnabled = cancellationFeatureEnabled && !compensationScopeDenied
        const [segmentsRes, regsRes, swapsRes, attendanceRes, photoEvidenceRes,
          cancelledRegistrationsRes, periodsRes, cancellationReceiptsRes] = await Promise.all([
          client.from('workforce_actual_segments')
            .select('id,shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,actual_end_at,review_status,evidence_note,review_note,created_by,reviewed_by,reviewed_at,version,created_at')
            .eq('shift_id', shiftId).order('created_at', { ascending: true }).limit(201),
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
              .select('id,request_id,shift_id,staff_id,operational_role,event_kind,recorded_at,verification_status')
              .eq('shift_id', shiftId).order('recorded_at', {ascending: true}).limit(201)
            : Promise.resolve({data: [], error: null}),
          attendanceReviewEnabled
            ? client.from('self_attendance_photo_evidence')
              .select('request_id').eq('shift_id', shiftId).limit(201)
            : Promise.resolve({data: [], error: null}),
          cancellationEnabled
            ? client.from('shift_registrations').select('id,user_id,operational_role,status')
              .eq('shift_id',shiftId).eq('status','cancelled').limit(201)
            : Promise.resolve({data:[],error:null}),
          cancellationEnabled
            ? client.from('workforce_payroll_periods').select('id,period_start,period_end')
              .eq('status','draft').lte('period_start',shiftContext.date).gte('period_end',shiftContext.date)
              .order('period_start',{ascending:false}).limit(201)
            : Promise.resolve({data:[],error:null}),
          cancellationEnabled
            ? client.from('operational_files').select('id,created_at')
              .eq('shift_id',shiftId).eq('brand_id',shiftContext.brand_id).eq('platform_id',shiftContext.platform_id)
              .eq('integrity_status','sha256_verified').not('external_file_id','is',null)
              .not('external_parent_id','is',null).is('deleted_at',null).order('created_at',{ascending:false}).limit(201)
            : Promise.resolve({data:[],error:null}),
        ])
        if (segmentsRes.error) return fail('WORKFORCE_ACTUAL_READ_FAILED', 503)
        if ((segmentsRes.data?.length??0)>200) return fail('WORKFORCE_ACTUAL_READ_LIMIT_EXCEEDED',409)
        if (attendanceRes.error || photoEvidenceRes.error)
          return fail('SELF_ATTENDANCE_REVIEW_UNAVAILABLE', 503)
        // A truncated source must never be represented as a complete evidence set.
        if ((attendanceRes.data?.length ?? 0) > 200 ||
          (photoEvidenceRes.data?.length ?? 0) > 200)
          return fail('SELF_ATTENDANCE_REVIEW_LIMIT_EXCEEDED', 409)
        if (swapsRes?.error || regsRes?.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)

        let decisionRes: {data: Array<Record<string, unknown>> | null; error: unknown | null} = {data:[],error:null}
        if (segmentsRes.data?.length) {
          try {
            decisionRes = await client.from('workforce_payroll_segment_decisions')
              .select('segment_id,state,reviewed_by,preapproved_by,confirmed_by,confirmed_at,reason,missing_evidence,version')
              .in('segment_id', segmentsRes.data.map(segment => segment.id))
          } catch (error) {
            // The approval migration is additive; old runtimes keep their existing actual-hours view.
            decisionRes = {data:null,error}
          }
        }
        const decisions = decisionRes.error ? [] : (decisionRes.data ?? [])
        const decisionBySegment = new Map(decisions.map(decision => [decision.segment_id, decision]))

        let overtimeAvailable=true
        let overtimeBySegment=new Map<string,Record<string,unknown>>()
        if(segmentsRes.data?.length){
          const overtimeRes=await client.from('workforce_overtime_requests')
            .select('id,segment_id,day_class,time_class,overtime_seconds,requested_by,leader_preapproved_by,admin_confirmed_by,state,version,rate_card_id,multiplier_basis_points')
            .in('segment_id',segmentsRes.data.map(segment=>segment.id)).limit(201)
          if(overtimeRes.error&&['PGRST205','42P01'].includes(overtimeRes.error.code??'')) overtimeAvailable=false
          else if(overtimeRes.error)return fail('C515_OT_READ_FAILED',503)
          else {
            const overtimeRows=overtimeRes.data??[]
            if(overtimeRows.length>200||overtimeRows.some(row=>!segmentsRes.data?.some(segment=>segment.id===row.segment_id)
              ||!['pending_admin_confirmation','admin_confirmed','rejected'].includes(row.state)
              ||!Number.isSafeInteger(row.version)||row.version<1)
              ||new Set(overtimeRows.map(row=>row.segment_id)).size!==overtimeRows.length)
              return fail('C515_OT_READ_INTEGRITY',503)
            overtimeBySegment=new Map(overtimeRows.map(row=>[row.segment_id,row]))
          }
        }

        const safeGraceMinutes = WORKFORCE_LATE_GRACE_MINUTES

        const enrichedSegments = (segmentsRes.data ?? []).map((seg) => {
          const verification = resolveStaffAssignmentVerification({
            shiftId,
            staffId: seg.staff_id,
            operationalRole: seg.operational_role,
            shift: shiftContext,
            registrations: regsRes.data ?? [],
            swaps: swapsRes.data ?? [],
          })

          const isException = !verification.assignment_verified || (seg.evidence_note && seg.evidence_note.includes('[EXCEPTION'))
          const requiresExceptionApproval = isException && seg.review_status === 'draft'

          return {
            ...seg,
            payroll_decision: decisionBySegment.get(seg.id) ?? null,
            payroll_decision_available: !decisionRes.error,
            overtime_request:overtimeBySegment.get(seg.id)??null,
            overtime_available:overtimeAvailable,
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
          // Raw request UUID is a private linkage key, never an API response.
          attendance_events: (attendanceRes.data ?? []).map(ev=>({
            id:ev.id,shift_id:ev.shift_id,staff_id:ev.staff_id,
            operational_role:ev.operational_role,event_kind:ev.event_kind,
            recorded_at:ev.recorded_at,verification_status:ev.verification_status,
            photo_available:((photoEvidenceRes.data??[]) as Array<{request_id:string}>)
              .some(photo=>photo.request_id===ev.request_id),
          })),
          attendance_review_enabled: attendanceReviewEnabled,
          overtime_available:overtimeAvailable,
          shift_context: shiftContext,
          planned_staff: regsRes?.data ?? [],
          cancellation_compensation_context: cancellationEnabled ? {
            available:!cancelledRegistrationsRes.error&&!periodsRes.error&&!cancellationReceiptsRes.error
              &&(cancelledRegistrationsRes.data?.length??0)<=200&&(periodsRes.data?.length??0)<=200
              &&(cancellationReceiptsRes.data?.length??0)<=200,
            periods:periodsRes.error?[]:periodsRes.data??[],
            evidence_receipts:cancellationReceiptsRes.error?[]:cancellationReceiptsRes.data??[],
            registrations:cancelledRegistrationsRes.error?[]:((cancelledRegistrationsRes.data??[]) as Array<{id:string;user_id:string;operational_role:string}>)
              .filter(row=>!(segmentsRes.data??[]).some(segment=>segment.staff_id===row.user_id
                &&segment.operational_role===row.operational_role&&segment.event_kind==='worked'))
              .map(row=>({id:row.id,user_id:row.user_id,operational_role:row.operational_role})),
          } : undefined,
          lateness_policy: {
            grace_minutes: safeGraceMinutes,
            policy_status: 'configured',
          },
        }, { headers: noStore })
      })
    },

    POST(request: Request) {
      return guard(async () => {
        if (!(deps.isEnabled ?? (() => isFeatureEnabled('actual_staffing')))())
          return fail('WORKFORCE_FEATURE_DISABLED', 503)
        const roleUser = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
        const body = await readJsonBody(request, 16 * 1024)
        const actionName = (body as { action?: string }).action
        const parsed = actionName === 'record' ? record.safeParse(body)
          : actionName === 'confirm_payroll' ? confirmPayroll.safeParse(body)
          : actionName === 'request_overtime' ? requestOvertime.safeParse(body)
          : actionName === 'decide_overtime' ? decideOvertime.safeParse(body)
          : actionName === 'propose_cancellation_compensation' ? proposeCancellationCompensation.safeParse(body)
          : actionName === 'decide_cancellation_compensation' ? decideCancellationCompensation.safeParse(body)
          : review.safeParse(body)
        if (!parsed.success) return fail('WORKFORCE_REQUEST_INVALID', 400)
        const action = parsed.data
        const user = await requirePermission(request,
          action.action === 'confirm_payroll'
            || (action.action==='decide_overtime'&&action.decision!=='leader_preapprove')
            || (action.action==='decide_cancellation_compensation'&&action.decision!=='edit')
            ? 'payroll.manage' : 'shifts.assign_staff',
          async () => roleUser)
        const actor = user.businessUserId ?? user.id
        const client = db()

        if (action.action === 'confirm_payroll') {
          const session = deps.createScopeClient
            ? await deps.createScopeClient(request)
            : await (await import('@/lib/supabase/server')).createClient()
          const { data, error } = await session.rpc('rc19_c515_confirm_payroll_segment', {
            p_segment_id: action.segment_id,
            p_expected_version: action.expected_version,
            p_idempotency_key: action.idempotency_key,
            p_reason: action.reason,
          })
          if (error) return fail(error.message || 'C515_PAYROLL_CONFIRMATION_FAILED', 409)
          return Response.json({ ok: true, decision: data }, { headers: noStore })
        }

        if(action.action==='request_overtime'||action.action==='decide_overtime'){
          const session=deps.createScopeClient
            ? await deps.createScopeClient(request)
            : await (await import('@/lib/supabase/server')).createClient()
          const {data,error}=action.action==='request_overtime'
            ? await session.rpc('rc19_c515_request_overtime',{
              p_segment_id:action.segment_id,p_start_at:action.overtime_start_at,p_end_at:action.overtime_end_at,
              p_day_class:action.day_class,p_time_class:action.time_class,p_reason:action.reason,
              p_evidence_receipt_id:action.evidence_receipt_id,p_idempotency_key:action.idempotency_key,
            })
            : await session.rpc('rc19_c515_decide_overtime_request',{
              p_request_id:action.request_id,p_expected_version:action.expected_version,
              p_action:action.decision,p_reason:action.reason,p_idempotency_key:action.idempotency_key,
            })
          if(error){
            const message=error.message||'C515_OT_OPERATION_FAILED'
            const status=/FORBIDDEN|SCOPE_DENIED|SELF_CONFIRM|SELF_REVIEW/iu.test(message)?403
              :/NOT_FOUND/iu.test(message)?404:/INVALID|REQUIRED|NOT_CONFIGURED|OVERLAP|STALE|ALREADY|EVIDENCE/iu.test(message)?409:503
            return fail(message,status)
          }
          return Response.json({ok:true,overtime:data},{status:action.action==='request_overtime'?201:200,headers:noStore})
        }

        if(action.action==='propose_cancellation_compensation'||action.action==='decide_cancellation_compensation'){
          const session=deps.createScopeClient
            ? await deps.createScopeClient(request)
            : await (await import('@/lib/supabase/server')).createClient()
          const {data,error}=action.action==='propose_cancellation_compensation'
            ? await session.rpc('rc19_c515_propose_cancellation_compensation',{
              p_shift_id:action.shift_id,p_staff_id:action.staff_id,p_operational_role:action.operational_role,
              p_actual_segment_id:action.actual_segment_id,p_registration_id:action.registration_id,
              p_period_id:action.period_id,p_cancellation_reason:action.cancellation_reason,p_reason:action.reason,
              p_evidence_receipt_id:action.evidence_receipt_id,p_proposed_amount_vnd:action.proposed_amount_vnd,
              p_idempotency_key:action.idempotency_key,
            })
            : await session.rpc('rc19_c515_decide_cancellation_compensation',{
              p_case_id:action.case_id,p_expected_version:action.expected_version,p_action:action.decision,
              p_reason:action.reason,p_new_amount_vnd:action.new_amount_vnd,p_idempotency_key:action.idempotency_key,
            })
          if(error){
            const message=error.message||'C515_COMPENSATION_OPERATION_FAILED'
            const status=error.code==='23505'?409:/FORBIDDEN|SCOPE_DENIED|SELF|LOCKED/iu.test(message)?403
              :/NOT_FOUND/iu.test(message)?404:/INVALID|REQUIRED|UNVERIFIED|STALE/iu.test(message)?409:503
            return fail(message,status)
          }
          return Response.json({ok:true,...(data as Record<string,unknown>)},
            {status:action.action==='propose_cancellation_compensation'?201:200,headers:noStore})
        }

        if (action.action === 'record') {
          const shift = await client.from('shifts')
            .select('id,brand_id,status,host_id,support_id,technical_id')
            .eq('id', action.shift_id).is('deleted_at', null).maybeSingle()
          if (shift.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (!shift.data) return fail('WORKFORCE_SHIFT_OR_STAFF_INVALID', 409)
          const scopeDenied = await leaderScopeDenial(request, user, 'staff.manage', shift.data.brand_id, deps.createScopeClient)
          if (scopeDenied) return scopeDenied
          const staff = await client.from('business_users')
            .select('id,status').eq('id', action.staff_id).is('deleted_at', null).maybeSingle()
          if (staff.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
          if (!staff.data || staff.data.status !== 'active')
            return fail('WORKFORCE_SHIFT_OR_STAFF_INVALID', 409)
          // A Brand-cancelled live shift still needs reviewed actual hours. Only
          // accept work ending before an audited cancellation; future shifts and
          // unaudited status changes remain ineligible.
          if (shift.data.status === 'cancelled') {
            const cancellation = await client.from('audit_logs')
              .select('created_at,actor_role,actor_business_user_id,before_data,after_data')
              .eq('entity_type', 'shifts').eq('entity_id', action.shift_id)
              .order('created_at', { ascending: false }).limit(20)
            if (cancellation.error) return fail('WORKFORCE_CANCELLATION_AUDIT_LOOKUP_FAILED', 503)
            const auditedCancellation = (cancellation.data ?? []).find(row =>
              ['admin', 'leader'].includes(row.actor_role ?? '')
              && row.actor_business_user_id
              && (row.before_data as Record<string, unknown> | null)?.status !== 'cancelled'
              && (row.after_data as Record<string, unknown> | null)?.status === 'cancelled'
              && (row.after_data as Record<string, unknown> | null)?.id === action.shift_id)
            if (action.event_kind !== 'worked' || !auditedCancellation)
              return fail('WORKFORCE_CANCELLED_SHIFT_NOT_AUDITED', 409)
            if (!action.actual_end_at || Date.parse(action.actual_end_at) > Date.parse(auditedCancellation.created_at))
              return fail('WORKFORCE_CANCELLED_SHIFT_ACTUAL_AFTER_CANCELLATION', 409)
          } else if (shift.data.status !== 'completed') {
            // Future/scheduled shifts cannot be treated as completed attendance,
            // and a missing clock-in must not be called no-show automatically.
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)
          }

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

          const finalScopeDenial = await leaderScopeDenial(request, user, 'staff.manage', shift.data.brand_id, deps.createScopeClient)
          if (finalScopeDenial) return finalScopeDenial

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

        const target = await client.from('workforce_actual_segments')
          .select('id,shift_id').eq('id', action.segment_id).maybeSingle()
        if (target.error) return fail('WORKFORCE_ACTUAL_READ_FAILED', 503)
        if (!target.data) return fail('WORKFORCE_ACTUAL_STALE_OR_LOCKED', 409)
        const targetShift = await client.from('shifts')
          .select('id,brand_id,date').eq('id', target.data.shift_id).is('deleted_at', null).maybeSingle()
        if (targetShift.error) return fail('WORKFORCE_SCOPE_LOOKUP_FAILED', 503)
        if (!targetShift.data) return fail('WORKFORCE_SHIFT_NOT_FOUND', 404)
        const scopeDenied = await leaderScopeDenial(request, user, 'staff.manage', targetShift.data.brand_id, deps.createScopeClient)
        if (scopeDenied) return scopeDenied

        // Review is optimistic and only draft evidence can be decided.
        const { data: current, error: lookup } = await client.from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,coverage_kind,evidence_note,actual_start_at,actual_end_at,review_status,version,created_by')
          .eq('id', action.segment_id).maybeSingle()
        if (lookup) return fail('WORKFORCE_ACTUAL_READ_FAILED', 503)
        if (!current || current.shift_id !== target.data.shift_id || current.review_status !== 'draft' || current.version !== action.expected_version)
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
          if (!shift)
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)
          if (shift.status === 'cancelled') {
            const cancellation = await client.from('audit_logs')
              .select('created_at,actor_role,actor_business_user_id,before_data,after_data')
              .eq('entity_type', 'shifts').eq('entity_id', current.shift_id)
              .order('created_at', { ascending: false }).limit(20)
            if (cancellation.error) return fail('WORKFORCE_CANCELLATION_AUDIT_LOOKUP_FAILED', 503)
            const auditedCancellation = (cancellation.data ?? []).find(row =>
              ['admin', 'leader'].includes(row.actor_role ?? '')
              && row.actor_business_user_id
              && (row.before_data as Record<string, unknown> | null)?.status !== 'cancelled'
              && (row.after_data as Record<string, unknown> | null)?.status === 'cancelled'
              && (row.after_data as Record<string, unknown> | null)?.id === current.shift_id)
            if (current.event_kind !== 'worked' || !auditedCancellation)
              return fail('WORKFORCE_CANCELLED_SHIFT_NOT_AUDITED', 409)
            if (!current.actual_end_at || Date.parse(current.actual_end_at) > Date.parse(auditedCancellation.created_at))
              return fail('WORKFORCE_CANCELLED_SHIFT_ACTUAL_AFTER_CANCELLATION', 409)
          } else if (shift.status !== 'completed') {
            return fail('WORKFORCE_SHIFT_NOT_COMPLETED', 409)
          }

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

          // Clock events are immutable evidence, separate from the supervisor-approved minute interval.
          if (current.event_kind === 'worked' && current.coverage_kind === 'planned') {
            const attendance = await client.from('self_attendance_events')
              .select('event_kind')
              .eq('shift_id', current.shift_id)
              .eq('staff_id', current.staff_id)
              .eq('operational_role', current.operational_role)
            if (attendance.error) return fail('SELF_ATTENDANCE_REVIEW_UNAVAILABLE', 503)
            const kinds = new Set((attendance.data ?? []).map(event => event.event_kind))
            if (!kinds.has('check_in') || !kinds.has('check_out'))
              return fail('WORKFORCE_ATTENDANCE_EVIDENCE_REQUIRED', 409)
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

        const finalScopeDenied = await leaderScopeDenial(request, user, 'staff.manage', targetShift.data.brand_id, deps.createScopeClient)
        if (finalScopeDenied) return finalScopeDenied
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
        let payrollDecision: unknown = null
        if (action.decision === 'approved' && targetShift.data.date >= '2026-11-10') {
          const session = deps.createScopeClient
            ? await deps.createScopeClient(request)
            : await (await import('@/lib/supabase/server')).createClient()
          const { data: decision, error: decisionError } = await session.rpc('rc19_c515_record_payroll_review', {
            p_segment_id: data.id,
            p_segment_version: data.version,
            p_reason: action.review_note,
          })
          if (decisionError) return fail(decisionError.message || 'C515_PAYROLL_REVIEW_STATE_UNAVAILABLE', 503)
          payrollDecision = decision
        }
        return Response.json({ ok: true, segment: { ...data, payroll_decision: payrollDecision } }, { headers: noStore })
      })
    },
  }
}
