import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { buildReportActions } from '../lib/ui/action-priority.ts'
import { deriveSwapAttention } from '../lib/ui/operational-attention.ts'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')
const dashboard = read('components/features/live/LiveMonitoringDashboard.tsx')
const modal = read('components/features/live/LiveSessionModal.tsx')

test('F5 live list exposes identity, platform context, attention, staffing, and freshness', () => {
  assert.match(dashboard, /filtered\.map\(shift =>/)
  assert.match(dashboard, /nameFor\(platforms, shift\.platform_id\)/)
  assert.match(dashboard, /nameFor\(campaigns, shift\.campaign_id\)/)
  assert.match(dashboard, /live-session-attention/)
  assert.match(dashboard, /live-session-health/)
  assert.match(dashboard, /liveLastUpdated/)
  assert.match(dashboard, /liveElapsed/)
  assert.match(dashboard, /roleNames\(shift, 'host'\)/)
})

test('F5 selected session keeps shift and live state separate above the fold', () => {
  assert.match(modal, /data-testid="live-session-summary"/)
  assert.match(modal, /liveSessionState/)
  assert.match(modal, /liveShiftState/)
  assert.match(modal, /liveSessionHealth/)
  assert.match(modal, /liveStartedAt/)
  assert.match(modal, /liveLastUpdated/)
})

test('F5 loading, error, empty, and filter states settle without raw backend copy', () => {
  assert.match(dashboard, /data-testid="live-loading"/)
  assert.match(dashboard, /data-testid="live-empty-state"/)
  assert.match(dashboard, /liveNoSessionsYet/)
  assert.match(dashboard, /liveNoMatchingSessions/)
  assert.match(dashboard, /new Error\(t\('liveLoadError'\)\)/)
  assert.match(modal, /data-testid="live-session-load-error"/)
  assert.doesNotMatch(dashboard, /SQLSTATE|PGRST|PostgREST/)
  assert.doesNotMatch(modal, /SQLSTATE|PGRST|PostgREST/)
})

test('F5 keeps independent initial reads concurrent and avoids a second polling mechanism', () => {
  assert.match(dashboard, /Promise\.all\(\[/)
  assert.match(dashboard, /setInterval\(\(\) => void loadData\(\), 30000\)/)
  assert.equal((dashboard.match(/setInterval\(/g) || []).length, 1)
  assert.match(modal, /Promise\.all\(\[loadUpdates\(\), loadReport\(\)\]\)/)
})

test('F5 OCR entry and review remain visible without changing parser semantics', () => {
  assert.match(modal, /DashboardUpdateModal/)
  assert.match(modal, /open-live-dashboard-update-/)
  assert.match(modal, /showUpdate/)
  assert.match(modal, /showAllSnapshotMetrics/)
  assert.match(modal, /data-testid="live-session-summary"/)
})

test('F5 preserves role-gated report actions and terminal attention semantics', () => {
  const actions = buildReportActions(
    { status: 'archived', canDelete: true, canExport: true },
    { onView: () => undefined, onArchive: () => undefined, onDelete: () => undefined, onExport: () => undefined },
    { view: 'View', archive: 'Archive', delete: 'Delete', export: 'Export' },
  )
  assert.deepEqual(actions.map(action => action.key), ['view'])
  assert.deepEqual(deriveSwapAttention({ swapId: 's1', status: 'completed', actorHasValidAction: false }), [])
  assert.match(modal, /hasPermission\(currentUser, 'reports\.submit'\)/)
})

test('F5 preserves zero values and reports missing values distinctly', () => {
  assert.match(modal, /totalRevenue == null \? t\('notAvailable'\)/)
  assert.match(modal, /totalOrders == null \? t\('notAvailable'\)/)
  assert.match(modal, /latestUpdate == null \? t\('notAvailable'\)/)
  assert.match(modal, /value == null \|\| value === ''/)
  assert.match(modal, /update\.total_views\?\.toLocaleString\(\) \?\?/)
})

test('F5 filter state remains visible and report/live data sources are unchanged', () => {
  assert.match(dashboard, /data-testid="live-active-filter-count"/)
  assert.match(dashboard, /shiftService\.getAll\(\)/)
  assert.match(dashboard, /shiftRegistrationService\.getAll\(\)/)
  assert.match(dashboard, /dashboardUpdateService\.getByShift\(shift\.id\)/)
  assert.match(modal, /reportService\.getByShift\(shift\.id\)/)
})
