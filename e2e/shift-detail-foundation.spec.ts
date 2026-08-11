import { expect, test, type Page } from '@playwright/test'

const today = () => new Date().toISOString().slice(0, 10)

async function useMockUser(page: Page, userId: '1' | '2' | '3') {
  await page.addInitScript(id => {
    window.localStorage.setItem('livestream-ops-current-user', id)
  }, userId)
}

async function gotoCalendar(page: Page) {
  const response = await page.goto('/calendar', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('calendar-page')).toBeVisible()
}

async function openCalendarShift(page: Page, shiftId: string) {
  await page.getByTestId(`calendar-event-${shiftId}`).click()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
}

test.describe('Shift Operations S1 detail foundation', () => {
  test('Admin opens canonical detail from Calendar, preserves filters, and reuses ShiftFormDialog', async ({ page }) => {
    await useMockUser(page, '1')
    await gotoCalendar(page)

    const search = page.getByPlaceholder(/Search shifts/i)
    await search.fill('TechGear')
    await openCalendarShift(page, 's1')

    await expect(page.getByTestId('shift-detail-title')).toHaveText('TechGear morning live')
    await expect(page.getByTestId('shift-detail-modal').getByText('TechGear Pro', { exact: true }).first()).toBeVisible()
    await expect(page.getByTestId('shift-detail-modal').getByText('TikTok Shop', { exact: true }).first()).toBeVisible()
    await expect(page.getByTestId('shift-detail-date')).not.toContainText(/Invalid Date|undefined|null/)
    await expect(page.getByTestId('shift-detail-time')).toContainText('09:00')
    await expect(page.getByTestId('shift-detail-role-host')).toContainText('Sarah Johnson')
    await expect(page.getByTestId('shift-detail-role-support')).toContainText('Emily Davis')
    await expect(page.getByTestId('shift-detail-role-technical')).toContainText('Alex Morgan')
    await expect(page.getByTestId('edit-shift-detail')).toBeVisible()
    await expect(page.getByTestId('delete-shift-detail')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shift-detail-modal')).toBeHidden()
    await expect(search).toHaveValue('TechGear')
    await expect(page.getByTestId('calendar-event-s1')).toBeVisible()

    await openCalendarShift(page, 's1')
    await page.getByTestId('edit-shift-detail').click()
    await expect(page.getByRole('heading', { name: 'Edit Shift', exact: true })).toBeVisible()
  })

  test('Day Sessions opens the same selected-shift detail and Leader has edit without delete', async ({ page }) => {
    await useMockUser(page, '2')
    await gotoCalendar(page)

    await page.getByTestId(`calendar-day-open-${today()}`).click()
    await expect(page.getByRole('dialog')).toContainText(/Live sessions on|Các phiên live ngày/)
    await page.getByTestId('day-session-view-shift-s1').click()

    await expect(page.getByTestId('shift-detail-title')).toHaveText('TechGear morning live')
    await expect(page.getByTestId('edit-shift-detail')).toBeVisible()
    await expect(page.getByTestId('delete-shift-detail')).toHaveCount(0)
  })

  test('Member sees safe partial staffing and no management actions on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await useMockUser(page, '3')
    await gotoCalendar(page)

    await page.getByRole('tab', { name: /Open shifts|Ca đang mở/, exact: true }).click()
    await page.getByRole('button', { name: /Card view|Dạng thẻ/, exact: true }).click()
    await page.getByTestId('open-shift-detail-card-s6').click()

    const modal = page.getByTestId('shift-detail-modal')
    await expect(modal).toBeVisible()
    expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    await expect(page.getByTestId('shift-detail-title')).toHaveText('Beauty evening deal')
    await expect(page.getByTestId('shift-detail-role-host')).toContainText(/Not assigned|Chưa phân công/)
    await expect(page.getByTestId('shift-detail-role-support')).toContainText(/Not assigned|Chưa phân công/)
    await expect(page.getByTestId('shift-detail-role-technical')).toContainText(/Not assigned|Chưa phân công/)
    await expect(page.getByTestId('edit-shift-detail')).toHaveCount(0)
    await expect(page.getByTestId('delete-shift-detail')).toHaveCount(0)
    await expect.poll(async () => modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)

    await page.keyboard.press('Escape')
    await expect(modal).toBeHidden()
    await expect(page.getByRole('tab', { name: /Open shifts|Ca đang mở/, exact: true })).toHaveAttribute('aria-selected', 'true')
  })

  test('compact and table surfaces open the exact shift without changing the selected view', async ({ page }) => {
    await useMockUser(page, '3')
    await gotoCalendar(page)
    await page.getByRole('tab', { name: /Open shifts|Ca đang mở/, exact: true }).click()

    await page.getByRole('button', { name: /Compact list|Danh sách gọn/, exact: true }).click()
    await page.getByTestId('open-shift-detail-compact-s3').click()
    await expect(page.getByTestId('shift-detail-title')).toHaveText('Beauty flash sale')
    await page.getByTestId('close-shift-detail').click()
    await expect(page.getByTestId('open-shift-detail-compact-s3')).toBeVisible()

    await page.getByRole('button', { name: /Table view|Dạng bảng/, exact: true }).click()
    await page.getByTestId('open-shift-detail-table-s3').click()
    await expect(page.getByTestId('shift-detail-title')).toHaveText('Beauty flash sale')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('open-shift-detail-table-s3')).toBeVisible()
  })

  test('new overnight shift renders next-day semantics instead of a negative duration', async ({ page }) => {
    await useMockUser(page, '1')
    await gotoCalendar(page)

    await page.getByRole('button', { name: /New shift|Tạo ca/, exact: true }).first().click()
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Create New Shift', exact: true }) })
    const title = `S1 overnight ${Date.now()}`
    await dialog.locator('input[placeholder="Morning livestream"]').fill(title)
    await dialog.locator('input[type="date"]').fill(today())
    await dialog.locator('input[type="time"]').nth(0).fill('22:00')
    await dialog.locator('input[type="time"]').nth(1).fill('02:00')
    await dialog.getByText('Brand *', { exact: true }).locator('..').getByRole('combobox').click()
    await page.getByRole('option', { name: 'TechGear Pro', exact: true }).click()
    await dialog.getByText('Platform *', { exact: true }).locator('..').getByRole('combobox').click()
    await page.getByRole('option', { name: 'TikTok Shop', exact: true }).click()
    await dialog.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: /List|Danh sách/, exact: true }).click()
    const shiftButton = page.getByTestId(/^list-shift-/).filter({ hasText: '22:00 - 02:00' }).last()
    await shiftButton.click()
    await expect(page.getByTestId('shift-detail-title')).toHaveText(title)
    await expect(page.getByTestId('shift-detail-time')).toContainText('22:00')
    await expect(page.getByTestId('shift-detail-time')).toContainText('02:00')
    await expect(page.getByTestId('shift-detail-overnight')).toContainText(/Ends next day|Kết thúc ngày hôm sau/)
    await expect(page.getByTestId('shift-detail-modal')).not.toContainText(/NaN|Invalid Date/)
  })
})
