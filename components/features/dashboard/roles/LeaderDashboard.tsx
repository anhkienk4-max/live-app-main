import * as React from 'react'

import { Calendar, Radio, Users, ArrowLeftRight, FileText } from 'lucide-react'

import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'

import { getSwapUiActions } from '@/lib/utils/swapUi'

import { getLeaderPendingRegistrations, getLeaderPendingReports, getLeaderPendingSwaps } from '@/lib/ui/dashboard-role-data'

import { deriveLeaderAttention } from '@/lib/ui/operational-attention'

import { getAllIssues } from '@/lib/utils/dataQuality'

import { PageShell } from '@/components/ui/archetypes'

import { PageHeader, PageHeaderContent } from '@/components/ui/headers'

import { OperationalStatusStrip, HealthyState } from '@/components/ui/operational-status'

import { MetricCard } from '@/components/ui/operational-widgets'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

import { CommonProps, matchesDimensions, DashboardFilterControls, DashboardCustomDateRange, DashboardFilterPanel, UpcomingShiftsList, QuickAction } from '../shared/DashboardShared'



{/* LEADER_DATA_SCOPE = TEAM_BY_SOURCE (AUTHORITY_DEPENDENT via backend RLS/DataService) */}
export function LeaderDashboard(props: CommonProps) {

  const { shifts, reports, brands, platforms, campaigns, users, registrations, swapRequests, filters, setFilters, showFilters, setShowFilters, currentUser, t, setPreset, onResetFilters } = props

  

  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end && matchesDimensions(shift, filters, registrations))

  const today = getCurrentBusinessDate()

  const todaysShifts = filteredShifts.filter(shift => shift.date === today)

  

  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  

  const pendingRegistrations = getLeaderPendingRegistrations(registrations, shiftIds)

  const pendingSwaps = getLeaderPendingSwaps(swapRequests, shiftIds)

  const pendingReports = getLeaderPendingReports(reports, shiftIds)



  // Retrieve data quality issues scoped to current timeframe

  const scopedReports = reports.filter(report => shiftIds.has(report.shift_id))

  const scopedRegistrations = registrations.filter(reg => shiftIds.has(reg.shift_id))

  const dqIssues = getAllIssues({ shifts: filteredShifts, reports: scopedReports, registrations: scopedRegistrations })

  const dqErrorCount = dqIssues.filter(i => i.severity === 'error').length



  // E5: derive exception-first attention summary

  let actionableSwapCount = 0

  let waitingSwapCount = 0

  

  const operationalSwaps = swapRequests.filter(s => 

    (s.status === 'pending' || s.status === 'accepted') && 

    (shiftIds.has(s.shift_id) || (s.source_shift_id && shiftIds.has(s.source_shift_id)) || (s.target_shift_id && shiftIds.has(s.target_shift_id)))

  )

  

  operationalSwaps.forEach(s => {

    const actions = getSwapUiActions(s, currentUser)

    if (actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject || actions.showCancel) {

      actionableSwapCount++

    } else {

      waitingSwapCount++

    }

  })



  const attention = deriveLeaderAttention({

    pendingRegistrationCount: pendingRegistrations.length,

    actionableSwapCount,

    waitingSwapCount,

    pendingReportCount: pendingReports.length,

    dqErrorCount,

  })



  const upcoming = filteredShifts.filter(shift => shift.date >= today && shift.status === 'scheduled').sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).slice(0, 5)

  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))



  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">

    <PageHeader className="flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">

      <PageHeaderContent>

        <h1 className="text-3xl font-bold">{t('leaderDashboard')}</h1>

        <p className="text-[13px] text-muted-foreground">{t('livestreamTeam')}</p>

      </PageHeaderContent>

      <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />

    </PageHeader>



    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />

    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} onResetFilters={onResetFilters} />}



    {/* E5: Exception-first — show action queue before passive metrics */}

    {attention.items.length > 0 ? (

      <OperationalStatusStrip items={attention.items} className="gap-2" />

    ) : (

      <HealthyState

        message={t('noPendingDecisions')}

        description={t('allUpToDate')}

      />

    )}



    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

      <MetricCard label={t('shiftsToday')} value={todaysShifts.length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />

      <MetricCard label={t('liveNow')} value={filteredShifts.filter(shift => shift.status === 'live').length.toString()} icon={<Radio className="h-5 w-5 text-red-600 dark:text-red-400" />} />

      <MetricCard label={t('pendingRegistrations')} value={pendingRegistrations.length.toString()} icon={<Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />} />

      <MetricCard label={t('pendingSwaps')} value={pendingSwaps.length.toString()} icon={<ArrowLeftRight className="h-5 w-5 text-purple-600 dark:text-purple-400" />} />

    </div>



    <div className="grid gap-4 md:grid-cols-2">

      <Card><CardHeader><CardTitle>{t('actionQueue')}</CardTitle><CardDescription>{t('attentionRequired')}</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">

        <QuickAction href="/calendar" label={t('calendar')} icon={<Calendar className="h-5 w-5" />} />

        <QuickAction href="/live" label={t('liveMonitor')} icon={<Radio className="h-5 w-5" />} />

        <QuickAction href="/reports" label={t('reports')} icon={<FileText className="h-5 w-5" />} />

        <QuickAction href="/swaps" label={t('swaps')} icon={<ArrowLeftRight className="h-5 w-5" />} />

      </CardContent></Card>

    </div>



    <UpcomingShiftsList upcoming={upcoming} brands={brands} platforms={platforms} t={t} setSelectedShift={props.setSelectedShift} />

  </PageShell>

}

