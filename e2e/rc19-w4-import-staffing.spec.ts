import fs from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  'capture ảnh',
  'RC19_W4_Import_Staffing',
)

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

function todayInHoChiMinh(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

function buildXlsxBuffer(rows: Array<Record<string, unknown>>): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

async function seedMockSession(page: Page, userId: '1' | '2' | '3', language: 'vi' | 'en' = 'vi') {
  await page.addInitScript(
    ({ id, lang }) => {
      window.localStorage.setItem('livestream-ops-current-user', id)
      window.localStorage.setItem('livestream-ops-language', lang)
    },
    { id: userId, lang: language },
  )
}

async function uploadWorkbook(page: Page, name: string, rows: Array<Record<string, unknown>>) {
  const buffer = buildXlsxBuffer(rows)
  await page.locator('input[type="file"][accept=".xlsx,.xls"]').setInputFiles({
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  })
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(
    dims.scrollWidth,
    `${label}: horizontal overflow detected (scrollWidth=${dims.scrollWidth}, innerWidth=${dims.innerWidth})`,
  ).toBeLessThanOrEqual(dims.innerWidth + 1)
}

function buildKaoSegmentedRow(
  date: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    Date: date,
    Time: '08:00-22:00',
    Brand: 'TechGear Pro',
    Platform: 'Shopee Live',
    Studio: 'Studio KAO-W4-E2E',
    'Shift title': 'KAO W4 Segmented Shift',
    Agency: 'ada',
    'Execution Source': 'internal',
    'Số khung': 3,
    'Khung nhân sự':
      'K01 08:00-12:00 H2 T1 KT0\nK02 12:00-17:00 H1 T1 KT0\nK03 17:00-22:00 H2 T1 KT0',
    Host: 'K01: Mai, Lan\nK02: Hoa\nK03: Mai, Huong',
    Support: 'K01: Nam\nK02: Huy\nK03: Nam',
    Technical: '',
    ...overrides,
  }
}

test.describe('RC19 W4 Task B — Import Staffing Integrity & UI/UX E2E', () => {
  test.setTimeout(120_000)

  test('E2E-01..08: 52-row import pagination, KAO segments & KT0=0, inline edit, search/bulk, readback, safe update & agency conflict, Shift Detail & Calendar sync', async ({
    page,
  }) => {
    ensureScreenshotDir()
    const todayIso = todayInHoChiMinh()

    await page.setViewportSize({ width: 1440, height: 900 })
    await seedMockSession(page, '1', 'vi')
    await page.goto('/calendar?tab=import', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-route-readiness="ready"]')).toBeVisible({ timeout: 30_000 })

    // Build 52 valid rows: Row 1 = KAO 3-segment shift today, Rows 2..52 = distinct shifts on upcoming days
    const batch1Rows: Array<Record<string, unknown>> = [buildKaoSegmentedRow(todayIso)]
    for (let i = 1; i <= 51; i++) {
      batch1Rows.push({
        Date: addDaysIso(todayIso, i + 1),
        Time: '09:00-11:00',
        Brand: 'Fashion Nova',
        Platform: 'TikTok Shop',
        Studio: `Studio W4 Bulk ${i}`,
        'Shift title': `W4 Bulk Shift ${String(i).padStart(2, '0')}`,
        Agency: 'ada',
        'Execution Source': 'internal',
        'Số khung': '',
        'Khung nhân sự': '',
        Host: '1',
        Support: '1',
        Technical: '0',
      })
    }

    await uploadWorkbook(page, 'w4-52-rows.xlsx', batch1Rows)

    // 1) Pagination: 50 rows/page -> page 1 (1-50), page 2 (51-52), back to page 1
    const pagination = page.getByTestId('schedule-import-pagination')
    await expect(pagination).toBeVisible({ timeout: 15_000 })
    await expect(pagination).toContainText('1–50')
    await expect(pagination).toContainText('52')

    await pagination.getByRole('button', { name: 'Trang sau' }).click()
    await expect(pagination).toContainText('51–52')
    await expect(page.getByLabel('Row 53 shift title')).toBeVisible()

    await pagination.getByRole('button', { name: 'Trang trước' }).click()
    await expect(pagination).toContainText('1–50')

    // 2) KAO Preview Segments + Metrics (Peak 2/1/0, Pos 5/3/0, 37h, KT0=0 preserved)
    const firstPreviewSeg = page.getByTestId('schedule-preview-segments').first()
    await expect(firstPreviewSeg).toBeVisible()
    await expect(firstPreviewSeg).toContainText('3 khung')
    await expect(firstPreviewSeg).toContainText('Đỉnh 2/1/0')
    await expect(firstPreviewSeg).toContainText('Vị trí 5/3/0')
    await expect(firstPreviewSeg).toContainText('37h')
    await expect(firstPreviewSeg).toContainText('K01 08:00–12:00 · H:2 S:1 T:0')
    await expect(firstPreviewSeg).toContainText('K02 12:00–17:00 · H:1 S:1 T:0')
    await expect(firstPreviewSeg).toContainText('K03 17:00–22:00 · H:2 S:1 T:0')

    // 3) Inline edit Row 2 title + Enter must preserve staffing_segments & KT0=0
    const titleInput = page.getByLabel('Row 2 shift title')
    await titleInput.fill('KAO W4 Edited Before Confirm')
    await titleInput.press('Enter')
    await expect(titleInput).toHaveValue('KAO W4 Edited Before Confirm')
    await expect(page.getByTestId('schedule-preview-segments').first()).toContainText('3 khung')
    await expect(page.getByTestId('schedule-preview-segments').first()).toContainText('T:0')

    // 4) Filter by Brand & search, plus bulk selection controls
    const rowSearch = page.getByLabel(/Tìm dòng theo ca|Search rows by shift/i)
    await rowSearch.fill('KAO W4 Edited')
    await expect(page.getByTestId('schedule-preview-segments')).toHaveCount(1)
    await rowSearch.fill('')
    await expect(page.getByTestId('schedule-import-pagination')).toBeVisible()

    const selectRow2 = page.getByLabel('Select row 2', { exact: true })
    await selectRow2.check()
    await expect(page.getByTestId('schedule-import-bulk-bar')).toBeVisible()
    await selectRow2.uncheck()

    // 5) Confirm Import & verify 5-state outcome + DB readback badge
    const confirmButton = page.getByRole('button', { name: 'Xác nhận import' })
    await expect(confirmButton).toBeEnabled({ timeout: 15_000 })
    await confirmButton.click()

    const resultCard = page.getByTestId('schedule-import-result')
    await expect(resultCard).toBeVisible({ timeout: 30_000 })
    const breakdown = page.getByTestId('schedule-import-outcome-breakdown')
    await expect(breakdown).toContainText('Created: 52')
    await expect(breakdown).toContainText('Failed: 0')
    const readbackBadge = page.getByTestId('schedule-import-readback-status')
    await expect(readbackBadge).toContainText('DB Readback: Verified (52)')

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-import-result-desktop.png'),
      fullPage: true,
    })

    // 6) Safe re-import update: K02 host 1 -> 2, updated title (Before -> After diff 8 -> 9)
    await uploadWorkbook(page, 'w4-safe-update.xlsx', [
      buildKaoSegmentedRow(todayIso, {
        'Shift title': 'KAO W4 Safe Updated',
        'Khung nhân sự':
          'K01 08:00-12:00 H2 T1 KT0\nK02 12:00-17:00 H2 T1 KT0\nK03 17:00-22:00 H2 T1 KT0',
        Host: 'K01: Mai, Lan\nK02: Hoa, Linh\nK03: Mai, Huong',
      }),
    ])

    await expect(page.getByText(/Cập nhật an toàn: 8 → 9/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('schedule-preview-segments').first()).toContainText('Vị trí 6/3/0')

    await expect(confirmButton).toBeEnabled({ timeout: 15_000 })
    await confirmButton.click()
    await expect(page.getByTestId('schedule-import-result')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('schedule-import-outcome-breakdown')).toContainText('Updated: 1')
    await expect(page.getByTestId('schedule-import-readback-status')).toContainText('DB Readback: Verified (1)')

    // 7) Cross-agency conflict (existing ada vs incoming snap)
    await uploadWorkbook(page, 'w4-agency-conflict.xlsx', [
      buildKaoSegmentedRow(todayIso, {
        'Shift title': 'KAO W4 Conflicting Snap Title',
        Agency: 'snap',
        'Execution Source': 'agency',
      }),
    ])

    await expect(page.getByText(/Xung đột Agency: ada → snap/)).toBeVisible({ timeout: 15_000 })
    await expect(confirmButton).toBeEnabled({ timeout: 15_000 })
    await confirmButton.click()

    await expect(page.getByTestId('schedule-import-result')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('schedule-import-outcome-breakdown')).toContainText('Conflict: 1')
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-import-reimport-conflict.png'),
      fullPage: true,
    })

    // 8) Switch directly to Calendar tab via SPA click (no full page reload) & inspect Shift Detail
    await page.getByRole('tab', { name: 'Lịch ca' }).click()
    await page.getByRole('button', { name: 'Danh sách' }).click()

    const shiftCard = page.getByText('KAO W4 Safe Updated').first()
    await expect(shiftCard).toBeVisible({ timeout: 15_000 })
    await shiftCard.click()

    const viewFullShiftBtn = page.getByRole('button', { name: /viewFullShift|View Full Shift/i })
    await expect(viewFullShiftBtn).toBeVisible({ timeout: 10_000 })
    await viewFullShiftBtn.click()

    // Overview tab: segmented breakdown with K01..K03 and T: 0
    const overviewSegs = page.getByTestId('shift-detail-segments-section')
    await expect(overviewSegs).toBeVisible({ timeout: 10_000 })
    await expect(overviewSegs).toContainText('K01')
    await expect(overviewSegs).toContainText('K02')
    await expect(overviewSegs).toContainText('K03')
    await expect(overviewSegs).toContainText('T: 0')

    // Staffing tab: ShiftStaffingSegmentsPanel 7 metrics (Peak=2, Pos=6 after K02->2, Tech=0)
    await page.getByRole('tab', { name: 'Điều phối ca' }).click()
    await expect(page.getByTestId('shift-staffing-metrics-summary')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('shift-metric-host-peak')).toHaveText('2')
    await expect(page.getByTestId('shift-metric-host-positions')).toHaveText('6')
    await expect(page.getByTestId('shift-metric-technical-peak')).toHaveText('0')
    await expect(page.getByTestId('shift-metric-technical-positions')).toHaveText('0')
    await expect(page.getByTestId('shift-staffing-segments-breakdown')).toBeVisible()

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-shift-detail-staffing.png'),
      fullPage: true,
    })
  })

  test('E2E-09: Role guards — Leader allowed to import, Member blocked', async ({ browser }) => {
    // Leader ('2') allowed
    const leaderCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const leaderPage = await leaderCtx.newPage()
    await seedMockSession(leaderPage, '2', 'vi')
    await leaderPage.goto('/calendar?tab=import', { waitUntil: 'networkidle' })
    await expect(leaderPage.locator('[data-route-readiness="ready"]')).toBeVisible({ timeout: 20_000 })
    await expect(leaderPage.locator('input[type="file"][accept=".xlsx,.xls"]')).toBeAttached()
    await leaderCtx.close()

    // Member ('3') blocked
    const memberCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const memberPage = await memberCtx.newPage()
    await seedMockSession(memberPage, '3', 'vi')
    await memberPage.goto('/calendar?tab=import', { waitUntil: 'networkidle' })
    await expect(memberPage.locator('[data-route-readiness="ready"]')).toBeVisible({ timeout: 20_000 })
    await expect(memberPage.locator('input[type="file"][accept=".xlsx,.xls"]')).toHaveCount(0)
    await memberCtx.close()
  })

  test('E2E-10: Responsive layout & zero horizontal overflow at 390px, 320px, and 768px', async ({ page }) => {
    ensureScreenshotDir()
    const todayIso = todayInHoChiMinh()

    // 390x844 Mobile Import Preview
    await page.setViewportSize({ width: 390, height: 844 })
    await seedMockSession(page, '1', 'vi')
    await page.goto('/calendar?tab=import', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-route-readiness="ready"]')).toBeVisible({ timeout: 20_000 })

    await uploadWorkbook(page, 'w4-responsive.xlsx', [
      buildKaoSegmentedRow(todayIso, {
        Studio: 'Studio W4 Mobile Resp',
        'Shift title': 'KAO W4 Responsive Check',
      }),
    ])

    const mobileSegSummary = page.getByTestId('schedule-mobile-preview-segments').first()
    await expect(mobileSegSummary).toBeVisible({ timeout: 15_000 })
    await expect(mobileSegSummary).toContainText('3 khung')
    await expect(mobileSegSummary).toContainText('Đỉnh 2/1/0')
    await expect(mobileSegSummary).toContainText('37h')
    await assertNoHorizontalOverflow(page, '390px Import Preview')
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-mobile-390-preview.png'),
      fullPage: true,
    })

    // 320x700 Narrow Mobile Import Preview
    await page.setViewportSize({ width: 320, height: 700 })
    await expect(mobileSegSummary).toBeVisible()
    await assertNoHorizontalOverflow(page, '320px Import Preview')
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05-mobile-320-preview.png'),
      fullPage: true,
    })

    // Confirm import, then switch to 768x1024 Tablet & inspect Shift Detail Staffing tab
    const confirmButton = page.getByRole('button', { name: 'Xác nhận import' })
    await expect(confirmButton).toBeEnabled({ timeout: 15_000 })
    await confirmButton.click()
    await expect(page.getByTestId('schedule-import-result')).toBeVisible({ timeout: 20_000 })

    await page.setViewportSize({ width: 768, height: 1024 })
    await page.getByRole('tab', { name: 'Lịch ca' }).click()
    await page.getByRole('button', { name: 'Danh sách' }).click()

    const respShiftCard = page.getByText('KAO W4 Responsive Check').first()
    await expect(respShiftCard).toBeVisible({ timeout: 15_000 })
    await respShiftCard.click()

    const viewFullBtn = page.getByRole('button', { name: /viewFullShift|View Full Shift/i })
    await expect(viewFullBtn).toBeVisible({ timeout: 10_000 })
    await viewFullBtn.click()

    await page.getByRole('tab', { name: 'Điều phối ca' }).click()
    await expect(page.getByTestId('shift-staffing-metrics-summary')).toBeVisible({ timeout: 10_000 })
    await assertNoHorizontalOverflow(page, '768px Shift Detail Staffing')
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06-tablet-768-staffing.png'),
      fullPage: true,
    })
  })
})
