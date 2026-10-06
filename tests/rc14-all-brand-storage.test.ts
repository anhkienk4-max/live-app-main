import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createStaticOperationalStorageRouteRepository, parseStaticOperationalStorageRoutes } from '@/lib/server/staticOperationalStorageRouteRepository'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'

const config = readFileSync(new URL('../config/storage-v1-production-routes.proposed.json', import.meta.url), 'utf8')
const proposed = JSON.parse(config)
const usage: Array<{ brand: string; source: 'internal' | 'agency'; platform: string; earliest: string; latest: string }> =
  JSON.parse(readFileSync(new URL('./fixtures/rc14-production-storage-usage.json', import.meta.url), 'utf8'))
const repository = createStaticOperationalStorageRouteRepository(config)
const resolve = (brand: string, source: 'internal' | 'agency', platform = 'Shopee Live', date = '2026-09-14', category: 'dashboard' | 'live_visual' | 'data_report' | 'data_source' = 'dashboard') =>
  repository.resolvePlacement({ provider: 'google_drive', executionSource: source, brandId: 'ignored', platformId: 'ignored',
    subbrandKey: null, shiftDate: date, logicalCategory: category, fileName: 'image.png', brandLabel: brand, platformLabel: platform })

test('proposed config covers all 20 Production Brand/source and 28 platform combinations without ambiguity', async () => {
  assert.equal(parseStaticOperationalStorageRoutes(config).length, 21)
  assert.equal(proposed.filter((route: { active: boolean }) => route.active).length, 21)
  assert.equal(new Set(usage.map(row => `${row.brand}/${row.source}`)).size, 20)
  assert.equal(usage.length, 28)
  for (const row of usage) {
    for (const date of [row.earliest, row.latest]) {
      for (const category of ['dashboard', 'live_visual', 'data_report', 'data_source'] as const) {
        const placement = await resolve(row.brand, row.source, row.platform, date, category)
        assert.equal(placement.provider, 'google_drive')
        assert.ok(placement.folderSegments.length > 1)
      }
    }
  }
})

for (const brand of ['ASTROMAN', 'CUREL', 'Female', 'KATE', 'OPELLA', 'Pepsico', 'X-men']) {
  test(`${brand} Agency materializes the exact brand under the temporary base without a platform`, async () => {
    for (const [category, segments] of [
      ['dashboard', ['DASHBOARD']], ['live_visual', ['VISUAL HOST']],
      ['data_report', ['DATA', 'REPORT']], ['data_source', ['DATA', 'SOURCE']],
    ] as const) {
      const placement = await resolve(brand, 'agency', 'Shopee Live', '2026-09-14', category)
      assert.equal(placement.baseFolderId, '1MXerAY2WdViTsVCO8G92vOepS-6BxYBC')
      assert.deepEqual(placement.folderSegments, [brand, 'THÁNG 9.2026', ...segments])
      assert.deepEqual((await resolve(brand, 'agency', 'TikTok Shop', '2026-09-14', category)).folderSegments, placement.folderSegments)
    }
  })
}

for (const brand of ['ASM AI Livestream', 'Female AI livestream', 'Male AI livestream']) {
  test(`${brand} Internal uses canonical padded month and platform placement`, async () => {
    assert.deepEqual((await resolve(brand, 'internal')).folderSegments, [brand, 'Shopee Live', 'THÁNG 09.2026', 'DASHBOARD'])
    assert.deepEqual((await resolve(brand, 'internal', 'Shopee Live', '2026-09-14', 'live_visual')).folderSegments,
      [brand, 'Shopee Live', 'THÁNG 09.2026', 'VISIBILITY'])
    await assert.rejects(() => resolve(brand, 'agency'), (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_NOT_CONFIGURED')
  })
}

test('historical exact labels take priority, with category-specific OPELLA periods and uppercase future fallback', async () => {
  assert.deepEqual((await resolve('OPELLA', 'internal', 'TikTok Shop', '2026-08-05')).folderSegments, ['DASHBOARD', 'THANG 8 2026'])
  assert.deepEqual((await resolve('OPELLA', 'internal', 'TikTok Shop', '2026-08-05', 'live_visual')).folderSegments, ['VISIBILITY', 'THANGS 8 2026'])
  assert.equal((await resolve('OPELLA', 'internal', 'Shopee Live')).baseFolderId, '1ZxI1VB0x5K8eADDig9suD-4qPTMCK8f-')
  assert.equal((await resolve('OPELLA', 'internal', 'TikTok Shop')).baseFolderId, '1Ww8oPGDLiadsXvY9yP0UUIdqkMI-s0jp')
  assert.deepEqual((await resolve('Female', 'internal')).folderSegments, ['DASHBOARD', 'Tháng 9 - 2026'])
  assert.deepEqual((await resolve('Female', 'internal', 'Shopee Live', '2026-09-14', 'live_visual')).folderSegments, ['VISIBILITY', 'THÁNG 9. 2026'])
  assert.deepEqual((await resolve('Female', 'internal', 'Shopee Live', '2027-01-14')).folderSegments, ['DASHBOARD', 'THÁNG 1 - 2027'])
  assert.deepEqual((await resolve('KATE', 'internal', 'Shopee Live', '2026-06-14')).folderSegments, ['KATE T6.2026', 'DASHBOARD'])
  assert.deepEqual((await resolve('KATE', 'internal', 'Shopee Live', '2026-07-14')).folderSegments, ['KATE T7.2026', 'Dashboard'])
})

test('historical trailing space reaches materialization unchanged', async () => {
  const placement = await resolve('KAO', 'internal', 'Shopee Live', '2026-08-03')
  assert.deepEqual(placement.folderSegments, ['T8.2026 ', 'DASHBOARD'])
  const calls: string[] = []
  await createOperationalStorageFolderMaterializer(async (parentId, name, provider) => {
    calls.push(name); return { id: name, name, parentId, provider }
  })(placement)
  assert.deepEqual(calls, ['T8.2026 ', 'DASHBOARD'])
})

test('exact category override precedes the month default and normal period fallback', async () => {
  const route = { ...proposed[0], storage_profile: 'LEGACY_CATEGORY_PERIOD', folder_labels: { dashboard: 'DASHBOARD', data_report: ['DATA', 'REPORT'], data_source: ['DATA', 'SOURCE'] },
    period_naming_style: 'THANG_UPPER_M_DASH_YEAR', period_label_overrides: { '2026-09': { default: 'Default exact', dashboard: 'Dashboard exact', data_source: 'Source exact' } } }
  const repo = createStaticOperationalStorageRouteRepository(JSON.stringify([route]))
  const input = { provider: 'google_drive' as const, executionSource: 'internal' as const, brandId: 'x', platformId: null, subbrandKey: null,
    shiftDate: '2026-09-14', fileName: 'x.png', brandLabel: route.brand }
  assert.equal((await repo.resolvePlacement({ ...input, logicalCategory: 'dashboard' })).periodLabel, 'Dashboard exact')
  assert.equal((await repo.resolvePlacement({ ...input, logicalCategory: 'data_report' })).periodLabel, 'Default exact')
  assert.equal((await repo.resolvePlacement({ ...input, logicalCategory: 'data_source' })).periodLabel, 'Source exact')
})

test('unsafe override labels, unsupported months/categories, unknown and duplicate routes fail closed', async () => {
  for (const period_label_overrides of [
    { '2026-09': { dashboard: '../escape' } }, { '2026-09': { dashboard: 'a/b' } },
    { '2026-09': { dashboard: 'a\\b' } }, { '2026-09': { dashboard: '\u0000bad' } },
    { '2026-09': { dashboard: ' ' } }, { '2026-13': { dashboard: 'exact' } }, { '2026-09': { other: 'bad' } },
  ]) assert.throws(() => parseStaticOperationalStorageRoutes(JSON.stringify([{ ...proposed[0], period_label_overrides }])), OperationalStoragePlacementError)
  assert.throws(() => parseStaticOperationalStorageRoutes(JSON.stringify([proposed[0], proposed[0]])),
    (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_AMBIGUOUS')
  await assert.rejects(() => resolve('Unknown Brand', 'internal'),
    (error: unknown) => error instanceof OperationalStoragePlacementError && error.code === 'STORAGE_ROUTE_NOT_CONFIGURED')
})

test('Mars preserves its route identity, category order, historical labels and Agency placement', async () => {
  const internal = proposed.find((route: { brand: string; execution_source: string }) =>
    route.brand === 'Mars Snacking' && route.execution_source === 'internal')
  assert.equal(internal.provider, 'google_drive')
  assert.equal(internal.platform, null)
  assert.equal(internal.subbrand_key, null)
  assert.equal(internal.storage_profile, 'LEGACY_CATEGORY_PERIOD')
  assert.equal(internal.root_folder_id, '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm')
  assert.equal(internal.base_folder_id, '1SuQhXZsNr7eArHVwf9NMTqR1TEHYqOC5')
  assert.deepEqual(internal.folder_labels, {
    dashboard: 'DASHBOARD', live_visual_internal: 'VISIBILITY',
    data_report: ['DATA', 'REPORT'], data_source: ['DATA', 'SOURCE'],
  })
  assert.deepEqual((await resolve('Mars Snacking', 'internal', 'Shopee Live', '2026-10-03')).folderSegments, ['DASHBOARD', 'Tháng 10 - 2026'])
  assert.deepEqual((await resolve('Mars Snacking', 'internal', 'Shopee Live', '2026-10-03', 'live_visual')).folderSegments, ['VISIBILITY', 'THÁNG 10 -2026'])
  const agency = await resolve('Mars Snacking', 'agency', 'Shopee Live', '2026-10-03')
  assert.equal(agency.baseFolderId, '19cuLMvhVB8yfJslZUbLUdrsDLQ_vincE')
  assert.deepEqual(agency.folderSegments, ['THÁNG 10.2026', 'DASHBOARD'])
})

test('Mars unconfigured periods retain the Production title-case dash fallback for every category', async () => {
  const internal = proposed.find((route: { brand: string; execution_source: string }) =>
    route.brand === 'Mars Snacking' && route.execution_source === 'internal')
  assert.equal(internal.period_naming_style, 'THANG_M_DASH_YEAR')
  for (const [date, period] of [['2026-11-03', 'Tháng 11 - 2026'], ['2027-01-03', 'Tháng 1 - 2027']]) {
    for (const [category, segments] of [
      ['dashboard', ['DASHBOARD']], ['live_visual', ['VISIBILITY']],
      ['data_report', ['DATA', 'REPORT']], ['data_source', ['DATA', 'SOURCE']],
    ] as const) {
      const placement = await resolve('Mars Snacking', 'internal', 'Shopee Live', date, category)
      assert.equal(placement.baseFolderId, internal.base_folder_id)
      assert.equal(placement.periodLabel, period)
      assert.deepEqual(placement.folderSegments, [...segments, period])
    }
  }
})
