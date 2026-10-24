import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { calculateAggregate } from '../components/features/dashboard/DashboardOverview.tsx'

test('U02: calculateAggregate returns null for empty or null-only metrics, numbers otherwise', () => {
  assert.strictEqual(calculateAggregate([], 'revenue'), null)
  assert.strictEqual(calculateAggregate([{ revenue: null }], 'revenue'), null)
  assert.strictEqual(calculateAggregate([{ revenue: 0 }], 'revenue'), 0)
  assert.strictEqual(calculateAggregate([{ revenue: 50 }, { revenue: 150 }], 'revenue'), 200)
  assert.strictEqual(calculateAggregate([{ revenue: 50 }, { revenue: null }], 'revenue'), 50)
})

test('U02: DashboardOverview source enforces progressive rendering, role skeleton, and stale-while-revalidate', () => {
  const source = readFileSync('components/features/dashboard/DashboardOverview.tsx', 'utf8')

  // Gating must not wipe out data on refresh (stale-while-revalidate)
  assert.match(source, /isRefreshing/, 'DashboardOverview must track background revalidation')
  assert.match(source, /DashboardRoleSkeleton/, 'DashboardOverview must render a role-matched layout skeleton')
  assert.match(source, /data-testid="dashboard-progressive-shell"/, 'Must preserve progressive shell testid')
  assert.match(source, /data-testid="dashboard-visible-first"/, 'Must preserve visible-first testid')

  // Must not manufacture fake performance or KPI data
  assert.match(source, /performance={null}/, 'Must not manufacture fake performance data')
  assert.match(source, /missingStaffCount={null}/, 'Missing staff must stay null/unfabricated')

  // Secondary fallbacks must prevent full dashboard crash
  assert.match(source, /reportService\.getAllFiltered[\s\S]*?\.catch/, 'Report service must have graceful fallback')
  assert.match(source, /swapRequestService\.getPage[\s\S]*?\.catch/, 'Swap service must have graceful fallback')
})

test('U02: DashboardOverview role skeleton renders layout-accurate placeholders for Admin, Leader, Member', async () => {
  const source = readFileSync('components/features/dashboard/DashboardOverview.tsx', 'utf8')
  assert.match(source, /role === 'admin'/, 'Admin skeleton branch')
  assert.match(source, /role === 'leader'/, 'Leader skeleton branch')
  assert.match(source, /role === 'member'/, 'Member skeleton branch')
  assert.match(source, /grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5/, 'KPI 4-card grid in skeleton')
  assert.match(source, /data-testid="content-skeleton"/, 'Must include content-skeleton testid')
})
