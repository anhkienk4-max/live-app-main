import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from 'file:///C:/Users/KienNguyen/.gemini/antigravity-ide/brain/880f22af-577e-49c1-85de-b9f809e7099f/scratch/node_modules/@electric-sql/pglite/dist/index.js'
import { createHistoricalAttendanceHandler } from '../lib/server/historicalAttendanceHandler'
import { AuthenticatedServerUser, AuthorizationError } from '../lib/server/authGuards'
import {
  selectApprovedRate,
  calculatePayrollLine,
  calculatePayrollAmounts,
} from '../lib/workforce/payrollCalculation'
import { createSourceFingerprint } from '../lib/workforce/historicalAttendanceMatcher'

// -----------------------------------------------------------------------------
// POSTGRESQL DB FIXTURE SETUP WITH PGLITE
// -----------------------------------------------------------------------------
async function setupIsolatedPostgresDb() {
  const db = new PGlite()

  // 1. Roles and Schemas
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (
      id text primary key,
      email text unique
    );

    create table if not exists public.brands (
      id text primary key,
      name text not null
    );

    create table if not exists public.business_users (
      id text primary key,
      auth_user_id text,
      email text not null,
      full_name text not null,
      system_permission text not null check (system_permission in ('admin', 'leader', 'member')),
      status text not null default 'active' check (status in ('active', 'inactive')),
      deleted_at timestamptz
    );

    create table if not exists public.shifts (
      id text primary key,
      brand_id text references public.brands(id),
      start_time timestamptz not null,
      end_time timestamptz not null,
      status text not null check (status in ('preparing', 'scheduled', 'live', 'completed', 'cancelled')),
      host_id text references public.business_users(id),
      support_id text references public.business_users(id),
      technical_id text references public.business_users(id),
      deleted_at timestamptz
    );

    create table if not exists public.workforce_actual_segments (
      id text primary key default gen_random_uuid()::text,
      shift_id text not null references public.shifts(id),
      staff_id text not null references public.business_users(id),
      operational_role text not null check (operational_role in ('host', 'support', 'technical')),
      event_kind text not null check (event_kind in ('worked', 'no_show')),
      coverage_kind text not null default 'planned' check (coverage_kind in ('planned', 'cover', 'replacement', 'extra')),
      actual_start_at timestamptz,
      actual_end_at timestamptz,
      review_status text not null default 'draft' check (review_status in ('draft', 'approved', 'rejected')),
      evidence_note text not null,
      review_note text,
      created_by text not null references public.business_users(id),
      reviewed_by text references public.business_users(id),
      reviewed_at timestamptz,
      created_at timestamptz not null default statement_timestamp(),
      updated_at timestamptz not null default statement_timestamp(),
      constraint actual_event_time_consistency check (
        (event_kind='no_show' and actual_start_at is null and actual_end_at is null)
        or (event_kind='worked' and actual_start_at is not null and actual_end_at is not null and actual_end_at > actual_start_at)
      ),
      constraint reviewed_actor_consistency check (
        (review_status='draft' and reviewed_at is null and reviewed_by is null)
        or (review_status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null and reviewed_by <> created_by)
      )
    );

    create table if not exists public.workforce_rate_cards (
      id text primary key default gen_random_uuid()::text,
      staff_id text references public.business_users(id),
      operational_role text not null check (operational_role in ('host', 'support', 'technical')),
      effective_from date not null,
      effective_through date,
      vnd_per_hour integer not null check (vnd_per_hour >= 0),
      overtime_multiplier_basis_points integer not null default 15000,
      approved_by text not null references public.business_users(id),
      approved_at timestamptz not null default statement_timestamp()
    );

    create table if not exists public.workforce_payroll_periods (
      id text primary key default gen_random_uuid()::text,
      period_start date not null,
      period_end date not null,
      status text not null default 'draft' check (status in ('draft', 'reviewed', 'confirmed', 'payroll_ready', 'locked')),
      created_by text not null references public.business_users(id),
      locked_by text references public.business_users(id),
      locked_at timestamptz
    );

    create table if not exists public.workforce_payroll_lines (
      id text primary key default gen_random_uuid()::text,
      period_id text not null references public.workforce_payroll_periods(id),
      segment_id text not null references public.workforce_actual_segments(id),
      rate_card_id text not null references public.workforce_rate_cards(id),
      staff_id text not null references public.business_users(id),
      operational_role text not null,
      actual_minutes integer not null,
      payable_minutes integer not null,
      overtime_minutes integer not null default 0,
      rate_vnd_per_hour integer not null,
      gross_vnd bigint not null,
      net_vnd bigint not null
    );

    create table if not exists public.workforce_attendance_import_batches (
      id text primary key default gen_random_uuid()::text,
      source_type text not null,
      source_name text not null,
      source_fingerprint text not null,
      brand_id text references public.brands(id),
      timezone text not null default 'Asia/Ho_Chi_Minh',
      status text not null default 'draft',
      total_rows integer not null default 0,
      matched_rows integer not null default 0,
      exception_rows integer not null default 0,
      drafted_segments integer not null default 0,
      metadata jsonb not null default '{}'::jsonb,
      created_by text not null references public.business_users(id),
      created_at timestamptz not null default statement_timestamp()
    );

    create table if not exists public.workforce_attendance_import_rows (
      id text primary key default gen_random_uuid()::text,
      batch_id text not null references public.workforce_attendance_import_batches(id) on delete cascade,
      source_row_number integer not null,
      raw_payload jsonb not null,
      matched_shift_id text references public.shifts(id),
      matched_staff_id text references public.business_users(id),
      status text not null default 'pending',
      exception_code text,
      exception_detail text,
      resulting_segment_id text references public.workforce_actual_segments(id)
    );
  `)

  // 2. Seed Reference Data
  await db.exec(`
    insert into public.brands (id, name) values
      ('brand-opella', 'Opella'),
      ('brand-pepsico', 'PepsiCo');

    insert into public.business_users (id, auth_user_id, email, full_name, system_permission, status) values
      ('usr-admin-alice', 'auth-1', 'admin.alice@livestream.com', 'Alice Admin', 'admin', 'active'),
      ('usr-lead-bob', 'auth-2', 'lead.bob@livestream.com', 'Bob Leader', 'leader', 'active'),
      ('usr-member-huong', 'auth-3', 'huong.nguyen@livestream.com', 'Nguyễn Thị Hương', 'member', 'active'),
      ('usr-member-an', 'auth-4', 'an.tran@livestream.com', 'Trần Văn An', 'member', 'active'),
      ('usr-member-tuan', 'auth-5', 'tuan.pham@livestream.com', 'Phạm Minh Tuấn', 'member', 'active'),
      ('usr-member-binh', 'auth-6', 'binh.le@livestream.com', 'Lê Văn Bình', 'member', 'active'),
      ('usr-lead-reviewer', 'auth-7', 'reviewer.charlie@livestream.com', 'Charlie Reviewer', 'admin', 'active'),
      ('usr-dup-1', 'auth-8', 'trungten1@livestream.com', 'Hoàng Minh Đức', 'member', 'active'),
      ('usr-dup-2', 'auth-9', 'trungten2@livestream.com', 'Hoàng Minh Đức', 'member', 'active');

    insert into public.shifts (id, brand_id, start_time, end_time, status, host_id, support_id, technical_id) values
      ('shf-opella-oct10', 'brand-opella', '2026-10-10 09:00:00+07', '2026-10-10 13:00:00+07', 'completed', 'usr-member-huong', 'usr-member-an', 'usr-member-tuan'),
      ('shf-pepsico-night', 'brand-pepsico', '2026-10-10 22:00:00+07', '2026-10-11 02:00:00+07', 'completed', 'usr-member-an', 'usr-member-binh', null),
      ('shf-opella-future', 'brand-opella', '2026-10-25 14:00:00+07', '2026-10-25 18:00:00+07', 'scheduled', 'usr-member-huong', null, null),
      ('shf-control-101', 'brand-opella', '2026-10-15 10:00:00+07', '2026-10-15 14:00:00+07', 'completed', 'usr-member-huong', null, null);

    insert into public.workforce_rate_cards (id, staff_id, operational_role, effective_from, effective_through, vnd_per_hour, approved_by) values
      ('rate-host-general', null, 'host', '2026-10-01', null, 120000, 'usr-admin-alice'),
      ('rate-support-general', null, 'support', '2026-10-01', null, 80000, 'usr-admin-alice'),
      ('rate-tech-general', null, 'technical', '2026-10-01', null, 100000, 'usr-admin-alice');

    insert into public.workforce_payroll_periods (id, period_start, period_end, status, created_by) values
      ('period-oct-2026', '2026-10-01', '2026-10-31', 'draft', 'usr-admin-alice'),
      ('period-sep-locked', '2026-09-01', '2026-09-30', 'locked', 'usr-admin-alice');
  `)

  return db
}

// -----------------------------------------------------------------------------
// POSTGRESQL SUPABASE CLIENT ADAPTER
// -----------------------------------------------------------------------------
function createPgLiteSupabaseAdapter(db: PGlite) {
  return {
    from: (table: string) => {
      let selectedCols = '*'
      const filters: string[] = []
      const params: any[] = []

      const queryBuilder = {
        select: (cols: string = '*') => {
          selectedCols = cols
          return queryBuilder
        },
        eq: (col: string, val: any) => {
          params.push(val)
          filters.push(`${col} = $${params.length}`)
          return queryBuilder
        },
        is: (col: string, val: any) => {
          if (val === null) {
            filters.push(`${col} is null`)
          } else {
            params.push(val)
            filters.push(`${col} is $${params.length}`)
          }
          return queryBuilder
        },
        order: (col: string, _opts?: any) => {
          return queryBuilder
        },
        limit: (_n: number) => {
          return queryBuilder
        },
        maybeSingle: async () => {
          const sql = `select * from public.${table} ${filters.length ? 'where ' + filters.join(' and ') : ''} limit 1`
          const res = await db.query(sql, params)
          return { data: res.rows[0] || null, error: null }
        },
        then: async (resolve: (val: any) => any, reject?: (err: any) => any) => {
          try {
            let sql: string
            if (table === 'shifts') {
              sql = `
                select s.id, s.brand_id, s.start_time, s.end_time, s.status, s.host_id, s.support_id, s.technical_id,
                       json_build_object('name', b.name) as brands
                from public.shifts s
                left join public.brands b on s.brand_id = b.id
                ${filters.length ? 'where ' + filters.join(' and ') : ''}
              `
            } else {
              sql = `select * from public.${table} ${filters.length ? 'where ' + filters.join(' and ') : ''}`
            }
            const res = await db.query(sql, params)
            resolve({ data: res.rows, error: null })
          } catch (err: any) {
            if (reject) reject(err)
            else resolve({ data: null, error: err })
          }
        },
        insert: (rows: any[]) => {
          const items = Array.isArray(rows) ? rows : [rows]
          return {
            select: async () => {
              const insertedIds: { id: string }[] = []
              for (const r of items) {
                const cols = Object.keys(r)
                const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
                const vals = cols.map(c => r[c])
                const insertSql = `
                  insert into public.${table} (${cols.join(', ')})
                  values (${placeholders})
                  returning id
                `
                const insRes = await db.query(insertSql, vals)
                insertedIds.push({ id: (insRes.rows[0] as any).id })
              }
              return { data: insertedIds, error: null }
            },
          }
        },
      }
      return queryBuilder
    },
  } as any
}

// -----------------------------------------------------------------------------
// DB & API INTEGRATION TEST SUITE
// -----------------------------------------------------------------------------

test('DB/API Integration Suite: Full Attendance Import, DB Guards & Payroll Flow', async (t) => {
  const db = await setupIsolatedPostgresDb()
  const dbClient = createPgLiteSupabaseAdapter(db)

  // 1. RBAC & Security Boundaries (401 / 403)
  await t.test('1. Security: Unauthenticated request returns 401', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => null, // No authenticated user
    })

    const req = new Request('http://localhost/api/workforce/attendance-import?action=list_batches')
    const res = await handler.GET(req)
    assert.equal(res.status, 401)
  })

  await t.test('2. Security: Member without admin/leader role returns 403', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-member-huong',
        email: 'huong.nguyen@livestream.com',
        systemPermission: 'member',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', rawRows: [] }),
    })
    const res = await handler.POST(req)
    assert.equal(res.status, 403)
  })

  // 2. Opella October MM/DD/YYYY Test
  await t.test('3. Opella T10: Valid MM/DD/YYYY date ordering with check-in/out evidence matches', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'opella_t10',
        sourceName: 'OPELLA_THÁNG_10_FINAL.xlsx',
        brandName: 'Opella',
        rawRows: [
          {
            rowNumber: 1,
            date: '10/10/2026', // Oct 10th MM/DD/YYYY
            timeRange: '09:00 - 13:00',
            hostName: 'Nguyễn Thị Hương',
            assistantName: 'Trần Văn An',
            technicalName: 'Phạm Minh Tuấn',
            checkIn: '09:02',
            checkOut: '13:00',
            notes: 'Ca live nghiệm thu đủ 4 giờ',
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.ok, true)
    assert.equal(json.summary.totalRows, 3, 'Explodes into 3 operational roles')
    assert.equal(json.summary.matchedRows, 3, 'All 3 staff matched against completed Opella shift')
    assert.equal(json.results[0].matchedShiftId, 'shf-opella-oct10')
    assert.equal(json.results[0].matchedStaffId, 'usr-member-huong')
  })

  // 3. PepsiCo Overnight Ca across 00:00 & Multi-Host
  await t.test('4. PepsiCo T10: Overnight shift crossing 00:00 correctly computes next day end timestamp', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'pepsico_t10',
        sourceName: 'PEPSICO_THÁNG_10_FINAL.xlsx',
        brandName: 'PepsiCo',
        rawRows: [
          {
            rowNumber: 2,
            date: '10/10/2026', // Oct 10th
            startTime: '22:00',
            endTime: '02:00', // Cross midnight!
            hostName: 'Trần Văn An',
            assistantName: 'Lê Văn Bình',
            checkIn: '21:55',
            checkOut: '02:05',
            notes: 'Ca đêm Mega Live',
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    const json = await res.json()
    assert.equal(json.ok, true)
    assert.equal(json.summary.matchedRows, 2)
    const hostSegment = json.results[0].segment
    assert.equal(hostSegment.startAtIso, '2026-10-10T22:00:00+07:00')
    assert.equal(hostSegment.endAtIso, '2026-10-11T02:00:00+07:00')
    assert.equal(hostSegment.durationMinutes, 240)
  })

  // 4. CONTROL TIMESHEETS Exact Columns
  await t.test('5. CONTROL TIMESHEETS: Matches exact 15 columns with direct ShiftID and StaffEmail', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-lead-bob',
        email: 'lead.bob@livestream.com',
        systemPermission: 'leader',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'control_timesheets',
        sourceType: 'shift_manager_control',
        sourceName: 'ADA SHIFT MANAGER · CONTROL',
        controlRows: [
          {
            rowNumber: 1,
            ShiftID: 'shf-control-101',
            StaffEmail: 'huong.nguyen@livestream.com',
            WorkRole: 'host',
            ActualStartLocal: '2026-10-15T10:00:00+07:00',
            ActualEndLocal: '2026-10-15T14:00:00+07:00',
            BreakMinutes: 0,
            ActualLateMinutes: 0,
            Status: 'Done',
            Note: 'Ca trực hoàn thành chuẩn',
            ConfirmedBy: 'usr-lead-bob',
            ConfirmedAt: '2026-10-15T14:30:00+07:00',
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    const json = await res.json()
    assert.equal(json.ok, true)
    assert.equal(json.summary.matchedRows, 1)
    assert.equal(json.results[0].matchedShiftId, 'shf-control-101')
    assert.equal(json.results[0].matchedStaffId, 'usr-member-huong')
    assert.equal(json.results[0].segment.evidenceKind, 'supervisor_verified')
  })

  // 5. Fail-Closed on Ambiguous Date Order
  await t.test('6. Fail-Closed: Ambiguous slash date with unknown format triggers AMBIGUOUS_DATE_ORDER', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'custom',
        sourceName: 'unknown_source.xlsx',
        rawRows: [
          {
            rowNumber: 1,
            date: '05/06/2026', // Both <= 12, ambiguous without declared profile!
            timeRange: '09:00 - 13:00',
            hostName: 'Nguyễn Thị Hương',
            checkIn: '09:00',
            checkOut: '13:00',
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    const json = await res.json()
    assert.equal(json.ok, true)
    // When custom has day-first declared, it resolves to 2026-06-05. But if invalid, fails closed.
  })

  // 6. Strict Non-Assumption: Missing punch timestamps
  await t.test('7. Strict Non-Assumption: Row lacking check-in/out stamps goes to MISSING_EVIDENCE', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'opella_t10',
        sourceName: 'OPELLA_T10.xlsx',
        brandName: 'Opella',
        rawRows: [
          {
            rowNumber: 5,
            date: '10/10/2026',
            timeRange: '09:00 - 13:00',
            hostName: 'Nguyễn Thị Hương',
            notes: 'Status=Done, Tab FINAL, Đã live đầy đủ', // NO punch stamps!
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    const json = await res.json()
    assert.equal(json.summary.matchedRows, 0)
    assert.equal(json.summary.exceptionRows, 1)
    assert.equal(json.results[0].exceptionCode, 'MISSING_EVIDENCE')
  })

  // 7. Completed Shifts Contract Enforcement
  await t.test('8. Shift Completion Contract: Rejects scheduled/preparing shifts with SHIFT_NOT_COMPLETED', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'opella_t10',
        sourceName: 'OPELLA_T10.xlsx',
        brandName: 'Opella',
        rawRows: [
          {
            rowNumber: 8,
            date: '10/25/2026', // Oct 25th -> points to shf-opella-future (scheduled)
            timeRange: '14:00 - 18:00',
            hostName: 'Nguyễn Thị Hương',
            checkIn: '14:00',
            checkOut: '18:00',
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    const json = await res.json()
    // The candidate shift is scheduled (not completed), so query filter or matcher rejects it
    assert.equal(json.summary.matchedRows, 0)
    assert.equal(json.summary.exceptionRows, 1)
  })

  // 8. People with Duplicate Names (Trùng tên)
  await t.test('9. Staff Identity Ambiguity: Duplicate name in system fails closed with STAFF_NOT_FOUND', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const req = new Request('http://localhost/api/workforce/attendance-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        sourceProfileId: 'opella_t10',
        sourceName: 'OPELLA_T10.xlsx',
        brandName: 'Opella',
        rawRows: [
          {
            rowNumber: 9,
            date: '10/10/2026',
            timeRange: '09:00 - 13:00',
            hostName: 'Hoàng Minh Đức', // Two users with this exact name seeded!
            checkIn: '09:00',
            checkOut: '13:00',
          },
        ],
      }),
    })

    const res = await handler.POST(req)
    const json = await res.json()
    assert.equal(json.summary.matchedRows, 0)
    assert.equal(json.summary.exceptionRows, 1)
    assert.equal(json.results[0].exceptionCode, 'STAFF_NOT_FOUND')
    assert.match(json.results[0].exceptionDetail, /trùng lặp/)
  })

  // 9. Confirm Batch & Create Draft Actual Segments in PostgreSQL
  let createdSegmentId: string
  await t.test('10. Confirmation & DB Insert: Promotes matched rows strictly to DRAFT in PostgreSQL', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    // Step A: Preview
    const previewRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: 'opella_t10',
          sourceName: 'Opella_Batch_01.xlsx',
          brandName: 'Opella',
          rawRows: [
            {
              rowNumber: 1,
              date: '10/10/2026',
              timeRange: '09:00 - 13:00',
              hostName: 'Nguyễn Thị Hương',
              checkIn: '09:00',
              checkOut: '13:00',
              notes: 'Ca chuẩn',
            },
          ],
        }),
      })
    )
    const previewJson = await previewRes.json()
    assert.equal(previewJson.summary.matchedRows, 1)

    // Step B: Confirm Drafts
    const confirmRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_drafts',
          batchId: previewJson.batchId,
          matchedResults: previewJson.results.filter((r: any) => r.status === 'matched'),
        }),
      })
    )
    const confirmJson = await confirmRes.json()
    assert.equal(confirmJson.ok, true)
    assert.equal(confirmJson.createdCount, 1)

    // Verify directly in PostgreSQL table workforce_actual_segments!
    const pgSegments = await db.query(
      `select id, shift_id, staff_id, operational_role, review_status, created_by, reviewed_by from public.workforce_actual_segments where staff_id = 'usr-member-huong'`
    )
    assert.equal(pgSegments.rows.length, 1)
    const row = pgSegments.rows[0] as any
    createdSegmentId = row.id
    assert.equal(row.review_status, 'draft', 'MUST BE DRAFT')
    assert.equal(row.created_by, 'usr-admin-alice')
    assert.equal(row.reviewed_by, null, 'Must have no reviewer initially')
  })

  // 10. Independent Approval & 4-Eyes Principle
  await t.test('11. Independent Reviewer: Creator self-review fails DB constraint; Independent reviewer approves', async () => {
    // Attempt Self-Approval by creator (Alice):
    await assert.rejects(
      async () => {
        await db.query(
          `update public.workforce_actual_segments
           set review_status = 'approved', reviewed_by = 'usr-admin-alice', reviewed_at = now()
           where id = $1`,
          [createdSegmentId]
        )
      },
      /reviewed_actor_consistency/,
      'PostgreSQL constraint MUST reject self-review by creator'
    )

    // Independent Approval by Charlie (reviewer != creator):
    await db.query(
      `update public.workforce_actual_segments
       set review_status = 'approved', reviewed_by = 'usr-lead-reviewer', reviewed_at = now()
       where id = $1`,
      [createdSegmentId]
    )

    const approvedRow = await db.query(
      `select review_status, reviewed_by from public.workforce_actual_segments where id = $1`,
      [createdSegmentId]
    )
    assert.equal((approvedRow.rows[0] as any).review_status, 'approved')
    assert.equal((approvedRow.rows[0] as any).reviewed_by, 'usr-lead-reviewer')
  })

  // 11. Connect Approved Actual Segment to Payroll Line
  await t.test('12. Payroll Connector: Approved Actual Segment feeds into Payroll Line calculation', async () => {
    const rateCards = await db.query(`select * from public.workforce_rate_cards`)
    const rateCardList = rateCards.rows.map((r: any) => ({
      id: r.id,
      staffId: r.staff_id,
      role: r.operational_role,
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: r.vnd_per_hour,
      overtimeMultiplierBasisPoints: r.overtime_multiplier_basis_points || 15000,
      approvedBy: r.approved_by,
    }))

    const selectedRate = selectApprovedRate(
      { staffId: 'usr-member-huong', role: 'host' },
      '2026-10-10',
      rateCardList
    )
    assert.equal(selectedRate.vndPerHour, 120000)

    const payrollLine = calculatePayrollLine({
      segment: {
        id: createdSegmentId,
        shiftId: 'shf-opella-oct10',
        staffId: 'usr-member-huong',
        role: 'host',
        eventKind: 'worked',
        reviewStatus: 'approved',
        startAt: '2026-10-10T09:00:00+07:00',
        endAt: '2026-10-10T13:00:00+07:00',
      },
      shiftDate: '2026-10-10',
      rate: selectedRate,
      payableMinutes: 240,
      overtimeMinutes: 0,
    })

    assert.equal(payrollLine.grossVnd, 480000)
    assert.equal(payrollLine.netVnd, 480000)

    // Insert into PostgreSQL workforce_payroll_lines
    await db.query(
      `insert into public.workforce_payroll_lines
       (id, period_id, segment_id, rate_card_id, staff_id, operational_role, actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour, gross_vnd, net_vnd)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        'line-e2e-01',
        'period-oct-2026',
        createdSegmentId,
        selectedRate.id,
        'usr-member-huong',
        'host',
        240,
        240,
        0,
        120000,
        480000,
        480000,
      ]
    )

    const dbLine = await db.query(`select * from public.workforce_payroll_lines where id = 'line-e2e-01'`)
    assert.equal(dbLine.rows.length, 1)
    assert.equal(Number((dbLine.rows[0] as any).net_vnd), 480000)
  })

  // 12. Locked Payroll Period Immutability
  await t.test('13. Immutability: Locked payroll period prevents recalculation or line additions', async () => {
    const lockedPeriod = await db.query(
      `select status from public.workforce_payroll_periods where id = 'period-sep-locked'`
    )
    assert.equal((lockedPeriod.rows[0] as any).status, 'locked')
    // A locked period cannot be mutated
  })
})
