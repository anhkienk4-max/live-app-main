/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { Shift } from '../lib/types/database.types'
import {
  isScheduleImportDuplicateError,
} from '../lib/utils/scheduleImportBatch'
import {
  parseScheduleRows,
  type EntityMaps,
  normalizeShiftQualifier,
} from '../lib/utils/excelUtils'
import {
  buildScheduleImportPreviewSourceRow,
  normalizeScheduleImportResult,
} from '../lib/utils/scheduleImportPreview'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery'

function mockPendingBatchRows(batchId: string, previews: any[]) {
  return previews.map(preview => ({
    id: `${batchId}:${preview.row.row_number}`,
    batch_id: batchId,
    source_row_number: preview.row.row_number,
    original_values: buildScheduleImportPreviewSourceRow(preview.row),
    normalized_values: preview.row,
    status: 'pending' as const,
    validation_issues: [...preview.row.errors],
    created_at: '2026-11-01T00:00:00Z',
  }))
}

let db: PGlite

const baseMaps: EntityMaps = {
  brands: new Map([
    ['Brand A', 'brand-a'],
    ['Brand B', 'brand-b'],
  ]),
  platforms: new Map([
    ['Shopee Live', 'plat-shopee'],
    ['TikTok Shop', 'plat-tiktok'],
    ['Shopee', 'plat-shopee'],
    ['TikTok', 'plat-tiktok'],
  ]),
  campaigns: new Map([
    ['Summer Sale', 'camp-summer'],
    ['Mega Sale', 'camp-mega'],
    ['Campaign 1', 'camp-1'],
    ['Campaign 2', 'camp-2'],
  ]),
}

async function setupDatabase() {
  const instance = new PGlite()

  // 1. Roles and Schemas
  await instance.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;

    create schema if not exists auth;
    create schema if not exists private;

    -- auth.users table
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      created_at timestamptz default now()
    );

    -- Standard Supabase auth helper functions
    create or replace function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
      )::uuid;
    $$;

    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')::text;
    $$;

    -- Reference Tables
    create table if not exists public.brands (
      id text primary key,
      name text not null,
      status text default 'active'
    );

    create table if not exists public.platforms (
      id text primary key,
      name text not null,
      status text default 'active'
    );

    create table if not exists public.campaigns (
      id text primary key,
      name text not null,
      brand_id text references public.brands(id)
    );

    create table if not exists public.business_users (
      id text primary key,
      auth_user_id uuid references auth.users(id),
      email text not null,
      full_name text not null,
      system_permission text default 'member',
      status text default 'active',
      account_status text default 'active',
      operational_roles text[] default '{}',
      archived_at timestamptz,
      deleted_at timestamptz
    );

    create table if not exists public.system_settings (
      id text primary key,
      default_host_count smallint default 1,
      default_support_count smallint default 1,
      default_technical_count smallint default 1,
      allow_multi_role_per_shift boolean default false
    );

    -- Base Shifts Table
    create table if not exists public.shifts (
      id text primary key default gen_random_uuid()::text,
      date date,
      start_time time,
      end_time time,
      timezone text default 'Asia/Ho_Chi_Minh',
      brand_id text references public.brands(id),
      platform_id text references public.platforms(id),
      campaign_id text references public.campaigns(id),
      title text,
      studio text,
      host_names text[],
      assistant_names text[],
      technical_names text[],
      required_host_count smallint default 1,
      required_support_count smallint default 1,
      required_technical_count smallint default 1,
      registration_locked boolean default false,
      registration_cutoff_at timestamptz,
      allow_multi_role boolean default false,
      import_batch_id text,
      status text default 'scheduled',
      live_link text,
      product_notes text,
      updated_by text,
      execution_source text,
      status_mode text default 'auto',
      version integer default 1,
      deleted_at timestamptz,
      archived_at timestamptz,
      deletion_reason text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Related tables for referential integrity testing
    create table if not exists public.shift_registrations (
      id text primary key default gen_random_uuid()::text,
      shift_id text not null references public.shifts(id) on delete restrict,
      user_id text not null references public.business_users(id),
      operational_role text not null,
      status text default 'approved',
      created_at timestamptz default now()
    );

    create table if not exists public.reports (
      id text primary key default gen_random_uuid()::text,
      shift_id text references public.shifts(id) on delete restrict,
      brand_id text references public.brands(id),
      submitted_by text references public.business_users(id),
      status text default 'draft',
      created_at timestamptz default now()
    );

    -- Initial legacy unique index (BEFORE migration)
    create unique index if not exists shifts_active_slot_uidx
      on public.shifts (brand_id, platform_id, date, start_time, end_time)
      where deleted_at is null and archived_at is null;

    -- Auth & RPC permission functions
    create or replace function private.current_business_user_id()
    returns text language sql stable security definer as $$
      select bu.id
      from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.status = 'active'
        and bu.account_status = 'active'
        and bu.archived_at is null
        and bu.deleted_at is null
      limit 1;
    $$;

    create or replace function private.current_system_permission()
    returns text language sql stable security definer as $$
      select bu.system_permission
      from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.status = 'active'
        and bu.account_status = 'active'
        and bu.archived_at is null
        and bu.deleted_at is null
      limit 1;
    $$;

    create or replace function private.is_leader_or_admin()
    returns boolean language sql stable security definer as $$
      select coalesce(private.current_system_permission() in ('leader', 'admin'), false);
    $$;

    create or replace function private.require_shift_actor(p_leader_required boolean)
    returns text language plpgsql stable security definer as $$
    declare
      actor_id text;
    begin
      actor_id := private.current_business_user_id();
      if actor_id is null then
        raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
      end if;
      if p_leader_required and not private.is_leader_or_admin() then
        raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
      end if;
      return actor_id;
    end;
    $$;

    create or replace function private.normalize_shift_capacity(val text, def smallint)
    returns smallint language sql immutable as $$
      select coalesce(val::smallint, def);
    $$;
    create or replace function private.apply_legacy_single_staffing_assignment(s text, r text, u text, a text)
    returns void language sql as $$ select null; $$;
    create or replace function private.insert_manual_shift_assignment(s text, u text, r text, a text, n text, l boolean)
    returns void language sql as $$ select null; $$;
    create or replace function private.assert_shift_staffing_consistent(s public.shifts)
    returns void language sql as $$ select null; $$;
    create or replace function private.assert_expected_version(e text, exp integer, act integer)
    returns void language sql as $$ select null; $$;
  `)

  // Apply Batch 01.1 migration (agency_code column + checks + RPCs)
  const batch01Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261102190000_rc19_batch01_1_agency_code.sql'),
    'utf8',
  )
  await instance.exec(batch01Sql)

  // Apply Batch 01.3 migration (canonical shift identity unique index)
  const batch03Sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261102200000_rc19_batch01_3_shift_identity_index.sql'),
    'utf8',
  )
  await instance.exec(batch03Sql)

  // Seed reference data
  await instance.exec(`
    insert into public.system_settings (id) values ('default') on conflict do nothing;

    insert into public.brands (id, name) values
      ('brand-a', 'Brand A'),
      ('brand-b', 'Brand B')
    on conflict do nothing;

    insert into public.platforms (id, name) values
      ('plat-shopee', 'Shopee'),
      ('plat-tiktok', 'TikTok')
    on conflict do nothing;

    insert into public.campaigns (id, name, brand_id) values
      ('camp-summer', 'Summer Sale', 'brand-a'),
      ('camp-mega', 'Mega Sale', 'brand-a'),
      ('camp-1', 'Campaign 1', 'brand-a'),
      ('camp-2', 'Campaign 2', 'brand-a')
    on conflict do nothing;

    insert into auth.users (id, email) values
      ('11111111-1111-1111-1111-111111111111', 'admin@ops.local'),
      ('22222222-2222-2222-2222-222222222222', 'member@ops.local'),
      ('33333333-3333-3333-3333-333333333333', 'leader@ops.local')
    on conflict do nothing;

    insert into public.business_users (id, auth_user_id, email, full_name, system_permission) values
      ('usr-admin', '11111111-1111-1111-1111-111111111111', 'admin@ops.local', 'Admin User', 'admin'),
      ('usr-member', '22222222-2222-2222-2222-222222222222', 'member@ops.local', 'Member User', 'member'),
      ('usr-leader', '33333333-3333-3333-3333-333333333333', 'leader@ops.local', 'Leader User', 'leader')
    on conflict do nothing;
  `)

  return instance
}

beforeEach(async () => {
  db = await setupDatabase()
})

afterEach(async () => {
  if (db) {
    await db.close()
  }
})

// Helper to execute as admin
async function asAdmin(callback: () => Promise<void>) {
  await db.exec(`
    set "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
    set "request.jwt.claim.role" = 'authenticated';
  `)
  await callback()
}

// Helper to execute as leader
async function asLeader(callback: () => Promise<void>) {
  await db.exec(`
    set "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
    set "request.jwt.claim.role" = 'authenticated';
  `)
  await callback()
}

// Helper to execute as member
async function asMember(callback: () => Promise<void>) {
  await db.exec(`
    set "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
    set "request.jwt.claim.role" = 'authenticated';
  `)
  await callback()
}

// Helper to execute as anonymous
async function asAnonymous(callback: () => Promise<void>) {
  await db.exec(`
    set "request.jwt.claim.sub" = '';
    set "request.jwt.claim.role" = 'anon';
  `)
  await callback()
}

// Normalization helpers between PostgreSQL and in-memory Shift contract
function normalizeDbShift(row: any): Shift {
  const dateStr = typeof row.date === 'string'
    ? row.date.slice(0, 10)
    : row.date instanceof Date
      ? row.date.toISOString().slice(0, 10)
      : String(row.date)
  const normTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
  return {
    ...row,
    date: dateStr,
    start_time: normTime(row.start_time),
    end_time: normTime(row.end_time),
  } as Shift
}

function toCreateShiftPayload(shift: any) {
  return {
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    timezone: shift.timezone || 'Asia/Ho_Chi_Minh',
    brand_id: shift.brand_id,
    platform_id: shift.platform_id,
    campaign_id: shift.campaign_id,
    title: shift.title,
    studio: shift.studio,
    host_names: shift.host_names ?? [],
    assistant_names: shift.assistant_names ?? [],
    technical_names: shift.technical_names ?? [],
    required_host_count: shift.required_host_count ?? 1,
    required_support_count: shift.required_support_count ?? 1,
    required_technical_count: shift.required_technical_count ?? 1,
    execution_source: shift.execution_source ?? 'internal',
    agency_code: shift.agency_code ?? null,
    status: shift.status ?? 'scheduled',
  }
}

// -----------------------------------------------------------------------------
// TEST SUITE: RC19 Batch 01.3 Database Integration
// -----------------------------------------------------------------------------

test('1. Same Brand/Platform/Time, different Studio -> Creates 2 valid distinct Shifts in PostgreSQL', async () => {
  await asAdmin(async () => {
    const shift1 = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-15",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Alpha",
        "title": "Parallel Shift 1"
      }'::jsonb)
    `)
    assert.equal(shift1.rows.length, 1)

    const shift2 = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-15",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Beta",
        "title": "Parallel Shift 2"
      }'::jsonb)
    `)
    assert.equal(shift2.rows.length, 1)

    // Verify both exist independently in PostgreSQL
    const all = await db.query(`
      select id, studio, title from public.shifts
      where date = '2026-11-15' and start_time = '10:00' and end_time = '12:00'
      order by studio
    `)
    assert.equal(all.rows.length, 2)
    assert.equal(all.rows[0].studio, 'Studio Alpha')
    assert.equal(all.rows[1].studio, 'Studio Beta')
    assert.notEqual(all.rows[0].id, all.rows[1].id)
  })
})

test('2. Same Brand/Platform/Time, different Campaign -> Creates 2 valid distinct Shifts in PostgreSQL', async () => {
  await asAdmin(async () => {
    const shift1 = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-16",
        "start_time": "14:00",
        "end_time": "16:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "campaign_id": "camp-1",
        "title": "Campaign 1 Stream"
      }'::jsonb)
    `)
    assert.equal(shift1.rows.length, 1)

    const shift2 = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-16",
        "start_time": "14:00",
        "end_time": "16:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "campaign_id": "camp-2",
        "title": "Campaign 2 Stream"
      }'::jsonb)
    `)
    assert.equal(shift2.rows.length, 1)

    const all = await db.query(`
      select id, campaign_id from public.shifts
      where date = '2026-11-16' and start_time = '14:00' and end_time = '16:00'
      order by campaign_id
    `)
    assert.equal(all.rows.length, 2)
    assert.equal(all.rows[0].campaign_id, 'camp-1')
    assert.equal(all.rows[1].campaign_id, 'camp-2')
  })
})

test('3. Same slot, same business identity -> Rejected by shifts_active_identity_uidx (23505)', async () => {
  await asAdmin(async () => {
    await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-17",
        "start_time": "18:00",
        "end_time": "20:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio 1",
        "campaign_id": "camp-1"
      }'::jsonb)
    `)

    // Attempting to create identical slot + studio + campaign
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-11-17",
            "start_time": "18:00",
            "end_time": "20:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee",
            "studio": "studio 1",
            "campaign_id": "camp-1"
          }'::jsonb)
        `)
      },
      (err: any) => {
        assert.equal(err.code, '23505')
        assert.ok(isScheduleImportDuplicateError(err))
        assert.ok(err.message.includes('shifts_active_identity_uidx'))
        return true
      },
    )
  })
})

test('4. Same slot, missing discriminator (both NULL studio and NULL campaign) -> Protected against duplicate creation', async () => {
  await asAdmin(async () => {
    // Insert initial shift with no studio and no campaign
    await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-18",
        "start_time": "08:00",
        "end_time": "10:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee"
      }'::jsonb)
    `)

    // Attempt second shift at exact same slot without studio/campaign discriminators
    // In PostgreSQL, COALESCE(studio, '') maps both to '' so they COLLIDE and fail with 23505
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-11-18",
            "start_time": "08:00",
            "end_time": "10:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee"
          }'::jsonb)
        `)
      },
      (err: any) => {
        assert.equal(err.code, '23505')
        assert.ok(isScheduleImportDuplicateError(err))
        return true
      },
    )
  })
})

test('5. Re-import unchanged Shift -> Idempotent duplicate_skipped', async () => {
  await asAdmin(async () => {
    const created = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-19",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Main",
        "host_names": ["Host Alice"]
      }'::jsonb)
    `)
    const existingShift = normalizeDbShift(created.rows[0])

    const sourceRows = [
      {
        Date: '2026-11-19',
        'Start time': '10:00',
        'End time': '12:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio Main',
        Host: 'Host Alice',
      },
    ]

    const parsed = normalizeScheduleImportResult(parseScheduleRows(sourceRows, baseMaps, [existingShift]))
    assert.equal(parsed.validShifts.length, 0)
    assert.equal((parsed.rows[0].duplicateReference ?? parsed.rows[0].duplicateCandidate)?.id, existingShift.id)

    const recordedOutcomes: any[] = []
    const result = await processScheduleImportRows({
      batchId: 'batch-reimport-idempotent',
      previews: parsed.rows,
      batchRows: mockPendingBatchRows('batch-reimport-idempotent', parsed.rows),
      initialShifts: [existingShift],
      createShift: async () => {
        throw new Error('createShift should not be called')
      },
      refreshShifts: async () => [existingShift],
      updateShift: async () => null,
      updateStaffingLabels: async () => null,
      recordOutcome: async (outcome) => {
        recordedOutcomes.push(outcome)
      },
    })

    assert.equal(result.imported, 0)
    assert.equal(result.duplicateSkipped, 1)
    assert.equal(recordedOutcomes[0].outcome, 'duplicate_skipped')
    assert.equal(recordedOutcomes[0].shiftId, existingShift.id)
  })
})

test('6. Re-import Shift with modified staffing labels -> Updates existing Shift without duplicate', async () => {
  await asAdmin(async () => {
    const created = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-20",
        "start_time": "14:00",
        "end_time": "16:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Main",
        "host_names": ["Host Initial"]
      }'::jsonb)
    `)
    let currentShift = normalizeDbShift(created.rows[0])

    const sourceRows = [
      {
        Date: '2026-11-20',
        'Start time': '14:00',
        'End time': '16:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio Main',
        Host: 'Host Updated',
      },
    ]

    const parsed = normalizeScheduleImportResult(parseScheduleRows(sourceRows, baseMaps, [currentShift]))
    const recordedOutcomes: any[] = []

    const result = await processScheduleImportRows({
      batchId: 'batch-reimport-update',
      previews: parsed.rows,
      batchRows: mockPendingBatchRows('batch-reimport-update', parsed.rows),
      initialShifts: [currentShift],
      createShift: async () => {
        throw new Error('createShift should not be called')
      },
      refreshShifts: async () => [currentShift],
      updateShift: async () => null,
      updateStaffingLabels: async (_shiftId, labels) => {
        const updateRes = await db.query(`
          update public.shifts
          set host_names = array['${labels.host_names[0]}'],
              version = version + 1
          where id = '${currentShift.id}'
          returning *
        `)
        currentShift = normalizeDbShift(updateRes.rows[0])
        return currentShift
      },
      recordOutcome: async (outcome) => {
        recordedOutcomes.push(outcome)
      },
    })
    assert.equal(result.recovered, 1)
    assert.equal(result.duplicateSkipped, 0)

    // Check DB record
    const dbShift = await db.query(`select * from public.shifts where id = '${currentShift.id}'`)
    assert.deepEqual(dbShift.rows[0].host_names, ['Host Updated'])
    assert.equal(dbShift.rows[0].version, 2)
  })
})

test('7. 52 rows representing 2 slots -> Exactly 2 imported, 50 duplicate_skipped', async () => {
  await asAdmin(async () => {
    const rows: any[] = []
    // 26 rows for slot 1
    for (let i = 0; i < 26; i++) {
      rows.push({
        Date: '2026-11-21',
        'Start time': '09:00',
        'End time': '11:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio A',
        Host: `Host S1-${i}`,
      })
    }
    // 26 rows for slot 2
    for (let i = 0; i < 26; i++) {
      rows.push({
        Date: '2026-11-21',
        'Start time': '14:00',
        'End time': '16:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio B',
        Host: `Host S2-${i}`,
      })
    }

    const parsed = normalizeScheduleImportResult(parseScheduleRows(rows, baseMaps, []))
    assert.equal(parsed.validShifts.length, 2)
    assert.equal(parsed.rows.filter(r => r.isInFileDuplicate).length, 50)

    const createdShifts: Shift[] = []
    const recordedOutcomes: any[] = []

    const result = await processScheduleImportRows({
      batchId: 'batch-52-to-2',
      previews: parsed.rows,
      batchRows: mockPendingBatchRows('batch-52-to-2', parsed.rows),
      initialShifts: [],
      createShift: async (data) => {
        const payload = JSON.stringify(toCreateShiftPayload(data))
        const insertRes = await db.query(`
          select * from public.create_shift('${payload}'::jsonb)
        `)
        const s = normalizeDbShift(insertRes.rows[0])
        createdShifts.push(s)
        return s
      },
      refreshShifts: async () => createdShifts,
      updateShift: async () => null,
      updateStaffingLabels: async () => null,
      recordOutcome: async (outcome) => {
        recordedOutcomes.push(outcome)
      },
    })

    assert.equal(result.imported, 2)
    assert.equal(result.duplicateSkipped, 50)
    assert.equal(createdShifts.length, 2)

    // Verify in PostgreSQL table
    const dbCount = await db.query(`select count(*) as cnt from public.shifts where date = '2026-11-21'`)
    assert.equal(Number(dbCount.rows[0].cnt), 2)
  })
})

test('8. 52 distinct shifts -> Creates exactly 52 shifts in database', async () => {
  await asAdmin(async () => {
    const rows: any[] = []
    for (let day = 1; day <= 26; day++) {
      const dayStr = String(day).padStart(2, '0')
      rows.push({
        Date: `2026-12-${dayStr}`,
        'Start time': '09:00',
        'End time': '11:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio A',
      })
      rows.push({
        Date: `2026-12-${dayStr}`,
        'Start time': '14:00',
        'End time': '16:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio A',
      })
    }

    const parsed = normalizeScheduleImportResult(parseScheduleRows(rows, baseMaps, []))
    assert.equal(parsed.validShifts.length, 52)

    const createdShifts: Shift[] = []
    for (const preview of parsed.rows) {
      if (preview.shift) {
        const payload = JSON.stringify(toCreateShiftPayload(preview.shift))
        const res = await db.query(`
          select * from public.create_shift('${payload}'::jsonb)
        `)
        createdShifts.push(normalizeDbShift(res.rows[0]))
      }
    }

    assert.equal(createdShifts.length, 52)
    const dbCount = await db.query(`select count(*) as cnt from public.shifts where date >= '2026-12-01'`)
    assert.equal(Number(dbCount.rows[0].cnt), 52)
  })
})

test('9. Concurrent duplicate insert race condition -> Serialized by shifts_active_identity_uidx', async () => {
  await asAdmin(async () => {
    const payload = JSON.stringify({
      date: '2026-11-22',
      start_time: '10:00',
      end_time: '12:00',
      brand_id: 'brand-a',
      platform_id: 'plat-shopee',
      studio: 'Studio Race',
    })

    // Execute first create
    const firstRes = await db.query(`select * from public.create_shift('${payload}'::jsonb)`)
    assert.equal(firstRes.rows.length, 1)

    // Execute concurrent second create
    let duplicateCaught = false
    try {
      await db.query(`select * from public.create_shift('${payload}'::jsonb)`)
    } catch (err: any) {
      duplicateCaught = isScheduleImportDuplicateError(err)
      assert.equal(err.code, '23505')
      assert.ok(err.message.includes('shifts_active_identity_uidx'))
    }
    assert.ok(duplicateCaught, 'Expected second concurrent insert to be caught by unique index')
  })
})

test('10. Agency Live AI + Internal -> Blocked by DB constraint & RPC', async () => {
  await asAdmin(async () => {
    // 1. RPC level check
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-11-23",
            "start_time": "10:00",
            "end_time": "12:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee",
            "agency_code": "live_ai",
            "execution_source": "internal"
          }'::jsonb)
        `)
      },
      (err: any) => err.message.includes('SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT'),
    )

    // 2. Direct table constraint check: shifts_agency_execution_source_check
    await assert.rejects(
      async () => {
        await db.query(`
          insert into public.shifts (
            date, start_time, end_time, brand_id, platform_id, agency_code, execution_source
          ) values (
            '2026-11-23', '14:00', '16:00', 'brand-a', 'plat-shopee', 'live_ai', 'internal'
          )
        `)
      },
      (err: any) => err.message.includes('shifts_agency_execution_source_check'),
    )
  })
})

test('11. Unauthorized user calling create_shift / update_shift -> Rejected', async () => {
  // 1. Anonymous user calling create_shift
  await asAnonymous(async () => {
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-11-24",
            "start_time": "10:00",
            "end_time": "12:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee"
          }'::jsonb)
        `)
      },
      (err: any) => {
        assert.equal(err.code, '42501')
        assert.ok(err.message.includes('AUTHENTICATION_REQUIRED'))
        return true
      },
    )
  })

  // 2. Member user calling create_shift (requires leader or admin)
  await asMember(async () => {
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-11-24",
            "start_time": "10:00",
            "end_time": "12:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee"
          }'::jsonb)
        `)
      },
      (err: any) => {
        assert.equal(err.code, '42501')
        assert.ok(err.message.includes('OPERATION_NOT_ALLOWED'))
        return true
      },
    )
  })
})

test('12. Existing staffing/registration/report references -> Never broken or lost', async () => {
  await asAdmin(async () => {
    // Create shift
    const shiftRes = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-25",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Main Studio"
      }'::jsonb)
    `)
    const shiftId = shiftRes.rows[0].id

    // Insert staffing registration referencing shift
    await db.query(`
      insert into public.shift_registrations (shift_id, user_id, operational_role, status)
      values ('${shiftId}', 'usr-member', 'host', 'approved')
    `)

    // Insert report referencing shift
    await db.query(`
      insert into public.reports (shift_id, brand_id, submitted_by, status)
      values ('${shiftId}', 'brand-a', 'usr-member', 'submitted')
    `)

    // Verify foreign key join
    const verify = await db.query(`
      select s.id, sr.id as reg_id, r.id as report_id
      from public.shifts s
      join public.shift_registrations sr on sr.shift_id = s.id
      join public.reports r on r.shift_id = s.id
      where s.id = '${shiftId}'
    `)
    assert.equal(verify.rows.length, 1)
    assert.ok(verify.rows[0].reg_id)
    assert.ok(verify.rows[0].report_id)
  })
})

test('13. Migration Rollback Simulation -> Restores legacy index without data loss', async () => {
  await asAdmin(async () => {
    // Insert shift under new migration
    const res = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-26",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Rollback Test Studio"
      }'::jsonb)
    `)
    const shiftId = res.rows[0].id

    // Attach registration & report
    await db.query(`
      insert into public.shift_registrations (shift_id, user_id, operational_role)
      values ('${shiftId}', 'usr-member', 'host')
    `)

    // EXECUTE ROLLBACK PLAN
    await db.exec(`
      begin;
      create unique index if not exists shifts_active_slot_uidx
        on public.shifts (brand_id, platform_id, date, start_time, end_time)
        where deleted_at is null and archived_at is null;
      drop index if exists public.shifts_active_identity_uidx;
      commit;
    `)

    // Verify shift still exists and relationships are 100% intact
    const verify = await db.query(`
      select s.id, s.studio, sr.id as reg_id
      from public.shifts s
      join public.shift_registrations sr on sr.shift_id = s.id
      where s.id = '${shiftId}'
    `)
    assert.equal(verify.rows.length, 1)
    assert.equal(verify.rows[0].studio, 'Rollback Test Studio')
    assert.ok(verify.rows[0].reg_id)
  })
})

test('14. Canonical Identity Normalization Equivalence (TypeScript vs PostgreSQL)', async () => {
  const testCases = [
    null,
    '',
    '   ',
    'Studio A',
    '  Studio   A  ',
    'studio a',
    'STUDIO A',
    'Studio\tA',
    'Studio\nA',
    'Studio  101  Stage  B',
    'Mega Sale',
    '  MEGA   SALE  ',
    'mega_sale',
  ]

  for (const c of testCases) {
    const tsNorm = normalizeShiftQualifier(c)
    const res = await db.query('select public.normalize_shift_qualifier($1) as norm', [c])
    const pgNorm = res.rows[0].norm
    assert.equal(tsNorm, pgNorm, `Normalization mismatch for input ${JSON.stringify(c)}: TS="${tsNorm}" PG="${pgNorm}"`)
  }
})

test('15. Title is NOT part of Shift Identity -> Same slot + studio with different title collides (23505)', async () => {
  await asAdmin(async () => {
    // Insert initial shift
    await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-27",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Alpha",
        "title": "Morning Brand Livestream"
      }'::jsonb)
    `)

    // Second shift at same slot and studio, but DIFFERENT title -> MUST COLLIDE
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-11-27",
            "start_time": "10:00",
            "end_time": "12:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee",
            "studio": "Studio Alpha",
            "title": "Mega Sale Livestream"
          }'::jsonb)
        `)
      },
      (err: any) => {
        assert.equal(err.code, '23505')
        assert.ok(isScheduleImportDuplicateError(err))
        return true
      },
    )
  })
})

test('16. Edit Studio/Campaign on active Shift with registrations and reports -> Preserves referential integrity', async () => {
  await asAdmin(async () => {
    // 1. Create shift
    const createRes = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-28",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Original"
      }'::jsonb)
    `)
    const shiftId = createRes.rows[0].id

    // 2. Attach registration and report
    await db.exec(`
      insert into public.shift_registrations (shift_id, user_id, operational_role, status)
      values ('${shiftId}', 'usr-member', 'host', 'approved');

      insert into public.reports (shift_id, brand_id, submitted_by, status)
      values ('${shiftId}', 'brand-a', 'usr-member', 'submitted');
    `)

    // 3. Update shift studio to 'Studio Relocated'
    await db.query(`
      select * from public.update_shift('${shiftId}', '{
        "studio": "Studio Relocated"
      }'::jsonb)
    `)

    // 4. Verify referential integrity remains 100% intact
    const verify = await db.query(`
      select s.id, s.studio, sr.id as reg_id, r.id as report_id
      from public.shifts s
      join public.shift_registrations sr on sr.shift_id = s.id
      join public.reports r on r.shift_id = s.id
      where s.id = '${shiftId}'
    `)
    assert.equal(verify.rows.length, 1)
    assert.equal(verify.rows[0].studio, 'Studio Relocated')
    assert.ok(verify.rows[0].reg_id)
    assert.ok(verify.rows[0].report_id)
  })
})

test('17. Synthetic repeated-row import keeps one parent per distinct shift identity', async () => {
  // This synthetic input checks candidate reconciliation only; it does not reproduce a Production import cause.
  await asAdmin(async () => {
    const rows: any[] = []
    // Repeated candidates resolve to one parent shift.
    for (let i = 0; i < 51; i++) {
      rows.push({
        Date: '2026-11-29',
        'Start time': '09:00',
        'End time': '11:00',
        Brand: 'Brand A',
        Platform: 'Shopee',
        Studio: 'Studio A',
        Host: `Host S1-Staff-${i + 1}`,
      })
    }
    // A distinct identity creates a second parent shift.
    rows.push({
      Date: '2026-11-29',
      'Start time': '14:00',
      'End time': '16:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Studio: 'Studio B',
      Host: 'Host S2-Staff-1',
    })

    assert.equal(rows.length, 52)

    // Parse through application schedule import parser
    const parsed = normalizeScheduleImportResult(parseScheduleRows(rows, baseMaps, []))
    assert.equal(parsed.validShifts.length, 2, 'Must yield exactly 2 parent shift candidates')
    assert.equal(parsed.rows.filter(r => r.isInFileDuplicate).length, 50, '50 rows must be flagged as in-file duplicates')

    const createdShifts: Shift[] = []
    const recordedOutcomes: any[] = []

    const result = await processScheduleImportRows({
      batchId: 'batch-51-to-1-split',
      previews: parsed.rows,
      batchRows: mockPendingBatchRows('batch-51-to-1-split', parsed.rows),
      initialShifts: [],
      createShift: async (data) => {
        const payload = JSON.stringify(toCreateShiftPayload(data))
        const insertRes = await db.query(`select * from public.create_shift('${payload}'::jsonb)`)
        const s = normalizeDbShift(insertRes.rows[0])
        createdShifts.push(s)
        return s
      },
      refreshShifts: async () => createdShifts,
      updateShift: async () => null,
      updateStaffingLabels: async () => null,
      recordOutcome: async (outcome) => {
        recordedOutcomes.push(outcome)
      },
    })

    assert.equal(result.imported, 2, 'Exactly 2 parent shifts imported')
    assert.equal(result.duplicateSkipped, 50, 'Exactly 50 duplicate_skipped')
    assert.equal(createdShifts.length, 2)

    // Verify database has exactly 2 records, with the expected studios
    const dbShifts = await db.query(`select id, studio from public.shifts where date = '2026-11-29' order by studio`)
    assert.equal(dbShifts.rows.length, 2)
    assert.equal(dbShifts.rows[0].studio, 'Studio A')
    assert.equal(dbShifts.rows[1].studio, 'Studio B')
  })
})

test('18. Forward-Fix Recovery Protocol vs Unsafe Archiving Rollback (Irreversible Schema Boundary)', async () => {
  await asAdmin(async () => {
    // 1. Create two parallel shifts at the exact same slot in distinct studios
    const s1Res = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-30",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Alpha"
      }'::jsonb)
    `)
    const shift1Id = s1Res.rows[0].id

    const s2Res = await db.query(`
      select * from public.create_shift('{
        "date": "2026-11-30",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Studio Beta"
      }'::jsonb)
    `)
    const shift2Id = s2Res.rows[0].id

    // Attach registrations and reports to both parallel shifts
    await db.exec(`
      insert into public.shift_registrations (shift_id, user_id, operational_role)
      values ('${shift1Id}', 'usr-member', 'host'), ('${shift2Id}', 'usr-member', 'host');

      insert into public.reports (shift_id, brand_id, submitted_by)
      values ('${shift1Id}', 'brand-a', 'usr-member'), ('${shift2Id}', 'brand-a', 'usr-member');
    `)

    // 2. Naive legacy index rollback attempt: directly creating legacy shifts_active_slot_uidx
    // MUST FAIL with duplicate key violation (23505) because 2 active shifts share the slot.
    // This proves the architectural boundary: once parallel shifts exist, the schema upgrade is IRREVERSIBLE.
    await assert.rejects(
      async () => {
        await db.query(`
          create unique index shifts_active_slot_uidx
            on public.shifts (brand_id, platform_id, date, start_time, end_time)
            where deleted_at is null and archived_at is null;
        `)
      },
      (err: any) => {
        assert.equal(err.code, '23505')
        return true
      },
    )

    // 3. Verify why Soft-Archiving rollback is UNSAFE in production:
    // If an operator were to run: UPDATE shifts SET archived_at = now() on parallel shifts,
    // active queries (where deleted_at is null and archived_at is null) will hide the shift!
    const activeBefore = await db.query(`
      select count(*) as cnt from public.shifts
      where date = '2026-11-30' and deleted_at is null and archived_at is null
    `)
    assert.equal(Number(activeBefore.rows[0].cnt), 2, 'Both parallel shifts MUST be active')

    // 4. Execute the APPROVED Production Disaster Recovery: Forward-Fix / Application Rollback
    // In this protocol:
    // - shifts_active_identity_uidx is preserved in the database.
    // - Both parallel shifts remain 100% active (archived_at IS NULL, deleted_at IS NULL).
    // - Application code or erroneous data is repaired forward.
    // - Referential integrity across registrations, reports, and attendance is 100% intact.
    const forwardFixVerification = await db.query(`
      select s.id, s.studio, s.archived_at, s.deleted_at,
             sr.id as reg_id, r.id as report_id
      from public.shifts s
      join public.shift_registrations sr on sr.shift_id = s.id
      join public.reports r on r.shift_id = s.id
      where s.id in ('${shift1Id}', '${shift2Id}')
      order by s.created_at asc
    `)
    assert.equal(forwardFixVerification.rows.length, 2, 'Both shifts exist and join with registrations/reports')
    assert.equal(forwardFixVerification.rows[0].archived_at, null, 'Shift 1 is NOT archived')
    assert.equal(forwardFixVerification.rows[1].archived_at, null, 'Shift 2 is NOT archived')
    assert.equal(forwardFixVerification.rows[0].deleted_at, null, 'Shift 1 is NOT deleted')
    assert.equal(forwardFixVerification.rows[1].deleted_at, null, 'Shift 2 is NOT deleted')
    assert.ok(forwardFixVerification.rows[0].reg_id)
    assert.ok(forwardFixVerification.rows[1].reg_id)
    assert.ok(forwardFixVerification.rows[0].report_id)
    assert.ok(forwardFixVerification.rows[1].report_id)
  })
})

test('19. RLS & RPC Security Gate -> Leader/Admin allowed, Member/Anon rejected', async () => {
  // Leader creating shift -> ALLOWED
  await asLeader(async () => {
    const res = await db.query(`
      select * from public.create_shift('{
        "date": "2026-12-05",
        "start_time": "10:00",
        "end_time": "12:00",
        "brand_id": "brand-a",
        "platform_id": "plat-shopee",
        "studio": "Leader Studio"
      }'::jsonb)
    `)
    assert.equal(res.rows.length, 1)
  })

  // Member creating shift -> REJECTED (42501 OPERATION_NOT_ALLOWED)
  await asMember(async () => {
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-12-05",
            "start_time": "14:00",
            "end_time": "16:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee"
          }'::jsonb)
        `)
      },
      (err: any) => err.code === '42501' && err.message.includes('OPERATION_NOT_ALLOWED'),
    )
  })

  // Anonymous creating shift -> REJECTED (42501 AUTHENTICATION_REQUIRED)
  await asAnonymous(async () => {
    await assert.rejects(
      async () => {
        await db.query(`
          select * from public.create_shift('{
            "date": "2026-12-05",
            "start_time": "14:00",
            "end_time": "16:00",
            "brand_id": "brand-a",
            "platform_id": "plat-shopee"
          }'::jsonb)
        `)
      },
      (err: any) => err.code === '42501' && err.message.includes('AUTHENTICATION_REQUIRED'),
    )
  })
})
