import Link from 'next/link'
import { ArrowRight, ArrowLeftRight, CalendarDays, ClipboardList, Clock3, FileText, MapPin, TrendingUp } from 'lucide-react'
import type { MemberDashboardViewModel } from './MemberDashboardView'

/** Real, role-safe dashboard presentation matching the ADA OPS reference mobile hierarchy. */
export function MemberDashboardMobile({ nextShift, mySchedule, myActions, openShifts }: MemberDashboardViewModel) {
  const quick = [
    { href: '/calendar', label: 'Lịch ca', icon: CalendarDays, style: 'bg-blue-50 text-[#2563EB]' },
    { href: '/reports', label: 'Báo cáo', icon: FileText, style: 'bg-violet-50 text-[#7C3AED]' },
    { href: '/workforce', label: 'Hiệu suất', icon: TrendingUp, style: 'bg-emerald-50 text-[#10B981]' },
    { href: '/swaps', label: 'Đổi ca', icon: ArrowLeftRight, style: 'bg-amber-50 text-amber-600' },
  ]
  return (
    <main data-testid="ada-mobile-dashboard" className="flex flex-col gap-5 bg-[#F8FAFF] p-4 pb-6 lg:hidden">
      <section className="relative overflow-hidden rounded-[16px] border border-[#E4EBF8] bg-white p-4 shadow-[0_6px_22px_rgba(7,24,59,.07)]">
        <div className="absolute right-0 top-0 h-11 w-20 rounded-bl-[38px] bg-gradient-to-br from-blue-500 to-violet-600" aria-hidden="true" />
        <p className="text-[11px] font-semibold text-slate-500">Ca trong lịch của tôi</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[27px] font-extrabold tabular-nums text-[#10A568]">{mySchedule.length}</span>
          <span className="text-[12px] font-semibold text-[#10A568]">ca</span>
        </div>
        {nextShift ? <div className="mt-3 flex items-start gap-3 border-t border-slate-100 pt-3">
          <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Clock3 className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-[#10234B]">{nextShift.brand} · {nextShift.platform}</p>
            <p className="mt-1 text-[11px] text-slate-500">{nextShift.time}</p>
            {nextShift.location && <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3" />{nextShift.location}</p>}
            {nextShift.startsIn && <p className="mt-1 text-[11px] font-medium text-[#2563EB]">{nextShift.startsIn}</p>}
          </div>
          <Link href="/calendar" className="mt-1 shrink-0 rounded-lg bg-[#1559F0] px-3 py-2 text-[11px] font-bold text-white">Vào ca</Link>
        </div> : <p className="mt-3 border-t border-[#EEF2F9] pt-3 text-[12px] text-slate-500">Chưa có ca sắp tới</p>}
      </section>
      <nav aria-label="Truy cập nhanh" className="grid grid-cols-4 gap-2">
        {quick.map(item => {
          const Icon = item.icon
          return <Link key={item.href} href={item.href} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-[#EDF1F8] bg-white px-1 py-3 focus-visible:outline-2 focus-visible:outline-blue-600">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.style}`}><Icon className="h-[19px] w-[19px]" aria-hidden="true" /></span>
            <span className="text-[10px] font-semibold text-[#1A315A]">{item.label}</span>
          </Link>
        })}
      </nav>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-[#07183B]">Công việc cần xử lý</h2>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#2563EB]">{myActions === null ? '—' : myActions.length}</span>
        </div>
        <div className="divide-y divide-[#EDF1F7] overflow-hidden rounded-[16px] border border-[#E5ECF8] bg-white">
          {myActions === null ? <p className="p-4 text-[12px] text-slate-500">Dữ liệu chưa khả dụng</p>
          : myActions.length === 0 ? <p className="p-4 text-[12px] text-slate-500">Không có công việc cần xử lý</p>
          : myActions.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center gap-3 p-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.type === 'warning' ? 'bg-red-50 text-red-600' : item.type === 'swap' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                <ClipboardList className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-[#10234B]">{item.title}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{item.description}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${item.type === 'warning' ? 'bg-red-50 text-red-600' : item.type === 'swap' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                {item.type === 'warning' ? 'Cần xử lý' : item.type === 'swap' ? 'Chờ duyệt' : 'Xem'}
              </span>
            </div>
          ))}
        </div>
      </section>
      {openShifts !== null && openShifts.length > 0 && <section className="space-y-2">
        <h2 className="text-[15px] font-bold text-[#07183B]">Ca mở đăng ký</h2>
        {openShifts.slice(0, 2).map((item, i) => <div key={i} className="rounded-xl border border-[#E6ECF8] bg-white p-3">
          <p className="text-[12px] font-semibold text-[#10234B]">{item.brand} · {item.platform}</p>
          <p className="mt-1 text-[11px] text-slate-500">{item.time} · {item.role}</p>
        </div>)}
        <Link href="/calendar?tab=open" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563EB]">Xem ca mở <ArrowRight className="h-3.5 w-3.5" /></Link>
      </section>}
    </main>
  )
}
