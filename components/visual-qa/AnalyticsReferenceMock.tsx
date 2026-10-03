'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  Filter,
  MoreHorizontal,
  Search,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import { InsightsReferenceShell } from './InsightsReferenceShell'

type AnalyticsPreview = 'none' | 'filter' | 'comparison' | 'drilldown' | 'export' | 'missing'

const BRANDS = [
  { name: 'Pharmaton', shifts: 8, revenue: 520, views: 300, share: 29, color: 'bg-blue-600' },
  { name: 'Lactacyd', shifts: 6, revenue: 420, views: 260, share: 23, color: 'bg-indigo-500' },
  { name: 'Ostelin', shifts: 5, revenue: 360, views: 220, share: 20, color: 'bg-amber-500' },
  { name: 'Corbiere', shifts: 4, revenue: 280, views: 170, share: 16, color: 'bg-red-400' },
  { name: 'Enterogermina', shifts: 3, revenue: 160, views: 150, share: 9, color: 'bg-violet-400' },
  { name: 'Khác', shifts: 2, revenue: 60, views: 100, share: 3, color: 'bg-sky-400' },
] as const

const LIVE_ROWS = [
  ['10/09', '20:00–23:00', 'Pharmaton', 'Pharmaton T9', 'TikTok', 'Studio A', 'Trần Mai', 'Hoàn thành', '120M', '86.2K'],
  ['10/09', '14:00–17:00', 'Lactacyd', 'Gentle Care', 'Shopee', 'Studio B', 'Lê Minh', 'Hoàn thành', '95M', '72.1K'],
  ['09/09', '20:00–23:00', 'Ostelin', 'Calcium + D3', 'TikTok', 'Studio C', 'Khánh', 'Đang live', '—', '24.5K'],
  ['09/09', '14:00–17:00', 'Corbiere', 'Calcium Plus', 'Shopee', 'Studio A', 'Nhật Linh', 'Đã duyệt', '88M', '62.3K'],
  ['08/09', '19:00–22:00', 'M&M’s', 'M&M’s', 'TikTok', 'Studio B', 'Dương', 'Hoàn thành', '76M', '55.4K'],
] as const

const QA_STATES: { id: Exclude<AnalyticsPreview, 'none'>; label: string }[] = [
  { id: 'filter', label: 'Bộ lọc chi tiết' },
  { id: 'comparison', label: 'So sánh kỳ trước' },
  { id: 'drilldown', label: 'Chi tiết hiệu suất' },
  { id: 'export', label: 'Xuất dữ liệu' },
  { id: 'missing', label: 'Thiếu chỉ số' },
]

export function AnalyticsReferenceMock({ initialState = 'none' }: { initialState?: AnalyticsPreview }) {
  const [preview, setPreview] = useState<AnalyticsPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const openPreview = (next: Exclude<AnalyticsPreview, 'none'>) => { setPreview(next); setQaOpen(false) }

  return (
    <InsightsReferenceShell active="Analytics" searchPlaceholder="Tìm kiếm báo cáo, brand, platform...">
      <main className="px-6 py-5">
        <div className="flex items-start justify-between"><div><h1 className="text-[22px] font-bold tracking-tight">Reports & Analytics</h1><p className="mt-1 text-[13px] text-slate-500">Theo dõi hiệu suất, phân tích dữ liệu và so sánh vận hành</p></div><div className="flex gap-2"><button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600"><CalendarDays className="h-3.5 w-3.5" />01/09/2026 – 30/09/2026<ChevronDown className="h-3 w-3" /></button><button type="button" onClick={() => openPreview('comparison')} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600"><TrendingUp className="h-3.5 w-3.5" />So sánh: Tháng trước</button><button type="button" onClick={() => openPreview('export')} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white"><Download className="h-3.5 w-3.5" />Xuất báo cáo</button></div></div>
        <div className="mt-3 flex gap-6 border-b border-slate-200 text-[12px] font-semibold text-slate-500">{['Tổng quan', 'Hiệu suất livestream', 'Nhân sự', 'Chi phí', 'Sản phẩm', 'Xu hướng'].map((tab, index) => <button key={tab} type="button" className={`py-2.5 ${index === 0 ? 'border-b-2 border-blue-600 text-blue-600' : ''}`}>{tab}</button>)}</div>

        <div className="mt-3 grid grid-cols-5 gap-3"><Kpi icon={CalendarDays} label="Tổng ca livestream" value="28" note="↑ 12% so với kỳ trước" tone="bg-blue-50 text-blue-600" /><Kpi icon={Clock3} label="Tổng giờ live" value="142h" note="↑ 18%" tone="bg-violet-50 text-violet-600" /><Kpi icon={CheckCircle2} label="Tỷ lệ hoàn thành" value="96%" note="27/28 ca" tone="bg-emerald-50 text-emerald-600" /><Kpi icon={Eye} label="Tổng lượt xem" value="1.2M" note="↑ 35%" tone="bg-fuchsia-50 text-fuchsia-600" /><Kpi icon={Wallet} label="Doanh thu ước tính" value="₫1.8B" note="↑ 28%" tone="bg-cyan-50 text-cyan-600" /></div>

        <div className="mt-3 grid grid-cols-[1fr_0.9fr_1.05fr] gap-3"><BrandShiftChart /><PlatformDonut /><RevenueChart onDrilldown={() => openPreview('drilldown')} /></div>
        <LiveBreakdown onFilter={() => openPreview('filter')} />
      </main>

      {preview === 'none' && <QaController open={qaOpen} setOpen={setQaOpen} onSelect={openPreview} />}
      {preview !== 'none' && <AnalyticsDialog state={preview} onClose={() => setPreview('none')} />}
    </InsightsReferenceShell>
  )
}

function Kpi({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: string; note: string; tone: string }) {
  return <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span><div><span className="text-[11px] text-slate-500">{label}</span><strong className="mt-0.5 block text-[17px] leading-none">{value}</strong><small className="mt-1 block text-[10px] font-semibold text-emerald-600">{note}</small></div></div>
}

function BrandShiftChart() {
  return <section className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><h2 className="text-[12px] font-bold">Số ca livestream theo brand</h2><div className="flex rounded-md bg-slate-100 p-0.5 text-[10px]"><span className="rounded bg-white px-2 py-1 text-blue-600">Tháng</span><span className="px-2 py-1">Tuần</span><span className="px-2 py-1">Ngày</span></div></div><div className="mt-3 flex h-[120px] items-end justify-around border-b border-slate-200 px-2">{BRANDS.map((brand) => <div key={brand.name} className="flex h-full flex-col items-center justify-end gap-1"><span className="text-[10px] font-semibold text-slate-500">{brand.shifts}</span><span className={`w-7 rounded-t-sm ${brand.color}`} style={{ height: `${brand.shifts * 10}px` }} /><span className="max-w-[52px] truncate text-[10px] text-slate-500">{brand.name}</span></div>)}</div></section>
}

function PlatformDonut() {
  return <section className="rounded-lg border border-slate-200 bg-white p-3"><h2 className="text-[12px] font-bold">Hiệu suất theo nền tảng</h2><div className="mt-2 flex items-center gap-3"><div className="relative h-[130px] w-[130px] shrink-0"><svg viewBox="0 0 120 120" className="h-full w-full" aria-label="Tỷ lệ lượt xem theo nền tảng"><circle cx="60" cy="60" r="38" fill="none" stroke="#e2e8f0" strokeWidth="16" /><circle cx="60" cy="60" r="38" fill="none" stroke="#2563eb" strokeWidth="16" strokeDasharray="124 115" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="38" fill="none" stroke="#38bdf8" strokeWidth="16" strokeDasharray="76 163" strokeDashoffset="-124" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="38" fill="none" stroke="#f97316" strokeWidth="16" strokeDasharray="24 215" strokeDashoffset="-200" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="38" fill="none" stroke="#ef4444" strokeWidth="16" strokeDasharray="14 225" strokeDashoffset="-224" transform="rotate(-90 60 60)" /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-[15px]">1.2M</strong><span className="text-[10px] text-slate-400">Tổng lượt xem</span></div></div><div className="flex-1 space-y-2">{[['TikTok', '52%', 'bg-blue-600'], ['Shopee', '32%', 'bg-sky-400'], ['Facebook', '10%', 'bg-amber-500'], ['YouTube', '6%', 'bg-red-500']].map(([name, value, color]) => <div key={name} className="flex items-center text-[11px]"><span className={`mr-2 h-2 w-2 rounded-full ${color}`} /><span className="flex-1 text-slate-600">{name}</span><strong>{value}</strong></div>)}</div></div></section>
}

function RevenueChart({ onDrilldown }: { onDrilldown: () => void }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><div><h2 className="text-[12px] font-bold">Doanh thu theo brand</h2><p className="mt-0.5 text-[10px] text-slate-400">1.8B tổng doanh thu · 8,452 đơn hàng</p></div><button type="button" onClick={onDrilldown} className="text-[10px] font-semibold text-blue-600">Xem chi tiết</button></div><div className="mt-3 space-y-2">{BRANDS.map((brand) => <div key={brand.name} className="grid grid-cols-[78px_1fr_44px] items-center gap-2 text-[10px]"><span className="truncate text-slate-600">{brand.name}</span><span className="h-3 rounded-sm bg-slate-100"><span className={`block h-full rounded-sm ${brand.color}`} style={{ width: `${(brand.revenue / 520) * 100}%` }} /></span><strong className="text-right">{brand.revenue}M</strong></div>)}</div></section>
}

function LiveBreakdown({ onFilter }: { onFilter: () => void }) {
  return <section className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5"><div><h2 className="text-[12px] font-bold">Danh sách livestream (28)</h2><p className="mt-0.5 text-[10px] text-slate-400">Dữ liệu trong khoảng 01/09–30/09/2026</p></div><div className="flex gap-2"><div className="flex h-9 w-[180px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[11px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm kiếm...</div><button type="button" onClick={onFilter} className="flex h-8 items-center gap-2 rounded-md bg-blue-600 px-3 text-[11px] font-semibold text-white"><Filter className="h-3.5 w-3.5" />Lọc</button></div></div><div className="grid grid-cols-[48px_76px_0.8fr_1.15fr_0.65fr_0.65fr_0.7fr_0.7fr_0.7fr_28px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase text-slate-400"><span>Ngày</span><span>Giờ</span><span>Brand</span><span>Sản phẩm</span><span>Platform</span><span>Studio</span><span>Host</span><span>Trạng thái</span><span>Doanh thu</span><span /></div>{LIVE_ROWS.map((row) => <div key={`${row[0]}-${row[2]}`} className="grid grid-cols-[48px_76px_0.8fr_1.15fr_0.65fr_0.65fr_0.7fr_0.7fr_0.7fr_28px] items-center gap-2 border-b border-slate-100 px-4 py-2 text-[10px] text-slate-600 last:border-b-0"><span>{row[0]}</span><span>{row[1]}</span><strong className="text-slate-700">{row[2]}</strong><span>{row[3]}</span><span>{row[4]}</span><span>{row[5]}</span><span>{row[6]}</span><span className={`w-fit rounded px-2 py-1 font-semibold ${row[7] === 'Đang live' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{row[7]}</span><span>{row[8]}</span><MoreHorizontal className="h-3 w-3 text-slate-400" /></div>)}<div className="flex items-center justify-between px-4 py-2 text-[10px] text-slate-500"><span>Hiển thị 1–5 của 28 ca</span><div className="flex gap-1"><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span><span className="rounded border border-slate-200 px-2 py-1">2</span><span className="rounded border border-slate-200 px-2 py-1">3</span><span className="px-1 py-1">…</span><span className="rounded border border-slate-200 px-2 py-1">6</span></div></div></section>
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: Exclude<AnalyticsPreview, 'none'>) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[185px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}

function AnalyticsDialog({ state, onClose }: { state: Exclude<AnalyticsPreview, 'none'>; onClose: () => void }) {
  const titles = { filter: 'Bộ lọc báo cáo', comparison: 'So sánh với tháng trước', drilldown: 'Chi tiết hiệu suất theo brand', export: 'Xuất dữ liệu analytics', missing: 'Thiếu chỉ số phân tích' } as const
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35"><section role="dialog" aria-modal="true" aria-label={titles[state]} className={`${state === 'comparison' || state === 'drilldown' ? 'w-[760px]' : 'w-[540px]'} max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg`}><header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><div><h2 className="text-[14px] font-bold">{titles[state]}</h2><p className="mt-0.5 text-[11px] text-slate-400">01/09/2026 – 30/09/2026</p></div><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400"><X className="h-4 w-4" /></button></header><div className="p-5">{state === 'filter' && <FilterState />}{state === 'comparison' && <ComparisonState />}{state === 'drilldown' && <DrilldownState />}{state === 'export' && <ExportState />}{state === 'missing' && <MissingState />}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-5 text-[12px] font-semibold text-slate-600">{state === 'filter' || state === 'export' ? 'Hủy' : 'Đóng'}</button>{state === 'filter' && <button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Áp dụng</button>}{state === 'export' && <button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Xuất báo cáo</button>}</div></div></section></div>
}

function FilterState() {
  return <div className="grid grid-cols-2 gap-3">{[['Khoảng thời gian', '01/09/2026 – 30/09/2026'], ['Brand', 'Tất cả brand'], ['Platform', 'Tất cả platform'], ['Studio', 'Tất cả studio'], ['Host', 'Tất cả host'], ['Trạng thái', 'Tất cả trạng thái']].map(([label, value]) => <label key={label} className="text-[11px] font-semibold text-slate-600">{label}<span className="mt-1 flex h-9 items-center justify-between rounded-md border border-slate-200 px-3 font-normal">{value}<ChevronDown className="h-3 w-3" /></span></label>)}</div>
}

function ComparisonState() {
  return <div><div className="grid grid-cols-4 gap-2">{[['Ca livestream', '28', '25', '+12%'], ['Giờ live', '142h', '120h', '+18%'], ['Lượt xem', '1.2M', '889K', '+35%'], ['Doanh thu', '1.8B', '1.4B', '+28%']].map(([label, current, previous, trend]) => <div key={label} className="rounded-md border border-slate-100 p-3"><span className="text-[10px] text-slate-400">{label}</span><strong className="mt-1 block text-[14px]">{current}</strong><span className="mt-1 block text-[10px] text-slate-400">Kỳ trước {previous}</span><span className="mt-1 block text-[10px] font-semibold text-emerald-600">{trend}</span></div>)}</div><h3 className="mt-4 text-[12px] font-bold">Xu hướng doanh thu theo ngày</h3><TrendLine /><div className="mt-2 flex justify-center gap-4 text-[10px] text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-600" />Tháng 9</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-300" />Tháng 8</span></div></div>
}

function DrilldownState() {
  return <div><div className="grid grid-cols-[1fr_0.6fr_0.8fr_0.8fr_0.7fr] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-400"><span>Brand</span><span>Số ca</span><span>Lượt xem</span><span>Doanh thu</span><span>Tỷ trọng</span></div>{BRANDS.map((brand) => <div key={brand.name} className="grid grid-cols-[1fr_0.6fr_0.8fr_0.8fr_0.7fr] border-b border-slate-100 px-3 py-2.5 text-[11px] text-slate-600"><strong className="text-slate-700">{brand.name}</strong><span>{brand.shifts}</span><span>{brand.views}K</span><span>{brand.revenue}M</span><span>{brand.share}%</span></div>)}<div className="mt-3 grid grid-cols-3 gap-2"><Mini label="Tổng số ca" value="28" /><Mini label="Tổng lượt xem" value="1.2M" /><Mini label="Tổng doanh thu" value="1.8B" /></div></div>
}

function ExportState() {
  return <div><div className="grid grid-cols-2 gap-2"><Choice active label="Excel (.xlsx)" /><Choice label="PDF (.pdf)" /></div><div className="mt-4 space-y-2">{['Tổng quan KPI', 'Biểu đồ & phân tích', 'Bảng dữ liệu chi tiết', 'So sánh kỳ trước'].map((label) => <label key={label} className="flex items-center gap-2 text-[11px] text-slate-600"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-blue-600 text-white"><Check className="h-2.5 w-2.5" /></span>{label}</label>)}</div></div>
}

function MissingState() {
  return <div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600"><CircleAlert className="h-7 w-7" /></span><h3 className="mt-3 text-[14px] font-bold">Một số chỉ số chưa sẵn sàng</h3><p className="mx-auto mt-1 max-w-[360px] text-[11px] leading-4 text-slate-500">Dữ liệu doanh thu và lượt xem đã có. CTR và chi phí quảng cáo của 2 ca đang chờ xác nhận.</p><div className="mt-4 grid grid-cols-2 gap-2 text-left"><Mini label="Chỉ số khả dụng" value="8/10" /><Mini label="Ca cần bổ sung" value="2" /></div></div>
}

function TrendLine() {
  return <svg viewBox="0 0 700 160" className="mt-2 h-[145px] w-full" aria-label="So sánh doanh thu tháng 9 và tháng 8"><path d="M20 130H680M20 85H680M20 40H680" stroke="#e2e8f0" strokeWidth="1" /><polyline points="20,120 90,94 160,103 230,75 300,82 370,54 440,42 510,47 580,35 650,20" fill="none" stroke="#2563eb" strokeWidth="3" /><polyline points="20,132 90,118 160,109 230,100 300,95 370,82 440,74 510,69 580,64 650,58" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 5" /></svg>
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-slate-50 p-2"><span className="text-[10px] text-slate-400">{label}</span><strong className="mt-1 block text-[12px]">{value}</strong></div> }
function Choice({ active = false, label }: { active?: boolean; label: string }) { return <div className={`flex items-center gap-2 rounded-md border p-3 text-[11px] font-semibold ${active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><span className={`h-3.5 w-3.5 rounded-full border ${active ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`} />{label}</div> }
