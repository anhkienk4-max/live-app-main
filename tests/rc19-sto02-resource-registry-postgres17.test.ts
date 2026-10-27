import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const databaseUrl = process.env.DATABASE_URL
const migration = fs.readFileSync(path.resolve('supabase/migrations/20261027150000_rc19_sto02_resource_registry.sql'), 'utf8')
const disposableName = 'rc19_sto02_disposable'

test('STO-02 registry migration enforces PostgreSQL 17 visibility, privacy, and route isolation', async t => {
  if (!databaseUrl) {
    if (process.env.CI) throw new Error('[POSTGRES-17] DATABASE_URL is required in CI')
    t.skip('Dedicated disposable PostgreSQL 17 server is not configured')
    return
  }
  let url: URL
  try { url = new URL(databaseUrl) } catch { throw new Error('[POSTGRES-17] DATABASE_URL must identify the dedicated disposable database') }
  const database = decodeURIComponent(url.pathname.slice(1))
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())
    || database !== disposableName
    || process.env.RC19_STO02_DISPOSABLE_TEST_DATABASE !== 'I_UNDERSTAND') {
    throw new Error('[POSTGRES-17] Refusing destructive schema initialization outside the explicitly confirmed local disposable STO-02 database')
  }
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
  await client.connect()
  try {
    const identity = await client.query('select current_database() as db, current_user as actor, current_setting(\'server_version_num\')::int as version')
    assert.equal(identity.rows[0]?.db, disposableName)
    assert.equal(identity.rows[0]?.actor, 'postgres')
    assert.ok(identity.rows[0]?.version >= 170000 && identity.rows[0]?.version < 180000, 'PostgreSQL Server 17 is required')
    const occupied = await client.query(`
      select count(*)::int as count from (
        select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
        union all select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
        union all select t.oid from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'
      ) public_objects
    `)
    assert.equal(occupied.rows[0]?.count, 0, '[POSTGRES-17] Refusing to initialize a database whose public schema is not empty')
    await client.query('begin')
    await client.query('drop schema public cascade; create schema public; create schema private;')
    await client.query(`
      create role anon nologin; create role authenticated nologin;
      create table public.business_users(id text primary key, full_name text, system_permission text);
      insert into public.business_users values ('admin','Admin','admin'),('owner','Owner','member'),('member','Member','member');
      create table public.brands(id text primary key);
      create table public.campaigns(id text primary key);
      create table public.platforms(id text primary key);
      create table public.shifts(id text primary key);
      create table public.operational_storage_routes(id text primary key, root_folder_id text not null);
      insert into public.operational_storage_routes values ('approved-route','approved-root');
      grant select on public.business_users to authenticated;
      create function private.current_business_user_id() returns text language sql stable as $$ select nullif(current_setting('sto02.actor', true), '') $$;
      create function private.current_business_user_is_active() returns boolean language sql stable as $$ select private.current_business_user_id() is not null $$;
      create function private.current_system_permission() returns text language sql stable as $$ select system_permission from public.business_users where id = private.current_business_user_id() $$;
      create function private.is_admin() returns boolean language sql stable as $$ select coalesce(private.current_system_permission() = 'admin', false) $$;
      grant usage on schema public, private to authenticated;
      grant execute on function private.current_business_user_id(), private.current_business_user_is_active(), private.current_system_permission(), private.is_admin() to authenticated;
    `)
    await client.query(migration)
    await client.query(`
      select set_config('sto02.actor','admin',true);
      insert into public.storage_resources(provider,canonical_id,canonical_url,title,resource_type,owner_id,visibility,created_by,updated_by)
        values ('google_drive','admin-only','https://drive.google.com/drive/folders/a','Private Admin','root_folder','admin','admin_only','admin','admin'),
               ('google_drive','granted','https://drive.google.com/drive/folders/b','Granted','google_sheet','admin','granted_users','admin','admin'),
               ('google_drive','scope-only','https://drive.google.com/drive/folders/s','Scope only','root_folder','admin','admin_only','admin','admin'),
               ('google_drive','owner','https://drive.google.com/drive/folders/c','Owner','contract','owner','owner_only','admin','admin'),
               ('onedrive','attendance','https://tenant.sharepoint.com/sites/private/attendance','Attendance','attendance_evidence','owner','owner_only','admin','admin');
      insert into public.storage_resource_scopes(resource_id,brand_id,created_by)
        select id,'brand-a','admin' from public.storage_resources where canonical_id in ('granted','scope-only');
      insert into public.storage_resource_user_grants(resource_id,user_id,granted_by)
        select id,'member','admin' from public.storage_resources where canonical_id='granted';
    `)
    await client.query('set local role authenticated')
    await client.query("select set_config('sto02.actor','member',true)")
    const memberRows = await client.query('select canonical_id from public.storage_resources order by canonical_id')
    assert.deepEqual(memberRows.rows.map(row => row.canonical_id), ['granted'])
    const rejectedWrite = await client.query("update public.storage_resources set title='forged' where canonical_id='granted'")
    assert.equal(rejectedWrite.rowCount, 0, 'Member must not edit registry metadata')
    await client.query('savepoint rejected_member_insert')
    await assert.rejects(
      client.query(`insert into public.storage_resources(provider,canonical_id,canonical_url,title,resource_type,owner_id,visibility,created_by,updated_by) values ('google_drive','member-created','https://drive.google.com/drive/folders/member-created','Forged','root_folder','member','owner_only','member','member')`),
      (error: { code?: string }) => error.code === '42501',
    )
    await client.query('rollback to savepoint rejected_member_insert; release savepoint rejected_member_insert')
    const memberAudit = await client.query('select id from public.storage_resource_audit_events')
    assert.equal(memberAudit.rowCount, 0, 'Audit history is Admin-only')
    await client.query("select set_config('sto02.actor','owner',true)")
    const ownerRows = await client.query("select canonical_id from public.storage_resources where canonical_id='owner'")
    assert.equal(ownerRows.rowCount, 1)
    await client.query("select set_config('sto02.actor','admin',true)")
    await client.query('savepoint rejected_attendance_scope')
    await assert.rejects(
      client.query(`insert into public.storage_resource_scopes(resource_id,brand_id,created_by) select id,'brand-a','admin' from public.storage_resources where canonical_id='attendance'`),
      (error: { code?: string }) => error.code === '23514',
    )
    await client.query('rollback to savepoint rejected_attendance_scope; release savepoint rejected_attendance_scope')
    await client.query('savepoint rejected_duplicate_resource')
    await assert.rejects(
      client.query(`insert into public.storage_resources(provider,canonical_id,canonical_url,title,resource_type,owner_id,visibility,created_by,updated_by) values ('google_drive','granted','https://drive.google.com/drive/folders/duplicate','Duplicate','root_folder','admin','admin_only','admin','admin')`),
      (error: { code?: string }) => error.code === '23505',
    )
    await client.query('rollback to savepoint rejected_duplicate_resource; release savepoint rejected_duplicate_resource')
    await client.query('savepoint rejected_duplicate_url')
    await assert.rejects(
      client.query(`insert into public.storage_resources(provider,canonical_id,canonical_url,title,resource_type,owner_id,visibility,created_by,updated_by) values ('onedrive','another-id','https://tenant.sharepoint.com/sites/private/attendance','Duplicate URL','other','admin','admin_only','admin','admin')`),
      (error: { code?: string }) => error.code === '23505',
    )
    await client.query('rollback to savepoint rejected_duplicate_url; release savepoint rejected_duplicate_url')
    await client.query('reset role')
    const audit = await client.query('select action from public.storage_resource_audit_events')
    assert.ok(['resource_insert', 'scope_insert', 'grant_insert'].every(action => audit.rows.some(row => row.action === action)))
    const routes = await client.query('select root_folder_id from public.operational_storage_routes where id=\'approved-route\'')
    assert.equal(routes.rows[0]?.root_folder_id, 'approved-root', 'registry must preserve approved upload route')
  } finally {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  }
})
