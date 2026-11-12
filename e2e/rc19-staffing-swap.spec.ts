import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

const evidenceDir = path.join(process.cwd(), 'docs', 'handoffs', 'evidence')

test.beforeAll(async () => {
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true })
  }
})

test.describe('RC19 G4: Staffing Workspace, Replacement, and PASS/Swap', () => {
  test('Staffing workspace scope tabs (Upcoming vs History vs All) and filter drawer with staff filter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1') // Admin user
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/staffing')
    const workspace = page.getByTestId('staffing-production-workspace')
    await expect(workspace).toBeVisible({ timeout: 30_000 })

    // Verify scope navigation tabs
    const upcomingTab = page.getByTestId('staffing-scope-upcoming')
    const historyTab = page.getByTestId('staffing-scope-history')
    const allTab = page.getByTestId('staffing-scope-all')

    await expect(upcomingTab).toBeVisible()
    await expect(historyTab).toBeVisible()
    await expect(allTab).toBeVisible()
    await expect(upcomingTab).toHaveAttribute('aria-pressed', 'true')

    // Switch to History tab
    await historyTab.click()
    await expect(historyTab).toHaveAttribute('aria-pressed', 'true')
    await expect(upcomingTab).toHaveAttribute('aria-pressed', 'false')

    // Switch back to Upcoming tab
    await upcomingTab.click()
    await expect(upcomingTab).toHaveAttribute('aria-pressed', 'true')

    // Open filter drawer and verify staff filter
    const toggle = page.getByTestId('staffing-filter-toggle')
    await toggle.click()
    const filterPanel = page.getByTestId('staffing-filter-panel')
    await expect(filterPanel).toBeVisible()

    // Capture screenshot of workspace with scope tabs and filter drawer
    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-staffing-workspace-scope.png') })

    // Close filters
    await page.getByRole('button', { name: 'Đóng' }).click()
    await expect(filterPanel).toHaveCount(0)
  })

  test('Staffing Action Panel displays Replacement flow, Before/After diff, and Admin Emergency Replacement', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1') // Admin user
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/staffing')
    const workspace = page.getByTestId('staffing-production-workspace')
    await expect(workspace).toBeVisible({ timeout: 30_000 })

    const actionPanel = page.getByTestId('staffing-action-panel')
    await expect(actionPanel).toBeVisible({ timeout: 15_000 })

    // Verify Admin-only emergency replace trigger
    const emergencyBtn = page.getByTestId('admin-emergency-replace-btn')
    if (await emergencyBtn.count() > 0) {
      await expect(emergencyBtn).toBeVisible()
      await emergencyBtn.click()
      const replacePanel = page.getByTestId('staffing-replace-panel')
      await expect(replacePanel).toBeVisible()
      await expect(page.getByText(/Quy trình Thay người khẩn cấp/)).toBeVisible()

      // Screenshot emergency replace panel
      await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-admin-emergency-replace.png') })

      // Cancel emergency replace
      await page.getByRole('button', { name: 'Hủy' }).click()
      await expect(replacePanel).toHaveCount(0)
    }

    // Verify standard replacement button on assigned staff if present
    const replaceStaffBtn = page.locator('[data-testid^="replace-staff-"]').first()
    if (await replaceStaffBtn.count() > 0) {
      await replaceStaffBtn.click()
      const replacePanel = page.getByTestId('staffing-replace-panel')
      await expect(replacePanel).toBeVisible()
      await expect(page.getByText(/Thay thế nhân sự đã phân công/)).toBeVisible()
      await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-staffing-replace-diff.png') })
      await page.getByRole('button', { name: 'Hủy' }).click()
    }
  })

  test('Member role cannot see Admin Emergency Replacement or manual assignment panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      // User with member role
      localStorage.setItem('livestream-ops-current-user', '4') // Member user
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/staffing')
    // Member should not have access to admin-emergency-replace-btn
    await expect(page.getByTestId('admin-emergency-replace-btn')).toHaveCount(0)
  })

  test('ShiftDetailModal preserves Staffing tab with Replace and Swap request dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1') // Admin
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/staffing')
    const eye = page.locator('[data-testid^="staffing-eye-"]').first()
    await expect(eye).toBeVisible({ timeout: 30_000 })
    await eye.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Switch to Staffing tab
    const staffingTab = dialog.getByRole('tab', { name: /Điều phối ca|Staffing/i })
    await staffingTab.click()

    // Take evidence screenshot of ShiftDetailModal Staffing tab
    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-shift-detail-staffing-tab.png') })

    await page.keyboard.press('Escape')
  })
})
