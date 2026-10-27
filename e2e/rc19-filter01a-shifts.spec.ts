import { expect, test } from '@playwright/test'
import * as XLSX from 'xlsx'

for (const role of ['1', '2', '3']) {
  for (const width of [390, 1440]) {
    test(`Shift brand and platform filters role ${role} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(id => {
        localStorage.setItem('livestream-ops-current-user', id)
        localStorage.setItem('livestream-ops-language', 'en')
      }, role)
      await page.goto('/shifts?shifts_range=all&shifts_size=10')
      const layout = width < 768 ? 'mobile' : 'desktop'
      const brand = page.getByTestId(`shifts-${layout}-brand-filter`)
      const platform = page.getByTestId(`shifts-${layout}-platform-filter`)
      await expect(brand.locator('option[value="b1"]')).toHaveCount(1)
      await expect(platform.locator('option[value="p1"]')).toHaveCount(1)
      await brand.selectOption('b1')
      await expect(page).toHaveURL(/shifts_brand=b1/)
      await platform.selectOption('p2')
      await expect(page).toHaveURL(/shifts_platform=p2/)
      const rows = width < 768 ? page.locator('[data-testid^="shift-mobile-card-"]') : page.locator('[data-testid^="data-table-row-"]')
      await expect(rows).toHaveCount(0)
      await platform.selectOption('p1')
      await expect(rows).toHaveCount(2)
      await expect(page.locator('h1').first().locator('..').locator('p')).toContainText('2')
      expect(new URL(page.url()).searchParams.get('shifts_page')).toBeNull()
      await page.reload()
      await expect(brand).toHaveValue('b1')
      await expect(platform).toHaveValue('p1')
      await expect(rows).toHaveCount(2)
      await platform.selectOption('')
      await expect(platform).toHaveValue('')
      await page.goBack()
      await expect(platform).toHaveValue('p1')
      await page.goForward()
      await expect(platform).toHaveValue('')
      await page.getByRole('button', { name: 'Reset brand and platform' }).filter({ visible: true }).click()
      await expect(brand).toHaveValue('')
      await expect(platform).toHaveValue('')
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    })
  }
}

test('desktop selection clears on filter history and export uses the same filter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.goto('/shifts?shifts_range=all&shifts_size=10')
  const brand = page.getByTestId('shifts-desktop-brand-filter')
  const platform = page.getByTestId('shifts-desktop-platform-filter')
  await expect(brand.locator('option[value="b1"]')).toHaveCount(1)
  await page.getByTestId('shift-row-checkbox').first().click()
  await expect(page.getByTestId('bulk-selected-badge')).toBeVisible()
  await brand.selectOption('b1')
  await expect(page.getByTestId('bulk-selected-badge')).toHaveCount(0)
  await platform.selectOption('p1')
  await expect(page.locator('[data-testid^="data-table-row-"]')).toHaveCount(2)
  await page.getByTestId('shift-row-checkbox').first().click()
  await expect(page.getByTestId('bulk-selected-badge')).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('bulk-selected-badge')).toHaveCount(0)
  await page.goForward()
  await expect(page.getByTestId('bulk-selected-badge')).toHaveCount(0)
  await page.getByTestId('import-export-btn').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Export All Shifts (2)' })).toBeVisible()
  const pendingDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export All Shifts (2)' }).click()
  const download = await pendingDownload
  const workbook = XLSX.readFile(await download.path())
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]])
  expect(rows).toHaveLength(2)
})

test('switching mock accounts removes the previous actor rows and selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.goto('/shifts?shifts_range=all&shifts_brand=b1&shifts_platform=p1')
  await expect(page.locator('[data-testid^="data-table-row-"]')).toHaveCount(2)
  await page.getByTestId('shift-row-checkbox').first().click()
  await expect(page.getByTestId('bulk-selected-badge')).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user', '4')
    window.dispatchEvent(new CustomEvent('livestream-ops-current-user-change', { detail: '4' }))
  })
  await expect(page.getByTestId('bulk-selected-badge')).toHaveCount(0)
  await expect(page.locator('[data-testid^="data-table-row-"]')).toHaveCount(0)
  await expect(page.locator('h1').first().locator('..').locator('p')).toContainText('0')
})

test('combined filters keep all matching rows across page sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.route('**/api/operational-files', route => route.fulfill({ json: { ok: true, reused: true } }))
  const fixture = Array.from({ length: 37 }, (_, index) => ({
    Date: '2026-10-14', 'Start Time': `09:${String(index).padStart(2, '0')}`, 'End Time': '10:30',
    Brand: 'TechGear Pro', Platform: 'TikTok Shop', 'Execution Source': 'Internal',
    'Shift title': `FILTER01A fixture ${index}`, Studio: `Fixture ${index}`,
    'Required Host count': 1, 'Required Support count': 1, 'Required Technical count': 1,
  }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(fixture), 'Schedule')
  await page.goto('/calendar?tab=import')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'filter01a-local.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) })
  await page.getByRole('button', { name: 'Confirm import' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Import completed' })).toBeVisible()
  await page.getByRole('link', { name: 'Shifts', exact: true }).click()
  await page.getByTestId('shifts-desktop-date-mode').selectOption('all')
  await page.getByTestId('data-table-search-input').fill('FILTER01A')
  await page.getByTestId('shifts-desktop-brand-filter').selectOption('b1')
  await page.getByTestId('shifts-desktop-platform-filter').selectOption('p1')
  const total = page.locator('h1').first().locator('..').locator('p')
  await expect(total).toContainText('37')
  const rows = page.locator('[data-testid^="data-table-row-"]')
  const size = page.getByRole('combobox', { name: 'records per page' })
  for (const [value, firstCount, lastCount] of [['10', 10, 7], ['20', 20, 17], ['50', 37, 37]] as const) {
    await size.click()
    await page.getByRole('option', { name: value, exact: true }).click()
    await expect(rows).toHaveCount(firstCount)
    if (value !== '50') {
      await page.getByRole('button', { name: 'Last page', exact: true }).click()
      await expect(rows).toHaveCount(lastCount)
      await expect(total).toContainText('37')
      if (value === '10') {
        await page.getByTestId('shifts-desktop-platform-filter').selectOption('p2')
        await expect.poll(() => new URL(page.url()).searchParams.get('shifts_page')).toBeNull()
        await expect(total).toContainText('0')
        await page.getByTestId('shifts-desktop-platform-filter').selectOption('p1')
        await expect(total).toContainText('37')
        await expect(rows).toHaveCount(10)
      }
    }
  }
})
