import React from 'react'
import { OpsMobileHome } from '../OpsMobileHome'
import {
  Radio, Users, Calendar, FileText, ShieldAlert, AlertTriangle,
  Clock, CheckCircle, Eye, TrendingUp, TrendingDown, ArrowUpRight,
} from 'lucide-react'
import type { DashboardRecentItem } from '@/lib/ui/dashboard-recent-items'
import { BrandLogo } from '@/components/features/brands/BrandLogo'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Shift } from '@/lib/types/database.types'

// View-Model

export type LiveHealthStatus = 'good' | 'warning' | 'critical' | 'unknown'
export type StatusColor = 'green' | 'orange' | 'red' | 'slate'

export interface LiveShiftItem {
  brand: string
  brandId: string
  brandLogoUrl?: string
  platform: string
  duration: string | null
  viewers: string | null
  health: LiveHealthStatus
}

export interface OperationRowItem {
  brand: string
  brandId: string
  brandLogoUrl?: string
  shiftTime: string
  platform: string
  status: string
  statusColor: StatusColor
  metrics: string
  manager: string
}

export interface AttentionItem {
  key: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  context: string
  time: string
  action: string
  href?: string
}

export interface ApplicationOverviewMetric {
  key: string
  label: string
  value: number | null
  href: string
}

export interface DashboardLinkedItem {
  id: string
  title: string
  description: string
  href: string
  brandId?: string
  brandLogoUrl?: string
}

export interface UpcomingShiftItem extends DashboardLinkedItem {
  shift?: Shift
  brandName?: string
  platformName?: string
  timeWindow?: string
  date?: string
  formattedDate?: string
  isToday?: boolean
  hostName?: string
  hostAvatarUrl?: string
  supportName?: string
  supportAvatarUrl?: string
  isMissingHost?: boolean
  isMissingSupport?: boolean
  isMissingStaff?: boolean
  shortageLabel?: string
  statusLabel?: string
}

export interface PerformanceData {
  viewers: string
  viewersChange: string
  viewersChangePositive: boolean
  revenue: string
  revenueChange: string
  revenueChangePositive: boolean
  conversionRate: string
  conversionChange: string
  conversionChangePositive: boolean
}

export interface ActivityLogEntry {
  iconName: 'check' | 'alert' | 'user' | 'file'
  iconBg: string
  title: string
  user: string
  time: string
}

export interface AdminDashboardViewModel {
  liveCount: number
  todaysShiftsCount: number
  missingStaffCount: number | null
  pendingCount: number | null
  dqAttention: AttentionItem[]
  liveShifts: LiveShiftItem[]
  todaysOperations: OperationRowItem[]
  performance: PerformanceData | null
  activityLog: ActivityLogEntry[] | null
  t: (key: string) => string
  applicationOverview: ApplicationOverviewMetric[]
  recentItems: DashboardRecentItem[]
  upcomingShifts: (UpcomingShiftItem | DashboardLinkedItem)[]
  latestReports: DashboardLinkedItem[]
  latestBrands: DashboardLinkedItem[]
  showUpcomingShifts: boolean
  showLatestReports: boolean
  showLatestBrands: boolean
  latestReportsUnavailable: boolean
  latestBrandsUnavailable: boolean
  dashboardFeatureLinks?: React.ReactNode
  userName?: string
  onSelectShift?: (shift: Shift) => void
}

// Sub-components

interface KpiCardProps { icon: React.ReactNode; iconBg: string; title: string; value: string; subtitle: string; href?: string }
function KpiCard({ icon, iconBg, title, value, subtitle, href }: KpiCardProps) {
  const card = (
    <div className={`bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex flex-col justify-center ${href ? 'hover:border-amber-400 hover:shadow-md transition-all cursor-pointer' : ''}`}>
      <div className="flex items-center gap-4 mb-3">
        <div className={`w-[48px] h-[48px] rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <div className="flex flex-col justify-center">
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{title}</span>
          <span className="text-[32px] font-bold text-slate-900 leading-[1] tracking-tight">{value}</span>
        </div>
      </div>
      <span className="text-[13px] text-slate-500 font-medium">{subtitle}</span>
    </div>
  )
  if (href) {
    return (
      <a href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-[12px]">
        {card}
      </a>
    )
  }
  return card
}

function OverviewMetricCard({ metric }: { metric: ApplicationOverviewMetric }) {
  return <a href={metric.href} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
    <span className="block text-xs font-medium text-slate-500">{metric.label}</span>
    <span className="mt-2 block text-2xl font-semibold text-slate-900">{metric.value === null ? '—' : metric.value.toLocaleString()}</span>
  </a>
}

interface AttentionRowProps { severity: AttentionItem['severity']; title: string; context: string; time: string; action: string; href?: string }
function AttentionRow({ severity, title, context, time, action, href }: AttentionRowProps) {
  const map: Record<AttentionItem['severity'], { icon: React.ReactNode; bg: string; border: string }> = {
    critical: { icon: <ShieldAlert className="w-5 h-5 text-red-600" />, bg: 'bg-red-50', border: 'border-red-100' },
    high:     { icon: <AlertTriangle className="w-5 h-5 text-orange-500" />, bg: 'bg-orange-50', border: 'border-orange-100' },
    medium:   { icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50', border: 'border-amber-100' },
    low:      { icon: <CheckCircle className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50', border: 'border-blue-100' },
  }
  const s = map[severity]
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 rounded-lg border hover:border-slate-300 hover:bg-slate-50 transition-colors ${severity === 'critical' ? 'bg-red-50/30 border-red-100' : 'border-transparent'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${s.bg} ${s.border}`}>{s.icon}</div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-slate-900 leading-snug mb-0.5">{title}</span>
          <span className="text-[13px] text-slate-600 leading-snug">{context}</span>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <span className={`text-[12px] font-bold whitespace-nowrap ${severity === 'critical' ? 'text-red-500' : 'text-slate-500'}`}>{time}</span>
        <a href={href ?? '/data-quality'} className={`inline-flex min-h-11 items-center px-4 py-1.5 border hover:bg-slate-50 text-[12px] font-bold rounded-md shadow-sm shrink-0 transition-colors ${severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white border-slate-300 text-slate-700'}`}>{action}</a>
      </div>
    </div>
  )
}

interface LiveItemProps { brand: string; brandId: string; brandLogoUrl?: string; platform: string; duration: string | null; viewers: string | null; health: LiveHealthStatus }
function LiveItem({ brand, brandId, brandLogoUrl, platform, duration, viewers, health }: LiveItemProps) {
  const dot: Record<LiveHealthStatus, string> = {
    good:    'bg-emerald-500 border-emerald-600',
    warning: 'bg-amber-500 border-amber-600',
    critical:'bg-red-500 border-red-600',
    unknown: 'bg-slate-400 border-slate-500',
  }
  return (
    <div className="flex items-center justify-between p-3.5 border border-slate-200 rounded-lg bg-white shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <BrandLogo brandId={brandId} brandName={brand} logoUrl={brandLogoUrl} size={48} className="shadow-inner" />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-slate-900">{brand}</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase">{platform}</span>
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold">
            <span className="text-red-600 flex items-center gap-1.5 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span> LIVE {duration ?? ''}
            </span>
            <span className="text-slate-600 flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-slate-400" /> {viewers ?? '—'}</span>
          </div>
        </div>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full shadow-sm border ${dot[health]}`} title={health}></div>
    </div>
  )
}

interface OperationRowProps { brand: string; brandId: string; brandLogoUrl?: string; shiftTime: string; platform: string; status: string; statusColor: StatusColor; metrics: string; manager: string }
function OperationRowItem({ brand, brandId, brandLogoUrl, shiftTime, platform, status, statusColor, metrics, manager }: OperationRowProps) {
  const pill: Record<StatusColor, string> = {
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:    'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-amber-50 text-amber-700 border-amber-200',
    slate:  'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-5 py-3.5 text-[13px] font-bold text-slate-900 whitespace-nowrap"><span className="inline-flex items-center gap-2"><BrandLogo brandId={brandId} brandName={brand} logoUrl={brandLogoUrl} size={24} className="rounded" />{brand}</span></td>
      <td className="px-5 py-3.5 text-[13px] font-medium text-slate-700 whitespace-nowrap">{shiftTime}</td>
      <td className="px-5 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">{platform}</td>
      <td className="px-5 py-3.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-md border ${pill[statusColor]}`}>
          {statusColor === 'red' && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse mr-1.5"></span>}
          {status}
        </span>
      </td>
      <td className="px-5 py-3.5 text-[13px] font-bold text-slate-900 whitespace-nowrap">{metrics}</td>
      <td className="px-5 py-3.5 text-[13px] font-medium text-slate-700">{manager}</td>
    </tr>
  )
}

interface PerfMetricProps { title: string; value: string; change: string; positive: boolean; icon: React.ReactNode }
function PerfMetric({ title, value, change, positive, icon }: PerfMetricProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[13px] font-semibold text-slate-500 mb-1">{title}</span>
      <span className="text-[26px] font-bold text-slate-900 tracking-tight leading-none mb-2">{value}</span>
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        {icon}
        <span className={positive ? 'text-emerald-600' : 'text-red-500'}>{change}</span>
        <span className="font-medium text-slate-400">vs hôm qua</span>
      </div>
    </div>
  )
}

interface ActLogRowProps { iconName: ActivityLogEntry['iconName']; iconBg: string; title: string; user: string; time: string }
function ActLogRow({ iconName, iconBg, title, user, time }: ActLogRowProps) {
  const icons: Record<ActivityLogEntry['iconName'], React.ReactNode> = {
    check: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    alert: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    user:  <Users className="w-4 h-4 text-blue-500" />,
    file:  <FileText className="w-4 h-4 text-purple-500" />,
  }
  return (
    <div className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors rounded-lg">
      <div className="flex items-start gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-slate-100 ${iconBg} mt-0.5 shadow-sm`}>{icons[iconName]}</div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-slate-900 leading-tight">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-indigo-600">{user}</span>
            <span className="text-[12px] text-slate-300">·</span>
            <span className="text-[12px] text-slate-500 font-medium">{time}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Upcoming Shifts Rich Operational Cards (G1.4)
function UpcomingShiftsSection({
  title,
  href,
  items,
  empty,
  t,
  onSelectShift,
}: {
  title: string
  href: string
  items: (UpcomingShiftItem | DashboardLinkedItem)[]
  empty: string
  t: (key: string) => string
  onSelectShift?: (shift: Shift) => void
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col" aria-label={title}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-blue-600" aria-hidden="true" />
          <h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {items.length}
            </span>
          )}
        </div>
        <a
          href={href}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {t('viewAll')} <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </header>

      <div className="p-3 space-y-2.5 flex-1">
        {items.length ? (
          items.slice(0, 5).map(item => {
            const shiftItem = item as UpcomingShiftItem
            const shift = shiftItem.shift
            const brandName = shiftItem.brandName || item.title.split('·')[0]?.trim() || 'Brand'
            const brandId = item.brandId || shift?.brand_id || ''
            const platformName = shiftItem.platformName || item.title.split('·')[1]?.trim() || 'Livestream'
            const platformLower = platformName.toLowerCase()
            const isTikTok = platformLower.includes('tiktok')
            const isShopee = platformLower.includes('shopee')
            const platformBadgeClass = isTikTok
              ? 'bg-slate-900 text-cyan-300 border-slate-800'
              : isShopee
              ? 'bg-orange-50 text-orange-700 border-orange-200'
              : 'bg-slate-100 text-slate-700 border-slate-200'

            const isMissingStaff = shiftItem.isMissingStaff ?? (!shift?.host_id || !shift?.support_id)
            const shortageLabel = shiftItem.shortageLabel || (
              !shift?.host_id && !shift?.support_id
                ? 'Thiếu Host & Trợ'
                : !shift?.host_id
                ? 'Thiếu Host'
                : !shift?.support_id
                ? 'Thiếu Trợ'
                : 'Đủ nhân sự'
            )

            const formattedDate = shiftItem.formattedDate || (shiftItem.isToday ? 'Hôm nay' : shift?.date || '')
            const timeWindow = shiftItem.timeWindow || (shift ? `${shift.start_time} – ${shift.end_time}` : item.description)

            const handleClick = () => {
              if (shift && onSelectShift) {
                onSelectShift(shift)
              } else if (item.href) {
                window.location.href = item.href
              }
            }

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleClick()
                  }
                }}
                className="group relative flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xs transition-all hover:border-blue-400 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {/* Header: Brand Logo + Brand Name + Platform Badge + Shortage Indicator */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BrandLogo
                      brandId={brandId}
                      brandName={brandName}
                      logoUrl={shiftItem.brandLogoUrl}
                      size={32}
                      className="rounded-md shadow-xs shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {brandName}
                      </h3>
                      <span className={`inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider border ${platformBadgeClass}`}>
                        {platformName}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isMissingStaff ? (
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                        shiftItem.isMissingHost ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        {shortageLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                        <CheckCircle className="size-3" aria-hidden="true" />
                        Đủ nhân sự
                      </span>
                    )}
                  </div>
                </div>

                {/* Date & Time Window */}
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
                  <Clock className="size-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className={shiftItem.isToday ? 'text-blue-700' : 'text-slate-800'}>
                      {formattedDate}
                    </strong>
                    {' · '}
                    {timeWindow}
                  </span>
                </div>

                {/* Staffing: Host & Support Avatars & Names */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
                  {/* Host Slot */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                      Host:
                    </span>
                    {shiftItem.hostName ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar size="sm" className="size-5 shrink-0 border border-slate-200">
                          {shiftItem.hostAvatarUrl && <AvatarImage src={shiftItem.hostAvatarUrl} alt={shiftItem.hostName} />}
                          <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700 font-bold">
                            {shiftItem.hostName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-xs font-medium text-slate-800" title={shiftItem.hostName}>
                          {shiftItem.hostName}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 border border-red-100">
                        Chưa phân công
                      </span>
                    )}
                  </div>

                  {/* Support Slot */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                      Trợ:
                    </span>
                    {shiftItem.supportName ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar size="sm" className="size-5 shrink-0 border border-slate-200">
                          {shiftItem.supportAvatarUrl && <AvatarImage src={shiftItem.supportAvatarUrl} alt={shiftItem.supportName} />}
                          <AvatarFallback className="text-[10px] bg-purple-100 text-purple-700 font-bold">
                            {shiftItem.supportName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-xs font-medium text-slate-800" title={shiftItem.supportName}>
                          {shiftItem.supportName}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-100">
                        Chưa phân công
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="p-6 text-center text-sm text-slate-500">
            <p>{empty}</p>
          </div>
        )}
      </div>
    </section>
  )
}

// Main export

export function AdminDashboardView({
  liveCount, todaysShiftsCount, missingStaffCount, pendingCount,
  dqAttention, liveShifts, todaysOperations, performance, activityLog, userName, t, applicationOverview, recentItems,
  upcomingShifts, latestReports, latestBrands, showUpcomingShifts, showLatestReports, showLatestBrands,
  latestReportsUnavailable, latestBrandsUnavailable, dashboardFeatureLinks, onSelectShift,
}: AdminDashboardViewModel) {
  const currentShift = todaysOperations[0]
  const mobileAttention = [
    ...(pendingCount !== null && pendingCount > 0 ? [{
      key: 'pending-registration', title: pendingCount + ' đăng ký ca chờ xử lý', description: 'Mở danh sách đăng ký để xem xét', href: '/staffing?tab=registration', level: 'warning' as const,
    }] : []),
    ...dqAttention.map(item => ({
      key: item.key,
      title: item.title,
      description: item.context,
      href: item.href ?? '/data-quality',
      level: item.severity === 'critical' ? 'critical' as const : 'warning' as const,
    })),
  ]
  return (
    <>
    <OpsMobileHome
      role="admin" userName={userName} shiftCount={todaysShiftsCount}
      liveCount={liveShifts.length} pendingCount={pendingCount} attention={mobileAttention}
      overview={{ title: t('appWideOverview'), subtitle: t('appWideOverviewSubtitle'), metrics: applicationOverview }}
      summaries={[
        ...(showUpcomingShifts ? [{ key: 'upcoming', title: t('upcomingShifts'), href: '/calendar?calendar_view=list', items: upcomingShifts, empty: t('noUpcomingShifts') }] : []),
        ...(showLatestReports ? [{ key: 'reports', title: t('latestReports'), href: '/reports', items: latestReports, empty: t('noLatestReports'), unavailable: latestReportsUnavailable ? t('dashboardDataUnavailable') : null }] : []),
        ...(showLatestBrands ? [{ key: 'brands', title: t('latestBrands'), href: '/brands', items: latestBrands, empty: t('noLatestBrands'), unavailable: latestBrandsUnavailable ? t('dashboardDataUnavailable') : null }] : []),
      ]}
      shift={currentShift ? { key: currentShift.brand + currentShift.shiftTime, brand: currentShift.brand, platform: currentShift.platform, time: currentShift.shiftTime, status: currentShift.status } : null}
    />
    <div className="hidden min-w-0 flex-col gap-6 p-4 md:flex sm:p-8">
      <div className="flex flex-col gap-1 mb-1">
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight">{t('dashboardTitle')}</h1>
        <p className="text-[14px] text-slate-500 font-medium">{t('applicationDashboardSubtitle')}</p>
      </div>
      {dashboardFeatureLinks}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        <KpiCard icon={<Radio className="w-5 h-5 text-red-600" />} iconBg="bg-red-50" title={t('liveNow')} value={liveCount.toString()} subtitle={t('activeSessions')} href="/live" />
        <KpiCard icon={<Calendar className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-50" title={t('shiftsToday')} value={todaysShiftsCount.toString()} subtitle={t('scheduledToday')} href="/calendar?calendar_view=list&calendar_time=today" />
        <KpiCard icon={<Users className="w-5 h-5 text-amber-500" />} iconBg="bg-amber-50" title={t('staffingGap')} value={missingStaffCount !== null ? missingStaffCount.toString() : '—'} subtitle={t('needsResolution')} href="/staffing?gap=missing" />
        <KpiCard icon={<FileText className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-50" title={t('pendingRegistrations')} value={pendingCount !== null ? pendingCount.toString() : '—'} subtitle={t('needsReview')} href="/staffing?tab=registration" />
      </div>

      <section aria-labelledby="app-wide-overview-title" className="space-y-3">
        <div>
          <h2 id="app-wide-overview-title" className="text-base font-bold text-slate-900">{t('appWideOverview')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('appWideOverviewSubtitle')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {applicationOverview.map(metric => <OverviewMetricCard key={metric.key} metric={metric} />)}
        </div>
      </section>

      {(showUpcomingShifts || showLatestReports || showLatestBrands) && <section aria-label={t('dashboardOperationalSummaries')} className="grid min-w-0 gap-3 lg:grid-cols-3">
        {showUpcomingShifts && (
          <UpcomingShiftsSection
            title={t('upcomingShifts')}
            href="/calendar?calendar_view=list"
            items={upcomingShifts}
            empty={t('noUpcomingShifts')}
            t={t}
            onSelectShift={onSelectShift}
          />
        )}
        {showLatestReports && <DashboardLinkedList title={t('latestReports')} href="/reports" items={latestReports} empty={t('noLatestReports')} unavailable={latestReportsUnavailable ? t('dashboardDataUnavailable') : null} t={t} />}
        {showLatestBrands && <DashboardLinkedList title={t('latestBrands')} href="/brands" items={latestBrands} empty={t('noLatestBrands')} unavailable={latestBrandsUnavailable ? t('dashboardDataUnavailable') : null} t={t} />}
      </section>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-8 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">{t('attentionRequired')}</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-2">
            <div className="flex flex-col divide-y divide-slate-50 flex-1 justify-center">
              {dqAttention.length > 0 ? dqAttention.slice(0, 6).map((item) => (
                <AttentionRow key={item.key} severity={item.severity} title={item.title} context={item.context} time={item.time} action={item.action} href={item.href} />
              )) : (
                <div className="text-center py-8 text-sm text-slate-500">Không có mục cần chú ý</div>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0 xl:col-span-4 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">{t('liveNow')}</h2>
          <div className="flex flex-col gap-3 flex-1">
            {liveShifts.length > 0 ? liveShifts.slice(0, 6).map((item, i) => (
              <LiveItem key={i} brand={item.brand} brandId={item.brandId} brandLogoUrl={item.brandLogoUrl} platform={item.platform} duration={item.duration} viewers={item.viewers} health={item.health} />
            )) : (
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 text-center text-sm text-slate-500 flex-1 flex items-center justify-center">Không có ca đang live</div>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby="dashboard-latest-items-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="dashboard-latest-items-title" className="text-[16px] font-bold text-slate-900">{t('latestDashboardItems')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('latestDashboardItemsSubtitle')}</p>
          </div>
          <a href="/audit" className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            {t('viewAll')} <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {recentItems.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {recentItems.slice(0, 5).map(item => (
                <li key={`${item.kind}:${item.id}`}>
                  <a href={item.href} className="flex min-h-[64px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{item.description}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
                      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-700">{t('openFeature')} <ArrowUpRight className="size-3.5" aria-hidden="true" /></span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('noLatestDashboardItems')}</p>
          )}
        </div>
      </section>

      <div className="flex flex-col">
        <h2 className="text-[16px] font-bold text-slate-900 mb-3">{t('todaysOperationsTitle')}</h2>
        <div role="region" aria-label={t('todaysOperationsTitle')} tabIndex={0} className="bg-white rounded-[12px] border border-slate-200 shadow-sm min-w-0 overflow-x-auto">
          {todaysOperations.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Brand</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Thời gian</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Platform</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chỉ số</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quản lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {todaysOperations.slice(0, 6).map((op, i) => (
                  <OperationRowItem key={i} brand={op.brand} brandId={op.brandId} brandLogoUrl={op.brandLogoUrl} shiftTime={op.shiftTime} platform={op.platform} status={op.status} statusColor={op.statusColor} metrics={op.metrics} manager={op.manager} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">{t('noTodayOperations')}</div>
          )}
        </div>
      </div>

      {(performance !== null || activityLog !== null) && <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6 pb-6">
        {performance !== null && <div className={`min-w-0 flex flex-col ${activityLog !== null ? 'xl:col-span-5' : 'xl:col-span-12'}`}>
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">{t('performanceTitle')}</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <PerfMetric title={t('viewers')} value={performance.viewers} change={performance.viewersChange} positive={performance.viewersChangePositive} icon={performance.viewersChangePositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
              <PerfMetric title={t('revenue')} value={performance.revenue} change={performance.revenueChange} positive={performance.revenueChangePositive} icon={performance.revenueChangePositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
              <PerfMetric title={t('conversion')} value={performance.conversionRate} change={performance.conversionChange} positive={performance.conversionChangePositive} icon={performance.conversionChangePositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
            </div>
          </div>
        </div>}
        {activityLog !== null && <div className={`min-w-0 flex flex-col ${performance !== null ? 'xl:col-span-7' : 'xl:col-span-12'}`}>
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">{t('activityLogTitle')}</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-2">
            <div className="flex flex-col divide-y divide-slate-50 flex-1 justify-center">
              {activityLog.length > 0 ? activityLog.slice(0, 6).map((log, i) => (
                <ActLogRow key={i} iconName={log.iconName} iconBg={log.iconBg} title={log.title} user={log.user} time={log.time} />
              )) : (
                <div className="text-center py-8 text-sm text-slate-500">{t('noRecentActivity')}</div>
              )}
            </div>
          </div>
        </div>}
      </div>}
    <nav aria-label={t('viewAll')} className="flex flex-wrap gap-4 text-sm"><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/calendar">{t('dashboardAllShifts')}</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/reports">{t('allReports')}</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/notifications">{t('allNotifications')}</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/data-quality">{t('allDataQuality')}</a></nav>
    </div>
    </>
  )
}

function DashboardLinkedList({ title, href, items, empty, unavailable, t }: {
  title: string; href: string; items: DashboardLinkedItem[]; empty: string; unavailable: string | null; t: (key: string) => string
}) {
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={title}>
    <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
      <a href={href} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
        {t('viewAll')} <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </a>
    </header>
    <div>
      {unavailable ? <p className="p-4 text-sm text-amber-700">{unavailable}</p> : items.length ? <ul className="divide-y divide-slate-100">
        {items.slice(0, 5).map(item => <li key={item.id}>
          <a href={item.href} className="block min-h-14 px-4 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
            <span className="flex min-w-0 items-center gap-2"><span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>{item.brandId && <BrandLogo brandId={item.brandId} brandName={item.title} logoUrl={item.brandLogoUrl} size={24} className="rounded" />}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{item.description}</span>
          </a>
        </li>)}
      </ul> : <p className="p-4 text-sm text-slate-500">{empty}</p>}
    </div>
  </section>
}
