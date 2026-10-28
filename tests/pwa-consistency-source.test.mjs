import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('PWA shared visual system spans key workspaces without modifying authentication', () => {
  const archetypes = source('components/ui/archetypes.tsx')
  const styles = source('app/globals.css')
  const workflow = source('.github/workflows/ada-ops-pwa-verify.yml')
  const config = source('playwright.pwa-dashboard.config.ts')
  assert.ok(archetypes.includes("archetype !== 'auth' && 'ada-workspace-page'"))
  assert.ok(styles.includes('ADA OPS RC19 mobile visual system'))
  assert.ok(styles.includes('--ada-mobile-control-height: 44px'))
  assert.ok(styles.includes('font-size: 16px'))
  for (const page of ['calendar','reports','payroll','workforce','profile']) {
    const path = 'app/(dashboard)/' + page + '/page.tsx'
    assert.ok(source(path).includes('ada-' + page + '-page'), page + ' missing mobile class')
    assert.ok(workflow.includes(path), page + ' outside lint')
  }
  assert.ok(config.includes('consistency'))
  assert.ok(workflow.includes('tests/pwa-consistency-source.test.mjs'))
  assert.ok(source('e2e/pwa-consistency-mobile.spec.ts').includes('PWA desktop preserved'))
})
