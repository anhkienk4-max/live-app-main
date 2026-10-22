import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../components/features/swaps/SwapRequestDialog.tsx', import.meta.url), 'utf8')

test('legacy shift detail swap exchange loads bounded API page, not all shifts', () => {
  assert.match(source, /shiftService\.getPage\(\{/)
  assert.match(source, /page: targetPage, pageSize/)
  assert.match(source, /const pageSize = 20/)
  assert.doesNotMatch(source, /shiftService\.getAll\(/)
})
test('target picker has search, pagination, retry, and account key', () => {
  assert.match(source, /targetSearchDraft/)
  assert.match(source, /setTargetPage\(p => p\+1\)/)
  assert.match(source, /setTargetRevision\(n => n \+ 1\)/)
  assert.match(source, /\[currentUser\.id, sourceShift\.id, targetSearch, targetPage, targetRevision\]/)
})
test('candidate read-after-target selection is scoped; submit fails closed', () => {
  assert.match(source, /counterpartSnapshot\?\.key === candidateKey/)
  assert.match(source, /currentCandidate\.rows\.some\(candidate => candidate\.registration_id === counterpartId\)/)
  assert.match(source, /submitLock\.current/)
})
