import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const output = 'test-results/pwa-visual'

for (const viewport of [
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'tablet-edge-900x1100', width: 900, height: 1100 },
]) {
  test(`ADA login reference layout ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const root = page.locator('[data-testid="ada-reference-login"]')
    const content = page.locator('.ada-login-reference__content')
    const logo = page.locator('.ada-login-reference__logo .ada-brand__name')
    const form = page.locator('.ada-login-reference__form')
    const email = page.locator('[data-testid="email-input"]')
    const password = page.locator('[data-testid="password-input"]')
    const google = page.locator('[data-testid="google-login-btn"]')

    await expect(root).toBeVisible()
    await expect(logo).toBeVisible()
    await expect(form).toBeVisible()
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()
    await expect(google).toBeVisible()

    const measure = await page.evaluate(() => {
      const content = document.querySelector('.ada-login-reference__content') as HTMLElement
      const logo = document.querySelector('.ada-login-reference__logo .ada-brand__name') as HTMLElement
      const form = document.querySelector('.ada-login-reference__form') as HTMLElement
      const email = document.querySelector('[data-testid="email-input"]') as HTMLElement
      const google = document.querySelector('[data-testid="google-login-btn"]') as HTMLElement
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        formWidth: content.getBoundingClientRect().width,
        formTop: form.getBoundingClientRect().top,
        logoSize: parseFloat(window.getComputedStyle(logo).fontSize),
        emailWidth: email.getBoundingClientRect().width,
        googleBottom: google.getBoundingClientRect().bottom,
        documentWidth: document.documentElement.scrollWidth,
      }
    })
    expect(measure.formWidth / measure.width).toBeGreaterThan(.79)
    expect(measure.formWidth / measure.width).toBeLessThan(.93)
    expect(measure.emailWidth / measure.formWidth).toBeGreaterThan(.98)
    expect(measure.logoSize).toBeGreaterThan(viewport.width < 600 ? 80 : 115)
    expect(measure.formTop / measure.height).toBeGreaterThan(.27)
    expect(measure.formTop / measure.height).toBeLessThan(.58)
    expect(measure.documentWidth).toBeLessThanOrEqual(viewport.width)
    expect(measure.googleBottom).toBeLessThan(viewport.height + 24)

    await mkdir(output, { recursive: true })
    await page.screenshot({
      path: `${output}/${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    console.log('PWA_LOGIN_LAYOUT ' + JSON.stringify({ viewport, ...measure }))
  })
}
