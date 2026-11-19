import { expect, test } from '@playwright/test'

const entry = {
  target_id: 'leader-a', permission: 'audit.view_team', decision: null, version: 0,
  reason: null, expires_at: null, changed_by: null, changed_at: null,
  effective: true, source: 'role_default', history: [],
}
type TestEntry = Omit<typeof entry, 'decision' | 'source' | 'history'> & {
  decision: 'allow' | 'deny' | 'reset' | null
  source: 'account_override' | 'role_default'
  history: Array<{ decision: string; version: number; reason: string; expires_at: string | null; changed_by: string; changed_at: string }>
}

test('Admin can review and version a supported account override through the guarded API', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user', '1'))
  let current: TestEntry = { ...entry, decision: null, source: 'role_default', history: [] }
  const payloads: unknown[] = []
  await page.route('**/api/rbac/account-overrides', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, entries: [current] }) })
      return
    }
    const payload = route.request().postDataJSON() as Record<string, unknown>
    payloads.push(payload)
    current = {
      ...current,
      decision: payload.action === 'reset' ? 'reset' : payload.decision as 'allow' | 'deny',
      version: current.version + 1,
      reason: String(payload.reason), changed_by: 'admin-a', changed_at: '2026-10-30T00:00:00Z',
      effective: payload.action === 'reset' || payload.decision === 'allow',
      source: payload.action === 'reset' ? 'role_default' : 'account_override',
      history: [...current.history, { decision: payload.action === 'reset' ? 'reset' : payload.decision, version: current.version + 1,
        reason: String(payload.reason), expires_at: null, changed_by: 'admin-a', changed_at: '2026-10-30T00:00:00Z' }],
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, result: { version: current.version } }) })
  })
  await page.goto('/settings')
  await page.getByTestId('settings-account-permissions-tab').click()
  await expect(page.getByTestId('rbac02-account-overrides')).toBeVisible()
  await page.getByLabel('Lý do').fill('Temporary audit restriction')
  await page.getByRole('button', { name: 'Ghi override' }).click()
  await expect(page.getByText(/Phiên bản 1/)).toBeVisible()
  expect(payloads).toHaveLength(1)
  expect(payloads[0]).not.toHaveProperty('actorId')
  expect(payloads[0]).not.toHaveProperty('role')
  await page.getByLabel('Lý do').fill('Restore normal role default')
  await page.getByRole('button', { name: 'Reset về role default' }).click()
  await expect(page.getByText(/Phiên bản 2/)).toBeVisible()
  await expect(page.getByText(/Lịch sử override \(2\)/)).toBeVisible()
})

test('Member does not see the Admin-only account permission editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user', '3'))
  await page.goto('/settings')
  await expect(page.getByTestId('settings-account-permissions-tab')).toHaveCount(0)
  await expect(page.getByTestId('rbac02-account-overrides')).toHaveCount(0)
})

test('an in-flight Admin account list is discarded when the mock identity switches to Member', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user', '1'))
  await page.route('**/api/rbac/account-overrides', async route => {
    if (route.request().method() === 'GET') {
      await new Promise(resolve => setTimeout(resolve, 400))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, entries: [entry] }) })
      return
    }
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
  })
  await page.goto('/settings')
  await page.getByTestId('settings-account-permissions-tab').click()
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  await expect(page.getByTestId('settings-account-permissions-tab')).toHaveCount(0)
  await expect(page.getByTestId('rbac02-account-overrides')).toHaveCount(0)
})
