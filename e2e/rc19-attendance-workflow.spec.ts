import { expect, test } from '@playwright/test'

for (const [language, width] of [['vi', 390], ['en', 1440]] as const) {
  test(`U06 attendance import workflow ${language} ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(lang => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', lang)
    }, language)

    let previewCalls = 0
    let confirmCalls = 0
    await page.route('**/api/workforce/attendance-import', async route => {
      const body = route.request().postDataJSON()
      if (body.action === 'preview') {
        previewCalls++
        expect(body.sourceName).toBe('uploaded-from-sheets')
        expect(body.dateOrder).toBe('month-first')
        expect(body.sourceType).toBe('google_sheets')
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true,
          summary: { batchId: 'uat-batch', sourceName: body.sourceName, totalRows: 1, matchedRows: 1, exceptionRows: 0, draftedSegments: 0, exceptionsSummary: {} },
          results: [{ rowNumber: 1, status: 'matched', segment: { rowNumber: 1, parsedDate: '2026-10-10', startTime: '09:00', endTime: '13:00', durationMinutes: 240, rawStaffName: 'Sample Staff', operationalRole: 'host', evidenceKind: 'actual_punch', coverageKind: 'primary' } }],
        }) })
      } else {
        confirmCalls++
        expect(body).toEqual({ action: 'confirm_drafts', batchId: 'uat-batch' })
        await route.fulfill({ status: confirmCalls === 1 ? 500 : 200, contentType: 'application/json', body: JSON.stringify(confirmCalls === 1 ? { ok: false, error: { code: 'CONFIRM_FAILED' } } : { ok: true, createdCount: 1 }) })
      }
    })

    await page.goto('/staffing?tab=attendance')
    const manager = page.getByTestId('attendance-source-manager')
    await expect(manager).toBeVisible({ timeout: 30_000 })
    await expect(manager.getByRole('navigation')).toBeVisible()
    await manager.getByRole('button', { name: language === 'en' ? 'Paste Sheets' : 'Dán Sheets' }).click()
    await manager.getByRole('textbox', { name: language === 'en' ? 'Source name' : 'Tên nguồn' }).fill('uploaded-from-sheets')
    await manager.getByRole('textbox', { name: language === 'en' ? 'Paste attendance rows' : 'Dán dữ liệu chấm công' }).fill('Ngày (MM/DD/YYYY)\tKhung giờ\tHost\tCheck-in\tCheck-out\n10/10/2026\t09:00 - 13:00\tSample Staff\t09:00\t13:00')
    await manager.getByRole('button', { name: language === 'en' ? /Parse pasted rows/ : /Đọc dữ liệu dán/ }).click()
    await manager.getByRole('button', { name: language === 'en' ? 'Paste Sheets' : 'Dán Sheets' }).click()
    await expect(manager.getByRole('textbox', { name: language === 'en' ? 'Source name' : 'Tên nguồn' })).toHaveValue('uploaded-from-sheets')
    await manager.locator('select').first().selectOption('pepsico_t10')
    await manager.locator('select').first().selectOption('opella_t10')
    const next = manager.getByRole('button', { name: language === 'en' ? 'Continue' : 'Tiếp tục' })
    await next.click()
    await expect(manager.getByText(language === 'en' ? 'Read rows: 1' : 'Dữ liệu đã đọc: 1')).toBeVisible()
    await next.click()
    await manager.getByRole('button', { name: language === 'en' ? 'Run matching' : 'Chạy đối chiếu' }).click()
    await expect(manager.getByTestId('reconciliation-tiles')).toBeVisible()
    expect(previewCalls).toBe(1)
    await next.click()
    await expect(manager.getByText(language === 'en' ? 'No exceptions found.' : 'Không có dòng ngoại lệ.')).toBeVisible()
    await next.click()
    const confirm = manager.getByRole('button', { name: language === 'en' ? 'Confirm DRAFT attendance' : 'Xác nhận chấm công DRAFT' })
    await page.screenshot({ path: `test_reports/rc19-u06/after-${language}-${width}.png`, fullPage: true })
    await confirm.click()
    await expect(manager.getByRole('alert')).toContainText('CONFIRM_FAILED')
    await confirm.click()
    await expect(confirm).toBeDisabled()
    expect(confirmCalls).toBe(2)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}

test('U06 missing columns and ambiguous dates stay visible before matching', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.goto('/staffing?tab=attendance')
  const manager = page.getByTestId('attendance-source-manager')
  await expect(manager).toBeVisible({ timeout: 30_000 })
  await manager.getByRole('button', { name: 'Continue' }).click()
  await expect(manager.getByRole('alert')).toContainText('source name')
  await manager.getByRole('button', { name: 'Paste Sheets' }).click()
  await manager.getByRole('textbox', { name: 'Source name' }).fill('manual-sheet')
  await manager.getByRole('textbox', { name: 'Paste attendance rows' }).fill('MyDate\tKhung giờ\tHost\n99/99/2026\t09:00 - 13:00\tSample Staff')
  await manager.getByRole('button', { name: /Parse pasted rows/ }).click()
  await manager.getByRole('button', { name: 'Continue' }).click()
  await expect(manager.getByText(/invalid or ambiguous dates/)).toBeVisible()
  await manager.getByRole('button', { name: 'Continue' }).click()
  await expect(manager.getByRole('alert')).toContainText('Missing columns')
  await manager.getByRole('textbox', { name: 'Date column mapping' }).fill('MyDate')
  await manager.getByRole('button', { name: 'Continue' }).click()
  await expect(manager.getByRole('button', { name: 'Run matching' })).toBeVisible()
})

test('U06 uploaded CSV uses its real name and blocks missing mapped columns', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.goto('/staffing?tab=attendance')
  const manager = page.getByTestId('attendance-source-manager')
  await expect(manager).toBeVisible({ timeout: 30_000 })
  await manager.locator('input[type="file"]').setInputFiles({
    name: 'actual-attendance.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('MyDate,Khung giờ,Host\n10/10/2026,09:00 - 13:00,Sample Staff'),
  })
  await expect(manager.getByText(/actual-attendance\.csv/).first()).toBeVisible()
  await manager.getByRole('button', { name: 'Continue' }).click()
  await manager.getByRole('button', { name: 'Continue' }).click()
  await expect(manager.getByRole('alert')).toContainText('Missing columns')
  await expect(manager.getByRole('alert')).toContainText('Ngày (MM/DD/YYYY)')
})
