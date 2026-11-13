import { expect, test } from '@playwright/test'

for (const { width, language } of [{ width: 390, language: 'vi' }, { width: 768, language: 'en' }, { width: 1440, language: 'en' }]) {
  test(`Storage does not invent provider folders at ${width}px (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const apiRequests: string[] = []
    page.on('request', request => apiRequests.push(request.url()))
    await page.route('**/api/operational-files**', async route => {
      const url = new URL(route.request().url())
      if (url.searchParams.get('catalog') === '1') {
        await route.fulfill({ json: {
          ok: true,
          brands: [{ id: 'brand-1', name: 'Mock Brand' }],
          platforms: [{ id: 'platform-1', name: 'TikTok' }],
          campaigns: [],
          categories: [{ id: 'schedule_source', label: 'Schedule source' }],
          max_single_upload_bytes: 4 * 1024 * 1024,
          confidential_write_ready: false,
          active_route_count: 3,
          provider_availability: { google_drive: true, onedrive: true },
        } })
        return
      }
      await route.fulfill({ json: { ok: true, files: [], total: 0, page: 1, pageSize: 10 } })
    })
    await page.addInitScript(lang => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', lang)
    }, language)
    await page.goto('/storage')

    // 1. Operational File Workspace container
    const workspace = page.getByTestId('operational-file-workspace')
    await expect(workspace).toBeVisible({ timeout: 25_000 })

    // A global route count is not a verified provider root or a provider folder listing.
    await expect(page.getByTestId('storage-physical-tree-unavailable')).toBeVisible()
    await expect(page.locator('[role="tree"]')).toHaveCount(0)
    await expect(page.getByTestId('storage-physical-browser').getByRole('button', { name: /Browse folders|Duyệt thư mục/i })).toBeDisabled()
    await expect(page.getByTestId('storage-physical-browser').getByRole('searchbox')).toBeDisabled()
    await expect(page.getByText('ADA Client Group')).toHaveCount(0)
    await expect(page.getByTestId('storage-provider-folder-entry')).toHaveCount(0)

    const breadcrumb = page.getByRole('navigation', { name: /Logical route scope|Phạm vi route logic/i })
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb).toContainText(/Mock Brand|TikTok/u)

    // 3. Provider status pills reflect credential configuration, not physical verification.
    await expect(page.locator('[title^="Google Drive:"]').first()).toBeVisible()
    await expect(page.locator('[title^="OneDrive:"]').first()).toBeVisible()

    // Existing record browsing and upload controls remain separate from provider folder browsing.
    const uploadBtn = page.getByRole('button', { name: /Tải file lên/i })
    await expect(uploadBtn).toBeVisible()

    // 6. Command Toolbar with search and filters
    const toolbar = page.getByTestId('command-toolbar')
    await expect(toolbar).toBeVisible()

    // 7. View Mode toggle: Switch to Cards and back to Table
    const cardsBtn = page.getByRole('button', { name: 'Chế độ thẻ' })
    if (await cardsBtn.isVisible()) {
      await cardsBtn.click()
      await page.waitForTimeout(300)
      const tableBtn = page.getByRole('button', { name: 'Chế độ bảng' })
      await expect(tableBtn).toBeVisible()
      await tableBtn.click()
      await page.waitForTimeout(300)
    }

    // No provider folder-list endpoint is called by this presentational unavailable state.
    expect(apiRequests.some(request => /folder-list|provider-folders/u.test(request))).toBe(false)
    await page.getByTestId('storage-physical-browser').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `output/playwright/g8-storage-browser-${width}.png`, fullPage: true })
  })
}

test('Storage RBAC: Member user (id: 3) is denied access with alert', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await page.goto('/storage')

  const alert = page.getByRole('alert').filter({ hasText: 'Bạn không có quyền truy cập kho file' })
  await expect(alert).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('operational-file-workspace')).not.toBeVisible()
})

test('Storage resource registry: duplicate attach preserves existing access and metadata', async ({ page }) => {
  const actions: Array<Record<string, unknown>> = []
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.route('**/api/storage-resources', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ok: true, resources: [{
        id: 'existing-resource', provider: 'google_drive', canonical_id: 'existing123',
        canonical_url: 'https://drive.google.com/drive/folders/existing123', title: 'Campaign root',
        resource_type: 'root_folder', visibility: 'admin_only', verification_status: 'unverified',
        is_active: true, owner_id: 'admin-1', storage_resource_scopes: [],
      }] } })
      return
    }
    const action = route.request().postDataJSON() as Record<string, unknown>
    actions.push(action)
    if (action.action === 'create') await route.fulfill({ status: 409, json: { ok: false, error: 'RESOURCE_DUPLICATE', resource_id: 'existing-resource' } })
    else await route.fulfill({ status: 201, json: { ok: true, note: 'Scope attached.' } })
  })
  await page.goto('/storage/resources')
  await expect(page.getByRole('heading', { name: 'Resources and links' })).toBeVisible()
  await expect(page.getByText('Campaign root')).toBeVisible()
  await page.screenshot({ path: 'docs/handoffs/evidence/rc19-sto02-resource-registry.png', fullPage: true })
  await page.getByLabel('Display title').fill('Campaign root')
  await page.getByLabel('Canonical provider ID').fill('existing123')
  await page.getByLabel('Canonical provider URL').fill('https://drive.google.com/drive/folders/existing123')
  await page.getByLabel('Brand ID').fill('brand-1')
  await page.getByRole('button', { name: 'Add link metadata' }).click()
  await expect(page.getByText(/already in the registry/u)).toBeVisible()
  await page.getByRole('button', { name: 'Attach current scope' }).click()
  await expect.poll(() => actions.map(action => action.action)).toEqual(['create', 'attach_scope'])
})

test('Storage resource registry hides Admin controls for Member and rejects writes without an Origin header', async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.route('**/api/storage-resources', route => route.fulfill({ json: { ok: true, resources: [] } }))
  await page.goto('/storage/resources')
  await expect(page.getByRole('heading', { name: 'Resources and links' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add link metadata' })).toHaveCount(0)
  const forged = await request.post('/api/storage-resources', { data: { action: 'create' } })
  expect(forged.status()).toBe(403)
  expect(await forged.json()).toEqual({ ok: false, error: 'ORIGIN_INVALID' })
})

test('Storage resource registry reports an uninstalled schema without showing an empty success state', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.route('**/api/storage-resources', route => route.fulfill({
    status: 503,
    json: { ok: false, error: 'STORAGE_RESOURCE_REGISTRY_NOT_INSTALLED' },
  }))
  await page.goto('/storage/resources')
  await expect(page.getByText('Could not load the resource registry.', { exact: true })).toBeVisible()
  await expect(page.getByText('No resources match these filters.')).toHaveCount(0)
})
