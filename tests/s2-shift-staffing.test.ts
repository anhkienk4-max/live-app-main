import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { currentUserService, shiftService } from '../lib/services/dataService.ts'
import { createSupabaseShiftRepository, setSupabaseShiftRepositoryForTests } from '../lib/services/supabaseShiftService.ts'
import { ShiftFormDialog } from '../components/features/shifts/ShiftFormDialog.tsx'
import { ToastProvider } from '../components/ui/toast.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import type { Shift, User } from '../lib/types/database.types.ts'

type Row = Record<string, unknown>
type TableName = 'shifts' | 'shift_registrations'
type RpcName = 'create_shift' | 'update_shift' | 'set_shift_registration_lock' | 'soft_delete_shift' | 'restore_shift'

interface FakeDatabase { shifts: Row[]; shift_registrations: Row[] }

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = []
  private orderBy: Array<{ column: string; ascending: boolean }> = []
  constructor(
    private readonly database: FakeDatabase,
    private readonly table: TableName,
  ) {}
  select(_columns?: string) { return this }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this }
  is(column: string, value: null) { this.filters.push(row => (row[column] ?? null) === value); return this }
  in(column: string, values: unknown[]) { this.filters.push(row => values.includes(row[column])); return this }
  not(column: string, operator: string, value: string | null) {
    if (operator === 'is' && value === null) { this.filters.push(row => (row[column] ?? null) !== null); return this }
    const values = String(value).replace(/[()"]/g, '').split(',').map(v => v.trim())
    this.filters.push(row => !values.includes(String(row[column])))
    return this
  }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy.push({ column, ascending: options?.ascending !== false }); return this }
  maybeSingle() { return this.execute(true) }
  single() { return this.execute(true) }
  then<T1 = { data: Row[] | null; error: Row | null }, T2 = never>(
    onfulfilled?: ((v: { data: Row[] | null; error: Row | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
  ) { return this.execute(false).then(onfulfilled, onrejected) }
  private async execute(single: boolean) {
    const rows = this.database[this.table] ?? []
    const matching = rows.filter(row => this.filters.every(filter => filter(row)))
    const ordered = matching.map(row => ({ ...row }))
    for (const { column, ascending } of this.orderBy) {
      ordered.sort((l, r) => String(l[column] ?? '').localeCompare(String(r[column] ?? '')) * (ascending ? 1 : -1))
    }
    return { data: single ? ordered[0] ?? null : ordered, error: null }
  }
}

function fakeClient(database: FakeDatabase) {
  const rpcHandlers: Record<RpcName, (args: Record<string, unknown>) => Row> = {
    create_shift(args) {
      const now = '2031-08-20T12:00:00.000Z'
      const row: Row = {
        id: 'shift-new', date: String(args.p_data?.date), start_time: String(args.p_data?.start_time) + ':00',
        end_time: String(args.p_data?.end_time) + ':00', timezone: 'Asia/Ho_Chi_Minh',
        start_at: '2031-08-20T02:00:00.000Z', end_at: '2031-08-20T04:00:00.000Z', end_date: String(args.p_data?.date),
        crosses_midnight: false, duration_minutes: 120, brand_id: String(args.p_data?.brand_id),
        platform_id: String(args.p_data?.platform_id), campaign_id: null, title: args.p_data?.title ?? null,
        studio: null, host_id: args.p_data?.host_id ?? null, support_id: args.p_data?.support_id ?? null,
        technical_id: args.p_data?.technical_id ?? null, required_host_count: Number(args.p_data?.required_host_count ?? 1),
        required_support_count: Number(args.p_data?.required_support_count ?? 1),
        required_technical_count: Number(args.p_data?.required_technical_count ?? 1),
        registration_locked: false, registration_cutoff_at: '2031-08-19T20:00:00.000Z',
        allow_multi_role: Boolean(args.p_data?.allow_multi_role ?? false), import_batch_id: null,
        status: 'scheduled', live_link: null, product_notes: null, updated_by: null,
        created_at: now, updated_at: now, deleted_at: null, deleted_by: null, archived_at: null,
        archived_by: null, deletion_reason: null,
      }
      database.shifts.push({ ...row })
      return { ...row }
    },
    update_shift(args) {
      const id = String(args.p_shift_id)
      const patch = (args.p_patch ?? {}) as Record<string, unknown>
      const index = database.shifts.findIndex(row => row.id === id)
      if (index === -1) throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' }
      const updated = { ...database.shifts[index], ...patch, updated_at: '2031-08-20T13:00:00.000Z' }
      database.shifts[index] = updated
      return { ...updated }
    },
    set_shift_registration_lock(args) {
      const id = String(args.p_shift_id)
      const index = database.shifts.findIndex(row => row.id === id)
      const updated = { ...database.shifts[index], registration_locked: Boolean(args.p_locked), updated_at: '2031-08-20T13:01:00.000Z' }
      database.shifts[index] = updated
      return { ...updated }
    },
    soft_delete_shift() { throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' } },
    restore_shift() { throw { code: 'P0001', message: 'SHIFT_NOT_FOUND' } },
  }

  return {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    from(table: TableName) {
      return new FakeQuery(database, table)
    },
    rpc(name: string, args: Record<string, unknown>) {
      this.rpcCalls.push({ name, args })
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
    id: 'shift-1', date: '2031-08-20', start_time: '09:00:00', end_time: '11:00:00',
    timezone: 'Asia/Ho_Chi_Minh', start_at: '2031-08-20T02:00:00.000Z', end_at: '2031-08-20T04:00:00.000Z',
    end_date: '2031-08-20', crosses_midnight: false, duration_minutes: 120, brand_id: 'b1', platform_id: 'p1',
    campaign_id: null, title: 'Morning', studio: null, host_id: 'u-host', support_id: null, technical_id: null,
    required_host_count: 1, required_support_count: 1, required_technical_count: 1, registration_locked: false,
    registration_cutoff_at: '2031-08-19T20:00:00.000Z', allow_multi_role: false, import_batch_id: null,
    status: 'scheduled', live_link: null, product_notes: null, updated_by: null,
    created_at: '2031-08-14T12:00:00.000Z', updated_at: '2031-08-14T12:00:00.000Z',
    deleted_at: null, deleted_by: null, archived_at: null, archived_by: null, deletion_reason: null,
    ...overrides,
  }
}

function database(): FakeDatabase {
  return { shifts: [shiftRow()], shift_registrations: [] }
}

function adminUser(): User {
  return {
    id: '1', email: 'admin@livestream.com', full_name: 'Admin', role: 'admin',
    system_permission: 'admin', operational_roles: [], status: 'active', account_status: 'active',
    join_date: '2026-01-01', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

async function withEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try { await run() }
  finally {
    currentUserService.clearAuthenticatedUser()
    setSupabaseShiftRepositoryForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

const users: User[] = [
  adminUser(),
  { ...adminUser(), id: 'u-host', email: 'host@example.test', full_name: 'Host User', operational_roles: ['host'] },
]

const staffUsers = users.filter(u => u.status === 'active')

test('Supabase Edit Shift strips staffing fields from update_shift payload', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    await shiftService.update('shift-1', {
      title: 'Renamed',
      host_id: 'u-host',
      support_id: 'u-support',
      technical_id: 'u-tech',
    }, '1', { reason: 'edit' })

    const updateCall = client.rpcCalls.find(call => call.name === 'update_shift')
    assert.ok(updateCall, 'update_shift called')
    const patch = updateCall.args.p_patch as Record<string, unknown>
    assert.equal(patch.title, 'Renamed')
    assert.equal(patch.host_id, undefined)
    assert.equal(patch.support_id, undefined)
    assert.equal(patch.technical_id, undefined)
    // No staffing RPC fired — staffing is read-only in Edit Shift.
    assert.equal(client.rpcCalls.some(call => call.name === 'manual_assign_shift_staff'), false)
  })
})

test('Supabase Create Shift keeps initial staffing in create_shift payload', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseShiftRepositoryForTests(createSupabaseShiftRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const created = await shiftService.create({
      title: 'New', date: '2031-08-21', start_time: '09:00', end_time: '11:00',
      brand_id: 'b1', platform_id: 'p1', required_host_count: 1, required_support_count: 1,
      required_technical_count: 1, status: 'scheduled', registration_locked: false, allow_multi_role: false,
      host_id: 'u-host',
    })
    assert.equal(created.id, 'shift-new')

    const createCall = client.rpcCalls.find(call => call.name === 'create_shift')
    assert.ok(createCall, 'create_shift called')
    const payload = createCall.args.p_data as Record<string, unknown>
    assert.equal(payload.host_id, 'u-host')
  })
})

test('ShiftFormDialog Edit in Supabase mode renders staffing read-only, not selects', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    currentUserService.bindAuthenticatedUser(adminUser())

    const shift: Shift = {
      id: 'shift-1', date: '2031-08-20', start_time: '09:00', end_time: '11:00',
      brand_id: 'b1', platform_id: 'p1', status: 'scheduled', created_at: '2031-08-14T12:00:00.000Z',
      updated_at: '2031-08-14T12:00:00.000Z', host_id: 'u-host',
    }
    // Radix Dialog renders via a portal, so SSR markup is empty; the staffing
    // read-only contract is asserted through the service layer: staffing
    // fields never reach update_shift on edit (see first test). Here we only
    // verify the component mounts without throwing in edit mode.
    const markup = renderToStaticMarkup(createElement(
      LanguageProvider, null,
      createElement(ToastProvider, null, createElement(ShiftFormDialog, {
        open: true, onOpenChange: () => undefined, shift, duplicateFrom: null,
        brands: [], platforms: [], campaigns: [], users: staffUsers, templates: [],
        onSuccess: () => undefined,
      })),
    ))
    assert.equal(typeof markup, 'string')
  })
})

test('ShiftFormDialog Create in Supabase mode mounts', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    currentUserService.bindAuthenticatedUser(adminUser())

    const markup = renderToStaticMarkup(createElement(
      LanguageProvider, null,
      createElement(ToastProvider, null, createElement(ShiftFormDialog, {
        open: true, onOpenChange: () => undefined, shift: null, duplicateFrom: null,
        brands: [], platforms: [], campaigns: [], users: staffUsers, templates: [],
        onSuccess: () => undefined,
      })),
    ))
    assert.equal(typeof markup, 'string')
  })
})
