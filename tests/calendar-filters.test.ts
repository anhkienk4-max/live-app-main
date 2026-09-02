import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Shift } from '../lib/types/database.types.ts'
import {
  buildStudioFilterOptions,
  calendarTimeScope,
  filterCalendarShifts,
  normalizeStudio,
  UNASSIGNED_STUDIO_FILTER,
  type CalendarFilterState,
} from '../lib/utils/calendarFilters.ts'

const baseFilters: CalendarFilterState = {
  brand: 'all',
  platform: 'all',
  campaign: 'all',
  studio: 'all',
  status: 'all',
  host: 'all',
  support: 'all',
  technical: 'all',
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
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, studio: 'studio a' }, '', context()).map(s => s.id), ['assigned', 'case'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, studio: UNASSIGNED_STUDIO_FILTER }, '', context()).map(s => s.id), ['null', 'undefined', 'blank'])
})

test('time, studio, existing dimensions and baseline search compose with AND semantics', () => {
  const shifts = [
    shift('match', { date: '2026-09-15', studio: 'AI', brand_id: 'brand-a', platform_id: 'platform-a' }),
    shift('wrong-studio', { date: '2026-09-15', studio: 'Main', brand_id: 'brand-a', platform_id: 'platform-a' }),
    shift('wrong-brand', { date: '2026-09-15', studio: 'AI', brand_id: 'brand-b', platform_id: 'platform-a' }),
    shift('wrong-time', { date: '2026-10-01', studio: 'AI', brand_id: 'brand-a', platform_id: 'platform-a' }),
  ]
  const filters = { ...baseFilters, time: 'current_month' as const, studio: 'ai', brand: 'brand-a', platform: 'platform-a' }
  assert.deepEqual(filterCalendarShifts(shifts, filters, 'Brand A', context()).map(s => s.id), ['match'])
  assert.deepEqual(filterCalendarShifts(shifts, filters, 'NO_MATCH', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, baseFilters, 'AI', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, baseFilters, 'Campaign A', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, baseFilters, ' Brand A ', context()).map(s => s.id), [])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, studio: 'ai' }, '', context()).map(s => s.id), ['match', 'wrong-brand', 'wrong-time'])
})

test('existing role and status filters remain supported and invalid custom ranges return no misleading rows', () => {
  const shifts = [
    shift('host', { host_id: 'user-1', status: 'live' }),
    shift('other', { host_id: 'user-2', status: 'scheduled' }),
  ]
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, host: 'user-1', status: 'live' }, '', context()).map(s => s.id), ['host'])
  assert.deepEqual(filterCalendarShifts(shifts, { ...baseFilters, time: 'custom', customFrom: '2026-09-20', customTo: '2026-09-10' }, '', context()).map(s => s.id), [])
})

test('Calendar uses one filtered dataset for stats, views, export, selection and pending scope', () => {
  const source = readFileSync(new URL('../components/features/calendar/CalendarView.tsx', import.meta.url), 'utf8')
  assert.match(source, /const filteredShifts = React\.useMemo\(/)
  assert.match(source, /total: filteredShifts\.length/)
  assert.match(source, /targetShifts = scope === 'selected'\s+\? filteredShifts\.filter/)
  assert.match(source, /<MonthView currentDate=\{currentDate\} shifts=\{filteredShifts\}/)
  assert.match(source, /<ListView\s+shifts=\{filteredShifts\}/)
  assert.match(source, /pendingRegistrationsInScope\(registrations, calendarScopeShifts\)/)
  assert.match(source, /time: 'all'/)
  assert.match(source, /studio: 'all'/)
})
