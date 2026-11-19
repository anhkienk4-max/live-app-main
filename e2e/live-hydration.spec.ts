import { expect, test } from '@playwright/test'

for (const width of [390, 1440]) {
  test(`/live hydrates and tracks offline transitions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const hydrationErrors: string[] = []
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|server rendered|didn't match|did not match/i.test(message.text())) {
        hydrationErrors.push(message.text())
      }
    })
    page.on('pageerror', error => {
      if (/hydration|server rendered|didn't match|did not match/i.test(error.message)) hydrationErrors.push(error.message)
    })

    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')

      let online = false
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
      const listeners = { online: new Set<EventListenerOrEventListenerObject>(), offline: new Set<EventListenerOrEventListenerObject>() }
      window.addEventListener = new Proxy(window.addEventListener, {
        apply(target, thisArg, args: [string, EventListenerOrEventListenerObject | null, ...unknown[]]) {
          const [type, listener] = args
          if ((type === 'online' || type === 'offline') && listener) listeners[type].add(listener)
          return Reflect.apply(target, thisArg, args)
        },
      })
      window.removeEventListener = new Proxy(window.removeEventListener, {
        apply(target, thisArg, args: [string, EventListenerOrEventListenerObject | null, ...unknown[]]) {
          const [type, listener] = args
          if ((type === 'online' || type === 'offline') && listener) listeners[type].delete(listener)
          return Reflect.apply(target, thisArg, args)
        },
      })

      const testWindow = window as Window & {
        __rc19SetOnline?: (value: boolean) => void
        __rc19ListenerCounts?: () => { online: number; offline: number }
      }
      testWindow.__rc19SetOnline = value => {
        online = value
        window.dispatchEvent(new Event(value ? 'online' : 'offline'))
      }
      testWindow.__rc19ListenerCounts = () => ({ online: listeners.online.size, offline: listeners.offline.size })
    })

    const response = await page.goto('/live')
    expect(response?.ok()).toBeTruthy()
    expect(await response?.text()).not.toContain('Ngoại tuyến')
    expect(await page.evaluate(() => navigator.onLine)).toBe(false)
    if (await page.locator('.ada-navigation-transition').isVisible()) {
      test.info().annotations.push({ type: 'G1 blocker', description: 'The navigation loading overlay keeps route content aria-hidden; component state is still asserted in the DOM.' })
    }
    const offlineBadge = page.getByText('Ngoại tuyến', { exact: true })
    await expect(offlineBadge).toBeAttached()
    expect(hydrationErrors).toEqual([])

    const initialListeners = await page.evaluate(() => {
      const target = window as Window & { __rc19ListenerCounts?: () => { online: number; offline: number } }
      return target.__rc19ListenerCounts?.()
    })
    expect(initialListeners?.online).toBeGreaterThan(0)
    expect(initialListeners?.offline).toBeGreaterThan(0)

    const setOnline = (value: boolean) => page.evaluate(online => {
      const target = window as Window & { __rc19SetOnline?: (value: boolean) => void }
      target.__rc19SetOnline?.(online)
    }, value)
    await setOnline(true)
    await expect(offlineBadge).toHaveCount(0)
    await setOnline(false)
    await expect(offlineBadge).toBeAttached()
    await setOnline(true)
    await expect(offlineBadge).toHaveCount(0)
    await setOnline(false)
    await expect(offlineBadge).toBeAttached()

    const finalListeners = await page.evaluate(() => {
      const target = window as Window & { __rc19ListenerCounts?: () => { online: number; offline: number } }
      return target.__rc19ListenerCounts?.()
    })
    expect(finalListeners).toEqual(initialListeners)
    expect(hydrationErrors).toEqual([])
  })
}
