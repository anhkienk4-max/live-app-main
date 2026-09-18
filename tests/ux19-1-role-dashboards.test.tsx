/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AdminDashboard } from '@/components/features/dashboard/roles/AdminDashboard'
import { LeaderDashboard } from '@/components/features/dashboard/roles/LeaderDashboard'
import { MemberDashboard } from '@/components/features/dashboard/roles/MemberDashboard'
import { initialFilters } from '@/components/features/dashboard/DashboardOverview'
import { CommonProps } from '@/components/features/dashboard/shared/DashboardShared'

const mockProps: CommonProps = {
  shifts: [],
  reports: [],
  brands: [],
  platforms: [],
  campaigns: [],
  users: [],
  registrations: [],
  swapRequests: [],
  filters: initialFilters(),
  setFilters: () => {},
  showFilters: false,
  setShowFilters: () => {},
  currentUser: { id: 'user-1', full_name: 'Test User' },
  t: (key: string) => key,
  setPreset: () => {},
  setSelectedShift: () => {},
  onResetFilters: () => {},
}

describe('UX-19.1 Role Dashboards', () => {
  it('AdminDashboard renders admin-specific structural metrics', () => {
    const html = renderToStaticMarkup(<AdminDashboard {...mockProps} />)
    assert.ok(html.includes('allOperations'), 'Missing allOperations scope label')
    assert.ok(html.includes('confirmedRevenue'), 'Missing confirmedRevenue section')
    assert.ok(html.includes('liveInProgress'), 'Missing liveInProgress')
  })

  it('AdminDashboard null-revenue isolation: null-revenue report does not break rendering', () => {
    const shift = { id: 's1', date: '2026-09-01', status: 'completed', brand_id: 'b1' } as any
    const report = { id: 'r1', shift_id: 's1', revenue: null } as any
    const props = { ...mockProps, shifts: [shift], reports: [report] }
    const html = renderToStaticMarkup(<AdminDashboard {...props} />)
    assert.ok(html.includes('confirmedRevenue'), 'confirmedRevenue label must appear')
  })

  it('LeaderDashboard renders leader-specific action queue', () => {
    const html = renderToStaticMarkup(<LeaderDashboard {...mockProps} />)
    assert.ok(html.includes('livestreamTeam'), 'Missing livestreamTeam scope label')
    assert.ok(html.includes('leaderDashboard'), 'Missing leaderDashboard')
    assert.ok(!html.includes('confirmedRevenue'), 'Leader exposed Admin financial surface')
  })

  it('MemberDashboard renders member-specific personal workspace and empty state', () => {
    const html = renderToStaticMarkup(<MemberDashboard {...mockProps} />)
    assert.ok(html.includes('mySchedule'), 'Missing mySchedule scope label')
    assert.ok(html.includes('welcome'), 'Missing welcome')
    assert.ok(!html.includes('confirmedRevenue'), 'Member exposed Admin financial surface')
    assert.ok(html.includes('noNextShift'), 'Missing noNextShift empty state')
    assert.ok(html.includes('browseOpenShifts'), 'Missing browseOpenShifts link')
  })

  it('SHARED reset filters restores complete Filters object', () => {
    const defaultFilters = initialFilters()
    assert.ok(Array.isArray(defaultFilters.brandIds), 'brandIds should be array')
    assert.equal(defaultFilters.preset, '30d', 'preset should be 30d')
    assert.ok(defaultFilters.start, 'start should exist')
    assert.ok(defaultFilters.end, 'end should exist')
  })
})
