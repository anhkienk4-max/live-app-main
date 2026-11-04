import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const SEED_SQL_PATH = path.resolve(process.cwd(), 'scripts/storage/seed-v1-production-routes.sql')
const rawSeedSql = fs.readFileSync(SEED_SQL_PATH, 'utf8')

const DATABASE_URL = process.env.DATABASE_URL
const DISPOSABLE_DATABASE = 'rc19_sto01_disposable'

async function getPostgresClient(): Promise<Client | null> {
  if (!DATABASE_URL) {
    if (process.env.CI) throw new Error('[POSTGRES-17] DATABASE_URL is required in CI')
    return null
  }

  let databaseUrl: URL
  try {
    databaseUrl = new URL(DATABASE_URL)
  } catch {
    throw new Error('[POSTGRES-17] DATABASE_URL must identify the dedicated disposable PostgreSQL test database')
  }

  const host = databaseUrl.hostname.toLowerCase()
  const database = decodeURIComponent(databaseUrl.pathname.slice(1))
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) ||
    database !== DISPOSABLE_DATABASE ||
    process.env.RC19_STO01_DISPOSABLE_TEST_DATABASE !== 'I_UNDERSTAND'
  ) {
    throw new Error('[POSTGRES-17] Refusing destructive schema setup: require the explicitly confirmed local rc19_sto01_disposable database')
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 3000,
  })

  try {
    await client.connect()
    const result = await client.query('SELECT current_database() AS database')
    if (result.rows[0]?.database !== DISPOSABLE_DATABASE) {
      throw new Error('[POSTGRES-17] Connected database name did not match the disposable test database')
    }
    return client
  } catch {
    await client.end().catch(() => undefined)
    throw new Error('[POSTGRES-17] Required disposable PostgreSQL 17 server connection failed')
  }
}

async function initPostgresSchema(client: Client) {
  await client.query(`
    DROP TABLE IF EXISTS public.operational_storage_routes CASCADE;
    DROP TABLE IF EXISTS public.shifts CASCADE;
    DROP TABLE IF EXISTS public.brands CASCADE;
    DROP TABLE IF EXISTS public.platforms CASCADE;
    DROP TABLE IF EXISTS public.business_users CASCADE;
    DROP TABLE IF EXISTS temp_release_approval_session CASCADE;

    CREATE TABLE public.business_users (
      id text PRIMARY KEY,
      email text NOT NULL,
      system_permission text NOT NULL DEFAULT 'admin',
      role text NOT NULL DEFAULT 'admin',
      status text NOT NULL DEFAULT 'active',
      account_status text NOT NULL DEFAULT 'active',
      archived_at timestamptz NULL,
      deleted_at timestamptz NULL,
      created_at timestamptz DEFAULT statement_timestamp()
    );

    CREATE TABLE public.brands (
      id text PRIMARY KEY,
      name text NOT NULL,
      storage_profile text NULL,
      storage_profile_reviewed_by text REFERENCES public.business_users(id),
      storage_profile_reviewed_at timestamptz,
      created_at timestamptz DEFAULT statement_timestamp(),
      deleted_at timestamptz NULL,
      CONSTRAINT brands_storage_profile_check CHECK (storage_profile IN (
        'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
        'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
        'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1',
        'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
      ))
    );

    CREATE TABLE public.platforms (
      id text PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz DEFAULT statement_timestamp(),
      deleted_at timestamptz NULL
    );

    CREATE TABLE public.shifts (
      id text PRIMARY KEY,
      brand_id text NOT NULL REFERENCES public.brands(id),
      platform_id text NULL REFERENCES public.platforms(id),
      date text NOT NULL,
      execution_source text NULL CHECK (execution_source IN ('internal', 'agency')),
      created_at timestamptz DEFAULT statement_timestamp(),
      deleted_at timestamptz NULL
    );

    CREATE TABLE public.operational_storage_routes (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      provider text NOT NULL CHECK (provider IN ('google_drive', 'onedrive')),
      execution_source text NOT NULL CHECK (execution_source IN ('internal', 'agency')),
      brand_id text NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
      platform_id text NULL REFERENCES public.platforms(id) ON DELETE RESTRICT,
      subbrand_key text NULL CHECK (subbrand_key IS NULL OR btrim(subbrand_key) <> ''),
      storage_profile text NOT NULL CHECK (storage_profile IN (
        'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
        'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
        'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1',
        'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
      )),
      root_folder_id text NOT NULL CHECK (btrim(root_folder_id) <> ''),
      base_folder_id text NOT NULL CHECK (btrim(base_folder_id) <> ''),
      folder_labels jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(folder_labels) = 'object'),
      period_naming_style text NOT NULL CHECK (btrim(period_naming_style) <> ''),
      period_label_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(period_label_overrides) = 'object'),
      period_date_ranges jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(period_date_ranges) = 'array'),
      folder_label_overrides jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(folder_label_overrides) = 'object'),
      active boolean NOT NULL DEFAULT true,
      approved_by text REFERENCES public.business_users(id) ON DELETE SET NULL,
      approved_at timestamptz NOT NULL DEFAULT statement_timestamp(),
      created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
      CONSTRAINT operational_storage_routes_subbrand_profile_check CHECK (
        (storage_profile IN ('LEGACY_SUBBRAND_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_CATEGORY_PERIOD'))
        = (subbrand_key IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX operational_storage_routes_active_key_uidx
      ON public.operational_storage_routes
      (provider, execution_source, brand_id, platform_id, subbrand_key)
      NULLS NOT DISTINCT WHERE active;
  `)
}

async function seedPrerequisites(
  client: Client,
  options: {
    omitBrandName?: string
    omitPlatformName?: string
    omitApprovedUser?: boolean
    approvedUserId?: string
    approverStatus?: string
    approverAccountStatus?: string
    approverArchived?: boolean
    approverDeleted?: boolean
    approverPermission?: string
    approverRole?: string
    useTempTable?: boolean
    skipApprovalSetting?: boolean
  } = {}
) {
  const approverId = options.approvedUserId ?? 'usr-pg17-admin'

  if (!options.omitApprovedUser) {
    await client.query(`
      INSERT INTO public.business_users (
        id, email, system_permission, role, status, account_status, archived_at, deleted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      approverId,
      'pg17admin@example.com',
      options.approverPermission ?? 'admin',
      options.approverRole ?? 'admin',
      options.approverStatus ?? 'active',
      options.approverAccountStatus ?? 'active',
      options.approverArchived ? new Date().toISOString() : null,
      options.approverDeleted ? new Date().toISOString() : null,
    ])
  }

  if (!options.skipApprovalSetting) {
    if (options.useTempTable) {
      await client.query(`
        CREATE TEMP TABLE IF NOT EXISTS temp_release_approval_session (
          approver_id text NOT NULL,
          release_id text NOT NULL,
          approval_notes text
        );
        INSERT INTO temp_release_approval_session VALUES ('${approverId}', 'REL-PG17-STO01-001', 'Approved for PostgreSQL 17');
      `)
    } else {
      await client.query(`SET app.release_approver_id = '${approverId}'; SET app.release_id = 'REL-PG17-STO01-001';`)
    }
  }

  const brands = [
    'ASM AI Livestream', 'Female AI livestream', 'Male AI livestream',
    'Mars Snacking', 'ASTROMAN', 'Female', 'X-men', 'CUREL', 'KATE',
    'KAO', 'OPELLA', 'Pepsico'
  ]
  for (const name of brands) {
    if (name === options.omitBrandName) continue
    const id = 'brand_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    await client.query(`INSERT INTO public.brands (id, name) VALUES ($1, $2)`, [id, name])
  }

  const platforms = ['Shopee Live', 'TikTok Shop']
  for (const name of platforms) {
    if (name === options.omitPlatformName) continue
    const id = 'platform_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    await client.query(`INSERT INTO public.platforms (id, name) VALUES ($1, $2)`, [id, name])
  }
}

// 1. Missing approver session/temp table
test('PostgreSQL 17 Server: Preflight fails closed when no release approver is provided', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { skipApprovalSetting: true })

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: No release approval actor provided/)
        return true
      }
    )

    await client.query('ROLLBACK')
    const res = await client.query('SELECT count(*)::int AS count FROM public.operational_storage_routes')
    assert.equal(res.rows[0].count, 0, 'No routes should be inserted')
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
})

// 2. Approver not found in public.business_users
test('PostgreSQL 17 Server: Preflight fails closed when approver does not exist in public.business_users', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { omitApprovedUser: true, approvedUserId: 'usr-missing-admin' })

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Required route approval actor \(approved_by = usr-missing-admin\) does not exist in public\.business_users/)
        return true
      }
    )

    await client.query('ROLLBACK')
    const res = await client.query('SELECT count(*)::int AS count FROM public.operational_storage_routes')
    assert.equal(res.rows[0].count, 0)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
})

// 3. Inactive or soft-deleted approver
test('PostgreSQL 17 Server: Preflight fails closed when approver is inactive or deleted', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { approverStatus: 'inactive' })

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Route approval actor .* is not active or has been archived\/deleted/)
        return true
      }
    )
  } finally {
    await client.end()
  }
})

// 4. Non-admin approver
test('PostgreSQL 17 Server: Preflight fails closed when approver lacks Admin authority', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { approverPermission: 'member', approverRole: 'staff' })

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Route approval actor .* lacks Admin authority/)
        return true
      }
    )
  } finally {
    await client.end()
  }
})

// 5. Missing Brand
test('PostgreSQL 17 Server: Preflight fails closed when brand is missing', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { omitBrandName: 'ASM AI Livestream' })

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Missing required brands in public\.brands: ASM AI Livestream/)
        return true
      }
    )
  } finally {
    await client.end()
  }
})

// 6. Missing Platform
test('PostgreSQL 17 Server: Preflight fails closed when platform is missing', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { omitPlatformName: 'TikTok Shop' })

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Missing required platforms in public\.platforms: TikTok Shop/)
        return true
      }
    )
  } finally {
    await client.end()
  }
})

// 7. Conflicting active route contract
test('PostgreSQL 17 Server: Preflight fails closed on route contract conflict (base_folder_id mismatch)', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client)

    // Insert an active route with conflicting base_folder_id
    await client.query(`
      INSERT INTO public.operational_storage_routes (
        provider, execution_source, brand_id, platform_id, subbrand_key,
        storage_profile, root_folder_id, base_folder_id, folder_labels,
        period_naming_style, active, approved_by, approved_at
      ) VALUES (
        'google_drive', 'internal',
        (SELECT id FROM public.brands WHERE name = 'Mars Snacking'),
        NULL, NULL,
        'LEGACY_CATEGORY_PERIOD',
        '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
        'conflicting_pg17_folder_id',
        '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
        'THANG_M_DASH_YEAR',
        true, 'usr-pg17-admin', statement_timestamp()
      )
    `)

    await assert.rejects(
      async () => {
        await client.query(rawSeedSql)
      },
      (err: Error) => {
        assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Conflicting active route configuration detected.*base_folder_id mismatch/)
        return true
      }
    )
  } finally {
    await client.end()
  }
})

// 8. Atomic rollback on a PostgreSQL 17 Server
test('PostgreSQL 17 Server: A failure after the first route insert rolls back the whole seed transaction', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { useTempTable: true, approvedUserId: 'usr-ops-lead' })
    const failingSeedSql = rawSeedSql.replace(
      /-- Route 2:/,
      "RAISE EXCEPTION 'SYNTHETIC FAILURE INJECTED FOR POSTGRES 17 ROLLBACK TEST';\n-- Route 2:",
    )
    assert.notEqual(failingSeedSql, rawSeedSql, 'Rollback injection point must exist in the seed source')

    await assert.rejects(
      () => client.query(failingSeedSql),
      (err: Error) => {
        assert.match(err.message, /SYNTHETIC FAILURE INJECTED FOR POSTGRES 17 ROLLBACK TEST/)
        return true
      },
    )

    await client.query('ROLLBACK')
    const routes = await client.query('SELECT count(*)::int AS count FROM public.operational_storage_routes')
    assert.equal(routes.rows[0].count, 0, 'No partial route rows may survive a failed seed transaction')
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    await client.end()
  }
})

// 9. Successful execution of the internal-only 13-route activation seed
test('PostgreSQL 17 Server: Internal-only seed activates exactly 13 routes with valid admin approver', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { useTempTable: true, approvedUserId: 'usr-ops-lead' })

    assert.doesNotMatch(rawSeedSql, /'agency'/i, 'Activation seed must not declare any Agency route')
    assert.equal((rawSeedSql.match(/-- Route \d+:/g) ?? []).length, 13, 'Seed source must contain exactly 13 route blocks')

    // Execute unmodified raw SQL seed file
    await client.query(rawSeedSql)

    const res = await client.query(`
      SELECT r.id, b.name AS brand_name, p.name AS platform_name, r.execution_source, r.storage_profile,
             r.approved_by, r.approved_at, r.active
      FROM public.operational_storage_routes r
      JOIN public.brands b ON b.id = r.brand_id
      LEFT JOIN public.platforms p ON p.id = r.platform_id
      WHERE r.active = true
      ORDER BY b.name, p.name
    `)

    assert.equal(res.rows.length, 13, 'Exactly 13 internal routes must be active')
    assert.ok(res.rows.every((row) => row.execution_source === 'internal'), 'Every activated route must be internal')
    assert.equal(res.rows.filter((row) => row.execution_source === 'agency').length, 0, 'Agency routes must never be activated by this seed')
    assert.equal(new Set(res.rows.map((row) => `${row.brand_name}|${row.platform_name ?? ''}|${row.execution_source}`)).size, 13, 'Route keys must be unique')
    const rootMapping = await client.query(`
      SELECT count(DISTINCT root_folder_id)::int AS roots,
             count(DISTINCT base_folder_id)::int AS bases,
             count(*) FILTER (WHERE base_folder_id = root_folder_id)::int AS root_bases
      FROM public.operational_storage_routes WHERE active = true
    `)
    assert.deepEqual(rootMapping.rows[0], { roots: 1, bases: 11, root_bases: 3 }, 'Three canonical routes share the root as base; ten internal routes map to distinct brand bases')

    for (const row of res.rows) {
      assert.equal(row.approved_by, 'usr-ops-lead', 'approved_by must match the verified approver')
      assert.ok(row.approved_at, 'approved_at timestamp must be set')
      assert.equal(row.active, true, 'Route must be active')
    }

    // Verify brands.storage_profile was NOT updated/bypassed
    const brandsRes = await client.query(`
      SELECT count(*)::int AS count FROM public.brands WHERE storage_profile IS NOT NULL
    `)
    assert.equal(brandsRes.rows[0].count, 0, 'public.brands.storage_profile must remain untouched (NULL)')
  } finally {
    await client.end()
  }
})

// 10. Strict Idempotency on second run
test('PostgreSQL 17 Server: Internal-only seed is strictly idempotent on consecutive executions', async (t) => {
  const client = await getPostgresClient()
  if (!client) {
    t.skip('PostgreSQL 17 server not reachable on localhost:5432 (local non-CI dev mode)')
    return
  }

  try {
    await initPostgresSchema(client)
    await seedPrerequisites(client, { useTempTable: true, approvedUserId: 'usr-ops-lead' })

    // First execution
    await client.query(rawSeedSql)
    const firstCount = await client.query('SELECT count(*)::int AS count FROM public.operational_storage_routes WHERE active = true')
    assert.equal(firstCount.rows[0].count, 13)

    // Second execution (re-run)
    await client.query(rawSeedSql)
    const secondCount = await client.query('SELECT count(*)::int AS count FROM public.operational_storage_routes WHERE active = true')
    assert.equal(secondCount.rows[0].count, 13, 'Re-running seed must NOT duplicate active routes')
  } finally {
    await client.end()
  }
})
