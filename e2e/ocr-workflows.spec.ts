import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

const fixturePath = (fileName: string) => path.join(process.cwd(), 'e2e', 'fixtures', fileName)

const shopeeMetrics = {
  sales: 21281718,
  engaged_viewers: 521,
  comments: 51,
  add_to_cart: 436,
  total_views: 13262,
  average_view_duration_seconds: 25,
  comment_rate: 0.4,
  gpm: 1604714.07,
  orders: 109,
  average_basket_size: 195245.12,
  total_viewers: 8380,
  pcu: 107,
  ctr: 8.4,
  click_to_order_rate: 9.8,
  buyers: 104,
  items_sold: 116,
} as const

const tiktokMetrics = {
  gmv: 8761919,
  items_sold: 103,
  current_viewers: 7,
  impressions: 91950,
  total_views: 2310,
  advertising_cost: 2110000,
  click_rate: 2.52,
  roi_gmv_max: 4.95,
  ctor: 6.26,
  average_view_duration_seconds: 40,
  new_followers: 18,
  buyers: 46,
  sku_orders: 95,
  comments: 234,
  product_clicks: 847,
  average_order_value: 165320,
  live_ctr: 36.62,
  shares: 60,
  estimated_gmv: 8980000,
} as const

const tiktokIndependentMetrics = {
  gmv: 12203520,
  items_sold: 128,
  current_viewers: 1230,
  impressions: 88740,
  total_views: 1680,
  advertising_cost: 2340000,
  click_rate: 1.89,
  roi_gmv_max: 6.49,
  ctor: 9.65,
  average_view_duration_seconds: 39,
  new_followers: 8,
  buyers: 54,
  sku_orders: 120,
  comments: 46,
  product_clicks: 850,
  average_order_value: 148820,
  live_ctr: 50.72,
  shares: 10,
  estimated_gmv: 10610000,
} as const

const ownerTikTokKpiKeys = [
  'gmv', 'items_sold', 'impressions', 'total_views', 'advertising_cost', 'click_rate',
  'roi_gmv_max', 'ctor', 'average_view_duration_seconds', 'new_followers', 'buyers', 'sku_orders',
  'comments', 'product_clicks', 'average_order_value', 'live_ctr', 'shares', 'estimated_gmv',
] as const

const ownerTikTokMetrics = {
  gmv: 13566119, items_sold: 140, impressions: 119520, total_views: 2410,
  advertising_cost: 3060000, click_rate: 2.02, roi_gmv_max: 5.23, ctor: 7.48,
  average_view_duration_seconds: 39, new_followers: 13, buyers: 62, sku_orders: 124,
  comments: 114, product_clicks: 1030, average_order_value: 176180, live_ctr: 42.74,
  shares: 8, estimated_gmv: 12130000,
} as const

type MockServices = typeof import('../lib/services/dataService')
type MockRuntime = { m: Record<string, unknown>; (id: string): MockServices }

// Read the existing mock service without replacing its save/read implementations.
async function readMockSnapshots(page: Page, shiftId: string) {
  return page.evaluate(async id => {
    let services: MockServices | undefined
    const browser = window as Window & { webpackChunk_N_E: unknown[][] }
    browser.webpackChunk_N_E.push([['ocr-snapshot-observer-' + crypto.randomUUID()], {}, (runtime: MockRuntime) => {
      const moduleId = Object.keys(runtime.m).find(key => key.endsWith('/lib/services/dataService.ts'))
      if (!moduleId) throw new Error('Local mock dataService module missing')
      services = runtime(moduleId)
    }])
    if (!services) throw new Error('Local mock service observer unavailable')
    return services.dashboardUpdateService.getByShift(id)
  }, shiftId)
}

async function assertMobileReportDialogFits(page: Page) {
  const layout = await page.getByRole('dialog').evaluate(dialog => {
    const bounds = dialog.getBoundingClientRect()
    const controls = dialog.querySelectorAll('form, [data-testid="report-snapshot-import"], [data-testid="report-snapshot-import"] [data-slot="select-trigger"], [data-testid^="ocr-metric-input-"], [data-slot="dialog-footer"] button')
    return {
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      dialog: { left: bounds.left, right: bounds.right, width: dialog.clientWidth, scrollWidth: dialog.scrollWidth },
      clipped: [...controls].filter(element => {
        const rect = element.getBoundingClientRect()
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1
      }).map(element => element.getAttribute('data-testid') || element.tagName.toLowerCase()),
    }
  })
  expect(layout.document, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport + 1)
  expect(layout.dialog.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.dialog.width + 1)
  expect(layout.clipped, JSON.stringify(layout)).toEqual([])
}

const tiktokIndependentFixture = path.join(
  process.cwd(),
  'e2e',
  'fixtures',
  'ocr',
  'tiktok-layout-variants',
  'tiktok-real-2026-07-10.png',
)

const shopeeKnownLabels = [
  'Sales',
  'Engaged Viewer',
  'Comments',
  'ATC',
  'Total Views',
  'Avg. Viewing Duration',
  'Comments Rate',
  'GPM',
  'Orders',
  'ABS',
  'Total Viewers',
  'PCU',
  'CTR',
  'Click to Order Rate',
  'Buyers',
  'Items Sold',
]

const tiktokKnownLabels = [
  'GMV đã ghi nhận',
  'Số món bán ra từ sự kiện',
  'Người xem hiện tại',
  'Lượt hiển thị',
  'Lượt xem',
  'Chi phí quảng cáo',
  'Tỷ lệ nhấn',
  'ROI GMV Max',
  'CTOR',
  'Thời lượng xem TB',
  'Người theo dõi mới',
  'Khách hàng',
  'Đơn hàng SKU đã ghi nhận',
  'Bình luận',
  'Lượt nhấp vào sản phẩm',
  'AOV',
  'CTR của LIVE',
  'Lượt chia sẻ',
  'GMV ước tính',
]

type ExpectedMetrics = Record<string, number>

async function gotoAppRoute(page: Page, route: string) {
  await expect.poll(async () => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' })
    return response?.status()
  }, {
    timeout: 30_000,
    intervals: [500, 1_000, 2_000],
    message: `${route} did not return HTTP 200`,
  }).toBe(200)
}

async function expectSelectedPlatform(selector: Locator, platformName: string) {
  await expect(selector).toBeVisible()
  await expect(selector).toContainText(platformName)
}

async function runReportOcr(
  page: Page,
  fixture: string,
  expected: ExpectedMetrics,
  knownLabels: readonly string[],
  reviewMismatches = false,
) {
  await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixture)
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
  await page.getByTestId('report-run-ocr-button').click()
  await waitForOcrCompletion(page.getByTestId('report-ocr-completion-status'))

  await assertRenderedMetrics(page, expected, reviewMismatches)
  if ('advertising_cost' in expected) {
    await expect(page.getByTestId('ocr-metric-input-advertising_cost')).toBeVisible()
  }
  await assertKnownMetricsAreMapped(page.getByTestId('report-ocr-unmapped-section'), knownLabels)
  await assertValuesSurviveRerender(page, expected)
}

async function runLiveOcr(
  page: Page,
  fixture: string,
  expected: ExpectedMetrics,
  knownLabels: readonly string[],
  reviewMismatches = false,
) {
  await page.getByTestId('live-dashboard-image-upload').setInputFiles(fixture)
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
  await page.getByTestId('live-run-ocr-button').click()
  await waitForOcrCompletion(page.getByTestId('live-ocr-completion-status'))

  await assertRenderedMetrics(page, expected, reviewMismatches)
  if ('advertising_cost' in expected) {
    await expect(page.getByTestId('ocr-metric-input-advertising_cost')).toBeVisible()
  }
  await assertKnownMetricsAreMapped(page.getByTestId('live-ocr-unmapped-section'), knownLabels)
  await assertValuesSurviveRerender(page, expected)
}

async function waitForOcrCompletion(status: Locator) {
  await expect(status).toBeVisible()
  await expect.poll(
    () => status.getAttribute('data-ocr-status'),
    { timeout: 180_000, message: 'OCR did not reach review_required state' },
  ).toBe('review_required')
}

async function assertRenderedMetrics(page: Page, expected: ExpectedMetrics, reviewMismatches = false) {
  const metricContainer = page.getByTestId('ocr-main-metrics')
  await expect(metricContainer).toBeVisible()
  await expect(metricContainer.locator('input[data-testid^="ocr-metric-input-"]')).toHaveCount(
    Object.keys(expected).length,
  )

  const actual: Record<string, string> = {}
  for (const key of Object.keys(expected)) {
    actual[key] = await page.getByTestId(`ocr-metric-input-${key}`).inputValue()
  }
  const mismatches = Object.entries(expected).flatMap(([key, expectedValue]) =>
    actual[key] === String(expectedValue)
      ? []
      : [{ key, expected: String(expectedValue), actual: actual[key] }],
  )
  if (reviewMismatches) {
    const confirmed = await page.locator('[data-testid^="ocr-metric-"][data-ocr-status="confirmed"]').count()
    console.info(`[browser-ocr] exact=${Object.keys(expected).length - mismatches.length}/${Object.keys(expected).length} confirmed=${confirmed} manual_corrections=${mismatches.length}`)
    for (const { key, expected: corrected } of mismatches) {
      const field = page.getByTestId(`ocr-metric-${key}`)
      await expect(field).toHaveAttribute('data-ocr-status', 'review_required')
      await field.getByTestId(`ocr-metric-input-${key}`).fill(corrected)
      await expect(field).toHaveAttribute('data-ocr-status', 'manual')
    }
    await assertRenderedMetrics(page, expected)
    return
  }
  expect(mismatches, `Rendered OCR metric values:\n${JSON.stringify(actual, null, 2)}`).toEqual([])
}

async function assertKnownMetricsAreMapped(unmappedSection: Locator, knownLabels: readonly string[]) {
  if (await unmappedSection.count() === 0) return
  const originalLabels = await unmappedSection.getByTestId('ocr-unmapped-field').evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-ocr-original-label')?.trim().toLocaleLowerCase() || ''),
  )
  for (const label of knownLabels) {
    expect(originalLabels).not.toContain(label.toLocaleLowerCase())
  }
}

async function assertValuesSurviveRerender(page: Page, expected: ExpectedMetrics) {
  await page.getByTestId('ocr-metric-filter-all').click()
  await page.getByTestId('ocr-metric-filter-data').click()
  await assertRenderedMetrics(page, expected)
}

async function assertShopeeCorrectedText(
  correctedText: Locator,
  rawDiagnostics: Locator,
) {
  const expectedLines = [
    'Sales (đ): 21.281.718,00',
    'Comments Rate: 0,4%',
    'GPM (đ): 1.604.714,07',
    'Orders: 109',
    'ABS (đ): 195.245,12',
    'Total Viewers: 8.380',
    'CTR: 8,4%',
  ]
  const value = await correctedText.inputValue()
  for (const line of expectedLines) expect(value).toContain(line)
  for (const noisy of ['21 281.71 8,00', 'L2', 'ABS (0)', '04x', '84x']) {
    expect(value).not.toContain(noisy)
  }
  await expect(rawDiagnostics).toBeVisible()
  await rawDiagnostics.getByRole('button').click()
  await expect(rawDiagnostics.locator('pre')).toBeVisible()
}

async function assertTikTokCorrectedText(
  correctedText: Locator,
  rawDiagnostics: Locator,
) {
  const value = await correctedText.inputValue()
  for (const label of tiktokKnownLabels) expect(value).toContain(`${label}:`)
  expect(value).not.toContain('[label pass]')
  expect(value).not.toContain('[card pass]')
  await expect(rawDiagnostics).toBeVisible()
  await rawDiagnostics.getByRole('button').click()
  await expect(rawDiagnostics.locator('pre')).toBeVisible()
}

async function openTikTokFinalReport(page: Page) {
  await gotoAppRoute(page, '/live')
  await expect(page.getByTestId('open-live-session-s1')).toBeVisible()
  await page.getByTestId('open-live-session-s1').click()
  await expect(page.getByTestId('open-final-report-modal')).toBeVisible()
  await page.getByTestId('open-final-report-modal').click()
}

async function prepareTikTokShiftForLiveUpdate(page: Page) {
  await gotoAppRoute(page, '/live')
  await page.getByTestId('open-live-session-s1').click()
  await page.getByRole('combobox', { name: /^(Status|Trạng thái)$/ }).click()
  await page.getByRole('option', { name: /^(Preparing|Đang chuẩn bị)$/ }).click()
  await expect(page.getByTestId('open-live-dashboard-update-s1')).toBeVisible()
  await page.getByTestId('open-live-dashboard-update-s1').click()
}

test('Shopee Final Report uploads a real dashboard and autofills all 16 main KPIs', async ({ page }) => {
  await gotoAppRoute(page, '/reports')
  await expect(page.getByTestId('open-final-report-modal')).toBeVisible()
  await page.getByTestId('open-final-report-modal').click()
  const shopeeShift = page.getByTestId('report-shift-candidate-list').locator(':scope > div').filter({ hasText: 'Fashion launch live' })
  await shopeeShift.getByTestId('report-shift-choose').click()
  await expectSelectedPlatform(page.getByTestId('report-platform-selector'), 'Shopee Live')
  await runReportOcr(
    page,
    fixturePath('shopee-dashboard.jpg'),
    shopeeMetrics,
    shopeeKnownLabels,
  )
  await assertShopeeCorrectedText(
    page.getByTestId('report-ocr-corrected-text'),
    page.getByTestId('report-ocr-raw-diagnostics'),
  )
})

test('Shopee Live Dashboard Update uploads a real dashboard and autofills all 16 main KPIs', async ({ page }) => {
  await gotoAppRoute(page, '/live')
  await page.getByTestId('open-live-session-s2').click()
  await expect(page.getByTestId('open-live-dashboard-update-s2')).toBeVisible()
  await page.getByTestId('open-live-dashboard-update-s2').click()
  await expectSelectedPlatform(page.getByTestId('live-platform-selector'), 'Shopee Live')
  await runLiveOcr(
    page,
    fixturePath('shopee-dashboard.jpg'),
    shopeeMetrics,
    shopeeKnownLabels,
  )
  await assertShopeeCorrectedText(
    page.getByTestId('live-ocr-corrected-text'),
    page.getByTestId('live-ocr-raw-diagnostics'),
  )
})

test('TikTok Final Report reviews and corrects all 19 KPIs from a real dashboard', async ({ page }) => {
  test.setTimeout(240_000)
  await openTikTokFinalReport(page)
  await expectSelectedPlatform(page.getByTestId('report-platform-selector'), 'TikTok Shop')
  await runReportOcr(
    page,
    fixturePath('tiktok-dashboard.jpg'),
    tiktokMetrics,
    tiktokKnownLabels,
    true,
  )
  await assertTikTokCorrectedText(
    page.getByTestId('report-ocr-corrected-text'),
    page.getByTestId('report-ocr-raw-diagnostics'),
  )
})

test('TikTok Live Dashboard Update reviews and corrects all 19 KPIs from a real dashboard', async ({ page }) => {
  test.setTimeout(240_000)
  await prepareTikTokShiftForLiveUpdate(page)
  await expectSelectedPlatform(page.getByTestId('live-platform-selector'), 'TikTok Shop')
  await runLiveOcr(
    page,
    fixturePath('tiktok-dashboard.jpg'),
    tiktokMetrics,
    tiktokKnownLabels,
    true,
  )
  await assertTikTokCorrectedText(
    page.getByTestId('live-ocr-corrected-text'),
    page.getByTestId('live-ocr-raw-diagnostics'),
  )
})

test('TikTok Final Report reviews and corrects all 19 KPIs from an independent real dashboard', async ({ page }) => {
  test.setTimeout(240_000)
  await openTikTokFinalReport(page)
  await expectSelectedPlatform(page.getByTestId('report-platform-selector'), 'TikTok Shop')
  await runReportOcr(
    page,
    tiktokIndependentFixture,
    tiktokIndependentMetrics,
    tiktokKnownLabels,
    true,
  )
  await assertTikTokCorrectedText(
    page.getByTestId('report-ocr-corrected-text'),
    page.getByTestId('report-ocr-raw-diagnostics'),
  )
})

test('TikTok Live Dashboard Update reviews and corrects all 19 KPIs from an independent real dashboard', async ({ page }) => {
  test.setTimeout(240_000)
  await prepareTikTokShiftForLiveUpdate(page)
  await expectSelectedPlatform(page.getByTestId('live-platform-selector'), 'TikTok Shop')
  await runLiveOcr(
    page,
    tiktokIndependentFixture,
    tiktokIndependentMetrics,
    tiktokKnownLabels,
    true,
  )
  await assertTikTokCorrectedText(
    page.getByTestId('live-ocr-corrected-text'),
    page.getByTestId('live-ocr-raw-diagnostics'),
  )
})

test('owner TikTok dashboard reviews 18 KPIs and saves the snapshot into the correct Reports shift', async ({ page }, info) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await prepareTikTokShiftForLiveUpdate(page)
  const linkedShift = page.getByTestId('live-linked-shift')
  await expect(linkedShift).toBeVisible()
  await expect(linkedShift).toContainText('TechGear Pro')
  await expect(linkedShift).toContainText('TikTok Shop')
  const timestamp = page.getByTestId('live-snapshot-time')
  await expect(timestamp).toBeVisible()
  await timestamp.fill((await timestamp.inputValue()).slice(0, 10) + 'T10:15')
  expect(await readMockSnapshots(page, 's1')).toHaveLength(0)
  await page.getByTestId('live-dashboard-image-upload').setInputFiles(
    fixturePath('ocr/tiktok-layout-variants/tiktok-real-2026-06-26-evening.png'),
  )
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
  await page.getByTestId('live-run-ocr-button').click()
  await waitForOcrCompletion(page.getByTestId('live-ocr-completion-status'))
  await page.getByTestId('ocr-metric-filter-all').click()
  const save = page.getByRole('dialog').locator('button[type="submit"]')
  await expect(save).toBeDisabled()
  const readings = []
  for (const key of ownerTikTokKpiKeys) {
    const input = page.getByTestId('ocr-metric-input-' + key)
    const field = page.getByTestId('ocr-metric-' + key)
    await expect(input).toBeVisible()
    const actual = await input.inputValue()
    const status = await field.getAttribute('data-ocr-status')
    const expected = String(ownerTikTokMetrics[key])
    readings.push({ key, actual, expected, status, exact: actual === expected })
    if (actual !== expected) {
      expect(['review_required', 'low_confidence', 'empty']).toContain(status)
      await input.fill(expected)
      await expect(field).toHaveAttribute('data-ocr-status', 'manual')
    }
  }
  await page.getByTestId('ocr-metric-input-current_viewers').fill('1820')
  await page.getByRole('button', { name: /^(Confirm all reviewed metrics|Xác nhận tất cả chỉ số đã kiểm tra)$/ }).click()
  for (const key of ownerTikTokKpiKeys) {
    await expect(page.getByTestId('ocr-metric-input-' + key)).toHaveValue(String(ownerTikTokMetrics[key]))
    await expect(page.getByTestId('ocr-metric-' + key)).toHaveAttribute('data-ocr-status', /^(confirmed|manual)$/)
  }
  await expect(save).toBeEnabled()
  await page.screenshot({ path: info.outputPath('live-18-kpi-reviewed.png'), fullPage: true })
  await save.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const snapshots = await readMockSnapshots(page, 's1')
  expect(snapshots).toHaveLength(1)
  const snapshot = snapshots[0]
  expect(snapshot.shift_id).toBe('s1')
  expect(snapshot.dashboard_platform).toBe('tiktok_shop')
  expect(snapshot.normalized_metrics).toMatchObject(ownerTikTokMetrics)
  expect(snapshot.normalized_metrics?.current_viewers).toBe(1820)
  expect((await readMockSnapshots(page, 's2')).some(item => item.id === snapshot.id)).toBe(false)

  if (await page.getByTestId('sidebar-reports').isVisible()) {
    await page.getByTestId('sidebar-reports').click()
  } else {
    await page.getByTestId('nav-menu-more').click()
    await page.getByRole('menuitem', { name: /^(Reports|Báo cáo)$/ }).click()
  }
  await expect(page).toHaveURL(/\/reports$/)
  if (info.project.name === 'mobile') await expect(page.getByTestId('mobile-report-card').first()).toBeVisible()
  await page.getByTestId('open-final-report-modal').click()
  const picker = page.getByTestId('report-shift-picker')
  if (info.project.name === 'mobile') await assertMobileReportDialogFits(page)
  await picker.getByTestId('report-shift-search').fill('TechGear morning live')
  await expect(picker.getByTestId('report-shift-choose')).toHaveCount(1)
  await picker.getByTestId('report-shift-choose').click()
  const imported = page.getByTestId('report-snapshot-import')
  await expect(imported).toBeVisible()
  await imported.getByRole('combobox').click()
  await page.getByRole('option', { name: new RegExp(snapshot.id.slice(0, 8)) }).click()
  await page.getByTestId('apply-report-snapshot').click()
  await expect(imported).toContainText('Source snapshot ' + snapshot.id.slice(0, 8))
  for (const key of ownerTikTokKpiKeys) {
    await expect(page.getByTestId('ocr-metric-input-' + key)).toHaveValue(String(ownerTikTokMetrics[key]))
  }
  if (info.project.name === 'mobile') await assertMobileReportDialogFits(page)
  await page.screenshot({ path: info.outputPath('reports-imported-snapshot.png'), fullPage: true })
  await page.getByTestId('ocr-metric-input-estimated_gmv').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('reports-kpi-fields.png'), fullPage: true })
  const accuracy = { exact: readings.filter(item => item.exact).length, total: readings.length, autoConfirmed: readings.filter(item => item.status === 'confirmed').length }
  console.info('[owner-browser-ocr] ' + JSON.stringify(accuracy))
  await info.attach('snapshot-reconciliation', { body: JSON.stringify({ scope: 'local webpack mock browser E2E; not authenticated UAT', accuracy, readings, snapshotId: snapshot.id, shiftId: snapshot.shift_id, reportsImport: 'PASS' }, null, 2), contentType: 'application/json' })
})
