import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const entrypoint = readFileSync(new URL('../scripts/rc19-w4-application-acceptance.mjs', import.meta.url), 'utf8')

test('application acceptance output is per-case and never turns unrun browser or business groups into PASS', () => {
  assert.match(entrypoint, /rc19-w4-application-acceptance\/v2/u)
  assert.match(entrypoint, /status: 'BLOCKED'/u)
  assert.match(entrypoint, /case_id:[\s\S]*actor:[\s\S]*expected:[\s\S]*actual:[\s\S]*evidence_scope:[\s\S]*status:/u)
  assert.match(entrypoint, /Array\.from\(\{ length: 11 \}/u)
  assert.match(entrypoint, /authenticated-browser'[\s\S]*status: 'NOT RUN'/u)
  assert.match(entrypoint, /BROWSER_UAT_REQUIRES_SEPARATE_REVIEWED_APP_RUNTIME/u)
  assert.doesNotMatch(entrypoint, /status: 'passed',[\s\S]{0,80}browser_uat: \{ ran: false, passed: false \}/u)
})
