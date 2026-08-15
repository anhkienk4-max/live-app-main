import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  currentUserService,
  scheduleImportService,
  shiftService,
} from '../lib/services/dataService.ts'
import {
  createSupabaseShiftRepository,
  setSupabaseShiftRepositoryForTests,
  ShiftRequestError,
} from '../lib/services/supabaseShiftService.ts'
import type { Shift, User } from '../lib/types/database.types.ts'

type Row = Record<string, unknown>
type TableName = 'shifts' | 'shift_registrations' | 'schedule_imports'
type RpcName = 'create_shift' | 'update_shift' | 'set_shift_registration_lock' | 'soft_delete_shift' | 'restore_shift'

interface FakeDatabase {
  shifts: Row[]
  shift_registrations: Row[]
}

interface FakeClientOptions {
  deniedTable?: TableName
  deniedRpc?: RpcName
  rpcError?: Record<string, unknown>
}

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = []
  private orderBy: Array<{ column: string; ascending: boolean }> = []
  private countOnly = false

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

  gte(column: string, value: unknown) {
    this.filters.push(row => String(row[column] ?? '') >= String(value))
    return this
  }

  lte(column: string, value: unknown) {
    this.filters.push(row => String(row[column] ?? '') <= String(value))
    return this
  }

  gt(column: string, value: unknown) {
    this.filters.push(row => String(row[column] ?? '') > String(value))
    return this
  }

  not(column: string, operator: string, value: string | null) {
    if (operator === 'is' && value === null) {
      this.filters.push(row => (row[column] ?? null) !== null)
      return this
    }
    const values = String(value).replace(/[()"]/g, '').split(',').map(v => v.trim())
    this.filters.push(row => !values.includes(String(row[column])))
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
    if (this.countOnly) {
      const matching = rows.filter(row => this.filters.every(filter => filter(row)))
      return { data: null, error: null, count: matching.length }
    }

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
    create_shift(args) {
      const now = '2026-08-14T12:00:00.000Z'
      const row: Row = {
        id: 'shift-new-001',
        date: String(args.p_data?.date ?? ''),
        start_time: String(args.p_data?.start_time ?? '09:00') + ':00',
        end_time: String(args.p_data?.end_time ?? '11:00') + ':00',
        timezone: 'Asia/Ho_Chi_Minh',
        start_at: '2026-08-14T02:00:00.000Z',
        end_at: '2026-08-14T04:00:00.000Z',
        end_date: String(args.p_data?.date ?? ''),
        crosses_midnight: false,
        duration_minutes: 120,
        brand_id: String(args.p_data?.brand_id ?? ''),
        platform_id: String(args.p_data?.platform_id ?? ''),
        campaign_id: args.p_data?.campaign_id ?? null,
        title: args.p_data?.title ?? null,
        studio: args.p_data?.studio ?? null,
        host_id: args.p_data?.host_id ?? null,
        support_id: args.p_data?.support_id ?? null,
        technical_id: args.p_data?.technical_id ?? null,
        required_host_count: Number(args.p_data?.required_host_count ?? 1),
        required_support_count: Number(args.p_data?.required_support_count ?? 1),
        required_technical_count: Number(args.p_data?.required_technical_count ?? 1),
        registration_locked: false,
        registration_cutoff_at: '2026-08-13T20:00:00.000Z',
        allow_multi_role: Boolean(args.p_data?.allow_multi_role ?? false),
        import_batch_id: args.p_data?.import_batch_id ?? null,
        status: String(args.p_data?.status ?? 'scheduled'),
        live_link: args.p_data?.live_link ?? null,
        product_notes: args.p_data?.product_notes ?? null,
        updated_by: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        deleted_by: null,
        archived_at: null,
        archived_by: null,
        deletion_reason: null,
      }
      database.shifts.push({ ...row })
      return { ...row }
    },
    update_shift(args) {
      const id = String(args.p_shift_id ?? '')
      const patch = (args.p_patch ?? {}) as Record<string, unknown>
      const index = database.shifts.findIndex(row => row.id === id)
      if (index === -1) {
        throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' }
      }
      const updated = {
        ...database.shifts[index],
        ...patch,
        start_time: patch.start_time ? String(patch.start_time) + ':00' : database.shifts[index].start_time,
        end_time: patch.end_time ? String(patch.end_time) + ':00' : database.shifts[index].end_time,
        updated_at: '2026-08-14T12:01:00.000Z',
      }
      database.shifts[index] = updated
      return { ...updated }
    },
    set_shift_registration_lock(args) {
      const id = String(args.p_shift_id ?? '')
      const index = database.shifts.findIndex(row => row.id === id)
      if (index === -1) {
        throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' }
      }
      const updated = {
        ...database.shifts[index],
        registration_locked: Boolean(args.p_locked),
        updated_at: '2026-08-14T12:02:00.000Z',
      }
      database.shifts[index] = updated
      return { ...updated }
    },
    soft_delete_shift(args) {
      const id = String(args.p_shift_id ?? '')
      const index = database.shifts.findIndex(row => row.id === id)
      if (index === -1) {
        throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' }
      }
      if (database.shifts[index].deleted_at) {
        throw { code: 'P0001', message: 'SHIFT_ALREADY_DELETED' }
      }
      const updated = {
        ...database.shifts[index],
        status: 'cancelled',
        deleted_at: '2026-08-14T13:00:00.000Z',
        deleted_by: '1',
        deletion_reason: String(args.p_reason ?? ''),
        registration_locked: true,
        updated_at: '2026-08-14T13:00:00.000Z',
      }
      database.shifts[index] = updated
      return { ...updated }
    },
    restore_shift(args) {
      const id = String(args.p_shift_id ?? '')
      const index = database.shifts.findIndex(row => row.id === id)
      if (index === -1) {
        throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' }
      }
      if (!database.shifts[index].deleted_at) {
        throw { code: 'P0001', message: 'SHIFT_NOT_DELETED' }
      }
      const updated = {
        ...database.shifts[index],
        status: 'scheduled',
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        registration_locked: false,
        updated_at: '2026-08-14T13:01:00.000Z',
      }
      database.shifts[index] = updated
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
      if (options.deniedRpc === name) {
        const rejected = { data: null, error: { code: '42501', message: `permission denied for rpc ${name}` } }
        const denied = () => Promise.resolve(rejected)
        denied.single = () => Promise.resolve(rejected)
        return denied as unknown as ReturnType<SupabaseClient['rpc']>
      }
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
    date: '2031-08-14',
    start_time: '09:00:00',
    end_time: '11:00:00',
    timezone: 'Asia/Ho_Chi_Minh',
    start_at: '2031-08-14T02:00:00.000Z',
    end_at: '2031-08-14T04:00:00.000Z',
    end_date: '2031-08-14',
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
    registration_cutoff_at: '2031-08-13T20:00:00.000Z',
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

function database(): FakeDatabase {
  return {
    shifts: [
      shiftRow(),
      shiftRow({
        id: 'shift-2',
        date: '2031-08-15',
        title: 'Overnight Shift',
        start_time: '22:00:00',
        end_time: '02:00:00',
        end_date: '2031-08-16',
        crosses_midnight: true,
        duration_minutes: 240,
        start_at: '2031-08-15T15:00:00.000Z',
        end_at: '2031-08-15T19:00:00.000Z',
      }),
      shiftRow({
        id: 'shift-deleted',
        date: '2031-08-10',
        title: 'Deleted Shift',
        deleted_at: '2031-08-11T00:00:00.000Z',
      }),
    ],
    shift_registrations: [],
  }
}

function adminUser(): User {
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
    setSupabaseShiftRepositoryForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

test('Supabase mode shift reads use the repository and never fall back to mock rows', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const all = await shiftService.getAll()
    assert.deepEqual(all.map(shift => shift.id), ['shift-1', 'shift-2'])
    assert.equal(all.some(shift => shift.id === 'shift-deleted'), false)

    const byId = await shiftService.getById('shift-1')
    assert.equal(byId?.title, 'Morning Shift')
    assert.equal(byId?.start_time, '09:00')
    assert.equal(await shiftService.getById('shift-missing'), null)

    const byDate = await shiftService.getByDate('2031-08-15')
    assert.deepEqual(byDate.map(shift => shift.id), ['shift-2'])

    const byRange = await shiftService.getByDateRange('2031-08-14', '2031-08-15')
    assert.deepEqual(byRange.map(shift => shift.id).sort(), ['shift-1', 'shift-2'])

    const open = await shiftService.getOpen()
    assert.ok(open.some(shift => shift.id === 'shift-1'))
  })
})

test('Supabase mode preserves overnight/timezone semantics', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))

    const overnight = await shiftService.getById('shift-2')
    assert.equal(overnight?.crosses_midnight, true)
    assert.equal(overnight?.end_date, '2031-08-16')
    assert.equal(overnight?.start_time, '22:00')
    assert.equal(overnight?.end_time, '02:00')
    assert.equal(overnight?.duration_minutes, 240)
  })
})

test('Supabase mode create persists through create_shift RPC and updates the projection', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const created = await shiftService.create({
      title: 'Imported Mars Shift',
      date: '2031-08-20',
      start_time: '09:00',
      end_time: '11:00',
      brand_id: 'b1',
      platform_id: 'p1',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      status: 'scheduled',
      registration_locked: false,
      allow_multi_role: false,
    })
    assert.equal(created.id, 'shift-new-001')
    assert.ok(db.shifts.some(row => row.id === created.id))
    assert.equal((await shiftService.getById(created.id))?.title, 'Imported Mars Shift')
  })
})

test('Supabase mode update and lock go through the RPCs and update the projection', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const updated = await shiftService.update('shift-1', { studio: 'Studio North 01' }, '1', { reason: 'test' })
    assert.equal(updated?.studio, 'Studio North 01')
    assert.equal(db.shifts.find(row => row.id === 'shift-1')?.studio, 'Studio North 01')

    const locked = await shiftService.lock('shift-1', '1')
    assert.equal(locked?.registration_locked, true)
    assert.equal(db.shifts.find(row => row.id === 'shift-1')?.registration_locked, true)

    const reopened = await shiftService.reopen('shift-1', '1')
    assert.equal(reopened?.registration_locked, false)
  })
})

test('Supabase mode permission and RLS failures surface and never fall back to mock rows', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(
      fakeClient(db, { deniedTable: 'shifts' }),
    ))

    await assert.rejects(
      shiftService.getAll(),
      (error: unknown) => error instanceof ShiftRequestError
        && error.code === '42501'
        && /permission denied/.test(error.message),
    )
  })
})

test('Supabase mode denies non-admin shift deletion', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))

    const member = {
      ...adminUser(),
      id: '3',
      email: 'member@example.test',
      role: 'staff' as const,
      system_permission: 'member' as const,
    }
    currentUserService.bindAuthenticatedUser(member)
    await assert.rejects(
      shiftService.remove('shift-1', '3', 'test'),
      /Only Admin/,
    )
    assert.ok(db.shifts.some(row => row.id === 'shift-1'))
  })
})

test('Supabase mode soft delete persists lifecycle fields and hides from reads; restore clears them', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const impact = await shiftService.remove('shift-1', '1', 'test removal')
    assert.equal(impact?.action, 'soft_delete')
    assert.equal(impact?.reversible, true)
    const deletedRow = db.shifts.find(row => row.id === 'shift-1')!
    assert.equal(deletedRow.status, 'cancelled')
    assert.ok(deletedRow.deleted_at)
    assert.equal(deletedRow.deleted_by, '1')
    assert.equal(deletedRow.deletion_reason, 'test removal')
    assert.equal(deletedRow.registration_locked, true)

    // Deleted shift is absent from normal reads.
    const all = await shiftService.getAll()
    assert.equal(all.some(shift => shift.id === 'shift-1'), false)

    // Admin archived view includes it.
    const archived = await (await import('../lib/services/dataService.ts')).lifecycleService.getArchived('1')
    assert.ok(archived.some(item => item.entity_type === 'shift' && item.entity_id === 'shift-1'))

    // Restore clears lifecycle fields.
    const restored = await shiftService.restore('shift-1', '1', 'restored in error')
    assert.equal(restored?.status, 'scheduled')
    assert.equal(restored?.deleted_at, undefined)
    assert.equal(restored?.registration_locked, false)
    assert.equal(db.shifts.find(row => row.id === 'shift-1')?.deleted_at, null)
    assert.ok((await shiftService.getAll()).some(shift => shift.id === 'shift-1'))
  })
})

test('Supabase mode invalid restore and double delete fail closed', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    // Restoring a non-deleted shift fails closed.
    await assert.rejects(
      shiftService.restore('shift-1', '1', 'no-op'),
      /SHIFT_NOT_DELETED|shift restore/i,
    )
    // Soft-deleting twice fails closed.
    await shiftService.remove('shift-1', '1', 'first')
    await assert.rejects(
      shiftService.remove('shift-1', '1', 'second'),
      /SHIFT_ALREADY_DELETED|shift soft delete/i,
    )
  })
})

test('Supabase mode update with registration_locked splits into update_shift + lock RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const updated = await shiftService.update('shift-1', {
      studio: 'Studio Lock',
      registration_locked: true,
    }, '1', { reason: 'lock via form' })
    assert.equal(updated?.studio, 'Studio Lock')
    assert.equal(updated?.registration_locked, true)
    assert.equal(db.shifts.find(row => row.id === 'shift-1')?.registration_locked, true)
  })
})

test('mock mode keeps the existing in-memory shift behavior', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(database())))

    const all = await shiftService.getAll()
    assert.ok(all.length > 0)
    assert.ok(all.some(shift => shift.brand_id === 'b1'))
  })
})

test('schedule import confirm flows through shiftService.create for durability', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const batch = await scheduleImportService.createPreview('excel', 'mars.xlsx', {
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      warning_rows: 0,
    }, '1', [{
      row_number: 1,
      date: '2031-08-20',
      start_time: '09:00',
      end_time: '11:00',
      brand_name: 'Mars Brand',
      platform_name: 'Mars Platform',
      title: 'Mars Imported',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      warnings: [],
      errors: [],
    }])

    const shiftData = {
      title: 'Mars Imported',
      date: '2031-08-20',
      start_time: '09:00',
      end_time: '11:00',
      brand_id: 'b1',
      platform_id: 'p1',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      status: 'scheduled' as const,
      registration_locked: false,
      allow_multi_role: false,
      import_batch_id: batch.id,
    }
    const created = await shiftService.create(shiftData)
    const confirmed = await scheduleImportService.confirm(batch.id)

    assert.equal(created.import_batch_id, batch.id)
    assert.ok(db.shifts.some(row => row.id === created.id))
    assert.equal(confirmed?.status, 'confirmed')
  })
})
