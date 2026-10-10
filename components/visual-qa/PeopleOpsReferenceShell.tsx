import type { ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  Copy,
  LayoutDashboard,
  MoreHorizontal,
  Radio,
  Search,
  Users,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'My Workspace', icon: LayoutDashboard },
  { label: 'My Schedule', icon: CalendarDays },
  { label: 'Shifts', icon: ClipboardCheck },
  { label: 'Registration', icon: ClipboardCheck },
  { label: 'Staffing', icon: BriefcaseBusiness },
  { label: 'Swaps', icon: Copy },
  { label: 'Live', icon: Radio },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Notifications', icon: Bell },
  { label: 'Staff', icon: Users },
] as const

export function PeopleOpsReferenceShell({ active, searchPlaceholder, children }: { active: 'Staff' | 'Staffing' | 'Registration'; searchPlaceholder: string; children: ReactNode }) {
  return (
    <div lang="vi" translate="no" className="notranslate relative flex h-screen min-w-[1180px] overflow-hidden bg-slate-50 font-sans text-slate-900">
      <aside className="flex w-[248px] shrink-0 flex-col bg-[#082743] text-white">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600"><BarChart3 className="h-4 w-4" /></span>
          <span className="text-[15px] font-semibold tracking-tight">LiveStream Ops</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {NAV_ITEMS.map(({ label, icon: Icon }) => (
            <button key={label} type="button" className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13px] font-medium ${active === label ? 'bg-blue-600 text-white' : 'text-slate-200'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">NK</span>
          <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold">Nguyễn Trung Kiên</div><div className="text-[11px] text-slate-400">Admin</div></div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex h-9 w-[430px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" /><span>{searchPlaceholder}</span></div>
          <div className="flex items-center gap-2 text-slate-500">
            <button type="button" aria-label="Thông báo" className="flex h-8 w-8 items-center justify-center rounded-full"><Bell className="h-4 w-4" /></button>
            <button type="button" aria-label="Nhóm" className="flex h-8 w-8 items-center justify-center rounded-full"><Users className="h-4 w-4" /></button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">NK</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
