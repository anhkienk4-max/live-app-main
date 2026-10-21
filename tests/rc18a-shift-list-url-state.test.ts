import test from 'node:test'
import assert from 'node:assert/strict'
import { readShiftListUrlState, shiftListUrlValues } from '@/lib/utils/shiftListUrlState'

test('Shift List defaults to recent, all statuses, empty search, newest first', () => {
  assert.deepEqual(readShiftListUrlState(new URLSearchParams()), {
    dateWindow: 'recent', status: 'all', search: '', descending: true,
  })
})

test('Shift List filter state round-trips in URL and clears defaults without losing unrelated params', () => {
  const params = new URLSearchParams('shifts_page=5&shifts_size=50&keep=1')
  const values = shiftListUrlValues({
    dateWindow: 'all', status: 'scheduled', search: 'Ada Live', descending: false,
  })
  for (const [key, value] of Object.entries(values)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  assert.equal(params.get('shifts_page'), null, 'filter change resets pagination')
  assert.equal(params.get('shifts_size'), '50')
  assert.equal(params.get('keep'), '1')
  assert.deepEqual(readShiftListUrlState(params), {
    dateWindow: 'all', status: 'scheduled', search: 'Ada Live', descending: false,
  })
  for (const [key, value] of Object.entries(shiftListUrlValues({
    dateWindow: 'recent', status: 'all', search: '', descending: true,
  }))) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  assert.equal(params.has('shifts_range'), false)
  assert.equal(params.has('shifts_status'), false)
  assert.equal(params.has('shifts_search'), false)
  assert.equal(params.has('shifts_sort'), false)
})

test('invalid filter parameters fail closed to the documented defaults', () => {
  assert.deepEqual(readShiftListUrlState(new URLSearchParams('shifts_range=tomorrow&shifts_status=owner&shifts_sort=up')), {
    dateWindow: 'recent', status: 'all', search: '', descending: true,
  })
})
