import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
// @ts-expect-error isolated JavaScript test harness
import { verifyManifest } from './rc16g-reconciliation.integration.mjs'

const manifest = JSON.parse(readFileSync('supabase/reconciliation/rc16g/manifest.json','utf8'))
test('RC16G hashes and dependency order are explicit and exclude Production-only patch', () => {
  assert.equal(verifyManifest(manifest),manifest)
  assert.throws(() => verifyManifest({ ...manifest,steps:[...manifest.steps].sort((a,b)=>a.version.localeCompare(b.version)) }))
})
test('RC16G refuses changed SQL or ledger plan before any database mutation', () => {
  assert.throws(() => verifyManifest({ ...manifest,steps:manifest.steps.map((s,i)=>i===1?{...s,sha256:'0'.repeat(64)}:s) }))
  assert.throws(() => verifyManifest({ ...manifest,target:'production' }))
})
test('RC16G reconciliation files are unique and excluded from automatic db push discovery', () => {
  const auto = readdirSync('supabase/migrations')
  for (const step of manifest.steps.filter(s=>s.path.includes('/reconciliation/'))) {
    assert.ok(!auto.some(f=>f.startsWith(step.version)))
  }
  const snapshot = JSON.parse(readFileSync('tests/fixtures/rc16g_staging_catalog.json','utf8'))
  assert.equal(snapshot.rpc.length,3)
  assert.ok(snapshot.functions.some(f=>f.signature==='private.require_shift_actor(boolean)' && f.definition.includes('OPERATION_NOT_ALLOWED')))
  assert.ok(snapshot.functions.some(f=>f.signature==='private.assert_shift_staffing_consistent(shifts)' && f.definition.includes('SHIFT_CONFLICT')))
})
