import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SWAP_REQUEST_STATUSES } from '../components/features/swaps/SwapRequestList.tsx'
import { getMultiSelectOptionLabel, MultiSelectFilter, type MultiSelectFilterOption } from '../components/ui/multi-select-filter.tsx'

test('accepted is a typed English and Vietnamese translation', () => {
  const source = readFileSync(new URL('../lib/i18n.tsx', import.meta.url), 'utf8')
  const vietnameseStart = source.indexOf('const vi:')

  assert.notEqual(vietnameseStart, -1)
  assert.match(source.slice(0, vietnameseStart), /accepted: 'Accepted'/)
  assert.match(source.slice(vietnameseStart), /accepted: 'Đã chấp nhận'/)
})

test('multi-select renders and searches malformed runtime labels by their value', () => {
  const malformedOption = { value: 'accepted', label: undefined } as unknown as MultiSelectFilterOption
  const safeLabel = getMultiSelectOptionLabel(malformedOption)

  assert.equal(safeLabel, 'accepted')
  assert.equal(safeLabel.toLowerCase().includes('cept'), true)
  let markup = ''
  assert.doesNotThrow(() => {
    markup = renderToStaticMarkup(createElement(MultiSelectFilter, {
      label: 'Status',
      options: [malformedOption],
      value: ['accepted'],
      onChange: () => undefined,
    }))
  })
  assert.match(markup, /accepted/)
})

test('swap status filter includes accepted and uses typed translations without unsafe casts', () => {
  assert.deepEqual(SWAP_REQUEST_STATUSES, ['pending', 'accepted', 'approved', 'rejected', 'cancelled', 'completed'])

  const source = readFileSync(new URL('../components/features/swaps/SwapRequestList.tsx', import.meta.url), 'utf8')
  assert.match(source, /SWAP_REQUEST_STATUSES\.map\(status => \(\{ value: status, label: t\(status\) \}\)\)/)
  assert.doesNotMatch(source, /t as unknown as/)

  assert.doesNotThrow(() => renderToStaticMarkup(createElement(MultiSelectFilter, {
    label: 'Status',
    options: SWAP_REQUEST_STATUSES.map(status => ({ value: status, label: status === 'accepted' ? 'Accepted' : status })),
    value: [],
    onChange: () => undefined,
  })))
})
