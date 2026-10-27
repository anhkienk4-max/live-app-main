import Link from 'next/link'
import { ArrowRight, ArrowLeftRight, CalendarDays, ClipboardList, Clock3, FileText, MapPin, TrendingUp } from 'lucide-react'
import type { MemberDashboardViewModel } from './MemberDashboardView'

/**
 * ADA PWA task-first member home. Uses existing view-model data only.
 * All action links point to the existing authorized app routes.
 */
export function MemberDashboardMobile({
  nextShift, mySchedule, myActions, openShifts,
}: MemberDashboardViewModel) {
  return (
    <main data-testid="ada-mobile-dashboard" className="flex flex-col gap-5 p-4 pb-6 md:hidden">
      <section className="ada-mobile-summary relative overflow-hidden rounded-[23px] bg-gradient-to-br from-[#075FF0] via-[#174BC1] to-[#100B4F] p-5 text-white shadow-[0_15px_30px_rgba(30,61,162,.19)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-violet-400/25 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-[12px] font-semibold tracking-wide text-blue-100">ADA OPS LIVESTREAM</p>
          <h1 className="mt-2 text-[24px] font-bold leading-tight tracking-tight">Tổng quan công việc</h1>
          <p className="mt-1 text-[12px] text-blue-100">Lịch ca và công việc cần xử lý</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/20 bg-white/12 p-3">
              <span className="block text-[11px] text-blue-100">Ca trong danh sách</span>
              <span className="mt-1 block text-[23px] font-bold tabular-nums">{mySchedule.length}</span>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/12 p-3">
              <span className="block text-[11px] text-blue-100">Công việc cần xem</span>
              <span className="mt-1 block text-[23px] font-bold tabular-nums">{myActions === null ? '—' : myActions.length}</span>
            </div>
          </div>
        </div>
      </section>

      <nav aria-label="Truy cập nhanh" className="grid grid-cols-4 gap-2">
        {[
          { href: '/calendar', icon: CalendarDays, label: 'Lịch ca', tone: 'text-[#2563EB] bg-blue-50' },
          { href: '/reports', icon: FileText, label: 'Báo cáo', tone: 'text-[#7C3AED] bg-violet-50' },
          { href: '/workforce', icon: TrendingUp, label: 'Hiệu suất', tone: 'text-[#10B981] bg-emerald-50' },
          { href: '/swaps', icon: ArrowLeftRight, label: 'Đổi ca', tone: 'text-amber-600 bg-amber-50' },
        ].map(item => {
          const Icon = item.icon
          return <Link key={item.href} href={item.href} className="flex min-w-0 flex-col items-center gap-2 rounded-[15px] border border-[#E8EDF8] bg-white px-1 py-3 text-center shadow-[0_3px_10px_rgba(7,24,59,.035)] focus-visible:outline-2 focus-visible:outline-blue-600">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="text-[11px] font-semibold text-[#25345A]">{item.label}</span>
          </Link>
        })}
      </nav>

      <section aria-labelledby="ada-next-shift-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="ada-next-shift-title" className="text-[16px] font-bold text-[#07183B]">Ca sắp tới</h2>
          <Link href="/calendar" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563EB]">Lịch ca <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="overflow-hidden rounded-[16px] border border-[#E3EAF8] bg-white shadow-sm">
          {nextShift ? <div className="flex">
            <div className="w-1 shrink-0 bg-emerald-500" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{nextShift.role}</span>
                {nextShift.startsIn && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700"><Clock3 className="h-3.5 w-3.5" />{nextShift.startsIn}</span>}
              </div>
              <h3 className="truncate text-[15px] font-bold text-[#07183B]">{nextShift.brand}</h3>
              <p className="text-[12px] text-slate-500">{nextShift.platform} · {nextShift.time}</p>
              {nextShift.location && <p className="inline-flex items-center gap-1 text-[12px] text-slate-500"><MapPin className="h-3.5 w-3.5" />{nextShift.location}</p>}
              <Link href="/calendar" className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#2563EB] px-4 text-[12px] font-bold text-white">Xem lịch ca</Link>
            </div>
          </div> : <p className="p-5 text-center text-[13px] text-slate-500">Chưa có ca làm việc sắp tới.</p>}
        </div>
      </section>

      <section aria-labelledby="ada-actions-title" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="ada-actions-title" className="text-[16px] font-bold text-[#07183B]">Công việc cần xử lý</h2>
          <ClipboardList className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          {myActions === null
            ? <p className="rounded-[16px] border border-[#E3EAF8] bg-white p-4 text-[13px] text-slate-500">Dữ liệu công việc chưa khả dụng.</p>
            : myActions.length === 0
              ? <p className="rounded-[16px] border border-[#E3EAF8] bg-white p-4 text-[13px] text-slate-500">Không có công việc cần xử lý.</p>
              : myActions.slice(0, 4).map((action, i) => <div key={i} className="flex items-start gap-3 rounded-[15px] border border-[#E3EAF8] bg-white p-3.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${action.type === 'warning' ? 'bg-red-50 text-red-600' : action.type === 'swap' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                  <ClipboardList className="h-[18px] w-[18px]" aria-hidden="true"/>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#07183B]">{action.title}</p>
                  <p className="mt-1 text-[12px] text-slate-500">{action.description}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{action.time}</p>
                </div>
              </div>)}
        </div>
      </section>

      {openShifts !== null && openShifts.length > 0 && (
        <section aria-labelledby="ada-open-shifts-title" className="space-y-3">
          <h2 id="ada-open-shifts-title" className="text-[16px] font-bold text-[#07183B]">Ca đang mở đăng ký</h2>
          {openShifts.slice(0, 2).map((item, i) => (
            <div key={i} className="rounded-[16px] border border-[#E3EAF8] bg-white p-4">
              <p className="text-[13px] font-semibold text-[#07183B]">{item.brand} · {item.platform}</p>
              <p className="mt-1 text-[12px] text-slate-500">{item.time} · {item.role}</p>
            </div>
          ))}
          <Link href="/calendar?tab=open" className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#2563EB] text-[12px] font-bold text-[#2563EB]">Xem ca mở</Link>
        </section>
      )}
    </main>
  )
}
