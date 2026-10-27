import { expect, test } from '@playwright/test'

for (const { width, language } of [{ width: 390, language: 'vi' }, { width: 1440, language: 'en' }]) {
  test(`Storage Explorer interactive features at ${width}px (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(lang => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', lang)
    }, language)
    await page.goto('/storage')

    // 1. Operational File Workspace container
    const workspace = page.getByTestId('operational-file-workspace')
    await expect(workspace).toBeVisible({ timeout: 25_000 })

    // 2. Directory Tree & Breadcrumb
    const tree = page.locator('[role="tree"]')
    await expect(tree).toBeVisible()

    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]')
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb).toContainText('Client Group')

    // 3. Provider status pills reflect credential configuration, not physical verification.
    await expect(page.locator('[title^="Google Drive:"]').first()).toBeVisible()
    await expect(page.locator('[title^="OneDrive:"]').first()).toBeVisible()

    // 4. Incomplete Scope Alert & Guidance
    const scopeWarning = page.locator('text=Chưa đủ ngữ cảnh').first()
    await expect(scopeWarning).toBeVisible()

    // 5. Action controls (Upload & Attach buttons disabled on incomplete scope)
    const uploadBtn = page.getByRole('button', { name: /Tải file lên/i })
    await expect(uploadBtn).toBeVisible()
    await expect(uploadBtn).toBeDisabled()

    const attachBtn = page.getByRole('button', { name: /Chuẩn bị \/ Gắn link/i })
    await expect(attachBtn).toBeVisible()
    await expect(attachBtn).toBeDisabled()

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

    // 8. Capture After Screenshot
    await page.screenshot({ path: `docs/handoffs/evidence/rc19-u08-storage-after-${width}-${language}.png`, caret: 'initial' })
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
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user', '1'))
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
  await expect(page.getByRole('heading', { name: 'Storage resources' })).toBeVisible()
  await expect(page.getByText('Campaign root')).toBeVisible()
  await page.screenshot({ path: 'docs/handoffs/evidence/rc19-sto02-resource-registry.png', fullPage: true })
  await page.getByLabel('Display title').fill('Campaign root')
  await page.getByLabel('Canonical provider ID').fill('existing123')
  await page.getByLabel('Canonical provider URL').fill('https://drive.google.com/drive/folders/existing123')
  await page.getByLabel('Brand ID').fill('brand-1')
  await page.getByRole('button', { name: 'Add link metadata' }).click()
  await expect(page.getByText(/already registered/u)).toBeVisible()
  await page.getByRole('button', { name: 'Attach current scope' }).click()
  await expect.poll(() => actions.map(action => action.action)).toEqual(['create', 'attach_scope'])
})

test('Storage resource registry hides Admin controls for Member and rejects forged unauthenticated writes', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user', '3'))
  await page.route('**/api/storage-resources', route => route.fulfill({ json: { ok: true, resources: [] } }))
  await page.goto('/storage/resources')
  await expect(page.getByRole('heading', { name: 'Storage resources' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add link metadata' })).toHaveCount(0)
  const forged = await request.post('/api/storage-resources', { data: { action: 'create' } })
  expect(forged.status()).toBe(401)
})
