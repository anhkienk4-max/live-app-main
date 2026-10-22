import { z } from 'zod'
import { operationsResponseOwnerKey } from '@/lib/server/operationsResponseOwnerKey'
import { dashboardUpdateFromRow } from '@/lib/services/supabaseDashboardUpdateService'
import { readDataQualityPage } from '@/lib/server/dataQualityPage'
import { pageRange } from '@/lib/utils/pagination'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser, isAuthorizationError, authorizationErrorResponse, type ServerUserResolver } from '@/lib/server/authGuards'
import { readScheduleImportBatchPage } from '@/lib/services/supabaseScheduleImportService'
import { swapFromRow } from '@/lib/services/supabaseSwapRequestService'
import { reportFromRow } from '@/lib/services/supabaseReportService'
import { createSupabaseNotificationRepository } from '@/lib/services/supabaseNotificationService'
import { createSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'
import { shiftFromRow } from '@/lib/services/supabaseShiftService'
import { registrationFromRow } from '@/lib/services/supabaseShiftRegistrationService'
import { withShiftStaffingSummary } from '@/lib/services/supabaseStaffingReadService'
import type { ListQuery } from '@/lib/services/operationsPageService'

const shiftFilterKeys = ['search','from','to','brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','descending','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','hasImportedStaffing','shiftIds']
const filterKeys: Record<string,string[]> = {
  shifts:shiftFilterKeys,live_shifts:shiftFilterKeys,open_shifts:shiftFilterKeys,my_shifts:shiftFilterKeys,
  staff:['search','statuses','roles','systemPermissions','archived'],brands:['search','statuses'],platforms:['search','statuses'],campaigns:['search','statuses','brandIds'],
  notifications:['search','statuses','types'],reports:[...shiftFilterKeys,'reportStatuses','metricsStatuses'],report_queue:['search','from','to','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses'],analytics_reports:[...shiftFilterKeys,'reportStatuses','metricsStatuses'],registration_reviews:['search','statuses','roles'],
  archives:[],account_requests:['statuses'],live_updates:['shiftIds'],import_batches:[],schedule_changes:['from','to','actorIds','actionIds','shiftIds','brandIds','sources'],
  swaps:['search','from','to','brandIds','platformIds','campaignIds','scope','requesterIds','roles','statuses'],quality:['severity','qualitySources'],
}
const choices = z.array(z.string().min(1).max(128)).max(50).optional()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value).optional()
export const listFiltersSchema = z.object({
  search: z.string().max(256).optional(), from: day, to: day,
  brandIds: choices, platformIds: choices, campaignIds: choices, studios: choices,
  roles: z.array(z.enum(['host', 'support', 'technical'])).max(3).optional(),
  registrationStatuses: z.array(z.enum(['pending', 'approved', 'manually_assigned'])).max(3).optional(),
  archived: z.boolean().optional(), systemPermissions: z.array(z.enum(['admin', 'leader', 'member'])).max(3).optional(), assignedUserIds: choices,
  hostIds: choices, supportIds: choices, technicalIds: choices, operationalRoles: z.array(z.enum(['host','support','technical'])).max(3).optional(), staffingStates: z.array(z.enum(['fully_staffed','missing_staff'])).max(2).optional(), registrationStates: z.array(z.enum(['pending','approved','manually_assigned','rejected','cancelled','removed'])).max(6).optional(), hasImportedStaffing: z.boolean().optional(),
  severity: z.array(z.enum(['error','warning','info'])).max(3).optional(), qualitySources: z.array(z.enum(['schedule_import','report','staffing'])).max(3).optional(),
  scope: z.enum(['all', 'mine', 'forMe']).optional(), requesterIds: choices,
  actorIds: choices, actionIds: choices, shiftIds: choices, sources: choices,
  reportStatuses: choices, metricsStatuses: z.array(z.enum(['confirmed', 'unconfirmed'])).max(2).optional(),
  types: choices, statuses: choices, descending: z.boolean().optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to)
const schema = z.object({
  entity: z.enum(['shifts', 'open_shifts', 'my_shifts', 'brands', 'platforms', 'campaigns', 'staff', 'notifications', 'reports', 'report_queue', 'registration_reviews', 'import_batches', 'schedule_changes', 'swaps', 'quality', 'live_shifts', 'analytics_reports', 'live_updates', 'archives', 'account_requests']),
  page: z.coerce.number().int().min(1).max(100000),
  pageSize: z.coerce.number().refine(value => [10, 20, 50].includes(value)),
  pendingPage: z.coerce.number().int().min(1).max(100000),
  filters: listFiltersSchema,
})
export function createOperationsCollectionHandler(dependencies: { resolveUser?: ServerUserResolver; createClient?: () => Promise<SupabaseClient> } = {}) {
  return { GET: async (request: Request) => {
    try {
      const user = await requireUser(request, dependencies.resolveUser)
      const ownerKey=operationsResponseOwnerKey(user)
      const reply=(data:object)=>Response.json({...data,ownerKey},{headers:{'Cache-Control':'private, no-store'}})
      const params = new URL(request.url).searchParams
      const raw = params.get('filters') ?? '{}'
      if (raw.length > 16384) return Response.json({ error: { code: 'LIST_FILTER_INVALID' } }, { status: 400 })
      let filters: unknown
      try { filters = JSON.parse(raw) } catch { return Response.json({ error: { code: 'LIST_FILTER_INVALID' } }, { status: 400 }) }
      const parsed = schema.safeParse({ entity: params.get('entity'), page: params.get('page') ?? 1, pageSize: params.get('pageSize') ?? 20, pendingPage: params.get('pendingPage') ?? 1, filters })
      if (!parsed.success) return Response.json({ error: { code: 'LIST_QUERY_INVALID' } }, { status: 400 })
      const { entity, ...value } = parsed.data
      if (Object.keys(value.filters).some(key=>!filterKeys[entity].includes(key)))
        return Response.json({error:{code:'LIST_FILTER_INVALID'}},{status:400})
      if (entity==='notifications' && value.filters.statuses?.some(status=>status!=='read'&&status!=='unread'))
        return Response.json({error:{code:'LIST_FILTER_INVALID'}},{status:400})
      if (entity === 'staff' && (user.systemPermission === 'member' || value.filters.archived && user.systemPermission !== 'admin')) return Response.json({ error: { code: 'PERMISSION_DENIED' } }, { status: 403 })
      if (entity === 'registration_reviews' && user.systemPermission === 'member') return Response.json({ error: { code: 'PERMISSION_DENIED' } }, { status: 403 })
      if ((entity === 'import_batches' || entity === 'schedule_changes') && user.systemPermission === 'member')
        return Response.json({ error: { code: 'PERMISSION_DENIED' } }, { status: 403 })
      if(entity==='live_updates'&&value.filters.shiftIds?.length!==1)
        return Response.json({error:{code:'LIST_FILTER_INVALID'}},{status:400})
      if((entity==='archives'||entity==='account_requests')&&user.systemPermission!=='admin')
        return Response.json({error:{code:'PERMISSION_DENIED'}},{status:403})
      if(entity==='account_requests'&&value.filters.statuses?.some(status=>!['pending','approved','rejected','cancelled'].includes(status)))
        return Response.json({error:{code:'LIST_FILTER_INVALID'}},{status:400})
      const client = dependencies.createClient ? await dependencies.createClient() : await (await import('@/lib/supabase/server')).createClient()
      const query = value as ListQuery
      if (entity === 'shifts' || entity === 'live_shifts' || entity === 'open_shifts' || entity === 'my_shifts') {
        const result = await client.rpc('get_shift_list_page', { p_scope: entity === 'shifts' || entity === 'live_shifts' ? 'all' : entity === 'open_shifts' ? 'open' : 'mine', p_page: query.page, p_page_size: query.pageSize, p_filters: query.filters, p_pending_page: query.pendingPage, p_include_live: entity === 'live_shifts' })
        if (result.error) throw result.error
        const { rows, registrations, ...metadata } = result.data
        const items = await withShiftStaffingSummary(client, rows.map((row: Parameters<typeof shiftFromRow>[0]) => ({ ...shiftFromRow(row, 'database'), registration_conflict: row.registration_conflict === true })))
        return reply({ ...metadata, items, registrations: registrations.map(registrationFromRow), ...(entity==='live_shifts'?{updates:(metadata.updates??[]).map(dashboardUpdateFromRow)}:{}) })
      }
      if(entity==='archives'){
        const result=await client.rpc('get_archived_entity_page',{p_page:query.page,p_page_size:query.pageSize})
        if(result.error)throw result.error
        return reply(result.data)
      }
      if(entity==='account_requests'){
        const build=(head=false)=>{
          let request=client.from('account_requests').select('id,version,email,full_name,phone,department,status,provisioning_status,staff_id,auth_user_id,submitted_at,reviewed_at,reviewed_by,rejection_reason,provisioning_error_code,created_at,updated_at',{count:'exact',head})
          if(query.filters?.statuses?.length)request=request.in('status',query.filters.statuses)
          return request.order('submitted_at',{ascending:false}).order('id')
        }
        const count=await build(true)
        if(count.error)throw count.error
        if(count.count===null)throw new Error('LIST_COUNT_UNAVAILABLE')
        const range=pageRange(count.count,query.page,query.pageSize)
        const result=await build().range((range.page-1)*query.pageSize,range.page*query.pageSize-1)
        if(result.error)throw result.error
        if(result.count!==count.count||result.data?.length!==Math.min(query.pageSize,Math.max(0,count.count-(range.page-1)*query.pageSize)))throw new Error('LIST_READ_INCOMPLETE')
        return reply({items:result.data,total:count.count,page:range.page,pageSize:query.pageSize})
      }
      if(entity==='live_updates'){
        const result=await client.rpc('get_live_update_page',{p_shift_id:value.filters.shiftIds![0],p_page:query.page,p_page_size:query.pageSize})
        if(result.error)throw result.error
        const {rows,recent,...metadata}=result.data
        return reply({...metadata,items:rows.map(dashboardUpdateFromRow),recent:recent.map(dashboardUpdateFromRow)})
      }
      if (entity === 'quality') return reply(await readDataQualityPage(client,query))
      if (entity === 'import_batches') return reply(await readScheduleImportBatchPage(client, query))
      if (entity === 'schedule_changes') {
        const result = await client.rpc('get_schedule_change_page', { p_page: query.page, p_page_size: query.pageSize, p_filters: query.filters })
        if (result.error) throw result.error
        return reply(result.data)
      }
      if (entity === 'swaps') {
        const result = await client.rpc('get_swap_list_page', { p_page: query.page, p_page_size: query.pageSize, p_filters: query.filters })
        if (result.error) throw result.error
        const { rows, ...metadata } = result.data
        return reply({ ...metadata, items: rows.map(swapFromRow) })
      }
      if (entity === 'reports' || entity === 'analytics_reports') {
        const result = await client.rpc('get_report_list_page', { p_page: query.page, p_page_size: query.pageSize, p_filters: query.filters, p_summary:entity==='analytics_reports' })
        if (result.error) throw result.error
        const { rows, ...metadata } = result.data
        if (entity === 'reports') return reply({ ...metadata, items: rows.map(reportFromRow) })
        const ids = [...new Set((rows as Array<{ shift_id: string }>).map(row => row.shift_id))]
        const shifts = ids.length ? await client.from('shifts').select('*').in('id', ids) : { data: [], error: null }
        if (shifts.error) throw shifts.error
        return reply({ ...metadata, items: rows.map(reportFromRow), shifts: (shifts.data ?? []).map(row => shiftFromRow(row, 'database')) })
      }
      if (entity === 'report_queue') {
        const result = await client.rpc('get_report_obligation_page', { p_page: query.page, p_page_size: query.pageSize, p_filters: query.filters })
        if (result.error) throw result.error
        const { rows, ...metadata } = result.data
        const entries = rows as Array<{ shift: Parameters<typeof shiftFromRow>[0]; report: Parameters<typeof reportFromRow>[0] | null }>
        const shifts = await withShiftStaffingSummary(client, entries.map(entry => shiftFromRow(entry.shift, 'database')))
        const shiftById = new Map(shifts.map(shift => [shift.id, shift]))
        return reply({ ...metadata, items: entries.map(entry => ({ shift: shiftById.get(entry.shift.id)!, report: entry.report ? reportFromRow(entry.report) : null })) })
      }
      if (entity === 'registration_reviews') {
        const result = await client.rpc('get_registration_review_page', { p_page: query.page, p_page_size: query.pageSize, p_filters: query.filters })
        if (result.error) throw result.error
        const { rows, ...metadata } = result.data
        const shiftIds = [...new Set((rows as Array<{ shift_id: string }>).map(row => row.shift_id))]
        const userIds = [...new Set((rows as Array<{ user_id: string }>).map(row => row.user_id))]
        const [shiftRows, users] = await Promise.all([
          shiftIds.length ? client.from('shifts').select('*').in('id', shiftIds) : Promise.resolve({ data: [], error: null }),
          userIds.length ? client.from('business_users').select('*').in('id', userIds) : Promise.resolve({ data: [], error: null }),
        ])
        if (shiftRows.error) throw shiftRows.error
        if (users.error) throw users.error
        const shifts = await withShiftStaffingSummary(client, (shiftRows.data ?? []).map(row => shiftFromRow(row, 'database')))
        const brandIds = [...new Set(shifts.map(shift => shift.brand_id))]
        const platformIds = [...new Set(shifts.map(shift => shift.platform_id))]
        const [brands, platforms] = await Promise.all([
          brandIds.length ? client.from('brands').select('*').in('id', brandIds) : Promise.resolve({ data: [], error: null }),
          platformIds.length ? client.from('platforms').select('*').in('id', platformIds) : Promise.resolve({ data: [], error: null }),
        ])
        if (brands.error) throw brands.error
        if (platforms.error) throw platforms.error
        return reply({ ...metadata, items: rows.map(registrationFromRow), shifts, users: users.data ?? [], brands: brands.data ?? [], platforms: platforms.data ?? [] })
      }
      if (entity === 'notifications') return reply(await createSupabaseNotificationRepository(client).getPage(query))
      const repo = createSupabaseMasterDataRepository(client)
      const result = await (entity === 'staff' ? repo.businessUsers : repo[entity]).getPage(query)
      if (entity === 'staff') {
        const workload = await client.rpc('get_staff_workload', { p_staff_ids: result.items.map(item => item.id) })
        if (workload.error) throw workload.error
        return reply({ ...result, workload: workload.data })
      }
      return reply(result)
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
      if (code === '42501') {
        // Distinguish an actual database ACL failure from an application RBAC rejection.
        // Never log user identifiers, filter values, request cookies or SQL details.
        console.warn('OPS_COLLECTION_DATABASE_ACL_DENIED', { entity: new URL(request.url).searchParams.get('entity') })
      }
      return Response.json({ error: { code: code === '42501' ? 'PERMISSION_DENIED' : 'LIST_READ_FAILED' } }, { status: code === '42501' ? 403 : code.startsWith('22') ? 400 : 500, headers: { 'Cache-Control': 'no-store' } })
    }
  } }
}
