/**
 * E4 Action Priority Contract Tests
 *
 * Tests the CURRENT production contract for all builder functions and helpers.
 * No fabricated Review CTA. No inert actions (flag true + handler undefined).
 * All assertions match the live code in lib/ui/action-priority.ts.
 */

import assert from 'node:assert'
import { test } from 'node:test'
import {
  splitActionTiers,
  toMobileMenuActions,
  buildStaffingApprovalActions,
  buildSwapActions,
  buildReportActions,
  buildShiftActions,
  type PrioritizedAction,
} from '../lib/ui/action-priority'

// ---------------------------------------------------------------------------
// A. splitActionTiers + toMobileMenuActions
// ---------------------------------------------------------------------------

test('A1: splitActionTiers groups all four tiers correctly', () => {
  const actions: PrioritizedAction[] = [
    { key: '1', label: 'Primary', tier: 'primary' },
    { key: '2', label: 'Secondary', tier: 'secondary' },
    { key: '3', label: 'Overflow', tier: 'overflow' },
    { key: '4', label: 'Destructive', tier: 'destructive' },
  ]
  const tiers = splitActionTiers(actions)

  assert.strictEqual(tiers.primary.length, 1)
  assert.strictEqual(tiers.primary[0].key, '1')
  assert.strictEqual(tiers.secondary.length, 1)
  assert.strictEqual(tiers.secondary[0].key, '2')
  assert.strictEqual(tiers.overflow.length, 1)
  assert.strictEqual(tiers.overflow[0].key, '3')
  assert.strictEqual(tiers.destructive.length, 1)
  assert.strictEqual(tiers.destructive[0].key, '4')
})

test('A2: toMobileMenuActions excludes primary', () => {
  const actions: PrioritizedAction[] = [
    { key: 'p', label: 'Primary', tier: 'primary' },
    { key: 's', label: 'Secondary', tier: 'secondary' },
    { key: 'o', label: 'Overflow', tier: 'overflow' },
    { key: 'd', label: 'Destructive', tier: 'destructive' },
  ]
  const mobile = toMobileMenuActions(actions)

  // primary is NOT in mobile menu
  assert.ok(!mobile.some(a => a.key === 'p'), 'primary must not appear in mobile menu')
})

test('A3: toMobileMenuActions includes secondary + overflow + separator + destructive', () => {
  const actions: PrioritizedAction[] = [
    { key: 'p', label: 'Primary', tier: 'primary' },
    { key: 's', label: 'Secondary', tier: 'secondary' },
    { key: 'o', label: 'Overflow', tier: 'overflow' },
    { key: 'd', label: 'Destructive', tier: 'destructive' },
  ]
  const mobile = toMobileMenuActions(actions)

  // secondary, overflow, separator, destructive = 4 items
  assert.strictEqual(mobile.length, 4)
  assert.strictEqual(mobile[0].key, 's')
  assert.strictEqual(mobile[1].key, 'o')
  assert.strictEqual(mobile[2].separator, true)
  assert.strictEqual(mobile[3].key, 'd')
  assert.strictEqual(mobile[3].destructive, true)
})

test('A4: toMobileMenuActions no separator when no standard actions precede destructive', () => {
  const actions: PrioritizedAction[] = [
    { key: 'p', label: 'Primary', tier: 'primary' },
    { key: 'd', label: 'Destructive', tier: 'destructive' },
  ]
  const mobile = toMobileMenuActions(actions)

  // Only destructive, no separator needed at top
  assert.strictEqual(mobile.length, 1)
  assert.strictEqual(mobile[0].key, 'd')
  assert.strictEqual(mobile[0].destructive, true)
})

test('A5: permission-hidden action (never in actions array) must not appear in mobile menu', () => {
  // Simulates a permission-gated action that the builder never emits
  const actions: PrioritizedAction[] = [
    { key: 'view', label: 'View', tier: 'secondary' },
    // 'delete' omitted: permission denied — builder never produced it
  ]
  const mobile = toMobileMenuActions(actions)

  assert.ok(!mobile.some(a => a.key === 'delete'), 'gated action must not reappear in mobile')
  assert.strictEqual(mobile.length, 1)
  assert.strictEqual(mobile[0].key, 'view')
})

// ---------------------------------------------------------------------------
// B. buildStaffingApprovalActions
// ---------------------------------------------------------------------------

test('B1: Staffing - all flags + handlers: approve PRIMARY, reject DESTRUCTIVE, remove OVERFLOW', () => {
  const actions = buildStaffingApprovalActions(
    { isBusy: false, canApprove: true, canReject: true, canRemove: true },
    { approve: () => {}, reject: () => {}, remove: () => {} },
    { approve: 'Approve', reject: 'Reject', remove: 'Remove' },
  )
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 1)
  assert.strictEqual(tiers.primary[0].key, 'approve')
  assert.strictEqual(tiers.destructive.length, 1)
  assert.strictEqual(tiers.destructive[0].key, 'reject')
  assert.strictEqual(tiers.overflow.length, 1)
  assert.strictEqual(tiers.overflow[0].key, 'remove')
})

test('B2: Staffing - canApprove + NO approve handler => no approve action', () => {
  const actions = buildStaffingApprovalActions(
    { isBusy: false, canApprove: true, canReject: false, canRemove: false },
    { approve: undefined, reject: undefined, remove: undefined },
    { approve: 'Approve', reject: 'Reject', remove: 'Remove' },
  )
  assert.strictEqual(actions.length, 0)
})

test('B3: Staffing - canReject + NO reject handler => no reject action', () => {
  const actions = buildStaffingApprovalActions(
    { isBusy: false, canApprove: false, canReject: true, canRemove: false },
    { approve: undefined, reject: undefined, remove: undefined },
    { approve: 'Approve', reject: 'Reject', remove: 'Remove' },
  )
  assert.strictEqual(actions.length, 0)
})

test('B4: Staffing - canRemove + NO remove handler => no remove action', () => {
  const actions = buildStaffingApprovalActions(
    { isBusy: false, canApprove: false, canReject: false, canRemove: true },
    { approve: undefined, reject: undefined, remove: undefined },
    { approve: 'Approve', reject: 'Reject', remove: 'Remove' },
  )
  assert.strictEqual(actions.length, 0)
})

// ---------------------------------------------------------------------------
// C. buildSwapActions
// ---------------------------------------------------------------------------

const swapLabels = {
  viewDetails: 'View',
  accept: 'Accept',
  reject: 'Reject',
  approve: 'Approve',
  reviewerReject: 'Reject',
  cancel: 'Cancel',
}

test('C1: Swap - valid flag + handler => action exists', () => {
  const actions = buildSwapActions(
    { showAccept: true, showCounterpartReject: true, showApprove: false, showReviewerReject: false, showCancel: true },
    {
      onViewDetails: () => {},
      onAccept: () => {},
      onCounterpartReject: () => {},
      onCancel: () => {},
    },
    swapLabels,
  )
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 1)
  assert.strictEqual(tiers.primary[0].key, 'accept')
  assert.strictEqual(tiers.secondary.length, 1)
  assert.strictEqual(tiers.secondary[0].key, 'view-details')
  assert.strictEqual(tiers.destructive.length, 2)
  assert.strictEqual(tiers.destructive[0].key, 'counterpart-reject')
  assert.strictEqual(tiers.destructive[1].key, 'cancel')
})

test('C2: Swap - valid flag + missing handler => action absent (no inert CTA)', () => {
  const actions = buildSwapActions(
    { showAccept: true, showCounterpartReject: true, showApprove: true, showReviewerReject: true, showCancel: true },
    { onViewDetails: () => {} }, // all optional handlers omitted
    swapLabels,
  )
  // Only view-details should exist; no inert mutation actions
  assert.strictEqual(actions.length, 1)
  assert.strictEqual(actions[0].key, 'view-details')
})

test('C3: Swap - all flags false => only View Details (SECONDARY)', () => {
  const actions = buildSwapActions(
    { showAccept: false, showCounterpartReject: false, showApprove: false, showReviewerReject: false, showCancel: false },
    { onViewDetails: () => {} },
    swapLabels,
  )
  assert.strictEqual(actions.length, 1)
  assert.strictEqual(actions[0].key, 'view-details')
  assert.strictEqual(actions[0].tier, 'secondary')
})

test('C4: Swap - no fake mutation CTA when no workflow flags are active', () => {
  const actions = buildSwapActions(
    { showAccept: false, showCounterpartReject: false, showApprove: false, showReviewerReject: false, showCancel: false },
    { onViewDetails: () => {} },
    swapLabels,
  )
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 0)
  assert.strictEqual(tiers.destructive.length, 0)
})

test('C5: Swap - Approve is PRIMARY (reviewer flow)', () => {
  const actions = buildSwapActions(
    { showAccept: false, showCounterpartReject: false, showApprove: true, showReviewerReject: true, showCancel: false },
    { onViewDetails: () => {}, onApprove: () => {}, onReviewerReject: () => {} },
    swapLabels,
  )
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 1)
  assert.strictEqual(tiers.primary[0].key, 'approve')
  assert.strictEqual(tiers.destructive.length, 1)
  assert.strictEqual(tiers.destructive[0].key, 'reviewer-reject')
})

// ---------------------------------------------------------------------------
// D. buildReportActions
// ---------------------------------------------------------------------------

const reportLabels = { view: 'View', archive: 'Archive', delete: 'Delete', export: 'Export' }

test('D1: Reports - no fabricated Review action; View Details is SECONDARY', () => {
  const actions = buildReportActions(
    { status: 'draft', canDelete: false, canExport: false },
    { onView: () => {} },
    reportLabels,
  )
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 0, 'no fabricated Review primary action')
  assert.strictEqual(tiers.secondary.length, 1)
  assert.strictEqual(tiers.secondary[0].key, 'view')
})

test('D2: Reports - Export only when permission + handler provided', () => {
  const withExport = buildReportActions(
    { status: 'draft', canDelete: false, canExport: true },
    { onView: () => {}, onExport: () => {} },
    reportLabels,
  )
  assert.ok(withExport.some(a => a.key === 'export'), 'export present when permitted + handler')

  const withoutHandler = buildReportActions(
    { status: 'draft', canDelete: false, canExport: true },
    { onView: () => {} }, // no onExport handler
    reportLabels,
  )
  assert.ok(!withoutHandler.some(a => a.key === 'export'), 'export absent without handler')

  const withoutPerm = buildReportActions(
    { status: 'draft', canDelete: false, canExport: false },
    { onView: () => {}, onExport: () => {} },
    reportLabels,
  )
  assert.ok(!withoutPerm.some(a => a.key === 'export'), 'export absent without permission')
})

test('D3: Reports - destructive action only when valid state + permission + handler', () => {
  // draft + permission + handler => delete action present
  const draftWithPerm = buildReportActions(
    { status: 'draft', canDelete: true, canExport: false },
    { onView: () => {}, onDelete: () => {} },
    reportLabels,
  )
  const deleteSeen = draftWithPerm.find(a => a.key === 'delete')
  assert.ok(deleteSeen, 'delete action present for draft with permission + handler')
  assert.strictEqual(deleteSeen!.label, 'Delete')

  // draft + permission + NO handler => no action
  const draftNoHandler = buildReportActions(
    { status: 'draft', canDelete: true, canExport: false },
    { onView: () => {} },
    reportLabels,
  )
  assert.ok(!draftNoHandler.some(a => a.key === 'delete'), 'no delete without handler')

  // draft + NO permission => no action
  const draftNoPerm = buildReportActions(
    { status: 'draft', canDelete: false, canExport: false },
    { onView: () => {}, onDelete: () => {} },
    reportLabels,
  )
  assert.ok(!draftNoPerm.some(a => a.key === 'delete'), 'no delete without permission')
})

test('D4: Reports - confirmed status uses archive label', () => {
  const actions = buildReportActions(
    { status: 'confirmed', canDelete: true, canExport: false },
    { onView: () => {}, onDelete: () => {} },
    reportLabels,
  )
  const del = actions.find(a => a.key === 'delete')
  assert.ok(del, 'action present for confirmed report with permission + handler')
  assert.strictEqual(del!.label, 'Archive', 'confirmed report uses archive label')
})

test('D5: Reports - archived status => terminal; no mutation actions', () => {
  const actions = buildReportActions(
    { status: 'archived', canDelete: true, canExport: true },
    { onView: () => {}, onDelete: () => {}, onExport: () => {} },
    reportLabels,
  )
  assert.ok(!actions.some(a => a.key === 'delete'), 'no delete for archived report')
  assert.ok(!actions.some(a => a.key === 'export'), 'no export for archived report')
  // View remains
  assert.ok(actions.some(a => a.key === 'view'), 'view stays for archived report')
})

test('D6: Reports - reopened status uses archive label (not confirmed but metrics may remain)', () => {
  const actions = buildReportActions(
    { status: 'reopened', canDelete: true, canExport: false },
    { onView: () => {}, onDelete: () => {} },
    reportLabels,
  )
  const del = actions.find(a => a.key === 'delete')
  assert.ok(del, 'action present for reopened report')
  assert.strictEqual(del!.label, 'Archive', 'reopened uses archive label')
})

test('D7: Reports - in_review status uses delete label', () => {
  const actions = buildReportActions(
    { status: 'in_review', canDelete: true, canExport: false },
    { onView: () => {}, onDelete: () => {} },
    reportLabels,
  )
  const del = actions.find(a => a.key === 'delete')
  assert.ok(del, 'action present for in_review report')
  assert.strictEqual(del!.label, 'Delete', 'in_review uses delete label')
})

// ---------------------------------------------------------------------------
// E. buildShiftActions
// ---------------------------------------------------------------------------

test('E1: Shift - full permissions + all handlers: view + edit SECONDARY, duplicate OVERFLOW, delete DESTRUCTIVE', () => {
  const actions = buildShiftActions(
    { canEdit: true, canDelete: true },
    { onView: () => {}, onEdit: () => {}, onDuplicate: () => {}, onDelete: () => {} },
    { view: 'View', edit: 'Edit', duplicate: 'Dup', delete: 'Del' },
  )
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 0)
  assert.strictEqual(tiers.secondary.length, 2) // view + edit
  assert.ok(tiers.secondary.some(a => a.key === 'view'))
  assert.ok(tiers.secondary.some(a => a.key === 'edit'))
  assert.strictEqual(tiers.overflow.length, 1) // duplicate
  assert.strictEqual(tiers.overflow[0].key, 'duplicate')
  assert.strictEqual(tiers.destructive.length, 1) // delete
  assert.strictEqual(tiers.destructive[0].key, 'delete')
})

test('E2: Shift - canEdit=true + NO onEdit handler => NO Edit action (no inert CTA)', () => {
  const actions = buildShiftActions(
    { canEdit: true, canDelete: false },
    { onView: () => {} }, // onEdit deliberately absent
    { view: 'View', edit: 'Edit', duplicate: 'Dup', delete: 'Del' },
  )
  assert.ok(!actions.some(a => a.key === 'edit'), 'edit must not appear without handler')
})

test('E3: Shift - canDelete=true + NO onDelete handler => NO Delete action (no inert CTA)', () => {
  const actions = buildShiftActions(
    { canEdit: false, canDelete: true },
    { onView: () => {} }, // onDelete deliberately absent
    { view: 'View', edit: 'Edit', duplicate: 'Dup', delete: 'Del' },
  )
  assert.ok(!actions.some(a => a.key === 'delete'), 'delete must not appear without handler')
})

test('E4: Shift - duplicate only when handler provided', () => {
  const withDup = buildShiftActions(
    { canEdit: false, canDelete: false },
    { onView: () => {}, onDuplicate: () => {} },
    { view: 'View', edit: 'Edit', duplicate: 'Dup', delete: 'Del' },
  )
  assert.ok(withDup.some(a => a.key === 'duplicate'), 'duplicate present with handler')

  const noDup = buildShiftActions(
    { canEdit: false, canDelete: false },
    { onView: () => {} }, // no onDuplicate
    { view: 'View', edit: 'Edit', duplicate: 'Dup', delete: 'Del' },
  )
  assert.ok(!noDup.some(a => a.key === 'duplicate'), 'duplicate absent without handler')
})

// ---------------------------------------------------------------------------
// F. Mobile primary exclusion cross-check
// ---------------------------------------------------------------------------

test('F1: Mobile - primary action never appears in mobile Actions menu', () => {
  // Simulate a swap card with accept as primary
  const actions = buildSwapActions(
    { showAccept: true, showCounterpartReject: false, showApprove: false, showReviewerReject: false, showCancel: false },
    { onViewDetails: () => {}, onAccept: () => {} },
    swapLabels,
  )
  const mobile = toMobileMenuActions(actions)
  assert.ok(!mobile.some(a => a.key === 'accept'), 'primary accept must not appear in mobile menu')
  assert.ok(mobile.some(a => a.key === 'view-details'), 'view-details appears in mobile menu')
})

test('F2: Mobile - destructive action appears with destructive flag and separator', () => {
  const actions = buildSwapActions(
    { showAccept: false, showCounterpartReject: false, showApprove: false, showReviewerReject: false, showCancel: true },
    { onViewDetails: () => {}, onCancel: () => {} },
    swapLabels,
  )
  const mobile = toMobileMenuActions(actions)
  // view-details (secondary), separator, cancel (destructive)
  assert.strictEqual(mobile.length, 3)
  assert.strictEqual(mobile[1].separator, true)
  assert.strictEqual(mobile[2].key, 'cancel')
  assert.strictEqual(mobile[2].destructive, true)
})
