import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

async function identity(page: Page, role: string) {
  await page.addInitScript(id => { localStorage.setItem('livestream-ops-current-user', id); localStorage.setItem('livestream-ops-language', 'vi') }, role)
  await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: { ok: true, capabilities: { actual_staffing: false, team_performance: false, own_performance: false, payroll: false } } }))
}
for (const [role, name] of [['1', 'Admin'], ['2', 'Leader'], ['3', 'Member']] as const) for (const width of [1366, 1536, 1920, 390]) {
  test(`${name} Calendar at ${width}: views, URL, empty states and screenshots`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await identity(page, role)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const requests: Array<{ url: string; durationMs?: number; bytes?: number }> = []
    const started = new Map<string, number>()
    page.on('request', request => { if (/\/api\/|\/rest\/v1\//.test(request.url())) started.set(request.url(), Date.now()) })
    page.on('response', response => {
      const start = started.get(response.url())
      if (start !== undefined) requests.push({ url: response.url().replace(/\?.*$/, ''), durationMs: Date.now() - start, bytes: Number(response.headers()['content-length']) || undefined })
    })
    for (const view of ['month', 'week', 'day', 'list']) {
      const start = Date.now()
      await page.goto(`/calendar?tab=calendar&calendar_view=${view}&calendar_date=2026-10-14`)
      await expect(page.getByTestId('calendar-stable-header')).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${view}.png`), fullPage: true })
      await info.attach(`${view}-metrics.json`, { body: JSON.stringify({ view, width, role: name, domReadyMs: Date.now() - start, requests, methodology: 'Local isolated mock identity; not authenticated Supabase UAT or React commit duration' }), contentType: 'application/json' })
    }
    for (const tab of ['open', 'mine']) {
      await page.goto(`/calendar?tab=${tab}&${tab}_filters=${encodeURIComponent(JSON.stringify({ search: 'RC16L no matching records' }))}`)
      await expect(page.getByTestId(`registration-${tab}-search`)).toHaveValue('RC16L no matching records')
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${tab}.png`), fullPage: true })
    }
    await page.goto('/calendar?tab=calendar&calendar_view=day&calendar_date=2026-10-14')
    if (role === '3') await expect(page.getByTestId('export-schedule-dropdown-btn')).toHaveCount(0)
    else {
      await page.getByTestId('export-schedule-dropdown-btn').click()
      await expect(page.getByLabel('Phạm vi xuất')).toBeVisible()
      await page.getByLabel('Chế độ xuất').selectOption('select')
      await expect(page.getByText('Export All Authorized Fields', { exact: true })).toHaveCount(1)
      await page.screenshot({ path: info.outputPath(`${name}-${width}-export.png`), fullPage: true })
      await page.keyboard.press('Escape')
    }
    expect(errors).toEqual([])
  })
}

test('Calendar preserves URL view/date across reload and history navigation', async ({ page }) => {
  await identity(page, '1')
  await page.goto('/calendar?tab=calendar&calendar_view=day&calendar_date=2026-10-14&calendar_list_size=50')
  await page.getByRole('button', { name: /Ngày|Day/, exact: true }).click()
  await page.getByRole('button', { name: /Tuần|Week/, exact: true }).click()
  await expect(page).toHaveURL(/calendar_view=week/)
  await page.goBack()
  await expect(page).toHaveURL(/calendar_view=day/)
  await page.reload()
  await expect(page).toHaveURL(/calendar_date=2026-10-14/)
  expect(new URL(page.url()).searchParams.get('calendar_list_size')).toBe('50')
})

test('Dense Week opens grouped details and Day includes an overnight continuation', async ({ page }, info) => {
  await identity(page, '1')
  await page.route('**/api/operational-files', route => route.fulfill({ json: { ok: true, reused: true } }))
  const rows = Array.from({ length: 8 }, (_, index) => ({ Date: '2026-10-14', 'Start Time': index === 7 ? '23:00' : '09:00', 'End Time': index === 7 ? '02:00' : '10:00', Brand: 'TechGear Pro', Platform: 'TikTok Shop', 'Execution Source': 'Internal', 'Shift title': 'RC16L overlap ' + index, Studio: 'RC16L ' + index, 'Required Host count': 1, 'Required Support count': 1, 'Required Technical count': 1 }))
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Schedule')
  await page.goto('/calendar?tab=import')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'rc16l-synthetic.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) })
  await page.getByRole('button', { name: /Xác nhận import|Confirm import/ }).click()
  await expect(page.getByText(/Đã ghi 8 dòng ca/)).toBeVisible()
  await page.getByTestId('calendar-stable-tabs').getByRole('tab', { name: 'Lịch ca', exact: true }).click()
  await page.getByRole('button', { name: /Tuần|Week/, exact: true }).click()
  // Native URL state keeps the in-memory local import intact.
  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set('calendar_date', '2026-10-14'); history.pushState(null, '', url) })
  await page.getByTestId('calendar-search').fill('RC16L overlap')
  const group = page.locator('[data-testid^="week-overlap-2026-10-14-"]')
  await expect(group).toHaveCount(1)
  await expect(group).toContainText('7')
  await group.click()
  await expect(page.getByRole('dialog').last().getByRole('heading')).toContainText('7')
  await page.screenshot({ path: info.outputPath('overlap-detail.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Ngày|Day/, exact: true }).click()
  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set('calendar_date', '2026-10-15'); history.pushState(null, '', url) })
  await expect(page.getByText('Tiếp từ ngày 2026-10-14')).toBeVisible()
  await page.screenshot({ path: info.outputPath('overnight-day.png'), fullPage: true })
})
