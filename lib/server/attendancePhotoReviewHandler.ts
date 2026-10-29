import 'server-only'

import { z } from 'zod'
import { isFeatureEnabled } from '@/lib/flags'
import { authorizationErrorResponse, isAuthorizationError, requireRole, requireUser, type ServerUserResolver } from '@/lib/server/authGuards'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const shiftIdSchema = z.string().trim().min(1).max(120)
const uuid = z.string().uuid()
const decisionSchema = z.object({
  event_id: uuid,
  expected_version: z.number().int().min(0),
  expected_evidence_revision: z.number().int().min(1),
  decision: z.enum(['approved', 'rejected', 'correction_requested']),
  reason: z.string().trim().min(8).max(2000),
  idempotency_key: uuid,
}).strict()
const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } }, { status, headers: noStore })
const hasExactOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  return Boolean(origin && origin === new URL(request.url).origin)
}

type Dependencies = {
  resolveUser?: ServerUserResolver
  createClient?: typeof createClient
  createAdminClient?: typeof createSupabaseAdminClient
  isEnabled?: () => boolean
}

export function createAttendancePhotoReviewHandler(deps: Dependencies = {}) {
  const getClient = deps.createClient ?? createClient
  const getAdmin = deps.createAdminClient ?? createSupabaseAdminClient
  const enabled = deps.isEnabled ?? (() => isFeatureEnabled('self_attendance_review'))

  return {
    GET: async (request: Request) => {
      try {
        const actor = await requireUser(request, deps.resolveUser)
        if (!actor.businessUserId) return fail('ATTENDANCE_REVIEW_ACTOR_REQUIRED', 403)
        if (!enabled()) return fail('ATTENDANCE_REVIEW_DISABLED', 404)
        const shift_id = shiftIdSchema.parse(new URL(request.url).searchParams.get('shift_id'))
        const session = await getClient()
        const admin = getAdmin()
        const supervisor = actor.systemPermission === 'admin' || actor.systemPermission === 'leader'
        if (!supervisor && actor.systemPermission !== 'member') return fail('PERMISSION_DENIED',403)
        let rows: Array<{id:string;request_id:string;shift_id:string;staff_id:string;operational_role:string;event_kind:string;recorded_at:string}>
        if (supervisor) {
          const scope = await session.from('shifts').select('id').eq('id', shift_id).maybeSingle()
          if (scope.error || !scope.data) return fail('ATTENDANCE_REVIEW_NOT_FOUND', 404)
          const events = await admin.from('self_attendance_events')
            .select('id,request_id,shift_id,staff_id,operational_role,event_kind,recorded_at')
            .eq('shift_id', shift_id).order('recorded_at', { ascending: false }).limit(100)
          if (events.error) return fail('ATTENDANCE_REVIEW_UNAVAILABLE', 503)
          rows = events.data ?? []
        } else {
          const own = await session.rpc('get_my_self_attendance',{p_shift_id:shift_id,p_limit:100})
          if (own.error || !Array.isArray(own.data)) return fail('ATTENDANCE_REVIEW_UNAVAILABLE',503)
          rows = own.data.map((row:Record<string,string>) => ({
            id:row.event_id,request_id:'',shift_id:row.shift_id,staff_id:row.staff_id,
            operational_role:row.role,event_kind:row.event,recorded_at:row.recorded_at,
          }))
        }
        const ids = rows.map(row => row.id)
        if(!supervisor&&ids.length) {
          const ownDetails=await admin.from('self_attendance_events')
            .select('id,request_id').in('id',ids).eq('staff_id',actor.businessUserId)
          if(ownDetails.error)return fail('ATTENDANCE_REVIEW_UNAVAILABLE',503)
          const ownRequestByEvent=new Map((ownDetails.data??[]).map(row=>[row.id,row.request_id]))
          rows=rows.filter(row=>ownRequestByEvent.has(row.id)).map(row=>({...row,request_id:ownRequestByEvent.get(row.id)!}))
        }
        const [reviews, revisions] = await Promise.all([
          ids.length ? admin.from('self_attendance_photo_review_events')
            .select('attendance_event_id,evidence_request_id,decision,reason,reviewer_id,version,evidence_revision,created_at')
            .in('attendance_event_id', ids).order('version', { ascending: true })
            : admin.from('self_attendance_photo_review_events').select('attendance_event_id').limit(0),
          ids.length ? admin.from('self_attendance_photo_evidence_revisions')
            .select('attendance_event_id,request_id,revision,created_at')
            .in('attendance_event_id', ids).order('revision',{ascending:true})
            : admin.from('self_attendance_photo_evidence_revisions').select('attendance_event_id').limit(0),
        ])
        if (reviews.error || revisions.error) return fail('ATTENDANCE_REVIEW_UNAVAILABLE', 503)
        const reviewRows = (reviews.data ?? []) as Array<{
          evidence_request_id:string
          attendance_event_id: string; decision: 'approved'|'rejected'|'correction_requested'
          reason: string; reviewer_id: string; version: number; evidence_revision:number; created_at: string
        }>
        const revisionRows=(revisions.data??[]) as Array<{attendance_event_id:string;request_id:string;revision:number;created_at:string}>
        const originalRequests=rows.map(row=>row.request_id).filter(Boolean)
        const originalPhotos=originalRequests.length ? await admin.from('self_attendance_photo_evidence')
          .select('request_id,created_at').in('request_id',originalRequests) : {data:[],error:null}
        if(originalPhotos.error)return fail('ATTENDANCE_REVIEW_UNAVAILABLE',503)
        const photoByRequest=new Map((originalPhotos.data??[]).map(row=>[row.request_id,row.created_at]))
        const events=rows.flatMap(event => {
          const history = reviewRows.filter(review => review.attendance_event_id === event.id)
          const latest = history.at(-1)
          const revisionsForEvent=revisionRows.filter(revision=>revision.attendance_event_id===event.id)
          const evidenceRevisions=[
            ...(photoByRequest.has(event.request_id)?[{revision:1,request_id:event.request_id,created_at:photoByRequest.get(event.request_id)}]:[]),
            ...revisionsForEvent.map(revision=>({revision:revision.revision,request_id:revision.request_id,created_at:revision.created_at})),
          ]
          const currentRevision=evidenceRevisions.at(-1)
          const canCorrect=latest?.decision==='correction_requested' && currentRevision?.request_id===latest.evidence_request_id
          const currentStatus=latest?.decision==='correction_requested'&&currentRevision&&latest.evidence_revision!==currentRevision.revision
            ? 'pending_verification':latest?.decision??'pending_verification'
          if(!supervisor && !canCorrect)return []
          return [{
            id: event.id, shift_id: event.shift_id, staff_id: event.staff_id,
            role: event.operational_role, event: event.event_kind, recorded_at: event.recorded_at,
            photo_available: evidenceRevisions.length>0,
            version: latest?.version ?? 0,
            evidence_revision:currentRevision?.revision??0,
            correction_requested_by:latest?.decision==='correction_requested'?latest.reason:null,
            correction_allowed:canCorrect,
            evidence_revisions:evidenceRevisions.map(({revision,created_at})=>({revision,created_at})),
            status: currentStatus,
            review_history: history.map(review => ({
              decision: review.decision, reason: review.reason, reviewer_id: review.reviewer_id,
              version: review.version, evidence_revision:review.evidence_revision,created_at: review.created_at,
            })),
          }]
        })
        return Response.json(supervisor?{ok:true,events}:{ok:true,corrections:events}, { headers: noStore })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof z.ZodError) return fail('ATTENDANCE_REVIEW_REQUEST_INVALID', 400)
        return fail(error instanceof RequestBodyError ? error.code : 'ATTENDANCE_REVIEW_UNAVAILABLE', error instanceof RequestBodyError ? error.status : 503)
      }
    },
    POST: async (request: Request) => {
      try {
        if (!hasExactOrigin(request)) return fail('ATTENDANCE_REVIEW_ORIGIN_INVALID',403)
        const actor = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
        if (!actor.businessUserId) return fail('ATTENDANCE_REVIEW_ACTOR_REQUIRED', 403)
        if (!enabled()) return fail('ATTENDANCE_REVIEW_DISABLED', 404)
        const body = decisionSchema.parse(await readJsonBody(request, 8_192))
        const session = await getClient()
        const result = await session.rpc('review_self_attendance_photo', {
          p_event_id: body.event_id,
          p_expected_version: body.expected_version,
          p_expected_evidence_revision:body.expected_evidence_revision,
          p_decision: body.decision,
          p_reason: body.reason,
          p_idempotency_key: body.idempotency_key,
        })
        if (result.error) {
          const code = result.error.code === '42501' ? 'PERMISSION_DENIED'
            : result.error.code === '40001' || result.error.code === '23505' || result.error.code === '23514' ? 'ATTENDANCE_REVIEW_CONFLICT'
              : result.error.message?.includes('ATTENDANCE_REVIEW_SCHEMA_UNAVAILABLE') ? 'ATTENDANCE_REVIEW_UNAVAILABLE'
                : 'ATTENDANCE_REVIEW_FAILED'
          return fail(code, code === 'PERMISSION_DENIED' ? 403 : code === 'ATTENDANCE_REVIEW_CONFLICT' ? 409 : 503)
        }
        return Response.json({ ok: true, review: result.data }, { headers: noStore })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof z.ZodError) return fail('ATTENDANCE_REVIEW_REQUEST_INVALID', 400)
        return fail(error instanceof RequestBodyError ? error.code : 'ATTENDANCE_REVIEW_FAILED', error instanceof RequestBodyError ? error.status : 503)
      }
    },
  }
}
