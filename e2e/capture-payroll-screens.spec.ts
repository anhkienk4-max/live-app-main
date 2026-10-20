import { expect, test } from '@playwright/test'
import * as path from 'node:path'

const artifactDir = 'C:/Users/KienNguyen/.gemini/antigravity-ide/brain/c09a3993-9eeb-4262-a2c8-e22dcf14536b'

const mockRates = [
  {
    id: 'rate-host-default',
    staff_id: null,
    operational_role: 'host',
    effective_from: '2026-10-01',
    effective_through: null,
    vnd_per_hour: 120000,
    overtime_multiplier_basis_points: 15000,
    approved_by: 'admin-1',
    approved_at: '2026-10-01T08:00:00Z',
    approval_note: 'Đơn giá chuẩn Host tháng 10/2026',
    created_at: '2026-10-01T08:00:00Z',
    scope: 'role_default',
  },
  {
    id: 'rate-support-default',
    staff_id: null,
    operational_role: 'support',
    effective_from: '2026-10-01',
    effective_through: null,
    vnd_per_hour: 60000,
    overtime_multiplier_basis_points: 15000,
    approved_by: 'admin-1',
    approved_at: '2026-10-01T08:00:00Z',
    approval_note: 'Đơn giá chuẩn Support tháng 10/2026',
    created_at: '2026-10-01T08:00:00Z',
    scope: 'role_default',
  },
  {
    id: 'rate-technical-default',
    staff_id: null,
    operational_role: 'technical',
    effective_from: '2026-10-01',
    effective_through: null,
    vnd_per_hour: 80000,
    overtime_multiplier_basis_points: 15000,
    approved_by: 'admin-1',
    approved_at: '2026-10-01T08:00:00Z',
    approval_note: 'Đơn giá chuẩn Kỹ thuật tháng 10/2026',
    created_at: '2026-10-01T08:00:00Z',
    scope: 'role_default',
  },
  {
    id: 'rate-staff-vip',
    staff_id: 'staff-lead-01',
    operational_role: 'host',
    effective_from: '2026-10-01',
    effective_through: '2026-10-31',
    vnd_per_hour: 180000,
    overtime_multiplier_basis_points: 20000,
    approved_by: 'finance-lead',
    approved_at: '2026-10-01T09:00:00Z',
    approval_note: 'Đơn giá riêng Senior Host Livestream Gala',
    created_at: '2026-10-01T09:00:00Z',
    scope: 'staff_specific',
  },
]

const mockPeriods = [
  {
    id: 'period-draft-current',
    period_start: '2026-10-01',
    period_end: '2026-10-15',
    status: 'draft',
    revision: 1,
    created_by: 'admin-1',
    reviewed_by: null,
    confirmed_by: null,
    locked_by: null,
    locked_at: null,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
  },
  {
    id: 'period-locked-prev',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    status: 'locked',
    revision: 2,
    created_by: 'admin-1',
    reviewed_by: 'lead-finance',
    confirmed_by: 'director-ops',
    locked_by: 'director-ops',
    locked_at: '2026-10-02T15:00:00Z',
    created_at: '2026-09-30T10:00:00Z',
    updated_at: '2026-10-02T15:00:00Z',
  },
]

const mockLines = [
  {
    id: 'line-01',
    period_id: 'period-draft-current',
    segment_id: 'seg-101',
    rate_card_id: 'rate-host-default',
    staff_id: 'staff-host-01',
    operational_role: 'host',
    actual_minutes: 180,
    payable_minutes: 180,
    overtime_minutes: 60,
    rate_vnd_per_hour: 120000,
    overtime_multiplier_basis_points: 15000,
    gross_vnd: 420000,
    adjustment_vnd: 50000,
    net_vnd: 470000,
    adjustment_reason: 'Thưởng KPI hoàn thành vượt 120% GMV',
    calculation_version: 'rc16-v1',
    version: 1,
    voided_at: null,
  },
  {
    id: 'line-02',
    period_id: 'period-draft-current',
    segment_id: 'seg-102',
    rate_card_id: 'rate-support-default',
    staff_id: 'staff-supp-02',
    operational_role: 'support',
    actual_minutes: 240,
    payable_minutes: 240,
    overtime_minutes: 0,
    rate_vnd_per_hour: 60000,
    overtime_multiplier_basis_points: 15000,
    gross_vnd: 240000,
    adjustment_vnd: 0,
    net_vnd: 240000,
    adjustment_reason: null,
    calculation_version: 'rc16-v1',
    version: 1,
    voided_at: null,
  },
  {
    id: 'line-03-voided',
    period_id: 'period-draft-current',
    segment_id: 'seg-103',
    rate_card_id: 'rate-technical-default',
    staff_id: 'staff-tech-01',
    operational_role: 'technical',
    actual_minutes: 90,
    payable_minutes: 90,
    overtime_minutes: 0,
    rate_vnd_per_hour: 80000,
    overtime_multiplier_basis_points: 15000,
    gross_vnd: 120000,
    adjustment_vnd: 0,
    net_vnd: 120000,
    adjustment_reason: null,
    calculation_version: 'rc16-v1',
    version: 2,
    voided_at: '2026-10-16T11:00:00Z',
  },
]

const mockAudit = [
  {
    id: 1,
    period_id: 'period-draft-current',
    line_id: null,
    action: 'create_period',
    actor_id: 'admin-1',
    reason: 'Khởi tạo chu kỳ lương nửa đầu tháng 10/2026',
    created_at: '2026-10-15T10:00:00Z',
  },
  {
    id: 2,
    period_id: 'period-draft-current',
    line_id: 'line-01',
    action: 'prepare_line',
    actor_id: 'admin-1',
    reason: 'Đã xác minh chấm công hợp lệ từ ca Live Gala',
    created_at: '2026-10-15T10:05:00Z',
  },
  {
    id: 3,
    period_id: 'period-draft-current',
    line_id: 'line-03-voided',
    action: 'void_line',
    actor_id: 'admin-1',
    reason: 'Vô hiệu hóa dòng kỹ thuật do phân đoạn bị hủy lịch',
    created_at: '2026-10-16T11:00:00Z',
  },
]

test.describe('Payroll Visual & Functional Screen Audit', () => {
  test('Capture Periods, Rates, and Draft Workspace screens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    // Set Admin identity in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
    })

    // Mock API routes
    await page.route('**/api/workforce/capabilities', async (route) => {
      await route.fulfill({
        json: {
          ok: true,
          capabilities: {
            actual_staffing: true,
            team_performance: true,
            own_performance: true,
            payroll: true,
          },
        },
      })
    })

    await page.route('**/api/workforce/payroll**', async (route) => {
      const url = new URL(route.request().url())
      const action = url.searchParams.get('action')
      const periodId = url.searchParams.get('period_id')

      if (action === 'list_periods') {
        return route.fulfill({
          json: {
            ok: true,
            periods: mockPeriods,
            pagination: {
              page: 1,
              page_size: 20,
              total_count: 2,
              total_pages: 1,
              has_next: false,
              has_previous: false,
            },
          },
        })
      }

      if (action === 'list_rates') {
        return route.fulfill({
          json: {
            ok: true,
            rates: mockRates,
            pagination: {
              page: 1,
              page_size: 20,
              total_count: 4,
              total_pages: 1,
              has_next: false,
              has_previous: false,
            },
          },
        })
      }

      if (periodId) {
        const found = mockPeriods.find((p) => p.id === periodId) || mockPeriods[0]
        return route.fulfill({
          json: {
            ok: true,
            period: found,
            lines: mockLines,
            audit: mockAudit,
          },
        })
      }

      return route.fulfill({ json: { ok: true } })
    })

    // 1. Visit /payroll -> defaults to "periods" tab
    await page.goto('/payroll')
    await expect(page.getByText('Quản lý Bảng lương & Quyết toán')).toBeVisible()
    // 1. Click "Danh sách chu kỳ lương" tab
    await page.getByRole('tab', { name: /Danh sách chu kỳ lương/ }).click()
    await page.waitForTimeout(600)
    await page.screenshot({
      path: path.join(artifactDir, 'payroll_screen_1_periods_list.png'),
      fullPage: true,
    })

    // 2. Click "Khung lương & Đơn giá" tab
    await page.getByRole('tab', { name: /Khung lương & Đơn giá/ }).click()
    await page.waitForTimeout(600)
    await page.screenshot({
      path: path.join(artifactDir, 'payroll_screen_2_rates_list.png'),
      fullPage: true,
    })

    // Open Register Rate dialog to inspect form validation & live preview simulator
    await page.getByRole('button', { name: /Đăng ký khung lương/ }).click()
    await page.waitForTimeout(500)
    await page.locator('#payrollratemanager-field-4').fill('120000')
    await page.locator('#payrollratemanager-field-5').fill('1.5')
    await page.waitForTimeout(400)
    await page.screenshot({
      path: path.join(artifactDir, 'payroll_screen_2b_rate_modal.png'),
    })
    await page.getByRole('button', { name: /Hủy bỏ/ }).click()
    await page.waitForTimeout(300)

    // 3. Click "Không gian đối soát" tab (Workspace)
    await page.getByRole('tab', { name: /Không gian đối soát/ }).click()
    await page.waitForTimeout(600)
    await page.screenshot({
      path: path.join(artifactDir, 'payroll_screen_3_workspace_full.png'),
      fullPage: true,
    })

    // Also capture mobile viewport 390px
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(artifactDir, 'payroll_screen_3_workspace_mobile.png'),
      fullPage: true,
    })
  })
})
