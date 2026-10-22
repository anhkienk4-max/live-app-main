import { expect, test } from '@playwright/test'

// Isolated layout and user interaction only, never contacts Production.
for (const width of [390, 1440]) {
  test('Staffing gap action, applied filter drawer and Eye detail at '+width+'px', async ({ page }) => {
    await page.setViewportSize({width,height:900})
    await page.addInitScript(()=>{
      localStorage.setItem('livestream-ops-current-user','1')
      localStorage.setItem('livestream-ops-language','vi')
    })
    await page.goto('/staffing')
    const workspace = page.getByTestId('staffing-production-workspace')
    await expect(workspace).toBeVisible({timeout:30_000})
    await expect(page.getByTestId('staffing-filter-panel')).toHaveCount(0)
    const toggle=page.getByTestId('staffing-filter-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded','false')
    await toggle.click()
    await expect(page.getByTestId('staffing-filter-panel')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded','true')
    await page.locator('#staffing-filter-date').fill('2026-12-31')
    await expect(toggle).not.toContainText('(1)')
    await page.getByTestId('staffing-apply-filters').click()
    await expect(page.getByTestId('staffing-filter-panel')).toHaveCount(0)
    await expect(toggle).toContainText('(1)')
    await page.getByTestId('staffing-clear-filters').click()
    await expect(toggle).not.toContainText('(1)')
    // KPI acts as a real filter; status and UI must change, not an inert summary.
    const gap=page.getByTestId('staffing-open-gaps')
    await gap.click()
    await expect(gap).toHaveAttribute('aria-pressed','true')
    await expect(toggle).toContainText('(1)')
    await page.getByTestId('staffing-clear-filters').click()
    await expect(gap).toHaveAttribute('aria-pressed','false')
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    // All visible rows expose actionable details, not just a side summary.
    const eye=page.locator('[data-testid^="staffing-eye-"]').first()
    await expect(eye).toBeVisible()
    await eye.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
  })
}

test('Calendar deep-link opens missing-staff queue and Clear removes URL intent without hydration errors', async ({page}) => {
  await page.setViewportSize({width:1440,height:900})
  await page.addInitScript(()=>{
    localStorage.setItem('livestream-ops-current-user','1')
    localStorage.setItem('livestream-ops-language','vi')
  })
  const hydrationErrors: string[]=[]
  page.on('pageerror', error=>hydrationErrors.push(error.message))
  await page.goto('/staffing?gap=missing')
  const workspace=page.getByTestId('staffing-production-workspace')
  await expect(workspace).toBeVisible({timeout:30_000})
  await expect(page.getByTestId('staffing-open-gaps')).toHaveAttribute('aria-pressed','true')
  await expect(page.getByTestId('staffing-filter-toggle')).toContainText('(1)')
  await page.getByTestId('staffing-clear-filters').click()
  await expect(page).not.toHaveURL(/gap=missing/)
  await expect(page.getByTestId('staffing-open-gaps')).toHaveAttribute('aria-pressed','false')
  expect(hydrationErrors.filter(message=>/hydration|mismatch/i.test(message))).toEqual([])
})
