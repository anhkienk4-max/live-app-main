'use client'

import { useState, type ReactNode } from 'react'
import { RefreshCw, Radio, Clock, ImageIcon } from 'lucide-react'
import type { Shift, DashboardUpdate, Report, Brand, Platform, Campaign, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { formatCurrency } from '@/lib/utils/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function LiveOperationsConsole({ shift, updates, report, brands, platforms, campaigns, users, registrations, loading, actions, snapshots, details, timeline, onRefresh }: {
  shift: Shift; updates: DashboardUpdate[]; report: Report | null; brands: Brand[]; platforms: Platform[]; campaigns: Campaign[]; users: User[]; registrations: ShiftRegistration[]
  loading: boolean; actions: ReactNode; snapshots: ReactNode; details: ReactNode; timeline: ReactNode; onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'updates' | 'details' | 'timeline'>('updates')
  const latest = [...updates].sort((a,b) => b.time.localeCompare(a.time))[0]
  const name = (items: Array<{ id: string; name: string }>, id?: string) => items.find(item => item.id === id)?.name ?? '—'
  const duration = resolveShiftDateTime(shift.date, shift.start_time.slice(0,5), shift.end_time.slice(0,5), shift.timezone)
  const roles: OperationalRole[] = ['host', 'support', 'technical']
  const staffFor = (role: OperationalRole) => {
    const assigned = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    const ids = new Set([...registrations.filter(r => r.shift_id === shift.id && r.operational_role === role && isStaffedRegistration(r)).map(r => r.user_id), ...(assigned ? [assigned] : [])])
    return [...ids].map(id => users.find(user => user.id === id)?.full_name ?? '—').join(', ') || '—'
  }
  const display = (value: number | null | undefined, currency = false) => value == null ? '—' : currency ? formatCurrency(value) : value.toLocaleString()
  const metrics = [
    { label: t('revenue'), value: latest?.normalized_metrics?.revenue ?? latest?.revenue, currency: true },
    { label: t('gmv'), value: latest?.normalized_metrics?.gmv ?? latest?.gmv, currency: true },
    { label: t('orders'), value: latest?.normalized_metrics?.orders ?? latest?.orders },
    { label: t('currentViewers'), value: latest?.normalized_metrics?.current_viewers ?? latest?.current_viewers },
    { label: t('peakViewers'), value: updates.length ? Math.max(...updates.flatMap(update => typeof update.peak_viewers === 'number' ? [update.peak_viewers] : [])) : null },
    { label: t('ctr'), value: latest?.normalized_metrics?.ctr },
  ]
  return <div className="min-w-0 text-slate-900">
    <header className="border-b border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Radio className="h-5 w-5 text-blue-600" />{shift.title || name(brands, shift.brand_id)}<Badge variant="secondary">{t(shift.status === 'live' ? 'liveStatus' : shift.status)}</Badge></h2><p className="mt-1 text-xs text-slate-500">{shift.date} · {formatShiftTimeRange(shift)} · {duration?.valid ? duration.durationMinutes + ' ' + t('minuteShort') : '—'}</p></div><div className="flex flex-wrap gap-2">{actions}<Button size="icon-sm" variant="outline" onClick={onRefresh} disabled={loading} title={t('refresh')}><RefreshCw className="h-4 w-4" /></Button></div></div>
      <p className="mt-2 text-xs text-slate-500">{name(brands, shift.brand_id)} · {name(platforms, shift.platform_id)} · {name(campaigns, shift.campaign_id)} · {shift.studio ?? '—'} · {shift.timezone ?? duration?.timezone ?? '—'}</p>
    </header>
    <section className="grid grid-cols-2 gap-2 border-b bg-white p-3 lg:grid-cols-6">{metrics.map(metric => <div key={metric.label} className="rounded-md border border-slate-200 bg-slate-50 p-2.5"><p className="text-[11px] font-medium text-slate-500">{metric.label}</p><p className="mt-1 text-sm font-semibold">{typeof metric.value === 'number' && Number.isFinite(metric.value) ? display(metric.value, metric.currency) : '—'}</p></div>)}</section>
    <div className="flex flex-wrap border-b bg-white" role="tablist" aria-label={t('liveMonitor')}>{(['updates','details','timeline'] as const).map(key => <button key={key} role="tab" aria-selected={tab === key} className={`px-4 py-3 text-xs font-semibold border-b-2 ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`} onClick={() => setTab(key)}>{key === 'updates' ? t('liveMonitor') : key === 'details' ? t('viewDetails') : 'Timeline'}{key === 'updates' && ' (' + updates.length + ')'}</button>)}</div>
    <div className="grid items-start gap-3 bg-slate-50 p-3 xl:grid-cols-[210px_minmax(0,1fr)_250px]">
      <aside className="space-y-3">
        <section className="rounded-lg border bg-white p-3"><h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">{t('shiftDetail')}</h3><dl className="space-y-3 text-xs">{[
          [t('time'), formatShiftTimeRange(shift)],
          [t('platform'), name(platforms, shift.platform_id)],
          [t('studio'), shift.studio ?? '\u2014'],
          [t('brand'), name(brands, shift.brand_id)],
          [t('campaign'), name(campaigns, shift.campaign_id)],
          [t('status'), t(shift.status === 'live' ? 'liveStatus' : shift.status)],
          [t('version'), String(shift.version ?? '\u2014')],
        ].map(([label,value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="break-words text-right font-medium">{value}</dd></div>)}</dl></section>
        <section className="rounded-lg border bg-white p-3 text-xs"><p className="flex items-center gap-2 text-slate-500"><Clock className="h-3.5 w-3.5" />{latest?.time ? new Date(latest.time).toLocaleString() : t('updatesMissing')}</p><p className="mt-2 text-slate-400">{shift.status_mode ?? '\u2014'} / {shift.timezone ?? duration?.timezone ?? '\u2014'}</p>{shift.live_link && <a href={shift.live_link} target="_blank" rel="noopener noreferrer" className="mt-3 block break-all text-blue-600">{t('openLiveLink')}</a>}{shift.product_notes && <p className="mt-3 whitespace-pre-wrap">{shift.product_notes}</p>}{latest?.screenshot_url && <a href={latest.screenshot_url} target="_blank" rel="noopener noreferrer" className="mt-3 flex gap-2 text-blue-600"><ImageIcon className="h-4 w-4" />{t('dashboardScreenshot')}</a>}</section>
      </aside>
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3" role="tabpanel">{tab === 'updates' ? snapshots : tab === 'details' ? details : timeline}</section>
      <aside className="space-y-3"><section className="rounded-lg border bg-white p-3"><h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">{t('staffing')}</h3>{roles.map(role => <div key={role} className="border-t py-2 text-xs"><p className="text-slate-500">{t(role)}</p><p className="mt-1 font-medium">{staffFor(role)}</p></div>)}</section>
        <section className="rounded-lg border bg-white p-3"><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{'Timeline'}</h3>{[...updates].sort((a,b) => b.time.localeCompare(a.time)).slice(0,4).map(update => <div key={update.id} className="border-t py-2 text-xs"><p className="text-slate-500">{new Date(update.time).toLocaleString()}</p><p className="mt-1">{update.notes || t('dashboardScreenshot')}</p></div>)}{!updates.length && <p className="text-xs text-slate-500">{t('updatesMissing')}</p>}</section>
        <section className="rounded-lg border bg-white p-3"><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('reports')}</h3><p className="text-xs text-slate-500">{report ? report.status === 'in_review' ? t('inReview') : t(report.status ?? (report.metrics_confirmed ? 'confirmed' : 'draft')) : t('noReports')}</p></section>
      </aside>
    </div>
  </div>
}
