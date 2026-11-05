import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { ReportImage, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { buildReportExportRows, buildReportImageMetadataRows, buildWorkbookBytes, REPORT_CURRENCY_COLUMNS, type ReportExportContext } from '@/lib/utils/excelUtils'
import { reportFromRow } from '@/lib/services/supabaseReportService'
import { authorizationErrorResponse, isAuthorizationError, requirePermission, type ServerUserResolver } from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const PAGE_SIZE = 200
const ID_CHUNK_SIZE = 100
const inputSchema = z.object({
  kind: z.enum(['reports', 'report', 'images']),
  report_ids: z.array(z.string().trim().min(1).max(128)).min(1).max(5000),
}).strict().refine(input => new Set(input.report_ids).size === input.report_ids.length)
const fail = (code: string, status: number) => Response.json({ ok: false, error: { code } },
  { status, headers: { 'Cache-Control': 'no-store' } })

type PageResult = { data: unknown[] | null; count: number | null; error: unknown }
type PageReader = (from: number, to: number) => PromiseLike<PageResult>
type IdPageReader = (ids: string[], from: number, to: number) => PromiseLike<PageResult>

class ReportExportError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code) }
}

async function readAllRows(readPage: PageReader, code: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  const ids = new Set<string>()
  let expected: number | null = null
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await readPage(offset, offset + PAGE_SIZE - 1)
    if (page.error || !Array.isArray(page.data) || !Number.isSafeInteger(page.count) || page.count === null || page.count < 0) {
      throw new ReportExportError(code)
    }
    expected ??= page.count
    if (page.count !== expected || page.data.length !== Math.min(PAGE_SIZE, Math.max(0, expected - offset))) {
      throw new ReportExportError(code)
    }
    for (const raw of page.data) {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string') {
        throw new ReportExportError(code)
      }
      const id = String((raw as { id: string }).id)
      if (ids.has(id)) throw new ReportExportError(code)
      ids.add(id)
      rows.push(raw as Record<string, unknown>)
    }
    if (rows.length === expected) return rows
  }
}

async function readByIds(ids: string[], readPage: IdPageReader, code: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + ID_CHUNK_SIZE)
    rows.push(...await readAllRows((from, to) => readPage(chunk, from, to), code))
  }
  return rows
}

export function createReportExportHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<SupabaseClient>
  createPermissionClient?: () => Promise<Pick<SupabaseClient, 'rpc'>>
} = {}) {
  return { async POST(request: Request): Promise<Response> {
    try {
      const actor = await requirePermission(request, 'reports.export', dependencies.resolveUser, dependencies.createPermissionClient)
      if (!actor.businessUserId || !['admin', 'leader'].includes(actor.systemPermission)) return fail('REPORT_EXPORT_SCOPE_UNAVAILABLE', 403)

      const input = inputSchema.parse(await readJsonBody(request, 1024 * 1024))
      if (input.kind === 'report' && input.report_ids.length !== 1) return fail('REPORT_EXPORT_REQUEST_INVALID', 400)
      const client = dependencies.createClient
        ? await dependencies.createClient()
        : await (await import('@/lib/supabase/server')).createClient()

      let reportRows: Record<string, unknown>[]
      let shifts: Record<string, unknown>[]
      let registrations: Record<string, unknown>[]
      let images: ReportImage[] | null = null
      let brands: Record<string, unknown>[]
      let platforms: Record<string, unknown>[]
      let campaigns: Record<string, unknown>[]
      let users: Record<string, unknown>[]
      if (actor.systemPermission === 'leader') {
        const rpc = await client.rpc('rc19_export_report_bundle', { p_report_ids: input.report_ids, p_kind: input.kind })
        const bundle = rpc.data as Record<string, unknown> | null
        if (rpc.error || !bundle || !Array.isArray(bundle.reports) || !Array.isArray(bundle.shifts)
          || !Array.isArray(bundle.registrations) || !Array.isArray(bundle.images) || !Array.isArray(bundle.brands)
          || !Array.isArray(bundle.platforms) || !Array.isArray(bundle.campaigns) || !Array.isArray(bundle.users)) {
          return fail('REPORT_EXPORT_SCOPE_DENIED', 403)
        }
        reportRows = bundle.reports as Record<string, unknown>[]
        shifts = bundle.shifts as Record<string, unknown>[]
        registrations = bundle.registrations as Record<string, unknown>[]
        images = bundle.images as ReportImage[]
        brands = bundle.brands as Record<string, unknown>[]
        platforms = bundle.platforms as Record<string, unknown>[]
        campaigns = bundle.campaigns as Record<string, unknown>[]
        users = bundle.users as Record<string, unknown>[]
      } else {
        const adminRows = await readByIds(input.report_ids, async (ids, from, to) => {
        const result = await client.from('reports').select('*', { count: 'exact' }).in('id', ids).is('deleted_at', null)
          .order('id', { ascending: true }).range(from, to)
        return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_READ_INCOMPLETE')
        reportRows = adminRows
        const reports = reportRows.map(row => reportFromRow(row as never))
        const shiftIds = [...new Set(reports.map(report => report.shift_id))]
        shifts = await readByIds(shiftIds, async (ids, from, to) => {
          const result = await client.from('shifts').select('*', { count: 'exact' }).in('id', ids).order('id', { ascending: true }).range(from, to)
          return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE')
        registrations = await readByIds(shiftIds, async (ids, from, to) => {
          const result = await client.from('shift_registrations').select('*', { count: 'exact' }).in('shift_id', ids).order('id', { ascending: true }).range(from, to)
          return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE')
        const refs = [...new Set([...reports.map(report => report.submitted_by ?? ''), ...shifts.flatMap(s => [String(s.host_id ?? ''), String(s.support_id ?? ''), String(s.technical_id ?? '')]), ...registrations.map(r => String(r.user_id ?? ''))].filter(Boolean))]
        const readNamed = async (table: 'brands' | 'platforms' | 'campaigns' | 'business_users', column: 'name' | 'full_name', ids: string[]) => readByIds(ids, async (chunk, from, to) => {
          const result = await client.from(table).select(`id,${column}`, { count: 'exact' }).in('id', chunk).order('id', { ascending: true }).range(from, to)
          return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE')
        ;[brands, platforms, campaigns, users] = await Promise.all([
          readNamed('brands', 'name', shifts.map(s => String(s.brand_id ?? ''))),
          readNamed('platforms', 'name', shifts.map(s => String(s.platform_id ?? ''))),
          readNamed('campaigns', 'name', shifts.map(s => String(s.campaign_id ?? ''))),
          readNamed('business_users', 'full_name', refs),
        ])
        if (input.kind === 'images') images = await readByIds(input.report_ids, async (ids, from, to) => {
          const result = await client.from('report_images').select('id,report_id,image_url,storage_path,original_name,mime_type,size_bytes,image_type,created_at', { count: 'exact' }).in('report_id', ids).is('deleted_at', null).order('id', { ascending: true }).range(from, to)
          return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE') as unknown as ReportImage[]
      }
      const requestedIds = new Set(input.report_ids)
      if (reportRows.length !== requestedIds.size
        || new Set(reportRows.map(row => String(row.id))).size !== requestedIds.size
        || reportRows.some(row => !requestedIds.has(String(row.id)))) {
        return fail('REPORT_EXPORT_SCOPE_DENIED', 404)
      }
      const reports = reportRows.map(row => reportFromRow(row as never))
      const shiftIds = [...new Set(reports.map(report => report.shift_id))]
      if (shifts.length !== shiftIds.length) throw new ReportExportError('REPORT_EXPORT_CONTEXT_INCOMPLETE')
      if (actor.systemPermission === 'leader') {
        const latest = await requirePermission(request, 'reports.export', dependencies.resolveUser, dependencies.createPermissionClient)
        const latestScope = await (await (dependencies.createPermissionClient ?? (async () => client))()).rpc('rc19_current_leader_brand_ids', { p_scope_key: 'reports.export' })
        const latestIds = new Set(Array.isArray(latestScope.data) ? latestScope.data : [])
        if (latest.id !== actor.id || latest.businessUserId !== actor.businessUserId || latest.systemPermission !== 'leader'
          || latestScope.error || shifts.some(shift => !latestIds.has(shift.brand_id))) return fail('REPORT_EXPORT_SCOPE_CHANGED', 409)
      }
      const context = {
        shifts: shifts as unknown as Shift[], campaigns: campaigns as unknown as ReportExportContext['campaigns'],
        users: users as unknown as User[], registrations: registrations as unknown as ShiftRegistration[],
        brands: new Map(brands.map(row => [String(row.id), String(row.name ?? row.id)])),
        platforms: new Map(platforms.map(row => [String(row.id), String(row.name ?? row.id)])),
      }
      let rows: Record<string, unknown>[]
      let sheetName: string
      let fileName: string
      if (input.kind === 'images') {
        rows = buildReportImageMetadataRows(images ?? [], reports)
        sheetName = 'Images'
        fileName = `report_images_${new Date().toISOString().slice(0, 10)}.xlsx`
      } else {
        rows = buildReportExportRows(reports, context)
        sheetName = input.kind === 'report' ? 'Report' : 'Reports'
        fileName = input.kind === 'report'
          ? `report_${reports[0].id.replace(/[^a-zA-Z0-9._-]/gu, '_')}.xlsx`
          : `reports_filtered_${new Date().toISOString().slice(0, 10)}.xlsx`
      }

      const bytes = buildWorkbookBytes([{
        name: sheetName, rows,
        ...(input.kind === 'images' ? {} : { currencyColumns: REPORT_CURRENCY_COLUMNS }),
      }])
      const latestActor = await requirePermission(request, 'reports.export', dependencies.resolveUser, dependencies.createPermissionClient)
      if (latestActor.systemPermission !== actor.systemPermission || latestActor.id !== actor.id
        || latestActor.businessUserId !== actor.businessUserId) return fail('REPORT_EXPORT_SCOPE_CHANGED', 409)
      if (actor.systemPermission === 'leader') {
        const latestScope = await (await (dependencies.createPermissionClient ?? (async () => client))()).rpc('rc19_current_leader_brand_ids', { p_scope_key: 'reports.export' })
        const latestIds = new Set(Array.isArray(latestScope.data) ? latestScope.data : [])
        if (latestScope.error || shifts.some(shift => !latestIds.has(shift.brand_id))) return fail('REPORT_EXPORT_SCOPE_CHANGED', 409)
      }
      return new Response(bytes as BodyInit, { headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Export-Record-Count': String(input.kind === 'images' ? rows.length : reports.length),
        'X-Content-Type-Options': 'nosniff',
      } })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return fail(error.code, error.status)
      if (error instanceof z.ZodError) return fail('REPORT_EXPORT_REQUEST_INVALID', 400)
      if (error instanceof ReportExportError) return fail(error.code, error.status)
      return fail('REPORT_EXPORT_FAILED', 503)
    }
  } }
}
