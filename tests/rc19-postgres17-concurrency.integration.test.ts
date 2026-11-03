/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'

const DATABASE_NAME = 'rc19_concurrency_disposable'
const DATABASE_MARKER = 'RC19_CONCURRENCY_DISPOSABLE_TEST_DATABASE'

function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) {
    if (env.CI || env.STRICT_CONCURRENCY_GATE === 'true') {
      throw new Error('[POSTGRES-17 CONCURRENCY GATE] DATABASE_URL is required in CI/Release Gate')
    }
    return null
  }

  let url: URL
  try {
    url = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('[POSTGRES-17 CONCURRENCY GATE] DATABASE_URL must target the disposable PostgreSQL service')
  }

  const host = url.hostname.toLowerCase()
  const isLoopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
  const isDisposable =
    env.CI === 'true' &&
    env.STRICT_CONCURRENCY_GATE === 'true' &&
    env.RC19_CONCURRENCY_DISPOSABLE_TEST_DATABASE === 'I_UNDERSTAND' &&
    !env.VERCEL &&
    !env.VERCEL_ENV &&
    isLoopback &&
    url.port === '5432' &&
    url.pathname === `/${DATABASE_NAME}` &&
    url.username === 'rc19_ci' &&
    url.protocol === 'postgresql:'

  if (!isDisposable) {
    throw new Error('[POSTGRES-17 CONCURRENCY GATE] Refusing non-disposable database target')
  }

  return { connectionString: env.DATABASE_URL }
}

function assertDisposableDatabaseIdentity(identity: {
  database_name: string
  session_user: string
  server_version_num: string
  database_comment: string | null
}) {
  if (
    identity.database_name !== DATABASE_NAME ||
    identity.session_user !== 'rc19_ci' ||
    !identity.server_version_num.startsWith('17') ||
    identity.database_comment !== DATABASE_MARKER
  ) {
    throw new Error('[POSTGRES-17 CONCURRENCY GATE] Connected server identity is not the marked disposable PostgreSQL 17 database')
  }
}

test('Concurrency database URL guard rejects non-disposable targets', () => {
  const base = {
    CI: 'true',
    STRICT_CONCURRENCY_GATE: 'true',
    RC19_CONCURRENCY_DISPOSABLE_TEST_DATABASE: 'I_UNDERSTAND',
    DATABASE_URL: 'postgresql://rc19_ci:ci@localhost:5432/rc19_concurrency_disposable',
  }

  assert.ok(getDatabaseConfig(base))
  for (const override of [
    { DATABASE_URL: 'postgresql://rc19_ci:ci@db.supabase.co:5432/rc19_concurrency_disposable' },
    { DATABASE_URL: 'postgresql://rc19_ci:ci@localhost:5432/postgres' },
    { RC19_CONCURRENCY_DISPOSABLE_TEST_DATABASE: undefined },
    { VERCEL: '1' },
    { CI: 'false' },
  ]) {
    assert.throws(() => getDatabaseConfig({ ...base, ...override } as NodeJS.ProcessEnv), /Refusing non-disposable database target/)
  }
})

test('Concurrency server identity guard requires the marked PostgreSQL 17 CI database', () => {
  const identity = {
    database_name: DATABASE_NAME,
    session_user: 'rc19_ci',
    server_version_num: '170006',
    database_comment: DATABASE_MARKER,
  }

  assert.doesNotThrow(() => assertDisposableDatabaseIdentity(identity))
  for (const override of [
    { database_name: 'postgres' },
    { session_user: 'postgres' },
    { server_version_num: '160009' },
    { database_comment: null },
  ]) {
    assert.throws(() => assertDisposableDatabaseIdentity({ ...identity, ...override }), /not the marked disposable/)
  }
})

async function assertFreshPublicNamespace(client: Client) {
  const existing = await client.query<{ object_name: string }>(`
    select c.relname as object_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
    union all
    select p.proname as object_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  `)

  if (existing.rowCount) {
    throw new Error('[POSTGRES-17 CONCURRENCY GATE] Disposable database public namespace is not empty')
  }
}

test('PostgreSQL 17 Multi-Connection Concurrency & Parallel Session Gate', async (t) => {
  const config = getDatabaseConfig()
  if (!config) {
    t.skip('Skipping PostgreSQL 17 server concurrency test: DATABASE_URL not configured on this host. (Run in CI with PostgreSQL 17 service)')
    return
  }

  const client1 = new Client(config)
  const client2 = new Client(config)

  let client1Connected = false
  let client2Connected = false
  try {
    await client1.connect()
    client1Connected = true
    const server = await client1.query<{
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
    assert.equal(server.rowCount, 1)
    assertDisposableDatabaseIdentity(server.rows[0])
    await assertFreshPublicNamespace(client1)

    await client2.connect()
    client2Connected = true

    // Setup only in the verified, empty disposable database.
    await client1.query(`
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
    await Promise.allSettled([
      ...(client2Connected ? [client2.end()] : []),
      ...(client1Connected ? [client1.end()] : []),
    ])
  }
})
