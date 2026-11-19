import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const panel = fs.readFileSync(path.join(root, 'components/features/calendar/StaffingActionPanel.tsx'), 'utf8')
const hook = fs.readFileSync(path.join(root, 'lib/hooks/useShiftChangeRefresh.ts'), 'utf8')

test('after a committed write the current tab refreshes and other tabs receive a storage notification', () => {
  assert.match(panel, /if \(writeCommitted\) \{/)
  assert.match(panel, /window\.dispatchEvent\(new Event\(SHIFT_DATA_CHANGED_EVENT\)\)/)
  assert.match(panel, /window\.localStorage\.setItem\(`\$\{SHIFT_DATA_CHANGED_EVENT\}:storage`/)
  assert.match(panel, /catch \{ \/\* Same-tab event and reconciliation remain active\. \*\/ \}/)
})

test('the installed hook receives cross-tab changes and cleans up the listener', () => {
  assert.match(hook, /const storageListener = \(event: StorageEvent\)/)
  assert.match(hook, /event\.key === `\$\{SHIFT_DATA_CHANGED_EVENT\}:storage`/)
  assert.match(hook, /window\.addEventListener\('storage', storageListener\)/)
  assert.match(hook, /window\.removeEventListener\('storage', storageListener\)/)
  assert.match(hook, /window\.removeEventListener\(SHIFT_DATA_CHANGED_EVENT, listener\)/)
})
