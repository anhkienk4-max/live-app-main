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
import { randomUUID } from 'node:crypto'
import {
  previewAttendanceImport,
} from '@/lib/workforce/historicalAttendanceService'
import {
  ShiftReference,
  StaffReference,
  computeCompositeFingerprint,
} from '@/lib/workforce/historicalAttendanceMatcher'
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

          const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '500', 10), 1), 5000)
          const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

          const { data: batch, error: batchErr } = await client
            .from('workforce_attendance_import_batches')
            .select('*')
            .eq('id', batchId)
            .maybeSingle()

          if (batchErr || !batch) return fail('BATCH_NOT_FOUND', 404)

          const query = client
            .from('workforce_attendance_import_rows')
            .select('*')
            .eq('batch_id', batchId)
            .order('source_row_number', { ascending: true })

          if (url.searchParams.has('limit') || url.searchParams.has('offset')) {
            query.range(offset, offset + limit - 1)
          }

          const { data: rows, error: rowsErr } = await query

          if (rowsErr) return fail('DATABASE_ERROR', 500, rowsErr.message)
          return Response.json({
            ok: true,
            batch,
            total: batch.total_rows,
            offset,
            limit,
            rows: rows || [],
          }, { headers: noStore })
        }

        if (action === 'list_exceptions') {
          const batchId = url.searchParams.get('batch_id')
          if (!batchId) return fail('BATCH_ID_REQUIRED', 400)

          const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '500', 10), 1), 5000)
          const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

          const query = client
            .from('workforce_attendance_import_rows')
            .select('*')
            .eq('batch_id', batchId)
            .eq('status', 'exception')
            .order('source_row_number', { ascending: true })

          if (url.searchParams.has('limit') || url.searchParams.has('offset')) {
            query.range(offset, offset + limit - 1)
          }

          const { data, error } = await query

          if (error) return fail('DATABASE_ERROR', 500, error.message)
          return Response.json({
            ok: true,
            offset,
            limit,
            exceptions: data || [],
          }, { headers: noStore })
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
          version?: number
          revision?: number
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

          // Fetch completed shifts from DB to match against (Schema Parity: date DATE, start_time/end_time TIME WITHOUT TIME ZONE)
          const { data: shiftsData, error: shiftsErr } = await client
            .from('shifts')
            .select('id, brand_id, platform_id, date, start_time, end_time, status, host_id, support_id, technical_id, brands(name), platforms(name)')
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

          // Fetch approved actual segments to detect overlaps
          const { data: existingSegData } = await client
            .from('workforce_actual_segments')
            .select('staff_id, actual_start_at, actual_end_at')
            .neq('review_status', 'rejected')

          const existingSegments = (existingSegData || []).map(s => ({
            staffId: s.staff_id,
            startAt: s.actual_start_at,
            endAt: s.actual_end_at,
          }))

          const shiftRefs: ShiftReference[] = ((shiftsData as unknown as Array<{
            id: string
            brand_id?: string | null
            platform_id?: string | null
            date?: string | Date
            start_time: string
            end_time: string
            status: 'preparing' | 'scheduled' | 'live' | 'completed' | 'cancelled'
            host_id?: string | null
            support_id?: string | null
            technical_id?: string | null
            brands?: { name: string } | Array<{ name: string }> | null
            platforms?: { name: string } | Array<{ name: string }> | null
          }>) || []).map(sh => {
            let dateStr: string | undefined
            if (sh.date instanceof Date) {
              const y = sh.date.getFullYear()
              const m = String(sh.date.getMonth() + 1).padStart(2, '0')
              const d = String(sh.date.getDate()).padStart(2, '0')
              dateStr = `${y}-${m}-${d}`
            } else if (typeof sh.date === 'string') {
              dateStr = sh.date.trim().slice(0, 10)
            }
            const brandName = Array.isArray(sh.brands) ? sh.brands[0]?.name : sh.brands?.name
            const platformName = Array.isArray(sh.platforms) ? sh.platforms[0]?.name : sh.platforms?.name
            return {
              id: sh.id,
              date: dateStr,
              startTime: sh.start_time,
              endTime: sh.end_time,
              brandId: sh.brand_id,
              brandName,
              platformId: sh.platform_id,
              platformName,
              status: sh.status,
              hostId: sh.host_id,
              supportId: sh.support_id,
              technicalId: sh.technical_id,
            }
          })

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

          // Compute deterministic composite fingerprint with source identity and revision
          const sourceFingerprint = computeCompositeFingerprint({
            sourceType,
            sourceName,
            sourceProfileId: sourceProfileId || 'default',
            mappingVersion: 1,
            revision: body.revision || 1,
            payload: controlRows.length > 0 ? controlRows : rawRows,
          })

          // Check for existing batch with this fingerprint (Idempotency check)
          const { data: existingBatch } = await client
            .from('workforce_attendance_import_batches')
            .select('id, status, total_rows, matched_rows, exception_rows, drafted_segments')
            .eq('source_fingerprint', sourceFingerprint)
            .maybeSingle()

          if (existingBatch && existingBatch.status === 'confirmed') {
            return fail('BATCH_ALREADY_CONFIRMED', 409, `Nguồn dữ liệu này đã được xác nhận trước đó (Batch #${existingBatch.id}). Không thể nhập trùng lặp.`)
          }

          const batchId = (existingBatch && existingBatch.status === 'staged') ? existingBatch.id : randomUUID()

          const preview = previewAttendanceImport({
            batchId,
            sourceProfileId: sourceProfileId as SourceProfileId,
            sourceType,
            sourceName,
            rawRows,
            controlRows,
            brandName,
            shifts: shiftRefs,
            staffList: staffRefs,
            existingSegments,
          })

          const rowInserts = preview.results.map((r, idx) => ({
            batch_id: batchId,
            source_row_number: idx + 1,
            raw_payload: r.segment as unknown as Record<string, unknown>,
            parsed_date: r.segment.parsedDate || null,
            parsed_start_time: r.segment.startTime || null,
            parsed_end_time: r.segment.endTime || null,
            parsed_start_at: r.segment.startAtIso || null,
            parsed_end_at: r.segment.endAtIso || null,
            raw_staff_name: r.segment.rawStaffName || null,
            raw_role: r.segment.operationalRole || null,
            raw_notes: r.segment.rawNotes || null,
            matched_shift_id: r.matchedShiftId || null,
            matched_staff_id: r.matchedStaffId || null,
            operational_role: r.segment.operationalRole || null,
            coverage_kind: r.segment.coverageKind || 'planned',
            evidence_kind: r.segment.evidenceKind,
            status: r.status,
            exception_code: r.exceptionCode || null,
            exception_detail: r.exceptionDetail || null,
            resulting_segment_id: null,
          }))

          // Transaction boundaries must stay inside the database. There is no safe multi-request fallback.
          if (typeof client.rpc !== 'function') {
            return fail('ATOMIC_IMPORT_RPC_UNAVAILABLE', 503)
          }

          const { data: stageResult, error: stageErr } = await client.rpc('stage_attendance_import_batch', {
            p_batch_id: batchId,
            p_source_type: sourceType,
            p_source_name: sourceName,
            p_source_fingerprint: sourceFingerprint,
            p_timezone: 'Asia/Ho_Chi_Minh',
            p_brand_id: null,
            p_metadata: {
              sourceProfileId,
              revision: body.revision || 1,
              exceptionsSummary: preview.summary.exceptionsSummary,
            },
            p_actor_id: user.id,
            p_total_rows: preview.summary.totalRows,
            p_matched_rows: preview.summary.matchedRows,
            p_exception_rows: preview.summary.exceptionRows,
            p_rows: rowInserts,
          })

          if (stageErr) return fail('DATABASE_ERROR', 500, stageErr.message)
          if (!stageResult || typeof stageResult !== 'object' || Array.isArray(stageResult)
            || !('ok' in stageResult) || typeof stageResult.ok !== 'boolean') {
            return fail('INVALID_ATOMIC_IMPORT_RESPONSE', 502)
          }
          const staged = stageResult as { ok: boolean; code?: string; message?: string }
          if (!staged.ok) {
            if (staged.code === 'BATCH_ALREADY_CONFIRMED') {
              return fail('BATCH_ALREADY_CONFIRMED', 409, staged.message || 'Nguồn dữ liệu này đã được xác nhận trước đó')
            }
            return fail(staged.code || 'STAGE_FAILED', 400, staged.message)
          }

          return Response.json(
            {
              ok: true,
              batchId,
              sourceFingerprint,
              summary: preview.summary,
              results: preview.results,
              errors: preview.errors,
            },
            { headers: noStore }
          )
        }

        if (action === 'confirm_drafts') {
          // P0-1: Security hardening - NEVER trust client-supplied matchedResults
          const { batchId, version } = body
          if (!batchId) {
            return fail('INVALID_REQUEST_PARAMETERS', 400, 'batchId is required')
          }

          const expectedVersion = typeof version === 'number' ? version : null

          // Only the database RPC can provide a row-locked, atomic confirmation.
          if (typeof client.rpc !== 'function') {
            return fail('ATOMIC_IMPORT_RPC_UNAVAILABLE', 503)
          }
          const { data: rpcResult, error: rpcErr } = await client.rpc('confirm_attendance_import_batch', {
            p_batch_id: batchId,
            p_actor_id: user.id,
            p_expected_version: expectedVersion,
          })

          if (rpcErr) {
            const msg = rpcErr.message || ''
            if (msg.includes('IMPORT_BATCH_NOT_FOUND')) {
              return fail('BATCH_NOT_FOUND', 404, `Không tìm thấy batch staged #${batchId}`)
            }
            if (msg.includes('BATCH_ALREADY_CONFIRMED')) {
              return fail('BATCH_ALREADY_CONFIRMED', 409, `Batch #${batchId} đã được xác nhận trước đó`)
            }
            if (msg.includes('BATCH_VERSION_MISMATCH')) {
              return fail('STALE_BATCH_VERSION', 409, 'Phiên bản batch đã thay đổi do thao tác khác, vui lòng kiểm tra lại')
            }
            if (msg.includes('IMPORT_BATCH_NOT_STAGED')) {
              return fail('INVALID_BATCH_STATUS', 400, `Trạng thái batch không hợp lệ. Chỉ batch 'staged' mới được xác nhận.`)
            }
            if (msg.includes('FORBIDDEN_ATTENDANCE_ACTION')) {
              return fail('FORBIDDEN', 403, 'Bạn không có quyền xác nhận bản ghi chấm công')
            }
            return fail('DATABASE_ERROR', 500, msg)
          }

          if (!rpcResult || typeof rpcResult !== 'object' || Array.isArray(rpcResult)
            || !('ok' in rpcResult) || typeof rpcResult.ok !== 'boolean') {
            return fail('INVALID_ATOMIC_IMPORT_RESPONSE', 502)
          }
          const res = rpcResult as {
            ok: boolean
            code?: string
            message?: string
            batch_id?: string
            created_count?: number
            reconciled_count?: number
            skipped_count?: number
            version?: number
          }
          if (!res.ok) {
            if (res.code === 'BATCH_ALREADY_CONFIRMED') {
              return fail('BATCH_ALREADY_CONFIRMED', 409, res.message || `Batch #${batchId} đã được xác nhận trước đó`)
            }
            return fail(res.code || 'CONFIRM_FAILED', 400, res.message)
          }
          return Response.json({
            ok: true,
            batchId: res.batch_id || batchId,
            createdCount: res.created_count ?? 0,
            reconciledCount: res.reconciled_count ?? 0,
            skippedCount: res.skipped_count ?? 0,
            version: res.version,
            message: res.message || `Đã tạo ${res.created_count ?? 0} bản ghi Actual Staffing (DRAFT) từ batch #${batchId} chờ kiểm duyệt độc lập`,
          }, { headers: noStore })

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
