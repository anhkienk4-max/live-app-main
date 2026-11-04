import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { Client } from 'pg'

const SOURCE_DATABASE = 'rc19_sto01_migrations_disposable'
const SOURCE_MARKER = 'RC19_STO01_MIGRATIONS_DISPOSABLE_TEST_DATABASE'
const RESTORE_DATABASE = 'rc19_restore_disposable'
const RESTORE_MARKER = 'RC19_RESTORE_DISPOSABLE_TEST_DATABASE'

function connectionUrl(env: NodeJS.ProcessEnv): URL | null {
  if (!env.DATABASE_URL) {
    if (env.CI === 'true' || env.RC19_RESTORE_REHEARSAL_DISPOSABLE_TEST_DATABASE === 'I_UNDERSTAND') {
      throw new Error('[RC19 RESTORE GATE] DATABASE_URL is required for the PostgreSQL 17 CI fixture restore')
    }
    return null
  }

  let url: URL
  try {
    url = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('[RC19 RESTORE GATE] DATABASE_URL must target the disposable migration fixture')
  }

  if (
    env.CI !== 'true' ||
    env.RC19_RESTORE_REHEARSAL_DISPOSABLE_TEST_DATABASE !== 'I_UNDERSTAND' ||
    env.RC19_STO01_MIGRATIONS_DISPOSABLE_TEST_DATABASE !== 'I_UNDERSTAND' ||
    env.VERCEL || env.VERCEL_ENV ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    url.port !== '5432' ||
    decodeURIComponent(url.pathname.slice(1)) !== SOURCE_DATABASE ||
    url.username !== 'rc19_ci'
  ) {
    throw new Error('[RC19 RESTORE GATE] Refusing non-disposable PostgreSQL source')
  }

  return url
}

async function readIdentity(client: Client) {
  const result = await client.query<{
    database_name: string
    session_user: string
    server_version_num: string
    database_comment: string | null
  }>(`
    select current_database() as database_name,
           session_user,
           current_setting('server_version_num') as server_version_num,
           shobj_description(d.oid, 'pg_database') as database_comment
    from pg_database d
    where d.datname = current_database()
  `)
  assert.equal(result.rowCount, 1)
  return result.rows[0]
}

async function tableFingerprints(client: Client) {
  const tables = await client.query<{ schema_name: string; table_name: string }>(`
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and not c.relispartition
      and n.nspname = any($1::text[])
    order by n.nspname, c.relname
  `, [['public', 'private', 'storage']])

  const fingerprints = []
  for (const table of tables.rows) {
    const relation = `${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.table_name)}`
    const result = await client.query<{ row_count: string; checksum: string }>(`
      select count(*)::text as row_count,
             md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' order by md5(to_jsonb(t)::text)), '')) as checksum
      from ${relation} t
    `)
    fingerprints.push({ ...table, ...result.rows[0] })
  }
  return fingerprints
}

async function schemaFingerprints(client: Client) {
  const schemas = ['public', 'private', 'storage']
  const catalogs = {
    columns: `select table_schema, table_name, column_name, ordinal_position, column_default,
                    is_nullable, data_type, udt_schema, udt_name, is_identity, identity_generation
             from information_schema.columns
             where table_schema = any($1::text[]) order by table_schema, table_name, ordinal_position`,
    constraints: `select n.nspname as schema_name, t.relname as table_name, c.conname, c.contype,
                        c.convalidated, pg_get_constraintdef(c.oid) as definition
                 from pg_constraint c join pg_class t on t.oid = c.conrelid
                 join pg_namespace n on n.oid = t.relnamespace
                 where n.nspname = any($1::text[]) order by n.nspname, t.relname, c.conname`,
    indexes: `select schemaname, tablename, indexname, indexdef from pg_indexes
              where schemaname = any($1::text[]) order by schemaname, tablename, indexname`,
    policies: `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
               from pg_policies where schemaname = any($1::text[])
               order by schemaname, tablename, policyname`,
    triggers: `select n.nspname as schema_name, t.relname as table_name, g.tgname,
                      pg_get_triggerdef(g.oid) as definition
               from pg_trigger g join pg_class t on t.oid = g.tgrelid
               join pg_namespace n on n.oid = t.relnamespace
               where not g.tgisinternal and n.nspname = any($1::text[])
               order by n.nspname, t.relname, g.tgname`,
    functions: `select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
                       pg_get_functiondef(p.oid) as definition
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = any($1::text[]) and p.prokind = 'f'
                order by n.nspname, p.proname, arguments`,
  }
  const fingerprints: Record<string, string> = {}
  for (const [name, query] of Object.entries(catalogs)) {
    const result = await client.query(query, [schemas])
    fingerprints[name] = createHash('sha256').update(JSON.stringify(result.rows)).digest('hex')
  }
  return fingerprints
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function runPostgres17Client(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync('docker', [
    'run', '--rm', '--network', 'host', '--env', 'PGPASSWORD',
    '--volume', `${env.RC19_RESTORE_TEMP_DIR}:/backup`,
    'postgres:17-alpine', ...args,
  ], { encoding: 'utf8', env, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `PostgreSQL 17 client failed: ${result.stderr}`)
  return result.stdout.trim()
}

test('RC19 05A synthetic fixture pg_dump/restore preserves schema and row fingerprints', async (t) => {
  const sourceUrl = connectionUrl(process.env)
  if (!sourceUrl) {
    t.skip('PostgreSQL 17 restore rehearsal is configured only in the disposable CI database')
    return
  }

  assert.equal(process.platform, 'linux', 'The PostgreSQL 17 Docker client restore gate runs on the Linux CI runner')
  const sourceClient = new Client({ connectionString: sourceUrl.toString(), connectionTimeoutMillis: 3000 })
  const restoreUrl = new URL(sourceUrl.toString())
  restoreUrl.pathname = `/${RESTORE_DATABASE}`
  const restoreClient = new Client({ connectionString: restoreUrl.toString(), connectionTimeoutMillis: 3000 })
  const tempRoot = path.resolve(os.tmpdir())
  const tempDirectory = mkdtempSync(path.join(tempRoot, 'rc19-postgres-restore-'))
  const resolvedTemp = path.resolve(tempDirectory)
  assert.ok(resolvedTemp.startsWith(`${tempRoot}${path.sep}`), 'Temporary archive directory must remain under the OS temp directory')

  try {
    await sourceClient.connect()
    await restoreClient.connect()
    const sourceIdentity = await readIdentity(sourceClient)
    const restoreIdentity = await readIdentity(restoreClient)
    assert.equal(sourceIdentity.database_name, SOURCE_DATABASE)
    assert.equal(sourceIdentity.session_user, 'rc19_ci')
    assert.ok(sourceIdentity.server_version_num.startsWith('17'))
    assert.equal(sourceIdentity.database_comment, SOURCE_MARKER)
    assert.equal(restoreIdentity.database_name, RESTORE_DATABASE)
    assert.equal(restoreIdentity.session_user, 'rc19_ci')
    assert.ok(restoreIdentity.server_version_num.startsWith('17'))
    assert.equal(restoreIdentity.database_comment, RESTORE_MARKER)

    const destinationTables = await restoreClient.query(`
      select count(*)::int as count
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1::text[]) and c.relkind in ('r', 'p', 'v', 'm', 'S')
    `, [['public', 'private', 'storage']])
    assert.equal(destinationTables.rows[0]?.count, 0, 'Restore destination must be empty before pg_restore')

    const sourceFingerprints = await tableFingerprints(sourceClient)
    const sourceSchemaFingerprints = await schemaFingerprints(sourceClient)
    const sourceNames = new Set(sourceFingerprints.map(table => `${table.schema_name}.${table.table_name}`))
    for (const required of [
      'public.shifts',
      'public.schedule_import_batches',
      'public.operational_storage_domain_folders',
      'public.operational_schedule_source_files',
      'public.report_images',
      'public.live_report_images',
      'storage.objects',
    ]) {
      assert.ok(sourceNames.has(required), `Fixture is missing expected 05A source relation ${required}`)
    }

    const childEnv = { ...process.env, RC19_RESTORE_TEMP_DIR: resolvedTemp }
    if (sourceUrl.password) childEnv.PGPASSWORD = decodeURIComponent(sourceUrl.password)
    runPostgres17Client([
      'pg_dump', '-h', sourceUrl.hostname.replace(/[\[\]]/g, ''), '-p', '5432', '-U', 'rc19_ci',
      '--format=custom', '--no-owner', '--file', '/backup/rc19-fixture.dump', SOURCE_DATABASE,
    ], childEnv)
    const archivePath = path.join(resolvedTemp, 'rc19-fixture.dump')
    const archiveBytes = statSync(archivePath).size
    assert.ok(archiveBytes > 0, 'Custom-format logical backup must not be empty')
    const archiveSha256 = createHash('sha256').update(readFileSync(archivePath)).digest('hex')

    runPostgres17Client([
      'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '-h', sourceUrl.hostname.replace(/[\[\]]/g, ''),
      '-p', '5432', '-U', 'rc19_ci', '-d', RESTORE_DATABASE, '/backup/rc19-fixture.dump',
    ], childEnv)

    const restoredFingerprints = await tableFingerprints(restoreClient)
    const restoredSchemaFingerprints = await schemaFingerprints(restoreClient)
    assert.deepEqual(restoredFingerprints, sourceFingerprints, 'Restored fixture tables and row checksums must match the backup source')
    assert.deepEqual(restoredSchemaFingerprints, sourceSchemaFingerprints, 'Restored table, constraint, index, RLS policy, trigger, and function definitions must match')
    assert.equal((await readIdentity(restoreClient)).database_comment, RESTORE_MARKER, 'Restore must remain isolated in its marked destination database')
    console.log(`[RC19 RESTORE FIXTURE] tables=${sourceFingerprints.length} schema_catalogs=${Object.keys(sourceSchemaFingerprints).length} archive_bytes=${archiveBytes} archive_sha256=${archiveSha256}`)
    console.log('[RC19 RESTORE FIXTURE] Scope is the synthetic 05A migration fixture; not a Production backup or full Workforce restore.')
  } finally {
    await Promise.allSettled([sourceClient.end(), restoreClient.end()])
    rmSync(resolvedTemp, { recursive: true, force: true })
  }
})
