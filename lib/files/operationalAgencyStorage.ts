import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'

/**
 * Owner-confirmed business mapping. The agency is read from the persisted Shift,
 * never inferred from brand, studio, a user-supplied folder name or the upload.
 *
 * New domain-first writes must never silently fall back to SNAP or a shared brand
 * folder when the Shift lacks a verified operating unit.
 */
export function agencyReportFolderSegments(
  agencyCode: unknown,
  executionSource: unknown,
): string[] {
  if (agencyCode === 'ada' && executionSource === 'internal') return []
  if (agencyCode === 'snap' && executionSource === 'agency') return ['EXTERNAL', 'SNAP']
  if (agencyCode === 'live_ai' && executionSource === 'agency') return ['EXTERNAL', 'AI']

  if (agencyCode === null || agencyCode === undefined || executionSource === null || executionSource === undefined) {
    throw new OperationalStoragePlacementError('STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  }
  throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
}
