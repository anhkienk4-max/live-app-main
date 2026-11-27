import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/20261126130000_rc19_w4_canonical_agency_membership.sql', import.meta.url),
  'utf8',
)

test('Agency membership migration applies, denies unresolved scope, and enforces effective membership', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema private;
      create table public.business_users (
        id text primary key, status text not null default 'active', account_status text not null default 'active',
        deleted_at timestamptz, archived_at timestamptz
      );
      create table public.shifts (id text primary key, agency_code text);
      create table public.shift_registrations (id text primary key, shift_id text not null, user_id text not null);
      create table public.shift_operational_notes (id text primary key, shift_id text not null, affected_user_id text);
      create table private.rc19_staff_incidents (
        id uuid primary key, shift_id text not null, effective_at timestamptz,
        original_staff_id text not null, replacement_staff_id text
      );
      create function private.current_business_user_id() returns text language sql stable as $$ select 'actor-1' $$;
      create function private.current_business_user_is_active() returns boolean language sql stable as $$ select true $$;
      create function private.current_system_permission() returns text language sql stable as $$ select 'member' $$;
    `)
    await db.exec(migration)
    await db.exec(`insert into public.business_users(id) values ('actor-1'), ('staff-1'), ('outside-1');`)
    await db.exec(`insert into public.shifts(id, agency_code) values ('shift-1','ada'), ('shift-unmapped','snap');`)
    const unresolved = await db.query(`select private.rc19_actor_has_shift_agency_scope('actor-1', 'shift-unmapped') as allowed`)
    assert.equal(unresolved.rows[0].allowed, false)

    const agencyId = 'dfe2782b-b4ee-4da7-a43f-cc35b0d38b64'
    await db.exec(`insert into private.rc19_agencies (
      id, source_system, authoritative_key, display_name, source_version, source_snapshot_sha256
    ) values ('${agencyId}', 'hr-fixture', 'agency-a', 'Agency A', 'fixture-v1', '${'a'.repeat(64)}');`)
    await db.exec(`update public.shifts set authoritative_agency_id = '${agencyId}' where id = 'shift-1';`)
    await db.exec(`insert into private.rc19_business_user_agency_memberships (
      business_user_id, agency_id, effective_from, status, source_system, source_user_key,
      source_agency_key, source_record_key, source_version, source_snapshot_sha256
    ) values
      ('actor-1','${agencyId}','2026-01-01T00:00:00Z','active','hr-fixture','hr-u1','agency-a','membership-actor','fixture-v1','${'b'.repeat(64)}'),
      ('staff-1','${agencyId}','2026-01-01T00:00:00Z','active','hr-fixture','hr-u2','agency-a','membership-staff','fixture-v1','${'b'.repeat(64)}');`)

    const allowed = await db.query(`select private.rc19_actor_has_shift_agency_scope('actor-1', 'shift-1') as allowed`)
    assert.equal(allowed.rows[0].allowed, true)
    await db.exec(`insert into public.shift_registrations(id, shift_id, user_id) values ('reg-1','shift-1','staff-1');`)
    await assert.rejects(() => db.exec(`insert into public.shift_registrations(id, shift_id, user_id)
      values ('reg-outside','shift-1','outside-1')`), /RC19_AGENCY_CANDIDATE_MEMBERSHIP_REQUIRED/u)
    await assert.rejects(() => db.exec(`insert into public.shift_registrations(id, shift_id, user_id)
      values ('reg-unresolved','shift-unmapped','staff-1')`), /RC19_AGENCY_SCOPE_UNRESOLVED/u)
    const events = await db.query(`select count(*)::int as count from private.rc19_agency_membership_events`)
    assert.equal(events.rows[0].count, 2)
    await assert.rejects(() => db.exec(`insert into private.rc19_business_user_agency_memberships (
      business_user_id, agency_id, effective_from, status, source_system, source_user_key,
      source_agency_key, source_record_key, source_version, source_snapshot_sha256
    ) values ('staff-1','${agencyId}','2026-02-01T00:00:00Z','active','hr-fixture','hr-u2','agency-a','membership-staff-overlap','fixture-v2','${'c'.repeat(64)}')`), /RC19_AGENCY_MEMBERSHIP_INTERVAL_OVERLAP/u)
  } finally {
    await db.close()
  }
})
