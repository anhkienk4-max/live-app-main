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

/**
 * Legacy Dashboard/Visibility/DATA paths continue to resolve using their exact
 * existing provider route. However, V2 categories must not create an unapproved
 * ADA_STORAGE_V2 namespace in LIVESTREAM REPORT (which is already the ADA root),
 * or write across a shared legacy brand folder. The operator must first approve
 * an explicit, compatible V2 route. Fail closed until that mapping exists.
 */
export function resolveOperationalFilePlacement(
  base: OperationalStoragePlacement,
  category: OperationalFileCategory,
  _context?: Pick<OperationalStoragePlacementInput, 'brandId' | 'platformId' | 'executionSource'>,
): OperationalStoragePlacement {
  if (legacyProfiles.has(base.storageProfile)) {
    throw new OperationalStoragePlacementError('STORAGE_CATEGORY_NOT_CONFIGURED')
  }

  if (base.storageProfile !== 'CANONICAL_V1'
    && base.storageProfile !== 'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
    && base.storageProfile !== 'TEMP_AGENCY_BRAND_PERIOD_CATEGORY') {
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
