'use client'

import * as React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Users, UserCheck, FileSpreadsheet } from 'lucide-react'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import { StaffingWorkspace } from '@/components/features/calendar/StaffingWorkspace'
import { ShiftRegistrationBoard } from '@/components/features/calendar/ShiftRegistrationBoard'
import { RegistrationReviewWorkspace } from '@/components/features/registration'
import { AttendanceSourceManager } from '@/components/features/workforce/AttendanceSourceManager'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'

function StaffingContent() {
  const { t, translate } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentUser } = useCurrentUser()
  const tabParam = searchParams.get('tab')
  const canImportAttendance = process.env.NEXT_PUBLIC_FEATURE_IMPORT_BATCH === 'true'

  const canReview = currentUser ? hasPermission(currentUser, 'shifts.approve_registration') : false
  const activeTab =
    tabParam === 'registration' && canReview
      ? 'registration'
      : tabParam === 'attendance' && canReview && canImportAttendance
      ? 'attendance'
      : 'staffing'

  const handleTabChange = (nextTab: 'staffing' | 'registration' | 'attendance') => {
    if (nextTab === 'registration') {
      router.push('/staffing?tab=registration')
    } else if (nextTab === 'attendance' && canImportAttendance) {
      router.push('/staffing?tab=attendance')
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
              <h1 className="text-2xl font-semibold">{t('staffing')}</h1>
              <p className="text-sm text-muted-foreground">{translate('Manage shift requirements, gaps, and assignments.')}</p>
            </div>

            {/* TAB SELECTOR */}
            {canReview && (
              <div className={`grid w-full min-w-0 grid-cols-1 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs sm:w-auto ${canImportAttendance ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <button
                  type="button"
                  onClick={() => handleTabChange('staffing')}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition-all ${
                    activeTab === 'staffing'
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span className="min-w-0 text-center leading-tight">Định biên ca trực (Staffing)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('registration')}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition-all ${
                    activeTab === 'registration'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="min-w-0 text-center leading-tight">Xét duyệt đăng ký (Registration)</span>
                </button>
                {canImportAttendance && <button
                  type="button"
                  onClick={() => handleTabChange('attendance')}
                  className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-medium transition-all ${
                    activeTab === 'attendance'
                      ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="min-w-0 text-center leading-tight">Nhập chấm công (Attendance)</span>
                </button>}
              </div>
            )}
          </div>
        </PageHeaderContent>
      </PageHeader>

      {activeTab === 'registration' ? (
        <RegistrationReviewWorkspace />
      ) : activeTab === 'attendance' ? (
        <AttendanceSourceManager key={currentUser?.id ?? 'anonymous'} />
      ) : (
        canReview ? <StaffingWorkspace /> : <ShiftRegistrationBoard mode="open" />
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
