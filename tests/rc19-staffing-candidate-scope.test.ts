import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const migrationPath = fileURLToPath(new URL('../supabase/migrations/20261108135226_rc19_staffing_candidate_brand_scope.sql', import.meta.url))
const rpc = 'public.search_staffing_candidates(text,text,text,integer,integer)'
const adminAuthId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const leaderAuthId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const memberAuthId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

async function makeDatabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema private;
    create table public.brands (
      id text primary key, status text not null, archived_at timestamptz, deleted_at timestamptz
    );
    create table public.business_users (
      id text primary key, auth_user_id uuid unique, full_name text not null,
      system_permission text not null, operational_roles text[] not null,
      status text not null, account_status text not null,
      archived_at timestamptz, deleted_at timestamptz
    );
    create table public.shifts (
      id text primary key, brand_id text not null, status text not null,
      allow_multi_role boolean not null default false, start_at timestamptz not null,
      end_at timestamptz not null, deleted_at timestamptz, archived_at timestamptz
    );
    create table public.shift_registrations (
      id text primary key, shift_id text not null, user_id text not null,
      operational_role text not null, status text not null
    );
    create table public.rc19_leader_brand_scopes (
      leader_business_user_id text not null, brand_id text not null,
      scope_key text not null, status text not null,
      valid_from timestamptz not null, valid_until timestamptz
    );
    create table private.rbac_permission_catalog (permission text primary key);
    insert into private.rbac_permission_catalog values ('shifts.assign_staff');
    create table private.test_account_permission_denies (
      actor_id text not null, permission text not null, primary key(actor_id, permission)
    );

    create function private.current_business_user_id() returns text
    language sql stable security definer set search_path = '' as $$
      select u.id from public.business_users u
      where u.auth_user_id = nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
        and u.status = 'active' and u.account_status = 'active'
        and u.archived_at is null and u.deleted_at is null
    $$;
    create function private.current_business_user_is_active() returns boolean
    language sql stable security definer set search_path = '' as $$
      select private.current_business_user_id() is not null
    $$;
    create function private.current_system_permission() returns text
    language sql stable security definer set search_path = '' as $$
      select u.system_permission from public.business_users u
      where u.id = private.current_business_user_id()
    $$;
    create function private.require_shift_actor(p_leader_required boolean) returns text
    language plpgsql stable security definer set search_path = '' as $$
    declare actor_id text := private.current_business_user_id();
    begin
      if actor_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
      if p_leader_required and private.current_system_permission() not in ('leader', 'admin') then
        raise exception 'OPERATION_NOT_ALLOWED' using errcode = '42501';
      end if;
      return actor_id;
    end $$;
    create function private.rbac_has_permission(p_permission text) returns boolean
    language sql stable security definer set search_path = '' as $$
      select private.current_system_permission() in ('leader', 'admin')
        and not exists (
          select 1 from private.test_account_permission_denies d
          where d.actor_id = private.current_business_user_id() and d.permission = p_permission
        )
    $$;
    create function private.rc19_has_any_leader_brand_scope(p_brand_id text, p_scope_keys text[])
      returns boolean language sql stable security definer set search_path = '' as $$
      select coalesce(private.current_business_user_is_active()
        and private.current_system_permission() = 'leader'
        and exists (
          select 1 from public.rc19_leader_brand_scopes scope_row
          join public.brands brand on brand.id = scope_row.brand_id
          where scope_row.leader_business_user_id = private.current_business_user_id()
            and scope_row.brand_id = p_brand_id and scope_row.scope_key = any(p_scope_keys)
            and scope_row.status = 'active' and scope_row.valid_from <= statement_timestamp()
            and (scope_row.valid_until is null or statement_timestamp() < scope_row.valid_until)
            and brand.status = 'active' and brand.archived_at is null and brand.deleted_at is null
        ), false)
    $$;

    insert into public.brands(id, status) values ('brand-a', 'active'), ('brand-b', 'active');
    insert into public.business_users(id, auth_user_id, full_name, system_permission, operational_roles, status, account_status) values
      ('admin', '${adminAuthId}', 'Admin', 'admin', array[]::text[], 'active', 'active'),
      ('leader', '${leaderAuthId}', 'Leader', 'leader', array[]::text[], 'active', 'active'),
      ('member', '${memberAuthId}', 'Member', 'member', array[]::text[], 'active', 'active'),
      ('host-a', null, 'Alpha Host', 'member', array['host']::text[], 'active', 'active'),
      ('host-b', null, 'Beta Host', 'member', array['host']::text[], 'active', 'active'),
      ('support-only', null, 'Support Only', 'member', array['support']::text[], 'active', 'active'),
      ('inactive-host', null, 'Inactive Host', 'member', array['host']::text[], 'inactive', 'active');
    insert into public.shifts(id, brand_id, status, start_at, end_at) values
      ('shift-a', 'brand-a', 'scheduled', '2026-11-10 01:00+00', '2026-11-10 03:00+00'),
      ('shift-b', 'brand-b', 'scheduled', '2026-11-10 04:00+00', '2026-11-10 06:00+00'),
      ('overlap', 'brand-b', 'scheduled', '2026-11-10 02:00+00', '2026-11-10 03:30+00');
    insert into public.shift_registrations(id, shift_id, user_id, operational_role, status) values
      ('assigned-a', 'shift-a', 'host-b', 'host', 'manually_assigned'),
      ('conflict-a', 'overlap', 'host-a', 'host', 'approved');
    insert into public.rc19_leader_brand_scopes(
      leader_business_user_id, brand_id, scope_key, status, valid_from, valid_until
    ) values ('leader', 'brand-a', 'shifts.manage', 'active', statement_timestamp() - interval '1 day', null);
  `)
  await db.exec(await readFile(migrationPath, 'utf8'))
  return db
}

async function runAs(db: PGlite, authId: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${authId}';`)
  try {
    return await db.query(sql)
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub;')
  }
}

test('staffing candidate RPC is only executable by authenticated and reveals no direct user table access', async () => {
  const db = await makeDatabase()
  try {
    const privileges = await db.query(`select
      has_function_privilege('anon', '${rpc}', 'execute') as anon_execute,
      has_function_privilege('authenticated', '${rpc}', 'execute') as authenticated_execute,
      has_function_privilege('service_role', '${rpc}', 'execute') as service_execute,
      has_table_privilege('authenticated', 'public.business_users', 'select') as auth_directory_select,
      pg_catalog.pg_get_userbyid(p.proowner) as owner
      from pg_catalog.pg_proc p where p.oid = '${rpc}'::regprocedure`)
    assert.deepEqual(privileges.rows[0], {
      anon_execute: false,
      authenticated_execute: true,
      service_execute: false,
      auth_directory_select: false,
      owner: 'postgres',
    })
  } finally {
    await db.close()
  }
})

test('Admin can search globally and Leader sees only candidates for a currently managed Brand shift', async () => {
  const db = await makeDatabase()
  try {
    const leader = await runAs(db, leaderAuthId,
      `select public.search_staffing_candidates('shift-a', 'host', '', 20, 0) as result`)
    const result = leader.rows[0]?.result as { total: number; items: Array<Record<string, unknown>> }
    assert.equal(result.total, 2)
    assert.deepEqual(result.items.map(item => item.user_id), ['host-a', 'host-b'])
    assert.deepEqual(result.items.map(item => item.availability), ['conflict', 'already_on_shift'])
    assert.equal('email' in result.items[0]!, false)

    const admin = await runAs(db, adminAuthId,
      `select public.search_staffing_candidates('shift-b', 'host', 'beta', 20, 0) as result`)
    assert.deepEqual(admin.rows[0]?.result, {
      total: 1,
      items: [{ user_id: 'host-b', full_name: 'Beta Host', availability: 'available' }],
    })
  } finally {
    await db.close()
  }
})

test('foreign Brand, revoked or expired scope, permission denial, Member, and forged identity fail closed', async () => {
  const db = await makeDatabase()
  try {
    await assert.rejects(
      () => runAs(db, leaderAuthId, `select public.search_staffing_candidates('shift-b', 'host')`),
      /SHIFT_NOT_FOUND/u,
    )

    await db.exec(`update public.rc19_leader_brand_scopes set status = 'revoked' where brand_id = 'brand-a'`)
    await assert.rejects(
      () => runAs(db, leaderAuthId, `select public.search_staffing_candidates('shift-a', 'host')`),
      /SHIFT_NOT_FOUND/u,
    )
    await db.exec(`update public.rc19_leader_brand_scopes set status = 'active', valid_until = statement_timestamp() - interval '1 second'`)
    await assert.rejects(
      () => runAs(db, leaderAuthId, `select public.search_staffing_candidates('shift-a', 'host')`),
      /SHIFT_NOT_FOUND/u,
    )

    await db.exec(`update public.rc19_leader_brand_scopes set valid_until = null`)
    await db.exec(`insert into private.test_account_permission_denies values ('leader', 'shifts.assign_staff')`)
    await assert.rejects(
      () => runAs(db, leaderAuthId, `select public.search_staffing_candidates('shift-a', 'host')`),
      /RBAC_PERMISSION_DENIED/u,
    )
    await assert.rejects(
      () => runAs(db, memberAuthId, `select public.search_staffing_candidates('shift-a', 'host')`),
      /OPERATION_NOT_ALLOWED/u,
    )
    await assert.rejects(
      () => runAs(db, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', `select public.search_staffing_candidates('shift-a', 'host')`),
      /AUTHENTICATION_REQUIRED/u,
    )
  } finally {
    await db.close()
  }
})
