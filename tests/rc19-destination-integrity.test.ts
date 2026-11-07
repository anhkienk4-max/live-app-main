import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { UNIFIED_NAVIGATION_CATALOG } from '../lib/ui/role-ux.ts'

test('RC19 C4.4: 28-item destination matrix — all route files exist and are verified', () => {
  assert.ok(UNIFIED_NAVIGATION_CATALOG.length >= 28, 'Catalog must contain at least 28 canonical items')

  const verifiedDestinations: Record<string, string> = {}
  for (const item of UNIFIED_NAVIGATION_CATALOG) {
    const [path] = item.href.split('?')
    const routeDir = path === '/' ? 'app/(dashboard)/page.tsx' : `app/(dashboard)${path}/page.tsx`
    const exists = existsSync(new URL(`../${routeDir}`, import.meta.url))
    assert.ok(exists, `Route file for ${item.name} (${item.href} -> ${routeDir}) must exist`)
    verifiedDestinations[item.href] = routeDir
  }

  // Ensure key functional areas are present in catalog
  const paths = UNIFIED_NAVIGATION_CATALOG.map(item => item.href)
  assert.ok(paths.includes('/calendar?tab=attendance'), 'Attendance must be in catalog')
  assert.ok(paths.includes('/calendar?tab=notes'), 'Shift Notes must be in catalog')
  assert.ok(paths.includes('/staff?tab=accounts'), 'Account Management must be in catalog')
  assert.ok(paths.includes('/payroll?tab=personal'), 'Personal Payslip must be in catalog')
  assert.ok(paths.includes('/staffing?tab=registration'), 'Registration must be in catalog')
})

test('RC19 C4.4: CalendarWorkspace recognizes attendance and notes tabs with real operational workflows', () => {
  const workspace = readFileSync(new URL('../components/features/calendar/CalendarWorkspace.tsx', import.meta.url), 'utf8')
  const board = readFileSync(new URL('../components/features/calendar/ShiftRegistrationBoard.tsx', import.meta.url), 'utf8')
  const detailModal = readFileSync(new URL('../components/features/shifts/ShiftDetailModal.tsx', import.meta.url), 'utf8')

  // CalendarWorkspace recognizes attendance and notes tabs
  assert.match(workspace, /"attendance"/)
  assert.match(workspace, /"notes"/)
  assert.match(workspace, /data-testid="calendar-tab-attendance"/)
  assert.match(workspace, /data-testid="calendar-tab-notes"/)

  // Mounting targets
  assert.match(workspace, /<TabsContent[^>]*value="attendance"[^>]*>[\s\S]*?<ShiftRegistrationBoard[^>]*defaultDetailTab="attendance"/)
  assert.match(workspace, /<TabsContent[^>]*value="notes"[^>]*>[\s\S]*?<ShiftRegistrationBoard[^>]*defaultDetailTab="notes"/)

  // ShiftRegistrationBoard passes initialTab to ShiftDetailModal
  assert.match(board, /handleOpenDetail/)
  assert.match(board, /open-my-shift-attendance/)
  assert.match(board, /open-my-shift-notes/)

  // ShiftDetailModal connects to real workflows
  assert.match(detailModal, /<TabsTrigger[^>]*value="attendance"/)
  assert.match(detailModal, /<TabsTrigger[^>]*value="notes"/)
  assert.match(detailModal, /SelfAttendancePanel/)
  assert.match(detailModal, /ShiftOperationalNotesSection/)
})

test('RC19 C4.4: StaffList recognizes ?tab=accounts and provides meaningful restricted state for unauthorized users', () => {
  const staffList = readFileSync(new URL('../components/features/staff/StaffList.tsx', import.meta.url), 'utf8')
  const staffPage = readFileSync(new URL('../app/(dashboard)/staff/page.tsx', import.meta.url), 'utf8')

  // URL query parameter recognition
  assert.match(staffList, /searchParams\.get\('tab'\)/)
  assert.match(staffList, /tabParam === 'accounts' \|\| tabParam === 'requests'/)
  assert.match(staffList, /data-testid="staff-tab-accounts"/)

  // Authorized user gets AccountRequestPanel; unauthorized gets meaningful restricted state
  assert.match(staffList, /canManage \? \(\s*<AccountRequestPanel \/>\s*\) : \(\s*<div[^>]*data-testid="staff-accounts-restricted"/)
  assert.match(staffList, /returnToStaffDirectory/)

  // Page wrapper has Suspense boundary
  assert.match(staffPage, /<React\.Suspense/)
})

test('RC19 C4.4: Payroll recognizes ?tab=personal for all roles and restricts company payroll to Admin', () => {
  const payrollPage = readFileSync(new URL('../app/(dashboard)/payroll/page.tsx', import.meta.url), 'utf8')

  // URL query parameter recognition
  assert.match(payrollPage, /searchParams\.get\('tab'\)/)
  assert.match(payrollPage, /tabParam === 'personal'/)

  // Personal payslip renders MyPayslipPanel for all roles
  assert.match(payrollPage, /<MyPayslipPanel key=\{identityKey \?\? currentUser\.id\}/)

  // Non-admin accessing company payroll (/payroll) gets meaningful restricted 403 state
  assert.match(payrollPage, /resolveSystemPermission\(currentUser\) !== 'admin'/)
  assert.match(payrollPage, /Bạn không có quyền truy cập bảng lương \(403\)\./)

  // Suspense boundary present
  assert.match(payrollPage, /<React\.Suspense/)
})

test('RC19 C4.4: Staffing recognizes ?tab=registration and respects approval permissions', () => {
  const staffingPage = readFileSync(new URL('../app/(dashboard)/staffing/page.tsx', import.meta.url), 'utf8')

  assert.match(staffingPage, /tabParam === 'registration'/)
  assert.match(staffingPage, /RegistrationReviewWorkspace/)
  assert.match(staffingPage, /shifts\.approve_registration/)
})
