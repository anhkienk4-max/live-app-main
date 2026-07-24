import {
  User,
  Brand,
  Platform,
  Campaign,
  Shift,
  Report,
  ReportImage,
  DashboardUpdate,
  SwapRequest,
  OperationalRole,
  OcrReviewData,
  OcrCropBox,
  ShiftRegistration,
  ScheduleImportBatch,
  ScheduleImportRow,
  ScheduleImportSource,
  PersonalSettings,
  OperationalSettings,
  ReportDashboardPlatform,
  ScheduleChangeLog,
  AuditAction,
  AuditModule,
  AuditRelatedRecord,
  DeletionImpact,
  ReportRevision,
} from '@/lib/types/database.types'
import { buildDashboardOcrReviewFromRecognition, parseDashboardOcrText } from '@/lib/utils/ocrMetrics'
import { recognizeDashboardImage } from '@/lib/services/imageOcrService'
import { DEFAULT_REQUIRED_STAFF_COUNT, normalizeCapacity, resolveShiftDateTime, shiftDateTimeFields } from '@/lib/utils/shiftUtils'
import { toCanonicalScheduleImportPreviewRow } from '@/lib/utils/scheduleImportPreview'
import { recordAuditEvent } from '@/lib/services/auditService'
import { resolveSystemPermission } from '@/lib/permissions'
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
let shifts: Shift[] = mockShifts.map(shift => ({
  ...shift,
  ...shiftDateTimeFields(shift.date, shift.start_time, shift.end_time),
}))
let reports = [...mockReports]
let reportImages: ReportImage[] = []
let dashboardUpdates = [...mockDashboardUpdates]
let swapRequests = [...mockSwapRequests]
let scheduleImports: ScheduleImportBatch[] = []
let scheduleChangeLogs: ScheduleChangeLog[] = []

const appendReportRevision = (
  report: Report,
  event: ReportRevision['event'],
  actorId: string,
  reason?: string,
) => {
  const version = (report.version_number || report.revisions?.length || 0) + 1
  const revision: ReportRevision = {
    version,
    created_at: nowIso(),
    created_by: actorId,
    status: report.status || 'draft',
    reason,
    event,
    metrics: {
      normalized: report.normalized_metrics ? { ...report.normalized_metrics } : undefined,
      platform: report.platform_metrics ? { ...report.platform_metrics } : undefined,
      revenue: report.revenue,
      orders: report.orders,
      peak_viewer: report.peak_viewer,
      average_viewer: report.average_viewer,
    },
    ocr_review: report.ocr_review ? structuredClone(report.ocr_review) : undefined,
    final_recap: report.final_recap ? { ...report.final_recap } : undefined,
    image_references: reportImages
      .filter(image => image.report_id === report.id && !image.deleted_at)
      .map(image => image.id),
  }
  report.version_number = version
  report.revisions = [...(report.revisions || []), revision]
}

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 11)

const recordScheduleChange = (
  action: string,
  shiftId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  options?: Partial<Pick<ScheduleChangeLog, 'actor_id' | 'source' | 'reason' | 'status'>>,
) => {
  scheduleChangeLogs.unshift({
    id: generateId(),
    timestamp: nowIso(),
    actor_id: options?.actor_id || currentUserService.getId(),
    action,
    shift_id: shiftId,
    before,
    after,
    source: options?.source || 'manual',
    reason: options?.reason,
    status: options?.status || 'success',
  })
}

const roleAssignmentField: Record<OperationalRole, 'host_id' | 'support_id' | 'technical_id'> = {
  host: 'host_id',
  support: 'support_id',
  technical: 'technical_id',
}

const roleRequiredField: Record<OperationalRole, 'required_host_count' | 'required_support_count' | 'required_technical_count'> = {
  host: 'required_host_count',
  support: 'required_support_count',
  technical: 'required_technical_count',
}

const nowIso = () => new Date().toISOString()
const syncMockAuthAccount = (user: User) => {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem('livestream-ops-mock-auth-accounts')
    if (!raw) return
    const accounts = JSON.parse(raw) as Array<{ user: User; password_verifier?: string }>
    const updated = accounts.map(account => account.user.id === user.id ? { ...account, user: { ...account.user, ...user } } : account)
    window.localStorage.setItem('livestream-ops-mock-auth-accounts', JSON.stringify(updated))
  } catch {
    // Ignore storage sync errors for mock auth state.
  }
}
const actorFor = (actorId = currentUserService.getId()) =>
  users.find(user => user.id === actorId) || users[0]
const audit = (
  module: AuditModule,
  action: AuditAction,
  entityType: string,
  entityId: string,
  entityName: string,
  options?: {
    actorId?: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    reason?: string
    source?: Parameters<typeof recordAuditEvent>[0]['source']
    relatedRecords?: AuditRelatedRecord[]
    entityExists?: boolean
  },
) => recordAuditEvent({
  actor: actorFor(options?.actorId),
  module,
  action,
  entity_type: entityType,
  entity_id: entityId,
  entity_name: entityName,
  before: options?.before,
  after: options?.after,
  reason: options?.reason,
  source: options?.source,
  related_records: options?.relatedRecords,
  entity_exists: options?.entityExists,
})
const shiftStartAt = (shift: Shift) => resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)?.startAt ?? new Date(Number.NaN)
const shiftEndAt = (shift: Shift) => resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)?.endAt ?? new Date(Number.NaN)
const shiftsOverlap = (left: Shift, right: Shift) =>
  shiftStartAt(left) < shiftEndAt(right) && shiftEndAt(left) > shiftStartAt(right)

const isLeaderOrAdmin = (userId: string) => {
  const user = users.find(candidate => candidate.id === userId)
  return Boolean(user && ['leader', 'admin'].includes(user.system_permission || user.role))
}

const ensureLeaderOrAdmin = (userId: string) => {
  if (!isLeaderOrAdmin(userId)) {
    throw new Error('Only a Leader or Admin can perform this action.')
  }
}

let shiftRegistrations: ShiftRegistration[] = shifts.flatMap(shift =>
  (Object.entries(roleAssignmentField) as Array<[OperationalRole, keyof Shift]>)
    .filter(([, field]) => Boolean(shift[field]))
    .map(([operationalRole, field]) => ({
      id: `legacy-${shift.id}-${operationalRole}`,
      shift_id: shift.id,
      user_id: shift[field] as string,
      operational_role: operationalRole,
      status: 'approved' as const,
      source: 'legacy_assignment' as const,
      requested_at: shift.created_at,
      reviewed_by: '1',
      reviewed_at: shift.created_at,
      created_at: shift.created_at,
      updated_at: shift.updated_at,
    })),
)

const countRecord = (entityType: string, entityName: string, count: number): AuditRelatedRecord[] =>
  count > 0 ? [{ entity_type: entityType, entity_id: '*', entity_name: entityName, count }] : []

const staffRelatedRecords = (userId: string): AuditRelatedRecord[] => [
  ...countRecord('shift', 'Assigned shifts', shifts.filter(shift =>
    shift.host_id === userId || shift.support_id === userId || shift.technical_id === userId
  ).length),
  ...countRecord('registration', 'Shift registrations', shiftRegistrations.filter(registration => registration.user_id === userId).length),
  ...countRecord('report', 'Submitted reports', reports.filter(report => report.submitted_by === userId).length),
]

const brandRelatedRecords = (brandId: string): AuditRelatedRecord[] => {
  const brandShiftIds = new Set(shifts.filter(shift => shift.brand_id === brandId).map(shift => shift.id))
  return [
    ...countRecord('campaign', 'Campaigns', campaigns.filter(campaign => campaign.brand_id === brandId).length),
    ...countRecord('shift', 'Shifts', brandShiftIds.size),
    ...countRecord('report', 'Reports', reports.filter(report => brandShiftIds.has(report.shift_id)).length),
  ]
}

const platformRelatedRecords = (platformId: string): AuditRelatedRecord[] => {
  const platformShiftIds = new Set(shifts.filter(shift => shift.platform_id === platformId).map(shift => shift.id))
  return [
    ...countRecord('shift', 'Shifts', platformShiftIds.size),
    ...countRecord('report', 'Reports', reports.filter(report => platformShiftIds.has(report.shift_id)).length),
  ]
}

const campaignRelatedRecords = (campaignId: string): AuditRelatedRecord[] => {
  const campaignShiftIds = new Set(shifts.filter(shift => shift.campaign_id === campaignId).map(shift => shift.id))
  return [
    ...countRecord('shift', 'Shifts', campaignShiftIds.size),
    ...countRecord('report', 'Reports', reports.filter(report => campaignShiftIds.has(report.shift_id)).length),
  ]
}

let operationalSettings: OperationalSettings = {
  registration_cutoff_hours: 6,
  auto_lock_filled_shifts: true,
  allow_multi_role_per_shift: false,
  require_registration_approval: true,
  team_notifications_enabled: true,
  swap_approval_required: true,
  require_report_review: true,
  report_reminder_hours: 12,
  default_host_count: DEFAULT_REQUIRED_STAFF_COUNT,
  default_support_count: DEFAULT_REQUIRED_STAFF_COUNT,
  default_technical_count: DEFAULT_REQUIRED_STAFF_COUNT,
}

let personalSettings = new Map<string, PersonalSettings>()
let systemSettings: Record<string, string | number | boolean> = {
  export_include_metadata: true,
  export_file_format: 'xlsx',
  import_duplicate_warning: true,
  import_allow_public_csv: true,
  brand_default_status: 'active',
  platform_default_status: 'active',
  campaign_default_status: 'draft',
  localization_default: 'en',
  audit_enabled: true,
  audit_retention_days: 90,
  maintenance_mode: false,
  ocr_provider: 'tesseract.js',
  integration_mode: 'mock',
  supabase_connection_status: 'not_configured',
}

const settingsSessionKey = (scope: string) => `livestream-ops-settings-${scope}`
const readSessionSetting = <T>(scope: string): T | null => {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(settingsSessionKey(scope))
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}
const writeSessionSetting = (scope: string, value: unknown) => {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(settingsSessionKey(scope), JSON.stringify(value))
  }
}

// User Service
export const userService = {
  async getAll(): Promise<User[]> {
    return Promise.resolve(users.filter(user => !user.deleted_at))
  },

  async getAllIncludingDeleted(actorId: string): Promise<User[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view deleted staff.')
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
    syncMockAuthAccount(newUser)
    audit('staff', 'create', 'staff', newUser.id, newUser.full_name, { actorId: currentUserService.getId(), after: { ...newUser } })
    return Promise.resolve(newUser)
  },

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...users[index] }
    users[index] = { ...users[index], ...data, updated_at: new Date().toISOString() }
    syncMockAuthAccount(users[index])
    audit('staff', 'update', 'staff', id, users[index].full_name, { before, after: { ...users[index] } })
    return Promise.resolve(users[index])
  },

  async approvePendingAccount(id: string, actorId = currentUserService.getId()): Promise<User | null> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can approve pending accounts.')
    const before = { ...users[index] }
    users[index] = {
      ...users[index],
      status: 'active',
      account_status: 'active',
      email_verified: true,
      updated_at: nowIso(),
    }
    syncMockAuthAccount(users[index])
    audit('staff', 'account_approved', 'account', id, users[index].full_name, {
      actorId,
      before,
      after: { ...users[index] },
      reason: 'Approved by admin',
    })
    return users[index]
  },

  async rejectPendingAccount(id: string, actorId = currentUserService.getId()): Promise<User | null> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can reject pending accounts.')
    const before = { ...users[index] }
    users[index] = {
      ...users[index],
      status: 'inactive',
      account_status: 'rejected',
      email_verified: true,
      updated_at: nowIso(),
    }
    syncMockAuthAccount(users[index])
    audit('staff', 'account_rejected', 'account', id, users[index].full_name, {
      actorId,
      before,
      after: { ...users[index] },
      reason: 'Rejected by admin',
    })
    return users[index]
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Deactivated by administrator'): Promise<User | null> {
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can deactivate staff.')
    const before = { ...users[index] }
    const timestamp = nowIso()
    users[index] = { ...users[index], status: 'inactive', archived_at: timestamp, archived_by: actorId, deletion_reason: reason, updated_at: timestamp }
    const related = staffRelatedRecords(id)
    audit('staff', 'archive', 'staff', id, users[index].full_name, { actorId, before, after: { ...users[index] }, reason, relatedRecords: related })
    return users[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<User | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore staff.')
    const index = users.findIndex(user => user.id === id)
    if (index === -1) return null
    const before = { ...users[index] }
    users[index] = { ...users[index], status: 'active', archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    audit('staff', 'restore', 'staff', id, users[index].full_name, { actorId, before, after: { ...users[index] }, reason })
    return users[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.archive(id))
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

export const currentUserService = {
  getId(): string {
    if (typeof window === 'undefined') return '1'
    if (process.env.NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER !== 'true') return '1'
    return window.localStorage.getItem('livestream-ops-current-user') || '1'
  },

  async getCurrent(): Promise<User> {
    const id = this.getId()
    return users.find(user => user.id === id) || users[0]
  },

  async setCurrent(id: string): Promise<User | null> {
    const user = users.find(candidate => candidate.id === id) || null
    if (!user) return null
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('livestream-ops-current-user', id)
      window.dispatchEvent(new CustomEvent('livestream-ops-current-user-change', { detail: id }))
    }
    return user
  },
}

// Brand Service
export const brandService = {
  async getAll(): Promise<Brand[]> {
    return Promise.resolve(brands.filter(brand => !brand.deleted_at && !brand.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Brand[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived brands.')
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
    audit('brands', 'create', 'brand', newBrand.id, newBrand.name, { after: { ...newBrand } })
    return Promise.resolve(newBrand)
  },

  async update(id: string, data: Partial<Brand>): Promise<Brand | null> {
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...brands[index] }
    brands[index] = { ...brands[index], ...data, updated_at: new Date().toISOString() }
    audit('brands', 'update', 'brand', id, brands[index].name, { before, after: { ...brands[index] } })
    return Promise.resolve(brands[index])
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Archived by administrator'): Promise<Brand | null> {
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive brands.')
    const before = { ...brands[index] }
    brands[index] = { ...brands[index], status: 'inactive', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('brands', 'archive', 'brand', id, brands[index].name, { actorId, before, after: { ...brands[index] }, reason, relatedRecords: brandRelatedRecords(id) })
    return brands[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Brand | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore brands.')
    const index = brands.findIndex(brand => brand.id === id)
    if (index === -1) return null
    const before = { ...brands[index] }
    brands[index] = { ...brands[index], status: 'active', archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    audit('brands', 'restore', 'brand', id, brands[index].name, { actorId, before, after: { ...brands[index] }, reason })
    return brands[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.archive(id))
  },
}

// Platform Service
export const platformService = {
  async getAll(): Promise<Platform[]> {
    return Promise.resolve(platforms.filter(platform => !platform.deleted_at && !platform.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Platform[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived platforms.')
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
    audit('platforms', 'create', 'platform', newPlatform.id, newPlatform.name, { after: { ...newPlatform } })
    return Promise.resolve(newPlatform)
  },

  async update(id: string, data: Partial<Platform>): Promise<Platform | null> {
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...platforms[index] }
    platforms[index] = { ...platforms[index], ...data, updated_at: new Date().toISOString() }
    audit('platforms', 'update', 'platform', id, platforms[index].name, { before, after: { ...platforms[index] } })
    return Promise.resolve(platforms[index])
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Archived by administrator'): Promise<Platform | null> {
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive platforms.')
    const before = { ...platforms[index] }
    platforms[index] = { ...platforms[index], status: 'inactive', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('platforms', 'archive', 'platform', id, platforms[index].name, { actorId, before, after: { ...platforms[index] }, reason, relatedRecords: platformRelatedRecords(id) })
    return platforms[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Platform | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore platforms.')
    const index = platforms.findIndex(platform => platform.id === id)
    if (index === -1) return null
    const before = { ...platforms[index] }
    platforms[index] = { ...platforms[index], status: 'active', archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    audit('platforms', 'restore', 'platform', id, platforms[index].name, { actorId, before, after: { ...platforms[index] }, reason })
    return platforms[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.archive(id))
  },
}

// Campaign Service
export const campaignService = {
  async getAll(): Promise<Campaign[]> {
    return Promise.resolve(campaigns.filter(campaign => !campaign.deleted_at && !campaign.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Campaign[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived campaigns.')
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
    audit('campaigns', 'create', 'campaign', newCampaign.id, newCampaign.name, { after: { ...newCampaign } })
    return Promise.resolve(newCampaign)
  },

  async update(id: string, data: Partial<Campaign>): Promise<Campaign | null> {
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], ...data, updated_at: new Date().toISOString() }
    const action: AuditAction = data.website_preview_image === null || data.website_url === null ? 'remove_upload' : 'update'
    audit('campaigns', action, 'campaign', id, campaigns[index].name, { before, after: { ...campaigns[index] } })
    return Promise.resolve(campaigns[index])
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Archived by administrator'): Promise<Campaign | null> {
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive campaigns.')
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], status: 'cancelled', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('campaigns', 'archive', 'campaign', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] }, reason, relatedRecords: campaignRelatedRecords(id) })
    return campaigns[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Campaign | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore campaigns.')
    const index = campaigns.findIndex(campaign => campaign.id === id)
    if (index === -1) return null
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], status: 'draft', archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    audit('campaigns', 'restore', 'campaign', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] }, reason })
    return campaigns[index]
  },

  async removeWebsitePreview(id: string, actorId: string, reason: string): Promise<Campaign | null> {
    const index = campaigns.findIndex(campaign => campaign.id === id)
    if (index === -1) return null
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], website_url: null, campaign_url: undefined, website_preview_image: null, website_embed_enabled: false, updated_at: nowIso() }
    audit('campaigns', 'remove_upload', 'campaign_website', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] }, reason })
    return campaigns[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.archive(id))
  },

  async getByBrand(brandId: string): Promise<Campaign[]> {
    return Promise.resolve(campaigns.filter(c => c.brand_id === brandId && !c.deleted_at && !c.archived_at))
  },
}

// Shift Service
export const shiftService = {
  async getAll(): Promise<Shift[]> {
    return Promise.resolve(shifts.filter(shift => !shift.deleted_at))
  },

  async getAllIncludingDeleted(actorId: string): Promise<Shift[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view deleted shifts.')
    return Promise.resolve([...shifts])
  },

  async getById(id: string): Promise<Shift | null> {
    return Promise.resolve(shifts.find(s => s.id === id) || null)
  },

  async create(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Promise<Shift> {
    const dateTime = shiftDateTimeFields(data.date, data.start_time, data.end_time)
    if (!dateTime) throw new Error('Shift date or duration is invalid.')
    const requiredHostCount = normalizeCapacity(data.required_host_count, operationalSettings.default_host_count)
    const requiredSupportCount = normalizeCapacity(data.required_support_count, operationalSettings.default_support_count)
    const requiredTechnicalCount = normalizeCapacity(data.required_technical_count, operationalSettings.default_technical_count)
    if (requiredHostCount === null || requiredSupportCount === null || requiredTechnicalCount === null) {
      throw new Error('Required staffing counts must be non-negative whole numbers within the allowed capacity.')
    }
    const newShift: Shift = {
      registration_locked: false,
      allow_multi_role: operationalSettings.allow_multi_role_per_shift,
      ...data,
      required_host_count: requiredHostCount,
      required_support_count: requiredSupportCount,
      required_technical_count: requiredTechnicalCount,
      ...dateTime,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    shifts.push(newShift)
    ;(Object.entries(roleAssignmentField) as Array<[OperationalRole, keyof Shift]>).forEach(([role, field]) => {
      const userId = newShift[field]
      if (!userId) return
      shiftRegistrations.push({
        id: generateId(),
        shift_id: newShift.id,
        user_id: userId as string,
        operational_role: role,
        status: 'approved',
        source: 'manual_assignment',
        requested_at: newShift.created_at,
        reviewed_by: '1',
        reviewed_at: newShift.created_at,
        created_at: newShift.created_at,
        updated_at: newShift.created_at,
      })
    })
    recordScheduleChange('create', newShift.id, undefined, { ...newShift }, {
      source: newShift.import_batch_id
        ? scheduleImports.find(batch => batch.id === newShift.import_batch_id)?.source === 'google_sheets'
          ? 'google_sheets'
          : 'excel_import'
        : 'manual',
    })
    audit('calendar', 'create', 'shift', newShift.id, newShift.title || `${newShift.date} ${newShift.start_time}`, {
      after: { ...newShift },
      source: newShift.import_batch_id ? 'excel_import' : 'manual',
    })
    return Promise.resolve(newShift)
  },

  async update(id: string, data: Partial<Shift>): Promise<Shift | null> {
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...shifts[index] }
    const candidate = { ...shifts[index], ...data }
    const dateTime = shiftDateTimeFields(candidate.date, candidate.start_time, candidate.end_time)
    if (!dateTime) throw new Error('Shift date or duration is invalid.')
    const requiredHostCount = normalizeCapacity(candidate.required_host_count, operationalSettings.default_host_count)
    const requiredSupportCount = normalizeCapacity(candidate.required_support_count, operationalSettings.default_support_count)
    const requiredTechnicalCount = normalizeCapacity(candidate.required_technical_count, operationalSettings.default_technical_count)
    if (requiredHostCount === null || requiredSupportCount === null || requiredTechnicalCount === null) {
      throw new Error('Required staffing counts must be non-negative whole numbers within the allowed capacity.')
    }
    shifts[index] = {
      ...candidate,
      required_host_count: requiredHostCount,
      required_support_count: requiredSupportCount,
      required_technical_count: requiredTechnicalCount,
      ...dateTime,
      updated_at: new Date().toISOString(),
    }
    const action = data.registration_locked === true
      ? 'lock'
      : data.registration_locked === false
        ? 'reopen'
        : data.status === 'cancelled'
          ? 'cancel'
          : 'edit'
    recordScheduleChange(action, id, before, { ...shifts[index] })
    const auditAction: AuditAction = action === 'lock' ? 'lock' : action === 'reopen' ? 'reopen' : 'update'
    audit('calendar', auditAction, 'shift', id, shifts[index].title || `${shifts[index].date} ${shifts[index].start_time}`, {
      before,
      after: { ...shifts[index] },
    })
    return Promise.resolve(shifts[index])
  },

  async getDeletionImpact(id: string): Promise<DeletionImpact | null> {
    const shift = shifts.find(candidate => candidate.id === id)
    if (!shift) return null
    const related = [
      ...countRecord('registration', 'Staff registrations', shiftRegistrations.filter(registration => registration.shift_id === id && registration.status !== 'cancelled' && registration.status !== 'rejected').length),
      ...countRecord('snapshot', 'Live snapshots', dashboardUpdates.filter(update => update.shift_id === id && !update.deleted_at).length),
      ...countRecord('report', 'Final reports', reports.filter(report => report.shift_id === id && !report.deleted_at).length),
    ]
    const requiresHistory = related.length > 0 || ['preparing', 'live', 'paused', 'completed'].includes(shift.status)
    return {
      entity_type: 'shift',
      entity_id: shift.id,
      entity_name: shift.title || `${shift.date} ${shift.start_time}-${shift.end_time}`,
      action: requiresHistory ? 'soft_delete' : 'delete',
      consequence: requiresHistory
        ? 'The shift will be cancelled and hidden from operational lists. Related history remains available.'
        : 'The empty, not-yet-live shift will be permanently removed.',
      reversible: requiresHistory,
      related_records: related,
    }
  },

  async remove(id: string, actorId = currentUserService.getId(), reason = 'Removed by operator'): Promise<DeletionImpact | null> {
    ensureLeaderOrAdmin(actorId)
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return null
    const impact = await this.getDeletionImpact(id)
    if (!impact) return null
    const before = { ...shifts[index] }
    if (impact.action === 'delete') {
      const [deleted] = shifts.splice(index, 1)
      recordScheduleChange('delete', id, { ...deleted }, undefined, { actor_id: actorId, reason })
      audit('calendar', 'delete', 'shift', id, impact.entity_name, { actorId, before, reason, relatedRecords: impact.related_records, entityExists: false })
      return impact
    }
    shifts[index] = {
      ...shifts[index],
      status: 'cancelled',
      deleted_at: nowIso(),
      deleted_by: actorId,
      deletion_reason: reason,
      registration_locked: true,
      updated_at: nowIso(),
    }
    recordScheduleChange('soft_delete', id, before, { ...shifts[index] }, { actor_id: actorId, reason })
    audit('calendar', 'soft_delete', 'shift', id, impact.entity_name, { actorId, before, after: { ...shifts[index] }, reason, relatedRecords: impact.related_records })
    return impact
  },

  async restore(id: string, actorId: string, reason: string): Promise<Shift | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore shifts.')
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return null
    const before = { ...shifts[index] }
    shifts[index] = { ...shifts[index], status: 'scheduled', deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, registration_locked: false, updated_at: nowIso() }
    recordScheduleChange('restore', id, before, { ...shifts[index] }, { actor_id: actorId, reason })
    audit('calendar', 'restore', 'shift', id, shifts[index].title || `${shifts[index].date} ${shifts[index].start_time}`, { actorId, before, after: { ...shifts[index] }, reason })
    return shifts[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.remove(id))
  },

  async getByDate(date: string): Promise<Shift[]> {
    return Promise.resolve(shifts.filter(s => s.date === date && !s.deleted_at))
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    return Promise.resolve(
      shifts.filter(s => s.date >= startDate && s.date <= endDate && !s.deleted_at)
    )
  },

  async getByStatus(status: string): Promise<Shift[]> {
    return Promise.resolve(shifts.filter(s => s.status === status && !s.deleted_at))
  },

  async getToday(): Promise<Shift[]> {
    const today = new Date().toISOString().split('T')[0]
    return this.getByDate(today)
  },

  async getOpen(): Promise<Shift[]> {
    return Promise.resolve(shifts.filter(shift =>
      !shift.deleted_at &&
      shift.status === 'scheduled' &&
      !shift.registration_locked &&
      shiftEndAt(shift) > new Date()
    ))
  },

  async lock(id: string): Promise<Shift | null> {
    return this.update(id, { registration_locked: true })
  },

  async reopen(id: string): Promise<Shift | null> {
    const shift = shifts.find(candidate => candidate.id === id)
    if (!shift || shift.status !== 'scheduled' || shiftEndAt(shift) <= new Date()) return null
    return this.update(id, { registration_locked: false })
  },
}

export interface ShiftRoleCapacity {
  role: OperationalRole
  required: number
  approved: number
  pending: number
  remaining: number
}

export const isStaffedRegistration = (registration: Pick<ShiftRegistration, 'status'>) =>
  registration.status === 'approved' || registration.status === 'manually_assigned'

const capacityFor = (shift: Shift, role: OperationalRole): ShiftRoleCapacity => {
  const roleRegistrations = shiftRegistrations.filter(registration =>
    registration.shift_id === shift.id &&
    registration.operational_role === role &&
    (isStaffedRegistration(registration) || registration.status === 'pending')
  )
  const required = shift[roleRequiredField[role]] ?? 1
  const approved = roleRegistrations.filter(isStaffedRegistration).length
  const pending = roleRegistrations.filter(registration => registration.status === 'pending').length
  return {
    role,
    required,
    approved,
    pending,
    remaining: Math.max(0, required - approved),
  }
}

const isFullyStaffed = (shift: Shift) =>
  (['host', 'support', 'technical'] as OperationalRole[]).every(role => {
    const capacity = capacityFor(shift, role)
    return capacity.approved >= capacity.required
  })

const registrationCutoffAt = (shift: Shift) => {
  if (shift.registration_cutoff_at) return new Date(shift.registration_cutoff_at)
  const cutoff = shiftStartAt(shift)
  cutoff.setHours(cutoff.getHours() - operationalSettings.registration_cutoff_hours)
  return cutoff
}

const findRegistrationConflict = (
  userId: string,
  targetShift: Shift,
  excludeRegistrationId?: string,
): ShiftRegistration | undefined =>
  shiftRegistrations.find(registration => {
    if (
      registration.id === excludeRegistrationId ||
      registration.user_id !== userId ||
      (registration.status !== 'pending' && !isStaffedRegistration(registration))
    ) return false
    const existingShift = shifts.find(shift => shift.id === registration.shift_id)
    return Boolean(existingShift && existingShift.id !== targetShift.id && shiftsOverlap(existingShift, targetShift))
  })

export const shiftRegistrationService = {
  async getAll(): Promise<ShiftRegistration[]> {
    return Promise.resolve([...shiftRegistrations])
  },

  async getForShift(shiftId: string): Promise<ShiftRegistration[]> {
    return Promise.resolve(shiftRegistrations.filter(registration => registration.shift_id === shiftId))
  },

  async getForUser(userId: string): Promise<ShiftRegistration[]> {
    return Promise.resolve(shiftRegistrations.filter(registration => registration.user_id === userId))
  },

  async getCapacity(shiftId: string): Promise<ShiftRoleCapacity[]> {
    const shift = shifts.find(candidate => candidate.id === shiftId)
    if (!shift) return []
    return Promise.resolve((['host', 'support', 'technical'] as OperationalRole[]).map(role => capacityFor(shift, role)))
  },

  async getMyApprovedShifts(userId: string): Promise<Shift[]> {
    const shiftIds = new Set(shiftRegistrations
      .filter(registration => registration.user_id === userId && isStaffedRegistration(registration))
      .map(registration => registration.shift_id))
    return Promise.resolve(shifts.filter(shift => shiftIds.has(shift.id) && !shift.deleted_at))
  },

  async register(shiftId: string, userId: string, role: OperationalRole): Promise<ShiftRegistration> {
    const shift = shifts.find(candidate => candidate.id === shiftId)
    const user = users.find(candidate => candidate.id === userId)
    if (!shift || !user) throw new Error('Shift or staff member was not found.')
    if (shift.status !== 'scheduled' || shift.registration_locked || registrationCutoffAt(shift) <= new Date()) {
      throw new Error('Registration is closed for this shift.')
    }
    if (!user.operational_roles?.includes(role)) {
      throw new Error('This role is not assigned to the staff profile.')
    }
    if (capacityFor(shift, role).remaining <= 0) {
      throw new Error('No remaining position is available for this role.')
    }
    const sameShift = shiftRegistrations.find(registration =>
      registration.shift_id === shiftId &&
      registration.user_id === userId &&
      (registration.status === 'pending' || isStaffedRegistration(registration))
    )
    if (sameShift?.operational_role === role) {
      throw new Error('This staff member already has this role in the shift.')
    }
    if (sameShift && !shift.allow_multi_role && !operationalSettings.allow_multi_role_per_shift) {
      throw new Error('A staff member cannot occupy multiple roles in the same shift.')
    }
    const conflict = findRegistrationConflict(userId, shift)
    if (conflict) {
      const conflictingShift = shifts.find(candidate => candidate.id === conflict.shift_id)
      throw new Error(`Schedule conflict with ${conflictingShift?.date} ${conflictingShift?.start_time}-${conflictingShift?.end_time}.`)
    }
    const timestamp = nowIso()
    const registration: ShiftRegistration = {
      id: generateId(),
      shift_id: shiftId,
      user_id: userId,
      operational_role: role,
      status: 'pending',
      source: 'self_registration',
      requested_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    }
    shiftRegistrations.push(registration)
    recordScheduleChange('register', shiftId, undefined, { ...registration }, { actor_id: userId })
    audit('calendar', 'register', 'shift_registration', registration.id, `${user.full_name} · ${role}`, { actorId: userId, after: { ...registration }, relatedRecords: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }] })
    if (!operationalSettings.require_registration_approval) {
      return this.approve(registration.id, 'system')
    }
    return Promise.resolve(registration)
  },

  async approve(id: string, reviewerId: string, notes?: string): Promise<ShiftRegistration> {
    if (reviewerId !== 'system') ensureLeaderOrAdmin(reviewerId)
    const index = shiftRegistrations.findIndex(registration => registration.id === id)
    if (index === -1) throw new Error('Registration was not found.')
    const registration = shiftRegistrations[index]
    if (registration.status !== 'pending') throw new Error('Only a pending registration can be approved.')
    const shift = shifts.find(candidate => candidate.id === registration.shift_id)
    if (!shift) throw new Error('Shift was not found.')
    const approvedCount = shiftRegistrations.filter(candidate =>
      candidate.shift_id === shift.id &&
      candidate.operational_role === registration.operational_role &&
      isStaffedRegistration(candidate) &&
      candidate.id !== id
    ).length
    const required = shift[roleRequiredField[registration.operational_role]] ?? 1
    if (approvedCount >= required) throw new Error('This role is already full.')
    const conflict = findRegistrationConflict(registration.user_id, shift, id)
    if (conflict) throw new Error('The staff member now has a conflicting approved or pending shift.')
    const timestamp = nowIso()
    shiftRegistrations[index] = {
      ...registration,
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      review_notes: notes,
      updated_at: timestamp,
    }
    const shiftIndex = shifts.findIndex(candidate => candidate.id === shift.id)
    const assignmentField = roleAssignmentField[registration.operational_role]
    if (!shifts[shiftIndex][assignmentField]) {
      shifts[shiftIndex] = { ...shifts[shiftIndex], [assignmentField]: registration.user_id, updated_at: timestamp }
    }
    if (operationalSettings.auto_lock_filled_shifts && isFullyStaffed(shifts[shiftIndex])) {
      shifts[shiftIndex] = { ...shifts[shiftIndex], registration_locked: true, updated_at: timestamp }
    }
    recordScheduleChange('approve', shift.id, { status: registration.status }, { ...shiftRegistrations[index] }, { actor_id: reviewerId, reason: notes })
    audit('calendar', 'approve', 'shift_registration', id, `${actorFor(registration.user_id).full_name} · ${registration.operational_role}`, { actorId: reviewerId === 'system' ? currentUserService.getId() : reviewerId, before: { ...registration }, after: { ...shiftRegistrations[index] }, reason: notes, source: reviewerId === 'system' ? 'system' : 'manual' })
    return Promise.resolve(shiftRegistrations[index])
  },

  async reject(id: string, reviewerId: string, notes?: string): Promise<ShiftRegistration> {
    ensureLeaderOrAdmin(reviewerId)
    const index = shiftRegistrations.findIndex(registration => registration.id === id)
    if (index === -1) throw new Error('Registration was not found.')
    if (shiftRegistrations[index].status !== 'pending') throw new Error('Only a pending registration can be rejected.')
    const timestamp = nowIso()
    shiftRegistrations[index] = {
      ...shiftRegistrations[index],
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      review_notes: notes,
      updated_at: timestamp,
    }
    recordScheduleChange('reject', shiftRegistrations[index].shift_id, { status: 'pending' }, { ...shiftRegistrations[index] }, { actor_id: reviewerId, reason: notes })
    audit('calendar', 'reject', 'shift_registration', id, `${actorFor(shiftRegistrations[index].user_id).full_name} · ${shiftRegistrations[index].operational_role}`, { actorId: reviewerId, before: { status: 'pending' }, after: { ...shiftRegistrations[index] }, reason: notes })
    return Promise.resolve(shiftRegistrations[index])
  },

  async cancel(id: string, userId: string, reason?: string): Promise<ShiftRegistration> {
    const index = shiftRegistrations.findIndex(registration => registration.id === id)
    if (index === -1 || shiftRegistrations[index].user_id !== userId) {
      throw new Error('Registration was not found.')
    }
    const registration = shiftRegistrations[index]
    const shiftIndex = shifts.findIndex(candidate => candidate.id === registration.shift_id)
    const shift = shifts[shiftIndex]
    if (!shift || shift.registration_locked || registrationCutoffAt(shift) <= new Date()) {
      throw new Error('The cancellation cutoff has passed.')
    }
    const timestamp = nowIso()
    shiftRegistrations[index] = {
      ...registration,
      status: 'cancelled',
      cancelled_at: timestamp,
      updated_at: timestamp,
    }
    const assignmentField = roleAssignmentField[registration.operational_role]
    if (shift[assignmentField] === userId) {
      const replacement = shiftRegistrations.find(candidate =>
        candidate.shift_id === shift.id &&
        candidate.operational_role === registration.operational_role &&
        isStaffedRegistration(candidate) &&
        candidate.id !== id
      )
      shifts[shiftIndex] = {
        ...shift,
        [assignmentField]: replacement?.user_id,
        registration_locked: false,
        updated_at: timestamp,
      }
    }
    recordScheduleChange('cancel_registration', shift.id, { ...registration }, { ...shiftRegistrations[index] }, { actor_id: userId, reason })
    audit('calendar', 'cancel_registration', 'shift_registration', id, `${actorFor(userId).full_name} · ${registration.operational_role}`, { actorId: userId, before: { ...registration }, after: { ...shiftRegistrations[index] }, reason })
    return Promise.resolve(shiftRegistrations[index])
  },

  async assignManually(
    shiftId: string,
    userId: string,
    role: OperationalRole,
    reviewerId: string,
  ): Promise<ShiftRegistration> {
    const shift = shifts.find(candidate => candidate.id === shiftId)
    const user = users.find(candidate => candidate.id === userId)
    ensureLeaderOrAdmin(reviewerId)
    if (!shift || !user) throw new Error('Shift or staff member was not found.')
    if (!user.operational_roles?.includes(role)) throw new Error('The staff member is not eligible for this role.')
    if (capacityFor(shift, role).approved >= (shift[roleRequiredField[role]] ?? 1)) {
      throw new Error('This role is already full.')
    }
    if (findRegistrationConflict(userId, shift)) throw new Error('The staff member has a schedule conflict.')
    const sameShift = shiftRegistrations.find(registration =>
      registration.shift_id === shiftId &&
      registration.user_id === userId &&
      (registration.status === 'pending' || isStaffedRegistration(registration))
    )
    if (sameShift?.operational_role === role) {
      throw new Error('This staff member already has this role in the shift.')
    }
    if (sameShift && !shift.allow_multi_role && !operationalSettings.allow_multi_role_per_shift) {
      throw new Error('A staff member cannot occupy multiple roles in the same shift.')
    }
    const timestamp = nowIso()
    const registration: ShiftRegistration = {
      id: generateId(),
      shift_id: shiftId,
      user_id: userId,
      operational_role: role,
      status: 'manually_assigned',
      source: 'manual_assignment',
      requested_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    }
    shiftRegistrations.push(registration)
    const shiftIndex = shifts.findIndex(candidate => candidate.id === shiftId)
    const assignmentField = roleAssignmentField[role]
    if (!shifts[shiftIndex][assignmentField]) {
      shifts[shiftIndex] = { ...shifts[shiftIndex], [assignmentField]: userId, updated_at: timestamp }
    }
    if (operationalSettings.auto_lock_filled_shifts && isFullyStaffed(shifts[shiftIndex])) {
      shifts[shiftIndex] = { ...shifts[shiftIndex], registration_locked: true, updated_at: timestamp }
    }
    recordScheduleChange('manual_assign', shiftId, undefined, { ...registration }, { actor_id: reviewerId })
    audit('calendar', 'assign', 'shift_registration', registration.id, `${user.full_name} · ${role}`, { actorId: reviewerId, after: { ...registration }, relatedRecords: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }] })
    return registration
  },

  async removeAssignment(id: string, reviewerId: string, notes?: string): Promise<ShiftRegistration> {
    ensureLeaderOrAdmin(reviewerId)
    const index = shiftRegistrations.findIndex(registration => registration.id === id)
    if (index === -1) throw new Error('Registration was not found.')
    const registration = shiftRegistrations[index]
    const shiftIndex = shifts.findIndex(candidate => candidate.id === registration.shift_id)
    if (shiftIndex === -1) throw new Error('Shift was not found.')
    const shift = shifts[shiftIndex]
    const timestamp = nowIso()
    shiftRegistrations[index] = {
      ...registration,
      status: 'removed',
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      review_notes: notes,
      cancelled_at: timestamp,
      updated_at: timestamp,
    }
    const assignmentField = roleAssignmentField[registration.operational_role]
    if (shift[assignmentField] === registration.user_id) {
      const replacement = shiftRegistrations.find(candidate =>
        candidate.shift_id === shift.id &&
        candidate.operational_role === registration.operational_role &&
        isStaffedRegistration(candidate) &&
        candidate.id !== id
      )
      shifts[shiftIndex] = {
        ...shift,
        [assignmentField]: replacement?.user_id,
        registration_locked: false,
        updated_at: timestamp,
      }
    }
    recordScheduleChange('remove_assignment', shift.id, { ...registration }, { ...shiftRegistrations[index] }, { actor_id: reviewerId, reason: notes })
    audit('calendar', 'unassign', 'shift_registration', id, `${actorFor(registration.user_id).full_name} · ${registration.operational_role}`, { actorId: reviewerId, before: { ...registration }, after: { ...shiftRegistrations[index] }, reason: notes })
    return Promise.resolve(shiftRegistrations[index])
  },
}

// Report Service
export const reportService = {
  async getAll(): Promise<Report[]> {
    return Promise.resolve(reports.filter(report => !report.deleted_at && !report.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Report[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived reports.')
    return Promise.resolve([...reports])
  },

  async getById(id: string): Promise<Report | null> {
    return Promise.resolve(reports.find(r => r.id === id) || null)
  },

  async getByShift(shiftId: string): Promise<Report | null> {
    return Promise.resolve(reports.find(r => r.shift_id === shiftId && !r.deleted_at && !r.archived_at) || null)
  },

  async getConfirmed(): Promise<Report[]> {
    return Promise.resolve(reports.filter(report =>
      report.status === 'confirmed' &&
      report.metrics_confirmed === true &&
      !report.deleted_at &&
      !report.archived_at
    ))
  },

  async create(data: Omit<Report, 'id' | 'created_at' | 'updated_at'>): Promise<Report> {
    const shift = shifts.find(candidate => candidate.id === data.shift_id)
    if (!shift || !['preparing', 'live', 'paused', 'completed'].includes(shift.status)) {
      throw new Error('A Final Report draft is available only after the live workflow has started.')
    }
    if (reports.some(report => report.shift_id === data.shift_id && !report.archived_at && !report.deleted_at)) {
      throw new Error('A report already exists for this shift.')
    }
    const submitter = users.find(user => user.id === data.submitted_by)
    const elevated = submitter?.system_permission === 'leader' || submitter?.system_permission === 'admin' ||
      submitter?.role === 'leader' || submitter?.role === 'admin'
    const assigned = Boolean(data.submitted_by && (
      shift.host_id === data.submitted_by ||
      shift.support_id === data.submitted_by ||
      shift.technical_id === data.submitted_by ||
      shiftRegistrations.some(registration =>
        registration.shift_id === shift.id &&
        registration.user_id === data.submitted_by &&
        isStaffedRegistration(registration)
      )
    ))
    if (!submitter || (!elevated && !assigned)) throw new Error('Only assigned staff or an operational leader can submit this report.')
    const newReport: Report = {
      ...data,
      status: 'draft',
      metrics_confirmed: false,
      confirmed_at: undefined,
      confirmed_by: undefined,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    appendReportRevision(newReport, 'create', data.submitted_by || currentUserService.getId(), 'Initial Final Report draft')
    reports.push(newReport)
    audit('reports', 'create', 'report', newReport.id, `Report · ${shift.title || shift.date}`, { actorId: data.submitted_by, after: { ...newReport }, relatedRecords: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }] })
    return Promise.resolve(newReport)
  },

  async update(
    id: string,
    data: Partial<Report>,
    actorId = currentUserService.getId(),
    reason?: string,
    event: ReportRevision['event'] = 'save',
  ): Promise<Report | null> {
    const index = reports.findIndex(r => r.id === id)
    if (index === -1) return Promise.resolve(null)
    if (reports[index].status === 'confirmed' && event === 'save') {
      throw new Error('Reopen the confirmed report before editing it.')
    }
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], ...data, updated_at: new Date().toISOString() }
    appendReportRevision(reports[index], event, actorId, reason)
    audit('reports', 'update', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, reason })
    return Promise.resolve(reports[index])
  },

  async confirmMetrics(id: string, data: Partial<Report>, review: OcrReviewData, confirmedBy = '1'): Promise<Report | null> {
    const reviewer = users.find(user => user.id === confirmedBy)
    if (!reviewer || !['leader', 'admin'].includes(reviewer.system_permission || reviewer.role)) {
      throw new Error('Only a Leader or Admin can confirm report metrics.')
    }
    const unresolvedMetrics = Object.values(review.metrics).filter(metric =>
      metric?.status === 'review_required' || metric?.needs_review,
    )
    if (unresolvedMetrics.length > 0) {
      throw new Error(`Confirm or manually edit all review-required metrics before confirming this report (${unresolvedMetrics.length} remaining).`)
    }
    const result = await this.update(id, {
      ...data,
      ocr_review: { ...review, status: 'confirmed' },
      metrics_confirmed: true,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
      reviewed_by: confirmedBy,
      reviewed_at: new Date().toISOString(),
    }, confirmedBy, data.review_notes, 'confirm')
    if (result) audit('reports', 'confirm', 'report', id, `Report · ${result.shift_id}`, { actorId: confirmedBy, after: { ...result } })
    return result
  },

  async startReview(id: string, reviewerId: string): Promise<Report | null> {
    const reviewer = users.find(user => user.id === reviewerId)
    if (!reviewer || !['leader', 'admin'].includes(reviewer.system_permission || reviewer.role)) {
      throw new Error('Only a Leader or Admin can review reports.')
    }
    return this.update(id, {
      status: 'in_review',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    }, reviewerId, 'Started report review')
  },

  async rejectReview(id: string, reviewerId: string, notes: string): Promise<Report | null> {
    const reviewer = users.find(user => user.id === reviewerId)
    if (!reviewer || !['leader', 'admin'].includes(reviewer.system_permission || reviewer.role)) {
      throw new Error('Only a Leader or Admin can reject reports.')
    }
    const result = await this.update(id, {
      status: 'reopened',
      metrics_confirmed: false,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
    }, reviewerId, notes, 'reopen')
    if (result) audit('reports', 'reject', 'report', id, `Report · ${result.shift_id}`, { actorId: reviewerId, after: { ...result }, reason: notes })
    return result
  },

  async reopen(id: string, actorId: string, reason: string): Promise<Report | null> {
    const permission = resolveSystemPermission(actorFor(actorId))
    if (permission !== 'admin' && permission !== 'leader') throw new Error('Only a Leader or Admin can reopen reports.')
    if (!reason.trim()) throw new Error('A reason is required to reopen a confirmed report.')
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return null
    if (reports[index].status !== 'confirmed' || !reports[index].metrics_confirmed) {
      throw new Error('Only a confirmed report can be reopened.')
    }
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], metrics_confirmed: false, status: 'reopened', review_notes: reason, updated_at: nowIso() }
    appendReportRevision(reports[index], 'reopen', actorId, reason)
    audit('reports', 'unconfirm', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, reason })
    return reports[index]
  },

  async unconfirm(id: string, actorId: string, reason: string): Promise<Report | null> {
    return this.reopen(id, actorId, reason)
  },

  async resetOcr(id: string, actorId: string, reason: string): Promise<Report | null> {
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return null
    const actor = actorFor(actorId)
    if (resolveSystemPermission(actor) === 'member' && reports[index].submitted_by !== actorId) {
      throw new Error('You can only reset OCR for your own report.')
    }
    if (reports[index].metrics_confirmed) throw new Error('Undo confirmation before resetting OCR.')
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], raw_ocr_output: undefined, ocr_review: { status: 'waiting', metrics: {} }, normalized_metrics: {}, platform_metrics: {}, updated_at: nowIso() }
    appendReportRevision(reports[index], 'ocr_run', actorId, reason)
    audit('reports', 'ocr_reset', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, reason, source: 'ocr' })
    return reports[index]
  },

  async recordOcrRun(id: string, actorId: string, review: OcrReviewData, rerun = false): Promise<Report | null> {
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return null
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], ocr_review: review, raw_ocr_output: review.raw_output, updated_at: nowIso() }
    appendReportRevision(reports[index], rerun ? 'ocr_rerun' : 'ocr_run', actorId)
    audit('reports', rerun ? 'ocr_rerun' : 'ocr_run', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, source: 'ocr' })
    return reports[index]
  },

  async removeDraft(id: string, actorId: string, reason: string): Promise<boolean> {
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return false
    const report = reports[index]
    const actor = actorFor(actorId)
    if (report.metrics_confirmed) throw new Error('Confirmed reports must be archived or unconfirmed first.')
    if (resolveSystemPermission(actor) === 'member' && report.submitted_by !== actorId) {
      throw new Error('You can only delete your own unconfirmed report.')
    }
    const relatedImages = reportImages.filter(image => image.report_id === id)
    reports.splice(index, 1)
    reportImages = reportImages.filter(image => image.report_id !== id)
    audit('reports', 'delete', 'report', id, `Report · ${report.shift_id}`, { actorId, before: { ...report }, reason, relatedRecords: countRecord('report_image', 'Uploaded report images', relatedImages.length), entityExists: false })
    return true
  },

  async archive(id: string, actorId: string, reason: string): Promise<Report | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive reports.')
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return null
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], status: 'archived', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    appendReportRevision(reports[index], 'archive', actorId, reason)
    audit('reports', 'archive', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, reason })
    return reports[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Report | null> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore reports.')
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return null
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], status: 'reopened', metrics_confirmed: false, archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    appendReportRevision(reports[index], 'reopen', actorId, reason)
    audit('reports', 'restore', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, reason })
    return reports[index]
  },
}

// Metadata-only service. File uploads will be replaced by Supabase Storage in a future sprint.
export const reportImageService = {
  async getByReport(reportId: string): Promise<ReportImage[]> {
    return Promise.resolve(reportImages.filter(image => image.report_id === reportId && !image.deleted_at))
  },

  async create(data: Omit<ReportImage, 'id' | 'created_at'>): Promise<ReportImage> {
    const parentReport = reports.find(report => report.id === data.report_id)
    if (!parentReport) throw new Error('Report was not found.')
    if (parentReport.metrics_confirmed || parentReport.status === 'confirmed') {
      throw new Error('Reopen the confirmed report before uploading new evidence.')
    }
    const image: ReportImage = {
      ...data,
      uploaded_by: data.uploaded_by || currentUserService.getId(),
      storage_path: data.storage_path || `mock/reports/${data.report_id}/${data.image_type}/${data.original_name || generateId()}`,
      id: generateId(),
      created_at: new Date().toISOString(),
    }
    reportImages.push(image)
    appendReportRevision(parentReport, 'upload_image', image.uploaded_by || currentUserService.getId(), `Uploaded ${image.original_name || image.image_type}`)
    audit('reports', 'upload', 'report_image', image.id, image.original_name || image.image_type, { actorId: image.uploaded_by, after: { ...image }, source: 'upload', relatedRecords: [{ entity_type: 'report', entity_id: image.report_id, entity_name: `Report ${image.report_id}` }] })
    return Promise.resolve(image)
  },

  async remove(id: string, actorId: string, reason: string): Promise<boolean> {
    const index = reportImages.findIndex(image => image.id === id)
    if (index === -1) return false
    const image = reportImages[index]
    const actor = actorFor(actorId)
    if (resolveSystemPermission(actor) === 'member' && image.uploaded_by !== actorId) {
      throw new Error('You can only remove images that you uploaded.')
    }
    const report = reports.find(candidate => candidate.id === image.report_id)
    if (report?.metrics_confirmed) throw new Error('Undo report confirmation before removing evidence.')
    reportImages.splice(index, 1)
    if (report) appendReportRevision(report, 'remove_image', actorId, reason)
    audit('reports', 'remove_upload', 'report_image', id, image.original_name || image.image_type, { actorId, before: { ...image }, reason, source: 'upload', entityExists: false })
    return true
  },

  async getGroupedByCategory(reportId: string): Promise<Record<string, ReportImage[]>> {
    const images: ReportImage[] = await this.getByReport(reportId)
    return images.reduce<Record<string, ReportImage[]>>((groups, image) => {
      ;(groups[image.image_type] ??= []).push(image)
      return groups
    }, {})
  },
}

// Local OCR boundary. Image bytes are recognized by the Tesseract.js route;
// trusted raw text remains available as a separate parser/mapping path.
export const ocrService = {
  async extractDashboardMetrics(
    platform: ReportDashboardPlatform = 'other',
    rawOutput?: string,
    imageUrl?: string,
    cropBox?: OcrCropBox,
  ): Promise<OcrReviewData> {
    if (imageUrl) {
      try {
        const recognition = await recognizeDashboardImage(imageUrl, platform, cropBox)
        const review = buildDashboardOcrReviewFromRecognition(platform, recognition)
        const recognizedText = review.raw_output || ''
        logOcrPipeline('recognized', {
          platform,
          recognizedText,
          rawTextLength: recognizedText.length,
          parser: 'parseDashboardOcrText',
          parserOutputKeys: Object.keys(review.metrics),
          normalizedValues: Object.fromEntries(
            Object.entries(review.metrics).map(([key, metric]) => [key, metric?.value ?? metric?.candidate_value]),
          ),
          candidateCount: Object.keys(review.metrics).length,
        })
        return review
      } catch (error) {
        if (rawOutput?.trim()) {
          const localReview = parseDashboardOcrText(platform, rawOutput)
          if (Object.keys(localReview.metrics).length > 0) {
            return {
              ...localReview,
              error_message: `Image OCR API was unavailable. Metrics were populated from the available OCR text. ${
                error instanceof Error ? error.message : 'Image recognition failed.'
              }`,
            }
          }
        }
        return {
          status: 'failed',
          source_platform: platform,
          engine: 'tesseract.js',
          metrics: {},
          unmapped_fields: [],
          error_message: error instanceof Error ? error.message : 'Image recognition failed.',
        }
      }
    }
    if (!rawOutput?.trim()) {
      return {
        status: 'unavailable',
        source_platform: platform,
        metrics: {},
        unmapped_fields: [],
        error_message: 'Upload a dashboard image to run Tesseract.js, paste trusted OCR text for parser/mapping QA, or enter metrics manually.',
      }
    }
    return parseDashboardOcrText(platform, rawOutput)
  },
}

function logOcrPipeline(stage: string, details: Record<string, unknown>) {
  if (
    process.env.NODE_ENV === 'production'
    && process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'true'
  ) return
  console.debug(`[OCR pipeline:${stage}]`, details)
}

// Dashboard Update Service
export const dashboardUpdateService = {
  async getByShift(shiftId: string): Promise<DashboardUpdate[]> {
    return Promise.resolve(dashboardUpdates.filter(update => update.shift_id === shiftId && !update.deleted_at))
  },

  async create(data: Omit<DashboardUpdate, 'id' | 'created_at' | 'updated_at'>): Promise<DashboardUpdate> {
    const shift = shifts.find(candidate => candidate.id === data.shift_id)
    if (!shift || !['preparing', 'live', 'paused'].includes(shift.status)) {
      throw new Error('Dashboard updates are only available for an active live workflow.')
    }
    const newUpdate: DashboardUpdate = {
      ...data,
      created_by: data.created_by || currentUserService.getId(),
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    dashboardUpdates.push(newUpdate)
    audit('live', 'create', 'live_snapshot', newUpdate.id, `Snapshot · ${shift.title || shift.date}`, { actorId: newUpdate.created_by, after: { ...newUpdate }, relatedRecords: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }] })
    return Promise.resolve(newUpdate)
  },

  async remove(id: string, actorId: string, reason: string): Promise<boolean> {
    const index = dashboardUpdates.findIndex(update => update.id === id)
    if (index === -1) return false
    const update = dashboardUpdates[index]
    const actor = actorFor(actorId)
    if (resolveSystemPermission(actor) === 'member' && update.created_by !== actorId) {
      throw new Error('You can only delete your own live snapshot.')
    }
    const confirmedReport = reports.some(report => report.shift_id === update.shift_id && report.metrics_confirmed && !report.archived_at)
    if (confirmedReport) throw new Error('This snapshot is referenced by a confirmed report. Undo confirmation first.')
    dashboardUpdates.splice(index, 1)
    audit('live', 'delete', 'live_snapshot', id, `Snapshot · ${update.time}`, { actorId, before: { ...update }, reason, entityExists: false })
    return true
  },
}

// Swap Request Service
export const swapRequestService = {
  async getAll(): Promise<SwapRequest[]> {
    return Promise.resolve(swapRequests.filter(request => !request.deleted_at))
  },

  async getPending(): Promise<SwapRequest[]> {
    return Promise.resolve(swapRequests.filter(sr => sr.status === 'pending'))
  },

  async create(
    data: Omit<SwapRequest, 'id' | 'status' | 'created_at' | 'updated_at'> & { status?: SwapRequest['status'] },
  ): Promise<SwapRequest> {
    const shift = shifts.find(candidate => candidate.id === data.shift_id)
    const role: OperationalRole = data.operational_role ||
      (data.new_support_id ? 'support' : data.new_technical_id ? 'technical' : 'host')
    const replacementId = data.replacement_staff_id || data.new_host_id || data.new_support_id || data.new_technical_id
    if (!shift) throw new Error('Shift was not found.')
    const ownsRole = shift[roleAssignmentField[role]] === data.requester_id ||
      shiftRegistrations.some(registration =>
        registration.shift_id === data.shift_id &&
        registration.user_id === data.requester_id &&
        registration.operational_role === role &&
        isStaffedRegistration(registration)
      )
    if (!ownsRole) throw new Error('You can only request a swap for a role assigned to you.')
    if (!replacementId || replacementId === data.requester_id) throw new Error('A different replacement staff member is required.')
    const replacement = users.find(user => user.id === replacementId)
    if (!replacement?.operational_roles?.includes(role)) throw new Error('Replacement staff is not eligible for this role.')
    const newRequest: SwapRequest = {
      ...data,
      operational_role: role,
      original_staff_id: data.original_staff_id || data.requester_id,
      replacement_staff_id: replacementId,
      id: generateId(),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    swapRequests.push(newRequest)
    audit('swaps', 'create', 'swap_request', newRequest.id, `Swap · ${role}`, { actorId: data.requester_id, after: { ...newRequest }, relatedRecords: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }] })
    return Promise.resolve(newRequest)
  },

  async approve(id: string, approverId: string): Promise<SwapRequest | null> {
    ensureLeaderOrAdmin(approverId)
    const index = swapRequests.findIndex(sr => sr.id === id)
    if (index === -1) return Promise.resolve(null)
    const request = swapRequests[index]
    const shiftIndex = shifts.findIndex(shift => shift.id === request.shift_id)
    if (shiftIndex === -1) throw new Error('Shift was not found.')
    const role: OperationalRole = request.operational_role ||
      (request.new_support_id ? 'support' : request.new_technical_id ? 'technical' : 'host')
    const replacementId = request.replacement_staff_id ||
      request.new_host_id || request.new_support_id || request.new_technical_id
    if (!replacementId) throw new Error('Replacement staff was not selected.')
    const replacement = users.find(user => user.id === replacementId)
    if (!replacement?.operational_roles?.includes(role)) throw new Error('Replacement staff is not eligible for this role.')
    if (findRegistrationConflict(replacementId, shifts[shiftIndex])) throw new Error('Replacement staff has a schedule conflict.')
    const timestamp = nowIso()
    shiftRegistrations = shiftRegistrations.map(registration =>
      registration.shift_id === request.shift_id &&
      registration.operational_role === role &&
      isStaffedRegistration(registration)
        ? { ...registration, status: 'cancelled', cancelled_at: timestamp, updated_at: timestamp }
        : registration
    )
    shiftRegistrations.push({
      id: generateId(),
      shift_id: request.shift_id,
      user_id: replacementId,
      operational_role: role,
      status: 'approved',
      source: 'manual_assignment',
      requested_at: timestamp,
      reviewed_by: approverId,
      reviewed_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    })
    shifts[shiftIndex] = {
      ...shifts[shiftIndex],
      [roleAssignmentField[role]]: replacementId,
      updated_at: timestamp,
    }
    swapRequests[index] = {
      ...request,
      status: 'approved',
      approved_by: approverId,
      approved_at: timestamp,
      updated_at: timestamp,
      approval_history: [
        ...(request.approval_history || []),
        { action: 'approved', by: approverId, at: timestamp },
      ],
    }
    audit('swaps', 'approve', 'swap_request', id, `Swap · ${role}`, { actorId: approverId, before: { ...request }, after: { ...swapRequests[index] } })
    return Promise.resolve(swapRequests[index])
  },

  async reject(id: string, approverId: string): Promise<SwapRequest | null> {
    ensureLeaderOrAdmin(approverId)
    const index = swapRequests.findIndex(sr => sr.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...swapRequests[index] }
    swapRequests[index] = {
      ...swapRequests[index],
      status: 'rejected',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      approval_history: [
        ...(swapRequests[index].approval_history || []),
        { action: 'rejected', by: approverId, at: new Date().toISOString() },
      ],
    }
    audit('swaps', 'reject', 'swap_request', id, `Swap · ${swapRequests[index].operational_role || 'host'}`, { actorId: approverId, before, after: { ...swapRequests[index] } })
    return Promise.resolve(swapRequests[index])
  },

  async cancel(id: string, actorId: string, reason: string): Promise<SwapRequest | null> {
    const index = swapRequests.findIndex(request => request.id === id)
    if (index === -1) return null
    const request = swapRequests[index]
    if (request.status !== 'pending') throw new Error('Only pending swap requests can be cancelled.')
    const actor = actorFor(actorId)
    if (request.requester_id !== actorId && resolveSystemPermission(actor) === 'member') {
      throw new Error('You can only cancel your own swap request.')
    }
    swapRequests[index] = { ...request, status: 'rejected', deleted_at: nowIso(), deleted_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('swaps', 'soft_delete', 'swap_request', id, `Swap · ${request.operational_role || 'host'}`, { actorId, before: { ...request }, after: { ...swapRequests[index] }, reason })
    return swapRequests[index]
  },
}

export const scheduleImportService = {
  async getAll(): Promise<ScheduleImportBatch[]> {
    return Promise.resolve(scheduleImports
      .map(batch => ({
        ...batch,
        preview_rows: batch.preview_rows?.map(toCanonicalScheduleImportPreviewRow),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)))
  },

  async createPreview(
    source: ScheduleImportSource,
    sourceName: string,
    summary: Pick<ScheduleImportBatch, 'total_rows' | 'valid_rows' | 'invalid_rows' | 'warning_rows'>,
    createdBy: string,
    previewRows?: ScheduleImportRow[],
  ): Promise<ScheduleImportBatch> {
    const batch: ScheduleImportBatch = {
      id: generateId(),
      source,
      source_name: sourceName,
      status: 'previewed',
      ...summary,
      preview_rows: previewRows?.map(toCanonicalScheduleImportPreviewRow),
      created_by: createdBy,
      created_at: nowIso(),
    }
    scheduleImports.push(batch)
    audit('imports', 'import', 'schedule_import', batch.id, batch.source_name, { actorId: createdBy, after: { ...batch }, source: source === 'google_sheets' ? 'google_sheets' : 'excel_import' })
    return Promise.resolve(batch)
  },

  async confirm(id: string): Promise<ScheduleImportBatch | null> {
    const index = scheduleImports.findIndex(batch => batch.id === id)
    if (index === -1) return null
    scheduleImports[index] = {
      ...scheduleImports[index],
      status: 'confirmed',
      confirmed_at: nowIso(),
    }
    audit('imports', 'confirm', 'schedule_import', id, scheduleImports[index].source_name, { actorId: currentUserService.getId(), after: { ...scheduleImports[index] }, source: scheduleImports[index].source === 'google_sheets' ? 'google_sheets' : 'excel_import' })
    return Promise.resolve(scheduleImports[index])
  },

  async updatePreview(
    id: string,
    summary: Pick<ScheduleImportBatch, 'total_rows' | 'valid_rows' | 'invalid_rows' | 'warning_rows'>,
    previewRows?: ScheduleImportRow[],
  ): Promise<ScheduleImportBatch | null> {
    const index = scheduleImports.findIndex(batch => batch.id === id)
    if (index === -1 || scheduleImports[index].status !== 'previewed') return null
    scheduleImports[index] = {
      ...scheduleImports[index],
      ...summary,
      preview_rows: previewRows
        ? previewRows.map(toCanonicalScheduleImportPreviewRow)
        : scheduleImports[index].preview_rows?.map(toCanonicalScheduleImportPreviewRow),
    }
    return Promise.resolve(scheduleImports[index])
  },

  async fail(id: string): Promise<ScheduleImportBatch | null> {
    const index = scheduleImports.findIndex(batch => batch.id === id)
    if (index === -1) return null
    scheduleImports[index] = { ...scheduleImports[index], status: 'failed' }
    return Promise.resolve(scheduleImports[index])
  },

  async removePreview(id: string, actorId: string, reason: string): Promise<boolean> {
    ensureLeaderOrAdmin(actorId)
    const index = scheduleImports.findIndex(batch => batch.id === id)
    if (index === -1) return false
    if (scheduleImports[index].status === 'confirmed') throw new Error('Confirmed import batches must remain in history.')
    const [removed] = scheduleImports.splice(index, 1)
    audit('imports', 'delete', 'schedule_import', id, removed.source_name, { actorId, before: { ...removed }, reason, entityExists: false, source: removed.source === 'google_sheets' ? 'google_sheets' : 'excel_import' })
    return true
  },
}

export const scheduleChangeService = {
  async getAll(): Promise<ScheduleChangeLog[]> {
    return Promise.resolve([...scheduleChangeLogs])
  },
}

export interface ArchivedEntitySummary {
  entity_type: 'shift' | 'report' | 'campaign' | 'brand' | 'platform' | 'staff'
  entity_id: string
  entity_name: string
  archived_at: string
  archived_by?: string
  reason?: string
}

export const lifecycleService = {
  async getArchived(actorId: string): Promise<ArchivedEntitySummary[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived data.')
    const summaries: ArchivedEntitySummary[] = [
      ...shifts.filter(item => item.deleted_at).map(item => ({ entity_type: 'shift' as const, entity_id: item.id, entity_name: item.title || `${item.date} ${item.start_time}`, archived_at: item.deleted_at!, archived_by: item.deleted_by, reason: item.deletion_reason })),
      ...reports.filter(item => item.deleted_at || item.archived_at).map(item => ({ entity_type: 'report' as const, entity_id: item.id, entity_name: `Report · ${item.shift_id}`, archived_at: item.deleted_at || item.archived_at!, archived_by: item.deleted_by || item.archived_by, reason: item.deletion_reason })),
      ...campaigns.filter(item => item.deleted_at || item.archived_at).map(item => ({ entity_type: 'campaign' as const, entity_id: item.id, entity_name: item.name, archived_at: item.deleted_at || item.archived_at!, archived_by: item.deleted_by || item.archived_by, reason: item.deletion_reason })),
      ...brands.filter(item => item.deleted_at || item.archived_at).map(item => ({ entity_type: 'brand' as const, entity_id: item.id, entity_name: item.name, archived_at: item.deleted_at || item.archived_at!, archived_by: item.deleted_by || item.archived_by, reason: item.deletion_reason })),
      ...platforms.filter(item => item.deleted_at || item.archived_at).map(item => ({ entity_type: 'platform' as const, entity_id: item.id, entity_name: item.name, archived_at: item.deleted_at || item.archived_at!, archived_by: item.deleted_by || item.archived_by, reason: item.deletion_reason })),
      ...users.filter(item => item.deleted_at || item.archived_at).map(item => ({ entity_type: 'staff' as const, entity_id: item.id, entity_name: item.full_name, archived_at: item.deleted_at || item.archived_at!, archived_by: item.deleted_by || item.archived_by, reason: item.deletion_reason })),
    ]
    return summaries.sort((left, right) => right.archived_at.localeCompare(left.archived_at))
  },

  async restore(entityType: ArchivedEntitySummary['entity_type'], entityId: string, actorId: string, reason: string): Promise<boolean> {
    if (!reason.trim()) throw new Error('A restore reason is required.')
    const restored = entityType === 'shift'
      ? await shiftService.restore(entityId, actorId, reason)
      : entityType === 'report'
        ? await reportService.restore(entityId, actorId, reason)
        : entityType === 'campaign'
          ? await campaignService.restore(entityId, actorId, reason)
          : entityType === 'brand'
            ? await brandService.restore(entityId, actorId, reason)
            : entityType === 'platform'
              ? await platformService.restore(entityId, actorId, reason)
              : await userService.restore(entityId, actorId, reason)
    return Boolean(restored)
  },

  async forceDelete(entityType: ArchivedEntitySummary['entity_type'], entityId: string, actorId: string, reason: string): Promise<boolean> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can force delete data.')
    if (reason.trim().length < 10) throw new Error('A detailed force-delete reason is required.')
    const collections = { shift: shifts, report: reports, campaign: campaigns, brand: brands, platform: platforms, staff: users } as const
    const collection = collections[entityType] as Array<{ id: string; deleted_at?: string; archived_at?: string; name?: string; title?: string; full_name?: string }>
    const index = collection.findIndex(item => item.id === entityId)
    if (index === -1) return false
    const entity = collection[index]
    if (!entity.deleted_at && !entity.archived_at) throw new Error('Archive or soft-delete the record before force deletion.')
    collection.splice(index, 1)
    const moduleByType: Record<ArchivedEntitySummary['entity_type'], AuditModule> = {
      shift: 'calendar',
      report: 'reports',
      campaign: 'campaigns',
      brand: 'brands',
      platform: 'platforms',
      staff: 'staff',
    }
    audit(moduleByType[entityType], 'delete', entityType, entityId, entity.name || entity.title || entity.full_name || entityId, { actorId, before: { ...entity }, reason, entityExists: false })
    return true
  },
}

const defaultPersonalSettings = (): PersonalSettings => ({
  language: 'en',
  timezone: 'Asia/Ho_Chi_Minh',
  date_format: 'dd/MM/yyyy',
  notifications_enabled: true,
  default_calendar_view: 'month',
  preferred_roles: [],
})

export const settingsService = {
  async getPersonal(userId: string): Promise<PersonalSettings> {
    const stored = readSessionSetting<PersonalSettings>(`personal-${userId}`)
    if (stored) personalSettings.set(userId, stored)
    return Promise.resolve({ ...(stored || personalSettings.get(userId) || defaultPersonalSettings()) })
  },

  async updatePersonal(userId: string, data: Partial<PersonalSettings>): Promise<PersonalSettings> {
    const next = { ...(personalSettings.get(userId) || defaultPersonalSettings()), ...data }
    personalSettings.set(userId, next)
    writeSessionSetting(`personal-${userId}`, next)
    return Promise.resolve({ ...next })
  },

  async getOperational(): Promise<OperationalSettings> {
    operationalSettings = readSessionSetting<OperationalSettings>('operational') || operationalSettings
    return Promise.resolve({ ...operationalSettings })
  },

  async updateOperational(data: Partial<OperationalSettings>): Promise<OperationalSettings> {
    operationalSettings = { ...operationalSettings, ...data }
    writeSessionSetting('operational', operationalSettings)
    return Promise.resolve({ ...operationalSettings })
  },

  async getSystem(): Promise<Record<string, string | number | boolean>> {
    const stored = readSessionSetting<Record<string, string | number | boolean>>('system')
    if (stored) systemSettings = { ...systemSettings, ...stored }
    return Promise.resolve({ ...systemSettings })
  },

  async updateSystem(data: Record<string, string | number | boolean>): Promise<Record<string, string | number | boolean>> {
    systemSettings = { ...systemSettings, ...data }
    writeSessionSetting('system', systemSettings)
    return Promise.resolve({ ...systemSettings })
  },
}

// Dashboard Stats Service
export const statsService = {
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0]
    const activeDataShifts = shifts.filter(shift => !shift.deleted_at)
    const todayShifts = activeDataShifts.filter(s => s.date === today)
    const liveShifts = activeDataShifts.filter(s => s.status === 'live')
    const activeShifts = activeDataShifts.filter(s => ['preparing', 'live', 'paused'].includes(s.status))
    const completedShifts = activeDataShifts.filter(s => s.status === 'completed')
    const pendingSwaps = swapRequests.filter(sr => sr.status === 'pending' && !sr.deleted_at)
    const pendingDashboardUpdates = activeShifts.filter(
      shift => !dashboardUpdates.some(update => update.shift_id === shift.id),
    ).length
    
    // Calculate total revenue from reports
    const totalRevenue = reports.filter(report => report.metrics_confirmed && !report.deleted_at && !report.archived_at).reduce((sum, r) => sum + r.revenue, 0)
    
    return Promise.resolve({
      todayLive: todayShifts.length,
      revenueToday: totalRevenue,
      reportsSubmitted: reports.filter(report => !report.deleted_at && !report.archived_at).length,
      liveInProgress: liveShifts.length,
      pendingDashboardUpdates,
      pendingSwaps: pendingSwaps.length,
      totalStaff: users.filter(user => !user.deleted_at && !user.archived_at).length,
      totalBrands: brands.filter(brand => !brand.deleted_at && !brand.archived_at).length,
      totalCampaigns: campaigns.filter(campaign => !campaign.deleted_at && !campaign.archived_at).length,
      completedShifts: completedShifts.length,
    })
  },
}
