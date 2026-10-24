'use client'

import { useState, type ReactNode } from 'react'
import { RefreshCw, Radio, Clock, ImageIcon, Users } from 'lucide-react'
import type { Shift, DashboardUpdate, Report, Brand, Platform, Campaign, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { LiveStreamPanel } from './LiveStreamPanel'
import { verifyLiveStreamLink } from '@/lib/utils/liveStreamLink'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { formatCurrency } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { getLiveStatusConfig } from './LiveMonitoringDashboard'

export function LiveOperationsConsole({ shift, updates, snapshotSummary, report, brands, platforms, campaigns, users, registrations, loading, reportLoadError, reportLoading, actions, snapshots, details, timeline, onRefresh, onStreamLinkSaved }: {
  shift: Shift; updates: DashboardUpdate[]; report: Report | null; brands: Brand[]; platforms: Platform[]; campaigns: Campaign[]; users: User[]; registrations: ShiftRegistration[]
  snapshotSummary?: { total: number; peakViewers: number | null; recent: DashboardUpdate[] }
  loading: boolean; reportLoadError?: boolean; reportLoading?: boolean; actions: ReactNode; snapshots: ReactNode; details: ReactNode; timeline: ReactNode; onRefresh: () => void; onStreamLinkSaved?: (shift: Shift) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'updates' | 'details' | 'timeline'>('updates')
  const recent = snapshotSummary?.recent ?? [...updates].sort((a, b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id)).slice(0, 4)
  const latest = recent[0]
  const liveStreamLink = verifyLiveStreamLink(shift.live_link)
  const name = (items: Array<{ id: string; name: string }>, id?: string) => items.find(item => item.id === id)?.name ?? '—'
  const duration = resolveShiftDateTime(shift.date, shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), shift.timezone)
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
    { label: t('peakViewers'), value: snapshotSummary ? snapshotSummary.peakViewers : updates.length ? Math.max(...updates.flatMap(update => typeof update.peak_viewers === 'number' ? [update.peak_viewers] : [])) : null },
    { label: t('ctr'), value: latest?.normalized_metrics?.ctr },
  ]
  const statusCfg = getLiveStatusConfig(shift.status)
  const isLive = shift.status === 'live'

  return (
    <div className="min-w-0 text-slate-900">
      <header className="border-b border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-sm sm:text-base font-semibold">
              <Radio className={`h-5 w-5 ${isLive ? 'text-red-600 animate-pulse' : 'text-slate-400'}`} />
              <span>{shift.title || name(brands, shift.brand_id)}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.badgeClass}`}>
                {isLive && <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />}
                {t(shift.status === 'live' ? 'liveStatus' : shift.status)}
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {shift.date} · {formatShiftTimeRange(shift)} · {duration?.valid ? duration.durationMinutes + ' ' + t('minuteShort') : '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button size="icon-sm" variant="outline" onClick={onRefresh} disabled={loading} title={t('refresh')}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <p>{name(brands, shift.brand_id)} · {name(platforms, shift.platform_id)} · {name(campaigns, shift.campaign_id)} · {shift.studio ?? '—'} · {shift.timezone ?? duration?.timezone ?? '—'}</p>
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span className="flex items-center gap-1 font-medium text-slate-700">
              <Users className="h-3 w-3 text-slate-400" /> Nhân sự:
            </span>
            <span>Host: <strong className="text-slate-900">{staffFor('host')}</strong></span>
            <span>·</span>
            <span>Support: <strong className="text-slate-900">{staffFor('support')}</strong></span>
            <span>·</span>
            <span>Tech: <strong className="text-slate-900">{staffFor('technical')}</strong></span>
          </div>
        </div>
      </header>

      <LiveStreamPanel key={shift.id + ':' + (shift.live_link ?? '')} shift={shift} onSaved={onStreamLinkSaved} />

      <section className="grid grid-cols-2 gap-2 border-b bg-white p-3 lg:grid-cols-6">
        {metrics.map(metric => (
          <div key={metric.label} className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[11px] font-medium text-slate-500">{metric.label}</p>
            <p className="mt-1 text-sm font-semibold">
              {typeof metric.value === 'number' && Number.isFinite(metric.value) ? display(metric.value, metric.currency) : '—'}
            </p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap border-b bg-white" role="tablist" aria-label={t('liveMonitor')}>
        {(['updates', 'details', 'timeline'] as const).map(key => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`px-4 py-3 text-xs font-semibold border-b-2 ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
            onClick={() => setTab(key)}
          >
            {key === 'updates' ? t('liveMonitor') : key === 'details' ? t('viewDetails') : 'Timeline'}
            {key === 'updates' && ' (' + (snapshotSummary?.total ?? updates.length) + ')'}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-3 bg-slate-50 p-3 xl:grid-cols-[210px_minmax(0,1fr)_250px]">
        <aside className="space-y-3">
          <section className="rounded-lg border bg-white p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">{t('shiftDetail')}</h3>
            <dl className="space-y-3 text-xs">
              {[
                [t('time'), formatShiftTimeRange(shift)],
                [t('platform'), name(platforms, shift.platform_id)],
                [t('studio'), shift.studio ?? '—'],
                [t('brand'), name(brands, shift.brand_id)],
                [t('campaign'), name(campaigns, shift.campaign_id)],
                [t('status'), t(shift.status === 'live' ? 'liveStatus' : shift.status)],
                [t('version'), String(shift.version ?? '—')],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="break-words text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border bg-white p-3 text-xs">
            <p className="flex items-center gap-2 text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              {latest?.time ? new Date(latest.time).toLocaleString() : t('updatesMissing')}
            </p>
            <p className="mt-2 text-slate-400">{shift.status_mode ?? '—'} / {shift.timezone ?? duration?.timezone ?? '—'}</p>
            {liveStreamLink && (
              <a href={liveStreamLink.href} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center break-all text-blue-600">
                {t('openLiveLink')}
              </a>
            )}
            {shift.product_notes && <p className="mt-3 whitespace-pre-wrap">{shift.product_notes}</p>}
            {latest?.screenshot_url && (
              <a href={latest.screenshot_url} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center gap-2 text-blue-600">
                <ImageIcon className="h-4 w-4" />{t('dashboardScreenshot')}
              </a>
            )}
          </section>
        </aside>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3" role="tabpanel">
          {tab === 'updates' ? snapshots : tab === 'details' ? details : timeline}
        </section>

        <aside className="space-y-3">
          <section className="rounded-lg border bg-white p-3">
            <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">{t('staffing')}</h3>
            {roles.map(role => (
              <div key={role} className="border-t py-2 text-xs">
                <p className="text-slate-500">{t(role)}</p>
                <p className="mt-1 font-medium">{staffFor(role)}</p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{'Timeline'}</h3>
            {recent.map(update => (
              <div key={update.id} className="border-t py-2 text-xs">
                <p className="text-slate-500">{new Date(update.time).toLocaleString()}</p>
                <p className="mt-1">{update.notes || t('dashboardScreenshot')}</p>
              </div>
            ))}
            {!updates.length && <p className="text-xs text-slate-500">{t('updatesMissing')}</p>}
          </section>

          <section className="rounded-lg border bg-white p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{t('reports')}</h3>
            <p className="text-xs text-slate-500">{reportLoading ? 'Đang tải báo cáo…'
                : reportLoadError
                ? 'Chưa tải được báo cáo · kiểm tra quyền truy cập'
                : report
                ? report.status === 'in_review'
                  ? t('inReview')
                  : t(report.status ?? (report.metrics_confirmed ? 'confirmed' : 'draft'))
                : t('noReports')}
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
