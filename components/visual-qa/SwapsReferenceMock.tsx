'use client'

import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  History,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react'
import { OpsWorkflowReferenceShell } from './OpsWorkflowReferenceShell'

type SwapPreview = 'none' | 'create' | 'detail' | 'participant' | 'approve' | 'conflict' | 'history' | 'success' | 'empty'

const SWAPS = [
  { id: 'SWP-001', date: '10/09/2026', time: '14:00–17:00', shift: 'Pharmaton T9', studio: 'Studio A', from: 'Trần Mai', fromRole: 'Host', to: 'Lê Hoàng', toRole: 'Camera', reason: 'Bận lịch học', status: 'Chờ phản hồi', statusClass: 'bg-amber-50 text-amber-700', updated: '09/09 10:24' },
  { id: 'SWP-002', date: '11/09/2026', time: '20:00–23:00', shift: 'Lactacyd D9', studio: 'Studio B', from: 'Nguyễn Thu Hà', fromRole: 'Camera', to: 'Phạm Anh', toRole: 'Camera', reason: 'Đổi ca hỗ trợ team', status: 'Chờ phê duyệt', statusClass: 'bg-amber-50 text-amber-700', updated: '09/09 15:12' },
  { id: 'SWP-003', date: '12/09/2026', time: '14:00–17:00', shift: 'Ostelin', studio: 'Studio C', from: 'Lê Minh', fromRole: 'Support', to: 'Đỗ Mai Linh', toRole: 'Support', reason: 'Bận việc gia đình', status: 'Đã phê duyệt', statusClass: 'bg-emerald-50 text-emerald-700', updated: '08/09 16:30' },
  { id: 'SWP-004', date: '14/09/2026', time: '19:00–23:00', shift: 'M&M’s', studio: 'Studio A', from: 'Phạm Anh', fromRole: 'Camera', to: 'Trần Minh Quân', toRole: 'Camera', reason: 'Đổi ca hỗ trợ', status: 'Đã hoàn tất', statusClass: 'bg-blue-50 text-blue-700', updated: '07/09 11:05' },
  { id: 'SWP-005', date: '15/09/2026', time: '14:00–17:00', shift: 'Lactacyd', studio: 'Studio B', from: 'Lê Hoàng', fromRole: 'Host', to: 'Dương', toRole: 'Host', reason: 'Bận lịch học', status: 'Đã từ chối', statusClass: 'bg-red-50 text-red-600', updated: '06/09 14:20' },
  { id: 'SWP-006', date: '18/09/2026', time: '20:00–23:00', shift: 'Pharmaton', studio: 'Studio A', from: 'Nhật Linh', fromRole: 'Producer', to: 'Kiệt', toRole: 'Producer', reason: 'Lý do cá nhân', status: 'Đã phê duyệt', statusClass: 'bg-emerald-50 text-emerald-700', updated: '05/09 09:12' },
  { id: 'SWP-007', date: '20/09/2026', time: '10:00–14:00', shift: 'Corbiere', studio: 'Studio C', from: 'Minh Anh', fromRole: 'Support', to: 'Khánh', toRole: 'Support', reason: 'Hỗ trợ đồng đội', status: 'Chờ phản hồi', statusClass: 'bg-amber-50 text-amber-700', updated: '04/09 17:45' },
  { id: 'SWP-008', date: '22/09/2026', time: '14:00–17:00', shift: 'Enterogermina', studio: 'Studio B', from: 'Dương', fromRole: 'Camera', to: 'Hà My', toRole: 'Camera', reason: 'Đổi ca gia đình', status: 'Đã hủy', statusClass: 'bg-slate-100 text-slate-500', updated: '04/09 10:10' },
] as const

const SWAP_STATUS_COUNTS = {
  total: 12,
  waitingResponse: 3,
  waitingApproval: 3,
  approved: 3,
  rejected: 1,
  completed: 1,
  cancelled: 1,
} as const

const QA_STATES: { id: Exclude<SwapPreview, 'none'>; label: string }[] = [
  { id: 'create', label: 'Tạo yêu cầu' },
  { id: 'detail', label: 'Chi tiết yêu cầu' },
  { id: 'participant', label: 'Phản hồi người nhận' },
  { id: 'approve', label: 'Leader phê duyệt' },
  { id: 'conflict', label: 'Xung đột lịch' },
  { id: 'history', label: 'Lịch sử yêu cầu' },
  { id: 'success', label: 'Hoàn tất' },
  { id: 'empty', label: 'Danh sách trống' },
]

export function SwapsReferenceMock({ initialState = 'none' }: { initialState?: SwapPreview }) {
  const [preview, setPreview] = useState<SwapPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('SWP-002')
  const selected = SWAPS.find((swap) => swap.id === selectedId) ?? SWAPS[1]
  const openPreview = (next: Exclude<SwapPreview, 'none'>) => { setPreview(next); setQaOpen(false) }

  return (
    <OpsWorkflowReferenceShell active="Swaps" searchPlaceholder="Tìm kiếm ca, thành viên, brand, studio...">
      <main className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight text-slate-950">Swaps</h1><p className="mt-1 text-[13px] text-slate-500">Quản lý yêu cầu đổi ca, theo dõi trạng thái và phê duyệt</p></div>
          <div className="flex gap-2"><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-600"><Download className="h-3.5 w-3.5" />Xuất Excel</button><button type="button" onClick={() => openPreview('create')} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white"><Plus className="h-4 w-4" />Tạo yêu cầu đổi ca</button></div>
        </div>

        <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-7 border-b border-slate-200 px-4 text-[12px] font-semibold text-slate-500">
            {[`Tất cả (${SWAP_STATUS_COUNTS.total})`, `Chờ phản hồi (${SWAP_STATUS_COUNTS.waitingResponse})`, `Chờ phê duyệt (${SWAP_STATUS_COUNTS.waitingApproval})`, `Đã phê duyệt (${SWAP_STATUS_COUNTS.approved})`, `Đã từ chối (${SWAP_STATUS_COUNTS.rejected})`, `Đã hoàn tất (${SWAP_STATUS_COUNTS.completed})`].map((tab, index) => <button key={tab} type="button" className={`py-3 ${index === 0 ? 'border-b-2 border-blue-600 text-blue-600' : ''}`}>{tab}</button>)}
          </div>
          <div className="flex items-center gap-2 border-b border-slate-200 p-3">
            <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600"><CalendarDays className="h-3.5 w-3.5" />01/09/2026 – 30/09/2026<ChevronDown className="h-3 w-3" /></button>
            {['Tất cả brand', 'Tất cả studio', 'Tất cả trạng thái'].map((label) => <button key={label} type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600">{label}<ChevronDown className="h-3 w-3" /></button>)}
            <div className="ml-auto flex h-9 w-[248px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm kiếm tên, người đổi...</div>
          </div>

          {preview === 'empty' ? <EmptyState onBack={() => setPreview('none')} /> : <SwapTable selectedId={selectedId} onSelect={(id) => { setSelectedId(id); openPreview('detail') }} />}
        </section>
      </main>

      {preview === 'none' && <QaController open={qaOpen} setOpen={setQaOpen} onSelect={(next) => { setSelectedId('SWP-002'); openPreview(next) }} />}
      {preview !== 'none' && preview !== 'empty' && <SwapDialog state={preview} swap={selected} onClose={() => setPreview('none')} />}
    </OpsWorkflowReferenceShell>
  )
}

function SwapTable({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return <><div className="grid grid-cols-[70px_88px_1.25fr_1fr_24px_1fr_1fr_88px_34px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase text-slate-400"><span>Mã</span><span>Ngày</span><span>Ca đổi</span><span>Người yêu cầu</span><span /><span>Người được đề xuất</span><span>Lý do</span><span>Trạng thái</span><span /></div>
    {SWAPS.map((swap) => <button key={swap.id} type="button" onClick={() => onSelect(swap.id)} className={`grid w-full grid-cols-[70px_88px_1.25fr_1fr_24px_1fr_1fr_88px_34px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selectedId === swap.id ? 'bg-blue-50/40' : 'bg-white'}`}><span className="text-[11px] font-semibold text-slate-500">{swap.id}</span><span className="text-[11px] text-slate-500">{swap.date}</span><span><strong className="block text-[12px] text-slate-800">{swap.shift}</strong><small className="text-[10px] text-slate-400">{swap.time} · {swap.studio}</small></span><Identity initials={swap.from.split(' ').map((part) => part[0]).slice(-2).join('')} name={swap.from} role={swap.fromRole} /><ArrowRight className="h-3.5 w-3.5 text-slate-300" /><Identity initials={swap.to.split(' ').map((part) => part[0]).slice(-2).join('')} name={swap.to} role={swap.toRole} /><span className="text-[11px] text-slate-600">{swap.reason}<small className="mt-0.5 block text-[10px] text-slate-400">{swap.updated}</small></span><span className={`w-fit rounded-md px-2 py-1 text-[10px] font-semibold ${swap.statusClass}`}>{swap.status}</span><MoreHorizontal className="h-3.5 w-3.5 text-slate-400" /></button>)}
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500"><span>Hiển thị 1–8 của {SWAP_STATUS_COUNTS.total} yêu cầu</span><div className="flex gap-1"><span className="rounded border border-slate-200 px-2 py-1">‹</span><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span><span className="rounded border border-slate-200 px-2 py-1">2</span><span className="rounded border border-slate-200 px-2 py-1">›</span></div></div></>
}

function Identity({ initials, name, role }: { initials: string; name: string; role: string }) {
  return <span className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">{initials}</span><span className="min-w-0"><strong className="block truncate text-[11px] text-slate-700">{name}</strong><small className="text-[10px] text-slate-400">{role}</small></span></span>
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: Exclude<SwapPreview, 'none'>) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[180px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}

function SwapDialog({ state, swap, onClose }: { state: Exclude<SwapPreview, 'none' | 'empty'>; swap: (typeof SWAPS)[number]; onClose: () => void }) {
  const titles = { create: 'Tạo yêu cầu đổi ca', detail: 'Chi tiết yêu cầu đổi ca', participant: 'Xác nhận đổi ca', approve: 'Phê duyệt yêu cầu đổi ca', conflict: 'Không thể phê duyệt', history: 'Lịch sử yêu cầu đổi ca', success: 'Yêu cầu đã được phê duyệt' } as const
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35"><section role="dialog" aria-modal="true" aria-label={titles[state]} className={`${state === 'create' || state === 'detail' || state === 'approve' || state === 'history' ? 'w-[650px]' : 'w-[470px]'} max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg`}><header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><div><h2 className="text-[14px] font-bold text-slate-900">{titles[state]}</h2><p className="mt-0.5 text-[11px] text-slate-400">{state === 'create' ? 'Chọn ca, người nhận và xác nhận thông tin' : `${swap.id} · ${swap.shift}`}</p></div><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400"><X className="h-4 w-4" /></button></header><div className="p-5">{state === 'create' && <CreateState />}{state === 'detail' && <DetailState swap={swap} />}{state === 'participant' && <ParticipantState swap={swap} />}{state === 'approve' && <ApprovalState swap={swap} />}{state === 'conflict' && <ConflictState swap={swap} />}{state === 'history' && <HistoryState swap={swap} />}{state === 'success' && <SuccessState swap={swap} />}<DialogActions state={state} onClose={onClose} /></div></section></div>
}

function CreateState() {
  return <div><Stepper current={2} labels={['Chọn ca', 'Chọn người', 'Thông tin', 'Xác nhận']} /><div className="mt-5 grid grid-cols-2 gap-4"><div className="space-y-3"><Field label="Ca cần đổi"><ShiftCard swap={SWAPS[0]} /></Field><Field label="Lý do"><SelectValue value="Bận lịch học" /></Field><Field label="Ghi chú"><div className="h-14 rounded-md border border-slate-200 p-3 text-[11px] text-slate-400">Mình bận lịch học buổi chiều, bạn hỗ trợ mình với nhé!</div></Field></div><div><Field label="Chọn người đổi ca"><div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[11px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm tên, vai trò...</div></Field><div className="mt-2 space-y-1.5">{[['LH', 'Lê Hoàng', 'Camera · Đang rảnh'], ['PA', 'Phạm Anh', 'Support · Đang rảnh'], ['D', 'Dương', 'Host · Đang bận'], ['HM', 'Hà My', 'Support · Đang rảnh']].map(([initials, name, note], index) => <button key={name} type="button" className={`flex w-full items-center gap-3 rounded-md border p-2 text-left ${index === 1 ? 'border-blue-400 bg-blue-50' : 'border-slate-100'}`}><span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">{initials}</span><span className="flex-1"><strong className="block text-[12px]">{name}</strong><small className="text-[10px] text-slate-400">{note}</small></span><span className={`h-3 w-3 rounded-full border ${index === 1 ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`} /></button>)}</div></div></div></div>
}

function DetailState({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div className="grid grid-cols-[1.05fr_0.95fr] gap-5"><div className="space-y-3"><InfoRow label="Mã yêu cầu" value={swap.id} /><InfoRow label="Ngày tạo" value="09/09/2026 14:10" /><InfoRow label="Ca làm việc" value={`${swap.shift} · ${swap.date} · ${swap.time}`} /><InfoRow label="Địa điểm" value={swap.studio} /><InfoRow label="Lý do" value={swap.reason} /><div className="rounded-md bg-blue-50 p-3 text-[11px] leading-4 text-blue-700">“Mình cần đổi ca để hỗ trợ lịch team, bạn xác nhận giúp mình nhé!”</div><div className="flex items-center gap-3 rounded-md border border-slate-100 p-3"><Identity initials="NH" name={swap.from} role={swap.fromRole} /><ArrowRight className="h-4 w-4 text-blue-500" /><Identity initials="PA" name={swap.to} role={swap.toRole} /></div></div><Timeline swap={swap} compact /></div>
}

function ParticipantState({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div><div className="flex items-center justify-between"><Identity initials="PA" name={swap.to} role={swap.toRole} /><span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Chờ phản hồi</span></div><div className="mt-4"><ShiftCard swap={swap} /></div><div className="mt-3 rounded-md bg-slate-50 p-3 text-[11px] leading-4 text-slate-600"><strong>Lý do:</strong> {swap.reason}<br />“Bạn có thể hỗ trợ mình ca này được không?”</div></div>
}

function ApprovalState({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div><div className="grid grid-cols-[1fr_36px_1fr] items-center gap-3"><PersonCard initials="NH" name={swap.from} role={swap.fromRole} label="Người yêu cầu" /><ArrowRight className="mx-auto h-5 w-5 text-blue-500" /><PersonCard initials="PA" name={swap.to} role={swap.toRole} label="Người thay thế" /></div><div className="mt-4 grid grid-cols-3 gap-2"><CheckCard label="Vai trò phù hợp" value="Đạt" /><CheckCard label="Xung đột lịch" value="Không có" /><CheckCard label="Giới hạn ca/tuần" value="4/6" /></div><div className="mt-3 rounded-md bg-slate-50 p-3 text-[11px] text-slate-600"><strong>Ca làm việc:</strong> {swap.shift} · {swap.date} · {swap.time} · {swap.studio}<br /><strong>Lý do:</strong> {swap.reason}<br /><span className="mt-1 block text-slate-400">Ảnh hưởng: Không ảnh hưởng lịch tổng thể.</span></div><label className="mt-3 block text-[11px] font-semibold text-slate-600">Ghi chú phê duyệt<div className="mt-1 h-12 rounded-md border border-slate-200 p-3 font-normal text-slate-400">Nhập ghi chú (tùy chọn)...</div></label></div>
}

function ConflictState({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600"><XCircle className="h-7 w-7" /></span><h3 className="mt-3 text-[14px] font-bold text-red-600">Không thể phê duyệt</h3><p className="mt-1 text-[12px] text-slate-500">Người thay thế đã có ca trùng thời gian.</p><div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-left"><div className="flex items-center gap-2 text-[12px] font-semibold text-red-700"><CircleAlert className="h-4 w-4" />Yêu cầu: {swap.shift}</div><p className="mt-2 text-[11px] leading-4 text-red-600">{swap.date} · {swap.time} · {swap.studio}<br />Lý do: {swap.reason}<br />{swap.to} đang có một ca khác trùng thời gian.</p></div></div>
}

function HistoryState({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div><div className="grid grid-cols-4 gap-2"><Summary label="Ca làm việc" value={swap.shift} /><Summary label="Lịch ca" value={`${swap.date} · ${swap.time}`} /><Summary label="Địa điểm" value={swap.studio} /><Summary label="Lý do" value={swap.reason} /></div><div className="mt-5"><Timeline swap={swap} /></div></div>
}

function SuccessState({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-7 w-7" /></span><h3 className="mt-3 text-[14px] font-bold">Yêu cầu đổi ca đã được phê duyệt</h3><p className="mt-1 text-[11px] text-slate-500">Lịch làm việc đã được cập nhật cho cả hai bên · Lý do: {swap.reason}</p><div className="mt-4 rounded-md bg-slate-50 p-3 text-left"><ShiftCard swap={swap} /><div className="mt-3 flex items-center justify-center gap-3"><Identity initials="NH" name={swap.from} role={swap.fromRole} /><ArrowRight className="h-4 w-4 text-blue-500" /><Identity initials="PA" name={swap.to} role={swap.toRole} /></div></div></div>
}

function DialogActions({ state, onClose }: { state: Exclude<SwapPreview, 'none' | 'empty'>; onClose: () => void }) {
  if (state === 'detail' || state === 'history' || state === 'conflict' || state === 'success') return <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">{state === 'success' ? 'Xem chi tiết' : 'Quay lại'}</button></div>
  return <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-red-200 px-5 text-[12px] font-semibold text-red-600">{state === 'create' ? 'Hủy' : 'Từ chối'}</button><button type="button" className={`h-9 rounded-md px-5 text-[12px] font-semibold text-white ${state === 'participant' || state === 'approve' ? 'bg-emerald-600' : 'bg-blue-600'}`}>{state === 'create' ? 'Gửi yêu cầu' : state === 'participant' ? 'Chấp nhận' : 'Phê duyệt'}</button></div>
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return <div className="flex h-[430px] flex-col items-center justify-center text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500"><Send className="h-7 w-7" /></span><h2 className="mt-4 text-[14px] font-bold">Chưa có yêu cầu đổi ca</h2><p className="mt-1 text-[12px] text-slate-500">Bạn chưa có yêu cầu đổi ca nào trong khoảng thời gian này.</p><button type="button" onClick={onBack} className="mt-4 h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Quay về danh sách</button></div>
}

function Stepper({ current, labels }: { current: number; labels: string[] }) {
  return <div className="grid grid-cols-4">{labels.map((label, index) => <div key={label} className="relative text-center"><span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${index + 1 <= current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{index + 1}</span><span className={`mt-1 block text-[10px] ${index + 1 === current ? 'font-semibold text-blue-600' : 'text-slate-400'}`}>{label}</span>{index < labels.length - 1 && <span className="absolute left-[58%] top-3 h-px w-[84%] bg-slate-200" />}</div>)}</div>
}

function ShiftCard({ swap }: { swap: (typeof SWAPS)[number] }) {
  return <div className="rounded-md border border-slate-200 bg-white p-3"><strong className="text-[12px] text-slate-800">{swap.shift}</strong><div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{swap.date}</span><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{swap.time}</span><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{swap.studio}</span></div></div>
}

function Timeline({ swap, compact = false }: { swap: (typeof SWAPS)[number]; compact?: boolean }) {
  const entries = [['09/09 14:10', 'Tạo yêu cầu', swap.from, swap.reason], ['09/09 14:32', 'Chấp nhận', swap.to, 'Đồng ý nhận ca thay thế.'], ['09/09 15:05', 'Phê duyệt', 'Trần Minh Anh', 'Đủ điều kiện và không xung đột.'], ['09/09 15:12', 'Hoàn tất', 'Hệ thống', 'Lịch đã được cập nhật cho cả hai bên.']] as const
  return <div><h3 className="flex items-center gap-2 text-[12px] font-bold text-slate-700"><History className="h-4 w-4 text-blue-500" />Lịch sử hành động</h3><div className="mt-3 space-y-0">{entries.slice(0, compact ? 3 : 4).map(([time, action, actor, note], index) => <div key={action} className="relative flex gap-3 pb-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${index === entries.length - 1 ? 'bg-emerald-500' : 'bg-blue-500'}`} />{index < (compact ? 2 : 3) && <span className="absolute left-[4px] top-3 h-[calc(100%-5px)] w-px bg-slate-200" />}<div><div className="text-[11px] font-semibold text-slate-700">{action} · <span className="font-normal text-slate-400">{time}</span></div><div className="mt-0.5 text-[10px] text-slate-500">{actor} — {note}</div></div></div>)}</div></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-[11px] font-semibold text-slate-600">{label}<div className="mt-1">{children}</div></label>
}

function SelectValue({ value }: { value: string }) {
  return <div className="flex h-9 items-center justify-between rounded-md border border-slate-200 px-3 text-[11px] font-normal text-slate-600">{value}<ChevronDown className="h-3.5 w-3.5" /></div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[92px_1fr] text-[11px]"><span className="text-slate-400">{label}</span><strong className="font-medium text-slate-700">{value}</strong></div>
}

function PersonCard({ initials, name, role, label }: { initials: string; name: string; role: string; label: string }) {
  return <div className="rounded-md border border-slate-100 p-3"><span className="text-[10px] uppercase text-slate-400">{label}</span><div className="mt-2"><Identity initials={initials} name={name} role={role} /></div></div>
}

function CheckCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-emerald-50 p-2"><div className="flex items-center gap-1 text-[10px] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />{label}</div><strong className="mt-1 block text-[11px] text-emerald-700">{value}</strong></div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-2"><span className="text-[10px] text-slate-400">{label}</span><strong className="mt-1 block text-[11px] text-slate-700">{value}</strong></div>
}
