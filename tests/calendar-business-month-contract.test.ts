import assert from 'node:assert/strict'
import test from 'node:test'
import type { Shift } from '../lib/types/database.types.ts'
import type { ShiftListPage } from '../lib/services/operationsPageService.ts'
import { shiftService } from '../lib/services/dataService.ts'
import { readCalendarWindow } from '../lib/services/calendarWindow.ts'
import { calendarAuthorityScope, calendarDataScope } from '../lib/utils/calendarRange.ts'
import { filterCalendarShifts, type CalendarFilterState } from '../lib/utils/calendarFilters.ts'

const dates = [
  ...Array.from({ length: 155 }, (_, i) => String(1 + (i % 21)).padStart(2, '0')),
  ...Array.from({ length: 25 }, (_, i) => String(22 + (i % 3)).padStart(2, '0')),
  ...Array.from({ length: 52 }, (_, i) => String(25 + (i % 7)).padStart(2, '0')),
]
const shifts = dates.map((day, index) => ({
  id: 'synthetic-shift-' + index,
  date: '2026-10-' + day,
  start_time: '10:00',
  end_time: '12:00',
  status: 'completed',
  brand_id: 'synthetic-brand',
  platform_id: 'synthetic-platform',
  studio: '',
  title: 'Synthetic shift',
}) as Shift).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

test('October month window retains prior days after fetching every bounded page', async () => {
  const original = shiftService.getCalendarPage
  let reads = 0
  shiftService.getCalendarPage = async ({ page, pageSize }): Promise<ShiftListPage> => {
    reads++
    return {
      items: shifts.slice((page - 1) * pageSize, page * pageSize),
      total: shifts.length,
      page,
      pageSize,
      ownerKey: 'synthetic-admin:admin',
      registrations: [],
      pendingTotal: 0,
      pendingPage: 1,
      pendingIds: [],
      studios: [],
    }
  }
  try {
    const period = calendarAuthorityScope(calendarDataScope('month', new Date('2026-10-22T12:00:00'), 'all'))
    const snapshots: number[] = []
    const complete = await readCalendarWindow({ from: period.startDate, to: period.endDate }, undefined, first => {
      snapshots.push(first.items.length)
    })
    const filters: CalendarFilterState = {
      brandIds: [], platformIds: [], campaignIds: [], studios: [], statuses: [],
      hostIds: [], supportIds: [], technicalIds: [], operationalRoles: [], staffingStates: [],
      registrationStates: [], hasImportedStaffing: false,
      time: 'all', customFrom: '', customTo: '',
    }
    const visible = filterCalendarShifts(complete.items, filters, '', {
      currentDate: new Date('2026-10-22T12:00:00'),
      brands: [], platforms: [], registrations: [],
    })
    assert.equal(complete.total, 232)
    assert.equal(complete.items.length, 232)
    assert.equal(visible.length, 232)
    assert.equal(visible.filter(s => s.date < '2026-10-22').length, 155)
    assert.equal(visible.filter(s => s.date >= '2026-10-22' && s.date <= '2026-10-24').length, 25)
    assert.deepEqual(snapshots, [50])
    assert.equal(reads, 5)
  } finally {
    shiftService.getCalendarPage = original
  }
})
