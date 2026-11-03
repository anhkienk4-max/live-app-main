import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { sanitizeFileName } from '@/lib/files/fileValidation'
import { agencyReportFolderSegments } from '@/lib/files/operationalAgencyStorage'
import type { OperationalFileCategory } from '@/lib/files/operationalFileCatalog'
import {
  ADA_OPS_REPORT_ROOT_ID,
  domainFolderAncestors,
  domainFolderForCategory,
  domainFolderForPath,
  domainFolderForReportGroup,
  reportArtifactGroupFolder,
  type ReportArtifactGroup,
} from '@/lib/files/operationalStorageDomainMap'
import {
  noRouteErrorForBrand,
  OperationalStoragePlacementError,
  resolveOperationalStoragePlacement,
  selectOperationalStorageRoute,
  type OperationalStoragePlacement,
  type OperationalStoragePlacementInput,
  type OperationalStorageRoute,
  type OperationalStorageRouteKey,
} from '@/lib/files/operationalStoragePlacementResolver'

const routeColumns = [
  'id', 'provider', 'execution_source', 'brand_id', 'platform_id', 'subbrand_key',
  'storage_profile', 'root_folder_id', 'base_folder_id', 'folder_labels', 'period_naming_style',
  'period_label_overrides', 'period_date_ranges', 'folder_label_overrides', 'active',
].join(',')

export type ResolveOperationalStoragePlacementInput = OperationalStoragePlacementInput

export interface OperationalStorageRouteRepository {
  resolvePlacement(input: ResolveOperationalStoragePlacementInput): Promise<OperationalStoragePlacement>
}

interface OperationalStorageRouteRepositoryOptions {
  client?: SupabaseClient
}

export interface OperationalStorageDomainRouteRepository {
  resolveDomainCategoryPlacement(category: OperationalFileCategory, fileName: string): Promise<OperationalStoragePlacement>
  resolveReportArtifactGroupPlacement(input: {
    group: ReportArtifactGroup
    shiftId: string
    shiftDate: string
    brandId: string
    platformId: string | null
    /** Trusted persisted Shift agency; never selected by the upload caller. */
    agencyCode: string | null
    executionSource: 'internal' | 'agency' | null
    fileName: string
  }): Promise<OperationalStoragePlacement>
}

function routeKey(input: OperationalStorageRouteKey) {
  return {
    provider: input.provider,
    execution_source: input.executionSource,
    brand_id: input.brandId,
    platform_id: input.platformId,
    subbrand_key: input.subbrandKey,
  }
}

/** Read-only server repository. It deliberately exposes no route mutation methods. */
export function createOperationalStorageRouteRepository(
  options: OperationalStorageRouteRepositoryOptions = {},
): OperationalStorageRouteRepository {
  const client = options.client ?? createSupabaseAdminClient()

  return {
    async resolvePlacement(input) {
      const key = routeKey(input)
      const { data: routes, error: routeError } = await client
        .from('operational_storage_routes')
        .select(routeColumns)
        .eq('provider', key.provider)
        .eq('execution_source', key.execution_source)
        .eq('brand_id', key.brand_id)
        .eq('active', true)

      if (routeError) throw new OperationalStoragePlacementError('STORAGE_ROUTE_LOOKUP_FAILED')

      let route: OperationalStorageRoute
      try {
        route = selectOperationalStorageRoute((routes ?? []) as unknown as OperationalStorageRoute[], input)
      } catch (error) {
        if (!(error instanceof OperationalStoragePlacementError) || error.code !== 'STORAGE_ROUTE_NOT_CONFIGURED') throw error
        const { data: brand, error: brandError } = await client
          .from('brands')
          .select('storage_profile')
          .eq('id', input.brandId)
          .maybeSingle()
        if (brandError) throw new OperationalStoragePlacementError('STORAGE_ROUTE_LOOKUP_FAILED')
        throw noRouteErrorForBrand((brand as { storage_profile?: unknown } | null)?.storage_profile)
      }

      let placementInput = input
      if (route.storage_profile === 'CANONICAL_V1' && (!input.brandLabel || !input.platformLabel)) {
        if (!input.platformId) throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
        const [brandResult, platformResult] = await Promise.all([
          input.brandLabel ? Promise.resolve({ data: { name: input.brandLabel }, error: null }) : client
            .from('brands').select('name').eq('id', input.brandId).maybeSingle(),
          input.platformLabel ? Promise.resolve({ data: { name: input.platformLabel }, error: null }) : client
            .from('platforms').select('name').eq('id', input.platformId).maybeSingle(),
        ])
        if (brandResult.error || platformResult.error) throw new OperationalStoragePlacementError('STORAGE_ROUTE_LOOKUP_FAILED')
        const brandLabel = (brandResult.data as { name?: unknown } | null)?.name
        const platformLabel = (platformResult.data as { name?: unknown } | null)?.name
        if (typeof brandLabel !== 'string' || typeof platformLabel !== 'string') {
          throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
        }
        placementInput = { ...input, brandLabel, platformLabel }
      }
      return resolveOperationalStoragePlacement(route, placementInput)
    },
  }
}

function failClosed(): never {
  throw new OperationalStoragePlacementError('STORAGE_CATEGORY_NOT_CONFIGURED')
}

function safeScopeSegment(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
  return value
}

function dateParts(value: string): { year: string; month: string; compactDate: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match) throw new OperationalStoragePlacementError('STORAGE_DATE_INVALID')
  const date = new Date(value + 'T00:00:00.000Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new OperationalStoragePlacementError('STORAGE_DATE_INVALID')
  }
  return { year: match[1], month: match[2], compactDate: match[1] + match[2] + match[3] }
}

/** Domain destinations are read-only DB routes backed by the checked-in 93-folder manifest. */
export function createOperationalStorageDomainRouteRepository(
  options: OperationalStorageRouteRepositoryOptions = {},
): OperationalStorageDomainRouteRepository {
  const client = options.client ?? createSupabaseAdminClient()

  async function verifyRegistryPath(path: string) {
    const expectedPaths = domainFolderAncestors(path)
    const result = await client.from('operational_storage_domain_folders')
      .select('folder_path,folder_id,parent_folder_id,access_classification,active,verified_created')
      .in('folder_path', expectedPaths)
    if (result.error) throw new OperationalStoragePlacementError('STORAGE_ROUTE_LOOKUP_FAILED')
    const rows = new Map(((result.data ?? []) as Array<Record<string, unknown>>)
      .map(row => [String(row.folder_path), row]))
    const classifications: string[] = []
    for (const expectedPath of expectedPaths) {
      const expected = domainFolderForPath(expectedPath)
      const row = rows.get(expectedPath)
      if (!row || row.folder_id !== expected.folderId || row.parent_folder_id !== expected.parentFolderId
        || row.active !== true || row.verified_created !== true) {
        failClosed()
      }
      const classification = row.access_classification
      if (typeof classification !== 'string' || ![
        'shared', 'pending_restriction_no_sensitive_upload', 'shared_schema_template_only',
        'restricted_pending_app_acl_verification', 'restricted_verified',
      ].includes(classification)) failClosed()
      classifications.push(classification)
    }
    const accessClassification = classifications.includes('shared_schema_template_only')
      ? 'shared_schema_template_only'
      : classifications.every(value => value === 'restricted_verified')
        ? 'restricted_verified'
        : classifications.includes('restricted_pending_app_acl_verification')
          ? 'restricted_pending_app_acl_verification'
        : classifications.includes('pending_restriction_no_sensitive_upload')
          ? 'pending_restriction_no_sensitive_upload'
          : 'shared'
    return { ...domainFolderForPath(path), accessClassification }
  }

  return {
    async resolveDomainCategoryPlacement(category, fileName) {
      const route = domainFolderForCategory(category)
      const folder = await verifyRegistryPath(route.path)
      if (folder.folderId !== route.folderId) {
        throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      }
      return {
        provider: 'google_drive',
        storageProfile: 'DOMAIN_CATEGORY_FOLDER',
        rootFolderId: route.rootFolderId,
        baseFolderId: route.folderId,
        folderSegments: [],
        folderPath: route.path,
        expectedBaseParentId: route.parentFolderId,
        accessClassification: folder.accessClassification,
        sensitive: route.sensitive,
        fileName: sanitizeFileName(fileName),
        logicalCategory: 'data_source',
        periodLabel: '',
      }
    },

    async resolveReportArtifactGroupPlacement(input) {
      const route = domainFolderForReportGroup(input.group)
      const folder = await verifyRegistryPath(route.path)
      if (folder.folderId !== ADA_OPS_REPORT_ROOT_ID || !input.platformId) {
        throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      }
      const agencySegments = agencyReportFolderSegments(input.agencyCode, input.executionSource)
      const { year, month, compactDate } = dateParts(input.shiftDate)
      const shiftFolder = 'SHIFT_' + compactDate + '__' + safeScopeSegment(input.shiftId)
      const folderSegments = [
        ...agencySegments,
        safeScopeSegment(input.brandId),
        safeScopeSegment(input.platformId),
        year,
        month,
        shiftFolder,
        reportArtifactGroupFolder(input.group),
      ]
      return {
        provider: 'google_drive',
        storageProfile: 'REPORT_ARTIFACT_GROUP',
        rootFolderId: route.rootFolderId,
        baseFolderId: route.folderId,
        folderSegments,
        folderPath: folderSegments.join('/'),
        expectedBaseParentId: route.parentFolderId,
        accessClassification: folder.accessClassification,
        sensitive: route.sensitive,
        fileName: sanitizeFileName(input.fileName),
        logicalCategory: 'data_report',
        periodLabel: month + '/' + year,
      }
    },
  }
}
