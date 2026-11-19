import 'server-only'

import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'

export type OperationalStorageRoutingMode = 'database' | 'compat' | 'domain_first'

export function resolveOperationalStorageRoutingMode(
  value = process.env.OPERATIONAL_STORAGE_ROUTING_MODE,
): OperationalStorageRoutingMode {
  if (value === undefined || value === '' || value === 'database') return 'database'
  if (value === 'compat') return 'compat'
  if (value === 'domain_first') return 'domain_first'
  throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
}
