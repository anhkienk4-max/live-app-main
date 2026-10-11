import test from 'node:test'
import assert from 'node:assert/strict'
import type { OperationalStorageRoute } from '@/lib/files/operationalStoragePlacementResolver'
import {
  selectOperationalStorageRoute,
  OperationalStoragePlacementError,
} from '@/lib/files/operationalStoragePlacementResolver'

const baseRoute: OperationalStorageRoute = {
  id: 'base-route',
  provider: 'google_drive',
  execution_source: 'internal',
  brand_id: 'brand-a',
  platform_id: null,
  subbrand_key: null,
  storage_profile: 'CANONICAL_V1',
  root_folder_id: 'root-folder-id',
  base_folder_id: 'root-folder-id',
  folder_labels: {},
  period_naming_style: 'THANG_MM_DOT_YEAR',
  active: true,
}

function makeRoute(overrides: Partial<OperationalStorageRoute>): OperationalStorageRoute {
  return { ...baseRoute, ...overrides }
}

function assertCode(code: string, fn: () => unknown): void {
  let thrown: unknown
  try {
    fn()
  } catch (err) {
    thrown = err
  }
  assert.ok(
    thrown instanceof OperationalStoragePlacementError && thrown.code === code,
    `Expected error code ${code}, but got: ${String(thrown)}`,
  )
}

test('H.4 Matrix Case 1: Exact Brand + Platform + Subbrand match', () => {
  const exact = makeRoute({
    id: 'route-exact',
    platform_id: 'platform-shopee',
    subbrand_key: 'subbrand-xmen',
  })
  const other = makeRoute({
    id: 'route-other',
    platform_id: 'platform-tiktok',
    subbrand_key: 'subbrand-xmen',
  })

  const selected = selectOperationalStorageRoute([exact, other], {
    provider: 'google_drive',
    executionSource: 'internal',
    brandId: 'brand-a',
    platformId: 'platform-shopee',
    subbrandKey: 'subbrand-xmen',
  })
  assert.equal(selected.id, 'route-exact')
})

test('H.4 Matrix Case 2: Brand + Platform, without Subbrand (subbrandKey: null)', () => {
  const platformRoute = makeRoute({
    id: 'route-platform-no-subbrand',
    platform_id: 'platform-tiktok',
    subbrand_key: null,
  })
  const subbrandRoute = makeRoute({
    id: 'route-subbrand',
    platform_id: 'platform-tiktok',
    subbrand_key: 'subbrand-special',
  })

  const selected = selectOperationalStorageRoute([platformRoute, subbrandRoute], {
    provider: 'google_drive',
    executionSource: 'internal',
    brandId: 'brand-a',
    platformId: 'platform-tiktok',
    subbrandKey: null,
  })
  assert.equal(selected.id, 'route-platform-no-subbrand')
})

test('H.4 Matrix Case 3: NULL Platform vs Specific Platform isolation', () => {
  // Case 3a: Input has NULL platform; candidate with specific platform MUST NOT match
  const specificPlatRoute = makeRoute({
    id: 'route-specific-plat',
    platform_id: 'platform-shopee',
    subbrand_key: null,
  })
  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => {
    selectOperationalStorageRoute([specificPlatRoute], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: null,
      subbrandKey: null,
    })
  })

  // Case 3b: Specific platform route beats broader NULL platform route
  const broadPlatRoute = makeRoute({
    id: 'route-broad-plat',
    platform_id: null,
    subbrand_key: null,
  })
  const chosen = selectOperationalStorageRoute([broadPlatRoute, specificPlatRoute], {
    provider: 'google_drive',
    executionSource: 'internal',
    brandId: 'brand-a',
    platformId: 'platform-shopee',
    subbrandKey: null,
  })
  assert.equal(chosen.id, 'route-specific-plat')
})

test('H.4 Matrix Case 4: NULL Subbrand vs Specific Subbrand isolation', () => {
  // Case 4a: Specific subbrand input MUST NEVER fall back to NULL subbrand route
  const genericRoute = makeRoute({
    id: 'route-generic-null-subbrand',
    platform_id: 'platform-tiktok',
    subbrand_key: null,
  })
  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => {
    selectOperationalStorageRoute([genericRoute], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: 'platform-tiktok',
      subbrandKey: 'subbrand-gold',
    })
  })

  // Case 4b: NULL subbrand input MUST NEVER route into specific subbrand route
  const specificSubbrandRoute = makeRoute({
    id: 'route-specific-subbrand',
    platform_id: 'platform-tiktok',
    subbrand_key: 'subbrand-gold',
  })
  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => {
    selectOperationalStorageRoute([specificSubbrandRoute], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: 'platform-tiktok',
      subbrandKey: null,
    })
  })
})

test('H.4 Matrix Case 5: Multiple matching routes with equal specificity cause ambiguity fail-closed', () => {
  const candidateA = makeRoute({
    id: 'route-tie-a',
    platform_id: 'platform-lazada',
    subbrand_key: null,
  })
  const candidateB = makeRoute({
    id: 'route-tie-b',
    platform_id: null,
    subbrand_key: 'subbrand-silver',
  })

  // Both have score 1 when input has both platformId and subbrandKey
  assertCode('STORAGE_ROUTE_AMBIGUOUS', () => {
    selectOperationalStorageRoute([candidateA, candidateB], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: 'platform-lazada',
      subbrandKey: 'subbrand-silver',
    })
  })
})

test('H.4 Matrix Case 6: No matching route throws STORAGE_ROUTE_NOT_CONFIGURED', () => {
  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => {
    selectOperationalStorageRoute([], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: 'platform-lazada',
      subbrandKey: null,
    })
  })
})

test('H.4 Matrix Case 7: Wrong execution_source is strictly rejected', () => {
  const agencyRoute = makeRoute({
    id: 'route-agency',
    execution_source: 'agency',
    platform_id: 'platform-shopee',
    subbrand_key: null,
  })

  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => {
    selectOperationalStorageRoute([agencyRoute], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: 'platform-shopee',
      subbrandKey: null,
    })
  })
})

test('H.4 Matrix Case 8: Cross-brand and cross-platform isolation', () => {
  const brandBRoute = makeRoute({
    id: 'route-brand-b',
    brand_id: 'brand-b',
    platform_id: 'platform-shopee',
    subbrand_key: null,
  })
  const inactiveRoute = makeRoute({
    id: 'route-inactive',
    brand_id: 'brand-a',
    platform_id: 'platform-shopee',
    subbrand_key: null,
    active: false,
  })
  const wrongProviderRoute = makeRoute({
    id: 'route-wrong-provider',
    provider: 'onedrive',
    brand_id: 'brand-a',
    platform_id: 'platform-shopee',
    subbrand_key: null,
  })

  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => {
    selectOperationalStorageRoute([brandBRoute, inactiveRoute, wrongProviderRoute], {
      provider: 'google_drive',
      executionSource: 'internal',
      brandId: 'brand-a',
      platformId: 'platform-shopee',
      subbrandKey: null,
    })
  })
})
