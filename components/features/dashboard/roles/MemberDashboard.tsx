import * as React from 'react'
import { Calendar, Clock, Users, ArrowLeftRight, CheckCircle, FileText, Bell } from 'lucide-react'
import { getCurrentBusinessDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { getSwapUiActions } from '@/lib/utils/swapUi'
import { getMemberAssignedShifts, getMemberPendingRegistrations, getMemberPendingSwaps } from '@/lib/ui/dashboard-role-data'
import { deriveMemberAttention } from '@/lib/ui/operational-attention'
import { PageShell } from '@/components/ui/archetypes'
import { PageHeader, PageHeaderContent } from '@/components/ui/headers'
import { OperationalStatusStrip, HealthyState } from '@/components/ui/operational-status'
import { MetricCard } from '@/components/ui/operational-widgets'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CommonProps, nameFor, UpcomingShiftsList, QuickAction } from '../shared/DashboardShared'

export function MemberDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, currentUser, registrations, swapRequests, t, setSelectedShift } = props
  
  const today = getCurrentBusinessDate()
  
  // Find member's shifts using strictly canonical registration
  const myShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations)
  
  const upcoming = myShifts.filter(shift => shift.date >= today && (shift.status === 'scheduled' || shift.status === 'live' || shift.status === 'preparing')).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  const nextShift = upcoming[0]
  
  const myPendingSwaps = getMemberPendingSwaps(swapRequests, currentUser.id)
  const myReports = reports.filter(r => r.submitted_by === currentUser.id)
  const myPendingRegistrations = getMemberPendingRegistrations(registrations, currentUser.id)

  // E5: derive personal exception summary
  let actionableSwapCount = 0
  let waitingSwapCount = 0
  
  const personalOperationalSwaps = swapRequests.filter(s => 
    (s.status === 'pending' || s.status === 'accepted') && 
    (s.requester_id === currentUser.id || s.counterpart_id === currentUser.id)
  )
  
  personalOperationalSwaps.forEach(s => {
    const actions = getSwapUiActions(s, currentUser)
    if (actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject || actions.showCancel) {
      actionableSwapCount++
    } else {
      waitingSwapCount++
    }
  })

  const memberAttention = deriveMemberAttention({
    pendingRegistrationCount: myPendingRegistrations.length,
    actionableSwapCount,
    waitingSwapCount,
    hasUpcomingShift: upcoming.length > 0,
  })

  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">
    <PageHeader>
      <PageHeaderContent>
        <h1 className="text-3xl font-bold">{t('welcome')}, {currentUser.full_name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">{t('myWorkspace')}</p>
      </PageHeaderContent>
    </PageHeader>

    {/* E5: personal exception-first strip */}
    {memberAttention.items.length > 0 ? (
      <OperationalStatusStrip items={memberAttention.items} className="gap-2" />
    ) : (
      <HealthyState
        message={t('allClear')}
        description={t('noPendingRequests')}
      />
    )}

    {nextShift && (
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-primary">{t('nextAssignedShift')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-lg">{nextShift.title || nameFor(brands, nextShift.brand_id)}</p>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" /> <span>{nextShift.date}</span>
              <Clock className="w-4 h-4 ml-2" /> <span>{formatShiftTimeRange(nextShift)}</span>
            </div>
          </div>
          <Button onClick={() => setSelectedShift(nextShift)}>{t('viewDetails')}</Button>
        </CardContent>
      </Card>
    )}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label={t('myUpcomingShifts')} value={upcoming.length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />
      <MetricCard label={t('pendingRegistrations')} value={myPendingRegistrations.length.toString()} icon={<Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />} />
      <MetricCard label={t('pendingSwaps')} value={myPendingSwaps.length.toString()} icon={<ArrowLeftRight className="h-5 w-5 text-purple-600 dark:text-purple-400" />} />
      <MetricCard label={t('mySubmittedReports')} value={myReports.length.toString()} icon={<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />} />
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t('quickActions')}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/calendar?tab=mine" label={t('myCalendar')} icon={<Calendar className="h-5 w-5" />} />
        <QuickAction href="/calendar?tab=open" label={t('openShifts')} icon={<Users className="h-5 w-5" />} />
        <QuickAction href="/reports" label={t('submitReport')} icon={<FileText className="h-5 w-5" />} />
        <QuickAction href="/notifications" label={t('notifications')} icon={<Bell className="h-5 w-5" />} />
      </CardContent></Card>
    </div>

    <UpcomingShiftsList upcoming={upcoming.slice(0, 5)} brands={brands} platforms={platforms} t={t} title={t('mySchedule')} setSelectedShift={setSelectedShift} />
  </PageShell>
}
