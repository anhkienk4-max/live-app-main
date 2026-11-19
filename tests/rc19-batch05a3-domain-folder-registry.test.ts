import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const migrationPath = fileURLToPath(new URL('../supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql', import.meta.url))
const migration = await readFile(migrationPath, 'utf8')

test('Batch 05A.3 folder registry seeds exact verified IDs inactive and denies direct app roles', async () => {
  const db = new PGlite()
  try {
    const version = String((await db.query('select version()')).rows[0]?.version)
    assert.match(version, /^PostgreSQL 17\./u)
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')

    await db.exec(migration)
    const seeded = await db.query(`
      select count(*)::int as total,
        count(*) filter (where active)::int as active,
        count(distinct folder_id)::int as unique_ids
      from public.operational_storage_domain_folders
    `)
    assert.deepEqual(seeded.rows[0], { total: 93, active: 0, unique_ids: 93 })

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(() => db.query('select * from public.operational_storage_domain_folders'))
      await db.exec('reset role')
    }

    await db.exec(migration)
    const rerun = await db.query('select count(*)::int as total, count(*) filter (where active)::int as active from public.operational_storage_domain_folders')
    assert.deepEqual(rerun.rows[0], { total: 93, active: 0 })

    await db.exec(`
      begin;
      set local role service_role;
      insert into public.operational_storage_domain_folders
        (folder_path, folder_id, parent_folder_id, access_classification, verified_created)
      values ('test/rollback', 'test-folder', 'test-parent', 'shared', true);
      rollback;
    `)
    const final = await db.query('select count(*)::int as total from public.operational_storage_domain_folders')
    assert.equal(final.rows[0]?.total, 93)
  } finally {
    await db.close()
  }
})
