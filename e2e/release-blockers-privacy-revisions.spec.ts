import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loginWithCredentials, readEnvIdentities } from './harness/core-v1-harness'

const identities = readEnvIdentities()
test.use({ baseURL: identities.baseURL, viewport: { width: 1440, height: 1024 }, trace: 'off', video: 'off', screenshot: 'off' })
const evidence = process.env.E2E_EVIDENCE_DIR
async function capture(page: import('@playwright/test').Page, name: string, metadata: object) {
  if (!evidence) return
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: join(evidence, name + '.png') })
  writeFileSync(join(evidence, name + '.json'), JSON.stringify({ url: page.url(), viewport: page.viewportSize(), ...metadata }, null, 2))
}

test('Member real staffing/registration network carries no foreign raw applicant/contact data', async ({ page }) => {
  expect(identities.member, 'Member credentials required').not.toBeNull()
  await loginWithCredentials(page, identities.member!.email, identities.member!.password)
  await page.waitForLoadState('networkidle')
  const network: Array<{ path: string; status: number; rows: number; foreign: number }> = []
  const pending: Promise<void>[] = []
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.hostname !== 'amagnzebmmuqiptmrjmc.supabase.co' || response.request().method() !== 'GET') return
    if (!['/rest/v1/business_users', '/rest/v1/shift_registrations'].includes(url.pathname)) return
    pending.push((async () => {
      const data = await response.json()
      if (!Array.isArray(data)) return
      const foreign = data.filter(row => url.pathname.endsWith('/business_users') ? row.id !== '3' : row.user_id !== '3').length
      network.push({ path: url.pathname, status: response.status(), rows: data.length, foreign })
    })())
  })
  const staffing = page.waitForResponse(response => new URL(response.url()).pathname === '/rest/v1/rpc/get_shift_staffing_summary')
  await page.goto('/staffing?tab=registration')
  await expect(page.getByTestId('registration-open-search')).toBeVisible()
  const summary = await staffing
  expect(summary.status()).toBe(200)
  const counts = await summary.json()
  expect(counts.some((row: { approved: number }) => row.approved > 0)).toBe(true)
  await expect(page.getByTestId('registration-review-workspace')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(approve|reject)$/i })).toHaveCount(0)
  await capture(page, 'member-registration', { safeStaffingSummary: true })
  for (const route of ['/calendar?tab=mine', '/calendar?tab=open', '/staff', '/swaps']) {
    await page.goto(route)
    await expect(page.getByTestId('production-main-content')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await Promise.all(pending)
  }
  await Promise.all(pending)
  expect(network.some(row => row.path.endsWith('/shift_registrations') && row.rows > 0)).toBe(true)
  expect(network.every(row => row.status === 200 && row.foreign === 0)).toBe(true)
  await capture(page, 'member-network-privacy', { network, otherApplicantSensitiveFields: 0 })
})

for (const role of ['admin', 'leader', 'member'] as const) {
  test(role + ' real report revision RPC succeeds and ordered source history renders', async ({ page }) => {
    const credentials = identities[role]
    expect(credentials, role + ' credentials required').not.toBeNull()
    await loginWithCredentials(page, credentials!.email, credentials!.password)
    await page.goto('/reports')
    const details = page.getByTestId('production-main-content').getByRole('button', { name: 'View details', exact: true }).first()
    await expect(details).toBeVisible()
    const response = page.waitForResponse(value => new URL(value.url()).pathname.endsWith('/rpc/get_report_revisions'))
    await details.click()
    const revisions = await response
    expect(revisions.status()).toBe(200)
    const rows = await revisions.json()
    expect(rows.length).toBeGreaterThan(0)
    const versions = rows.map((row: { version: number }) => row.version)
    expect(versions).toEqual([...versions].sort((a, b) => a - b))
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab', { name: /versions/i }).click()
    await expect(dialog.getByRole('alert')).toBeHidden()
    await expect(dialog.getByText(new RegExp('Version ' + versions[versions.length - 1] + ' \u00b7'))).toBeVisible()
    await capture(page, role + '-revision-history', { role, rpcStatus: revisions.status(), versions })
  })
}
