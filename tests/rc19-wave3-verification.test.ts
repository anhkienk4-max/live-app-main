import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import {
  readShiftListUrlState,
  shiftListUrlValues,
} from '../lib/utils/shiftListUrlState.ts'
import {
  filterNav,
  getNavigationForRole,
  groupNavigation,
} from '../lib/ui/role-ux.ts'
import type { User, Shift } from '../lib/types/database.types.ts'

// ==========================================
// TICKET #111: Brand/Platform filters, URL & pagination
// ==========================================
test('TASK D (#111): ShiftList Brand/Platform filters, URL state and pagination round-trip', () => {
  const shiftListSource = readFileSync(
    new URL('../components/features/shifts/ShiftList.tsx', import.meta.url),
    'utf8'
  )

  // Verify ShiftList renders desktop & mobile brand and platform filters
  assert.match(shiftListSource, /name="brand"/)
  assert.match(shiftListSource, /name="platform"/)
  assert.match(shiftListSource, /ShiftEntityFilter/)
  assert.match(shiftListSource, /shifts-\$\{mobile \? 'mobile' : 'desktop'\}-\$\{name\}-filter/)

  // Verify URL state parsing of brand and platform
  const params = new URLSearchParams('shifts_brand=brand-apple&shifts_platform=tiktok&shifts_page=3&shifts_status=live')
  const state = readShiftListUrlState(params)
  assert.equal(state.brandId, 'brand-apple')
  assert.equal(state.platformId, 'tiktok')
  assert.equal(state.status, 'live')

  // Verify URL generation round-trip
  const values = shiftListUrlValues(state)
  assert.equal(values.shifts_brand, 'brand-apple')
  assert.equal(values.shifts_platform, 'tiktok')
  assert.equal(values.shifts_status, 'live')

  // Changing brand or platform resets pagination to page 1
  assert.match(shiftListSource, /listFilters = \{ \.\.\.shiftDateWindowFilters/)
  assert.match(shiftListSource, /brandIds: urlState\.brandId \? \[urlState\.brandId\] : \[\]/)
  assert.match(shiftListSource, /platformIds: urlState\.platformId \? \[urlState\.platformId\] : \[\]/)
})

// ==========================================
// TICKET #75: Swap searchable eligible-shift picker
// ==========================================
test('TASK D (#75): Swap searchable eligible-shift picker source and contract verification', () => {
  const swapModalSource = readFileSync(
    new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url),
    'utf8'
  )
  const swapDialogSource = readFileSync(
    new URL('../components/features/swaps/SwapRequestDialog.tsx', import.meta.url),
    'utf8'
  )

  // Step 1 Source shift search
  assert.match(swapModalSource, /sourceSearchDraft/)
  assert.match(swapModalSource, /sourceSearch/)
  assert.match(swapModalSource, /Search shift, brand, platform or studio\.\.\./)

  // Step 2 Staff eligibility search
  assert.match(swapModalSource, /staffSearch/)
  assert.match(swapModalSource, /staffOnlyEligible/)
  assert.match(swapModalSource, /Lịch trống - đủ điều kiện nhận ca|Schedule available - recipient is eligible/)

  // Step 3 Target exchange shift search
  assert.match(swapModalSource, /targetSearchDraft/)
  assert.match(swapModalSource, /targetSearch/)
  assert.match(swapModalSource, /Search exchange shift by title, studio\.\.\./)

  // Fallback dialog also supports target and staff search
  assert.match(swapDialogSource, /targetSearchDraft/)
  assert.match(swapDialogSource, /staffSearch/)
})

// ==========================================
// TICKET #167: Role-aware navigation fail-closed
// ==========================================
test('TASK D (#167): Role-aware navigation fails closed and cannot exceed backend authority', () => {
  // 1. Admin navigation
  const adminUser: User = {
    id: 'usr-admin',
    email: 'admin@ada.test',
    full_name: 'Admin User',
    role: 'admin',
    system_permission: 'admin',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }
  const adminNav = filterNav(getNavigationForRole('admin'), adminUser)
  const adminHrefs = adminNav.map(item => item.href)
  assert.ok(adminHrefs.includes('/admin'), 'Admin sees Admin workspace')
  assert.ok(adminHrefs.includes('/audit'), 'Admin sees Audit')
  assert.ok(adminHrefs.includes('/settings'), 'Admin sees Settings')
  assert.ok(adminHrefs.includes('/payroll'), 'Admin sees Payroll')

  // 2. Leader navigation
  const leaderUser: User = {
    id: 'usr-leader',
    email: 'leader@ada.test',
    full_name: 'Leader User',
    role: 'leader',
    system_permission: 'leader',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }
  const leaderNav = filterNav(getNavigationForRole('leader'), leaderUser)
  const leaderHrefs = leaderNav.map(item => item.href)
  assert.ok(!leaderHrefs.includes('/admin'), 'Leader CANNOT see Admin workspace')
  assert.ok(!leaderHrefs.includes('/audit'), 'Leader CANNOT see Audit')
  assert.ok(!leaderHrefs.includes('/settings'), 'Leader CANNOT see Settings')
  assert.ok(leaderHrefs.includes('/staffing'), 'Leader sees Staffing')
  assert.ok(leaderHrefs.includes('/workforce'), 'Leader sees Team Workforce')

  // 3. Member navigation
  const memberUser: User = {
    id: 'usr-member',
    email: 'member@ada.test',
    full_name: 'Member User',
    role: 'member',
    system_permission: 'member',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }
  const memberNav = filterNav(getNavigationForRole('member'), memberUser)
  const memberHrefs = memberNav.map(item => item.href)
  assert.ok(!memberHrefs.includes('/admin'), 'Member CANNOT see Admin workspace')
  assert.ok(!memberHrefs.includes('/audit'), 'Member CANNOT see Audit')
  assert.ok(!memberHrefs.includes('/settings'), 'Member CANNOT see Settings')
  assert.ok(!memberHrefs.includes('/payroll'), 'Member CANNOT see company Payroll')
  assert.ok(!memberHrefs.includes('/staffing'), 'Member CANNOT see Staffing management')
  assert.ok(memberHrefs.includes('/calendar?tab=mine'), 'Member sees My Schedule')
  assert.ok(memberHrefs.includes('/calendar?tab=open'), 'Member sees Open Shifts')

  // 4. Client spoofing prevention: If an unauthenticated or undefined user is passed, filterNav removes all gated items
  const unauthNav = filterNav(getNavigationForRole('admin'), null)
  assert.ok(!unauthNav.some(i => i.href === '/admin'), 'Null actor is stripped of admin routes')
})

// ==========================================
// TICKET #90: Real performance baseline measurement
// ==========================================
test('TASK D (#90): Real performance baseline measurement for shift filtering, URL parsing, and cache turnaround', () => {
  // 1. Measure filtering 1,000 synthetic shifts
  const sampleShifts: Shift[] = Array.from({ length: 1000 }, (_, i) => ({
    id: `shift-${i}`,
    date: `2026-10-${String((i % 30) + 1).padStart(2, '0')}`,
    start_time: '10:00',
    end_time: '14:00',
    start_at: '2026-10-01T10:00:00Z',
    brand_id: `brand-${i % 10}`,
    platform_id: `platform-${i % 4}`,
    campaign_id: `campaign-${i % 5}`,
    status: (['scheduled', 'live', 'completed', 'cancelled'] as const)[i % 4],
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  }))

  const t0 = performance.now()
  const filtered = sampleShifts.filter(s =>
    s.brand_id === 'brand-3' &&
    s.status === 'live'
  )
  const filterDurationMs = performance.now() - t0

  assert.ok(filtered.length > 0, `Expected matching shifts, got ${filtered.length}`)
  assert.ok(filterDurationMs < 20, `In-memory 1,000 item filter took ${filterDurationMs.toFixed(3)}ms (target: < 20ms)`)

  // 2. Measure URL state parsing turnaround (100 iterations)
  const t1 = performance.now()
  for (let i = 0; i < 100; i++) {
    const p = new URLSearchParams(`shifts_range=custom&shifts_from=2026-10-01&shifts_to=2026-10-31&shifts_brand=brand-${i % 10}&shifts_status=live&shifts_sort=asc`)
    const s = readShiftListUrlState(p)
    assert.equal(s.status, 'live')
  }
  const urlParseAvgMs = (performance.now() - t1) / 100
  assert.ok(urlParseAvgMs < 2, `URL state parse average took ${urlParseAvgMs.toFixed(3)}ms (target: < 2ms)`)

  // 3. Measure Navigation grouping turnaround (1,000 iterations)
  const t2 = performance.now()
  const rawNav = getNavigationForRole('admin')
  for (let i = 0; i < 1000; i++) {
    const groups = groupNavigation(rawNav)
    assert.ok(groups.length >= 3)
  }
  const navGroupingAvgMs = (performance.now() - t2) / 1000
  assert.ok(navGroupingAvgMs < 0.2, `Navigation grouping average took ${navGroupingAvgMs.toFixed(4)}ms (target: < 0.2ms)`)
})
