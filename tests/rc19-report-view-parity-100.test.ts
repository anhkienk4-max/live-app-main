import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift } from '../lib/types/database.types.ts'
import {
  collectAuthorizedReportCalendar,
} from '../lib/utils/reportMultiView.ts'

const makeShift = (id: string, date: string, brandId = 'brand-1'): Shift => ({
  id,
  date,
  title: `Ca ${id}`,
  start_time: '13:00',
  end_time: '17:00',
  start_at: `${date}T13:00:00Z`,
  brand_id: brandId,
  platform_id: 'shopee',
  status: 'completed',
  created_at: `${date}T13:00:00Z`,
  updated_at: `${date}T13:00:00Z`,
})

const makeReport = (id: string, shiftId: string, status: Report['status'] = 'confirmed'): Report => ({
  id,
  shift_id: shiftId,
  status,
  metrics_confirmed: status === 'confirmed',
  created_at: '2026-10-20T17:00:00Z',
  updated_at: '2026-10-20T17:00:00Z',
})

test('TASK C (#100): ReportsList view mode parity in URL state (cards, table, list, calendar)', () => {
  const source = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')

  // 1. Authoritative URL view-mode extraction
  assert.match(source, /const modeParam = searchParams\.get\('reports_view'\)/)
  assert.match(
    source,
    /const createdViewMode: ReportWorkspaceView = modeParam === 'table' \|\| modeParam === 'list' \|\| modeParam === 'calendar' \? modeParam : 'cards'/
  )

  // 2. Navigation preserves view-mode in URL
  assert.match(
    source,
    /const setCreatedViewMode = \(view: ReportWorkspaceView\) => navigate\(\{ reports_view: view === 'cards' \? null : view \}\)/
  )

  // 3. All 4 views are rendered according to createdViewMode
  assert.match(source, /createdViewMode === 'calendar' \? \(/)
  assert.match(source, /createdViewMode === 'list' \? \(/)
  assert.match(source, /createdViewMode === 'table' \? \(/)
  // Cards is the fallback branch of the ternary

  // 4. Shared pagination across Table, Cards, List
  assert.match(
    source,
    /createdViewMode !== 'calendar' && <HistoryPagination page=\{reportPage\} pageSize=\{reportPageSize\} total=\{reportTotal\}/
  )

  // 5. Empty state handles Table, Cards, List gracefully
  assert.match(
    source,
    /createdViewMode !== 'calendar' && filteredReports\.length === 0 \? <Card><CardContent/
  )
})

test('TASK C (#100): URL filter synchronization is shared across all view modes', () => {
  const source = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')

  // Apply/Reset filter contract is shared in every view
  assert.match(source, /const syncFilterUrl = React\.useCallback\(\(value: Filters\) => \{/)
  assert.match(source, /const keys: \(keyof Filters\)\[\] = \['search','start','end','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses'\]/)

  // Both reportPage and queuePage reset on apply/reset
  assert.match(source, /applyFilters = React\.useCallback\(\(\) => \{[\s\S]*?setReportPage\(1\)[\s\S]*?setQueuePage\(1\)/)
  assert.match(source, /resetFilters = React\.useCallback\(\(\) => \{[\s\S]*?setReportPage\(1\)[\s\S]*?setQueuePage\(1\)/)
})

test('TASK C (#100): Calendar view collects authorized entries without 20-shift page truncation', async () => {
  const shifts: Shift[] = Array.from({ length: 45 }, (_, i) =>
    makeShift(`shift-${i}`, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`)
  )
  const reports: Report[] = shifts.slice(0, 30).map((s, i) => makeReport(`rep-${i}`, s.id))

  const mockApi = {
    getQueuePage: async (query: { page: number; pageSize: number; filters: Record<string, unknown> }) => {
      const start = (query.page - 1) * query.pageSize
      const paged = shifts.slice(start, start + query.pageSize).map(s => ({ shift: s, report: null }))
      return { items: paged, total: shifts.length, page: query.page, pageSize: query.pageSize, ownerKey: 'admin' }
    },
    getReportsPage: async (query: { page: number; pageSize: number; filters: Record<string, unknown> }) => {
      const start = (query.page - 1) * query.pageSize
      return { items: reports.slice(start, start + query.pageSize), total: reports.length, page: query.page, pageSize: query.pageSize, ownerKey: 'admin' }
    },
    getShiftsByIds: async (ids: string[]) => shifts.filter(s => ids.includes(s.id)),
  }

  const result = await collectAuthorizedReportCalendar('2026-10-15', 'month', {}, mockApi)
  assert.equal(result.queueTotal, 45, 'Calendar must not truncate at 20 items')
  assert.equal(result.reportTotal, 30, 'Calendar accurately reflects all 30 reports')
  assert.ok(result.entries.length >= 45, 'All shifts within window are represented')
})
