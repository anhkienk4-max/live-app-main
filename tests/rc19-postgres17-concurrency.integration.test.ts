/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL

function getDatabaseConfig() {
  if (!DATABASE_URL) {
    if (process.env.CI || process.env.STRICT_CONCURRENCY_GATE === 'true') {
      throw new Error('[POSTGRES-17 CONCURRENCY GATE] DATABASE_URL is required in CI/Release Gate')
    }
    return null
  }
  return { connectionString: DATABASE_URL }
}

test('PostgreSQL 17 Multi-Connection Concurrency & Parallel Session Gate', async (t) => {
  const config = getDatabaseConfig()
  if (!config) {
    t.skip('Skipping PostgreSQL 17 server concurrency test: DATABASE_URL not configured on this host. (Run in CI with PostgreSQL 17 service)')
    return
  }

  // Create two truly independent TCP socket connections
  const client1 = new Client(config)
  const client2 = new Client(config)

  await client1.connect()
  await client2.connect()

  try {
    // 1. Setup disposable test schema with matching production constraints
    await client1.query(`
      drop table if exists public.shift_registrations cascade;
      drop table if exists public.reports cascade;
      drop table if exists public.workforce_actual_segments cascade;
      drop table if exists public.shifts cascade;

      create table public.shifts (
        id text primary key default gen_random_uuid()::text,
        brand_id text not null,
        platform_id text not null,
        campaign_id text,
        date text not null,
        start_time text not null,
        end_time text not null,
        studio text,
        title text not null default '',
        execution_source text check (execution_source in ('internal','agency')),
        agency_code text check (agency_code in ('ada','snap','live_ai')),
        host_names text[] not null default '{}',
        assistant_names text[] not null default '{}',
        technical_names text[] not null default '{}',
        status text not null default 'scheduled',
        version integer not null default 1,
        deleted_at timestamptz,
        archived_at timestamptz,
        deletion_reason text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        constraint shifts_agency_execution_source_check check (
          not (agency_code = 'live_ai' and execution_source = 'internal')
        )
      );

      create or replace function public.normalize_shift_qualifier(val text)
      returns text language sql immutable as $$
        select coalesce(regexp_replace(lower(btrim(val)), '\\s+', ' ', 'g'), '');
      $$;

      create unique index shifts_active_identity_uidx
        on public.shifts (
          brand_id,
          platform_id,
          date,
          start_time,
          end_time,
          (public.normalize_shift_qualifier(studio)),
          (public.normalize_shift_qualifier(campaign_id))
        )
        where deleted_at is null and archived_at is null;

      create or replace function public.create_shift(p_payload jsonb)
      returns setof public.shifts
      language plpgsql
      security definer
      as $$
      declare
        v_agency text;
        v_source text;
        v_shift public.shifts;
      begin
        v_agency := p_payload->>'agency_code';
        v_source := p_payload->>'execution_source';
        if v_agency = 'live_ai' and v_source = 'internal' then
          raise exception using
            errcode = '23514',
            message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
        end if;

        insert into public.shifts (
          date, start_time, end_time, brand_id, platform_id,
          campaign_id, studio, title, agency_code, execution_source, host_names
        ) values (
          p_payload->>'date',
          p_payload->>'start_time',
          p_payload->>'end_time',
          p_payload->>'brand_id',
          p_payload->>'platform_id',
          p_payload->>'campaign_id',
          p_payload->>'studio',
          coalesce(p_payload->>'title', ''),
          v_agency,
          v_source,
          coalesce(
            (select array_agg(x) from jsonb_array_elements_text(p_payload->'host_names') t(x)),
            '{}'::text[]
          )
        )
        returning * into v_shift;

        return next v_shift;
      end;
      $$;
    `)

    // =========================================================================
    // TEST 1: Concurrent Duplicate Insert Race Condition across 2 connections
    // =========================================================================
    await t.test('1. Two independent connections race on identical shift -> One succeeds, second gets 23505', async () => {
      const slot = {
        date: '2026-12-01',
        start_time: '10:00',
        end_time: '12:00',
        brand_id: 'brand-a',
        platform_id: 'plat-shopee',
        studio: 'Studio Race',
      }
      const payload = JSON.stringify(slot)

      // Start transaction on Client 1
      await client1.query('BEGIN')
      await client1.query(`select * from public.create_shift('${payload}'::jsonb)`)

      // Concurrently execute insert on Client 2 with lock timeout
      await client2.query("SET statement_timeout = '3000ms'")
      
      let client2Error: any = null
      const client2Promise = (async () => {
        try {
          await client2.query(`select * from public.create_shift('${payload}'::jsonb)`)
        } catch (err) {
          client2Error = err
        }
      })()

      // Give client2 time to queue up behind client1's index lock
      await new Promise(r => setTimeout(r, 100))

      // Commit client 1 transaction
      await client1.query('COMMIT')

      // Await client 2 completion
      await client2Promise

      assert.ok(client2Error, 'Client 2 must catch a duplicate error')
      assert.equal(client2Error.code, '23505', 'Must fail with unique_violation code 23505')
      assert.ok(
        client2Error.message.includes('shifts_active_identity_uidx'),
        'Must violate shifts_active_identity_uidx index',
      )

      // Verify DB count
      const verify = await client1.query("select count(*) as cnt from public.shifts where studio = 'Studio Race'")
      assert.equal(Number(verify.rows[0].cnt), 1)
    })

    // =========================================================================
    // TEST 2: Concurrent Parallel Studio Sessions across 2 connections
    // =========================================================================
    await t.test('2. Two independent connections insert distinct parallel studios concurrently -> Both succeed', async () => {
      const payload1 = JSON.stringify({
        date: '2026-12-01',
        start_time: '14:00',
        end_time: '16:00',
        brand_id: 'brand-a',
        platform_id: 'plat-shopee',
        studio: 'Studio Parallel Alpha',
      })
      const payload2 = JSON.stringify({
        date: '2026-12-01',
        start_time: '14:00',
        end_time: '16:00',
        brand_id: 'brand-a',
        platform_id: 'plat-shopee',
        studio: 'Studio Parallel Beta',
      })

      await client1.query('BEGIN')
      await client2.query('BEGIN')

      await client1.query(`select * from public.create_shift('${payload1}'::jsonb)`)
      await client2.query(`select * from public.create_shift('${payload2}'::jsonb)`)

      await client1.query('COMMIT')
      await client2.query('COMMIT')

      const verify = await client1.query(
        "select count(*) as cnt from public.shifts where date = '2026-12-01' and start_time = '14:00'",
      )
      assert.equal(Number(verify.rows[0].cnt), 2, 'Both parallel studios must exist cleanly')
    })

    // =========================================================================
    // TEST 3: Concurrent Update / Optimistic Locking across 2 connections
    // =========================================================================
    await t.test('3. Concurrent update with version check -> Prevents lost updates', async () => {
      const createRes = await client1.query(`
        select * from public.create_shift('{
          "date": "2026-12-02",
          "start_time": "10:00",
          "end_time": "12:00",
          "brand_id": "brand-a",
          "platform_id": "plat-shopee",
          "studio": "Studio Versioning"
        }'::jsonb)
      `)
      const shiftId = createRes.rows[0].id
      const initialVersion = createRes.rows[0].version

      // Client 1 successfully updates version 1 -> 2
      const update1 = await client1.query(`
        update public.shifts
        set title = 'Updated by Client 1',
            version = version + 1
        where id = '${shiftId}' and version = ${initialVersion}
        returning *
      `)
      assert.equal(update1.rows.length, 1)
      assert.equal(update1.rows[0].version, 2)

      // Client 2 attempts stale update with version 1 -> Must match 0 rows
      const update2 = await client2.query(`
        update public.shifts
        set title = 'Updated by Client 2',
            version = version + 1
        where id = '${shiftId}' and version = ${initialVersion}
        returning *
      `)
      assert.equal(update2.rows.length, 0, 'Stale concurrent update must affect 0 rows')
    })

    // =========================================================================
    // TEST 4: Rollback & Retry Consistency across 2 connections
    // =========================================================================
    await t.test('4. Transaction rollback cleanly releases locks and leaves no dirty data', async () => {
      const payload = JSON.stringify({
        date: '2026-12-03',
        start_time: '10:00',
        end_time: '12:00',
        brand_id: 'brand-a',
        platform_id: 'plat-shopee',
        studio: 'Studio Rollback Test',
      })

      // Client 1 begins, inserts, but aborts with ROLLBACK
      await client1.query('BEGIN')
      await client1.query(`select * from public.create_shift('${payload}'::jsonb)`)
      await client1.query('ROLLBACK')

      // Client 2 verifies row does NOT exist
      const checkEmpty = await client2.query("select count(*) as cnt from public.shifts where studio = 'Studio Rollback Test'")
      assert.equal(Number(checkEmpty.rows[0].cnt), 0)

      // Client 2 retries insert -> Succeeds cleanly
      const retryRes = await client2.query(`select * from public.create_shift('${payload}'::jsonb)`)
      assert.equal(retryRes.rows.length, 1)
    })
  } finally {
    await client1.end()
    await client2.end()
  }
})
