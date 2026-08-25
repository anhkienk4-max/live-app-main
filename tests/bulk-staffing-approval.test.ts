import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { currentUserService, shiftRegistrationService } from '../lib/services/dataService.ts'
import {
  createSupabaseShiftRegistrationRepository,
  setSupabaseShiftRegistrationRepositoryForTests,
} from '../lib/services/supabaseShiftRegistrationService.ts'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'
import {
  buildPendingStaffingReviewRows,
  filterStaffingReviewRows,
  pendingRegistrationsInScope,
  shiftsInCalendarScope,
  toggleStaffingReviewSelection,
} from '../lib/utils/calendarStaffingApproval.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20260824120000_bulk_staffing_approval.sql', import.meta.url),
  'utf8',
)
const calendarSource = readFileSync(
  new URL('../components/features/calendar/CalendarView.tsx', import.meta.url),
  'utf8',
)
const dialogSource = readFileSync(
  new URL('../components/features/calendar/BulkStaffingApprovalDialog.tsx', import.meta.url),
  'utf8',
)
const dataServiceSource = readFileSync(
  new URL('../lib/services/dataService.ts', import.meta.url),
  'utf8',
)

const baseShift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'shift-1',
  date: '2031-08-24',
  start_time: '10:00',
  end_time: '12:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  title: 'Morning live',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  status: 'scheduled',
  created_at: '2031-08-01T00:00:00.000Z',
  updated_at: '2031-08-01T00:00:00.000Z',
  ...overrides,
})

const baseRegistration = (
  id: string,
  shiftId = 'shift-1',
  overrides: Partial<ShiftRegistration> = {},
): ShiftRegistration => ({
  id,
  shift_id: shiftId,
  user_id: `user-${id}`,
  operational_role: 'host',
  status: 'pending',
  source: 'self_registration',
  requested_at: '2031-08-20T00:00:00.000Z',
  created_at: '2031-08-20T00:00:00.000Z',
  updated_at: '2031-08-20T00:00:00.000Z',
  ...overrides,
})

const baseUser = (overrides: Partial<User> = {}): User => ({
  id: 'member-1',
  email: 'member@example.test',
  full_name: 'Member',
  role: 'staff',
  system_permission: 'member',
  operational_roles: ['host'],
  status: 'active',
  account_status: 'active',
  join_date: '2031-01-01',
  created_at: '2031-01-01T00:00:00.000Z',
  updated_at: '2031-01-01T00:00:00.000Z',
  ...overrides,
})

test('Calendar pending count follows the active month/week/day/list scope', () => {
  const shifts = [
    baseShift(),
    baseShift({ id: 'shift-2', date: '2031-08-31' }),
    baseShift({ id: 'shift-3', date: '2031-09-01' }),
  ]
  const registrations = [
    baseRegistration('reg-1'),
    baseRegistration('reg-2', 'shift-2'),
    baseRegistration('reg-3', 'shift-3'),
    baseRegistration('reg-approved', 'shift-1', { status: 'approved' }),
  ]

  const month = shiftsInCalendarScope(shifts, 'month', new Date('2031-08-24T00:00:00'))
  assert.equal(pendingRegistrationsInScope(registrations, month).length, 2)
  const day = shiftsInCalendarScope(shifts, 'day', new Date('2031-08-24T00:00:00'))
  assert.deepEqual(pendingRegistrationsInScope(registrations, day).map(row => row.id), ['reg-1'])
  assert.equal(pendingRegistrationsInScope(registrations, shiftsInCalendarScope(shifts, 'list', new Date())).length, 3)
})

test('bulk approval modal contract renders pending request columns, filters and actions', () => {
  assert.match(calendarSource, /bulkStaffingApproval[\s\S]*pendingStaffingRegistrations\.length/)
  assert.match(calendarSource, /data-testid="open-bulk-staffing-approval"/)
  assert.match(dialogSource, /data-testid="bulk-staffing-approval-dialog"/)
  assert.match(dialogSource, /bulk-staffing-date-filter/)
  assert.match(dialogSource, /bulk-staffing-role-filter/)
  assert.match(dialogSource, /bulk-staffing-shift-filter/)
  assert.match(dialogSource, /bulk-approve-selected/)
  assert.match(dialogSource, /bulk-reject-selected/)

  const registrations = [
    baseRegistration('reg-1'),
    baseRegistration('reg-2', 'shift-1', { operational_role: 'support' }),
    baseRegistration('reg-3', 'shift-1', { status: 'approved' }),
  ]
  const rows = buildPendingStaffingReviewRows(
    registrations,
    [baseShift()],
    [baseUser({ id: 'user-reg-1', full_name: 'Host One' })],
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].user?.full_name, 'Host One')
  assert.deepEqual(
    filterStaffingReviewRows(rows, { date: '2031-08-24', role: 'support', shiftId: 'all' })
      .map(row => row.registration.id),
    ['reg-2'],
  )
  const selected = toggleStaffingReviewSelection(new Set(), ['reg-1', 'reg-2'], true)
  assert.deepEqual([...selected].sort(), ['reg-1', 'reg-2'])
  assert.deepEqual([...toggleStaffingReviewSelection(selected, ['reg-1'], false)], ['reg-2'])
  assert.deepEqual([...toggleStaffingReviewSelection(selected, ['reg-1', 'reg-2'], false)], [])
})

test('Supabase bulk repository maps approve one, approve multiple and per-row failures', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args })
      const ids = args.p_registration_ids as string[]
      return Promise.resolve({
        data: ids.map((id, index) => index === ids.length - 1 && ids.length > 1
          ? {
              registration_id: id,
              review_action: args.p_action,
              success: false,
              error_code: 'SHIFT_FULL',
              error_message: 'SHIFT_FULL',
              reviewed_registration: null,
            }
          : {
              registration_id: id,
              review_action: args.p_action,
              success: true,
              error_code: null,
              error_message: null,
              reviewed_registration: baseRegistration(id, 'shift-1', {
                status: args.p_action === 'approve' ? 'approved' : 'rejected',
              }),
            }),
        error: null,
      })
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseShiftRegistrationRepository(client)

  const one = await repository.bulkReview(['reg-1'], 'approve')
  assert.equal(one[0].registration?.status, 'approved')
  const multiple = await repository.bulkReview(['reg-2', 'reg-3'], 'approve')
  assert.equal(multiple[0].success, true)
  assert.equal(multiple[1].success, false)
  assert.equal(multiple[1].error_code, 'SHIFT_FULL')
  const rejected = await repository.bulkReview(['reg-4'], 'reject')
  assert.equal(rejected[0].registration?.status, 'rejected')
  assert.deepEqual(calls.map(call => call.name), [
    'bulk_review_shift_registrations',
    'bulk_review_shift_registrations',
    'bulk_review_shift_registrations',
  ])
})

test('Member cannot invoke bulk review even when a repository is available', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  const calls: string[] = []
  const client = {
    rpc(name: string) {
      calls.push(name)
      return Promise.resolve({ data: [], error: null })
    },
  } as unknown as SupabaseClient
  try {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
    currentUserService.bindAuthenticatedUser(baseUser())
    setSupabaseShiftRegistrationRepositoryForTests(createSupabaseShiftRegistrationRepository(client))
    await assert.rejects(
      shiftRegistrationService.bulkReview(['reg-1'], 'approve', 'member-1'),
      /Leader or Admin/,
    )
    assert.deepEqual(calls, [])
  } finally {
    currentUserService.clearAuthenticatedUser()
    setSupabaseShiftRegistrationRepositoryForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('bulk RPC reuses canonical single review logic and isolates row failures', () => {
  assert.match(migration, /perform private\.require_shift_actor\(true\);/)
  assert.match(migration, /reviewed := public\.approve_shift_registration\(input_id, p_notes\);/)
  assert.match(migration, /reviewed := public\.reject_shift_registration\(input_id, p_notes\);/)
  assert.match(migration, /exception when others then[\s\S]*return next;/)
  assert.match(migration, /input_id = any\(processed_ids\)/)
  assert.match(migration, /cardinality\(p_registration_ids\) > 100/)
  assert.match(migration, /from public\.shifts as shift[\s\S]*order by shift\.id[\s\S]*for update;/)
  assert.match(migration, /from public\.shift_registrations as registration[\s\S]*order by registration\.id[\s\S]*for update;/)
})

test('canonical approval rechecks active role, capacity and conflicts before mutation', () => {
  const approval = migration.slice(
    migration.indexOf('create or replace function public.approve_shift_registration'),
    migration.indexOf('create or replace function public.bulk_review_shift_registrations'),
  )
  assert.match(approval, /private\.assert_shift_role_eligibility/)
  assert.match(approval, /private\.assert_shift_capacity/)
  assert.match(approval, /private\.assert_no_shift_registration_conflict/)
  assert.match(approval, /set status = 'approved'/)
  assert.match(approval, /private\.refresh_shift_registration_lock/)
})

test('bulk RPC is authenticated-only, fail-closed and preserves canonical projections', () => {
  assert.match(migration, /revoke all on function public\.bulk_review_shift_registrations\(text\[\], text, text\) from public, anon;/)
  assert.match(migration, /grant execute on function public\.bulk_review_shift_registrations\(text\[\], text, text\) to authenticated;/)
  assert.doesNotMatch(migration, /service_role/)
  assert.doesNotMatch(migration, /p_actor|p_user_id/)
  assert.match(migration, /refresh_shift_registration_lock/)
  assert.match(dataServiceSource, /'shift_registration_batch'/)
  assert.match(dataServiceSource, /results: results\.map/)
})

test('inactive or archived staff is blocked by the shared role-eligibility guard', () => {
  const p1cMigration = readFileSync(
    new URL('../supabase/migrations/20260814085659_p1c_shift_persistence.sql', import.meta.url),
    'utf8',
  )
  assert.match(p1cMigration, /business_user\.status = 'active'/)
  assert.match(p1cMigration, /business_user\.account_status = 'active'/)
  assert.match(p1cMigration, /business_user\.archived_at is null/)
  assert.match(p1cMigration, /business_user\.deleted_at is null/)
  assert.match(migration, /assert_shift_role_eligibility/)
})
