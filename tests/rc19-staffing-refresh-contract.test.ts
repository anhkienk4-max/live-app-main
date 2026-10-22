import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const panel = fs.readFileSync(path.join(root, 'components/features/calendar/StaffingActionPanel.tsx'), 'utf8')
const patcher = fs.readFileSync(path.join(root, 'apply_rc19_1b.py'), 'utf8')

test('after a committed write the current tab refreshes and other tabs receive a storage notification', () => {
  assert.match(panel, /if \(writeCommitted\) \{/)
  assert.match(panel, /window\.dispatchEvent\(new Event\(SHIFT_DATA_CHANGED_EVENT\)\)/)
  assert.match(panel, /window\.localStorage\.setItem\(`\$\{SHIFT_DATA_CHANGED_EVENT\}:storage`/)
  assert.match(panel, /catch \{ \/\* Same-tab event and reconciliation remain active\. \*\/ \}/)
})

test('the patcher installs and removes a cross-tab listener without overwriting unrelated source', () => {
  assert.match(patcher, /hook_path = REPO \/ REFRESH_HOOK_NAME/)
  assert.match(patcher, /window\.addEventListener\('storage', storageListener\)/)
  assert.match(patcher, /window\.removeEventListener\('storage', storageListener\)/)
  assert.match(patcher, /hook_path\.read_bytes\(\) != hook_before/)
  assert.match(patcher, /if hook_wrote and hook_path\.read_bytes\(\) == hook_updated_bytes/)
})
