import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const branch = 'release/rc19-c5.4-candidate'
const manifestPath = 'scripts/rc19-c4-migration-rehearsal/evidence/c5.3-final-migration-manifest.json'
const manifest = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'))
const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const deploymentEnabled = config.git?.deploymentEnabled
const entries = manifest.entries

assert.equal(manifest.forward_migration_count, 20)
assert.equal(entries.length, 20)
assert.equal(manifest.production_sql_authorized, false)
assert.deepEqual(manifest.executable_allowlist, [])
assert.equal(deploymentEnabled?.[branch], false)
assert(Object.values(deploymentEnabled).every(value => value === false), 'Every branch override must disable deployments')

const seenFiles = new Set()
const seenVersions = new Set()
for (const [index, entry] of entries.entries()) {
  assert.equal(entry.order, index + 1, 'Unexpected migration order at position ' + (index + 1))
  assert.match(entry.version, /^\d{14}$/)
  assert.equal(path.basename(entry.file).slice(0, 14), entry.version)
  assert(!path.isAbsolute(entry.file) && !entry.file.split(/[\\/]/).includes('..'))
  assert(!seenFiles.has(entry.file), 'Duplicate migration path: ' + entry.file)
  assert(!seenVersions.has(entry.version), 'Duplicate migration version: ' + entry.version)
  assert.match(entry.sha256, /^[a-f0-9]{64}$/)
  seenFiles.add(entry.file)
  seenVersions.add(entry.version)

  const sql = readFileSync(path.join(root, entry.file))
  const canonicalSql = Buffer.from(sql.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8')
  assert.equal(
    createHash('sha256').update(canonicalSql).digest('hex'),
    entry.sha256,
    'Migration checksum mismatch: ' + entry.file,
  )
}

assert(!seenFiles.has(manifest.runtime_compatibility.contract_migration_file))
assert(manifest.runtime_compatibility.contract_migration_file.endsWith('20261108135227_rc19_dashboard_image_private_contract.sql'))

const workflowPath = '.github/workflows/rc19-c54-exact-sha-gate.yml'
const workflow = readFileSync(path.join(root, workflowPath), 'utf8')
assert.match(workflow, /on:\r?\n  push:\r?\n    branches:\r?\n      - release\/rc19-c5\.4-candidate/m)
assert.match(workflow, /permissions:\r?\n  contents: read/m)
assert.match(workflow, /GITHUB_SHA/)
assert.match(workflow, /git rev-parse HEAD/)
assert.match(workflow, /verify-c54-release-gate\.mjs/)
assert(!workflow.includes('workflow_dispatch'), 'The release gate is push-triggered on the candidate branch')
assert(!/\$\{\{\s*secrets\./i.test(workflow), 'Release gate must not use repository secrets')
assert(!/\bvercel\s+(?:deploy|promote|alias)\b|\bsupabase\s+db\s+push\b/i.test(workflow))

const actionRefs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?\s*$/gm)].map(([, ref]) => ref)
assert(actionRefs.length > 0)
for (const ref of actionRefs) {
  assert.match(ref, /^[^@]+@[a-f0-9]{40}$/i, 'Action must be pinned to an immutable commit SHA: ' + ref)
}

console.log(JSON.stringify({
  candidateBranch: branch,
  config: 'vercel.json',
  branchDeploymentDisabled: true,
  manifest: manifestPath,
  migrationsVerified: entries.length,
  privateContractExcluded: true,
  productionExecutionAllowlistEmpty: true,
  workflow: workflowPath,
  workflowActionRefsPinned: actionRefs.length,
}, null, 2))
