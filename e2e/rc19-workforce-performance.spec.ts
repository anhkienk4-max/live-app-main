import { expect, test, type Page } from '@playwright/test'

const staff = Array.from({ length: 11 }, (_, index) => ({
  staffId: `staff-${index + 1}`, name: `Staff ${String(index + 1).padStart(2, '0')}`,
  department: 'Operations', role: 'host', assignedShifts: 2,
  verifiedShifts: index ? 1 : 0, unknownAttendanceShifts: index ? 1 : 2,
  approvedNoShows: 0, approvedWorkedShifts: index ? 1 : 0,
  approvedActualMinutes: index ? 90 : 0, lateShifts: 0, onTimeShifts: index ? 1 : 0,
  attendanceCoveragePct: index ? 50 : 0, punctualityPct: index ? 100 : null,
  knownReliabilityPct: index ? 100 : null, isComplete: false,
  warning: 'INCOMPLETE_ATTENDANCE_EVIDENCE',
}))
const team = {
  staffCount: 11, assignedShifts: 22, verifiedShifts: 10, unknownAttendanceShifts: 12,
  workedShifts: 10, approvedNoShows: 0, actualMinutes: 900, onTimeShifts: 10,
  lateShifts: 0, attendanceCoveragePct: 45.45, punctualityPct: 100,
  knownReliabilityPct: 100, isComplete: false, incompleteStaffCount: 11,
}
const pagination = (page: number, total: number, size: number) => ({
  page, page_size: size, total_count: total, total_pages: Math.max(1, Math.ceil(total / size)),
  has_next: page * size < total, has_previous: page > 1,
})
const response = (period: string, role: string, rows = staff, page = 1, size = 20) => ({
  ok: true, period, role, team, staff: rows,
  staff_pagination: pagination(page, staff.length, size),
  leaderboard: staff.slice(1).map((row, index) => ({
    rank: index + 1, staff_id: row.staffId, name: row.name,
    punctuality_pct: 100, approved_worked_shifts: 1, approved_actual_minutes: 90,
  })),
  leaderboard_policy_configured: true, unmatched_approved_segments: 0,
  gmv_per_hour: null, orders_per_hour: null, warning: null,
})
async function fixture(page: Page, language: 'vi' | 'en') {
  await page.addInitScript(value => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', value)
  }, language)
  await page.route('**/api/workforce/capabilities', route => route.fulfill({
    json: { ok: true, capabilities: {
      actual_staffing: true, team_performance: true, own_performance: true, payroll: false,
    } },
  }))
  await page.route('**/api/workforce/performance*', route => {
    const id = new URL(route.request().url()).searchParams.get('staff_id') || 'staff-1'
    return route.fulfill({ json: {
      ok: true, performance: staff.find(row => row.staffId === id) || { ...staff[0], staffId: id, name: id },
    } })
  })
}

test('desktop VI: server page/filter, cards, individual and complete ranking', async ({ page }) => {
  await fixture(page, 'vi')
  const queries: URLSearchParams[] = []
  await page.route('**/api/workforce/overview*', route => {
    const query = new URL(route.request().url()).searchParams
    queries.push(query)
    const matching = staff.filter(row => (!query.get('staff_id') || row.staffId === query.get('staff_id'))
      && (!query.get('search') || row.name.toLowerCase().includes(query.get('search')!.toLowerCase())))
    const size = Number(query.get('page_size') || 20)
    const pageNumber = Math.min(Number(query.get('page') || 1), Math.max(1, Math.ceil(matching.length / size)))
    return route.fulfill({ json: {
      ...response(query.get('period') || '2026-10', query.get('role') || 'host',
        matching.slice((pageNumber - 1) * size, pageNumber * size), pageNumber, size),
      staff_pagination: pagination(pageNumber, matching.length, size),
    } })
  })
  await page.goto('/workforce?workforce_period=2026-10&workforce_staff_size=10')
  await expect(page.getByText('15h 0p')).toBeVisible()
  await page.getByRole('tab', { name: 'Bảng', exact: true }).click()
  await expect(page.getByText('Staff 01')).toBeVisible()
  await page.getByRole('button', { name: /trang sau|next page/i }).click()
  await expect(page.getByText('Staff 11')).toBeVisible()
  expect(queries.at(-1)?.get('page')).toBe('2')
  await page.getByRole('tab', { name: 'Thẻ', exact: true }).click()
  await expect(page.getByText('Staff 11')).toBeVisible()
  await page.getByRole('tab', { name: 'Bảng', exact: true }).click()
  await page.getByLabel('Sắp xếp nhân sự').selectOption('approved_minutes:desc')
  await expect.poll(() => queries.at(-1)?.get('sort')).toBe('approved_minutes')
  await page.getByLabel('Cột tình trạng minh chứng').selectOption('incomplete')
  await expect.poll(() => queries.at(-1)?.get('record')).toBe('incomplete')
  await page.getByRole('textbox', { name: 'Tìm nhân sự' }).fill('Staff 03')
  await page.getByRole('button', { name: 'Áp dụng' }).click()
  await expect(page.getByText('Staff 03')).toBeVisible()
  expect(queries.at(-1)?.get('search')).toBe('Staff 03')
  expect(new URL(page.url()).searchParams.get('workforce_staff_page')).toBeNull()
  await page.getByRole('button', { name: 'Xem chi tiết' }).click()
  await expect(page.getByRole('heading', { name: 'Staff 03' })).toBeVisible()
  await page.getByRole('tab', { name: 'Xếp hạng' }).click()
  await expect(page.getByText('Staff 03')).toBeVisible()
  await expect(page.getByText('#2')).toBeVisible()
  await page.getByRole('tab', { name: 'Tổng quan' }).click()
  await page.screenshot({ path: 'docs/handoffs/evidence/rc19-u10-workforce-after-1440-vi.png', fullPage: true })
})

test('mobile EN: missing approved evidence and empty period', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page, 'en')
  await page.route('**/api/workforce/overview*', route => {
    const query = new URL(route.request().url()).searchParams
    const empty = query.get('period') === '2026-09'
    return route.fulfill({ json: {
      ...response(query.get('period') || '2026-10', query.get('role') || 'host', []),
      team: empty ? { ...team, staffCount: 0, assignedShifts: 0, verifiedShifts: 0,
        unknownAttendanceShifts: 0, workedShifts: 0, onTimeShifts: 0, actualMinutes: 0,
        attendanceCoveragePct: null, punctualityPct: null, knownReliabilityPct: null } :
        { ...team, verifiedShifts: 0, actualMinutes: 0, workedShifts: 0,
          onTimeShifts: 0, unknownAttendanceShifts: 22, attendanceCoveragePct: 0,
          punctualityPct: null, knownReliabilityPct: null },
      staff_pagination: pagination(1, 0, 20), leaderboard: [],
    } })
  })
  await page.goto('/workforce?workforce_period=2026-10')
  await expect(page.getByText('No approved data')).toBeVisible()
  await expect(page.getByText('No data').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.screenshot({ path: 'docs/handoffs/evidence/rc19-u10-workforce-after-390-en.png', fullPage: true })
  await page.getByRole('tab', { name: 'Table' }).click()
  await expect(page.getByText('No staff match this period and filter.')).toBeVisible()
  await page.getByLabel('Performance period').fill('2026-09')
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'No assigned shifts or approved attendance' })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('workforce_period')).toBe('2026-09')
  await page.getByRole('combobox', { name: 'Operational role' }).click()
  await page.getByRole('option', { name: 'Support' }).click()
  expect(new URL(page.url()).searchParams.get('workforce_role')).toBe('support')
  await page.getByRole('combobox', { name: 'Period mode' }).click()
  await page.getByRole('option', { name: 'Yearly' }).click()
  expect(new URL(page.url()).searchParams.get('workforce_period')).toBe('2026')
})

test('API retry and actor switch discard stale team response', async ({ page }) => {
  await fixture(page, 'en')
  let reads = 0
  let release: (() => void) | undefined
  await page.route('**/api/workforce/overview*', async route => {
    reads++
    if (reads === 1) return route.fulfill({ status: 503, json: { ok: false, error: { code: 'WORKFORCE_TEAM_FAILED' } } })
    if (reads === 3) await new Promise<void>(resolve => { release = resolve })
    return route.fulfill({ json: { ...response('2026-10', 'host', [staff[1]]),
      staff_pagination: pagination(1, 1, 20) } })
  })
  await page.goto('/workforce?workforce_period=2026-10')
  await expect(page.getByRole('heading', { name: 'Could not load team performance' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('15h 0p')).toBeVisible()
  await page.getByRole('tab', { name: 'Table' }).click()
  await expect(page.getByText('Staff 02')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => reads).toBe(3)
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  release?.()
  await expect(page.getByText('Staff 02')).toHaveCount(0)
  await expect(page.getByText('Individual Performance & Attendance')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Table' })).toHaveCount(0)
})
