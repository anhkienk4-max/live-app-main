import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const basePath = fileURLToPath(new URL('../supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql', import.meta.url))
const runtimePath = fileURLToPath(new URL('../supabase/migrations/20261102150000_rc19_batch05a4_storage_runtime.sql', import.meta.url))
const baseMigration = await readFile(basePath, 'utf8')
const runtimeMigration = await readFile(runtimePath, 'utf8')

test('Batch 05A.4 activates only verified route metadata and restricts receipts/probe data to service role', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(baseMigration)
    await db.exec(runtimeMigration)

    const registry = await db.query(`
      select count(*)::int as total,
        count(*) filter (where active and verified_created)::int as active_verified,
        count(*) filter (where access_classification = 'pending_restriction_no_sensitive_upload')::int as restricted_pending
      from public.operational_storage_domain_folders
    `)
    assert.deepEqual(registry.rows[0], { total: 93, active_verified: 93, restricted_pending: 16 })

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const table of [
        'operational_schedule_source_files',
        'operational_storage_drive_probe_runs',
        'operational_storage_drive_probe_rate_limits',
      ]) {
        await assert.rejects(() => db.query(`select * from public.${table}`))
      }
      await assert.rejects(() => db.query(`select public.claim_operational_storage_drive_probe_rate_limit('actor', 3, 600)`))
      await db.exec('reset role')
    }

    await db.exec('set role service_role')
    const first = await db.query(`select public.claim_operational_storage_drive_probe_rate_limit('actor', 2, 600) as allowed`)
    const second = await db.query(`select public.claim_operational_storage_drive_probe_rate_limit('actor', 2, 600) as allowed`)
    const third = await db.query(`select public.claim_operational_storage_drive_probe_rate_limit('actor', 2, 600) as allowed`)
    assert.deepEqual([first.rows[0]?.allowed, second.rows[0]?.allowed, third.rows[0]?.allowed], [true, true, false])
    await db.exec('reset role')

    await db.exec(runtimeMigration)
    const rerun = await db.query('select count(*)::int as total from public.operational_storage_domain_folders')
    assert.equal(rerun.rows[0]?.total, 93)
  } finally {
    await db.close()
  }
})
