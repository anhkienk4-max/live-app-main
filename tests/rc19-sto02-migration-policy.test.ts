import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const proposalRoot = 'supabase/proposals/rc19-sto02-resource-registry'

test('STO-02 schema stays review-only and outside Supabase migration discovery', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, proposalRoot, 'manifest.json'), 'utf8')) as {
    status: string; auto_apply: boolean; target_environment: string | null
    migration_proposal: string; preflight: string; approval_required_before_release: boolean
  }
  assert.equal(manifest.status, 'REVIEW_ONLY_NOT_APPLIED')
  assert.equal(manifest.auto_apply, false)
  assert.equal(manifest.target_environment, null)
  assert.equal(manifest.approval_required_before_release, true)
  assert.equal(manifest.migration_proposal, `${proposalRoot}/20261027150000_rc19_sto02_resource_registry.sql`)
  assert.equal(manifest.preflight, `${proposalRoot}/preflight.sql`)
  assert.equal(fs.existsSync(path.join(root, 'supabase/migrations/20261027150000_rc19_sto02_resource_registry.sql')), false)

  const preflight = fs.readFileSync(path.join(root, manifest.preflight), 'utf8')
  assert.match(preflight, /public\.operational_storage_routes/)
  assert.match(preflight, /schema_migrations/)
  assert.doesNotMatch(preflight, /\b(create|alter|drop|insert|update|delete|truncate|grant|revoke)\s+(table|schema|function|policy|trigger|index|into|set|on|all)\b/i)
})
