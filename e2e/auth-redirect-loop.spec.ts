import { expect, test, type Page } from '@playwright/test'

type MockAccount = {
  id: '1' | '2' | '3'
  email: string
}

const accounts: MockAccount[] = [
  { id: '1', email: 'admin@livestream.com' },
  { id: '2', email: 'leader@livestream.com' },
  { id: '3', email: 'host1@livestream.com' },
]

function captureRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function loginAs(page: Page, account: MockAccount) {
  await page.goto('/login')
  await page.evaluate(id => {
    window.localStorage.setItem('livestream-ops-current-user', id)
  }, account.id)
  await page.getByTestId('email-input').fill(account.email)
  await page.getByTestId('password-input').fill('local-browser-test')
  await page.getByTestId('email-login-btn').click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByTestId('user-menu-btn').click()
  await expect(page.getByText(account.email, { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
}

async function logoutToStableLogin(page: Page) {
  await page.getByTestId('user-menu-btn').click()
  await expect(page.getByTestId('signout-btn')).toBeVisible()
  await page.getByTestId('signout-btn').click()
  await expect(page).toHaveURL(/\/login\?reason=signed_out$/)
  await expect(page.getByTestId('login-notice')).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login\?reason=signed_out$/)
  await expect(page.getByTestId('email-login-btn')).toBeVisible()
}

test.describe('Auth H1 redirect-loop recovery', () => {
  test('session-expired login remains stable across reload and history navigation', async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page)
    const navigations: string[] = []
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) navigations.push(frame.url())
    })

    await page.goto('/login?reason=session_expired')
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/)
    await expect(page.getByTestId('login-error')).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/)

    await page.goto('/login?reason=authentication_required')
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?reason=session_expired$/)
    await page.goForward({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login\?reason=authentication_required$/)

    const localPaths = navigations
      .filter(url => /127\.0\.0\.1/.test(url))
      .map(url => new URL(url).pathname)
    expect(new Set(localPaths)).toEqual(new Set(['/login']))
    expect(runtimeErrors).toEqual([])
  })

  test('Admin, Leader, and Member can switch accounts through deterministic logout', async ({ page }) => {
    const runtimeErrors = captureRuntimeErrors(page)
    for (const account of accounts) {
      await loginAs(page, account)
      if (account.id === '1' || account.id === '3') {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/$/)
      }
      await logoutToStableLogin(page)
    }
    expect(runtimeErrors).toEqual([])
  })
})
