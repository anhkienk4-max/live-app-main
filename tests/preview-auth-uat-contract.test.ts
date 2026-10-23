import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('manual Preview auth UAT is bounded, deployment-specific, and read-only', async () => {
  const config = await readFile(new URL('../playwright.preview-uat.config.ts', import.meta.url), 'utf8')
  const workflow = await readFile(new URL('../e2e/preview-authenticated-uat.spec.ts', import.meta.url), 'utf8')

  assert.match(config, /previewURL\.protocol !== 'https:'/)
  assert.match(config, /livestream-ops-demo-\[a-z0-9\]\{9\}-livestream2/)
  assert.match(config, /timeout: 8 \* 60_000/)
  assert.match(config, /headless: false/)
  assert.doesNotMatch(config, /webServer|storageState|http:\/\/localhost/)

  assert.match(workflow, /manualLoginTimeoutMs = 90_000/)
  assert.match(workflow, /\['GET', 'HEAD', 'OPTIONS'\]\.includes\(method\) \|\| authPath/)
  assert.match(workflow, /identity_unavailable[\s\S]*status: 'FAIL'/)
  assert.match(workflow, /credentialsPersisted: false/)
  assert.match(workflow, /cookiesOrStorageStateWritten: false/)
  assert.match(workflow, /page\.locator\('\[data-testid="email-input"\]'\)/)
  assert.match(workflow, /page\.locator\('\[data-testid="password-input"\]'\)/)
  // Reports must be tested against authenticated API responses on the one approved Preview,
  // not only against the mocked CI UI or successful sign-in.
  assert.match(workflow, /verifyReportsReadOnly\(page, role, trace\)/)
  assert.match(workflow, /REPORTS_FILTERED_API_SCOPE_OR_ENVELOPE_INVALID/)
  assert.match(workflow, /reports_authenticated_filter_api_and_chips_pass/)
  assert.match(workflow, /for \(const width of \[320, 390, 768, 1440\]\)/)
  assert.match(workflow, /api\/operations\/collection/)
  assert.match(workflow, /verifyReportsExportAndDetail\(page, role, trace\)/)
  assert.match(workflow, /REPORTS_UAT_EXPORT_ROWS_MISMATCH/)
  assert.match(workflow, /reports_member_bulk_export_hidden/)
  assert.match(workflow, /reports_readonly_detail_verified/)
  assert.match(workflow, /new Set\(ids\)\.size !== source\.total/)
  assert.match(workflow, /readFile\(await download\.path\(\)\)/)
  // Preview must be explicitly Staging-backed: read-only revision RPC requires
  // one verified path and must not open a general POST allowlist.
  assert.match(workflow, /url\.hostname === 'amagnzebmmuqiptmrjmc\.supabase\.co'/)
  assert.match(workflow, /url\.hostname\.endsWith\('\.supabase\.co'\) && !stagingHost/)
  assert.match(workflow, /readOnlyReportRevisionRpc/)
  assert.match(workflow, /url\.pathname === '\/rest\/v1\/rpc\/get_report_revisions'/)
  assert.match(workflow, /\|\| authPath \|\| readOnlyReportRevisionRpc/)

  assert.doesNotMatch(workflow, /page\.pause\(|storageState\s*\(/)
})
