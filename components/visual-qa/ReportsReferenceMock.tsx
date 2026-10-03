'use client'

import { useState, type ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  FileDown,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { InsightsReferenceShell } from './InsightsReferenceShell'

type ReportsPreview =
  | 'none'
  | 'detail'
  | 'export'
  | 'evidence'
  | 'partial'
  | 'missing'
  | 'success'
  | 'ocr-review'
  | 'ocr-needs-review'
  | 'ocr-failed'
  | 'stale-evidence'

type ReportTab = 'Tổng quan' | 'Metrics' | 'Screenshots' | 'Nhân sự' | 'Ghi chú' | 'Hoạt động'

const REPORTS = [
  {
    id: 'RPT-0906-01', date: '06/09/2026', shift: 'Pharmaton · 9.9 Livestream', campaign: '9.9 Livestream', brand: 'Pharmaton',
    platform: 'TikTok', studio: 'Studio A', time: '20:00–23:00', revenue: '24.5M', orders: '321', ctr: '36.62%', aov: '76.3K',
    quality: 'Verified', qualityClass: 'bg-emerald-50 text-emerald-700', status: 'Hoàn tất', statusClass: 'bg-emerald-50 text-emerald-700', updated: '10/09 · 08:30',
  },
  {
    id: 'RPT-0905-02', date: '05/09/2026', shift: 'Ostelin · Payday', campaign: 'Payday', brand: 'Ostelin',
    platform: 'Shopee', studio: 'Studio B', time: '19:00–22:00', revenue: '18.2M', orders: '240', ctr: '31.40%', aov: '75.8K',
    quality: 'OCR review', qualityClass: 'bg-amber-50 text-amber-700', status: 'Chờ duyệt', statusClass: 'bg-amber-50 text-amber-700', updated: '09/09 · 16:20',
  },
  {
    id: 'RPT-0904-03', date: '04/09/2026', shift: 'Lactacyd · Midmonth', campaign: 'Midmonth', brand: 'Lactacyd',
    platform: 'TikTok', studio: 'Studio A', time: '14:00–17:00', revenue: '11.7M', orders: '156', ctr: 'Không có', aov: '75.0K',
    quality: 'Partial', qualityClass: 'bg-amber-50 text-amber-700', status: 'Bản nháp', statusClass: 'bg-slate-100 text-slate-600', updated: '08/09 · 10:05',
  },
  {
    id: 'RPT-0903-04', date: '03/09/2026', shift: 'Corbiere · Payday', campaign: 'Payday', brand: 'Corbiere',
    platform: 'TikTok', studio: 'Studio C', time: '20:00–23:00', revenue: 'Không có', orders: 'Không có', ctr: 'Không có', aov: 'Không có',
    quality: 'Missing', qualityClass: 'bg-red-50 text-red-600', status: 'Thiếu dữ liệu', statusClass: 'bg-red-50 text-red-600', updated: '07/09 · 09:15',
  },
] as const

const METRICS = [
  { label: 'Doanh thu', value: '24.5M', source: 'OCR Verified', confidence: '98%', freshness: 'Fresh', review: 'Đã xác nhận' },
  { label: 'Đơn hàng', value: '321', source: 'Imported', confidence: '—', freshness: 'Fresh', review: 'Đã xác nhận' },
  { label: 'CTR', value: '36.62%', source: 'Calculated', confidence: '—', freshness: 'Fresh', review: 'Đã xác nhận' },
  { label: 'AOV', value: '76.3K', source: 'Calculated', confidence: '—', freshness: 'Fresh', review: 'Đã xác nhận' },
  { label: 'Chi phí quảng cáo', value: '4.1M', source: 'Manual', confidence: '—', freshness: 'Fresh', review: 'Đã xác nhận' },
] as const

const QA_STATES: { id: Exclude<ReportsPreview, 'none'>; label: string }[] = [
  { id: 'detail', label: 'Chi tiết báo cáo' },
  { id: 'export', label: 'Xuất báo cáo' },
  { id: 'evidence', label: 'Bằng chứng & nguồn dữ liệu' },
  { id: 'partial', label: 'Dữ liệu một phần' },
  { id: 'missing', label: 'Chưa có dữ liệu' },
  { id: 'success', label: 'Xuất thành công' },
  { id: 'ocr-review', label: 'OCR Review' },
  { id: 'ocr-needs-review', label: 'OCR Needs Review' },
  { id: 'ocr-failed', label: 'OCR Failed' },
  { id: 'stale-evidence', label: 'Stale Evidence' },
]

const REPORT_TABS: ReportTab[] = ['Tổng quan', 'Metrics', 'Screenshots', 'Nhân sự', 'Ghi chú', 'Hoạt động']

export function ReportsReferenceMock({ initialState = 'none' }: { initialState?: ReportsPreview }) {
  const [preview, setPreview] = useState<ReportsPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('RPT-0906-01')
  const selected = REPORTS.find((report) => report.id === selectedId) ?? REPORTS[0]
  const openPreview = (next: Exclude<ReportsPreview, 'none'>) => { setPreview(next); setQaOpen(false) }

  return (
    <InsightsReferenceShell active="Reports" searchPlaceholder="Tìm báo cáo, chiến dịch, brand...">
      <main className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight">Reports</h1><p className="mt-1 text-[13px] text-slate-500">Xem lại kết quả livestream, bằng chứng và bối cảnh vận hành</p></div>
          <button type="button" onClick={() => openPreview('export')} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white"><FileDown className="h-4 w-4" />Xuất báo cáo</button>
        </div>

        <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <div className="flex h-9 min-w-[210px] flex-1 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm kiếm báo cáo...</div>
            {['01/09/2026 – 30/09/2026', 'Tất cả brand', 'Tất cả chiến dịch', 'Tất cả platform', 'Tất cả trạng thái', 'Tất cả độ đầy đủ'].map((label) => <FilterButton key={label} label={label} />)}
          </div>
          <div className="grid grid-cols-[76px_1.35fr_0.65fr_0.55fr_0.55fr_0.48fr_0.65fr_0.6fr_0.62fr_24px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-semibold uppercase text-slate-400">
            <span>Ngày</span><span>Ca / Chiến dịch</span><span>Brand</span><span>Nền tảng</span><span>Doanh thu</span><span>Đơn hàng</span><span>Chất lượng</span><span>Trạng thái</span><span>Cập nhật</span><span />
          </div>
          {REPORTS.map((report) => (
            <button key={report.id} type="button" onClick={() => setSelectedId(report.id)} className={`grid w-full grid-cols-[76px_1.35fr_0.65fr_0.55fr_0.55fr_0.48fr_0.65fr_0.6fr_0.62fr_24px] items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-left last:border-b-0 ${selectedId === report.id ? 'bg-blue-50/50' : 'bg-white'}`}>
              <span className="text-[11px] text-slate-500">{report.date}</span>
              <span><strong className="block text-[12px] text-slate-800">{report.shift}</strong><small className="text-[10px] text-slate-400">{report.time} · {report.studio}</small></span>
              <span className="text-[11px] text-slate-600">{report.brand}</span><span className="text-[11px] text-slate-600">{report.platform}</span>
              <strong className="text-[11px] text-slate-700">{report.revenue}</strong><span className="text-[11px] text-slate-600">{report.orders}</span>
              <Badge className={report.qualityClass}>{report.quality}</Badge><Badge className={report.statusClass}>{report.status}</Badge>
              <span className="text-[10px] text-slate-500">{report.updated}</span><MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
            </button>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5 text-[11px] text-slate-500">
            <span>Hiển thị 1–4 của 48 báo cáo</span>
            <div className="flex gap-1"><Page active>1</Page><Page>2</Page><Page>3</Page><span className="px-1 py-1">…</span><Page>12</Page></div>
          </div>
        </section>

        <ReportSummary report={selected} onDetail={() => openPreview('detail')} onEvidence={() => openPreview('evidence')} onExport={() => openPreview('export')} />
      </main>

      {preview === 'none' && <QaController open={qaOpen} setOpen={setQaOpen} onSelect={openPreview} />}
      {preview !== 'none' && <ReportDialog state={preview} report={selected} onClose={() => setPreview('none')} />}
    </InsightsReferenceShell>
  )
}

function ReportSummary({ report, onDetail, onEvidence, onExport }: { report: (typeof REPORTS)[number]; onDetail: () => void; onEvidence: () => void; onExport: () => void }) {
  const [tab, setTab] = useState<ReportTab>('Tổng quan')

  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between border-b border-slate-100 px-5 py-3">
        <div><div className="flex items-center gap-2"><h2 className="text-[14px] font-bold">{report.shift}</h2><Badge className={report.statusClass}>{report.id === 'RPT-0906-01' ? 'Complete' : report.status}</Badge></div><p className="mt-1 text-[11px] text-slate-500">{report.platform} · {report.date} · {report.time} · {report.studio}</p></div>
        <div className="flex gap-2"><button type="button" onClick={onDetail} className="h-9 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-blue-600">Mở báo cáo</button><button type="button" onClick={onExport} className="h-8 rounded-md bg-blue-600 px-3 text-[11px] font-semibold text-white">Xuất</button></div>
      </header>
      <div className="grid grid-cols-5 gap-2 px-5 py-3">
        {METRICS.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>
      <div className="flex gap-5 border-y border-slate-100 px-5 text-[11px] font-semibold text-slate-500">
        {REPORT_TABS.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`py-2.5 ${tab === item ? 'border-b-2 border-blue-600 text-blue-600' : ''}`}>{item}</button>)}
      </div>
      <div className="p-4"><TabContent tab={tab} onEvidence={onEvidence} /></div>
    </section>
  )
}

function TabContent({ tab, onEvidence }: { tab: ReportTab; onEvidence: () => void }) {
  if (tab === 'Metrics') return <MetricsTab />
  if (tab === 'Screenshots') return <ScreenshotsTab onEvidence={onEvidence} />
  if (tab === 'Nhân sự') return <StaffingTab />
  if (tab === 'Ghi chú') return <NotesTab />
  if (tab === 'Hoạt động') return <ActivityTab />
  return <OverviewTab onEvidence={onEvidence} />
}

function OverviewTab({ onEvidence }: { onEvidence: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,7fr)_minmax(230px,3fr)] gap-3">
      <div className="space-y-3">
        <div className="rounded-md border border-slate-100 p-3">
          <div className="flex items-center justify-between"><h3 className="text-[12px] font-bold uppercase">Tóm tắt hiệu suất</h3><span className="text-[10px] text-slate-400">20:00–23:00</span></div>
          <PerformanceLine />
          <div className="mt-2 grid grid-cols-3 gap-2"><Result label="Checklist" value="6/6 hoàn thành" /><Result label="Nhân sự" value="4/4 tham gia" /><Result label="Sự cố" value="0 nghiêm trọng" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CompactPanel title="Điểm nổi bật" lines={['Doanh thu đạt 24.5M', '321 đơn hàng được xác nhận', 'AOV duy trì ở mức 76.3K']} />
          <CompactPanel title="Ghi chú vận hành" lines={['Hero product chuyển sớm hơn kế hoạch.', 'CTR phục hồi sau phân đoạn khuyến mãi.']} />
        </div>
      </div>
      <aside className="space-y-2">
        <div className="rounded-md border border-slate-100 p-3"><h3 className="text-[12px] font-bold uppercase">Bối cảnh báo cáo</h3><div className="mt-2 grid grid-cols-2 gap-y-1 text-[10px]"><span className="text-slate-400">Brand</span><span>Pharmaton</span><span className="text-slate-400">Campaign</span><span>9.9 Livestream</span><span className="text-slate-400">Tác giả</span><span>Nguyễn Trung Kiên</span><span className="text-slate-400">Cập nhật</span><span>10/09 · 08:30</span></div></div>
        <div className="rounded-md border border-slate-100 p-3"><h3 className="text-[12px] font-bold uppercase">Chất lượng dữ liệu</h3><div className="mt-2 space-y-1.5"><InfoRow label="Expected" value="5" /><InfoRow label="Available" value="5" /><InfoRow label="Verified" value="4" /><InfoRow label="Manual" value="1" /><InfoRow label="Missing" value="0" /></div></div>
        <button type="button" onClick={onEvidence} className="flex w-full items-center gap-3 rounded-md border border-slate-100 p-2 text-left"><span className="flex h-10 w-14 items-center justify-center rounded bg-[#30203e] text-white"><ImageIcon className="h-4 w-4" /></span><span><strong className="block text-[11px]">Bằng chứng screenshot</strong><small className="text-[10px] text-slate-400">22:58 · OCR Verified · Fresh</small></span></button>
      </aside>
    </div>
  )
}

function MetricsTab() {
  return (
    <div className="overflow-hidden rounded-md border border-slate-100">
      <div className="grid grid-cols-[1.15fr_0.7fr_0.9fr_0.8fr_0.7fr_0.9fr] bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-400"><span>Chỉ số</span><span>Giá trị</span><span>Nguồn</span><span>OCR confidence</span><span>Freshness</span><span>Review</span></div>
      {METRICS.map((metric) => <div key={metric.label} className="grid grid-cols-[1.15fr_0.7fr_0.9fr_0.8fr_0.7fr_0.9fr] items-center border-t border-slate-100 px-3 py-2 text-[11px]"><strong>{metric.label}</strong><span>{metric.value}</span><span className="text-slate-500">{metric.source}</span><span className="text-slate-500">{metric.confidence}</span><Freshness value={metric.freshness} /><span className="text-emerald-700">{metric.review}</span></div>)}
    </div>
  )
}

function ScreenshotsTab({ onEvidence }: { onEvidence: () => void }) {
  const screenshots = [
    { time: '22:12', source: 'TikTok dashboard', freshness: 'Fresh', ocr: 'Detected' },
    { time: '22:31', source: 'TikTok dashboard', freshness: 'Fresh', ocr: 'Needs review' },
    { time: '22:58', source: 'TikTok dashboard', freshness: 'Fresh', ocr: 'Verified' },
  ]
  return <div><div className="grid grid-cols-3 gap-3">{screenshots.map((item) => <div key={item.time} className="overflow-hidden rounded-md border border-slate-100"><div className="flex h-20 items-center justify-center bg-[#30203e] text-white"><ImageIcon className="h-5 w-5" /></div><div className="space-y-1 p-2 text-[10px]"><div className="flex justify-between"><strong>{item.time}</strong><span className={item.ocr === 'Needs review' ? 'text-amber-600' : 'text-emerald-700'}>{item.ocr}</span></div><div className="text-slate-400">{item.source} · {item.freshness}</div><button type="button" onClick={onEvidence} className="mt-1 flex items-center gap-1 font-semibold text-blue-600"><Eye className="h-3 w-3" />Xem bằng chứng</button></div></div>)}</div><div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-[10px]"><div className="flex items-center gap-2"><span className="font-semibold text-slate-500">OCR:</span>{['Not scanned', 'Processing', 'Detected', 'Needs review', 'Verified', 'Failed'].map((status) => <span key={status} className="text-slate-500">{status}</span>)}</div><div className="flex items-center gap-2"><span className="font-semibold text-slate-500">Freshness:</span>{['Fresh', 'Aging', 'Stale', 'Unavailable'].map((status) => <span key={status} className="text-slate-500">{status}</span>)}</div></div></div>
}

function StaffingTab() {
  const people = [['Nguyễn A', 'Host', 'Có mặt', 'Đã xác nhận'], ['Nguyễn B', 'Support', 'Có mặt', 'Đã xác nhận'], ['Nguyễn C', 'Technical', 'Có mặt', 'Đã xác nhận'], ['Nguyễn Văn D', 'Imported', 'Có mặt', 'Đã đối chiếu']]
  return <CompactTable headers={['Nhân sự', 'Vai trò', 'Chấm công', 'Trạng thái báo cáo']} rows={people} />
}

function NotesTab() {
  const rows = [['10/09 · 08:30', 'Nguyễn Trung Kiên', 'Đã xác nhận số liệu OCR.', 'Review'], ['06/09 · 22:04', 'Nguyễn B', 'CTR phục hồi sau phân đoạn khuyến mãi.', 'Vận hành'], ['06/09 · 21:32', 'Nguyễn A', 'Hero product chuyển sớm hơn kế hoạch.', 'Vận hành']]
  return <CompactTable headers={['Thời gian', 'Tác giả', 'Ghi chú', 'Loại']} rows={rows} />
}

function ActivityTab() {
  const events = [['06/09 · 23:05', 'Báo cáo được tạo'], ['06/09 · 23:08', 'Screenshot được ghi nhận'], ['06/09 · 23:09', 'OCR đã phát hiện chỉ số'], ['07/09 · 08:15', 'OCR được xác minh'], ['10/09 · 08:30', 'Chỉ số được xác nhận'], ['10/09 · 09:02', 'Báo cáo được xuất']]
  return <div className="grid grid-cols-2 gap-x-5 gap-y-2">{events.map(([time, event], index) => <div key={event} className="flex items-center gap-3 rounded-md border border-slate-100 p-2 text-[11px]"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">{index + 1}</span><span className="flex-1">{event}</span><span className="text-slate-400">{time}</span></div>)}</div>
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: Exclude<ReportsPreview, 'none'>) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[190px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}

function ReportDialog({ state, report, onClose }: { state: Exclude<ReportsPreview, 'none'>; report: (typeof REPORTS)[number]; onClose: () => void }) {
  const titles = {
    detail: 'Chi tiết báo cáo', export: 'Xuất báo cáo', evidence: 'Bằng chứng & nguồn dữ liệu', partial: 'Báo cáo có dữ liệu một phần',
    missing: 'Chưa có dữ liệu báo cáo', success: 'Xuất báo cáo thành công', 'ocr-review': 'OCR Review', 'ocr-needs-review': 'OCR Needs Review',
    'ocr-failed': 'OCR Failed', 'stale-evidence': 'Stale Evidence',
  } as const
  const wide = ['detail', 'evidence', 'ocr-review', 'ocr-needs-review', 'stale-evidence'].includes(state)
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35"><section role="dialog" aria-modal="true" aria-label={titles[state]} className={`${wide ? 'w-[760px]' : 'w-[490px]'} max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg`}><header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><div><h2 className="text-[14px] font-bold">{titles[state]}</h2><p className="mt-0.5 text-[11px] text-slate-400">{report.shift} · {report.date}</p></div><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400"><X className="h-4 w-4" /></button></header><div className="p-5">{state === 'detail' && <DetailState />}{state === 'export' && <ExportState />}{state === 'evidence' && <EvidenceState />}{state === 'partial' && <PartialState />}{state === 'missing' && <MissingState />}{state === 'success' && <SuccessState />}{state === 'ocr-review' && <OcrReviewState />}{state === 'ocr-needs-review' && <OcrReviewState needsReview />}{state === 'ocr-failed' && <OcrFailedState />}{state === 'stale-evidence' && <StaleEvidenceState />}<DialogActions state={state} onClose={onClose} /></div></section></div>
}

function DetailState() {
  return <div className="grid grid-cols-2 gap-4"><div><h3 className="text-[12px] font-bold uppercase">Nhân sự & kết quả</h3><div className="mt-2 space-y-1.5">{[['NA', 'Nguyễn A', 'Host', 'Đã xác nhận'], ['NB', 'Nguyễn B', 'Support', 'Đã xác nhận'], ['NC', 'Nguyễn C', 'Technical', 'Đã xác nhận'], ['NV', 'Nguyễn Văn D', 'Imported', 'Đã đối chiếu']].map(([initials, name, role, status]) => <div key={name} className="flex items-center gap-3 rounded-md border border-slate-100 p-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{initials}</span><span className="flex-1"><strong className="block text-[11px]">{name}</strong><small className="text-[10px] text-slate-400">{role}</small></span><Badge className="bg-emerald-50 text-emerald-700">{status}</Badge></div>)}</div></div><div><h3 className="text-[12px] font-bold uppercase">Ghi chú vận hành</h3><div className="mt-2 space-y-2"><Note time="21:32" text="Hero product chuyển sớm hơn kế hoạch." /><Note time="22:04" text="CTR phục hồi sau phân đoạn khuyến mãi." /><Note time="22:58" text="Đã chụp và xác minh bằng chứng OCR." /></div><div className="mt-3 rounded-md bg-emerald-50 p-3 text-[11px] text-emerald-700"><strong>Hoàn thành:</strong> 6/6 checklist · Không có sự cố nghiêm trọng.</div></div></div>
}

function ExportState() {
  return <div><h3 className="text-[12px] font-semibold">Định dạng file</h3><div className="mt-2 grid grid-cols-2 gap-2"><Choice active label="Excel (.xlsx)" /><Choice label="PDF (.pdf)" /></div><h3 className="mt-4 text-[12px] font-semibold">Nội dung báo cáo</h3><div className="mt-2 space-y-2">{['Tổng quan', 'Bảng dữ liệu chi tiết', 'Biểu đồ & phân tích', 'Ghi chú vận hành'].map((label) => <label key={label} className="flex items-center gap-2 text-[11px] text-slate-600"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-blue-600 text-white"><Check className="h-2.5 w-2.5" /></span>{label}</label>)}</div><div className="mt-4 rounded-md bg-blue-50 p-3 text-[11px] text-blue-700">File chỉ được tạo trong trạng thái visual QA. Không có tải xuống thật.</div></div>
}

function EvidenceState() {
  return <div className="grid grid-cols-[0.72fr_1.28fr] gap-4"><div className="rounded-md border border-slate-100 p-3"><h3 className="text-[12px] font-bold uppercase">Nguồn chỉ số</h3><div className="mt-3 space-y-2"><InfoRow label="Captured" value="06/09 · 22:58" /><InfoRow label="Source" value="TikTok dashboard" /><InfoRow label="Freshness" value="Fresh" /><InfoRow label="OCR" value="Verified · 98%" /><InfoRow label="Revenue" value="24.5M" /><InfoRow label="Orders" value="321" /><InfoRow label="Missing" value="0" /></div></div><div><h3 className="text-[12px] font-bold uppercase">Screenshot Evidence</h3><div className="mt-3 grid grid-cols-3 gap-2">{['22:12 · Detected', '22:31 · Needs review', '22:58 · Verified'].map((item) => <div key={item}><div className="flex h-24 items-center justify-center rounded-md bg-[#30203e] text-white"><ImageIcon className="h-5 w-5" /></div><span className="mt-1 block text-[10px] text-slate-400">{item} · Fresh</span></div>)}</div><div className="mt-3 rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">Extracted: Revenue 24.5M · Orders 321 · CTR 36.62% · AOV 76.3K</div><button type="button" className="mt-2 h-8 w-full rounded-md border border-blue-200 text-[11px] font-semibold text-blue-600">Xem ảnh đầy đủ</button></div></div>
}

function OcrReviewState({ needsReview = false }: { needsReview?: boolean }) {
  const rows = [['Revenue', '24.5M', '98%', 'Verified'], ['Orders', '321', '94%', 'Verified'], ['CTR', '36.62%', '72%', 'Needs review']]
  return <div className="grid grid-cols-[0.9fr_1.1fr] gap-4"><div><div className="flex h-[210px] items-center justify-center rounded-md bg-[#30203e] text-white"><ImageIcon className="h-8 w-8" /></div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><InfoTile label="Captured" value="22:58" /><InfoTile label="Source" value="TikTok" /><InfoTile label="Freshness" value="Fresh" /></div></div><div><div className="flex items-center justify-between"><h3 className="text-[12px] font-bold uppercase">Detected metrics</h3><Badge className={needsReview ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}>{needsReview ? 'Needs review' : 'Detected'}</Badge></div><div className="mt-2 overflow-hidden rounded-md border border-slate-100"><div className="grid grid-cols-[1fr_0.8fr_0.6fr_0.9fr] bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-400"><span>Metric</span><span>Value</span><span>Confidence</span><span>Status</span></div>{rows.map(([metric, value, confidence, status]) => <div key={metric} className="grid grid-cols-[1fr_0.8fr_0.6fr_0.9fr] border-t border-slate-100 px-3 py-2 text-[11px]"><strong>{metric}</strong><span>{value}</span><span className={confidence === '72%' ? 'font-semibold text-amber-600' : 'text-slate-500'}>{confidence}</span><span className={status === 'Needs review' ? 'text-amber-600' : 'text-emerald-700'}>{status}</span></div>)}</div><div className="mt-3 rounded-md bg-slate-50 p-3"><div className="text-[10px] font-semibold uppercase text-slate-400">Raw OCR</div><p className="mt-1 font-mono text-[10px] leading-4 text-slate-600">Revenue 24,500,000 | Orders 321 | CTR 36.62%</p></div></div></div>
}

function PartialState() {
  return <div><StatusState icon={<CircleAlert className="h-7 w-7" />} tone="bg-amber-100 text-amber-600" title="Dữ liệu báo cáo chưa đầy đủ" copy="Doanh thu và đơn hàng đã có. CTR và chi phí quảng cáo chưa được xác nhận." details={['Doanh thu: 24.5M · Available', 'Đơn hàng: 321 · Available', 'CTR: Không có', 'Chi phí quảng cáo: Không có']} /><div className="mt-4 grid grid-cols-3 gap-2"><InfoTile label="Expected" value="4" /><InfoTile label="Available" value="2" /><InfoTile label="Missing" value="2" /></div></div>
}

function MissingState() {
  return <StatusState icon={<FileText className="h-7 w-7" />} tone="bg-slate-100 text-slate-500" title="Chưa có dữ liệu báo cáo" copy="Không có screenshot đã xác minh. OCR không khả dụng và các chỉ số hiện chưa có dữ liệu." details={['Screenshot: Không có', 'OCR: Không khả dụng', 'Metrics: Không có']} />
}

function SuccessState() {
  return <StatusState icon={<Check className="h-7 w-7" />} tone="bg-emerald-100 text-emerald-600" title="Xuất báo cáo thành công" copy="File báo cáo đã được tạo trong trạng thái visual QA." />
}

function OcrFailedState() {
  return <StatusState icon={<XCircle className="h-7 w-7" />} tone="bg-red-100 text-red-600" title="OCR không thể đọc bằng chứng" copy="Screenshot được giữ nguyên nhưng chưa có chỉ số OCR. Hãy kiểm tra chất lượng ảnh trước khi thử lại." details={['OCR: Failed', 'Confidence: Không có', 'Metrics: Không có']} />
}

function StaleEvidenceState() {
  return <div className="grid grid-cols-[0.85fr_1.15fr] gap-4"><div className="flex h-[190px] items-center justify-center rounded-md bg-[#30203e] text-white"><ImageIcon className="h-7 w-7" /></div><div><Badge className="bg-red-50 text-red-600">Stale</Badge><h3 className="mt-3 text-[14px] font-bold">Bằng chứng cần được làm mới</h3><p className="mt-1 text-[11px] leading-4 text-slate-500">Screenshot được chụp lúc 20:15, trước thời điểm chốt ca. Chỉ số vẫn hiển thị để đối chiếu nhưng chưa thể xác nhận.</p><div className="mt-3 space-y-2"><InfoRow label="Captured" value="06/09 · 20:15" /><InfoRow label="Source" value="TikTok dashboard" /><InfoRow label="Freshness" value="Stale" /><InfoRow label="OCR" value="Detected · 91%" /></div></div></div>
}

function DialogActions({ state, onClose }: { state: Exclude<ReportsPreview, 'none'>; onClose: () => void }) {
  const ocr = state === 'ocr-review' || state === 'ocr-needs-review'
  return <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-5 text-[12px] font-semibold text-slate-600">{state === 'export' ? 'Hủy' : 'Đóng'}</button>{ocr && <><button type="button" className="flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600"><Pencil className="h-3 w-3" />Sửa giá trị</button><button type="button" className="flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-600"><RefreshCw className="h-3 w-3" />Chạy lại OCR</button><button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Xác nhận</button></>}{state === 'export' && <button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Xuất báo cáo</button>}{state === 'success' && <button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Tải xuống</button>}{state === 'ocr-failed' && <button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Thử lại OCR</button>}</div>
}

function PerformanceLine() {
  return <svg viewBox="0 0 520 92" className="mt-2 h-[72px] w-full" aria-label="Biểu đồ hiệu suất theo thời gian"><path d="M10 76H510M10 45H510M10 14H510" stroke="#e2e8f0" strokeWidth="1" /><polyline points="10,72 70,66 125,59 180,54 235,48 290,41 345,34 400,27 455,20 510,14" fill="none" stroke="#2563eb" strokeWidth="2.5" /><circle cx="400" cy="27" r="3" fill="#2563eb" /></svg>
}

function MetricCard({ label, value, source, freshness }: { label: string; value: string; source: string; freshness: string }) { return <div className="rounded-md border border-slate-100 bg-slate-50 p-2"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-400">{label}</span><Freshness value={freshness} /></div><strong className="mt-1 block text-[13px]">{value}</strong><span className="mt-1 block text-[10px] text-slate-500">{source}</span></div> }
function Freshness({ value }: { value: string }) { return <span className={`text-[10px] font-semibold ${value === 'Fresh' ? 'text-emerald-600' : value === 'Aging' ? 'text-amber-600' : value === 'Stale' ? 'text-red-600' : 'text-slate-400'}`}>{value}</span> }
function FilterButton({ label }: { label: string }) { return <button type="button" className="flex h-9 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] text-slate-600">{label}<ChevronDown className="h-3 w-3" /></button> }
function Page({ active = false, children }: { active?: boolean; children: ReactNode }) { return <span className={`rounded px-2 py-1 ${active ? 'bg-blue-600 text-white' : 'border border-slate-200'}`}>{children}</span> }
function Badge({ className, children }: { className: string; children: ReactNode }) { return <span className={`w-fit rounded-md px-2 py-1 text-[10px] font-semibold ${className}`}>{children}</span> }
function Result({ label, value }: { label: string; value: string }) { return <div className="rounded bg-slate-50 p-2"><span className="text-[10px] text-slate-400">{label}</span><strong className="mt-1 block text-[11px] text-slate-700">{value}</strong></div> }
function Note({ time, text }: { time: string; text: string }) { return <div className="rounded-md border border-slate-100 p-2 text-[11px]"><strong className="text-blue-600">{time}</strong><span className="ml-2 text-slate-600">{text}</span></div> }
function Choice({ active = false, label }: { active?: boolean; label: string }) { return <div className={`flex items-center gap-2 rounded-md border p-3 text-[11px] font-semibold ${active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><span className={`h-3.5 w-3.5 rounded-full border ${active ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`} />{label}</div> }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-[11px]"><span className="text-slate-400">{label}</span><strong className="text-slate-700">{value}</strong></div> }
function InfoTile({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-slate-50 p-2"><span className="block text-[10px] text-slate-400">{label}</span><strong className="mt-1 block text-[11px] text-slate-700">{value}</strong></div> }
function CompactPanel({ title, lines }: { title: string; lines: string[] }) { return <div className="rounded-md border border-slate-100 p-3"><h3 className="text-[12px] font-bold uppercase">{title}</h3><div className="mt-2 space-y-1.5">{lines.map((line) => <div key={line} className="flex items-center gap-2 text-[11px] text-slate-600"><Check className="h-3 w-3 text-emerald-600" />{line}</div>)}</div></div> }
function CompactTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="overflow-hidden rounded-md border border-slate-100"><div className="grid grid-cols-4 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase text-slate-400">{headers.map((header) => <span key={header}>{header}</span>)}</div>{rows.map((row) => <div key={row.join('-')} className="grid grid-cols-4 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">{row.map((cell, index) => <span key={cell} className={index === 0 ? 'font-semibold text-slate-800' : ''}>{cell}</span>)}</div>)}</div> }
function StatusState({ icon, tone, title, copy, details }: { icon: ReactNode; tone: string; title: string; copy: string; details?: string[] }) { return <div className="text-center"><span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${tone}`}>{icon}</span><h3 className="mt-3 text-[14px] font-bold">{title}</h3><p className="mx-auto mt-1 max-w-[350px] text-[11px] leading-4 text-slate-500">{copy}</p>{details && <div className="mt-4 grid grid-cols-2 gap-2 text-left">{details.map((detail) => <div key={detail} className="rounded bg-slate-50 p-2 text-[11px] text-slate-600">{detail}</div>)}</div>}</div> }
