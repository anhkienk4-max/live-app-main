import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { readEnvIdentities, loginWithCredentials, type CoreRole } from './harness/core-v1-harness'

/**
 * Credentialed Preview-only UAT: never Production, no mock fallback.
 * Screenshots of authenticated data are opt-in and stay local.
 */
const target = process.env.E2E_BASE_URL ?? ''
const safePreview = /^https:\/\/livestream-ops-demo(?:-[a-z0-9-]+)?\.vercel\.app\/?$/.test(target)
const identity = readEnvIdentities()
const roles: Array<{ role: CoreRole; creds: { email: string; password: string } | null }> = [
  { role: 'admin', creds: identity.admin },
  { role: 'leader', creds: identity.leader },
  { role: 'member', creds: identity.member },
]

test.describe('PWA real-role Preview UAT', () => {
  test.skip(!target, 'SKIP: E2E_BASE_URL must specify the authorized PWA Preview')
  test('reject Production and other unsafe targets', async () => {
    expect(safePreview, 'Use only the ADA OPS demo Preview hostname').toBe(true)
  })

  for (const { role, creds } of roles) {
    for (const viewport of [
      { width: 390, height: 844, name: 'iphone-390' },
      { width: 412, height: 915, name: 'android-412' },
    ]) {
      test(role + ' dashboard at ' + viewport.name, async ({ page }) => {
        test.skip(!creds, 'SKIP: E2E_' + role.toUpperCase() + '_EMAIL/PASSWORD missing; not a PASS')
        expect(safePreview, 'Do not authenticate on Production').toBe(true)
        if (!creds) throw new Error('Credential preflight failed')
        await page.setViewportSize(viewport)
        await loginWithCredentials(page, creds.email, creds.password)
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        const mobile = page.getByTestId('ada-reference-mobile-home')
        await expect(mobile).toBeVisible({ timeout: 60000 })
        await expect(mobile).toHaveAttribute('data-role', role)
        await expect(page.getByTestId('production-bottom-nav')).toBeVisible()
        const shortcuts = page.getByTestId('ada-mobile-home-quick-links')
        await expect(shortcuts.getByRole('link')).toHaveCount(4)
        if (role === 'admin') {
          await expect(shortcuts.getByRole('link', { name: 'Bảng lương' })).toHaveAttribute('href', '/payroll')
        } else if (role === 'leader') {
          await expect(shortcuts.getByRole('link', { name: 'Duyệt đăng ký' })).toHaveAttribute('href', '/staffing?tab=registration')
          await expect(shortcuts.getByRole('link', { name: 'Bảng lương' })).toHaveCount(0)
        } else {
          await expect(shortcuts.getByRole('link', { name: 'Đăng ký ca' })).toHaveAttribute('href', '/calendar?tab=open')
          await expect(shortcuts.getByRole('link', { name: 'Bảng lương' })).toHaveCount(0)
        }
        await expect(mobile.getByRole('heading', { name: 'Công việc cần xử lý' })).toBeVisible()
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1)
        if (process.env.PWA_UAT_CAPTURE === 'true') {
          await mkdir('test-results/pwa-role-uat', { recursive: true })
          await page.screenshot({
            path: 'test-results/pwa-role-uat/' + role + '-' + viewport.name + '.png',
            fullPage: true,
            animations: 'disabled',
          })
        }
      })
    }
  }
})
