import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { MonthView, shiftsForCalendarDate } from '@/components/features/calendar/MonthView'
import { LanguageProvider } from '@/lib/i18n'
import type { Shift, Brand, Platform } from '@/lib/types/database.types'

test('RC19 C4.4: Mobile Month View Parity — renders full desktop cards inside day cells', () => {
  const brands: Brand[] = [{ id: 'b1', name: 'Brand A', color: '#10B981', created_at: '', updated_at: '' }]
  const platforms: Platform[] = [{ id: 'p1', name: 'TikTok', created_at: '', updated_at: '' }]

  const baseShift = {
    date: '2026-11-15',
    start_time: '14:00',
    end_time: '16:00',
    brand_id: 'b1',
    platform_id: 'p1',
    status: 'scheduled' as const,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }

  const shifts: Shift[] = [
    { ...baseShift, id: 's1', title: 'Session 1', start_time: '09:00', end_time: '11:00' },
    { ...baseShift, id: 's2', title: 'Session 2', start_time: '13:00', end_time: '15:00' },
    { ...baseShift, id: 's3', title: 'Session 3', start_time: '18:00', end_time: '20:00' },
    { ...baseShift, id: 's4', title: 'Session 4', start_time: '21:00', end_time: '23:00' },
  ]

  const html = renderToStaticMarkup(
    createElement(
      LanguageProvider,
      { defaultLanguage: 'en' },
      createElement(MonthView, {
        currentDate: new Date('2026-11-15T12:00:00'),
        shifts,
        brands,
        platforms,
      }),
    ),
  )

  // 1. All 7 day headers rendered
  for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    assert.match(html, new RegExp(day), `Day header ${day} must be present`)
  }

  // 2. Day cell 2026-11-15 rendered
  assert.match(html, /data-testid="calendar-day-2026-11-15"/)

  // 3. Up to 3 shift cards rendered inside the day cell with full 'flex' (not hidden by narrow media queries)
  assert.match(html, /data-testid="calendar-event-s1"/)
  assert.match(html, /data-testid="calendar-event-s2"/)
  assert.match(html, /data-testid="calendar-event-s3"/)

  // Cards must have 'flex' class without viewport-conditional 'hidden md:flex'
  const s2Match = html.match(/class="([^"]*)"[^>]*data-testid="calendar-event-s2"/)
  assert.ok(s2Match, 's2 card must exist')
  assert.ok(!s2Match[1].includes('hidden md:flex'), 's2 must not be hidden on mobile viewport')
  assert.ok(s2Match[1].includes('flex'), 's2 must have flex display on all viewports')

  const s3Match = html.match(/class="([^"]*)"[^>]*data-testid="calendar-event-s3"/)
  assert.ok(s3Match, 's3 card must exist')
  assert.ok(!s3Match[1].includes('hidden lg:flex'), 's3 must not be hidden on tablet/mobile viewport')
  assert.ok(s3Match[1].includes('flex'), 's3 must have flex display on all viewports')

  // 4. Fourth session is capped by MONTH_VISIBLE_EVENT_LIMITS.large (3) and represented by "+N more sessions"
  assert.doesNotMatch(html, /data-testid="calendar-event-s4"/)
  assert.match(html, /data-testid="calendar-more-large-2026-11-15"[^>]*>[\s\S]*?\+1 more sessions/)
})

test('RC19 C4.4: Mobile Month View Parity — compact mode renders on explicit request', () => {
  const brands: Brand[] = [{ id: 'b1', name: 'Brand A', created_at: '', updated_at: '' }]
  const shifts: Shift[] = [
    {
      id: 's1',
      date: '2026-11-15',
      start_time: '09:00',
      end_time: '11:00',
      brand_id: 'b1',
      platform_id: 'p1',
      status: 'scheduled',
      created_at: '',
      updated_at: '',
    },
  ]

  const compactHtml = renderToStaticMarkup(
    createElement(
      LanguageProvider,
      { defaultLanguage: 'en' },
      createElement(MonthView, {
        compact: true,
        complete: true,
        currentDate: new Date('2026-11-15T12:00:00'),
        shifts,
        brands,
        platforms: [],
      }),
    ),
  )

  assert.match(compactHtml, /data-testid="calendar-compact-month-grid"/)
  assert.match(compactHtml, /data-testid="calendar-compact-day-2026-11-15"/)
  assert.match(compactHtml, /data-count="1"/)
})

test('RC19 C4.4: Calendar defaults to the shared full month grid with compact as an opt-in', () => {
  const calendar = readFileSync(new URL('../components/features/calendar/CalendarView.tsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../components/layout/ProductionAppShell.tsx', import.meta.url), 'utf8')
  const monthView = readFileSync(new URL('../components/features/calendar/MonthView.tsx', import.meta.url), 'utf8')
  assert.match(calendar, /params\.get\('calendar_mobile_mode'\) === 'compact'/)
  assert.match(calendar, /const mobileFullCalendar = !mobileCompactCalendar/)
  assert.match(calendar, /calendar_mobile_mode: 'compact'/)
  assert.match(calendar, /data-testid="calendar-full-month-view"/)
  assert.match(calendar, /min-w-\[1400px\]/)
  assert.match(monthView, /variant="month"/)
  assert.match(monthView, /min-h-36 min-w-0 bg-background/)
  assert.match(calendar, /onShiftClick=\{setPreviewShift\} onDayClick=\{setSelectedDay\}/)
  assert.match(shell, /min-w-0 flex-1 overflow-y-auto pb-24 md:pb-4/)
  assert.match(monthView, /onClick=\{event => \{\s*event\.stopPropagation\(\)\s*onShiftClick\?\.\(shift\)/)
})

test('RC19 C4.4: overnight shift remains present in both date cells of the full month grid', () => {
  const overnight: Shift = {
    id: 'overnight', date: '2026-11-15', end_date: '2026-11-16',
    start_time: '23:00', end_time: '02:00', crosses_midnight: true,
    brand_id: 'b1', platform_id: 'p1', status: 'scheduled', created_at: '', updated_at: '',
  }
  assert.deepEqual(shiftsForCalendarDate([overnight], new Date('2026-11-15T12:00:00')).map(shift => shift.id), ['overnight'])
  assert.deepEqual(shiftsForCalendarDate([overnight], new Date('2026-11-16T12:00:00')).map(shift => shift.id), ['overnight'])
})
