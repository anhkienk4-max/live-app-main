'use client'

import { useState, type ReactNode } from 'react'
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  CircleX,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { PeopleOpsReferenceShell } from './PeopleOpsReferenceShell'

const STAFF = [
  { id: 'mai', initials: 'NM', name: 'Nguyễn Thị Mai', email: 'mai.nguyen@gmail.com', phone: '+84 32 456 7890', role: 'Host', brand: 'Pharmaton', platforms: 'TikTok · Shopee', skills: ['Livestream', 'Sales', '+2'], status: 'Hoạt động', statusClass: 'bg-emerald-50 text-emerald-700', joined: '15/03/2024', avatar: 'bg-rose-100 text-rose-700' },
  { id: 'nam', initials: 'TV', name: 'Trần Văn Nam', email: 'nam.tran@gmail.com', phone: '+84 90 123 4567', role: 'Support', brand: 'Lactacyd', platforms: 'Shopee · Facebook', skills: ['Support', 'Chat', '+1'], status: 'Hoạt động', statusClass: 'bg-emerald-50 text-emerald-700', joined: '20/04/2024', avatar: 'bg-blue-100 text-blue-700' },
  { id: 'huong', initials: 'LH', name: 'Lê Thị Hương', email: 'huong.le@gmail.com', phone: '+84 98 765 4321', role: 'Host', brand: 'Ostelin', platforms: 'TikTok', skills: ['Livestream', 'Content'], status: 'Hoạt động', statusClass: 'bg-emerald-50 text-emerald-700', joined: '10/02/2024', avatar: 'bg-violet-100 text-violet-700' },
  { id: 'quan', initials: 'PQ', name: 'Phạm Minh Quân', email: 'quan.pham@gmail.com', phone: '+84 37 888 9999', role: 'Technical', brand: 'Corbiere', platforms: 'TikTok · Shopee', skills: ['Technical', 'Setup', '+1'], status: 'Hoạt động', statusClass: 'bg-emerald-50 text-emerald-700', joined: '05/01/2024', avatar: 'bg-fuchsia-100 text-fuchsia-700' },
  { id: 'ngoc', initials: 'VN', name: 'Vũ Thị Ngọc', email: 'ngoc.vu@gmail.com', phone: '+84 35 222 3344', role: 'Support', brand: 'Lactacyd', platforms: 'Shopee · Facebook', skills: ['Support', 'Moderator'], status: 'Tạm nghỉ', statusClass: 'bg-amber-50 text-amber-700', joined: '18/06/2024', avatar: 'bg-amber-100 text-amber-700' },
  { id: 'tuan', initials: 'HA', name: 'Hoàng Anh Tuấn', email: 'tuan.hoang@gmail.com', phone: '+84 93 111 2233', role: 'Host', brand: 'Pharmaton', platforms: 'TikTok', skills: ['Livestream', 'Sales'], status: 'Hoạt động', statusClass: 'bg-emerald-50 text-emerald-700', joined: '12/03/2024', avatar: 'bg-cyan-100 text-cyan-700' },
  { id: 'linh', initials: 'NL', name: 'Nguyễn Thị Linh', email: 'linh.nguyen@gmail.com', phone: '+84 91 666 7788', role: 'Support', brand: 'Ostelin', platforms: 'Shopee', skills: ['Support', 'Content'], status: 'Chờ kích hoạt', statusClass: 'bg-blue-50 text-blue-700', joined: '01/09/2024', avatar: 'bg-indigo-100 text-indigo-700' },
  { id: 'huy', initials: 'DH', name: 'Đỗ Quang Huy', email: 'huy.do@gmail.com', phone: '+84 36 444 5566', role: 'Host', brand: 'Corbiere', platforms: 'TikTok · Facebook', skills: ['Livestream', 'Engagement'], status: 'Đã rời', statusClass: 'bg-red-50 text-red-600', joined: '28/02/2024', avatar: 'bg-sky-100 text-sky-700' },
] as const

const ROLE_CLASS: Record<(typeof STAFF)[number]['role'], string> = {
  Host: 'bg-blue-50 text-blue-700',
  Support: 'bg-violet-50 text-violet-700',
  Technical: 'bg-emerald-50 text-emerald-700',
}

export function PeopleReferenceMock() {
  const [selectedId, setSelectedId] = useState('mai')
  const selected = STAFF.find((person) => person.id === selectedId) ?? STAFF[0]

  return (
    <PeopleOpsReferenceShell active="Staff" searchPlaceholder="Tìm kiếm nhân sự, email, vai trò, kỹ năng...">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight text-slate-950">Quản lý nhân sự</h1><p className="mt-1 text-[13px] text-slate-500">Quản lý hồ sơ, vai trò, kỹ năng và phân công nhân sự cho các livestream</p></div>
          <button type="button" className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white"><Plus className="h-4 w-4" />Thêm nhân sự</button>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-3">
          <Metric icon={Users} label="Tổng nhân sự" value="48" note="↑ 12% so với tháng trước" tone="bg-blue-50 text-blue-600" />
          <Metric icon={CheckCircle2} label="Đang hoạt động" value="42" note="88% tổng số" tone="bg-emerald-50 text-emerald-600" />
          <Metric icon={CirclePause} label="Tạm nghỉ" value="4" note="8% tổng số" tone="bg-amber-50 text-amber-600" />
          <Metric icon={CircleX} label="Đã rời" value="2" note="4% tổng số" tone="bg-red-50 text-red-600" />
          <Metric icon={UserPlus} label="Chờ kích hoạt" value="3" note="Cần phê duyệt" tone="bg-violet-50 text-violet-600" />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex h-9 min-w-[240px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm kiếm nhân sự...</div>
          {['Tất cả trạng thái', 'Tất cả vai trò', 'Tất cả thương hiệu', 'Tất cả nền tảng'].map((label) => <button key={label} type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600">{label}<ChevronDown className="h-3 w-3" /></button>)}
          <button type="button" className="ml-auto h-9 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600">Bộ lọc</button>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="grid grid-cols-[34px_1.35fr_0.62fr_0.72fr_0.9fr_1.05fr_0.8fr_0.72fr_28px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span /><span>Nhân sự</span><span>Vai trò</span><span>Thương hiệu</span><span>Nền tảng</span><span>Kỹ năng</span><span>Trạng thái</span><span>Ngày tham gia</span><span />
            </div>
            {STAFF.map((person) => (
              <button key={person.id} type="button" onClick={() => setSelectedId(person.id)} className={`grid w-full grid-cols-[34px_1.35fr_0.62fr_0.72fr_0.9fr_1.05fr_0.8fr_0.72fr_28px] items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selectedId === person.id ? 'bg-blue-50/50' : 'bg-white'}`}>
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${person.avatar}`}>{person.initials}</span>
                <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-slate-800">{person.name}</span><span className="block truncate text-[11px] text-slate-400">{person.email}</span></span>
                <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-semibold ${ROLE_CLASS[person.role]}`}>{person.role}</span>
                <span className="truncate text-[11px] text-slate-600">{person.brand}</span>
                <span className="truncate text-[11px] text-slate-600">{person.platforms}</span>
                <span className="flex gap-1">{person.skills.map((skill) => <span key={skill} className="rounded bg-slate-100 px-1.5 py-1 text-[10px] text-slate-600">{skill}</span>)}</span>
                <span className={`w-fit rounded-md px-2 py-1 text-[10px] font-semibold ${person.statusClass}`}>{person.status}</span>
                <span className="text-[11px] text-slate-500">{person.joined}</span>
                <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500"><span>Hiển thị 1–8 của 48 nhân sự</span><div className="flex gap-1"><span className="rounded border border-slate-200 px-2 py-1">‹</span><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span><span className="rounded border border-slate-200 px-2 py-1">2</span><span className="rounded border border-slate-200 px-2 py-1">3</span></div></div>
          </section>

          <aside className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-4">
              <div className="flex gap-3"><span className={`flex h-12 w-12 items-center justify-center rounded-full text-[13px] font-bold ${selected.avatar}`}>{selected.initials}</span><div><h2 className="text-[14px] font-bold text-slate-900">{selected.name}</h2><p className="mt-0.5 text-[12px] text-slate-400">{selected.email}</p><span className={`mt-1.5 inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${selected.statusClass}`}>{selected.status}</span></div></div>
              <button type="button" aria-label="Đóng bảng thông tin" className="text-slate-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-4 border-b border-slate-200 px-3 text-center text-[11px] text-slate-500"><span className="border-b-2 border-blue-600 py-3 font-semibold text-blue-600">Thông tin</span><span className="py-3">Vai trò</span><span className="py-3">Lịch sử</span><span className="py-3">Tài liệu</span></div>
            <div className="space-y-4 p-4">
              <DetailSection title="Thông tin cá nhân">
                <DetailRow icon={Mail} label="Email" value={selected.email} /><DetailRow icon={Phone} label="Số điện thoại" value={selected.phone} /><DetailRow icon={CalendarDays} label="Ngày sinh" value="15/08/1998" /><DetailRow icon={MapPin} label="Địa chỉ" value="TP. Hồ Chí Minh, Việt Nam" />
              </DetailSection>
              <DetailSection title="Vai trò & phân công">
                <div className="grid grid-cols-[96px_1fr] gap-y-2 text-[11px]"><span className="text-slate-400">Vai trò chính</span><span className={`w-fit rounded px-2 py-1 font-semibold ${ROLE_CLASS[selected.role]}`}>{selected.role}</span><span className="text-slate-400">Thương hiệu</span><span>{selected.brand}</span><span className="text-slate-400">Nền tảng</span><span>{selected.platforms}</span><span className="text-slate-400">Studio mặc định</span><span>Studio A</span></div>
              </DetailSection>
              <DetailSection title="Kỹ năng nổi bật"><div className="flex flex-wrap gap-1.5">{['Host live', 'Skincare', 'Tư vấn', 'TikTok Shop', 'Makeup'].map((skill) => <span key={skill} className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{skill}</span>)}</div></DetailSection>
              <div className="grid grid-cols-3 gap-2">{[['28', 'Tổng ca đã làm'], ['96%', 'Tỷ lệ hoàn thành'], ['4.8/5', 'Đánh giá TB']].map(([value, label]) => <div key={label} className="rounded-md bg-slate-50 p-2 text-center"><div className="text-[13px] font-bold text-slate-800">{value}</div><div className="mt-1 text-[10px] text-slate-400">{label}</div></div>)}</div>
              <DetailSection title="Ghi chú"><p className="rounded-md bg-slate-50 p-2 text-[11px] leading-4 text-slate-600">Host chính cho các brand Healthcare và Beauty. Giao tiếp tốt, xử lý tình huống linh hoạt.</p></DetailSection>
              <div className="grid grid-cols-2 gap-2"><button type="button" className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-blue-200 text-[12px] font-semibold text-blue-700"><Pencil className="h-3.5 w-3.5" />Chỉnh sửa</button><button type="button" className="h-8 rounded-md border border-red-200 text-[12px] font-semibold text-red-600">Tạm khóa</button></div>
            </div>
          </aside>
        </div>
      </div>
    </PeopleOpsReferenceShell>
  )
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof Users; label: string; value: string; note: string; tone: string }) {
  return <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"><span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span><div><div className="text-[12px] text-slate-500">{label}</div><div className="text-[20px] font-bold leading-6 text-slate-900">{value}</div><div className="text-[11px] text-slate-400">{note}</div></div></div>
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3 className="mb-2 text-[12px] font-bold text-slate-800">{title}</h3>{children}</section>
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return <div className="mb-2 grid grid-cols-[18px_92px_1fr] items-center text-[11px] last:mb-0"><Icon className="h-3.5 w-3.5 text-slate-400" /><span className="text-slate-400">{label}</span><span className="truncate font-medium text-slate-700">{value}</span></div>
}
