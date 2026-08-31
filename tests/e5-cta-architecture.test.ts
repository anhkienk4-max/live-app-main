import assert from 'node:assert/strict'
import test from 'node:test'
import type { User } from '../lib/types/database.types.ts'
import { getRoleUxSurfaceConfig } from '../lib/ui/role-ux.ts'
import {
  buildReportActions,
  buildSwapActions,
  calendarCtaHref,
  splitActionTiers,
  toMobileMenuActions,
} from '../lib/ui/action-priority.ts'

const user = (system_permission: User['system_permission']): Pick<User, 'role' | 'system_permission'> => ({
  role: system_permission === 'member' ? 'staff' : system_permission,
  system_permission,
})

test('role-aware CTA visibility follows canonical capabilities', () => {
  assert.equal(getRoleUxSurfaceConfig(user('admin'), 'staff').primaryAction, 'manage')
  assert.equal(getRoleUxSurfaceConfig(user('leader'), 'staff').primaryAction, null)
  assert.equal(getRoleUxSurfaceConfig(user('leader'), 'staffing').primaryAction, 'assign')
  assert.equal(getRoleUxSurfaceConfig(user('member'), 'openShifts').primaryAction, 'register')
  assert.equal(getRoleUxSurfaceConfig(user('member'), 'staff').canAccess, false)
})

test('member dashboard CTAs land on the intended calendar workflow', () => {
  assert.equal(calendarCtaHref('mine'), '/calendar?tab=mine')
  assert.equal(calendarCtaHref('open'), '/calendar?tab=open')
})

test('swap CTA hierarchy exposes one forward primary action', () => {
  const actions = buildSwapActions(
    { showAccept: true, showCounterpartReject: true, showApprove: true, showReviewerReject: true, showCancel: true },
    {
      onViewDetails: () => {},
      onAccept: () => {},
      onCounterpartReject: () => {},
      onApprove: () => {},
      onReviewerReject: () => {},
      onCancel: () => {},
    },
    { viewDetails: 'View', accept: 'Accept', reject: 'Reject', approve: 'Approve', reviewerReject: 'Reject', cancel: 'Cancel' },
  )
  assert.equal(splitActionTiers(actions).primary.length, 1)
  assert.equal(splitActionTiers(actions).primary[0].key, 'accept')
  assert.equal(splitActionTiers(actions).destructive.length, 3)
  const mobile = toMobileMenuActions(actions)
  assert.equal(mobile.some(action => action.key === 'accept'), false)
  assert.equal(mobile.some(action => action.destructive), true)
})

test('terminal report state has no mutation CTA', () => {
  const actions = buildReportActions(
    { status: 'archived', canDelete: true, canExport: true },
    { onView: () => {}, onDelete: () => {}, onExport: () => {} },
    { view: 'View', archive: 'Archive', delete: 'Delete', export: 'Export' },
  )
  assert.deepEqual(actions.map(action => action.key), ['view'])
})
