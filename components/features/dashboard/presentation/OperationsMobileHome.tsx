import Link from 'next/link'
import { ArrowRight, CalendarDays, ClipboardList, FileText, Radio, Users, WalletCards } from 'lucide-react'

type OperationalMobileItem = {
  id: string
  title: string
  subtitle: string
  status?: string
  tone?: 'blue' | 'green' | 'amber' | 'red'
}
type Props = {
  roleLabel: string
  today: number
  live: number
  pending: number
  schedule: OperationalMobileItem[]
  actions: OperationalMobileItem[] | null
  admin?: boolean
}

/**
 * Reference-board operations home for Admin and Leader.
 * Counts and rows are derived solely from their existing role-specific view model.
 */
export function OperationsMobileHome({ roleLabel, today, live, pending, schedule, actions, admin = false }: Props) {
  const shortcut = [
    { href: '/calendar', label: 'Lịch ca', icon: CalendarDays, bg: 'bg-blue-50', color: 'text-[#2563EB]' },
    { href: '/reports', label: 'Báo cáo', icon: FileText, bg: 'bg-violet-50', color: 'text-[#7C3AED]' },
    { href: admin ? '/payroll' : '/workforce', label: admin ? 'Lương' : 'Hiệu suất', icon: WalletCards, bg: 'bg-emerald-50', color: 'text-[#10B981]' },
    { href: '/staff', label: 'Nhân sự', icon: Users, bg: 'bg-indigo-50', color: 'text-indigo-600' },
  ]
  const tone: Record<NonNullable<OperationalMobileItem['tone']>, string> = {
    blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700',
  }
  return (
    <main data-testid="ada-reference-operations-mobile" className="flex flex-col gap-5 bg-[#F8FAFF] p-4 pb-6 lg:hidden">
      <section className="relative overflow-hidden rounded-[17px] border border-[#E7EBF8] bg-white p-4 shadow-[0_5px_22px_rgba(7,24,59,.06)]">
        <div className="absolute right-0 top-0 h-14 w-24 rounded-bl-[45px] bg-gradient-to-br from-[#4B53EC] to-[#8D54F7] opacity-95" aria-hidden="true" />
        <p className="text-[11px] font-semibold text-slate-500">{roleLabel} · Ca hôm nay</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[29px] font-extrabold leading-none tabular-nums text-[#10A568]">{today}</span>
          <span className="text-[13px] font-bold text-[#10A568]">ca</span>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[12px] text-slate-600">
          <span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-[#EF4444]" />Đang live <strong>{live}</strong></span>
          <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-amber-500" />Chờ xử lý <strong>{pending}</strong></span>
        </div>
        {schedule.length > 0 && <div className="mt-4 space-y-2 border-t border-[#EEF2FA] pt-3">
          {schedule.slice(0, 2).map(item => <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 text-[12px]">
            <span className="min-w-0 truncate font-semibold text-[#0C2151]">{item.title}</span>
            <span className="shrink-0 text-[11px] text-slate-500">{item.subtitle}</span>
          </div>)}
        </div>}
        <Link className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg bg-[#155FF0] px-4 text-[12px] font-semibold text-white" href="/calendar">Xem lịch ca <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
      </section>

      <section aria-label="Truy cập nhanh" className="grid grid-cols-4 gap-2">
        {shortcut.map(item => {
          const Icon = item.icon
          return <Link key={item.href} href={item.href} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-[#EBF0FA] bg-white px-1 py-3 focus-visible:outline-2 focus-visible:outline-blue-600">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg}`}><Icon className={`h-5 w-5 ${item.color}`} aria-hidden="true" /></span>
            <span className="text-[10px] font-semibold text-[#1B3159]">{item.label}</span>
          </Link>
        })}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#07183B]">Công việc cần xử lý</h2>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#2563EB]">{pending}</span>
        </div>
        {actions === null ? <div className="rounded-xl border border-[#E7ECF7] bg-white p-4 text-[12px] text-slate-500">Dữ liệu chưa khả dụng</div>
          : actions.length === 0 ? <div className="rounded-xl border border-[#E7ECF7] bg-white p-4 text-[12px] text-slate-500">Không có công việc cần xử lý</div>
          : <div className="divide-y divide-[#EEF1F8] rounded-[15px] border border-[#E7ECF7] bg-white">
            {actions.slice(0, 5).map(item => <div key={item.id} className="flex items-center gap-3 px-3 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone[item.tone || 'blue']}`}><ClipboardList className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#10234B]">{item.title}</p>
                <p className="truncate text-[11px] text-slate-500">{item.subtitle}</p>
              </div>
              {item.status && <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${tone[item.tone || 'blue']}`}>{item.status}</span>}
            </div>)}
          </div>}
        <Link href="/reports" className="inline-flex min-h-9 items-center gap-2 text-[12px] font-semibold text-[#2563EB]">Xem báo cáo <ArrowRight className="h-3.5 w-3.5" /></Link>
      </section>
    </main>
  )
}
