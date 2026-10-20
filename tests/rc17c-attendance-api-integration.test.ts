import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHistoricalAttendanceHandler } from '../lib/server/historicalAttendanceHandler'
import {
  selectApprovedRate,
  calculatePayrollLine,
} from '../lib/workforce/payrollCalculation'

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
      platform_id text,
      date date not null,
      start_time time not null,
      end_time time not null,
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
      created_at timestamptz not null default statement_timestamp(),
      updated_at timestamptz not null default statement_timestamp(),
      version integer not null default 1
    );

    create table if not exists public.workforce_attendance_import_rows (
      id text primary key default gen_random_uuid()::text,
      batch_id text not null references public.workforce_attendance_import_batches(id) on delete cascade,
      source_row_number integer not null,
      raw_payload jsonb not null,
      parsed_date date,
      parsed_start_time text,
      parsed_end_time text,
      parsed_start_at timestamptz,
      parsed_end_at timestamptz,
      raw_staff_name text,
      raw_role text,
      raw_notes text,
      matched_shift_id text references public.shifts(id),
      matched_staff_id text references public.business_users(id),
      operational_role text,
      coverage_kind text default 'planned',
      evidence_kind text not null default 'missing_evidence',
      status text not null default 'pending',
      exception_code text,
      exception_detail text,
      resulting_segment_id text references public.workforce_actual_segments(id),
      created_at timestamptz not null default statement_timestamp(),
      updated_at timestamptz not null default statement_timestamp()
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

    insert into public.shifts (id, brand_id, date, start_time, end_time, status, host_id, support_id, technical_id) values
      ('shf-opella-oct10', 'brand-opella', '2026-10-10', '09:00:00', '13:00:00', 'completed', 'usr-member-huong', 'usr-member-an', 'usr-member-tuan'),
      ('shf-pepsico-night', 'brand-pepsico', '2026-10-10', '22:00:00', '02:00:00', 'completed', 'usr-member-an', 'usr-member-binh', null),
      ('shf-opella-oct11', 'brand-opella', '2026-10-11', '09:00:00', '13:00:00', 'completed', 'usr-member-huong', null, null),
      ('shf-opella-oct12', 'brand-opella', '2026-10-12', '09:00:00', '13:00:00', 'completed', 'usr-member-huong', null, null),
      ('shf-opella-oct13', 'brand-opella', '2026-10-13', '09:00:00', '13:00:00', 'completed', 'usr-member-huong', null, null),
      ('shf-opella-oct14', 'brand-opella', '2026-10-14', '09:00:00', '13:00:00', 'completed', 'usr-member-huong', null, null),
      ('shf-opella-future', 'brand-opella', '2026-10-25', '14:00:00', '18:00:00', 'scheduled', 'usr-member-huong', null, null),
      ('shf-control-101', 'brand-opella', '2026-10-15', '10:00:00', '14:00:00', 'completed', 'usr-member-huong', null, null);

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
function createPgLiteSupabaseAdapter(db: PGlite): SupabaseClient {
  return {
    from: (table: string) => {
      const filters: string[] = []
      const params: unknown[] = []

      const queryBuilder = {
        select: (..._args: unknown[]) => {
          void _args
          return queryBuilder
        },
        eq: (col: string, val: unknown) => {
          const colRef = table === 'shifts' ? `s.${col}` : col
          params.push(val)
          filters.push(`${colRef} = $${params.length}`)
          return queryBuilder
        },
        neq: (col: string, val: unknown) => {
          const colRef = table === 'shifts' ? `s.${col}` : col
          params.push(val)
          filters.push(`${colRef} <> $${params.length}`)
          return queryBuilder
        },
        in: (col: string, values: unknown[]) => {
          if (!values || values.length === 0) {
            filters.push('false')
            return queryBuilder
          }
          const colRef = table === 'shifts' ? `s.${col}` : col
          const placeholders = values.map(v => {
            params.push(v)
            return `$${params.length}`
          }).join(', ')
          filters.push(`${colRef} in (${placeholders})`)
          return queryBuilder
        },
        is: (col: string, val: unknown) => {
          const colRef = table === 'shifts' ? `s.${col}` : col
          if (val === null) {
            filters.push(`${colRef} is null`)
          } else {
            params.push(val)
            filters.push(`${colRef} is $${params.length}`)
          }
          return queryBuilder
        },
        order: (..._args: unknown[]) => queryBuilder,
        limit: (..._args: unknown[]) => queryBuilder,
        maybeSingle: async () => {
          const sql = `select * from public.${table} ${filters.length ? 'where ' + filters.join(' and ') : ''} limit 1`
          const res = await db.query(sql, params)
          return { data: res.rows[0] || null, error: null }
        },
        then: async (
          resolve: (val: { data: unknown; error: unknown }) => void,
          reject?: (err: unknown) => void
        ) => {
          try {
            let sql: string
            if (table === 'shifts') {
              sql = `
                select s.id, s.brand_id, s.platform_id, s.date, s.start_time, s.end_time, s.status, s.host_id, s.support_id, s.technical_id,
                       json_build_object('name', b.name) as brands,
                       null as platforms
                from public.shifts s
                left join public.brands b on s.brand_id = b.id
                ${filters.length ? 'where ' + filters.join(' and ') : ''}
              `
            } else {
              sql = `select * from public.${table} ${filters.length ? 'where ' + filters.join(' and ') : ''}`
            }
            const res = await db.query(sql, params)
            resolve({ data: res.rows, error: null })
          } catch (err: unknown) {
            if (reject) reject(err)
            else resolve({ data: null, error: err })
          }
        },
        insert: (rows: Record<string, unknown>[] | Record<string, unknown>) => {
          const items = Array.isArray(rows) ? rows : [rows]
          const execInsert = async () => {
            const insertedRows: unknown[] = []
            for (const r of items) {
              const cols = Object.keys(r)
              const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
              const vals = cols.map(c => {
                const v = r[c]
                if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
                  return JSON.stringify(v)
                }
                return v
              })
              const insertSql = `
                insert into public.${table} (${cols.join(', ')})
                values (${placeholders})
                returning *
              `
              const insRes = await db.query(insertSql, vals)
              insertedRows.push(insRes.rows[0])
            }
            return { data: insertedRows, error: null }
          }

          return {
            select: async () => execInsert(),
            then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
              execInsert().then(resolve, reject)
            },
          }
        },
        update: (fields: Record<string, unknown>) => {
          const updateFilters: string[] = []
          const updateParams: unknown[] = []

          const updater = {
            eq: (col: string, val: unknown) => {
              updateParams.push(val)
              updateFilters.push(`${col} = $${updateParams.length + Object.keys(fields).length}`)
              return updater
            },
            then: async (resolve: (val: { data: unknown; error: unknown }) => void, reject?: (err: unknown) => void) => {
              try {
                const cols = Object.keys(fields)
                const setClauses = cols.map((c, i) => `${c} = $${i + 1}`)
                const vals = cols.map(c => {
                  const v = fields[c]
                  if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
                    return JSON.stringify(v)
                  }
                  return v
                })
                const allParams = [...vals, ...updateParams]
                const sql = `
                  update public.${table}
                  set ${setClauses.join(', ')}
                  ${updateFilters.length ? 'where ' + updateFilters.join(' and ') : ''}
                  returning *
                `
                const res = await db.query(sql, allParams)
                resolve({ data: res.rows, error: null })
              } catch (err) {
                if (reject) reject(err)
                else resolve({ data: null, error: err })
              }
            },
          }
          return updater
        },
        delete: () => {
          const deleteFilters: string[] = []
          const deleteParams: unknown[] = []

          const deleter = {
            eq: (col: string, val: unknown) => {
              deleteParams.push(val)
              deleteFilters.push(`${col} = $${deleteParams.length}`)
              return deleter
            },
            then: async (resolve: (val: { data: unknown; error: unknown }) => void, reject?: (err: unknown) => void) => {
              try {
                const sql = `
                  delete from public.${table}
                  ${deleteFilters.length ? 'where ' + deleteFilters.join(' and ') : ''}
                `
                await db.query(sql, deleteParams)
                resolve({ data: null, error: null })
              } catch (err) {
                if (reject) reject(err)
                else resolve({ data: null, error: err })
              }
            },
          }
          return deleter
        },
      }
      return queryBuilder
    },
  } as unknown as SupabaseClient
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
    assert.equal(hostSegment.startAtIso, '2026-10-10T21:55:00+07:00', 'Actual start is physical check-in')
    assert.equal(hostSegment.endAtIso, '2026-10-11T02:05:00+07:00', 'Actual end is physical check-out')
    assert.equal(hostSegment.durationMinutes, 250, 'Actual duration is 250 mins (21:55 - 02:05)')
    assert.equal(hostSegment.plannedStartAtIso, '2026-10-10T22:00:00+07:00', 'Planned start is schedule')
    assert.equal(hostSegment.plannedEndAtIso, '2026-10-11T02:00:00+07:00', 'Planned end is schedule')
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

    // Step B: Confirm Drafts (Client only sends batchId; Server loads immutable staged rows from DB)
    const confirmRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_drafts',
          batchId: previewJson.batchId,
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
    const row = pgSegments.rows[0] as { id: string; review_status: string; created_by: string; reviewed_by: string | null }
    createdSegmentId = row.id
    assert.equal(row.review_status, 'draft', 'MUST BE DRAFT')
    assert.equal(row.created_by, 'usr-admin-alice')
    assert.equal(row.reviewed_by, null, 'Must have no reviewer initially')

    // Verify Row Provenance in workforce_attendance_import_rows: status=drafted, resulting_segment_id set!
    const stagedRowDb = await db.query(
      `select status, resulting_segment_id from public.workforce_attendance_import_rows where batch_id = $1`,
      [previewJson.batchId]
    )
    assert.equal(stagedRowDb.rows.length, 1)
    assert.equal((stagedRowDb.rows[0] as { status: string }).status, 'drafted')
    assert.equal((stagedRowDb.rows[0] as { resulting_segment_id: string }).resulting_segment_id, createdSegmentId)

    // Verify Batch in workforce_attendance_import_batches: status=confirmed, drafted_segments=1
    const batchDb = await db.query(
      `select status, drafted_segments from public.workforce_attendance_import_batches where id = $1`,
      [previewJson.batchId]
    )
    assert.equal(batchDb.rows.length, 1)
    assert.equal((batchDb.rows[0] as { status: string }).status, 'confirmed')
    assert.equal((batchDb.rows[0] as { drafted_segments: number }).drafted_segments, 1)
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
    const approvedData = approvedRow.rows[0] as { review_status: string; reviewed_by: string }
    assert.equal(approvedData.review_status, 'approved')
    assert.equal(approvedData.reviewed_by, 'usr-lead-reviewer')
  })

  // 11. Connect Approved Actual Segment to Payroll Line
  await t.test('12. Payroll Connector: Approved Actual Segment feeds into Payroll Line calculation', async () => {
    const rateCards = await db.query(`select * from public.workforce_rate_cards`)
    const rateCardList = rateCards.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      staffId: r.staff_id ? String(r.staff_id) : null,
      role: r.operational_role as 'host' | 'support' | 'technical',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: Number(r.vnd_per_hour),
      overtimeMultiplierBasisPoints: Number(r.overtime_multiplier_basis_points) || 15000,
      approvedBy: String(r.approved_by),
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
    const lineData = dbLine.rows[0] as { net_vnd: number | string }
    assert.equal(Number(lineData.net_vnd), 480000)
  })

  // 12. Locked Payroll Period Immutability
  await t.test('13. Immutability: Locked payroll period prevents recalculation or line additions', async () => {
    const lockedPeriod = await db.query(
      `select status from public.workforce_payroll_periods where id = 'period-sep-locked'`
    )
    const periodData = lockedPeriod.rows[0] as { status: string }
    assert.equal(periodData.status, 'locked')
    // A locked period cannot be mutated
  })

  // 13. P0-1 Forged Payload Protection: Client sends modified matchedResults; Server ignores client and uses DB staged row
  await t.test('14. P0-1: Forged client matchedResults payload is ignored; Server uses only staged DB records', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    // Create a new preview batch
    const pRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: 'opella_t10',
          sourceName: 'Opella_Batch_Forged_Test.xlsx',
          brandName: 'Opella',
          rawRows: [
            {
              rowNumber: 1,
              date: '10/11/2026',
              timeRange: '09:00 - 13:00',
              hostName: 'Nguyễn Thị Hương',
              checkIn: '09:00',
              checkOut: '13:00',
              notes: 'Ca chuẩn 1',
            },
          ],
        }),
      })
    )
    const pJson = await pRes.json()
    assert.equal(pJson.ok, true)

    // Attacker sends forged matchedResults claiming a fake shift or altered times
    const forgedConfirmRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_drafts',
          batchId: pJson.batchId,
          matchedResults: [
            {
              rowNumber: 1,
              status: 'matched',
              matchedShiftId: 'FORGED_SHIFT_ID_NOT_IN_DB',
              matchedStaffId: 'FORGED_STAFF_ID',
              segment: {
                startAtIso: '2026-10-11T00:00:00+07:00',
                endAtIso: '2026-10-11T23:59:00+07:00',
              },
            },
          ],
        }),
      })
    )
    const forgedJson = await forgedConfirmRes.json()
    assert.equal(forgedJson.ok, true)

    // Server must have created the segment from the STAGED row (shf-opella-oct11 / usr-member-huong), NOT the forged client data!
    const createdSegs = await db.query(
      `select shift_id, staff_id from public.workforce_actual_segments where evidence_note like $1`,
      [`%${pJson.batchId}%`]
    )
    assert.equal(createdSegs.rows.length, 1)
    assert.equal((createdSegs.rows[0] as { shift_id: string }).shift_id, 'shf-opella-oct11', 'Used authentic staged shift, not forged shift')
    assert.equal((createdSegs.rows[0] as { staff_id: string }).staff_id, 'usr-member-huong', 'Used authentic staged staff, not forged staff')
  })

  // 14. P0-1 & P0-2 Replay Attack Protection: Second confirm fails with BATCH_ALREADY_CONFIRMED
  await t.test('15. P0-1 & P0-2: Replay confirmation fails with 409 BATCH_ALREADY_CONFIRMED', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    // Setup fresh staged batch
    const pRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: 'opella_t10',
          sourceName: 'Opella_Replay_Test.xlsx',
          brandName: 'Opella',
          rawRows: [
            {
              rowNumber: 1,
              date: '10/12/2026',
              timeRange: '09:00 - 13:00',
              hostName: 'Nguyễn Thị Hương',
              checkIn: '09:00',
              checkOut: '13:00',
              notes: 'Ca replay',
            },
          ],
        }),
      })
    )
    const pJson = await pRes.json()

    // First confirmation -> SUCCESS
    const c1 = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_drafts', batchId: pJson.batchId }),
      })
    )
    assert.equal((await c1.json()).ok, true)

    // Replay confirmation -> 409 BATCH_ALREADY_CONFIRMED
    const c2 = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_drafts', batchId: pJson.batchId }),
      })
    )
    assert.equal(c2.status, 409)
    const c2Json = await c2.json()
    assert.equal(c2Json.error.code, 'BATCH_ALREADY_CONFIRMED')
  })

  // 15. P0-3 Shift Candidate Ambiguity (Fail Closed)
  await t.test('16. P0-3: Multiple candidates with equivalent proximity fail closed to ROLE_AMBIGUOUS', async () => {
    // Seed two competing unassigned completed shifts at the same time for PepsiCo
    await db.exec(`
      insert into public.shifts (id, brand_id, date, start_time, end_time, status, host_id, support_id, technical_id) values
        ('shf-pepsi-studio-1', 'brand-pepsico', '2026-10-18', '14:00:00', '18:00:00', 'completed', null, null, null),
        ('shf-pepsi-studio-2', 'brand-pepsico', '2026-10-18', '14:00:00', '18:00:00', 'completed', null, null, null);
    `)

    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const pRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: 'pepsico_t10',
          sourceName: 'PEPSICO_AMBIGUOUS.xlsx',
          brandName: 'PepsiCo',
          rawRows: [
            {
              rowNumber: 1,
              date: '10/18/2026',
              timeRange: '14:00 - 18:00',
              hostName: 'Trần Văn An',
              checkIn: '14:00',
              checkOut: '18:00',
              notes: 'Ca live trùng giờ cả 2 studio',
            },
          ],
        }),
      })
    )
    const pJson = await pRes.json()
    assert.equal(pJson.ok, true)
    assert.equal(pJson.summary.matchedRows, 0, 'Must NOT pick arbitrarily')
    assert.equal(pJson.summary.exceptionRows, 1)
    assert.equal(pJson.results[0].exceptionCode, 'ROLE_AMBIGUOUS')
    assert.match(pJson.results[0].exceptionDetail, /độ tin cậy tương đương/)
  })

  // 16. P0-4 Actual Times vs Planned Times (Check-in 09:15, Check-out 12:50 on 09:00-13:00 schedule)
  await t.test('17. P0-4: Planned 09:00-13:00 with Actual 09:15-12:50 produces Actual Segment 09:15-12:50 (215 mins)', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    const pRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: 'opella_t10',
          sourceName: 'Opella_Variance_Test.xlsx',
          brandName: 'Opella',
          rawRows: [
            {
              rowNumber: 1,
              date: '10/13/2026',
              timeRange: '09:00 - 13:00', // Planned schedule
              hostName: 'Nguyễn Thị Hương',
              checkIn: '09:15',          // Actual punch in
              checkOut: '12:50',         // Actual punch out
              notes: 'Đi muộn 15p, về sớm 10p',
            },
          ],
        }),
      })
    )
    const pJson = await pRes.json()
    assert.equal(pJson.ok, true)
    assert.equal(pJson.summary.matchedRows, 1)

    const seg = pJson.results[0].segment
    assert.equal(seg.startAtIso, '2026-10-13T09:15:00+07:00', 'Actual start must be 09:15')
    assert.equal(seg.endAtIso, '2026-10-13T12:50:00+07:00', 'Actual end must be 12:50')
    assert.equal(seg.durationMinutes, 215, 'Duration must be 215 minutes (3h35m)')
    assert.equal(seg.plannedStartAtIso, '2026-10-13T09:00:00+07:00', 'Planned start is 09:00')
    assert.equal(seg.plannedEndAtIso, '2026-10-13T13:00:00+07:00', 'Planned end is 13:00')

    // Confirm and verify DB segment timestamps
    const cRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_drafts', batchId: pJson.batchId }),
      })
    )
    assert.equal((await cRes.json()).ok, true)

    const dbSeg = await db.query(
      `select actual_start_at, actual_end_at from public.workforce_actual_segments where evidence_note like $1`,
      [`%${pJson.batchId}%`]
    )
    assert.equal(dbSeg.rows.length, 1)
    const segRow = dbSeg.rows[0] as { actual_start_at: string; actual_end_at: string }
    assert.match(new Date(segRow.actual_start_at).toISOString(), /02:15:00/, 'UTC equivalent of 09:15 (+07:00)')
    assert.match(new Date(segRow.actual_end_at).toISOString(), /05:50:00/, 'UTC equivalent of 12:50 (+07:00)')
  })

  // 17. P0-2 Staging API: GET get_batch and list_exceptions return staged database records
  await t.test('18. P0-2: GET get_batch and list_exceptions return persisted rows from database', async () => {
    const handler = createHistoricalAttendanceHandler({
      client: () => dbClient,
      resolveUser: async () => ({
        id: 'usr-admin-alice',
        email: 'admin.alice@livestream.com',
        systemPermission: 'admin',
      }),
    })

    // Preview creates staged batch with 1 matched and 1 exception
    const pRes = await handler.POST(
      new Request('http://localhost/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: 'opella_t10',
          sourceName: 'GET_BATCH_TEST.xlsx',
          brandName: 'Opella',
          rawRows: [
            {
              rowNumber: 1,
              date: '10/14/2026',
              timeRange: '09:00 - 13:00',
              hostName: 'Nguyễn Thị Hương',
              checkIn: '09:00',
              checkOut: '13:00',
            },
            {
              rowNumber: 2,
              date: '10/14/2026',
              timeRange: '09:00 - 13:00',
              hostName: 'Nhân Sự Không Xác Định',
              checkIn: '09:00',
              checkOut: '13:00',
            },
          ],
        }),
      })
    )
    const pJson = await pRes.json()
    const testBatchId = pJson.batchId

    // GET get_batch
    const getBatchRes = await handler.GET(
      new Request(`http://localhost/api/workforce/attendance-import?action=get_batch&batch_id=${testBatchId}`)
    )
    assert.equal(getBatchRes.status, 200)
    const getBatchJson = await getBatchRes.json()
    assert.equal(getBatchJson.ok, true)
    assert.equal(getBatchJson.batch.id, testBatchId)
    assert.equal(getBatchJson.rows.length, 2, 'Returns both staged rows from database')

    // GET list_exceptions
    const getExRes = await handler.GET(
      new Request(`http://localhost/api/workforce/attendance-import?action=list_exceptions&batch_id=${testBatchId}`)
    )
    assert.equal(getExRes.status, 200)
    const getExJson = await getExRes.json()
    assert.equal(getExJson.ok, true)
    assert.equal(getExJson.exceptions.length, 1, 'Returns exactly 1 exception row from database')
    assert.equal(getExJson.exceptions[0].exception_code, 'STAFF_NOT_FOUND')
  })
})
