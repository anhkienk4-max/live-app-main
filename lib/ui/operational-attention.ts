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
import type { DataQualitySeverity } from '@/lib/types/dataQuality'

// ---------------------------------------------------------------------------
// Attention taxonomy
// ---------------------------------------------------------------------------

export type AttentionSeverity = 'critical' | 'warning' | 'attention' | 'info' | 'success'

/**
 * Single operational attention item (pure data).
 * Derived by the helper functions below — not constructed in JSX.
 */
export interface OperationalAttention {
  /** Unique stable key for React rendering */
  key: string
  severity: AttentionSeverity
  /** Short (≤40 char) primary label */
  label: string
  /** Optional secondary description */
  description?: string
  /** Href to route the user to the resolution surface */
  href?: string
  /** Count associated with the item, e.g. "3 pending" */
  count?: number
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

function severityRank(severity: AttentionSeverity): number {
  return SEVERITY_ORDER.indexOf(severity)
}

/**
 * Deterministic sort: critical first, then warning, attention, info, success.
 * Within the same severity: stable (preserves insertion order via index).
 */
export function sortOperationalAttention(items: OperationalAttention[]): OperationalAttention[] {
  return [...items].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
}

function buildSummary(items: OperationalAttention[]): AttentionSummary {
  const sorted = sortOperationalAttention(items)
  const topSeverity = sorted.length > 0 ? sorted[0].severity : null
  return { items: sorted, topSeverity, healthy: sorted.length === 0 }
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
      label: 'Pending registrations',
      description: `${input.pendingCount} registration${input.pendingCount > 1 ? 's' : ''} awaiting decision`,
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
    if (missingHost > 0) missingRoles.push('Host')
    if (missingSupport > 0) missingRoles.push('Support')
    if (missingTechnical > 0) missingRoles.push('Technical')
    
    items.push({
      key: `shift-${input.shiftId}-gap`,
      severity: 'attention',
      label: 'Staffing gap',
      description: `Missing ${missingRoles.join(', ')}`,
      href: '/calendar',
    })
  }

  return items
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
  return [{
    key: 'staffing-pending',
    severity: 'warning',
    label: 'Staffing decisions needed',
    description: `${input.pendingCount} pending registration${input.pendingCount > 1 ? 's' : ''} awaiting approval`,
    count: input.pendingCount,
    href: '/calendar',
  }]
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
    return [{
      key: `swap-${input.swapId}`,
      severity: input.actorHasValidAction ? 'warning' : 'info',
      label: input.actorHasValidAction ? 'Swap requires your response' : 'Swap pending response',
      description: input.actorHasValidAction ? 'A participant action is needed from you' : 'Waiting for participant response',
      href: '/swaps',
    }]
  }

  if (input.status === 'accepted') {
    return [{
      key: `swap-${input.swapId}-accepted`,
      severity: input.actorHasValidAction ? 'warning' : 'info',
      label: input.actorHasValidAction ? 'Swap awaiting your approval' : 'Swap awaiting reviewer',
      description: input.actorHasValidAction ? 'Reviewer action required' : 'Submitted for review',
      href: '/swaps',
    }]
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
      return [{
        key: `report-${reportId}-in-review`,
        severity: 'info',
        label: 'Report in review',
        description: shiftDate ? `Shift ${shiftDate} — awaiting confirmation` : 'Awaiting reviewer confirmation',
        href: '/reports',
      }]
    case 'reopened':
      return [{
        key: `report-${reportId}-reopened`,
        severity: 'warning',
        label: 'Report reopened',
        description: shiftDate ? `Shift ${shiftDate} — requires attention` : 'Reopened report requires attention',
        href: '/reports',
      }]
    case 'draft':
      return [{
        key: `report-${reportId}-draft`,
        severity: 'warning',
        label: 'Draft report incomplete',
        description: shiftDate ? `Shift ${shiftDate} — not yet submitted` : 'Report has not been submitted',
        href: '/reports',
      }]
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
      return [{
        key: `import-row-${rowId}-failed`,
        severity: 'critical',
        label: 'Import row failed validation',
        description: message ?? 'Row could not be imported due to validation errors',
        href: '/calendar',
      }]
    case 'retryable':
      return [{
        key: `import-row-${rowId}-retryable`,
        severity: 'attention',
        label: 'Import row retryable',
        description: message ?? 'Row failed but may succeed on retry',
        href: '/calendar',
      }]
    case 'warning':
      return [{
        key: `import-row-${rowId}-warning`,
        severity: 'warning',
        label: 'Import row has warning',
        description: message ?? 'Row imported with caveats',
        href: '/calendar',
      }]
    case 'duplicate_skipped':
      return [{
        key: `import-row-${rowId}-dup`,
        severity: 'info',
        label: 'Duplicate row skipped',
        description: message ?? 'Row was a duplicate and was not imported',
      }]
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
 * Maps DataQualitySeverity to AttentionSeverity.
 * error → critical, warning → warning, info → info
 */
function dqSeverityToAttention(sev: DataQualitySeverity): AttentionSeverity {
  if (sev === 'error') return 'critical'
  if (sev === 'warning') return 'warning'
  return 'info'
}

/**
 * Summarizes data quality issues into attention items.
 * Only produces items for issues that actually have non-zero counts.
 */
export function deriveDataQualityAttention(
  errorCount: number,
  warningCount: number,
  infoCount: number,
): OperationalAttention[] {
  const items: OperationalAttention[] = []
  if (errorCount > 0) {
    items.push({
      key: 'dq-errors',
      severity: 'critical',
      label: 'Data quality errors',
      description: `${errorCount} error${errorCount > 1 ? 's' : ''} require resolution`,
      count: errorCount,
      href: '/data-quality',
    })
  }
  if (warningCount > 0) {
    items.push({
      key: 'dq-warnings',
      severity: 'warning',
      label: 'Data quality warnings',
      description: `${warningCount} warning${warningCount > 1 ? 's' : ''} to review`,
      count: warningCount,
      href: '/data-quality',
    })
  }
  if (infoCount > 0) {
    items.push({
      key: 'dq-info',
      severity: 'info',
      label: 'Data quality notices',
      description: `${infoCount} informational notice${infoCount > 1 ? 's' : ''}`,
      count: infoCount,
      href: '/data-quality',
    })
  }
  return items
}

// ---------------------------------------------------------------------------
// Leader-level summary derivation
// ---------------------------------------------------------------------------

export interface LeaderAttentionInput {
  pendingRegistrationCount: number
  pendingSwapCount: number
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
      label: 'Staffing decisions needed',
      description: `${input.pendingRegistrationCount} pending registration${input.pendingRegistrationCount > 1 ? 's' : ''} to review`,
      count: input.pendingRegistrationCount,
      href: '/calendar',
    })
  }

  if (input.pendingSwapCount > 0) {
    items.push({
      key: 'leader-pending-swaps',
      severity: 'warning',
      label: 'Swap decisions needed',
      description: `${input.pendingSwapCount} swap request${input.pendingSwapCount > 1 ? 's' : ''} awaiting review`,
      count: input.pendingSwapCount,
      href: '/swaps',
    })
  }

  if (input.pendingReportCount > 0) {
    items.push({
      key: 'leader-pending-reports',
      severity: 'info',
      label: 'Reports awaiting completion',
      description: `${input.pendingReportCount} draft/in-review report${input.pendingReportCount > 1 ? 's' : ''}`,
      count: input.pendingReportCount,
      href: '/reports',
    })
  }

  if (input.dqErrorCount > 0) {
    items.push({
      key: 'leader-dq-errors',
      severity: 'critical',
      label: 'Data quality errors',
      description: `${input.dqErrorCount} data quality error${input.dqErrorCount > 1 ? 's' : ''} detected`,
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
  /** Personal pending/accepted swaps (requester or counterpart) */
  pendingSwapCount: number
  /** True if the member has an upcoming assigned shift (within the data scope) */
  hasUpcomingShift: boolean
  /** True if the member's swap requires their action (resolver said so) */
  swapNeedsAction: boolean
}

export function deriveMemberAttention(input: MemberAttentionInput): AttentionSummary {
  const items: OperationalAttention[] = []

  if (input.pendingRegistrationCount > 0) {
    items.push({
      key: 'member-pending-registrations',
      severity: 'info',
      label: 'Registration awaiting approval',
      description: `${input.pendingRegistrationCount} pending registration${input.pendingRegistrationCount > 1 ? 's' : ''}`,
      count: input.pendingRegistrationCount,
      href: '/calendar',
    })
  }

  if (input.pendingSwapCount > 0) {
    items.push({
      key: 'member-pending-swaps',
      severity: input.swapNeedsAction ? 'warning' : 'info',
      label: input.swapNeedsAction ? 'Swap requires your response' : 'Swap request pending',
      description: input.swapNeedsAction
        ? 'You have a swap request awaiting your response'
        : 'Your swap request is pending approval',
      count: input.pendingSwapCount,
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
