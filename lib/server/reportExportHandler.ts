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
      if (actor.systemPermission !== 'admin') return fail('REPORT_EXPORT_SCOPE_UNAVAILABLE', 403)

      const input = inputSchema.parse(await readJsonBody(request, 1024 * 1024))
      if (input.kind === 'report' && input.report_ids.length !== 1) return fail('REPORT_EXPORT_REQUEST_INVALID', 400)
      const client = dependencies.createClient
        ? await dependencies.createClient()
        : await (await import('@/lib/supabase/server')).createClient()

      const reportRows = await readByIds(input.report_ids, async (ids, from, to) => {
        const result = await client.from('reports').select('*', { count: 'exact' }).in('id', ids).is('deleted_at', null)
          .order('id', { ascending: true }).range(from, to)
        return { data: result.data as unknown[] | null, count: result.count, error: result.error }
      }, 'REPORT_EXPORT_READ_INCOMPLETE')
      const requestedIds = new Set(input.report_ids)
      if (reportRows.length !== requestedIds.size
        || new Set(reportRows.map(row => String(row.id))).size !== requestedIds.size
        || reportRows.some(row => !requestedIds.has(String(row.id)))) {
        return fail('REPORT_EXPORT_SCOPE_DENIED', 404)
      }
      const reports = reportRows.map(row => reportFromRow(row as never))
      const shiftIds = [...new Set(reports.map(report => report.shift_id))]
      const shifts = await readByIds(shiftIds, async (ids, from, to) => {
        const result = await client.from('shifts').select('*', { count: 'exact' }).in('id', ids)
          .order('id', { ascending: true }).range(from, to)
        return { data: result.data as unknown[] | null, count: result.count, error: result.error }
      }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE')
      if (shifts.length !== shiftIds.length) throw new ReportExportError('REPORT_EXPORT_CONTEXT_INCOMPLETE')

      const registrations = await readByIds(shiftIds, async (ids, from, to) => {
        const result = await client.from('shift_registrations').select('*', { count: 'exact' }).in('shift_id', ids)
          .order('id', { ascending: true }).range(from, to)
        return { data: result.data as unknown[] | null, count: result.count, error: result.error }
      }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE')
      const allReferenceIds = (field: string) => [...new Set([
        ...reports.map(report => String((report as unknown as Record<string, unknown>)[field] ?? '')),
        ...shifts.flatMap(shift => [String(shift.host_id ?? ''), String(shift.support_id ?? ''), String(shift.technical_id ?? '')]),
        ...registrations.map(row => String(row.user_id ?? '')),
      ].filter(Boolean))]
      const userIds = [...new Set([
        ...allReferenceIds('submitted_by'), ...allReferenceIds('confirmed_by'),
        ...allReferenceIds('reviewed_by'), ...allReferenceIds('updated_by'),
      ])]
      const readNamed = async (table: 'brands' | 'platforms' | 'campaigns' | 'business_users', column: 'name' | 'full_name', ids: string[]) =>
        readByIds(ids, async (chunk, from, to) => {
          const result = await client.from(table).select(`id,${column}`, { count: 'exact' }).in('id', chunk)
            .order('id', { ascending: true }).range(from, to)
          return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE')

      const brandIds = [...new Set(shifts.map(row => String(row.brand_id ?? '')).filter(Boolean))]
      const platformIds = [...new Set(shifts.map(row => String(row.platform_id ?? '')).filter(Boolean))]
      const campaignIds = [...new Set(shifts.map(row => String(row.campaign_id ?? '')).filter(Boolean))]
      const [brands, platforms, campaigns, users] = await Promise.all([
        readNamed('brands', 'name', brandIds), readNamed('platforms', 'name', platformIds),
        readNamed('campaigns', 'name', campaignIds), readNamed('business_users', 'full_name', userIds),
      ])
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
        const images = await readByIds(input.report_ids, async (ids, from, to) => {
          const result = await client.from('report_images')
            .select('id,report_id,image_url,storage_path,original_name,mime_type,size_bytes,image_type,created_at', { count: 'exact' })
            .in('report_id', ids).is('deleted_at', null).order('id', { ascending: true }).range(from, to)
          return { data: result.data as unknown[] | null, count: result.count, error: result.error }
        }, 'REPORT_EXPORT_CONTEXT_INCOMPLETE') as unknown as ReportImage[]
        rows = buildReportImageMetadataRows(images, reports)
        sheetName = 'Images'
        fileName = `report_images_${new Date().toISOString().slice(0, 10)}.xlsx`
      } else {
        rows = buildReportExportRows(reports, context)
        sheetName = input.kind === 'report' ? 'Report' : 'Reports'
        fileName = input.kind === 'report'
          ? `report_${reports[0].id.replace(/[^a-zA-Z0-9._-]/gu, '_')}.xlsx`
          : `reports_filtered_${new Date().toISOString().slice(0, 10)}.xlsx`
      }

      const latestActor = await requirePermission(request, 'reports.export', dependencies.resolveUser, dependencies.createPermissionClient)
      if (latestActor.systemPermission !== 'admin' || latestActor.id !== actor.id
        || latestActor.businessUserId !== actor.businessUserId) return fail('REPORT_EXPORT_SCOPE_CHANGED', 409)
      const bytes = buildWorkbookBytes([{
        name: sheetName, rows,
        ...(input.kind === 'images' ? {} : { currencyColumns: REPORT_CURRENCY_COLUMNS }),
      }])
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
