#!/usr/bin/env node
/**
 * Canonical Supabase CLI Migration Runner for RC19 W4 (13 Forward Migrations)
 *
 * Enforces:
 *   1. Explicit 13-version W4 allowlist (20261112000000 .. 20261118150000).
 *   2. ZERO manual INSERTs into `supabase_migrations.schema_migrations` — all
 *      execution and split-statement receipt recording run through `supabase db push`.
 *   3. Read-only preflight ledger & schema verification before any push, and strict
 *      post-execution ledger parity verification (117/117 prior rows untouched).
 *   4. Default mode is `--dry-run`; actual execution requires `--execute --confirm-target=<label>`.
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

function redactDbUrl(raw) {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.username ? `${u.username}:****@` : ''}${u.host}${u.pathname}`
  } catch {
    return '<redacted-db-url>'
  }
}

function parseArgs(argv) {
  const opts = {
    execute: argv.includes('--execute'),
    dryRun: !argv.includes('--execute'),
    confirmTarget: '',
    dbUrl: process.env.SUPABASE_DB_URL ?? '',
    psqlBin: process.env.PSQL_BIN ?? 'psql',
    supabaseBin: process.env.SUPABASE_CLI_BIN ?? '',
    expectBaselineCount: 117,
    allowPartialResume: argv.includes('--allow-partial-resume'),
    migrationsSourceDir: DEFAULT_MIGRATIONS_DIR,
    allowFaultInjectionWorkdir: argv.includes('--allow-fault-injection-workdir'),
    jsonOut: '',
  }
  for (const arg of argv) {
    if (arg.startsWith('--confirm-target=')) opts.confirmTarget = arg.slice('--confirm-target='.length).trim()
    else if (arg.startsWith('--db-url=')) opts.dbUrl = arg.slice('--db-url='.length).trim()
    else if (arg.startsWith('--psql-bin=')) opts.psqlBin = arg.slice('--psql-bin='.length).trim()
    else if (arg.startsWith('--supabase-bin=')) opts.supabaseBin = arg.slice('--supabase-bin='.length).trim()
    else if (arg.startsWith('--expect-baseline-count=')) opts.expectBaselineCount = Number(arg.slice('--expect-baseline-count='.length))
    else if (arg.startsWith('--override-migration-dir=')) opts.migrationsSourceDir = path.resolve(arg.slice('--override-migration-dir='.length))
    else if (arg.startsWith('--json-out=')) opts.jsonOut = path.resolve(arg.slice('--json-out='.length))
  }
  return opts
}

function resolveSupabaseBin(explicit) {
  const candidates = [
    explicit,
    '/home/anhkienk4/.npm/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-linux-x64/bin/supabase',
    'supabase',
  ].filter(Boolean)
  for (const c of candidates) {
    if (c === 'supabase') {
      const check = spawnSync('which', ['supabase'], { encoding: 'utf8' })
      if (check.status === 0 && check.stdout.trim()) return check.stdout.trim()
      const winCheck = spawnSync('where.exe', ['supabase'], { encoding: 'utf8' })
      if (winCheck.status === 0 && winCheck.stdout.trim()) return winCheck.stdout.trim().split(/\r?\n/)[0]
    } else if (existsSync(c)) {
      return c
    }
  }
  throw new Error('SUPABASE_CLI_NOT_FOUND: pass --supabase-bin=<path> or install pinned supabase CLI')
}

function runPsql(psqlBin, dbUrl, sql) {
  return execFileSync(psqlBin, [dbUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function verifyAllowlistedFiles(migrationsSourceDir, allowFaultInjection) {
  if (!allowFaultInjection && path.resolve(migrationsSourceDir) !== path.resolve(DEFAULT_MIGRATIONS_DIR)) {
    throw new Error('OVERRIDE_MIGRATION_DIR_FORBIDDEN: requires --allow-fault-injection-workdir explicitly')
  }
  const files = []
  for (const fileName of W4_ALLOWED_MIGRATIONS) {
    const fullPath = path.join(migrationsSourceDir, fileName)
    if (!existsSync(fullPath)) {
      throw new Error(`MISSING_ALLOWLIST_MIGRATION: ${fullPath}`)
    }
    const content = readFileSync(fullPath)
    const sha256 = createHash('sha256').update(content).digest('hex')
    files.push({ version: fileName.split('_')[0], fileName, fullPath, sha256 })
  }
  return files
}

function snapshotLedger(psqlBin, dbUrl) {
  const raw = runPsql(
    psqlBin,
    dbUrl,
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
  if (!opts.dbUrl) {
    console.error(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL_REQUIRED', hint: 'Pass --db-url=... or set SUPABASE_DB_URL' }))
    process.exit(2)
  }
  if (opts.execute && !opts.confirmTarget) {
    console.error(JSON.stringify({ ok: false, error: 'CONFIRM_TARGET_REQUIRED', hint: '--execute requires --confirm-target=<label>' }))
    process.exit(2)
  }
  if (!existsSync(CONFIG_TOML_PATH)) {
    console.error(JSON.stringify({ ok: false, error: 'MISSING_SUPABASE_CONFIG_TOML' }))
    process.exit(2)
  }

  const supabaseBin = resolveSupabaseBin(opts.supabaseBin)
  const cliVersion = execFileSync(supabaseBin, ['--version'], { encoding: 'utf8' }).trim()
  const allowlistedFiles = verifyAllowlistedFiles(opts.migrationsSourceDir, opts.allowFaultInjectionWorkdir)

  // Step 1: Preflight Read-Only Ledger & Schema Checks
  const hasLedger = runPsql(opts.psqlBin, opts.dbUrl, "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;")
  if (hasLedger !== 't') throw new Error('PRECHECK_FAILED: supabase_migrations.schema_migrations missing')

  const baselineLedger = snapshotLedger(opts.psqlBin, opts.dbUrl)
  if (opts.expectBaselineCount > 0 && baselineLedger.length !== opts.expectBaselineCount) {
    throw new Error(`PRECHECK_FAILED: expected ${opts.expectBaselineCount} receipts, found ${baselineLedger.length}`)
  }
  const baselineVersions = new Set(baselineLedger.map((r) => r.version))
  for (const reqVer of REQUIRED_BASELINE_VERSIONS) {
    if (!baselineVersions.has(reqVer)) {
      throw new Error(`PRECHECK_FAILED: missing required baseline receipt ${reqVer}`)
    }
  }
  const alreadyPresent = CANDIDATE_VERSIONS.filter((v) => baselineVersions.has(v))
  if (alreadyPresent.length > 0 && !opts.allowPartialResume) {
    throw new Error(`PRECHECK_FAILED: candidate migrations already in ledger: ${alreadyPresent.join(', ')}`)
  }
  const pendingFiles = opts.allowPartialResume
    ? allowlistedFiles.filter((f) => !baselineVersions.has(f.version))
    : allowlistedFiles
  if (pendingFiles.length === 0) {
    throw new Error('PRECHECK_FAILED: all 13 candidate migrations are already applied')
  }
  const replExists = runPsql(opts.psqlBin, opts.dbUrl, "SELECT to_regclass('public.rc19_shift_assignment_replacements') IS NOT NULL;")
  if (replExists !== 'f' && !baselineVersions.has('20261113084154')) {
    throw new Error('PRECHECK_FAILED: public.rc19_shift_assignment_replacements already exists')
  }
  const prereqTables = runPsql(
    opts.psqlBin,
    opts.dbUrl,
    "SELECT (to_regclass('public.workforce_overtime_requests') IS NOT NULL) AND (to_regclass('public.workforce_cancellation_compensation_cases') IS NOT NULL);",
  )
  if (prereqTables !== 't') {
    throw new Error('PRECHECK_FAILED: required workforce prerequisite tables are missing')
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
      `--remote=${opts.dbUrl}`,
    ]
    const cliProc = spawnSync(supabaseBin, cliArgs, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    if (cliProc.status !== 0) {
      const errOut = {
        ok: false,
        mode: opts.dryRun ? 'dry-run' : 'execute',
        target: redactDbUrl(opts.dbUrl),
        cli_version: cliVersion,
        exit_code: cliProc.status,
        stdout: cliProc.stdout,
        stderr: cliProc.stderr,
      }
      if (opts.jsonOut) writeFileSync(opts.jsonOut, `${JSON.stringify(errOut, null, 2)}\n`, 'utf8')
      console.error(JSON.stringify(errOut, null, 2))
      process.exit(cliProc.status ?? 1)
    }

    // Step 3: Post-execution verification
    const postLedger = snapshotLedger(opts.psqlBin, opts.dbUrl)
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
        throw new Error(`POSTCHECK_FAILED: expected ${baselineLedger.length + pendingFiles.length} receipts, got ${postLedger.length}`)
      }
      if (historicalModified !== 0) {
        throw new Error(`POSTCHECK_FAILED: ${historicalModified} historical receipt(s) modified`)
      }
      for (const item of pendingFiles) {
        const rec = postMap.get(item.version)
        if (!rec || rec.statement_count < 1) {
          throw new Error(`POSTCHECK_FAILED: missing or empty statements array for canonical CLI receipt ${item.version}`)
        }
        appliedReceipts.push(rec)
      }
      const rlsEnabled = runPsql(
        opts.psqlBin,
        opts.dbUrl,
        "SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'rc19_shift_assignment_replacements';",
      )
      if (rlsEnabled !== 't') {
        throw new Error(`POSTCHECK_FAILED: public.rc19_shift_assignment_replacements relrowsecurity=${rlsEnabled}`)
      }
    }

    const result = {
      ok: true,
      mode: opts.dryRun ? 'dry-run' : 'execute',
      confirm_target: opts.confirmTarget || null,
      target: redactDbUrl(opts.dbUrl),
      cli_version: cliVersion,
      baseline_receipts_count: baselineLedger.length,
      candidate_migrations_count: pendingFiles.length,
      post_receipts_count: postLedger.length,
      historical_receipts_modified: historicalModified,
      rls_verified_on_new_table: opts.dryRun ? null : true,
      applied_canonical_receipts: appliedReceipts,
      cli_stdout: cliProc.stdout.trim(),
    }
    if (opts.jsonOut) writeFileSync(opts.jsonOut, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    rmSync(tempWorkdir, { recursive: true, force: true })
  }
}

main()
