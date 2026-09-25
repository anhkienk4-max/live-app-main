'use client'

import { Suspense } from 'react'
import { useSearchParams, notFound } from 'next/navigation'
import { DashboardOverview } from '@/components/features/dashboard/DashboardOverview'
import { isVisualFixtureMode } from '@/lib/visual-fixtures'
import { AlertTriangle, Info } from 'lucide-react'
import { AuthIdentityProvider } from '@/lib/auth/AuthIdentityProvider'

function VisualQaContent() {
  const searchParams = useSearchParams()
  const role = searchParams.get('role') || 'member'

  if (!isVisualFixtureMode()) {
    notFound()
  }

  // Create a mock user based on the requested role
  const mockIdentity = {
    id: `qa-${role}`,
    email: `${role}@livestream.com`,
    display_name: `${role.charAt(0).toUpperCase() + role.slice(1)} QA User`,
    avatar_url: '',
    role: role,
    status: 'active'
  }

  const mockBusinessUser = {
    id: `qa-${role}`,
    auth_id: `qa-${role}`,
    email: `${role}@livestream.com`,
    full_name: `${role.charAt(0).toUpperCase() + role.slice(1)} QA User`,
    role: (role === 'member' ? 'staff' : role) as 'admin' | 'leader' | 'staff',
    operational_roles: ['host', 'support'],
    status: 'active',
    avatar_url: '',
    join_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm font-bold flex items-center gap-2 justify-center shrink-0">
        <Info className="h-4 w-4" />
        VISUAL QA / FIXTURE DATA - SCENARIO: {searchParams.get('scenario')} - ROLE: {role.toUpperCase()}
      </div>
      <div className="flex-1 overflow-auto relative">
        {/* We need to override the Role context using AuthIdentityProvider for the dashboard to render correctly */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <AuthIdentityProvider mode="mock" identity={mockIdentity as any} businessUser={mockBusinessUser as any}>
          <DashboardOverview />
        </AuthIdentityProvider>
      </div>
    </div>
  )
}

export default function VisualQaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading QA Fixtures...</div>}>
      <VisualQaContent />
    </Suspense>
  )
}
