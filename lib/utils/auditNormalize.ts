import type { AuditAction, AuditLog, AuditModule, AuditRelatedRecord } from '@/lib/types/database.types'

const AUDIT_MODULES: ReadonlySet<AuditModule> = new Set([
  'calendar',
  'live',
  'reports',
  'staff',
  'brands',
  'platforms',
  'campaigns',
  'swaps',
  'imports',
  'settings',
])

const AUDIT_ACTIONS: ReadonlySet<AuditAction> = new Set([
  'create',
  'update',
  'delete',
  'soft_delete',
  'restore',
  'archive',
  'unarchive',
  'confirm',
  'unconfirm',
  'approve',
  'reject',
  'assign',
  'unassign',
  'register',
  'cancel_registration',
  'lock',
  'reopen',
  'import',
  'export',
  'ocr_run',
  'ocr_rerun',
  'ocr_reset',
  'upload',
  'remove_upload',
  'account_registered',
  'email_verified',
  'email_auto_verified_mock',
  'account_approved',
  'account_rejected',
  'role_assigned',
  'login_success',
  'login_failed',
])

export type OperationStatus = 'successful' | 'warning' | 'failed' | 'retryable'

const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|secret|token|access_token|refresh_token|api_key|apikey|authorization|auth|credential|private_key|privatekey|bearer|session|cookie|jwt)/i

export function normalizeAuditModule(module: unknown): AuditModule {
  const value = String(module ?? '').trim().toLowerCase()
  if (AUDIT_MODULES.has(value as AuditModule)) return value as AuditModule
  return 'settings'
}

export function normalizeAuditAction(action: unknown): AuditAction {
  const value = String(action ?? '').trim().toLowerCase()
  if (AUDIT_ACTIONS.has(value as AuditAction)) return value as AuditAction
  // keep raw but normalize underscores
  return value.replace(/[^a-z0-9_]/g, '_').slice(0, 48) as AuditAction
}

export function normalizeAuditActor(entry: Pick<AuditLog, 'actor_id' | 'actor_name' | 'actor_role'>): {
  id: string
  name: string
  role: AuditLog['actor_role']
  label: string
} {
  const id = String(entry.actor_id ?? '').trim() || 'unknown'
  const name = String(entry.actor_name ?? '').trim() || 'Unknown actor'
  const role = (['admin', 'leader', 'member'] as const).includes(entry.actor_role as never)
    ? entry.actor_role
    : 'member'
  return { id, name, role, label: `${name} (${role})` }
}

export function normalizeRelatedEntity(record: AuditRelatedRecord): AuditRelatedRecord {
  return {
    entity_type: String(record.entity_type ?? '').trim().toLowerCase().slice(0, 64) || 'unknown',
    entity_id: String(record.entity_id ?? '').trim().slice(0, 128) || 'unknown',
    entity_name: String(record.entity_name ?? '').trim().slice(0, 200) || 'Unnamed',
    count: typeof record.count === 'number' && Number.isFinite(record.count) ? record.count : undefined,
  }
}

export function normalizeTimestamp(timestamp: unknown): { iso: string; display: string; epoch: number } {
  const raw = String(timestamp ?? '')
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date(0)
    return { iso: fallback.toISOString(), display: fallback.toLocaleString(), epoch: 0 }
  }
  return { iso: date.toISOString(), display: date.toLocaleString(), epoch: date.getTime() }
}

export function getAuditSummary(entry: AuditLog): string {
  const actor = normalizeAuditActor(entry)
  const module = normalizeAuditModule(entry.module)
  const action = normalizeAuditAction(entry.action)
  const status = classifyOperationStatus(entry)
  const time = normalizeTimestamp(entry.timestamp).display
  return `${actor.name} ${action.replaceAll('_', ' ')} ${entry.entity_type} "${entry.entity_name}" in ${module} at ${time} [${status}]`
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // never expose raw long tokens - but keep short safe strings
    const trimmed = value.trim()
    if (trimmed.length > 64 && /^[A-Za-z0-9_\-+/=]+$/.test(trimmed)) return '[REDACTED]'
    return value
  }
  return value
}

export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED_DEPTH]'
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(item => sanitizeMetadata(item, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(rawKey)) {
        out[rawKey] = '[REDACTED]'
        continue
      }
      // also catch nested token-shaped payloads
      if (rawKey.toLowerCase().includes('payload') && typeof rawVal === 'string' && rawVal.length > 200) {
        out[rawKey] = '[REDACTED_PAYLOAD]'
        continue
      }
      out[rawKey] = sanitizeMetadata(redactValue(rawVal), depth + 1)
    }
    return out
  }
  return redactValue(value)
}

export function getSafeMetadata(entry: Pick<AuditLog, 'before' | 'after'>): {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
} {
  const before = entry.before ? (sanitizeMetadata(entry.before) as Record<string, unknown>) : undefined
  const after = entry.after ? (sanitizeMetadata(entry.after) as Record<string, unknown>) : undefined
  return { before, after }
}

export function classifyOperationStatus(entry: Pick<AuditLog, 'status' | 'after' | 'before' | 'reason'>): OperationStatus {
  const raw = String((entry as { status?: unknown }).status ?? '').toLowerCase()
  if (raw === 'warning') return 'warning'
  if (raw === 'retryable') return 'retryable'
  // derived read-side: persisted status remains success|failed, warning/retryable inferred from safe after metadata
  const after = (entry as { after?: Record<string, unknown> })?.after as Record<string, unknown> | undefined
  const flag = after?.retryable === true || after?.is_retryable === true
  if (flag) return 'retryable'
  const outcome = String(after?.outcome ?? '').toLowerCase()
  if (outcome === 'retryable') return 'retryable'
  if (outcome === 'warning') return 'warning'
  if (after?.warning) return 'warning'
  if (raw === 'failed') return 'failed'
  if (raw === 'success' || raw === 'successful') return 'successful'
  return 'successful'
}

export type AuditErrorRecoveryContext = {
  reason?: string
  errorCode?: string
  retryable: boolean
  correlationId: string
  entity: { type: string; id: string; name: string }
  references: {
    batchId?: string
    reportId?: string
    shiftId?: string
    requestId?: string
    correlationId: string
  }
  relatedRecords: AuditRelatedRecord[]
}

function extractSafeString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined
  for (const key of keys) {
    const val = record[key]
    if (typeof val === 'string' && val.trim()) return val.trim().slice(0, 128)
  }
  return undefined
}

export function getErrorRecoveryContext(entry: AuditLog): AuditErrorRecoveryContext {
  const after = (entry.after ?? {}) as Record<string, unknown>
  const before = (entry.before ?? {}) as Record<string, unknown>

  // only safe fields
  const errorCode =
    (entry as unknown as { error_code?: unknown }).error_code != null
      ? String((entry as unknown as { error_code: unknown }).error_code).slice(0, 64)
      : extractSafeString(after, ['error_code', 'failure_code', 'errorCode', 'code']) ??
        extractSafeString(before, ['error_code', 'failure_code', 'errorCode', 'code'])

  const retryableFlag =
    (entry as unknown as { retryable?: unknown }).retryable === true ||
    after.retryable === true ||
    after.is_retryable === true ||
    after.outcome === 'retryable' ||
    classifyOperationStatus(entry) === 'retryable'

  // batch/report/shift/request references only from safe existing fields
  const batchId =
    extractSafeString(after, ['batch_id', 'batchId', 'import_batch_id']) ??
    extractSafeString(before, ['batch_id', 'batchId']) ??
    (entry.entity_type === 'import_batch' || entry.entity_type === 'batch' ? entry.entity_id : undefined)

  const reportId =
    extractSafeString(after, ['report_id', 'reportId']) ??
    (entry.entity_type === 'report' ? entry.entity_id : undefined) ??
    entry.related_records?.find(r => r.entity_type === 'report')?.entity_id

  const shiftId =
    extractSafeString(after, ['shift_id', 'shiftId']) ??
    (entry.entity_type === 'shift' ? entry.entity_id : undefined) ??
    entry.related_records?.find(r => r.entity_type === 'shift')?.entity_id

  const requestId =
    extractSafeString(after, ['request_id', 'requestId', 'swap_request_id']) ??
    (entry.entity_type === 'swap_request' ? entry.entity_id : undefined) ??
    entry.related_records?.find(r => r.entity_type === 'swap_request')?.entity_id

  return {
    reason: entry.reason ? String(entry.reason).slice(0, 500) : undefined,
    errorCode: errorCode?.slice(0, 64),
    retryable: Boolean(retryableFlag),
    correlationId: String(entry.correlation_id ?? '').slice(0, 128),
    entity: {
      type: String(entry.entity_type).slice(0, 64),
      id: String(entry.entity_id).slice(0, 128),
      name: String(entry.entity_name).slice(0, 200),
    },
    references: {
      batchId,
      reportId,
      shiftId,
      requestId,
      correlationId: String(entry.correlation_id ?? '').slice(0, 128),
    },
    relatedRecords: (entry.related_records ?? []).map(normalizeRelatedEntity),
  }
}

export function statusBadgeClass(status: OperationStatus): string {
  switch (status) {
    case 'successful':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'retryable':
      return 'bg-blue-100 text-blue-800 border-blue-200'
  }
}

export function normalizeAuditFilters(filters: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) {
    out[key] = String(value ?? '').trim().toLowerCase()
  }
  return out
}
