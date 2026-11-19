import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const panel = readFileSync(new URL('../components/features/workforce/CancellationCompensationPanel.tsx', import.meta.url), 'utf8')
const actual = readFileSync(new URL('../components/features/shifts/ActualStaffingPanel.tsx', import.meta.url), 'utf8')
const workforcePage = readFileSync(new URL('../app/(dashboard)/workforce/page.tsx', import.meta.url), 'utf8')
const lifecycle = readFileSync(new URL('../components/features/shifts/ShiftLifecycleActions.tsx', import.meta.url), 'utf8')

test('Leader cancellation panel lists scoped cases, filters and edits pending proposals only', () => {
  assert.match(panel, /listCancellationCompensationCases/u)
  for (const filter of ['dateFrom', 'dateTo', 'brandId', 'staffId', 'state', 'reason']) assert.ok(panel.includes(filter))
  assert.match(panel, /item\.state==='pending_admin_confirmation'/u)
  assert.match(panel, /decision:'edit'/u)
  assert.doesNotMatch(panel, /decision:'admin_confirm'/u)
  assert.match(panel, /item\.history/u)
  assert.match(panel, /operational-files\?file_id=/u)
  assert.match(workforcePage, /permission === 'leader'/u)
  assert.match(lifecycle, /shift\.status === 'live'[\s\S]*?\['live', 'paused', 'completed', 'cancelled'\]/u)
})

test('cancellation proposal UI requires persisted evidence and reuses one locked idempotency intent on retry', () => {
  assert.match(actual, /cancellationContext\?\.evidence_receipts/u)
  assert.match(actual, /cancellationContext\?\.periods/u)
  assert.match(actual, /review_status === 'approved'/u)
  assert.match(actual, /compensationSubmitLock\.current/u)
  assert.match(actual, /compensationIntent\.current \?\?=/u)
  assert.match(actual, /idempotencyKey: compensationIntent\.current\.idempotencyKey/u)
  assert.match(actual, /disabled=\{compensationIntentLocked \|\| compensationSubmitting\}/u)
  assert.match(actual, /không có mức hỗ trợ tối thiểu/iu)
  assert.match(actual, /Leader không thể xác nhận cuối/u)
})
