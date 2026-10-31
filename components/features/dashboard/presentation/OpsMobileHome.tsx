'use client'

import Link from 'next/link'
import { ArrowRight, Bell, CalendarDays, ClipboardList, Clock3, FileText, Radio, UserRound, UsersRound, Wallet, CheckCircle2, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export type OpsMobileAttention = {
  key: string
  title: string
  description?: string
  href: string
  level?: 'critical' | 'warning' | 'info'
}
export type OpsMobileShift = {
  key: string
  brand: string
  platform: string
  time: string
  status?: string
  onView?: () => void
}
export type OpsMobileHomeProps = {
  role: 'admin' | 'leader' | 'member'
  userName?: string
  shiftCount: number
  shiftLabel?: string
  liveCount: number | null
  pendingCount: number | null
  shift?: OpsMobileShift | null
  attention: OpsMobileAttention[] | null
  overview?: {
    title: string
    subtitle: string
    metrics: { key: string; label: string; value: number | null; href: string }[]
  }
}

/** Mobile-only presentation for real, role-scoped RC19 dashboard view-models.
 * Never creates example shifts, salary amounts, pending tasks, or role permissions.
 */
export function OpsMobileHome({
  role, userName, shiftCount, shiftLabel, liveCount, pendingCount, shift, attention, overview,
}: OpsMobileHomeProps) {
  const { t } = useTranslation()
  const admin = role === 'admin'
  const fullName = userName?.trim() || t(role)
  const effectiveShiftLabel = shiftLabel ?? t('shiftsToday')
  const initial = fullName.slice(0, 1).toUpperCase()
  const links = [
    { href: '/calendar?tab=calendar', title: t('calendar'), Icon: CalendarDays, color: 'text-blue-600', background: 'bg-blue-50' },
    { href: '/reports', title: t('reports'), Icon: FileText, color: 'text-violet-600', background: 'bg-violet-50' },
    admin
      ? { href: '/payroll', title: t('payroll'), Icon: Wallet, color: 'text-emerald-600', background: 'bg-emerald-50' }
      : role === 'leader'
        ? { href: '/staffing?tab=registration', title: t('pendingRegistrations'), Icon: ClipboardList, color: 'text-emerald-600', background: 'bg-emerald-50' }
        : { href: '/calendar?tab=open', title: t('register'), Icon: ClipboardList, color: 'text-emerald-600', background: 'bg-emerald-50' },
    { href: admin ? '/staff' : '/profile', title: admin ? t('staffDirectory') : t('profile'), Icon: UsersRound, color: 'text-indigo-600', background: 'bg-indigo-50' },
    ...(admin ? [{ href: '/profile', title: t('profile'), Icon: UserRound, color: 'text-sky-600', background: 'bg-sky-50' }] : []),
    { href: '/notifications', title: t('allNotifications'), Icon: Bell, color: 'text-amber-600', background: 'bg-amber-50' },
  ]
  return (
    <main data-testid="ada-reference-mobile-home" data-role={role} className="min-w-0 bg-[#F7F9FE] pb-7 md:hidden">
      <div className="flex min-h-[82px] items-center gap-3 bg-[#081F4A] px-4 pb-5 pt-4 text-white">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-blue-500 text-[14px] font-bold">{initial}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-blue-100">{t('welcome')},</p>
          <p className="truncate text-[14px] font-bold">{fullName}</p>
          <p className="mt-0.5 text-[10px] text-blue-200">{t(role)}</p>
        </div>
        <span className="rounded-full border border-white/20 px-2 py-1 text-[10px] font-semibold text-blue-100">ADA OPS</span>
      </div>
      <div className="-mt-1 space-y-4 px-4 pt-4">
        <section aria-label={t('shiftsToday')} className="relative overflow-hidden rounded-[18px] border border-[#E2E9F6] bg-white p-4 shadow-[0_7px_22px_rgba(13,42,100,.055)]">
          <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-[66px] w-[68px] rounded-bl-[55px] bg-[#7153F6]" />
          <p className="relative text-[11px] font-medium text-[#51698F]">{role === 'member' ? t('myShifts') : admin ? t('systemOperationsCommandCenter') : t('leaderDashboard')} · {t('today')}</p>
          <div className="relative mt-2 flex items-baseline gap-2 text-emerald-600">
            <strong className="text-[33px] font-extrabold leading-none tabular-nums">{shiftCount}</strong>
            <span className="text-[13px] font-semibold">{t('shiftCountUnit')}</span>
          </div>
          <p className="relative mt-1 text-[11px] text-slate-500">{effectiveShiftLabel}</p>
          <div className="relative mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] font-medium">
            <span className="flex items-center gap-1.5 text-[#2563EB]"><Radio className="size-3.5" aria-hidden="true" /> {t('liveNow')} <strong className="tabular-nums">{liveCount === null ? '—' : liveCount}</strong></span>
            <span className="flex items-center gap-1.5 text-[#E48714]"><ClipboardList className="size-3.5" aria-hidden="true" /> {t('pending')} <strong className="tabular-nums">{pendingCount === null ? '—' : pendingCount}</strong></span>
          </div>
          <div className="relative my-3 h-px bg-[#EDF1F8]" />
          {shift ? (
            <div data-testid="ada-mobile-home-shift" className="relative space-y-1">
              {role === 'member' && <p className="text-[10px] font-semibold text-[#577092]">{t('upcoming')}</p>}
              <p className="break-words text-[12px] font-bold leading-snug text-[#102753]">{shift.brand} · {shift.platform}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#577092]">
                <span className="flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden="true" />{shift.time}</span>
                {shift.status && <span className="rounded-md bg-[#EEF3FF] px-2 py-0.5 font-medium text-[#235CE7]">{shift.status}</span>}
              </div>
            </div>
          ) : (
            <p className="relative text-[11px] text-slate-500">{t('noShiftInLoadedScope')}</p>
          )}
          <div className="relative mt-3">
            {shift?.onView ? (
              <button type="button" onClick={shift.onView} className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#155EF2] px-4 text-[12px] font-bold text-white">
                {t('viewShiftDetail')} <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            ) : (
              <Link href="/calendar?tab=calendar" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-[#155EF2] px-4 text-[12px] font-bold text-white">
                {t('calendar')} <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>
        <nav aria-label={t('quickAccess')} data-testid="ada-mobile-home-quick-links" className="grid grid-cols-2 gap-3">
          {links.map(({ href, title, Icon, color, background }) => (
            <Link key={href} href={href} data-testid={href === '/profile' ? 'ada-mobile-profile-link' : href === '/notifications' ? 'ada-mobile-notifications-link' : undefined} className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-[16px] border border-[#E2E9F6] bg-white px-2 py-3 text-center shadow-[0_3px_12px_rgba(10,38,90,.035)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <span className={'flex size-10 items-center justify-center rounded-xl ' + background}>
                <Icon className={'size-5 ' + color} aria-hidden="true" />
              </span>
              <span className="text-[12px] font-semibold text-[#102753]">{title}</span>
            </Link>
          ))}
        </nav>
        {overview && <section aria-labelledby="ada-mobile-overview-title" data-testid="ada-mobile-app-overview" className="space-y-2.5">
          <div>
            <h2 id="ada-mobile-overview-title" className="text-[15px] font-extrabold text-[#0C2248]">{overview.title}</h2>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">{overview.subtitle}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {overview.metrics.map(metric => <Link key={metric.key} href={metric.href} className="min-h-[82px] rounded-xl border border-[#E2E9F6] bg-white p-3 shadow-[0_3px_12px_rgba(10,38,90,.035)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <span className="block text-[10px] font-medium leading-snug text-[#51698F]">{metric.label}</span>
              <span className="mt-2 block text-xl font-bold tabular-nums text-[#102753]">{metric.value === null ? '—' : metric.value.toLocaleString()}</span>
            </Link>)}
          </div>
        </section>}
        <section aria-label={t('actionQueue')} className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-extrabold text-[#0C2248]">{t('actionQueue')}</h2>
            <span aria-label={t('notificationCount')} className="rounded-full bg-[#EBF1FF] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#155EF2]">{attention === null ? '—' : attention.length}</span>
          </div>
          <div className="overflow-hidden rounded-[16px] border border-[#E2E9F6] bg-white">
            {attention === null ? <p className="p-4 text-[12px] text-slate-500">{t('workQueueUnavailable')}</p> :
              attention.length === 0 ? <div className="flex items-center gap-2 p-4 text-[12px] text-slate-500"><CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />{t('noActionItems')}</div> :
              attention.slice(0, 4).map((task, index) => (
                <Link key={task.key} href={task.href} className={'flex min-h-[68px] items-center gap-3 p-3.5 hover:bg-[#F8FAFF] ' + (index ? 'border-t border-[#EEF2FA]' : '')}>
                  <span className={'flex size-9 shrink-0 items-center justify-center rounded-[10px] ' + (task.level === 'critical' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>
                    {task.level === 'critical' ? <AlertCircle className="size-[18px]" aria-hidden="true" /> : <ClipboardList className="size-[18px]" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[12px] font-semibold leading-snug text-[#102753]">{task.title}</span>
                    {task.description && <span className="mt-1 block break-words text-[11px] leading-snug text-[#65789C]">{task.description}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-[#155EF2]">{t('viewDetails')} <ArrowRight className="inline size-3" aria-hidden="true" /></span>
                </Link>
              ))}
          </div>
        </section>
        <Link href="/reports" className="inline-flex min-h-11 items-center gap-2 text-[12px] font-semibold text-[#155EF2]">{t('allReports')} <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>
    </main>
  )
}
