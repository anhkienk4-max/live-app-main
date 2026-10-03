'use client'

import { useState, type ReactNode } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  Filter,
  Laptop,
  MapPin,
  MoreHorizontal,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react'
import { AdminSystemReferenceShell } from './AdminSystemReferenceShell'

type AuditView = 'compare' | 'json' | 'table'
type AuditResult = 'Thành công' | 'Thất bại'

const AUDIT_LOGS: { id: string; date: string; time: string; initials: string; actor: string; role: string; action: string; object: string; area: string; result: AuditResult; ip: string }[] = [
  { id: 'AUD-1258', date: '23/09/2026', time: '14:32:18', initials: 'NM', actor: 'Nguyễn Thị Mai', role: 'Admin', action: 'Cập nhật thông tin nhân sự', object: 'Nguyễn Văn A · staff_001', area: 'Nhân sự', result: 'Thành công', ip: '192.168.1.10' },
  { id: 'AUD-1257', date: '23/09/2026', time: '14:28:45', initials: 'TV', actor: 'Trần Văn Nam', role: 'Leader', action: 'Duyệt đăng ký ca làm việc', object: 'Đặng Thị Hương · reg_456', area: 'Đăng ký', result: 'Thành công', ip: '192.168.1.11' },
  { id: 'AUD-1256', date: '23/09/2026', time: '14:15:33', initials: 'LH', actor: 'Lê Minh Đức', role: 'Admin', action: 'Tạo chiến dịch mới', object: 'BST Thu Đông 2026 · camp_789', area: 'Chiến dịch', result: 'Thành công', ip: '192.168.1.10' },
  { id: 'AUD-1255', date: '23/09/2026', time: '13:42:11', initials: 'HN', actor: 'Hoàng Anh Tuấn', role: 'Admin', action: 'Cập nhật quyền người dùng', object: 'Phạm Thị Lan · user_321', area: 'Người dùng', result: 'Thành công', ip: '192.168.1.12' },
  { id: 'AUD-1254', date: '23/09/2026', time: '11:20:05', initials: 'TT', actor: 'Trần Thu Trang', role: 'Leader', action: 'Xóa ca làm việc', object: 'Ca 20/09 14:00 · shift_654', area: 'Ca làm việc', result: 'Thành công', ip: '192.168.1.11' },
  { id: 'AUD-1253', date: '23/09/2026', time: '10:18:27', initials: 'DQ', actor: 'Đỗ Quang Huy', role: 'Admin', action: 'Nhập dữ liệu nhân sự', object: 'staff_import_sep.xlsx · imp_987', area: 'Nhập dữ liệu', result: 'Thành công', ip: '192.168.1.10' },
  { id: 'AUD-1252', date: '22/09/2026', time: '16:45:12', initials: 'NM', actor: 'Nguyễn Minh Quân', role: 'Leader', action: 'Cập nhật lịch phát sóng', object: 'Livestream #1234 · live_456', area: 'Live', result: 'Thành công', ip: '192.168.1.13' },
  { id: 'AUD-1251', date: '22/09/2026', time: '15:32:41', initials: 'VN', actor: 'Vũ Thị Ngọc', role: 'Admin', action: 'Duyệt hoán đổi ca', object: 'Swap #789 · swap_789', area: 'Đổi ca', result: 'Thành công', ip: '192.168.1.10' },
  { id: 'AUD-1250', date: '22/09/2026', time: '14:18:33', initials: 'PL', actor: 'Phạm Thị Linh', role: 'Admin', action: 'Cập nhật cài đặt hệ thống', object: 'Cấu hình chung', area: 'Cài đặt', result: 'Thành công', ip: '192.168.1.10' },
  { id: 'AUD-1249', date: '22/09/2026', time: '11:05:17', initials: 'KL', actor: 'Kiều Long', role: 'Admin', action: 'Đăng nhập hệ thống', object: 'Phiên đăng nhập', area: 'Xác thực', result: 'Thất bại', ip: '192.168.1.12' },
]

const SETTINGS_SESSION = 'session_01K9L3M7N5'
const SETTINGS_TIMESTAMP = '2026-09-22T14:18:33+07:00'
const SETTINGS_CHANGES = [
  { field: 'timezone', before: 'Asia/Bangkok', after: 'Asia/Ho_Chi_Minh' },
  { field: 'default_shift_duration', before: 180, after: 210 },
  { field: 'auto_reminder', before: false, after: true },
] as const
const SETTINGS_JSON = JSON.stringify({
  entity: 'general_settings',
  action: 'UPDATE',
  actor: 'Phạm Thị Linh',
  module: 'Cài đặt',
  session_id: SETTINGS_SESSION,
  device: 'Chrome 128 · Windows 11',
  ip: '192.168.1.10',
  changes: Object.fromEntries(SETTINGS_CHANGES.map(({ field, before, after }) => [field, { before, after }])),
  updated_at: SETTINGS_TIMESTAMP,
}, null, 2)

export function AuditReferenceMock() {
  const [selectedId, setSelectedId] = useState('AUD-1250')
  const [view, setView] = useState<AuditView>('compare')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const selected = AUDIT_LOGS.find((entry) => entry.id === selectedId) ?? AUDIT_LOGS[0]

  return (
    <AdminSystemReferenceShell active="Audit" searchPlaceholder="Tìm kiếm audit log, người dùng, hành động...">
      <main className="px-6 py-5">
        <header className="flex items-start justify-between"><div><h1 className="text-[22px] font-bold tracking-tight">Nhật ký hệ thống (Audit Log)</h1><p className="mt-1 text-[12px] text-slate-500">Theo dõi toàn bộ hoạt động và thay đổi quan trọng trong hệ thống</p></div><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold"><Download className="h-3.5 w-3.5" />Xuất dữ liệu</button></header>
        <div className="mt-4 flex gap-2"><FilterButton icon={<CalendarDays className="h-3.5 w-3.5" />} label="19/09/2026 – 25/09/2026" wide />{['Tất cả module', 'Tất cả hành động', 'Tất cả người dùng', 'Tất cả trạng thái'].map((label) => <FilterButton key={label} label={label} />)}<button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold"><Filter className="h-3.5 w-3.5" />Lọc</button></div>

        <div className={`mt-3 grid gap-4 ${detailsOpen ? 'grid-cols-[minmax(0,1fr)_350px]' : 'grid-cols-1'}`}>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="grid grid-cols-[92px_1.05fr_1.2fr_0.72fr_1fr_84px_28px] gap-2 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold uppercase text-slate-400"><span>Thời gian</span><span>Người dùng</span><span>Hành động</span><span>Khu vực</span><span>Đối tượng</span><span>Kết quả</span><span /></div>
            {AUDIT_LOGS.map((entry) => <button key={entry.id} type="button" onClick={() => { setSelectedId(entry.id); setDetailsOpen(true) }} className={`grid w-full grid-cols-[92px_1.05fr_1.2fr_0.72fr_1fr_84px_28px] items-center gap-2 border-t border-slate-100 px-4 py-2 text-left ${selectedId === entry.id ? 'bg-blue-50' : 'bg-white'}`}><span className="text-[10px] text-slate-500"><strong className="block text-[11px] text-slate-700">{entry.date}</strong>{entry.time}</span><span className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{entry.initials}</span><span className="min-w-0"><strong className="block truncate text-[11px]">{entry.actor}</strong><small className="text-[10px] text-slate-400">{entry.role}</small></span></span><span className="truncate text-[11px] font-medium">{entry.action}</span><span className="w-fit rounded bg-violet-50 px-2 py-1 text-[10px] text-violet-600">{entry.area}</span><span className="truncate text-[10px] text-slate-500">{entry.object}</span><ResultBadge result={entry.result} /><MoreHorizontal className="h-3.5 w-3.5 text-slate-400" /></button>)}
            <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400"><span>Hiển thị 1–10 của 1.245 kết quả</span><div className="flex gap-1"><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span>{['2', '3', '4', '5', '…', '125'].map((page) => <span key={page} className="rounded border border-slate-200 px-2 py-1">{page}</span>)}</div></footer>
          </section>
          {detailsOpen && <AuditDetail entry={selected} view={view} setView={setView} onClose={() => setDetailsOpen(false)} />}
        </div>
      </main>
    </AdminSystemReferenceShell>
  )
}

function AuditDetail({ entry, view, setView, onClose }: { entry: (typeof AUDIT_LOGS)[number]; view: AuditView; setView: (value: AuditView) => void; onClose: () => void }) {
  return <aside className="rounded-lg border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h2 className="text-[14px] font-bold">Chi tiết hoạt động</h2><button type="button" onClick={onClose} aria-label="Đóng chi tiết"><XCircle className="h-4 w-4 text-slate-400" /></button></header><div className="p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600"><ClipboardList className="h-4 w-4" /></span><div className="min-w-0 flex-1"><strong className="block text-[12px]">{entry.action}</strong><span className="text-[10px] text-slate-400">{entry.date} · {entry.time}</span></div><ResultBadge result={entry.result} /></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-slate-50 p-3"><Context icon={<UserRound className="h-3.5 w-3.5" />} label="Người thực hiện" value={entry.actor} meta={`${entry.role} · admin@company.com`} /><Context icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Module / Hành động" value={`${entry.area} · UPDATE`} meta={entry.id} /><Context icon={<Laptop className="h-3.5 w-3.5" />} label="Thiết bị" value="Web Browser" meta="Chrome 128 · Windows 11" /><Context icon={<MapPin className="h-3.5 w-3.5" />} label="Nguồn / Vị trí" value={entry.ip} meta="TP. Hồ Chí Minh" /></div><h3 className="mt-4 text-[12px] font-bold">Thông tin đối tượng</h3><div className="mt-2 grid grid-cols-2 gap-y-2 rounded-md border border-slate-100 p-3 text-[11px]"><span className="text-slate-400">Loại đối tượng</span><strong>{entry.area}</strong><span className="text-slate-400">Đối tượng</span><strong>{entry.object}</strong><span className="text-slate-400">Phiên làm việc</span><strong>{SETTINGS_SESSION}</strong><span className="text-slate-400">Trang trước / sau</span><strong>/admin/settings/general</strong></div><h3 className="mt-4 text-[12px] font-bold">Thay đổi dữ liệu</h3><div className="mt-2 flex border-b border-slate-200">{([['compare', 'So sánh thay đổi'], ['json', 'Dữ liệu JSON'], ['table', 'Dạng bảng']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`flex-1 py-2 text-[11px] font-semibold ${view === id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-400'}`}>{label}</button>)}</div><div className="mt-3">{view === 'compare' && <CompareView />}{view === 'json' && <JsonView />}{view === 'table' && <TableView />}</div><div className="mt-3"><span className="text-[11px] font-semibold">Ghi chú</span><p className="mt-1 rounded-md bg-slate-50 p-2 text-[10px] leading-4 text-slate-500">Cập nhật múi giờ, thời lượng ca mặc định và nhắc việc tự động.</p></div></div></aside>
}

function CompareView() { return <div className="grid grid-cols-[1fr_18px_1fr] items-center gap-2"><div className="rounded-md bg-red-50 p-3"><strong className="text-[11px] text-red-600">Giá trị trước</strong>{SETTINGS_CHANGES.map(({ field, before }) => <DiffLine key={field} label={field} value={String(before)} />)}</div><Arrow /><div className="rounded-md bg-emerald-50 p-3"><strong className="text-[11px] text-emerald-600">Giá trị sau</strong>{SETTINGS_CHANGES.map(({ field, after }) => <DiffLine key={field} label={field} value={String(after)} />)}</div></div> }
function JsonView() { return <div className="relative rounded-md bg-slate-900 p-3 font-mono text-[10px] leading-4 text-emerald-300"><button type="button" className="absolute right-2 top-2 flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-slate-200"><Copy className="h-3 w-3" />Copy</button><pre>{SETTINGS_JSON}</pre></div> }
function TableView() { return <div className="overflow-hidden rounded-md border border-slate-100 text-[11px]"><div className="grid grid-cols-3 bg-slate-50 px-3 py-2 font-semibold"><span>Trường</span><span>Giá trị cũ</span><span>Giá trị mới</span></div>{SETTINGS_CHANGES.map(({ field, before, after }) => <div key={field} className="grid grid-cols-3 border-t border-slate-100 px-3 py-2"><strong>{field}</strong><span className="text-red-600">{String(before)}</span><span className="text-emerald-600">{String(after)}</span></div>)}</div> }

function Arrow() { return <span className="text-center text-[13px] text-blue-500">→</span> }
function DiffLine({ label, value }: { label: string; value: string }) { return <div className="mt-2"><span className="block text-[10px] text-slate-400">{label}</span><span className="text-[11px] font-medium">{value}</span></div> }
function Context({ icon, label, value, meta }: { icon: ReactNode; label: string; value: string; meta: string }) { return <div className="flex gap-2">{icon}<div className="min-w-0"><span className="block text-[10px] text-slate-400">{label}</span><strong className="block truncate text-[11px]">{value}</strong><span className="block truncate text-[10px] text-slate-400">{meta}</span></div></div> }
function ResultBadge({ result }: { result: AuditResult }) { return <span className={`flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${result === 'Thành công' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{result === 'Thành công' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{result}</span> }
function FilterButton({ icon, label, wide = false }: { icon?: ReactNode; label: string; wide?: boolean }) { return <button type="button" className={`flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-600 ${wide ? 'w-[210px]' : 'min-w-[132px]'}`}>{icon}{label}<ChevronDown className="ml-auto h-3 w-3" /></button> }
