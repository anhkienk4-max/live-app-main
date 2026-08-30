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

type SupabaseErrorShape = { code?: string; message?: string; details?: string; hint?: string }

const auditColumns = [
  'id', 'created_at', 'actor_auth_user_id', 'actor_business_user_id', 'actor_name', 'actor_role',
  'module', 'action', 'entity_type', 'entity_id', 'entity_name', 'before_data', 'after_data',
  'changed_fields', 'reason', 'source', 'status', 'error_code', 'correlation_id',
  'related_records', 'metadata', 'entity_exists',
].join(',')

const safeString = (value: unknown, fallback: string) => typeof value === 'string' && value ? value : fallback
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
  return new Error(error.message?.trim() || `Supabase ${operation} failed.`)
}

export type SupabaseAuditRepository = {
  getVisibleFor(user: Pick<User, 'id' | 'role' | 'system_permission'>): Promise<AuditLog[]>
  getAuditLogs(input: {
    user: Pick<User, 'id' | 'role' | 'system_permission'>
    page: number
    pageSize: number
    filters?: Record<string, string>
    sort?: 'newest' | 'oldest'
  }): Promise<{ items: AuditLog[]; total: number; page: number; pageSize: number; totalPages: number; actors: Array<{ id: string; name: string }> }>
  getById(id: string): Promise<AuditLog | null>
  addAdministrativeReview(id: string, data: Pick<AuditLog, 'admin_note' | 'review_status' | 'handling_reason'>): Promise<AuditLog>
  exportAll(user: Pick<User, 'role' | 'system_permission'>): Promise<AuditLog[]>
}

export function createSupabaseAuditRepository(client: SupabaseClient): SupabaseAuditRepository {
  const loadReview = async (rows: AuditRow[]) => {
    if (!rows.length) return rows
    const ids = rows.map(row => row.id)
    const result = await client.from('audit_log_reviews').select('audit_id,admin_note,review_status,handling_reason').in('audit_id', ids)
    if (result.error) throw requestError('audit review read', result.error)
    const reviews = new Map((result.data ?? []).map(review => [review.audit_id as string, review as AuditReviewRow]))
    return rows.map(row => ({ ...row, audit_log_reviews: reviews.get(row.id) ?? null }))
  }

  const queryRows = async (input: {
    page?: number
    pageSize?: number
    filters?: Record<string, string>
    sort?: 'newest' | 'oldest'
  }) => {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = [10, 20, 50, 100].includes(input.pageSize ?? 10) ? input.pageSize ?? 10 : 10
    let query = client.from('audit_logs').select(auditColumns, { count: 'exact' })
      .order('created_at', { ascending: input.sort === 'oldest' })
    const filters = input.filters ?? {}
    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00.000Z`)
    if (filters.to) query = query.lt('created_at', `${filters.to}T23:59:59.999Z`)
    if (filters.actor && filters.actor !== 'all') query = query.eq('actor_business_user_id', filters.actor)
    if (filters.role && filters.role !== 'all') query = query.eq('actor_role', filters.role)
    if (filters.module && filters.module !== 'all') query = query.eq('module', filters.module)
    if (filters.action && filters.action !== 'all') query = query.eq('action', filters.action)
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status === 'failed' || filters.status === 'retryable' ? 'failed' : 'success')
    if (filters.source && filters.source !== 'all') query = query.eq('source', filters.source)
    if (filters.query?.trim()) query = query.ilike('entity_name', `%${filters.query.trim().replaceAll('%', '\\%')}%`)
    const result = await query.range((page - 1) * pageSize, page * pageSize - 1)
    if (result.error) throw requestError('audit read', result.error)
    const rows = await loadReview((result.data ?? []) as unknown as AuditRow[])
    return { rows, total: result.count ?? 0, page, pageSize }
  }

  return {
    async getVisibleFor() {
      const result = await queryRows({ page: 1, pageSize: 100 })
      return result.rows.map(auditFromRow)
    },
    async getAuditLogs({ page, pageSize, filters, sort }) {
      const result = await queryRows({ page, pageSize, filters, sort })
      const actorsResult = await client.from('audit_logs').select('actor_business_user_id,actor_name').not('actor_business_user_id', 'is', null)
      if (actorsResult.error) throw requestError('audit actors read', actorsResult.error)
      const actors = [...new Map((actorsResult.data ?? []).map(actor => [
        actor.actor_business_user_id as string,
        safeString(actor.actor_name, actor.actor_business_user_id as string),
      ])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
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
      const result = await queryRows({ page: 1, pageSize: 100 })
      return result.rows.map(auditFromRow)
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
