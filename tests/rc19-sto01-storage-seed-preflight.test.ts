import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import {
  resolveOperationalStoragePlacement,
  type OperationalStorageRoute,
} from '@/lib/files/operationalStoragePlacementResolver'

const SEED_SQL_PATH = path.resolve(process.cwd(), 'scripts/storage/seed-v1-production-routes.sql')
const seedSql = fs.readFileSync(SEED_SQL_PATH, 'utf8')

async function createProductionEquivalentDb(): Promise<PGlite> {
  const db = new PGlite()

  // Base schema mimicking Supabase Production
  await db.exec(`
    CREATE TABLE public.business_users (
      id text PRIMARY KEY,
      email text NOT NULL,
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

  return db
}

async function seedPrerequisiteData(
  db: PGlite, 
  options: {
    omitBrandName?: string
    omitPlatformName?: string
    omitApprovedUser?: boolean
  } = {}
) {
  if (!options.omitApprovedUser) {
    await db.query(`INSERT INTO public.business_users (id, email) VALUES ($1, $2)`, ['usr-admin', 'admin@example.com'])
  }

  const brands = [
    'ASM AI Livestream', 'Female AI livestream', 'Male AI livestream',
    'Mars Snacking', 'ASTROMAN', 'Female', 'X-men', 'CUREL', 'KATE',
    'KAO', 'OPELLA', 'Pepsico'
  ]
  for (const name of brands) {
    if (name === options.omitBrandName) continue
    const id = 'brand_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    await db.query(`INSERT INTO public.brands (id, name) VALUES ($1, $2)`, [id, name])
  }

  const platforms = ['Shopee Live', 'TikTok Shop']
  for (const name of platforms) {
    if (name === options.omitPlatformName) continue
    const id = 'platform_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    await db.query(`INSERT INTO public.platforms (id, name) VALUES ($1, $2)`, [id, name])
  }
}

// 1. Missing Brand
test('PostgreSQL 17 isolated test: Preflight fails closed when required brand is missing', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db, { omitBrandName: 'ASM AI Livestream' })

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Missing required brands in public\.brands: ASM AI Livestream/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
  const routesCount = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes`)
  assert.equal(routesCount.rows[0].count, 0, 'No routes should be inserted on preflight failure')
})

// 2. Missing Platform
test('PostgreSQL 17 isolated test: Preflight fails closed when required platform is missing', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db, { omitPlatformName: 'TikTok Shop' })

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Missing required platforms in public\.platforms: TikTok Shop/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
  const routesCount = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes`)
  assert.equal(routesCount.rows[0].count, 0, 'No routes should be inserted on preflight failure')
})

// 3. Actor Approval Metadata Verification
test('PostgreSQL 17 isolated test: Preflight fails closed when approval actor is missing from public.business_users', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db, { omitApprovedUser: true })

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Required route approval actor \(approved_by = usr-admin\) does not exist in public\.business_users/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
  const routesCount = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes`)
  assert.equal(routesCount.rows[0].count, 0, 'No routes should be inserted when approval actor is missing')
})

// 4. Brand storage_profile Policy Conflict
test('PostgreSQL 17 isolated test: Preflight fails closed when brand has conflicting reviewed storage_profile', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  // Mark Mars Snacking as reviewed with CANONICAL_V1 (conflicting with LEGACY_CATEGORY_PERIOD)
  await db.query(`
    UPDATE public.brands 
    SET storage_profile = 'CANONICAL_V1',
        storage_profile_reviewed_by = 'usr-admin',
        storage_profile_reviewed_at = statement_timestamp()
    WHERE name = 'Mars Snacking'
  `)

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Brand storage_profile conflict detected: Mars Snacking \(has CANONICAL_V1, expected LEGACY_CATEGORY_PERIOD\)/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
  const routesCount = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes`)
  assert.equal(routesCount.rows[0].count, 0, 'No routes should be inserted when brand profile conflicts')
})

// 5. Conflicting Route Contract Preflight (base_folder_id conflict)
test('PostgreSQL 17 isolated test: Preflight fails closed when existing active route has base_folder_id conflict', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  // Insert a conflicting active route for Mars Snacking with differing base_folder_id
  await db.query(`
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
      'conflicting_fake_folder_id_123',
      '{"dashboard":"DASHBOARD","live_visual_internal":"VISIBILITY","data_report":["DATA","REPORT"],"data_source":["DATA","SOURCE"]}'::jsonb,
      'THANG_M_DASH_YEAR',
      true, 'usr-admin', statement_timestamp()
    )
  `)

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Conflicting active route configuration detected.*base_folder_id mismatch/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
})

// 6. Conflicting Route Contract Preflight (storage_profile conflict)
test('PostgreSQL 17 isolated test: Preflight fails closed when existing active route has storage_profile conflict', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  // Insert a conflicting active route for ASM AI Livestream with differing profile
  await db.query(`
    INSERT INTO public.operational_storage_routes (
      provider, execution_source, brand_id, platform_id, subbrand_key,
      storage_profile, root_folder_id, base_folder_id, folder_labels,
      period_naming_style, active, approved_by, approved_at
    ) VALUES (
      'google_drive', 'internal',
      (SELECT id FROM public.brands WHERE name = 'ASM AI Livestream'),
      NULL, NULL,
      'LEGACY_CATEGORY_PERIOD',
      '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
      '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
      '{}'::jsonb,
      'THANG_M_DOT_YEAR',
      true, 'usr-admin', statement_timestamp()
    )
  `)

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Conflicting active route configuration detected.*profile mismatch/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
})

// 7. Conflicting Route Contract Preflight (folder_labels conflict)
test('PostgreSQL 17 isolated test: Preflight fails closed when existing active route has folder_labels conflict', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  await db.query(`
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
      '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5',
      '{"dashboard":"WRONG_LABEL"}'::jsonb,
      'THANG_M_DASH_YEAR',
      true, 'usr-admin', statement_timestamp()
    )
  `)

  await assert.rejects(
    async () => {
      await db.exec(seedSql)
    },
    (err: Error) => {
      assert.match(err.message, /PREFLIGHT FAIL-CLOSED: Conflicting active route configuration detected.*folder_labels mismatch/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
})

// 8. Unsupported profile (CHECK constraint rejection)
test('PostgreSQL 17 isolated test: Fails closed on TEMP_AGENCY_BRAND_PERIOD_CATEGORY due to CHECK constraint', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  await assert.rejects(
    async () => {
      await db.query(`
        INSERT INTO public.operational_storage_routes (
          provider, execution_source, brand_id, platform_id, subbrand_key,
          storage_profile, root_folder_id, base_folder_id, folder_labels,
          period_naming_style, active, approved_by, approved_at
        ) VALUES (
          'google_drive', 'agency',
          (SELECT id FROM public.brands WHERE name = 'ASTROMAN'),
          NULL, NULL,
          'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
          '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
          '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
          '{}'::jsonb,
          'THANG_M_DOT_YEAR',
          true, 'usr-admin', statement_timestamp()
        )
      `)
    },
    (err: Error) => {
      assert.match(err.message, /violates check constraint "operational_storage_routes_storage_profile_check"/)
      return true
    }
  )
})

// 9. Atomic Rollback Verification
test('PostgreSQL 17 isolated test: Atomic rollback guarantees 0 state mutation when an error occurs mid-script', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  // Synthesize a script with an error injected after 1st route
  const failingScript = seedSql.replace(
    /-- Route 2:/,
    `RAISE EXCEPTION 'SYNTHETIC FAILURE INJECTED FOR ROLLBACK TEST';\n-- Route 2:`
  )

  await assert.rejects(
    async () => {
      await db.exec(failingScript)
    },
    (err: Error) => {
      assert.match(err.message, /SYNTHETIC FAILURE INJECTED FOR ROLLBACK TEST/)
      return true
    }
  )

  try { await db.exec('ROLLBACK;') } catch {}
  const countRes = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes`)
  assert.equal(countRes.rows[0].count, 0, 'Atomic rollback MUST leave 0 rows in operational_storage_routes')
})

// 10. Preflight and Seed Succeed for 14 Schema-Valid Routes with Approval Metadata
test('PostgreSQL 17 isolated test: Preflight and seed succeed for 14 schema-valid routes with approval metadata', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  await db.exec(seedSql)

  const routesResult = await db.query(`
    SELECT r.id, b.name AS brand_name, p.name AS platform_name, r.execution_source, r.storage_profile,
           r.approved_by, r.approved_at
    FROM public.operational_storage_routes r
    JOIN public.brands b ON b.id = r.brand_id
    LEFT JOIN public.platforms p ON p.id = r.platform_id
    WHERE r.active = true
    ORDER BY b.name, p.name
  `)

  assert.equal(routesResult.rows.length, 14, 'Exactly 14 schema-valid routes should be activated')

  for (const row of routesResult.rows) {
    assert.equal(row.approved_by, 'usr-admin', 'approved_by must be set to verified operator')
    assert.ok(row.approved_at, 'approved_at must be populated')
  }

  // Verify that brands.storage_profile was NOT modified (remains NULL)
  const brandsWithProfile = await db.query(`
    SELECT count(*)::int AS count FROM public.brands WHERE storage_profile IS NOT NULL
  `)
  assert.equal(brandsWithProfile.rows[0].count, 0, 'public.brands.storage_profile must NOT be modified by route seed')
})

// 11. Idempotency on Re-run
test('PostgreSQL 17 isolated test: Seed script is idempotent and preserves identical active routes without duplication', async () => {
  const db = await createProductionEquivalentDb()
  await seedPrerequisiteData(db)

  // First run
  await db.exec(seedSql)
  const firstCount = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes WHERE active = true`)
  assert.equal(firstCount.rows[0].count, 14)

  // Second run (re-run)
  await db.exec(seedSql)
  const secondCount = await db.query(`SELECT count(*)::int AS count FROM public.operational_storage_routes WHERE active = true`)
  assert.equal(secondCount.rows[0].count, 14, 'Re-running seed must NOT create duplicates (idempotent)')
})

// 12. Placement Contract Verification
test('Folder structure verification: CANONICAL_V1 vs EXISTING_BRAND_YEAR_PERIOD_PLATFORM vs LEGACY profiles', () => {
  // 1. CANONICAL_V1 generates [Brand, Platform, Period, Category]
  const canonicalRoute: OperationalStorageRoute = {
    id: 'route_canonical',
    provider: 'google_drive',
    execution_source: 'internal',
    brand_id: 'brand_asm',
    platform_id: null,
    subbrand_key: null,
    storage_profile: 'CANONICAL_V1',
    root_folder_id: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
    base_folder_id: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
    folder_labels: {},
    period_naming_style: 'THANG_M_DOT_YEAR',
    active: true,
  }

  const canonicalPlacement = resolveOperationalStoragePlacement(canonicalRoute, {
    provider: 'google_drive',
    executionSource: 'internal',
    brandId: 'brand_asm',
    platformId: 'platform_tt',
    subbrandKey: null,
    shiftDate: '2026-10-27',
    logicalCategory: 'dashboard',
    fileName: 'report.xlsx',
    brandLabel: 'ASM AI Livestream',
    platformLabel: 'TikTok Shop',
  })

  assert.deepEqual(
    canonicalPlacement.folderSegments,
    ['ASM AI Livestream', 'TikTok Shop', 'THÁNG 10.2026', 'DASHBOARD'],
    'CANONICAL_V1 must place Platform before Period'
  )

  // 2. EXISTING_BRAND_YEAR_PERIOD_PLATFORM generates [Year, Period, Platform, Category] under Brand base folder
  const existingBrandRoute: OperationalStorageRoute = {
    id: 'route_existing',
    provider: 'google_drive',
    execution_source: 'internal',
    brand_id: 'brand_mars',
    platform_id: null,
    subbrand_key: null,
    storage_profile: 'EXISTING_BRAND_YEAR_PERIOD_PLATFORM',
    root_folder_id: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
    base_folder_id: 'brand_folder_mars_id',
    folder_labels: { platform: 'TikTok Shop' },
    period_naming_style: 'THANG_MM_DOT_YEAR',
    active: true,
  }

  const existingPlacement = resolveOperationalStoragePlacement(existingBrandRoute, {
    provider: 'google_drive',
    executionSource: 'internal',
    brandId: 'brand_mars',
    platformId: 'platform_tt',
    subbrandKey: null,
    shiftDate: '2026-10-27',
    logicalCategory: 'dashboard',
    fileName: 'report.xlsx',
    brandLabel: 'Mars Snacking',
    platformLabel: 'TikTok Shop',
  })

  assert.deepEqual(
    existingPlacement.folderSegments,
    ['2026', 'THÁNG 10.2026', 'TikTok Shop', 'DASHBOARD'],
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM generates Year/Period/Platform/Category under Brand base folder'
  )

  // 3. TEMP_AGENCY_BRAND_PERIOD_CATEGORY generates [Brand, Period, Category] under Agency root
  const agencyRoute: OperationalStorageRoute = {
    id: 'route_agency_temp',
    provider: 'google_drive',
    execution_source: 'agency',
    brand_id: 'brand_astroman',
    platform_id: null,
    subbrand_key: null,
    storage_profile: 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY',
    root_folder_id: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
    base_folder_id: '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC',
    folder_labels: {},
    period_naming_style: 'THANG_M_DOT_YEAR',
    active: true,
  }

  const agencyPlacement = resolveOperationalStoragePlacement(agencyRoute, {
    provider: 'google_drive',
    executionSource: 'agency',
    brandId: 'brand_astroman',
    platformId: null,
    subbrandKey: null,
    shiftDate: '2026-10-27',
    logicalCategory: 'dashboard',
    fileName: 'dashboard.xlsx',
    brandLabel: 'ASTROMAN',
  })

  assert.deepEqual(
    agencyPlacement.folderSegments,
    ['ASTROMAN', 'THÁNG 10.2026', 'DASHBOARD'],
    'TEMP_AGENCY_BRAND_PERIOD_CATEGORY places Brand before Period under Agency base folder'
  )
})
