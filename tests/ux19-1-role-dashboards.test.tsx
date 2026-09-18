import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Mock next/dynamic
mock.module('next/dynamic', () => {
  return {
    default: () => {
      const MockedDynamic = () => <div id="mocked-dynamic">MockedDashboardCharts</div>
      return MockedDynamic
    }
  }
})

import { AdminDashboard } from '@/components/features/dashboard/roles/AdminDashboard'
import { LeaderDashboard } from '@/components/features/dashboard/roles/LeaderDashboard'
import { MemberDashboard } from '@/components/features/dashboard/roles/MemberDashboard'

const mockProps: CommonProps = {
  shifts: [],
  reports: [],
  brands: [],
  platforms: [],
  campaigns: [],
  users: [],
  registrations: [],
  swapRequests: [],
  filters: { preset: '30d', start: '2026-09-01', end: '2026-09-30', brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] },
  setFilters: () => {},
  showFilters: false,
  setShowFilters: () => {},
  currentUser: { id: 'user-1', full_name: 'Test User' },
  t: (key: string) => key,
  setPreset: () => {},
  setSelectedShift: () => {},
}

describe('UX-19.1 Role Dashboards', () => {
  it('AdminDashboard renders admin-specific structural metrics', () => {
    const html = renderToStaticMarkup(<AdminDashboard {...mockProps} />)
    assert.ok(html.includes('dashboardTitle'), 'Missing dashboardTitle')
    assert.ok(html.includes('liveInProgress'), 'Missing liveInProgress')
    assert.ok(html.includes('staffInScope'), 'Missing staffInScope')
    assert.ok(html.includes('confirmedRevenue'), 'Missing confirmedRevenue')
  })

  it('LeaderDashboard renders leader-specific action queue', () => {
    const html = renderToStaticMarkup(<LeaderDashboard {...mockProps} />)
    assert.ok(html.includes('leaderDashboard'), 'Missing leaderDashboard')
    assert.ok(html.includes('actionQueue'), 'Missing actionQueue')
    assert.ok(html.includes('shiftsToday'), 'Missing shiftsToday')
  })

  it('MemberDashboard renders member-specific personal workspace', () => {
    const html = renderToStaticMarkup(<MemberDashboard {...mockProps} />)
    assert.ok(html.includes('welcome'), 'Missing welcome')
    assert.ok(html.includes('myUpcomingShifts'), 'Missing myUpcomingShifts')
    assert.ok(html.includes('quickActions'), 'Missing quickActions')
  })
})
