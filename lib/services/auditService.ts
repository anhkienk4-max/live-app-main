import { AuditAction, AuditLog, AuditModule, AuditRelatedRecord, SystemPermission, User } from '@/lib/types/database.types'
import { resolveSystemPermission } from '@/lib/permissions'
import { classifyOperationStatus } from '@/lib/utils/auditNormalize'
import { getAuthMode } from '@/lib/auth/authMode'
import { getSupabaseAuditRepository } from '@/lib/services/supabaseAuditService'

type AuditInput = {
  actor: Pick<User, 'id' | 'full_name' | 'role' | 'system_permission'>
  module: AuditModule
  action: AuditAction
  entity_type: string
  entity_id: string
  entity_name: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string
  source?: AuditLog['source']
  status?: AuditLog['status']
  error_code?: string
  retryable?: boolean
  related_records?: AuditRelatedRecord[]
  entity_exists?: boolean
  correlation_id?: string
}

let auditLogs: AuditLog[] = []

export type AuditLogFilters = {
  query?: string
  from?: string
  to?: string
  actor?: string
  role?: string
  module?: string
  action?: string
  status?: string
  source?: string
}

export type AuditLogPage = {
  items: AuditLog[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  actors: Array<{ id: string; name: string }>
}

const generateId = () => Math.random().toString(36).substring(2, 11)
const storageKey = 'livestream-ops-audit-history'
let hydrated = false

const createMockAuditHistory = (): AuditLog[] => {
  const actors = [
    { id: '1', name: 'Admin User', role: 'admin' },
    { id: '2', name: 'Team Leader', role: 'leader' },
    { id: '3', name: 'Sarah Johnson', role: 'member' },
  ] as const
  const modules: AuditModule[] = ['calendar', 'live', 'reports', 'staff', 'brands', 'campaigns', 'swaps', 'imports']
  const actions: AuditAction[] = ['create', 'update', 'approve', 'register', 'import', 'confirm', 'upload']
  const now = Date.now()

  return Array.from({ length: 87 }, (_, index) => {
    const actor = actors[index % actors.length]
    const auditModule = modules[index % modules.length]
    const number = index + 1
    // Persisted contract remains success|failed only; warning/retryable are derived read-side via classifyOperationStatus
    const derived: 'success' | 'warning' | 'failed' | 'retryable' =
      number % 19 === 0 ? 'failed' : number % 17 === 0 ? 'retryable' : number % 13 === 0 ? 'warning' : 'success'
    const status: AuditLog['status'] = derived === 'retryable' || derived === 'failed' ? 'failed' : 'success'
    const after: Record<string, unknown> = { sequence: number, module: auditModule }
    // attach safe retryable/error/warning context without secrets — classification derives warning/retryable
    if (derived === 'retryable') {
      after.retryable = true
      after.error_code = `ERR_RETRY_${String(number).padStart(3, '0')}`
      after.batch_id = `batch-${String(number).padStart(3, '0')}`
      after.outcome = 'retryable'
    } else if (derived === 'warning') {
      after.warning = 'partial staffing'
      after.outcome = 'warning'
    } else if (derived === 'failed' && index % 2 === 0) {
      after.error_code = `ERR_${String(number).padStart(3, '0')}`
    }
    return {
      id: `mock-audit-${String(number).padStart(3, '0')}`,
      timestamp: new Date(now - index * 60_000).toISOString(),
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      module: auditModule,
      action: actions[index % actions.length],
      entity_type: auditModule === 'reports' ? 'report' : auditModule === 'live' ? 'live_snapshot' : 'shift',
      entity_id: `mock-${number}`,
      entity_name: `Mock audit record ${number}`,
      after,
      source: auditModule === 'imports' ? 'excel_import' : 'system',
      status,
      correlation_id: `mock-request-${String(number).padStart(3, '0')}`,
      entity_exists: true,
      review_status: 'unreviewed',
      ...(after.error_code ? { error_code: String(after.error_code) } : {}),
      ...(after.retryable ? { retryable: true } : {}),
    } as AuditLog
  })
}

const hydrate = () => {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const stored = window.sessionStorage.getItem(storageKey)
    if (stored) {
      auditLogs = JSON.parse(stored) as AuditLog[]
    } else if (process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false') {
      auditLogs = createMockAuditHistory()
      persist()
    }
  } catch {
    auditLogs = []
  }
}

const persist = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(storageKey, JSON.stringify(auditLogs))
}

export function recordAuditEvent(input: AuditInput): AuditLog {
  const entry: AuditLog = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    actor_id: input.actor.id,
    actor_name: input.actor.full_name,
    actor_role: resolveSystemPermission(input.actor),
    module: input.module,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_name: input.entity_name,
    before: input.before,
    after: input.after,
    reason: input.reason,
    source: input.source || 'manual',
    status: input.status || 'success',
    correlation_id: input.correlation_id || `req-${generateId()}`,
    related_records: input.related_records,
    entity_exists: input.entity_exists ?? true,
    review_status: 'unreviewed',
    ...(input.error_code ? { error_code: input.error_code } : {}),
    ...(typeof input.retryable === 'boolean' ? { retryable: input.retryable } : {}),
  }
  // Supabase mutations are audited by database triggers in the same
  // transaction. Keep this compatibility return value for existing callers,
  // but never persist a second client-owned event in production mode.
  if (getAuthMode() === 'supabase') return entry
  hydrate()
  auditLogs.unshift(entry)
  persist()
  return entry
}

const leaderModules = new Set<AuditModule>(['calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports'])

const visibleLogsFor = (user: Pick<User, 'id' | 'role' | 'system_permission'>) => {
  const permission = resolveSystemPermission(user)
  if (permission === 'admin') return [...auditLogs]
  if (permission === 'leader') return auditLogs.filter(entry => leaderModules.has(entry.module))
  return auditLogs.filter(entry => entry.actor_id === user.id)
}

const normalizeStatus = (status: string) => {
  const value = status.trim().toLowerCase()
  if (value === 'successful' || value === 'success') return 'successful'
  if (value === 'warn' || value === 'warning') return 'warning'
  if (value === 'fail' || value === 'failed') return 'failed'
  if (value === 'retryable' || value === 'retry') return 'retryable'
  return value
}

const filterAuditLogs = (logs: AuditLog[], filters: AuditLogFilters) => {
  const query = filters.query?.trim().toLowerCase() || ''
  const statusFilter = filters.status ? normalizeStatus(filters.status) : ''
  return logs.filter(entry => {
    const date = entry.timestamp.slice(0, 10)
    const opStatus = classifyOperationStatus(entry)
    // search includes actor, entity, related entities, correlation, reason, module/action, error_code
    const relatedText = (entry.related_records ?? []).map(r => `${r.entity_name} ${r.entity_type}`).join(' ')
    const haystack = `${entry.entity_name} ${entry.entity_type} ${entry.entity_id} ${entry.actor_name} ${entry.actor_role} ${entry.module} ${entry.action} ${entry.correlation_id} ${entry.reason ?? ''} ${entry.error_code ?? ''} ${relatedText}`.toLowerCase()
    return (!filters.from || date >= filters.from) &&
      (!filters.to || date <= filters.to) &&
      (!filters.actor || filters.actor === 'all' || entry.actor_id === filters.actor) &&
      (!filters.role || filters.role === 'all' || entry.actor_role === filters.role) &&
      (!filters.module || filters.module === 'all' || entry.module === filters.module) &&
      (!filters.action || filters.action === 'all' || entry.action === filters.action) &&
      (!filters.status || filters.status === 'all' || opStatus === statusFilter) &&
      (!filters.source || filters.source === 'all' || entry.source === filters.source) &&
      (!query || haystack.includes(query))
  })
}

export const auditService = {
  async getVisibleFor(user: Pick<User, 'id' | 'role' | 'system_permission'>): Promise<AuditLog[]> {
    if (getAuthMode() === 'supabase') return getSupabaseAuditRepository().getVisibleFor(user)
    hydrate()
    return visibleLogsFor(user)
  },

  async getAuditLogs({
    user,
    page,
    pageSize,
    filters = {},
    sort = 'newest',
  }: {
    user: Pick<User, 'id' | 'role' | 'system_permission'>
    page: number
    pageSize: number
    filters?: AuditLogFilters
    sort?: 'newest' | 'oldest'
  }): Promise<AuditLogPage> {
    if (getAuthMode() === 'supabase') return getSupabaseAuditRepository().getAuditLogs({ user, page, pageSize, filters, sort })
    hydrate()
    const scoped = visibleLogsFor(user)
    const actors = [...new Map(scoped.map(entry => [entry.actor_id, entry.actor_name])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
    const filtered = filterAuditLogs(scoped, filters)
      .sort((left, right) => sort === 'newest'
        ? right.timestamp.localeCompare(left.timestamp)
        : left.timestamp.localeCompare(right.timestamp))
    const safePageSize = [10, 20, 50, 100].includes(pageSize) ? pageSize : 10
    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / safePageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * safePageSize
    return {
      items: filtered.slice(start, start + safePageSize),
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
      actors,
    }
  },

  async getById(id: string): Promise<AuditLog | null> {
    if (getAuthMode() === 'supabase') return getSupabaseAuditRepository().getById(id)
    hydrate()
    return auditLogs.find(entry => entry.id === id) || null
  },

  async addAdministrativeReview(
    id: string,
    actor: Pick<User, 'role' | 'system_permission'>,
    data: Pick<AuditLog, 'admin_note' | 'review_status' | 'handling_reason'>,
  ): Promise<AuditLog> {
    if (getAuthMode() === 'supabase') return getSupabaseAuditRepository().addAdministrativeReview(id, data)
    if (resolveSystemPermission(actor) !== 'admin') {
      throw new Error('Only Admin can add an administrative audit review.')
    }
    hydrate()
    const index = auditLogs.findIndex(entry => entry.id === id)
    if (index === -1) throw new Error('Audit event was not found.')
    auditLogs[index] = { ...auditLogs[index], ...data }
    persist()
    return auditLogs[index]
  },

  async exportAll(user: Pick<User, 'role' | 'system_permission'>): Promise<AuditLog[]> {
    if (getAuthMode() === 'supabase') return getSupabaseAuditRepository().exportAll(user)
    if (resolveSystemPermission(user) !== 'admin') throw new Error('Only Admin can export all audit events.')
    hydrate()
    return [...auditLogs]
  },

  actorRole(user: Pick<User, 'role' | 'system_permission'>): SystemPermission {
    return resolveSystemPermission(user)
  },
}
