import type { OperationalStoragePlacement, OperationalStoragePlacementInput } from '@/lib/files/operationalStoragePlacementResolver'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import { operationalFileSegments, type OperationalFileCategory } from '@/lib/files/operationalFileCatalog'

const legacyProfiles = new Set([
  'LEGACY_CATEGORY_PERIOD',
  'LEGACY_PLATFORM_CATEGORY_PERIOD',
  'LEGACY_PERIOD_CATEGORY',
  'LEGACY_SUBBRAND_PERIOD_CATEGORY',
  'LEGACY_SUBBRAND_CATEGORY_PERIOD',
])

function safeScopePart(value: string | null): string {
  if (!value || !/^[A-Za-z0-9_-]{1,120}$/u.test(value)) {
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
  return value
}

/**
 * V2 on legacy routes must NEVER append categories inside a legacy data-source
 * tree. Those trees can use shared base folders or different category/month order.
 * Instead create a distinct, ID-partitioned namespace beneath the verified Drive
 * root, while legacy Dashboard/Visibility/DATA placement remains unchanged.
 */
export function resolveOperationalFilePlacement(
  base: OperationalStoragePlacement,
  category: OperationalFileCategory,
  context?: Pick<OperationalStoragePlacementInput, 'brandId' | 'platformId' | 'executionSource'>,
): OperationalStoragePlacement {
  if (legacyProfiles.has(base.storageProfile)) {
    if (!context || !base.rootFolderId || !base.periodLabel) {
      throw new OperationalStoragePlacementError('STORAGE_CATEGORY_NOT_CONFIGURED')
    }
    const segments = [
      'ADA_STORAGE_V2', safeScopePart(context.brandId),
      safeScopePart(context.platformId), context.executionSource.toUpperCase(),
      base.periodLabel, ...operationalFileSegments(category),
    ]
    if (!['INTERNAL', 'AGENCY'].includes(segments[3])) {
      throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
    }
    return {
      ...base,
      baseFolderId: base.rootFolderId,
      folderSegments: segments,
      folderPath: segments.join('/'),
    }
  }

  if (base.storageProfile !== 'CANONICAL_V1' && base.storageProfile !== 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY') {
    throw new OperationalStoragePlacementError('STORAGE_CATEGORY_NOT_CONFIGURED')
  }
  if (base.logicalCategory !== 'data_source' ||
      base.folderSegments.slice(-2).join('/') !== 'DATA/SOURCE') {
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
  const folderSegments = [...base.folderSegments.slice(0, -2), ...operationalFileSegments(category)]
  return { ...base, folderSegments, folderPath: folderSegments.join('/') }
}

export function toOperationalFileRouteInput(input: Omit<OperationalStoragePlacementInput, 'logicalCategory'>): OperationalStoragePlacementInput {
  return { ...input, logicalCategory: 'data_source' }
}
