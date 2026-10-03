'use client'

import { useState, type ComponentType, type ReactNode } from 'react'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import { PeopleOpsReferenceShell } from './PeopleOpsReferenceShell'

type RegistrationPreview = 'none' | 'approve' | 'reject' | 'risk' | 'batch'

const APPLICANTS = [
  { id: 'mai', initials: 'NM', name: 'Nguyễn Thị Mai', phone: '+84 32 456 7890', shift: '19/09 · 14:00–16:00', brand: 'Pharmaton', platform: 'TikTok', role: 'Host', status: 'Chờ duyệt', statusClass: 'bg-amber-50 text-amber-700', score: '92%', registered: '18/09 10:24', avatar: 'bg-rose-100 text-rose-700' },
  { id: 'nam', initials: 'TV', name: 'Trần Văn Nam', phone: '+84 90 123 4567', shift: '20/09 · 20:00–22:00', brand: 'Lactacyd', platform: 'Shopee', role: 'Support', status: 'Đã duyệt', statusClass: 'bg-emerald-50 text-emerald-700', score: '88%', registered: '18/09 09:15', avatar: 'bg-blue-100 text-blue-700' },
  { id: 'huong', initials: 'LH', name: 'Lê Thị Hương', phone: '+84 98 765 4321', shift: '20/09 · 08:00–10:00', brand: 'Ostelin', platform: 'TikTok', role: 'Host', status: 'Chờ duyệt', statusClass: 'bg-amber-50 text-amber-700', score: '85%', registered: '18/09 16:42', avatar: 'bg-violet-100 text-violet-700' },
  { id: 'quan', initials: 'PQ', name: 'Phạm Minh Quân', phone: '+84 37 888 9999', shift: '20/09 · 14:00–17:00', brand: 'Corbiere', platform: 'Shopee', role: 'Technical', status: 'Đã duyệt', statusClass: 'bg-emerald-50 text-emerald-700', score: '78%', registered: '17/09 11:20', avatar: 'bg-fuchsia-100 text-fuchsia-700' },
  { id: 'ngoc', initials: 'VN', name: 'Vũ Thị Ngọc', phone: '+84 35 222 3344', shift: '21/09 · 10:00–12:00', brand: 'Lactacyd', platform: 'TikTok', role: 'Support', status: 'Cần bổ sung', statusClass: 'bg-blue-50 text-blue-700', score: '72%', registered: '17/09 14:08', avatar: 'bg-amber-100 text-amber-700' },
  { id: 'tuan', initials: 'HT', name: 'Hoàng Anh Tuấn', phone: '+84 93 111 2233', shift: '21/09 · 19:00–22:00', brand: 'Pharmaton', platform: 'TikTok', role: 'Host', status: 'Đã từ chối', statusClass: 'bg-red-50 text-red-600', score: '65%', registered: '17/09 09:33', avatar: 'bg-cyan-100 text-cyan-700' },
  { id: 'linh', initials: 'NL', name: 'Nguyễn Thị Linh', phone: '+84 91 666 7788', shift: '22/09 · 14:00–16:00', brand: 'Ostelin', platform: 'Shopee', role: 'Support', status: 'Chờ duyệt', statusClass: 'bg-amber-50 text-amber-700', score: '90%', registered: '16/09 15:12', avatar: 'bg-indigo-100 text-indigo-700' },
  { id: 'huy', initials: 'DH', name: 'Đỗ Quang Huy', phone: '+84 36 444 5566', shift: '22/09 · 20:00–23:00', brand: 'Corbiere', platform: 'Shopee', role: 'Host', status: 'Đã duyệt', statusClass: 'bg-emerald-50 text-emerald-700', score: '80%', registered: '16/09 10:05', avatar: 'bg-sky-100 text-sky-700' },
] as const

const QA_STATES: { id: Exclude<RegistrationPreview, 'none'>; label: string }[] = [
  { id: 'approve', label: 'Phê duyệt' },
  { id: 'reject', label: 'Từ chối' },
  { id: 'risk', label: 'Điều kiện & rủi ro' },
  { id: 'batch', label: 'Duyệt theo ca' },
]

export function RegistrationReferenceMock({ initialState = 'none' }: { initialState?: RegistrationPreview }) {
  const [selectedId, setSelectedId] = useState('mai')
  const [preview, setPreview] = useState<RegistrationPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const selected = APPLICANTS.find((applicant) => applicant.id === selectedId) ?? APPLICANTS[0]
  const openPreview = (next: Exclude<RegistrationPreview, 'none'>) => { setPreview(next); setQaOpen(false) }

  return (
    <PeopleOpsReferenceShell active="Registration" searchPlaceholder="Tìm kiếm ứng viên, ca làm việc, thương hiệu...">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight text-slate-950">Quản lý đăng ký nhân sự</h1><p className="mt-1 text-[13px] text-slate-500">Xem xét, phê duyệt và phân công ứng viên cho các ca livestream</p></div>
          <div className="flex gap-2"><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600"><CalendarDays className="h-3.5 w-3.5" />Hôm nay (19/09/2026)<ChevronDown className="h-3.5 w-3.5" /></button><button type="button" onClick={() => openPreview('batch')} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white"><Plus className="h-4 w-4" />Tạo đăng ký thủ công</button></div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-3">
          <Metric icon={FileText} label="Tổng đơn đăng ký" value="28" note="↑ 12% so với tuần trước" tone="bg-blue-50 text-blue-600" />
          <Metric icon={Clock3} label="Chờ xem xét" value="8" note="Cần phê duyệt" tone="bg-amber-50 text-amber-600" />
          <Metric icon={CheckCircle2} label="Đã phê duyệt" value="16" note="57% tổng số" tone="bg-emerald-50 text-emerald-600" />
          <Metric icon={XCircle} label="Đã từ chối" value="3" note="11% tổng số" tone="bg-red-50 text-red-600" />
          <Metric icon={Users} label="Chờ bổ sung" value="1" note="Cần thêm thông tin" tone="bg-violet-50 text-violet-600" />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex h-9 min-w-[240px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm kiếm ứng viên...</div>
          {['Tất cả trạng thái', 'Tất cả thương hiệu', 'Tất cả vai trò'].map((label) => <button key={label} type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600">{label}<ChevronDown className="h-3 w-3" /></button>)}
          <button type="button" className="ml-auto h-9 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600">Lọc</button>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-6 border-b border-slate-200 px-4 text-[12px] font-semibold text-slate-500"><span className="border-b-2 border-blue-600 py-3 text-blue-600">Tất cả (28)</span><span>Chờ duyệt (8)</span><span>Đã duyệt (16)</span><span>Từ chối (3)</span><span>Cần bổ sung (1)</span></div>
            <div className="grid grid-cols-[34px_1.2fr_0.95fr_0.72fr_0.62fr_0.78fr_0.62fr_0.7fr_28px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase text-slate-400"><span /><span>Ứng viên</span><span>Ca làm việc</span><span>Thương hiệu</span><span>Vai trò</span><span>Trạng thái</span><span>Phù hợp</span><span>Ngày đăng ký</span><span /></div>
            {APPLICANTS.map((applicant) => (
              <button key={applicant.id} type="button" onClick={() => setSelectedId(applicant.id)} className={`grid w-full grid-cols-[34px_1.2fr_0.95fr_0.72fr_0.62fr_0.78fr_0.62fr_0.7fr_28px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selectedId === applicant.id ? 'bg-blue-50/50' : 'bg-white'}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${applicant.avatar}`}>{applicant.initials}</span>
                <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-slate-800">{applicant.name}</span><span className="block text-[10px] text-slate-400">{applicant.phone}</span></span>
                <span className="text-[11px] leading-4 text-slate-600">{applicant.shift}</span><span className="text-[11px] text-slate-600">{applicant.brand}<small className="block text-[10px] text-slate-400">{applicant.platform}</small></span><span className="w-fit rounded bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">{applicant.role}</span><span className={`w-fit rounded-md px-2 py-1 text-[10px] font-semibold ${applicant.statusClass}`}>{applicant.status}</span><span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><i className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-100"><i className="block h-full w-4/5 bg-emerald-500" /></i>{applicant.score}</span><span className="text-[11px] text-slate-500">{applicant.registered}</span><MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500"><span>Hiển thị 1–8 của 28 kết quả</span><div className="flex gap-1"><span className="rounded border border-slate-200 px-2 py-1">‹</span><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span><span className="rounded border border-slate-200 px-2 py-1">2</span><span className="rounded border border-slate-200 px-2 py-1">3</span><span className="rounded border border-slate-200 px-2 py-1">›</span></div></div>
          </section>

          <ApplicantDetail applicant={selected} onApprove={() => openPreview('approve')} onReject={() => openPreview('reject')} onRisk={() => openPreview('risk')} />
        </div>
      </div>

      {preview === 'none' && <QaController open={qaOpen} setOpen={setQaOpen} onSelect={openPreview} />}
      {preview !== 'none' && <RegistrationDialog state={preview} applicant={selected} onClose={() => setPreview('none')} />}
    </PeopleOpsReferenceShell>
  )
}

function ApplicantDetail({ applicant, onApprove, onReject, onRisk }: { applicant: (typeof APPLICANTS)[number]; onApprove: () => void; onReject: () => void; onRisk: () => void }) {
  return <aside className="rounded-lg border border-slate-200 bg-white"><div className="flex items-start justify-between border-b border-slate-100 px-4 py-4"><div className="flex gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-full text-[12px] font-bold ${applicant.avatar}`}>{applicant.initials}</span><div><h2 className="text-[13px] font-bold text-slate-900">{applicant.name}</h2><p className="mt-0.5 text-[11px] text-slate-400">mai.nguyen@gmail.com</p><p className="text-[11px] text-slate-400">{applicant.phone}</p></div></div><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${applicant.statusClass}`}>{applicant.status}</span></div>
    <div className="grid grid-cols-4 border-b border-slate-200 px-3 text-center text-[11px] text-slate-500"><span className="border-b-2 border-blue-600 py-3 font-semibold text-blue-600">Thông tin</span><span className="py-3">Đăng ký</span><span className="py-3">Lịch sử</span><span className="py-3">Ghi chú</span></div>
    <div className="space-y-4 p-4">
      <InfoBlock title="Ứng viên"><InfoRow icon={Mail} label="Email" value="mai.nguyen@gmail.com" /><InfoRow icon={UserCheck} label="Kinh nghiệm" value="2 năm · 12 ca livestream" /><InfoRow icon={ShieldCheck} label="Vai trò mong muốn" value="Host, Support" /><InfoRow icon={MapPin} label="Địa chỉ" value="TP. Hồ Chí Minh" /></InfoBlock>
      <InfoBlock title="Đăng ký ca"><InfoRow icon={CalendarDays} label="Ca làm việc" value="19/09/2026, 14:00–16:00" /><InfoRow icon={BriefIcon} label="Thương hiệu" value={applicant.brand} /><InfoRow icon={ShieldCheck} label="Vai trò" value={applicant.role} /><InfoRow icon={MapPin} label="Studio" value="Studio A" /></InfoBlock>
      <div><div className="flex items-center justify-between text-[12px] font-bold text-slate-700"><span>Điểm phù hợp</span><span className="text-emerald-600">{applicant.score}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[92%] rounded-full bg-emerald-500" /></div><div className="mt-2 flex flex-wrap gap-1">{['Giao tiếp', 'Livestream', 'Beauty', 'Giới thiệu sản phẩm'].map((skill) => <span key={skill} className="rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{skill}</span>)}</div></div>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onRisk} className="rounded-md bg-emerald-50 p-2 text-left"><span className="block text-[11px] font-semibold text-emerald-700">Đủ điều kiện</span><span className="mt-1 block text-[10px] text-emerald-600">4/5 điều kiện đạt</span></button><button type="button" onClick={onRisk} className="rounded-md bg-amber-50 p-2 text-left"><span className="block text-[11px] font-semibold text-amber-700">Sức chứa 2/4</span><span className="mt-1 block text-[10px] text-amber-600">Còn 2 vị trí</span></button></div>
      <div className="rounded-md border border-amber-100 bg-amber-50 p-2 text-[11px] leading-4 text-amber-700"><strong>Cần xem xét:</strong> Thiết bị cá nhân mới đáp ứng 1/2 yêu cầu. Không có xung đột lịch.</div>
      <div className="flex items-center gap-2 rounded-md border border-slate-100 p-2"><FileText className="h-4 w-4 text-red-500" /><div className="flex-1"><div className="text-[11px] font-semibold">CV_NguyenThiMai.pdf</div><div className="text-[10px] text-slate-400">2.4 MB</div></div></div>
      <div className="grid grid-cols-3 gap-2"><button type="button" onClick={onReject} className="h-8 rounded-md border border-red-200 text-[11px] font-semibold text-red-600">Từ chối</button><button type="button" className="h-9 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-600">Bổ sung</button><button type="button" onClick={onApprove} className="h-8 rounded-md bg-emerald-600 text-[11px] font-semibold text-white">Phê duyệt</button></div>
    </div>
  </aside>
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: Exclude<RegistrationPreview, 'none'>) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[176px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}

function RegistrationDialog({ state, applicant, onClose }: { state: Exclude<RegistrationPreview, 'none'>; applicant: (typeof APPLICANTS)[number]; onClose: () => void }) {
  const titles = { approve: 'Xác nhận phê duyệt', reject: 'Từ chối đăng ký', risk: 'Điều kiện & rủi ro', batch: 'Duyệt đăng ký theo ca' } as const
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35"><section role="dialog" aria-modal="true" aria-label={titles[state]} className={`${state === 'batch' ? 'w-[820px]' : 'w-[470px]'} max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg`}><header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><div><h2 className="text-[14px] font-bold text-slate-900">{titles[state]}</h2><p className="mt-0.5 text-[11px] text-slate-400">{state === 'batch' ? 'Pharmaton Livestream · 23/09/2026' : `${applicant.name} · ${applicant.role}`}</p></div><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400"><X className="h-4 w-4" /></button></header><div className="p-5">{state === 'approve' && <ApproveState applicant={applicant} />}{state === 'reject' && <RejectState />}{state === 'risk' && <RiskState />}{state === 'batch' && <BatchState />}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-5 text-[12px] font-semibold text-slate-600">Hủy</button><button type="button" className={`h-9 rounded-md px-5 text-[12px] font-semibold text-white ${state === 'reject' ? 'bg-red-500' : 'bg-blue-600'}`}>{state === 'reject' ? 'Từ chối đăng ký' : state === 'batch' ? 'Duyệt 2 ứng viên' : 'Phê duyệt'}</button></div></div></section></div>
}

function ApproveState({ applicant }: { applicant: (typeof APPLICANTS)[number] }) {
  return <div><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-6 w-6" /></span><h3 className="mt-3 text-center text-[13px] font-bold">Phê duyệt ứng viên cho ca này?</h3><div className="mt-4 rounded-md bg-slate-50 p-3"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${applicant.avatar}`}>{applicant.initials}</span><div className="flex-1"><div className="text-[12px] font-semibold">{applicant.name}</div><div className="text-[10px] text-slate-400">{applicant.role} · Pharmaton Livestream</div></div><span className="text-[12px] font-bold text-emerald-600">{applicant.score}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded bg-white p-2"><span className="text-slate-400">Sức chứa hiện tại</span><strong className="mt-1 block">2/4</strong></div><div className="rounded bg-white p-2"><span className="text-slate-400">Sau khi duyệt</span><strong className="mt-1 block text-emerald-600">3/4</strong></div></div></div><p className="mt-3 text-center text-[11px] text-slate-500">Ứng viên sẽ nhận thông báo và được thêm vào ca làm việc.</p></div>
}

function RejectState() {
  return <div><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600"><X className="h-6 w-6" /></span><h3 className="mt-3 text-center text-[13px] font-bold">Bạn muốn từ chối đăng ký này?</h3><label className="mt-4 block text-[12px] font-semibold text-slate-600">Lý do từ chối *<span className="mt-1.5 flex h-9 items-center justify-between rounded-md border border-slate-200 px-3 font-normal text-slate-400">Chọn lý do...<ChevronDown className="h-3.5 w-3.5" /></span></label><label className="mt-3 block text-[12px] font-semibold text-slate-600">Ghi chú<textarea readOnly placeholder="Thêm ghi chú cho ứng viên..." className="mt-1.5 h-20 w-full resize-none rounded-md border border-slate-200 p-3 text-[12px] font-normal placeholder:text-slate-300" /></label></div>
}

function RiskState() {
  const checks = [['Kinh nghiệm phù hợp','2/2','ok'],['Đã hoàn thành training','2/2','ok'],['Không trùng lịch','2/2','ok'],['Đủ thiết bị yêu cầu','1/2','warn'],['Không vượt giới hạn ca/tuần','2/2','ok']]
  return <div><div className="grid gap-2">{checks.map(([label,score,tone]) => <div key={label} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${tone === 'ok' ? 'border-emerald-100 bg-emerald-50/50' : 'border-amber-100 bg-amber-50'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full ${tone === 'ok' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{tone === 'ok' ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}</span><span className="flex-1 text-[12px] font-medium text-slate-700">{label}</span><span className={`text-[12px] font-bold ${tone === 'ok' ? 'text-emerald-600' : 'text-amber-600'}`}>{score}</span></div>)}</div><div className="mt-3 rounded-md border border-amber-100 bg-amber-50 p-3 text-[11px] leading-4 text-amber-700"><strong>Rủi ro cần xem xét:</strong> ứng viên chưa xác nhận đủ thiết bị cá nhân. Ca vẫn còn 2/4 vị trí và không có xung đột lịch.</div></div>
}

function BatchState() {
  const candidates = [['Nguyễn Thị Mai','Host','12 ca','Đủ điều kiện'],['Trần Văn Nam','Support','8 ca','Đủ điều kiện'],['Lê Thị Hương','Host','3 ca','Cần xem xét'],['Phạm Minh Quân','Technical','0 ca','Không đủ điều kiện']]
  return <div><div className="grid grid-cols-4 gap-3 text-center">{[['1','Chọn ca làm việc'],['2','Xem ứng viên'],['3','Xác nhận & phân công'],['4','Hoàn tất']].map(([step,label],index) => <div key={step} className="relative"><span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${index === 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{step}</span><div className="mt-1 text-[11px] font-semibold text-slate-600">{label}</div></div>)}</div><div className="mt-4 grid grid-cols-[1fr_270px] gap-4"><div><div className="mb-2 flex items-center justify-between"><h3 className="text-[12px] font-bold">Danh sách ứng viên (8)</h3><span className="text-[11px] font-semibold text-blue-600">Đã chọn 2 người</span></div><div className="overflow-hidden rounded-md border border-slate-200">{candidates.map(([name,role,experience,eligibility],index) => <div key={name} className="grid grid-cols-[28px_1fr_70px_54px_92px] items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0"><span className={`flex h-4 w-4 items-center justify-center rounded border ${index < 2 ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>{index < 2 && <Check className="h-3 w-3" />}</span><span className="text-[12px] font-semibold">{name}</span><span className="text-[11px] text-slate-500">{role}</span><span className="text-[11px] text-slate-500">{experience}</span><span className={`rounded px-2 py-1 text-[10px] font-semibold ${eligibility === 'Đủ điều kiện' ? 'bg-emerald-50 text-emerald-700' : eligibility === 'Cần xem xét' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>{eligibility}</span></div>)}</div></div><div className="grid gap-3"><div className="rounded-md border border-slate-200 p-3"><h3 className="text-[12px] font-bold">Pharmaton Livestream</h3><div className="mt-2 text-[11px] leading-5 text-slate-500">23/09/2026 · 09:00–11:00<br />Studio A · TikTok<br /><strong className="text-emerald-600">Còn 2/4 vị trí</strong></div></div><div className="rounded-md border border-slate-200 p-3"><h3 className="text-[12px] font-bold">Vai trò cần tuyển</h3><div className="mt-2 grid grid-cols-2 gap-2 text-[11px]"><span className="rounded bg-blue-50 p-2 text-blue-700">Host · 2/2</span><span className="rounded bg-violet-50 p-2 text-violet-700">Support · 1/2</span><span className="rounded bg-red-50 p-2 text-red-600">Technical · 0/1</span><span className="rounded bg-amber-50 p-2 text-amber-700">Camera · 0/1</span></div></div></div></div></div>
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof Users; label: string; value: string; note: string; tone: string }) {
  return <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"><span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span><div><div className="text-[12px] text-slate-500">{label}</div><div className="text-[20px] font-bold leading-6 text-slate-900">{value}</div><div className="text-[11px] text-slate-400">{note}</div></div></div>
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3 className="mb-2 text-[12px] font-bold text-slate-800">{title}</h3>{children}</section>
}

function InfoRow({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="mb-2 grid grid-cols-[18px_94px_1fr] items-center text-[11px] last:mb-0"><Icon className="h-3.5 w-3.5 text-slate-400" /><span className="text-slate-400">{label}</span><span className="truncate font-medium text-slate-700">{value}</span></div>
}

function BriefIcon({ className }: { className?: string }) {
  return <span className={`flex items-center justify-center rounded border border-current text-[10px] ${className ?? ''}`}>B</span>
}
