import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('PWA Staff has mobile cards while retaining RC19 paging, permissions and desktop table', () => {
  const code = source('components/features/staff/StaffList.tsx')
  const config = source('playwright.pwa-dashboard.config.ts')
  const workflow = source('.github/workflows/ada-ops-pwa-verify.yml')
  assert.match(code, /data-testid="staff-mobile-layout"/)
  assert.match(code, /data-testid="staff-mobile-card-/)
  assert.match(code, /data-testid="staff-mobile-search"/)
  assert.match(code, /hidden min-w-0 md:block/)
  assert.match(code, /<DataTable/)
  assert.match(code, /<HistoryPagination page=\{list\.page\}/)
  assert.match(code, /renderStaffActions\(row\)/)
  assert.match(code, /hasPermission\(currentUser, 'staff.manage'\)/)
  assert.match(code, /\[overflow-wrap:anywhere\]/)
  assert.match(config, /staff/)
  assert.match(workflow, /components\/features\/staff\/StaffList.tsx/)
})
