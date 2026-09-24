import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Shift } from '../lib/types/database.types.ts'
import {
  buildStudioFilterOptions,
  calendarTimeScope,
  effectiveListTimeFilter,
  filterCalendarShifts,
  normalizeStudio,
  UNASSIGNED_STUDIO_FILTER,
  type CalendarFilterState,
} from '../lib/utils/calendarFilters.ts'

const baseFilters: CalendarFilterState = {
  brandIds: [],
  platformIds: [],
  campaignIds: [],
  studios: [],
  statuses: [],
  hostIds: [],
  supportIds: [],
  technicalIds: [],
  operationalRoles: [],
  staffingStates: [],
  registrationStates: [],
  hasImportedStaffing: false,
  time: 'all',
  customFrom: '',
  customTo: '',
}

const shift = (id: string, overrides: Partial<Shift> = {}) => ({
  id,
  date: '2026-09-15',
  start_time: '10:00',
  end_time: '12:00',
  brand_id: 'brand-a',
  platform_id: 'platform-a',
  campaign_id: 'campaign-a',
  title: `Shift ${id}`,
  status: 'scheduled',
  studio: 'Studio A',
  ...overrides,
}) as Shift

const context = (currentDate = new Date('2026-09-15T12:00:00Z')) => ({
  currentDate,
  today: '2026-09-15',
  brands: [{ id: 'brand-a', name: 'Brand A' }, { id: 'brand-b', name: 'Brand B' }] as never,
  platforms: [{ id: 'platform-a', name: 'Platform A' }, { id: 'platform-b', name: 'Platform B' }] as never,
  campaigns: [{ id: 'campaign-a', name: 'Campaign A' }, { id: 'campaign-b', name: 'Campaign B' }] as never,
  registrations: [],
})

test('time scopes support all, today, current week, current month and custom ranges', () => {
  const date = new Date('2026-09-15T12:00:00Z')
  assert.deepEqual(calendarTimeScope('all', date), { valid: true })
  assert.deepEqual(calendarTimeScope('today', date, '', '', '2026-09-15'), { from: '2026-09-15', to: '2026-09-15', valid: true })
  assert.deepEqual(calendarTimeScope('current_week', date), { from: '2026-09-13', to: '2026-09-19', valid: true })
  assert.deepEqual(calendarTimeScope('current_month', date), { from: '2026-09-01', to: '2026-09-30', valid: true })
  assert.deepEqual(calendarTimeScope('custom', date, '2026-09-10', '2026-09-20'), { from: '2026-09-10', to: '2026-09-20', valid: true })
  assert.equal(calendarTimeScope('custom', date, '', '2026-09-20').valid, false)
  assert.equal(calendarTimeScope('custom', date, '2026-09-20', '2026-09-10').valid, false)
})

test('time filtering is inclusive, business-local today, and follows currentDate', () => {
  const shifts = [
    shift('august', { date: '2026-08-31' }),
    shift('september-start', { date: '2026-09-01' }),
    shift('today', { date: '2026-09-15' }),
    shift('september-end', { date: '2026-09-30' }),
    shift('october', { date: '2026-10-01' }),
  ]
  assert.equal(filterCalendarShifts(shifts, baseFilters, '', context()).length, shifts.length)
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, time: 'current_month' }, '', context()).map(s => s.id), ['september-start', 'today', 'september-end'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, time: 'today' }, '', context()).map(s => s.id), ['today'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, time: 'custom', customFrom: '2026-09-30', customTo: '2026-10-01' }, '', context()).map(s => s.id), ['september-end', 'october'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, time: 'current_month' }, '', context(new Date('2026-10-10T12:00:00Z'))).map(s => s.id), ['october'])
})

test('List defaults to current month while explicit All Time and Custom Range remain available', () => {
  const shifts = [
    shift('august', { date: '2026-08-31' }),
    shift('september', { date: '2026-09-15' }),
    shift('october', { date: '2026-10-01' }),
  ]
  const listDefaultFilters = { ...baseFilters, time: effectiveListTimeFilter(baseFilters.time) }
  assert.deepEqual(filterCalendarShifts(shifts, listDefaultFilters, '', context()).map(item => item.id), ['september'])
  assert.equal(effectiveListTimeFilter('all', 'all'), 'all')
  assert.equal(effectiveListTimeFilter('all', 'custom'), 'custom')
  assert.deepEqual(
    filterCalendarShifts(shifts, { ...baseFilters, time: effectiveListTimeFilter('all', 'custom'), customFrom: '2026-08-31', customTo: '2026-10-01' }, '', context()).map(item => item.id),
    ['august', 'september', 'october'],
  )
})

test('studio normalization and options deduplicate case/whitespace and include unassigned values', () => {
  assert.equal(normalizeStudio('  STUDIO   A  '), 'studio a')
  const options = buildStudioFilterOptions([
    shift('one', { studio: 'Studio A' }),
    shift('two', { studio: ' STUDIO   A ' }),
    shift('three', { studio: null }),
    shift('four', { studio: undefined }),
    shift('five', { studio: '   ' }),
    shift('six', { studio: 'Studio B' }),
  ])
  assert.deepEqual(options, [
    { value: 'studio a', label: 'Studio A' },
    { value: 'studio b', label: 'Studio B' },
    { value: UNASSIGNED_STUDIO_FILTER, label: 'Unassigned' },
  ])
})

test('studio filter treats unassigned values consistently', () => {
  const shifts = [
    shift('assigned', { studio: 'Studio A' }),
    shift('case', { studio: ' studio   a ' }),
    shift('null', { studio: null }),
    shift('undefined', { studio: undefined }),
    shift('blank', { studio: '  ' }),
  ]
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, studios: ['studio a'] }, '', context()).map(s => s.id), ['assigned', 'case'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, studios: [UNASSIGNED_STUDIO_FILTER] }, '', context()).map(s => s.id), ['null', 'undefined', 'blank'])
})

test('time, studio, existing dimensions and baseline search compose with AND semantics', () => {
  const shifts = [
    shift('match', { date: '2026-09-15', studio: 'AI', brand_id: 'brand-a', platform_id: 'platform-a' }),
    shift('wrong-studio', { date: '2026-09-15', studio: 'Main', brand_id: 'brand-a', platform_id: 'platform-a' }),
    shift('wrong-brand', { date: '2026-09-15', studio: 'AI', brand_id: 'brand-b', platform_id: 'platform-a' }),
    shift('wrong-time', { date: '2026-10-01', studio: 'AI', brand_id: 'brand-a', platform_id: 'platform-a' }),
  ]
  const filters = { ...baseFilters, time: 'current_month' as const, studios: ['ai'], brandIds: ['brand-a'], platformIds: ['platform-a'] }
  assert.deepEqual(filterCalendarShifts(shifts, filters, 'Brand A', context()).map(s => s.id), ['match'])
  assert.deepEqual(filterCalendarShifts(shifts, filters, 'NO_MATCH', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, baseFilters, 'AI', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, baseFilters, 'Campaign A', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, baseFilters, ' Brand A ', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, studios: ['ai'] }, '', context()).map(s => s.id), ['match', 'wrong-brand', 'wrong-time'])
})

test('existing role and status filters remain supported and invalid custom ranges return no misleading rows', () => {
  const shifts = [
    shift('host', { host_id: 'user-1', status: 'live' }),
    shift('other', { host_id: 'user-2', status: 'scheduled' }),
  ]
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, hostIds: ['user-1'], statuses: ['live'] }, '', context()).map(s => s.id), ['host'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, time: 'custom', customFrom: '2026-09-20', customTo: '2026-09-10' }, '', context()).map(s => s.id), [])
})

test('Calendar preserves global view filtering and scopes List-only work separately', () => {
  const source = readFileSync(new URL('../components/features/calendar/CalendarView.tsx', import.meta.url), 'utf8')
  assert.match(source, /const filteredShifts = React\.useMemo\(/)
  assert.match(source, /const listShifts = React\.useMemo\(/)
  assert.match(source, /effectiveListTimeFilter\(filters\.time, listTimeOverride\)/)
  assert.match(source, /const calendarScopeShifts = React\.useMemo\(\s+\(\) => shiftsInCalendarScope\(view === 'list' \? listShifts : filteredShifts/)
  assert.match(source, /const exportShifts = view === 'list' \? listShifts : filteredShifts/)
  assert.match(source, /targetShifts = scope === 'selected'\s+\? exportShifts\.filter/)
  assert.match(source, /<MonthView currentDate=\{currentDate\} shifts=\{filteredShifts\}/)
  assert.match(source, /<ListView\s+shifts=\{listShifts\}/)
  assert.match(source, /if \(view === 'month' \|\| view === 'list'\)/)
  assert.match(source, /if \(listTimeFilter === 'all'\) return t\('allShifts'\)/)
  assert.match(source, /pendingRegistrationsInScope\(registrations, calendarScopeShifts\)/)
  assert.match(source, /brandIds: \[\]/)
  assert.match(source, /studios: \[\]/)
})

test('List uses the shared ShiftCard contract and keeps selection and registration props wired', () => {
  const source = readFileSync(new URL('../components/features/calendar/ListView.tsx', import.meta.url), 'utf8')
  assert.match(source, /const brandsById = React\.useMemo\(\(\) => new Map/)
  assert.match(source, /const context: CalendarFilterContext =/)
  assert.match(source, /<ShiftCard shift=\{\(shift\)\} variant="expanded"/)
  assert.match(source, /onToggleSelectShift\(shift\.id\)/)
  assert.match(source, /onRegister=\{role => onRegister\(shift\.id, role\)\}/)
  assert.doesNotMatch(source, /registrations\.filter\(r => r\.shift_id === shift\.id\)/)
})

test('secondary filters use canonical role, staffing, registration, and imported metadata semantics', () => {
  const shifts = [
    shift('host-required', { required_host_count: 1, required_support_count: 0, required_technical_count: 0 }),
    shift('support-required', { required_host_count: 0, required_support_count: 1, required_technical_count: 0 }),
    shift('fully-staffed', { required_host_count: 1, required_support_count: 0, required_technical_count: 0 }),
    shift('pending-registration', { required_host_count: 1, required_support_count: 0, required_technical_count: 0 }),
    shift('imported-name', { required_host_count: 1, required_support_count: 0, required_technical_count: 0 }),
    shift('legacy-import', { required_host_count: 1, required_support_count: 0, required_technical_count: 0 }),
  ]
  const registrations = [
    { id: 'approved-host', shift_id: 'fully-staffed', user_id: 'user-1', operational_role: 'host', status: 'approved', source: 'self_registration' },
    { id: 'pending-host', shift_id: 'pending-registration', user_id: 'user-2', operational_role: 'host', status: 'pending', source: 'self_registration' },
    { id: 'imported-name', shift_id: 'imported-name', user_id: 'user-3', operational_role: 'host', status: 'approved', source: 'self_registration', imported_name: 'Imported Host' },
    { id: 'legacy-import', shift_id: 'legacy-import', user_id: 'user-4', operational_role: 'host', status: 'approved', source: 'legacy_assignment' },
  ] as never
  const filter = (overrides: Partial<CalendarFilterState>) => filterCalendarShifts(
    shifts,
    { ...baseFilters, ...overrides },
    '',
    { ...context(), registrations },
  ).map(item => item.id)

  assert.deepEqual(filter({ operationalRoles: [] }), shifts.map(item => item.id))
  assert.deepEqual(filter({ operationalRoles: ['support'] }), ['support-required'])
  assert.deepEqual(filter({ staffingStates: ['fully_staffed'] }), ['fully-staffed', 'imported-name', 'legacy-import'])
  assert.deepEqual(filter({ staffingStates: ['missing_staff'] }), ['host-required', 'support-required', 'pending-registration'])
  assert.deepEqual(filter({ registrationStates: ['pending'] }), ['pending-registration'])
  assert.deepEqual(filter({ hasImportedStaffing: true }), ['imported-name', 'legacy-import'])
  assert.deepEqual(filter({ operationalRoles: ['host'], staffingStates: ['fully_staffed'], registrationStates: ['approved'], hasImportedStaffing: true }), ['imported-name', 'legacy-import'])
})

test('filter chips isolate each dimension while Clear All remains global', () => {
  const source = readFileSync(new URL('../components/features/calendar/CalendarView.tsx', import.meta.url), 'utf8')
  assert.match(source, /time: 'all', customFrom: '', customTo: ''/)
  assert.match(source, /operationalRoles: \[\]/)
  assert.match(source, /staffingStates: \[\]/)
  assert.match(source, /registrationStates: \[\]/)
  assert.match(source, /hasImportedStaffing: false/)
  assert.match(source, /onClearAll=\{clearFilters\}/)
})

test('categorical filters use OR within a dimension, AND across dimensions, and empty means all', () => {
  const shifts = [
    shift('a', { brand_id: 'brand-a', platform_id: 'platform-a', status: 'scheduled' }),
    shift('b', { brand_id: 'brand-b', platform_id: 'platform-a', status: 'live' }),
    shift('c', { brand_id: 'brand-c', platform_id: 'platform-b', status: 'live' }),
  ]
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, brandIds: ['brand-a', 'brand-b'] }, '', context()).map(item => item.id), ['a', 'b'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, brandIds: ['brand-a', 'brand-b'], platformIds: ['platform-a'], statuses: ['live'] }, '', context()).map(item => item.id), ['b'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, brandIds: [], platformIds: [], statuses: [] }, '', context()).map(item => item.id), ['a', 'b', 'c'])
})
