import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

// The same probe runs against unchanged RC16K and the candidate in disposable CI worktrees.
for (const role of ['1', '2', '3']) for (const width of [1366, 1536, 1920, 390]) {
  test(`Calendar performance role ${role} width ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.clock.setFixedTime(new Date('2026-10-14T05:00:00Z'))
    await page.addInitScript(id => { localStorage.setItem('livestream-ops-current-user', id); localStorage.setItem('livestream-ops-language', 'vi') }, role)
    await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: { ok: true, capabilities: { actual_staffing: false, team_performance: false, own_performance: false, payroll: false } } }))
    const started = new Map<object, number>()
    const requests: Array<{ path: string; key: string; startMs: number; durationMs: number; bytes: number; status: number }> = []
    const pending: Promise<void>[] = []
    page.on('request', request => { if (/\/api\/|\/rest\/v1\//.test(request.url())) started.set(request, Date.now()) })
    page.on('response', response => {
      const start = started.get(response.request())
      if (start === undefined) return
      pending.push((async () => {
        const bytes = await response.body().catch(() => Buffer.alloc(0))
        const request = response.request()
        const key = createHash('sha256').update(request.method() + request.url() + (request.postData() ?? '')).digest('hex')
        requests.push({ path: new URL(response.url()).pathname, key, startMs: start, durationMs: Date.now() - start, bytes: bytes.length, status: response.status() })
      })())
    })
    const phase = process.env.RC16L_EVIDENCE_PHASE ?? 'after'
    for (const [view, name] of [['month', 'Tháng'], ['week', 'Tuần'], ['day', 'Ngày'], ['list', 'Danh sách']] as const) {
      const firstRequest = requests.length
      const start = Date.now()
      if (view === 'month') await page.goto('/calendar?tab=calendar')
      else await page.getByRole('button', { name, exact: true }).click()
      await expect(page.getByPlaceholder(/Tìm ca theo|Search shifts/)).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await expect(page.locator('[data-testid="content-skeleton"]:visible')).toHaveCount(0)
      await Promise.all(pending)
      const measured = requests.slice(firstRequest)
      const domReadyMs = Date.now() - start
      await page.screenshot({ path: info.outputPath(`${phase}-${role}-${width}-${view}.png`), fullPage: true })
      await info.attach(`${phase}-${view}.json`, { body: JSON.stringify({ phase, role, width, view, domReadyMs, requests: measured, duplicatedCalls: measured.length - new Set(measured.map(request => request.key)).size, methodology: 'Local mock identity and data. DOM-ready time is not React commit duration. Authenticated Supabase waterfall remains a staging UAT gate.' }), contentType: 'application/json' })
    }
    for (const [view, name] of [['open', 'Ca đang mở'], ['mine', 'Ca của tôi']] as const) {
      const firstRequest = requests.length
      const start = Date.now()
      await page.getByTestId('calendar-stable-tabs').getByRole('tab', { name, exact: true }).click()
      await expect(page.getByTestId(`registration-${view}-search`)).toBeVisible()
      await expect(page.locator('[data-testid="content-skeleton"]:visible')).toHaveCount(0)
      await Promise.all(pending)
      const measured = requests.slice(firstRequest)
      const domReadyMs = Date.now() - start
      await page.screenshot({ path: info.outputPath(`${phase}-${role}-${width}-${view}.png`), fullPage: true })
      await info.attach(`${phase}-${view}.json`, { body: JSON.stringify({ phase, role, width, view, domReadyMs, requests: measured, duplicatedCalls: measured.length - new Set(measured.map(request => request.key)).size, methodology: 'Local mock identity and data; authenticated Supabase timing NOT_VERIFIED' }), contentType: 'application/json' })
    }
  })
}
