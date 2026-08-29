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

test('Action Priority - splitActionTiers groups correctly', () => {
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

test('Action Priority - toMobileMenuActions excludes primary, separates destructive', () => {
  const actions: PrioritizedAction[] = [
    { key: '1', label: 'Primary', tier: 'primary' },
    { key: '2', label: 'Secondary', tier: 'secondary' },
    { key: '3', label: 'Overflow', tier: 'overflow' },
    { key: '4', label: 'Destructive', tier: 'destructive' },
  ]
  
  const mobileMenu = toMobileMenuActions(actions)
  
  // Excludes primary, merges secondary + overflow + separator + destructive
  assert.strictEqual(mobileMenu.length, 4) // secondary, overflow, separator, destructive
  assert.strictEqual(mobileMenu[0].key, '2')
  assert.strictEqual(mobileMenu[1].key, '3')
  assert.strictEqual(mobileMenu[2].separator, true)
  assert.strictEqual(mobileMenu[3].key, '4')
  assert.strictEqual(mobileMenu[3].destructive, true)
})

test('Action Priority - toMobileMenuActions does not add separator if no standard actions precede destructive', () => {
  const actions: PrioritizedAction[] = [
    { key: '1', label: 'Primary', tier: 'primary' },
    { key: '4', label: 'Destructive', tier: 'destructive' },
  ]
  
  const mobileMenu = toMobileMenuActions(actions)
  
  // Excludes primary, only destructive (no separator needed at top)
  assert.strictEqual(mobileMenu.length, 1)
  assert.strictEqual(mobileMenu[0].key, '4')
  assert.strictEqual(mobileMenu[0].destructive, true)
})

test('buildStaffingApprovalActions - enforces priority rules', () => {
  const actions = buildStaffingApprovalActions(
    { isBusy: false, canApprove: true, canReject: true, canRemove: true },
    { approve: () => {}, reject: () => {}, remove: () => {} },
    { approve: 'Approve', reject: 'Reject', remove: 'Remove' }
  )
  
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 1)
  assert.strictEqual(tiers.primary[0].key, 'approve') // Approve is PRIMARY
  
  assert.strictEqual(tiers.destructive.length, 1)
  assert.strictEqual(tiers.destructive[0].key, 'reject') // Reject is DESTRUCTIVE
  
  assert.strictEqual(tiers.overflow.length, 1)
  assert.strictEqual(tiers.overflow[0].key, 'remove') // Remove is OVERFLOW
})

test('buildSwapActions - Accept/Approve are primary, rejects are destructive', () => {
  const actions = buildSwapActions(
    { showAccept: true, showCounterpartReject: true, showApprove: false, showReviewerReject: false, showCancel: true },
    { onViewDetails: () => {} },
    { viewDetails: 'View', accept: 'Accept', reject: 'Reject', approve: 'Approve', reviewerReject: 'Reject', cancel: 'Cancel' }
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

test('buildReportActions - Review is primary when unconfirmed, otherwise View is secondary', () => {
  const actionsReview = buildReportActions(
    { canSubmit: false, canReview: true, canDelete: false, canExport: false, isConfirmed: false, isDraft: false },
    { onView: () => {} },
    { view: 'View', reviewReport: 'Review', archive: 'Archive', delete: 'Delete', export: 'Export' }
  )
  
  const tiersReview = splitActionTiers(actionsReview)
  assert.strictEqual(tiersReview.primary.length, 1)
  assert.strictEqual(tiersReview.primary[0].key, 'review')
  assert.strictEqual(tiersReview.secondary.length, 1)
  assert.strictEqual(tiersReview.secondary[0].key, 'view')

  const actionsConfirmed = buildReportActions(
    { canSubmit: false, canReview: true, canDelete: false, canExport: false, isConfirmed: true, isDraft: false },
    { onView: () => {} },
    { view: 'View', reviewReport: 'Review', archive: 'Archive', delete: 'Delete', export: 'Export' }
  )
  
  const tiersConfirmed = splitActionTiers(actionsConfirmed)
  assert.strictEqual(tiersConfirmed.primary.length, 0) // No primary action when confirmed
  assert.strictEqual(tiersConfirmed.secondary.length, 1)
  assert.strictEqual(tiersConfirmed.secondary[0].key, 'view')
})

test('buildShiftActions - matches expected hierarchy', () => {
  const actions = buildShiftActions(
    { canEdit: true, canDelete: true },
    { onView: () => {}, onDuplicate: () => {} },
    { view: 'View', edit: 'Edit', duplicate: 'Dup', delete: 'Del' }
  )
  
  const tiers = splitActionTiers(actions)
  assert.strictEqual(tiers.primary.length, 0)
  assert.strictEqual(tiers.secondary.length, 2) // view, edit
  assert.strictEqual(tiers.overflow.length, 1) // duplicate
  assert.strictEqual(tiers.destructive.length, 1) // delete
})
