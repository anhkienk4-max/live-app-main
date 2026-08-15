import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  currentUserService,
  shiftRegistrationService,
  shiftService,
} from '../lib/services/dataService.ts'
import {
  createSupabaseShiftRegistrationRepository,
  setSupabaseShiftRegistrationRepositoryForTests,
} from '../lib/services/supabaseShiftRegistrationService.ts'
import { createSupabaseShiftRepository, setSupabaseShiftRepositoryForTests } from '../lib/services/supabaseShiftService.ts'
import type { ShiftRegistration, User } from '../lib/types/database.types.ts'

type Row = Record<string, unknown>
type TableName = 'shifts' | 'shift_registrations'
type RpcName =
  | 'register_for_shift'
  | 'cancel_own_shift_registration'
  | 'approve_shift_registration'
  | 'reject_shift_registration'
  | 'manual_assign_shift_staff'
  | 'remove_shift_staffing'

interface FakeDatabase {
  shifts: Row[]
  shift_registrations: Row[]
}

interface FakeClientOptions {
  deniedTable?: TableName
}

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = []
  private orderBy: Array<{ column: string; ascending: boolean }> = []

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: TableName,
    private readonly options: FakeClientOptions,
  ) {}

  select(_columns?: string) {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value)
    return this
  }

  is(column: string, value: null) {
    this.filters.push(row => (row[column] ?? null) === value)
    return this
  }

  in(column: string, values: unknown[]) {
    this.filters.push(row => values.includes(row[column]))
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false })
    return this
  }

  maybeSingle() {
    return this.execute(true)
  }

  single() {
    return this.execute(true)
  }

  then<TResult1 = { data: Row[] | null; error: Row | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: Row | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute(false).then(onfulfilled, onrejected)
  }

  private async execute(single: boolean) {
    if (this.options.deniedTable === this.table) {
      return {
        data: null,
        error: { code: '42501', message: `permission denied for table ${this.table}` },
      }
    }
    const rows = this.database[this.table] ?? []
    const matching = rows.filter(row => this.filters.every(filter => filter(row)))
    const ordered = matching.map(row => ({ ...row }))
    for (const { column, ascending } of this.orderBy) {
      ordered.sort((left, right) =>
        String(left[column] ?? '').localeCompare(String(right[column] ?? '')) * (ascending ? 1 : -1))
    }
    return { data: single ? ordered[0] ?? null : ordered, error: null }
  }
}

function fakeClient(database: FakeDatabase, options: FakeClientOptions = {}) {
  const rpcHandlers: Record<RpcName, (args: Record<string, unknown>) => Row> = {
    register_for_shift(args) {
      const now = '2031-08-20T01:00:00.000Z'
      const row: Row = {
        id: 'reg-reg-001',
        shift_id: String(args.p_shift_id),
        user_id: 'current-user',
        operational_role: String(args.p_role),
        status: 'pending',
        source: 'self_registration',
        requested_at: now,
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        cancelled_at: null,
        created_at: now,
        updated_at: now,
      }
      database.shift_registrations.push({ ...row })
      return { ...row }
    },
    cancel_own_shift_registration(args) {
      const id = String(args.p_registration_id)
      const index = database.shift_registrations.findIndex(row => row.id === id)
      if (index === -1) throw { code: 'P0001', message: 'REGISTRATION_NOT_FOUND' }
      const updated = {
        ...database.shift_registrations[index],
        status: 'cancelled',
        cancelled_at: '2031-08-20T02:00:00.000Z',
        updated_at: '2031-08-20T02:00:00.000Z',
      }
      database.shift_registrations[index] = updated
      return { ...updated }
    },
    approve_shift_registration(args) {
      const id = String(args.p_registration_id)
      const index = database.shift_registrations.findIndex(row => row.id === id)
      if (index === -1) throw { code: 'P0001', message: 'REGISTRATION_NOT_FOUND' }
      if (database.shift_registrations[index].status !== 'pending') {
        throw { code: 'P0001', message: 'INVALID_REGISTRATION_TRANSITION' }
      }
      const updated = {
        ...database.shift_registrations[index],
        status: 'approved',
        reviewed_by: 'current-user',
        reviewed_at: '2031-08-20T03:00:00.000Z',
        updated_at: '2031-08-20T03:00:00.000Z',
      }
      database.shift_registrations[index] = updated
      return { ...updated }
    },
    reject_shift_registration(args) {
      const id = String(args.p_registration_id)
      const index = database.shift_registrations.findIndex(row => row.id === id)
      if (index === -1) throw { code: 'P0001', message: 'REGISTRATION_NOT_FOUND' }
      if (database.shift_registrations[index].status !== 'pending') {
        throw { code: 'P0001', message: 'INVALID_REGISTRATION_TRANSITION' }
      }
      const updated = {
        ...database.shift_registrations[index],
        status: 'rejected',
        reviewed_by: 'current-user',
        reviewed_at: '2031-08-20T03:00:00.000Z',
        updated_at: '2031-08-20T03:00:00.000Z',
      }
      database.shift_registrations[index] = updated
      return { ...updated }
    },
    manual_assign_shift_staff(args) {
      const now = '2031-08-20T04:00:00.000Z'
      const row: Row = {
        id: 'reg-man-001',
        shift_id: String(args.p_shift_id),
        user_id: String(args.p_user_id),
        operational_role: String(args.p_role),
        status: 'manually_assigned',
        source: 'manual_assignment',
        requested_at: now,
        reviewed_by: 'current-user',
        reviewed_at: now,
        review_notes: args.p_notes ?? null,
        cancelled_at: null,
        created_at: now,
        updated_at: now,
      }
      database.shift_registrations.push({ ...row })
      return { ...row }
    },
    remove_shift_staffing(args) {
      const id = String(args.p_registration_id)
      const index = database.shift_registrations.findIndex(row => row.id === id)
      if (index === -1) throw { code: 'P0001', message: 'REGISTRATION_NOT_FOUND' }
      const updated = {
        ...database.shift_registrations[index],
        status: 'removed',
        reviewed_by: 'current-user',
        reviewed_at: '2031-08-20T05:00:00.000Z',
        cancelled_at: '2031-08-20T05:00:00.000Z',
        updated_at: '2031-08-20T05:00:00.000Z',
      }
      database.shift_registrations[index] = updated
      return { ...updated }
    },
  }

  return {
    from(table: TableName) {
      if (table === 'shifts' || table === 'shift_registrations') {
        return new FakeQuery(database, table, options)
      }
      throw new Error(`Unexpected table ${table}`)
    },
    rpc(name: string, args: Record<string, unknown>) {
      const handler = rpcHandlers[name as RpcName]
      if (!handler) return { data: null, error: { code: 'P0001', message: `unknown rpc ${name}` } }
      try {
        const row = handler(args)
        const result = { data: row, error: null }
        const resolved = () => Promise.resolve(result)
        resolved.single = () => Promise.resolve(result)
        return resolved as unknown as ReturnType<SupabaseClient['rpc']>
      } catch (error) {
        const rejected = { data: null, error: error as Record<string, unknown> }
        const failed = () => Promise.resolve(rejected)
        failed.single = () => Promise.resolve(rejected)
        return failed as unknown as ReturnType<SupabaseClient['rpc']>
      }
    },
  } as unknown as SupabaseClient
}

function shiftRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'shift-1',
    date: '2031-08-20',
    start_time: '09:00:00',
    end_time: '11:00:00',
    timezone: 'Asia/Ho_Chi_Minh',
    start_at: '2031-08-20T02:00:00.000Z',
    end_at: '2031-08-20T04:00:00.000Z',
    end_date: '2031-08-20',
    crosses_midnight: false,
    duration_minutes: 120,
    brand_id: 'b1',
    platform_id: 'p1',
    campaign_id: null,
    title: 'Morning Shift',
    studio: null,
    host_id: null,
    support_id: null,
    technical_id: null,
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    registration_locked: false,
    registration_cutoff_at: '2031-08-19T20:00:00.000Z',
    allow_multi_role: false,
    import_batch_id: null,
    status: 'scheduled',
    live_link: null,
    product_notes: null,
    updated_by: null,
    created_at: '2031-08-14T12:00:00.000Z',
    updated_at: '2031-08-14T12:00:00.000Z',
    deleted_at: null,
    deleted_by: null,
    archived_at: null,
    archived_by: null,
    deletion_reason: null,
    ...overrides,
  }
}

function registrationRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'reg-1',
    shift_id: 'shift-1',
    user_id: 'u-member',
    operational_role: 'host',
    status: 'pending',
    source: 'self_registration',
    requested_at: '2031-08-19T10:00:00.000Z',
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    cancelled_at: null,
    created_at: '2031-08-19T10:00:00.000Z',
    updated_at: '2031-08-19T10:00:00.000Z',
    ...overrides,
  }
}

function database(): FakeDatabase {
  return {
    shifts: [shiftRow()],
    shift_registrations: [
      registrationRow(),
      registrationRow({
        id: 'reg-2',
        user_id: 'u-other',
        operational_role: 'support',
        status: 'approved',
        reviewed_by: 'u-leader',
        reviewed_at: '2031-08-19T11:00:00.000Z',
      }),
      registrationRow({
        id: 'reg-3',
        shift_id: 'shift-2',
        user_id: 'u-member',
        operational_role: 'host',
        status: 'pending',
      }),
    ],
  }
}

function adminUser(overrides: Partial<User> = {}): User {
  return {
    id: '1',
    email: 'admin@livestream.com',
    full_name: 'Remote Admin',
    role: 'admin',
    system_permission: 'admin',
    operational_roles: [],
    status: 'active',
    account_status: 'active',
    join_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

async function withEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    await run()
  } finally {
    currentUserService.clearAuthenticatedUser()
    setSupabaseShiftRegistrationRepositoryForTests(undefined)
    setSupabaseShiftRepositoryForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

test('Supabase mode registration reads come from the repository', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const all = await shiftRegistrationService.getAll()
    assert.equal(all.length, 3)
    const forShift = await shiftRegistrationService.getForShift('shift-1')
    assert.deepEqual(forShift.map(reg => reg.id).sort(), ['reg-1', 'reg-2'])
    const forUser = await shiftRegistrationService.getForUser('u-member')
    assert.deepEqual(forUser.map(reg => reg.id).sort(), ['reg-1', 'reg-3'])
  })
})

test('Supabase mode capacity counts pending and approved per role', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const capacity = await shiftRegistrationService.getCapacity('shift-1')
    const host = capacity.find(c => c.role === 'host')!
    const support = capacity.find(c => c.role === 'support')!
    assert.equal(host.required, 1)
    assert.equal(host.pending, 1)
    assert.equal(host.approved, 0)
    assert.equal(host.remaining, 1)
    assert.equal(support.approved, 1)
    assert.equal(support.pending, 0)
    assert.equal(support.remaining, 0)
  })
})

test('Supabase mode self registration goes through register_for_shift RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser({ id: 'u-member', email: 'member@example.test', role: 'staff', system_permission: 'member' }))

    const registration = await shiftRegistrationService.register('shift-1', 'u-member', 'technical')
    assert.equal(registration.status, 'pending')
    assert.equal(registration.operational_role, 'technical')
    assert.ok(db.shift_registrations.some(row => row.id === 'reg-reg-001'))
  })
})

test('Supabase mode approve and reject go through RPCs', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const approved = await shiftRegistrationService.approve('reg-1', '1', 'ok')
    assert.equal(approved.status, 'approved')
    assert.equal(db.shift_registrations.find(row => row.id === 'reg-1')?.status, 'approved')

    const rejected = await shiftRegistrationService.reject('reg-3', '1', 'no')
    assert.equal(rejected.status, 'rejected')
    assert.equal(db.shift_registrations.find(row => row.id === 'reg-3')?.status, 'rejected')
  })
})

test('Supabase mode cancel goes through cancel_own_shift_registration RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser({ id: 'u-member', email: 'member@example.test', role: 'staff', system_permission: 'member' }))

    const cancelled = await shiftRegistrationService.cancel('reg-1', 'u-member', 'changed mind')
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(db.shift_registrations.find(row => row.id === 'reg-1')?.status, 'cancelled')
  })
})

test('Supabase mode manual assign and remove go through RPCs', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const assigned = await shiftRegistrationService.assignManually('shift-1', 'u-leader', 'host', '1')
    assert.equal(assigned.status, 'manually_assigned')
    assert.ok(db.shift_registrations.some(row => row.id === 'reg-man-001'))

    const removed = await shiftRegistrationService.removeAssignment('reg-2', '1', 'replaced')
    assert.equal(removed.status, 'removed')
    assert.equal(db.shift_registrations.find(row => row.id === 'reg-2')?.status, 'removed')
  })
})

test('Supabase mode fresh reload needs no in-memory projection', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(db)))
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    // Simulate a fresh reload: the shift is read straight from the repository.
    const shift = await shiftService.getById('shift-1')
    assert.ok(shift)
    // Direct IDs come from the DB compatibility projection (host_id etc).
    assert.equal(shift.host_id, undefined)
    const capacity = await shiftRegistrationService.getCapacity(shift.id)
    assert.equal(capacity.length, 3)
    const registrations = await shiftRegistrationService.getForShift(shift.id)
    assert.equal(registrations.length, 2)
  })
})

test('mock mode keeps in-memory registration behavior', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(fakeClient(database())))

    const all = await shiftRegistrationService.getAll()
    assert.ok(all.length > 0)
  })
})
