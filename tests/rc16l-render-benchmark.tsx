import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import assert from 'node:assert/strict'
import { WeekView } from '@/components/features/calendar/WeekView'
import { DayView } from '@/components/features/calendar/DayView'
import { LanguageProvider } from '@/lib/i18n'
import type { Shift } from '@/lib/types/database.types'

const shifts = Array.from({ length: 80 }, (_, index) => ({ id: 'bench-' + index, title: 'Ca trùng giờ ' + index, date: '2026-10-14', start_time: '09:00', end_time: '10:30', brand_id: 'b', platform_id: 'p', status: 'completed', required_host_count: 1, required_support_count: 1, required_technical_count: 1, registration_locked: false, created_at: '2026-10-14', updated_at: '2026-10-14' })) as Shift[]
const props = { currentDate: new Date('2026-10-14T12:00:00'), shifts, brands: [{ id: 'b', name: 'Thương hiệu' }], platforms: [{ id: 'p', name: 'TikTok' }], registrations: [], users: [] }
const metrics = []
for (const [name, View] of [['week', WeekView], ['day', DayView]] as const) {
  const samples: number[] = []
  let markup = ''
  for (let i = 0; i < 6; i++) {
    const start = performance.now()
    markup = renderToStaticMarkup(React.createElement(LanguageProvider, { defaultLanguage: 'vi' }, React.createElement(View, props as never)))
    if (i) samples.push(performance.now() - start)
  }
  assert.ok(markup.length > 0)
  samples.sort((a, b) => a - b)
  metrics.push({ view: name, shifts: shifts.length, sampleCount: samples.length, medianSsrMs: samples[2], elementCount: (markup.match(/<[a-z][\w-]*(?:\s|>)/g) ?? []).length, htmlBytes: Buffer.byteLength(markup) })
}
console.log(JSON.stringify({ methodology: 'Local synthetic React SSR, 80 same-time shifts, five warmed samples. Not browser render, network or Production evidence.', baselineLabel: process.env.RC16L_BENCH_LABEL ?? 'after', metrics }, null, 2))
