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

let sql = '-- RC19 W4 PRODUCTION CONSOLIDATED MIGRATION MANIFEST (11 Verified Unapplied Migrations)\n'
sql += '-- Target: Supabase Production (egdjnpmoasarrttvhgds)\n'
sql += `-- Generated at: ${new Date().toISOString()}\n`
sql += '-- Reconciled: Excludes already-applied 20261110140000 and 20261111000000\n\n'
sql += 'BEGIN;\n\n'

for (const f of files) {
  const version = f.split('_')[0]
  let content = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
  content = stripOuterTransaction(content)
  sql += `/*******************************************************************************\n`
  sql += ` * Migration: ${f}\n`
  sql += ` * Version:   ${version}\n`
  sql += ` *******************************************************************************/\n`
  sql += content + '\n\n'
  sql += `-- Record migration receipt\n`
  sql += `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT (version) DO NOTHING;\n\n`
}

sql += 'COMMIT;\n'

const outPath = 'scripts/rc19-c4-migration-rehearsal/rc19-w4-production-manifest-11.sql'
fs.writeFileSync(outPath, sql, 'utf8')
console.log(`Manifest written: ${outPath} (${Buffer.byteLength(sql, 'utf8')} bytes)`)
