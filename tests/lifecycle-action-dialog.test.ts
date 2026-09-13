import { test } from 'node:test'
import * as assert from 'node:assert'
import { canSubmitLifecycleAction } from '../components/ui/lifecycle-action-dialog.tsx'

test('completion is enabled without impact or a required reason', () => {
  assert.strictEqual(canSubmitLifecycleAction(null, false, ''), true)
})

test('cancellation still requires a reason when no impact record is needed', () => {
  assert.strictEqual(canSubmitLifecycleAction(null, true, '', false), false)
  assert.strictEqual(canSubmitLifecycleAction(null, true, 'cancel', false), true)
})

test('impact-required actions remain blocked until impact is available', () => {
  assert.strictEqual(canSubmitLifecycleAction(null, true, 'valid reason'), false)
})
