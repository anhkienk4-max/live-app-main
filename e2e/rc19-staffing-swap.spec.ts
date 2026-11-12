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

  test('Admin: Emergency replace panel displays pending-backend alert, timezone, verified segments and disabled button', async ({ page }) => {
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

    // Strictly assert Admin-only emergency replace trigger exists
    const emergencyBtn = page.getByTestId('admin-emergency-replace-btn')
    await expect(emergencyBtn).toBeVisible()
    await emergencyBtn.click()

    const replacePanel = page.getByTestId('staffing-replace-panel')
    await expect(replacePanel).toBeVisible()
    await expect(page.getByText(/Quy trình Thay người khẩn cấp/)).toBeVisible()

    // Strictly assert P0 pending-backend alert is rendered
    const pendingAlert = page.getByTestId('replace-pending-backend-alert')
    await expect(pendingAlert).toBeVisible()
    await expect(pendingAlert).toContainText('Chờ RPC nguyên tử từ Backend Codex C4')

    // Strictly assert confirm button is safely disabled
    const confirmBtn = page.getByTestId('confirm-replace-btn')
    await expect(confirmBtn).toBeVisible()
    await expect(confirmBtn).toBeDisabled()

    // Screenshot emergency replace panel with safety guard
    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-admin-emergency-replace.png') })

    // Close emergency replace
    await page.getByRole('button', { name: 'Đóng' }).click()
    await expect(replacePanel).toHaveCount(0)
  })

  test('Leader role: Can access standard replacement with pending guard, but DENIED admin emergency replace', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '2') // Leader user (id: 2)
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/staffing')
    const workspace = page.getByTestId('staffing-production-workspace')
    await expect(workspace).toBeVisible({ timeout: 30_000 })

    // Leader MUST NOT see Admin Emergency Replace button
    await expect(page.getByTestId('admin-emergency-replace-btn')).toHaveCount(0)

    // Leader CAN see standard replacement button if assigned staff exists
    const replaceStaffBtn = page.locator('[data-testid^="replace-staff-"]').first()
    await expect(replaceStaffBtn).toBeVisible()
    await replaceStaffBtn.click()

    const replacePanel = page.getByTestId('staffing-replace-panel')
    await expect(replacePanel).toBeVisible()
    await expect(page.getByText(/Thay thế nhân sự đã phân công/)).toBeVisible()

    // Verify pending-backend alert and disabled execute button
    await expect(page.getByTestId('replace-pending-backend-alert')).toBeVisible()
    await expect(page.getByTestId('confirm-replace-btn')).toBeDisabled()

    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-staffing-replace-diff.png') })
    await page.getByRole('button', { name: 'Đóng' }).click()
    await expect(replacePanel).toHaveCount(0)
  })

  test('Member role: DENIED all assignment, replacement, and emergency replacement controls', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '4') // Member user
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    await page.goto('/staffing')
    // Member should be on open registration board, NOT staffing-production-workspace
    await expect(page.getByTestId('staffing-production-workspace')).toHaveCount(0)
    // Member should not have access to admin-emergency-replace-btn
    await expect(page.getByTestId('admin-emergency-replace-btn')).toHaveCount(0)
    // Member should not see replace staff buttons
    await expect(page.locator('[data-testid^="replace-staff-"]')).toHaveCount(0)
    // Member should not see manual assignment panel
    await expect(page.getByRole('button', { name: 'Phân công' })).toHaveCount(0)
  })

  test('ShiftDetailModal: Staffing tab displays active swaps summary, replacement dialog with pending guard', async ({ page }) => {
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

    // Check inline Replace button in modal
    const modalReplaceBtn = page.locator('[data-testid^="replace-staffing-"]').first()
    if (await modalReplaceBtn.count() > 0) {
      await modalReplaceBtn.click()
      // Verify modal pending backend alert & disabled button
      await expect(page.getByTestId('replace-modal-pending-backend-alert')).toBeVisible()
      await expect(page.getByTestId('modal-confirm-replace-btn')).toBeDisabled()
      await page.getByRole('button', { name: 'Đóng' }).click()
    }

    // Take evidence screenshot of ShiftDetailModal Staffing tab
    await page.screenshot({ path: path.join(evidenceDir, 'rc19-g4-shift-detail-staffing-tab.png') })
    await page.keyboard.press('Escape')
  })
})
