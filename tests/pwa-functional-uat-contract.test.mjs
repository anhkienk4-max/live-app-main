import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
test('Functional UAT requires real 3-role credentials, pinned Preview, and read-only flows', () => {
  const spec = src('e2e/pwa-functional-staging.uat.spec.ts')
  const cfg = src('playwright.pwa-functional.uat.config.ts')
  const gate = src('scripts/validate-pwa-functional-uat.mjs')
  assert.ok(spec.includes('PWA_UAT_EXPECTED_SHA'))
  assert.ok(spec.includes('guardTarget()'))
  assert.ok(spec.includes('requireIdentity(role)'))
  assert.ok(spec.includes('livestream-ops-demo'))
  for (const role of ['admin', 'leader', 'member']) assert.ok(spec.includes("'"+role+"'"))
  for (const route of ['/calendar?tab=open','/calendar?tab=mine','/staffing?tab=registration','/reports','/payroll','/workforce']) assert.ok(spec.includes(route))
  assert.ok(spec.includes('test.skip(true,'))
  assert.ok(cfg.includes("screenshot: 'off'"))
  assert.ok(cfg.includes("trace: 'off'"))
  assert.ok(cfg.includes("video: 'off'"))
  assert.ok(gate.includes("process.exitCode = 1"))
  assert.ok(gate.includes('blocked || failed'))
  const workflow = src('.github/workflows/ada-ops-pwa-verify.yml')
  assert.ok(workflow.includes('tests/pwa-functional-uat-contract.test.mjs'))
  assert.ok(workflow.includes('e2e/pwa-functional-staging.uat.spec.ts'))
})
