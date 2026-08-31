/**
 * E5 — Exception-First Operational UX
 *
 * Attention/exception presentation contract.
 *
 * PURE DERIVATION ONLY:
 *   - No backend calls, no auth changes, no state machine changes.
 *   - No fabricated urgency or fake data.
 *   - All signals derive from EXISTING data already returned by existing services.
 *
 * Priority order (deterministic):
 *   1. critical   — blocking/failed: hard error, validation_failed, load error
 *   2. warning    — needs decision: pending staffing, pending swap, draft/reopened report
 *   3. attention  — upcoming risk: shift approaching with gap, retryable import
 *   4. info       — informational/waiting: in_review report, accepted swap
 *   5. success    — healthy/completed: no exceptions, confirmed
 */

import type { ReportStatus, RegistrationStatus, SwapStatus, ScheduleImportRowOutcome } from '@/lib/types/database.types'
import { calendarCtaHref } from '@/lib/ui/action-priority'

// ---------------------------------------------------------------------------
// Attention taxonomy
// ---------------------------------------------------------------------------

export type AttentionSeverity = 'critical' | 'warning' | 'attention' | 'info' | 'success'
export type AttentionUrgency = 'now' | 'overdue' | 'soon' | 'upcoming' | 'informational'
export type AttentionScope = 'personal' | 'team' | 'organization'

export interface AttentionEntity {
  type: string
  id: string
}

/**
 * Single operational attention item (pure data).
 * Derived by the helper functions below — not constructed in JSX.
 */
export interface OperationalAttention {
  /** Unique stable key for React rendering */
  key: string
  severity: AttentionSeverity
  /** Short (≤40 char) primary label (supports translation keys) */
  label: string
  labelParams?: Record<string, string | number | string[]>
  /** Optional secondary description (supports translation keys) */
  description?: string
  descriptionParams?: Record<string, string | number | string[]>
  /** Href to route the user to the resolution surface */
  href?: string
  /** Count associated with the item, e.g. "3 pending" */
  count?: number
  /** Operational urgency is independent from visual severity/CTA priority. */
  urgency?: AttentionUrgency
  /** Visibility scope; callers only provide data already authorized for the actor. */
  scope?: AttentionScope
  /** Canonical entity behind the exception. */
  entity?: AttentionEntity
  /** Explicitly marks whether this item represents an action for this actor. */
  actionable?: boolean
  /** Optional ISO deadline used for deterministic ranking. */
  deadline?: string
}

/**
 * Summary of all attention items for a surface/role.
 * The ordering is deterministic by severity tier.
 */
export interface AttentionSummary {
  items: OperationalAttention[]
  /** The highest severity tier present */
  topSeverity: AttentionSeverity | null
  /** True when items array is empty (healthy state) */
  healthy: boolean
}

// ---------------------------------------------------------------------------
// Severity ordering (lower index = higher priority)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: AttentionSeverity[] = ['critical', 'warning', 'attention', 'info', 'success']
const URGENCY_ORDER: AttentionUrgency[] = ['now', 'overdue', 'soon', 'upcoming', 'informational']

function severityRank(severity: AttentionSeverity): number {
  return SEVERITY_ORDER.indexOf(severity)
}

function defaultUrgency(severity: AttentionSeverity): AttentionUrgency {
  if (severity === 'critical') return 'now'
  if (severity === 'warning') return 'soon'
  if (severity === 'attention') return 'upcoming'
  return 'informational'
}

function urgencyRank(urgency: AttentionUrgency): number {
  return URGENCY_ORDER.indexOf(urgency)
}

function inferEntity(key: string): AttentionEntity | undefined {
  const match = /^(shift|swap|report|import-row)-(.+?)(?:-(?:pending|gap|accepted|failed|retryable|warning|dup|in-review|reopened|draft))?$/.exec(key)
  if (match) return { type: match[1], id: match[2] }
  if (key.startsWith('dq-')) return { type: 'data-quality', id: key.slice(3) }
  return undefined
}

function inferScope(key: string): AttentionScope {
  if (key.startsWith('member-')) return 'personal'
  if (key.startsWith('dq-')) return 'organization'
  return 'team'
}

/**
 * Deterministic sort: critical first, then warning, attention, info, success.
 * Within the same severity: stable (preserves insertion order via index).
 */
export function sortOperationalAttention(items: OperationalAttention[]): OperationalAttention[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const severity = severityRank(a.item.severity) - severityRank(b.item.severity)
      if (severity !== 0) return severity
      const urgency = urgencyRank(a.item.urgency ?? defaultUrgency(a.item.severity)) - urgencyRank(b.item.urgency ?? defaultUrgency(b.item.severity))
      if (urgency !== 0) return urgency
      const deadline = (a.item.deadline ?? '').localeCompare(b.item.deadline ?? '')
      if (deadline !== 0) return deadline
      const key = a.item.key.localeCompare(b.item.key)
      return key !== 0 ? key : a.index - b.index
    })
    .map(({ item }) => item)
}

function buildSummary(items: OperationalAttention[]): AttentionSummary {
  const enriched = items.map(item => decorateAttention([item], inferScope(item.key))[0])
  const sorted = deduplicateOperationalAttention(sortOperationalAttention(enriched))
  const topSeverity = sorted.length > 0 ? sorted[0].severity : null
  return { items: sorted, topSeverity, healthy: sorted.length === 0 }
}

/** Remove duplicate representations of one exception within a surface. */
export function deduplicateOperationalAttention(items: OperationalAttention[]): OperationalAttention[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.key)) return false
    seen.add(item.key)
    return true
  })
}

export function isActionableAttention(item: OperationalAttention): boolean {
  return item.actionable ?? Boolean(item.href)
}

function decorateAttention(items: OperationalAttention[], fallbackScope: AttentionScope): OperationalAttention[] {
  return items.map(item => ({
    ...item,
    urgency: item.urgency ?? defaultUrgency(item.severity),
    scope: item.scope ?? fallbackScope,
    entity: item.entity ?? inferEntity(item.key),
    actionable: item.actionable ?? Boolean(item.href),
  }))
}

// ---------------------------------------------------------------------------
// Canonical staffing helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a registration status counts as "staffed".
 * ONLY approved + manually_assigned are staffed.
 * pending / rejected / cancelled / removed / available are NOT staffed.
 * Imported names (host_names etc) are never counted — they are display metadata only.
 */
export function isStaffedStatus(status: RegistrationStatus): boolean {
  return status === 'approved' || status === 'manually_assigned'
}

// ---------------------------------------------------------------------------
// Shift attention derivation
// ---------------------------------------------------------------------------

export interface ShiftAttentionInput {
  shiftId: string
  shiftDate: string
  shiftStatus: string
  /** Count of pending registrations for this shift */
  pendingCount: number
  /** True if this shift is today or in the near future (caller decides threshold) */
  isUpcoming: boolean
  /** Required staffing counts */
  required: {
    host: number
    support: number
    technical: number
  }
  /** Actual staffed counts (approved + manually_assigned ONLY) */
  staffed: {
    host: number
    support: number
    technical: number
  }
}

/**
 * Derives attention items for a single shift card/row.
 *
 * Rules:
 *   - cancelled shift → no staffing attention (terminal)
 *   - pendingCount > 0 → warning (decisions needed)
 *   - staffedCount === 0 && isUpcoming → attention (gap risk)
 */
export function deriveShiftAttention(input: ShiftAttentionInput): OperationalAttention[] {
  const items: OperationalAttention[] = []

  if (input.shiftStatus === 'cancelled') return items

  if (input.pendingCount > 0) {
    items.push({
      key: `shift-${input.shiftId}-pending`,
      severity: 'warning',
      label: 'pendingRegistrations',
      description: 'pendingRegistrationsDesc',
      descriptionParams: { count: input.pendingCount },
      count: input.pendingCount,
      href: '/calendar',
    })
  }

  const missingHost = Math.max(0, input.required.host - input.staffed.host)
  const missingSupport = Math.max(0, input.required.support - input.staffed.support)
  const missingTechnical = Math.max(0, input.required.technical - input.staffed.technical)
  const totalMissing = missingHost + missingSupport + missingTechnical

  if (totalMissing > 0 && input.isUpcoming) {
    const missingRoles = []
    if (missingHost > 0) missingRoles.push('host')
    if (missingSupport > 0) missingRoles.push('support')
    if (missingTechnical > 0) missingRoles.push('technical')
    
    items.push({
      key: `shift-${input.shiftId}-gap`,
      severity: 'attention',
      label: 'staffingGap',
      description: 'missingRoles',
      descriptionParams: { roles: missingRoles },
      href: '/calendar',
    })
  }

  return decorateAttention(items, 'team')
}

// ---------------------------------------------------------------------------
// Staffing approval attention derivation
// ---------------------------------------------------------------------------

export interface StaffingAttentionInput {
  pendingCount: number
  shiftLabel?: string
}

/**
 * Derives attention for the staffing approval queue.
 *
 * - pending decisions outrank history.
 * - If no pending decisions: healthy state.
 */
export function deriveStaffingAttention(input: StaffingAttentionInput): OperationalAttention[] {
  if (input.pendingCount === 0) return []
  return decorateAttention([{
    key: 'staffing-pending',
    severity: 'warning',
    label: 'staffingDecisionsNeeded',
    description: 'staffingDecisionsNeededDesc',
    descriptionParams: { count: input.pendingCount },
    count: input.pendingCount,
  }], 'team')
}

// ---------------------------------------------------------------------------
// Swap attention derivation
// ---------------------------------------------------------------------------

export interface SwapAttentionInput {
  swapId: string
  status: SwapStatus
  /** True only if getSwapUiActions() returns at least one valid action for the current actor */
  actorHasValidAction: boolean
}

/**
 * Derives attention for a single swap.
 *
 * Rules:
 *   - Terminal (rejected / cancelled / completed / approved): no attention.
 *   - pending + actorHasValidAction: warning (needs YOUR action).
 *   - pending + !actorHasValidAction: info (waiting on another party).
 *   - accepted: info (pending reviewer decision).
 *
 * Does NOT label a swap "needs your action" unless the actor's resolver
 * (getSwapUiActions) returns a valid action.
 */
export function deriveSwapAttention(input: SwapAttentionInput): OperationalAttention[] {
  const terminal: SwapStatus[] = ['rejected', 'cancelled', 'completed', 'approved']
  if (terminal.includes(input.status)) return []

  if (input.status === 'pending') {
    return decorateAttention([{
      key: `swap-${input.swapId}`,
      severity: input.actorHasValidAction ? 'warning' : 'info',
      label: input.actorHasValidAction ? 'swapRequiresResponse' : 'swapPendingResponse',
      description: input.actorHasValidAction ? 'swapParticipantActionNeeded' : 'swapWaitingForParticipant',
      href: '/swaps',
    }], 'personal')
  }

  if (input.status === 'accepted') {
    return decorateAttention([{
      key: `swap-${input.swapId}-accepted`,
      severity: input.actorHasValidAction ? 'warning' : 'info',
      label: input.actorHasValidAction ? 'swapAwaitingApproval' : 'swapAwaitingReviewer',
      description: input.actorHasValidAction ? 'swapReviewerActionRequired' : 'swapSubmittedForReview',
      href: '/swaps',
    }], 'personal')
  }

  return []
}

// ---------------------------------------------------------------------------
// Report attention derivation
// ---------------------------------------------------------------------------

/**
 * Maps canonical ReportStatus to an OperationalAttention item.
 *
 * archived → terminal (no attention)
 * confirmed → success (healthy)
 * in_review → info (waiting)
 * reopened → warning (needs attention)
 * draft → warning (incomplete)
 */
export function deriveReportAttention(
  reportId: string,
  status: ReportStatus,
  shiftDate?: string,
): OperationalAttention[] {
  switch (status) {
    case 'archived':
      return [] // terminal — no attention needed
    case 'confirmed':
      return [] // healthy — surfaced separately as success if needed
    case 'in_review':
      return decorateAttention([{
        key: `report-${reportId}-in-review`,
        severity: 'info',
        label: 'reportPendingReview',
        description: shiftDate ? 'reportInReviewDescShift' : 'reportInReviewDesc',
        descriptionParams: shiftDate ? { shiftDate } : undefined,
        href: '/reports',
      }], 'personal')
    case 'reopened':
      return decorateAttention([{
        key: `report-${reportId}-reopened`,
        severity: 'warning',
        label: 'reportNeedsAttention',
        description: shiftDate ? 'reportReopenedDescShift' : 'reportReopenedDesc',
        descriptionParams: shiftDate ? { shiftDate } : undefined,
        href: '/reports',
      }], 'personal')
    case 'draft':
      return decorateAttention([{
        key: `report-${reportId}-draft`,
        severity: 'warning',
        label: 'reportDraftNeedsCompletion',
        description: shiftDate ? 'reportDraftDescShift' : 'reportDraftDesc',
        descriptionParams: shiftDate ? { shiftDate } : undefined,
        href: '/reports',
      }], 'personal')
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Import row attention derivation
// ---------------------------------------------------------------------------

/**
 * Maps import row outcomes to attention severity.
 * Priority: validation_failed/retryable > warning > imported/pending.
 *
 * validation_failed → critical
 * retryable → attention
 * warning → warning
 * duplicate_skipped → info
 * imported / pending → no attention (healthy/in-progress)
 */
export function deriveImportRowAttention(
  rowId: string,
  outcome: ScheduleImportRowOutcome,
  message?: string,
): OperationalAttention[] {
  switch (outcome) {
    case 'validation_failed':
      return decorateAttention([{
        key: `import-row-${rowId}-failed`,
        severity: 'critical',
        label: 'validationError',
        description: 'importRowCaveat',
        descriptionParams: { message: message ?? '' },
        href: '/calendar',
      }], 'team')
    case 'retryable':
      return decorateAttention([{
        key: `import-row-${rowId}-retryable`,
        severity: 'attention',
        label: 'importRetryable',
        description: 'importRowRetry',
        descriptionParams: { message: message ?? '' },
        href: '/calendar',
      }], 'team')
    case 'warning':
      return decorateAttention([{
        key: `import-row-${rowId}-warning`,
        severity: 'warning',
        label: 'importWarning',
        description: 'importRowCaveat',
        descriptionParams: { message: message ?? '' },
        href: '/calendar',
      }], 'team')
    case 'duplicate_skipped':
      return decorateAttention([{
        key: `import-row-${rowId}-dup`,
        severity: 'info',
        label: 'importDuplicate',
        description: 'importRowDuplicate',
        descriptionParams: { message: message ?? '' },
      }], 'team')
    case 'imported':
    case 'pending':
      return []
    default:
      return []
  }
}

// ---------------------------------------------------------------------------
// Data quality attention derivation
// ---------------------------------------------------------------------------

/**
 * Summarizes data quality issues into attention items.
 * Only produces items for issues that actually have non-zero counts.
 */
export function deriveDataQualityAttention(
  errors: number,
  warnings: number,
  info: number,
): OperationalAttention[] {
  const items: OperationalAttention[] = []
  if (errors > 0) {
    items.push({
      key: 'dq-critical',
      severity: 'critical',
      label: 'dataQualityErrors',
      description: 'dqErrorsDesc',
      descriptionParams: { count: errors },
      count: errors,
      href: '/data-quality',
    })
  }
  if (warnings > 0) {
    items.push({
      key: 'dq-warning',
      severity: 'warning',
      label: 'dataQualityWarnings',
      description: 'dqWarningsDesc',
      descriptionParams: { count: warnings },
      count: warnings,
      href: '/data-quality',
    })
  }
  if (info > 0) {
    items.push({
      key: 'dq-info',
      severity: 'info',
      label: 'dataQualityNotices',
      description: 'dqNoticesDesc',
      descriptionParams: { count: info },
      count: info,
      href: '/data-quality',
    })
  }
  return decorateAttention(items, 'organization')
}

// ---------------------------------------------------------------------------
// Leader-level summary derivation
// ---------------------------------------------------------------------------

export interface LeaderAttentionInput {
  pendingRegistrationCount: number
  actionableSwapCount: number
  waitingSwapCount: number
  pendingReportCount: number
  /** Data quality error count (from existing DQ system) */
  dqErrorCount: number
}

export function deriveLeaderAttention(input: LeaderAttentionInput): AttentionSummary {
  const items: OperationalAttention[] = []

  if (input.pendingRegistrationCount > 0) {
    items.push({
      key: 'leader-pending-registrations',
      severity: 'warning',
      label: 'staffingDecisionsNeeded',
      description: 'staffingDecisionsNeededDesc',
      descriptionParams: { count: input.pendingRegistrationCount },
      count: input.pendingRegistrationCount,
      href: calendarCtaHref('open'),
    })
  }

  if (input.actionableSwapCount > 0) {
    items.push({
      key: 'leader-actionable-swaps',
      severity: 'warning',
      label: 'swapDecisionsNeeded',
      description: 'swapDecisionsNeededDesc',
      descriptionParams: { count: input.actionableSwapCount },
      count: input.actionableSwapCount,
      href: '/swaps',
    })
  }

  if (input.waitingSwapCount > 0) {
    items.push({
      key: 'leader-waiting-swaps',
      severity: 'info',
      label: 'swapPendingParticipant',
      description: 'swapPendingParticipantDesc',
      descriptionParams: { count: input.waitingSwapCount },
      count: input.waitingSwapCount,
      href: '/swaps',
    })
  }

  if (input.pendingReportCount > 0) {
    items.push({
      key: 'leader-pending-reports',
      severity: 'info',
      label: 'reportsAwaitingCompletion',
      description: 'reportsAwaitingCompletionDesc',
      descriptionParams: { count: input.pendingReportCount },
      count: input.pendingReportCount,
      href: '/reports',
    })
  }

  if (input.dqErrorCount > 0) {
    items.push({
      key: 'leader-dq-errors',
      severity: 'critical',
      label: 'dataQualityErrors',
      description: 'dataQualityErrorsDetectedDesc',
      descriptionParams: { count: input.dqErrorCount },
      count: input.dqErrorCount,
      href: '/data-quality',
    })
  }

  return buildSummary(items)
}

// ---------------------------------------------------------------------------
// Member-level summary derivation
// ---------------------------------------------------------------------------

export interface MemberAttentionInput {
  /** Personal pending registrations */
  pendingRegistrationCount: number
  /** Personal actionable swaps */
  actionableSwapCount: number
  /** Personal waiting swaps */
  waitingSwapCount: number
  /** True if the member has an upcoming assigned shift (within the data scope) */
  hasUpcomingShift: boolean
}

export function deriveMemberAttention(input: MemberAttentionInput): AttentionSummary {
  const items: OperationalAttention[] = []

  if (input.pendingRegistrationCount > 0) {
    items.push({
      key: 'member-pending-registrations',
      severity: 'info',
      label: 'registrationAwaitingApproval',
      description: 'registrationAwaitingApprovalDesc',
      descriptionParams: { count: input.pendingRegistrationCount },
      count: input.pendingRegistrationCount,
      href: calendarCtaHref('open'),
    })
  }

  if (input.actionableSwapCount > 0) {
    items.push({
      key: 'member-actionable-swaps',
      severity: 'warning',
      label: 'swapRequiresResponse',
      description: 'swapRequiresResponseDesc',
      descriptionParams: { count: input.actionableSwapCount },
      count: input.actionableSwapCount,
      href: '/swaps',
    })
  }
  
  if (input.waitingSwapCount > 0) {
    items.push({
      key: 'member-waiting-swaps',
      severity: 'info',
      label: 'swapRequestPending',
      description: 'swapRequestPendingDesc',
      descriptionParams: { count: input.waitingSwapCount },
      count: input.waitingSwapCount,
      href: '/swaps',
    })
  }

  return buildSummary(items)
}

// ---------------------------------------------------------------------------
// Generic operational summary helper
// ---------------------------------------------------------------------------

/**
 * Merge multiple attention item arrays and produce a sorted summary.
 * Used when a surface needs to aggregate multiple derivation sources.
 */
export function mergeAttentionSummary(itemArrays: OperationalAttention[][]): AttentionSummary {
  const merged = itemArrays.flat()
  return buildSummary(merged)
}
