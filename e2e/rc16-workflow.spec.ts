import { expect, test, type Page } from '@playwright/test'

// Isolated browser contract tests: existing local mock identity and intercepted API only.
// Database authority, RLS and concurrency are exercised by the RC16 PostgreSQL runner.
const pagination = { page: 1, page_size: 10, total_count: 1, total_pages: 1, has_next: false, has_previous: false }
const initialPeriod = { id: 'period-1', period_start: '2026-10-01', period_end: '2026-10-31', status: 'draft', revision: 1, created_by: '2', reviewed_by: null, confirmed_by: null, locked_by: null as string | null, locked_at: null as string | null }
const initialLine = { id: 'line-1', period_id: 'period-1', segment_id: 'segment-1', staff_id: '3', operational_role: 'host', actual_minutes: 90, payable_minutes: 60, overtime_minutes: 30, rate_vnd_per_hour: 100000, overtime_multiplier_basis_points: 15000, gross_vnd: 125000, adjustment_vnd: 0, net_vnd: 125000, version: 1, voided_at: null as string | null }
const enabled = { actual_staffing: true, team_performance: true, own_performance: true, payroll: true }

async function identity(page: Page, id = '1') {
  await page.addInitScript(value => localStorage.setItem('livestream-ops-current-user', value), id)
}
async function contained(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  for (const tab of await page.getByRole('tab').all()) {
    const box = await tab.boundingBox()
    if (box) expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
}
async function capabilities(page: Page, values = enabled) {
  await page.route('**/api/workforce/capabilities', route => route.fulfill({ json: { ok: true, capabilities: values } }))
}

for (const width of [390, 1440]) {
  test('Payroll Gemini workspace, retry UUID, void, approval, audit and CSV at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    await identity(page)
    await capabilities(page)
    let period = { ...initialPeriod }
    let line = { ...initialLine }
    const requests: Record<string, unknown>[] = []
    let attempts = 0
    await page.route('**/api/workforce/payroll**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); requests.push(body)
        if (body.action === 'correct_line') {
          attempts++
          if (attempts === 1) return route.abort('failed')
          line = { ...line, payable_minutes: body.payable_minutes, overtime_minutes: body.overtime_minutes, version: 2 }
          return route.fulfill({ json: { ok: true, line, replayed: true } })
        }
        if (body.action === 'void_line') line = { ...line, voided_at: '2026-10-12T00:00:00Z', version: 3 }
        if (body.action === 'transition') period = { ...period, status: body.target_status }
        return route.fulfill({ json: { ok: true, line, period } })
      }
      if (url.searchParams.get('action') === 'list_periods') return route.fulfill({ json: { ok: true, periods: [period], pagination } })
      return route.fulfill({ json: { ok: true, period, lines: [line], audit: [{ id: 1, action: 'prepare_line', actor_id: '2', reason: 'Independent approved evidence', created_at: '2026-10-12T00:00:00Z' }] } })
    })
    await page.goto('/payroll')
    await expect(page.getByText('Không gian đối soát & Dòng lương chi tiết')).toBeVisible()
    await contained(page)
    await page.screenshot({ path: info.outputPath('payroll-' + width + '.png') })
    await page.getByRole('button', { name: /Sửa|Hiệu chỉnh|Điều chỉnh/, exact: false }).last().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder(/Ghi rõ lý do điều chỉnh/).fill('Independent correction verified')
    await dialog.getByRole('button', { name: 'Lưu điều chỉnh' }).click()
    await expect(dialog.getByText(/Không thể kết nối/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Lưu điều chỉnh' }).click()
    await expect(dialog).not.toBeVisible()
    expect(requests[0].request_id as string).toMatch(/^[0-9a-f-]{36}$/)
    expect(requests[1].request_id).toBe(requests[0].request_id)
    expect(requests[1].expected_version).toBe(1)
    await page.getByRole('button', { name: /Vô hiệu/, exact: false }).last().click()
    await dialog.getByPlaceholder(/Nhập lý do vô hiệu hóa/).fill('Independent void acceptance approved')
    await dialog.getByRole('button', { name: /Vô hiệu hóa vĩnh viễn|Xác nhận vô hiệu/ }).click()
    await expect(dialog).not.toBeVisible()
    expect(requests.at(-1)?.action).toBe('void_line')
    expect(requests.at(-1)?.expected_version).toBe(2)
    await expect(page.getByText('Independent approved evidence')).toBeVisible()
    // A voided-only period cannot advance; the locked receipt still enables CSV.
    await expect(page.getByRole('button', { name: /rà soát/i })).toBeDisabled()
    period = { ...period, status: 'locked', locked_by: '2', locked_at: '2026-10-12T00:00:00Z' }
    await page.getByRole('button', { name: /Cập nhật dữ liệu/ }).click()
    await expect(page.getByRole('link', { name: /Tải CSV/ })).toHaveAttribute('href', '/api/workforce/payroll?period_id=period-1&export=csv')
  })
}

test('Rate policy inputs start empty and rate dialog fits 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await identity(page); await capabilities(page)
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/workforce/payroll**', async route => {
    if (route.request().method() === 'POST') { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, rate: { id: 'approved-rate' } } }) }
    const action = new URL(route.request().url()).searchParams.get('action')
    return route.fulfill({ json: { ok: true, periods: [], rates: [], pagination, action } })
  })
  await page.goto('/payroll')
  await page.getByRole('tab', { name: /Khung lương/ }).click()
  await page.getByRole('button', { name: /Đăng ký|Thêm khung/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Mức lương VND mỗi giờ đã duyệt')).toHaveValue('')
  await expect(dialog.getByLabel('Hệ số tăng ca đã duyệt')).toHaveValue('')
  await dialog.getByLabel('Mức lương VND mỗi giờ đã duyệt').fill('125001')
  await dialog.getByLabel('Hệ số tăng ca đã duyệt').fill('1.001')
  await dialog.locator('input[type=date]').first().fill('2026-10-01')
  await dialog.locator('textarea').fill('Official policy approved by independent administrator')
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.height).toBeLessThanOrEqual(844)
  await dialog.locator('button[type=submit]').click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toMatchObject({ action: 'register_rate', vnd_per_hour: 125001, overtime_multiplier_basis_points: 10010 })
  await contained(page)
})

for (const [status, code, message] of [[401, 'AUTHENTICATION_REQUIRED', /Phiên đăng nhập/], [403, 'FORBIDDEN', /không có quyền/], [503, 'WORKFORCE_UNAVAILABLE', /chưa sẵn sàng/]] as const) {
  test('Capabilities ' + status + ' has a distinct state and makes no protected reads', async ({ page }) => {
    await identity(page)
    const protectedReads: string[] = []
    await page.route('**/api/workforce/**', async route => {
      if (!route.request().url().endsWith('/capabilities')) protectedReads.push(route.request().url())
      await route.fulfill({ status, json: { ok: false, error: { code } } })
    })
    await page.goto('/workforce')
    await expect(page.getByRole('main').getByRole('alert')).toContainText(message)
    expect(protectedReads).toEqual([])
  })
}

test('Disabled Payroll waits for capabilities and refetches on identity change', async ({ page }) => {
  await identity(page)
  let count = 0
  await page.route('**/api/workforce/capabilities', async route => {
    count++
    await route.fulfill({ json: { ok: true, capabilities: { ...enabled, payroll: false } } })
  })
  await page.goto('/payroll')
  await expect(page.getByRole('status')).toContainText(/Tính năng đang tắt/)
  await page.evaluate(() => { localStorage.setItem('livestream-ops-current-user', '3'); window.dispatchEvent(new Event('livestream-ops-current-user-change')) })
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/không có quyền/)
  await expect.poll(() => count).toBe(2)
})

test('Actual Staffing fourth tab records no-show and enforces independent review with 409', async ({ page }, info) => {
  await identity(page); await capabilities(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const segment = { id: 'segment-1', shift_id: 's5', staff_id: '3', operational_role: 'host', event_kind: 'worked', coverage_kind: 'planned', actual_start_at: '2026-10-11T09:00:00+07:00', actual_end_at: '2026-10-11T10:00:00+07:00', review_status: 'draft', evidence_note: 'Verified actual evidence', created_by: '2', reviewed_by: null, version: 2 }
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/workforce/actual**', async route => {
    if (route.request().method() === 'POST') {
      requests.push(route.request().postDataJSON())
      return route.fulfill({ status: 409, json: { ok: false, error: { code: 'WORKFORCE_ACTUAL_STALE_VERSION' } } })
    }
    await route.fulfill({ json: { ok: true, segments: [segment, { ...segment, id: 'self-recorded', created_by: '1' }] } })
  })
  await page.goto('/shifts')
  await page.getByRole('button', { name: /Tech gadgets recap/, exact: false }).click()
  const detail = page.getByTestId('shift-detail-modal')
  await detail.getByRole('tab', { name: 'Chấm công thực tế' }).click()
  await expect(detail.getByText('Verified actual evidence').first()).toBeVisible()
  await expect(detail.getByRole('button', { name: /duyệt/i })).toHaveCount(2)
  await expect(detail.getByRole('button', { name: /duyệt/i }).last()).toBeDisabled()
  await detail.getByRole('button', { name: /duyệt/i }).first().click()
  const review = page.getByRole('dialog').last()
  await review.locator('textarea').fill('Independent reviewer approved evidence')
  await review.getByRole('button', { name: /Xác nhận|Phê duyệt/ }).last().click()
  await expect(review.getByText(/Dữ liệu đã thay đổi/)).toBeVisible()
  expect(requests[0]).toMatchObject({ action: 'review', expected_version: 2, segment_id: 'segment-1' })
  await review.getByRole('button', { name: 'Tải lại minh chứng' }).click()
  await detail.getByRole('button', { name: 'Ghi nhận chấm công' }).click()
  const record = page.getByRole('dialog').last()
  await record.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: 'Vắng mặt (No-show)' }).click()
  await record.locator('textarea').fill('Verified no-show evidence from independent witness')
  await record.getByRole('button', { name: 'Lưu chấm công' }).click()
  await expect(record.getByText(/Dữ liệu đã thay đổi/)).toBeVisible()
  expect(requests[1]).toMatchObject({ action: 'record', event_kind: 'no_show', actual_start_at: null, actual_end_at: null })
  await record.getByRole('button', { name: /Hủy/ }).click()
  await contained(page)
  await page.screenshot({ path: info.outputPath('actual-390.png') })
})

for (const [status, target] of [['draft', 'reviewed'], ['reviewed', 'confirmed'], ['confirmed', 'payroll_ready'], ['payroll_ready', 'locked']]) {
  test('Payroll independent transition ' + status + ' → ' + target, async ({ page }) => {
    await identity(page); await capabilities(page)
    let period = { ...initialPeriod, status, reviewed_by: '2' }
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/workforce/payroll**', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON(); requests.push(body)
        period = { ...period, status: body.target_status }
        return route.fulfill({ json: { ok: true, period } })
      }
      if (new URL(route.request().url()).searchParams.get('action') === 'list_periods') return route.fulfill({ json: { ok: true, periods: [period], pagination } })
      return route.fulfill({ json: { ok: true, period, lines: [initialLine], audit: [] } })
    })
    await page.goto('/payroll')
    await page.getByRole('button', { name: /Chuyển sang|Xác nhận bảng lương|Sẵn sàng chi trả|Khóa sổ bảng lương/ }).last().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('textarea').fill('Independent policy and evidence verified')
    await dialog.getByRole('button', { name: 'Xác nhận chuyển' }).click()
    await expect(dialog).not.toBeVisible()
    expect(requests[0]).toMatchObject({ action: 'transition', expected_status: status, target_status: target })
  })
}

test('Payroll creator cannot self-review; period create and prepare keep exact integer values', async ({ page }) => {
  await identity(page); await capabilities(page)
  const period = { ...initialPeriod, created_by: '1' }
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/workforce/payroll**', async route => {
    if (route.request().method() === 'POST') { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, period, line: initialLine } }) }
    if (new URL(route.request().url()).searchParams.get('action') === 'list_periods') return route.fulfill({ json: { ok: true, periods: [period], pagination } })
    return route.fulfill({ json: { ok: true, period, lines: [initialLine], audit: [] } })
  })
  await page.goto('/payroll')
  await expect(page.getByRole('button', { name: /Chuyển sang Đã rà soát/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Chuẩn bị dòng lương' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder(/Nhập ID phân đoạn/).fill('approved-segment-2')
  const numbers = dialog.locator('input[type=number]')
  await numbers.nth(0).fill('60'); await numbers.nth(1).fill('15'); await numbers.nth(2).fill('125001')
  await dialog.getByPlaceholder(/Lý do điều chỉnh/).fill('Independent adjustment policy approved')
  await dialog.locator('button[type=submit]').click()
  await expect(dialog).not.toBeVisible()
  expect(requests[0]).toMatchObject({ action: 'prepare_line', payable_minutes: 60, overtime_minutes: 15, adjustment_vnd: 125001 })
  await page.getByRole('tab', { name: /Danh sách chu kỳ/ }).click()
  await page.getByRole('button', { name: /chu kỳ mới/i }).click()
  await dialog.locator('input[type=date]').nth(0).fill('2026-11-01')
  await dialog.locator('input[type=date]').nth(1).fill('2026-11-30')
  await dialog.locator('button[type=submit]').click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toMatchObject({ action: 'create_period', period_start: '2026-11-01', period_end: '2026-11-30' })
})

test('Member workforce requests only own identity and keeps absent performance as N/A', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await identity(page, '3'); await capabilities(page, { ...enabled, payroll: false, actual_staffing: false, team_performance: false })
  const reads: string[] = []
  await page.route('**/api/workforce/performance**', async route => {
    reads.push(new URL(route.request().url()).searchParams.get('staff_id') || '')
    await route.fulfill({ json: { ok: true, summary: { staffId: '3', role: 'host', assignedShifts: 0, verifiedShifts: 0, unknownAttendanceShifts: 0, approvedNoShows: 0, approvedWorkedShifts: 0, approvedActualMinutes: 0, lateShifts: 0, onTimeShifts: 0, attendanceCoveragePct: null, punctualityPct: null, knownReliabilityPct: null, isComplete: false, warning: 'INCOMPLETE_ATTENDANCE_EVIDENCE' } } })
  })
  await page.goto('/workforce')
  await expect(page.getByText('Chưa đầy đủ chứng từ xác minh')).toBeVisible()
  await expect(page.getByText('N/A - Chưa có dữ liệu').first()).toBeVisible()
  expect(reads.length).toBeGreaterThan(0); expect(reads.every(id => id === '3')).toBe(true)
  await expect(page.getByRole('tab', { name: /Tổng quan đội ngũ/ })).toHaveCount(0)
  await contained(page)
})
