import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import type { AuditAction, AuditLog, AuditModule, SystemPermission, User } from '@/lib/types/database.types'

type AuditRow = {
  id: string
  created_at: string
  actor_auth_user_id: string | null
  actor_business_user_id: string | null
  actor_name: string | null
  actor_role: string | null
  module: string
  action: string
  entity_type: string
  entity_id: string
  entity_name: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  changed_fields: string[] | null
  reason: string | null
  source: string
  status: string
  error_code: string | null
  correlation_id: string
  related_records: AuditLog['related_records'] | null
  metadata: Record<string, unknown> | null
  entity_exists: boolean
  audit_log_reviews?: AuditReviewRow | AuditReviewRow[] | null
}

type AuditReviewRow = {
  audit_id: string
  admin_note: string | null
  review_status: AuditLog['review_status']
  handling_reason: string | null
}

type AuditRepositoryFilters = Record<string, string | readonly string[] | undefined>

export type AuditHistoryCursor = { created_at: string; id: string; snapshot_at: string }
export type AuditHistoryPage = {
  items: AuditLog[]
  actors: Array<{ id: string; name: string }>
  nextCursor: AuditHistoryCursor | null
  hasMore: boolean
  pageSize: number
  range: { from: string; to: string }
}

type SupabaseErrorShape = { code?: string; message?: string; details?: string; hint?: string }

const auditColumns = [
  'id', 'created_at', 'actor_auth_user_id', 'actor_business_user_id', 'actor_name', 'actor_role',
  'module', 'action', 'entity_type', 'entity_id', 'entity_name', 'before_data', 'after_data',
  'changed_fields', 'reason', 'source', 'status', 'error_code', 'correlation_id',
  'related_records', 'metadata', 'entity_exists',
].join(',')

const actions = new Set<AuditAction>([
  'create', 'update', 'delete', 'soft_delete', 'restore', 'archive', 'unarchive', 'confirm', 'unconfirm',
  'approve', 'reject', 'assign', 'unassign', 'register', 'cancel_registration', 'lock', 'reopen', 'import',
  'export', 'ocr_run', 'ocr_rerun', 'ocr_reset', 'upload', 'remove_upload', 'account_registered',
  'email_verified', 'email_auto_verified_mock', 'account_approved', 'account_rejected', 'role_assigned',
  'login_success', 'login_failed',
])
const modules = new Set<AuditModule>(['calendar', 'live', 'reports', 'staff', 'brands', 'platforms', 'campaigns', 'swaps', 'imports', 'settings'])

function reviewFor(row: AuditRow): AuditReviewRow | null {
  const review = row.audit_log_reviews
  return Array.isArray(review) ? review[0] ?? null : review ?? null
}

function auditFromRow(row: AuditRow): AuditLog {
  const review = reviewFor(row)
  const actorRole = row.actor_role === 'admin' || row.actor_role === 'leader' || row.actor_role === 'member'
    ? row.actor_role as SystemPermission
    : 'member'
  const action = actions.has(row.action as AuditAction) ? row.action as AuditAction : 'update'
  const auditModule = modules.has(row.module as AuditModule) ? row.module as AuditModule : 'settings'
  return {
    id: row.id,
    timestamp: row.created_at,
    actor_id: row.actor_business_user_id || row.actor_auth_user_id || 'system',
    actor_name: row.actor_name || 'System',
    actor_role: actorRole,
    module: auditModule,
    action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    entity_name: row.entity_name,
    before: row.before_data ?? undefined,
    after: row.after_data ?? undefined,
    reason: row.reason ?? undefined,
    source: row.source === 'excel_import' || row.source === 'google_sheets' || row.source === 'system' || row.source === 'ocr' || row.source === 'upload' ? row.source : 'manual',
    status: row.status === 'failed' ? 'failed' : 'success',
    error_code: row.error_code ?? undefined,
    correlation_id: row.correlation_id,
    related_records: row.related_records ?? undefined,
    entity_exists: row.entity_exists,
    ...(review ? {
      admin_note: review.admin_note ?? undefined,
      review_status: review.review_status ?? 'unreviewed',
      handling_reason: review.handling_reason ?? undefined,
    } : {}),
  }
}

function requestError(operation: string, error: SupabaseErrorShape): Error {
  return Object.assign(new Error(error.message?.trim() || `Supabase ${operation} failed.`), { code: error.code })
}

export type SupabaseAuditRepository = {
  getVisibleFor(user: Pick<User, 'id' | 'role' | 'system_permission'>): Promise<AuditLog[]>
  getAuditLogs(input: {
    user: Pick<User, 'id' | 'role' | 'system_permission'>
    page: number
    pageSize: number
    filters?: AuditRepositoryFilters
    sort?: 'newest' | 'oldest'
  }): Promise<{ items: AuditLog[]; total: number; page: number; pageSize: number; totalPages: number; actors: Array<{ id: string; name: string }> }>
  getAuditHistoryPage(input: {
    cursor?: AuditHistoryCursor | null
    pageSize?: number
    filters?: AuditRepositoryFilters
    sort?: 'newest' | 'oldest'
    signal?: AbortSignal
  }): Promise<AuditHistoryPage>
  getById(id: string): Promise<AuditLog | null>
  addAdministrativeReview(id: string, data: Pick<AuditLog, 'admin_note' | 'review_status' | 'handling_reason'>): Promise<AuditLog>
  exportAll(user: Pick<User, 'role' | 'system_permission'>): Promise<AuditLog[]>
}

export function createSupabaseAuditRepository(client: SupabaseClient): SupabaseAuditRepository {
  const loadReview = async (rows: AuditRow[], signal?: AbortSignal) => {
    if (!rows.length) return rows
    const ids = rows.map(row => row.id)
    let request = client.from('audit_log_reviews').select('audit_id,admin_note,review_status,handling_reason').in('audit_id', ids)
    if (signal) request = request.abortSignal(signal)
    const result = await request
    if (result.error) throw requestError('audit review read', result.error)
    const reviews = new Map((result.data ?? []).map(review => [review.audit_id as string, review as AuditReviewRow]))
    return rows.map(row => ({ ...row, audit_log_reviews: reviews.get(row.id) ?? null }))
  }

  const queryRows = async (input: {
    page?: number
    pageSize?: number
    filters?: AuditRepositoryFilters
    sort?: 'newest' | 'oldest'
  }) => {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = [10, 20, 50].includes(input.pageSize ?? 20) ? input.pageSize ?? 20 : 20
    let query = client.from('audit_logs').select(auditColumns, { count: 'exact' })
      .order('created_at', { ascending: input.sort === 'oldest' }).order('id')
    const filters = input.filters ?? {}
    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00.000Z`)
    if (filters.to) query = query.lt('created_at', `${filters.to}T23:59:59.999Z`)
    const selected = (value: string | readonly string[] | undefined) => Array.isArray(value) ? value.filter(item => item !== 'all') : value && value !== 'all' ? [value] : []
    if(typeof filters.entity_type==='string')query=query.eq('entity_type',filters.entity_type)
    if(typeof filters.entity_id==='string')query=query.eq('entity_id',filters.entity_id)
    const actor = selected(filters.actor)
    const role = selected(filters.role)
    const moduleFilters = selected(filters.module)
    const action = selected(filters.action)
    const status = selected(filters.status).map(value => value === 'failed' || value === 'retryable' ? 'failed' : 'success')
    const source = selected(filters.source)
    if (actor.length) query = query.in('actor_business_user_id', actor)
    if (role.length) query = query.in('actor_role', role)
    if (moduleFilters.length) query = query.in('module', moduleFilters)
    if (action.length) query = query.in('action', action)
    if (status.length) query = query.in('status', [...new Set(status)])
    if (source.length) query = query.in('source', source)
    const queryText = typeof filters.query === 'string' ? filters.query.trim() : ''
    if (queryText) query = query.ilike('entity_name', '%' + queryText.replaceAll('%', '\\%') + '%')
    const result = await query.range((page - 1) * pageSize, page * pageSize - 1)
    if (result.error) throw requestError('audit read', result.error)
    const rows = await loadReview((result.data ?? []) as unknown as AuditRow[])
    return { rows, total: result.count ?? 0, page, pageSize }
  }

  return {
    async getVisibleFor() {
      const rows: AuditLog[] = []
      const seen = new Set<string>()
      let total: number | undefined
      for (let page=1; ; page++) {
        const result=await queryRows({page,pageSize:50})
        total ??= result.total
        if(result.total!==total || result.rows.some(row=>seen.has(row.id))) throw new Error('EXPORT_COLLECTION_CHANGED')
        for(const row of result.rows) { seen.add(row.id); rows.push(auditFromRow(row)) }
        if(page*50>=total)break
      }
      if(rows.length!==total)throw new Error('EXPORT_COLLECTION_CHANGED')
      return rows
    },
    async getAuditLogs({ page, pageSize, filters, sort }) {
      const result = await queryRows({ page, pageSize, filters, sort })
      const actors: Array<{ id: string; name: string }> = []
      for (let page = 1; ; page++) {
        const result = await client.rpc('get_audit_actor_page', { p_page: page, p_page_size: 50 })
        if (result.error || !result.data || result.data.total > 1000) throw new Error('AUDIT_ACTOR_DIRECTORY_INCOMPLETE')
        actors.push(...result.data.items)
        if (page * 50 >= result.data.total) break
      }
      const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
      const safePage = Math.min(result.page, totalPages)
      return {
        items: result.rows.map(auditFromRow),
        total: result.total,
        page: safePage,
        pageSize: result.pageSize,
        totalPages,
        actors,
      }
    },
    async getAuditHistoryPage({ cursor, pageSize = 20, filters = {}, sort = 'newest', signal }) {
      const safePageSize = [10, 20, 50].includes(pageSize) ? pageSize : 20
      const scalarKeys = ['from', 'to', 'entity_type', 'entity_id', 'query'] as const
      const arrayKeys = ['actor', 'brand_id', 'role', 'module', 'action', 'status', 'source'] as const
      const normalizedFilters: Record<string, string | string[]> = {}
      for (const key of scalarKeys) {
        const raw = filters[key]
        const text = typeof raw === 'string' ? raw.trim() : ''
        if (text && text !== 'all') normalizedFilters[key] = text
      }
      for (const key of arrayKeys) {
        const raw = filters[key]
        const items = (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [])
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.trim())
          .filter(item => item.length > 0 && item !== 'all')
          .map(item => key === 'status' ? (['failed', 'retryable'].includes(item) ? 'failed' : 'success') : item)
        const deduped = [...new Set(items)]
        if (deduped.length) normalizedFilters[key] = deduped
      }
      let request = client.rpc('get_audit_history_page', {
        p_filters: normalizedFilters,
        p_cursor_created_at: cursor?.created_at ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_snapshot_at: cursor?.snapshot_at ?? null,
        p_page_size: safePageSize,
        p_sort: sort,
      })
      if (signal) request = request.abortSignal(signal)
      const result = await request
      if (result.error) {
        if (result.error.code === 'PGRST202' || result.error.code === '42883') {
          throw Object.assign(new Error('AUDIT_HISTORY_ENDPOINT_UNAVAILABLE'), { code: result.error.code })
        }
        throw requestError('audit history page read', result.error)
      }
      const data = result.data as {
        items?: unknown
        has_more?: unknown
        next_cursor?: unknown
        page_size?: unknown
        range?: unknown
      } | null
      if (!data || !Array.isArray(data.items) || typeof data.has_more !== 'boolean'
        || data.page_size !== safePageSize || !data.range || typeof data.range !== 'object') {
        throw new Error('AUDIT_HISTORY_RESPONSE_INVALID')
      }
      const next = data.next_cursor as Partial<AuditHistoryCursor> | null
      if (data.has_more && (!next || typeof next.created_at !== 'string' || typeof next.id !== 'string' || typeof next.snapshot_at !== 'string')) {
        throw new Error('AUDIT_HISTORY_CURSOR_INVALID')
      }
      const rows = await loadReview(data.items as AuditRow[], signal)
      const items = rows.map(auditFromRow)
      const actors = [...new Map(items.filter(item => item.actor_id !== 'system').map(item => [item.actor_id, item.actor_name]))]
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      const range = data.range as { from?: unknown; to?: unknown }
      if (typeof range.from !== 'string' || typeof range.to !== 'string') throw new Error('AUDIT_HISTORY_RESPONSE_INVALID')
      return {
        items,
        actors,
        nextCursor: data.has_more ? next as AuditHistoryCursor : null,
        hasMore: data.has_more,
        pageSize: safePageSize,
        range: { from: range.from, to: range.to },
      }
    },
    async getById(id) {
      const result = await client.from('audit_logs').select(auditColumns).eq('id', id).maybeSingle()
      if (result.error) throw requestError('audit read', result.error)
      if (!result.data) return null
      const rows = await loadReview([result.data as unknown as AuditRow])
      return auditFromRow(rows[0])
    },
    async addAdministrativeReview(id, data) {
      const result = await client.rpc('update_audit_review', {
        p_audit_id: id,
        p_admin_note: data.admin_note ?? null,
        p_review_status: data.review_status ?? 'unreviewed',
        p_handling_reason: data.handling_reason ?? null,
      })
      if (result.error) throw requestError('audit review update', result.error)
      const updated = await this.getById(id)
      if (!updated) throw new Error('Audit event was not found.')
      return updated
    },
    async exportAll() {
      const rows: AuditLog[] = []
      const seen = new Set<string>()
      let total: number | undefined
      for (let page=1; ; page++) {
        const result=await queryRows({page,pageSize:50})
        total ??= result.total
        if(result.total!==total || result.rows.some(row=>seen.has(row.id))) throw new Error('EXPORT_COLLECTION_CHANGED')
        for(const row of result.rows) { seen.add(row.id); rows.push(auditFromRow(row)) }
        if(page*50>=total)break
      }
      if(rows.length!==total)throw new Error('EXPORT_COLLECTION_CHANGED')
      return rows
    },
  }
}

let browserRepository: SupabaseAuditRepository | null = null
let testRepository: SupabaseAuditRepository | undefined

export function getSupabaseAuditRepository(): SupabaseAuditRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseAuditRepository(createClient())
  return browserRepository
}

export function setSupabaseAuditRepositoryForTests(repository: SupabaseAuditRepository | undefined): void {
  testRepository = repository
}
