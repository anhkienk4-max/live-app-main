import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { currentUserService, shiftService } from '../lib/services/dataService.ts'
import type { Shift } from '../lib/types/database.types.ts'
import { getVisibleShiftSelection, toggleAllVisibleShiftSelection } from '../lib/utils/calendarFilters.ts'

const admin = {
  id: '1',
  email: 'admin@example.test',
  full_name: 'Admin',
  role: 'admin' as const,
  system_permission: 'admin' as const,
  operational_roles: [],
  status: 'active' as const,
  account_status: 'active' as const,
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

function shiftData(title: string, date: string): Omit<Shift, 'id' | 'created_at' | 'updated_at'> {
  return {
    title,
    date,
    start_time: '09:00',
    end_time: '11:00',
    brand_id: 'b1',
    platform_id: 'p1',
    status: 'scheduled',
    registration_locked: false,
    allow_multi_role: false,
  }
}

async function withMockEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    currentUserService.bindAuthenticatedUser(admin)
    await run()
  } finally {
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

const visibleShifts = [{ id: 'shift-a' }, { id: 'shift-b' }]
const calendarSource = readFileSync(new URL('../components/features/calendar/CalendarView.tsx', import.meta.url), 'utf8')
const exportActionsSource = calendarSource.slice(
  calendarSource.indexOf("{hasPermission(currentUser, 'shifts.export') && ("),
  calendarSource.indexOf('{canSelectListShifts && ('),
)
const deleteActionsSource = calendarSource.slice(
  calendarSource.indexOf("{view === 'list' && currentUser && hasPermission(currentUser, 'shifts.delete') && ("),
  calendarSource.indexOf("{currentUser && hasPermission(currentUser, 'shifts.approve_registration') && ("),
)

test('export-only users can bulk select and export without exposing delete', () => {
  assert.match(calendarSource, /const canSelectListShifts = view === 'list' && !!currentUser && \([\s\S]{0,120}'shifts\.export'\) \|\| hasPermission\(currentUser, 'shifts\.delete'\)/)
  assert.match(calendarSource, /\{canSelectListShifts && \([\s\S]{0,500}data-testid="toggle-all-visible-shifts"/)
  assert.match(exportActionsSource, /data-testid="export-selected-xlsx"/)
  assert.doesNotMatch(exportActionsSource, /open-bulk-delete-shifts/)
  assert.match(deleteActionsSource, /data-testid="open-bulk-delete-shifts"/)
})

test('delete-only users can bulk select and delete without exposing export', () => {
  assert.match(calendarSource, /const canSelectListShifts = view === 'list' && !!currentUser && \([\s\S]{0,120}'shifts\.delete'\)/)
  assert.match(calendarSource, /\{canSelectListShifts && \([\s\S]{0,500}data-testid="toggle-all-visible-shifts"/)
  assert.match(deleteActionsSource, /data-testid="open-bulk-delete-shifts"/)
  assert.doesNotMatch(deleteActionsSource, /export-selected-(?:xlsx|csv)/)
  assert.match(exportActionsSource, /data-testid="export-selected-xlsx"/)
})

test('users without export or delete do not receive list selection controls', () => {
  assert.match(calendarSource, /selectedShiftIds=\{canSelectListShifts \? selectedVisibleShiftIdSet : undefined\}/)
  assert.match(calendarSource, /onToggleSelectShift=\{canSelectListShifts \? toggleSelectShift : undefined\}/)
})

test('select all selects only visible filtered shifts', () => {
  const selected = toggleAllVisibleShiftSelection(visibleShifts, new Set(['hidden-shift']))
  assert.deepEqual([...selected], ['shift-a', 'shift-b'])
})

test('select all toggles to deselect all when every visible shift is selected', () => {
  const selected = toggleAllVisibleShiftSelection(visibleShifts, new Set(['shift-a', 'shift-b']))
  assert.deepEqual([...selected], [])
})

test('filter changes drop selected shifts that are no longer visible', () => {
  const selection = getVisibleShiftSelection([{ id: 'shift-b' }], new Set(['shift-a', 'shift-b']))
  assert.deepEqual(selection.selectedVisibleShiftIds, ['shift-b'])
})

test('delete selection contains only currently selected visible shifts', () => {
  const selection = getVisibleShiftSelection(visibleShifts, new Set(['shift-b', 'hidden-shift']))
  assert.deepEqual(selection.selectedVisibleShiftIds, ['shift-b'])

  assert.match(calendarSource, /data-testid="toggle-all-visible-shifts"/)
  assert.match(calendarSource, /aria-checked=\{visibleSelection\.allVisibleSelected \? true : visibleSelection\.partiallySelected \? 'mixed' : false\}/)
  assert.match(calendarSource, /selectedShifts=\{filteredShifts\.filter\(shift => selectedVisibleShiftIdSet\.has\(shift\.id\)\)\}/)
})

test('selected count follows the visible selected set', () => {
  const selection = getVisibleShiftSelection(visibleShifts, new Set(['shift-a', 'hidden-shift']))
  assert.equal(selection.selectedVisibleShiftIds.length, 1)
})

test('selected export remains limited to visible filtered shifts', () => {
  const selection = getVisibleShiftSelection(visibleShifts, new Set(['shift-b', 'hidden-shift']))
  assert.deepEqual(selection.selectedVisibleShiftIds, ['shift-b'])
  assert.match(calendarSource, /scope === 'selected'[\s\S]{0,120}filteredShifts\.filter\(s => selectedVisibleShiftIdSet\.has\(s\.id\)\)/)
})

test('selection state distinguishes none, partial, and all visible', () => {
  const none = getVisibleShiftSelection(visibleShifts, new Set())
  const partial = getVisibleShiftSelection(visibleShifts, new Set(['shift-a']))
  const all = getVisibleShiftSelection(visibleShifts, new Set(['shift-a', 'shift-b']))

  assert.deepEqual([none.partiallySelected, none.allVisibleSelected], [false, false])
  assert.deepEqual([partial.partiallySelected, partial.allVisibleSelected], [true, false])
  assert.deepEqual([all.partiallySelected, all.allVisibleSelected], [false, true])
})

test('bulkRemove with no selection is a no-op', async () => {
  await withMockEnvironment(async () => {
    const result = await shiftService.bulkRemove([], admin.id, 'bulk test')
    assert.deepEqual(result, { outcomes: [], succeeded: 0, failed: 0 })
  })
})

test('bulkRemove deletes one and multiple shifts through canonical remove semantics', async () => {
  await withMockEnvironment(async () => {
    const first = await shiftService.create(shiftData('Bulk One', '2035-01-01'))
    const second = await shiftService.create(shiftData('Bulk Two', '2035-01-02'))
    const result = await shiftService.bulkRemove([first.id, second.id], admin.id, 'bulk test')

    assert.equal(result.succeeded, 2)
    assert.equal(result.failed, 0)
    assert.deepEqual(result.outcomes.map(outcome => outcome.success), [true, true])
    assert.equal(await shiftService.getById(first.id), null)
    assert.equal(await shiftService.getById(second.id), null)
  })
})

test('bulkRemove returns per-shift partial outcomes without weakening single remove', async () => {
  await withMockEnvironment(async () => {
    const existing = await shiftService.create(shiftData('Existing', '2035-01-03'))
    const result = await shiftService.bulkRemove([existing.id, 'missing-shift'], admin.id, 'bulk test')

    assert.equal(result.succeeded, 1)
    assert.equal(result.failed, 1)
    assert.equal(result.outcomes[0].success, true)
    assert.equal(result.outcomes[1].success, false)
    assert.equal(result.outcomes[1].error_message, 'Shift was not found.')

    const preserved = await shiftService.create(shiftData('Single Delete', '2035-01-04'))
    const impact = await shiftService.remove(preserved.id, admin.id, 'single test', preserved.version)
    assert.equal(impact?.action, 'delete')
    assert.equal(await shiftService.getById(preserved.id), null)
  })
})

test('bulkRemove preserves existing removal permission checks', async () => {
  await withMockEnvironment(async () => {
    const shift = await shiftService.create(shiftData('Unauthorized', '2035-01-05'))
    const member = { ...admin, id: 'member-1', role: 'staff' as const, system_permission: 'member' as const }

    const result = await shiftService.bulkRemove([shift.id], member.id, 'bulk test')
    assert.equal(result.succeeded, 0)
    assert.equal(result.failed, 1)
    assert.match(result.outcomes[0].error_message ?? '', /Only a Leader or Admin/)
    assert.ok(await shiftService.getById(shift.id))
  })
})
