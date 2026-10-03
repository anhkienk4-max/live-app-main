import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  Copy,
  FileUp,
  LayoutDashboard,
  MoreHorizontal,
  Radio,
  ScrollText,
  Search,
  Settings,
  Users,
} from 'lucide-react'

type AdminSystemPage = 'Import Data' | 'Audit' | 'Settings'

const NAV_GROUPS: { title: string; items: { label: string; icon: LucideIcon }[] }[] = [
  { title: 'APP OPS', items: [{ label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'OPERATIONS', items: [{ label: 'Calendar', icon: CalendarDays }, { label: 'Live', icon: Radio }, { label: 'Shifts', icon: ClipboardCheck }, { label: 'Registration', icon: ClipboardCheck }, { label: 'Staffing', icon: Users }, { label: 'Swaps', icon: Copy }] },
  { title: 'PERFORMANCE', items: [{ label: 'Reports', icon: ScrollText }, { label: 'Analytics', icon: BarChart3 }] },
  { title: 'SYSTEM', items: [{ label: 'Audit', icon: ScrollText }, { label: 'Import Data', icon: FileUp }, { label: 'Settings', icon: Settings }] },
]

export function AdminSystemReferenceShell({ active, searchPlaceholder, children }: { active: AdminSystemPage; searchPlaceholder: string; children: ReactNode }) {
  return (
    <div lang="vi" translate="no" className="notranslate relative flex h-screen min-w-[1180px] overflow-hidden bg-[#f7faff] font-sans text-slate-900">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-white"><BarChart3 className="h-4 w-4" /></span>
          <div><div className="text-[14px] font-bold tracking-tight">LiveStream Ops</div><div className="text-[11px] text-slate-500">Admin Center</div></div>
        </div>
        <nav className="flex-1 overflow-hidden px-3 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-3 border-b border-slate-100 pb-2 last:border-0">
              <div className="px-3 pb-1 text-[11px] font-semibold text-slate-400">{group.title}</div>
              {group.items.map(({ label, icon: Icon }) => (
                <button key={label} type="button" className={`flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-[12px] font-medium ${active === label ? 'bg-blue-50 text-blue-600' : 'text-slate-600'}`}>
                  <Icon className="h-3.5 w-3.5" /><span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">AD</span>
          <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold">Admin User</div><div className="text-[11px] text-slate-400">System Administrator</div></div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
          <div className="flex h-9 w-[440px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />{searchPlaceholder}</div>
          <div className="flex items-center gap-2 text-slate-500">
            <button type="button" aria-label="Tìm kiếm" className="flex h-8 w-8 items-center justify-center rounded-full"><Search className="h-4 w-4" /></button>
            <button type="button" aria-label="Thông báo" className="relative flex h-8 w-8 items-center justify-center rounded-full"><Bell className="h-4 w-4" /><span className="absolute right-0 top-0 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">12</span></button>
            <button type="button" aria-label="Nhóm" className="flex h-8 w-8 items-center justify-center rounded-full"><Users className="h-4 w-4" /></button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">AD</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
