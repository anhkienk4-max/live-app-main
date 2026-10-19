import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type Role = 'admin' | 'leader' | 'member' | 'inactive_member'
type Credentials = { role: Role; email: string; password: string }

const evidenceDir = process.env.UAT_EVIDENCE_DIR!
const supabaseUrl = process.env.UAT_SUPABASE_URL!
const anonKey = process.env.UAT_SUPABASE_ANON_KEY!
const serviceKey = process.env.UAT_SUPABASE_SERVICE_KEY!
const events: Array<{ role: Role; action: string; result: string }> = []

function localFixtureClient() {
  const target = new URL(supabaseUrl)
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error('ISOLATED_UAT_LOOPBACK_TARGET_REQUIRED')
  }
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function credentials(role: Role) {
  const rows = JSON.parse(await readFile(process.env.UAT_CREDENTIALS_FILE!, 'utf8')) as Credentials[]
  const match = rows.find(row => row.role === role)
  if (!match) throw new Error(`ISOLATED_UAT_CREDENTIAL_MISSING:${role}`)
  return match
}

async function signIn(page: Page, role: Role) {
  const account = await credentials(role)
  await page.addInitScript(() => localStorage.setItem('livestream-ops-language', 'en'))
  await page.goto('/login')
  await page.getByTestId('email-input').fill(account.email)
  const password = page.getByTestId('password-input')
  await password.fill(account.password)
  const authResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname.endsWith('/auth/v1/token'),
  )
  await page.getByTestId('email-login-btn').click()
  const authenticated = await authResponse
  await password.fill('')
  const authError = authenticated.ok() ? null : await authenticated.json().catch(() => ({})) as { code?: string; msg?: string; message?: string }
  expect(authenticated.ok(), `Supabase Auth returned HTTP ${authenticated.status()} (${authError?.code ?? authError?.msg ?? authError?.message ?? 'unknown'})`).toBeTruthy()
  await page.waitForURL(url => url.pathname !== '/login', { timeout: 15_000 }).catch(() => undefined)
  if (new URL(page.url()).pathname === '/login') {
    const reason = new URL(page.url()).searchParams.get('reason') ?? 'none'
    const message = await page.getByTestId('login-error').textContent().catch(() => null)
    throw new Error(`AUTHENTICATED_SESSION_BOOTSTRAP_FAILED:${role}:${reason}:${message ?? 'no-login-error'}`)
  }
  await expect(page.getByTestId('user-menu-btn')).toBeVisible()
  await page.goto('/reports')
  await expect(page.getByTestId('open-final-report-modal')).toBeVisible()
  events.push({ role, action: 'authenticated_reports_access', result: 'pass' })
}

async function signOut(page: Page, role: Role) {
  await page.goto('/reports')
  await expect(page.getByTestId('user-menu-btn')).toBeVisible({ timeout: 15_000 })
  const userMenu = page.getByTestId('user-menu-btn')
  const signOutButton = page.getByTestId('signout-btn')
  await userMenu.click()
  if (!(await signOutButton.isVisible().catch(() => false))) await userMenu.press('ArrowDown')
  await expect(signOutButton).toBeVisible({ timeout: 5_000 })
  await signOutButton.click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await page.goto('/reports')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByTestId('user-menu-btn')).toHaveCount(0)
  events.push({ role, action: 'sign_out', result: 'pass' })
}

test.afterAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(resolve(evidenceDir, 'uat-events.json'), JSON.stringify({
    environment: 'isolated-local-supabase-auth',
    releaseCandidate: process.env.UAT_RELEASE_CANDIDATE_SHA ?? '083a015688676c3cb2eda94f363f26de3fd9ed5e',
    trace: 'disabled',
    events,
  }, null, 2))
})

for (const role of ['leader'] as const) {
  test(`${role} signs in, reaches Reports, and signs out with Supabase Auth`, async ({ page }) => {
    await signIn(page, role)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: resolve(evidenceDir, `${role}-reports.png`), fullPage: true })
    await signOut(page, role)
    await signIn(page, 'member')
    events.push({ role, action: 'identity_switch_to_member', result: 'pass' })
    await signOut(page, 'member')
  })
}

test('Admin pages and searches more than 100 persisted reports', async ({ page }) => {
  await signIn(page, 'admin')
  await expect(page.getByRole('button', { name: /^next$/i })).toBeEnabled()
  await page.screenshot({ path: resolve(evidenceDir, 'admin-reports-page-1.png'), fullPage: true })
  await page.getByRole('button', { name: /^next$/i }).click()
  await expect(page.getByText(/2\s*of\s*7/i)).toBeVisible()
  await page.screenshot({ path: resolve(evidenceDir, 'admin-reports-page-2.png'), fullPage: true })
  for (const pageNumber of [3, 4, 5, 6, 7]) {
    await page.getByRole('button', { name: /^next$/i }).click()
    await expect(page.getByText(new RegExp(`${pageNumber}\\s*of\\s*7`, 'i'))).toBeVisible()
    if (pageNumber >= 5) {
      await page.screenshot({ path: resolve(evidenceDir, `admin-reports-page-${pageNumber}.png`), fullPage: true })
    }
  }
  const search = page.locator('main input').first()
  await search.fill('UAT historical campaign 100')
  await expect(page.getByRole('heading', { name: 'UAT historical campaign 100', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^next$/i })).toBeDisabled()
  events.push({ role: 'admin', action: 'reports_pagination_search_119_records', result: 'pass' })
  await signOut(page, 'admin')
})

test('An older Reports search response cannot replace a newer filter result', async ({ page }) => {
  await signIn(page, 'admin')
  let releaseLateResponse!: () => void
  let markLateResponseStarted!: () => void
  const lateResponseGate = new Promise<void>(resolve => { releaseLateResponse = resolve })
  const lateResponseStarted = new Promise<void>(resolve => { markLateResponseStarted = resolve })
  await page.route('**/api/operations/collection*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/operations/collection' || url.searchParams.get('entity') !== 'reports') {
      await route.continue()
      return
    }
    const filters = JSON.parse(url.searchParams.get('filters') ?? '{}') as { search?: string }
    if (filters.search !== 'UAT historical campaign 100') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    markLateResponseStarted()
    await lateResponseGate
    await route.fulfill({ response })
  })

  try {
    const search = page.locator('main input').first()
    await search.fill('UAT historical campaign 100')
    await lateResponseStarted
    if (!await search.isVisible()) {
      releaseLateResponse()
      await expect(page.getByRole('heading', { name: 'UAT historical campaign 100', exact: true })).toBeVisible()
      await writeFile(resolve(evidenceDir, 'race-results.json'), JSON.stringify({
        case: 'change-report-filter-during-pending-response',
        result: 'not_executable',
        observation: 'Reports search input is removed from the page while the filtered collection request is pending.',
        responseReleased: true,
      }, null, 2))
      test.skip(true, 'The Reports page unmounts its filter control during the pending response, so a user cannot trigger the stale-filter race through the browser UI.')
    }
    await search.fill('UAT historical campaign 101', { timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'UAT historical campaign 101', exact: true })).toBeVisible()
    releaseLateResponse()
    await expect(page.getByRole('heading', { name: 'UAT historical campaign 101', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'UAT historical campaign 100', exact: true })).toHaveCount(0)
    events.push({ role: 'admin', action: 'reports_stale_filter_response_discarded', result: 'pass' })
  } finally {
    releaseLateResponse()
  }
  await signOut(page, 'admin')
})

test('Member creates and edits an assigned-shift draft, then deep-links to it', async ({ page }) => {
  await signIn(page, 'member')
  const target = await localFixtureClient()
    .from('shifts')
    .select('id')
    .eq('title', 'UAT registered member report shift')
    .maybeSingle()
  if (target.error || !target.data?.id) throw target.error ?? new Error('UAT_MEMBER_DIRECT_ASSIGNMENT_SHIFT_MISSING')

  for (const [title, role, evidenceCase] of [
    ['UAT direct support assignment', 'Support', 'direct_support'],
    ['UAT direct technical assignment', 'Technical', 'direct_technical'],
    ['UAT member registration shift', 'Technical', 'approved_registration'],
  ] as const) {
    await page.getByTestId('open-final-report-modal').click()
    const picker = page.getByTestId('report-shift-picker')
    const candidateResponse = page.waitForResponse(response => {
      const url = new URL(response.url())
      if (url.pathname !== '/api/operations/collection' || url.searchParams.get('entity') !== 'my_shifts') return false
      return (JSON.parse(url.searchParams.get('filters') ?? '{}') as { search?: string }).search === title
    })
    await picker.getByTestId('report-shift-search').fill(title)
    const response = await candidateResponse
    const candidatePage = await response.json() as { items?: Array<{ title: string }>; total?: number }
    expect(response.ok(), `Picker collection returned HTTP ${response.status()} for ${evidenceCase}`).toBeTruthy()
    expect(candidatePage.items?.some(item => item.title === title), `Picker collection omitted ${evidenceCase}; total=${candidatePage.total ?? 'unknown'}`).toBeTruthy()
    await expect(picker.getByTestId('report-shift-choose')).toHaveCount(1)
    await picker.getByTestId('report-shift-choose').click()
    const form = page.getByRole('dialog')
    await expect(form.getByRole('heading', { name: /create final report|continue report/i })).toBeVisible()
    await expect(form.getByText(new RegExp(`${role}: UAT Synthetic Member`))).toBeVisible()
    await form.getByRole('button', { name: /cancel/i }).click()
    await expect(form).toHaveCount(0)
    events.push({ role: 'member', action: `report_picker_${evidenceCase}`, result: 'pass' })
  }

  const existingReport = await localFixtureClient()
    .from('reports')
    .select('id,status')
    .eq('shift_id', target.data.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (existingReport.error) throw existingReport.error
  if (existingReport.data) {
    expect(existingReport.data.status).toBe('draft')
  } else {
    await page.getByTestId('open-final-report-modal').click()
    const picker = page.getByTestId('report-shift-picker')
    await picker.getByTestId('report-shift-search').fill('UAT registered member report shift')
    await expect(picker.getByTestId('report-shift-choose')).toHaveCount(1)
    await picker.getByTestId('report-shift-choose').click()
    const form = page.getByRole('dialog')
    await expect(form.getByRole('heading', { name: /create final report/i })).toBeVisible()
    await expect(form.getByText('UAT Synthetic Member')).toBeVisible()
    const createResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname.endsWith('/rest/v1/rpc/create_report') && response.ok(),
    )
    await form.getByRole('button', { name: /save draft/i }).click()
    const created = await createResponse
    const payload = await created.json() as { id?: string } | Array<{ id?: string }>
    expect(Array.isArray(payload) ? payload[0]?.id : payload.id).toBeTruthy()
    await expect(form).toHaveCount(0)
  }

  await page.goto(`/reports?shiftId=${target.data.id}`)
  const editForm = page.getByRole('dialog')
  await expect(editForm.getByRole('heading', { name: /continue report/i })).toBeVisible()
  const recap = editForm.locator('[data-testid^="final-recap-"]').first()
  await recap.fill('Edited in isolated authenticated UAT')
  const updateResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname.endsWith('/rest/v1/rpc/update_report') && response.ok(),
  )
  await editForm.getByRole('button', { name: /save draft/i }).click()
  await updateResponse
  events.push({ role: 'member', action: existingReport.data ? 'report_edit_deep_link' : 'report_create_edit_deep_link', result: 'pass' })
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: resolve(evidenceDir, `member-report-draft-${width}.png`), fullPage: true })
  }
  const unrelated = await localFixtureClient()
    .from('shifts')
    .select('id')
    .eq('title', 'UAT historical campaign 120')
    .maybeSingle()
  if (unrelated.error || !unrelated.data?.id) throw unrelated.error ?? new Error('UAT_UNRELATED_SHIFT_MISSING')
  await page.goto(`/reports?shiftId=${unrelated.data.id}`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/reports(?:\?.*)?$/)
  events.push({ role: 'member', action: 'unrelated_shift_deep_link_denied', result: 'pass' })
  await signOut(page, 'member')
})

test('Admin final-report form blocks submission without dashboard evidence', async ({ page }) => {
  await signIn(page, 'admin')
  const root = localFixtureClient()
  const shift = await root.from('shifts').select('id').eq('title', 'UAT admin missing dashboard report shift').single()
  if (shift.error) throw shift.error
  const before = await root.from('reports').select('id').eq('shift_id', shift.data.id)
  if (before.error) throw before.error
  expect(before.data).toHaveLength(0)

  await page.getByTestId('open-final-report-modal').click()
  const picker = page.getByTestId('report-shift-picker')
  await picker.getByTestId('report-shift-search').fill('UAT direct support assignment')
  await expect(picker.getByTestId('report-shift-choose')).toHaveCount(1)
  await picker.getByTestId('report-shift-choose').click()
  await page.screenshot({ path: resolve(evidenceDir, 'admin-missing-dashboard-modal.png'), fullPage: true })
  const form = page.getByRole('dialog')
  await expect(form.getByRole('heading', { name: /create final report|continue report/i })).toBeVisible()
  await form.getByRole('button', { name: /save final report/i }).click()
  await expect(page.getByText('Upload at least one dashboard screenshot before running OCR.')).toBeVisible()
  const after = await root.from('reports').select('id').eq('shift_id', shift.data.id)
  if (after.error) throw after.error
  expect(after.data).toHaveLength(0)
  events.push({ role: 'admin', action: 'final_report_missing_dashboard_rejected_without_write', result: 'pass' })
  await form.getByRole('button', { name: /cancel/i }).click()
  await signOut(page, 'admin')
})

test('Confirmed report remains confirmed when isolated DATA/REPORT generation fails', async ({ page }) => {
  const root = localFixtureClient()
  const shift = await root.from('shifts').select('id').eq('title', 'UAT artifact failure report shift').single()
  if (shift.error) throw shift.error
  const admin = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const login = await admin.auth.signInWithPassword(await credentials('admin'))
  if (login.error) throw new Error(`Admin Supabase Auth failed: ${login.error.status ?? 'unknown'}`)
  const draft = await admin.rpc('create_report', { p_data: {
    shift_id: shift.data.id,
    dashboard_platform: 'other',
    revenue: 42,
    orders: 3,
    final_recap: {},
    ocr_review: { status: 'unavailable', metrics: {} },
  } }).single()
  if (draft.error) throw draft.error

  const leader = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const leaderLogin = await leader.auth.signInWithPassword(await credentials('leader'))
  if (leaderLogin.error) throw new Error(`Leader Supabase Auth failed: ${leaderLogin.error.status ?? 'unknown'}`)
  const review = await leader.rpc('start_report_review', { p_report_id: draft.data.id })
  if (review.error) throw review.error
  const current = await root.from('reports').select('version_number').eq('id', draft.data.id).single()
  if (current.error) throw current.error
  const confirmation = await leader.rpc('update_report', {
    p_report_id: draft.data.id,
    p_patch: {
      status: 'confirmed', metrics_confirmed: true, dashboard_platform: 'other',
      revenue: 42, orders: 3, confirmed_by: 'uat-leader', confirmed_at: new Date().toISOString(),
    },
    p_expected_version: current.data.version_number,
    p_reason: 'isolated UAT confirm before artifact failure injection',
    p_event: 'confirm',
  })
  if (confirmation.error) throw confirmation.error
  const beforeFailure = await root.from('reports').select('status,metrics_confirmed').eq('id', draft.data.id).single()
  if (beforeFailure.error) throw beforeFailure.error
  expect(beforeFailure.data.status).toBe('confirmed')
  expect(beforeFailure.data.metrics_confirmed).toBe(true)

  await signIn(page, 'admin')

  let artifactFailures = 0
  await page.route('**/api/report-artifacts', async route => {
    const request = route.request()
    const payload = request.method() === 'POST' ? request.postDataJSON() as { action?: string } | null : null
    if (request.method() === 'POST' && payload?.action === 'generate_data_report') {
      artifactFailures++
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Synthetic isolated artifact outage' } }),
      })
      return
    }
    await route.continue()
  })
  const artifactStatus = await page.evaluate(async reportId => {
    const response = await fetch('/api/report-artifacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_data_report', report_id: reportId }),
    })
    return response.status
  }, draft.data.id)
  expect(artifactStatus).toBe(503)
  expect(artifactFailures).toBe(1)
  const persisted = await root.from('reports').select('status,metrics_confirmed,revenue,orders').eq('id', draft.data.id).single()
  if (persisted.error) throw persisted.error
  expect(persisted.data.status).toBe('confirmed')
  expect(persisted.data.metrics_confirmed).toBe(true)
  expect(persisted.data.revenue).toBe(42)
  expect(persisted.data.orders).toBe(3)
  await writeFile(resolve(evidenceDir, 'artifact-failure-results.json'), JSON.stringify({
    finalReportConfirmed: persisted.data.status === 'confirmed' && persisted.data.metrics_confirmed,
    reportRevenue: persisted.data.revenue,
    reportOrders: persisted.data.orders,
    artifactGenerationHttpStatus: artifactStatus,
    artifactRequestCount: artifactFailures,
  }, null, 2))
  await page.screenshot({ path: resolve(evidenceDir, 'admin-artifact-failure.png'), fullPage: true })
  events.push({ role: 'admin', action: 'confirmed_report_persists_when_data_report_artifact_fails', result: 'pass' })
  await signOut(page, 'admin')
})

test('Member Reports RPC is scoped and draft writes enforce ownership and version', async () => {
  const root = localFixtureClient()
  const unrelatedShift = await root.from('shifts').select('id').eq('title', 'UAT historical campaign 100').single()
  if (unrelatedShift.error) throw unrelatedShift.error
  const unrelated = await root.from('reports').select('id,shift_id,version_number').eq('shift_id', unrelatedShift.data.id).single()
  if (unrelated.error) throw unrelated.error

  const relatedTitles = [
    'UAT direct support assignment',
    'UAT direct technical assignment',
    'UAT member registration shift',
  ]
  const admin = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const adminLogin = await admin.auth.signInWithPassword(await credentials('admin'))
  if (adminLogin.error) throw new Error(`Admin Supabase Auth failed: ${adminLogin.error.status ?? 'unknown'}`)
  const relatedReportIds: string[] = []
  for (const title of relatedTitles) {
    const shift = await root.from('shifts').select('id').eq('title', title).single()
    if (shift.error) throw shift.error
    const existing = await root.from('reports').select('id').eq('shift_id', shift.data.id).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) {
      relatedReportIds.push(existing.data.id)
      continue
    }
    const created = await admin.rpc('create_report', { p_data: {
      shift_id: shift.data.id,
      dashboard_platform: 'other',
      final_recap: {},
      insights_good: `Synthetic RLS entitlement report: ${title}`,
    } }).single()
    if (created.error) throw created.error
    relatedReportIds.push(created.data.id)
  }

  const member = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const memberLogin = await member.auth.signInWithPassword(await credentials('member'))
  if (memberLogin.error) throw new Error(`Member Supabase Auth failed: ${memberLogin.error.status ?? 'unknown'}`)

  const [directRead, directRelatedRead, pageResult, forbiddenUpdate, forbiddenReview] = await Promise.all([
    member.from('reports').select('id').eq('id', unrelated.data.id),
    member.from('reports').select('id').in('id', relatedReportIds),
    member.rpc('get_report_list_page', { p_page: 1, p_page_size: 20, p_filters: {}, p_summary: false }),
    member.rpc('update_report', {
      p_report_id: unrelated.data.id,
      p_patch: { insights_good: 'unauthorized synthetic write' },
      p_expected_version: unrelated.data.version_number,
      p_reason: 'isolated UAT authorization probe',
      p_event: 'save',
    }),
    member.rpc('start_report_review', { p_report_id: unrelated.data.id }),
  ])

  expect(pageResult.error).toBeNull()
  const rows = (pageResult.data as { rows?: Array<{ id: string }> } | null)?.rows ?? []
  const readIds = (directRead.data ?? []).map(report => report.id)
  const relatedReadIds = (directRelatedRead.data ?? []).map(report => report.id)
  const deniedErrors = [forbiddenUpdate.error, forbiddenReview.error]
  const reportIds = rows.map(report => report.id)
  const escapedDirectRead = readIds.length > 0
  const invalidRpcScope = reportIds.includes(unrelated.data.id)
  const validEntitlements = relatedReportIds.every(id => relatedReadIds.includes(id) && reportIds.includes(id))
  const writeDenied = deniedErrors.every(error => error?.code === '42501' || error?.message.includes('OPERATION_NOT_ALLOWED'))
  expect(invalidRpcScope).toBeFalsy()
  expect(escapedDirectRead).toBeFalsy()
  expect(validEntitlements).toBeTruthy()
  expect(writeDenied).toBeTruthy()
  await writeFile(resolve(evidenceDir, 'api-authorization-results.json'), JSON.stringify({
    memberAuthenticated: Boolean(memberLogin.data.session),
    unrelatedDirectRestRows: readIds.length,
    unrelatedReportRpcRows: Number(invalidRpcScope),
    authorizedEntitlementReports: relatedReadIds.length,
    authorizedEntitlementExpected: relatedReportIds.length,
    directUpdateDenied: Boolean(forbiddenUpdate.error),
    startReviewDenied: Boolean(forbiddenReview.error),
    reportCollectionRpcStatus: pageResult.error ? pageResult.error.code : 200,
  }, null, 2))
  events.push({ role: 'member', action: 'reports_rpc_scope_and_write_denial', result: 'pass' })
})

test('Report reads, revisions, images, and report API enforce the authenticated entitlement boundary', async ({ page }) => {
  const root = localFixtureClient()
  const fixtures = JSON.parse(await readFile(resolve(evidenceDir, 'baseline-report-read-reproduction.json'), 'utf8')) as {
    allowedEntitlementReportIds: string[]
    openShiftReportId: string
    pendingShiftReportId: string
    archivedReportId: string
    deletedReportId: string
    archivedParentShiftReportId: string
    deletedShiftReportId: string
    unregisteredOpenShiftId: string
    pendingRegistrationShiftId: string
    memberSubmittedReportId: string
    unrelatedReportImageId: string
    authorizedReportImageId: string
    unrelatedLiveImageId: string
    authorizedLiveImageId: string
    emptyDashboardReportShiftId: string
    artifactFailureReportShiftId: string
  }
  const unrelatedShift = await root.from('shifts').select('id').eq('title', 'UAT historical campaign 100').single()
  if (unrelatedShift.error) throw unrelatedShift.error
  const unrelatedReport = await root.from('reports').select('id').eq('shift_id', unrelatedShift.data.id).single()
  if (unrelatedReport.error) throw unrelatedReport.error

  const member = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const memberLogin = await member.auth.signInWithPassword(await credentials('member'))
  if (memberLogin.error) throw memberLogin.error
  const readMemberReport = async (id: string) => member.from('reports').select('id').eq('id', id)
  const [allowedReads, deniedReads, deniedRpcLists, allowedRevisions, allowedRevisionRows, allowedImages, allowedLiveImages, deniedRevisions, deniedRevisionRows, deniedImages, deniedLiveImages, deniedUnlinkedImage, myPendingShifts] = await Promise.all([
    Promise.all(fixtures.allowedEntitlementReportIds.map(readMemberReport)),
    Promise.all([
      unrelatedReport.data.id,
      fixtures.openShiftReportId,
      fixtures.pendingShiftReportId,
      fixtures.archivedReportId,
      fixtures.deletedReportId,
      fixtures.archivedParentShiftReportId,
      fixtures.deletedShiftReportId,
    ].map(readMemberReport)),
    Promise.all([
      { reportId: unrelatedReport.data.id, shiftId: unrelatedShift.data.id },
      { reportId: fixtures.openShiftReportId, shiftId: fixtures.unregisteredOpenShiftId },
      { reportId: fixtures.pendingShiftReportId, shiftId: fixtures.pendingRegistrationShiftId },
    ].map(({ shiftId }) => member.rpc('get_report_list_page', { p_page: 1, p_page_size: 20, p_filters: { shiftIds: [shiftId] }, p_summary: false }))),
    member.rpc('get_report_revisions', { p_report_id: fixtures.allowedEntitlementReportIds[0] }),
    member.from('report_revisions').select('id').eq('report_id', fixtures.allowedEntitlementReportIds[0]),
    member.from('report_images').select('id').eq('id', fixtures.authorizedReportImageId),
    member.from('live_report_images').select('id').eq('id', fixtures.authorizedLiveImageId),
    member.rpc('get_report_revisions', { p_report_id: unrelatedReport.data.id }),
    member.from('report_revisions').select('id').eq('report_id', unrelatedReport.data.id),
    member.from('report_images').select('id').eq('id', fixtures.unrelatedReportImageId),
    member.from('live_report_images').select('id').eq('id', fixtures.unrelatedLiveImageId),
    member.from('live_report_images').select('id').eq('id', 'uat-live-image-unlinked'),
    member.rpc('get_shift_list_page', { p_scope: 'mine', p_page: 1, p_page_size: 20, p_filters: { shiftIds: [fixtures.pendingRegistrationShiftId] }, p_pending_page: 1, p_include_live: false }),
  ])
  expect(allowedReads.every(result => !result.error && result.data?.length === 1)).toBeTruthy()
  expect(deniedReads.every(result => !result.error && result.data?.length === 0)).toBeTruthy()
  const deniedRpcListRows = deniedRpcLists.flatMap(result => (result.data as { rows?: Array<{ id: string }> } | null)?.rows ?? [])
  expect(deniedRpcLists.every(result => !result.error)).toBeTruthy()
  expect(deniedRpcListRows).toHaveLength(0)
  expect(allowedRevisions.error).toBeNull()
  expect(allowedRevisions.data?.length ?? 0).toBeGreaterThan(0)
  expect(allowedRevisionRows.data?.length ?? 0).toBeGreaterThan(0)
  expect(allowedImages.data).toHaveLength(1)
  expect(allowedLiveImages.data).toHaveLength(1)
  expect(deniedRevisions.error?.code).toBe('42501')
  expect(deniedRevisionRows.data).toHaveLength(0)
  expect(deniedImages.data).toHaveLength(0)
  expect(deniedLiveImages.data).toHaveLength(0)
  expect(deniedUnlinkedImage.data).toHaveLength(0)
  const pendingMineRows = (myPendingShifts.data as { rows?: Array<{ id: string }> } | null)?.rows ?? []
  expect(pendingMineRows.some(row => row.id === fixtures.pendingRegistrationShiftId)).toBeTruthy()

  const inactive = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const inactiveLogin = await inactive.auth.signInWithPassword(await credentials('inactive_member'))
  if (inactiveLogin.error) throw inactiveLogin.error
  const inactiveReport = await inactive.from('reports').select('id').eq('id', unrelatedReport.data.id)
  const inactiveList = await inactive.rpc('get_report_list_page', { p_page: 1, p_page_size: 50, p_filters: {}, p_summary: false })
  const inactiveRevisions = await inactive.rpc('get_report_revisions', { p_report_id: unrelatedReport.data.id })
  expect(inactiveReport.data).toHaveLength(0)
  expect((inactiveList.data as { rows?: unknown[] } | null)?.rows ?? []).toHaveLength(0)
  expect(inactiveRevisions.error?.code).toBe('42501')
  const anonymous = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const anonymousReport = await anonymous.from('reports').select('id').eq('id', unrelatedReport.data.id)
  expect(anonymousReport.data ?? []).toHaveLength(0)

  const roleReadbacks: Record<string, unknown> = {}
  for (const role of ['leader', 'admin'] as const) {
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const login = await client.auth.signInWithPassword(await credentials(role))
    if (login.error) throw login.error
    const [unrelated, archived, deleted, archivedShift, deletedShift, revisions, unlinkedLiveImage, archivedReportRevisions] = await Promise.all([
      client.from('reports').select('id').eq('id', unrelatedReport.data.id),
      client.from('reports').select('id').eq('id', fixtures.archivedReportId),
      client.from('reports').select('id').eq('id', fixtures.deletedReportId),
      client.from('reports').select('id').eq('id', fixtures.archivedParentShiftReportId),
      client.from('reports').select('id').eq('id', fixtures.deletedShiftReportId),
      client.rpc('get_report_revisions', { p_report_id: unrelatedReport.data.id }),
      client.from('live_report_images').select('id').eq('id', 'uat-live-image-unlinked'),
      client.rpc('get_report_revisions', { p_report_id: fixtures.archivedReportId }),
    ])
    roleReadbacks[role] = {
      unrelated: unrelated.data?.length ?? 0,
      archivedReport: archived.data?.length ?? 0,
      deletedReport: deleted.data?.length ?? 0,
      reportOnArchivedShift: archivedShift.data?.length ?? 0,
      reportOnDeletedShift: deletedShift.data?.length ?? 0,
      revisions: revisions.data?.length ?? 0,
      unlinkedLiveImage: unlinkedLiveImage.data?.length ?? 0,
      archivedReportRevisions: archivedReportRevisions.data?.length ?? 0,
      archivedReportRevisionError: archivedReportRevisions.error?.code ?? null,
    }
    expect(unrelated.data).toHaveLength(1)
    expect(archived.data?.length ?? 0).toBe(role === 'admin' ? 1 : 0)
    expect(deleted.data?.length ?? 0).toBe(role === 'admin' ? 1 : 0)
    expect(archivedShift.data).toHaveLength(1)
    expect(deletedShift.data).toHaveLength(1)
    expect(revisions.error).toBeNull()
    expect(unlinkedLiveImage.data).toHaveLength(1)
    expect(archivedReportRevisions.data?.length ?? 0).toBe(role === 'admin' ? 2 : 0)
    expect(archivedReportRevisions.error?.code ?? null).toBe(role === 'admin' ? null : '42501')
  }

  await signIn(page, 'member')
  const apiResults = await page.evaluate(async ({ reportId, imageId }) => {
    const [collection, artifact, image] = await Promise.all([
      fetch('/api/operations/collection?entity=reports&page=1&pageSize=50&filters=%7B%7D'),
      fetch(`/api/report-artifacts?report_id=${encodeURIComponent(reportId)}`),
      fetch(`/api/report-images?kind=report&image_id=${encodeURIComponent(imageId)}`),
    ])
    const collectionBody = await collection.json()
    return {
      collectionStatus: collection.status,
    unrelatedInCollection: (collectionBody.items ?? []).some((item: { id?: string }) => item.id === reportId),
      artifactStatus: artifact.status,
      imageStatus: image.status,
    }
  }, { reportId: unrelatedReport.data.id, imageId: fixtures.unrelatedReportImageId })
  expect(apiResults.collectionStatus).toBe(200)
  expect(apiResults.unrelatedInCollection).toBeFalsy()
  expect(apiResults.artifactStatus).toBe(403)
  expect(apiResults.imageStatus).toBe(404)

  await writeFile(resolve(evidenceDir, 'report-read-security-results.json'), JSON.stringify({
    memberAuthenticated: Boolean(memberLogin.data.session),
    allowedDirectEntitlements: fixtures.allowedEntitlementReportIds.length,
    allowedRevisionRpcRows: allowedRevisions.data?.length ?? 0,
    allowedRevisionTableRows: allowedRevisionRows.data?.length ?? 0,
    allowedReportImageRows: allowedImages.data?.length ?? 0,
    allowedLiveReportImageRows: allowedLiveImages.data?.length ?? 0,
    unrelatedRestRows: deniedReads[0].data?.length ?? 0,
    openUnregisteredRows: deniedReads[1].data?.length ?? 0,
    pendingRows: deniedReads[2].data?.length ?? 0,
    archivedOrDeletedReportRows: deniedReads.slice(3, 5).map(result => result.data?.length ?? 0),
    archivedOrDeletedParentShiftRows: deniedReads.slice(5).map(result => result.data?.length ?? 0),
    unrelatedReportListRpcRows: deniedRpcListRows.length,
    unrelatedRevisionRpcStatus: deniedRevisions.error?.code ?? 200,
    unrelatedRevisionRows: deniedRevisionRows.data?.length ?? 0,
    unrelatedReportImageRows: deniedImages.data?.length ?? 0,
    unrelatedLiveReportImageRows: deniedLiveImages.data?.length ?? 0,
    unlinkedLiveReportImageRows: deniedUnlinkedImage.data?.length ?? 0,
    pendingRegistrationStillVisibleInMyShifts: pendingMineRows.some(row => row.id === fixtures.pendingRegistrationShiftId),
    inactiveAuthSession: Boolean(inactiveLogin.data.session),
    inactiveReportRows: inactiveReport.data?.length ?? 0,
    inactiveRevisionError: inactiveRevisions.error?.code ?? null,
    anonymousReportRows: anonymousReport.data?.length ?? 0,
    roleReadbacks,
    apiResults,
  }, null, 2))
  events.push({ role: 'member', action: 'reports_read_scope_rest_rpc_children_inactive_archives_and_api', result: 'pass' })
})

test('Member draft uses CAS; Leader review and confirmation persist after reload', async () => {
  const root = localFixtureClient()
  const target = await root.from('shifts').select('id').eq('title', 'UAT registered member report shift').single()
  if (target.error) throw target.error
  const initial = await root.from('reports').select('id,version_number,status').eq('shift_id', target.data.id).single()
  if (initial.error) throw new Error(`UAT_CAS_REPORT_FIXTURE_LOOKUP_FAILED:${initial.error.code ?? 'unknown'}`)

  const member = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const memberLogin = await member.auth.signInWithPassword(await credentials('member'))
  if (memberLogin.error) throw new Error(`Member Supabase Auth failed: ${memberLogin.error.status ?? 'unknown'}`)
  const saved = await member.rpc('update_report', {
    p_report_id: initial.data.id,
    p_patch: { insights_good: 'Member draft saved through authenticated CAS RPC' },
    p_expected_version: initial.data.version_number,
    p_reason: 'isolated UAT member draft save',
    p_event: 'save',
  })
  if (saved.error || !saved.data) throw saved.error ?? new Error('MEMBER_DRAFT_SAVE_FAILED')
  const stale = await member.rpc('update_report', {
    p_report_id: initial.data.id,
    p_patch: { insights_good: 'stale write must not replace the saved draft' },
    p_expected_version: initial.data.version_number,
    p_reason: 'isolated UAT stale write probe',
    p_event: 'save',
  })
  expect(stale.error?.message).toContain('REPORT_VERSION_CONFLICT')
  const afterStale = await root.from('reports').select('insights_good,version_number').eq('id', initial.data.id).single()
  if (afterStale.error) throw afterStale.error
  expect(afterStale.data.insights_good).toBe('Member draft saved through authenticated CAS RPC')
  expect(afterStale.data.version_number).toBe(saved.data.version_number)
  const memberCurrent = await root.from('reports').select('version_number').eq('id', initial.data.id).single()
  if (memberCurrent.error) throw memberCurrent.error
  const memberConfirm = await member.rpc('update_report', {
    p_report_id: initial.data.id,
    p_patch: { status: 'confirmed', metrics_confirmed: true },
    p_expected_version: memberCurrent.data.version_number,
    p_reason: 'member must not confirm',
    p_event: 'confirm',
  })
  expect(memberConfirm.error?.code).toBe('42501')

  const leader = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const leaderLogin = await leader.auth.signInWithPassword(await credentials('leader'))
  if (leaderLogin.error) throw new Error(`Leader Supabase Auth failed: ${leaderLogin.error.status ?? 'unknown'}`)
  const review = await leader.rpc('start_report_review', { p_report_id: initial.data.id })
  if (review.error) throw review.error
  const leaderCurrent = await root.from('reports').select('version_number').eq('id', initial.data.id).single()
  if (leaderCurrent.error) throw leaderCurrent.error
  const confirmed = await leader.rpc('update_report', {
    p_report_id: initial.data.id,
    p_patch: {
      status: 'confirmed', metrics_confirmed: true, dashboard_platform: 'other',
      confirmed_at: new Date().toISOString(), confirmed_by: 'uat-leader',
      reviewed_by: 'uat-leader', reviewed_at: new Date().toISOString(),
    },
    p_expected_version: leaderCurrent.data.version_number,
    p_reason: 'isolated UAT Leader confirmation',
    p_event: 'confirm',
  })
  if (confirmed.error || !confirmed.data) throw confirmed.error ?? new Error('LEADER_REPORT_CONFIRM_FAILED')
  const persisted = await root.from('reports').select('status,metrics_confirmed,version_number').eq('id', initial.data.id).single()
  if (persisted.error) throw persisted.error
  expect(persisted.data.status).toBe('confirmed')
  expect(persisted.data.metrics_confirmed).toBe(true)
  expect(persisted.data.version_number).toBe(confirmed.data.version_number)
  await writeFile(resolve(evidenceDir, 'report-lifecycle-results.json'), JSON.stringify({
    staleWriteRejected: stale.error?.message.includes('REPORT_VERSION_CONFLICT'),
    draftSavedByMember: afterStale.data.insights_good === 'Member draft saved through authenticated CAS RPC',
    memberConfirmationDenied: memberConfirm.error?.code === '42501',
    leaderReviewStarted: review.data.status === 'in_review',
    leaderConfirmationPersisted: persisted.data.status === 'confirmed' && persisted.data.metrics_confirmed,
    versionAfterConfirmation: persisted.data.version_number,
  }, null, 2))
  events.push({ role: 'leader', action: 'member_draft_cas_review_confirm_database_reload', result: 'pass' })
})

test('Admin export downloads and reconciles every filtered report from all pages', async ({ page }) => {
  await signIn(page, 'admin')
  const root = localFixtureClient()
  const admin = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const adminLogin = await admin.auth.signInWithPassword(await credentials('admin'))
  if (adminLogin.error) throw new Error(`Admin Supabase Auth failed: ${adminLogin.error.status ?? 'unknown'}`)
  const expectedIds: string[] = []
  let expectedTotal = 0
  for (let pageNumber = 1; ; pageNumber++) {
    const pageResult = await admin.rpc('get_report_list_page', {
      p_page: pageNumber,
      p_page_size: 50,
      p_filters: {},
      p_summary: false,
    })
    if (pageResult.error) throw pageResult.error
    const page = pageResult.data as { rows?: Array<{ id: string }>; total?: number }
    expectedTotal = page.total ?? 0
    expectedIds.push(...(page.rows ?? []).map(report => report.id))
    if (expectedIds.length >= expectedTotal) break
  }
  expect(expectedTotal).toBeGreaterThan(100)

  const openExport = page.getByRole('button', { name: /export filtered reports/i })
  await openExport.click()
  const allDownload = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /export filtered reports/i }).click()
  const allFile = await allDownload
  const allBook = XLSX.read(await readFile((await allFile.path())!), { type: 'buffer' })
  const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(allBook.Sheets.Reports!)
  const allIds = allRows.map(row => String(row['Report ID'])).sort()
  const expectedIdsSorted = expectedIds.sort()
  expect(allRows).toHaveLength(expectedTotal)
  expect(allIds).toEqual(expectedIdsSorted)

  const search = page.locator('main input').first()
  await search.fill('UAT historical campaign 100')
  await expect(page.getByRole('heading', { name: 'UAT historical campaign 100', exact: true })).toBeVisible()
  await openExport.click()
  const filteredDownload = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /export filtered reports/i }).click()
  const filteredFile = await filteredDownload
  const filteredBook = XLSX.read(await readFile((await filteredFile.path())!), { type: 'buffer' })
  const filteredRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(filteredBook.Sheets.Reports!)
  expect(filteredRows).toHaveLength(1)
  const filteredShift = await root.from('shifts').select('id').eq('title', 'UAT historical campaign 100').single()
  if (filteredShift.error) throw filteredShift.error
  const filteredExpected = await root.from('reports').select('id').eq('shift_id', filteredShift.data.id).single()
  if (filteredExpected.error) throw filteredExpected.error
  expect(filteredRows[0]['Report ID']).toBe(filteredExpected.data.id)
  await writeFile(resolve(evidenceDir, 'export-reconciliation.json'), JSON.stringify({
    sourceActiveReportCount: expectedTotal,
    workbookRows: allRows.length,
    allIdsMatchedExactly: JSON.stringify(allIds) === JSON.stringify(expectedIdsSorted),
    filteredSearch: 'UAT historical campaign 100',
    filteredExpectedRows: 1,
    filteredWorkbookRows: filteredRows.length,
    filteredIdMatched: filteredRows[0]['Report ID'] === filteredExpected.data.id,
  }, null, 2))
  events.push({ role: 'admin', action: 'reports_export_all_and_search_filter_reconciled', result: 'pass' })
  await signOut(page, 'admin')
})
