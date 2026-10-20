import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  resolveServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import {
  previewAttendanceImport,
  buildActualSegmentsFromMatches,
} from '@/lib/workforce/historicalAttendanceService'
import { ShiftReference, StaffReference } from '@/lib/workforce/historicalAttendanceMatcher'
import {
  SourceProfileId,
  RawAttendanceInputRow,
  ControlTimesheetRow,
  AttendanceMatchResult,
} from '@/lib/workforce/historicalAttendanceTypes'

const noStore = { 'Cache-Control': 'no-store' }
const fail = (code: string, status: number, detail?: string) =>
  Response.json({ ok: false, error: { code, detail } }, { status, headers: noStore })

export interface HistoricalAttendanceHandlerDepends {
  client?: () => SupabaseClient
  resolveUser?: ServerUserResolver
  isEnabled?: () => boolean
}

export function createHistoricalAttendanceHandler(depends: HistoricalAttendanceHandlerDepends = {}) {
  const isEnabled = depends.isEnabled ?? (() => true)
  const getClient = depends.client ?? createSupabaseAdminClient

  return {
    async GET(req: Request): Promise<Response> {
      if (!isEnabled()) return fail('WORKFORCE_FEATURE_DISABLED', 404)
      const url = new URL(req.url)
      const action = url.searchParams.get('action') || 'list_batches'

      try {
        await requireRole(req, ['admin', 'leader'], depends.resolveUser ?? resolveServerUser)

        const client = getClient()

        if (action === 'list_batches') {
          const { data, error } = await client
            .from('workforce_attendance_import_batches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50)

          if (error) return fail('DATABASE_ERROR', 500, error.message)
          return Response.json({ ok: true, batches: data || [] }, { headers: noStore })
        }

        if (action === 'get_batch') {
          const batchId = url.searchParams.get('batch_id')
          if (!batchId) return fail('BATCH_ID_REQUIRED', 400)

          const { data: batch, error: batchErr } = await client
            .from('workforce_attendance_import_batches')
            .select('*')
            .eq('id', batchId)
            .maybeSingle()

          if (batchErr || !batch) return fail('BATCH_NOT_FOUND', 404)

          const { data: rows, error: rowsErr } = await client
            .from('workforce_attendance_import_rows')
            .select('*')
            .eq('batch_id', batchId)
            .order('source_row_number', { ascending: true })

          if (rowsErr) return fail('DATABASE_ERROR', 500, rowsErr.message)
          return Response.json({ ok: true, batch, rows: rows || [] }, { headers: noStore })
        }

        if (action === 'list_exceptions') {
          const batchId = url.searchParams.get('batch_id')
          if (!batchId) return fail('BATCH_ID_REQUIRED', 400)

          const { data, error } = await client
            .from('workforce_attendance_import_rows')
            .select('*')
            .eq('batch_id', batchId)
            .eq('status', 'exception')
            .order('source_row_number', { ascending: true })

          if (error) return fail('DATABASE_ERROR', 500, error.message)
          return Response.json({ ok: true, exceptions: data || [] }, { headers: noStore })
        }

        return fail('UNKNOWN_ACTION', 400)
      } catch (err) {
        if (isAuthorizationError(err)) return authorizationErrorResponse(err)
        return fail('INTERNAL_SERVER_ERROR', 500, err instanceof Error ? err.message : undefined)
      }
    },

    async POST(req: Request): Promise<Response> {
      if (!isEnabled()) return fail('WORKFORCE_FEATURE_DISABLED', 404)

      try {
        const user = await requireRole(req, ['admin', 'leader'], depends.resolveUser ?? resolveServerUser)

        const body = (await readJsonBody(req, 10 * 1024 * 1024)) as {
          action?: string
          sourceProfileId?: SourceProfileId
          sourceName?: string
          sourceType?: 'google_sheets' | 'excel_upload' | 'csv_upload' | 'shift_manager_control'
          rawRows?: RawAttendanceInputRow[]
          controlRows?: ControlTimesheetRow[]
          brandName?: string
          batchId?: string
          matchedResults?: AttendanceMatchResult[]
        }
        const action = body.action

        const client = getClient()

        if (action === 'preview') {
          const {
            sourceProfileId = 'opella_t10',
            sourceName = 'attendance_upload.xlsx',
            sourceType = 'google_sheets',
            rawRows = [],
            controlRows = [],
            brandName,
          } = body

          // Fetch completed shifts from DB to match against
          const { data: shiftsData, error: shiftsErr } = await client
            .from('shifts')
            .select('id, brand_id, start_time, end_time, status, host_id, support_id, technical_id, brands(name)')
            .is('deleted_at', null)
            .eq('status', 'completed')

          if (shiftsErr) return fail('DATABASE_ERROR', 500, shiftsErr.message)

          // Fetch staff directory
          const { data: staffData, error: staffErr } = await client
            .from('business_users')
            .select('id, full_name, email, system_permission, status')
            .is('deleted_at', null)
            .eq('status', 'active')

          if (staffErr) return fail('DATABASE_ERROR', 500, staffErr.message)

          const shiftRefs: ShiftReference[] = ((shiftsData as unknown as Array<{
            id: string
            brand_id?: string | null
            start_time: string
            end_time: string
            status: 'preparing' | 'scheduled' | 'live' | 'completed' | 'cancelled'
            host_id?: string | null
            support_id?: string | null
            technical_id?: string | null
            brands?: { name: string } | null
          }>) || []).map(sh => ({
            id: sh.id,
            brandId: sh.brand_id,
            brandName: sh.brands?.name,
            startTime: sh.start_time,
            endTime: sh.end_time,
            status: sh.status,
            hostId: sh.host_id,
            supportId: sh.support_id,
            technicalId: sh.technical_id,
          }))

          const staffRefs: StaffReference[] = ((staffData as unknown as Array<{
            id: string
            full_name: string
            email?: string
            system_permission: string
            status: 'active' | 'inactive'
          }>) || []).map(st => ({
            id: st.id,
            fullName: st.full_name,
            email: st.email,
            systemPermission: st.system_permission,
            status: st.status,
          }))

          const preview = previewAttendanceImport({
            sourceProfileId: sourceProfileId as SourceProfileId,
            sourceType,
            sourceName,
            rawRows,
            controlRows,
            brandName,
            shifts: shiftRefs,
            staffList: staffRefs,
          })

          return Response.json(
            {
              ok: true,
              batchId: preview.batchId,
              sourceFingerprint: preview.sourceFingerprint,
              summary: preview.summary,
              results: preview.results,
              errors: preview.errors,
            },
            { headers: noStore }
          )
        }

        if (action === 'confirm_drafts') {
          const { batchId, matchedResults } = body
          if (!batchId || !Array.isArray(matchedResults)) {
            return fail('INVALID_REQUEST_PARAMETERS', 400)
          }

          const draftSegments = buildActualSegmentsFromMatches({
            matchedResults,
            creatorId: user.id,
            batchId,
          })

          if (draftSegments.length === 0) {
            return Response.json(
              { ok: true, createdCount: 0, message: 'No eligible matched segments to draft' },
              { headers: noStore }
            )
          }

          // Insert into workforce_actual_segments in 'draft' status
          const { data: inserted, error: insertErr } = await client
            .from('workforce_actual_segments')
            .insert(draftSegments)
            .select('id')

          if (insertErr) return fail('DATABASE_ERROR', 500, insertErr.message)

          return Response.json(
            {
              ok: true,
              batchId,
              createdCount: inserted?.length || 0,
              message: `Drafted ${inserted?.length || 0} actual segments pending independent review`,
            },
            { headers: noStore }
          )
        }

        return fail('UNKNOWN_ACTION', 400)
      } catch (err) {
        if (isAuthorizationError(err)) return authorizationErrorResponse(err)
        if (err instanceof RequestBodyError) return fail(err.code, 400)
        return fail('INTERNAL_SERVER_ERROR', 500, err instanceof Error ? err.message : undefined)
      }
    },
  }
}
