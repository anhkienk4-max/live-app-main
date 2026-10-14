import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

// Local mock identity and local workbook fixture only. No cloud writes or runtime fixture constants.
async function localIdentity(page: Page, role = '1') {
  await page.addInitScript(id => {
    localStorage.setItem('livestream-ops-current-user', id)
    localStorage.setItem('livestream-ops-language', 'vi')
  }, role)
  await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: { ok: true, capabilities: { actual_staffing: false, team_performance: false, own_performance: false, payroll: false } } }))
}
for (const [role, name] of [['1', 'Admin'], ['2', 'Leader'], ['3', 'Member']] as const) {
  test('Bounded Global Search and selection for ' + name, async ({ page }) => {
    await localIdentity(page, role)
    const calls: string[] = []
    await page.route('**/api/operations/collection?**', route => {
      const params = new URL(route.request().url()).searchParams
      const entity = params.get('entity') || ''
      calls.push(entity)
      if (params.get('filters')?.includes('needle')) {
        expect(params.get('pageSize')).toBe('10')
        expect(params.get('page')).toBe('1')
      }
      const items = entity === 'brands' ? [{ id: 'brand-needle', name: 'Needle Brand' }] : []
      return route.fulfill({ json: { items, total: items.length, page: 1, pageSize: Number(params.get('pageSize') || 20) } })
    })
    await page.goto('/')
    await page.getByRole('button', { name: /search|tìm/i }).first().click()
    await page.getByPlaceholder('Search shifts, staff, brands, campaigns...').fill('needle')
    await expect(page.getByRole('button', { name: /Needle Brand/ })).toBeVisible()
    expect(calls.filter(entity => entity === 'staff')).toHaveLength(role === '1' ? 1 : 0)
    await page.getByRole('button', { name: /Needle Brand/ }).click()
    await expect(page).toHaveURL(/\/brands$/)
  })
}
for (const [role, name] of [['1', 'Admin'], ['2', 'Leader'], ['3', 'Member']] as const) {
  test('Registration review and Analytics role ' + name, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await localIdentity(page, role)
    await page.goto('/staffing?tab=registration')
    if (role === '3') await expect(page.getByTestId('registration-review-workspace')).toHaveCount(0)
    else {
      await expect(page.getByTestId('registration-review-workspace')).toBeVisible()
      await expect(page.getByRole('button', { name: /Trang.*|page/i }).last()).toBeVisible()
    }
    await page.goto('/analytics')
    await expect(page.getByTestId('analytics-loading-shell')).toHaveCount(0)
    await expect(page.locator('main').first()).toBeVisible()
    expect(errors).toEqual([])
  })
}
for (const role of ['1', '2', '3']) for(const width of [1440,1024,768,390]) {
  test('All five Calendar tabs retain one stable H1 and navigation for role ' + role+' width '+width, async ({ page },info) => {
    await page.setViewportSize({width,height:1000})
    await localIdentity(page, role)
    await page.goto('/calendar?tab=calendar&preserve=rc16k')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lịch')
    const title = await page.getByRole('heading', { level: 1 }).boundingBox()
    const navigation = await page.getByTestId('calendar-stable-tabs').boundingBox()
    for (const tab of ['Ca đang mở', 'Ca của tôi', 'Import lịch', 'Lịch sử import', 'Lịch ca']) {
      await page.getByTestId('calendar-stable-tabs').getByRole('tab', { name: tab, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lịch')
      expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.y).toBe(title!.y)
      expect((await page.getByTestId('calendar-stable-tabs').boundingBox())!.y).toBe(navigation!.y)
      expect(new URL(page.url()).searchParams.get('preserve')).toBe('rc16k')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await page.getByRole('button', { name: 'Ca mới', exact: true }).count()).toBeLessThanOrEqual(role === '3' ? 0 : 1)
    }
    await page.screenshot({path:info.outputPath('calendar-'+width+'.png'),fullPage:true})
    await page.getByTestId('calendar-stable-tabs').getByRole('tab',{name:'Lịch ca',exact:true}).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('calendar-stable-tabs').getByRole('tab',{name:'Ca đang mở',exact:true})).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('calendar-stable-tabs').getByRole('tab',{name:'Ca đang mở',exact:true})).toHaveAttribute('aria-selected','true')
    await page.goBack()
    await page.goBack()
    await expect(page.getByTestId('calendar-stable-tabs').getByRole('tab', { name: 'Lịch sử import', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.goForward()
    await expect(page.getByTestId('calendar-stable-tabs').getByRole('tab', { name: 'Lịch ca', exact: true })).toHaveAttribute('aria-selected', 'true')
  })
}
test('117 local imported shifts paginate in Card, Compact and Table without archive retry duplicates', async ({ page }) => {
  await localIdentity(page)
  let archiveCalls = 0
  const archiveBodies: string[] = []
  await page.route('**/api/operational-files', async route => {
    archiveCalls++
    archiveBodies.push(route.request().postData() ?? '')
    if (archiveCalls <= 2) return route.fulfill({ status: 409, json: { ok: false, error: { code: 'STORAGE_ROUTE_NOT_CONFIGURED' } } })
    return route.fulfill({ json: { ok: true, reused: true } })
  })
  const rows = Array.from({ length: 117 }, (_, i) => ({
    Date: '2099-01-' + String(Math.floor(i / 12) + 1).padStart(2, '0'),
    'Start Time': String(8 + i % 12).padStart(2, '0') + ':00',
    'End Time': String(9 + i % 12).padStart(2, '0') + ':00',
    Brand: 'TechGear Pro', Platform: 'TikTok Shop', 'Execution Source': 'Internal',
    'Shift title': 'RC16K synthetic ' + String(i).padStart(3, '0'), Studio: 'RC16K Studio',
    'Required Host count': 1, 'Required Support count': 1, 'Required Technical count': 1,
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Schedule')
  await page.goto('/calendar?tab=import')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'rc16k-local.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) })
  await expect(page.getByRole('button', { name: /Xác nhận import|Confirm import/ })).toBeEnabled()
  await page.getByRole('button', { name: /Xác nhận import|Confirm import/ }).click()
  await expect(page.getByText(/Đã ghi 117 dòng ca/)).toBeVisible()
  await page.getByRole('button', { name: /Thử.*lưu|Thử.*đồng bộ|Lưu lại|Đồng bộ lại/ }).click()
  await expect.poll(() => archiveCalls).toBe(2)
  await expect(page.getByText(/Đã ghi 117 dòng ca/)).toBeVisible()
  await page.getByRole('button', { name: /Thử.*lưu|Thử.*đồng bộ|Lưu lại|Đồng bộ lại/ }).click()
  await expect.poll(() => archiveCalls).toBe(3)
  expect(archiveBodies[0]).toContain('schedule_import_')
  const batchIds = archiveBodies.map(body => body.match(/schedule_import_([a-zA-Z0-9-]+)_2099/ )?.[1])
  expect(batchIds[0]).toBeTruthy()
  expect(new Set(batchIds).size).toBe(1)
  await page.getByTestId('calendar-stable-tabs').getByRole('tab', { name: 'Ca đang mở', exact: true }).click()
  await page.getByTestId('registration-open-search').fill('RC16K synthetic')
  await expect(page.getByText(/1.*10.*117/).last()).toBeVisible()
  await expect(page.locator('[data-testid^="open-shift-detail-card-"]')).toHaveCount(10)
  await page.getByRole('button', { name: /Trang cuối|Last page/, exact: true }).last().click()
  await expect(page.locator('[data-testid^="open-shift-detail-card-"]')).toHaveCount(7)
  await page.goBack()
  await expect(page.locator('[data-testid^="open-shift-detail-card-"]')).toHaveCount(10)
  for (const [view, name, count] of [['compact', 'compact', 10], ['table', 'table', 20]] as const) {
    await page.getByRole('button', { name: view === 'compact' ? /gọn|Compact/i : /bảng|Table/i, exact: true }).click()
    await expect(page.locator('[data-testid^="open-shift-detail-' + name + '-"]')).toHaveCount(count)
    await page.getByRole('button', { name: /Trang cuối|Last page/, exact: true }).last().click()
    await expect(page.locator('[data-testid^="open-shift-detail-' + name + '-"]')).toHaveCount(117 % count)
  }
})
