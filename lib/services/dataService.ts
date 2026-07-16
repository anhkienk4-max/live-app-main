import { User, Brand, Platform, Campaign, Shift, Report, ReportImage, DashboardUpdate, SwapRequest, OperationalRole, OcrReviewData } from '@/lib/types/database.types'
import {
  mockUsers,
  mockBrands,
  mockPlatforms,
  mockCampaigns,
  mockShifts,
  mockReports,
  mockDashboardUpdates,
  mockSwapRequests,
} from './mockData'

// In-memory data store
let users = [...mockUsers]
let brands = [...mockBrands]
let platforms = [...mockPlatforms]
let campaigns = [...mockCampaigns]
let shifts = [...mockShifts]
let reports = [...mockReports]
let reportImages: ReportImage[] = []
let dashboardUpdates = [...mockDashboardUpdates]
let swapRequests = [...mockSwapRequests]

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 11)

// User Service
export const userService = {
  async getAll(): Promise<User[]> {
    return Promise.resolve([...users])
  },

  async getById(id: string): Promise<User | null> {
    return Promise.resolve(users.find(u => u.id === id) || null)
  },

  async create(data: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const newUser: User = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    users.push(newUser)
    return Promise.resolve(newUser)
  },

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return Promise.resolve(null)
    users[index] = { ...users[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(users[index])
  },

  async delete(id: string): Promise<boolean> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return Promise.resolve(false)
    users.splice(index, 1)
    return Promise.resolve(true)
  },

  async search(query: string): Promise<User[]> {
    const lowerQuery = query.toLowerCase()
    return Promise.resolve(
      users.filter(
        u =>
          u.full_name.toLowerCase().includes(lowerQuery) ||
          u.email.toLowerCase().includes(lowerQuery)
      )
    )
  },

  async getByOperationalRole(role: OperationalRole): Promise<User[]> {
    return Promise.resolve(users.filter(user =>
      user.status === 'active' && (user.operational_roles?.includes(role) ||
        (role === 'host' && user.department === 'Live Host') ||
        (role === 'support' && user.department === 'Live Support'))
    ))
  },
}

// Brand Service
export const brandService = {
  async getAll(): Promise<Brand[]> {
    return Promise.resolve([...brands])
  },

  async getById(id: string): Promise<Brand | null> {
    return Promise.resolve(brands.find(b => b.id === id) || null)
  },

  async create(data: Omit<Brand, 'id' | 'created_at' | 'updated_at'>): Promise<Brand> {
    const newBrand: Brand = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    brands.push(newBrand)
    return Promise.resolve(newBrand)
  },

  async update(id: string, data: Partial<Brand>): Promise<Brand | null> {
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return Promise.resolve(null)
    brands[index] = { ...brands[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(brands[index])
  },

  async delete(id: string): Promise<boolean> {
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return Promise.resolve(false)
    brands.splice(index, 1)
    return Promise.resolve(true)
  },
}

// Platform Service
export const platformService = {
  async getAll(): Promise<Platform[]> {
    return Promise.resolve([...platforms])
  },

  async getById(id: string): Promise<Platform | null> {
    return Promise.resolve(platforms.find(p => p.id === id) || null)
  },

  async create(data: Omit<Platform, 'id' | 'created_at' | 'updated_at'>): Promise<Platform> {
    const newPlatform: Platform = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    platforms.push(newPlatform)
    return Promise.resolve(newPlatform)
  },

  async update(id: string, data: Partial<Platform>): Promise<Platform | null> {
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return Promise.resolve(null)
    platforms[index] = { ...platforms[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(platforms[index])
  },

  async delete(id: string): Promise<boolean> {
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return Promise.resolve(false)
    platforms.splice(index, 1)
    return Promise.resolve(true)
  },
}

// Campaign Service
export const campaignService = {
  async getAll(): Promise<Campaign[]> {
    return Promise.resolve([...campaigns])
  },

  async getById(id: string): Promise<Campaign | null> {
    return Promise.resolve(campaigns.find(c => c.id === id) || null)
  },

  async create(data: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
    const newCampaign: Campaign = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    campaigns.push(newCampaign)
    return Promise.resolve(newCampaign)
  },

  async update(id: string, data: Partial<Campaign>): Promise<Campaign | null> {
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return Promise.resolve(null)
    campaigns[index] = { ...campaigns[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(campaigns[index])
  },

  async delete(id: string): Promise<boolean> {
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return Promise.resolve(false)
    campaigns.splice(index, 1)
    return Promise.resolve(true)
  },

  async getByBrand(brandId: string): Promise<Campaign[]> {
    return Promise.resolve(campaigns.filter(c => c.brand_id === brandId))
  },
}

// Shift Service
export const shiftService = {
  async getAll(): Promise<Shift[]> {
    return Promise.resolve([...shifts])
  },

  async getById(id: string): Promise<Shift | null> {
    return Promise.resolve(shifts.find(s => s.id === id) || null)
  },

  async create(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Promise<Shift> {
    const newShift: Shift = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    shifts.push(newShift)
    return Promise.resolve(newShift)
  },

  async update(id: string, data: Partial<Shift>): Promise<Shift | null> {
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return Promise.resolve(null)
    shifts[index] = { ...shifts[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(shifts[index])
  },

  async delete(id: string): Promise<boolean> {
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return Promise.resolve(false)
    shifts.splice(index, 1)
    return Promise.resolve(true)
  },

  async getByDate(date: string): Promise<Shift[]> {
    return Promise.resolve(shifts.filter(s => s.date === date))
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    return Promise.resolve(
      shifts.filter(s => s.date >= startDate && s.date <= endDate)
    )
  },

  async getByStatus(status: string): Promise<Shift[]> {
    return Promise.resolve(shifts.filter(s => s.status === status))
  },

  async getToday(): Promise<Shift[]> {
    const today = new Date().toISOString().split('T')[0]
    return this.getByDate(today)
  },
}

// Report Service
export const reportService = {
  async getAll(): Promise<Report[]> {
    return Promise.resolve([...reports])
  },

  async getById(id: string): Promise<Report | null> {
    return Promise.resolve(reports.find(r => r.id === id) || null)
  },

  async getByShift(shiftId: string): Promise<Report | null> {
    return Promise.resolve(reports.find(r => r.shift_id === shiftId) || null)
  },

  async getConfirmed(): Promise<Report[]> {
    return Promise.resolve(reports.filter(report => report.metrics_confirmed === true))
  },

  async create(data: Omit<Report, 'id' | 'created_at' | 'updated_at'>): Promise<Report> {
    const newReport: Report = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    reports.push(newReport)
    return Promise.resolve(newReport)
  },

  async update(id: string, data: Partial<Report>): Promise<Report | null> {
    const index = reports.findIndex(r => r.id === id)
    if (index === -1) return Promise.resolve(null)
    reports[index] = { ...reports[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(reports[index])
  },

  async confirmMetrics(id: string, data: Partial<Report>, review: OcrReviewData, confirmedBy = '1'): Promise<Report | null> {
    return this.update(id, {
      ...data,
      ocr_review: { ...review, status: 'confirmed' },
      metrics_confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
    })
  },
}

// Metadata-only service. File uploads will be replaced by Supabase Storage in a future sprint.
export const reportImageService = {
  async getByReport(reportId: string): Promise<ReportImage[]> {
    return Promise.resolve(reportImages.filter(image => image.report_id === reportId))
  },

  async create(data: Omit<ReportImage, 'id' | 'created_at'>): Promise<ReportImage> {
    const image: ReportImage = { ...data, id: generateId(), created_at: new Date().toISOString() }
    reportImages.push(image)
    return Promise.resolve(image)
  },

  async getGroupedByCategory(reportId: string): Promise<Record<string, ReportImage[]>> {
    const images = await this.getByReport(reportId)
    return images.reduce<Record<string, ReportImage[]>>((groups, image) => {
      ;(groups[image.image_type] ??= []).push(image)
      return groups
    }, {})
  },
}

// OCR boundary only. No external OCR API is called in mock-data mode.
export const ocrService = {
  async extractDashboardMetrics(): Promise<OcrReviewData> {
    return Promise.resolve({
      status: 'pending_review',
      metrics: {
        revenue: { value: 0, confidence: 'low', needs_review: true },
        orders: { value: 0, confidence: 'low', needs_review: true },
        viewers: { value: 0, confidence: 'low', needs_review: true },
      },
    })
  },
}

// Dashboard Update Service
export const dashboardUpdateService = {
  async getByShift(shiftId: string): Promise<DashboardUpdate[]> {
    return Promise.resolve(dashboardUpdates.filter(du => du.shift_id === shiftId))
  },

  async create(data: Omit<DashboardUpdate, 'id' | 'created_at' | 'updated_at'>): Promise<DashboardUpdate> {
    const newUpdate: DashboardUpdate = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    dashboardUpdates.push(newUpdate)
    return Promise.resolve(newUpdate)
  },
}

// Swap Request Service
export const swapRequestService = {
  async getAll(): Promise<SwapRequest[]> {
    return Promise.resolve([...swapRequests])
  },

  async getPending(): Promise<SwapRequest[]> {
    return Promise.resolve(swapRequests.filter(sr => sr.status === 'pending'))
  },

  async create(data: Omit<SwapRequest, 'id' | 'created_at' | 'updated_at'>): Promise<SwapRequest> {
    const newRequest: SwapRequest = {
      ...data,
      id: generateId(),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    swapRequests.push(newRequest)
    return Promise.resolve(newRequest)
  },

  async approve(id: string, approverId: string): Promise<SwapRequest | null> {
    const index = swapRequests.findIndex(sr => sr.id === id)
    if (index === -1) return Promise.resolve(null)
    swapRequests[index] = {
      ...swapRequests[index],
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return Promise.resolve(swapRequests[index])
  },

  async reject(id: string, approverId: string): Promise<SwapRequest | null> {
    const index = swapRequests.findIndex(sr => sr.id === id)
    if (index === -1) return Promise.resolve(null)
    swapRequests[index] = {
      ...swapRequests[index],
      status: 'rejected',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return Promise.resolve(swapRequests[index])
  },
}

// Dashboard Stats Service
export const statsService = {
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0]
    const todayShifts = shifts.filter(s => s.date === today)
    const liveShifts = shifts.filter(s => s.status === 'live')
    const completedShifts = shifts.filter(s => s.status === 'completed')
    const pendingSwaps = swapRequests.filter(sr => sr.status === 'pending')
    
    // Calculate total revenue from reports
    const totalRevenue = reports.filter(report => report.metrics_confirmed).reduce((sum, r) => sum + r.revenue, 0)
    
    return Promise.resolve({
      todayLive: todayShifts.length,
      revenueToday: totalRevenue,
      reportsSubmitted: reports.length,
      liveInProgress: liveShifts.length,
      pendingDashboardUpdates: 0, // TODO: Calculate based on shift time
      pendingSwaps: pendingSwaps.length,
      totalStaff: users.length,
      totalBrands: brands.length,
      totalCampaigns: campaigns.length,
      completedShifts: completedShifts.length,
    })
  },
}
