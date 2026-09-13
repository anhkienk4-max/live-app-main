import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('UX-IMPORT-01: i18n does not contain mock://schedule', () => {
  const i18nSource = readFileSync(
    new URL('../lib/i18n.tsx', import.meta.url),
    'utf-8'
  )
  assert.doesNotMatch(i18nSource, /mock:\/\/schedule/)
})

test('UX-IMPORT-01: ScheduleImportPanel evaluates result states correctly via static analysis', () => {
  const panelSource = readFileSync(
    new URL('../components/features/calendar/ScheduleImportPanel.tsx', import.meta.url),
    'utf-8'
  )

  assert.ok(panelSource.includes("const attention = counts.warning + counts.duplicate + counts.invalid + counts.retryable"))
  assert.ok(panelSource.includes("if (persistedCount === 0 && (counts.duplicate + counts.invalid + counts.retryable) > 0) state = 'ACTION_REQUIRED'"))
  assert.ok(panelSource.includes("else if (persistedCount > 0 && attention > 0) state = 'PARTIAL'"))
  assert.match(panelSource, /row\.failure_code/)
  assert.doesNotMatch(panelSource, /mock:\/\/schedule/)
  assert.match(panelSource, /visibleRetryable = showAllRetryable \? retryableErrors : retryableErrors\.slice\(0, 10\)/)
})

test('UX-IMPORT-01: State logic simulation (A, B, C, D)', () => {
  // A helper function exactly matching the component's internal logic
  function computeState(counts) {
    const persistedCount = counts.created + counts.updated
    const attention = counts.warning + counts.duplicate + counts.invalid + counts.retryable

    let state = 'SUCCESS'
    if (persistedCount === 0 && (counts.duplicate + counts.invalid + counts.retryable) > 0) state = 'ACTION_REQUIRED'
    else if (persistedCount > 0 && attention > 0) state = 'PARTIAL'

    return { state, attention }
  }

  // A. persisted 0, duplicate 60 => NOT SUCCESS
  const resA = computeState({ created: 0, updated: 0, duplicate: 60, invalid: 0, retryable: 0, warning: 0 })
  assert.equal(resA.state, 'ACTION_REQUIRED')

  // B. persisted 50, warning 5, duplicate 5 => PARTIAL, attention 10
  const resB = computeState({ created: 50, updated: 0, duplicate: 5, invalid: 0, retryable: 0, warning: 5 })
  assert.equal(resB.state, 'PARTIAL')
  assert.equal(resB.attention, 10)

  // C. persisted 60, all attention counts 0 => SUCCESS
  const resC = computeState({ created: 60, updated: 0, duplicate: 0, invalid: 0, retryable: 0, warning: 0 })
  assert.equal(resC.state, 'SUCCESS')
  assert.equal(resC.attention, 0)

  // D. persisted 0, retryable 60 => ACTION_REQUIRED
  const resD = computeState({ created: 0, updated: 0, duplicate: 0, invalid: 0, retryable: 60, warning: 0 })
  assert.equal(resD.state, 'ACTION_REQUIRED')
})
