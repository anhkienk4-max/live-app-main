import { expect, test } from '@playwright/test'

test('personal locked payslip stays readable at mobile, tablet and desktop widths', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: {
    ok: true,
    capabilities: { actual_staffing: true, team_performance: false, own_performance: true, payroll: false },
  } }))
  await page.route('**/api/workforce/my-payslip?year=*', route => route.fulfill({ json: {
    ok: true,
    scope: 'own_locked_only',
    limited_to: 12,
    compensation_available: true,
    statements: [{
      period_id: 'locked-period', period_start: '2026-10-01', period_end: '2026-10-31',
      status: 'locked', locked_at: '2026-11-05T10:00:00Z', total_net_vnd: 200000,
      lines: [{
        line_id: 'line-1', shift_id: 'shift-1', shift_date: '2026-10-20', shift_title: 'Phiên Live',
        operational_role: 'host', actual_start_at: '2026-10-20T10:00:00Z', actual_end_at: '2026-10-20T12:00:00Z',
        actual_minutes: 120, payable_minutes: 120, actual_seconds: 7200, payable_seconds: 7200, overtime_seconds: 0,
        overtime_request_id: null, overtime_day_class: null, overtime_time_class: null, overtime_minutes: 0,
        rate_vnd_per_hour: 100000, gross_vnd: 200000, adjustment_vnd: 0,
        adjustment_reason: null, net_vnd: 200000, attendance_review: 'approved',
      }],
      compensation_adjustments: [],
    }],
  } }))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/payroll?tab=personal')
  const slip = page.getByRole('region', { name: 'Phiếu lương của tôi' })
  await expect(slip.getByRole('heading', { name: /Kỳ 2026-10-01 đến 2026-10-31/ })).toBeVisible()
  await expect(slip.getByRole('list', { name: 'Các ca trong phiếu lương' })).toBeVisible()
  await expect(slip.getByRole('list', { name: 'Các ca trong phiếu lương' }).getByText('17:00:00', { exact: false })).toBeVisible()
  await expect(slip.getByText('200.000 đ').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  const total = page.getByRole('list', { name: 'Các ca trong phiếu lương' }).getByText('Thành tiền')
  await total.scrollIntoViewIfNeeded()
  const totalBox = await total.boundingBox()
  const navigationBox = await page.getByRole('navigation').last().boundingBox()
  expect(totalBox && navigationBox && totalBox.y + totalBox.height < navigationBox.y).toBe(true)
  await page.screenshot({ path: 'output/playwright/g11-payslip-390.png', fullPage: true })

  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    if (width < 1024) {
      await expect(slip.getByRole('list', { name: 'Các ca trong phiếu lương' })).toBeVisible()
      await expect(slip.locator('table')).toBeHidden()
    } else {
      await expect(slip.locator('table')).toBeVisible()
      await expect(slip.getByRole('list', { name: 'Các ca trong phiếu lương' })).toBeHidden()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `output/playwright/g11-payslip-${width}.png`, fullPage: true })
  }
})
