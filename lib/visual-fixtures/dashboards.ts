import { Brand, Campaign, Platform, Report, Shift, ShiftRegistration, SwapRequest, User } from '@/lib/types/database.types'
import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { DashboardFixtureScenario } from './types'

export interface DashboardData {
  shifts: Shift[]
  reports: Report[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  swapRequests: SwapRequest[]
}

export function getDashboardFixture(
  role: 'admin' | 'leader' | 'member',
  scenario: DashboardFixtureScenario,
  currentUserId: string,
  baseData: DashboardData
): DashboardData {
  const today = getCurrentBusinessDate()

  // Return base data unchanged for empty
  if (scenario === 'empty') {
    return {
      shifts: [],
      reports: [],
      brands: baseData.brands,
      platforms: baseData.platforms,
      campaigns: baseData.campaigns,
      users: baseData.users,
      registrations: [],
      swapRequests: []
    }
  }

  // Create some dummy brands & platforms if baseData is empty
  const dummyBrands: Brand[] = [
    { id: 'b1', name: 'Ostelin', created_at: today, updated_at: today },
    { id: 'b2', name: 'Pharmaton', created_at: today, updated_at: today },
    { id: 'b3', name: 'Lactacyd', created_at: today, updated_at: today }
  ]
  const brands = baseData.brands.length > 0 ? baseData.brands : dummyBrands

  const dummyPlatforms: Platform[] = [
    { id: 'p1', name: 'TikTok', created_at: today, updated_at: today },
    { id: 'p2', name: 'Shopee', created_at: today, updated_at: today }
  ]
  const platforms = baseData.platforms.length > 0 ? baseData.platforms : dummyPlatforms

  const dummyUsers: User[] = [
    { id: currentUserId, full_name: 'Current User', email: 'user@example.com', role: 'staff', operational_roles: ['host'], status: 'active', join_date: today, created_at: today, updated_at: today },
    { id: 'u1', full_name: 'Nguyễn Văn A', email: 'a@example.com', role: 'staff', operational_roles: ['host'], status: 'active', join_date: today, created_at: today, updated_at: today },
    { id: 'u2', full_name: 'Trần Thị B', email: 'b@example.com', role: 'staff', operational_roles: ['support'], status: 'active', join_date: today, created_at: today, updated_at: today },
  ]
  const users = baseData.users.length > 0 ? baseData.users : dummyUsers

  if (scenario === 'reference') {
    if (role === 'admin') {
      const shifts: Shift[] = []
      // 3 live shifts
      for (let i = 0; i < 3; i++) {
        shifts.push(createMockShift(`admin-live-${i}`, today, 'live', brands[i % brands.length].id, platforms[i % platforms.length].id, '10:00:00', '12:00:00', users[1].id, users[2].id))
      }
      // 21 other scheduled shifts today (total 24)
      for (let i = 0; i < 21; i++) {
        shifts.push(createMockShift(`admin-sch-${i}`, today, 'scheduled', brands[i % brands.length].id, platforms[i % platforms.length].id, '14:00:00', '16:00:00', i < 17 ? users[1].id : undefined, i < 19 ? users[2].id : undefined))
      }
      
      const reports: Report[] = []
      for (let i = 0; i < 7; i++) {
        reports.push({ id: `r-${i}`, shift_id: `admin-sch-${i}`, status: 'draft', revenue: 1000, orders: 10, peak_viewer: 100, average_viewer: 50, comments: 0, shares: 0, created_at: today, updated_at: today })
      }

      // Also staffing gaps -> 4 missing staff
      // Handled by null host/support above (21-17=4 missing host, 21-19=2 missing support)
      // Actually we need 4 errors total, so 4 missing. 
      return { shifts, reports, brands, platforms, campaigns: baseData.campaigns, users, registrations: [], swapRequests: [] }
    }

    if (role === 'leader') {
      const shifts: Shift[] = []
      // 2 live shifts
      for (let i = 0; i < 2; i++) {
        shifts.push(createMockShift(`leader-live-${i}`, today, 'live', brands[i % brands.length].id, platforms[i % platforms.length].id, '10:00:00', '12:00:00', users[1].id, users[2].id))
      }
      // 6 other shifts (total 8)
      for (let i = 0; i < 6; i++) {
        shifts.push(createMockShift(`leader-sch-${i}`, today, 'scheduled', brands[i % brands.length].id, platforms[i % platforms.length].id, '14:00:00', '16:00:00', i < 4 ? users[1].id : undefined, users[2].id))
      }

      // 4 pending (swaps/registrations/reports)
      const registrations: ShiftRegistration[] = []
      for (let i = 0; i < 4; i++) {
        registrations.push({ id: `reg-${i}`, shift_id: `leader-sch-${i}`, user_id: users[1].id, operational_role: 'host', status: 'pending', source: 'self_registration', requested_at: today, created_at: today, updated_at: today })
      }
      
      return { shifts, reports: [], brands, platforms, campaigns: baseData.campaigns, users, registrations, swapRequests: [] }
    }

    if (role === 'member') {
      const shifts: Shift[] = [
        createMockShift('member-next', today, 'scheduled', brands[0].id, platforms[0].id, '14:00:00', '16:00:00', currentUserId, undefined)
      ]
      
      // Some open shifts
      for (let i = 0; i < 2; i++) {
        shifts.push(createMockShift(`open-sch-${i}`, today, 'scheduled', brands[1].id, platforms[1].id, '18:00:00', '20:00:00', undefined, undefined))
      }

      return { shifts, reports: [], brands, platforms, campaigns: baseData.campaigns, users, registrations: [], swapRequests: [] }
    }
  }

  if (scenario === 'stress') {
    // Large amounts of data
    const shifts: Shift[] = []
    for (let i = 0; i < 100; i++) {
      shifts.push(createMockShift(`stress-sch-${i}`, today, 'scheduled', brands[0].id, platforms[0].id, '14:00:00', '16:00:00', undefined, undefined))
    }
    const registrations: ShiftRegistration[] = []
    for (let i = 0; i < 50; i++) {
      registrations.push({ id: `reg-${i}`, shift_id: `stress-sch-${i}`, user_id: currentUserId, operational_role: 'host', source: 'self_registration', requested_at: today, status: 'pending', created_at: today, updated_at: today })
    }
    return { shifts, reports: [], brands, platforms, campaigns: baseData.campaigns, users, registrations, swapRequests: [] }
  }

  return baseData
}

function createMockShift(id: string, date: string, status: Shift['status'], brand_id: string, platform_id: string, start_time: string, end_time: string, host_id?: string, support_id?: string): Shift {
  const today = getCurrentBusinessDate()
  return {
    id, date, start_time, end_time, status, brand_id, platform_id,
    required_host_count: 1, required_support_count: 1, required_technical_count: 1,
    host_id, support_id,
    created_at: today, updated_at: today
  }
}
