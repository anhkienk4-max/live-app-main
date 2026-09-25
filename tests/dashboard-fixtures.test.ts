import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { getDashboardFixture, DashboardData } from '../lib/visual-fixtures/dashboards'
import { isVisualFixtureMode } from '../lib/visual-fixtures/index'
import { getCurrentBusinessDate } from '../lib/utils/shiftUtils'

describe('Dashboard Visual Fixtures', () => {
  const emptyBaseData: DashboardData = {
    shifts: [],
    reports: [],
    brands: [],
    platforms: [],
    campaigns: [],
    users: [],
    registrations: [],
    swapRequests: []
  }

  const populatedBaseData: DashboardData = {
    ...emptyBaseData,
    shifts: [{
      id: 'real-1', date: getCurrentBusinessDate(), start_time: '10:00:00', end_time: '12:00:00',
      status: 'scheduled', brand_id: 'b1', platform_id: 'p1',
      required_host_count: 1, required_support_count: 1, required_technical_count: 1,
      created_at: '2023-01-01', updated_at: '2023-01-01'
    }]
  }

  it('scenario empty returns exactly empty arrays regardless of role', () => {
    const adminEmpty = getDashboardFixture('admin', 'empty', 'u1', populatedBaseData)
    assert.deepStrictEqual(adminEmpty.shifts, [])
    assert.deepStrictEqual(adminEmpty.reports, [])
  })

  it('scenario reference overrides empty data for admin', () => {
    const adminRef = getDashboardFixture('admin', 'reference', 'u1', emptyBaseData)
    assert.ok(adminRef.shifts.length > 0)
    assert.ok(adminRef.reports.length > 0)
    
    // Check specific reference data constraints:
    const liveShifts = adminRef.shifts.filter(s => s.status === 'live')
    assert.strictEqual(liveShifts.length, 3)
  })

  it('scenario reference overrides empty data for leader', () => {
    const leaderRef = getDashboardFixture('leader', 'reference', 'u1', emptyBaseData)
    assert.ok(leaderRef.shifts.length > 0)
    
    const liveShifts = leaderRef.shifts.filter(s => s.status === 'live')
    assert.strictEqual(liveShifts.length, 2)
  })

  it('scenario reference overrides empty data for member', () => {
    const memberRef = getDashboardFixture('member', 'reference', 'u1', emptyBaseData)
    assert.ok(memberRef.shifts.length > 0)
  })

  describe('isVisualFixtureMode safety', () => {
    const originalEnv = process.env.NEXT_PUBLIC_VISUAL_FIXTURES

    afterEach(() => {
      process.env.NEXT_PUBLIC_VISUAL_FIXTURES = originalEnv
    })

    it('returns false when NEXT_PUBLIC_VISUAL_FIXTURES is not true', () => {
      process.env.NEXT_PUBLIC_VISUAL_FIXTURES = 'false'
      assert.strictEqual(isVisualFixtureMode(), false)
      
      process.env.NEXT_PUBLIC_VISUAL_FIXTURES = undefined
      assert.strictEqual(isVisualFixtureMode(), false)
    })

    it('returns true only when NEXT_PUBLIC_VISUAL_FIXTURES is exactly true', () => {
      process.env.NEXT_PUBLIC_VISUAL_FIXTURES = 'true'
      assert.strictEqual(isVisualFixtureMode(), true)
    })
  })
})
