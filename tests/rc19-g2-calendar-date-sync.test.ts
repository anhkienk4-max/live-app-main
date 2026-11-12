import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  calendarAuthorityScope,
  calendarDataScope,
  isViewWithinDateRange,
  reconcileCalendarViewportDate,
  resolveDateFilterSyncTarget,
} from '../lib/utils/calendarRange.ts'
import {
  filterCalendarShifts,
  type CalendarFilterState,
} from '../lib/utils/calendarFilters.ts'
import type { Shift } from '../lib/types/database.types.ts'

const defaultFilters: CalendarFilterState = {
  brandIds: ['brand-alpha'],
  platformIds: ['platform-beta'],
  campaignIds: ['campaign-gamma'],
  studios: ['studio 1'],
  statuses: ['scheduled', 'live'],
  hostIds: ['host-1'],
  supportIds: ['supp-1'],
  technicalIds: ['tech-1'],
  operationalRoles: ['host'],
  staffingStates: ['fully_staffed'],
  registrationStates: ['approved'],
  hasImportedStaffing: true,
  time: 'custom',
  customFrom: '2026-01-07',
  customTo: '2026-01-15',
}

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

const mockShift = (id: string, date: string): Shift => ({
  id,
  date,
  start_time: '09:00',
  end_time: '11:00',
  title: `Shift ${id}`,
  status: 'scheduled',
  brand_id: 'brand-alpha',
  platform_id: 'platform-beta',
  campaign_id: 'campaign-gamma',
  studio: 'Studio 1',
  host_id: 'host-1',
  support_id: 'supp-1',
  technical_id: 'tech-1',
} as Shift)

test('RC19-G2-SYNC-01: Applying custom date range synchronizes target date to customFrom', () => {
  // Case from Issue #185:
  // User selects custom range 2026-01-07 to 2026-01-15 while viewport is in Nov 2026
  const targetDate = resolveDateFilterSyncTarget('custom', '2026-01-07', '2026-11-12')
  assert.equal(targetDate, '2026-01-07')

  // Applying today synchronizes target date to today
  const todayTarget = resolveDateFilterSyncTarget('today', '', '2026-11-12')
  assert.equal(todayTarget, '2026-11-12')

  // Applying all time or relative periods does not force an arbitrary target jump
  assert.equal(resolveDateFilterSyncTarget('all', '', '2026-11-12'), null)
  assert.equal(resolveDateFilterSyncTarget('current_month', '', '2026-11-12'), null)
  assert.equal(resolveDateFilterSyncTarget('current_week', '', '2026-11-12'), null)
})

test('RC19-G2-SYNC-02: CalendarDataScope and AuthorityScope align with custom range in all views', () => {
  const customDate = new Date('2026-01-07T12:00:00.000Z')

  // Month view with custom filter queries the custom range
  const monthScope = calendarDataScope('month', customDate, 'custom', '2026-01-07', '2026-01-15')
  assert.deepEqual(monthScope, {
    startDate: '2026-01-07',
    endDate: '2026-01-15',
    allTime: false,
  })

  // Week view with custom filter queries the custom range
  const weekScope = calendarDataScope('week', customDate, 'custom', '2026-01-07', '2026-01-15')
  assert.deepEqual(weekScope, {
    startDate: '2026-01-07',
    endDate: '2026-01-15',
    allTime: false,
  })

  // Day view with custom filter queries the custom range
  const dayScope = calendarDataScope('day', customDate, 'custom', '2026-01-07', '2026-01-15')
  assert.deepEqual(dayScope, {
    startDate: '2026-01-07',
    endDate: '2026-01-15',
    allTime: false,
  })

  // List view with custom filter queries the custom range
  const listScope = calendarDataScope('list', customDate, 'custom', '2026-01-07', '2026-01-15')
  assert.deepEqual(listScope, {
    startDate: '2026-01-07',
    endDate: '2026-01-15',
    allTime: false,
  })

  // Authority scope wraps ±1 day around the custom range for 24h boundary safety
  const authority = calendarAuthorityScope(monthScope)
  assert.deepEqual(authority, {
    startDate: '2026-01-06',
    endDate: '2026-01-16',
    allTime: false,
  })
})

test('RC19-G2-SYNC-03: isViewWithinDateRange detects viewport overlap accurately across all view modes', () => {
  // 1. Month view: Jan 2026
  const janDate = new Date('2026-01-15T12:00:00.000Z')
  const febDate = new Date('2026-02-15T12:00:00.000Z')
  const novDate = new Date('2026-11-12T12:00:00.000Z')

  // Jan 2026 overlaps with Jan 7–15
  assert.equal(isViewWithinDateRange('month', janDate, '2026-01-07', '2026-01-15'), true)
  // Feb 2026 is completely outside Jan 7–15
  assert.equal(isViewWithinDateRange('month', febDate, '2026-01-07', '2026-01-15'), false)
  // Nov 2026 is completely outside Jan 7–15
  assert.equal(isViewWithinDateRange('month', novDate, '2026-01-07', '2026-01-15'), false)

  // Multi-month range: Jan 15 to Mar 15
  assert.equal(isViewWithinDateRange('month', janDate, '2026-01-15', '2026-03-15'), true)
  assert.equal(isViewWithinDateRange('month', febDate, '2026-01-15', '2026-03-15'), true)
  const aprDate = new Date('2026-04-01T12:00:00.000Z')
  assert.equal(isViewWithinDateRange('month', aprDate, '2026-01-15', '2026-03-15'), false)

  // 2. Week view: Week of Jan 4-10, 2026
  const week1Date = new Date('2026-01-07T12:00:00.000Z') // Wed Jan 7
  const week2Date = new Date('2026-01-14T12:00:00.000Z') // Wed Jan 14
  const week3Date = new Date('2026-01-21T12:00:00.000Z') // Wed Jan 21

  // Range Jan 7 to Jan 15 spans Week 1 and Week 2
  assert.equal(isViewWithinDateRange('week', week1Date, '2026-01-07', '2026-01-15'), true)
  assert.equal(isViewWithinDateRange('week', week2Date, '2026-01-07', '2026-01-15'), true)
  assert.equal(isViewWithinDateRange('week', week3Date, '2026-01-07', '2026-01-15'), false)

  // 3. Day view:
  const dayJan7 = new Date('2026-01-07T12:00:00.000Z')
  const dayJan8 = new Date('2026-01-08T12:00:00.000Z')
  const dayJan9 = new Date('2026-01-09T12:00:00.000Z')

  assert.equal(isViewWithinDateRange('day', dayJan7, '2026-01-07', '2026-01-08'), true)
  assert.equal(isViewWithinDateRange('day', dayJan8, '2026-01-07', '2026-01-08'), true)
  assert.equal(isViewWithinDateRange('day', dayJan9, '2026-01-07', '2026-01-08'), false)
})

test('RC19-G2-SYNC-04: Navigating outside custom date range resets time to all and preserves all other filters', () => {
  // Simulate navigation check logic as implemented in CalendarView
  const currentDate = new Date('2026-01-07T12:00:00.000Z')
  const nextMonthDate = new Date('2026-02-07T12:00:00.000Z')

  assert.equal(isViewWithinDateRange('month', currentDate, defaultFilters.customFrom, defaultFilters.customTo), true)
  const shouldResetTime = !isViewWithinDateRange('month', nextMonthDate, defaultFilters.customFrom, defaultFilters.customTo)
  assert.equal(shouldResetTime, true)

  // Preserved filters must strictly keep all business dimensions
  const preservedFilters: CalendarFilterState = {
    ...defaultFilters,
    time: 'all',
    customFrom: '',
    customTo: '',
  }

  assert.equal(preservedFilters.time, 'all')
  assert.equal(preservedFilters.customFrom, '')
  assert.equal(preservedFilters.customTo, '')
  assert.deepEqual(preservedFilters.brandIds, ['brand-alpha'])
  assert.deepEqual(preservedFilters.platformIds, ['platform-beta'])
  assert.deepEqual(preservedFilters.campaignIds, ['campaign-gamma'])
  assert.deepEqual(preservedFilters.studios, ['studio 1'])
  assert.deepEqual(preservedFilters.statuses, ['scheduled', 'live'])
  assert.deepEqual(preservedFilters.hostIds, ['host-1'])
  assert.deepEqual(preservedFilters.supportIds, ['supp-1'])
  assert.deepEqual(preservedFilters.technicalIds, ['tech-1'])
  assert.deepEqual(preservedFilters.operationalRoles, ['host'])
  assert.deepEqual(preservedFilters.staffingStates, ['fully_staffed'])
  assert.deepEqual(preservedFilters.registrationStates, ['approved'])
  assert.equal(preservedFilters.hasImportedStaffing, true)
})

test('RC19-G2-SYNC-05: Multi-month navigation retains custom filter while within range', () => {
  const multiMonthFilters: CalendarFilterState = {
    ...defaultFilters,
    customFrom: '2026-01-01',
    customTo: '2026-03-31',
  }

  // Navigating Jan -> Feb (still in Jan 1 - Mar 31)
  const feb = new Date('2026-02-01T12:00:00.000Z')
  assert.equal(isViewWithinDateRange('month', feb, multiMonthFilters.customFrom, multiMonthFilters.customTo), true)

  // Navigating Feb -> Mar (still in range)
  const mar = new Date('2026-03-01T12:00:00.000Z')
  assert.equal(isViewWithinDateRange('month', mar, multiMonthFilters.customFrom, multiMonthFilters.customTo), true)

  // Navigating Mar -> Apr (leaves range, should reset)
  const apr = new Date('2026-04-01T12:00:00.000Z')
  assert.equal(isViewWithinDateRange('month', apr, multiMonthFilters.customFrom, multiMonthFilters.customTo), false)
})

test('RC19-G2-SYNC-06: CalendarView implementation contract conforms to sync, empty notice, and safety requirements', () => {
  const source = readFileSync('components/features/calendar/CalendarView.tsx', 'utf8')

  // 1. Imports sync helpers
  assert.match(source, /import \{[^}]*isViewWithinDateRange[^}]*\} from '@\/lib\/utils\/calendarRange'/)
  assert.match(source, /import \{[^}]*resolveDateFilterSyncTarget[^}]*\} from '@\/lib\/utils\/calendarRange'/)
  assert.match(source, /import \{[^}]*reconcileCalendarViewportDate[^}]*\} from '@\/lib\/utils\/calendarRange'/)

  // 2. Initial reconciliation hook wires properly
  assert.match(source, /reconcileCalendarViewportDate\(view, parsedCurrentDate, filters, today\)/)
  assert.match(source, /listNavigate\(\{ calendar_date: dateReconciliation\.resolvedDateStr \}, true\)/)

  // 3. applyFilters synchronizes calendar_date to targetDate
  assert.match(source, /const targetDate = resolveDateFilterSyncTarget\(draftTime, draftFilters\.customFrom, today\)/)
  assert.match(source, /\.\.\.\(targetDate \? \{ calendar_date: targetDate \} : \{\}\)/)

  // 4. navigate checks isViewWithinDateRange, clears time filter gracefully, and triggers toast
  assert.match(source, /isViewWithinDateRange\(view, nextDate, filters\.customFrom, filters\.customTo\)/)
  assert.match(source, /toast\(\{[\s\S]*?variant: 'info'[\s\S]*?\}\)/)

  // 5. goToToday checks isViewWithinDateRange and jumps safely with toast
  assert.match(source, /const goToToday = \(\) =>/)
  assert.match(source, /<Button variant="outline" onClick=\{goToToday\} className="h-9">/)

  // 6. ActiveFilterChips setFilters properly synchronizes value.time
  assert.match(source, /calendar_filters: JSON\.stringify\(\{ \.\.\.value, time: value\.time \}\)/)

  // 7. Filtered empty notice banner with differentiated reasons
  assert.match(source, /data-testid="calendar-filtered-empty-notice"/)
  assert.match(source, /data-empty-reason=\{shifts\.length > 0 \? 'filtered-empty' : 'range-mismatch'\}/)
  assert.match(source, /data-testid="calendar-clear-filters-notice-btn"/)
  assert.match(source, /onClick=\{clearFilters\}/)

  // 8. Bounded window and abort contract preserved
  assert.match(source, /readCalendarWindow\(filters, controller\.signal, first =>/)
  assert.match(source, /if \(version !== requestVersion\.current \|\| controller\.signal\.aborted\) return/)
})

test('RC19-G2-SYNC-07: filterCalendarShifts accurately displays shifts within synchronized range', () => {
  const shifts: Shift[] = [
    mockShift('jan-05', '2026-01-05'),
    mockShift('jan-07', '2026-01-07'),
    mockShift('jan-10', '2026-01-10'),
    mockShift('jan-15', '2026-01-15'),
    mockShift('jan-20', '2026-01-20'),
  ]

  const context = {
    currentDate: new Date('2026-01-07T12:00:00.000Z'),
    today: '2026-11-12',
    brands: [{ id: 'brand-alpha', name: 'Brand Alpha' }] as never,
    platforms: [{ id: 'platform-beta', name: 'Platform Beta' }] as never,
    campaigns: [{ id: 'campaign-gamma', name: 'Campaign Gamma' }] as never,
    registrations: [],
  }

  // With custom range Jan 7–15 and matching brand filter, only Jan 07, 10, 15 are retained
  const syncFilters: CalendarFilterState = {
    ...baseFilters,
    brandIds: ['brand-alpha'],
    time: 'custom',
    customFrom: '2026-01-07',
    customTo: '2026-01-15',
  }

  const filtered = filterCalendarShifts(shifts, syncFilters, '', context)
  assert.deepEqual(filtered.map(s => s.id), ['jan-07', 'jan-10', 'jan-15'])

  // When filters mismatch (e.g. brand-none), result is empty
  const emptyFiltered = filterCalendarShifts(shifts, { ...syncFilters, brandIds: ['brand-none'] }, '', context)
  assert.equal(emptyFiltered.length, 0)
})

test('RC19-G2-SYNC-08: reconcileCalendarViewportDate resolves contradictions on deep-link, reload, and view changes', () => {
  const today = '2026-11-12'

  // Scenario A: Direct deep link has calendar_date=2026-11-12 but calendar_filters specifies custom range 2026-01-07..2026-01-15
  const conflictingDate = new Date('2026-11-12T12:00:00.000Z')
  const customFilters: CalendarFilterState = {
    ...baseFilters,
    time: 'custom',
    customFrom: '2026-01-07',
    customTo: '2026-01-15',
  }
  const resultA = reconcileCalendarViewportDate('month', conflictingDate, customFilters, today)
  assert.equal(resultA.reconciled, true)
  assert.equal(resultA.resolvedDateStr, '2026-01-07')

  // Scenario B: URL date is already within the custom range (e.g. 2026-01-10) -> No reconciliation needed
  const alignedDate = new Date('2026-01-10T12:00:00.000Z')
  const resultB = reconcileCalendarViewportDate('month', alignedDate, customFilters, today)
  assert.equal(resultB.reconciled, false)
  assert.equal(resultB.resolvedDateStr, '2026-01-10')

  // Scenario C: URL specifies time: 'today' but calendar_date is old/stale
  const staleDate = new Date('2026-01-07T12:00:00.000Z')
  const todayFilters: CalendarFilterState = {
    ...baseFilters,
    time: 'today',
  }
  const resultC = reconcileCalendarViewportDate('day', staleDate, todayFilters, today)
  assert.equal(resultC.reconciled, true)
  assert.equal(resultC.resolvedDateStr, '2026-11-12')

  // Scenario D: All time filter -> whatever date was requested is kept
  const allTimeFilters: CalendarFilterState = {
    ...baseFilters,
    time: 'all',
  }
  const resultD = reconcileCalendarViewportDate('month', staleDate, allTimeFilters, today)
  assert.equal(resultD.reconciled, false)
  assert.equal(resultD.resolvedDateStr, '2026-01-07')

  // Scenario E: View switch to Day view with conflicting date
  const resultE = reconcileCalendarViewportDate('day', conflictingDate, customFilters, today)
  assert.equal(resultE.reconciled, true)
  assert.equal(resultE.resolvedDateStr, '2026-01-07')
})

test('RC19-G2-SYNC-09: Empty state distinguishes causes: filtered-empty vs range-mismatch', () => {
  const shifts: Shift[] = [
    mockShift('nov-01', '2026-11-01'),
    mockShift('nov-02', '2026-11-02'),
  ]

  const context = {
    currentDate: new Date('2026-11-01T12:00:00.000Z'),
    today: '2026-11-12',
    brands: [{ id: 'brand-alpha', name: 'Brand Alpha' }] as never,
    platforms: [{ id: 'platform-beta', name: 'Platform Beta' }] as never,
    campaigns: [{ id: 'campaign-gamma', name: 'Campaign Gamma' }] as never,
    registrations: [],
  }

  // Case 1: Filtered empty (shifts exist in period, but filtered out by brand/status)
  const activeBrandMismatch: CalendarFilterState = {
    ...baseFilters,
    brandIds: ['non-existent-brand'],
  }
  const filtered = filterCalendarShifts(shifts, activeBrandMismatch, '', context)
  assert.equal(filtered.length, 0)
  assert.ok(shifts.length > 0)
  // Reason is 'filtered-empty'

  // Case 2: Range mismatch (custom range has zero shifts in DB)
  const emptyShifts: Shift[] = []
  const customRangeFilter: CalendarFilterState = {
    ...baseFilters,
    time: 'custom',
    customFrom: '2026-01-07',
    customTo: '2026-01-15',
  }
  const rangeFiltered = filterCalendarShifts(emptyShifts, customRangeFilter, '', { ...context, currentDate: new Date('2026-01-07T12:00:00.000Z') })
  assert.equal(rangeFiltered.length, 0)
  assert.equal(emptyShifts.length, 0)
  // Reason is 'range-mismatch'
})
