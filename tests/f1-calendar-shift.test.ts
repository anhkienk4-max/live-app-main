import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('Calendar views keep scan-critical identity, time, status, and selection surfaces', () => {
  const month = read('components/features/calendar/MonthView.tsx')
  const week = read('components/features/calendar/WeekView.tsx')
  const day = read('components/features/calendar/DayView.tsx')
  const list = read('components/features/calendar/ListView.tsx')

  for (const source of [month, week, day, list]) {
    assert.match(source, /formatShiftTimeRange|start_time/)
    assert.match(source, /statusLabel|getStatusLabel/)
    assert.match(source, /onShiftClick/)
  }
  assert.match(month, /data-testid={`calendar-event-\$\{shift\.id\}`}/)
  assert.match(day, /data-testid={`day-shift-\$\{shift\.id\}`}/)
  assert.match(list, /data-testid={`list-shift-\$\{shift\.id\}`}/)
})

test('Calendar has explicit filtered-empty and settled loading states', () => {
  const calendar = read('components/features/calendar/CalendarView.tsx')
  assert.match(calendar, /data-testid="calendar-loading"/)
  assert.match(calendar, /data-testid="calendar-empty-state"/)
  assert.match(calendar, /noMatchingShifts/)
  assert.match(calendar, /resetFilters/)
  assert.match(calendar, /finally[\s\S]{0,160}setLoading\(false\)/)
})

test('Shift Detail keeps critical context and staffing summary above advanced metadata', () => {
  const detail = read('components/features/shifts/ShiftDetailModal.tsx')
  assert.match(detail, /data-testid="shift-detail-title"/)
  assert.match(detail, /data-testid="shift-detail-status"/)
  assert.match(detail, /testId="shift-detail-time"/)
  assert.match(detail, /capacity\.remaining/)
  assert.match(detail, /capacity\.approved/)
  assert.match(detail, /capacity\.pending/)
  assert.match(detail, /OperationalStatusStrip/)
  assert.match(detail, /data-testid="shift-detail-advanced-metadata"/)
})

test('Registration and lifecycle actions remain canonical and role-aware', () => {
  const day = read('components/features/calendar/DayView.tsx')
  const list = read('components/features/calendar/ListView.tsx')
  const detail = read('components/features/shifts/ShiftDetailModal.tsx')
  assert.match(day, /<ShiftRegistrationActions/)
  assert.match(list, /<ShiftRegistrationActions/)
  assert.match(detail, /<ShiftRegistrationActions/)
  assert.match(detail, /hasPermission\(currentUser, 'shifts\.edit'\)/)
  assert.match(detail, /hasPermission\(currentUser, 'shifts\.delete'\)/)
  assert.match(detail, /statusKey/)
})

test('F1 preserves mobile action reachability and accessible calendar controls', () => {
  const calendar = read('components/features/calendar/CalendarView.tsx')
  const detail = read('components/features/shifts/ShiftDetailModal.tsx')
  const month = read('components/features/calendar/MonthView.tsx')
  assert.match(calendar, /data-testid="calendar-loading"/)
  assert.match(detail, /BottomActionBar/)
  assert.match(detail, /testId: 'close-shift-detail'/)
  assert.match(month, /aria-label=/)
  assert.match(month, /focus-visible:ring-2/)
})
