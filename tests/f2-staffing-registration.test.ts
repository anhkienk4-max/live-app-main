import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Shift, ShiftRegistration } from '@/lib/types/database.types'
import { getStaffingRoleSummary } from '@/lib/utils/shiftRegistration'

const root = resolve(process.cwd())
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const shift: Shift = {
  id: 'f2-shift', date: '2031-08-28', start_time: '10:00', end_time: '12:00',
  brand_id: 'brand', platform_id: 'platform', status: 'scheduled',
  required_host_count: 2, required_support_count: 1, required_technical_count: 1,
  registration_locked: false, host_names: ['Imported Host'], assistant_names: ['Imported Support'],
  technical_names: ['Imported Technical'], created_at: '2031-01-01T00:00:00.000Z', updated_at: '2031-01-01T00:00:00.000Z',
}

const registration = (id: string, role: ShiftRegistration['operational_role'], status: ShiftRegistration['status']): ShiftRegistration => ({
  id, shift_id: shift.id, user_id: `${id}-user`, operational_role: role, status,
  source: 'self_registration', requested_at: '2031-08-27T00:00:00.000Z',
  created_at: '2031-08-27T00:00:00.000Z', updated_at: '2031-08-27T00:00:00.000Z',
})

test('F2 staffing summary keeps required, assigned, pending, and gap distinct', () => {
  const summary = getStaffingRoleSummary(shift, [
    registration('host-approved', 'host', 'approved'),
    registration('host-pending', 'host', 'pending'),
    registration('support-cancelled', 'support', 'cancelled'),
  ])
  assert.deepEqual(summary.find(item => item.role === 'host'), { role: 'host', required: 2, assigned: 1, pending: 1, gap: 1 })
  assert.deepEqual(summary.find(item => item.role === 'support'), { role: 'support', required: 1, assigned: 0, pending: 0, gap: 1 })
  assert.equal(summary.find(item => item.role === 'technical')?.assigned, 0)
})

test('F2 does not count imported labels or pending rows as assignments', () => {
  const source = read('components/features/calendar/StaffingSummary.tsx')
  assert.match(source, /getStaffingRoleSummary/)
  assert.match(source, /assignedCount/)
  assert.match(source, /pendingCount/)
  assert.match(source, /missingCount/)
  assert.match(source, /data-testid={`staffing-summary-/)
  assert.doesNotMatch(source, /host_names|assistant_names|technical_names/)
})

test('F2 keeps registration CTA/status canonical across staffing surfaces', () => {
  const actions = read('components/features/calendar/ShiftRegistrationActions.tsx')
  const board = read('components/features/calendar/ShiftRegistrationBoard.tsx')
  const detail = read('components/features/shifts/ShiftDetailModal.tsx')
  assert.match(actions, /resolveRegistrationCta/)
  assert.match(actions, /aria-live="polite"/)
  for (const state of ['pending', 'approved', 'full', 'conflict', 'closed']) assert.match(actions, new RegExp(`data-state="${state}"`))
  assert.match(board, /CompactShiftList[\s\S]{0,260}onRegister=/)
  assert.match(board, /<ShiftRegistrationActions[\s\S]{0,180}shift=\{shift\}/)
  assert.match(detail, /<StaffingSummary registrations=\{registrations\} shift=\{shift\}/)
  assert.match(detail, /registrationQueue/)
})

test('F2 preserves role boundaries and imported-label fallback precedence', () => {
  const detail = read('components/features/shifts/ShiftDetailModal.tsx')
  const daySessions = read('components/features/calendar/DaySessionsDialog.tsx')
  assert.match(detail, /hasPermission\(currentUser, 'shifts\.assign_staff'\)/)
  assert.match(detail, /hasPermission\(currentUser, 'shifts\.approve_registration'\)/)
  assert.match(detail, /canAssignStaff && currentUser/)
  assert.match(daySessions, /if \(assignedNames\.length > 0\) return assignedNames\.join\(', '\)/)
  assert.match(daySessions, /importedNames\.join\(', '\) \|\| fallback/)
})

test('F2 keeps settled loading/error and filtered-empty states available', () => {
  const board = read('components/features/calendar/ShiftRegistrationBoard.tsx')
  const calendar = read('components/features/calendar/CalendarView.tsx')
  assert.match(board, /finally \{\s*setLoading\(false\)/)
  assert.match(board, /<PageLoadError/)
  assert.match(board, /data-testid="role-aware-empty-state"/)
  assert.match(calendar, /data-testid="calendar-empty-state"/)
  assert.match(calendar, /noMatchingShifts/)
})
