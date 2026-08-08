import path from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'

test.use({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })

const fixture = path.join(process.cwd(), 'e2e', 'fixtures', 'ocr', 'tiktok-layout-variants', 'tiktok-reference.jpg')

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

type ResponseMode = 'success' | 'conflict' | 'timeout'

function visionResponse(
  mode: Exclude<ResponseMode, 'timeout'>,
  overrides: Partial<Record<keyof typeof tiktokMetrics, number>> = {},
) {
  return {
    ok: true,
    data: {
      provider: 'mock',
      model: 'deterministic-mock-v1',
      metrics: Object.entries(tiktokMetrics).map(([key, originalValue], index) => {
        const overriddenValue = overrides[key as keyof typeof tiktokMetrics] ?? originalValue
        const value = mode === 'conflict' && key === 'gmv' ? overriddenValue + 1 : overriddenValue
        return {
          key,
          value,
          rawText: String(value),
          confidence: 0.99,
          state: mode === 'conflict' && index === 0 ? 'review_required' : 'confirmed',
          reasoningCode: mode === 'conflict' && index === 0 ? 'conflict' : 'direct_read',
        }
      }),
      warnings: [],
      latencyMs: 5,
    },
  }
}

async function fulfillVision(
  route: Route,
  mode: ResponseMode,
  overrides: Partial<Record<keyof typeof tiktokMetrics, number>> = {},
) {
  if (mode === 'timeout') {
    await route.fulfill({
      status: 504,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'AI_OCR_TIMEOUT', message: 'AI Vision OCR timed out.' } }),
    })
    return
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(visionResponse(mode, overrides)) })
}

async function fulfillVisionError(route: Route, code: string, message: string) {
  await route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code, message } }),
  })
}

async function gotoOk(page: Page, url: string) {
  await expect.poll(async () => (await page.goto(url, { waitUntil: 'domcontentloaded' }))?.status(), {
    timeout: 30_000,
  }).toBe(200)
}

async function openFinalReport(page: Page) {
  await gotoOk(page, '/live')
  await page.getByTestId('open-live-session-s1').click()
  await page.getByTestId('open-final-report-modal').click()
  await expect(page.getByTestId('report-platform-selector')).toContainText('TikTok Shop')
  await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixture)
  await expect(page.getByTestId('ocr-crop-selection')).toBeVisible()
}

async function openLiveUpdate(page: Page) {
  await gotoOk(page, '/calendar')
  await page.getByTestId('calendar-event-s1').click()
  await page.getByTestId('edit-shift-detail').click()
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Edit Shift', exact: true }) })
  await dialog.getByText('Status', { exact: true }).locator('..').getByRole('combobox').click()
  await page.getByRole('option', { name: 'Preparing', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.keyboard.press('Escape')
  await page.getByTestId('sidebar-live').click()
  await page.getByTestId('open-live-dashboard-update-s1').click()
  await expect(page.getByTestId('live-platform-selector')).toContainText('TikTok Shop')
  await page.getByTestId('live-dashboard-image-upload').setInputFiles(fixture)
  await expect(page.getByTestId('ocr-crop-selection')).toBeVisible()
}

async function acceptPrivacy(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: /AI image processing notice|Thông báo xử lý ảnh bằng AI/ })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /Continue|Tiếp tục/ }).click()
}

async function expectAllMetrics(page: Page, overrides: Partial<Record<keyof typeof tiktokMetrics, number>> = {}) {
  await page.getByTestId('ocr-metric-filter-all').click()
  for (const [key, originalValue] of Object.entries(tiktokMetrics)) {
    const value = overrides[key as keyof typeof tiktokMetrics] ?? originalValue
    await expect(page.getByTestId(`ocr-metric-input-${key}`)).toHaveValue(String(value))
  }
}

async function runQuickScan(page: Page, buttonTestId: 'report-run-ocr-button' | 'live-run-ocr-button') {
  const button = page.getByTestId(buttonTestId)
  await button.click()
  await expect(button).toBeDisabled({ timeout: 5_000 })
  await expect(button).toBeEnabled({ timeout: 180_000 })
}

async function closeCurrentForm(page: Page) {
  await page.getByRole('button', { name: /Cancel|Hủy/, exact: true }).last().click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem('livestream-ops-ai-ocr-privacy-consent-v1'))
})

test('Quick scan remains local and never calls the AI Vision route', async ({ page }) => {
  test.setTimeout(180_000)
  let calls = 0
  await page.route('**/api/ocr/vision', async route => {
    calls += 1
    await route.abort()
  })
  await openFinalReport(page)
  await page.getByTestId('report-run-ocr-button').click()
  await expect.poll(
    () => page.getByTestId('report-ocr-completion-status').getAttribute('data-ocr-status'),
    { timeout: 180_000 },
  ).toBe('review_required')
  expect(calls).toBe(0)
  expect(await page.evaluate(() => localStorage.getItem('livestream-ops-ai-ocr-privacy-consent-v1'))).toBeNull()
})

test('Final Report sends only the selected crop after consent, blocks duplicate requests, autofills and preserves values on failure', async ({ page }) => {
  test.setTimeout(120_000)
  let mode: ResponseMode = 'success'
  let calls = 0
  let multipartBody = ''
  await page.route('**/api/ocr/vision', async route => {
    calls += 1
    multipartBody = route.request().postDataBuffer()?.toString('latin1') || ''
    if (calls === 1) await new Promise(resolve => setTimeout(resolve, 350))
    await fulfillVision(route, mode)
  })

  await openFinalReport(page)
  const cropBefore = await page.getByTestId('ocr-crop-selection').evaluate(element => ({
    left: element.getAttribute('data-crop-left'),
    top: element.getAttribute('data-crop-top'),
    width: element.getAttribute('data-crop-width'),
    height: element.getAttribute('data-crop-height'),
  }))

  await page.getByTestId('vision-ocr-mode-ai').click()
  expect(calls).toBe(0)
  await acceptPrivacy(page)
  await expect(page.getByTestId('vision-ocr-mode-ai')).toBeDisabled()
  await expect(page.getByTestId('vision-ocr-mode-compare')).toBeDisabled()
  await expect.poll(() => calls).toBe(1)
  await expect(page.getByTestId('vision-ocr-review-panel')).toBeVisible()
  await expect(page.getByTestId('vision-ocr-review-panel').locator('tbody tr')).toHaveCount(19)
  await expectAllMetrics(page)
  expect(multipartBody).toContain('selected-kpi-crop.png')
  expect(multipartBody).toContain('name="crop_width"')
  expect(multipartBody).toContain('name="crop_height"')
  expect(multipartBody).not.toContain('tiktok-reference.jpg')
  expect(await page.evaluate(() => localStorage.getItem('livestream-ops-ai-ocr-privacy-consent-v1'))).toBe('accepted')

  await page.getByTestId('ocr-metric-input-gmv').fill('999')
  mode = 'timeout'
  await page.getByTestId('vision-ocr-mode-ai').click()
  await expect.poll(() => calls).toBe(2)
  await expect(page.getByText(/timed out|quá thời gian/i).last()).toBeVisible()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')
  await expect(page.getByTestId('ocr-crop-selection')).toHaveAttribute('data-crop-left', cropBefore.left || '')
  await expect(page.getByTestId('ocr-crop-selection')).toHaveAttribute('data-crop-top', cropBefore.top || '')
  await expect(page.getByTestId('ocr-crop-selection')).toHaveAttribute('data-crop-width', cropBefore.width || '')
  await expect(page.getByTestId('ocr-crop-selection')).toHaveAttribute('data-crop-height', cropBefore.height || '')
})

test('Final Report comparison keeps a real OCR conflict unresolved until the user chooses a source', async ({ page }) => {
  test.setTimeout(240_000)
  let mode: Exclude<ResponseMode, 'timeout'> = 'conflict'
  await page.route('**/api/ocr/vision', route => fulfillVision(route, mode))
  await openFinalReport(page)
  await page.getByTestId('vision-ocr-mode-compare').click()
  await acceptPrivacy(page)
  await expect(page.getByTestId('vision-ocr-review-panel')).toBeVisible({ timeout: 180_000 })
  const row = page.getByTestId('vision-ocr-review-gmv')
  await expect(row).toContainText(String(tiktokMetrics.gmv))
  await expect(row).toContainText(String(tiktokMetrics.gmv + 1))
  await expect(row).toContainText(/Different|Khác/)
  await row.getByRole('button', { name: /Choose OCR|Chọn OCR/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv))
  await row.getByRole('button', { name: /Choose AI|Chọn AI/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv + 1))
  await row.getByRole('spinbutton', { name: /Manual value|Giá trị thủ công/ }).fill('777')
  await row.getByRole('button', { name: /Manual|Thủ công/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('777')

  mode = 'success'
  await page.getByTestId('vision-ocr-mode-ai').click()
  await expect(page.getByTestId('vision-ocr-review-gmv')).toContainText(/manual/)
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('777')
})

test('Final Report protects manual values across Quick, AI and Compare until an explicit source or new draft is chosen', async ({ page }) => {
  test.setTimeout(420_000)
  let mode: Exclude<ResponseMode, 'timeout'> = 'success'
  await page.route('**/api/ocr/vision', route => fulfillVision(route, mode, { comments: 345 }))
  await openFinalReport(page)

  await runQuickScan(page, 'report-run-ocr-button')
  await page.getByTestId('ocr-metric-input-gmv').fill('999')
  await runQuickScan(page, 'report-run-ocr-button')
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')

  await page.getByTestId('vision-ocr-mode-ai').click()
  await acceptPrivacy(page)
  await expect(page.getByTestId('vision-ocr-mode-ai')).toBeEnabled({ timeout: 120_000 })
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')
  await expect(page.getByTestId('ocr-metric-input-comments')).toHaveValue('345')

  mode = 'conflict'
  await page.getByTestId('vision-ocr-mode-compare').click()
  await expect(page.getByTestId('vision-ocr-mode-compare')).toBeEnabled({ timeout: 180_000 })
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')
  const row = page.getByTestId('vision-ocr-review-gmv')
  await row.getByRole('button', { name: /Choose OCR|Chọn OCR/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv))
  await row.getByRole('button', { name: /Choose AI|Chọn AI/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv + 1))

  await closeCurrentForm(page)
  await page.getByTestId('open-final-report-modal').click()
  await page.getByTestId('report-dashboard-image-upload').setInputFiles(fixture)
  await page.getByTestId('vision-ocr-mode-ai').click()
  await expect(page.getByTestId('vision-ocr-mode-ai')).toBeEnabled({ timeout: 120_000 })
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv + 1))
})

test('disabled and unconfigured AI responses are distinct and leave local controls available', async ({ page }) => {
  test.setTimeout(240_000)
  let code = 'AI_OCR_DISABLED'
  let message = 'AI Vision OCR is disabled.'
  await page.route('**/api/ocr/vision', route => fulfillVisionError(route, code, message))
  await openFinalReport(page)
  await page.getByTestId('vision-ocr-mode-ai').click()
  await acceptPrivacy(page)
  await expect(page.getByText(/disabled|đã tắt/i).last()).toBeVisible()
  await expect(page.getByTestId('report-run-ocr-button')).toBeEnabled()

  code = 'AI_PROVIDER_NOT_CONFIGURED'
  message = 'AI Vision OCR provider is not configured.'
  await page.getByTestId('vision-ocr-mode-ai').click()
  await expect(page.getByText(/not configured|chưa được cấu hình/i).last()).toBeVisible()
  await expect(page.getByTestId('report-run-ocr-button')).toBeEnabled()
  await expect(page.getByTestId('vision-ocr-ai-status')).toContainText(/Unavailable|Không khả dụng/)
  await expect(page.getByTestId('vision-ocr-run-message')).toContainText(/Quick scan|Quét nhanh/)

  code = 'AUTHENTICATION_REQUIRED'
  message = 'Authentication required.'
  await page.getByTestId('vision-ocr-mode-ai').click()
  await expect(page.getByTestId('vision-ocr-run-message')).toContainText(/Sign in again|đăng nhập lại/i)

  code = 'AI_PROVIDER_NOT_CONFIGURED'
  message = 'AI Vision OCR provider is not configured.'
  await page.getByTestId('vision-ocr-mode-compare').click()
  await expect(page.getByTestId('vision-ocr-local-status')).toContainText(/Completed|Đã hoàn tất/, { timeout: 180_000 })
  await expect(page.getByTestId('vision-ocr-ai-status')).toContainText(/Unavailable|Không khả dụng/)
})

test('Live Dashboard Update applies deterministic AI Vision results to all 19 visible fields', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/api/ocr/vision', route => fulfillVision(route, 'success'))
  await openLiveUpdate(page)
  await page.getByTestId('vision-ocr-mode-ai').click()
  await acceptPrivacy(page)
  await expect(page.getByTestId('vision-ocr-review-panel')).toBeVisible()
  await expectAllMetrics(page)
  await page.getByTestId('ocr-metric-filter-data').click()
  await page.getByTestId('ocr-metric-filter-all').click()
  await expectAllMetrics(page)
})

test('Live Dashboard Update protects manual values across Quick, AI and Compare and resets them for a new modal context', async ({ page }) => {
  test.setTimeout(420_000)
  let mode: Exclude<ResponseMode, 'timeout'> = 'success'
  await page.route('**/api/ocr/vision', route => fulfillVision(route, mode, { comments: 345 }))
  await openLiveUpdate(page)

  await runQuickScan(page, 'live-run-ocr-button')
  await page.getByTestId('ocr-metric-input-gmv').fill('999')
  await runQuickScan(page, 'live-run-ocr-button')
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')

  await page.getByTestId('vision-ocr-mode-ai').click()
  await acceptPrivacy(page)
  await expect(page.getByTestId('vision-ocr-mode-ai')).toBeEnabled({ timeout: 120_000 })
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')
  await expect(page.getByTestId('ocr-metric-input-comments')).toHaveValue('345')

  mode = 'conflict'
  await page.getByTestId('vision-ocr-mode-compare').click()
  await expect(page.getByTestId('vision-ocr-mode-compare')).toBeEnabled({ timeout: 180_000 })
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue('999')
  const row = page.getByTestId('vision-ocr-review-gmv')
  await row.getByRole('button', { name: /Choose OCR|Chọn OCR/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv))
  await row.getByRole('button', { name: /Choose AI|Chọn AI/ }).click()
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv + 1))

  await closeCurrentForm(page)
  await page.getByTestId('open-live-dashboard-update-s1').click()
  await page.getByTestId('live-dashboard-image-upload').setInputFiles(fixture)
  await page.getByTestId('vision-ocr-mode-ai').click()
  await expect(page.getByTestId('vision-ocr-mode-ai')).toBeEnabled({ timeout: 120_000 })
  await expect(page.getByTestId('ocr-metric-input-gmv')).toHaveValue(String(tiktokMetrics.gmv + 1))
})

test('AI Vision configuration shell is visible to the current admin without exposing a secret input', async ({ page }) => {
  await gotoOk(page, '/settings')
  await page.getByRole('tab', { name: /Integrations|Tích hợp/ }).click()
  await expect(page.getByText('AI Vision OCR', { exact: true })).toBeVisible()
  await expect(page.getByText(/Not configured|Chưa cấu hình/)).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})
