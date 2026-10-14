import { expect, test, type Page } from '@playwright/test'

// Frontend regression only: existing local mock identity and isolated API fixtures.
// No Production credentials, data, provider writes, or authenticated UAT claims.
const disabled = { actual_staffing: false, team_performance: false, own_performance: false, payroll: false }
const routes = [
  ['/calendar', 'Lịch', 'Calendar'],
  ['/shifts', 'Quản lý ca', 'Shift Management'],
  ['/reports', 'Báo cáo', 'Reports'],
  ['/storage', 'Kho file vận hành', 'Operational file storage'],
  ['/storage/setup', 'Thiết lập Storage — Admin', 'Storage setup — Admin'],
  ['/staffing', 'Điều phối ca', 'Staffing'],
  ['/workforce', 'Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.', 'The feature is disabled. Await approved configuration.'],
  ['/payroll', 'Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.', 'The feature is disabled. Await approved configuration.'],
] as const

async function fixtures(page: Page, language: 'vi' | 'en') {
  await page.addInitScript(saved => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', saved)
  }, language)
  await page.route('https://api.dicebear.com/**', route => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"/>',
  }))
  await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: { ok: true, capabilities: disabled } }))
  await page.route('**/api/operational-files**', route => {
    expect(route.request().method()).toBe('GET')
    return route.fulfill({ json: new URL(route.request().url()).searchParams.has('catalog') ? {
      ok: true, brands: [{ id: 'fixture-brand', name: 'Frontend fixture brand' }],
      platforms: [{ id: 'fixture-platform', name: 'Frontend fixture platform' }], campaigns: [],
      categories: [{ id: 'schedule_source', label: 'Schedule source' }, { id: 'dashboard', label: 'Dashboard' }],
      max_single_upload_bytes: 4 * 1024 * 1024, confidential_write_ready: false,
    } : { ok: true, files: [], total: 0, page: 1, pageSize: 10 } })
  })
  await page.route('**/api/operational-storage-setup**', route => {
    expect(route.request().method()).toBe('GET')
    return route.fulfill({ json: {
      ok: true, schema_ready: true, missing: [], brands: [], platforms: [],
      unclassified_shifts_sample: [], sample_limit: 50, unclassified_shifts_count: 0,
      offset: 0, routes: [], root_configured: false,
    } })
  })
}

async function ready(page: Page, route: string, language: 'vi' | 'en', label: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(language)
  const main = page.getByRole('main')
  if (route === '/workforce' || route === '/payroll') {
    await expect(main.getByRole('status')).toHaveText(label)
  } else await expect(main.getByRole('heading', { name: label, exact: true }).first()).toBeVisible()
  await expect(main).not.toContainText('undefined')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const width of [1440, 390]) {
  for (const saved of ['vi', 'en'] as const) {
    for (const [route, vi, en] of routes) {
      test(`Frontend hydration ${route}, ${width}px, saved ${saved}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 })
        await fixtures(page, saved)
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        page.on('requestfailed', request => errors.push(new URL(request.url()).pathname + ': ' + request.failure()?.errorText))
        await page.goto(route)
        await ready(page, route, saved, saved === 'vi' ? vi : en)
        await page.reload()
        await ready(page, route, saved, saved === 'vi' ? vi : en)
        for (const next of ['vi', 'en', 'vi'] as const) {
          const current = await page.evaluate(() => document.documentElement.lang)
          if (current !== next) await page.getByRole('button', { name: current === 'vi' ? 'Ngôn ngữ' : 'Language', exact: true }).click()
          await ready(page, route, next, next === 'vi' ? vi : en)
          if (route === '/storage') {
            const filter = page.getByRole('combobox', { name: next === 'vi' ? 'Lọc loại file' : 'Filter file category', exact: true })
            await filter.selectOption('dashboard')
            await expect(filter).toHaveValue('dashboard')
            await filter.selectOption('all')
            await expect(filter.locator('option:checked')).toHaveText(next === 'vi' ? 'Tất cả' : 'All')
            const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
            await expect(page.locator('input[type=date]')).toHaveValue(date)
          }
        }
        await page.screenshot({ path: info.outputPath('frontend-' + width + '-' + saved + '.png'), fullPage: true })
        const preexisting = errors.filter(message => /^React does not recognize the .*isToday istoday$/.test(message))
        if (preexisting.length) await info.attach('preexisting-calendar-console-warning', { body: JSON.stringify(preexisting), contentType: 'application/json' })
        expect(errors.filter(message => !preexisting.includes(message)), 'No hydration mismatch, React #418, new console or network errors').toEqual([])
      })
    }
  }
}
