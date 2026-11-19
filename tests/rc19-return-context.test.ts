import test from 'node:test'
import assert from 'node:assert/strict'
import { RETURN_TO_PARAM, sanitizeReturnPath, withReturnTo } from '../lib/utils/returnContext'

test('G6 return context preserves calendar state and rejects external destinations', () => {
  const origin = '/calendar?tab=calendar&calendar_view=week&calendar_filters=%7B%22brandIds%22%3A%5B%22b1%22%5D%7D'
  const destination = withReturnTo('/shifts?edit_shift_id=shift-1', origin)
  assert.equal(
    new URLSearchParams(destination.split('?')[1]).get(RETURN_TO_PARAM),
    origin,
  )

  for (const unsafe of ['//example.com', 'https://example.com', '/\\example.com', '/calendar\u0000']) {
    assert.equal(sanitizeReturnPath(unsafe), null, `unsafe return path accepted: ${JSON.stringify(unsafe)}`)
  }
  assert.equal(sanitizeReturnPath('/'.padEnd(2049, 'a')), null)
})
