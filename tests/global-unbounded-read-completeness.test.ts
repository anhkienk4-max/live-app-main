import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseReportRepository } from '../lib/services/supabaseReportService.ts'
import { createSupabaseShiftRegistrationRepository } from '../lib/services/supabaseShiftRegistrationService.ts'
import { createSupabaseShiftRepository } from '../lib/services/supabaseShiftService.ts'

/**
 * Regression for silent truncation of list reads.
 *
 * PostgREST caps every response at `max-rows` (1000 by default). A list read that
 * does not page therefore returns only the first 1000 rows with no error. The fake
 * below applies that cap to EVERY query, ranged or not, so an un-paged read fails on
 * row count instead of passing by accident.
 */
const POSTGREST_MAX_ROWS = 1000

type Row = Record<string, unknown>
type TableName = 'shifts' | 'shift_registrations' | 'reports'

class CappedQuery {
  private readonly filters: Array<(row: Row) => boolean> = []
  private readonly orderBy: Array<{ column: string; ascending: boolean }> = []
  private page: { from: number; to: number } | undefined

  constructor(
    private readonly database: Record<TableName, Row[]>,
    private readonly table: TableName,
    private readonly control: { calls: number; failOnCall?: number },
  ) {}

  select() { return this }

  is(column: string, value: null) {
    this.filters.push(row => (row[column] ?? null) === value)
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false })
    return this
  }

  range(from: number, to: number) {
    this.page = { from, to }
    return this
  }

  then<TResult1 = { data: Row[] | null; error: Row | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: Row | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute() {
    this.control.calls += 1
    if (this.control.failOnCall === this.control.calls) {
      return { data: null, error: { code: 'TEST_PAGE_FAILED', message: 'page failed' } }
    }
    const ordered = this.database[this.table]
      .filter(row => this.filters.every(filter => filter(row)))
      .sort((left, right) => {
        for (const { column, ascending } of this.orderBy) {
          const comparison = String(left[column] ?? '').localeCompare(String(right[column] ?? ''))
          if (comparison !== 0) return ascending ? comparison : -comparison
        }
        return 0
      })
    const from = this.page?.from ?? 0
    const requested = this.page ? this.page.to - this.page.from + 1 : Number.POSITIVE_INFINITY
    return { data: ordered.slice(from, from + Math.min(requested, POSTGREST_MAX_ROWS)), error: null }
  }
}

function fakeClient(database: Record<TableName, Row[]>, options: { failOnCall?: number } = {}) {
  const control = { calls: 0, failOnCall: options.failOnCall }
  return {
    control,
    rpc() { return { single: async () => ({ data: null, error: null }) } },
    from(table: TableName) { return new CappedQuery(database, table, control) },
  } as unknown as SupabaseClient & { control: { calls: number } }
}

const pad = (index: number) => String(index).padStart(5, '0')

function shiftRow(index: number, overrides: Row = {}): Row {
  const id = `shift-${pad(index)}`
  return {
    id,
    date: '2031-08-14',
    start_time: '09:00:00',
    end_time: '11:00:00',
    timezone: 'Asia/Ho_Chi_Minh',
    start_at: '2031-08-14T02:00:00.000Z',
    end_at: '2031-08-14T04:00:00.000Z',
    end_date: '2031-08-14',
    crosses_midnight: false,
    duration_minutes: 120,
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    campaign_id: null,
    title: id,
    studio: null,
    host_id: null,
    support_id: null,
    technical_id: null,
    host_names: [],
    assistant_names: [],
    technical_names: [],
    required_host_count: 1,
    required_support_count: 0,
    required_technical_count: 0,
    registration_locked: false,
    registration_cutoff_at: '2031-08-13T20:00:00.000Z',
    allow_multi_role: false,
    import_batch_id: null,
    status: 'scheduled',
    live_link: null,
    product_notes: null,
    updated_by: null,
    created_at: '2031-08-14T00:00:00.000Z',
    updated_at: '2031-08-14T00:00:00.000Z',
    version: 1,
    deleted_at: null,
    deleted_by: null,
    archived_at: null,
    archived_by: null,
    deletion_reason: null,
    ...overrides,
  }
}

function registrationRow(index: number): Row {
  return {
    id: `registration-${pad(index)}`,
    shift_id: `shift-${pad(index)}`,
    user_id: 'user-1',
    operational_role: 'host',
    status: 'pending',
    source: 'self_registration',
    requested_at: `2031-08-14T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    cancelled_at: null,
    imported_name: null,
    match_method: null,
    created_at: '2031-08-14T00:00:00.000Z',
    updated_at: '2031-08-14T00:00:00.000Z',
    version: 1,
  }
}

function reportRow(index: number, overrides: Row = {}): Row {
  return {
    id: `report-${pad(index)}`,
    shift_id: `shift-${pad(index)}`,
    status: 'draft',
    metrics_confirmed: false,
    revenue: 0,
    orders: 0,
    peak_viewer: 0,
    average_viewer: 0,
    comments: 0,
    shares: 0,
    dashboard_platform: 'tiktok',
    created_at: '2031-08-14T00:00:00.000Z',
    updated_at: `2031-08-14T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    deleted_at: null,
    archived_at: null,
    ...overrides,
  }
}

const empty = (): Record<TableName, Row[]> => ({ shifts: [], shift_registrations: [], reports: [] })

// 906 is the Production shift count at the time of the audit; 1000/1001 are the cap boundary.
for (const count of [906, 999, 1000, 1001, 2501]) {
  test(`shift getAll returns all ${count} shifts including the newest, with no duplicates`, async () => {
    const database = { ...empty(), shifts: Array.from({ length: count }, (_, index) => shiftRow(index)) }
    const shifts = await createSupabaseShiftRepository(fakeClient(database)).getAll()
    assert.equal(shifts.length, count)
    assert.equal(new Set(shifts.map(shift => shift.id)).size, count)
    assert.ok(shifts.some(shift => shift.id === `shift-${pad(count - 1)}`), 'newest shift must not be dropped')
  })

  test(`report getAll returns all ${count} reports`, async () => {
    const database = { ...empty(), reports: Array.from({ length: count }, (_, index) => reportRow(index)) }
    const reports = await createSupabaseReportRepository(fakeClient(database)).getAll()
    assert.equal(reports.length, count)
    assert.equal(new Set(reports.map(report => report.id)).size, count)
  })

  test(`registration getAll returns all ${count} registrations including the newest`, async () => {
    const database = { ...empty(), shift_registrations: Array.from({ length: count }, (_, index) => registrationRow(index)) }
    const registrations = await createSupabaseShiftRegistrationRepository(fakeClient(database)).getAll()
    assert.equal(registrations.length, count)
    assert.equal(new Set(registrations.map(registration => registration.id)).size, count)
  })
}

test('shift getAll applies the same scope as getAllComplete and getAll(true) pages deleted rows too', async () => {
  const live = Array.from({ length: 1200 }, (_, index) => shiftRow(index))
  const removed = Array.from({ length: 300 }, (_, index) => shiftRow(5000 + index, { deleted_at: '2031-08-15T00:00:00.000Z' }))
  const archived = shiftRow(9000, { archived_at: '2031-08-15T00:00:00.000Z' })
  const repository = createSupabaseShiftRepository(fakeClient({ ...empty(), shifts: [...live, ...removed, archived] }))
  assert.equal((await repository.getAll()).length, 1200)
  assert.equal((await repository.getAllComplete!()).length, 1200)
  assert.equal((await repository.getAll(true)).length, 1501)
})

test('shift getAll keeps a deterministic order for rows that tie on date and start time', async () => {
  const database = { ...empty(), shifts: Array.from({ length: 1500 }, (_, index) => shiftRow(index)) }
  const shifts = await createSupabaseShiftRepository(fakeClient(database)).getAll()
  assert.deepEqual(shifts.map(shift => shift.id), shifts.map(shift => shift.id).sort())
})

test('report getConfirmed and getAllIncludingArchived page past the row cap with correct scope', async () => {
  const confirmed = Array.from({ length: 1100 }, (_, index) => reportRow(index, { status: 'confirmed', metrics_confirmed: true }))
  const drafts = Array.from({ length: 200 }, (_, index) => reportRow(3000 + index))
  const archived = Array.from({ length: 50 }, (_, index) => reportRow(6000 + index, { archived_at: '2031-08-15T00:00:00.000Z' }))
  const repository = createSupabaseReportRepository(fakeClient({ ...empty(), reports: [...confirmed, ...drafts, ...archived] }))
  assert.equal((await repository.getConfirmed()).length, 1100)
  assert.equal((await repository.getAll()).length, 1300)
  assert.equal((await repository.getAllIncludingArchived()).length, 1350)
})

test('list reads fail instead of returning a partial list when a later page errors', async () => {
  const database = {
    shifts: Array.from({ length: 2500 }, (_, index) => shiftRow(index)),
    shift_registrations: Array.from({ length: 2500 }, (_, index) => registrationRow(index)),
    reports: Array.from({ length: 2500 }, (_, index) => reportRow(index)),
  }
  await assert.rejects(createSupabaseShiftRepository(fakeClient(database, { failOnCall: 2 })).getAll(), /page failed/)
  await assert.rejects(createSupabaseReportRepository(fakeClient(database, { failOnCall: 2 })).getAll(), /page failed/)
  await assert.rejects(createSupabaseShiftRegistrationRepository(fakeClient(database, { failOnCall: 2 })).getAll(), /page failed/)
})
