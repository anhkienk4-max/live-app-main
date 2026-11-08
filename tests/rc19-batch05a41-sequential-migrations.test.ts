import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const migrationPaths = [
  '../supabase/migrations/20261102110001_rc19_batch05a_report_storage_expand.sql',
  '../supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql',
  '../supabase/migrations/20261102150000_rc19_batch05a4_storage_runtime.sql',
  '../supabase/migrations/20261102160334_rc19_batch05a41_storage_release_blockers.sql',
  '../supabase/migrations/20261102170608_rc19_batch05a42_registry_and_excel_integrity.sql',
].map(path => fileURLToPath(new URL(path, import.meta.url)))
const baselinePath = fileURLToPath(new URL('./fixtures/rc19-batch05a-migration-baseline.sql', import.meta.url))
const baselineSql = await readFile(baselinePath, 'utf8')

test('05A -> 05A.3 -> 05A.4 -> 05A.4.1 -> 05A.4.2 applies and preserves route/receipt gates', async () => {
  const db = new PGlite()
  try {
    assert.match(String((await db.query('select version()')).rows[0]?.version), /^PostgreSQL 17\./u)
    await db.exec(baselineSql)

    await db.exec(`insert into public.schedule_import_batches (id, source, status, created_by)
      values ('legacy-confirmed', 'excel', 'confirmed', 'business-1'),
        ('legacy-preview', 'excel', 'previewed', 'business-1'),
        ('legacy-sheets-confirmed', 'google_sheets', 'confirmed', 'business-1')`)

    for (const path of migrationPaths) await db.exec(await readFile(path, 'utf8'))

    const routes = await db.query(`select
      count(*)::int as total,
      count(*) filter (where active and verified_created)::int as active_verified,
      count(*) filter (where access_classification = 'pending_restriction_no_sensitive_upload')::int as pending,
      count(*) filter (where access_classification = 'restricted_pending_app_acl_verification')::int as restricted_pending,
      count(*) filter (where access_classification = 'restricted_pending_app_acl_verification' and active)::int as active_restricted_pending,
      count(*) filter (where access_classification = 'restricted_verified')::int as restricted_verified
      from public.operational_storage_domain_folders`)
    assert.deepEqual(routes.rows[0], {
      total: 148, active_verified: 93, pending: 16, restricted_pending: 55,
      active_restricted_pending: 0, restricted_verified: 0,
    })
    const registry = JSON.parse(await readFile(fileURLToPath(new URL('../docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json', import.meta.url)), 'utf8')) as {
      folders: Array<{ path: string; id: string; parent_id: string; access_classification: string }>
    }
    const databaseFolders = await db.query(`select folder_path, folder_id, parent_folder_id, access_classification, active
      from public.operational_storage_domain_folders`)
    assert.equal(databaseFolders.rows.length, registry.folders.length)
    const databaseFoldersByPath = new Map(databaseFolders.rows.map(row => [row.folder_path, row]))
    for (const folder of registry.folders) {
      const actual = databaseFoldersByPath.get(folder.path)
      assert.ok(actual, `Missing migration registry path: ${folder.path}`)
      assert.equal(actual.folder_id, folder.id, folder.path)
      assert.equal(actual.parent_folder_id, folder.parent_id, folder.path)
      if (folder.access_classification === 'restricted_pending_app_acl_verification') {
        assert.equal(actual.access_classification, folder.access_classification, folder.path)
        assert.equal(actual.active, false, folder.path)
      }
    }
    assert.deepEqual((await db.query(`select status from public.schedule_import_batches where id = 'legacy-confirmed'`)).rows[0], { status: 'confirmed' })

    await db.exec(`insert into public.schedule_import_batches (id, source, status, created_by)
      values ('excel-batch', 'excel', 'previewed', 'business-1'), ('sheets-batch', 'google_sheets', 'previewed', 'business-1')`)
    await assert.rejects(() => db.exec(`insert into public.schedule_import_batches (id, source, status, created_by)
      values ('insert-confirmed', 'excel', 'confirmed', 'business-1')`), /SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM/u)
    await assert.rejects(() => db.exec(`insert into public.shifts (id, status, import_batch_id)
      values ('blocked-shift', 'scheduled', 'excel-batch')`), /SCHEDULE_SOURCE_REQUIRED_BEFORE_IMPORT/u)
    await assert.rejects(() => db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'excel-batch'`),
      /SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM/u)

    const concurrentUploadAndConfirm = await Promise.allSettled([
      ...[1, 2].map(() => db.exec(`insert into public.operational_schedule_source_files (
        batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
      ) values ('excel-batch', 'raw', 'source.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 12,
        '${'a'.repeat(64)}', 'business-1')`)),
      db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'excel-batch'`),
    ])
    assert.equal(concurrentUploadAndConfirm.slice(0, 2).filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(concurrentUploadAndConfirm[2].status, 'rejected')
    const pendingState = await db.query(`select batch.status, source_file.reconciliation_status
      from public.schedule_import_batches batch
      join public.operational_schedule_source_files source_file on source_file.batch_id = batch.id
      where batch.id = 'excel-batch'`)
    assert.deepEqual(pendingState.rows[0], { status: 'previewed', reconciliation_status: 'pending' })
    await db.exec(`update public.operational_schedule_source_files
      set external_file_id = 'drive-file-1', external_parent_id = 'drive-folder-1',
        reconciliation_status = 'provider_verified'
      where batch_id = 'excel-batch' and checksum_sha256 = '${'a'.repeat(64)}'`)
    const concurrentConfirms = await Promise.allSettled([1, 2].map(() => db.exec(
      `update public.schedule_import_batches set status = 'confirmed' where id = 'excel-batch'`,
    )))
    assert.equal(concurrentConfirms.filter(result => result.status === 'fulfilled').length, 2)
    await db.exec(`insert into public.shifts (id, status, import_batch_id)
      values ('allowed-shift', 'scheduled', 'excel-batch')`)
    assert.equal((await db.query(`select status from public.schedule_import_batches where id='excel-batch'`)).rows[0]?.status, 'confirmed')
    await assert.rejects(() => db.exec(`update public.schedule_import_batches set source = 'google_sheets' where id = 'excel-batch'`),
      /SCHEDULE_SOURCE_CONFIRMED_BATCH_IMMUTABLE/u)
    await assert.rejects(() => db.exec(`update public.schedule_import_batches set id = 'renamed-batch' where id = 'excel-batch'`),
      /SCHEDULE_SOURCE_CONFIRMED_BATCH_IMMUTABLE/u)
    await assert.rejects(() => db.exec(`update public.shifts set import_batch_id = null where id = 'allowed-shift'`),
      /SCHEDULE_SOURCE_CONFIRMED_BATCH_REFERENCE_IMMUTABLE/u)
    await assert.rejects(() => db.exec(`update public.operational_schedule_source_files
      set reconciliation_status = 'reconciliation_required' where batch_id = 'excel-batch'`),
      /SCHEDULE_SOURCE_CONFIRMED_RECEIPT_IMMUTABLE/u)
    await assert.rejects(() => db.exec(`update public.operational_schedule_source_files
      set batch_id = 'sheets-batch' where batch_id = 'excel-batch'`),
      /SCHEDULE_SOURCE_CONFIRMED_RECEIPT_IMMUTABLE/u)
    await assert.rejects(() => db.exec(`delete from public.operational_schedule_source_files where batch_id = 'excel-batch'`),
      /SCHEDULE_SOURCE_CONFIRMED_RECEIPT_IMMUTABLE/u)

    await assert.rejects(() => db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'legacy-preview'`),
      /SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM/u)
    await db.exec(`insert into public.operational_schedule_source_files (
      batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
    ) values ('legacy-preview', 'raw', 'legacy.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 4,
      '${'c'.repeat(64)}', 'business-1')`)
    await db.exec(`update public.operational_schedule_source_files
      set external_file_id = 'legacy-drive-id', external_parent_id = 'drive-folder-1',
        reconciliation_status = 'provider_verified'
      where batch_id = 'legacy-preview'`)
    await db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'legacy-preview'`)
    await db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'sheets-batch'`)
    await assert.rejects(() => db.exec(`insert into public.operational_schedule_source_files (
      batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
    ) values ('unknown-batch', 'raw', 'x.xlsx', 'application/octet-stream', 1, '${'b'.repeat(64)}', 'business-1')`),
    /SCHEDULE_SOURCE_BATCH_NOT_FOUND/u)
  } finally {
    await db.close()
  }
})
