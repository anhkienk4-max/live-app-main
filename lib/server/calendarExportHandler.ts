import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole, isAuthorizationError, authorizationErrorResponse, type ServerUserResolver } from './authGuards'
import { readJsonBody, RequestBodyError } from './apiSecurity'
import { createOperationsCollectionHandler, listFiltersSchema } from './operationsCollectionHandler'
import { buildScheduleExportRows } from '@/lib/utils/scheduleExportUtils'
import { selectExportFields, type ExportRecord, type ExportSheet } from '@/lib/utils/calendarExport'
import { registrationFromRow } from '@/lib/services/supabaseShiftRegistrationService'
import { buildCalendarExport } from '@/lib/utils/calendarExportWorkbook'
import { isFeatureEnabled } from '@/lib/flags'
import { createSupabaseAdminClient } from './supabaseAdmin'
import type { Shift, ShiftRegistration } from '@/lib/types/database.types'

const inputSchema = z.object({
  scope: z.enum(['one', 'selected', 'filtered']), shiftIds: z.array(z.string().min(1).max(120)).max(50).optional(),
  filters: listFiltersSchema.default({}), fields: z.array(z.string().min(1).max(120)).max(100).optional(), format: z.enum(['xlsx', 'csv']),
  listScope: z.enum(['all', 'open', 'mine']).default('all'),
}).strict().refine(value => value.scope === 'filtered' ? !value.shiftIds?.length : !!value.shiftIds?.length && (value.scope !== 'one' || value.shiftIds.length === 1))
const fail = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: { 'Cache-Control': 'no-store' } })
type Depends = { resolveUser?: ServerUserResolver; createClient?: () => Promise<SupabaseClient>; actualClient?: () => SupabaseClient; actualEnabled?: () => boolean }

export function createCalendarExportHandler(deps: Depends = {}) {
  return { async POST(request: Request): Promise<Response> {
    try {
      const user = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
      const input = inputSchema.parse(await readJsonBody(request, 16 * 1024))
      const fields = selectExportFields(user.systemPermission, (deps.actualEnabled ?? (() => isFeatureEnabled('actual_staffing')))(), input.fields)
      if (input.format === 'csv' && fields.some(field => field.group !== 'schedule')) return fail('EXPORT_CSV_FLAT_FIELDS_REQUIRED', 400)
      const client = deps.createClient ? await deps.createClient() : await (await import('@/lib/supabase/server')).createClient()
      const collection = createOperationsCollectionHandler({ resolveUser: async () => user, createClient: async () => client })
      const filters = input.scope === 'filtered' ? input.filters : { shiftIds: input.shiftIds }
      const readPage = async (page: number) => {
        const url = new URL('/api/operations/collection', request.url)
        url.search = new URLSearchParams({ entity: input.scope !== 'filtered' || input.listScope === 'all' ? 'shifts' : input.listScope === 'open' ? 'open_shifts' : 'my_shifts', page: String(page), pageSize: '50', filters: JSON.stringify(filters) }).toString()
        const response = await collection.GET(new Request(url, { headers: request.headers, signal: request.signal }))
        if (!response.ok) throw new Error('EXPORT_READ_FAILED')
        return response.json() as Promise<{ items: Shift[]; total: number; page: number; ownerKey: string }>
      }
      const shifts: Shift[] = []
      let total: number | undefined
      const ids = new Set<string>()
      for (let page = 1; ; page++) {
        request.signal.throwIfAborted()
        const result = await readPage(page)
        total ??= result.total
        if (!Number.isSafeInteger(total) || total < 0 || result.total !== total || result.page !== page || result.ownerKey !== user.id + ':' + user.systemPermission) return fail('EXPORT_COLLECTION_CHANGED', 409)
        for (const shift of result.items) {
          if (ids.has(shift.id)) return fail('EXPORT_COLLECTION_CHANGED', 409)
          ids.add(shift.id); shifts.push(shift)
        }
        if (shifts.length >= total) break
        if (result.items.length !== 50) return fail('EXPORT_READ_INCOMPLETE', 409)
      }
      if (shifts.length !== total || input.scope !== 'filtered' && (ids.size !== new Set(input.shiftIds).size || input.shiftIds!.some(id => !ids.has(id)))) return fail('EXPORT_SCOPE_CHANGED', 409)
      const data: Record<ExportSheet, ExportRecord[]> = { schedule: [], registrations: [], actual: [], audit: [] }
      const registrations: ShiftRegistration[] = []
      const registrationIds = new Set<string>()
      const names = new Map<string, string>()
      const readNames = async (table: string, column: string, keys: string[]) => {
        const map = new Map<string, string>()
        const unique = [...new Set(keys.filter(Boolean))]
        for (let offset = 0; offset < unique.length; offset += 50) {
          const result = await client.from(table).select('id,' + column).in('id', unique.slice(offset, offset + 50))
          if (result.error) throw new Error('EXPORT_REFERENCE_READ_FAILED')
          for (const row of result.data ?? []) { const record = row as unknown as Record<string, string>; map.set(record.id, record[column]) }
        }
        return map
      }
      for (let offset = 0; offset < shifts.length; offset += 50) {
        const shiftIds = shifts.slice(offset, offset + 50).map(shift => shift.id)
        let registrationCount: number | undefined
        for (let page = 0; ; page++) {
          const result = await client.from('shift_registrations').select('*', { count: 'exact' }).in('shift_id', shiftIds).order('id').range(page * 200, (page + 1) * 200 - 1)
          registrationCount ??= result.count ?? undefined
          if (result.error || registrationCount === undefined || result.count !== registrationCount || result.data?.length !== Math.min(200, Math.max(0, registrationCount - page * 200))) throw new Error('EXPORT_REGISTRATION_READ_INCOMPLETE')
          for (const row of result.data ?? []) { if (registrationIds.has(row.id)) throw new Error('EXPORT_REGISTRATION_READ_INCOMPLETE'); registrationIds.add(row.id) }
          registrations.push(...(result.data ?? []).map(row => registrationFromRow(row)))
          if ((page + 1) * 200 >= registrationCount) break
        }
      }
      const staffIds = [...registrations.map(row => row.user_id), ...shifts.flatMap(row => [row.host_id ?? '', row.support_id ?? '', row.technical_id ?? ''])]
      const [brands, platforms, campaigns, users] = await Promise.all([
        readNames('brands', 'name', shifts.map(row => row.brand_id)), readNames('platforms', 'name', shifts.map(row => row.platform_id)),
        readNames('campaigns', 'name', shifts.map(row => row.campaign_id ?? '')), readNames('business_users', 'full_name', staffIds),
      ])
      users.forEach((name, id) => names.set(id, name))
      data.schedule = buildScheduleExportRows(shifts, brands, platforms, campaigns, users, registrations) as unknown as ExportRecord[]
      data.registrations = registrations.map(row => ({ id: row.id, shift_id: row.shift_id, staff_name: names.get(row.user_id) ?? row.imported_name ?? '', operational_role: row.operational_role, status: row.status, source: row.source }))
      if (fields.some(field => field.group === 'actual' || field.group === 'audit')) {
        const actualClient = (deps.actualClient ?? createSupabaseAdminClient)()
        for (let offset = 0; offset < shifts.length; offset += 50) {
          const batchIds = shifts.slice(offset, offset + 50).map(shift => shift.id)
          for (const group of ['actual', 'audit'] as const) {
            if (!fields.some(field => field.group === group)) continue
            let expectedCount: number | undefined
            for (let page = 0; ; page++) {
              const result = await actualClient.from(group === 'actual' ? 'workforce_actual_segments' : 'workforce_actual_audit').select('*', { count: 'exact' }).in('shift_id', batchIds).order('id').range(page * 200, (page + 1) * 200 - 1)
              expectedCount ??= result.count ?? undefined
              if (result.error || expectedCount === undefined || result.count !== expectedCount || result.data?.length !== Math.min(200, Math.max(0, expectedCount - page * 200))) throw new Error('EXPORT_EVIDENCE_READ_INCOMPLETE')
              for (const row of result.data ?? []) data[group].push(Object.fromEntries(Object.entries({ ...row, staff_name: names.get(row.staff_id) ?? row.staff_id ?? '' }).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value ?? ''])) as ExportRecord)
              if ((page + 1) * 200 >= expectedCount) break
            }
          }
        }
      }
      const finalPage = await readPage(1)
      const superseded = new Set(data.actual.filter(row => row.review_status === 'approved' && row.supersedes_segment_id).map(row => row.supersedes_segment_id))
      data.actual = data.actual.map(row => ({ ...row, is_active: row.review_status === 'approved' && !superseded.has(row.id) }))
      const latestUser = await requireRole(request, ['admin', 'leader'], deps.resolveUser)
      if (latestUser.id !== user.id || latestUser.systemPermission !== user.systemPermission || finalPage.total !== total) return fail('EXPORT_COLLECTION_CHANGED', 409)
      const body = buildCalendarExport(data, fields, input.format)
      return new Response(body, { headers: { 'Content-Type': input.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="calendar.${input.format}"`, 'Cache-Control': 'private, no-store', 'X-Export-Record-Count': String(total) } })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return fail(error.code, error.status)
      if (error instanceof z.ZodError) return fail('EXPORT_REQUEST_INVALID', 400)
      if (error instanceof Error && error.message === 'EXPORT_FIELD_DENIED') return fail(error.message, 403)
      return fail('EXPORT_FAILED', 503)
    }
  } }
}
