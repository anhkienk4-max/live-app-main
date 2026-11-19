import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertPinnedCliVersion,
  buildSafePsqlEnv,
  parseCliVersion,
  PINNED_SUPABASE_CLI_VERSIONS,
  PRODUCTION_CONFIRM_TARGET,
  PRODUCTION_SUPABASE_PROJECT_REF,
  redactSecrets,
  validateProductionReleaseGates,
  validateTargetIdentity,
} from '../scripts/rc19-c4-migration-rehearsal/run-production-supabase-cli-migrations.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const RUNNER_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'rc19-c4-migration-rehearsal',
  'run-production-supabase-cli-migrations.mjs',
)
const HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()

function buildPassingAttestation(overrides = {}) {
  return {
    environment_policy: 'PRODUCTION_ONLY',
    cutover_status: 'APPROVED_FOR_CUTOVER',
    owner_cutover_approved: true,
    candidate_sha: HEAD_SHA,
    migration_gate: {
      status: 'PASS',
      semantic_parity_verified: true,
      ci_verified: true,
      privilege_widening: false,
    },
    recovery_gate: {
      status: 'PASS',
      target_project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
      baseline_receipts_covered: 117,
      restore_verified: true,
      legacy_85_migration_backup_used: false,
    },
    acl_preflight_gate: {
      status: 'PASS',
      checkin_and_checkout_verified: true,
      public_content_exposure: false,
    },
    ...overrides,
  }
}

test('CLI version pin accepts pinned 3.1.0/3.2.0 even with multi-line update nag banner and rejects others', () => {
  assert.deepEqual(PINNED_SUPABASE_CLI_VERSIONS, ['3.1.0', '3.2.0'])

  const nagOutput = '3.1.0\nA new version of Supabase CLI is available: v3.2.0 (currently installed v3.1.0)\n'
  const parsedNag = parseCliVersion(nagOutput)
  assert.equal(parsedNag, '3.1.0')
  assert.equal(assertPinnedCliVersion(parsedNag), '3.1.0')
  assert.equal(assertPinnedCliVersion(parseCliVersion('v3.2.0\n')), '3.2.0')
  assert.equal(assertPinnedCliVersion('3.2.0', '3.2.0'), '3.2.0')

  assert.throws(() => parseCliVersion(''), /SUPABASE_CLI_VERSION_UNPARSEABLE/)
  assert.throws(() => parseCliVersion('supabase version unknown'), /SUPABASE_CLI_VERSION_UNPARSEABLE/)
  assert.throws(() => assertPinnedCliVersion('2.122.1'), /SUPABASE_CLI_VERSION_NOT_PINNED/)
  assert.throws(() => assertPinnedCliVersion('3.3.0'), /SUPABASE_CLI_VERSION_NOT_PINNED/)
  assert.throws(() => assertPinnedCliVersion('3.1.0', '3.2.0'), /SUPABASE_CLI_VERSION_MISMATCH/)
})

test('Production target identity guard accepts valid Production DSN and fails closed on mismatch or insecure TLS', () => {
  const direct = validateTargetIdentity({
    dbUrl: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    targetMode: 'production',
    confirmTarget: PRODUCTION_CONFIRM_TARGET,
    execute: true,
    envPassword: 'secret-value-not-logged',
  })
  assert.equal(direct.projectRef, PRODUCTION_SUPABASE_PROJECT_REF)
  assert.equal(direct.sslmode, 'require')
  assert.ok(!direct.passwordlessUrl.includes('secret-value-not-logged'))

  const pooler = validateTargetIdentity({
    dbUrl: `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    targetMode: 'production',
    confirmTarget: PRODUCTION_CONFIRM_TARGET,
    execute: true,
    envPassword: 'pooler-secret-password',
  })
  assert.equal(pooler.sslmode, 'require')
  assert.equal(pooler.dbName, 'postgres')

  assert.throws(
    () => validateTargetIdentity({ dbUrl: 'postgresql://postgres@127.0.0.1:5432/postgres', targetMode: 'production' }),
    /TARGET_IDENTITY_MISMATCH/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: 'postgresql://postgres.amagnzebmmuqiptmrjmc@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres',
        targetMode: 'production',
      }),
    /TARGET_IDENTITY_MISMATCH/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: 'postgresql://postgres@db.otherprojectref.supabase.co:5432/postgres',
        targetMode: 'production',
      }),
    /TARGET_IDENTITY_MISMATCH/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/other_db`,
        targetMode: 'production',
      }),
    /TARGET_IDENTITY_MISMATCH/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres.wrongref@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
        targetMode: 'production',
      }),
    /TARGET_IDENTITY_MISMATCH/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=disable`,
        targetMode: 'production',
      }),
    /PRODUCTION_TLS_REQUIRED/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
        targetMode: 'production',
        execute: true,
        confirmTarget: 'free-form-confirmation',
      }),
    /TARGET_CONFIRMATION_MISMATCH/,
  )
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
        targetMode: 'production',
        allowFaultInjectionWorkdir: true,
      }),
    /FORBIDDEN_IN_PRODUCTION_MODE/,
  )
})

test('Local disposable mode permits loopback DB only and rejects remote Supabase targets', () => {
  const local = validateTargetIdentity({
    dbUrl: 'postgresql://postgres@127.0.0.1:55459/rc19_w4_baseline',
    targetMode: 'local-disposable',
    confirmTarget: 'LOCAL_DISPOSABLE',
    execute: true,
  })
  assert.equal(local.hostname, '127.0.0.1')
  assert.equal(local.dbName, 'rc19_w4_baseline')

  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
        targetMode: 'local-disposable',
      }),
    /TARGET_IDENTITY_MISMATCH/,
  )
})

test('Zero credential exposure: rejects CLI argv passwords, isolates PGPASSWORD env, and scrubs secrets', () => {
  const secretPass = 'VerySecret!Pass#2026'
  assert.throws(
    () =>
      validateTargetIdentity({
        dbUrl: `postgresql://postgres:${encodeURIComponent(secretPass)}@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
        targetMode: 'production',
        dbUrlFromArgv: true,
      }),
    /CREDENTIAL_IN_CLI_ARGV_FORBIDDEN/,
  )

  const target = validateTargetIdentity({
    dbUrl: `postgresql://postgres:${encodeURIComponent(secretPass)}@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
    targetMode: 'production',
  })
  const env = buildSafePsqlEnv({ PATH: process.env.PATH, SUPABASE_DB_URL: 'should-be-stripped' }, target, target.password)
  assert.equal(env.SUPABASE_DB_URL, undefined)
  assert.equal(env.PGPASSWORD, secretPass)
  assert.equal(env.PGSSLMODE, 'require')
  assert.equal(env.PGDATABASE, 'postgres')

  const fakeSupaToken = ['sbp', '1234567890abcdef'].join('_')
  const fakeJwt = ['eyJ' + 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'aaaa', 'bbbb'].join('.')
  const noisy = `error at postgresql://postgres:${encodeURIComponent(secretPass)}@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres ${fakeSupaToken} Bearer ${fakeJwt} ${secretPass}`
  const scrubbed = redactSecrets(noisy, [secretPass])
  assert.ok(!scrubbed.includes(secretPass))
  assert.ok(!scrubbed.includes(encodeURIComponent(secretPass)))
  assert.ok(!scrubbed.includes(fakeSupaToken))
  assert.ok(!scrubbed.includes('eyJ' + 'hbGci'))

  const proc = spawnSync(
    process.execPath,
    [
      RUNNER_PATH,
      '--target=production',
      `--db-url=postgresql://postgres:${encodeURIComponent(secretPass)}@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(proc.status, 2)
  const combined = `${proc.stdout}\n${proc.stderr}`
  assert.match(combined, /CREDENTIAL_IN_CLI_ARGV_FORBIDDEN/)
  assert.ok(!combined.includes(secretPass))
  assert.ok(!combined.includes(encodeURIComponent(secretPass)))
})

test('Release gate enforcement blocks Production --execute until all Migration, Recovery, and ACL gates PASS', () => {
  const valid = validateProductionReleaseGates(buildPassingAttestation(), HEAD_SHA)
  assert.equal(valid.ok, true)

  assert.throws(
    () => validateProductionReleaseGates(buildPassingAttestation({ cutover_status: 'NO_GO_HOLD' }), HEAD_SHA),
    /RELEASE_GATES_NOT_PASSED/,
  )
  assert.throws(
    () =>
      validateProductionReleaseGates(
        buildPassingAttestation({
          migration_gate: { status: 'BLOCKED', semantic_parity_verified: false, ci_verified: true, privilege_widening: false },
        }),
        HEAD_SHA,
      ),
    /RELEASE_GATES_NOT_PASSED/,
  )
  assert.throws(
    () =>
      validateProductionReleaseGates(
        buildPassingAttestation({
          recovery_gate: {
            status: 'PASS',
            target_project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
            baseline_receipts_covered: 85,
            restore_verified: false,
            legacy_85_migration_backup_used: true,
          },
        }),
        HEAD_SHA,
      ),
    /RELEASE_GATES_NOT_PASSED/,
  )
  assert.throws(
    () =>
      validateProductionReleaseGates(
        buildPassingAttestation({
          acl_preflight_gate: { status: 'BLOCKED', checkin_and_checkout_verified: false, public_content_exposure: true },
        }),
        HEAD_SHA,
      ),
    /RELEASE_GATES_NOT_PASSED/,
  )
  assert.throws(
    () => validateProductionReleaseGates(buildPassingAttestation({ candidate_sha: '0'.repeat(40) }), HEAD_SHA),
    /RELEASE_GATES_NOT_PASSED/,
  )

  const proc = spawnSync(
    process.execPath,
    [RUNNER_PATH, '--target=production', '--execute', `--confirm-target=${PRODUCTION_CONFIRM_TARGET}`],
    {
      env: {
        ...process.env,
        SUPABASE_DB_URL: `postgresql://postgres@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
        SUPABASE_DB_PASSWORD: 'DummySuperSecretPassword99!',
      },
      encoding: 'utf8',
    },
  )
  assert.equal(proc.status, 2)
  const combined = `${proc.stdout}\n${proc.stderr}`
  assert.match(combined, /RELEASE_GATE_ATTESTATION_REQUIRED/)
  assert.ok(!combined.includes('DummySuperSecretPassword99!'))
})
