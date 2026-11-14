import { expect, test } from '@playwright/test'

function installAuditFixture(page: import('@playwright/test').Page, userId: string) {
  return page.addInitScript(({ id, events }) => {
    localStorage.setItem('livestream-ops-current-user', id)
    localStorage.setItem('livestream-ops-language', 'en')
    sessionStorage.setItem('livestream-ops-audit-history', JSON.stringify(events))
  }, {
    id: userId,
    events: Array.from({ length: 25 }, (_, index) => ({
      id: `g12-${String(index + 1).padStart(2, '0')}`,
      timestamp: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      actor_id: index % 2 ? '2' : '1', actor_name: index % 2 ? 'Team Leader' : 'Admin User',
      actor_role: index % 2 ? 'leader' : 'admin', module: index % 4 === 0 ? 'settings' : 'calendar',
      action: 'update', entity_type: 'shift', entity_id: `shift-${index + 1}`,
      entity_name: `G12 audit event ${String(index + 1).padStart(2, '0')}`,
      before: { brand_id: 'b1', status: 'scheduled' }, after: { brand_id: 'b1', status: 'live' },
      source: 'manual', status: 'success', correlation_id: `g12-correlation-${index + 1}`,
      entity_exists: true,
    })),
  })
}

test('G12 Admin mock: bounded pages, filter URL, refresh and browser history at mobile/tablet/desktop', async ({ page }) => {
  await installAuditFixture(page, '1')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/audit?from=2026-10-01&to=2026-11-01')
  await expect(page.locator('tbody tr')).toHaveCount(20)
  await expect(page.getByText('20 events on this page')).toBeVisible()
  const search = page.getByLabel('Search entity name')
  await search.fill('G12 audit event 01')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page).toHaveURL(/q=G12\+audit\+event\+01/)
  await page.reload()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Search entity name').fill('')
  await expect(page.locator('tbody tr')).toHaveCount(20)
  await expect(page).not.toHaveURL(/q=/)
  await page.locator('tbody tr').first().focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Audit event · update/)).toBeVisible()
  await page.getByTestId('audit-keyset-pagination').getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(5)
  await expect(page).toHaveURL(/cursor_at=/)
  await page.reload()
  await expect(page.locator('tbody tr')).toHaveCount(5)
  await page.goBack()
  await expect(page.locator('tbody tr')).toHaveCount(20)
  await page.goForward()
  await expect(page.locator('tbody tr')).toHaveCount(5)

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('main').first()).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(5)
    await page.screenshot({ path: test.info().outputPath(`g12-audit-${width}.png`), fullPage: true })
  }
})

test('G12 Member mock is denied and Leader mock is restricted to permitted modules', async ({ page }) => {
  await installAuditFixture(page, '3')
  await page.goto('/audit')
  await expect(page.getByText(/Access denied|không có quyền/i).first()).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(0)

  await installAuditFixture(page, '2')
  await page.goto('/audit')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.locator('tbody tr').filter({ hasText: 'settings' })).toHaveCount(0)
})
