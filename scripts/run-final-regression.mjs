import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('tests/final-release-test-manifest.json', 'utf8'))
const inventory = readdirSync('tests').filter(name => /\.test\.(ts|tsx)$/.test(name))
  .sort().map(name => `tests/${name}`)
assert.deepEqual([...manifest.node_test_files].sort(), inventory, 'Release manifest must include every TS/TSX test file')
const optionalStagingChecks = new Set([
  'Account Request Phase 2 staging runtime contract',
  'existing Auth identity provisions one linked member Staff row without FK failure',
  'real staging API enforces Member privacy and preserves privileged reads/revision history',
])
const hasSkippedTests = output => {
  const skipped = [...output.matchAll(/^ok \d+ - (.*?) # SKIP(.*)$/gm)]
  const count = Number(output.match(/^# skipped (\d+)$/m)?.[1] || 0)
  return skipped.length !== count || skipped.some(([, name, reason]) =>
    !optionalStagingChecks.has(name) || !/staging/i.test(reason))
}
assert.equal(hasSkippedTests('# skipped 0'), false)
assert.equal(hasSkippedTests('# skipped 3'), true)
assert.equal(hasSkippedTests('ok 1 - Account Request Phase 2 staging runtime contract # SKIP opt-in staging\n# skipped 1'), false)
assert.equal(hasSkippedTests('ok 1 - unknown # SKIP staging\n# skipped 1'), true)
assert.equal(hasSkippedTests('# pass 3'), false)

const child = spawn(process.execPath, ['--import', './tests/typescript-alias-loader.mjs',
  '--test', '--test-concurrency=4', '--test-reporter=tap', ...inventory], { stdio: ['ignore', 'pipe', 'inherit'] })
let output = ''
child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('close', code => {
  if (hasSkippedTests(output)) console.error('Release regression BLOCKED: unexplained or required skipped tests.')
  else if (/^# skipped [1-9]/m.test(output)) console.log('Only explicitly named opt-in staging tests skipped; direct Production release has no staging prerequisite.')
  process.exitCode = code === 0 && !hasSkippedTests(output) ? 0 : 1
})