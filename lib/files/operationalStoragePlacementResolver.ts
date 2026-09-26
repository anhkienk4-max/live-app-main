import { sanitizeFileName } from '@/lib/files/fileValidation'

export type OperationalStorageProvider = 'google_drive' | 'onedrive'
export type OperationalExecutionSource = 'internal' | 'agency'
export type OperationalStorageProfile =
  | 'LEGACY_CATEGORY_PERIOD'
  | 'LEGACY_PLATFORM_CATEGORY_PERIOD'
  | 'LEGACY_PERIOD_CATEGORY'
  | 'LEGACY_SUBBRAND_PERIOD_CATEGORY'
  | 'LEGACY_SUBBRAND_CATEGORY_PERIOD'
  | 'CANONICAL_V1'
export type OperationalLogicalCategory = 'dashboard' | 'live_visual' | 'data_report' | 'data_source'
export type OperationalPeriodNamingStyle =
  | 'THANG_M_DASH_YEAR'
  | 'THANG_M_DOT_YEAR'
  | 'THANG_M_DOT_SPACE_YEAR'
  | 'T_M_DOT_YEAR'

export interface OperationalStorageRoute {
  id: string
  provider: OperationalStorageProvider
  execution_source: OperationalExecutionSource
  brand_id: string
  platform_id: string | null
  subbrand_key: string | null
  storage_profile: string
  root_folder_id: string
  base_folder_id: string
  folder_labels: Record<string, unknown>
  period_naming_style: string
  active: boolean
}

export interface OperationalStorageRouteKey {
  provider: OperationalStorageProvider
  executionSource: OperationalExecutionSource
  brandId: string
  platformId: string | null
  subbrandKey: string | null
}

export interface OperationalStoragePlacementInput extends OperationalStorageRouteKey {
  shiftDate: string
  logicalCategory: OperationalLogicalCategory
  fileName: string
  brandLabel?: string
  platformLabel?: string
}

export interface OperationalStoragePlacement {
  provider: OperationalStorageProvider
  storageProfile: OperationalStorageProfile
  /** Provider root ID; for canonical placements, this anchors the full brand tree. */
  rootFolderId: string
  /** Parent of folderSegments: provider root for canonical, existing profile base for legacy. */
  baseFolderId: string
  /** Path segments relative to baseFolderId; never includes fileName or the base folder itself. */
  folderSegments: string[]
  /** folderSegments joined with '/'; always relative to baseFolderId. */
  folderPath: string
  fileName: string
  logicalCategory: OperationalLogicalCategory
  periodLabel: string
}

export type OperationalStoragePlacementErrorCode =
  | 'STORAGE_ROUTE_AMBIGUOUS'
  | 'STORAGE_ROUTE_NOT_CONFIGURED'
  | 'CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED'
  | 'STORAGE_ROUTE_PROFILE_UNSUPPORTED'
  | 'STORAGE_ROUTE_CONFIG_INVALID'
  | 'STORAGE_ROUTE_LOOKUP_FAILED'
  | 'STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED'
  | 'STORAGE_CATEGORY_UNSUPPORTED'
  | 'STORAGE_CATEGORY_NOT_CONFIGURED'
  | 'STORAGE_DATE_INVALID'
  | 'STORAGE_FILE_NAME_INVALID'

export class OperationalStoragePlacementError extends Error {
  constructor(readonly code: OperationalStoragePlacementErrorCode) {
    super(code)
    this.name = 'OperationalStoragePlacementError'
  }
}

const profiles = new Set<OperationalStorageProfile>([
  'LEGACY_CATEGORY_PERIOD',
  'LEGACY_PLATFORM_CATEGORY_PERIOD',
  'LEGACY_PERIOD_CATEGORY',
  'LEGACY_SUBBRAND_PERIOD_CATEGORY',
  'LEGACY_SUBBRAND_CATEGORY_PERIOD',
  'CANONICAL_V1',
])

const categories = new Set<OperationalLogicalCategory>(['dashboard', 'live_visual', 'data_report', 'data_source'])

function fail(code: OperationalStoragePlacementErrorCode): never {
  throw new OperationalStoragePlacementError(code)
}

function isSafeFolderSegment(value: string): boolean {
  return value.length > 0
    && value === value.trim()
    && value !== '.'
    && value !== '..'
    && !value.includes('..')
    && !/[\\/\u0000-\u001f\u007f]/u.test(value)
}

function safeSegment(value: unknown): string {
  if (typeof value !== 'string' || !isSafeFolderSegment(value)) fail('STORAGE_ROUTE_CONFIG_INVALID')
  return value
}

function requiredFolderId(value: string): string {
  if (!value || !value.trim() || value !== value.trim()) fail('STORAGE_ROUTE_CONFIG_INVALID')
  return value
}

function safeSegments(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) fail('STORAGE_ROUTE_CONFIG_INVALID')
  return value.map(safeSegment)
}

function dateParts(shiftDate: string): { year: string; month: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(shiftDate)
  if (!match) fail('STORAGE_DATE_INVALID')
  const [, year, monthText, dayText] = match
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(Number(year), month - 1, day))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    fail('STORAGE_DATE_INVALID')
  }
  return { year, month }
}

function periodLabel(style: string, shiftDate: string, profile: OperationalStorageProfile): string {
  const { year, month } = dateParts(shiftDate)
  if (profile === 'CANONICAL_V1') return `THÁNG ${String(month).padStart(2, '0')}.${year}`

  const monthText = String(month)
  switch (style) {
    case 'THANG_M_DASH_YEAR': return `Tháng ${monthText} - ${year}`
    case 'THANG_M_DOT_YEAR': return `THÁNG ${monthText}.${year}`
    case 'THANG_M_DOT_SPACE_YEAR': return `THÁNG ${monthText}. ${year}`
    case 'T_M_DOT_YEAR': return `T${monthText}.${year}`
    default: return fail('STORAGE_ROUTE_CONFIG_INVALID')
  }
}

function configuredCategorySegments(
  route: OperationalStorageRoute,
  category: OperationalLogicalCategory,
  source: OperationalExecutionSource,
  profile: OperationalStorageProfile,
): string[] {
  if (!categories.has(category)) fail('STORAGE_CATEGORY_UNSUPPORTED')

  if (profile === 'CANONICAL_V1') {
    if (category === 'dashboard') return ['DASHBOARD']
    if (category === 'live_visual') return [source === 'internal' ? 'VISIBILITY' : 'VISUAL HOST']
    if (category === 'data_report') return ['DATA', 'REPORT']
    return ['DATA', 'SOURCE']
  }

  const labels = route.folder_labels
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) fail('STORAGE_ROUTE_CONFIG_INVALID')

  const key = category === 'dashboard'
    ? 'dashboard'
    : category === 'live_visual'
      ? source === 'internal' ? 'live_visual_internal' : 'live_visual_agency'
      : category
  const configured = labels[key]
  if (configured === undefined || configured === null
    || (typeof configured === 'string' && configured.trim().length === 0)
    || (Array.isArray(configured) && configured.length === 0)) {
    fail('STORAGE_CATEGORY_NOT_CONFIGURED')
  }

  return category === 'data_report' || category === 'data_source'
    ? safeSegments(configured)
    : [safeSegment(configured)]
}

function exactRouteKey(route: OperationalStorageRoute, input: OperationalStorageRouteKey): boolean {
  return route.active === true
    && route.provider === input.provider
    && route.execution_source === input.executionSource
    && route.brand_id === input.brandId
    && (route.platform_id === null || route.platform_id === input.platformId)
    && (route.subbrand_key === null || route.subbrand_key === input.subbrandKey)
}

/** Selects only exact-ID route candidates; ties fail closed instead of relying on DB order. */
export function selectOperationalStorageRoute(
  routes: readonly OperationalStorageRoute[],
  input: OperationalStorageRouteKey,
): OperationalStorageRoute {
  const eligible = routes.filter(route => exactRouteKey(route, input))
  if (eligible.length === 0) fail('STORAGE_ROUTE_NOT_CONFIGURED')

  const score = (route: OperationalStorageRoute) => Number(route.platform_id !== null) + Number(route.subbrand_key !== null)
  const highest = Math.max(...eligible.map(score))
  const best = eligible.filter(route => score(route) === highest)
  if (best.length !== 1) fail('STORAGE_ROUTE_AMBIGUOUS')
  return best[0]
}

/** Pure placement planning. Folder segments are separate from the sanitized filename. */
export function resolveOperationalStoragePlacement(
  route: OperationalStorageRoute,
  input: OperationalStoragePlacementInput,
): OperationalStoragePlacement {
  if (!profiles.has(route.storage_profile as OperationalStorageProfile)) fail('STORAGE_ROUTE_PROFILE_UNSUPPORTED')
  const profile = route.storage_profile as OperationalStorageProfile
  const rootFolderId = requiredFolderId(route.root_folder_id)
  const baseFolderId = profile === 'CANONICAL_V1'
    ? rootFolderId
    : requiredFolderId(route.base_folder_id)

  const period = periodLabel(route.period_naming_style, input.shiftDate, profile)
  const category = configuredCategorySegments(route, input.logicalCategory, input.executionSource, profile)
  let folderSegments: string[]

  switch (profile) {
    case 'LEGACY_CATEGORY_PERIOD':
      folderSegments = [...category, period]
      break
    case 'LEGACY_PLATFORM_CATEGORY_PERIOD':
      if (!input.platformLabel) fail('STORAGE_ROUTE_CONFIG_INVALID')
      folderSegments = [safeSegment(input.platformLabel), ...category, period]
      break
    case 'LEGACY_PERIOD_CATEGORY':
      folderSegments = [period, ...category]
      break
    case 'LEGACY_SUBBRAND_PERIOD_CATEGORY':
    case 'LEGACY_SUBBRAND_CATEGORY_PERIOD': {
      if (!route.subbrand_key) fail('STORAGE_ROUTE_CONFIG_INVALID')
      const subbrand = safeSegment(route.folder_labels.subbrand)
      folderSegments = profile === 'LEGACY_SUBBRAND_PERIOD_CATEGORY'
        ? [subbrand, period, ...category]
        : [subbrand, ...category, period]
      break
    }
    case 'CANONICAL_V1':
      if (!input.brandLabel || !input.platformLabel) fail('STORAGE_ROUTE_CONFIG_INVALID')
      folderSegments = [safeSegment(input.brandLabel), safeSegment(input.platformLabel), period, ...category]
      break
  }

  const fileName = input.fileName.trim() ? sanitizeFileName(input.fileName) : ''
  if (!fileName || fileName === 'unnamed-file') fail('STORAGE_FILE_NAME_INVALID')

  return {
    provider: route.provider,
    storageProfile: profile,
    rootFolderId,
    baseFolderId,
    folderSegments,
    folderPath: folderSegments.join('/'),
    fileName,
    logicalCategory: input.logicalCategory,
    periodLabel: period,
  }
}

export function noRouteErrorForBrand(storageProfile: unknown): OperationalStoragePlacementError {
  return new OperationalStoragePlacementError(
    storageProfile === 'CANONICAL_V1'
      ? 'CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED'
      : 'STORAGE_ROUTE_NOT_CONFIGURED',
  )
}
