import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('manual Production UAT requires explicit target, exact alias, project, and deployed SHA', async () => {
  const config = await readFile(new URL('../playwright.production-uat.config.ts', import.meta.url), 'utf8')
  const hostPolicy = await readFile(new URL('../lib/uat/rc19ProductionUatHostPolicy.ts', import.meta.url), 'utf8')
  const workflow = await readFile(new URL('../e2e/production-authenticated-uat.spec.ts', import.meta.url), 'utf8')

  assert.match(config, /RC19_UAT_MODE !== 'production'/)
  assert.match(config, /PRODUCTION_UAT_BASE_URL/)
  assert.match(config, /https:\/\/ops5729\.top/)
  assert.match(config, /PRODUCTION_UAT_SUPABASE_PROJECT_REF !== RC19_PRODUCTION_SUPABASE_REF/)
  assert.match(hostPolicy, /egdjnpmoasarrttvhgds/)
  assert.match(config, /PRODUCTION_UAT_EXPECTED_SHA/)
  assert.match(config, /\[a-f0-9\]\{40\}/)
  assert.match(config, /timeout: 8 \* 60_000/)
  assert.match(config, /headless: false/)
  assert.doesNotMatch(config, /webServer|storageState|PREVIEW_UAT_BASE_URL/)

  assert.match(workflow, /manualLoginTimeoutMs = 90_000/)
  assert.match(workflow, /\['GET', 'HEAD', 'OPTIONS'\]\.includes\(method\) \|\| authPath/)
  assert.match(workflow, /classifyRc19ProductionUatHost\(url\)/)
  assert.match(workflow, /PRODUCTION_UAT_BLOCKED_BUSINESS_WRITE_ATTEMPTS/)
  assert.match(workflow, /PRODUCTION_DEPLOYED_SHA_MISMATCH/)
  assert.match(workflow, /identity_unavailable[\s\S]*status: 'FAIL'/)
  assert.match(workflow, /credentialsPersisted: false/)
  assert.match(workflow, /cookiesOrStorageStateWritten: false/)
  assert.match(workflow, /page\.locator\('\[data-testid="email-input"\]'\)/)
  assert.match(workflow, /page\.locator\('\[data-testid="password-input"\]'\)/)
  // Reports must be tested against authenticated API responses on the exact Production deployment,
  // not only against the mocked CI UI or successful sign-in.
  assert.match(workflow, /verifyReportsReadOnly\(page, role, trace\)/)
  assert.match(workflow, /REPORTS_FILTERED_API_SCOPE_OR_ENVELOPE_INVALID/)
  assert.match(workflow, /reports_authenticated_zero_result_filter_pass/)
  assert.match(workflow, /for \(const width of \[320, 390, 768, 1440\]\)/)
  assert.match(workflow, /api\/operations\/collection/)
  // Real Production datasets must not be downloaded into test artifacts.
  assert.doesNotMatch(workflow, /XLSX|download\(|readFile\(/)
  assert.match(workflow, /RC19_PRODUCTION_SUPABASE_REF/)
  assert.match(workflow, /classifyRc19ProductionUatHost\(url\)/)
  assert.match(workflow, /blockedExternalRequests \+= 1/)
  assert.match(workflow, /PRODUCTION_UAT_FORBIDDEN_EXTERNAL_HOST_REQUESTS/)
  assert.match(workflow, /readOnlyReportRevisionRpc/)
  assert.match(workflow, /url\.pathname === '\/rest\/v1\/rpc\/get_report_revisions'/)
  assert.match(workflow, /\|\| authPath \|\| readOnlyReportRevisionRpc/)

  assert.doesNotMatch(workflow, /page\.pause\(|storageState\s*\(/)
})
