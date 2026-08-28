import assert from 'node:assert/strict'
import test from 'node:test'

import { getSwapStatusPresentation, getSwapUiActions } from '../lib/utils/swapUi.ts'
import type { SwapRequest, User } from '../lib/types/database.types.ts'

const baseSwap = (status: SwapRequest['status']): SwapRequest => ({
  id: 'swap-1',
  shift_id: 'shift-1',
  requester_id: 'requester-1',
  replacement_staff_id: 'replacement-1',
  reason: 'Need replacement coverage',
  mode: 'replacement',
  status,
  created_at: '2032-01-01T00:00:00Z',
  updated_at: '2032-01-01T00:00:00Z',
})

const member: User = {
  id: 'replacement-1',
  email: 'replacement@example.test',
  full_name: 'Replacement',
  role: 'staff',
  system_permission: 'member',
  operational_roles: ['host'],
  status: 'active',
  account_status: 'active',
  join_date: '2032-01-01',
  created_at: '2032-01-01T00:00:00Z',
  updated_at: '2032-01-01T00:00:00Z',
}

const admin: User = { ...member, id: 'admin-1', system_permission: 'admin', role: 'admin' }

function actionNames(actions: ReturnType<typeof getSwapUiActions>) {
  return Object.entries(actions).filter(([, visible]) => visible).map(([name]) => name)
}

test('completed status uses successful presentation', () => {
  assert.deepEqual(getSwapStatusPresentation('completed'), { label: 'completed', tone: 'success' })
})

test('completed swap has no mutation actions', () => {
  assert.deepEqual(actionNames(getSwapUiActions(baseSwap('completed'), admin)), [])
})

test('dual-role replacement Admin gets only participant actions while pending', () => {
  const dualRoleAdmin: User = { ...admin, id: 'replacement-1' }
  assert.deepEqual(actionNames(getSwapUiActions(baseSwap('pending'), dualRoleAdmin)), ['showAccept', 'showCounterpartReject'])
})

test('pending and accepted actions belong to their respective actors', () => {
  const pending = baseSwap('pending')
  assert.deepEqual(actionNames(getSwapUiActions(pending, member)), ['showAccept', 'showCounterpartReject'])
  assert.deepEqual(actionNames(getSwapUiActions(pending, admin)), [])

  const accepted = baseSwap('accepted')
  assert.deepEqual(actionNames(getSwapUiActions(accepted, member)), [])
  assert.deepEqual(actionNames(getSwapUiActions(accepted, admin)), ['showApprove', 'showReviewerReject'])
})
