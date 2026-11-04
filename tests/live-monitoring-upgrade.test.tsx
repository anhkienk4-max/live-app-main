import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { getLiveStatusConfig } from '@/components/features/live/LiveMonitoringDashboard'

test('Live Monitoring: getLiveStatusConfig covers all 6 lifecycle states with distinct visual semantics', () => {
  const statuses = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'] as const
  for (const status of statuses) {
    const config = getLiveStatusConfig(status)
    assert.ok(config, `Status ${status} must return a configuration object`)
    assert.ok(config.badgeClass, `Status ${status} must have badgeClass`)
    assert.ok(config.dotClass, `Status ${status} must have dotClass`)
    assert.ok(config.indicatorClass, `Status ${status} must have indicatorClass`)
  }

  // Verify live status has active pulsing indicator
  const liveCfg = getLiveStatusConfig('live')
  assert.equal(liveCfg.labelKey, 'liveStatus')
  assert.match(liveCfg.badgeClass, /animate-pulse/)
  assert.match(liveCfg.dotClass, /animate-ping/)
  assert.match(liveCfg.badgeClass, /bg-red-500/)

  // Verify preparing is amber
  const prepCfg = getLiveStatusConfig('preparing')
  assert.match(prepCfg.badgeClass, /amber/)

  // Verify scheduled is sky/blue
  const schedCfg = getLiveStatusConfig('scheduled')
  assert.match(schedCfg.badgeClass, /sky/)

  // Verify paused is orange
  const pausedCfg = getLiveStatusConfig('paused')
  assert.match(pausedCfg.badgeClass, /orange/)

  // Verify completed is emerald/green
  const compCfg = getLiveStatusConfig('completed')
  assert.match(compCfg.badgeClass, /emerald/)

  // Verify cancelled is slate/gray
  const cancCfg = getLiveStatusConfig('cancelled')
  assert.match(cancCfg.badgeClass, /slate/)
})

test('Live Monitoring: Dashboard source satisfies regression contracts and area-based loading', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // Contract with phase2b-live-stream-link.test.ts
  const start = source.indexOf('  const loadData = React.useCallback')
  const end = source.indexOf('\n  useShiftChangeRefresh(loadData)', start)
  assert.ok(start > 0 && end > start, 'Must preserve loadData followed by useShiftChangeRefresh(loadData)')
  const polling = source.slice(start, end)
  assert.match(polling, /shiftService\.getLivePage\(/, 'Must query shiftService.getLivePage')
  assert.match(polling, /controller\.signal/, 'Must pass AbortController signal')

  // Contract with preview-loading-performance.test.tsx
  assert.match(source, /PageLoadError/, 'Must render PageLoadError on critical failure')
  assert.match(source, /finally[\s\S]{0,100}set(?:Settings)?Loading\(false\)/, 'Must settle loading in finally')

  // Contract with f6-import.test.ts
  assert.match(source, /getOperationalReferences\(currentUser\)/, 'Must fetch static references with getOperationalReferences')

  // Area-based progressive loading & network resilience
  assert.match(source, /hasEverLoaded/, 'Must track whether data has ever loaded for stale-while-revalidate')
  assert.match(source, /isOnline|online/, 'Must track online/offline connectivity')
  assert.match(source, /isStale|lastSuccessTime/, 'Must detect stale data when polling is delayed')
  assert.match(source, /open-live-session-/, 'Must provide per-session selector with data-testid')
  assert.match(source, /testId="live-status-filter"/, 'Must provide live-status-filter testId')
})

test('Live Monitoring: KPI cards explicitly declare page-local scope and isolate scope changes', () => {
  const source = readFileSync('components/features/live/LiveMonitoringDashboard.tsx', 'utf8')

  // KPI scope clarity: page-local count is not presented as system total
  assert.match(source, /scope="Trong trang hiện tại"/, 'KPI metric cards must declare page-local scope')
  assert.match(source, /Chỉ số tính trong trang hiện tại/, 'Must display page-local clarification in metrics header')

  // Scope change detection: prevents displaying old data under new filter/page/actor
  assert.match(source, /isScopeChanged/, 'Must detect scope change between lastLoadedScope and scopeKey')
  assert.match(source, /setShifts\(\[\]\)/, 'Must clear stale shifts when scope changes')
  assert.match(source, /scopeKey = identity \+ ':' \+ encodedFilters \+ ':' \+ page \+ ':' \+ pageSize/, 'Must compute composite scopeKey')
})

test('Live Monitoring: Console source renders operating personnel and live status indicators', () => {
  const source = readFileSync('components/features/live/LiveOperationsConsole.tsx', 'utf8')

  // Operating staff display in header
  assert.match(source, /Nhân sự:|staffFor/, 'Must render staffing summary')
  assert.match(source, /host|support|technical/, 'Must cover Host, Support, and Technical roles')

  // Live pulsing indicator
  assert.match(source, /animate-pulse/, 'Must pulse live indicator for live status')
})
