'use client'

import { Suspense } from 'react'
import { useSearchParams, notFound } from 'next/navigation'
import { DashboardOverview } from '@/components/features/dashboard/DashboardOverview'
import { isVisualFixtureMode } from '@/lib/visual-fixtures'
import { getDashboardFixture } from '@/lib/visual-fixtures/dashboards'
import { DashboardFixtureScenario } from '@/lib/visual-fixtures/types'
import { Info } from 'lucide-react'
import { VisualQaShell } from '@/components/visual-qa/VisualQaShell'
import { AuthIdentityProvider } from '@/lib/auth/AuthIdentityProvider'
import { LeaderReferenceMock } from '@/components/visual-qa/LeaderReferenceMock'
import { AdminReferenceMock } from '@/components/visual-qa/AdminReferenceMock'
import { MemberReferenceMock } from '@/components/visual-qa/MemberReferenceMock'
import { CalendarReferenceMock } from '@/components/visual-qa/CalendarReferenceMock'
import { ShiftDetailReferenceMock } from '@/components/visual-qa/ShiftDetailReferenceMock'
import { EditShiftReferenceMock } from '@/components/visual-qa/EditShiftReferenceMock'
import { EditShiftDuplicateReferenceMock } from '@/components/visual-qa/EditShiftDuplicateReferenceMock'
import { EditShiftActionsReferenceMock } from '@/components/visual-qa/EditShiftActionsReferenceMock'
import { CreateShiftReferenceMock } from '@/components/visual-qa/CreateShiftReferenceMock'
import { LiveOperationsReferenceMock } from '@/components/visual-qa/LiveOperationsReferenceMock'
import { ShiftLifecycleReferenceMock } from '@/components/visual-qa/ShiftLifecycleReferenceMock'
import { ShiftManagementReferenceMock, SHIFT_STATES, type ShiftQaState } from '@/components/visual-qa/ShiftOperationalReference'
import { StaffingReferenceMock } from '@/components/visual-qa/StaffingReferenceMock'
import { RegistrationReferenceMock } from '@/components/visual-qa/RegistrationReferenceMock'
import { PeopleReferenceMock } from '@/components/visual-qa/PeopleReferenceMock'
import { SwapsReferenceMock } from '@/components/visual-qa/SwapsReferenceMock'
import { NotificationsReferenceMock } from '@/components/visual-qa/NotificationsReferenceMock'
import { ReportsReferenceMock } from '@/components/visual-qa/ReportsReferenceMock'
import { AnalyticsReferenceMock } from '@/components/visual-qa/AnalyticsReferenceMock'
import { ImportReferenceMock } from '@/components/visual-qa/ImportReferenceMock'
import { AuditReferenceMock } from '@/components/visual-qa/AuditReferenceMock'
import { SettingsReferenceMock } from '@/components/visual-qa/SettingsReferenceMock'
import { AuthReferenceMock } from '@/components/visual-qa/AuthReferenceMock'

function VisualQaContent() {
  const searchParams = useSearchParams()
  const role = (searchParams.get('role') || 'member') as 'admin' | 'leader' | 'member'
  const scenario = searchParams.get('scenario') || 'reference'

  if (!isVisualFixtureMode()) {
    notFound()
  }

  if (role === 'leader' && scenario === 'reference') {
    return <LeaderReferenceMock />
  }

  if (role === 'admin' && scenario === 'reference') {
    return <AdminReferenceMock />
  }

  if (scenario === 'member' || (role === 'member' && scenario === 'reference')) {
    return <MemberReferenceMock />
  }

  if (scenario === 'calendar') {
    return <CalendarReferenceMock />
  }

  if (scenario === 'shift-detail') {
    return <ShiftDetailReferenceMock />
  }

  if (scenario === 'shift-management') {
    const requestedState = searchParams.get('state')
    const initialState = SHIFT_STATES.includes(requestedState as ShiftQaState) ? requestedState as ShiftQaState : 'list'
    return <ShiftManagementReferenceMock initialState={initialState} />
  }

  if (scenario === 'edit-shift') {
    return <EditShiftReferenceMock />
  }

  if (scenario === 'edit-shift-duplicate') {
    return <EditShiftDuplicateReferenceMock />
  }

  if (scenario === 'edit-shift-actions') {
    return <EditShiftActionsReferenceMock />
  }

  if (scenario === 'create-shift') {
    return <CreateShiftReferenceMock />
  }

  if (scenario === 'live') {
    return <LiveOperationsReferenceMock />
  }

  if (scenario === 'shift-lifecycle') {
    return <ShiftLifecycleReferenceMock />
  }

  if (scenario === 'staffing') {
    return <StaffingReferenceMock />
  }

  if (scenario === 'registration') {
    return <RegistrationReferenceMock />
  }

  if (scenario === 'people') {
    return <PeopleReferenceMock />
  }

  if (scenario === 'swaps') {
    return <SwapsReferenceMock />
  }

  if (scenario === 'notifications') {
    return <NotificationsReferenceMock />
  }

  if (scenario === 'reports') {
    return <ReportsReferenceMock />
  }

  if (scenario === 'analytics') {
    return <AnalyticsReferenceMock />
  }

  if (scenario === 'import') {
    return <ImportReferenceMock />
  }

  if (scenario === 'audit') {
    return <AuditReferenceMock />
  }

  if (scenario === 'settings') {
    return <SettingsReferenceMock />
  }

  if (scenario === 'auth') {
    return <AuthReferenceMock />
  }

  const QA_TIMESTAMP = '2026-09-26T00:00:00.000Z';

  const mockBusinessUser = {
    id: `qa-${role}`,
    auth_id: `qa-${role}`,
    email: `${role}@livestream.com`,
    full_name: `${role.charAt(0).toUpperCase() + role.slice(1)} QA User`,
    role: (role === 'member' ? 'staff' : role) as 'admin' | 'leader' | 'staff',
    operational_roles: ['host', 'support'],
    status: 'active' as const,
    avatar_url: '',
    join_date: QA_TIMESTAMP,
    created_at: QA_TIMESTAMP,
    updated_at: QA_TIMESTAMP
  }

  return (
    <AuthIdentityProvider mode="mock" identity={{ auth_user_id: mockBusinessUser.id, system_permission: role, business_user_id: mockBusinessUser.id }} businessUser={mockBusinessUser as import("@/lib/types/database.types").User}>
      <VisualQaShell role={role}>
        <div className="flex flex-col h-full">
          <div className="fixed bottom-0 right-0 z-50 bg-amber-100 text-amber-800 px-3 py-1 text-xs font-bold flex items-center gap-2 rounded-tl-md shadow-md opacity-80 hover:opacity-100 transition-opacity">
            <Info className="h-4 w-4" />
            VISUAL QA / FIXTURE DATA - SCENARIO: {scenario} - ROLE: {role.toUpperCase()}
          </div>
          <div className="flex-1 overflow-auto relative">
            <DashboardOverview
              visualRole={role}
              fixtureData={getDashboardFixture(role, scenario as DashboardFixtureScenario, 'qa-user', { shifts: [], reports: [], brands: [], platforms: [], campaigns: [], users: [], registrations: [], swapRequests: [] })}
              forceFixture={true}
            />
          </div>
        </div>
      </VisualQaShell>
    </AuthIdentityProvider>
  )
}

export default function VisualQaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading QA Fixtures...</div>}>
      <VisualQaContent />
    </Suspense>
  )
}
