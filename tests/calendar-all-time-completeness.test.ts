import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseReportRepository } from '../lib/services/supabaseReportService.ts'
import { createSupabaseShiftRegistrationRepository } from '../lib/services/supabaseShiftRegistrationService.ts'
import { createSupabaseShiftRepository } from '../lib/services/supabaseShiftService.ts'

type Row = Record<string, unknown>
type TableName = 'shifts' | 'shift_registrations' | 'reports'

interface FakeClientOptions {
  failOnRangeCall?: number
}

class FakeQuery {
  private readonly filters: Array<(row: Row) => boolean> = []
  private readonly orderBy: Array<{ column: string; ascending: boolean }> = []
  private inFilter: { column: string; values: Set<string> } | undefined
  private page: { from: number; to: number } | undefined

  constructor(
    private readonly database: Record<TableName, Row[]>,
    private readonly table: TableName,
    private readonly options: FakeClientOptions & { rangeCalls: number[] },
  ) {}

  select() { return this }

  is(column: string, value: null) {
    this.filters.push(row => (row[column] ?? null) === value)
    return this
  }

  in(column: string, values: string[]) {
    this.inFilter = { column, values: new Set(values) }
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
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute() {
    if (!this.page) throw new Error('Test query must use range pagination.')
    this.options.rangeCalls.push(this.page.from)
    if (this.options.failOnRangeCall === this.options.rangeCalls.length) {
      return { data: null, error: { code: 'TEST_PAGE_FAILED', message: 'page failed' } }
    }

    const filtered = this.database[this.table]
      .filter(row => this.filters.every(filter => filter(row)))
      .filter(row => !this.inFilter || this.inFilter.values.has(String(row[this.inFilter.column])))
    const ordered = [...filtered].sort((left, right) => {
      for (const { column, ascending } of this.orderBy) {
        const comparison = String(left[column] ?? '').localeCompare(String(right[column] ?? ''))
        if (comparison !== 0) return ascending ? comparison : -comparison
      }
      return 0
    })
    return {
      data: ordered.slice(this.page.from, this.page.to + 1),
      error: null,
    }
  }
}

function fakeClient(
  database: Record<TableName, Row[]>,
  options: FakeClientOptions = {},
) {
  const rangeCalls: number[] = []
  const rpcCalls: string[] = []
  return {
    rpc: (_name: string, _args: unknown) => ({ single: async () => ({ data: null, error: null }) }),
    rangeCalls,
    rpcCalls,
    rpc(functionName: string) {
      rpcCalls.push(functionName)
      return { single: async () => ({ data: null, error: null }) }
    },
    from(table: TableName) {
      return new FakeQuery(database, table, { ...options, rangeCalls })
    },
  } as unknown as SupabaseClient & { rangeCalls: number[]; rpcCalls: string[] }
}

function shiftRow(index: number): Row {
  const id = `shift-${String(index).padStart(5, '0')}`
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
  }
}

function registrationRow(index: number): Row {
  const shiftId = `shift-${String(index).padStart(5, '0')}`
  return {
    id: `registration-${String(index).padStart(5, '0')}`,
    shift_id: shiftId,
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

function reportRow(index: number): Row {
  const shiftId = `shift-${String(index).padStart(5, '0')}`
  return {
    id: `report-${String(index).padStart(5, '0')}`,
    shift_id: shiftId,
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
  }
}

function database(count: number) {
  return {
    shifts: Array.from({ length: count }, (_, index) => shiftRow(index)),
    shift_registrations: Array.from({ length: count }, (_, index) => registrationRow(index)),
    reports: Array.from({ length: count }, (_, index) => reportRow(index)),
  }
}

for (const [count, expectedPages] of [[999, 1], [1000, 2], [1001, 2], [2001, 3]] as const) {
  test(`complete All Time shift read handles ${count} rows`, async () => {
    const client = fakeClient(database(count))
    const shifts = await createSupabaseShiftRepository(client).getAllComplete!()
    assert.equal(shifts.length, count)
    assert.equal(new Set(shifts.map(shift => shift.id)).size, count)
    assert.equal(client.rangeCalls.length, expectedPages)
    assert.deepEqual(client.rpcCalls, ['refresh_automatic_shift_statuses'])
  })
}

test('complete All Time shift read fails instead of returning partial pages', async () => {
  const client = fakeClient(database(2001), { failOnRangeCall: 2 })
  await assert.rejects(
    createSupabaseShiftRepository(client).getAllComplete!(),
    /page failed/,
  )
  assert.deepEqual(client.rpcCalls, ['refresh_automatic_shift_statuses'])
})

test('All Time registration reads complete bounded shift-ID batches without duplicates', async () => {
  const count = 1201
  const client = fakeClient(database(count))
  const ids = Array.from({ length: count }, (_, index) => `shift-${String(index).padStart(5, '0')}`)
  const registrations = await createSupabaseShiftRegistrationRepository(client).getForShifts!(ids.concat(ids.slice(0, 10)))
  assert.equal(registrations.length, count)
  assert.equal(new Set(registrations.map(registration => registration.id)).size, count)
  assert.ok(client.rangeCalls.length > 12)
})

test('All Time report reads complete bounded shift-ID batches without duplicates', async () => {
  const count = 1201
  const client = fakeClient(database(count))
  const ids = Array.from({ length: count }, (_, index) => `shift-${String(index).padStart(5, '0')}`)
  const reports = await createSupabaseReportRepository(client).getForShifts!(ids.concat(ids.slice(0, 10)))
  assert.equal(reports.length, count)
  assert.equal(new Set(reports.map(report => report.id)).size, count)
  assert.ok(client.rangeCalls.length > 12)
})

test('Calendar uses complete history only for explicit All Time and guards late responses', () => {
  const source = readFileSync('components/features/calendar/CalendarView.tsx', 'utf8')
  assert.match(source, /dataScope\.allTime\s*\n\s*\? shiftService\.getAllComplete\(\)/)
  assert.match(source, /shiftRegistrationService\.getForShifts\(shiftIds\)/)
  assert.match(source, /reportService\.getForShifts\(shiftIds\)/)
  assert.match(source, /if \(version !== requestVersion\.current\) return/)
  assert.doesNotMatch(source, /dataScope\.allTime[\s\S]{0,180}shiftRegistrationService\.getAll\(\)/)
})
