import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
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
  'storage_profile', 'root_folder_id', 'base_folder_id', 'folder_labels', 'period_naming_style', 'active',
].join(',')

export type ResolveOperationalStoragePlacementInput = OperationalStoragePlacementInput

export interface OperationalStorageRouteRepository {
  resolvePlacement(input: ResolveOperationalStoragePlacementInput): Promise<OperationalStoragePlacement>
}

interface OperationalStorageRouteRepositoryOptions {
  client?: SupabaseClient
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

      return resolveOperationalStoragePlacement(route, input)
    },
  }
}
