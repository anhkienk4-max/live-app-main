import Link from 'next/link'
import * as React from 'react'

import { Calendar, Clock, Users, FileText, Bell } from 'lucide-react'

import { getCurrentBusinessDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'

import { getSwapUiActions } from '@/lib/utils/swapUi'

import { getMemberAssignedShifts, getMemberPendingRegistrations, getMemberPendingSwaps } from '@/lib/ui/dashboard-role-data'

import { deriveMemberAttention } from '@/lib/ui/operational-attention'

import { PageShell } from '@/components/ui/archetypes'

import { PageHeader, PageHeaderContent } from '@/components/ui/headers'

import { OperationalStatusStrip, HealthyState } from '@/components/ui/operational-status'



import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

import { Button } from '@/components/ui/button'

import { CommonProps, nameFor, UpcomingShiftsList, QuickAction } from '../shared/DashboardShared'



export function MemberDashboard(props: CommonProps) {

  const { shifts, reports: _reports, brands, platforms, currentUser, registrations, swapRequests, t, setSelectedShift } = props



  const today = getCurrentBusinessDate()



  // Find member's shifts using strictly canonical registration

  const myShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations)



  const upcoming = myShifts.filter(shift => shift.date >= today && (shift.status === 'scheduled' || shift.status === 'live' || shift.status === 'preparing')).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))

  const nextShift = upcoming[0]





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



  const openShifts = shifts.filter(s => s.date >= today && s.status === 'scheduled' && !s.host_id && !s.support_id && !s.technical_id).slice(0, 3)

  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">
    <PageHeader>
      <PageHeaderContent>
        <h1 className="text-3xl font-bold">{t('welcome')}, {currentUser.full_name.split(' ')[0]}</h1>
        <p className="text-[13px] text-muted-foreground">{t('mySchedule')}</p>
      </PageHeaderContent>
    </PageHeader>

    {/* 1. Next Shift (12 columns implicitly or explicitly) */}
    {nextShift ? (
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-primary">{t('nextAssignedShift')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
    ) : (
      <Card className="bg-muted/10 border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
          <p className="text-muted-foreground">{t('noNextShift')}</p>
          <Button variant="outline" render={<Link href="/calendar?tab=open" />}>
            <Calendar className="mr-2 h-4 w-4" /> {t('browseOpenShifts')}
          </Button>
        </CardContent>
      </Card>
    )}

    {/* My Actions (5) and My Schedule (7) */}
    <div className="grid gap-6 md:grid-cols-12 flex-1">
      {/* 2. My Actions (5 columns) */}
      <div className="md:col-span-5 flex flex-col gap-6 order-1">
        {memberAttention.items.length > 0 ? (
          <OperationalStatusStrip items={memberAttention.items} className="gap-2" />
        ) : (
          <HealthyState
            message={t('allClear')}
            description={t('noPendingRequests')}
          />
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">{t('quickActions')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <QuickAction href="/calendar?tab=mine" label={t('myCalendar')} icon={<Calendar className="h-5 w-5" />} />
            <QuickAction href="/calendar?tab=open" label={t('openShifts')} icon={<Users className="h-5 w-5" />} />
            <QuickAction href="/reports" label={t('submitReport')} icon={<FileText className="h-5 w-5" />} />
            <QuickAction href="/notifications" label={t('notifications')} icon={<Bell className="h-5 w-5" />} />
          </CardContent>
        </Card>
      </div>

      {/* 3. My Schedule (7 columns) */}
      <div className="md:col-span-7 flex flex-col gap-6 order-2">
        <Card className="h-full flex flex-col">
          <CardContent className="p-4 flex-1 flex flex-col min-h-[300px]">
            <UpcomingShiftsList upcoming={upcoming.slice(0, 5)} brands={brands} platforms={platforms} t={t} title={t('mySchedule')} setSelectedShift={setSelectedShift} />
          </CardContent>
        </Card>
      </div>
    </div>

    {/* 4. Open Shifts */}
    <div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b mb-3">
          <CardTitle className="text-base">{t('openShifts')}</CardTitle>
          <Button variant="ghost" size="sm" render={<Link href="/calendar?tab=open" />}>{t('viewAll')}</Button>
        </CardHeader>
        <CardContent>
          {openShifts.length > 0 ? (
             <div className="divide-y">
               {openShifts.map(shift => (
                 <div key={shift.id} className="flex justify-between items-center py-3">
                   <div>
                     <p className="text-sm font-semibold">{shift.title || nameFor(brands, shift.brand_id)}</p>
                     <p className="text-xs text-muted-foreground">{shift.date} • {formatShiftTimeRange(shift)}</p>
                   </div>
                   <Button variant="secondary" size="sm" render={<Link href={`/calendar?tab=open&shiftId=${shift.id}`} />}>
                     {t('view')}
                   </Button>
                 </div>
               ))}
             </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('noOpenShifts')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>

  </PageShell>
}
