'use client'

import { useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Pause,
  Pencil,
  Plus,
  Radio,
  Search,
  UserRoundCheck,
  Users,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

type LifecyclePreview = 'none' | 'members' | 'attendance' | 'complete' | 'cancel'

const NAV_ITEMS = [
  { label: 'My Workspace', icon: LayoutDashboard, active: false },
  { label: 'My Schedule', icon: CalendarDays, active: false },
  { label: 'Shifts', icon: Users, active: true },
  { label: 'Staffing', icon: BriefcaseBusiness, active: false },
  { label: 'Swaps', icon: Copy, active: false },
  { label: 'Live', icon: Radio, active: false },
  { label: 'Reports', icon: BarChart3, active: false },
  { label: 'Notifications', icon: Bell, active: false },
] as const

const ASSIGNED_MEMBERS = [
  { initials: 'MA', role: 'Host', name: 'Trần Minh Anh', status: 'Đã xác nhận', avatar: 'bg-rose-100 text-rose-700', statusClass: 'bg-emerald-50 text-emerald-700' },
  { initials: 'LH', role: 'Cameraman', name: 'Lê Hoàng', status: 'Đã xác nhận', avatar: 'bg-blue-100 text-blue-700', statusClass: 'bg-emerald-50 text-emerald-700' },
  { initials: 'TK', role: 'Support', name: 'Nguyễn Trung Kiên', status: 'Chờ xác nhận', avatar: 'bg-violet-100 text-violet-700', statusClass: 'bg-amber-50 text-amber-700' },
] as const

const HISTORY_ITEMS = [
  { status: 'Completed', date: '10/09/2026 17:05', actor: 'Trần Minh Anh', note: '“Hoàn thành ca, livestream thành công.”', icon: Check, dot: 'bg-emerald-500' },
  { status: 'Live', date: '10/09/2026 14:00', actor: 'Trần Minh Anh', note: '“Bắt đầu livestream.”', icon: Radio, dot: 'bg-emerald-500' },
  { status: 'Preparing', date: '10/09/2026 13:30', actor: 'Nguyễn Trung Kiên', note: '“Set up studio hoàn tất.”', icon: Wrench, dot: 'bg-violet-500' },
  { status: 'Scheduled', date: '05/09/2026 10:24', actor: 'Nguyễn Trung Kiên', note: '“Tạo ca”', icon: Clock3, dot: 'bg-blue-500' },
] as const

export function ShiftLifecycleReferenceMock({ initialState = 'none' }: { initialState?: LifecyclePreview }) {
  const [preview, setPreview] = useState<LifecyclePreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)

  const openPreview = (next: Exclude<LifecyclePreview, 'none'>) => {
    setPreview(next)
    setQaOpen(false)
  }

  const closePreview = () => setPreview('none')

  return (
    <div lang="vi" translate="no" className="notranslate relative flex h-screen min-w-[1180px] overflow-hidden bg-slate-50 font-sans text-slate-900">
      <aside className="flex w-[248px] shrink-0 flex-col bg-[#082743] text-white">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600"><BarChart3 className="h-4 w-4" /></span>
          <span className="text-[15px] font-semibold tracking-tight">LiveStream Ops</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[14px] font-medium ${active ? 'bg-blue-600 text-white' : 'text-slate-200'}`}
            >
              <Icon className="h-[17px] w-[17px]" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">NK</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">Nguyễn Trung Kiên</div>
            <div className="text-[11px] text-slate-400">Admin</div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex h-9 w-[420px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[13px] text-slate-400">
            <Search className="h-3.5 w-3.5" />
            <span><FrozenText>Tìm kiếm ca, nhân sự, thương hiệu...</FrozenText></span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <button type="button" aria-label="Thông báo" className="flex h-8 w-8 items-center justify-center rounded-full"><Bell className="h-4 w-4" /></button>
            <button type="button" aria-label="Nhóm" className="flex h-8 w-8 items-center justify-center rounded-full"><Users className="h-4 w-4" /></button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">NK</span>
          </div>
        </header>

        <div className="px-6 py-5">
          <button type="button" className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span><FrozenText>Quay lại danh sách ca</FrozenText></span>
          </button>

          <section className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[21px] font-bold tracking-tight text-slate-950">Pharmaton T9</h1>
                  <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700">Scheduled</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-slate-500">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />10/09/2026</span>
                  <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-blue-600" />14:00–17:00</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-blue-600" />Studio A</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600"><Pencil className="h-3.5 w-3.5" /><span><FrozenText>Chỉnh sửa</FrozenText></span></button>
                <button type="button" onClick={() => openPreview('members')} className="flex h-8 items-center gap-1.5 rounded-md border border-blue-200 px-3 text-[12px] font-semibold text-blue-700"><Users className="h-3.5 w-3.5" /><span><FrozenText>Xem nhân sự</FrozenText></span></button>
                <button type="button" onClick={() => openPreview('attendance')} className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white"><UserRoundCheck className="h-3.5 w-3.5" /><span><FrozenText>Xác nhận tham gia</FrozenText></span></button>
                <button type="button" onClick={() => openPreview('complete')} className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 px-3 text-[12px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /><span><FrozenText>Hoàn thành ca</FrozenText></span></button>
                <button type="button" onClick={() => openPreview('cancel')} className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-[12px] font-semibold text-red-600"><XCircle className="h-3.5 w-3.5" /><span><FrozenText>Hủy ca</FrozenText></span></button>
              </div>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_326px] items-start gap-4">
            <div className="grid gap-4">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-[14px] font-bold text-slate-900"><FrozenText>Thông tin ca</FrozenText></h2>
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400"><History className="h-3.5 w-3.5" /><span><FrozenText>Tạo ngày 05/09/2026 10:24</FrozenText></span></span>
                </div>

                <div className="grid grid-cols-[1fr_1.05fr] gap-5">
                  <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-2 text-[12px]">
                    <dt className="text-slate-400">Brand</dt><dd className="font-semibold text-slate-700">Pharmaton</dd>
                    <dt className="text-slate-400">Product</dt><dd className="font-semibold text-slate-700">Pharmaton T9</dd>
                    <dt className="text-slate-400"><FrozenText>Địa điểm</FrozenText></dt><dd className="font-medium text-slate-700"><FrozenText>Tòa nhà ADA, Quận 1, HCM</FrozenText></dd>
                    <dt className="text-slate-400"><FrozenText>Loại ca</FrozenText></dt><dd className="font-medium text-slate-700">Livestream</dd>
                    <dt className="text-slate-400"><FrozenText>Người tạo</FrozenText></dt><dd className="font-medium text-slate-700">Nguyễn Trung Kiên</dd>
                  </dl>

                  <div className="grid gap-3">
                    <div className="rounded-md bg-slate-50 px-3 py-2.5">
                      <div className="text-[12px] font-semibold text-slate-500"><FrozenText>Mô tả</FrozenText></div>
                      <p className="mt-1 text-[12px] leading-4 text-slate-600"><FrozenText>Livestream campaign T9 - Pharmaton. Yêu cầu: check sản phẩm, set up studio trước 30 phút.</FrozenText></p>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500"><Paperclip className="h-3.5 w-3.5" /><span><FrozenText>Tệp liên quan (2)</FrozenText></span></div>
                      <div className="grid grid-cols-2 gap-2">
                        <FileRow icon={FileText} name="Brief_Pharmaton_T9.pdf" size="2.4 MB" tone="bg-red-50 text-red-600" />
                        <FileRow icon={FileSpreadsheet} name="Shotlist_T9.xlsx" size="1.1 MB" tone="bg-emerald-50 text-emerald-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-[14px] font-bold text-slate-900"><FrozenText>Luồng trạng thái ca</FrozenText></h2>
                    <p className="mt-0.5 text-[12px] text-slate-400"><FrozenText>Quy trình vận hành từ khi lên lịch đến khi kết thúc</FrozenText></p>
                  </div>
                  <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-700"><FrozenText>Trạng thái hiện tại: Scheduled</FrozenText></span>
                </div>

                <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr_24px_1fr_24px_1fr] items-start gap-1">
                  <div>
                    <StatusNode icon={Clock3} status="Scheduled" description="Ca đã được tạo và lên lịch" color="bg-blue-500 text-white" />
                    <div className="flex h-8 flex-col items-center justify-center text-rose-400"><span className="h-3 border-l border-dashed border-rose-300" /><ArrowDown className="h-3.5 w-3.5" /></div>
                    <StatusNode icon={X} status="Cancelled" description="Đã hủy" color="bg-rose-500 text-white" />
                  </div>
                  <FlowArrow />
                  <StatusNode icon={Wrench} status="Preparing" description="Đang chuẩn bị trước giờ bắt đầu" color="bg-violet-500 text-white" />
                  <FlowArrow />
                  <StatusNode icon={Radio} status="Live" description="Đang diễn ra" color="bg-emerald-500 text-white" />
                  <FlowArrow />
                  <StatusNode icon={Pause} status="Paused" description="Tạm dừng" color="bg-amber-500 text-white" />
                  <FlowArrow />
                  <StatusNode icon={Check} status="Completed" description="Đã hoàn thành" color="bg-green-600 text-white" />
                </div>

                <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 px-4 py-3">
                  <h3 className="text-[12px] font-bold text-slate-700"><FrozenText>Quy tắc chuyển trạng thái</FrozenText></h3>
                  <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] leading-4 text-slate-600">
                    <li>• Scheduled → Preparing: <FrozenText>Tự động theo thời gian hoặc manual bởi Leader</FrozenText></li>
                    <li>• Preparing → Live: <FrozenText>Leader bắt đầu ca</FrozenText></li>
                    <li>• Live → Paused: <FrozenText>Leader tạm dừng ca</FrozenText></li>
                    <li>• Live / Paused → Completed: <FrozenText>Leader kết thúc ca</FrozenText></li>
                    <li>• Scheduled → Cancelled: <FrozenText>Leader hủy ca</FrozenText></li>
                  </ul>
                </div>
              </section>
            </div>

            <div className="grid gap-4">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[12px] font-semibold text-slate-500"><FrozenText>Trạng thái hiện tại</FrozenText></div>
                    <div className="mt-1.5 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="text-[14px] font-bold text-slate-900">Scheduled</span></div>
                    <p className="mt-1 text-[12px] leading-4 text-slate-500"><FrozenText>Ca đã được tạo và lên lịch.</FrozenText></p>
                  </div>
                  <span className="rounded-md bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700"><FrozenText>Tiếp theo: Preparing</FrozenText></span>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[13px] font-bold text-slate-900"><FrozenText>Nhân sự được phân công (3)</FrozenText></h2>
                  <button type="button" onClick={() => openPreview('members')} className="text-[12px] font-semibold text-blue-600"><FrozenText>Xem nhân sự</FrozenText></button>
                </div>
                <div className="grid gap-2.5">
                  {ASSIGNED_MEMBERS.map((member) => (
                    <div key={member.name} className="flex items-center gap-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${member.avatar}`}>{member.initials}</span>
                      <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold text-slate-700">{member.name}</div><div className="text-[11px] text-slate-400">{member.role}</div></div>
                      <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${member.statusClass}`}><FrozenText>{member.status}</FrozenText></span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <History className="h-4 w-4 text-blue-600" />
                  <h2 className="text-[13px] font-bold text-slate-900"><FrozenText>Lịch sử trạng thái</FrozenText></h2>
                </div>
                <div className="relative ml-1.5 grid gap-3.5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-slate-200">
                  {HISTORY_ITEMS.map(({ status, date, actor, note, icon: Icon, dot }) => (
                    <div key={status} className="relative flex gap-3">
                      <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${dot}`}><Icon className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0 pt-0.5">
                        <div className="text-[12px] font-bold text-slate-800">{status}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{date}</div>
                        <div className="mt-1 text-[12px] font-medium text-slate-600">{actor}</div>
                        <div className="mt-0.5 text-[12px] leading-4 text-slate-500"><FrozenText>{note}</FrozenText></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {preview === 'none' && (
        <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">
          {qaOpen && (
            <div className="w-[176px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <div className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400">QA States</div>
              <div className="grid gap-1">
                <QaOption onClick={() => openPreview('members')}><FrozenText>Nhân sự</FrozenText></QaOption>
                <QaOption onClick={() => openPreview('attendance')}><FrozenText>Xác nhận tham gia</FrozenText></QaOption>
                <QaOption onClick={() => openPreview('complete')}><FrozenText>Hoàn thành ca</FrozenText></QaOption>
                <QaOption onClick={() => openPreview('cancel')} destructive><FrozenText>Hủy ca</FrozenText></QaOption>
              </div>
            </div>
          )}
          <button type="button" onClick={() => setQaOpen((open) => !open)} aria-expanded={qaOpen} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button>
        </div>
      )}

      {preview === 'members' && <AssignedMembersPanel onClose={closePreview} />}
      {preview === 'attendance' && <AttendanceDialog onClose={closePreview} />}
      {preview === 'complete' && <CompleteDialog onClose={closePreview} />}
      {preview === 'cancel' && <CancelDialog onClose={closePreview} />}
    </div>
  )
}

function FileRow({ icon: Icon, name, size, tone }: { icon: LucideIcon; name: string; size: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-100 px-2.5 py-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0"><div className="truncate text-[12px] font-semibold text-slate-700">{name}</div><div className="text-[11px] text-slate-400">{size}</div></div>
    </div>
  )
}

function StatusNode({ icon: Icon, status, description, color }: { icon: LucideIcon; status: string; description: string; color: string }) {
  return (
    <div className="text-center">
      <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${color}`}><Icon className="h-4 w-4" /></span>
      <div className="mt-2 text-[12px] font-bold text-slate-800">{status}</div>
      <div className="mx-auto mt-1 max-w-[112px] text-[11px] leading-3.5 text-slate-500"><FrozenText>{description}</FrozenText></div>
    </div>
  )
}

function FlowArrow() {
  return <ArrowRight className="mx-auto mt-3 h-4 w-4 text-slate-300" />
}

function QaOption({ children, onClick, destructive = false }: { children: React.ReactNode; onClick: () => void; destructive?: boolean }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-2.5 py-2 text-left text-[12px] font-medium ${destructive ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>{children}</button>
}

function AssignedMembersPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
      <section role="dialog" aria-modal="true" aria-labelledby="members-title" className="w-[470px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg">
        <header className="flex items-start justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-2.5"><h2 id="members-title" className="text-[16px] font-bold text-slate-950">Pharmaton T9</h2><span className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Scheduled</span></div>
          <button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid grid-cols-4 border-b border-slate-200 px-5 text-[12px] font-medium text-slate-500">
          <div className="py-3 text-center"><FrozenText>Tổng quan</FrozenText></div>
          <div className="border-b-2 border-blue-600 py-3 text-center font-semibold text-blue-600"><FrozenText>Nhân sự (3)</FrozenText></div>
          <div className="py-3 text-center"><FrozenText>Ghi chú (2)</FrozenText></div>
          <div className="py-3 text-center"><FrozenText>Lịch sử (5)</FrozenText></div>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-[13px] font-bold text-slate-800"><FrozenText>Nhân sự (3)</FrozenText></h3><button type="button" className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /><span><FrozenText>Thêm nhân sự</FrozenText></span></button></div>
          <div className="overflow-hidden rounded-md border border-slate-200">
            {ASSIGNED_MEMBERS.map((member, index) => (
              <div key={member.name} className={`flex items-center gap-3 px-3 py-3 ${index < ASSIGNED_MEMBERS.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <span className="w-4 text-[11px] font-semibold text-slate-400">{index + 1}</span>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${member.avatar}`}>{member.initials}</span>
                <div className="min-w-0 flex-1"><div className="text-[11px] text-slate-400">{member.role}</div><div className="mt-0.5 truncate text-[12px] font-semibold text-slate-700">{member.name}</div></div>
                <span className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${member.statusClass}`}><FrozenText>{member.status}</FrozenText></span>
                <MoreHorizontal className="h-4 w-4 text-slate-400" />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-md bg-slate-50 p-3">
            <div className="mb-2 text-[12px] font-bold text-slate-700"><FrozenText>Nhân sự dự phòng (1)</FrozenText></div>
            <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-100 text-[12px] font-bold text-cyan-700">PQ</span>
              <div className="min-w-0 flex-1"><div className="text-[11px] text-slate-400">Backup</div><div className="text-[12px] font-semibold text-slate-700">Phạm Quỳnh</div></div>
              <span className="rounded-md bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700"><FrozenText>Sẵn sàng</FrozenText></span>
              <MoreHorizontal className="h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function AttendanceDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Xác nhận tham gia ca" titleId="attendance-title" onClose={onClose}>
      <div className="px-5 pb-4 pt-5 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CalendarDays className="h-6 w-6" /></span>
        <h3 className="mt-4 text-[13px] font-bold text-slate-900"><FrozenText>Bạn có xác nhận tham gia ca này không?</FrozenText></h3>
        <div className="mt-3 text-[13px] font-bold text-slate-800">Pharmaton T9</div>
        <div className="mt-1 text-[12px] text-slate-500">10/09/2026 · 14:00–17:00</div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-600"><MapPin className="h-3.5 w-3.5 text-blue-600" />Studio A</div>
      </div>
      <div className="px-5 pb-5">
        <label className="block text-left text-[12px] font-semibold text-slate-600"><FrozenText>Ghi chú (tùy chọn)</FrozenText><textarea readOnly placeholder="Thêm ghi chú..." className="mt-1.5 h-[64px] w-full resize-none rounded-md border border-slate-200 px-3 py-2.5 text-[12px] font-normal outline-none placeholder:text-slate-300" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3"><SecondaryAction onClick={onClose}>Hủy</SecondaryAction><PrimaryAction><UserRoundCheck className="h-3.5 w-3.5" /><span><FrozenText>Xác nhận tham gia</FrozenText></span></PrimaryAction></div>
      </div>
    </DialogFrame>
  )
}

function CompleteDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
      <section role="dialog" aria-modal="true" aria-labelledby="complete-title" className="relative w-[430px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white px-5 pb-5 pt-5 shadow-lg">
        <button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-md text-slate-400"><X className="h-4 w-4" /></button>
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-6 w-6" /></span>
          <h2 id="complete-title" className="mt-3 text-[14px] font-bold text-slate-950"><FrozenText>Xác nhận hoàn thành ca</FrozenText></h2>
          <p className="mt-1.5 text-[12px] text-slate-600"><FrozenText>Bạn có xác nhận ca này đã hoàn thành?</FrozenText></p>
        </div>
        <div className="mt-4 flex gap-2.5 rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-[12px] leading-4 text-blue-800"><CircleInfoIcon /><p><FrozenText>Hành động này sẽ cập nhật trạng thái ca thành Completed và gửi thông báo cho tất cả thành viên.</FrozenText></p></div>
        <label className="mt-4 block text-[12px] font-semibold text-slate-600"><FrozenText>Ghi chú (tùy chọn)</FrozenText><textarea readOnly placeholder="Thêm ghi chú về kết quả ca..." className="mt-1.5 h-[64px] w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[12px] font-normal outline-none placeholder:text-slate-300" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3"><SecondaryAction onClick={onClose}>Hủy</SecondaryAction><PrimaryAction><CheckCircle2 className="h-3.5 w-3.5" /><span><FrozenText>Hoàn thành ca</FrozenText></span></PrimaryAction></div>
      </section>
    </div>
  )
}

function CancelDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
      <section role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="relative w-[430px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white px-5 pb-5 pt-5 shadow-lg">
        <button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-md text-slate-400"><X className="h-4 w-4" /></button>
        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600"><X className="h-6 w-6" /></span>
          <h2 id="cancel-title" className="mt-3 text-[14px] font-bold text-slate-950"><FrozenText>Hủy ca</FrozenText></h2>
          <p className="mt-1.5 text-[12px] text-slate-600"><FrozenText>Bạn có chắc chắn muốn hủy ca này?</FrozenText></p>
        </div>
        <div className="mt-4 flex gap-2.5 rounded-md border border-amber-100 bg-amber-50 px-3 py-2.5 text-[12px] leading-4 text-amber-800"><CircleAlertIcon /><p><FrozenText>Hành động này không thể hoàn tác và sẽ gửi thông báo cho tất cả thành viên.</FrozenText></p></div>
        <label className="mt-4 block text-[12px] font-semibold text-slate-600"><FrozenText>Lý do hủy *</FrozenText><span className="mt-1.5 flex h-9 items-center justify-between rounded-md border border-slate-200 px-3 text-[12px] font-normal text-slate-400"><span><FrozenText>Chọn lý do...</FrozenText></span><ChevronDown className="h-3.5 w-3.5" /></span></label>
        <label className="mt-3 block text-[12px] font-semibold text-slate-600"><FrozenText>Ghi chú (tùy chọn)</FrozenText><textarea readOnly placeholder="Thêm ghi chú..." className="mt-1.5 h-14 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[12px] font-normal outline-none placeholder:text-slate-300" /></label>
        <div className="mt-4 grid grid-cols-2 gap-3"><SecondaryAction onClick={onClose}>Quay lại</SecondaryAction><button type="button" className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-red-500 text-[12px] font-semibold text-white"><XCircle className="h-3.5 w-3.5" /><span><FrozenText>Hủy ca</FrozenText></span></button></div>
      </section>
    </div>
  )
}

function DialogFrame({ title, titleId, onClose, children }: { title: string; titleId: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-[430px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><h2 id={titleId} className="text-[14px] font-bold text-slate-950"><FrozenText>{title}</FrozenText></h2><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400"><X className="h-4 w-4" /></button></header>
        {children}
      </section>
    </div>
  )
}

function SecondaryAction({ children, onClick }: { children: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="h-9 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-600"><FrozenText>{children}</FrozenText></button>
}

function PrimaryAction({ children }: { children: React.ReactNode }) {
  return <button type="button" className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 text-[12px] font-semibold text-white">{children}</button>
}

function CircleInfoIcon() {
  return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-blue-500 text-[12px] font-bold">i</span>
}

function CircleAlertIcon() {
  return <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500 text-[12px] font-bold">!</span>
}

function FrozenText({ children }: { children: string }) {
  return <><span>{children.slice(0, 1)}</span>{children.slice(1)}</>
}
