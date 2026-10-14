import { test, expect, type Page } from '@playwright/test'

type Services = typeof import('../lib/services/dataService')
type Runtime = { m: Record<string, unknown>; (id: string): Services }
type FixtureWindow = Window & {
  webpackChunk_N_E: unknown[][]
  reportsFixture: { services: Services; release?: () => void; calls: string[] }
}

// Instrument only the local webpack/mock fixture; this is not authenticated UAT.
async function fixture(page: Page, role = '1') {
  await page.addInitScript(id => {
    localStorage.setItem('livestream-ops-current-user', id)
    localStorage.setItem('livestream-ops-language', 'en')
  }, role)
  await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: { ok: true, capabilities: { payroll: false, actual_staffing: false, team_performance: false, own_performance: false } } }))
  await page.goto('/reports')
  await expect(page.getByTestId('open-final-report-modal')).toBeVisible()
  await page.evaluate(() => {
    const w = window as FixtureWindow
    w.webpackChunk_N_E.push([['reports-test-runtime'], {}, (runtime: Runtime) => {
      const id = Object.keys(runtime.m).find(key => key.endsWith('/lib/services/dataService.ts'))
      if (!id) throw new Error('Local mock services module missing')
      w.reportsFixture = { services: runtime(id), calls: [] }
    }])
  })
}

async function delayStaffing(page: Page) {
  await page.evaluate(() => {
    const f = (window as FixtureWindow).reportsFixture
    const original = f.services.shiftRegistrationService.getForShift
    f.services.shiftRegistrationService.getForShift = async id => {
      f.calls.push(id)
      const rows = await original.call(f.services.shiftRegistrationService, id)
      f.services.shiftRegistrationService.getForShift = original
      await new Promise<void>(resolve => { f.release = resolve })
      return rows
    }
  })
}

for (const width of [390, 768, 1440, 1920]) test('Reports off-page deep link supplies exact modal context at ' + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 })
  await fixture(page)
  await page.locator('main input').first().fill('absent-reports-filter')
  await expect(page.getByText('Tech gadgets recap', { exact: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const f = (window as FixtureWindow).reportsFixture
    const rows = await f.services.shiftRegistrationService.getForShift('s2')
    const extra = { ...rows[0], id: 'off-page-manual-host', user_id: '3', status: 'manually_assigned' as const }
    const original = f.services.shiftRegistrationService.getForShift
    f.services.shiftRegistrationService.getForShift = async id => id === 's2' ? [...rows, extra] : original.call(f.services.shiftRegistrationService, id)
    history.pushState(null, '', '/reports?shiftId=s2')
  })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Sarah Johnson/)).toBeVisible()
  await expect(dialog.getByText(/Michael Chen/)).toBeVisible()
  await expect(dialog.getByText(/Emily Davis/)).toBeVisible()
  await expect(dialog.getByText(/Alex Morgan/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('reports-context-' + width + '.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => history.pushState(null, '', '/reports?shiftId=s5'))
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'TechGear Pro - Final Report' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Reopen report' })).toBeVisible()
})

test('Reports ignores old target staffing after account changes', async ({ page }) => {
  await fixture(page, '5')
  await delayStaffing(page)
  await page.evaluate(() => history.pushState(null, '', '/reports?shiftId=s2'))
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).reportsFixture.calls)).toContain('s2')
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  await expect(page.getByRole('button', { name: 'Sarah Johnson' })).toBeVisible()
  await page.evaluate(async () => {
    (window as FixtureWindow).reportsFixture.release?.()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Reports displays authoritative staffing without other applicants or private user records', async ({ page }) => {
  await fixture(page)
  await page.evaluate(() => {
    const service = (window as FixtureWindow).reportsFixture.services.shiftService
    const original = service.getById
    service.getById = async id => {
      const shift = await original.call(service, id)
      return shift && { ...shift, staffing_summary: [{ shift_id: id, role: 'host', required: 1, approved: 1, pending: 0, remaining: 0, approved_staff: [{ name: 'Safe approved display', avatar_url: null, imported_only: false }] }] }
    }
    history.pushState(null, '', '/reports?shiftId=s2')
  })
  await expect(page.getByRole('dialog').getByText(/Safe approved display/)).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/Michael Chen/)).toHaveCount(0)
})

test('Closing Reports picker prevents a pending target from reopening a modal', async ({ page }) => {
  await fixture(page)
  await delayStaffing(page)
  await page.getByTestId('open-final-report-modal').click()
  const picker = page.getByTestId('report-shift-picker')
  await expect(picker.getByTestId('report-shift-choose').first()).toBeVisible()
  await picker.getByTestId('report-shift-choose').first().click()
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).reportsFixture.calls.length)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await page.evaluate(async () => {
    (window as FixtureWindow).reportsFixture.release?.()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
