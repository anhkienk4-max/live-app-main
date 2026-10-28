import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

/**
 * Compare the immutable Vercel CLI deployment inventory against the original
 * RC19 Git commit, NOT this intentionally changed UI release candidate HEAD.
 *
 * Vercel file uids equal SHA-1 of the uploaded bytes. CLI uploads may carry
 * Windows CRLF while GitHub has normalized LF. Never use this logic to
 * silently dismiss tracked source mismatches or to claim exhaustive parity:
 * Vercel's file-list API returns only a partial inventory.
 */
const manifest = JSON.parse(readFileSync('docs/releases/VERCEL_CLI_RC19_SOURCE_SHA1_MANIFEST_20261028.json', 'utf8'))
assert.equal(manifest.referenceCommit, '1b96f38a17768e96b92f23056efba4b61cc76f84')
assert.equal(manifest.deploymentId, 'dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ')
assert.ok(manifest.files.length >= 500, 'Insufficient source hash inventory')

const base = manifest.referenceCommit
const git = (...args) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 })
const tracked = new Set(git('ls-tree', '-r', '--name-only', base).toString('utf8').split(/\r?\n/).filter(Boolean))
const hash = input => createHash('sha1').update(input).digest('hex')
const ignoredBuildArtifact = p =>
  p.startsWith('supabase/.temp/') ||
  p.startsWith('test-results/') ||
  p.startsWith('test_reports/') ||
  p === 'tsconfig.tsbuildinfo'

const mismatch = []
const untrackedArtifacts = []
let matched = 0
let trackedTotal = 0

for (const item of manifest.files) {
  const p = item.path
  if (!p || p.startsWith('/') || p.includes('..') || p.includes('\\')) {
    mismatch.push({ path: p, type: 'unsafe_manifest_path' })
    continue
  }
  if (!tracked.has(p)) {
    if (ignoredBuildArtifact(p)) untrackedArtifacts.push(p)
    else mismatch.push({ path: p, type: 'unexpected_untracked_source' })
    continue
  }
  trackedTotal++
  const content = git('show', base + ':' + p)
  const actual = hash(content)
  const crlf = hash(Buffer.from(content.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8'))
  if (actual === item.sha1 || crlf === item.sha1) matched++
  else mismatch.push({ path: p, type: 'immutable_source_hash_mismatch' })
}

const result = {
  deployment: manifest.deploymentId,
  referenceCommit: base,
  listed: manifest.files.length,
  tracked: trackedTotal,
  exactMatches: matched,
  excludedEphemeralArtifacts: untrackedArtifacts.length,
  differences: mismatch.length,
  coverage: 'PARTIAL: Vercel inventory response omits or truncates other source paths',
}
console.log(JSON.stringify(result))
if (untrackedArtifacts.length) {
  console.log('Non-source temporary files present in the original CLI upload: ' + JSON.stringify(untrackedArtifacts))
}
if (mismatch.length) {
  console.error('NO-GO: immutable RC19 baseline differs from deployed CLI files: ' + JSON.stringify(mismatch.slice(0,40)))
  process.exitCode = 1
}
