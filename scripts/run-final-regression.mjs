import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('tests/final-release-test-manifest.json', 'utf8'))
const inventory = readdirSync('tests').filter(name => /\.test\.(ts|tsx)$/.test(name))
  .sort().map(name => `tests/${name}`)
assert.deepEqual([...manifest.node_test_files].sort(), inventory, 'Release manifest must include every TS/TSX test file')
const selectedInventory = process.argv.includes('--exclude-postgres17')
  ? inventory.filter(file => !file.toLowerCase().includes('postgres17'))
  : inventory
const concurrencyArg = process.argv.find(argument => /^--test-concurrency=\d+$/.test(argument))
const testConcurrency = Number(concurrencyArg?.split('=')[1] ?? 4)
if (!Number.isInteger(testConcurrency) || testConcurrency < 1 || testConcurrency > 16) {
  throw new Error('Canonical test concurrency must be between 1 and 16')
}
assert.ok(selectedInventory.length > 0, 'Release regression must include test files')
if (selectedInventory.length !== inventory.length) {
  console.log(`PostgreSQL 17 integration files are delegated to dedicated disposable database gates (${inventory.length - selectedInventory.length}).`)
}
const optionalStagingChecks = new Set([
  'Account Request Phase 2 staging runtime contract',
  'existing Auth identity provisions one linked member Staff row without FK failure',
  'real staging API enforces Member privacy and preserves privileged reads/revision history',
])
const persistedE2e = 'tests/rc19-c511-persisted-e2e.test.ts'
const isolatedRuntimeEnv = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
  'C511_BASE_URL', 'C511_ANON_KEY', 'C511_SERVICE_ROLE_KEY', 'C511_TEST_PASSWORD', 'C511_DATABASE',
  'C511_LOCAL_JWT_SECRET',
  'C511_AUTH_USERS_BEFORE', 'C511_STORAGE_OBJECTS_BEFORE',
  'C511_EVIDENCE_DIR', 'C511_POSTGRES_VERSION', 'C511_AUTH_PORT', 'C511_REST_PORT', 'C511_MIGRATION_SHA256', 'C512_MIGRATION_SHA256',
  'C515_SECONDS_MIGRATION_SHA256', 'C515_APPROVAL_MIGRATION_SHA256',
  'C515_OT_CANCELLATION_MIGRATION_SHA256', 'C515_LIVE_CANCELLATION_MIGRATION_SHA256',
  'C511_SOURCE_SHA', 'FEATURE_SELF_ATTENDANCE_PHOTO', 'FILE_STORAGE_ENABLED', 'FEATURE_SELF_ATTENDANCE_REVIEW',
]
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

const stripReactServerCondition = value => (value || '')
  .replace(/(?:^|\s)--conditions(?:=|\s+)react-server(?=\s|$)/g, ' ')
  .replace(/\s+/g, ' ').trim()
const addReactServerCondition = value => [stripReactServerCondition(value), '--conditions=react-server'].filter(Boolean).join(' ')
const signLocalJwt = (secret, role, issuedAt) => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'supabase', aud: 'authenticated', iat: issuedAt, exp: issuedAt + 3600, role,
  })}`
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
}
const freshPersistedEnv = env => {
  const secret = env.C511_LOCAL_JWT_SECRET
  if (!secret) return env
  const issuedAt = Math.floor(Date.now() / 1000)
  const anonKey = signLocalJwt(secret, 'anon', issuedAt)
  const serviceRoleKey = signLocalJwt(secret, 'service_role', issuedAt)
  const refreshed = {
    ...env,
    C511_ANON_KEY: anonKey,
    C511_SERVICE_ROLE_KEY: serviceRoleKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SECRET_KEY: serviceRoleKey,
  }
  delete refreshed.C511_LOCAL_JWT_SECRET
  return refreshed
}
const runtimeReady = isolatedRuntimeEnv.every(key => Boolean(process.env[key]))

const parseSummary = output => {
  const read = key => Number(output.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1])
  const summary = { tests: read('tests'), pass: read('pass'), fail: read('fail'), skipped: read('skipped') }
  return Object.values(summary).every(Number.isFinite) ? summary : null
}
assert.equal(stripReactServerCondition('--conditions=react-server'), '')
assert.equal(stripReactServerCondition('--trace-warnings --conditions=react-server'), '--trace-warnings')
assert.equal(addReactServerCondition('--trace-warnings'), '--trace-warnings --conditions=react-server')
assert.deepEqual(parseSummary('# tests 4\n# pass 3\n# fail 0\n# skipped 1'), { tests: 4, pass: 3, fail: 0, skipped: 1 })

const run = (label, files, env) => new Promise(resolve => {
  console.log(`\n=== ${label} ===`)
  const child = spawn(process.execPath, ['--import', './tests/typescript-alias-loader.mjs',
    '--test', `--test-concurrency=${testConcurrency}`, '--test-reporter=tap', ...files], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk) })
  child.on('error', error => {
    console.error(`${label} process error: ${error.message}`)
    resolve({ code: 1, output })
  })
  child.on('close', code => resolve({ code: code ?? 1, output }))
})

const baseEnv = { ...process.env, NODE_OPTIONS: stripReactServerCondition(process.env.NODE_OPTIONS) }
let runs
if (runtimeReady && selectedInventory.includes(persistedE2e)) {
  const regularEnv = { ...baseEnv }
  for (const key of isolatedRuntimeEnv) delete regularEnv[key]
  const e2eEnv = { ...process.env, NODE_OPTIONS: addReactServerCondition(process.env.NODE_OPTIONS) }
  runs = [
    ['canonical regression (runtime isolated)', selectedInventory.filter(file => file !== persistedE2e), regularEnv],
    ['C5.11 persisted E2E (isolated runtime + react-server)', [persistedE2e], e2eEnv],
  ]
} else {
  runs = [['canonical regression', selectedInventory, baseEnv]]
  if (selectedInventory.includes(persistedE2e)) {
    console.log('C5.11 runtime is not configured; its required persisted test remains in the canonical run and will fail if unavailable.')
  }
}

const results = []
for (const [label, files, env] of runs) {
  const childEnv = label.startsWith('C5.11 persisted E2E') ? freshPersistedEnv(env) : env
  if (label.startsWith('C5.11 persisted E2E') && env.C511_LOCAL_JWT_SECRET) {
    const [header, payload] = childEnv.C511_SERVICE_ROLE_KEY.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    assert.equal(claims.role, 'service_role')
    assert.ok(claims.exp > Math.floor(Date.now() / 1000) + 3500, 'Persisted E2E JWT must be refreshed immediately before its child starts')
    assert.equal(childEnv.C511_LOCAL_JWT_SECRET, undefined, 'JWT signing secret must not be inherited by the test child')
    assert.ok(header)
  }
  results.push({ label, ...await run(label, files, childEnv) })
}

const summaries = results.map(result => ({ ...result, summary: parseSummary(result.output) }))
const combined = summaries.reduce((total, result) => {
  if (!result.summary) return total
  for (const key of Object.keys(total)) total[key] += result.summary[key]
  return total
}, { tests: 0, pass: 0, fail: 0, skipped: 0 })
const invalidSkip = summaries.some(result => !result.summary || hasSkippedTests(result.output) ||
  (result.label.startsWith('C5.11 persisted E2E') && result.summary.skipped !== 0))
const failedChild = summaries.some(result => result.code !== 0 || !result.summary)
console.log(`\n=== CANONICAL AGGREGATE ===\n# tests ${combined.tests}\n# pass ${combined.pass}\n# fail ${combined.fail}\n# skipped ${combined.skipped}`)
if (failedChild || invalidSkip || combined.fail !== 0) {
  console.error('Release regression BLOCKED: a child failed, a required test failed/skipped, or TAP summary was incomplete.')
  process.exitCode = 1
} else {
  if (combined.skipped) console.log('Only explicitly named opt-in staging tests skipped; persisted C5.11 E2E ran separately and passed.')
  process.exitCode = 0
}
