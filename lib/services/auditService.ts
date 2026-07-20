import { AuditAction, AuditLog, AuditModule, AuditRelatedRecord, SystemPermission, User } from '@/lib/types/database.types'
import { resolveSystemPermission } from '@/lib/permissions'

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
    const module = modules[index % modules.length]
    const number = index + 1
    return {
      id: `mock-audit-${String(number).padStart(3, '0')}`,
      timestamp: new Date(now - index * 60_000).toISOString(),
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      module,
      action: actions[index % actions.length],
      entity_type: module === 'reports' ? 'report' : module === 'live' ? 'live_snapshot' : 'shift',
      entity_id: `mock-${number}`,
      entity_name: `Mock audit record ${number}`,
      after: { sequence: number, module },
      source: module === 'imports' ? 'excel_import' : 'system',
      status: number % 19 === 0 ? 'failed' : 'success',
      correlation_id: `mock-request-${String(number).padStart(3, '0')}`,
      entity_exists: true,
      review_status: 'unreviewed',
    }
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
  hydrate()
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
  }
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

const filterAuditLogs = (logs: AuditLog[], filters: AuditLogFilters) => {
  const query = filters.query?.trim().toLowerCase() || ''
  return logs.filter(entry => {
    const date = entry.timestamp.slice(0, 10)
    return (!filters.from || date >= filters.from) &&
      (!filters.to || date <= filters.to) &&
      (!filters.actor || filters.actor === 'all' || entry.actor_id === filters.actor) &&
      (!filters.role || filters.role === 'all' || entry.actor_role === filters.role) &&
      (!filters.module || filters.module === 'all' || entry.module === filters.module) &&
      (!filters.action || filters.action === 'all' || entry.action === filters.action) &&
      (!filters.status || filters.status === 'all' || entry.status === filters.status) &&
      (!filters.source || filters.source === 'all' || entry.source === filters.source) &&
      (!query || `${entry.entity_name} ${entry.entity_type} ${entry.actor_name}`.toLowerCase().includes(query))
  })
}

export const auditService = {
  async getVisibleFor(user: Pick<User, 'id' | 'role' | 'system_permission'>): Promise<AuditLog[]> {
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
    hydrate()
    return auditLogs.find(entry => entry.id === id) || null
  },

  async addAdministrativeReview(
    id: string,
    actor: Pick<User, 'role' | 'system_permission'>,
    data: Pick<AuditLog, 'admin_note' | 'review_status' | 'handling_reason'>,
  ): Promise<AuditLog> {
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
    if (resolveSystemPermission(user) !== 'admin') throw new Error('Only Admin can export all audit events.')
    hydrate()
    return [...auditLogs]
  },

  actorRole(user: Pick<User, 'role' | 'system_permission'>): SystemPermission {
    return resolveSystemPermission(user)
  },
}
