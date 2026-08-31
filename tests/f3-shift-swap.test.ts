import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { getSwapStatusPresentation, getSwapUiActions } from '../lib/utils/swapUi.ts'
import type { SwapRequest, User } from '../lib/types/database.types.ts'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

const member = (id: string, permission: User['system_permission'] = 'member'): User => ({
  id,
  email: `${id}@example.test`,
  full_name: id,
  role: permission === 'member' ? 'staff' : permission,
  system_permission: permission,
  operational_roles: ['host'],
  status: 'active',
  account_status: 'active',
  join_date: '2032-01-01',
  created_at: '2032-01-01T00:00:00Z',
  updated_at: '2032-01-01T00:00:00Z',
})

const swap = (status: SwapRequest['status'], mode: NonNullable<SwapRequest['mode']> = 'replacement'): SwapRequest => ({
  id: 'swap-1',
  shift_id: 'shift-1',
  source_shift_id: 'shift-1',
  target_shift_id: mode === 'exchange' ? 'shift-2' : null,
  requester_id: 'requester-1',
  source_registration_id: 'registration-1',
  counterpart_registration_id: mode === 'exchange' ? 'registration-2' : null,
  counterpart_id: mode === 'exchange' ? 'counterpart-1' : null,
  replacement_staff_id: mode === 'replacement' ? 'replacement-1' : undefined,
  operational_role: 'host',
  reason: 'Coverage',
  mode,
  status,
  created_at: '2032-01-01T00:00:00Z',
  updated_at: '2032-01-01T00:00:00Z',
})

test('F3 keeps the two creatable swap flows and explicit canonical IDs', () => {
  const dialog = source('components/features/swaps/SwapRequestDialog.tsx')
  assert.match(dialog, /type CreatableSwapMode = 'replacement' \| 'exchange'/)
  assert.match(dialog, /source_registration_id: sourceRegistration\.id/)
  assert.match(dialog, /counterpart_registration_id: counterpartId/)
  assert.doesNotMatch(dialog, /mode:\s*['"]move['"]/)
})

test('F3 renders clear source and selected target context', () => {
  const dialog = source('components/features/swaps/SwapRequestDialog.tsx')
  const detail = source('components/features/swaps/SwapDetailModal.tsx')
  assert.match(dialog, /data-testid="swap-source-context"/)
  assert.match(dialog, /data-testid="swap-submit"/)
  assert.match(detail, /data-testid="swap-target-shift"/)
  assert.match(detail, /data-testid="swap-action-context"/)
})

test('F3 status presentation is human-readable and terminal states remain read-only', () => {
  assert.deepEqual(getSwapStatusPresentation('pending'), { label: 'pending', tone: 'warning' })
  assert.deepEqual(getSwapStatusPresentation('accepted'), { label: 'accepted', tone: 'info' })
  assert.deepEqual(getSwapStatusPresentation('completed'), { label: 'completed', tone: 'success' })
  const terminal = swap('completed')
  assert.deepEqual(getSwapUiActions(terminal, member('replacement-1')), {
    showAccept: false,
    showCounterpartReject: false,
    showApprove: false,
    showReviewerReject: false,
    showCancel: false,
  })
})

test('F3 action ownership distinguishes participant, reviewer, and requester', () => {
  const pending = swap('pending')
  assert.equal(getSwapUiActions(pending, member('replacement-1')).showAccept, true)
  assert.equal(getSwapUiActions(pending, member('requester-1')).showCancel, true)
  assert.equal(getSwapUiActions(pending, member('unrelated')).showAccept, false)
  const accepted = swap('accepted')
  assert.equal(getSwapUiActions(accepted, member('admin-1', 'admin')).showApprove, true)
  assert.equal(getSwapUiActions(accepted, member('requester-1')).showCancel, true)
})

test('F3 exchange keeps counterpart registration and target shift visible in detail flow', () => {
  const dialog = source('components/features/swaps/SwapRequestDialog.tsx')
  const list = source('components/features/swaps/SwapRequestList.tsx')
  assert.match(dialog, /targetShiftId/)
  assert.match(dialog, /counterpartOptions/)
  assert.match(dialog, /registration\.id\} value=\{registration\.id\}/)
  assert.match(list, /targetShift=\{selectedSwap\.target_shift_id/)
  assert.match(list, /showRequesterActions=\{getSwapUiActions\(selectedSwap, currentUser\)\.showCancel\}/)
})

test('F3 list has recoverable loading errors and differentiated empty state', () => {
  const list = source('components/features/swaps/SwapRequestList.tsx')
  assert.match(list, /PageLoadError/)
  assert.match(list, /setLoadError\(error\)/)
  assert.match(list, /t\('noMatchingSwaps'\)/)
  assert.match(list, /data-testid="swap-next-actor"/)
})
