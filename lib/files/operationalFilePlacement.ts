import type { OperationalStoragePlacement, OperationalStoragePlacementInput } from '@/lib/files/operationalStoragePlacementResolver'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import { operationalFileSegments, type OperationalFileCategory } from '@/lib/files/operationalFileCatalog'

/** V2 never rewrites legacy folders. Reuses exact canonical route, replaces DATA/SOURCE only. */
export function resolveOperationalFilePlacement(
  base: OperationalStoragePlacement,
  category: OperationalFileCategory,
): OperationalStoragePlacement {
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
