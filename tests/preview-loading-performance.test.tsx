import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { PageLoadError } from '../components/ui/page-load-error.tsx'
import { currentUserDirectoryRequired } from '../lib/hooks/useCurrentUser.ts'
import { LanguageProvider } from '../lib/i18n.tsx'
import { getShiftRoleCapacities } from '../lib/services/dataService.ts'
import { mockShifts } from '../lib/services/mockData.ts'
import type { ShiftRegistration } from '../lib/types/database.types.ts'

const registration = (
  id: string,
  shiftId: string,
  role: ShiftRegistration['operational_role'],
  status: ShiftRegistration['status'],
): ShiftRegistration => ({
  id,
  shift_id: shiftId,
  user_id: `user-${id}`,
  operational_role: role,
  status,
  source: 'self_registration',
  requested_at: '2026-08-24T00:00:00.000Z',
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
})

test('Supabase current-user hydration reuses the server-derived identity without loading the staff directory', () => {
  assert.equal(currentUserDirectoryRequired('supabase'), false)
  assert.equal(currentUserDirectoryRequired('mock'), true)
})

test('capacity is derived from the already-loaded registrations and preserves zero requirements', () => {
  const shift = {
    ...mockShifts[0],
    required_host_count: 2,
    required_support_count: 1,
    required_technical_count: 0,
  }
  const capacities = getShiftRoleCapacities(shift, [
    registration('1', shift.id, 'host', 'approved'),
    registration('2', shift.id, 'host', 'pending'),
    registration('3', shift.id, 'host', 'rejected'),
    registration('4', shift.id, 'support', 'manually_assigned'),
  ])

  assert.deepEqual(capacities, [
    { role: 'host', required: 2, approved: 1, pending: 1, remaining: 1 },
    { role: 'support', required: 1, approved: 1, pending: 0, remaining: 0 },
    { role: 'technical', required: 0, approved: 0, pending: 0, remaining: 0 },
  ])
})

test('open-shift and Reports initial loads do not issue redundant registration requests', () => {
  const board = readFileSync('components/features/calendar/ShiftRegistrationBoard.tsx', 'utf8')
  const reports = readFileSync('components/features/reports/ReportsList.tsx', 'utf8')

  assert.doesNotMatch(board, /shiftRegistrationService\.getCapacity\(/)
  assert.match(board, /getShiftRoleCapacities\(shift, loadedRegistrations\)/)
  assert.doesNotMatch(reports, /shiftRegistrationService\.getForUser\(/)
  assert.match(reports, /registration\.user_id === currentUser\?\.id/)
})

test('operational page loaders settle and expose a retryable error state', () => {
  const files = [
    'app/(dashboard)/settings/page.tsx',
    'components/features/analytics/DashboardAnalytics.tsx',
    'components/features/audit/AuditHistory.tsx',
    'components/features/brands/BrandList.tsx',
    'components/features/calendar/CalendarView.tsx',
    'components/features/calendar/ScheduleImportPanel.tsx',
    'components/features/calendar/ShiftRegistrationBoard.tsx',
    'components/features/campaigns/CampaignList.tsx',
    'components/features/dashboard/DashboardOverview.tsx',
    'components/features/live/LiveMonitoringDashboard.tsx',
    'components/features/platforms/PlatformList.tsx',
    'components/features/reports/ReportsList.tsx',
    'components/features/staff/StaffList.tsx',
  ]

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /PageLoadError/, `${file} must render an explicit load failure`)
    assert.match(source, /finally[\s\S]{0,100}set(?:Settings)?Loading\(false\)/, `${file} must settle loading in finally`)
  }

  const markup = renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(PageLoadError, {
      error: new Error('network unavailable'),
      onRetry: () => undefined,
    }),
  ))
  assert.match(markup, /role="alert"/)
  assert.match(markup, /network unavailable/)
})
