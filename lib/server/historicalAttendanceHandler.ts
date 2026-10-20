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
  createSourceFingerprint,
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
          version?: number
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

          // Compute deterministic SHA-256 fingerprint of the input
          const payloadString = JSON.stringify(controlRows.length > 0 ? controlRows : rawRows)
          const sourceFingerprint = createSourceFingerprint(payloadString)

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

          // P0-2: Stage batch and rows to database
          if (existingBatch && existingBatch.status === 'staged') {
            // Delete old staged rows for this batch before re-staging
            await client.from('workforce_attendance_import_rows').delete().eq('batch_id', batchId)
            await client.from('workforce_attendance_import_batches').update({
              total_rows: preview.summary.totalRows,
              matched_rows: preview.summary.matchedRows,
              exception_rows: preview.summary.exceptionRows,
              metadata: {
                sourceProfileId,
                exceptionsSummary: preview.summary.exceptionsSummary,
              },
              updated_at: new Date().toISOString(),
            }).eq('id', batchId)
          } else {
            const { error: batchInsertErr } = await client.from('workforce_attendance_import_batches').insert({
              id: batchId,
              source_type: sourceType,
              source_name: sourceName,
              source_fingerprint: sourceFingerprint,
              timezone: 'Asia/Ho_Chi_Minh',
              status: 'staged',
              total_rows: preview.summary.totalRows,
              matched_rows: preview.summary.matchedRows,
              exception_rows: preview.summary.exceptionRows,
              drafted_segments: 0,
              metadata: {
                sourceProfileId,
                exceptionsSummary: preview.summary.exceptionsSummary,
              },
              created_by: user.id,
              version: 1,
            })
            if (batchInsertErr) return fail('DATABASE_ERROR', 500, batchInsertErr.message)
          }

          // Insert staged rows in bulk
          const rowInserts = preview.results.map((r, idx) => ({
            batch_id: batchId,
            source_row_number: r.rowNumber || idx + 1,
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

          if (rowInserts.length > 0) {
            const { error: rowInsertErr } = await client
              .from('workforce_attendance_import_rows')
              .insert(rowInserts)
            if (rowInsertErr) return fail('DATABASE_ERROR', 500, rowInsertErr.message)
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

          // 1. Fetch staged batch from database
          const { data: batch, error: batchErr } = await client
            .from('workforce_attendance_import_batches')
            .select('*')
            .eq('id', batchId)
            .maybeSingle()

          if (batchErr || !batch) {
            return fail('BATCH_NOT_FOUND', 404, `Không tìm thấy batch staged #${batchId}`)
          }

          // Replay protection
          if (batch.status === 'confirmed') {
            return fail('BATCH_ALREADY_CONFIRMED', 409, `Batch #${batchId} đã được xác nhận trước đó`)
          }

          if (batch.status !== 'staged') {
            return fail('INVALID_BATCH_STATUS', 400, `Trạng thái batch không hợp lệ (${batch.status}). Chỉ batch 'staged' mới được xác nhận.`)
          }

          // Optimistic locking
          if (version !== undefined && batch.version !== version) {
            return fail('STALE_BATCH_VERSION', 409, 'Phiên bản batch đã thay đổi do thao tác khác, vui lòng kiểm tra lại')
          }

          // 2. Fetch staged rows from database
          const { data: stagedRows, error: rowsErr } = await client
            .from('workforce_attendance_import_rows')
            .select('*')
            .eq('batch_id', batchId)
            .eq('status', 'matched')
            .order('source_row_number', { ascending: true })

          if (rowsErr) return fail('DATABASE_ERROR', 500, rowsErr.message)

          if (!stagedRows || stagedRows.length === 0) {
            return Response.json(
              { ok: true, batchId, createdCount: 0, message: 'Không có dòng hợp lệ nào để tạo bản ghi chấm công' },
              { headers: noStore }
            )
          }

          // 3. Independent Server Re-Verification (Shifts completed, Staff active, No overlaps)
          const shiftIds = [...new Set(stagedRows.map(r => r.matched_shift_id).filter(Boolean))] as string[]
          const staffIds = [...new Set(stagedRows.map(r => r.matched_staff_id).filter(Boolean))] as string[]

          const { data: verifiedShifts } = await client
            .from('shifts')
            .select('id, status, deleted_at')
            .in('id', shiftIds)

          const completedShiftIds = new Set(
            (verifiedShifts || [])
              .filter(s => s.status === 'completed' && !s.deleted_at)
              .map(s => s.id)
          )

          const { data: verifiedStaff } = await client
            .from('business_users')
            .select('id, status, deleted_at')
            .in('id', staffIds)

          const activeStaffIds = new Set(
            (verifiedStaff || [])
              .filter(s => s.status === 'active' && !s.deleted_at)
              .map(s => s.id)
          )

          const { data: currentActuals } = await client
            .from('workforce_actual_segments')
            .select('staff_id, actual_start_at, actual_end_at')
            .in('staff_id', staffIds)
            .neq('review_status', 'rejected')

          const eligibleRows: typeof stagedRows = []
          for (const r of stagedRows) {
            if (!completedShiftIds.has(r.matched_shift_id)) continue
            if (!activeStaffIds.has(r.matched_staff_id)) continue
            if (!['actual_punch', 'supervisor_verified'].includes(r.evidence_kind)) continue

            const rStart = Date.parse(r.parsed_start_at)
            const rEnd = Date.parse(r.parsed_end_at)
            const hasOverlap = (currentActuals || []).some(ca => {
              if (ca.staff_id !== r.matched_staff_id) return false
              const caStart = Date.parse(ca.actual_start_at)
              const caEnd = Date.parse(ca.actual_end_at)
              return Math.max(rStart, caStart) < Math.min(rEnd, caEnd)
            })
            if (hasOverlap) continue

            eligibleRows.push(r)
          }

          if (eligibleRows.length === 0) {
            return Response.json(
              { ok: true, batchId, createdCount: 0, message: 'Các dòng staged không vượt qua bước kiểm tra lại độc lập trên máy chủ' },
              { headers: noStore }
            )
          }

          // 4. Build draft actual segments (Strict 4-eyes: review_status='draft', reviewed_by=null)
          const draftSegments = eligibleRows.map(r => {
            const note = `Imported from staged batch #${batchId} row ${r.source_row_number}: ${r.raw_notes || 'Xác nhận chấm công hợp lệ'}`
            return {
              shift_id: r.matched_shift_id,
              staff_id: r.matched_staff_id,
              operational_role: r.operational_role,
              event_kind: 'worked' as const,
              coverage_kind: r.coverage_kind || 'planned',
              actual_start_at: r.parsed_start_at,
              actual_end_at: r.parsed_end_at,
              review_status: 'draft' as const,
              evidence_note: note.slice(0, 2000),
              created_by: user.id,
              reviewed_by: null,
              reviewed_at: null,
              review_note: null,
            }
          })

          // 5. Insert drafts into workforce_actual_segments
          const { data: inserted, error: insertErr } = await client
            .from('workforce_actual_segments')
            .insert(draftSegments)
            .select('id')

          if (insertErr) return fail('DATABASE_ERROR', 500, insertErr.message)

          // 6. Update row provenance with resulting_segment_id
          for (let i = 0; i < eligibleRows.length; i++) {
            const row = eligibleRows[i]
            const seg = inserted?.[i]
            if (seg) {
              await client
                .from('workforce_attendance_import_rows')
                .update({
                  status: 'drafted',
                  resulting_segment_id: seg.id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', row.id)
            }
          }

          // 7. Update batch status to confirmed
          await client
            .from('workforce_attendance_import_batches')
            .update({
              status: 'confirmed',
              drafted_segments: inserted?.length || 0,
              version: (batch.version || 1) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', batchId)

          return Response.json(
            {
              ok: true,
              batchId,
              createdCount: inserted?.length || 0,
              message: `Đã tạo ${inserted?.length || 0} bản ghi Actual Staffing (DRAFT) từ batch #${batchId} chờ kiểm duyệt độc lập`,
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
