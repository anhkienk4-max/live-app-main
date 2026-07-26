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
) {
  await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixture)
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
  await page.getByTestId('report-run-ocr-button').click()
  await waitForOcrCompletion(page.getByTestId('report-ocr-completion-status'))

  await applyOcrTextOnlyIfImageAutofillIsIncomplete(
    page,
    page.getByTestId('apply-report-ocr-text'),
    expected,
  )
  await assertRenderedMetrics(page, expected)
  await assertKnownMetricsAreMapped(page.getByTestId('report-ocr-unmapped-section'), knownLabels)
  await assertValuesSurviveRerender(page, expected)
}

async function runLiveOcr(
  page: Page,
  fixture: string,
  expected: ExpectedMetrics,
  knownLabels: readonly string[],
) {
  await page.getByTestId('live-dashboard-image-upload').setInputFiles(fixture)
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible()
  await page.getByTestId('live-run-ocr-button').click()
  await waitForOcrCompletion(page.getByTestId('live-ocr-completion-status'))

  await applyOcrTextOnlyIfImageAutofillIsIncomplete(
    page,
    page.getByTestId('apply-live-ocr-text'),
    expected,
  )
  await assertRenderedMetrics(page, expected)
  await assertKnownMetricsAreMapped(page.getByTestId('live-ocr-unmapped-section'), knownLabels)
  await assertValuesSurviveRerender(page, expected)
}

async function waitForOcrCompletion(status: Locator) {
  await expect(status).toBeVisible()
  await expect.poll(
    () => status.getAttribute('data-ocr-status'),
    { timeout: 120_000, message: 'OCR did not reach review_required state' },
  ).toBe('review_required')
}

async function applyOcrTextOnlyIfImageAutofillIsIncomplete(
  page: Page,
  applyButton: Locator,
  expected: ExpectedMetrics,
) {
  const renderedValues = await Promise.all(
    Object.keys(expected).map(async key => {
      const input = page.getByTestId(`ocr-metric-input-${key}`)
      return await input.count() > 0 ? input.inputValue() : ''
    }),
  )
  if (renderedValues.every(value => value !== '')) return
  await expect(applyButton).toBeEnabled()
  await applyButton.click()
}

async function assertRenderedMetrics(page: Page, expected: ExpectedMetrics) {
  const metricContainer = page.getByTestId('ocr-main-metrics')
  await expect(metricContainer).toBeVisible()
  await expect(metricContainer.locator('input[data-testid^="ocr-metric-input-"]')).toHaveCount(
    Object.keys(expected).length,
  )

  const actual: Record<string, string> = {}
  for (const [key, expectedValue] of Object.entries(expected)) {
    actual[key] = await page.getByTestId(`ocr-metric-input-${key}`).inputValue()
  }
  const mismatches = Object.entries(expected).flatMap(([key, expectedValue]) =>
    actual[key] === String(expectedValue)
      ? []
      : [{ key, expected: String(expectedValue), actual: actual[key] }],
  )
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
  await rawDiagnostics.locator('summary').click()
  await expect(rawDiagnostics.locator('pre')).toBeVisible()
}

async function assertTikTokCorrectedText(
  correctedText: Locator,
  rawDiagnostics: Locator,
) {
  const value = await correctedText.inputValue()
  for (const label of tiktokKnownLabels) expect(value).toContain(`${label}:`)
  expect(value).toContain('GMV đã ghi nhận: 8.761.919')
  expect(value).toContain('Tỷ lệ nhấn: 2,52%')
  expect(value).toContain('Thời lượng xem TB: 40s')
  expect(value).toContain('GMV ước tính: 8,98M')
  expect(value).not.toContain('[label pass]')
  expect(value).not.toContain('[card pass]')
  await expect(rawDiagnostics).toBeVisible()
  await rawDiagnostics.locator('summary').click()
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
  await gotoAppRoute(page, '/calendar')
  await expect(page.getByTestId('calendar-event-s1')).toBeVisible()
  await page.getByTestId('calendar-event-s1').click()
  await page.getByTestId('edit-shift-detail').click()

  const editDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit Shift', exact: true }),
  })
  const statusField = editDialog.getByText('Status', { exact: true }).locator('..')
  await statusField.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Preparing', exact: true }).click()
  await editDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editDialog).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByTestId('sidebar-live').click()
  await expect(page).toHaveURL(/\/live$/)
  await page.getByTestId('open-live-dashboard-update-s1').click()
}

test('Shopee Final Report uploads a real dashboard and autofills all 16 main KPIs', async ({ page }) => {
  await gotoAppRoute(page, '/reports')
  await expect(page.getByTestId('open-final-report-modal')).toBeVisible()
  await page.getByTestId('open-final-report-modal').click()
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

test('TikTok Final Report uploads a real dashboard and autofills all 19 KPIs', async ({ page }) => {
  test.setTimeout(180_000)
  await openTikTokFinalReport(page)
  await expectSelectedPlatform(page.getByTestId('report-platform-selector'), 'TikTok Shop')
  await runReportOcr(
    page,
    fixturePath('tiktok-dashboard.jpg'),
    tiktokMetrics,
    tiktokKnownLabels,
  )
  await assertTikTokCorrectedText(
    page.getByTestId('report-ocr-corrected-text'),
    page.getByTestId('report-ocr-raw-diagnostics'),
  )
})

test('TikTok Live Dashboard Update uploads a real dashboard and autofills all 19 KPIs', async ({ page }) => {
  test.setTimeout(180_000)
  await prepareTikTokShiftForLiveUpdate(page)
  await expectSelectedPlatform(page.getByTestId('live-platform-selector'), 'TikTok Shop')
  await runLiveOcr(
    page,
    fixturePath('tiktok-dashboard.jpg'),
    tiktokMetrics,
    tiktokKnownLabels,
  )
  await assertTikTokCorrectedText(
    page.getByTestId('live-ocr-corrected-text'),
    page.getByTestId('live-ocr-raw-diagnostics'),
  )
})
