import { z } from 'zod'
import { requireRole, authorizationErrorResponse, isAuthorizationError } from '@/lib/server/authGuards'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
export const attendanceReviewBodySchema = z.object({
  event_id: z.string().uuid(),
  evidence_request_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative(),
  decision: z.enum(['approved', 'rejected', 'correction_requested']),
  reason: z.string().trim().min(8).max(2000),
}).strict()
const fail = (error: string, status: number) => Response.json({ ok: false, error: { code: error } }, { status, headers })
const uid = (request: Request) => request.headers.get('origin') === new URL(request.url).origin

export async function GET(request: Request) {
  try {
    const actor = await requireRole(request, ['admin', 'leader'])
    if (!actor.businessUserId) return fail('PERMISSION_DENIED', 403)
    if (process.env.FEATURE_SELF_ATTENDANCE_REVIEW !== 'true') return fail('ATTENDANCE_REVIEW_DISABLED', 503)
    const session = await createSessionClient()
    const active = await session.rpc('get_my_self_attendance', { p_shift_id: null, p_limit: 1 })
    if (active.error) return fail('PERMISSION_DENIED', 403)
    const url = new URL(request.url)
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).safeParse(url.searchParams.get('date'))
    if (!date.success) return fail('ATTENDANCE_REVIEW_DATE_INVALID', 400)
    const visible = await session.from('shifts').select('id').eq('date', date.data).is('deleted_at', null).is('archived_at', null).limit(501)
    if (visible.error) return fail('ATTENDANCE_REVIEW_READ_FAILED', 503)
    if ((visible.data || []).length > 500) return fail('ATTENDANCE_REVIEW_RESULT_LIMIT', 413)
    const shiftIds = (visible.data || []).map(row => row.id)
    if (!shiftIds.length) return Response.json({ ok: true, events: [] }, { headers })
    const admin = createSupabaseAdminClient()
    const events = await admin.from('self_attendance_events')
      .select('id,request_id,shift_id,staff_id,operational_role,event_kind,recorded_at')
      .in('shift_id', shiftIds).order('recorded_at', { ascending: false }).limit(501)
    if (events.error) return fail('ATTENDANCE_REVIEW_READ_FAILED', 503)
    if ((events.data || []).length > 500) return fail('ATTENDANCE_REVIEW_RESULT_LIMIT', 413)
    const eventRows = events.data || []
    if (!eventRows.length) return Response.json({ ok: true, events: [] }, { headers })
    const eventIds = eventRows.map(row => row.id)
    const requests = [...new Set(eventRows.map(row => row.request_id))]
    const [base, addenda, reviews, users] = await Promise.all([
      admin.from('self_attendance_photo_evidence').select('request_id,shift_id,staff_id,operational_role,event_kind,file_name,mime_type,size_bytes,checksum_sha256,capture_source,created_at').in('request_id', requests),
      admin.from('self_attendance_photo_evidence_addenda').select('request_id,event_id,previous_request_id,file_name,mime_type,size_bytes,checksum_sha256,capture_source,created_at,revision_no').in('event_id', eventIds).order('revision_no'),
      admin.from('self_attendance_photo_evidence_reviews').select('id,event_id,evidence_request_id,review_version,decision,reason,reviewer_id,reviewed_at').in('event_id', eventIds).order('review_version'),
      admin.from('business_users').select('id,full_name').in('id', [...new Set(eventRows.map(row => row.staff_id))]),
    ])
    if ([base, addenda, reviews, users].some(result => result.error)) return fail('ATTENDANCE_REVIEW_READ_FAILED', 503)
    const names = new Map((users.data || []).map(user => [user.id, user.full_name]))
    const evidence = [...(base.data || []), ...(addenda.data || [])]
    const history = reviews.data || []
    return Response.json({ ok: true, events: eventRows.map(event => ({
      ...event, staff_name: names.get(event.staff_id) || event.staff_id,
      review_version: history.filter(item => item.event_id === event.id).at(-1)?.review_version || 0,
      evidence: evidence.filter(item => ('event_id' in item ? item.event_id : eventRows.find(row => row.request_id === item.request_id)?.id) === event.id).map(item => ({
        ...item, photo_url: `/api/workforce/self-attendance-photo?event_id=${event.id}&request_id=${item.request_id}`,
      })),
      history: history.filter(item => item.event_id === event.id),
    })) }, { headers })
  } catch (error) {
    if (isAuthorizationError(error)) return authorizationErrorResponse(error)
    return fail('ATTENDANCE_REVIEW_READ_FAILED', 503)
  }
}

export async function POST(request: Request) {
  try {
    if (!uid(request)) return fail('ATTENDANCE_REVIEW_ORIGIN_INVALID', 403)
    const actor = await requireRole(request, ['admin', 'leader'])
    if (!actor.businessUserId) return fail('PERMISSION_DENIED', 403)
    if (process.env.FEATURE_SELF_ATTENDANCE_REVIEW !== 'true') return fail('ATTENDANCE_REVIEW_DISABLED', 503)
    const parsed = attendanceReviewBodySchema.safeParse(await request.json())
    if (!parsed.success) return fail('ATTENDANCE_REVIEW_REQUEST_INVALID', 400)
    const session = await createSessionClient()
    const active = await session.rpc('get_my_self_attendance', { p_shift_id: null, p_limit: 1 })
    if (active.error) return fail('PERMISSION_DENIED', 403)
    const result = await session.rpc('review_self_attendance_photo_evidence', {
      p_event_id: parsed.data.event_id, p_evidence_request_id: parsed.data.evidence_request_id,
      p_expected_version: parsed.data.expected_version, p_decision: parsed.data.decision,
      p_reason: parsed.data.reason,
    })
    if (result.error) {
      const known = ['ATTENDANCE_REVIEW_FORBIDDEN','ATTENDANCE_REVIEW_SCOPE_DENIED','ATTENDANCE_REVIEW_SELF_REVIEW','ATTENDANCE_REVIEW_INVALID','ATTENDANCE_REVIEW_EVIDENCE_INVALID','ATTENDANCE_REVIEW_EVIDENCE_STALE','ATTENDANCE_REVIEW_VERSION_CONFLICT','ATTENDANCE_EVIDENCE_ALREADY_REVIEWED']
      const code = known.find(value => result.error?.message.includes(value)) || 'ATTENDANCE_REVIEW_FAILED'
      const status = result.error.code === '42501' ? 403 : ['40001','23505'].includes(result.error.code || '') ? 409 : result.error.code === '22023' ? 400 : 503
      return fail(code, status)
    }
    return Response.json({ ok: true, review: result.data }, { headers })
  } catch (error) {
    if (isAuthorizationError(error)) return authorizationErrorResponse(error)
    return fail('ATTENDANCE_REVIEW_REQUEST_INVALID', 400)
  }
}
