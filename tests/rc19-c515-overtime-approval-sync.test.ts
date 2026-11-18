import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkforceActualHandler } from '../lib/server/workforceActualHandler.ts'
import {
  autoCalculatePeriodLines,
  type ApprovedPayrollRate,
} from '../lib/workforce/payrollCalculation.ts'

const admin = async () => ({
  id: 'auth-admin',
  businessUserId: 'business-admin',
  systemPermission: 'admin' as const,
})

const REQ_ID_1 = 'a0000000-0000-4000-8000-000000000001'
const REQ_ID_2 = 'a0000000-0000-4000-8000-000000000002'
const REQ_ID_LOCKED = 'a0000000-0000-4000-8000-000000000003'

test('P1 Overtime sync: decide_overtime admin_confirm immediately updates existing draft payroll line', async () => {
  const updates: Array<{ table: string; values: Record<string, unknown>; filters: Array<{ field: string; value: unknown }> }> = []

  const mockLine = {
    id: 'line-ot-1',
    period_id: 'period-draft-1',
    segment_id: 'seg-ot-1',
    version: 3,
    actual_seconds: 7200,
    payable_seconds: 7200,
    actual_minutes: 120,
    payable_minutes: 120,
    rate_card_id: 'rate-card-default',
    rate_vnd_per_hour: 100000,
    overtime_multiplier_basis_points: 15000,
    period: { status: 'draft' },
  }

  const dbClient = {
    from(table: string) {
      const filters: Array<{ field: string; value: unknown }> = []
      let updateValues: Record<string, unknown> | null = null

      const builder = {
        select() {
          return builder
        },
        eq(field: string, value: unknown) {
          filters.push({ field, value })
          return builder
        },
        is(field: string, value: unknown) {
          filters.push({ field, value })
          return builder
        },
        update(values: Record<string, unknown>) {
          updateValues = values
          return builder
        },
        async maybeSingle() {
          if (table === 'workforce_payroll_lines') {
            return { data: mockLine, error: null }
          }
          return { data: null, error: null }
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (updateValues) {
            updates.push({ table, values: updateValues, filters: [...filters] })
          }
          return Promise.resolve({ data: mockLine, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }

  const confirmedOtRecord = {
    id: REQ_ID_1,
    segment_id: 'seg-ot-1',
    state: 'admin_confirmed',
    overtime_seconds: 1800,
    day_class: 'weekday' as const,
    time_class: 'night' as const,
    rate_card_id: 'rate-card-ot-custom',
    multiplier_basis_points: 20000,
  }

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: () => dbClient as never,
    resolveUser: admin,
    createScopeClient: () => ({
      rpc: async (name: string) => {
        if (name === 'rc19_c515_decide_overtime_request') {
          return { data: confirmedOtRecord, error: null }
        }
        return { data: null, error: { message: 'UNEXPECTED_RPC' } }
      },
    }) as never,
  })

  const response = await handler.POST(
    new Request('https://ops.example/api/workforce/actual', {
      method: 'POST',
      body: JSON.stringify({
        action: 'decide_overtime',
        request_id: REQ_ID_1,
        expected_version: 1,
        decision: 'admin_confirm',
        reason: 'Confirmed by Admin for late shift finish',
        idempotency_key: '10000000-0000-4000-8000-000000000021',
      }),
    })
  )

  assert.equal(response.status, 200)
  assert.equal(updates.length, 1, 'Draft payroll line must be updated on Admin overtime confirmation')

  const lineUpdate = updates[0]
  assert.equal(lineUpdate.table, 'workforce_payroll_lines')
  assert.equal(lineUpdate.values.overtime_seconds, 1800)
  assert.equal(lineUpdate.values.overtime_minutes, 30)
  assert.equal(lineUpdate.values.overtime_request_id, REQ_ID_1)
  assert.equal(lineUpdate.values.overtime_day_class, 'weekday')
  assert.equal(lineUpdate.values.overtime_time_class, 'night')
  assert.equal(lineUpdate.values.overtime_multiplier_basis_points, 20000)
  assert.equal(lineUpdate.values.rate_card_id, 'rate-card-ot-custom')
  assert.equal(lineUpdate.values.version, 4, 'Version must be incremented from 3 to 4')
})

test('P1 Overtime sync: decide_overtime rejected resets overtime fields on existing draft payroll line', async () => {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []

  const mockLineWithOt = {
    id: 'line-ot-2',
    period_id: 'period-draft-1',
    segment_id: 'seg-ot-2',
    overtime_request_id: REQ_ID_2,
    version: 2,
    period: { status: 'draft' },
  }

  const dbClient = {
    from(table: string) {
      let updateValues: Record<string, unknown> | null = null
      const builder = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        is() {
          return builder
        },
        update(values: Record<string, unknown>) {
          updateValues = values
          return builder
        },
        async maybeSingle() {
          if (table === 'workforce_payroll_lines') {
            return { data: mockLineWithOt, error: null }
          }
          return { data: null, error: null }
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (updateValues) {
            updates.push({ table, values: updateValues })
          }
          return Promise.resolve({ data: mockLineWithOt, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }

  const rejectedOtRecord = {
    id: REQ_ID_2,
    segment_id: 'seg-ot-2',
    state: 'rejected',
  }

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: () => dbClient as never,
    resolveUser: admin,
    createScopeClient: () => ({
      rpc: async (name: string) => {
        if (name === 'rc19_c515_decide_overtime_request') {
          return { data: rejectedOtRecord, error: null }
        }
        return { data: null, error: { message: 'UNEXPECTED_RPC' } }
      },
    }) as never,
  })

  const response = await handler.POST(
    new Request('https://ops.example/api/workforce/actual', {
      method: 'POST',
      body: JSON.stringify({
        action: 'decide_overtime',
        request_id: REQ_ID_2,
        expected_version: 1,
        decision: 'reject',
        reason: 'Overtime rejected due to lack of evidence',
        idempotency_key: '10000000-0000-4000-8000-000000000022',
      }),
    })
  )

  assert.equal(response.status, 200)
  assert.equal(updates.length, 1)
  assert.equal(updates[0].values.overtime_seconds, 0)
  assert.equal(updates[0].values.overtime_minutes, 0)
  assert.equal(updates[0].values.overtime_request_id, null)
  assert.equal(updates[0].values.overtime_day_class, null)
  assert.equal(updates[0].values.overtime_time_class, null)
  assert.equal(updates[0].values.version, 3)
})

test('P1 Overtime sync: decide_overtime admin_confirm NEVER mutates locked payroll period', async () => {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []

  const mockLockedLine = {
    id: 'line-locked-1',
    period_id: 'period-locked-1',
    segment_id: 'seg-locked-1',
    version: 5,
    period: { status: 'locked' }, // Locked period
  }

  const dbClient = {
    from(table: string) {
      let updateValues: Record<string, unknown> | null = null
      const builder = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        is() {
          return builder
        },
        update(values: Record<string, unknown>) {
          updateValues = values
          return builder
        },
        async maybeSingle() {
          return { data: mockLockedLine, error: null }
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          if (updateValues) {
            updates.push({ table, values: updateValues })
          }
          return Promise.resolve({ data: mockLockedLine, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }

  const confirmedOtRecord = {
    id: REQ_ID_LOCKED,
    segment_id: 'seg-locked-1',
    state: 'admin_confirmed',
    overtime_seconds: 3600,
    day_class: 'weekday' as const,
    time_class: 'day' as const,
    rate_card_id: null,
    multiplier_basis_points: 15000,
  }

  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: () => dbClient as never,
    resolveUser: admin,
    createScopeClient: () => ({
      rpc: async () => ({ data: confirmedOtRecord, error: null }),
    }) as never,
  })

  const response = await handler.POST(
    new Request('https://ops.example/api/workforce/actual', {
      method: 'POST',
      body: JSON.stringify({
        action: 'decide_overtime',
        request_id: REQ_ID_LOCKED,
        expected_version: 1,
        decision: 'admin_confirm',
        reason: 'Confirmed by Admin',
        idempotency_key: '10000000-0000-4000-8000-000000000023',
      }),
    })
  )

  assert.equal(response.status, 200)
  assert.equal(updates.length, 0, 'Locked period lines must NEVER be updated by overtime confirmation')
})

test('P1 Overtime calculation: autoCalculatePeriodLines correctly accounts for approved overtime before preparation', () => {
  const period = { periodStart: '2026-11-01', periodEnd: '2026-11-30' }
  const rates: ApprovedPayrollRate[] = [
    {
      id: 'rate-1',
      staffId: null,
      role: 'host',
      effectiveFrom: '2026-11-01',
      effectiveThrough: null,
      vndPerHour: 120_000,
      overtimeMultiplierBasisPoints: 15_000, // 1.5x
      approvedBy: 'admin-1',
    },
  ]

  // Segment with 2 hours worked (120 mins) + 30 mins (1800 secs) approved overtime
  const segments = [
    {
      segment: {
        id: 'seg-calc-1',
        shiftId: 'shift-1',
        staffId: 'staff-calc-1',
        role: 'host' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'approved' as const,
        startAt: '2026-11-15T10:00:00+07:00',
        endAt: '2026-11-15T12:00:00+07:00',
      },
      shiftDate: '2026-11-15',
      payrollEvidenceCompleteness: 'verified_complete' as const,
    },
  ]

  const approvedOtMap = new Map([
    [
      'seg-calc-1',
      {
        id: REQ_ID_1,
        overtimeSeconds: 1800,
        dayClass: 'weekday' as const,
        timeClass: 'day' as const,
        multiplierBasisPoints: 15000,
      },
    ],
  ])

  const result = autoCalculatePeriodLines({
    period,
    segments,
    rates,
    approvedOvertimeBySegment: approvedOtMap,
  })

  assert.equal(result.preparedLines.length, 1)
  const line = result.preparedLines[0]
  assert.equal(line.actualMinutes, 120)
  assert.equal(line.payableMinutes, 120)
  assert.equal(line.overtimeMinutes, 30)
  // Regular: (120 - 30) = 90 mins = 1.5h * 120,000 = 180,000
  // Overtime: 30 mins = 0.5h * 120,000 * 1.5 = 90,000
  // Gross: 180,000 + 90,000 = 270,000
  assert.equal(line.grossVnd, 270_000)
  assert.equal(line.netVnd, 270_000)
})
