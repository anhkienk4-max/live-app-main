import {
  User, Brand, Platform, Campaign, Shift, Report, DashboardUpdate,
  SwapRequest, AnalyticsEntry, AppSettings
} from '@/lib/types/database.types'
export { templateService } from './templateService'
import {
  mockUsers,
  mockBrands,
  mockPlatforms,
  mockCampaigns,
  mockShifts,
  mockReports,
  mockDashboardUpdates,
  mockSwapRequests,
  mockAnalyticsEntries,
} from './mockData'

// In-memory data store
let users = [...mockUsers]
let brands = [...mockBrands]
let platforms = [...mockPlatforms]
let campaigns = [...mockCampaigns]
let shifts = [...mockShifts]
let reports = [...mockReports]
let dashboardUpdates = [...mockDashboardUpdates]
let swapRequests = [...mockSwapRequests]
let analyticsEntries = [...mockAnalyticsEntries]

// App settings singleton
let appSettings: AppSettings = {
  language: 'en',
  theme: 'system',
  timezone: 'Asia/Ho_Chi_Minh',
  company_name: 'LiveStream Ops',
  notify_shift_reminder: true,
  notify_swap_request: true,
  notify_report_due: true,
  notify_channel: 'in_app',
  ai_provider: 'openai',
  auto_backup: false,
  backup_frequency: 'weekly',
}

// Helper
const generateId = () => Math.random().toString(36).substring(2, 11)

// ─── User Service ─────────────────────────────────────────────────────────────
export const userService = {
  async getAll(): Promise<User[]> {
    return [...users]
  },

  async getById(id: string): Promise<User | null> {
    return users.find(u => u.id === id) || null
  },

  async create(data: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const newUser: User = {
      ...data,
      // keep role in sync with permission for backward compat
      role: data.permission,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    users.push(newUser)
    return newUser
  },

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    const updated = {
      ...users[index],
      ...data,
      // keep role in sync
      role: (data.permission ?? users[index].permission),
      updated_at: new Date().toISOString(),
    }
    users[index] = updated
    return users[index]
  },

  async delete(id: string): Promise<boolean> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return false
    users.splice(index, 1)
    return true
  },

  async search(query: string): Promise<User[]> {
    const q = query.toLowerCase()
    return users.filter(u =>
      u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  },

  /** Return users that can perform a given operational role */
  async getByOperationalRole(role: 'host' | 'support' | 'technical'): Promise<User[]> {
    return users.filter(u => u.operational_roles.includes(role) && u.status === 'active')
  },
}

// ─── Brand Service ────────────────────────────────────────────────────────────
export const brandService = {
  async getAll(): Promise<Brand[]> {
    return [...brands]
  },

  async getById(id: string): Promise<Brand | null> {
    return brands.find(b => b.id === id) || null
  },

  async create(data: Omit<Brand, 'id' | 'created_at' | 'updated_at'>): Promise<Brand> {
    const newBrand: Brand = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    brands.push(newBrand)
    return newBrand
  },

  async update(id: string, data: Partial<Brand>): Promise<Brand | null> {
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return null
    brands[index] = { ...brands[index], ...data, updated_at: new Date().toISOString() }
    return brands[index]
  },

  async delete(id: string): Promise<boolean> {
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return false
    brands.splice(index, 1)
    return true
  },
}

// ─── Platform Service ─────────────────────────────────────────────────────────
export const platformService = {
  async getAll(): Promise<Platform[]> {
    return [...platforms]
  },

  async getById(id: string): Promise<Platform | null> {
    return platforms.find(p => p.id === id) || null
  },

  async create(data: Omit<Platform, 'id' | 'created_at' | 'updated_at'>): Promise<Platform> {
    const newPlatform: Platform = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    platforms.push(newPlatform)
    return newPlatform
  },

  async update(id: string, data: Partial<Platform>): Promise<Platform | null> {
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return null
    platforms[index] = { ...platforms[index], ...data, updated_at: new Date().toISOString() }
    return platforms[index]
  },

  async delete(id: string): Promise<boolean> {
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return false
    platforms.splice(index, 1)
    return true
  },
}

// ─── Campaign Service ─────────────────────────────────────────────────────────
export const campaignService = {
  async getAll(): Promise<Campaign[]> {
    return [...campaigns]
  },

  async getById(id: string): Promise<Campaign | null> {
    return campaigns.find(c => c.id === id) || null
  },

  async create(data: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
    const newCampaign: Campaign = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    campaigns.push(newCampaign)
    return newCampaign
  },

  async update(id: string, data: Partial<Campaign>): Promise<Campaign | null> {
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return null
    campaigns[index] = { ...campaigns[index], ...data, updated_at: new Date().toISOString() }
    return campaigns[index]
  },

  async delete(id: string): Promise<boolean> {
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return false
    campaigns.splice(index, 1)
    return true
  },

  async getByBrand(brandId: string): Promise<Campaign[]> {
    return campaigns.filter(c => c.brand_id === brandId)
  },

  /** Bulk-import campaigns from parsed Excel/Sheets rows */
  async importBulk(rows: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>[]): Promise<Campaign[]> {
    const created: Campaign[] = []
    for (const row of rows) {
      const c = await this.create({ ...row, imported_from: 'excel' })
      created.push(c)
    }
    return created
  },
}

// ─── Shift Service ────────────────────────────────────────────────────────────
export const shiftService = {
  async getAll(): Promise<Shift[]> {
    return [...shifts]
  },

  async getById(id: string): Promise<Shift | null> {
    return shifts.find(s => s.id === id) || null
  },

  async create(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Promise<Shift> {
    const newShift: Shift = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    shifts.push(newShift)
    return newShift
  },

  async update(id: string, data: Partial<Shift>): Promise<Shift | null> {
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return null
    shifts[index] = { ...shifts[index], ...data, updated_at: new Date().toISOString() }
    return shifts[index]
  },

  async delete(id: string): Promise<boolean> {
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return false
    shifts.splice(index, 1)
    return true
  },

  async getByDate(date: string): Promise<Shift[]> {
    return shifts.filter(s => s.date === date)
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    return shifts.filter(s => s.date >= startDate && s.date <= endDate)
  },

  async getByStatus(status: string): Promise<Shift[]> {
    return shifts.filter(s => s.status === status)
  },

  async getToday(): Promise<Shift[]> {
    const today = new Date().toISOString().split('T')[0]
    return this.getByDate(today)
  },

  /** Bulk-import shifts from parsed Excel/Sheets rows */
  async importBulk(rows: Omit<Shift, 'id' | 'created_at' | 'updated_at'>[]): Promise<Shift[]> {
    const created: Shift[] = []
    for (const row of rows) {
      const s = await this.create(row)
      created.push(s)
    }
    return created
  },
}

// ─── Report Service ───────────────────────────────────────────────────────────
export const reportService = {
  async getAll(): Promise<Report[]> {
    return [...reports]
  },

  async getById(id: string): Promise<Report | null> {
    return reports.find(r => r.id === id) || null
  },

  async getByShift(shiftId: string): Promise<Report | null> {
    return reports.find(r => r.shift_id === shiftId) || null
  },

  async create(data: Omit<Report, 'id' | 'created_at' | 'updated_at'>): Promise<Report> {
    const newReport: Report = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    reports.push(newReport)
    return newReport
  },

  async update(id: string, data: Partial<Report>): Promise<Report | null> {
    const index = reports.findIndex(r => r.id === id)
    if (index === -1) return null
    reports[index] = { ...reports[index], ...data, updated_at: new Date().toISOString() }
    return reports[index]
  },
}

// ─── Dashboard Update Service ─────────────────────────────────────────────────
export const dashboardUpdateService = {
  async getByShift(shiftId: string): Promise<DashboardUpdate[]> {
    return dashboardUpdates.filter(du => du.shift_id === shiftId)
  },

  async create(data: Omit<DashboardUpdate, 'id' | 'created_at' | 'updated_at'>): Promise<DashboardUpdate> {
    const newUpdate: DashboardUpdate = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    dashboardUpdates.push(newUpdate)
    return newUpdate
  },
}

// ─── Analytics Service (OCR Workflow) ────────────────────────────────────────
export const analyticsService = {
  async getAll(): Promise<AnalyticsEntry[]> {
    return [...analyticsEntries]
  },

  async getById(id: string): Promise<AnalyticsEntry | null> {
    return analyticsEntries.find(e => e.id === id) || null
  },

  async getByShift(shiftId: string): Promise<AnalyticsEntry[]> {
    return analyticsEntries.filter(e => e.shift_id === shiftId)
  },

  async getPendingReview(): Promise<AnalyticsEntry[]> {
    return analyticsEntries.filter(e => e.ocr_status === 'pending_review')
  },

  /** Create a new entry from a screenshot upload (OCR to be implemented later) */
  async createFromScreenshot(
    shiftId: string,
    screenshotUrl: string,
    extractedData: AnalyticsEntry['extracted_data'] = {},
  ): Promise<AnalyticsEntry> {
    const entry: AnalyticsEntry = {
      id: generateId(),
      shift_id: shiftId,
      screenshot_url: screenshotUrl,
      ocr_status: 'pending_review',
      extracted_data: extractedData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    analyticsEntries.push(entry)
    return entry
  },

  /** User reviews and optionally edits extracted data, then confirms */
  async confirm(
    id: string,
    confirmedData: AnalyticsEntry['extracted_data'],
    reviewerId: string,
  ): Promise<AnalyticsEntry | null> {
    const index = analyticsEntries.findIndex(e => e.id === id)
    if (index === -1) return null
    analyticsEntries[index] = {
      ...analyticsEntries[index],
      ocr_status: 'confirmed',
      confirmed_data: confirmedData,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return analyticsEntries[index]
  },

  async reject(id: string, reviewerId: string): Promise<AnalyticsEntry | null> {
    const index = analyticsEntries.findIndex(e => e.id === id)
    if (index === -1) return null
    analyticsEntries[index] = {
      ...analyticsEntries[index],
      ocr_status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return analyticsEntries[index]
  },

  async update(id: string, data: Partial<AnalyticsEntry>): Promise<AnalyticsEntry | null> {
    const index = analyticsEntries.findIndex(e => e.id === id)
    if (index === -1) return null
    analyticsEntries[index] = { ...analyticsEntries[index], ...data, updated_at: new Date().toISOString() }
    return analyticsEntries[index]
  },
}

// ─── Swap Request Service ─────────────────────────────────────────────────────
export const swapRequestService = {
  async getAll(): Promise<SwapRequest[]> {
    return [...swapRequests]
  },

  async getPending(): Promise<SwapRequest[]> {
    return swapRequests.filter(sr => sr.status === 'pending')
  },

  async getHistory(): Promise<SwapRequest[]> {
    return swapRequests.filter(sr => sr.status !== 'pending')
  },

  async create(
    data: Omit<SwapRequest, 'id' | 'created_at' | 'updated_at' | 'status'>
  ): Promise<SwapRequest> {
    const newRequest: SwapRequest = {
      ...data,
      id: generateId(),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    swapRequests.push(newRequest)
    return newRequest
  },

  async approve(id: string, approverId: string): Promise<SwapRequest | null> {
    const index = swapRequests.findIndex(sr => sr.id === id)
    if (index === -1) return null
    swapRequests[index] = {
      ...swapRequests[index],
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // Apply the swap to the shift
    const sr = swapRequests[index]
    if (sr.new_assignee_id) {
      const shiftIndex = shifts.findIndex(s => s.id === sr.shift_id)
      if (shiftIndex !== -1) {
        if (sr.role_slot === 'host') shifts[shiftIndex].host_id = sr.new_assignee_id
        else if (sr.role_slot === 'support') shifts[shiftIndex].support_id = sr.new_assignee_id
        else if (sr.role_slot === 'technical') shifts[shiftIndex].technical_id = sr.new_assignee_id
        shifts[shiftIndex].updated_at = new Date().toISOString()
      }
    }
    return swapRequests[index]
  },

  async reject(id: string, approverId: string): Promise<SwapRequest | null> {
    const index = swapRequests.findIndex(sr => sr.id === id)
    if (index === -1) return null
    swapRequests[index] = {
      ...swapRequests[index],
      status: 'rejected',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return swapRequests[index]
  },
}

// ─── Settings Service ─────────────────────────────────────────────────────────
export const settingsService = {
  async get(): Promise<AppSettings> {
    return { ...appSettings }
  },

  async update(data: Partial<AppSettings>): Promise<AppSettings> {
    appSettings = { ...appSettings, ...data }
    return { ...appSettings }
  },
}

// ─── Dashboard Stats Service ──────────────────────────────────────────────────
export const statsService = {
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0]
    const todayShifts = shifts.filter(s => s.date === today)
    const liveShifts = shifts.filter(s => s.status === 'live')
    const completedShifts = shifts.filter(s => s.status === 'completed')
    const pendingSwaps = swapRequests.filter(sr => sr.status === 'pending')
    const totalRevenue = reports.reduce((sum, r) => sum + r.revenue, 0)

    return {
      todayLive: todayShifts.length,
      revenueToday: totalRevenue,
      reportsSubmitted: reports.length,
      liveInProgress: liveShifts.length,
      pendingDashboardUpdates: 0,
      pendingSwaps: pendingSwaps.length,
      totalStaff: users.length,
      totalBrands: brands.length,
      totalCampaigns: campaigns.length,
      completedShifts: completedShifts.length,
    }
  },
}
