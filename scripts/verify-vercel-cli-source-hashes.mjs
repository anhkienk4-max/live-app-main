import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

// Attest immutable reference source, not intentionally modified UI candidate HEAD.
// Vercel's listed file UID is SHA-1 of uploaded bytes. The CLI's Windows uploads
// can have mixed LF/CRLF blocks. Every accepted variant must hash EXACTLY.
const manifest = JSON.parse(readFileSync('docs/releases/VERCEL_CLI_RC19_SOURCE_SHA1_MANIFEST_20261028.json', 'utf8'))
assert.equal(manifest.referenceCommit, '1b96f38a17768e96b92f23056efba4b61cc76f84')
assert.equal(manifest.deploymentId, 'dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ')
assert.ok(manifest.files.length >= 500, 'Vercel inventory unexpectedly small')
const base = manifest.referenceCommit
const git = (...args) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 })
const tracked = new Set(git('ls-tree', '-r', '--name-only', base).toString('utf8').split(/\r?\n/).filter(Boolean))
const sha1 = data => createHash('sha1').update(data).digest('hex')
const asBytes = text => Buffer.from(text, 'utf8')

function exactContentMatch(data, expected) {
  if (sha1(data) === expected) return 'raw'
  const source = data.toString('utf8')
  if (source.includes('\uFFFD')) return null // do not normalize non-UTF8 files
  const lf = source.replace(/\r\n/g, '\n')
  if (sha1(asBytes(lf)) === expected) return 'lf'
  if (sha1(asBytes(lf.replace(/\n/g, '\r\n'))) === expected) return 'crlf'
  // One end-of-line boundary in either direction, as observed in the CLI
  // uploaded RC19 Playwright and pnpm workspace files. Hash the whole content.
  for (let i = 0; i < lf.length; i++) {
    if (lf[i] !== '\n') continue
    const prefix = lf.slice(0, i), suffix = lf.slice(i)
    if (sha1(asBytes(prefix + suffix.replace(/\n/g, '\r\n'))) === expected) return 'lf-then-crlf'
    if (sha1(asBytes(prefix.replace(/\n/g, '\r\n') + suffix)) === expected) return 'crlf-then-lf'
  }
  return null
}
function isEphemeral(path) {
  return path.startsWith('supabase/.temp/') ||
    path.startsWith('test-results/') ||
    path.startsWith('test_reports/') ||
    path === 'tsconfig.tsbuildinfo'
}

const mismatch = [], ephemeral = [], modes = {}
let matched = 0, trackedTotal = 0
for (const { path: file, sha1: expected } of manifest.files) {
  if (!file || file.startsWith('/') || file.includes('..') || file.includes('\\')) {
    mismatch.push({ file, type: 'unsafe_manifest_path' })
    continue
  }
  if (!tracked.has(file)) {
    if (isEphemeral(file)) ephemeral.push(file)
    else mismatch.push({ file, type: 'untracked_source_file' })
    continue
  }
  trackedTotal++
  const content = git('show', base + ':' + file)
  const mode = exactContentMatch(content, expected)
  if (mode) {
    matched++
    modes[mode] = (modes[mode] ?? 0) + 1
  } else mismatch.push({ file, type: 'tracked_source_sha1_mismatch' })
}
console.log(JSON.stringify({
  referenceCommit: base, deployment: manifest.deploymentId,
  listed: manifest.files.length, tracked: trackedTotal, matches: matched,
  exactByteModes: modes, excludedEphemeralUploadFiles: ephemeral.length,
  mismatches: mismatch.length, inventoryCompleteness: 'PARTIAL; Vercel listing was truncated',
}))
if (ephemeral.length) console.log('Non-source CLI upload artifacts: ' + JSON.stringify(ephemeral))
if (mismatch.length) {
  console.error('NO-GO Production source discrepancies: ' + JSON.stringify(mismatch.slice(0,40)))
  process.exitCode = 1
}
