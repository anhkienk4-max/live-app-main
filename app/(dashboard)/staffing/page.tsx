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

// Explicit opt-in. Without this public flag, all user roles see the original Staffing UI.
const attendanceImportEnabled = process.env.NEXT_PUBLIC_FEATURE_ATTENDANCE_IMPORT === 'true'

function StaffingContent() {
  const { t, translate } = useTranslation()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentUser } = useCurrentUser()
  const tabParam = searchParams.get('tab')

  const canReview = currentUser ? hasPermission(currentUser, 'shifts.approve_registration') : false
  const activeTab = tabParam === 'registration' && canReview
    ? 'registration'
    : tabParam === 'attendance' && canReview && attendanceImportEnabled ? 'attendance' : 'staffing'

  const handleTabChange = (nextTab: 'staffing' | 'registration' | 'attendance') => {
    if (nextTab === 'registration') {
      router.push('/staffing?tab=registration')
    } else if (nextTab === 'attendance' && canReview && attendanceImportEnabled) {
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
                {attendanceImportEnabled && <button
                  type="button"
                  onClick={() => handleTabChange('attendance')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                    activeTab === 'attendance' ? 'bg-indigo-600 text-white shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Nhập chấm công (Attendance)</span>
                </button>}
              </div>
            )}
          </div>
        </PageHeaderContent>
      </PageHeader>

      {activeTab === 'registration' ? (
        <RegistrationReviewWorkspace />
      ) : activeTab === 'attendance' && canReview && attendanceImportEnabled ? (
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
