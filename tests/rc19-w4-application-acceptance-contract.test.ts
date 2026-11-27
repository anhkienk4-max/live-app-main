import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const entrypoint = readFileSync(new URL('../scripts/rc19-w4-application-acceptance.mjs', import.meta.url), 'utf8')
const hostedPlaywrightConfig = readFileSync(new URL('../playwright.rc19-w4-hosted-acceptance.config.ts', import.meta.url), 'utf8')
const fixtureManifest = JSON.parse(readFileSync(new URL('../docs/rc19/W4_EXECUTABLE_ACCEPTANCE_FIXTURE_MANIFEST.json', import.meta.url), 'utf8')) as {
  schema: string
  credentials_included: boolean
  runtime_id_policy: string
  attendance_payroll: { status: string }
}

test('application acceptance runs actor-backed Agency, Workforce and receipt cases without upgrading unfinished groups', () => {
  assert.match(entrypoint, /rc19-w4-application-acceptance\/v2/u)
  assert.match(entrypoint, /rc19_workforce_incident_monthly_v2/u)
  assert.match(entrypoint, /shift_swap_operation_v1/u)
  assert.match(entrypoint, /agency-wrong-agency-denial/u)
  assert.match(entrypoint, /Promise\.all\(\[invoke\(\), invoke\(\)\]\)/u)
  assert.match(entrypoint, /E2E_ADMIN_EMAIL: byRole\.admin\.email/u)
  assert.match(entrypoint, /authenticated-browser/u)
  assert.match(hostedPlaywrightConfig, /baseURL: process\.env\.RC19_W4_NEXT_BASE_URL/u)
  assert.doesNotMatch(hostedPlaywrightConfig, /webServer:/u)
  assert.match(entrypoint, /SWAP_IDEMPOTENCY_KEY_REUSED/u)
  assert.match(entrypoint, /D01'[\s\S]*D11/u)
  assert.match(entrypoint, /const originalD = \[[\s\S]*\['D11'/u)
  assert.match(entrypoint, /const originalL = \[[\s\S]*\['L15'/u)
  assert.match(entrypoint, /\.\.\.originalD,[\s\S]*\.\.\.originalL/u)
  assert.match(entrypoint, /status: 'not_run'/u)
  assert.match(entrypoint, /BROWSER_PERSISTED_READBACK_NOT_ASSERTED/u)
  assert.match(entrypoint, /authenticatedBrowserInteractionCount/u)
  assert.match(entrypoint, /fixture_manifest:[\s\S]*runtime_marker: marker/u)
  assert.equal(fixtureManifest.schema, 'rc19-w4-synthetic-fixtures/v1')
  assert.equal(fixtureManifest.credentials_included, false)
  assert.match(fixtureManifest.runtime_id_policy, /same runtime marker/u)
  assert.equal(fixtureManifest.attendance_payroll.status, 'NOT RUN')
  assert.match(entrypoint, /authenticated-browser'[\s\S]*status: 'NOT RUN'/u)
  assert.doesNotMatch(entrypoint, /AGENCY_FIXTURE_PROVISIONING_NOT_IMPLEMENTED/u)
  assert.doesNotMatch(entrypoint, /BROWSER_UAT_REQUIRES_SEPARATE_REVIEWED_APP_RUNTIME/u)
})
