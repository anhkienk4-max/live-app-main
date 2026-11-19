#!/usr/bin/env node
// Strict offline release evidence gate. A skip is BLOCKED, not PASS.
// Usage: node scripts/validate-pwa-functional-uat.mjs test-results/pwa-functional-staging.json
import { readFileSync } from 'node:fs'
const path = process.argv[2]
if (!path) throw new Error('BLOCKED: supply the Playwright JSON report path')
const report = JSON.parse(readFileSync(path, 'utf8'))
const specs = []
function visit(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) specs.push(spec)
    visit(suite.suites)
  }
}
visit(report.suites)
const all = specs.flatMap(spec => spec.tests ?? [])
const results = all.map(t => t.results?.at(-1)?.status ?? 'missing')
const pass = results.filter(v => v === 'passed').length
const blocked = results.filter(v => v === 'skipped' || v === 'missing').length
const failed = results.filter(v => !['passed', 'skipped', 'missing'].includes(v)).length
const missingRoles = ['admin', 'leader', 'member'].filter(role => !specs.some(s => s.title.includes(role + ' ')))
const summary = { total: all.length, pass, blocked, failed, missingRoles }
console.log('PWA functional 3-role UAT evidence:', JSON.stringify(summary))
if (all.length < 22 || missingRoles.length || blocked || failed || pass !== all.length) {
  console.error('NO-GO: no release claim is allowed with skipped, failed or missing real-role tests.')
  process.exitCode = 1
}
