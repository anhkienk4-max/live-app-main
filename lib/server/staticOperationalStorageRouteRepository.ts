import 'server-only'

import { z } from 'zod'
import {
  OperationalStoragePlacementError,
  resolveOperationalStoragePlacement,
  selectOperationalStorageRoute,
  type OperationalStoragePlacementInput,
  type OperationalStorageRoute,
} from '@/lib/files/operationalStoragePlacementResolver'
import type { OperationalStorageRouteRepository } from '@/lib/server/operationalStorageRouteRepository'

const label = z.string().trim().min(1).max(200)
const folderLabels = z.object({
  dashboard: label.optional(),
  live_visual_internal: label.optional(),
  live_visual_agency: label.optional(),
  data_report: z.array(label).min(1).optional(),
  data_source: z.array(label).min(1).optional(),
  subbrand: label.optional(),
}).strict()
const staticRoute = z.object({
  provider: z.enum(['google_drive', 'onedrive']),
  execution_source: z.enum(['internal', 'agency']),
  brand: label,
  platform: label.nullable().optional(),
  subbrand_key: label.nullable().optional(),
  storage_profile: z.enum([
    'LEGACY_CATEGORY_PERIOD',
    'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD',
    'CANONICAL_V1',
  ]),
  root_folder_id: label,
  base_folder_id: label,
  folder_labels: folderLabels,
  period_naming_style: z.enum([
    'THANG_M_DASH_YEAR',
    'THANG_M_DOT_YEAR',
    'THANG_M_DOT_SPACE_YEAR',
    'T_M_DOT_YEAR',
  ]),
  active: z.boolean(),
}).strict()

export function normalizeOperationalStorageRouteLabel(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')
}

export function parseStaticOperationalStorageRoutes(value: string | undefined): OperationalStorageRoute[] {
  if (!value?.trim()) throw new OperationalStoragePlacementError('STORAGE_ROUTE_NOT_CONFIGURED')
  try {
    const parsed = z.array(staticRoute).min(1).parse(JSON.parse(value))
    const routes = parsed.map((route, index): OperationalStorageRoute => ({
      id: `compat-route-${index + 1}`,
      provider: route.provider,
      execution_source: route.execution_source,
      brand_id: normalizeOperationalStorageRouteLabel(route.brand),
      platform_id: route.platform ? normalizeOperationalStorageRouteLabel(route.platform) : null,
      subbrand_key: route.subbrand_key ? normalizeOperationalStorageRouteLabel(route.subbrand_key) : null,
      storage_profile: route.storage_profile,
      root_folder_id: route.root_folder_id,
      base_folder_id: route.base_folder_id,
      folder_labels: route.folder_labels,
      period_naming_style: route.period_naming_style,
      active: route.active,
    }))
    const keys = new Set<string>()
    for (const route of routes) {
      const key = JSON.stringify([
        route.provider, route.execution_source, route.brand_id, route.platform_id, route.subbrand_key,
      ])
      if (keys.has(key)) throw new OperationalStoragePlacementError('STORAGE_ROUTE_AMBIGUOUS')
      keys.add(key)
    }
    return routes
  } catch (error) {
    if (error instanceof OperationalStoragePlacementError) throw error
    throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
  }
}

export function createStaticOperationalStorageRouteRepository(
  value = process.env.OPERATIONAL_STORAGE_STATIC_ROUTES_JSON,
): OperationalStorageRouteRepository {
  let routes: OperationalStorageRoute[] | undefined
  return {
    async resolvePlacement(input: OperationalStoragePlacementInput) {
      if (!input.brandLabel) throw new OperationalStoragePlacementError('STORAGE_ROUTE_CONFIG_INVALID')
      routes ??= parseStaticOperationalStorageRoutes(value)
      const normalizedInput = {
        ...input,
        brandId: normalizeOperationalStorageRouteLabel(input.brandLabel),
        platformId: input.platformLabel ? normalizeOperationalStorageRouteLabel(input.platformLabel) : null,
        subbrandKey: input.subbrandKey ? normalizeOperationalStorageRouteLabel(input.subbrandKey) : null,
      }
      const route = selectOperationalStorageRoute(routes, normalizedInput)
      return resolveOperationalStoragePlacement(route, normalizedInput)
    },
  }
}
