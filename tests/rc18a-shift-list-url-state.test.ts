import test from 'node:test'
import assert from 'node:assert/strict'
import { readShiftListUrlState, shiftListUrlValues } from '@/lib/utils/shiftListUrlState'

test('Shift List defaults to recent, all statuses, empty search, newest first', () => {
  assert.deepEqual(readShiftListUrlState(new URLSearchParams()), {
    dateWindow: 'recent', month: '', from: '', to: '', status: 'all', brandId: '', platformId: '', search: '', descending: true,
  })
})

test('Shift List filter state round-trips in URL and clears defaults without losing unrelated params', () => {
  const params = new URLSearchParams('shifts_page=5&shifts_size=50&keep=1')
  const values = shiftListUrlValues({
    dateWindow: 'all', month: '', from: '', to: '', status: 'scheduled', brandId: 'b1', platformId: 'p1', search: 'Ada Live', descending: false,
  })
  for (const [key, value] of Object.entries(values)) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  assert.equal(params.get('shifts_page'), null, 'filter change resets pagination')
  assert.equal(params.get('shifts_size'), '50')
  assert.equal(params.get('keep'), '1')
  assert.deepEqual(readShiftListUrlState(params), {
    dateWindow: 'all', month: '', from: '', to: '', status: 'scheduled', brandId: 'b1', platformId: 'p1', search: 'Ada Live', descending: false,
  })
  for (const [key, value] of Object.entries(shiftListUrlValues({
    dateWindow: 'recent', month: '', from: '', to: '', status: 'all', brandId: '', platformId: '', search: '', descending: true,
  }))) {
    if (value === null) params.delete(key)
    else params.set(key, value)
  }
  assert.equal(params.has('shifts_range'), false)
  assert.equal(params.has('shifts_status'), false)
  assert.equal(params.has('shifts_brand'), false)
  assert.equal(params.has('shifts_platform'), false)
  assert.equal(params.has('shifts_search'), false)
  assert.equal(params.has('shifts_sort'), false)
})

test('invalid filter parameters fail closed to the documented defaults', () => {
  assert.deepEqual(readShiftListUrlState(new URLSearchParams('shifts_range=tomorrow&shifts_status=owner&shifts_sort=up')), {
    dateWindow: 'recent', month: '', from: '', to: '', status: 'all', brandId: '', platformId: '', search: '', descending: true,
  })
})

test('month and custom shift windows round-trip, reject invalid URLs and reset only page', () => {
  const params = new URLSearchParams('shifts_page=4&shifts_size=50&keep=1')
  for (const state of [
    { dateWindow: 'month' as const, month: '2024-02', from: '', to: '' },
    { dateWindow: 'custom' as const, month: '', from: '2026-09-30', to: '2026-10-01' },
  ]) {
    for (const [key, value] of Object.entries(shiftListUrlValues({ ...state, status: 'live', brandId: '', platformId: '', search: 'test', descending: false }))) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    assert.equal(params.get('shifts_page'), null)
    assert.equal(params.get('shifts_size'), '50')
    assert.equal(params.get('keep'), '1')
    assert.deepEqual(readShiftListUrlState(params), { ...state, status: 'live', brandId: '', platformId: '', search: 'test', descending: false })
  }
  for (const invalid of ['shifts_range=month&shifts_month=2026-13', 'shifts_range=custom&shifts_from=2026-10-02&shifts_to=2026-10-01']) {
    assert.equal(readShiftListUrlState(new URLSearchParams(invalid)).dateWindow, 'recent')
  }
})
