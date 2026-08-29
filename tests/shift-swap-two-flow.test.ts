import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { shiftRegistrationService, shiftService, swapRequestService, userService } from '../lib/services/dataService.ts'
import type { Shift } from '../lib/types/database.types.ts'

process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
process.env.NODE_ENV = 'development'

const migrationPath = new URL('../supabase/migrations/20260826172730_shift_swap_two_flow_semantics.sql', import.meta.url)

async function sourceRegistration(date: string, requesterId = '2') {
  const shift = await shiftService.create({
    date,
    start_time: '09:00',
    end_time: '11:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    title: `Two-flow ${date}`,
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    status: 'scheduled',
  } as unknown as Shift)
  const registration = await shiftRegistrationService.assignManually(shift.id, requesterId, 'host', '1', shift.version)
  return { shift, registration }
}

test('forward migration exposes only replacement and exchange creation', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /p_mode not in \('replacement', 'exchange'\)/)
  assert.match(sql, /message = 'SWAP_MODE_NOT_CREATABLE'/)
  assert.match(sql, /request_row\.status <> 'accepted'/)
  assert.doesNotMatch(sql, /old\.status = 'pending' and new\.status in \([^)]*'approved'/)
  assert.match(sql, /replacement_staff_id = \(select private\.current_business_user_id\(\)\)/)
  assert.match(sql, /requester_id = \(select private\.current_business_user_id\(\)\)/)
  assert.match(sql, /counterpart_id = \(select private\.current_business_user_id\(\)\)/)
})

test('forward migration requires selected replacement acceptance and preserves atomic history', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /participant_id := case when request_row\.mode = 'replacement' then request_row\.replacement_staff_id else request_row\.counterpart_id end/)
  assert.match(sql, /request_row\.responded_by <> participant\.id/)
  assert.match(sql, /'from_status', 'accepted', 'to_status', 'approved'/)
  assert.match(sql, /'from_status', 'approved', 'to_status', 'completed'/)
  assert.match(sql, /private\.lock_swap_registrations/)
  assert.match(sql, /private\.lock_swap_shifts/)
  assert.match(sql, /private\.lock_swap_rows/)
  assert.match(sql, /private\.lock_swap_users/)
})

test('new swap dialog does not expose MOVE', async () => {
  const dialog = await readFile(new URL('../components/features/swaps/SwapRequestDialog.tsx', import.meta.url), 'utf8')
  assert.match(dialog, /type CreatableSwapMode = 'replacement' \| 'exchange'/)
  assert.match(dialog, /<SelectItem value="replacement">Thế ca<\/SelectItem>/)
  assert.match(dialog, /<SelectItem value="exchange">Đổi chéo<\/SelectItem>/)
  assert.doesNotMatch(dialog, /<SelectItem value="move">/)
})

test('replacement requires the exact selected participant before Leader approval', async () => {
  const { shift, registration } = await sourceRegistration('2032-01-01')
  const request = await swapRequestService.create({
    requester_id: '2',
    shift_id: shift.id,
    source_registration_id: registration.id,
    replacement_staff_id: '3',
    operational_role: 'host',
    mode: 'replacement',
    reason: 'Need a replacement',
  } as never)

  await assert.rejects(() => swapRequestService.approve(request.id, '1', request.version), /must be accepted/i)
  await assert.rejects(() => swapRequestService.respond(request.id, '4', 'accept', request.version), /selected participant/i)
  const accepted = await swapRequestService.respond(request.id, '3', 'accept', request.version)
  assert.equal(accepted?.status, 'accepted')
  const completed = await swapRequestService.approve(request.id, '1', accepted?.version)
  assert.equal(completed?.status, 'completed')
  assert.deepEqual(completed?.approval_history?.map(entry => entry.action), ['created', 'accepted', 'approved', 'completed'])
  assert.equal(completed?.approval_history?.[0]?.replacement_staff_id, '3')
  assert.ok(completed?.approval_history?.every(entry => !('by' in entry)))
})

test('selected replacement can reject and requester can cancel pending or accepted', async () => {
  const first = await sourceRegistration('2032-01-02')
  const rejectedRequest = await swapRequestService.create({
    requester_id: '2', shift_id: first.shift.id, source_registration_id: first.registration.id,
    replacement_staff_id: '3', operational_role: 'host', mode: 'replacement', reason: 'Reject path',
  } as never)
  const rejected = await swapRequestService.respond(rejectedRequest.id, '3', 'reject', rejectedRequest.version)
  assert.equal(rejected?.status, 'rejected')

  const second = await sourceRegistration('2032-01-03')
  const cancelledRequest = await swapRequestService.create({
    requester_id: '2', shift_id: second.shift.id, source_registration_id: second.registration.id,
    replacement_staff_id: '3', operational_role: 'host', mode: 'replacement', reason: 'Cancel path',
  } as never)
  const accepted = await swapRequestService.respond(cancelledRequest.id, '3', 'accept', cancelledRequest.version)
  const cancelled = await swapRequestService.cancel(cancelledRequest.id, '2', 'No longer needed', accepted?.version)
  assert.equal(cancelled?.status, 'cancelled')
})

test('replacement create blocks MOVE, self, role mismatch, and inactive selected staff', async () => {
  const moveSource = await sourceRegistration('2032-01-04')
  await assert.rejects(() => swapRequestService.create({
    requester_id: '2', shift_id: moveSource.shift.id, source_registration_id: moveSource.registration.id,
    target_shift_id: 'historical-target', operational_role: 'host', mode: 'move', reason: 'No longer supported',
  } as never), /historical.*cannot be created/i)

  const selfSource = await sourceRegistration('2032-01-05')
  await assert.rejects(() => swapRequestService.create({
    requester_id: '2', shift_id: selfSource.shift.id, source_registration_id: selfSource.registration.id,
    replacement_staff_id: '2', operational_role: 'host', mode: 'replacement', reason: 'Self',
  } as never), /different replacement/i)

  const roleSource = await sourceRegistration('2032-01-06')
  await assert.rejects(() => swapRequestService.create({
    requester_id: '2', shift_id: roleSource.shift.id, source_registration_id: roleSource.registration.id,
    replacement_staff_id: '5', operational_role: 'host', mode: 'replacement', reason: 'Wrong role',
  } as never), /not eligible/i)

  const inactiveSource = await sourceRegistration('2032-01-07')
  await userService.archive('3', '1', 'two-flow inactive test')
  try {
    await assert.rejects(() => swapRequestService.create({
      requester_id: '2', shift_id: inactiveSource.shift.id, source_registration_id: inactiveSource.registration.id,
      replacement_staff_id: '3', operational_role: 'host', mode: 'replacement', reason: 'Inactive',
    } as never), /inactive/i)
  } finally {
    await userService.restore('3', '1', 'two-flow inactive test cleanup')
  }
})
