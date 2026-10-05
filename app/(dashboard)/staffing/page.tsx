'use client'

import * as React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Users, UserCheck } from 'lucide-react'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import { ShiftRegistrationBoard } from '@/components/features/calendar/ShiftRegistrationBoard'
import { RegistrationReviewWorkspace } from '@/components/features/registration'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

function StaffingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentUser } = useCurrentUser()
  const tabParam = searchParams.get('tab')

  const canReview = currentUser ? hasPermission(currentUser, 'shifts.approve_registration') : false
  const activeTab = tabParam === 'registration' && canReview ? 'registration' : 'staffing'

  const handleTabChange = (nextTab: 'staffing' | 'registration') => {
    if (nextTab === 'registration') {
      router.push('/staffing?tab=registration')
    } else {
      router.push('/staffing')
    }
  }

  return (
    <PageShell archetype="schedule" className="p-4 md:p-6 space-y-6" data-testid="staffing-page">
      <PageHeader>
        <PageHeaderContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Staffing</h1>
              <p className="text-sm text-muted-foreground">Manage shift requirements, gaps, and assignments.</p>
            </div>

            {/* TAB SELECTOR */}
            {canReview && (
              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => handleTabChange('staffing')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                    activeTab === 'staffing'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Định biên ca trực (Staffing)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('registration')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                    activeTab === 'registration'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Xét duyệt đăng ký (Registration)</span>
                </button>
              </div>
            )}
          </div>
        </PageHeaderContent>
      </PageHeader>

      {activeTab === 'registration' ? (
        <RegistrationReviewWorkspace />
      ) : (
        <ShiftRegistrationBoard mode="open" />
      )}
    </PageShell>
  )
}

export default function StaffingPage() {
  return (
    <React.Suspense fallback={<div className="p-6">Đang tải...</div>}>
      <StaffingContent />
    </React.Suspense>
  )
}
