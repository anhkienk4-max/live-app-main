import test from 'node:test'
import assert from 'node:assert/strict'
import { createMyPayslipHandler } from '../lib/server/myPayslipHandler.ts'

const person = (id: string) => async () => ({
  id: 'auth-' + id,
  businessUserId: id,
  systemPermission: 'member' as const,
})

const lockedPeriod = {
  id: 'period-comp-1',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  status: 'locked',
  locked_at: '2026-11-05T10:00:00Z',
  revision: 1,
}

type DBName =
  | 'workforce_payroll_periods'
  | 'workforce_payroll_lines'
  | 'workforce_actual_segments'
  | 'shifts'
  | 'workforce_payroll_adjustments'
  | 'workforce_cancellation_compensation_cases'

function fakeDb(options: {
  periods?: object[]
  lines?: object[]
  actuals?: object[]
  shifts?: object[]
  adjustments?: object[]
  cases?: object[]
  errors?: string[]
  ignoreStaffScope?: boolean
} = {}) {
  const calls: Array<{ table: string; method: string; field?: string; value?: unknown }> = []
  const pools: Record<DBName, object[]> = {
    workforce_payroll_periods: options.periods ?? [lockedPeriod],
    workforce_payroll_lines: options.lines ?? [],
    workforce_actual_segments: options.actuals ?? [],
    shifts: options.shifts ?? [],
    workforce_payroll_adjustments: options.adjustments ?? [],
    workforce_cancellation_compensation_cases: options.cases ?? [],
  }
  const client = () => ({
    from(table: string) {
      let rows = [...(pools[table as DBName] ?? [])]
      const filters: Array<{ field: string; value: unknown }> = []
      const builder = {
        select() {
          return builder
        },
        eq(field: string, value: unknown) {
          calls.push({ table, method: 'eq', field, value })
          filters.push({ field, value })
          return builder
        },
        in(field: string, values: unknown[]) {
          calls.push({ table, method: 'in', field, value: values })
          rows = rows.filter((r) => values.includes((r as Record<string, unknown>)[field]))
          return builder
        },
        is(field: string, value: unknown) {
          calls.push({ table, method: 'is', field, value })
          filters.push({ field, value })
          return builder
        },
        gte(field: string, value: string) {
          rows = rows.filter((r) => String((r as Record<string, unknown>)[field]) >= value)
          return builder
        },
        lte(field: string, value: string) {
          rows = rows.filter((r) => String((r as Record<string, unknown>)[field]) <= value)
          return builder
        },
        order() {
          return builder
        },
        limit(n: number) {
          calls.push({ table, method: 'limit', value: n })
          rows = rows.slice(0, n)
          return builder
        },
        then(resolve: (x: unknown) => unknown, reject?: (e: unknown) => unknown) {
          for (const f of filters) {
            if (f.field === 'staff_id' && options.ignoreStaffScope) continue
            rows = rows.filter((r) => (r as Record<string, unknown>)[f.field] === f.value)
          }
          const error = options.errors?.includes(table) ? { message: 'unavailable' } : null
          return Promise.resolve({ data: rows, error }).then(resolve, reject)
        },
      }
      return builder
    },
  })
  return { client, calls }
}

const request = (query = '') => new Request('https://ops.example/api/workforce/my-payslip' + query)

test('P2: member with zero worked shifts and only cancellation compensation receives valid payslip', async () => {
  const adjustment = {
    id: 'adj-comp-1',
    period_id: 'period-comp-1',
    compensation_case_id: 'case-comp-1',
    staff_id: 'member-comp-only',
    operational_role: 'host',
    amount_vnd: 150000,
    reason: 'Emergency shift cancellation support',
    confirmed_by: 'admin-1',
    created_at: '2026-10-25T12:00:00Z',
  }
  const compCase = {
    id: 'case-comp-1',
    period_id: 'period-comp-1',
    shift_id: 'shift-cancelled-99',
    staff_id: 'member-comp-only',
    operational_role: 'host',
    proposed_amount_vnd: 150000,
    admin_confirmed_by: 'admin-1',
    state: 'admin_confirmed',
    reason: 'Emergency shift cancellation support',
  }

  const db = fakeDb({
    lines: [], // Zero worked shifts
    actuals: [],
    adjustments: [adjustment],
    cases: [compCase],
  })

  const handler = createMyPayslipHandler({
    createClient: db.client as never,
    resolveUser: person('member-comp-only'),
    isEnabled: () => true,
  })

  const response = await handler.GET(request('?year=2026'))
  assert.equal(response.status, 200)

  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.scope, 'own_locked_only')
  assert.equal(body.statements.length, 1, 'Statement must NOT disappear when lines is empty')

  const statement = body.statements[0]
  assert.equal(statement.period_id, 'period-comp-1')
  assert.equal(statement.lines.length, 0)
  assert.equal(statement.compensation_adjustments.length, 1)
  assert.equal(statement.compensation_adjustments[0].amount_vnd, 150000)
  assert.equal(statement.compensation_adjustments[0].shift_id, 'shift-cancelled-99')
  assert.equal(statement.total_net_vnd, 150000)
})

test('P2: multi-tenant boundary: member B cannot see member A compensation-only payslip', async () => {
  const adjustment = {
    id: 'adj-comp-1',
    period_id: 'period-comp-1',
    compensation_case_id: 'case-comp-1',
    staff_id: 'member-comp-A',
    operational_role: 'host',
    amount_vnd: 150000,
    reason: 'Emergency shift cancellation support',
    confirmed_by: 'admin-1',
    created_at: '2026-10-25T12:00:00Z',
  }
  const compCase = {
    id: 'case-comp-1',
    period_id: 'period-comp-1',
    shift_id: 'shift-cancelled-99',
    staff_id: 'member-comp-A',
    operational_role: 'host',
    proposed_amount_vnd: 150000,
    admin_confirmed_by: 'admin-1',
    state: 'admin_confirmed',
    reason: 'Emergency shift cancellation support',
  }

  const db = fakeDb({
    lines: [],
    actuals: [],
    adjustments: [adjustment],
    cases: [compCase],
  })

  // Member B querying their own payslip
  const handler = createMyPayslipHandler({
    createClient: db.client as never,
    resolveUser: person('member-comp-B'),
    isEnabled: () => true,
  })

  const response = await handler.GET(request('?year=2026'))
  assert.equal(response.status, 200)

  const body = await response.json()
  assert.equal(body.statements.length, 0, 'Member B must receive zero statements for Member A compensation')
})

test('P2: member with zero worked shifts and zero adjustments returns empty statements', async () => {
  const db = fakeDb({
    lines: [],
    actuals: [],
    adjustments: [],
    cases: [],
  })

  const handler = createMyPayslipHandler({
    createClient: db.client as never,
    resolveUser: person('member-empty'),
    isEnabled: () => true,
  })

  const response = await handler.GET(request('?year=2026'))
  assert.equal(response.status, 200)

  const body = await response.json()
  assert.equal(body.statements.length, 0)
})
