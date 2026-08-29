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
  ShiftRegistrationReviewAction,
  ShiftRegistrationReviewResult,
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
  BulkShiftDeletionOutcome,
  BulkShiftDeletionResult,
  ReportRevision,
  LiveReportImage,
} from '@/lib/types/database.types'
import { buildDashboardOcrReviewFromRecognition, parseDashboardOcrText } from '@/lib/utils/ocrMetrics'
import { recognizeDashboardImage } from '@/lib/services/imageOcrService'
import { businessLocalDate, DEFAULT_BUSINESS_TIMEZONE, DEFAULT_REQUIRED_STAFF_COUNT, detectConflicts, normalizeCapacity, resolveShiftDateTime, shiftDateTimeFields } from '@/lib/utils/shiftUtils'
import {
  normalizeStaffingDisplayNames,
  toCanonicalScheduleImportPreviewRow,
} from '@/lib/utils/scheduleImportPreview'
import { deriveShiftStaffIdentityMatch } from '@/lib/utils/staffIdentityMatching'
import { recordAuditEvent } from '@/lib/services/auditService'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { getAuthMode } from '@/lib/auth/authMode'
import { getSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'
import {
  getSupabaseShiftRepository,
  type ShiftStaffingLabels,
} from '@/lib/services/supabaseShiftService'
import { getSupabaseShiftRegistrationRepository } from '@/lib/services/supabaseShiftRegistrationService'
import { getSupabaseReportRepository } from '@/lib/services/supabaseReportService'
import { getSupabaseSwapRequestRepository } from '@/lib/services/supabaseSwapRequestService'
import {
  liveReportImageCategories,
  maximumLiveReportImages,
  revokeLiveReportImageObjectUrl,
  sanitizeLiveReportImageFileName,
  sortedLiveReportImages,
  validateLiveReportImageFile,
  validateLiveReportImageMetadata,
} from '@/lib/utils/liveReportImages'
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
let liveReportImages: LiveReportImage[] = []
let dashboardUpdates = [...mockDashboardUpdates]
let swapRequests = [...mockSwapRequests]
let scheduleImports: ScheduleImportBatch[] = []
let scheduleChangeLogs: ScheduleChangeLog[] = []
let authenticatedBusinessUser: User | null = null

const currentBusinessUserFor = (actorId: string): User | null => {
  if (getAuthMode() === 'supabase') {
    if (!authenticatedBusinessUser || authenticatedBusinessUser.id !== actorId) return null
    if (
      authenticatedBusinessUser.status !== 'active'
      || authenticatedBusinessUser.account_status !== 'active'
      || authenticatedBusinessUser.deleted_at
      || authenticatedBusinessUser.archived_at
    ) return null
    return {
      ...authenticatedBusinessUser,
      operational_roles: authenticatedBusinessUser.operational_roles
        ? [...authenticatedBusinessUser.operational_roles]
        : [],
    }
  }
  return users.find(user => user.id === actorId) || null
}

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
      .map(image => image.id)
      .concat(liveReportImages
        .filter(image => image.report_id === report.id)
        .map(image => image.id)),
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
const actorFor = (actorId = currentUserService.getId()) => {
  const actor = currentBusinessUserFor(actorId)
  if (actor) return actor
  if (getAuthMode() === 'mock') return users[0]
  throw new Error('The current user could not be verified.')
}
const requiredActorFor = (actorId: string) => {
  const actor = currentBusinessUserFor(actorId)
  if (!actor) throw new Error('The current user could not be verified.')
  return actor
}
const requiredActiveStaffActorFor = (actorId: string) => {
  const actor = requiredActorFor(actorId)
  if (
    actor.status !== 'active'
    || (actor.account_status && actor.account_status !== 'active')
    || actor.deleted_at
    || actor.archived_at
  ) {
    throw new Error('An active approved user is required to manage staff.')
  }
  return actor
}
const requireSupabaseAdmin = (actorId = currentUserService.getId()) => {
  const actor = requiredActorFor(actorId)
  if (resolveSystemPermission(actor) !== 'admin') {
    throw new Error('Only Admin can manage shared master data.')
  }
  return actor
}
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
const shiftStartAt = (shift: Shift) => resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.startAt ?? new Date(Number.NaN)
const shiftEndAt = (shift: Shift) => resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.endAt ?? new Date(Number.NaN)
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
  vision_ocr_enabled: false,
  vision_ocr_provider: 'disabled',
  vision_ocr_provider_configured: false,
  vision_ocr_default_mode: 'local',
  vision_ocr_model: 'openai-not-configured',
  vision_ocr_timeout_ms: 30000,
  vision_ocr_retry_count: 0,
  vision_ocr_allow_tiktok: true,
  vision_ocr_allow_shopee: true,
  vision_ocr_daily_request_limit: 25,
  vision_ocr_monthly_request_limit: 500,
  vision_ocr_diagnostics_retention: false,
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
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.getAll()
    }
    return Promise.resolve(users.filter(user => !user.deleted_at && !user.archived_at))
  },

  async getAllIncludingDeleted(actorId: string): Promise<User[]> {
    if (!hasPermission(requiredActiveStaffActorFor(actorId), 'staff.manage')) throw new Error('Only Admin can view deleted staff.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.getAll(true)
    }
    return Promise.resolve([...users])
  },

  async getById(id: string): Promise<User | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.getById(id)
    }
    return Promise.resolve(users.find(u => u.id === id) || null)
  },

  async create(
    data: Omit<User, 'id' | 'created_at' | 'updated_at'>,
    actorId?: string,
  ): Promise<User> {
    const systemPermission = resolveSystemPermission(data)
    const normalizedData = {
      ...data,
      email: data.email.trim().toLowerCase(),
      full_name: data.full_name.trim(),
      role: systemPermission === 'member' ? 'staff' as const : systemPermission,
      system_permission: systemPermission,
      operational_roles: [...(data.operational_roles || [])],
      account_status: data.account_status ?? (data.status === 'active' ? 'active' as const : 'pending_approval' as const),
    }
    const supabaseMode = getAuthMode() === 'supabase'
    if (supabaseMode && actorId === undefined) {
      // The RPC derives and authorizes the actor from auth.uid(). Do not block
      // the browser write on the transient client-side identity projection.
      return getSupabaseMasterDataRepository().businessUsers.create(normalizedData)
    }
    const resolvedActorId = actorId ?? currentUserService.getId()
    const actor = requiredActiveStaffActorFor(resolvedActorId)
    if (!hasPermission(actor, 'staff.manage')) throw new Error('Only Admin can create staff records.')
    if (supabaseMode) {
      return getSupabaseMasterDataRepository().businessUsers.create(normalizedData)
    }
    const newUser: User = {
      ...normalizedData,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    users.push(newUser)
    syncMockAuthAccount(newUser)
    audit('staff', 'create', 'staff', newUser.id, newUser.full_name, { actorId: resolvedActorId, after: { ...newUser } })
    return Promise.resolve(newUser)
  },

  async update(
    id: string,
    data: Partial<User>,
    actorId?: string,
  ): Promise<User | null> {
    const systemPermission = data.system_permission
    const normalizedData: Partial<User> = {
      ...data,
      ...(data.email === undefined ? {} : { email: data.email.trim().toLowerCase() }),
      ...(data.full_name === undefined ? {} : { full_name: data.full_name.trim() }),
      ...(data.operational_roles === undefined ? {} : { operational_roles: [...data.operational_roles] }),
      ...(systemPermission === undefined ? {} : {
        system_permission: systemPermission,
        role: systemPermission === 'member' ? 'staff' : systemPermission,
      }),
    }
    const supabaseMode = getAuthMode() === 'supabase'
    if (supabaseMode && actorId === undefined) {
      // The RPC derives and authorizes the actor from auth.uid(). Do not block
      // the browser write on the transient client-side identity projection.
      return getSupabaseMasterDataRepository().businessUsers.update(id, normalizedData)
    }
    const resolvedActorId = actorId ?? currentUserService.getId()
    const actor = requiredActiveStaffActorFor(resolvedActorId)
    const existing = supabaseMode
      ? await getSupabaseMasterDataRepository().businessUsers.getById(id)
      : users.find(user => user.id === id) || null
    if (!existing) return null
    const ownProfileFields = new Set<keyof User>(['full_name', 'phone', 'department', 'avatar_url', 'avatar_storage_path'])
    const changedFields = Object.entries(data)
      .filter(([key, value]) => value !== undefined && JSON.stringify(existing[key as keyof User]) !== JSON.stringify(value))
      .map(([key]) => key as keyof User)
    const isOwnProfileUpdate = id === resolvedActorId && changedFields.every(field => ownProfileFields.has(field))
    if (!isOwnProfileUpdate && !hasPermission(actor, 'staff.manage')) {
      throw new Error('Only Admin can update staff records.')
    }
    const selfPrivilegeFields = new Set<keyof User>([
      'role',
      'system_permission',
      'status',
      'account_status',
      'deleted_at',
      'deleted_by',
      'archived_at',
      'archived_by',
    ])
    if (id === resolvedActorId && changedFields.some(field => selfPrivilegeFields.has(field))) {
      throw new Error('Self privilege or account-status changes are not allowed.')
    }
    if (supabaseMode) {
      return getSupabaseMasterDataRepository().businessUsers.update(id, normalizedData)
    }
    const index = users.findIndex(user => user.id === id)
    const before = { ...users[index] }
    users[index] = { ...users[index], ...normalizedData, updated_at: new Date().toISOString() }
    syncMockAuthAccount(users[index])
    audit('staff', 'update', 'staff', id, users[index].full_name, { actorId: resolvedActorId, before, after: { ...users[index] } })
    return Promise.resolve(users[index])
  },

  async approvePendingAccount(id: string, actorId = currentUserService.getId()): Promise<User | null> {
    const actor = requiredActiveStaffActorFor(actorId)
    if (!hasPermission(actor, 'staff.manage')) throw new Error('Only Admin can approve pending accounts.')
    if (id === actorId) throw new Error('Self account approval is not allowed.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.approvePendingAccount(id)
    }
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    if (users[index].account_status !== 'pending_approval') throw new Error('The account is not pending approval.')
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
    const actor = requiredActiveStaffActorFor(actorId)
    if (!hasPermission(actor, 'staff.manage')) throw new Error('Only Admin can reject pending accounts.')
    if (id === actorId) throw new Error('Self account rejection is not allowed.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.rejectPendingAccount(id)
    }
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    if (users[index].account_status !== 'pending_approval') throw new Error('The account is not pending approval.')
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
    const actor = requiredActiveStaffActorFor(actorId)
    if (!hasPermission(actor, 'staff.manage')) throw new Error('Only Admin can archive staff.')
    if (id === actorId) throw new Error('Self archive is not allowed.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.archive(id, reason)
    }
    const index = users.findIndex(u => u.id === id)
    if (index === -1) return null
    if (users[index].archived_at || users[index].deleted_at) throw new Error('The staff record is already archived.')
    const before = { ...users[index] }
    const timestamp = nowIso()
    users[index] = { ...users[index], status: 'inactive', archived_at: timestamp, archived_by: actorId, deletion_reason: reason, updated_at: timestamp }
    const related = staffRelatedRecords(id)
    syncMockAuthAccount(users[index])
    audit('staff', 'archive', 'staff', id, users[index].full_name, { actorId, before, after: { ...users[index] }, reason, relatedRecords: related })
    return users[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<User | null> {
    const actor = requiredActiveStaffActorFor(actorId)
    if (!hasPermission(actor, 'staff.manage')) throw new Error('Only Admin can restore staff.')
    if (id === actorId) throw new Error('Self restore is not allowed.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().businessUsers.restore(id, reason)
    }
    const index = users.findIndex(user => user.id === id)
    if (index === -1) return null
    if (!users[index].archived_at && !users[index].deleted_at) throw new Error('The staff record is not archived.')
    const before = { ...users[index] }
    users[index] = { ...users[index], status: 'active', archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    syncMockAuthAccount(users[index])
    audit('staff', 'restore', 'staff', id, users[index].full_name, { actorId, before, after: { ...users[index] }, reason })
    return users[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.archive(id))
  },

  async search(query: string): Promise<User[]> {
    const lowerQuery = query.toLowerCase()
    if (getAuthMode() === 'supabase') {
      const directory = await getSupabaseMasterDataRepository().businessUsers.getAll()
      return directory.filter(user =>
        user.full_name.toLowerCase().includes(lowerQuery)
        || user.email.toLowerCase().includes(lowerQuery)
      )
    }
    return Promise.resolve(
      users.filter(
        u =>
          u.full_name.toLowerCase().includes(lowerQuery) ||
          u.email.toLowerCase().includes(lowerQuery)
      )
    )
  },

  async getByOperationalRole(role: OperationalRole): Promise<User[]> {
    const directory = getAuthMode() === 'supabase'
      ? await getSupabaseMasterDataRepository().businessUsers.getAll()
      : users
    return Promise.resolve(directory.filter(user =>
      user.status === 'active' && (user.operational_roles?.includes(role) ||
        (role === 'host' && user.department === 'Live Host') ||
        (role === 'support' && user.department === 'Live Support'))
    ))
  },
}

export const currentUserService = {
  getId(): string {
    if (getAuthMode() === 'supabase') {
      if (!authenticatedBusinessUser) throw new Error('The authenticated business user is unavailable.')
      return authenticatedBusinessUser.id
    }
    if (typeof window === 'undefined') return '1'
    if (process.env.NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER !== 'true') return '1'
    return window.localStorage.getItem('livestream-ops-current-user') || '1'
  },

  async getCurrent(): Promise<User | null> {
    const id = this.getId()
    return currentBusinessUserFor(id)
      || (getAuthMode() === 'mock' ? users[0] : null)
  },

  async setCurrent(id: string): Promise<User | null> {
    if (getAuthMode() === 'supabase') return currentBusinessUserFor(id)
    const user = currentBusinessUserFor(id)
    if (!user) return null
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('livestream-ops-current-user', id)
      window.dispatchEvent(new CustomEvent('livestream-ops-current-user-change', { detail: id }))
    }
    return user
  },

  bindAuthenticatedUser(user: User): void {
    if (getAuthMode() !== 'supabase') return
    authenticatedBusinessUser = {
      ...user,
      operational_roles: user.operational_roles ? [...user.operational_roles] : [],
    }
  },

  clearAuthenticatedUser(expectedBusinessUserId?: string): void {
    if (expectedBusinessUserId && authenticatedBusinessUser?.id !== expectedBusinessUserId) return
    authenticatedBusinessUser = null
  },
}

// Brand Service
export const brandService = {
  async getAll(): Promise<Brand[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().brands.getAll()
    }
    return Promise.resolve(brands.filter(brand => !brand.deleted_at && !brand.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Brand[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived brands.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().brands.getAll(true)
    }
    return Promise.resolve([...brands])
  },

  async getById(id: string): Promise<Brand | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().brands.getById(id)
    }
    return Promise.resolve(brands.find(b => b.id === id) || null)
  },

  async create(data: Omit<Brand, 'id' | 'created_at' | 'updated_at'>): Promise<Brand> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin()
      const persisted = await getSupabaseMasterDataRepository().brands.create(generateId(), data, actor.id)
      audit('brands', 'create', 'brand', persisted.id, persisted.name, {
        actorId: actor.id,
        after: { ...persisted },
      })
      return persisted
    }
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

  async update(
    id: string,
    data: Partial<Brand>,
    actorId = currentUserService.getId(),
  ): Promise<Brand | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().brands.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().brands.update(id, data, actor.id)
      if (!persisted) return null
      audit('brands', 'update', 'brand', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
      })
      return persisted
    }
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return Promise.resolve(null)
    if (!hasPermission(requiredActorFor(actorId), 'brands.manage')) throw new Error('Only Admin can update brands.')
    const before = { ...brands[index] }
    brands[index] = { ...brands[index], ...data, updated_at: new Date().toISOString() }
    audit('brands', 'update', 'brand', id, brands[index].name, { actorId, before, after: { ...brands[index] } })
    return Promise.resolve(brands[index])
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Archived by administrator'): Promise<Brand | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().brands.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().brands.archive(id, actor.id, reason)
      if (!persisted) return null
      audit('brands', 'archive', 'brand', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
    const index = brands.findIndex(b => b.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive brands.')
    const before = { ...brands[index] }
    brands[index] = { ...brands[index], status: 'inactive', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('brands', 'archive', 'brand', id, brands[index].name, { actorId, before, after: { ...brands[index] }, reason, relatedRecords: brandRelatedRecords(id) })
    return brands[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Brand | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().brands.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().brands.restore(id, actor.id)
      if (!persisted) return null
      audit('brands', 'restore', 'brand', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
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
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().platforms.getAll()
    }
    return Promise.resolve(platforms.filter(platform => !platform.deleted_at && !platform.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Platform[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived platforms.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().platforms.getAll(true)
    }
    return Promise.resolve([...platforms])
  },

  async getById(id: string): Promise<Platform | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().platforms.getById(id)
    }
    return Promise.resolve(platforms.find(p => p.id === id) || null)
  },

  async create(data: Omit<Platform, 'id' | 'created_at' | 'updated_at'>): Promise<Platform> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin()
      const persisted = await getSupabaseMasterDataRepository().platforms.create(generateId(), data, actor.id)
      audit('platforms', 'create', 'platform', persisted.id, persisted.name, {
        actorId: actor.id,
        after: { ...persisted },
      })
      return persisted
    }
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

  async update(
    id: string,
    data: Partial<Platform>,
    actorId = currentUserService.getId(),
  ): Promise<Platform | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().platforms.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().platforms.update(id, data, actor.id)
      if (!persisted) return null
      audit('platforms', 'update', 'platform', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
      })
      return persisted
    }
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return Promise.resolve(null)
    if (!hasPermission(requiredActorFor(actorId), 'platforms.manage')) throw new Error('Only Admin can update platforms.')
    const before = { ...platforms[index] }
    platforms[index] = { ...platforms[index], ...data, updated_at: new Date().toISOString() }
    audit('platforms', 'update', 'platform', id, platforms[index].name, { actorId, before, after: { ...platforms[index] } })
    return Promise.resolve(platforms[index])
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Archived by administrator'): Promise<Platform | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().platforms.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().platforms.archive(id, actor.id, reason)
      if (!persisted) return null
      audit('platforms', 'archive', 'platform', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
    const index = platforms.findIndex(p => p.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive platforms.')
    const before = { ...platforms[index] }
    platforms[index] = { ...platforms[index], status: 'inactive', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('platforms', 'archive', 'platform', id, platforms[index].name, { actorId, before, after: { ...platforms[index] }, reason, relatedRecords: platformRelatedRecords(id) })
    return platforms[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Platform | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().platforms.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().platforms.restore(id, actor.id)
      if (!persisted) return null
      audit('platforms', 'restore', 'platform', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
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
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().campaigns.getAll()
    }
    return Promise.resolve(campaigns.filter(campaign => !campaign.deleted_at && !campaign.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Campaign[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived campaigns.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().campaigns.getAll(true)
    }
    return Promise.resolve([...campaigns])
  },

  async getById(id: string): Promise<Campaign | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().campaigns.getById(id)
    }
    return Promise.resolve(campaigns.find(c => c.id === id) || null)
  },

  async create(data: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin()
      const persisted = await getSupabaseMasterDataRepository().campaigns.create(generateId(), data)
      audit('campaigns', 'create', 'campaign', persisted.id, persisted.name, {
        actorId: actor.id,
        after: { ...persisted },
      })
      return persisted
    }
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

  async update(
    id: string,
    data: Partial<Campaign>,
    actorId = currentUserService.getId(),
  ): Promise<Campaign | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().campaigns.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().campaigns.update(id, data)
      if (!persisted) return null
      const action: AuditAction = data.website_preview_image === null || data.website_url === null
        ? 'remove_upload'
        : 'update'
      audit('campaigns', action, 'campaign', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
      })
      return persisted
    }
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return Promise.resolve(null)
    const actor = requiredActorFor(actorId)
    if (!hasPermission(actor, 'campaigns.manage') && !hasPermission(actor, 'campaigns.edit_operational')) {
      throw new Error('Only a Leader or Admin can update campaigns.')
    }
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], ...data, updated_at: new Date().toISOString() }
    const action: AuditAction = data.website_preview_image === null || data.website_url === null ? 'remove_upload' : 'update'
    audit('campaigns', action, 'campaign', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] } })
    return Promise.resolve(campaigns[index])
  },

  async archive(id: string, actorId = currentUserService.getId(), reason = 'Archived by administrator'): Promise<Campaign | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().campaigns.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().campaigns.archive(id, actor.id, reason)
      if (!persisted) return null
      audit('campaigns', 'archive', 'campaign', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
    const index = campaigns.findIndex(c => c.id === id)
    if (index === -1) return null
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can archive campaigns.')
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], status: 'cancelled', archived_at: nowIso(), archived_by: actorId, deletion_reason: reason, updated_at: nowIso() }
    audit('campaigns', 'archive', 'campaign', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] }, reason, relatedRecords: campaignRelatedRecords(id) })
    return campaigns[index]
  },

  async restore(id: string, actorId: string, reason: string): Promise<Campaign | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().campaigns.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().campaigns.restore(id)
      if (!persisted) return null
      audit('campaigns', 'restore', 'campaign', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore campaigns.')
    const index = campaigns.findIndex(campaign => campaign.id === id)
    if (index === -1) return null
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], status: 'draft', archived_at: undefined, archived_by: undefined, deleted_at: undefined, deleted_by: undefined, deletion_reason: undefined, updated_at: nowIso() }
    audit('campaigns', 'restore', 'campaign', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] }, reason })
    return campaigns[index]
  },

  async removeWebsitePreview(id: string, actorId: string, reason: string): Promise<Campaign | null> {
    if (getAuthMode() === 'supabase') {
      const actor = requireSupabaseAdmin(actorId)
      const before = await getSupabaseMasterDataRepository().campaigns.getById(id)
      if (!before) return null
      const persisted = await getSupabaseMasterDataRepository().campaigns.removeWebsitePreview(id)
      if (!persisted) return null
      audit('campaigns', 'remove_upload', 'campaign_website', id, persisted.name, {
        actorId: actor.id,
        before: { ...before },
        after: { ...persisted },
        reason,
      })
      return persisted
    }
    const index = campaigns.findIndex(campaign => campaign.id === id)
    if (index === -1) return null
    const actor = requiredActorFor(actorId)
    if (!hasPermission(actor, 'campaigns.manage') && !hasPermission(actor, 'campaigns.edit_operational')) {
      throw new Error('Only a Leader or Admin can update campaigns.')
    }
    const before = { ...campaigns[index] }
    campaigns[index] = { ...campaigns[index], website_url: null, campaign_url: undefined, website_preview_image: null, website_embed_enabled: false, updated_at: nowIso() }
    audit('campaigns', 'remove_upload', 'campaign_website', id, campaigns[index].name, { actorId, before, after: { ...campaigns[index] }, reason })
    return campaigns[index]
  },

  async delete(id: string): Promise<boolean> {
    return Boolean(await this.archive(id))
  },

  async getByBrand(brandId: string): Promise<Campaign[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseMasterDataRepository().campaigns.getByBrand(brandId)
    }
    return Promise.resolve(campaigns.filter(c => c.brand_id === brandId && !c.deleted_at && !c.archived_at))
  },
}

// Shift Service
// P1C-B2B-A: in Supabase mode all shift reads and mutations go through the
// Supabase repository (RLS + RPC). The in-memory `shifts` array is maintained
// as a read projection so the not-yet-cut-over shiftRegistrationService keeps
// seeing the same rows it mutates. Mock mode keeps the existing in-memory flow.
const upsertShiftProjection = (shift: Shift) => {
  const index = shifts.findIndex(candidate => candidate.id === shift.id)
  if (index === -1) {
    shifts.push(shift)
  } else {
    shifts[index] = shift
  }
}
const removeShiftProjection = (id: string) => {
  shifts = shifts.filter(shift => shift.id !== id)
}

export const shiftService = {
  async getAll(): Promise<Shift[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getAll()
    }
    return Promise.resolve(shifts.filter(shift => !shift.deleted_at))
  },

  async getAllIncludingDeleted(actorId: string): Promise<Shift[]> {
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view deleted shifts.')
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getAll(true)
    }
    return Promise.resolve([...shifts])
  },

  async getById(id: string): Promise<Shift | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getById(id)
    }
    return Promise.resolve(shifts.find(s => s.id === id) || null)
  },

  async create(data: Omit<Shift, 'id' | 'created_at' | 'updated_at'>): Promise<Shift> {
    if (getAuthMode() === 'supabase') {
      const persisted = await getSupabaseShiftRepository().create(data)
      upsertShiftProjection(persisted)
      recordScheduleChange('create', persisted.id, undefined, { ...persisted }, {
        source: persisted.import_batch_id
          ? scheduleImports.find(batch => batch.id === persisted.import_batch_id)?.source === 'google_sheets'
            ? 'google_sheets'
            : 'excel_import'
          : 'manual',
      })
      audit('calendar', 'create', 'shift', persisted.id, persisted.title || `${persisted.date} ${persisted.start_time}`, {
        after: { ...persisted },
        source: persisted.import_batch_id ? 'excel_import' : 'manual',
      })
      return persisted
    }
    const timezone = data.timezone || DEFAULT_BUSINESS_TIMEZONE
    const dateTime = shiftDateTimeFields(data.date, data.start_time, data.end_time, timezone)
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
      timezone,
      host_names: data.host_names ?? [],
      assistant_names: data.assistant_names ?? [],
      technical_names: data.technical_names ?? [],
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

  async update(
    id: string,
    data: Partial<Shift>,
    actorId = currentUserService.getId(),
    options: { reason?: string } = {},
  ): Promise<Shift | null> {
    if (getAuthMode() === 'supabase') {
      const lockPatch = data.registration_locked
      const shiftPatch = { ...data }
      delete shiftPatch.registration_locked
      // Staffing is managed through staffing RPCs only; direct IDs are
      // projections and must never reach update_shift.
      delete shiftPatch.host_id
      delete shiftPatch.support_id
      delete shiftPatch.technical_id
      // update_shift RPC rejects allow_multi_role/registration_cutoff_at for
      // leaders; only admins may change them, so strip them for non-admins.
      if (resolveSystemPermission(actorFor(actorId)) !== 'admin') {
        delete shiftPatch.allow_multi_role
        delete shiftPatch.registration_cutoff_at
      }
      let persisted = await getSupabaseShiftRepository().update(id, shiftPatch, false)
      if (!persisted) return null
      // Only invoke the lock/reopen RPC when registration_locked actually
      // changes; the edit form always submits the current boolean, and calling
      // set_shift_registration_lock on an unchanged value would reject with
      // SHIFT_CANNOT_REOPEN for non-scheduled/past shifts.
      if (lockPatch !== undefined && persisted.registration_locked !== lockPatch) {
        const locked = await getSupabaseShiftRepository().setRegistrationLock(id, Boolean(lockPatch))
        if (locked) persisted = locked
      }
      upsertShiftProjection(persisted)
      const action = data.registration_locked === true
        ? 'lock'
        : data.registration_locked === false
          ? 'reopen'
          : data.status === 'cancelled'
            ? 'cancel'
            : 'edit'
      recordScheduleChange(action, id, undefined, { ...persisted }, {
        actor_id: currentUserService.getId(),
      })
      const auditAction: AuditAction = action === 'lock' ? 'lock' : action === 'reopen' ? 'reopen' : 'update'
      audit('calendar', auditAction, 'shift', id, persisted.title || `${persisted.date} ${persisted.start_time}`, {
        after: { ...persisted },
      })
      return persisted
    }
    const index = shifts.findIndex(s => s.id === id)
    if (index === -1) return Promise.resolve(null)
    const before = { ...shifts[index] }
    const candidate = { ...shifts[index], ...data }
    const timezone = candidate.timezone || DEFAULT_BUSINESS_TIMEZONE
    const dateTime = shiftDateTimeFields(candidate.date, candidate.start_time, candidate.end_time, timezone)
    if (!dateTime) throw new Error('Shift date or duration is invalid.')
    const requiredHostCount = normalizeCapacity(candidate.required_host_count, operationalSettings.default_host_count)
    const requiredSupportCount = normalizeCapacity(candidate.required_support_count, operationalSettings.default_support_count)
    const requiredTechnicalCount = normalizeCapacity(candidate.required_technical_count, operationalSettings.default_technical_count)
    if (requiredHostCount === null || requiredSupportCount === null || requiredTechnicalCount === null) {
      throw new Error('Required staffing counts must be non-negative whole numbers within the allowed capacity.')
    }
    shifts[index] = {
      ...candidate,
      timezone,
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

  async updateStaffingLabels(
    id: string,
    labels: ShiftStaffingLabels,
    actorId = currentUserService.getId(),
  ): Promise<Shift | null> {
    const actor = requiredActorFor(actorId)
    if (!hasPermission(actor, 'shifts.edit')) {
      throw new Error('Only Leader or Admin can edit schedule staffing names.')
    }
    const normalizedLabels: ShiftStaffingLabels = {
      host_names: normalizeStaffingDisplayNames(labels.host_names),
      assistant_names: normalizeStaffingDisplayNames(labels.assistant_names),
      technical_names: normalizeStaffingDisplayNames(labels.technical_names),
    }

    if (getAuthMode() === 'supabase') {
      const repository = getSupabaseShiftRepository()
      const before = await repository.getById(id)
      const persisted = await repository.updateStaffingLabels(id, normalizedLabels)
      if (!persisted) return null
      upsertShiftProjection(persisted)
      recordScheduleChange('edit', id, before ? { ...before } : undefined, { ...persisted }, {
        actor_id: actor.id,
      })
      audit('calendar', 'update', 'shift', id, persisted.title || `${persisted.date} ${persisted.start_time}`, {
        actorId: actor.id,
        before: before ? {
          host_names: before.host_names ?? [],
          assistant_names: before.assistant_names ?? [],
          technical_names: before.technical_names ?? [],
        } : undefined,
        after: { ...normalizedLabels },
      })
      return persisted
    }

    const index = shifts.findIndex(item => item.id === id)
    if (index === -1) return Promise.resolve(null)
    if (shifts[index].deleted_at || shifts[index].archived_at) {
      throw new Error('Only active shifts can update schedule staffing names.')
    }
    const before = { ...shifts[index] }
    shifts[index] = {
      ...shifts[index],
      ...normalizedLabels,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    }
    recordScheduleChange('edit', id, before, { ...shifts[index] }, { actor_id: actor.id })
    audit('calendar', 'update', 'shift', id, shifts[index].title || `${shifts[index].date} ${shifts[index].start_time}`, {
      actorId: actor.id,
      before: {
        host_names: before.host_names ?? [],
        assistant_names: before.assistant_names ?? [],
        technical_names: before.technical_names ?? [],
      },
      after: { ...normalizedLabels },
    })
    return Promise.resolve(shifts[index])
  },

  async getDeletionImpact(id: string): Promise<DeletionImpact | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getDeletionImpact(id)
    }
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
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(actorId), 'shifts.delete')) {
        throw new Error('Only Admin can delete or archive shifts.')
      }
      const impact = await getSupabaseShiftRepository().remove(id, reason)
      if (!impact) return null
      removeShiftProjection(id)
      recordScheduleChange('soft_delete', id, undefined, undefined, { actor_id: actorId, reason })
      audit('calendar', 'soft_delete', 'shift', id, impact.entity_name, { actorId, reason, relatedRecords: impact.related_records })
      return impact
    }
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

  async bulkRemove(ids: string[], actorId: string, reason: string): Promise<BulkShiftDeletionResult> {
    const outcomes: BulkShiftDeletionOutcome[] = []
    for (const shiftId of ids) {
      const shift = shifts.find(candidate => candidate.id === shiftId)
      try {
        const impact = await this.remove(shiftId, actorId, reason)
        outcomes.push({
          shift_id: shiftId,
          shift_title: shift?.title,
          success: Boolean(impact),
          ...(impact ? {} : { error_message: 'Shift was not found.' }),
        })
      } catch (error) {
        outcomes.push({
          shift_id: shiftId,
          shift_title: shift?.title,
          success: false,
          error_message: error instanceof Error ? error.message : 'Unable to remove shift.',
        })
      }
    }
    return {
      outcomes,
      succeeded: outcomes.filter(outcome => outcome.success).length,
      failed: outcomes.filter(outcome => !outcome.success).length,
    }
  },

  async restore(id: string, actorId: string, reason: string): Promise<Shift | null> {
    if (getAuthMode() === 'supabase') {
      if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can restore shifts.')
      const persisted = await getSupabaseShiftRepository().restore(id)
      if (!persisted) return null
      upsertShiftProjection(persisted)
      recordScheduleChange('restore', id, undefined, { ...persisted }, { actor_id: actorId, reason })
      audit('calendar', 'restore', 'shift', id, persisted.title || `${persisted.date} ${persisted.start_time}`, { actorId, after: { ...persisted }, reason })
      return persisted
    }
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
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getByDate(date)
    }
    return Promise.resolve(shifts.filter(s => s.date === date && !s.deleted_at))
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getByDateRange(startDate, endDate)
    }
    return Promise.resolve(
      shifts.filter(s => s.date >= startDate && s.date <= endDate && !s.deleted_at)
    )
  },

  async getByStatus(status: string): Promise<Shift[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getByStatus(status)
    }
    return Promise.resolve(shifts.filter(s => s.status === status && !s.deleted_at))
  },

  async getToday(): Promise<Shift[]> {
    const today = businessLocalDate()
    return this.getByDate(today)
  },

  async getOpen(): Promise<Shift[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRepository().getOpen()
    }
    return Promise.resolve(shifts.filter(shift =>
      !shift.deleted_at &&
      shift.status === 'scheduled' &&
      !shift.registration_locked &&
      shiftEndAt(shift) > new Date()
    ))
  },

  async lock(id: string, actorId = currentUserService.getId()): Promise<Shift | null> {
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(actorId), 'shifts.lock')) {
        throw new Error('Only a Leader or Admin can lock registration.')
      }
      const persisted = await getSupabaseShiftRepository().setRegistrationLock(id, true)
      if (!persisted) return null
      upsertShiftProjection(persisted)
      recordScheduleChange('lock', id, undefined, { ...persisted }, { actor_id: actorId, reason: 'Registration locked' })
      audit('calendar', 'lock', 'shift', id, persisted.title || `${persisted.date} ${persisted.start_time}`, { actorId, after: { ...persisted }, reason: 'Registration locked' })
      return persisted
    }
    if (!hasPermission(requiredActorFor(actorId), 'shifts.lock')) {
      throw new Error('Only a Leader or Admin can lock registration.')
    }
    return this.update(id, { registration_locked: true }, actorId, { reason: 'Registration locked' })
  },

  async reopen(id: string, actorId = currentUserService.getId()): Promise<Shift | null> {
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(actorId), 'shifts.lock')) {
        throw new Error('Only a Leader or Admin can reopen registration.')
      }
      const persisted = await getSupabaseShiftRepository().setRegistrationLock(id, false)
      if (!persisted) return null
      upsertShiftProjection(persisted)
      recordScheduleChange('reopen', id, undefined, { ...persisted }, { actor_id: actorId, reason: 'Registration reopened' })
      audit('calendar', 'reopen', 'shift', id, persisted.title || `${persisted.date} ${persisted.start_time}`, { actorId, after: { ...persisted }, reason: 'Registration reopened' })
      return persisted
    }
    if (!hasPermission(requiredActorFor(actorId), 'shifts.lock')) {
      throw new Error('Only a Leader or Admin can reopen registration.')
    }
    const shift = shifts.find(candidate => candidate.id === id)
    if (!shift || shift.status !== 'scheduled' || shiftEndAt(shift) <= new Date()) return null
    return this.update(id, { registration_locked: false }, actorId, { reason: 'Registration reopened' })
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

const capacityForRegistrations = (
  shift: Shift,
  registrations: ShiftRegistration[],
  role: OperationalRole,
): ShiftRoleCapacity => {
  const roleRegistrations = registrations.filter(registration =>
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

export const getShiftRoleCapacities = (
  shift: Shift,
  registrations: ShiftRegistration[],
): ShiftRoleCapacity[] =>
  (['host', 'support', 'technical'] as OperationalRole[])
    .map(role => capacityForRegistrations(shift, registrations, role))

const capacityFor = (shift: Shift, role: OperationalRole): ShiftRoleCapacity =>
  capacityForRegistrations(shift, shiftRegistrations, role)

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
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRegistrationRepository().getAll()
    }
    return Promise.resolve([...shiftRegistrations])
  },

  async getForShift(shiftId: string): Promise<ShiftRegistration[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRegistrationRepository().getForShift(shiftId)
    }
    return Promise.resolve(shiftRegistrations.filter(registration => registration.shift_id === shiftId))
  },

  async getForUser(userId: string): Promise<ShiftRegistration[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRegistrationRepository().getForUser(userId)
    }
    return Promise.resolve(shiftRegistrations.filter(registration => registration.user_id === userId))
  },

  async getCapacity(shiftId: string): Promise<ShiftRoleCapacity[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRegistrationRepository().getCapacity(shiftId)
    }
    const shift = shifts.find(candidate => candidate.id === shiftId)
    if (!shift) return []
    return Promise.resolve(getShiftRoleCapacities(shift, shiftRegistrations))
  },

  async getMyApprovedShifts(userId: string): Promise<Shift[]> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseShiftRegistrationRepository().getMyApprovedShifts(userId)
    }
    const shiftIds = new Set(shiftRegistrations
      .filter(registration => registration.user_id === userId && isStaffedRegistration(registration))
      .map(registration => registration.shift_id))
    return Promise.resolve(shifts.filter(shift => shiftIds.has(shift.id) && !shift.deleted_at))
  },

  async register(shiftId: string, userId: string, role: OperationalRole): Promise<ShiftRegistration> {
    if (getAuthMode() === 'supabase') {
      // Actor identity comes from the Supabase session; the RPC resolves the
      // authenticated business user server-side. Client-supplied userId is
      // intentionally ignored for registration authority.
      const registration = await getSupabaseShiftRegistrationRepository().register(shiftId, role)
      recordScheduleChange('register', shiftId, undefined, { ...registration }, { actor_id: userId })
      audit('calendar', 'register', 'shift_registration', registration.id, `${registration.user_id} · ${role}`, { actorId: userId, after: { ...registration }, relatedRecords: [{ entity_type: 'shift', entity_id: shiftId, entity_name: shiftId }] })
      return registration
    }
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
    if (getAuthMode() === 'supabase') {
      if (reviewerId !== 'system') {
        if (!hasPermission(requiredActorFor(reviewerId), 'shifts.approve_registration')) {
          throw new Error('Only a Leader or Admin can approve registrations.')
        }
      }
      const registration = await getSupabaseShiftRegistrationRepository().approve(id, notes)
      recordScheduleChange('approve', registration.shift_id, undefined, { ...registration }, { actor_id: reviewerId, reason: notes })
      audit('calendar', 'approve', 'shift_registration', id, `${registration.user_id} · ${registration.operational_role}`, { actorId: reviewerId, after: { ...registration }, reason: notes })
      return registration
    }
    if (reviewerId !== 'system') ensureLeaderOrAdmin(reviewerId)
    const index = shiftRegistrations.findIndex(registration => registration.id === id)
    if (index === -1) throw new Error('Registration was not found.')
    const registration = shiftRegistrations[index]
    if (registration.status !== 'pending') throw new Error('Only a pending registration can be approved.')
    const shift = shifts.find(candidate => candidate.id === registration.shift_id)
    if (!shift) throw new Error('Shift was not found.')
    const staffMember = users.find(candidate => candidate.id === registration.user_id)
    if (
      !staffMember
      || staffMember.status !== 'active'
      || (staffMember.account_status !== undefined && staffMember.account_status !== 'active')
      || staffMember.archived_at
      || staffMember.deleted_at
      || !staffMember.operational_roles?.includes(registration.operational_role)
    ) {
      throw new Error('The staff member is inactive or no longer eligible for this role.')
    }
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
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(reviewerId), 'shifts.approve_registration')) {
        throw new Error('Only a Leader or Admin can reject registrations.')
      }
      const registration = await getSupabaseShiftRegistrationRepository().reject(id, notes)
      recordScheduleChange('reject', registration.shift_id, undefined, { ...registration }, { actor_id: reviewerId, reason: notes })
      audit('calendar', 'reject', 'shift_registration', id, `${registration.user_id} · ${registration.operational_role}`, { actorId: reviewerId, before: { status: 'pending' }, after: { ...registration }, reason: notes })
      return registration
    }
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

  async bulkReview(
    registrationIds: string[],
    action: ShiftRegistrationReviewAction,
    reviewerId: string,
    notes?: string,
  ): Promise<ShiftRegistrationReviewResult[]> {
    if (!hasPermission(requiredActorFor(reviewerId), 'shifts.approve_registration')) {
      throw new Error('Only a Leader or Admin can review registrations.')
    }

    const uniqueIds = [...new Set(registrationIds.map(id => id.trim()).filter(Boolean))]
    if (uniqueIds.length === 0) return []

    if (getAuthMode() === 'supabase') {
      const results = await getSupabaseShiftRegistrationRepository().bulkReview(uniqueIds, action, notes)
      results.forEach(result => {
        if (!result.success || !result.registration) return
        const registration = result.registration
        recordScheduleChange(
          action,
          registration.shift_id,
          { status: 'pending' },
          { ...registration },
          { actor_id: reviewerId, reason: notes },
        )
        audit(
          'calendar',
          action,
          'shift_registration',
          registration.id,
          `${registration.user_id} · ${registration.operational_role}`,
          {
            actorId: reviewerId,
            before: { status: 'pending' },
            after: { ...registration },
            reason: notes,
          },
        )
      })
      audit(
        'calendar',
        action,
        'shift_registration_batch',
        `bulk-${action}-${nowIso()}`,
        `${uniqueIds.length} staffing requests`,
        {
          actorId: reviewerId,
          after: {
            action,
            results: results.map(result => ({
              registration_id: result.registration_id,
              success: result.success,
              error_code: result.error_code,
            })),
          },
          reason: notes,
        },
      )
      return results
    }

    const results: ShiftRegistrationReviewResult[] = []
    for (const registrationId of uniqueIds) {
      try {
        const registration = action === 'approve'
          ? await this.approve(registrationId, reviewerId, notes)
          : await this.reject(registrationId, reviewerId, notes)
        results.push({
          registration_id: registrationId,
          action,
          success: true,
          registration,
        })
      } catch (error) {
        results.push({
          registration_id: registrationId,
          action,
          success: false,
          error_code: error instanceof Error ? error.name : 'REGISTRATION_REVIEW_FAILED',
          error_message: error instanceof Error ? error.message : 'Registration review failed.',
        })
      }
    }
    audit(
      'calendar',
      action,
      'shift_registration_batch',
      `bulk-${action}-${nowIso()}`,
      `${uniqueIds.length} staffing requests`,
      {
        actorId: reviewerId,
        after: {
          action,
          results: results.map(result => ({
            registration_id: result.registration_id,
            success: result.success,
            error_code: result.error_code,
          })),
        },
        reason: notes,
      },
    )
    return results
  },

  async cancel(id: string, userId: string, reason?: string): Promise<ShiftRegistration> {
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(userId), 'shifts.cancel_registration')) {
        throw new Error('Only the registrant can cancel their own registration.')
      }
      const registration = await getSupabaseShiftRegistrationRepository().cancel(id, reason)
      recordScheduleChange('cancel_registration', registration.shift_id, undefined, { ...registration }, { actor_id: userId, reason })
      audit('calendar', 'cancel_registration', 'shift_registration', id, `${registration.user_id} · ${registration.operational_role}`, { actorId: userId, after: { ...registration }, reason })
      return registration
    }
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
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(reviewerId), 'shifts.assign_staff')) {
        throw new Error('Only a Leader or Admin can assign staff.')
      }
      const registration = await getSupabaseShiftRegistrationRepository().assignManually(shiftId, userId, role)
      recordScheduleChange('manual_assign', shiftId, undefined, { ...registration }, { actor_id: reviewerId })
      audit('calendar', 'assign', 'shift_registration', registration.id, `${registration.user_id} · ${role}`, { actorId: reviewerId, after: { ...registration }, relatedRecords: [{ entity_type: 'shift', entity_id: shiftId, entity_name: shiftId }] })
      return registration
    }
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

  async assignImported(
    shiftId: string,
    userId: string,
    role: OperationalRole,
    importedName: string,
    matchMethod: NonNullable<ShiftRegistration['match_method']>,
    reviewerId: string,
  ): Promise<ShiftRegistration> {
    if (!hasPermission(requiredActorFor(reviewerId), 'shifts.assign_staff')) {
      throw new Error('Only a Leader or Admin can assign imported staffing names.')
    }
    const trimmedImportedName = importedName.trim()
    if (!trimmedImportedName) throw new Error('The imported staffing name is required.')

    if (getAuthMode() === 'supabase') {
      const registration = await getSupabaseShiftRegistrationRepository().assignImported(
        shiftId,
        userId,
        role,
        trimmedImportedName,
        matchMethod,
      )
      recordScheduleChange('manual_assign', shiftId, undefined, { ...registration }, { actor_id: reviewerId })
      audit('calendar', 'assign', 'shift_registration', registration.id, `${registration.user_id} · ${role}`, {
        actorId: reviewerId,
        after: { ...registration },
        relatedRecords: [{ entity_type: 'shift', entity_id: shiftId, entity_name: shiftId }],
      })
      return registration
    }

    const shift = shifts.find(candidate => candidate.id === shiftId)
    const user = users.find(candidate => candidate.id === userId)
    if (!shift || !user) throw new Error('Shift or staff member was not found.')
    if (!user.operational_roles?.includes(role) || user.status !== 'active') {
      throw new Error('The staff member is not eligible for this role.')
    }

    if (matchMethod !== 'manual') {
      const derivedMatch = deriveShiftStaffIdentityMatch(trimmedImportedName, role, users)
      if (
        derivedMatch.status !== 'candidate' ||
        derivedMatch.method !== matchMethod ||
        derivedMatch.suggestedUser?.id !== userId
      ) {
        throw new Error('The selected staff member does not satisfy the recorded match method.')
      }
    }
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
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      imported_name: trimmedImportedName,
      match_method: matchMethod,
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
    audit('calendar', 'assign', 'shift_registration', registration.id, `${user.full_name} · ${role}`, {
      actorId: reviewerId,
      after: { ...registration },
      relatedRecords: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }],
    })
    return registration
  },

  async removeAssignment(id: string, reviewerId: string, notes?: string): Promise<ShiftRegistration> {
    if (getAuthMode() === 'supabase') {
      if (!hasPermission(requiredActorFor(reviewerId), 'shifts.assign_staff')) {
        throw new Error('Only a Leader or Admin can remove staff assignments.')
      }
      const registration = await getSupabaseShiftRegistrationRepository().removeAssignment(id, notes)
      recordScheduleChange('remove_assignment', registration.shift_id, undefined, { ...registration }, { actor_id: reviewerId, reason: notes })
      audit('calendar', 'unassign', 'shift_registration', id, `${registration.user_id} · ${registration.operational_role}`, { actorId: reviewerId, after: { ...registration }, reason: notes })
      return registration
    }
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
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getAll()
    return Promise.resolve(reports.filter(report => !report.deleted_at && !report.archived_at))
  },

  async getAllIncludingArchived(actorId: string): Promise<Report[]> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getAllIncludingArchived()
    if (resolveSystemPermission(actorFor(actorId)) !== 'admin') throw new Error('Only Admin can view archived reports.')
    return Promise.resolve([...reports])
  },

  async getById(id: string): Promise<Report | null> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getById(id)
    return Promise.resolve(reports.find(r => r.id === id) || null)
  },

  async getByShift(shiftId: string): Promise<Report | null> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getByShift(shiftId)
    return Promise.resolve(reports.find(r => r.shift_id === shiftId && !r.deleted_at && !r.archived_at) || null)
  },

  async getConfirmed(): Promise<Report[]> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getConfirmed()
    return Promise.resolve(reports.filter(report =>
      report.status === 'confirmed' &&
      report.metrics_confirmed === true &&
      !report.deleted_at &&
      !report.archived_at
     ))
  },

  async getReportRevisions(reportId: string): Promise<ReportRevision[]> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getReportRevisions(reportId)
    return Promise.resolve([...(reports.find(r => r.id === reportId)?.revisions || [])])
  },

  async create(data: Omit<Report, 'id' | 'created_at' | 'updated_at'>): Promise<Report> {
    if (getAuthMode() === 'supabase') {
      const created = await getSupabaseReportRepository().create({
        shift_id: data.shift_id,
        revenue: data.revenue,
        orders: data.orders,
        peak_viewer: data.peak_viewer,
        average_viewer: data.average_viewer,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
        top_products: data.top_products,
        insights_good: data.insights_good,
        insights_improvement: data.insights_improvement,
        final_recap: data.final_recap,
        replay_url: data.replay_url,
        dashboard_url: data.dashboard_url,
        gmv: data.gmv,
        viewers: data.viewers,
        product_clicks: data.product_clicks,
        ctr: data.ctr,
        cvr: data.cvr,
        average_order_value: data.average_order_value,
        live_duration_minutes: data.live_duration_minutes,
        dashboard_platform: data.dashboard_platform,
        normalized_metrics: data.normalized_metrics,
        platform_metrics: data.platform_metrics,
        raw_ocr_output: data.raw_ocr_output,
        ocr_review: data.ocr_review,
        status: data.status,
      })
      audit('reports', 'create', 'report', created.id, `Report · ${data.shift_id}`, {
        actorId: data.submitted_by,
        after: { ...created },
        relatedRecords: [{ entity_type: 'shift', entity_id: data.shift_id, entity_name: data.shift_id }],
      })
      return created
    }
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
    if (getAuthMode() === 'supabase') {
      const updated = await getSupabaseReportRepository().update(id, data, reason ?? null, event)
      if (updated) {
        audit('reports', 'update', 'report', id, `Report · ${updated.shift_id}`, {
          actorId,
          after: { ...updated },
          reason,
        })
      }
      return updated
    }
    const index = reports.findIndex(r => r.id === id)
    if (index === -1) return Promise.resolve(null)
    const actor = requiredActorFor(actorId)
    const canReview = hasPermission(actor, 'reports.review')
    if (!canReview && reports[index].submitted_by !== actorId) {
      throw new Error('Only the report submitter or a Leader/Admin reviewer can update this report.')
    }
    if (!canReview && ['confirm', 'reopen', 'archive'].includes(event)) {
      throw new Error('Only a Leader or Admin can change the report review state.')
    }
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
    const unresolvedMetrics = Object.values(review.metrics).filter(metric =>
      metric?.status === 'review_required' || metric?.needs_review,
    )
    if (unresolvedMetrics.length > 0) {
      throw new Error(`Confirm or manually edit all review-required metrics before confirming this report (${unresolvedMetrics.length} remaining).`)
    }
    if (getAuthMode() === 'supabase') {
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
    }
    const reviewer = users.find(user => user.id === confirmedBy)
    if (!reviewer || !['leader', 'admin'].includes(reviewer.system_permission || reviewer.role)) {
      throw new Error('Only a Leader or Admin can confirm report metrics.')
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().startReview(id)
      if (result) audit('reports', 'update', 'report', id, `Report · ${result.shift_id}`, { actorId: reviewerId, after: { ...result } })
      return result
    }
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().rejectReview(id, notes)
      if (result) audit('reports', 'reject', 'report', id, `Report · ${result.shift_id}`, { actorId: reviewerId, after: { ...result }, reason: notes })
      return result
    }
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().reopen(id, reason)
      if (result) audit('reports', 'unconfirm', 'report', id, `Report · ${result.shift_id}`, { actorId, after: { ...result }, reason })
      return result
    }
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().resetOcr(id, reason)
      if (result) audit('reports', 'ocr_reset', 'report', id, `Report · ${result.shift_id}`, { actorId, after: { ...result }, reason, source: 'ocr' })
      return result
    }
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().recordOcrRun(id, review, rerun)
      if (result) audit('reports', rerun ? 'ocr_rerun' : 'ocr_run', 'report', id, `Report · ${result.shift_id}`, { actorId, after: { ...result }, source: 'ocr' })
      return result
    }
    const index = reports.findIndex(report => report.id === id)
    if (index === -1) return null
    const before = { ...reports[index] }
    reports[index] = { ...reports[index], ocr_review: review, raw_ocr_output: review.raw_output, updated_at: nowIso() }
    appendReportRevision(reports[index], rerun ? 'ocr_rerun' : 'ocr_run', actorId)
    audit('reports', rerun ? 'ocr_rerun' : 'ocr_run', 'report', id, `Report · ${reports[index].shift_id}`, { actorId, before, after: { ...reports[index] }, source: 'ocr' })
    return reports[index]
  },

  async removeDraft(id: string, actorId: string, reason: string): Promise<boolean> {
    if (getAuthMode() === 'supabase') {
      const report = await getSupabaseReportRepository().getById(id)
      const success = await getSupabaseReportRepository().removeDraft(id, reason)
      if (success) audit('reports', 'delete', 'report', id, `Report · ${report?.shift_id || id}`, { actorId, before: { ...report }, reason, entityExists: false })
      return success
    }
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().archive(id, reason)
      if (result) audit('reports', 'archive', 'report', id, `Report · ${result.shift_id}`, { actorId, after: { ...result }, reason })
      return result
    }
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
    if (getAuthMode() === 'supabase') {
      const result = await getSupabaseReportRepository().restore(id, reason)
      if (result) audit('reports', 'restore', 'report', id, `Report · ${result.shift_id}`, { actorId, after: { ...result }, reason })
      return result
    }
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

// Report evidence service. Supabase mode persists bytes in Storage and metadata through RPCs;
// mock mode retains the existing in-memory parity path.
export const reportImageService = {
  async getByReport(reportId: string): Promise<ReportImage[]> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getReportImages(reportId)
    return Promise.resolve(reportImages.filter(image => image.report_id === reportId && !image.deleted_at))
  },

  async create(data: Omit<ReportImage, 'id' | 'created_at'>): Promise<ReportImage> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const parentReport = await repo.getById(data.report_id)
      if (!parentReport) throw new Error('Report was not found.')
      if (parentReport.metrics_confirmed || parentReport.status === 'confirmed') {
        throw new Error('Reopen the confirmed report before uploading new evidence.')
      }
      const actor = requiredActorFor(data.uploaded_by || currentUserService.getId())
      const image = await repo.uploadReportImage({
        report_id: data.report_id,
        storage_path: data.storage_path || `reports/${data.report_id}/${data.image_type}/${data.original_name || generateId()}`,
        image_url: data.image_url,
        original_name: data.original_name,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        image_type: data.image_type,
        uploaded_by: actor.id,
      })
      audit('reports', 'upload', 'report_image', image.id, image.original_name || image.image_type, { actorId: data.uploaded_by || currentUserService.getId(), after: { ...image }, source: 'upload', relatedRecords: [{ entity_type: 'report', entity_id: image.report_id, entity_name: `Report ${image.report_id}` }] })
      return image
    }
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
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const image = await repo.getReportImageById(id)
      if (!image) return false
      const report = await repo.getById(image.report_id)
      if (!report) throw new Error('Report was not found.')
      const actor = actorFor(actorId)
      if (resolveSystemPermission(actor) === 'member' && image.uploaded_by !== actorId) {
        throw new Error('You can only remove images that you uploaded.')
      }
      if (report.metrics_confirmed) throw new Error('Undo report confirmation before removing evidence.')
      const success = await repo.removeReportImage(id)
      if (success) audit('reports', 'remove_upload', 'report_image', id, image.original_name || image.image_type, { actorId, before: { ...image }, reason, source: 'upload', entityExists: false })
      return success
    }
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

// Live-session gallery service. Supabase mode persists Storage objects and metadata;
// mock mode retains the existing in-memory parity path.
export const liveReportImageService = {
  async getByReport(reportId: string): Promise<LiveReportImage[]> {
    if (getAuthMode() === 'supabase') return getSupabaseReportRepository().getLiveReportImages(reportId)
    return sortedLiveReportImages(
      liveReportImages.filter(image => image.report_id === reportId),
    )
  },

  async create(
    data: Omit<LiveReportImage, 'id' | 'created_at'> & { report_id: string },
    actorId: string,
  ): Promise<LiveReportImage> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const report = await repo.getById(data.report_id)
      if (!report) throw new Error('Report was not found.')
      if (report.metrics_confirmed || report.status === 'confirmed') {
        throw new Error('Reopen the confirmed report before uploading new live-session images.')
      }
      const existing = await repo.getLiveReportImages(data.report_id)
      if (existing.length >= maximumLiveReportImages) {
        throw new Error('A report can contain at most 30 live-session images.')
      }
      if (!liveReportImageCategories.includes(data.category)) {
        throw new Error('The image category is invalid.')
      }
      const fileName = sanitizeLiveReportImageFileName(data.file_name)
      const fileError = validateLiveReportImageFile({
        name: fileName,
        type: data.mime_type,
        size: data.size_bytes,
      }, existing.length)
      if (fileError) throw new Error(`Invalid live-session image: ${fileError.code}.`)
      const metadataError = validateLiveReportImageMetadata(data)
      if (metadataError) throw new Error(`Invalid image metadata: ${metadataError.code}.`)
      const image = await repo.upsertLiveReportImage({
        report_id: data.report_id,
        category: data.category,
        title: data.title,
        description: data.description,
        captured_at: data.captured_at,
        file_url: data.file_url,
        thumbnail_url: data.thumbnail_url,
        file_name: fileName,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        sort_order: existing.length,
        is_cover: data.is_cover || existing.length === 0,
      })
      audit('reports', 'upload', 'live_report_image', image.id, image.file_name, {
        actorId,
        after: { ...image },
        source: 'upload',
        relatedRecords: [{
          entity_type: 'report',
          entity_id: report.id,
          entity_name: `Report ${report.id}`,
        }],
      })
      return image
    }
    const report = requireEditableImageReport(data.report_id, actorId)
    const reportImageCount = liveReportImages.filter(
      image => image.report_id === data.report_id,
    ).length
    if (reportImageCount >= maximumLiveReportImages) {
      throw new Error('A report can contain at most 30 live-session images.')
    }
    if (!liveReportImageCategories.includes(data.category)) {
      throw new Error('The image category is invalid.')
    }
    const fileName = sanitizeLiveReportImageFileName(data.file_name)
    const fileError = validateLiveReportImageFile({
      name: fileName,
      type: data.mime_type,
      size: data.size_bytes,
    }, reportImageCount)
    if (fileError) throw new Error(`Invalid live-session image: ${fileError.code}.`)
    const metadataError = validateLiveReportImageMetadata(data)
    if (metadataError) throw new Error(`Invalid image metadata: ${metadataError.code}.`)
    if (!isSafeMockImageUrl(data.file_url)) throw new Error('The image URL is invalid.')

    const existing = liveReportImages.filter(image => image.report_id === data.report_id)
    const shouldCover = data.is_cover || existing.length === 0
    if (shouldCover) {
      liveReportImages = liveReportImages.map(image =>
        image.report_id === data.report_id ? { ...image, is_cover: false } : image,
      )
    }
    const image: LiveReportImage = {
      ...data,
      id: generateId(),
      file_name: fileName,
      title: data.title?.trim() || undefined,
      description: data.description?.trim() || undefined,
      captured_at: data.captured_at || undefined,
      sort_order: existing.length,
      is_cover: shouldCover,
      uploaded_by: actorId,
      created_at: nowIso(),
    }
    liveReportImages.push(image)
    appendReportRevision(report, 'upload_image', actorId, `Uploaded ${image.file_name}`)
    audit('reports', 'upload', 'live_report_image', image.id, image.file_name, {
      actorId,
      after: { ...image },
      source: 'upload',
      relatedRecords: [{
        entity_type: 'report',
        entity_id: report.id,
        entity_name: `Report ${report.id}`,
      }],
    })
    return image
  },

  async updateMetadata(
    id: string,
    patch: Pick<
      LiveReportImage,
      'category' | 'title' | 'description' | 'captured_at'
    >,
    actorId: string,
  ): Promise<LiveReportImage> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const current = await repo.getLiveReportImageById(id)
      if (!current) throw new Error('Image was not found.')
      if (!liveReportImageCategories.includes(patch.category)) {
        throw new Error('The image category is invalid.')
      }
      const metadataError = validateLiveReportImageMetadata({ ...current, ...patch })
      if (metadataError) throw new Error(`Invalid image metadata: ${metadataError.code}.`)
      const updated = await repo.updateLiveReportImageMetadata(id, {
        category: patch.category,
        title: patch.title,
        description: patch.description,
        captured_at: patch.captured_at,
      })
      const report = await repo.getById(current.report_id || '')
      if (report) appendReportRevision(report, 'save', actorId, `Updated ${current.file_name}`)
      audit('reports', 'update', 'live_report_image', id, current.file_name, {
        actorId,
        after: { ...updated },
        source: 'upload',
      })
      return updated
    }
    const index = liveReportImages.findIndex(image => image.id === id)
    if (index === -1) throw new Error('Image was not found.')
    const current = liveReportImages[index]
    const report = requireEditableImageReport(current.report_id || '', actorId)
    if (!liveReportImageCategories.includes(patch.category)) {
      throw new Error('The image category is invalid.')
    }
    const metadataError = validateLiveReportImageMetadata(patch)
    if (metadataError) throw new Error(`Invalid image metadata: ${metadataError.code}.`)
    liveReportImages[index] = {
      ...current,
      category: patch.category,
      title: patch.title?.trim() || undefined,
      description: patch.description?.trim() || undefined,
      captured_at: patch.captured_at || undefined,
    }
    appendReportRevision(report, 'save', actorId, `Updated ${current.file_name}`)
    return liveReportImages[index]
  },

  async setCover(id: string, actorId: string): Promise<LiveReportImage[]> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const image = await repo.getLiveReportImageById(id)
      if (!image?.report_id) throw new Error('Image was not found.')
      const report = await repo.getById(image.report_id)
      if (!report) throw new Error('Report was not found.')
      if (report.metrics_confirmed || report.status === 'confirmed') {
        throw new Error('Reopen the confirmed report before changing report images.')
      }
      await repo.setLiveReportImageCover(image.report_id, id)
      audit('reports', 'update', 'live_report_image', id, image.file_name, {
        actorId,
        after: { ...image, is_cover: true },
        source: 'upload',
      })
      return repo.getLiveReportImages(image.report_id)
    }
    const image = liveReportImages.find(candidate => candidate.id === id)
    if (!image?.report_id) throw new Error('Image was not found.')
    const report = requireEditableImageReport(image.report_id, actorId)
    liveReportImages = liveReportImages.map(candidate =>
      candidate.report_id === image.report_id
        ? { ...candidate, is_cover: candidate.id === id }
        : candidate,
    )
    appendReportRevision(report, 'save', actorId, `Set ${image.file_name} as report cover`)
    return this.getByReport(image.report_id)
  },

  async reorder(
    reportId: string,
    orderedIds: readonly string[],
    actorId: string,
  ): Promise<LiveReportImage[]> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const report = await repo.getById(reportId)
      if (!report) throw new Error('Report was not found.')
      if (report.metrics_confirmed || report.status === 'confirmed') {
        throw new Error('Reopen the confirmed report before changing report images.')
      }
      const current = await repo.getLiveReportImages(reportId)
      if (
        orderedIds.length !== current.length
        || new Set(orderedIds).size !== current.length
        || current.some(image => !orderedIds.includes(image.id))
      ) {
        throw new Error('The image order is invalid.')
      }
      await repo.reorderLiveReportImages(reportId, orderedIds)
      audit('reports', 'update', 'live_report_image', reportId, 'Reordered live-session images', {
        actorId,
        source: 'upload',
      })
      return repo.getLiveReportImages(reportId)
    }
    const report = requireEditableImageReport(reportId, actorId)
    const current = liveReportImages.filter(image => image.report_id === reportId)
    if (
      orderedIds.length !== current.length
      || new Set(orderedIds).size !== current.length
      || current.some(image => !orderedIds.includes(image.id))
    ) {
      throw new Error('The image order is invalid.')
    }
    const order = new Map(orderedIds.map((id, index) => [id, index]))
    liveReportImages = liveReportImages.map(image =>
      image.report_id === reportId
        ? { ...image, sort_order: order.get(image.id) ?? image.sort_order }
        : image,
    )
    appendReportRevision(report, 'save', actorId, 'Reordered live-session images')
    return this.getByReport(reportId)
  },

  async remove(id: string, actorId: string): Promise<LiveReportImage[]> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseReportRepository()
      const image = await repo.getLiveReportImageById(id)
      if (!image) throw new Error('Image was not found.')
      if (!image.report_id) throw new Error('The image is not attached to a report.')
      const report = await repo.getById(image.report_id)
      if (!report) throw new Error('Report was not found.')
      if (report.metrics_confirmed || report.status === 'confirmed') {
        throw new Error('Reopen the confirmed report before changing report images.')
      }
      const success = await repo.removeLiveReportImage(id)
      if (success) {
        audit('reports', 'remove_upload', 'live_report_image', id, image.file_name, {
          actorId,
          before: { ...image },
          source: 'upload',
          entityExists: false,
        })
      }
      return repo.getLiveReportImages(image.report_id)
    }
    const index = liveReportImages.findIndex(image => image.id === id)
    if (index === -1) throw new Error('Image was not found.')
    const image = liveReportImages[index]
    if (!image.report_id) throw new Error('The image is not attached to a report.')
    const report = requireEditableImageReport(image.report_id, actorId)
    liveReportImages.splice(index, 1)
    const remaining = liveReportImages
      .filter(candidate => candidate.report_id === image.report_id)
      .sort((left, right) => left.sort_order - right.sort_order)
    remaining.forEach((candidate, sortOrder) => {
      candidate.sort_order = sortOrder
    })
    if (image.is_cover && remaining.length > 0) remaining[0].is_cover = true
    if (typeof window !== 'undefined') revokeLiveReportImageObjectUrl(image)
    appendReportRevision(report, 'remove_image', actorId, `Removed ${image.file_name}`)
    audit('reports', 'remove_upload', 'live_report_image', image.id, image.file_name, {
      actorId,
      before: { ...image },
      source: 'upload',
      entityExists: false,
    })
    return this.getByReport(image.report_id)
  },
}

function requireEditableImageReport(reportId: string, actorId: string) {
  const report = reports.find(candidate => candidate.id === reportId)
  if (!report) throw new Error('Report was not found.')
  const actor = users.find(user => user.id === actorId)
  if (!actor) throw new Error('The current user could not be verified.')
  const canReview = resolveSystemPermission(actor) !== 'member'
  const ownsReport = report.submitted_by === actorId
  if (!canReview && !ownsReport) {
    throw new Error('You do not have permission to edit report images.')
  }
  if (report.metrics_confirmed || report.status === 'confirmed') {
    throw new Error('Reopen the confirmed report before changing report images.')
  }
  return report
}

function isSafeMockImageUrl(value: string) {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'blob:' || protocol === 'https:'
  } catch {
    return false
  }
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

// Swap Request Service — supports 3 modes: replacement (legacy same-shift), move, exchange
// Supabase mode delegates to hardened RPCs; mock mode reuses P1C guards and is transaction-atomic
type SwapHistoryAction = NonNullable<SwapRequest['approval_history']>[number]['action']
const swapHistoryEntry = (
  request: SwapRequest,
  action: SwapHistoryAction,
  actorId: string,
  fromStatus: SwapRequest['status'] | null,
  toStatus: SwapRequest['status'],
  notes?: string,
) => ({
  action,
  actor_id: actorId,
  mode: request.mode,
  requester_id: request.requester_id,
  counterpart_id: request.counterpart_id ?? null,
  replacement_staff_id: request.replacement_staff_id ?? null,
  source_registration_id: request.source_registration_id,
  counterpart_registration_id: request.counterpart_registration_id ?? null,
  source_shift_id: request.source_shift_id ?? request.shift_id,
  target_shift_id: request.target_shift_id ?? null,
  operational_role: request.operational_role,
  from_status: fromStatus,
  to_status: toStatus,
  reason: request.reason,
  at: nowIso(),
  ...(notes ? { notes } : {}),
})

const isCreatableSwapMode = (mode: unknown): mode is 'replacement' | 'exchange' =>
  mode === 'replacement' || mode === 'exchange'

const swapParticipantId = (request: SwapRequest): string | null =>
  request.mode === 'replacement'
    ? request.replacement_staff_id ?? null
    : request.counterpart_id ?? null

const canViewMockSwapRequest = (request: SwapRequest, actor: User): boolean =>
  ['leader', 'admin'].includes(resolveSystemPermission(actor))
  || request.requester_id === actor.id
  || swapParticipantId(request) === actor.id

export const swapRequestService = {
  async getAll(): Promise<SwapRequest[]> {
    if (getAuthMode() === 'supabase') return getSupabaseSwapRequestRepository().getAll()
    const actor = actorFor()
    return Promise.resolve(swapRequests.filter(request => !request.deleted_at && canViewMockSwapRequest(request, actor)))
  },
  async getPending(): Promise<SwapRequest[]> {
    if (getAuthMode() === 'supabase') return getSupabaseSwapRequestRepository().getPending()
    const actor = actorFor()
    return Promise.resolve(swapRequests.filter(sr =>
      (sr.status === 'pending' || sr.status === 'accepted') && canViewMockSwapRequest(sr, actor),
    ))
  },
  async create(
    data: Omit<SwapRequest, 'id' | 'status' | 'created_at' | 'updated_at'> & { status?: SwapRequest['status']; mode?: string; source_registration_id?: string; target_shift_id?: string | null; counterpart_registration_id?: string | null; counterpart_id?: string | null },
  ): Promise<SwapRequest> {
    const requestedMode = (data as unknown as { mode?: string }).mode
    const sourceRegId = (data as unknown as { source_registration_id?: string }).source_registration_id
    const targetShiftId = (data as unknown as { target_shift_id?: string | null }).target_shift_id ?? null
    const counterpartRegId = (data as unknown as { counterpart_registration_id?: string | null }).counterpart_registration_id ?? null
    if (requestedMode === 'move') throw new Error('MOVE requests are historical and cannot be created.')
    const replacementId = data.replacement_staff_id || data.new_host_id || data.new_support_id || data.new_technical_id || null
    const effectiveMode = isCreatableSwapMode(requestedMode)
      ? requestedMode
      : counterpartRegId ? 'exchange' : replacementId ? 'replacement' : null
    if (!effectiveMode) throw new Error('Swap mode must be replacement or exchange.')
    if (effectiveMode === 'replacement' && (targetShiftId || counterpartRegId || data.counterpart_id)) {
      throw new Error('Replacement requests cannot include a target or counterpart registration.')
    }
    if (effectiveMode === 'exchange' && (!targetShiftId || !counterpartRegId || replacementId)) {
      throw new Error('Exchange requests require a target and counterpart registration only.')
    }
    // Supabase path — prefer new registration-based RPC
    if (getAuthMode() === 'supabase') {
      if (!sourceRegId) throw new Error('A source registration is required for swap requests.')
      return getSupabaseSwapRequestRepository().create({
        sourceRegistrationId: sourceRegId,
        targetShiftId,
        counterpartRegistrationId: counterpartRegId,
        replacementStaffId: replacementId,
        operational_role: data.operational_role,
        reason: data.reason,
        notes: data.notes,
        mode: effectiveMode,
      })
    }
    // Mock mode — determine mode and validate using P1C guards, no direct table fallback
    const requesterId = data.requester_id
    const role: OperationalRole = (data.operational_role as OperationalRole) || (data.new_support_id ? 'support' : data.new_technical_id ? 'technical' : 'host')
    // Resolve source registration
    let sourceReg: ShiftRegistration | undefined
    let sourceShift: Shift | undefined
    if (sourceRegId) {
      sourceReg = shiftRegistrations.find(r => r.id === sourceRegId)
      if (!sourceReg) throw new Error('Source registration not found.')
      if (sourceReg.user_id !== requesterId) throw new Error('You can only request a swap for a role assigned to you.')
       if (!isStaffedRegistration(sourceReg)) throw new Error('Source not active.')
      sourceShift = shifts.find(s => s.id === sourceReg!.shift_id)
    } else {
      // legacy replacement path
      sourceShift = shifts.find(candidate => candidate.id === data.shift_id)
      if (!sourceShift) throw new Error('Shift was not found.')
      const ownsRole = sourceShift[roleAssignmentField[role]] === requesterId ||
        shiftRegistrations.some(r => r.shift_id === data.shift_id && r.user_id === requesterId && r.operational_role === role && isStaffedRegistration(r))
      if (!ownsRole) throw new Error('You can only request a swap for a role assigned to you.')
      sourceReg = shiftRegistrations.find(r => r.shift_id === data.shift_id && r.user_id === requesterId && r.operational_role === role && isStaffedRegistration(r))
      if (!sourceReg) {
        // create synthetic source for legacy mock (approved)
        sourceReg = { id: `src-${generateId()}`, shift_id: data.shift_id, user_id: requesterId, operational_role: role, status: 'approved', source: 'manual_assignment', requested_at: nowIso(), created_at: nowIso(), updated_at: nowIso() }
      }
    }
    if (!sourceShift) throw new Error('Source shift not found.')
    if (sourceShift.status !== 'scheduled') throw new Error('Source shift not scheduled.')
    // Check inactive
    const requester = users.find(u => u.id === requesterId)
    if (!requester || requester.status !== 'active' || requester.archived_at || requester.deleted_at) throw new Error('Requester inactive.')
    // Duplicate active blocked for same source registration
    if (swapRequests.some(r => r.source_registration_id === sourceReg!.id && ['pending','accepted','approved'].includes(r.status))) {
      throw new Error('Duplicate active swap request for this assignment.')
    }
    if (effectiveMode === 'replacement') {
      if (!replacementId || replacementId === requesterId) throw new Error('A different replacement staff member is required.')
      const replacement = users.find(u => u.id === replacementId)
      if (!replacement?.operational_roles?.includes(role)) throw new Error('Replacement staff is not eligible for this role.')
      if (replacement.status !== 'active' || replacement.archived_at) throw new Error('Replacement inactive.')
      if (shiftRegistrations.some(registration =>
        registration.shift_id === sourceShift!.id
        && registration.user_id === replacementId
        && isStaffedRegistration(registration),
      )) throw new Error('Replacement already assigned to shift.')
      if (findRegistrationConflict(replacementId, sourceShift)) throw new Error('Replacement staff has a schedule conflict.')
      const occupiedAfterReplacement = shiftRegistrations.filter(registration =>
        registration.shift_id === sourceShift!.id
        && registration.operational_role === role
        && isStaffedRegistration(registration)
        && registration.id !== sourceReg!.id,
      ).length
      if (occupiedAfterReplacement >= (sourceShift[roleRequiredField[role]] ?? 1)) throw new Error('Source shift capacity full.')
      const newRequest: SwapRequest = {
        ...data,
        mode: 'replacement',
        source_shift_id: sourceShift.id,
        target_shift_id: null,
        source_registration_id: sourceReg.id,
        counterpart_id: null,
        counterpart_registration_id: null,
        operational_role: role,
        original_staff_id: requesterId,
        replacement_staff_id: replacementId,
        id: generateId(),
        status: 'pending',
        created_at: nowIso(),
        updated_at: nowIso(),
      } as SwapRequest
      newRequest.approval_history = [swapHistoryEntry(newRequest, 'created', requesterId, null, 'pending', newRequest.notes)]
      swapRequests.push(newRequest)
      audit('swaps','create','swap_request',newRequest.id,`Swap · ${role} · ${effectiveMode}`,{ actorId: requesterId, after:{...newRequest}, relatedRecords:[{entity_type:'shift',entity_id:sourceShift.id,entity_name:sourceShift.title||sourceShift.date}] })
      return Promise.resolve(newRequest)
    }
    // exchange
    if (effectiveMode === 'exchange') {
      if (!targetShiftId) throw new Error('Target shift required for exchange.')
      if (!counterpartRegId) throw new Error('Counterpart required for exchange.')
      const targetShift = shifts.find(s => s.id === targetShiftId)
      if (!targetShift) throw new Error('Target shift not found.')
      if (targetShift.status !== 'scheduled') throw new Error('Target shift not scheduled.')
      if (targetShift.id === sourceShift.id) throw new Error('Source and target must be different for exchange.')
      const cpReg = shiftRegistrations.find(r => r.id === counterpartRegId)
      if (!cpReg) throw new Error('Counterpart not found.')
      if (cpReg.shift_id !== targetShiftId) throw new Error('Counterpart shift mismatch.')
      if (cpReg.operational_role !== role) throw new Error('Role mismatch.')
      if (!isStaffedRegistration(cpReg)) throw new Error('Counterpart not active.')
      const counterpartUser = users.find(u => u.id === cpReg.user_id)
      if (!counterpartUser || counterpartUser.status !== 'active' || counterpartUser.archived_at) throw new Error('Counterpart inactive.')
      if (swapRequests.some(r => r.counterpart_registration_id === cpReg.id && ['pending', 'accepted', 'approved'].includes(r.status))) throw new Error('Duplicate counterpart swap request.')
      const targetCapacity = targetShift[roleRequiredField[role]] ?? 1
      const targetOccupied = shiftRegistrations.filter(r => r.shift_id === targetShift.id && r.operational_role === role && isStaffedRegistration(r) && r.id !== cpReg.id).length
      if (targetOccupied >= targetCapacity) throw new Error('Target shift capacity full.')
      const sourceCapacity = sourceShift[roleRequiredField[role]] ?? 1
      const sourceOccupied = shiftRegistrations.filter(r => r.shift_id === sourceShift.id && r.operational_role === role && isStaffedRegistration(r) && r.id !== sourceReg!.id).length
      if (sourceOccupied >= sourceCapacity) throw new Error('Source shift capacity full.')
      if (findRegistrationConflict(requesterId, targetShift, sourceReg.id)) throw new Error('Requester has a schedule conflict.')
      if (findRegistrationConflict(cpReg.user_id, sourceShift, cpReg.id)) throw new Error('Counterpart has a schedule conflict.')
      if (shiftRegistrations.some(r => r.shift_id === targetShift.id && r.user_id === requesterId && isStaffedRegistration(r) && r.id !== sourceReg.id)) throw new Error('Requester already assigned to target.')
      if (shiftRegistrations.some(r => r.shift_id === sourceShift.id && r.user_id === cpReg.user_id && isStaffedRegistration(r) && r.id !== cpReg.id)) throw new Error('Counterpart already assigned to source.')
      const newRequest: SwapRequest = {
        ...data,
        mode: 'exchange',
        source_shift_id: sourceShift.id,
        target_shift_id: targetShiftId,
        source_registration_id: sourceReg.id,
        replacement_staff_id: undefined,
        new_host_id: undefined,
        new_support_id: undefined,
        new_technical_id: undefined,
        counterpart_registration_id: cpReg.id,
        counterpart_id: cpReg.user_id,
        operational_role: role,
        id: generateId(),
        status: 'pending',
        created_at: nowIso(),
        updated_at: nowIso(),
      } as SwapRequest
      newRequest.approval_history = [swapHistoryEntry(newRequest, 'created', requesterId, null, 'pending', newRequest.notes)]
      swapRequests.push(newRequest)
      audit('swaps','create','swap_request',newRequest.id,`Swap · ${role} · exchange`,{ actorId: requesterId, after:{...newRequest}, relatedRecords:[{entity_type:'shift',entity_id:sourceShift.id,entity_name:sourceShift.title||sourceShift.date},{entity_type:'shift',entity_id:targetShift.id,entity_name:targetShift.title||targetShift.date}] })
      return Promise.resolve(newRequest)
    }
    throw new Error('Swap mode invalid.')
  },
  async accept(id: string, actorId: string): Promise<SwapRequest | null> {
    if (getAuthMode() === 'supabase') {
      const repo = getSupabaseSwapRequestRepository() as unknown as { accept: (id:string,notes?:string)=>Promise<SwapRequest> }
      if ((repo as unknown as { accept?: unknown }).accept) return (repo as unknown as { accept: (a:string, b?:string)=>Promise<SwapRequest> }).accept(id)
      return (getSupabaseSwapRequestRepository() as unknown as { respond: (a:string,b:string)=>Promise<SwapRequest> }).respond(id,'accept')
    }
    const idx = swapRequests.findIndex(sr => sr.id === id)
    if (idx === -1) return Promise.resolve(null)
      const req = swapRequests[idx]
    if (!isCreatableSwapMode(req.mode)) throw new Error('Historical MOVE requests are read-only.')
    if (req.status !== 'pending') throw new Error('Swap not pending.')
    if (swapParticipantId(req) !== actorId) throw new Error('Only the selected participant may accept.')
    const before = { ...req }
    swapRequests[idx] = { ...req, status: 'accepted', responded_at: nowIso(), responded_by: actorId, updated_at: nowIso(), approval_history: [...(req.approval_history||[]), swapHistoryEntry(req, 'accepted', actorId, req.status, 'accepted')] }
    audit('swaps','update','swap_request',id,`Swap · ${req.operational_role} · accept`,{ actorId, before, after:{...swapRequests[idx]} })
    return Promise.resolve(swapRequests[idx])
  },
  async respond(id: string, actorId: string, action: 'accept' | 'reject'): Promise<SwapRequest | null> {
    if (getAuthMode() === 'supabase') return getSupabaseSwapRequestRepository().respond(id, action)
    const idx = swapRequests.findIndex(sr => sr.id === id)
    if (idx === -1) return Promise.resolve(null)
    const req = swapRequests[idx]
    if (!isCreatableSwapMode(req.mode)) throw new Error('Historical MOVE requests are read-only.')
    if (req.status !== 'pending') throw new Error('Only a pending swap can be responded to.')
    if (swapParticipantId(req) !== actorId) throw new Error('Only the selected participant may respond.')
    const nextStatus = action === 'accept' ? 'accepted' : 'rejected'
    const now = nowIso()
    const before = { ...req }
    swapRequests[idx] = { ...req, status: nextStatus, responded_at: now, responded_by: actorId, updated_at: now, approval_history: [...(req.approval_history || []), swapHistoryEntry(req, nextStatus, actorId, req.status, nextStatus)] }
    audit('swaps', 'update', 'swap_request', id, `Swap · ${req.operational_role} · ${action}`, { actorId, before, after: { ...swapRequests[idx] } })
    return Promise.resolve(swapRequests[idx])
  },
  async approve(id: string, approverId: string): Promise<SwapRequest | null> {
    if (getAuthMode() === 'supabase') return getSupabaseSwapRequestRepository().approve(id)
    ensureLeaderOrAdmin(approverId)
    const idx = swapRequests.findIndex(sr => sr.id === id)
    if (idx === -1) return Promise.resolve(null)
    const req = swapRequests[idx]
    if (!isCreatableSwapMode(req.mode)) throw new Error('Historical MOVE requests are read-only.')
    if (req.status !== 'accepted') throw new Error('Swap must be accepted by the selected participant before approval.')
    // Atomic execution with deterministic lock order and rollback on failure
    const snapshotRegs = [...shiftRegistrations]
    const snapshotShifts = shifts.map(s=>({...s}))
    const snapshotSwaps = [...swapRequests]
    try {
      const srcReg = shiftRegistrations.find(r=> r.id===req.source_registration_id)
      if (!srcReg || !isStaffedRegistration(srcReg)) throw new Error('Source stale.')
      if (srcReg.user_id !== req.requester_id) throw new Error('Source owner mismatch.')
      const srcShift = shifts.find(s=> s.id===req.source_shift_id)
      const tgtShift = req.target_shift_id ? shifts.find(s=> s.id===req.target_shift_id) : srcShift
      if (!srcShift || !tgtShift) throw new Error('Shift stale.')
      if (srcShift.status !== 'scheduled' || tgtShift.status !== 'scheduled') throw new Error('Shift not scheduled.')
      const requester = users.find(u=> u.id===req.requester_id)
      if (!requester || requester.status!=='active' || requester.archived_at) throw new Error('Requester inactive.')
      // Revalidate role eligibility
      if (!requester.operational_roles?.includes(req.operational_role as OperationalRole)) throw new Error('Role mismatch.')
      // Capacity/conflict checks per mode with correct sequencing to avoid false positives
      if (req.mode === 'exchange') {
         const cpReg = shiftRegistrations.find(r=> r.id===req.counterpart_registration_id)
         if (!cpReg || !isStaffedRegistration(cpReg)) throw new Error('Counterpart stale.')
         const cpUser = users.find(u=> u.id===req.counterpart_id)
         if (!cpUser || cpUser.status!=='active' || cpUser.archived_at) throw new Error('Counterpart inactive.')
         if (cpReg.shift_id !== tgtShift.id || cpReg.operational_role !== req.operational_role || cpReg.user_id !== req.counterpart_id || cpReg.user_id === requester.id) throw new Error('Counterpart mismatch.')
         if (req.responded_by !== cpReg.user_id) throw new Error('Counterpart acceptance is stale.')
        // capacity checks excluding the registrations that will be cancelled
        const srcTgtCount = shiftRegistrations.filter(r=> r.shift_id===tgtShift!.id && r.operational_role===req.operational_role && isStaffedRegistration(r) && r.id!==cpReg.id).length
        const tgtSrcCount = shiftRegistrations.filter(r=> r.shift_id===srcShift.id && r.operational_role===req.operational_role && isStaffedRegistration(r) && r.id!==srcReg.id).length
        if (srcTgtCount >= (tgtShift![roleRequiredField[req.operational_role as OperationalRole]] ?? 1)) throw new Error('Target shift capacity full.')
        if (tgtSrcCount >= (srcShift[roleRequiredField[req.operational_role as OperationalRole]] ?? 1)) throw new Error('Source shift capacity full for counterpart.')
        // conflict checks excluding the registrations being swapped
        if (findRegistrationConflict(requester.id, tgtShift!, srcReg.id)) throw new Error('Requester would cause schedule conflict.')
        if (findRegistrationConflict(cpUser.id, srcShift, cpReg.id)) throw new Error('Counterpart would cause schedule conflict.')
        // also check same-shift duplicate
        if (shiftRegistrations.some(r=> r.shift_id===tgtShift!.id && r.user_id===requester.id && isStaffedRegistration(r) && r.id!==srcReg.id)) throw new Error('Requester already assigned to target.')
        if (shiftRegistrations.some(r=> r.shift_id===srcShift.id && r.user_id===cpUser.id && isStaffedRegistration(r) && r.id!==cpReg.id)) throw new Error('Counterpart already assigned to source.')
        const ts = nowIso()
        // cancel both old
        shiftRegistrations = shiftRegistrations.map(r=> (r.id===srcReg.id || r.id===cpReg.id) ? {...r, status:'cancelled' as const, cancelled_at: ts, updated_at: ts} : r)
        // create swapped
        shiftRegistrations.push(
          { id: generateId(), shift_id: tgtShift!.id, user_id: requester.id, operational_role: req.operational_role as OperationalRole, status: 'approved', source: 'manual_assignment', requested_at: ts, reviewed_by: approverId, reviewed_at: ts, created_at: ts, updated_at: ts },
          { id: generateId(), shift_id: srcShift.id, user_id: cpUser.id, operational_role: req.operational_role as OperationalRole, status: 'approved', source: 'manual_assignment', requested_at: ts, reviewed_by: approverId, reviewed_at: ts, created_at: ts, updated_at: ts },
        )
      } else {
        // replacement legacy same-shift
        const replacementId = req.replacement_staff_id || req.new_host_id || req.new_support_id || req.new_technical_id || req.counterpart_id
        if (!replacementId) throw new Error('Replacement staff was not selected.')
        const replacement = users.find(u=> u.id===replacementId)
        if (!replacement?.operational_roles?.includes(req.operational_role as OperationalRole)) throw new Error('Replacement staff is not eligible for this role.')
        if (replacement.status !== 'active' || replacement.archived_at || replacement.deleted_at) throw new Error('Replacement inactive.')
        if (findRegistrationConflict(replacementId, srcShift)) throw new Error('Replacement staff has a schedule conflict.')
        const ts = nowIso()
        // keep current proven target-first → source-cancel transaction for replacement to avoid false capacity
        // Check capacity excluding the source registrations that will be cancelled (all staffed for that role on that shift)
        const existingCount = shiftRegistrations.filter(r=> r.shift_id===srcShift.id && r.operational_role===req.operational_role && isStaffedRegistration(r) && r.id!==srcReg.id).length
        const required = srcShift[roleRequiredField[req.operational_role as OperationalRole]] ?? 1
        // For replacement, we are replacing within same shift, so capacity after cancel is same count, need to ensure replacement not already there
        if (shiftRegistrations.some(r=> r.shift_id===srcShift.id && r.user_id===replacementId && isStaffedRegistration(r))) throw new Error('Replacement already assigned to shift.')
        if (existingCount >= required) throw new Error('Source shift capacity full.')
        // target-first
        shiftRegistrations.push({ id: generateId(), shift_id: srcShift.id, user_id: replacementId, operational_role: req.operational_role as OperationalRole, status: 'approved', source: 'manual_assignment', requested_at: ts, reviewed_by: approverId, reviewed_at: ts, created_at: ts, updated_at: ts })
        shiftRegistrations = shiftRegistrations.map(r=> r.id===srcReg.id ? {...r, status:'cancelled' as const, cancelled_at: ts, updated_at: ts} : r)
        // also cancel other staffed of same role if replacement is same? Actually legacy cancels all staffed of that role? Keep simple: cancel source only (as per approved logic previously cancelled all staffed? But we want to preserve other assignments, so cancel only source)
      }
      const ts2 = nowIso()
      swapRequests[idx] = { ...req, status: 'completed', approved_by: approverId, approved_at: ts2, completed_at: ts2, updated_at: ts2, approval_history: [...(req.approval_history||[]), swapHistoryEntry(req, 'approved', approverId, req.status, 'approved'), swapHistoryEntry(req, 'completed', approverId, 'approved', 'completed')] }
      audit('swaps','approve','swap_request',req.id,`Swap · ${req.operational_role} · ${req.mode||'replacement'}`,{ actorId: approverId, before:{...req}, after:{...swapRequests[idx]} })
      return Promise.resolve(swapRequests[idx])
    } catch (e) {
      // rollback
      shiftRegistrations = snapshotRegs
      shifts = snapshotShifts.map(s=>({...s}))
      swapRequests = snapshotSwaps
      throw e
    }
  },
  async reject(id: string, approverId: string): Promise<SwapRequest | null> {
    if (getAuthMode() === 'supabase') {
      return getSupabaseSwapRequestRepository().reject(id)
    }
    const idx = swapRequests.findIndex(sr => sr.id === id)
    if (idx === -1) return Promise.resolve(null)
    const req = swapRequests[idx]
    if (!['pending','accepted'].includes(req.status)) throw new Error('Swap not pending.')
    if (!isCreatableSwapMode(req.mode)) throw new Error('Historical MOVE requests are read-only.')
    ensureLeaderOrAdmin(approverId)
    const before = { ...req }
    swapRequests[idx] = { ...req, status: 'rejected', approved_by: approverId, approved_at: nowIso(), updated_at: nowIso(), approval_history: [...(req.approval_history||[]), swapHistoryEntry(req, 'rejected', approverId, req.status, 'rejected')] }
    audit('swaps','reject','swap_request',id,`Swap · ${req.operational_role||'host'} · ${req.mode||'replacement'}`,{ actorId: approverId, before, after:{...swapRequests[idx]} })
    return Promise.resolve(swapRequests[idx])
  },
  async cancel(id: string, actorId: string, reason: string): Promise<SwapRequest | null> {
    if (getAuthMode() === 'supabase') return getSupabaseSwapRequestRepository().cancel(id, reason)
    const idx = swapRequests.findIndex(request => request.id === id)
    if (idx === -1) return null
    const req = swapRequests[idx]
    if (!['pending','accepted'].includes(req.status)) throw new Error('Only pending/accepted swap requests can be cancelled.')
    if (!isCreatableSwapMode(req.mode)) throw new Error('Historical MOVE requests are read-only.')
    if (req.requester_id !== actorId) throw new Error('You can only cancel your own swap request.')
    const before={...req}
    swapRequests[idx] = { ...req, status: 'cancelled', deleted_at: nowIso(), deleted_by: actorId, deletion_reason: reason, updated_at: nowIso(), approval_history:[...(req.approval_history||[]), swapHistoryEntry(req, 'cancelled', actorId, req.status, 'cancelled', reason)] }
    audit('swaps','soft_delete','swap_request',id,`Swap · ${req.operational_role||'host'} · ${req.mode||'replacement'}`,{ actorId, before, after:{...swapRequests[idx]}, reason })
    return swapRequests[idx]
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
    summary: Pick<ScheduleImportBatch, 'total_rows' | 'valid_rows' | 'invalid_rows' | 'warning_rows' | 'duplicate_rows'>,
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
    summary: Pick<ScheduleImportBatch, 'total_rows' | 'valid_rows' | 'invalid_rows' | 'warning_rows' | 'duplicate_rows'>,
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
    const archivedShifts = getAuthMode() === 'supabase'
      ? (await getSupabaseShiftRepository().getArchivedShifts())
      : shifts.filter(item => item.deleted_at)
    const archivedReports = getAuthMode() === 'supabase'
      ? (await getSupabaseReportRepository().getAllIncludingArchived())
      : [...reports]
    const summaries: ArchivedEntitySummary[] = [
      ...archivedShifts.map(item => ({ entity_type: 'shift' as const, entity_id: item.id, entity_name: item.title || `${item.date} ${item.start_time}`, archived_at: item.deleted_at!, archived_by: item.deleted_by, reason: item.deletion_reason })),
      ...archivedReports.filter(item => item.deleted_at || item.archived_at).map(item => ({ entity_type: 'report' as const, entity_id: item.id, entity_name: `Report · ${item.shift_id}`, archived_at: item.deleted_at || item.archived_at!, archived_by: item.deleted_by || item.archived_by, reason: item.deletion_reason })),
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
    const today = businessLocalDate()
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
