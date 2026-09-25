import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  noRouteErrorForBrand,
  OperationalStoragePlacementError,
  resolveOperationalStoragePlacement,
  selectOperationalStorageRoute,
  type OperationalStoragePlacementInput,
  type OperationalStorageRoute,
} from '@/lib/files/operationalStoragePlacementResolver'
import { createOperationalStorageRouteRepository } from '@/lib/server/operationalStorageRouteRepository'

const baseRoute: OperationalStorageRoute = {
  id: 'route-1',
  provider: 'google_drive',
  execution_source: 'internal',
  brand_id: 'brand-id',
  platform_id: null,
  subbrand_key: null,
  storage_profile: 'LEGACY_CATEGORY_PERIOD',
  root_folder_id: 'root-id',
  base_folder_id: 'base-id',
  folder_labels: {},
  period_naming_style: 'THANG_M_DASH_YEAR',
  active: true,
}

const input: OperationalStoragePlacementInput = {
  provider: 'google_drive',
  executionSource: 'internal',
  brandId: 'brand-id',
  platformId: null,
  subbrandKey: null,
  shiftDate: '2026-10-01',
  logicalCategory: 'dashboard',
  fileName: '24.09 19.00-23.00 TTS.png',
}

function route(overrides: Partial<OperationalStorageRoute>): OperationalStorageRoute {
  return { ...baseRoute, ...overrides }
}

function inputWith(overrides: Partial<OperationalStoragePlacementInput>): OperationalStoragePlacementInput {
  return { ...input, ...overrides }
}

function assertCode(code: string, action: () => unknown): void {
  let thrown: unknown
  try { action() } catch (error) { thrown = error }
  assert.ok(thrown instanceof OperationalStoragePlacementError && thrown.code === code, `expected ${code}; got ${String(thrown)}`)
}

function resolve(profile: OperationalStorageRoute['storage_profile'], overrides: Partial<OperationalStoragePlacementInput> = {}, routeOverrides: Partial<OperationalStorageRoute> = {}) {
  return resolveOperationalStoragePlacement(route({ storage_profile: profile, ...routeOverrides }), inputWith(overrides))
}

test('route lookup is exact on provider, source, brand, active state, and NULL-or-exact dimensions', () => {
  const desired = route({ id: 'exact', platform_id: 'platform-1', subbrand_key: 'xmen' })
  const ignored = [
    route({ id: 'wrong-provider', provider: 'onedrive', platform_id: 'platform-1', subbrand_key: 'xmen' }),
    route({ id: 'wrong-source', execution_source: 'agency', platform_id: 'platform-1', subbrand_key: 'xmen' }),
    route({ id: 'wrong-brand', brand_id: 'other', platform_id: 'platform-1', subbrand_key: 'xmen' }),
    route({ id: 'inactive', active: false, platform_id: 'platform-1', subbrand_key: 'xmen' }),
    route({ id: 'wrong-platform', platform_id: 'platform-2', subbrand_key: 'xmen' }),
    route({ id: 'wrong-subbrand', platform_id: 'platform-1', subbrand_key: 'other' }),
  ]
  assert.equal(selectOperationalStorageRoute([...ignored, desired], {
    provider: input.provider, executionSource: input.executionSource, brandId: input.brandId,
    platformId: 'platform-1', subbrandKey: 'xmen',
  }).id, 'exact')
})

test('exact platform and subbrand specificity beat broader candidates', () => {
  const broad = route({ id: 'broad' })
  const platform = route({ id: 'platform', platform_id: 'platform-1' })
  const subbrand = route({ id: 'subbrand', subbrand_key: 'xmen' })
  const exact = route({ id: 'exact', platform_id: 'platform-1', subbrand_key: 'xmen' })
  const key = { provider: input.provider, executionSource: input.executionSource, brandId: input.brandId, platformId: 'platform-1', subbrandKey: 'xmen' }
  assert.equal(selectOperationalStorageRoute([broad, platform, subbrand, exact], key).id, 'exact')
  assert.equal(selectOperationalStorageRoute([broad, platform], key).id, 'platform')
  assert.equal(selectOperationalStorageRoute([broad, subbrand], key).id, 'subbrand')
})

test('same highest specificity tie fails closed', () => {
  const platform = route({ id: 'platform', platform_id: 'platform-1' })
  const subbrand = route({ id: 'subbrand', subbrand_key: 'xmen' })
  assertCode('STORAGE_ROUTE_AMBIGUOUS', () => selectOperationalStorageRoute([platform, subbrand], {
    provider: input.provider, executionSource: input.executionSource, brandId: input.brandId,
    platformId: 'platform-1', subbrandKey: 'xmen',
  }))
})

test('no route errors distinguish legacy configuration from uninitialized canonical routing', () => {
  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => selectOperationalStorageRoute([], input))
  assertCode('STORAGE_ROUTE_NOT_CONFIGURED', () => { throw noRouteErrorForBrand(null) })
  assertCode('CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED', () => { throw noRouteErrorForBrand('CANONICAL_V1') })
})

test('LEGACY_CATEGORY_PERIOD builds category then configured period', () => {
  const result = resolve('LEGACY_CATEGORY_PERIOD', {}, { root_folder_id: 'R', base_folder_id: 'mars-wrigley-ls-report-id' })
  assert.equal(result.rootFolderId, 'R')
  assert.equal(result.baseFolderId, 'mars-wrigley-ls-report-id')
  assert.deepEqual(result.folderSegments, ['DASHBOARD', 'Tháng 10 - 2026'])
})

test('LEGACY_PLATFORM_CATEGORY_PERIOD includes the resolved platform label', () => {
  const result = resolve('LEGACY_PLATFORM_CATEGORY_PERIOD', { platformLabel: 'OPELLA (TikTok)' }, {
    root_folder_id: 'R', base_folder_id: 'opella-ls-report-id',
    period_naming_style: 'THANG_M_DOT_YEAR',
  })
  assert.equal(result.rootFolderId, 'R')
  assert.equal(result.baseFolderId, 'opella-ls-report-id')
  assert.deepEqual(result.folderSegments, ['OPELLA (TikTok)', 'DASHBOARD', 'THÁNG 10.2026'])
})

test('LEGACY_PERIOD_CATEGORY places period before category', () => {
  const result = resolve('LEGACY_PERIOD_CATEGORY', {}, { period_naming_style: 'THANG_M_DOT_YEAR' })
  assert.deepEqual(result.folderSegments, ['THÁNG 10.2026', 'DASHBOARD'])
})

test('legacy route preserves the configured dotted period spacing', () => {
  const result = resolve('LEGACY_CATEGORY_PERIOD', {}, { period_naming_style: 'THANG_M_DOT_SPACE_YEAR' })
  assert.equal(result.periodLabel, 'THÁNG 10. 2026')
})

test('LEGACY_SUBBRAND_PERIOD_CATEGORY uses the configured subbrand label', () => {
  const result = resolve('LEGACY_SUBBRAND_PERIOD_CATEGORY', {}, {
    subbrand_key: 'kao-ls', folder_labels: { subbrand: 'KAO - LS' }, period_naming_style: 'T_M_DOT_YEAR',
  })
  assert.deepEqual(result.folderSegments, ['KAO - LS', 'T10.2026', 'DASHBOARD'])
})

test('subbrand key is never guessed as a folder label', () => {
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_SUBBRAND_PERIOD_CATEGORY', {}, { subbrand_key: 'kao-ls' }))
})

test('LEGACY_SUBBRAND_CATEGORY_PERIOD places category before period', () => {
  const result = resolve('LEGACY_SUBBRAND_CATEGORY_PERIOD', {}, {
    root_folder_id: 'R', base_folder_id: 'marico-ls-report-id',
    subbrand_key: 'xmen', folder_labels: { subbrand: 'XMEN - LS Report' }, period_naming_style: 'THANG_M_DOT_YEAR',
  })
  assert.equal(result.rootFolderId, 'R')
  assert.equal(result.baseFolderId, 'marico-ls-report-id')
  assert.deepEqual(result.folderSegments, ['XMEN - LS Report', 'DASHBOARD', 'THÁNG 10.2026'])
})

test('CANONICAL_V1 uses ROOT-relative brand/platform/period/category and fixed period format', () => {
  const result = resolve('CANONICAL_V1', { brandLabel: 'ABC', platformLabel: 'TikTok Shop' }, {
    root_folder_id: 'R', base_folder_id: 'must-not-anchor-at-brand-folder',
    period_naming_style: 'ignored-for-canonical',
  })
  assert.equal(result.rootFolderId, 'R')
  assert.equal(result.baseFolderId, 'R')
  assert.deepEqual(result.folderSegments, ['ABC', 'TikTok Shop', 'THÁNG 10.2026', 'DASHBOARD'])
  assert.equal(`${result.baseFolderId}/${result.folderPath}`, 'R/ABC/TikTok Shop/THÁNG 10.2026/DASHBOARD')
  assert.equal(result.folderSegments.filter(segment => segment === 'ABC').length, 1)
  assert.equal(result.periodLabel, 'THÁNG 10.2026')
})

test('legacy base anchor is the existing KAO or agency base, with only child segments returned', () => {
  const kao = resolve('LEGACY_SUBBRAND_PERIOD_CATEGORY', {}, {
    root_folder_id: 'R', base_folder_id: 'kao-group-ls-report-id',
    subbrand_key: 'kao-ls', folder_labels: { subbrand: 'KAO - LS' }, period_naming_style: 'T_M_DOT_YEAR',
  })
  assert.equal(kao.rootFolderId, 'R')
  assert.equal(kao.baseFolderId, 'kao-group-ls-report-id')
  assert.deepEqual(kao.folderSegments, ['KAO - LS', 'T10.2026', 'DASHBOARD'])

  const agency = resolve('LEGACY_PERIOD_CATEGORY', { executionSource: 'agency' }, {
    root_folder_id: 'R', base_folder_id: 'mars-agency-base-id', period_naming_style: 'THANG_M_DOT_YEAR',
  })
  assert.equal(agency.rootFolderId, 'R')
  assert.equal(agency.baseFolderId, 'mars-agency-base-id')
  assert.deepEqual(agency.folderSegments, ['THÁNG 10.2026', 'DASHBOARD'])
})

test('logical categories map to controlled exact folder labels and DATA subfolders', () => {
  assert.deepEqual(resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'dashboard' }).folderSegments, ['DASHBOARD', 'Tháng 10 - 2026'])
  assert.deepEqual(resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'live_visual' }).folderSegments, ['VISIBILITY', 'Tháng 10 - 2026'])
  assert.deepEqual(resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'live_visual', executionSource: 'agency' }).folderSegments, ['VISUAL HOST', 'Tháng 10 - 2026'])
  assert.deepEqual(resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'data_report' }).folderSegments, ['DATA', 'REPORT', 'Tháng 10 - 2026'])
  assert.deepEqual(resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'data_source' }).folderSegments, ['DATA', 'SOURCE', 'Tháng 10 - 2026'])
})

test('configured category labels are used verbatim as controlled safe segments', () => {
  const result = resolve('LEGACY_CATEGORY_PERIOD', {}, {
    folder_labels: { dashboard: 'TABLERO', live_visual_internal: 'VISIBILITY INT', data_report: ['DATOS', 'INFORME'] },
  })
  assert.deepEqual(result.folderSegments, ['TABLERO', 'Tháng 10 - 2026'])
  const data = resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'data_report' }, {
    folder_labels: { data_report: ['DATOS', 'INFORME'] },
  })
  assert.deepEqual(data.folderSegments, ['DATOS', 'INFORME', 'Tháng 10 - 2026'])
})

test('shift.date alone determines period across month and year boundaries', () => {
  assert.equal(resolve('LEGACY_PERIOD_CATEGORY', { shiftDate: '2026-09-30' }).periodLabel, 'Tháng 9 - 2026')
  assert.equal(resolve('LEGACY_PERIOD_CATEGORY', { shiftDate: '2026-10-01' }).periodLabel, 'Tháng 10 - 2026')
  assert.equal(resolve('LEGACY_PERIOD_CATEGORY', { shiftDate: '2026-12-31' }).periodLabel, 'Tháng 12 - 2026')
  assert.equal(resolve('LEGACY_PERIOD_CATEGORY', { shiftDate: '2027-01-01' }).periodLabel, 'Tháng 1 - 2027')
  assertCode('STORAGE_DATE_INVALID', () => resolve('LEGACY_PERIOD_CATEGORY', { shiftDate: '2026-10-01T00:00:00Z' }))
  assertCode('STORAGE_DATE_INVALID', () => resolve('LEGACY_PERIOD_CATEGORY', { shiftDate: '2026-02-30' }))
})

test('filename is sanitized and remains outside all folder path segments', () => {
  const result = resolve('LEGACY_CATEGORY_PERIOD')
  assert.equal(result.fileName, '24.09 19.00-23.00 TTS.png')
  assert.equal(result.folderPath, 'DASHBOARD/Tháng 10 - 2026')
  assert.equal(result.folderSegments.includes(result.fileName), false)
  assertCode('STORAGE_FILE_NAME_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', { fileName: '../\\' }))
})

test('Unicode labels survive unchanged', () => {
  const unicode = resolve('LEGACY_CATEGORY_PERIOD', {}, { folder_labels: { dashboard: 'BẢNG ĐIỀU KHIỂN' } })
  assert.equal(unicode.folderSegments[0], 'BẢNG ĐIỀU KHIỂN')
})

test('folder labels with traversal are rejected', () => {
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', {}, { folder_labels: { dashboard: '../DASHBOARD' } }))
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', {}, { folder_labels: { dashboard: 'folder..name' } }))
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', {}, { folder_labels: { dashboard: 'A\\B' } }))
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', {}, { folder_labels: { dashboard: '   ' } }))
})

test('slash-containing DATA category labels are rejected instead of becoming one path segment', () => {
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'data_report' }, { folder_labels: { data_report: ['DATA/REPORT'] } }))
})

test('unsupported profile, category, and unsafe period style are rejected', () => {
  assertCode('STORAGE_ROUTE_PROFILE_UNSUPPORTED', () => resolve('UNKNOWN_PROFILE'))
  assertCode('STORAGE_CATEGORY_UNSUPPORTED', () => resolve('LEGACY_CATEGORY_PERIOD', { logicalCategory: 'unknown' as never }))
  assertCode('STORAGE_ROUTE_CONFIG_INVALID', () => resolve('LEGACY_CATEGORY_PERIOD', {}, { period_naming_style: '../folder' }))
})

test('server repository reads only route and brand configuration and exposes no writes', async () => {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const client = {
    from(table: string) {
      const filters: unknown[] = []
      const query = {
        select(...args: unknown[]) { calls.push({ table, method: 'select', args }); return query },
        eq(...args: unknown[]) { filters.push(args); calls.push({ table, method: 'eq', args }); return query },
        maybeSingle() { return Promise.resolve({ data: { storage_profile: null }, error: null }) },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: table === 'operational_storage_routes' ? [baseRoute] : null, error: null }).then(resolve)
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  const repository = createOperationalStorageRouteRepository({ client })
  assert.deepEqual(Object.keys(repository), ['resolvePlacement'])
  const placement = await repository.resolvePlacement(input)
  assert.equal(placement.folderPath, 'DASHBOARD/Tháng 10 - 2026')
  assert.ok(calls.some(call => call.table === 'operational_storage_routes' && call.method === 'eq' && call.args[0] === 'provider'))
  assert.ok(calls.some(call => call.table === 'operational_storage_routes' && call.method === 'eq' && call.args[0] === 'brand_id'))
  assert.ok(calls.every(call => call.method === 'select' || call.method === 'eq'))
})

test('repository emits canonical initialization error when brand policy is canonical and no route exists', async () => {
  const client = {
    from(table: string) {
      const query = {
        select() { return query },
        eq() { return query },
        maybeSingle() { return Promise.resolve({ data: { storage_profile: 'CANONICAL_V1' }, error: null }) },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: table === 'operational_storage_routes' ? [] : null, error: null }).then(resolve)
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  const repository = createOperationalStorageRouteRepository({ client })
  await assert.rejects(repository.resolvePlacement(input), error => error instanceof OperationalStoragePlacementError && error.code === 'CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED')
})
