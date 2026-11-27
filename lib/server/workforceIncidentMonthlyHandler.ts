import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError, requireRole,
  type ServerUserResolver } from '@/lib/server/authGuards'
import type { WorkforceIncidentMonthlyResponse } from '@/lib/types/workforceIncidentMonth'

const incidentTypes = ['skip', 'absent', 'authorized_absence', 'late', 'early_leave',
  'approved_pass', 'approved_swap', 'planned_reassignment', 'other'] as const
const querySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  staff_id: z.string().trim().min(1).max(128).optional(),
  brand_id: z.string().trim().min(1).max(128).optional(),
  role: z.enum(['host', 'support', 'technical']).optional(),
  agency_id: z.string().uuid().optional(),
  platform_id: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['pending', 'confirmed', 'rejected', 'corrected']).optional(),
  incident_type: z.enum(incidentTypes).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict()

const itemSchema = z.object({
  incidentId: z.string().min(1), shiftId: z.string().min(1),
  staffingSegmentId: z.string().nullable(),
  role: z.enum(['host', 'support', 'technical']),
  businessDate: z.string().date(), type: z.enum(incidentTypes),
  reviewState: z.enum(['pending', 'confirmed', 'rejected', 'corrected']),
  verifiedLateMinutes: z.number().int().nonnegative().nullable(),
  version: z.number().int().positive(),
}).strict()

const staffSchema = z.object({
  staff_id: z.string().min(1), incident_count: z.number().int().nonnegative(),
  distinct_shift_count: z.number().int().nonnegative(),
  pending_count: z.number().int().nonnegative(), confirmed_count: z.number().int().nonnegative(),
  rejected_count: z.number().int().nonnegative(), corrected_count: z.number().int().nonnegative(),
  confirmed_skip_count: z.number().int().nonnegative(), confirmed_absent_count: z.number().int().nonnegative(),
  confirmed_authorized_absence_count: z.number().int().nonnegative(), confirmed_late_count: z.number().int().nonnegative(),
  confirmed_early_leave_count: z.number().int().nonnegative(), approved_pass_count: z.number().int().nonnegative(),
  approved_swap_count: z.number().int().nonnegative(), unknown_late_minutes_count: z.number().int().nonnegative(),
  verified_late_minutes_total: z.number().int().nonnegative(), items: z.array(itemSchema),
}).strict()

const responseSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  timezone: z.literal('Asia/Ho_Chi_Minh'),
  pageLimit: z.number().int().min(1).max(100),
  pageOffset: z.number().int().min(0).max(100000),
  totalIncidents: z.number().int().nonnegative(),
  totalDistinctShifts: z.number().int().nonnegative(),
  totalDistinctStaff: z.number().int().nonnegative(),
  staff: z.array(staffSchema),
}).strict()

type Options = {
  createClient?: () => SupabaseClient | Promise<SupabaseClient>
  resolveUser?: ServerUserResolver
}

const noStore = { 'Cache-Control': 'no-store' }
const failure = (code: string, status: number) => Response.json({ ok: false, error: { code } }, { status, headers: noStore })

export function createWorkforceIncidentMonthlyHandler(options: Options = {}) {
  return { async GET(request: Request): Promise<Response> {
    try {
      await requireRole(request, ['admin', 'leader', 'member'], options.resolveUser)
      const url = new URL(request.url)
      const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
      if (!parsed.success) return failure('WORKFORCE_MONTH_QUERY_INVALID', 400)

      const { month, staff_id, brand_id, role, agency_id, platform_id, status, incident_type, limit, offset } = parsed.data
      const db = options.createClient
        ? await options.createClient()
        : await (await import('@/lib/supabase/server')).createClient()
      const result = await db.rpc('rc19_workforce_incident_monthly_v2', {
        p_month: `${month}-01`,
        p_staff_id: staff_id ?? null,
        p_brand_id: brand_id ?? null,
        p_role: role ?? null,
        p_agency_id: agency_id ?? null,
        p_platform_id: platform_id ?? null,
        p_review_state: status ?? null,
        p_incident_type: incident_type ?? null,
        p_limit: limit,
        p_offset: offset,
      })
      if (result.error) {
        const message = result.error.message ?? ''
        if (/WORKFORCE_(ACTOR_NOT_AUTHORIZED|SELF_SCOPE_REQUIRED|READ_REQUIRED|BRAND_SCOPE_REQUIRED|AGENCY_SCOPE_REQUIRED)/u.test(message))
          return failure(message.match(/WORKFORCE_[A-Z_]+/u)?.[0] ?? 'PERMISSION_DENIED', 403)
        if (message.includes('WORKFORCE_MONTH_INVALID')) return failure('WORKFORCE_MONTH_QUERY_INVALID', 400)
        return failure('WORKFORCE_INCIDENT_SUMMARY_UNAVAILABLE', 503)
      }
      const checked = responseSchema.safeParse(result.data)
      if (!checked.success || checked.data.month !== month
        || checked.data.pageLimit !== limit || checked.data.pageOffset !== offset)
        return failure('WORKFORCE_INCIDENT_SUMMARY_INVALID', 502)
      return Response.json({ ok: true, data: checked.data satisfies WorkforceIncidentMonthlyResponse }, { headers: noStore })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      return failure('WORKFORCE_INCIDENT_SUMMARY_UNAVAILABLE', 503)
    }
  } }
}
