import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
const authorized = process.env.RC19_UNIFIED_IMPORT_DISPOSABLE_TEST_DATABASE === 'I_UNDERSTAND'

test('RC19 unified Import migrations and Agency/supplemental RPCs pass on PostgreSQL 17 disposable database', {
  skip: !databaseUrl || !authorized,
}, async () => {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const marker = await client.query(`
      select current_database() as database_name,
        shobj_description(oid, 'pg_database') as marker
      from pg_database where datname = current_database()
    `)
    assert.equal(marker.rows[0].database_name, 'rc19_unified_import_disposable')
    assert.equal(marker.rows[0].marker, 'RC19_UNIFIED_IMPORT_DISPOSABLE_TEST_DATABASE')
    const version = await client.query('show server_version_num')
    assert.match(String(version.rows[0].server_version_num), /^17/)

    for (const filename of [
      'tests/fixtures/rc19-unified-import-base.sql',
      'supabase/migrations/20261102190000_rc19_batch01_1_agency_code.sql',
      'supabase/migrations/20261102200000_rc19_batch01_3_shift_identity_index.sql',
      'supabase/migrations/20261103093137_rc19_unified_import_agency_supplemental_fields.sql',
    ]) {
      await client.query(fs.readFileSync(path.resolve(process.cwd(), filename), 'utf8'))
    }

    await client.query(`
      insert into public.system_settings (id) values ('default');
      insert into public.brands (id, name) values ('brand-a', 'Brand A');
      insert into public.platforms (id, name) values ('plat-shopee', 'Shopee');
      insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'admin@ops.local');
      insert into public.business_users (id, auth_user_id, email, full_name, system_permission)
      values ('usr-admin', '11111111-1111-1111-1111-111111111111', 'admin@ops.local', 'Admin User', 'admin');
      set "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
      set "request.jwt.claim.role" = 'authenticated';
    `)

    const cases = [
      { date: '2026-11-25', agency: 'ada', source: 'internal' },
      { date: '2026-11-26', agency: 'snap', source: 'agency' },
      { date: '2026-11-27', agency: 'live_ai', source: 'agency' },
    ]
    const createdIds: string[] = []
    for (const [index, item] of cases.entries()) {
      const result = await client.query(
        `select * from public.create_shift($1::jsonb)`,
        [JSON.stringify({
          date: item.date,
          start_time: '09:00',
          end_time: '11:00',
          brand_id: 'brand-a',
          platform_id: 'plat-shopee',
          agency_code: item.agency,
          supplemental_fields: index === 0 ? { target: { label: 'TARGET', type: 'number', value: 1200 } } : {},
        })],
      )
      createdIds.push(result.rows[0].id)
      assert.equal(result.rows[0].execution_source, item.source)
      if (index === 0) assert.deepEqual(result.rows[0].supplemental_fields, { target: { label: 'TARGET', type: 'number', value: 1200 } })
    }

    const changedAgency = await client.query(
      `select * from public.update_shift($1, '{"agency_code":"snap"}'::jsonb, false, 1)`,
      [createdIds[0]],
    )
    assert.equal(changedAgency.rows[0].execution_source, 'agency')
    assert.equal(changedAgency.rows[0].agency_code, 'snap')

    await assert.rejects(
      client.query(`select * from public.update_shift($1, '{"agency_code":"ada","execution_source":"agency"}'::jsonb, false)`, [createdIds[0]]),
      /SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT/,
    )
    await assert.rejects(
      client.query(`select * from public.update_shift($1, '{"agency_code":"ada","execution_source":"agency"}'::jsonb, false, 1)`, [createdIds[1]]),
      /SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT/,
    )
    await assert.rejects(
      client.query(`select * from public.update_shift($1, '{"supplemental_fields":{"target":{"label":"TARGET","type":"number","value":"wrong"}}}'::jsonb, false, 1)`, [createdIds[2]]),
      /SHIFT_SUPPLEMENTAL_FIELDS_INVALID/,
    )

    const security = await client.query(`
      select prosecdef, proconfig from pg_proc
      where oid = 'public.create_shift(jsonb)'::regprocedure
    `)
    assert.equal(security.rows[0].prosecdef, true)
    assert.ok((security.rows[0].proconfig as string[]).includes('search_path=""'))
  } finally {
    await client.end()
  }
})
