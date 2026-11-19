import { expect, test } from '@playwright/test'

test.describe('RC19 Gemini G2 — Calendar Date Filter & Viewport Synchronization', () => {
  test('Direct deep-link with conflicting date reconciles to custom range', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    // Deep link with conflicting calendar_date (Nov 2026) vs custom range in calendar_filters (Jan 7-15, 2026)
    const conflictingUrl = '/calendar?calendar_view=month&calendar_date=2026-11-12&calendar_filters=%7B%22time%22%3A%22custom%22%2C%22customFrom%22%3A%222026-01-07%22%2C%22customTo%22%3A%222026-01-15%22%7D'
    await page.goto(conflictingUrl)

    // Verify calendar view is mounted
    const fullMonth = page.getByTestId('calendar-full-month-view')
    await expect(fullMonth).toBeVisible({ timeout: 30_000 })

    // Viewport date in URL must be reconciled to 2026-01-07 (start of custom range)
    await expect.poll(() => new URL(page.url()).searchParams.get('calendar_date')).toBe('2026-01-07')

    // Header/view title must display January 2026 (e.g. "tháng 01 2026" in Vietnamese)
    const titleLocator = page.getByTestId('calendar-view-title')
    await expect(titleLocator).toBeVisible()
    await expect(titleLocator).toContainText(/tháng 0?1 2026|January 2026/i)

    // Take screenshot evidence
    await page.screenshot({ path: 'docs/handoffs/evidence/rc19-date-sync-reconcile-init.png', fullPage: false })
  })

  test('View toggle (Month -> Week -> Day -> List) preserves custom date filter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    const initialUrl = '/calendar?calendar_view=month&calendar_date=2026-01-07&calendar_filters=%7B%22time%22%3A%22custom%22%2C%22customFrom%22%3A%222026-01-07%22%2C%22customTo%22%3A%222026-01-15%22%7D'
    await page.goto(initialUrl)
    await expect(page.getByTestId('calendar-full-month-view')).toBeVisible({ timeout: 30_000 })

    // Switch to Week view
    await page.getByRole('button', { name: 'Tuần', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('calendar_view')).toBe('week')
    const filtersWeek = JSON.parse(new URL(page.url()).searchParams.get('calendar_filters') ?? '{}')
    expect(filtersWeek.time).toBe('custom')
    expect(filtersWeek.customFrom).toBe('2026-01-07')
    expect(filtersWeek.customTo).toBe('2026-01-15')

    // Switch to Day view
    await page.getByRole('button', { name: 'Ngày', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('calendar_view')).toBe('day')
    const filtersDay = JSON.parse(new URL(page.url()).searchParams.get('calendar_filters') ?? '{}')
    expect(filtersDay.time).toBe('custom')
    expect(filtersDay.customFrom).toBe('2026-01-07')
    expect(filtersDay.customTo).toBe('2026-01-15')

    // Switch to List view
    await page.getByRole('button', { name: 'Danh sách', exact: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('calendar_view')).toBe('list')
    const filtersList = JSON.parse(new URL(page.url()).searchParams.get('calendar_filters') ?? '{}')
    expect(filtersList.time).toBe('custom')
    expect(filtersList.customFrom).toBe('2026-01-07')
    expect(filtersList.customTo).toBe('2026-01-15')

    // Capture screenshot evidence
    await page.screenshot({ path: 'docs/handoffs/evidence/rc19-date-sync-view-modes.png', fullPage: false })
  })

  test('Auto-clears time filter and shows toast notification when navigating outside custom range', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    // Custom range: Jan 7-15, 2026, month view with custom brand filter
    const initialUrl = '/calendar?calendar_view=month&calendar_date=2026-01-07&calendar_filters=%7B%22time%22%3A%22custom%22%2C%22customFrom%22%3A%222026-01-07%22%2C%22customTo%22%3A%222026-01-15%22%2C%22brandIds%22%3A%5B%22brand-test-preserve%22%5D%7D'
    await page.goto(initialUrl)
    await expect(page.getByTestId('calendar-full-month-view')).toBeVisible({ timeout: 30_000 })

    // Click Next button to move to February 2026 (outside Jan 7-15)
    const nextBtn = page.getByTestId('calendar-next-btn')
    await expect(nextBtn).toBeVisible()
    await nextBtn.click()

    // Assert that time filter is reset to 'all', but brandIds are preserved!
    await expect.poll(() => {
      const filters = JSON.parse(new URL(page.url()).searchParams.get('calendar_filters') ?? '{}')
      return filters.time
    }).toBe('all')

    const currentFilters = JSON.parse(new URL(page.url()).searchParams.get('calendar_filters') ?? '{}')
    expect(currentFilters.brandIds).toEqual(['brand-test-preserve'])
    expect(currentFilters.customFrom).toBe('')
    expect(currentFilters.customTo).toBe('')

    // Toast notification should be visible informing user about the reset
    const toastNotice = page.getByTestId('toast').filter({ hasText: /Đã bỏ bộ lọc thời gian/i }).first()
    await expect(toastNotice).toBeVisible({ timeout: 10_000 })

    // Capture screenshot evidence
    await page.screenshot({ path: 'docs/handoffs/evidence/rc19-date-sync-auto-reset-toast.png', fullPage: false })
  })

  test('Differentiates empty state causes (filtered-empty vs range-mismatch) and allows clearing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    // 1. Filtered empty scenario: in November 2026 where mock shifts exist, but brand filter has no matches
    const filteredEmptyUrl = '/calendar?calendar_view=month&calendar_date=2026-11-15&calendar_filters=%7B%22brandIds%22%3A%5B%22non-existent-brand-id%22%5D%7D'
    await page.goto(filteredEmptyUrl)

    const emptyNotice = page.getByTestId('calendar-filtered-empty-notice')
    await expect(emptyNotice).toBeVisible({ timeout: 30_000 })
    await expect(emptyNotice).toHaveAttribute('data-empty-reason', 'filtered-empty')
    await expect(emptyNotice).toContainText(/không khớp với bộ lọc đang chọn/)

    // Clear filters button resets filter and renders shifts
    const clearBtn = page.getByTestId('calendar-clear-filters-notice-btn')
    await expect(clearBtn).toBeVisible()
    await clearBtn.click()

    await expect(emptyNotice).toBeHidden({ timeout: 15_000 })
    await expect(page.locator('[data-testid^="calendar-event-"]:visible').first()).toBeVisible({ timeout: 15_000 })

    // 2. Range mismatch scenario: custom date range in the far future where zero shifts exist
    const rangeMismatchUrl = '/calendar?calendar_view=month&calendar_date=2029-01-01&calendar_filters=%7B%22time%22%3A%22custom%22%2C%22customFrom%22%3A%222029-01-01%22%2C%22customTo%22%3A%222029-01-10%22%7D'
    await page.goto(rangeMismatchUrl)

    const rangeNotice = page.getByTestId('calendar-filtered-empty-notice')
    await expect(rangeNotice).toBeVisible({ timeout: 30_000 })
    await expect(rangeNotice).toHaveAttribute('data-empty-reason', 'range-mismatch')
    await expect(rangeNotice).toContainText(/Không có ca nào trong khoảng ngày đã lọc/)

    // Capture screenshot evidence
    await page.screenshot({ path: 'docs/handoffs/evidence/rc19-date-sync-empty-state.png', fullPage: false })
  })
})
