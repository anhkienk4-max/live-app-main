import fs from 'node:fs'
import path from 'node:path'

const migrationsDir = 'supabase/migrations'
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort().slice(117)

console.log(`Generating consolidated manifest for ${files.length} migrations (118-130):`)

let sql = '-- RC19 W4 PRODUCTION CONSOLIDATED MIGRATION MANIFEST (Migrations 118-130)\n'
sql += '-- Target: Supabase Production (egdjnpmoasarrttvhgds)\n'
sql += `-- Generated at: ${new Date().toISOString()}\n\n`
sql += 'BEGIN;\n\n'

for (const f of files) {
  const version = f.split('_')[0]
  let content = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
  content = content.replace(/^\s*BEGIN;?\s*$/gim, '-- BEGIN (nested)')
  content = content.replace(/^\s*COMMIT;?\s*$/gim, '-- COMMIT (nested)')
  sql += `/*******************************************************************************\n`
  sql += ` * Migration: ${f}\n`
  sql += ` * Version:   ${version}\n`
  sql += ` *******************************************************************************/\n`
  sql += content + '\n\n'
  sql += `-- Record migration receipt\n`
  sql += `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT (version) DO NOTHING;\n\n`
}

sql += 'COMMIT;\n'

const outPath = 'scripts/rc19-c4-migration-rehearsal/rc19-w4-production-manifest-13.sql'
fs.writeFileSync(outPath, sql, 'utf8')
console.log(`Manifest written: ${outPath} (${Buffer.byteLength(sql, 'utf8')} bytes)`)
