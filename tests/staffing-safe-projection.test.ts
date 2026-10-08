import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readShiftStaffingSummary, withShiftStaffingSummary } from '../lib/services/supabaseStaffingReadService.ts'
import { getShiftRoleCapacities } from '../lib/services/dataService.ts'
import { resolveStaffingLabelsForRole } from '../lib/utils/staffingResolver.ts'
import type { Shift, ShiftStaffingSummary } from '../lib/types/database.types.ts'

test('safe staffing projection preserves other approved capacity/display without raw applicant rows', async () => {
  const summary: ShiftStaffingSummary = { shift_id: 'shift', role: 'host', required: 2, approved: 1, pending: 3,
    remaining: 1, approved_staff: [{ name: 'Approved display', avatar_url: null, imported_only: false }] }
  const client = { rpc: async (name: string, args: { p_shift_ids: string[] }) => {
    assert.equal(name, 'get_shift_staffing_summary'); assert.deepEqual(args.p_shift_ids, ['shift'])
    return { data: [summary], error: null }
  } } as unknown as SupabaseClient
  const [shift] = await withShiftStaffingSummary(client, [{ id: 'shift', required_host_count: 2 } as Shift])
  assert.deepEqual(getShiftRoleCapacities(shift, []), [{ role: 'host', required: 2, approved: 1, pending: 3, remaining: 1 }])
  const labels = resolveStaffingLabelsForRole(shift, [], [], 'host', key => key)
  assert.equal(labels[0].name, 'Approved display'); assert.equal(labels[1].isUnassigned, true)
  assert.equal(JSON.stringify(shift).includes('review_notes'), false)
})

test('safe staffing read propagates authorization errors and makes no request for an empty list', async () => {
  let calls = 0
  const client = { rpc: async () => { calls++; return { error: { message: 'OPERATION_NOT_ALLOWED' } } } } as unknown as SupabaseClient
  assert.deepEqual(await readShiftStaffingSummary(client, []), [])
  assert.equal(calls, 0)
  await assert.rejects(readShiftStaffingSummary(client, ['shift']), /OPERATION_NOT_ALLOWED/)
})
