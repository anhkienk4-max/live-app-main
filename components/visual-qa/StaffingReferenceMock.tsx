'use client'

import { useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Download,
  History,
  Lightbulb,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react'
import { PeopleOpsReferenceShell } from './PeopleOpsReferenceShell'

type StaffingPreview = 'none' | 'approvals' | 'assign' | 'balance' | 'notify' | 'schedule' | 'history'

const SHIFTS = [
  { date: '10/09/2026', time: '14:00–17:00', name: 'Pharmaton – TikTok Live', studio: 'Studio A', need: 'Host +2', capacity: '3/3', status: 'Đủ nhân sự', statusClass: 'bg-emerald-50 text-emerald-700' },
  { date: '11/09/2026', time: '10:00–13:00', name: 'Ostelin – Shopee Live', studio: 'Studio B', need: 'Host +1', capacity: '2/3', status: 'Cần bổ sung', statusClass: 'bg-amber-50 text-amber-700' },
  { date: '12/09/2026', time: '19:00–22:00', name: 'Lactacyd – TikTok Live', studio: 'Tòa nhà ADA', need: 'Host +2', capacity: '1/3', status: 'Chờ duyệt', statusClass: 'bg-amber-50 text-amber-700' },
  { date: '14/09/2026', time: '14:00–17:00', name: 'Corbiere – Shopee Live', studio: 'Studio A', need: 'Host +2', capacity: '3/3', status: 'Đủ nhân sự', statusClass: 'bg-emerald-50 text-emerald-700' },
  { date: '15/09/2026', time: '10:00–13:00', name: 'All Healthcare – Mega Live', studio: 'Studio A', need: 'Host +3', capacity: '4/4', status: 'Đủ nhân sự', statusClass: 'bg-emerald-50 text-emerald-700' },
  { date: '19/09/2026', time: '20:00–23:00', name: 'M&M’s – TikTok Live', studio: 'Studio C', need: 'Host +2', capacity: '2/3', status: 'Chờ duyệt', statusClass: 'bg-amber-50 text-amber-700' },
  { date: '25/09/2026', time: '14:00–17:00', name: 'Pharmaton – Payday', studio: 'Tòa nhà ADA', need: 'Host +2', capacity: '3/3', status: 'Đủ nhân sự', statusClass: 'bg-emerald-50 text-emerald-700' },
] as const

const ASSIGNMENTS = [
  { role: 'Host', need: '1', assigned: '1', missing: '0', name: 'Minh', initials: 'M', status: 'Đã xác nhận', avatar: 'bg-rose-100 text-rose-700' },
  { role: 'Co-host', need: '1', assigned: '1', missing: '0', name: 'Khánh', initials: 'K', status: 'Đã xác nhận', avatar: 'bg-slate-200 text-slate-700' },
  { role: 'Producer', need: '1', assigned: '1', missing: '0', name: 'Nhật Linh', initials: 'NL', status: 'Đã xác nhận', avatar: 'bg-blue-100 text-blue-700' },
  { role: 'Camera', need: '1', assigned: '1', missing: '0', name: 'Dương', initials: 'D', status: 'Đã xác nhận', avatar: 'bg-cyan-100 text-cyan-700' },
  { role: 'Support', need: '1', assigned: '1', missing: '0', name: 'Hà My', initials: 'HM', status: 'Đã xác nhận', avatar: 'bg-violet-100 text-violet-700' },
  { role: 'Backup', need: '1', assigned: '0', missing: '1', name: 'Chưa phân', initials: '+', status: 'Cần bổ sung', avatar: 'bg-amber-50 text-amber-600' },
] as const

const QA_STATES: { id: Exclude<StaffingPreview, 'none'>; label: string }[] = [
  { id: 'approvals', label: 'Duyệt đăng ký' },
  { id: 'assign', label: 'Thêm nhân sự' },
  { id: 'balance', label: 'Cân đối tự động' },
  { id: 'notify', label: 'Gửi thông báo' },
  { id: 'schedule', label: 'Lịch trình nhân sự' },
  { id: 'history', label: 'Lịch sử phân ca' },
]

export function StaffingReferenceMock({ initialState = 'none' }: { initialState?: StaffingPreview }) {
  const [preview, setPreview] = useState<StaffingPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const openPreview = (next: Exclude<StaffingPreview, 'none'>) => { setPreview(next); setQaOpen(false) }

  return (
    <PeopleOpsReferenceShell active="Staffing" searchPlaceholder="Tìm kiếm nhân sự, ca làm việc, thương hiệu...">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight text-slate-950">Staffing Management</h1><p className="mt-1 text-[13px] text-slate-500">Quản lý nhân sự cho các ca livestream, phê duyệt và điều phối theo năng lực</p></div>
          <div className="flex gap-2"><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600"><Download className="h-3.5 w-3.5" />Xuất Excel</button><button type="button" onClick={() => openPreview('assign')} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white"><UserPlus className="h-4 w-4" />Phân công nhân sự</button></div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600"><CalendarDays className="h-3.5 w-3.5" />01/09/2026 – 30/09/2026<ChevronDown className="h-3 w-3" /></button>
          {['Tất cả địa điểm', 'Tất cả trạng thái', 'Tất cả vai trò'].map((label) => <button key={label} type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600">{label}<ChevronDown className="h-3 w-3" /></button>)}
          <button type="button" className="ml-auto h-9 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600">Bộ lọc khác</button>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_326px] items-start gap-4">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-6 border-b border-slate-200 px-4 text-[12px] font-semibold text-slate-500"><span className="border-b-2 border-blue-600 py-3 text-blue-600">Tất cả ca (12)</span><span>Chờ duyệt (4)</span><span>Đã duyệt (6)</span><span>Cần bổ sung (2)</span><span>Xung đột (0)</span></div>
            <div className="grid grid-cols-[84px_82px_1.25fr_0.72fr_0.62fr_0.7fr_0.72fr_28px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase text-slate-400"><span>Ngày</span><span>Thời gian</span><span>Tên ca</span><span>Địa điểm</span><span>Vai trò cần</span><span>Đăng ký</span><span>Trạng thái</span><span /></div>
            {SHIFTS.map((shift, index) => (
              <div key={shift.name} className={`grid grid-cols-[84px_82px_1.25fr_0.72fr_0.62fr_0.7fr_0.72fr_28px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${index === 0 ? 'bg-blue-50/40' : ''}`}>
                <span className="text-[11px] text-slate-600">{shift.date}</span><span className="text-[11px] text-slate-600">{shift.time}</span><span className="text-[12px] font-semibold text-slate-800">{shift.name}</span><span className="text-[11px] text-slate-500">{shift.studio}</span><span className="w-fit rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{shift.need}</span><span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><span className="flex -space-x-1"><i className="h-5 w-5 rounded-full border-2 border-white bg-rose-100" /><i className="h-5 w-5 rounded-full border-2 border-white bg-blue-100" /></span>{shift.capacity}</span><span className={`w-fit rounded-md px-2 py-1 text-[10px] font-semibold ${shift.statusClass}`}>{shift.status}</span><MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 text-[11px] text-slate-500"><span>Hiển thị 1–7 của 12 ca</span><div className="flex gap-1"><span className="rounded border border-slate-200 px-2 py-1">‹</span><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span><span className="rounded border border-slate-200 px-2 py-1">2</span><span className="rounded border border-slate-200 px-2 py-1">›</span></div></div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="border-b border-slate-100 pb-3"><div className="flex items-center justify-between"><h2 className="text-[14px] font-bold text-slate-900">Pharmaton – TikTok Live</h2><span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">Sắp diễn ra</span></div><div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500"><span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />10/09/2026</span><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />14:00–17:00</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Studio A</span></div></div>
            <div className="flex items-center gap-4 border-b border-slate-100 py-3"><div className="relative flex h-16 w-16 items-center justify-center rounded-full border-[7px] border-emerald-500 border-r-slate-200"><span className="text-[14px] font-bold">83%</span></div><div><div className="text-[12px] font-bold text-slate-800">Tổng quan phân ca</div><div className="mt-1 text-[11px] text-slate-500">5/6 vị trí đã phân</div><div className="mt-1 text-[11px] font-semibold text-amber-600">Còn thiếu 1 vị trí Backup</div></div></div>
            <div className="py-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-[12px] font-bold text-slate-800">Vai trò & nhân sự (5/6)</h3><button type="button" onClick={() => openPreview('assign')} className="text-[11px] font-semibold text-blue-600">+ Thêm nhân sự</button></div><div className="grid gap-1.5">{ASSIGNMENTS.map((item) => <div key={item.role} className="grid grid-cols-[62px_34px_1fr_auto] items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5"><span className="text-[11px] font-medium text-slate-600">{item.role}</span><span className="text-[11px] font-semibold text-slate-700">{item.assigned}/{item.need}</span><span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><i className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] not-italic ${item.avatar}`}>{item.initials}</i>{item.name}</span><span className={`rounded px-1.5 py-1 text-[10px] font-semibold ${item.missing === '1' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{item.status}</span></div>)}</div></div>
            <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700"><strong>Khoảng trống cần xử lý:</strong> Chưa có nhân sự dự phòng cho vai trò Backup.</div>
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => openPreview('approvals')} className="h-9 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-600">Duyệt đăng ký (4)</button><button type="button" onClick={() => openPreview('notify')} className="h-9 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-600">Gửi thông báo</button><button type="button" onClick={() => openPreview('balance')} className="h-9 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-600">Cân đối tự động</button><button type="button" onClick={() => openPreview('history')} className="h-9 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-600">Lịch sử phân ca</button></div>
          </aside>
        </div>
      </div>

      {preview === 'none' && <QaController open={qaOpen} setOpen={setQaOpen} onSelect={openPreview} />}
      {preview !== 'none' && <StaffingStateDialog state={preview} onClose={() => setPreview('none')} />}
    </PeopleOpsReferenceShell>
  )
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: Exclude<StaffingPreview, 'none'>) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[178px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}

function StaffingStateDialog({ state, onClose }: { state: Exclude<StaffingPreview, 'none'>; onClose: () => void }) {
  const titles = { approvals: 'Duyệt đăng ký cho ca', assign: 'Thêm nhân sự vào vị trí', balance: 'Gợi ý cân đối nhân sự', notify: 'Gửi thông báo cho nhân sự', schedule: 'Lịch trình nhân sự', history: 'Lịch sử phân ca' } as const
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
      <section role="dialog" aria-modal="true" aria-label={titles[state]} className="w-[520px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><div><h2 className="text-[14px] font-bold text-slate-900">{titles[state]}</h2><p className="mt-0.5 text-[11px] text-slate-400">Pharmaton – TikTok Live · 10/09/2026 · Studio A</p></div><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400"><X className="h-4 w-4" /></button></header>
        <div className="p-5">
          {state === 'approvals' && <ApprovalState />}
          {state === 'assign' && <AssignState />}
          {state === 'balance' && <BalanceState />}
          {state === 'notify' && <NotifyState />}
          {state === 'schedule' && <ScheduleState />}
          {state === 'history' && <HistoryState />}
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-5 text-[12px] font-semibold text-slate-600">Hủy</button><button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Hoàn tất</button></div>
        </div>
      </section>
    </div>
  )
}

function ApprovalState() {
  const people = [['Minh', 'Host', 'M'], ['Khánh', 'Co-host', 'K'], ['Dương', 'Producer', 'D'], ['Hà My', 'Camera', 'HM']]
  return <div><div className="mb-3 text-[12px] font-bold text-slate-700">Đăng ký cho ca này (4)</div><div className="overflow-hidden rounded-md border border-slate-200">{people.map(([name, role, initials]) => <div key={name} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">{initials}</span><div className="flex-1"><div className="text-[12px] font-semibold">{name}</div><div className="text-[10px] text-slate-400">{role}</div></div><button type="button" className="h-7 rounded-md bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-700">Chấp nhận</button><button type="button" className="h-7 rounded-md border border-red-200 px-3 text-[11px] font-semibold text-red-600">Từ chối</button></div>)}</div></div>
}

function AssignState() {
  const people = [['Kiệt', 'Backup · phù hợp vị trí', 'K'], ['Phương Anh', 'Support · 3 lần', 'PA'], ['Tuấn', 'Camera · 2 lần', 'T'], ['Gia Hân', 'Host · sẵn sàng', 'GH']]
  return <div><label className="text-[12px] font-semibold text-slate-600">Vị trí cần bổ sung<span className="mt-1.5 flex h-9 items-center justify-between rounded-md border border-slate-200 px-3 font-normal">Backup<ChevronDown className="h-3.5 w-3.5" /></span></label><div className="mt-3 flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm tên, email hoặc vai trò...</div><div className="mt-3 overflow-hidden rounded-md border border-slate-200">{people.map(([name, note, initials]) => <div key={name} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-[11px] font-bold text-violet-700">{initials}</span><div className="flex-1"><div className="text-[12px] font-semibold">{name}</div><div className="text-[10px] text-slate-400">{note}</div></div><button type="button" className="flex h-7 items-center gap-1 rounded-md bg-blue-50 px-3 text-[11px] font-semibold text-blue-700"><Plus className="h-3 w-3" />Chọn</button></div>)}</div></div>
}

function BalanceState() {
  return <div><div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700"><Lightbulb className="h-4 w-4" />Gợi ý dựa trên lịch sử tham gia, kỹ năng và độ phù hợp.</div><div className="mt-3 grid gap-2">{[['Kiệt', 'Phù hợp vị trí Backup', '96%'], ['Phương Anh', 'Đã từng làm Support', '88%'], ['Tuấn', 'Kinh nghiệm Camera', '82%']].map(([name, note, score]) => <div key={name} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Sparkles className="h-4 w-4" /></span><div className="flex-1"><div className="text-[12px] font-semibold">{name}</div><div className="text-[10px] text-slate-400">{note}</div></div><span className="text-[12px] font-bold text-emerald-600">{score}</span><button type="button" className="h-7 rounded-md bg-blue-50 px-3 text-[11px] font-semibold text-blue-700">Thêm</button></div>)}</div></div>
}

function NotifyState() {
  return <div><div className="grid grid-cols-2 gap-2 text-[11px]">{ASSIGNMENTS.slice(0, 5).map((person) => <label key={person.name} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-white"><Check className="h-3 w-3" /></span><span>{person.name} ({person.role})</span></label>)}</div><label className="mt-3 block text-[12px] font-semibold text-slate-600">Nội dung tin nhắn<textarea readOnly defaultValue="Xin chào, ca Pharmaton T9 sẽ diễn ra vào 14:00–17:00 ngày 10/09 tại Studio A. Vui lòng check lịch và chuẩn bị nhé!" className="mt-1.5 h-24 w-full resize-none rounded-md border border-slate-200 p-3 text-[12px] font-normal leading-4" /></label><div className="mt-2 flex justify-end text-[10px] text-slate-400">92/500</div></div>
}

function ScheduleState() {
  return <div><div className="grid grid-cols-7 gap-1 rounded-md bg-slate-50 p-2 text-center">{[['T2','7'],['T3','8'],['T4','9'],['T5','10'],['T6','11'],['T7','12'],['CN','13']].map(([day,date]) => <div key={day} className={`rounded-md py-2 ${date === '10' ? 'bg-blue-600 text-white' : ''}`}><div className="text-[10px]">{day}</div><div className="mt-1 text-[12px] font-bold">{date}</div></div>)}</div><div className="mt-3 grid gap-2"><div className="rounded-md border-l-2 border-blue-500 bg-slate-50 px-3 py-2 text-[11px]"><strong>14:00–17:00</strong><span className="ml-4">Pharmaton – TikTok Live · Studio A</span></div><div className="rounded-md border-l-2 border-emerald-500 bg-slate-50 px-3 py-2 text-[11px]"><strong>20:00–23:00</strong><span className="ml-4">M&M’s – TikTok Live · Studio C</span></div></div></div>
}

function HistoryState() {
  return <div className="relative ml-2 grid gap-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-slate-200">{[['Đã phân Minh vào vị trí Host','09/09/2026 10:24 · Kiên (Admin)'],['Đã phân Khánh vào vị trí Co-host','09/09/2026 10:25 · Kiên (Admin)'],['Đã phân Nhật Linh vào vị trí Producer','09/09/2026 10:26 · Kiên (Admin)'],['Cập nhật thông tin ca','08/09/2026 16:12 · Minh (Lead)']].map(([title,note]) => <div key={title} className="relative flex gap-3"><span className="z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600"><History className="h-3 w-3" /></span><div><div className="text-[12px] font-semibold text-slate-700">{title}</div><div className="mt-0.5 text-[10px] text-slate-400">{note}</div></div></div>)}</div>
}
