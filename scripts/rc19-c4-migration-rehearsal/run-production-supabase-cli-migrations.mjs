#!/usr/bin/env node
/**
 * Canonical Supabase CLI Migration Runner for RC19 W4 (13 Forward Migrations)
 *
 * Enforces:
 *   1. Pinned Supabase CLI versions (`3.1.0`, `3.2.0`) with strict version parsing.
 *   2. Production target identity guard (`egdjnpmoasarrttvhgds`, TLS required,
 *      exact `--confirm-target=PRODUCTION:egdjnpmoasarrttvhgds`), rejecting any
 *      non-Production project ref or unapproved `--target=local-disposable` mismatch.
 *   3. Release gate attestation enforcement before Production `--execute`
 *      (requires `PRODUCTION_ONLY`, `APPROVED_FOR_CUTOVER`, Migration + Recovery
 *      + ACL Preflight PASS, and matching HEAD candidate SHA).
 *   4. Explicit 13-version W4 allowlist (`20261112000000` .. `20261118150000`),
 *      ZERO manual INSERTs into `supabase_migrations.schema_migrations`.
 *   5. Zero credential exposure in argv, stdout, stderr, or JSON artifacts.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const DEFAULT_MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')
const CONFIG_TOML_PATH = path.join(REPO_ROOT, 'supabase', 'config.toml')

export const PINNED_SUPABASE_CLI_VERSIONS = Object.freeze(['3.1.0', '3.2.0'])
export const PRODUCTION_SUPABASE_PROJECT_REF = 'egdjnpmoasarrttvhgds'
export const PRODUCTION_CONFIRM_TARGET = 'PRODUCTION:egdjnpmoasarrttvhgds'
export const LOCAL_DISPOSABLE_CONFIRM_TARGET = 'LOCAL_DISPOSABLE'
export const FORBIDDEN_NON_PRODUCTION_REFS = Object.freeze(['amagnzebmmuqiptmrjmc'])

export const W4_ALLOWED_MIGRATIONS = [
  '20261112000000_rc19_c2_calendar_overlap_range.sql',
  '20261112120000_rc19_audit_history_keyset.sql',
  '20261112130000_rc19_c6_import_source_reconciliation.sql',
  '20261113083000_rc19_c4_audit_dependency.sql',
  '20261113084154_rc19_c4_atomic_staffing_replacement.sql',
  '20261115120000_rc19_w4_legacy_segment_compatibility.sql',
  '20261115130000_rc19_w4_segmented_manual_assignment.sql',
  '20261115140000_rc19_w4_pass_swap_segment_preservation.sql',
  '20261115174231_rc19_w4_retire_unguarded_swap_approval.sql',
  '20261116120000_rc19_w4_swap_preflight_and_segment_capacity.sql',
  '20261117160000_rc19_w4_pass_recipient_visibility.sql',
  '20261118140000_rc19_w4_atomic_overtime_payroll_sync.sql',
  '20261118150000_rc19_w4_overtime_payroll_defect_fixes.sql',
]

const REQUIRED_BASELINE_VERSIONS = ['20261110140000', '20261111000000', '20261111200000']
const CANDIDATE_VERSIONS = W4_ALLOWED_MIGRATIONS.map((f) => f.split('_')[0])
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const INSECURE_SSLMODES = new Set(['disable', 'allow', 'prefer'])

export class RunnerGuardError extends Error {
  constructor(code, message, details = null) {
    super(message && message !== code ? `${code}: ${message}` : code)
    this.name = 'RunnerGuardError'
    this.code = code
    this.details = details
  }
}

export function redactDbUrl(raw) {
  try {
    const u = new URL(raw)
    const userPart = u.username ? `${decodeURIComponent(u.username)}:****@` : ''
    return `${u.protocol}//${userPart}${u.host}${u.pathname}`
  } catch {
    return '<redacted-db-url>'
  }
}

export function redactSecrets(text, secretValues = []) {
  let output = String(text ?? '')
  if (!output) return ''
  for (const secret of secretValues) {
    if (typeof secret !== 'string' || secret.length < 3) continue
    for (const variant of new Set([secret, encodeURIComponent(secret)])) {
      if (variant.length >= 3) {
        output = output.split(variant).join('****')
      }
    }
  }
  output = output.replace(/(postgres(?:ql)?:\/\/)([^:@/\s]+):([^@\s]+)@/gi, '$1$2:****@')
  output = output.replace(/Bearer\s+[A-Za-z0-9._\-+=]{8,}/gi, 'Bearer ****')
  output = output.replace(/\bsbp_[0-9A-Za-z]+\b/g, 'sbp_****')
  output = output.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\b/g, 'eyJ****')
  const gClientSecretPrefix = ['GOC', 'SPX'].join('')
  output = output.replace(new RegExp(`${gClientSecretPrefix}-[0-9A-Za-z_-]+`, 'g'), '****')
  output = output.replace(/1\/\/[0-9A-Za-z_-]+/g, '1//****')
  return output
}

export function parseCliVersion(rawOutput) {
  const lines = String(rawOutput ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    throw new RunnerGuardError('SUPABASE_CLI_VERSION_UNPARSEABLE', 'Empty Supabase CLI version output')
  }
  const firstLine = lines[0].replace(/^v/i, '')
  const match = /^(\d+\.\d+\.\d+)$/.exec(firstLine)
  if (!match) {
    throw new RunnerGuardError(
      'SUPABASE_CLI_VERSION_UNPARSEABLE',
      `Unexpected Supabase CLI version format: ${lines[0]}`,
    )
  }
  return match[1]
}

export function assertPinnedCliVersion(version, requiredVersion = '') {
  if (!PINNED_SUPABASE_CLI_VERSIONS.includes(version)) {
    throw new RunnerGuardError(
      'SUPABASE_CLI_VERSION_NOT_PINNED',
      `Supabase CLI ${version} is not in pinned allowlist (${PINNED_SUPABASE_CLI_VERSIONS.join(', ')})`,
      { version, allowed: PINNED_SUPABASE_CLI_VERSIONS },
    )
  }
  const trimmedReq = String(requiredVersion ?? '').trim()
  if (trimmedReq) {
    if (!PINNED_SUPABASE_CLI_VERSIONS.includes(trimmedReq) || version !== trimmedReq) {
      throw new RunnerGuardError(
        'SUPABASE_CLI_VERSION_MISMATCH',
        `Expected pinned Supabase CLI ${trimmedReq}, got ${version}`,
        { version, requiredVersion: trimmedReq },
      )
    }
  }
  return version
}

function buildPasswordlessRemoteUrl(parsedUrl, sslmode) {
  const safe = new URL(parsedUrl.toString())
  safe.password = ''
  safe.searchParams.delete('password')
  if (sslmode) {
    safe.searchParams.set('sslmode', sslmode)
  }
  return safe.toString()
}

export function validateTargetIdentity({
  dbUrl,
  targetMode = 'production',
  confirmTarget = '',
  execute = false,
  dbUrlFromArgv = false,
  expectBaselineCount = 117,
  allowFaultInjectionWorkdir = false,
  migrationsSourceDir = DEFAULT_MIGRATIONS_DIR,
  envPassword = '',
  rawDbUrlArg = '',
}) {
  if (targetMode !== 'production' && targetMode !== 'local-disposable') {
    throw new RunnerGuardError(
      'INVALID_TARGET_MODE',
      `Unsupported --target mode "${targetMode}"; expected "production" or "local-disposable"`,
    )
  }

  const trimmedUrl = String(dbUrl ?? '').trim()
  if (!trimmedUrl) {
    throw new RunnerGuardError('SUPABASE_DB_URL_REQUIRED', 'Set SUPABASE_DB_URL env var (or --db-url without credentials)')
  }

  if (targetMode === 'production') {
    if (allowFaultInjectionWorkdir || path.resolve(migrationsSourceDir) !== path.resolve(DEFAULT_MIGRATIONS_DIR)) {
      throw new RunnerGuardError(
        'FORBIDDEN_IN_PRODUCTION_MODE',
        'Fault-injection or custom migration directories are forbidden in production mode',
      )
    }
    if (expectBaselineCount !== 117) {
      throw new RunnerGuardError(
        'FORBIDDEN_IN_PRODUCTION_MODE',
        `--expect-baseline-count must be exactly 117 in production mode (got ${expectBaselineCount})`,
      )
    }
    if (dbUrlFromArgv && /:[^:@/\s]+@/i.test(rawDbUrlArg || trimmedUrl)) {
      throw new RunnerGuardError(
        'CREDENTIAL_IN_CLI_ARGV_FORBIDDEN',
        'Passing DB passwords in CLI arguments (--db-url) is forbidden in production mode; use SUPABASE_DB_URL or SUPABASE_DB_PASSWORD env var',
      )
    }
  }

  let parsedUrl
  try {
    parsedUrl = new URL(trimmedUrl)
  } catch {
    throw new RunnerGuardError('INVALID_DB_URL', 'Database URL could not be parsed')
  }

  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new RunnerGuardError('TARGET_IDENTITY_MISMATCH', `Unsupported DB protocol "${parsedUrl.protocol}"`)
  }

  const lowerFull = trimmedUrl.toLowerCase()
  for (const forbiddenRef of FORBIDDEN_NON_PRODUCTION_REFS) {
    if (lowerFull.includes(forbiddenRef)) {
      throw new RunnerGuardError(
        'TARGET_IDENTITY_MISMATCH',
        `Forbidden non-Production project ref "${forbiddenRef}" detected in DB target`,
      )
    }
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  const port = parsedUrl.port || '5432'
  const dbName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''))
  const username = decodeURIComponent(parsedUrl.username || '')
  const urlPassword = parsedUrl.password ? decodeURIComponent(parsedUrl.password) : ''
  const password = urlPassword || String(envPassword ?? '')
  const rawSslmode = (parsedUrl.searchParams.get('sslmode') || '').toLowerCase()

  if (targetMode === 'production') {
    if (dbUrlFromArgv && urlPassword) {
      throw new RunnerGuardError(
        'CREDENTIAL_IN_CLI_ARGV_FORBIDDEN',
        'Passing DB passwords in CLI arguments (--db-url) is forbidden in production mode',
      )
    }
    if (LOOPBACK_HOSTS.has(hostname)) {
      throw new RunnerGuardError('TARGET_IDENTITY_MISMATCH', `Loopback host "${hostname}" rejected in production mode`)
    }
    if (dbName !== 'postgres') {
      throw new RunnerGuardError('TARGET_IDENTITY_MISMATCH', `Production database name must be "postgres" (got "${dbName}")`)
    }

    const expectedDirectHost = `db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
    const isPoolerHost = /^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(hostname)
    const userDotSuffix = username.includes('.') ? username.slice(username.lastIndexOf('.') + 1) : ''

    if (hostname === expectedDirectHost) {
      if (username.includes('.') && userDotSuffix !== PRODUCTION_SUPABASE_PROJECT_REF) {
        throw new RunnerGuardError(
          'TARGET_IDENTITY_MISMATCH',
          `Production direct host username suffix mismatch for ref ${PRODUCTION_SUPABASE_PROJECT_REF}`,
        )
      }
    } else if (isPoolerHost) {
      if (userDotSuffix !== PRODUCTION_SUPABASE_PROJECT_REF) {
        throw new RunnerGuardError(
          'TARGET_IDENTITY_MISMATCH',
          `Production pooler username must end with ".${PRODUCTION_SUPABASE_PROJECT_REF}"`,
        )
      }
    } else {
      throw new RunnerGuardError(
        'TARGET_IDENTITY_MISMATCH',
        `Host "${hostname}" does not match Supabase Production project ${PRODUCTION_SUPABASE_PROJECT_REF}`,
      )
    }

    if (rawSslmode && INSECURE_SSLMODES.has(rawSslmode)) {
      throw new RunnerGuardError(
        'PRODUCTION_TLS_REQUIRED',
        `Insecure sslmode="${rawSslmode}" rejected in production mode; use require, verify-ca, or verify-full`,
      )
    }
    const resolvedSslmode = rawSslmode || 'require'

    if (execute && confirmTarget !== PRODUCTION_CONFIRM_TARGET) {
      throw new RunnerGuardError(
        'TARGET_CONFIRMATION_MISMATCH',
        `Production --execute requires exact --confirm-target=${PRODUCTION_CONFIRM_TARGET}`,
      )
    }

    return {
      targetMode,
      projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
      hostname,
      port,
      dbName,
      username: username || 'postgres',
      password,
      sslmode: resolvedSslmode,
      passwordlessUrl: buildPasswordlessRemoteUrl(parsedUrl, resolvedSslmode),
      redactedTarget: redactDbUrl(trimmedUrl),
    }
  }

  // local-disposable mode
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new RunnerGuardError(
      'TARGET_IDENTITY_MISMATCH',
      `--target=local-disposable strictly requires loopback host (got "${hostname}")`,
    )
  }
  if (!dbName) {
    throw new RunnerGuardError('TARGET_IDENTITY_MISMATCH', 'Local disposable target requires explicit database name')
  }
  if (execute && confirmTarget !== LOCAL_DISPOSABLE_CONFIRM_TARGET) {
    throw new RunnerGuardError(
      'TARGET_CONFIRMATION_MISMATCH',
      `Local disposable --execute requires exact --confirm-target=${LOCAL_DISPOSABLE_CONFIRM_TARGET}`,
    )
  }
  const resolvedSslmode = rawSslmode || 'prefer'

  return {
    targetMode,
    projectRef: null,
    hostname: hostname.replace(/^\[|\]$/g, ''),
    port,
    dbName,
    username: username || 'postgres',
    password,
    sslmode: resolvedSslmode,
    passwordlessUrl: buildPasswordlessRemoteUrl(parsedUrl, rawSslmode || ''),
    redactedTarget: redactDbUrl(trimmedUrl),
  }
}

export function buildSafePsqlEnv(baseEnv, parsedTarget, password = parsedTarget.password) {
  const nextEnv = { ...baseEnv }
  delete nextEnv.SUPABASE_DB_URL
  nextEnv.PGHOST = parsedTarget.hostname
  nextEnv.PGPORT = String(parsedTarget.port || '5432')
  nextEnv.PGDATABASE = parsedTarget.dbName
  nextEnv.PGUSER = parsedTarget.username
  nextEnv.PGSSLMODE = parsedTarget.sslmode
  if (password) {
    nextEnv.PGPASSWORD = password
  } else {
    delete nextEnv.PGPASSWORD
  }
  return nextEnv
}

export function validateProductionReleaseGates(attestation, expectedHeadSha = '') {
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    throw new RunnerGuardError('RELEASE_GATE_ATTESTATION_INVALID', 'Gate attestation must be a JSON object')
  }
  const failures = []
  if (attestation.environment_policy !== 'PRODUCTION_ONLY') {
    failures.push('environment_policy!=PRODUCTION_ONLY')
  }
  if (attestation.cutover_status !== 'APPROVED_FOR_CUTOVER') {
    failures.push(`cutover_status=${String(attestation.cutover_status ?? 'missing')}`)
  }
  if (attestation.owner_cutover_approved !== true) {
    failures.push('owner_cutover_approved!=true')
  }
  const sha = String(attestation.candidate_sha ?? '').trim().toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    failures.push('candidate_sha_invalid')
  } else if (expectedHeadSha && sha !== expectedHeadSha.trim().toLowerCase()) {
    failures.push(`candidate_sha_mismatch(expected=${expectedHeadSha},got=${sha})`)
  }

  const mg = attestation.migration_gate
  if (!mg || mg.status !== 'PASS') failures.push(`migration_gate.status=${String(mg?.status ?? 'missing')}`)
  if (mg?.semantic_parity_verified !== true) failures.push('migration_gate.semantic_parity_verified!=true')
  if (mg?.ci_verified !== true) failures.push('migration_gate.ci_verified!=true')
  if (mg?.privilege_widening !== false) failures.push('migration_gate.privilege_widening!=false')

  const rg = attestation.recovery_gate
  if (!rg || rg.status !== 'PASS') failures.push(`recovery_gate.status=${String(rg?.status ?? 'missing')}`)
  if (rg?.target_project_ref !== PRODUCTION_SUPABASE_PROJECT_REF) {
    failures.push(`recovery_gate.target_project_ref!=${PRODUCTION_SUPABASE_PROJECT_REF}`)
  }
  if (rg?.baseline_receipts_covered !== 117) failures.push('recovery_gate.baseline_receipts_covered!=117')
  if (rg?.restore_verified !== true) failures.push('recovery_gate.restore_verified!=true')
  if (rg?.legacy_85_migration_backup_used === true) failures.push('recovery_gate.legacy_85_migration_backup_used==true')

  const ag = attestation.acl_preflight_gate
  if (!ag || ag.status !== 'PASS') failures.push(`acl_preflight_gate.status=${String(ag?.status ?? 'missing')}`)
  if (ag?.checkin_and_checkout_verified !== true) failures.push('acl_preflight_gate.checkin_and_checkout_verified!=true')
  if (ag?.public_content_exposure !== false) failures.push('acl_preflight_gate.public_content_exposure!=false')

  if (failures.length > 0) {
    throw new RunnerGuardError(
      'RELEASE_GATES_NOT_PASSED',
      `Production execution blocked until all required gates pass: ${failures.join('; ')}`,
      { failures },
    )
  }
  return { ok: true, candidate_sha: sha }
}

export function parseArgs(argv) {
  const opts = {
    execute: argv.includes('--execute'),
    dryRun: !argv.includes('--execute'),
    targetMode: 'production',
    confirmTarget: '',
    dbUrl: process.env.SUPABASE_DB_URL ?? '',
    dbUrlFromArgv: false,
    rawDbUrlArg: '',
    psqlBin: process.env.PSQL_BIN ?? 'psql',
    supabaseBin: process.env.SUPABASE_CLI_BIN ?? '',
    requireCliVersion: '',
    gateAttestationPath: '',
    expectBaselineCount: 117,
    allowPartialResume: argv.includes('--allow-partial-resume'),
    migrationsSourceDir: DEFAULT_MIGRATIONS_DIR,
    allowFaultInjectionWorkdir: argv.includes('--allow-fault-injection-workdir'),
    jsonOut: '',
  }
  for (const arg of argv) {
    if (arg.startsWith('--target=')) opts.targetMode = arg.slice('--target='.length).trim()
    else if (arg.startsWith('--confirm-target=')) opts.confirmTarget = arg.slice('--confirm-target='.length).trim()
    else if (arg.startsWith('--db-url=')) {
      opts.rawDbUrlArg = arg.slice('--db-url='.length).trim()
      opts.dbUrl = opts.rawDbUrlArg
      opts.dbUrlFromArgv = true
    } else if (arg.startsWith('--psql-bin=')) opts.psqlBin = arg.slice('--psql-bin='.length).trim()
    else if (arg.startsWith('--supabase-bin=')) opts.supabaseBin = arg.slice('--supabase-bin='.length).trim()
    else if (arg.startsWith('--require-cli-version=')) opts.requireCliVersion = arg.slice('--require-cli-version='.length).trim()
    else if (arg.startsWith('--gate-attestation=')) opts.gateAttestationPath = path.resolve(arg.slice('--gate-attestation='.length).trim())
    else if (arg.startsWith('--expect-baseline-count=')) opts.expectBaselineCount = Number(arg.slice('--expect-baseline-count='.length))
    else if (arg.startsWith('--override-migration-dir=')) opts.migrationsSourceDir = path.resolve(arg.slice('--override-migration-dir='.length))
    else if (arg.startsWith('--json-out=')) opts.jsonOut = path.resolve(arg.slice('--json-out='.length))
  }
  return opts
}

function resolveSupabaseBin(explicit) {
  const candidates = [explicit, process.env.SUPABASE_CLI_BIN, 'supabase'].filter(Boolean)
  for (const c of candidates) {
    if (c === 'supabase') {
      const check = spawnSync('which', ['supabase'], { encoding: 'utf8' })
      if (check.status === 0 && check.stdout.trim()) return check.stdout.trim().split(/\r?\n/)[0]
      const winCheck = spawnSync('where.exe', ['supabase'], { encoding: 'utf8' })
      if (winCheck.status === 0 && winCheck.stdout.trim()) return winCheck.stdout.trim().split(/\r?\n/)[0]
    } else if (existsSync(c)) {
      return c
    }
  }
  throw new RunnerGuardError('SUPABASE_CLI_NOT_FOUND', 'Pass --supabase-bin=<path>, set SUPABASE_CLI_BIN, or put pinned supabase CLI on PATH')
}

function runPsql(psqlBin, psqlEnv, sql) {
  return execFileSync(psqlBin, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql], {
    env: psqlEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function verifyAllowlistedFiles(migrationsSourceDir, allowFaultInjection) {
  if (!allowFaultInjection && path.resolve(migrationsSourceDir) !== path.resolve(DEFAULT_MIGRATIONS_DIR)) {
    throw new RunnerGuardError('OVERRIDE_MIGRATION_DIR_FORBIDDEN', 'Requires --allow-fault-injection-workdir explicitly')
  }
  const files = []
  for (const fileName of W4_ALLOWED_MIGRATIONS) {
    const fullPath = path.join(migrationsSourceDir, fileName)
    if (!existsSync(fullPath)) {
      throw new RunnerGuardError('MISSING_ALLOWLIST_MIGRATION', `Missing allowlisted migration file: ${fileName}`)
    }
    const content = readFileSync(fullPath)
    const sha256 = createHash('sha256').update(content).digest('hex')
    files.push({ version: fileName.split('_')[0], fileName, fullPath, sha256 })
  }
  return files
}

function snapshotLedger(psqlBin, psqlEnv) {
  const raw = runPsql(
    psqlBin,
    psqlEnv,
    "SELECT version, coalesce(name, ''), coalesce(array_length(statements, 1), 0), md5(coalesce(name, '') || '|' || coalesce(array_to_string(statements, E'\\n'), '')) FROM supabase_migrations.schema_migrations ORDER BY version;",
  )
  if (!raw) return []
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [version, name, stmtCount, stmtMd5] = line.split('|')
    return { version, name, statement_count: Number(stmtCount), receipt_md5: stmtMd5 }
  })
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const secretsToScrub = [
    process.env.SUPABASE_DB_PASSWORD,
    process.env.SUPABASE_DB_URL,
    opts.rawDbUrlArg,
  ].filter(Boolean)

  let redactedTarget = '<unset>'
  try {
    if (opts.dbUrl) redactedTarget = redactDbUrl(opts.dbUrl)

    const target = validateTargetIdentity({
      dbUrl: opts.dbUrl,
      targetMode: opts.targetMode,
      confirmTarget: opts.confirmTarget,
      execute: opts.execute,
      dbUrlFromArgv: opts.dbUrlFromArgv,
      expectBaselineCount: opts.expectBaselineCount,
      allowFaultInjectionWorkdir: opts.allowFaultInjectionWorkdir,
      migrationsSourceDir: opts.migrationsSourceDir,
      envPassword: process.env.SUPABASE_DB_PASSWORD ?? '',
      rawDbUrlArg: opts.rawDbUrlArg,
    })
    if (target.password) secretsToScrub.push(target.password)
    redactedTarget = target.redactedTarget

    if (!existsSync(CONFIG_TOML_PATH)) {
      throw new RunnerGuardError('MISSING_SUPABASE_CONFIG_TOML', `Missing config.toml at ${CONFIG_TOML_PATH}`)
    }

    let verifiedCandidateSha = null
    if (target.targetMode === 'production' && opts.execute) {
      if (!opts.gateAttestationPath || !existsSync(opts.gateAttestationPath)) {
        throw new RunnerGuardError(
          'RELEASE_GATE_ATTESTATION_REQUIRED',
          'Production --execute requires --gate-attestation=<path> proving Migration + Recovery + ACL Preflight PASS',
        )
      }
      let attestation
      try {
        attestation = JSON.parse(readFileSync(opts.gateAttestationPath, 'utf8'))
      } catch {
        throw new RunnerGuardError('RELEASE_GATE_ATTESTATION_INVALID', 'Failed to parse --gate-attestation JSON')
      }
      const liveHeadSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
      verifiedCandidateSha = validateProductionReleaseGates(attestation, liveHeadSha).candidate_sha
    }

    const supabaseBin = resolveSupabaseBin(opts.supabaseBin)
    const rawVersionOutput = execFileSync(supabaseBin, ['--version'], { encoding: 'utf8' })
    const cliVersion = assertPinnedCliVersion(parseCliVersion(rawVersionOutput), opts.requireCliVersion)
    const allowlistedFiles = verifyAllowlistedFiles(opts.migrationsSourceDir, opts.allowFaultInjectionWorkdir)

    const psqlEnv = buildSafePsqlEnv(process.env, target, target.password)

    // Step 1: Preflight Read-Only Target, PostgreSQL Version, Ledger & Schema Checks
    const serverVersionNum = Number(runPsql(opts.psqlBin, psqlEnv, 'SHOW server_version_num;'))
    if (!Number.isInteger(serverVersionNum) || serverVersionNum < 170000 || serverVersionNum >= 180000) {
      throw new RunnerGuardError('UNSUPPORTED_POSTGRES_VERSION', `Expected PostgreSQL 17.x (got ${serverVersionNum})`)
    }
    const connectedDbName = runPsql(opts.psqlBin, psqlEnv, 'SELECT current_database();')
    if (connectedDbName !== target.dbName) {
      throw new RunnerGuardError('TARGET_DATABASE_MISMATCH', `Expected database "${target.dbName}", connected to "${connectedDbName}"`)
    }

    const hasLedger = runPsql(opts.psqlBin, psqlEnv, "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;")
    if (hasLedger !== 't') throw new RunnerGuardError('PRECHECK_FAILED', 'supabase_migrations.schema_migrations missing')

    const baselineLedger = snapshotLedger(opts.psqlBin, psqlEnv)
    if (opts.expectBaselineCount > 0 && baselineLedger.length !== opts.expectBaselineCount) {
      throw new RunnerGuardError('PRECHECK_FAILED', `Expected ${opts.expectBaselineCount} receipts, found ${baselineLedger.length}`)
    }
    const baselineVersions = new Set(baselineLedger.map((r) => r.version))
    for (const reqVer of REQUIRED_BASELINE_VERSIONS) {
      if (!baselineVersions.has(reqVer)) {
        throw new RunnerGuardError('PRECHECK_FAILED', `Missing required baseline receipt ${reqVer}`)
      }
    }
    const alreadyPresent = CANDIDATE_VERSIONS.filter((v) => baselineVersions.has(v))
    if (alreadyPresent.length > 0 && !opts.allowPartialResume) {
      throw new RunnerGuardError('PRECHECK_FAILED', `Candidate migrations already in ledger: ${alreadyPresent.join(', ')}`)
    }
    const pendingFiles = opts.allowPartialResume
      ? allowlistedFiles.filter((f) => !baselineVersions.has(f.version))
      : allowlistedFiles
    if (pendingFiles.length === 0) {
      throw new RunnerGuardError('PRECHECK_FAILED', 'All 13 candidate migrations are already applied')
    }
    const replExists = runPsql(opts.psqlBin, psqlEnv, "SELECT to_regclass('public.rc19_shift_assignment_replacements') IS NOT NULL;")
    if (replExists !== 'f' && !baselineVersions.has('20261113084154')) {
      throw new RunnerGuardError('PRECHECK_FAILED', 'public.rc19_shift_assignment_replacements already exists')
    }
    const prereqTables = runPsql(
      opts.psqlBin,
      psqlEnv,
      "SELECT (to_regclass('public.workforce_overtime_requests') IS NOT NULL) AND (to_regclass('public.workforce_cancellation_compensation_cases') IS NOT NULL);",
    )
    if (prereqTables !== 't') {
      throw new RunnerGuardError('PRECHECK_FAILED', 'Required workforce prerequisite tables are missing')
    }

    // Step 2: Stage ephemeral aligned workdir preserving exact baseline names
    const tempWorkdir = mkdtempSync(path.join(os.tmpdir(), 'rc19-w4-cli-workdir-'))
    try {
      const tempSupabaseDir = path.join(tempWorkdir, 'supabase')
      const tempMigrationsDir = path.join(tempSupabaseDir, 'migrations')
      mkdirSync(tempMigrationsDir, { recursive: true })
      copyFileSync(CONFIG_TOML_PATH, path.join(tempSupabaseDir, 'config.toml'))

      for (const row of baselineLedger) {
        const safeName = (row.name || row.version).replace(/[^A-Za-z0-9_]+/g, '_')
        const stubFile = path.join(tempMigrationsDir, `${row.version}_${safeName}.sql`)
        writeFileSync(stubFile, '-- baseline receipt already applied on target\n', 'utf8')
      }
      for (const item of pendingFiles) {
        copyFileSync(item.fullPath, path.join(tempMigrationsDir, item.fileName))
      }

      const cliArgs = [
        'db',
        'push',
        '--workdir',
        tempWorkdir,
        '--skip-vault',
        '--yes',
        ...(opts.dryRun ? ['--dry-run'] : []),
        `--remote=${target.passwordlessUrl}`,
      ]
      const cliProc = spawnSync(supabaseBin, cliArgs, {
        env: psqlEnv,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      })
      if (cliProc.status !== 0) {
        const errOut = {
          ok: false,
          mode: opts.dryRun ? 'dry-run' : 'execute',
          target_mode: target.targetMode,
          target: target.redactedTarget,
          cli_version: cliVersion,
          exit_code: cliProc.status,
          stdout: redactSecrets(cliProc.stdout, secretsToScrub),
          stderr: redactSecrets(cliProc.stderr, secretsToScrub),
        }
        if (opts.jsonOut) writeFileSync(opts.jsonOut, `${JSON.stringify(errOut, null, 2)}\n`, 'utf8')
        console.error(JSON.stringify(errOut, null, 2))
        process.exit(cliProc.status ?? 1)
      }

      // Step 3: Post-execution verification
      const postLedger = snapshotLedger(opts.psqlBin, psqlEnv)
      const postMap = new Map(postLedger.map((r) => [r.version, r]))
      let historicalModified = 0
      for (const baseRow of baselineLedger) {
        const after = postMap.get(baseRow.version)
        if (!after || after.receipt_md5 !== baseRow.receipt_md5 || after.name !== baseRow.name) {
          historicalModified += 1
        }
      }

      const appliedReceipts = []
      if (!opts.dryRun) {
        if (postLedger.length !== baselineLedger.length + pendingFiles.length) {
          throw new RunnerGuardError(
            'POSTCHECK_FAILED',
            `Expected ${baselineLedger.length + pendingFiles.length} receipts, got ${postLedger.length}`,
          )
        }
        if (historicalModified !== 0) {
          throw new RunnerGuardError('POSTCHECK_FAILED', `${historicalModified} historical receipt(s) modified`)
        }
        for (const item of pendingFiles) {
          const rec = postMap.get(item.version)
          if (!rec || rec.statement_count < 1) {
            throw new RunnerGuardError('POSTCHECK_FAILED', `Missing or empty statements array for canonical CLI receipt ${item.version}`)
          }
          appliedReceipts.push(rec)
        }
        const rlsEnabled = runPsql(
          opts.psqlBin,
          psqlEnv,
          "SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'rc19_shift_assignment_replacements';",
        )
        if (rlsEnabled !== 't') {
          throw new RunnerGuardError('POSTCHECK_FAILED', `public.rc19_shift_assignment_replacements relrowsecurity=${rlsEnabled}`)
        }
      }

      const result = {
        ok: true,
        mode: opts.dryRun ? 'dry-run' : 'execute',
        target_mode: target.targetMode,
        confirm_target: opts.confirmTarget || null,
        target: target.redactedTarget,
        cli_version: cliVersion,
        verified_candidate_sha: verifiedCandidateSha,
        baseline_receipts_count: baselineLedger.length,
        candidate_migrations_count: pendingFiles.length,
        post_receipts_count: postLedger.length,
        historical_receipts_modified: historicalModified,
        rls_verified_on_new_table: opts.dryRun ? null : true,
        applied_canonical_receipts: appliedReceipts,
        cli_stdout: redactSecrets(cliProc.stdout.trim(), secretsToScrub),
      }
      if (opts.jsonOut) writeFileSync(opts.jsonOut, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
      console.log(JSON.stringify(result, null, 2))
    } finally {
      rmSync(tempWorkdir, { recursive: true, force: true })
    }
  } catch (error) {
    const code = error instanceof RunnerGuardError ? error.code : 'RUNNER_EXECUTION_FAILED'
    const message = redactSecrets(error instanceof Error ? error.message : String(error), secretsToScrub)
    const stderrTail = error && typeof error === 'object' && 'stderr' in error
      ? redactSecrets(String(error.stderr ?? ''), secretsToScrub)
      : undefined
    const errPayload = {
      ok: false,
      error: code,
      message,
      target: redactedTarget,
      ...(stderrTail ? { stderr: stderrTail } : {}),
    }
    if (opts.jsonOut) {
      try {
        writeFileSync(opts.jsonOut, `${JSON.stringify(errPayload, null, 2)}\n`, 'utf8')
      } catch {
        // Best-effort error report only.
      }
    }
    console.error(JSON.stringify(errPayload, null, 2))
    process.exit(error instanceof RunnerGuardError ? 2 : 1)
  }
}

const isDirectEntrypoint =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectEntrypoint) {
  main()
}
