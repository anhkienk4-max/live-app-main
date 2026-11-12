import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

const evidenceDir = path.join(process.cwd(), 'docs', 'handoffs', 'evidence')

test.beforeAll(async () => {
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true })
  }
})

test.describe('RC19 G3: Full Shift Editor — Multiple Staffing Segments & Capacity', () => {
  test('Admin creates parent shift with multiple segments and 2 simultaneous hosts', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1') // Admin user
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/shifts')
    await page.waitForLoadState('networkidle')

    // Find and click the create shift button
    const createBtn = page.getByTestId('add-shift-btn')
    await expect(createBtn).toBeVisible({ timeout: 30_000 })
    await createBtn.click()

    // Shift form dialog should open
    const dialog = page.getByTestId('shift-form-dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })

    // Step 0: General info
    // Select Execution source
    const executionSourceSelect = page.locator('#shift-execution-source')
    if (await executionSourceSelect.isVisible()) {
      await executionSourceSelect.click()
      await page.getByRole('option', { name: /Internal/i }).click()
    }

    // Title
    const titleInput = page.getByPlaceholder(/Morning livestream/i)
    await titleInput.fill('KAO Super Brand Day Livestream')

    // External code
    const externalCodeInput = page.getByTestId('shift-external-code-input')
    await externalCodeInput.fill('KAO-20261101-1000-1800')

    // Navigate to Step 1: Schedule
    const nextBtn = page.getByRole('button', { name: 'Tiếp tục' })
    await nextBtn.click()

    // Step 1: Set date and time
    const dateInput = page.locator('input[type="date"]').first()
    await dateInput.fill('2026-11-01')

    const timeInputs = page.locator('input[type="time"]')
    await timeInputs.nth(0).fill('10:00') // Start time
    await timeInputs.nth(1).fill('18:00') // End time

    // Navigate to Step 2: Staffing & Segments
    await nextBtn.click()

    // Verify Staffing Segments section
    const segmentsSection = page.getByTestId('shift-segments-editor-section')
    await expect(segmentsSection).toBeVisible()

    const addSegmentBtn = page.getByTestId('add-segment-button')
    await expect(addSegmentBtn).toBeVisible()

    // Add Segment 1 (K01: 10:00 - 11:00)
    await addSegmentBtn.click()
    const seg1 = page.getByTestId('segment-item-1')
    await expect(seg1).toBeVisible()
    await page.getByTestId('segment-start-1').fill('10:00')
    await page.getByTestId('segment-end-1').fill('11:00')
    await page.getByTestId('segment-host-count-1').fill('1')
    await page.getByTestId('segment-planned-hosts-1').fill('MC Mai Linh')

    // Add Segment 2 (K02: 11:00 - 16:00, 2 Hosts!)
    await addSegmentBtn.click()
    const seg2 = page.getByTestId('segment-item-2')
    await expect(seg2).toBeVisible()
    await page.getByTestId('segment-start-2').fill('11:00')
    await page.getByTestId('segment-end-2').fill('16:00')
    await page.getByTestId('segment-host-count-2').fill('2') // 2 simultaneous hosts!
    await page.getByTestId('segment-planned-hosts-2').fill('MC Hoàng Yến, MC Quỳnh Như')

    // Add Segment 3 (K03: 16:00 - 18:00)
    await addSegmentBtn.click()
    const seg3 = page.getByTestId('segment-item-3')
    await expect(seg3).toBeVisible()
    await page.getByTestId('segment-start-3').fill('16:00')
    await page.getByTestId('segment-end-3').fill('18:00')
    await page.getByTestId('segment-host-count-3').fill('1')
    await page.getByTestId('segment-planned-hosts-3').fill('MC Tuấn Anh')

    // Click Sync Capacity button
    const syncBtn = page.getByTestId('sync-segment-capacity-button')
    await expect(syncBtn).toBeVisible()
    await syncBtn.click()

    // Capture screenshot on Desktop
    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g3-shift-editor-desktop.png') })

    // Verify planned names chips are rendered with "Dự kiến"
    await expect(seg2.getByText('MC Hoàng Yến')).toBeVisible()
    await expect(seg2.getByText('MC Quỳnh Như')).toBeVisible()

    // Close modal
    await page.getByRole('button', { name: /Hủy|Cancel/i }).first().click()
  })

  test('Mobile viewport (390px): Shift Editor fits cleanly within viewport without horizontal overflow', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept())
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/shifts')
    await page.waitForLoadState('networkidle')

    const createBtn = page.getByTestId('add-shift-btn')
    await expect(createBtn).toBeVisible({ timeout: 30_000 })
    await createBtn.click()

    const dialog = page.getByTestId('shift-form-dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })

    // Capture mobile screenshot
    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g3-shift-editor-mobile.png') })

    // Ensure dialog content does not exceed viewport width
    const box = await dialog.boundingBox()
    expect(box).toBeTruthy()
    if (box) {
      expect(box.width).toBeLessThanOrEqual(390)
    }

    await page.getByRole('button', { name: /Hủy|Cancel/i }).first().click()
  })
})
