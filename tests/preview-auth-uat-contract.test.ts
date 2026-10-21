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
  assert.doesNotMatch(workflow, /page\.pause\(|storageState\s*\(/)
})
