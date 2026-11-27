import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const migration = await readFile(join(root, 'supabase/migrations/20261127090000_rc19_w4_workforce_monthly_full_scope_totals.sql'), 'utf8')

test('monthly v2 aggregates the full filtered authorized scope before three detail pages', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
      CREATE SCHEMA private;
      CREATE TABLE private.rbac_permission_catalog (
        permission text PRIMARY KEY, legacy_defaults jsonb NOT NULL, hard_restricted boolean NOT NULL,
        role_override_roles text[] NOT NULL, account_override_roles text[] NOT NULL, account_allow_roles text[] NOT NULL
      );
      CREATE TABLE private.rc19_business_user_agency_memberships (id uuid PRIMARY KEY);
      CREATE TABLE private.rc19_staff_incidents (
        id text PRIMARY KEY, original_staff_id text NOT NULL, shift_id text NOT NULL,
        staffing_segment_id text, operational_role text NOT NULL, business_date date NOT NULL,
        incident_type text NOT NULL, review_state text NOT NULL, verified_late_minutes integer, version integer NOT NULL
      );
      CREATE TABLE public.shifts (
        id text PRIMARY KEY, brand_id text NOT NULL, authoritative_agency_id uuid NOT NULL, platform_id text NOT NULL
      );
      CREATE FUNCTION private.current_business_user_id() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT current_setting('request.jwt.claim.sub', true)
      $$;
      CREATE FUNCTION private.current_business_user_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT private.current_business_user_id() IS NOT NULL
      $$;
      CREATE FUNCTION private.current_system_permission() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT current_setting('app.permission', true)
      $$;
      CREATE FUNCTION public.rbac01_effective_permission(text) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT current_setting('app.permission', true) = 'admin'
      $$;
      CREATE FUNCTION private.rc19_has_leader_brand_scope(text, text) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT $1 = current_setting('app.allowed_brand', true)
      $$;
      CREATE FUNCTION private.rc19_has_active_agency_membership(text, uuid, timestamptz DEFAULT statement_timestamp())
        RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    `)

    for (let i = 1; i <= 150; i++) {
      const shiftId = i <= 2 ? 'shift-shared' : `shift-${i}`
      const minutes = i < 150 ? 5 : 85
      await db.query(`
        INSERT INTO public.shifts (id, brand_id, authoritative_agency_id, platform_id)
        VALUES ($1, 'brand-a', '11111111-1111-4111-8111-111111111111', 'platform-a')
        ON CONFLICT (id) DO NOTHING
      `, [shiftId])
      await db.query(`
        INSERT INTO private.rc19_staff_incidents
          (id, original_staff_id, shift_id, operational_role, business_date, incident_type, review_state, verified_late_minutes, version)
        VALUES ($1, $2, $3, 'host', '2026-11-02', 'late', 'confirmed', $4, 1)
      `, [`incident-${i}`, `staff-${i}`, shiftId, minutes])
    }
    await db.exec(migration)

    async function invoke({ offset = 0, platformId = 'platform-a', reviewState = 'confirmed', incidentType = 'late' } = {}) {
      await db.exec(`
        BEGIN;
        SELECT set_config('request.jwt.claim.sub', 'business-admin', true);
        SELECT set_config('app.permission', 'admin', true);
        SET LOCAL ROLE authenticated;
      `)
      try {
        const response = await db.query(`
          SELECT public.rc19_workforce_incident_monthly_v2(
            '2026-11-01'::date, NULL, NULL, NULL, NULL, $1::text, $2::text, $3::text, 50, $4::integer
          ) AS result
        `, [platformId, reviewState, incidentType, offset])
        return response.rows[0].result
      } finally {
        await db.exec('ROLLBACK')
      }
    }

    const pages = await Promise.all([0, 50, 100].map((offset) => invoke({ offset })))
    for (const page of pages) {
      assert.equal(page.totalIncidents, 150)
      assert.equal(page.totalDistinctShifts, 149)
      assert.equal(page.totalDistinctStaff, 150)
      assert.equal(page.summary.confirmedCount, 150)
      assert.equal(page.summary.confirmedLateCount, 150)
      assert.equal(page.summary.verifiedLateMinutesTotal, 830)
    }
    assert.deepEqual(pages.map((page) => page.summary), [pages[0].summary, pages[0].summary, pages[0].summary])
    const staffTotals = (page) => page.staff.map((staff) => {
      const totals = { ...staff }
      delete totals.items
      return totals
    })
    assert.deepEqual(staffTotals(pages[1]), staffTotals(pages[0]))
    assert.deepEqual(staffTotals(pages[2]), staffTotals(pages[0]))
    assert.deepEqual(pages.map((page) => page.staff.reduce((count, staff) => count + staff.items.length, 0)), [50, 50, 50])

    const wrongPlatform = await invoke({ platformId: 'platform-other' })
    const wrongState = await invoke({ reviewState: 'pending' })
    const wrongType = await invoke({ incidentType: 'skip' })
    for (const empty of [wrongPlatform, wrongState, wrongType]) {
      assert.equal(empty.totalIncidents, 0)
      assert.equal(empty.totalDistinctShifts, 0)
      assert.equal(empty.summary.verifiedLateMinutesTotal, 0)
    }
  } finally {
    await db.close()
  }
})
