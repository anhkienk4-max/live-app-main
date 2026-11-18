import fs from 'node:fs'
import path from 'node:path'

const migrationsDir = 'supabase/migrations'

// Explicit verified unapplied RC19 W4 release migration versions.
// Reconciled against Production ledger (117 applied versions, including
// 20261110140000 and 20261111000000). Slicing by index is strictly prohibited.
const UNAPPLIED_VERSIONS = [
  '20261112000000', // c2_calendar_overlap_range
  '20261112120000', // audit_history_keyset
  '20261112130000', // c6_import_source_reconciliation
  '20261113083000', // c4_audit_dependency
  '20261113084154', // c4_atomic_staffing_replacement
  '20261115120000', // w4_legacy_segment_compatibility
  '20261115130000', // w4_segmented_manual_assignment
  '20261115140000', // w4_pass_swap_segment_preservation
  '20261115174231', // w4_retire_unguarded_swap_approval
  '20261116120000', // w4_swap_preflight_and_segment_capacity
  '20261117160000', // w4_pass_recipient_visibility
  '20261118140000', // rc19_w4_atomic_overtime_payroll_sync
]

const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql') && UNAPPLIED_VERSIONS.includes(f.split('_')[0]))
  .sort()

if (files.length !== UNAPPLIED_VERSIONS.length) {
  throw new Error(`Migration count mismatch: expected ${UNAPPLIED_VERSIONS.length}, found ${files.length}`)
}

console.log(`Generating consolidated manifest for ${files.length} verified unapplied migrations:`)
files.forEach((f, idx) => console.log(`  [${idx + 1}/${files.length}] ${f}`))

function stripOuterTransaction(content) {
  const lines = content.split(/\r?\n/)
  // Find first non-empty, non-comment line
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) continue
    if (/^BEGIN\s*;\s*$/i.test(trimmed)) {
      lines[i] = '-- ' + lines[i] + ' (outer transaction wrapper)'
    }
    break
  }
  // Find last non-empty, non-comment line
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('--') || trimmed.endsWith('*/')) continue
    if (/^COMMIT\s*;\s*$/i.test(trimmed)) {
      lines[i] = '-- ' + lines[i] + ' (outer transaction wrapper)'
    }
    break
  }
  return lines.join('\n')
}

let sql = '-- RC19 W4 PRODUCTION CONSOLIDATED MIGRATION MANIFEST (12 Verified Unapplied Migrations)\n'
sql += '-- Target: Supabase Production (egdjnpmoasarrttvhgds)\n'
sql += `-- Generated at: ${new Date().toISOString()}\n`
sql += '-- Reconciled: Excludes already-applied 20261110140000 and 20261111000000\n\n'
sql += 'BEGIN;\n\n'

sql += `-- =============================================================================\n`
sql += `-- FAIL-CLOSED PRE-EXECUTION LEDGER AND SCHEMA SANITY CHECKS\n`
sql += `-- =============================================================================\n`
sql += `DO $precheck$\n`
sql += `BEGIN\n`
sql += `  -- 1. Assert schema_migrations table exists\n`
sql += `  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: supabase_migrations.schema_migrations table does not exist';\n`
sql += `  END IF;\n\n`
sql += `  -- 2. Assert already-applied baseline migrations 20261110140000 and 20261111000000 are present\n`
sql += `  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261110140000') THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: Expected baseline migration 20261110140000 is missing from schema_migrations';\n`
sql += `  END IF;\n`
sql += `  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261111000000') THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: Expected baseline migration 20261111000000 is missing from schema_migrations';\n`
sql += `  END IF;\n\n`
sql += `  -- 3. Assert baseline tables workforce_overtime_requests and workforce_cancellation_compensation_cases exist\n`
sql += `  IF to_regclass('public.workforce_overtime_requests') IS NULL THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: Table public.workforce_overtime_requests must already exist';\n`
sql += `  END IF;\n`
sql += `  IF to_regclass('public.workforce_cancellation_compensation_cases') IS NULL THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: Table public.workforce_cancellation_compensation_cases must already exist';\n`
sql += `  END IF;\n\n`
sql += `  -- 4. Assert NONE of the 12 candidate versions are already applied (fail-closed against replay)\n`
sql += `  IF EXISTS (\n`
sql += `    SELECT 1 FROM supabase_migrations.schema_migrations\n`
sql += `    WHERE version IN (\n`
sql += `      '20261112000000', '20261112120000', '20261112130000',\n`
sql += `      '20261113083000', '20261113084154', '20261115120000',\n`
sql += `      '20261115130000', '20261115140000', '20261115174231',\n`
sql += `      '20261116120000', '20261117160000', '20261118140000'\n`
sql += `    )\n`
sql += `  ) THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: One or more RC19 W4 candidate migrations already exist in schema_migrations (refusing replay)';\n`
sql += `  END IF;\n\n`
sql += `  -- 5. Assert candidate-introduced relation rc19_shift_assignment_replacements does NOT already exist\n`
sql += `  IF to_regclass('public.rc19_shift_assignment_replacements') IS NOT NULL THEN\n`
sql += `    RAISE EXCEPTION 'PRECHECK_FAILED: Table public.rc19_shift_assignment_replacements already exists prior to running manifest';\n`
sql += `  END IF;\n`
sql += `END $precheck$;\n\n`

for (const f of files) {
  const version = f.split('_')[0]
  const name = f.slice(version.length + 1).replace(/\.sql$/, '')
  let content = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
  content = stripOuterTransaction(content)
  sql += `/*******************************************************************************\n`
  sql += ` * Migration: ${f}\n`
  sql += ` * Version:   ${version}\n`
  sql += ` *******************************************************************************/\n`
  sql += content + '\n\n'
  const escapedStatements = "'" + content.replaceAll("'", "''") + "'"
  const escapedName = "'" + name.replaceAll("'", "''") + "'"
  sql += `-- Record migration receipt (Supabase-compliant with version, name, and statements)\n`
  sql += `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)\n`
  sql += `  VALUES ('${version}', ${escapedName}, ARRAY[${escapedStatements}])\n`
  sql += `  ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name, statements = EXCLUDED.statements;\n\n`
}

sql += 'COMMIT;\n'

const outPath = 'scripts/rc19-c4-migration-rehearsal/rc19-w4-production-manifest-12.sql'
fs.writeFileSync(outPath, sql, 'utf8')
console.log(`Manifest written: ${outPath} (${Buffer.byteLength(sql, 'utf8')} bytes)`)
