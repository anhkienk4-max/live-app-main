import { expect, test } from '@playwright/test'

test.describe('public auth entry regressions', () => {
  test('registration is public and reasoned login hydrates without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto('/register', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/register$/)
    await expect(page.getByTestId('create-account-btn')).toBeVisible()

    await page.goto('/login?reason=session_expired', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('login-error')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('protected dashboard remains redirected when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/login\?reason=(auth_unavailable|session_expired)/)
  })
})
