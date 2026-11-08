import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
const disposableDatabase = 'rc19_sto01_migrations_disposable'
const baselinePath = path.resolve('tests/fixtures/rc19-batch05a-migration-baseline.sql')
const migrationPaths = [
  'supabase/migrations/20261102110001_rc19_batch05a_report_storage_expand.sql',
  'supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql',
  'supabase/migrations/20261102150000_rc19_batch05a4_storage_runtime.sql',
  'supabase/migrations/20261102160334_rc19_batch05a41_storage_release_blockers.sql',
  'supabase/migrations/20261102170608_rc19_batch05a42_registry_and_excel_integrity.sql',
]

async function connectDisposableDatabase(): Promise<Client | null> {
  if (!databaseUrl) {
    if (process.env.CI === 'true') throw new Error('[POSTGRES-17] DATABASE_URL is required in CI')
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('[POSTGRES-17] DATABASE_URL must identify the dedicated migration test database')
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname.toLowerCase())
    || decodeURIComponent(parsed.pathname.slice(1)) !== disposableDatabase
    || process.env.RC19_STO01_MIGRATIONS_DISPOSABLE_TEST_DATABASE !== 'I_UNDERSTAND'
  ) {
    throw new Error('[POSTGRES-17] Refusing schema setup outside the confirmed disposable migration test database')
  }

  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    const result = await client.query(`
      SELECT current_database() AS database, current_setting('server_version_num')::int AS version_num
    `)
    assert.equal(result.rows[0]?.database, disposableDatabase)
    assert.equal(String(result.rows[0]?.version_num).slice(0, 2), '17', 'The server must be PostgreSQL 17')
    return client
  } catch {
    await client.end().catch(() => undefined)
    throw new Error('[POSTGRES-17] Required disposable PostgreSQL 17 server connection failed')
  }
}

async function waitForLock(client: Client, processId: number) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const result = await client.query(
      'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
      [processId],
    )
    if (result.rows[0]?.wait_event_type === 'Lock') return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.fail('The independent batch confirmation connection did not wait on the receipt transaction lock')
}

test('RC19 05A migration chain on PostgreSQL 17 preserves registry, security, receipt and transaction gates', async (t) => {
  const client = await connectDisposableDatabase()
  if (!client) {
    t.skip('PostgreSQL 17 migration server is configured only in CI')
    return
  }

  try {
    assert.match(String((await client.query('SELECT version()')).rows[0]?.version), /^PostgreSQL 17\./u)
    await client.query(await readFile(baselinePath, 'utf8'))
    await client.query(`
      INSERT INTO public.schedule_import_batches (id, source, status, created_by)
      VALUES
        ('legacy-confirmed', 'excel', 'confirmed', 'business-1'),
        ('legacy-preview', 'excel', 'previewed', 'business-1'),
        ('legacy-sheets-confirmed', 'google_sheets', 'confirmed', 'business-1'),
        ('excel-batch', 'excel', 'previewed', 'business-1'),
        ('sheets-batch', 'google_sheets', 'previewed', 'business-1');
      INSERT INTO public.shifts (id, status) VALUES ('shift-1', 'live');
    `)
    for (const migrationPath of migrationPaths) {
      const migration = await readFile(path.resolve(migrationPath), 'utf8')
      if (migrationPath.includes('20261102150000')) {
        const failureInjection = migration.replace(
          'CREATE TABLE IF NOT EXISTS public.operational_schedule_source_files (',
          () => "DO $$ BEGIN RAISE EXCEPTION 'SYNTHETIC 05A MIGRATION ROLLBACK TEST'; END $$;\nCREATE TABLE IF NOT EXISTS public.operational_schedule_source_files (",
        )
        assert.notEqual(failureInjection, migration, 'The rollback injection point must exist')
        assert.ok(failureInjection.includes("DO $$ BEGIN RAISE EXCEPTION 'SYNTHETIC 05A MIGRATION ROLLBACK TEST'; END $$;"))
        await assert.rejects(() => client.query(failureInjection), /SYNTHETIC 05A MIGRATION ROLLBACK TEST/u)
        await client.query('ROLLBACK')
        const rolledBackRuntime = await client.query(`
          SELECT count(*)::int AS folders,
            count(*) FILTER (WHERE active)::int AS active,
            to_regclass('public.operational_schedule_source_files') IS NOT NULL AS source_table_exists
          FROM public.operational_storage_domain_folders
        `)
        assert.deepEqual(rolledBackRuntime.rows[0], { folders: 93, active: 0, source_table_exists: false })
      }
      await client.query(migration)
    }

    const version = await client.query("SELECT current_setting('server_version_num')::int AS version_num")
    assert.equal(String(version.rows[0]?.version_num).slice(0, 2), '17')

    const registry = await client.query(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE active AND verified_created)::int AS active_verified,
        count(*) FILTER (WHERE access_classification = 'pending_restriction_no_sensitive_upload')::int AS pending,
        count(*) FILTER (WHERE access_classification = 'restricted_pending_app_acl_verification')::int AS restricted_pending,
        count(*) FILTER (WHERE access_classification = 'restricted_pending_app_acl_verification' AND active)::int AS active_restricted_pending,
        count(*) FILTER (WHERE access_classification = 'restricted_verified')::int AS restricted_verified
      FROM public.operational_storage_domain_folders
    `)
    assert.deepEqual(registry.rows[0], {
      total: 148, active_verified: 93, pending: 16, restricted_pending: 55,
      active_restricted_pending: 0, restricted_verified: 0,
    })
    const indexes = await client.query(`
      SELECT tablename, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND (
        (tablename = 'operational_storage_domain_folders' AND indexdef LIKE 'CREATE UNIQUE INDEX% (folder_id)')
        OR (tablename = 'operational_storage_drive_probe_runs' AND indexname = 'operational_storage_drive_probe_runs_actor_created_idx')
      )
    `)
    assert.equal(indexes.rows.length, 2)
    await assert.rejects(() => client.query(`
      INSERT INTO public.operational_storage_domain_folders
        (folder_path, folder_id, parent_folder_id, access_classification, active, verified_created)
      VALUES ('duplicate-folder-test',
        (SELECT folder_id FROM public.operational_storage_domain_folders LIMIT 1),
        'parent', 'shared', false, true)
    `))

    const access = await client.query(`
      SELECT c.relname AS table_name, c.relrowsecurity,
        has_table_privilege('anon', format('public.%I', c.relname), 'SELECT') AS anon_select,
        has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') AS authenticated_select,
        has_table_privilege('service_role', format('public.%I', c.relname), 'SELECT') AS service_role_select
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'operational_storage_domain_folders', 'operational_schedule_source_files',
        'operational_storage_drive_probe_runs', 'operational_storage_drive_probe_rate_limits'
      )
      ORDER BY c.relname
    `)
    assert.equal(access.rows.length, 4)
    assert.ok(access.rows.every(row => row.relrowsecurity))
    assert.ok(access.rows.every(row => !row.anon_select && !row.authenticated_select && row.service_role_select))

    const rpcPrivileges = await client.query(`
      SELECT has_function_privilege('anon', 'public.claim_operational_storage_drive_probe_rate_limit(text,integer,integer)', 'execute') AS anon_execute,
        has_function_privilege('authenticated', 'public.claim_operational_storage_drive_probe_rate_limit(text,integer,integer)', 'execute') AS authenticated_execute,
        has_function_privilege('service_role', 'public.claim_operational_storage_drive_probe_rate_limit(text,integer,integer)', 'execute') AS service_role_execute,
        has_function_privilege('anon', 'public.create_dashboard_update(jsonb)', 'execute') AS anon_dashboard_execute,
        has_function_privilege('authenticated', 'public.create_dashboard_update(jsonb)', 'execute') AS authenticated_dashboard_execute
    `)
    assert.deepEqual(rpcPrivileges.rows[0], {
      anon_execute: false, authenticated_execute: false, service_role_execute: true,
      anon_dashboard_execute: false, authenticated_dashboard_execute: true,
    })
    assert.equal((await client.query("SELECT public FROM storage.buckets WHERE id='live-dashboard-images'")).rows[0]?.public, true)
    const dashboardReadPolicies = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
        AND policyname IN ('live dashboard image public read','live dashboard image scoped read')
      ORDER BY policyname
    `)
    assert.deepEqual(dashboardReadPolicies.rows, [
      { policyname: 'live dashboard image public read' },
      { policyname: 'live dashboard image scoped read' },
    ])

    const triggerCount = await client.query(`
      SELECT count(*)::int AS count FROM pg_trigger
      WHERE NOT tgisinternal AND tgname IN (
        'shifts_require_excel_schedule_source_receipt',
        'schedule_import_batches_require_excel_source',
        'operational_schedule_source_files_guard_mutation'
      )
    `)
    assert.equal(triggerCount.rows[0]?.count, 3)
    const receiptForeignKey = await client.query(`
      SELECT convalidated FROM pg_constraint
      WHERE conrelid = 'public.operational_schedule_source_files'::regclass
        AND conname = 'operational_schedule_source_files_batch_id_fkey'
    `)
    assert.deepEqual(receiptForeignKey.rows, [{ convalidated: true }])

    await client.query(`
      INSERT INTO public.dashboard_updates
        (id, shift_id, time, revenue, orders, peak_viewers, current_viewers, dashboard_platform, screenshot_storage_path)
      VALUES
        ('dash-allowed', 'shift-1', now(), 0, 0, 0, 0, 'shopee', 'dashboard/shift-1/allowed.png'),
        ('dash-denied', 'shift-2', now(), 0, 0, 0, 0, 'shopee', 'dashboard/shift-2/denied.png');
      INSERT INTO storage.objects (bucket_id, name) VALUES
        ('live-dashboard-images', 'dashboard/shift-1/allowed.png'),
        ('live-dashboard-images', 'dashboard/shift-2/denied.png');
    `)
    await client.query('SET ROLE authenticated')
    const authenticatedObjects = await client.query(
      "SELECT name FROM storage.objects WHERE bucket_id = 'live-dashboard-images' ORDER BY name",
    )
    assert.deepEqual(authenticatedObjects.rows, [
      { name: 'dashboard/shift-1/allowed.png' },
      { name: 'dashboard/shift-2/denied.png' },
    ])
    await client.query('RESET ROLE')
    await client.query('SET ROLE anon')
    const anonymousObjects = await client.query(
      "SELECT name FROM storage.objects WHERE bucket_id = 'live-dashboard-images' ORDER BY name",
    )
    assert.deepEqual(anonymousObjects.rows, [
      { name: 'dashboard/shift-1/allowed.png' },
      { name: 'dashboard/shift-2/denied.png' },
    ])
    await client.query('RESET ROLE')

    await assert.rejects(
      () => client.query("UPDATE public.schedule_import_batches SET status = 'confirmed' WHERE id = 'excel-batch'"),
      /SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM/u,
    )
    await assert.rejects(
      () => client.query(`INSERT INTO public.operational_schedule_source_files (
        batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
      ) VALUES ('excel-batch', 'raw', 'bad.xlsx', 'application/octet-stream', 1, 'bad', 'business-1')`),
    )
    await assert.rejects(
      () => client.query("INSERT INTO public.shifts (id, status, import_batch_id) VALUES ('blocked-shift', 'scheduled', 'excel-batch')"),
      /SCHEDULE_SOURCE_REQUIRED_BEFORE_IMPORT/u,
    )

    await client.query(`
      INSERT INTO public.operational_schedule_source_files (
        batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
      ) VALUES ('excel-batch', 'raw', 'source.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 12, '${'a'.repeat(64)}', 'business-1')
    `)
    await assert.rejects(() => client.query(`INSERT INTO public.operational_schedule_source_files (
      batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
    ) VALUES ('excel-batch', 'raw', 'source-retry.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 12, '${'a'.repeat(64)}', 'business-1')`))
    await client.query(`UPDATE public.operational_schedule_source_files
      SET external_file_id = 'drive-file-1', external_parent_id = 'drive-folder-1',
        reconciliation_status = 'provider_verified'
      WHERE batch_id = 'excel-batch'`)
    await client.query("UPDATE public.schedule_import_batches SET status = 'confirmed' WHERE id = 'excel-batch'")
    await client.query("INSERT INTO public.shifts (id, status, import_batch_id) VALUES ('allowed-shift', 'scheduled', 'excel-batch')")
    await assert.rejects(
      () => client.query("DELETE FROM public.schedule_import_batches WHERE id = 'excel-batch'"),
    )
    await assert.rejects(
      () => client.query("DELETE FROM public.operational_schedule_source_files WHERE batch_id = 'excel-batch'"),
      /SCHEDULE_SOURCE_CONFIRMED_RECEIPT_IMMUTABLE/u,
    )
    await client.query("UPDATE public.schedule_import_batches SET status = 'confirmed' WHERE id = 'sheets-batch'")

    await client.query('SET ROLE service_role')
    const rateLimit = await client.query(`
      SELECT public.claim_operational_storage_drive_probe_rate_limit('ci-admin', 1, 600) AS first_allowed,
        public.claim_operational_storage_drive_probe_rate_limit('ci-admin', 1, 600) AS second_allowed
    `)
    assert.deepEqual(rateLimit.rows[0], { first_allowed: true, second_allowed: false })
    await client.query('RESET ROLE')

    const connectionString = databaseUrl!
    const receiptWriter = new Client({ connectionString })
    const confirmer = new Client({ connectionString })
    const observer = new Client({ connectionString })
    await Promise.all([receiptWriter.connect(), confirmer.connect(), observer.connect()])
    let parallelConfirmation: Promise<unknown> | null = null
    try {
      await client.query("INSERT INTO public.schedule_import_batches (id, source, status, created_by) VALUES ('parallel-batch', 'excel', 'previewed', 'business-1')")
      await receiptWriter.query('BEGIN')
      await receiptWriter.query(`INSERT INTO public.operational_schedule_source_files (
        batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
      ) VALUES ('parallel-batch', 'raw', 'parallel.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 12, '${'b'.repeat(64)}', 'business-1')`)
      const confirmerPid = Number((await confirmer.query('SELECT pg_backend_pid() AS pid')).rows[0]?.pid)
      parallelConfirmation = (async () => {
        try {
          await confirmer.query("UPDATE public.schedule_import_batches SET status = 'confirmed' WHERE id = 'parallel-batch'")
          return null
        } catch (error) {
          return error
        }
      })()
      await waitForLock(observer, confirmerPid)
      await receiptWriter.query(`UPDATE public.operational_schedule_source_files
        SET external_file_id = 'drive-parallel-file', external_parent_id = 'drive-parallel-folder',
          reconciliation_status = 'provider_verified'
        WHERE batch_id = 'parallel-batch'`)
      await receiptWriter.query('COMMIT')
      assert.equal(await parallelConfirmation, null)
      assert.equal((await client.query("SELECT status FROM public.schedule_import_batches WHERE id = 'parallel-batch'")).rows[0]?.status, 'confirmed')
    } finally {
      await receiptWriter.query('ROLLBACK').catch(() => undefined)
      if (parallelConfirmation) await parallelConfirmation
      await Promise.all([receiptWriter.end(), confirmer.end(), observer.end()])
    }
  } finally {
    await client.end()
  }
})
