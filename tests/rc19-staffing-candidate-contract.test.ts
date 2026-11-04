import test from 'node:test'
import assert from 'node:assert/strict'
import { validateStaffingCandidateResult } from '../lib/utils/staffingCandidateContract.ts'

const item = (changes: Record<string, unknown> = {}) => ({
  user_id: 'staff-1', full_name: 'Nguyen A', availability: 'available', ...changes,
})

test('RC19.1B2 RPC candidate envelope decoder', async t => {
  await t.test('accepts available, conflict and already-on-shift', () => {
    const items = [item(), item({ user_id: 'staff-2', availability: 'conflict' }),
      item({ user_id: 'staff-3', availability: 'already_on_shift' })]
    assert.deepEqual(validateStaffingCandidateResult({ total: 3, items }, 20, 0).items.map(x => x.availability),
      ['available', 'conflict', 'already_on_shift'])
  })
  await t.test('retains total on an empty last page', () => {
    assert.deepEqual(validateStaffingCandidateResult({ total: 21, items: [] }, 20, 40), { items: [], total: 21 })
  })
  await t.test('rejects silent empty page before end, malformed envelopes and total', () => {
    assert.throws(() => validateStaffingCandidateResult([], 20, 0), /INVALID/)
    assert.throws(() => validateStaffingCandidateResult({ total: 4, items: [] }, 20, 0), /INVALID/)
    assert.throws(() => validateStaffingCandidateResult({ total: -1, items: [] }, 20, 0), /INVALID/)
    assert.throws(() => validateStaffingCandidateResult({ total: 2.5, items: [] }, 20, 0), /INVALID/)
  })
  await t.test('rejects duplicate ids, unknown states, invalid identity and overflow', () => {
    assert.throws(() => validateStaffingCandidateResult({ total: 2, items: [item(), item()] }, 20, 0), /INVALID/)
    assert.throws(() => validateStaffingCandidateResult({ total: 1, items: [item({ availability: 'maybe' })] }, 20, 0), /INVALID/)
    assert.throws(() => validateStaffingCandidateResult({ total: 1, items: [item({ user_id: '' })] }, 20, 0), /INVALID/)
    assert.throws(() => validateStaffingCandidateResult({ total: 1, items: [item(), item({user_id:'staff-2'})] }, 20, 0), /INVALID/)
  })
})
