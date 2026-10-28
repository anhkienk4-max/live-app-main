import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../components/features/calendar/StaffingActionPanel.tsx', import.meta.url), 'utf8')

test('registration refetch failure clears previously actionable snapshot', () => {
  const anchor = source.indexOf("'Không thể tải đăng ký của ca.'")
  assert.ok(anchor > 0)
  const failureBlock = source.slice(Math.max(0, anchor - 700), anchor)
  assert.match(failureBlock, /setSnapshot\(null\)/)
  assert.match(failureBlock, /setCandidateSnapshot\(null\)/)
  assert.match(failureBlock, /setDecision\(null\)/)
})

test('server candidate query failure clears candidate snapshot and decision', () => {
  const anchor = source.indexOf("'Không thể kiểm tra lịch ứng viên.'")
  assert.ok(anchor > 0)
  const failureBlock = source.slice(Math.max(0, anchor - 640), anchor)
  assert.match(failureBlock, /setCandidateSnapshot\(null\)/)
  assert.match(failureBlock, /setUserId\(''\)/)
  assert.match(failureBlock, /setDecision\(null\)/)
})

test('write or persistence verification failure invalidates previous registration snapshot', () => {
  const anchor = source.indexOf('After a failed mutation or verification')
  assert.ok(anchor > 0)
  assert.match(source.slice(anchor, anchor + 220), /setSnapshot\(null\)/)
  assert.match(source.slice(anchor, anchor + 240), /setDecision\(null\)/)
})

test('mutation guards require identity and authoritative fresh server data', () => {
  assert.match(source, /beforeActor = await currentUserService\.getCurrent\(\)/)
  assert.match(source, /afterActor = await currentUserService\.getCurrent\(\)/)
  assert.match(source, /!hasCurrentSnapshot\) return/)
  assert.match(source, /mutationLock\.current = true/)
  assert.match(source, /PERSISTENCE_RECHECK_FAILED/)
})


test('server-committed registration changes broadcast a same-tab refresh even if verification fails', () => {
  assert.match(source, /if \(writeCommitted\) \{/); assert.match(source, /window\.dispatchEvent\(new Event\(SHIFT_DATA_CHANGED_EVENT\)\)/)
  assert.match(source, /localStorage\.setItem\(`\$\{SHIFT_DATA_CHANGED_EVENT\}:storage`/)
  assert.match(source, /setSnapshot\(null\)/)
})
