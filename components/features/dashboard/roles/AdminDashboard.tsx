import * as React from 'react'

import dynamic from 'next/dynamic'

import { addDays, format } from 'date-fns'

import { isStaffedRegistration } from '@/lib/services/dataService'

import { formatCurrency } from '@/lib/utils/currency'

import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'

import { Card, CardContent } from '@/components/ui/card'

import { ContentSkeleton } from '@/components/ui/content-skeleton'

import { PageShell } from '@/components/ui/archetypes'

import { PageHeader, PageHeaderContent } from '@/components/ui/headers'

import { OperationalStatusStrip } from '@/components/ui/operational-status'

import { deriveDataQualityAttention } from '@/lib/ui/operational-attention'

import { getAllIssues } from '@/lib/utils/dataQuality'

import { CommonProps, Filters, matchesDimensions, DashboardFilterControls, DashboardCustomDateRange, DashboardFilterPanel, UpcomingShiftsList } from '../shared/DashboardShared'



const DashboardCharts = dynamic(

  () => import('@/components/features/dashboard/DashboardCharts').then(mod => ({ default: mod.DashboardCharts })),

  { ssr: false, loading: () => <div className="grid gap-5 xl:grid-cols-2">{[0, 1].map(i => <Card key={i}><CardContent className="h-72"><div className="space-y-3 pt-5"><ContentSkeleton /></div></CardContent></Card>)}</div> },

)



const dateValue = (date: Date) => format(date, 'yyyy-MM-dd')



export function AdminDashboard(props: CommonProps) {

  const { shifts, reports, brands, platforms, campaigns, users, registrations, filters, setFilters, showFilters, setShowFilters, t, setPreset } = props

  

  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end && matchesDimensions(shift, filters, registrations))

  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  const filteredReports = reports.filter(report => shiftIds.has(report.shift_id) && report.status === 'confirmed')

  

  const days = Math.max(1, Math.round((new Date(`${filters.end}T00:00:00`).getTime() - new Date(`${filters.start}T00:00:00`).getTime()) / 86400000) + 1)

  const previousEnd = dateValue(addDays(new Date(`${filters.start}T00:00:00`), -1))

  const previousStart = dateValue(addDays(new Date(`${previousEnd}T00:00:00`), -(days - 1)))

  const previousIds = new Set(shifts.filter(shift => shift.date >= previousStart && shift.date <= previousEnd && matchesDimensions(shift, filters, registrations)).map(shift => shift.id))

  const previousReports = reports.filter(report => previousIds.has(report.shift_id) && report.status === 'confirmed')

  

  const scopedReports = reports.filter(report => shiftIds.has(report.shift_id))

  const scopedRegistrations = registrations.filter(reg => shiftIds.has(reg.shift_id))

  const dqIssues = getAllIssues({ shifts: filteredShifts, reports: scopedReports, registrations: scopedRegistrations })

  const errorCount = dqIssues.filter(i => i.severity === 'error').length

  const warningCount = dqIssues.filter(i => i.severity === 'warning').length

  const infoCount = dqIssues.filter(i => i.severity === 'info').length

  const dqAttention = deriveDataQualityAttention(errorCount, warningCount, infoCount)

  

  const revenue = filteredReports.reduce((sum, report) => sum + (report.revenue ?? 0), 0)

  const previousRevenue = previousReports.reduce((sum, report) => sum + (report.revenue ?? 0), 0)

  const delta = previousRevenue ? `${(((revenue - previousRevenue) / previousRevenue) * 100).toFixed(1)}%` : '—'

  const today = getCurrentBusinessDate()

  const trend = Object.entries(filteredReports.reduce<Record<string, { revenue: number; orders: number }>>((result, report) => {

    const shift = shifts.find(candidate => candidate.id === report.shift_id)

    if (shift) { (result[shift.date] ??= { revenue: 0, orders: 0 }).revenue += report.revenue ?? 0; result[shift.date].orders += report.orders ?? 0 }

    return result

  }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, ...values }))

  

  const statusSummary = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'].map(status => ({

    status: status === 'live' ? t('liveStatus') : t(status as 'scheduled' | 'preparing' | 'paused' | 'completed' | 'cancelled'),

    shifts: filteredShifts.filter(shift => shift.status === status).length,

  }))

  

  const upcoming = filteredShifts.filter(shift => shift.date >= today && shift.status === 'scheduled').sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).slice(0, 5)

  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))



  // Derived metric values (no new data, reuse existing authoritative derivations)

  const staffCount = new Set([

    ...filteredShifts.flatMap(shift => [shift.host_id, shift.support_id, shift.technical_id]).filter((id): id is string => Boolean(id)),

    ...registrations.filter(registration => isStaffedRegistration(registration) && shiftIds.has(registration.shift_id)).map(registration => registration.user_id),

  ]).size

  const campaignCount = new Set(filteredShifts.map(shift => shift.campaign_id).filter(Boolean)).size

  const liveCount = filteredShifts.filter(shift => shift.status === 'live').length



  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">

    {/* A. Page Header */}

    <PageHeader className="flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">

      <PageHeaderContent>

        <h1 className="text-2xl font-semibold truncate">{t('dashboardTitle')}</h1>

        <p className="text-[13px] text-muted-foreground">{t('systemOperationsCommandCenter')}</p>

      </PageHeaderContent>

      <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />

    </PageHeader>



    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />

    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} initialFilters={() => ({} as Filters)} />}



    {/* B. Authoritative Attention — Data Quality only (omit when clear) */}

    {dqAttention.length > 0 && (

      <OperationalStatusStrip items={dqAttention} className="gap-2" compact />

    )}



    {/* C. Live / Upcoming Operations — primary operational content */}

    <UpcomingShiftsList upcoming={upcoming} brands={brands} platforms={platforms} t={t} setSelectedShift={props.setSelectedShift} />



    {/* D. Operational Metric Strip — single compact row, text-first, 4 values max */}

    <AdminMetricStrip

      liveCount={liveCount}

      staffCount={staffCount}

      campaignCount={campaignCount}

      confirmedRevenue={formatCurrency(revenue)}

      revenueDelta={delta}

      t={t}

    />



    {/* E. Charts / deeper analytics — secondary, below operational content */}

    <DashboardCharts

      trend={trend}

      statusSummary={statusSummary}

      revenueLabel={t('revenue')}

      ordersLabel={t('orders')}

      revenueTrendLabel={t('revenueTrend')}

      shiftStatusSummaryLabel={t('shiftStatusSummary')}

      noDataLabel={t('noData')}

      notEnoughTrendDataLabel={t('notEnoughTrendData')}

    />

  </PageShell>

}



function AdminMetricStrip({

  liveCount,

  staffCount,

  campaignCount,

  confirmedRevenue,

  revenueDelta,

  t,

}: {

  liveCount: number

  staffCount: number

  campaignCount: number

  confirmedRevenue: string

  revenueDelta: string

  t: (key: string) => string

}) {

  const items = [

    { label: t('liveInProgress'), value: liveCount.toString() },

    { label: t('staffInScope'), value: staffCount.toString() },

    { label: t('campaigns'), value: campaignCount.toString() },

    { label: t('confirmedRevenue'), value: confirmedRevenue, note: revenueDelta !== '—' ? revenueDelta : undefined },

  ]

  return (

    <div className="flex flex-wrap items-stretch divide-x divide-border border-y bg-transparent">

      {items.map((item, i) => (

        <div key={i} className="flex min-w-[120px] flex-1 flex-col justify-center px-4 py-2">

          <span className="text-xs text-muted-foreground">{item.label}</span>

          <span className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</span>

          {item.note && <span className="text-xs text-muted-foreground">{item.note}</span>}

        </div>

      ))}

    </div>

  )

}

