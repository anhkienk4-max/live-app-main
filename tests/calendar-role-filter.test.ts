import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { ShiftRegistration } from '../lib/types/database.types.ts'
import { filterCalendarShifts, type CalendarFilterState } from '../lib/utils/calendarFilters.ts'
import {
  getVisibleOperationalRoles,
  getVisibleRoleCapacities,
  matchesRoleFilter,
} from '../lib/utils/shiftRegistrationRoleView.ts'

const capacities = [
  { role: 'host', required: 1, approved: 1, pending: 0, remaining: 0 },
  { role: 'support', required: 1, approved: 0, pending: 1, remaining: 1 },
  { role: 'technical', required: 1, approved: 0, pending: 0, remaining: 1 },
] as never

const registration = (operational_role: ShiftRegistration['operational_role']) => ({ operational_role })

test('open-shift role filtering keeps card and compact capacity rows to the selected role', () => {
  assert.deepEqual(getVisibleRoleCapacities(capacities, 'all').map((item: { role: string }) => item.role), ['host', 'support', 'technical'])
  assert.deepEqual(getVisibleRoleCapacities(capacities, 'host').map((item: { role: string }) => item.role), ['host'])
  assert.deepEqual(getVisibleRoleCapacities(capacities, 'support').map((item: { role: string }) => item.role), ['support'])
  assert.deepEqual(getVisibleRoleCapacities(capacities, 'technical').map((item: { role: string }) => item.role), ['technical'])
  assert.deepEqual(getVisibleOperationalRoles('support'), ['support'])
})

test('role-filtered pending approvals include only pending registrations in the selected role', () => {
  const registrations = [
    { ...registration('host'), status: 'pending' },
    { ...registration('support'), status: 'pending' },
    { ...registration('technical'), status: 'approved' },
  ]
  const pending = registrations.filter(item => item.status === 'pending')
  assert.equal(pending.filter(item => matchesRoleFilter(item, 'host')).length, 1)
  assert.equal(pending.filter(item => matchesRoleFilter(item, 'support')).length, 1)
  assert.equal(pending.filter(item => matchesRoleFilter(item, 'all')).length, 2)
})

test('brand plus role filtering keeps only matching shifts and reset restores every role', () => {
  const filters: CalendarFilterState = {
    brand: 'brand-a', platform: 'all', campaign: 'all', studio: 'all', status: 'all',
    host: 'all', support: 'all', technical: 'all', time: 'all', customFrom: '', customTo: '',
  }
  const shifts = [
    { id: 'target', brand_id: 'brand-a', date: '2026-09-15' },
    { id: 'other-brand', brand_id: 'brand-b', date: '2026-09-15' },
  ] as never
  const selected = filterCalendarShifts(shifts, filters, '', { currentDate: new Date('2026-09-15T12:00:00Z') })
    .filter(() => getVisibleRoleCapacities(capacities.filter((item: { role: string }) => item.role === 'host'), 'host').length > 0)
  assert.deepEqual(selected.map(shift => shift.id), ['target'])
  assert.deepEqual(getVisibleOperationalRoles('all'), ['host', 'support', 'technical'])
})

test('table role filtering emits one row per selected role while preserving combined/reset behavior', () => {
  const source = readFileSync(new URL('../components/features/calendar/ShiftRegistrationBoard.tsx', import.meta.url), 'utf8')
  assert.match(source, /roleFilter=\{filters\.role\}/)
  assert.match(source, /getVisibleOperationalRoles\(roleFilter\)\.map\(role => <tr/)
  assert.match(source, /setFilters\(initialFilters\)/)
  assert.match(source, /getVisibleRoleCapacities\(capacities\[shift\.id\] \|\| \[\], filters\.role\)/)
  assert.match(source, /matchesRoleFilter\(registration, filters\.role\)/)
})
