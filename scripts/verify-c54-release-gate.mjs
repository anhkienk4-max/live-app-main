import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const branch = 'release/rc19-c5.4-candidate'
const manifestPath = 'scripts/rc19-c4-migration-rehearsal/evidence/c5.3-final-migration-manifest.json'
const manifest = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'))
const extensionPath = 'scripts/rc19-c4-migration-rehearsal/evidence/c5.13-forward-migration-extension.json'
const extension = JSON.parse(readFileSync(path.join(root, extensionPath), 'utf8'))
const config = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'))
const deploymentEnabled = config.git?.deploymentEnabled
const entries = manifest.entries
const canonicalTextSha256 = (file) => createHash('sha256')
  .update(Buffer.from(readFileSync(path.join(root, file), 'utf8').replace(/\r\n?/g, '\n'), 'utf8'))
  .digest('hex')

assert.equal(manifest.forward_migration_count, 20)
assert.equal(entries.length, 20)
assert.equal(manifest.production_sql_authorized, false)
assert.deepEqual(manifest.executable_allowlist, [])
assert.equal(extension.base_manifest_file, manifestPath)
assert.equal(extension.base_manifest_sha256_canonicalization, 'UTF-8 bytes after CRLF/CR to LF normalization')
assert.equal(extension.base_manifest_sha256, canonicalTextSha256(manifestPath))
assert.equal(extension.base_migration_count, entries.length)
assert.equal(extension.total_forward_migration_count, entries.length + extension.entries.length)
assert.equal(extension.total_forward_migration_count, 22)
assert.equal(extension.production_sql_authorized, false)
assert.deepEqual(extension.executable_allowlist, [])
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

const extensionFiles = new Set()
for (const [index, entry] of extension.entries.entries()) {
  assert.equal(entry.order, entries.length + index + 1, 'Unexpected extended migration order at position ' + (entries.length + index + 1))
  assert.match(entry.version, /^\d{14}$/)
  assert.equal(path.basename(entry.file).slice(0, 14), entry.version)
  assert(!path.isAbsolute(entry.file) && !entry.file.split(/[\\/]/).includes('..'))
  assert(!seenFiles.has(entry.file) && !extensionFiles.has(entry.file), 'Duplicate migration path: ' + entry.file)
  assert(!seenVersions.has(entry.version), 'Duplicate migration version: ' + entry.version)
  assert.match(entry.sha256, /^[a-f0-9]{64}$/)
  const sql = readFileSync(path.join(root, entry.file))
  const canonicalSql = Buffer.from(sql.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8')
  assert.equal(createHash('sha256').update(canonicalSql).digest('hex'), entry.sha256, 'Migration checksum mismatch: ' + entry.file)
  extensionFiles.add(entry.file)
  seenVersions.add(entry.version)
}
assert.deepEqual([...extensionFiles], [
  'supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql',
  'supabase/migrations/20261109131324_rc19_c512_attendance_photo_review.sql',
])
assert.equal(extension.entries[1].depends_on, extension.entries[0].version)
assert.equal(extension.review_test, 'tests/rc19-attendance-photo-review.test.ts')
assert.equal(extension.rehearsal_evidence.file, 'scripts/rc19-c4-migration-rehearsal/evidence/c5.11-local-pg1711/isolated-db-20261109T165754Z.json')
assert.equal(extension.rehearsal_evidence.sha256_canonicalization, 'UTF-8 bytes after CRLF/CR to LF normalization')
assert.equal(extension.rehearsal_evidence.sha256, canonicalTextSha256(extension.rehearsal_evidence.file))
assert.equal(extension.rehearsal_evidence.postgres_server_version_num, '170011')
assert.equal(extension.rehearsal_evidence.persisted_e2e_sha256, canonicalTextSha256(extension.rehearsal_evidence.persisted_e2e_evidence))
assert.match(extension.persisted_e2e_source_provenance.head_sha, /^[a-f0-9]{40}$/)
assert.match(extension.persisted_e2e_source_provenance.tracked_diff_sha256, /^[a-f0-9]{64}$/)
assert.deepEqual(extension.persisted_e2e_source_provenance.tracked_diff_paths, [
  'lib/server/workforcePayrollHandler.ts',
  'scripts/rc19-c4-migration-rehearsal/run-c5.11-isolated-db.py',
  'scripts/rc19-c4-migration-rehearsal/run-c5.11-persisted-e2e.ps1',
  'scripts/rc19-c4-migration-rehearsal/start-c5.11-local-auth-runtime.py',
  'tests/rc19-c511-persisted-e2e.test.ts',
])

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
  followOnMigrationsVerified: extension.entries.length,
  totalForwardMigrationsVerified: extension.total_forward_migration_count,
  privateContractExcluded: true,
  productionExecutionAllowlistEmpty: true,
  workflow: workflowPath,
  workflowActionRefsPinned: actionRefs.length,
}, null, 2))
