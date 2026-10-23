import type { Shift, ShiftRegistration } from '@/lib/types/database.types'
import { pageRange, type PageSize } from '@/lib/utils/pagination'

export type OperationsList = 'shifts' | 'open_shifts' | 'my_shifts' | 'brands' | 'platforms' | 'campaigns' | 'staff' | 'notifications' | 'reports' | 'report_queue' | 'registration_reviews' | 'import_batches' | 'schedule_changes' | 'swaps' | 'quality' | 'live_shifts' | 'analytics_reports' | 'live_updates' | 'archives' | 'account_requests'
export interface ListFilters {
  search?: string
  from?: string
  to?: string
  brandIds?: string[]
  platformIds?: string[]
  campaignIds?: string[]
  studios?: string[]
  roles?: string[]
  registrationStatuses?: string[]
  statuses?: string[]
  archived?: boolean
  systemPermissions?: string[]
  assignedUserIds?: string[]
  hostIds?: string[]
  supportIds?: string[]
  technicalIds?: string[]
  operationalRoles?: string[]
  staffingStates?: string[]
  registrationStates?: string[]
  hasImportedStaffing?: boolean
  reportStatuses?: string[]
  metricsStatuses?: string[]
  actorIds?: string[]
  actionIds?: string[]
  shiftIds?: string[]
  sources?: string[]
  severity?: string[]
  qualitySources?: string[]
  requesterIds?: string[]
  scope?: 'all' | 'mine' | 'forMe'
  types?: string[]
  descending?: boolean
}
export interface ListQuery { page: number; pageSize: PageSize; filters?: ListFilters; pendingPage?: number }
export interface HistoricalReportShiftContext {
  date: string
  start_time: string
  end_time: string
  brand_id: string
  platform_id: string
  campaign_id: string | null
}
export interface ListPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: PageSize
  ownerKey?: string
  /** Only populated for Reports, and only for individually authorized reports. */
  historicalShiftContexts?: Record<string, HistoricalReportShiftContext>
}
export interface ShiftListPage extends ListPage<Shift> {
  registrations: ShiftRegistration[]
  pendingTotal: number
  pendingPage: number
  pendingIds: string[]
  studios: string[]
}
export class OperationsListError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code) }
}
async function browserOwner():Promise<string|undefined> {
  if(typeof window==='undefined')return undefined
  const {currentUserService}=await import('@/lib/services/dataService')
  const user=await currentUserService.getCurrent()
  if(!user)throw new OperationsListError('AUTHENTICATION_REQUIRED',401)
  return user.id+':'+(user.system_permission??user.role)
}
export async function getCollectionPage<T>(entity: OperationsList, query: ListQuery, signal?: AbortSignal): Promise<ListPage<T>> {
  const params = new URLSearchParams({ entity, page: String(query.page), pageSize: String(query.pageSize), filters: JSON.stringify(query.filters ?? {}), pendingPage: String(query.pendingPage ?? 1) })
  const owner=await browserOwner()
  const response = await fetch('/api/operations/collection?' + params, { credentials: 'same-origin', cache: 'no-store', signal })
  const body = await response.json()
  if(owner!==await browserOwner())throw new OperationsListError('LIST_IDENTITY_CHANGED',409)
  if (!response.ok) throw new OperationsListError(body.error?.code ?? 'LIST_READ_FAILED', response.status)
  if (typeof window !== 'undefined' && body.ownerKey !== owner) throw new OperationsListError('LIST_IDENTITY_CHANGED', 409)
  if ((body.ownerKey !== undefined && typeof body.ownerKey !== 'string') || !Array.isArray(body.items) || body.items.length > query.pageSize || !Number.isSafeInteger(body.total) || body.total < body.items.length || body.pageSize !== query.pageSize || !Number.isSafeInteger(body.page) || body.page < 1) {
    throw new OperationsListError('LIST_RESPONSE_INVALID', 502)
  }
  if (entity === 'reports') {
    const contexts = body.historicalShiftContexts
    if (!contexts || typeof contexts !== 'object' || Array.isArray(contexts)) {
      throw new OperationsListError('REPORT_HISTORY_RESPONSE_INVALID', 502)
    }
    const reportIds = new Set(body.items.map((item:{id:string}) => item.id))
    for (const [reportId, context] of Object.entries(contexts)) {
      const ctx = context as Record<string, unknown> | null
      if (!reportIds.has(reportId) || !ctx || Array.isArray(ctx) ||
        Object.keys(ctx).sort().join(',') !== 'brand_id,campaign_id,date,end_time,platform_id,start_time' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(ctx.date)) ||
        !/^\d{2}:\d{2}/.test(String(ctx.start_time)) ||
        !/^\d{2}:\d{2}/.test(String(ctx.end_time)) ||
        typeof ctx.brand_id !== 'string' || typeof ctx.platform_id !== 'string' ||
        (ctx.campaign_id !== null && typeof ctx.campaign_id !== 'string')) {
        throw new OperationsListError('REPORT_HISTORY_RESPONSE_INVALID', 502)
      }
    }
  }
  return body
}
export async function getCompleteCollection<T extends { id: string }>(entity: OperationsList, filters: ListFilters = {}, signal?: AbortSignal): Promise<T[]> {
  const rows = new Map<string, T>()
  let total: number | undefined
  let ownerKey: string | undefined
  for (let page = 1; ; page++) {
    const result = await getCollectionPage<T>(entity, { page, pageSize: 50, filters }, signal)
    if (page === 1) ownerKey = result.ownerKey
    else if (result.ownerKey !== ownerKey) throw new OperationsListError('EXPORT_IDENTITY_CHANGED', 409)
    total ??= result.total
    if (result.total !== total || result.page !== page || result.items.some(item => rows.has(item.id))) throw new OperationsListError('EXPORT_COLLECTION_CHANGED', 409)
    for (const item of result.items) rows.set(item.id, item)
    if (page * 50 >= total) break
  }
  if (rows.size !== total) throw new OperationsListError('EXPORT_COLLECTION_CHANGED', 409)
  return [...rows.values()]
}
export function localListPage<T>(items: T[], query: ListQuery): ListPage<T> {
  const range = pageRange(items.length, query.page, query.pageSize)
  return { items: items.slice((range.page - 1) * query.pageSize, range.page * query.pageSize), total: items.length, page: range.page, pageSize: query.pageSize }
}
