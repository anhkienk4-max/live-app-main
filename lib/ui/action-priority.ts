/**
 * E4 — Action Priority Contract
 *
 * Defines the shared action-priority model for LIVE OPS surfaces.
 *
 * This module is presentation-only:
 *   - No backend, no service calls, no auth changes.
 *   - No workflow-state changes.
 *   - Existing permission gates (hasPermission) remain authoritative.
 *
 * Priority tiers:
 *   PRIMARY    — single most-likely valid next action for the current state/role
 *   SECONDARY  — frequent supporting actions that deserve visible placement
 *   OVERFLOW   — lower-frequency contextual actions (accessible via ••• / More)
 *   DESTRUCTIVE — visually separated; never accidentally promoted to primary
 *   TERMINAL   — read-only status; no fake CTA
 */

export type ActionTier = 'primary' | 'secondary' | 'overflow' | 'destructive' | 'terminal'

export type CalendarCtaTab = 'open' | 'mine'

/** Stable deep links for Member calendar workflows. */
export function calendarCtaHref(tab: CalendarCtaTab): string {
  return `/calendar?tab=${tab}`
}

export interface PrioritizedAction {
  key: string
  /** Human-readable label. Use i18n keys at call site. */
  label: string
  tier: ActionTier
  /** Lucide icon element, optional */
  icon?: React.ReactNode
  onClick?: () => void
  /** True when the action is valid but awaiting a condition (e.g. form selection) */
  disabled?: boolean
  /** Inline tooltip/aria-label for icon-only buttons */
  ariaLabel?: string
  /** data-testid for automated testing */
  testId?: string
}

/**
 * Priority rules (authoritative hierarchy):
 *
 * 1. PRIMARY: The single most-likely valid next action given the current
 *    workflow state and the actor's role. There MUST be at most ONE primary
 *    action per surface/card at a time. If multiple candidates exist, promote
 *    the one most aligned with the operational goal.
 *
 * 2. SECONDARY: Frequent supporting actions that should be visible on desktop.
 *    On tablet (≤768px) retain the highest-value secondaries; move eligible
 *    lower-value secondaries to overflow.
 *    On mobile (≤430px) secondary actions are surfaced via the Actions menu.
 *
 * 3. OVERFLOW: Lower-frequency contextual actions. Accessible via ••• / More.
 *    Always keyboard reachable. Touch target ≥44px.
 *
 * 4. DESTRUCTIVE: Visually separated (destructive button variant or separator).
 *    Never promoted to primary accidentally. Confirmation dialog retained.
 *
 * 5. TERMINAL: Read-only status display. No button, no CTA.
 *
 * Role-specific rules:
 *   ADMIN    — management / system actions may be primary where operationally appropriate.
 *   LEADER   — operational decisions (approve/reject/assign) outrank analytics navigation.
 *   MEMBER   — self-service operational actions (register, swap, view my shift) dominate.
 *
 * Mobile contract (≤390px):
 *   - PRIMARY CTA visible (full-width if appropriate).
 *   - SECONDARY + OVERFLOW → MobileActionMenu (Actions / ••• menu).
 *   - DESTRUCTIVE → inside MobileActionMenu with separator, never accidental.
 *   - Touch targets ≥44px (button.tsx base class enforces this on mobile).
 *   - No valid action disappears solely via `hidden md:flex` without a mobile equivalent.
 */

/**
 * Splits a flat list of prioritized actions into tiers for rendering.
 *
 * Usage at call site:
 *   const { primary, secondary, overflow, destructive } = splitActionTiers(actions)
 */
export function splitActionTiers(actions: PrioritizedAction[]) {
  return {
    primary: actions.filter(a => a.tier === 'primary'),
    secondary: actions.filter(a => a.tier === 'secondary'),
    overflow: actions.filter(a => a.tier === 'overflow'),
    destructive: actions.filter(a => a.tier === 'destructive'),
    terminal: actions.filter(a => a.tier === 'terminal'),
  }
}

/**
 * Convert prioritized action list to MobileActionMenu ActionItem format.
 * SECONDARY and OVERFLOW actions are merged into the mobile menu.
 * DESTRUCTIVE gets the destructive flag and a separator prepended.
 * PRIMARY is rendered separately as a visible CTA — not included here.
 */
export function toMobileMenuActions(actions: PrioritizedAction[]): Array<{
  key: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  separator?: boolean
}> {
  const result: ReturnType<typeof toMobileMenuActions> = []
  const secondary = actions.filter(a => a.tier === 'secondary' || a.tier === 'overflow')
  const destructive = actions.filter(a => a.tier === 'destructive')

  for (const action of secondary) {
    result.push({
      key: action.key,
      label: action.label,
      icon: action.icon,
      onClick: action.onClick,
      disabled: action.disabled,
    })
  }

  if (destructive.length > 0 && result.length > 0) {
    result.push({ key: '__sep__', label: '', separator: true })
  }

  for (const action of destructive) {
    result.push({
      key: action.key,
      label: action.label,
      icon: action.icon,
      onClick: action.onClick,
      disabled: action.disabled,
      destructive: true,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// SURFACE-LEVEL ACTION BUILDERS
// These are pure functions — they describe what actions SHOULD exist for a
// given state. Rendering is handled by components using the contract above.
// All permission checks are performed by callers before calling these.
// ---------------------------------------------------------------------------

/**
 * Staffing approval row actions.
 * Approve is PRIMARY for pending; Reject is DESTRUCTIVE (never primary).
 * Remove assignment is OVERFLOW.
 */
export type StaffingApprovalActionKey = 'approve' | 'reject' | 'remove'

export interface StaffingApprovalActionsInput {
  isBusy: boolean
  canRemove: boolean
  canApprove: boolean
  canReject: boolean
}

export function buildStaffingApprovalActions(
  input: StaffingApprovalActionsInput,
  handlers: Record<StaffingApprovalActionKey, (() => void) | undefined>,
  labels: Record<StaffingApprovalActionKey, string>,
): PrioritizedAction[] {
  const result: PrioritizedAction[] = []

  if (input.canApprove && handlers.approve) {
    result.push({
      key: 'approve',
      label: labels.approve,
      tier: 'primary',
      onClick: handlers.approve,
      disabled: input.isBusy,
      testId: 'action-approve',
    })
  }

  if (input.canReject && handlers.reject) {
    result.push({
      key: 'reject',
      label: labels.reject,
      tier: 'destructive',
      onClick: handlers.reject,
      disabled: input.isBusy,
      testId: 'action-reject',
    })
  }

  if (input.canRemove && handlers.remove) {
    result.push({
      key: 'remove',
      label: labels.remove,
      tier: 'overflow',
      onClick: handlers.remove,
      disabled: input.isBusy,
      testId: 'action-remove',
    })
  }

  return result
}

/**
 * Swap row/card actions.
 * Uses getSwapUiActions() contract — do not replicate logic here.
 * Accept/Approve = PRIMARY (positive resolution forward action).
 * Counterpart Reject / Reviewer Reject = DESTRUCTIVE.
 * Cancel = DESTRUCTIVE (requester-initiated withdrawal).
 * View Details = SECONDARY always.
 */
export interface SwapActionFlags {
  showAccept: boolean
  showCounterpartReject: boolean
  showApprove: boolean
  showReviewerReject: boolean
  showCancel: boolean
}

export interface SwapActionHandlers {
  onViewDetails: () => void
  onAccept?: () => void
  onCounterpartReject?: () => void
  onApprove?: () => void
  onReviewerReject?: () => void
  onCancel?: () => void
}

export function buildSwapActions(
  flags: SwapActionFlags,
  handlers: SwapActionHandlers,
  labels: {
    viewDetails: string
    accept: string
    reject: string
    approve: string
    reviewerReject: string
    cancel: string
  },
): PrioritizedAction[] {
  const result: PrioritizedAction[] = []

  // View details is always secondary
  result.push({
    key: 'view-details',
    label: labels.viewDetails,
    tier: 'secondary',
    onClick: handlers.onViewDetails,
    testId: 'action-view-details',
  })

  // Accept (counterpart positive response) = PRIMARY. The state resolver keeps
  // this mutually exclusive with approval; retain the first valid forward
  // action if stale/conflicting flags ever arrive.
  let hasPrimaryForwardAction = false
  if (flags.showAccept && handlers.onAccept) {
    result.push({
      key: 'accept',
      label: labels.accept,
      tier: 'primary',
      onClick: handlers.onAccept,
      testId: 'action-accept',
    })
    hasPrimaryForwardAction = true
  }

  // Approve (reviewer final approval) = PRIMARY
  if (flags.showApprove && handlers.onApprove && !hasPrimaryForwardAction) {
    result.push({
      key: 'approve',
      label: labels.approve,
      tier: 'primary',
      onClick: handlers.onApprove,
      testId: 'action-approve',
    })
  }

  // Counterpart reject = DESTRUCTIVE
  if (flags.showCounterpartReject && handlers.onCounterpartReject) {
    result.push({
      key: 'counterpart-reject',
      label: labels.reject,
      tier: 'destructive',
      onClick: handlers.onCounterpartReject,
      testId: 'action-counterpart-reject',
    })
  }

  // Reviewer reject = DESTRUCTIVE
  if (flags.showReviewerReject && handlers.onReviewerReject) {
    result.push({
      key: 'reviewer-reject',
      label: labels.reviewerReject,
      tier: 'destructive',
      onClick: handlers.onReviewerReject,
      testId: 'action-reviewer-reject',
    })
  }

  // Requester cancel = DESTRUCTIVE
  if (flags.showCancel && handlers.onCancel) {
    result.push({
      key: 'cancel',
      label: labels.cancel,
      tier: 'destructive',
      onClick: handlers.onCancel,
      testId: 'action-cancel',
    })
  }

  return result
}

/**
 * Report row actions.
 *
 * Canonical ReportStatus states: draft | in_review | confirmed | reopened | archived
 *
 * - archived  → terminal for ALL mutation actions (no archive, no delete)
 * - confirmed → read-only metrics; no fabricated Review CTA
 * - reopened  → treated as editable (metrics_confirmed may still be true
 *               from prior confirmation; status wins over that field)
 * - draft / in_review → unconfirmed; delete allowed with permission
 *
 * No Review CTA is generated here — that is a detail-modal concern.
 * View = SECONDARY (always). Export = OVERFLOW (permission-gated).
 * Delete/Archive = DESTRUCTIVE; never shown for archived reports.
 */
export type ReportStatus = 'draft' | 'in_review' | 'confirmed' | 'reopened' | 'archived'

export interface ReportActionInput {
  /** Canonical workflow status — authoritative gate for mutation actions. */
  status: ReportStatus
  /** Permission gate: actor may delete/archive this report. */
  canDelete: boolean
  /** Permission gate: actor may export this report. */
  canExport: boolean
}

export function buildReportActions(
  input: ReportActionInput,
  handlers: {
    onView: () => void
    onDelete?: () => void
    onExport?: () => void
  },
  labels: {
    view: string
    archive: string
    delete: string
    export: string
  },
  icons?: {
    view?: React.ReactNode
    archive?: React.ReactNode
    delete?: React.ReactNode
    export?: React.ReactNode
  }
): PrioritizedAction[] {
  const result: PrioritizedAction[] = []

  const isArchived = input.status === 'archived'
  const isConfirmedOrReopened = input.status === 'confirmed' || input.status === 'reopened'

  // View is SECONDARY (always accessible regardless of status)
  result.push({
    key: 'view',
    label: labels.view,
    tier: 'secondary',
    icon: icons?.view,
    onClick: handlers.onView,
    testId: 'action-view-report',
  })

  // Export is OVERFLOW (permission-gated; available on all non-archived states)
  if (!isArchived && input.canExport && handlers.onExport) {
    result.push({
      key: 'export',
      label: labels.export,
      tier: 'overflow',
      icon: icons?.export,
      onClick: handlers.onExport,
      testId: 'action-export-report',
    })
  }

  // Archive/Delete = DESTRUCTIVE
  // - archived reports: no mutation action (terminal)
  // - confirmed/reopened: label is 'archive' (existing service contract)
  // - draft/in_review: label is 'delete'
  if (!isArchived && input.canDelete && handlers.onDelete) {
    result.push({
      key: 'delete',
      label: isConfirmedOrReopened ? labels.archive : labels.delete,
      tier: 'destructive',
      icon: isConfirmedOrReopened ? icons?.archive : icons?.delete,
      onClick: handlers.onDelete,
      testId: 'action-delete-report',
    })
  }

  return result
}

/**
 * Shift row actions (CRUD).
 * View = SECONDARY. Edit = SECONDARY. Duplicate = OVERFLOW. Delete = DESTRUCTIVE.
 * If Edit is allowed, we'll keep it visible on desktop as SECONDARY.
 */
export interface ShiftActionInput {
  canEdit: boolean
  canDelete: boolean
}

export function buildShiftActions(
  input: ShiftActionInput,
  handlers: {
    onView: () => void
    onEdit?: () => void
    onDuplicate?: () => void
    onDelete?: () => void
  },
  labels: {
    view: string
    edit: string
    duplicate: string
    delete: string
  },
  icons?: {
    view?: React.ReactNode
    edit?: React.ReactNode
    duplicate?: React.ReactNode
    delete?: React.ReactNode
  }
): PrioritizedAction[] {
  const result: PrioritizedAction[] = []

  // View is always SECONDARY
  result.push({
    key: 'view',
    label: labels.view,
    tier: 'secondary',
    icon: icons?.view,
    onClick: handlers.onView,
    testId: 'action-view-shift',
  })

  // Edit is SECONDARY (only when both permitted AND handler provided)
  if (input.canEdit && handlers.onEdit) {
    result.push({
      key: 'edit',
      label: labels.edit,
      tier: 'secondary',
      icon: icons?.edit,
      onClick: handlers.onEdit,
      testId: 'action-edit-shift',
    })
  }

  // Duplicate is OVERFLOW
  if (handlers.onDuplicate) {
    result.push({
      key: 'duplicate',
      label: labels.duplicate,
      tier: 'overflow',
      icon: icons?.duplicate,
      onClick: handlers.onDuplicate,
      testId: 'action-duplicate-shift',
    })
  }

  // Delete is DESTRUCTIVE (only when both permitted AND handler provided)
  if (input.canDelete && handlers.onDelete) {
    result.push({
      key: 'delete',
      label: labels.delete,
      tier: 'destructive',
      icon: icons?.delete,
      onClick: handlers.onDelete,
      testId: 'action-delete-shift',
    })
  }

  return result
}
