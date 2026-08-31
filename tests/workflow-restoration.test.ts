import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  buildReportExportRows,
  buildScheduleImportTemplateSheets,
  parseScheduleRows,
} from '../lib/utils/excelUtils.ts'
import {
  MONTH_VISIBLE_EVENT_LIMITS,
  MonthView,
  shiftsForCalendarDate,
} from '../components/features/calendar/MonthView.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import {
  emptyFinalReportRecap,
  finalReportRecapFields,
  normalizeFinalReportRecap,
} from '../lib/utils/finalReportRecap.ts'
import { FinalReportRecapReadOnly } from '../components/features/reports/ReportDetailModal.tsx'

const storage = new Map<string, string>()
const storageApi = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
}
const mockWindow = {
  localStorage: storageApi,
  sessionStorage: storageApi,
  crypto: globalThis.crypto,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
}
Object.defineProperty(globalThis, 'window', { value: mockWindow, configurable: true })

test('Studio aliases, missing values, template, preview history, and saved shifts share studio', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  try {
  const result = parseScheduleRows([
    {
      Date: '2026-08-10',
      'Start time': '09:00',
      'End time': '10:00',
      Brand: 'TechGear Pro',
      Platform: 'Shopee Live',
      'Shift title': 'English studio',
      'Live Studio': 'Studio North 01',
    },
    {
      Date: '2026-08-11',
      'Start time': '09:00',
      'End time': '10:00',
      Brand: 'TechGear Pro',
      Platform: 'Shopee Live',
      'Shift title': 'Vietnamese studio',
      'Phòng live': 'Phòng Ánh Sáng',
    },
    {
      Date: '2026-08-12',
      'Start time': '09:00',
      'End time': '10:00',
      Brand: 'TechGear Pro',
      Platform: 'Shopee Live',
      'Shift title': 'Missing studio',
    },
  ], {
    brands: new Map([['TechGear Pro', 'b1']]),
    platforms: new Map([['Shopee Live', 'p2']]),
    campaigns: new Map(),
  })

  assert.equal(result.invalidRows, 0)
  assert.equal(result.rows[0].row.studio, 'Studio North 01')
  assert.equal(result.rows[1].row.studio, 'Phòng Ánh Sáng')
  assert.equal(result.rows[2].row.studio, undefined)
  assert.equal(result.validShifts[0].studio, 'Studio North 01')

  const template = buildScheduleImportTemplateSheets()
  const scheduleRow = template[0].rows[0] as Record<string, unknown>
  assert.equal(scheduleRow.Studio, 'Studio A')
  assert.equal(scheduleRow['Required Host count'], 1)
  assert.equal(scheduleRow['Required Support count'], 1)
  assert.equal(scheduleRow['Required Technical count'], 1)

  const { scheduleImportService, shiftService } = await import('../lib/services/dataService.ts')
  const batch = await scheduleImportService.createPreview('excel', 'studio-test.xlsx', {
    total_rows: result.totalRows,
    valid_rows: result.validRows,
    invalid_rows: result.invalidRows,
    warning_rows: result.warningRows,
  }, '1', result.rows.map(preview => preview.row))
  const reloaded = (await scheduleImportService.getAll()).find(candidate => candidate.id === batch.id)
  assert.equal(reloaded?.preview_rows?.[0].studio, 'Studio North 01')
  assert.equal(reloaded?.preview_rows?.[0].required_host_count, 1)

  const saved = await shiftService.create(result.validShifts[0])
  assert.equal((await shiftService.getById(saved.id))?.studio, 'Studio North 01')
  } finally {
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('all nine final recap fields persist, reopen, display, and export while legacy reports remain compatible', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  try {
  const values = Object.fromEntries(
    finalReportRecapFields.map((field, index) => [field.key, `Recap ${index + 1}`]),
  )
  const recap = normalizeFinalReportRecap({
    ...emptyFinalReportRecap(),
    ...values,
  })
  assert.equal(Object.keys(recap || {}).length, 9)

  const { reportService, shiftService } = await import('../lib/services/dataService.ts')
  const shift = await shiftService.create({
    date: '2026-08-15',
    start_time: '19:00',
    end_time: '21:00',
    brand_id: 'b1',
    platform_id: 'p2',
    title: 'Final recap persistence',
    studio: 'Studio Final',
    host_id: '3',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    registration_locked: true,
    status: 'scheduled',
  })
  await shiftService.update(shift.id, { status: 'preparing', version: 1 }, '1')
  await shiftService.update(shift.id, { status: 'live', version: 2 }, '1')
  await shiftService.update(shift.id, { status: 'completed', version: 3 }, '1')

  const report = await reportService.create({
    shift_id: shift.id,
    revenue: 1250000,
    orders: 12,
    peak_viewer: 100,
    average_viewer: 60,
    likes: 20,
    comments: 5,
    shares: 2,
    submitted_by: '3',
    final_recap: recap,
  })

  assert.deepEqual((await reportService.getById(report.id))?.final_recap, recap)
  const updated = await reportService.update(report.id, {
    final_recap: {
      ...recap,
      live_issues: 'Intermittent studio audio',
    },
  }, '3', 'Regression persistence check')
  assert.equal(updated?.final_recap?.live_issues, 'Intermittent studio audio')
  assert.equal((await reportService.getById(report.id))?.final_recap?.traffic_summary, 'Recap 1')

  const detailMarkup = renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(FinalReportRecapReadOnly, { recap: updated?.final_recap }),
  ))
  finalReportRecapFields.forEach((field, index) => {
    assert.match(detailMarkup, new RegExp(`data-testid="final-recap-${field.key}"`))
    const expected = field.key === 'live_issues' ? 'Intermittent studio audio' : `Recap ${index + 1}`
    assert.match(detailMarkup, new RegExp(expected))
  })

  const users = await (await import('../lib/services/dataService.ts')).userService.getAll()
  const exported = buildReportExportRows([updated!], {
    shifts: [shift],
    campaigns: [],
    users,
    brands: new Map([['b1', 'TechGear Pro']]),
    platforms: new Map([['p2', 'Shopee Live']]),
  })[0]
  assert.equal(exported.Studio, 'Studio Final')
  assert.equal(exported['Traffic Throughout the Session'], 'Recap 1')
  assert.equal(exported['Platform Vouchers'], 'Recap 2')
  assert.equal(exported['Shop Vouchers'], 'Recap 3')
  assert.equal(exported['Best-performing Time Slots'], 'Recap 4')
  assert.equal(exported['Customer Interest in Products and Gifts'], 'Recap 5')
  assert.equal(exported['Main Customer Comment Topics'], 'Recap 6')
  assert.equal(exported['Live Pricing Feedback'], 'Recap 7')
  assert.equal(exported['Top-selling Products'], 'Recap 8')
  assert.equal(exported['Issues Encountered During the Live'], 'Intermittent studio audio')

  const legacy = (await reportService.getAll()).find(candidate => candidate.id === 'r1')
  assert.ok(legacy)
  const legacyExport = buildReportExportRows([legacy!], {
    shifts: await shiftService.getAll(),
    campaigns: [],
    users,
    brands: new Map([['b1', 'TechGear Pro']]),
    platforms: new Map([['p1', 'TikTok Shop']]),
  })[0]
  assert.equal(legacy?.final_recap, undefined)
  assert.equal(legacyExport['Traffic Throughout the Session'], '')
  assert.equal(legacyExport['Issues Encountered During the Live'], '')
  } finally {
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('Month View uses stable responsive limits and sorts sessions by start time', () => {
  assert.deepEqual(MONTH_VISIBLE_EVENT_LIMITS, { narrow: 1, medium: 2, large: 3 })
  const base = {
    date: '2026-08-20',
    end_time: '10:00',
    brand_id: 'b1',
    platform_id: 'p1',
    status: 'scheduled' as const,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
  const sorted = shiftsForCalendarDate([
    { ...base, id: 'late', start_time: '12:00', title: 'Late' },
    { ...base, id: 'early', start_time: '08:00', title: 'Early' },
    { ...base, id: 'middle', start_time: '10:00', title: 'Middle' },
  ], new Date('2026-08-20T00:00:00'))
  assert.deepEqual(sorted.map(shift => shift.id), ['early', 'middle', 'late'])

  const tenSessions = Array.from({ length: 10 }, (_, index) => ({
    ...base,
    id: `session-${index + 1}`,
    start_time: `${String(index + 8).padStart(2, '0')}:00`,
    title: `Session ${index + 1}`,
  }))
  const markup = renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(MonthView, {
      currentDate: new Date('2026-08-20T00:00:00'),
      shifts: tenSessions,
      brands: [{ id: 'b1', name: 'Brand', created_at: '', updated_at: '' }],
      platforms: [],
    }),
  ))
  assert.match(markup, /class="[^"]*h-36[^"]*" data-testid="calendar-day-2026-08-20"/)
  assert.match(markup, /data-testid="calendar-event-session-1"/)
  assert.match(markup, /data-testid="calendar-event-session-3"/)
  assert.doesNotMatch(markup, /data-testid="calendar-event-session-4"/)
  assert.match(markup, /data-testid="calendar-more-large-2026-08-20"[^>]*>[\s\S]*?\+7 more sessions/)
})
