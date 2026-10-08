import { test, expect } from '@playwright/test'
import { loginWithCredentials, readEnvIdentities } from './harness/core-v1-harness'

const identities = readEnvIdentities()
test.use({ baseURL: identities.baseURL, trace: 'off', video: 'off', screenshot: 'only-on-failure' })

test('real Report revision response is handled without an uncaught page error', async ({ page }) => {
  test.skip(!identities.admin, 'DATA_NOT_AVAILABLE: staging Admin credentials required')
  if (!identities.admin) return
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await loginWithCredentials(page, identities.admin.email, identities.admin.password)
  await page.goto('/reports')
  const details = page.getByTestId('production-main-content').getByRole('button', { name: 'View details', exact: true }).first()
  await expect(details).toBeVisible()
  const response = page.waitForResponse(value => new URL(value.url()).pathname.endsWith('/rpc/get_report_revisions'))
  await details.click()
  const revisions = await response
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: /versions/i }).click()
  if (revisions.status() >= 400) {
    await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Please try again.', exact: true })).toBeVisible()
    await expect(dialog.getByText('No revision snapshots are available for this legacy mock report.', { exact: true })).toBeHidden()
  } else {
    await expect(dialog.getByRole('alert')).toBeHidden()
  }
  expect(errors).toEqual([])
})