'use client'

import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  History,
  Image as ImageIcon,
  Layers,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  Upload,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react'
// import { InsightsReferenceShell } from './InsightsReferenceShell'

export type ReportsPreview =
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
  | 'create-candidate'
  | 'reopened'
  | 'archived'

export type ReportTab =
  | 'Tổng quan'
  | 'Metrics'
  | 'OCR & Bằng chứng'
  | 'Nhân sự'
  | 'Ghi chú / Recap'
  | 'Hoạt động'

// Master list of mock reports showcasing different lifecycle & quality states

export interface MappedReport {
  id: string
  shift_id: string
  date: string
  shift: string
  campaign: string
  brand: string
  platform: string
  studio: string
  time: string
  duration_minutes: number
  revenue: string
  orders: string
  ctr: string
  aov: string
  quality: string
  qualityClass: string
  status: string
  statusClass: string
  updated: string
  metrics_confirmed: boolean
  analytics_eligible: boolean
}

export interface MappedMetric {
  key: string
  label: string
  value: string
  unit: string
  source: string
  confidence: string
  freshness: string
  review: string
  required: boolean
  status: 'confirmed' | 'missing' | 'unavailable'
}

const QA_STATES: { id: Exclude<ReportsPreview, 'none'>; label: string }[] = [
  { id: 'detail', label: 'Chi tiết báo cáo (Confirmed)' },
  { id: 'partial', label: 'Dữ liệu một phần (Partial)' },
  { id: 'missing', label: 'Chưa có dữ liệu (Missing)' },
  { id: 'ocr-review', label: 'OCR Review (Verified)' },
  { id: 'ocr-needs-review', label: 'OCR Cần duyệt (Needs Review)' },
  { id: 'ocr-failed', label: 'OCR Thất bại (Failed)' },
  { id: 'stale-evidence', label: 'Bằng chứng cũ (Stale)' },
  { id: 'create-candidate', label: 'Tạo báo cáo ca vừa xong' },
  { id: 'reopened', label: 'Báo cáo mở lại (Reopened)' },
  { id: 'archived', label: 'Báo cáo lưu trữ (Archived)' },
  { id: 'export', label: 'Xuất file báo cáo' },
  { id: 'success', label: 'Xuất thành công' },
  { id: 'evidence', label: 'Thư viện bằng chứng' },
]

const REPORT_TABS: ReportTab[] = [
  'Tổng quan',
  'Metrics',
  'OCR & Bằng chứng',
  'Nhân sự',
  'Ghi chú / Recap',
  'Hoạt động',
]

export function ReportsView({
  reports,
  canonicalMetrics,
  initialState = 'none',
  initialTab = 'Tổng quan',
  initialDetailFocus = false,
  onCreateReport,
  onExport,
  filterNode,
}: {
  reports: MappedReport[]
  canonicalMetrics: MappedMetric[]
  initialState?: ReportsPreview
  initialTab?: ReportTab
  initialDetailFocus?: boolean
  onCreateReport?: () => void
  onExport?: () => void
  filterNode?: React.ReactNode
}) {
  const [preview, setPreview] = useState<ReportsPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('RPT-0906-01')
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab)
  const [detailFocus, setDetailFocus] = useState<boolean>(initialDetailFocus)

  const selected = reports.find((report) => report.id === selectedId) ?? reports[0]
  const openPreview = (next: Exclude<ReportsPreview, 'none'>) => {
    setPreview(next)
    setQaOpen(false)
  }

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-50">
      <main className="px-6 py-5">
        {/* Header Actions */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-slate-900">Reports</h1>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                Static High-Fi
              </span>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              Đối soát chỉ số ca livestream, xác thực bằng chứng OCR và lưu trữ hồ sơ vận hành
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCreateReport}
              className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Sparkles className="h-4 w-4 text-blue-600" />
              Tạo báo cáo chốt ca
            </button>
            <button
              type="button"
              onClick={() => openPreview('export')}
              className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <FileDown className="h-4 w-4" />
              Xuất báo cáo
            </button>
          </div>
        </div>

        {/* Filters and Search Bar with Capped Workspace (Option 1) & Detail Focus (Option 2) */}
        {detailFocus ? (
          <section className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-xs text-[12px]">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-500">Danh sách báo cáo:</span>
              <strong className="font-bold text-slate-900">{selected.shift}</strong>
              <span className="text-slate-400 text-[11px]">({selected.id} · {selected.date} · {selected.platform} · {selected.studio})</span>
              <Badge className={selected.qualityClass}>{selected.quality}</Badge>
              <Badge className={selected.statusClass}>{selected.status}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailFocus(false)}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Mở rộng danh sách (6 ca)
              </button>
            </div>
          </section>
        ) : (
          <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-2.5 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {filterNode || (
                  <>
                    <div className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] text-slate-400">
                      <Search className="h-3.5 w-3.5 text-slate-400" />
                      Tìm kiếm mã báo cáo, ca live, brand...
                    </div>
                    {['01/09/2026 – 30/09/2026', 'Tất cả brand', 'Tất cả chiến dịch', 'Tất cả platform', 'Tất cả trạng thái', 'Độ đầy đủ dữ liệu'].map((label) => (
                      <FilterButton key={label} label={label} />
                    ))}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailFocus(true)}
                className="flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                title="Thu gọn danh sách để tập trung vào chi tiết báo cáo"
              >
                <Eye className="h-3.5 w-3.5" />
                Tập trung chi tiết
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[80px_1.35fr_0.65fr_0.65fr_0.55fr_0.48fr_0.65fr_0.6fr_0.65fr_32px] gap-2 border-b border-slate-200 bg-slate-100/70 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>Ngày</span>
              <span>Ca / Chiến dịch</span>
              <span>Brand</span>
              <span>Nền tảng</span>
              <span>Doanh thu</span>
              <span>Đơn hàng</span>
              <span>Chất lượng</span>
              <span>Trạng thái</span>
              <span>Cập nhật</span>
              <span />
            </div>

            {/* Table Body - Capped Scrollable Workspace (Option 1) */}
            <div className="max-h-[155px] overflow-y-auto divide-y divide-slate-100">
              {reports.map((report) => (
                <button
                  key={report.id}
                  data-report-id={report.id}
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  className={`grid w-full grid-cols-[80px_1.35fr_0.65fr_0.65fr_0.55fr_0.48fr_0.65fr_0.6fr_0.65fr_32px] items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-50/80 ${
                    selectedId === report.id ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-500/20' : 'bg-white'
                  }`}
                >
                  <span className="text-[11px] text-slate-500">{report.date}</span>
                  <div>
                    <strong className="block text-[12px] text-slate-800 font-semibold">{report.shift}</strong>
                    <small className="text-[10px] text-slate-400">
                      {report.id} · {report.time} · {report.studio}
                    </small>
                  </div>
                  <span className="text-[11px] font-medium text-slate-700">{report.brand}</span>
                  <span className="text-[11px] text-slate-600">{report.platform}</span>
                  <strong className="text-[11px] font-bold text-slate-900">{report.revenue}</strong>
                  <span className="text-[11px] text-slate-600">{report.orders}</span>
                  <Badge className={report.qualityClass}>{report.quality}</Badge>
                  <Badge className={report.statusClass}>{report.status}</Badge>
                  <span className="text-[10px] text-slate-500">{report.updated}</span>
                  <MoreHorizontal className="h-4 w-4 text-slate-400 hover:text-slate-600" />
                </button>
              ))}
            </div>

            {/* Table Pagination */}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
              <span>Hiển thị 1–6 của 48 báo cáo</span>
              <div className="flex items-center gap-1">
                <Page active>1</Page>
                <Page>2</Page>
                <Page>3</Page>
                <span className="px-1 text-slate-400">…</span>
                <Page>8</Page>
              </div>
            </div>
          </section>
        )}

        {/* Selected Report Workspace & Detailed Tabs */}
        <ReportWorkspace
          report={selected}
          canonicalMetrics={canonicalMetrics}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onDetail={() => openPreview('detail')}
          onEvidence={() => openPreview('evidence')}
          onExport={() => openPreview('export')}
          onOcrReview={() => openPreview('ocr-review')}
          filterNode={filterNode}
        />
      </main>

      {/* QaController removed */}

      {/* Visual QA Modal Dialogs */}
      {preview !== 'none' && (
        <ReportDialog
          state={preview}
          canonicalMetrics={canonicalMetrics}
          report={selected}
          onClose={() => setPreview('none')}
          onSwitchState={(next) => setPreview(next)}
        />
      )}
    </div>
  )
}

function ReportWorkspace({ canonicalMetrics,
  report,
  activeTab,
  setActiveTab,
  onDetail,
  onEvidence,
  onExport,
  onOcrReview,
  filterNode,
}: {
  canonicalMetrics: MappedMetric[]
  report: MappedReport
  activeTab: ReportTab
  setActiveTab: (t: ReportTab) => void
  onDetail: () => void
  onEvidence: () => void
  onExport: () => void
  onOcrReview: () => void
  filterNode?: React.ReactNode
}) {
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Detail Header */}
      <header className="border-b border-slate-100 bg-slate-50/50 px-5 py-3.5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[16px] font-bold text-slate-900">{report.shift}</h2>
              <Badge className={report.statusClass}>{report.status}</Badge>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                Mã: {report.id}
              </span>
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                Revision 2 (v2)
              </span>
              {report.analytics_eligible ? (
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> Đủ điều kiện Analytics
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                  <ShieldAlert className="h-3 w-3" /> Chưa vào Analytics (Chờ Confirmed)
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Nguồn: Live Snapshot Ca {report.shift_id} · {report.platform} · {report.date} ({report.time}) · {report.studio}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOcrReview}
              className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye className="h-3.5 w-3.5 text-blue-600" />
              Đối soát OCR
            </button>
            <button
              type="button"
              onClick={onDetail}
              className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
            >
              <FileText className="h-3.5 w-3.5" />
              Xem chi tiết
            </button>
            <button
              type="button"
              onClick={onExport}
              className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[11px] font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Xuất file
            </button>
          </div>
        </div>

        {/* Live to Report Lineage Callout */}
        <div className="mt-3 flex items-center justify-between rounded-md bg-white border border-slate-200 px-3 py-2 text-[11px]">
          <div className="flex items-center gap-2 text-slate-600">
            <Layers className="h-4 w-4 text-blue-600" />
            <strong className="text-slate-800">Truy vết nguồn gốc dữ liệu:</strong>
            <span>Ca live SHF-20260906-A (Snapshot 22:58)</span>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <span>Tesseract OCR v5 (Ảnh #1)</span>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <span>Bản nháp đối soát</span>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <span className="font-semibold text-emerald-700">Chốt số liệu (Confirmed by Leader)</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Source of Truth: Supabase Production DB · report_id: {report.id}
          </div>
        </div>
      </header>

      {/* Top 5 Highlight Metric Cards - Compact Presentation */}
      <div className="grid grid-cols-5 gap-2.5 px-5 py-2.5 border-b border-slate-100 bg-white">
        {canonicalMetrics.slice(0, 5).map((metric) => (
          <MetricCard key={metric.key} label={metric.label} value={metric.value} source={metric.source} freshness={metric.freshness} />
        ))}
      </div>

      {/* State Callout Banners for High Visual Distinctiveness */}
      {report.quality === 'Missing' && (
        <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-900 flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-[13px] font-bold">Trạng thái: Chưa có dữ liệu báo cáo (Missing Data)</strong>
            <span>Ca livestream đã kết thúc nhưng chưa ghi nhận dữ liệu chốt ca hoặc ảnh bằng chứng. Xem mục Hoạt động để theo dõi trạng thái phân công và cập nhật.</span>
          </div>
        </div>
      )}
      {report.quality === 'Partial' && (
        <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-[13px] font-bold">Trạng thái: Dữ liệu một phần (Partial Metrics)</strong>
            <span>Báo cáo chỉ ghi nhận một phần chỉ số từ nguồn dữ liệu. Các trường bị thiếu không tự động điền về 0 (Quy tắc hệ thống: NULL != 0).</span>
          </div>
        </div>
      )}
      {report.status === 'Reopened' && (
        <div className="mx-5 mt-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-[12px] text-purple-900 flex items-start gap-3">
          <Unlock className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-[13px] font-bold">Trạng thái: Báo cáo đã được mở lại (Reopened)</strong>
            <span>Báo cáo đã được mở lại để kiểm tra và cập nhật thêm. Xem mục Hoạt động để biết người thực hiện, thời điểm và lý do được ghi nhận. Phân quyền: Có thể chỉnh sửa (Editable).</span>
          </div>
        </div>
      )}
      {report.status === 'Archived' && (
        <div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-100 p-3 text-[12px] text-slate-800 flex items-start gap-3">
          <Archive className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-[13px] font-bold">Trạng thái: Hồ sơ đã lưu trữ (Archived)</strong>
            <span>Hồ sơ báo cáo đã được chuyển sang trạng thái lưu trữ (Archived). Phân quyền: Chỉ đọc (Read-only). Xem mục Hoạt động để tra cứu lịch sử thay đổi.</span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50/60 px-5 text-[12px] font-semibold text-slate-500">
        {REPORT_TABS.map((item) => (
          <button
            key={item}
            data-tab={item}
            type="button"
            onClick={() => setActiveTab(item)}
            className={`border-b-2 px-4 py-2.5 transition-colors ${
              activeTab === item
                ? 'border-blue-600 text-blue-600 bg-white font-bold'
                : 'border-transparent hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Tab Content Display */}
      <div className="p-5">
        {activeTab === 'Tổng quan' && <OverviewTab canonicalMetrics={canonicalMetrics} report={report} onEvidence={onEvidence} onOcrReview={onOcrReview} />}
        {activeTab === 'Metrics' && <MetricsTab canonicalMetrics={canonicalMetrics} report={report} />}
        {activeTab === 'OCR & Bằng chứng' && <OcrEvidenceTab onOcrReview={onOcrReview} />}
        {activeTab === 'Nhân sự' && <StaffingTab />}
        {activeTab === 'Ghi chú / Recap' && <EndOfShiftRecapTab />}
        {activeTab === 'Hoạt động' && <ActivityHistoryTab />}
      </div>
    </section>
  )
}

// -------------------------------------------------------------
// TAB 1: OVERVIEW (Tổng quan)
// -------------------------------------------------------------
function OverviewTab({ canonicalMetrics,
  report,
  onEvidence,
  onOcrReview,
}: {
  canonicalMetrics: MappedMetric[]
  report: MappedReport
  onEvidence: () => void
  onOcrReview: () => void
}) {
  return (
    <div className="grid grid-cols-[minmax(0,7fr)_minmax(280px,3.2fr)] gap-5">
      <div className="space-y-4">
        {/* Performance Chart & Shift Results */}
        <div className="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-800">
                Hiệu suất thời gian thực ca Live
              </h3>
              <p className="text-[11px] text-slate-500">Doanh thu & số mắt xem theo mốc thời gian</p>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {report.time} ({report.duration_minutes} phút)
            </span>
          </div>
          <PerformanceLine />
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Result label="Trạng thái ca live" value="Đã hoàn thành (100%)" />
            <Result label="Nhân sự tham gia" value="3/3 có mặt đúng giờ" />
            <Result label="Sự cố vận hành" value="1 sự cố nhỏ (đã xử lý)" />
          </div>
        </div>

        {/* Highlights & Executive Notes */}
        <div className="grid grid-cols-2 gap-4">
          <CompactPanel
            title="Điểm nhấn thành công"
            lines={[
              'Doanh thu đạt 24.5M (Vượt 112% mục tiêu ca)',
              '321 đơn hàng hoàn tất đối soát với Seller Center',
              'AOV đạt 76.3K ổn định với combo chủ đạo',
              'CTR chạm đỉnh 36.62% trong flash deal',
            ]}
          />
          <CompactPanel
            title="Đề xuất cải thiện ca tới"
            lines={[
              'Cần bổ sung quà tặng bình giữ nhiệt thêm 50 suất',
              'Đổi micro cài áo dự phòng sớm hơn trước giờ phát',
              'Tối ưu thời gian nhắc nhở voucher shop ở 15 phút đầu',
            ]}
          />
        </div>
      </div>

      {/* Right Sidebar: Context & Metadata */}
      <aside className="space-y-4">
        {/* Report Identity & Context */}
        <div className="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            Thông tin định danh báo cáo
          </h3>
          <div className="mt-3 space-y-2 text-[11px]">
            <InfoRow label="Mã báo cáo" value={report.id} />
            <InfoRow label="Mã ca live" value={report.shift_id} />
            <InfoRow label="Brand / Nhãn hàng" value={report.brand} />
            <InfoRow label="Nền tảng (Platform)" value={report.platform} />
            <InfoRow label="Chiến dịch (Campaign)" value={report.campaign} />
            <InfoRow label="Phòng Studio" value={report.studio} />
            <InfoRow label="Ngày báo cáo" value={report.date} />
            <InfoRow label="Thời lượng ca" value={`${report.duration_minutes} phút (20:00–23:00)`} />
            <InfoRow label="Người tạo" value="Nguyễn Trung Kiên (Host)" />
            <InfoRow label="Ngày tạo" value="06/09/2026 23:05" />
            <InfoRow label="Người xác nhận" value="Nguyễn Trung Kiên (Leader)" />
            <InfoRow label="Ngày xác nhận" value="10/09/2026 08:30" />
            <InfoRow label="Trạng thái chỉ số" value="Đã khóa xác nhận (Locked)" />
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
            <a
              href="https://tiktok.com/live/replay/741298471923"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between text-[11px] text-blue-600 hover:underline"
            >
              <span>Xem video Replay ca Live</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://seller-vn.tiktok.com/compass/live/741298471923"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between text-[11px] text-blue-600 hover:underline"
            >
              <span>Link TikTok Seller Center Dashboard</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Quality & Readiness */}
        <div className="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            Độ đầy đủ & Chất lượng dữ liệu
          </h3>
          <div className="mt-3 space-y-1.5">
            <InfoRow label="Chỉ số yêu cầu" value="7/7 bắt buộc có đủ" />
            <InfoRow label="Chỉ số đã xác minh (Verified)" value="14 chỉ số" />
            <InfoRow label="Chỉ số OCR nhận diện" value="12 chỉ số (96.4%)" />
            <InfoRow label="Chỉ số bổ sung thủ công" value="2 chỉ số (AOV, Ads)" />
            <InfoRow label="Chỉ số thiếu / Null" value="0 chỉ số" />
            <InfoRow label="Trạng thái chốt ca" value="Sẵn sàng hoàn tất" />
          </div>
        </div>

        {/* Screenshot Evidence Card */}
        <button
          type="button"
          onClick={onEvidence}
          className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-400 hover:bg-blue-50/20 transition-all"
        >
          <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[#082743] text-white">
            <ImageIcon className="h-5 w-5 text-blue-400" />
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block text-[12px] text-slate-800 truncate">Bằng chứng Screenshot chốt ca</strong>
            <small className="text-[10px] text-slate-500 block">22:58 · TikTok Seller Center · Fresh</small>
            <span className="text-[10px] text-blue-600 font-semibold mt-0.5 inline-block">Xem & đối soát OCR →</span>
          </div>
        </button>
      </aside>
    </div>
  )
}

// -------------------------------------------------------------
// TAB 2: METRICS TAB (Danh sách đầy đủ tất cả chỉ số)
// -------------------------------------------------------------
function MetricsTab({ report, canonicalMetrics }: { report?: MappedReport, canonicalMetrics: MappedMetric[] }) {
  const isPartial = report?.quality === 'Partial';
  const isMissing = report?.quality === 'Missing';
  const displayMetrics = canonicalMetrics.map((m) => {
    if (isMissing) {
      return { ...m, value: 'Missing (—)', status: 'missing' as const, review: 'Chưa có' };
    }
    if (isPartial) {
      if (m.key === 'ctr') return { ...m, value: 'Missing (—)', status: 'missing' as const, review: 'Chưa có' };
      if (m.key === 'advertising_cost') return { ...m, value: 'Unavailable (Chưa nhập)', status: 'unavailable' as const, review: 'Chờ nhập liệu' };
    }
    return m;
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-bold text-slate-900">Từ điển toàn bộ chỉ số báo cáo (Metrics Dictionary)</h3>
          <p className="text-[11px] text-slate-500">
            Bao gồm 15 chỉ số nghiệp vụ chuẩn, độ tin cậy OCR, nguồn dữ liệu và trạng thái kiểm duyệt
          </p>
        </div>
        <div className="flex gap-2">
          <span className="flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> 14/15 Đã chốt số
          </span>
          <span className="flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
            <span className="h-2 w-2 rounded-full bg-blue-500" /> Nguồn OCR + Tính toán
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.3fr_0.9fr_0.6fr_0.9fr_0.8fr_0.7fr_0.8fr_0.7fr] bg-slate-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <span>Chỉ số / Tên chuẩn</span>
          <span>Giá trị hiển thị</span>
          <span>Đơn vị</span>
          <span>Nguồn (Provenance)</span>
          <span>Độ tin cậy OCR</span>
          <span>Độ mới (Freshness)</span>
          <span>Trạng thái duyệt</span>
          <span>Bắt buộc</span>
        </div>

        {displayMetrics.map((metric) => (
          <div
            key={metric.key}
            className="grid grid-cols-[1.3fr_0.9fr_0.6fr_0.9fr_0.8fr_0.7fr_0.8fr_0.7fr] items-center border-t border-slate-100 px-4 py-3 text-[11px] hover:bg-slate-50 transition-colors"
          >
            <div>
              <strong className="block text-[12px] text-slate-800 font-semibold">{metric.label}</strong>
              <code className="text-[10px] text-slate-400 font-mono">{metric.key}</code>
            </div>
            <div>
              <strong className="text-[12px] font-bold text-slate-900">{metric.value}</strong>
            </div>
            <span className="text-slate-500">{metric.unit}</span>
            <span className="text-slate-600 font-medium">{metric.source}</span>
            <div>
              <span className="text-slate-600 font-medium">{metric.confidence}</span>
              {metric.confidence !== '—' && (
                <span className="ml-1 text-[10px] text-emerald-600 font-semibold">(Cao)</span>
              )}
            </div>
            <div>
              <Freshness value={metric.freshness} />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Check className="h-3 w-3" /> {metric.review}
              </span>
            </div>
            <div>
              {metric.required ? (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">Bắt buộc</span>
              ) : (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Tùy chọn</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// TAB 3: OCR & EVIDENCE TAB (Split view + Bounding boxes)
// -------------------------------------------------------------
function OcrEvidenceTab({ onOcrReview }: { onOcrReview: () => void }) {
  const detectedCards = [
    { key: 'revenue', label: 'DOANH THU', raw: '24.500.000d', parsed: '24,500,000', conf: '98%', box: '{ x: 42, y: 118, w: 180, h: 64 }', status: 'Verified' },
    { key: 'orders', label: 'DON HANG', raw: '321', parsed: '321', conf: '94%', box: '{ x: 230, y: 118, w: 140, h: 64 }', status: 'Verified' },
    { key: 'peak_viewer', label: 'NGUOI XEM CAO NHAT', raw: '1.420', parsed: '1,420', conf: '99%', box: '{ x: 380, y: 118, w: 160, h: 64 }', status: 'Verified' },
    { key: 'average_viewer', label: 'NGUOI XEM TB', raw: '485', parsed: '485', conf: '98%', box: '{ x: 550, y: 118, w: 140, h: 64 }', status: 'Verified' },
    { key: 'ctr', label: 'TY LE NHAP CTR', raw: '36,62%', parsed: '36.62%', conf: '72%', box: '{ x: 700, y: 118, w: 140, h: 64 }', status: 'Manually Checked' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-[14px] font-bold text-slate-900">Chi tiết nhận diện OCR & Đối chiếu bằng chứng</h3>
          <p className="text-[11px] text-slate-500">
            So sánh trực quan giữa ảnh chụp màn hình gốc và dữ liệu số trích xuất qua Tesseract OCR
          </p>
        </div>
        <button
          type="button"
          onClick={onOcrReview}
          className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          <Pencil className="h-3 w-3" /> Mở chế độ chỉnh sửa OCR
        </button>
      </div>

      <div className="grid grid-cols-[1.1fr_1fr] gap-5">
        {/* Left: Screenshot with Bounding Boxes */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[12px] text-slate-800 uppercase">Ảnh chụp màn hình gốc</span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Fresh (22:58)
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Độ phân giải: 1920 × 1080 · 1.84 MB</span>
          </div>

          <div className="relative mt-3 h-[280px] w-full overflow-hidden rounded-md bg-[#082743] flex items-center justify-center border border-slate-800">
            {/* Visual Screenshot Graphic */}
            <div className="p-4 text-center text-white/80">
              <ImageIcon className="mx-auto h-10 w-10 text-blue-400 mb-2" />
              <div className="text-[12px] font-bold text-white">TikTok Shop Seller Center · Live Dashboard</div>
              <div className="text-[10px] text-slate-400">Ca Live: Pharmaton 9.9 · Bắt đầu 20:00 · Kết thúc 23:00</div>
            </div>

            {/* Simulated Bounding Box Overlay */}
            <div className="absolute top-14 left-10 right-10 h-28 rounded border-2 border-emerald-400 bg-emerald-500/10 p-2">
              <span className="absolute -top-3 left-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                Detected KPI Region (ROI Confidence: 98.2%)
              </span>
              <div className="grid grid-cols-4 gap-2 h-full items-center text-center text-[10px] text-white">
                <div className="rounded border border-emerald-300/40 p-1">
                  <div className="text-slate-300 text-[8px]">Doanh thu</div>
                  <div className="font-bold text-emerald-300">24.500.000₫</div>
                </div>
                <div className="rounded border border-emerald-300/40 p-1">
                  <div className="text-slate-300 text-[8px]">Đơn hàng</div>
                  <div className="font-bold text-emerald-300">321</div>
                </div>
                <div className="rounded border border-emerald-300/40 p-1">
                  <div className="text-slate-300 text-[8px]">Peak Viewers</div>
                  <div className="font-bold text-emerald-300">1.420</div>
                </div>
                <div className="rounded border border-amber-300/40 p-1">
                  <div className="text-slate-300 text-[8px]">CTR</div>
                  <div className="font-bold text-amber-300">36.62%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>Tên file: tiktok_live_dashboard_2258.png</span>
            <span className="text-blue-600 font-semibold cursor-pointer hover:underline">Phóng to ảnh đầy đủ</span>
          </div>
        </div>

        {/* Right: Detected Values Table */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            Chỉ số bóc tách từ OCR (ROI Extraction)
          </h4>

          <div className="mt-3 space-y-2">
            {detectedCards.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/70 p-2.5 text-[11px]"
              >
                <div>
                  <strong className="block text-[12px] text-slate-800">{item.label}</strong>
                  <div className="text-[10px] text-slate-400">
                    Văn bản nhận diện: <code className="text-slate-600 font-mono">{item.raw}</code>
                  </div>
                </div>
                <div className="text-right">
                  <strong className="block text-[13px] text-slate-900 font-bold">{item.parsed}</strong>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-[10px] text-emerald-600 font-semibold">Conf: {item.conf}</span>
                    <Badge className="bg-emerald-50 text-emerald-700 text-[9px]">{item.status}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* OCR Engine Diagnostics Box */}
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-slate-700">
              <span>Thông số Engine OCR:</span>
              <span className="text-blue-600 font-mono">Tesseract.js v5.1.0</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-[10px] text-slate-500">
              <span>Ngôn ngữ nhận diện:</span>
              <span className="text-slate-800 font-medium">eng+vie</span>
              <span>Độ tin cậy tổng thể:</span>
              <span className="text-emerald-700 font-bold">96.4% (Cao)</span>
              <span>Layout Family:</span>
              <span className="text-slate-800 font-medium">TikTok Shop Standard Desktop</span>
              <span>Xử lý tiền kỳ:</span>
              <span className="text-slate-800 font-medium">Grayscale + Otsu Thresholding</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// TAB 4: STAFFING TAB (Nhân sự)
// -------------------------------------------------------------
function StaffingTab() {
  const staff = [
    { name: 'Nguyễn A', role: 'Host chính', time: '20:00–23:00', attendance: 'Đúng giờ (19:30)', match: 'Exact Match', report_status: 'Đã xác nhận chỉ số' },
    { name: 'Nguyễn B', role: 'Trợ live & Deal', time: '20:00–23:00', attendance: 'Đúng giờ (19:40)', match: 'Exact Match', report_status: 'Đã kiểm tra voucher' },
    { name: 'Nguyễn C', role: 'Kỹ thuật & OBS', time: '20:00–23:00', attendance: 'Đúng giờ (19:15)', match: 'Exact Match', report_status: 'Đã xử lý micro' },
    { name: 'Nguyễn Văn D', role: 'Hỗ trợ kho hàng', time: '20:00–23:00', attendance: 'Bổ sung ca', match: 'Normalized', report_status: 'Đã đối soát tồn kho' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[14px] font-bold text-slate-900">Bối cảnh nhân sự ca livestream</h3>
        <p className="text-[11px] text-slate-500">
          Danh sách nhân sự tham gia ca live, vai trò vận hành, chấm công và xác nhận báo cáo
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr] bg-slate-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
          <span>Nhân sự</span>
          <span>Vai trò vận hành</span>
          <span>Ca đăng ký</span>
          <span>Điểm danh</span>
          <span>Khớp danh tính</span>
          <span>Trạng thái báo cáo</span>
        </div>

        {staff.map((person) => (
          <div
            key={person.name}
            className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.9fr_1fr] items-center border-t border-slate-100 px-4 py-3 text-[11px] hover:bg-slate-50"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                {person.name.charAt(person.name.length - 1)}
              </span>
              <strong className="text-[12px] text-slate-800">{person.name}</strong>
            </div>
            <span className="font-semibold text-slate-700">{person.role}</span>
            <span className="text-slate-500">{person.time}</span>
            <span className="text-emerald-700 font-medium">{person.attendance}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-mono w-fit">
              {person.match}
            </span>
            <span className="text-slate-700 font-medium">{person.report_status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// TAB 5: END-OF-SHIFT RECAP (9 FinalReportRecap fields)
// -------------------------------------------------------------
function EndOfShiftRecapTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-[14px] font-bold text-slate-900">Tổng kết cuối ca (End-of-Shift Recap)</h3>
          <p className="text-[11px] text-slate-500">
            Lưu giữ đầy đủ 9 trường thông tin định tính theo chuẩn hệ thống cũ, phục vụ phân tích chi tiết
          </p>
        </div>
        <span className="rounded bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
          ✓ Đầy đủ 9/9 mục recap
        </span>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Group 1: Hiệu suất & Lưu lượng */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h4 className="text-[12px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <BarChart2 className="h-4 w-4" /> 1. Hiệu suất & Lưu lượng
          </h4>
          <RecapItem
            field="traffic_summary"
            label="Tổng kết lưu lượng truy cập (Traffic Summary)"
            content="Lưu lượng người xem tăng vọt từ 21:00 đến 22:15 khi tung deal 1K. Duy trì trung bình 485 mắt xem liên tục, tỷ lệ giữ chân khán giả trên 90 giây đạt 42%."
          />
          <RecapItem
            field="best_performing_time_slots"
            label="Khung giờ đạt đỉnh hiệu quả (Best Performing Time Slots)"
            content="21:00 – 21:45 (Khung giờ đỉnh vàng, đóng góp 48% tổng doanh thu ca live nhờ sự xuất hiện của deal combo 399K)."
          />
          <RecapItem
            field="top_selling_products"
            label="Top sản phẩm bán chạy (Top Selling Products)"
            content="1. Pharmaton Energy 30s (182 hộp) | 2. Pharmaton Essential (89 hộp) | 3. Pharmaton G115 (50 hộp)."
          />
        </div>

        {/* Group 2: Khuyến mãi & Vouchers */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h4 className="text-[12px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Layers className="h-4 w-4" /> 2. Khuyến mãi & Mã giảm giá
          </h4>
          <RecapItem
            field="platform_vouchers"
            label="Voucher sàn (Platform Vouchers)"
            content="Voucher sàn 50K cho đơn từ 250K hết trong 8 phút. Voucher freeship xtra kích hoạt hiệu quả 100% người mua hàng."
          />
          <RecapItem
            field="shop_vouchers"
            label="Voucher của Shop (Shop Vouchers)"
            content="Voucher Follower 10K đạt tỷ lệ sử dụng 92% (145 lượt dùng thành công), hỗ trợ tăng thêm 350 người theo dõi mới."
          />
        </div>

        {/* Group 3: Khách hàng & Phản hồi */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h4 className="text-[12px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <Users className="h-4 w-4" /> 3. Khách hàng & Phản hồi
          </h4>
          <RecapItem
            field="customer_product_gift_interest"
            label="Mối quan tâm quà tặng & sản phẩm (Gift & Product Interest)"
            content="Khách hàng đặc biệt hào hứng với quà tặng bình giữ nhiệt cao cấp đi kèm combo 2 hộp Pharmaton Energy."
          />
          <RecapItem
            field="main_comment_topics"
            label="Chủ đề bình luận chính (Main Comment Topics)"
            content="Hỏi về hạn sử dụng, cách dùng cho người cao tuổi, thời gian nhận hàng tại TP.HCM và Hà Nội."
          />
          <RecapItem
            field="live_price_feedback"
            label="Phản hồi về mức giá Live (Price Feedback)"
            content="Mức giá combo 399K nhận phản hồi rất tích cực, nhiều khách hàng để lại bình luận đã chốt 2 combo liên tiếp."
          />
        </div>

        {/* Group 4: Vận hành & Sự cố */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h4 className="text-[12px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <AlertTriangle className="h-4 w-4" /> 4. Vận hành & Kỹ thuật ca
          </h4>
          <RecapItem
            field="live_issues"
            label="Sự cố kỹ thuật / vận hành (Live Issues)"
            content="Micro cài áo số 1 chập chờn lúc 20:45, kỹ thuật đã đổi sang micro dự phòng trong 30 giây, không gián đoạn luồng stream."
          />
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-[11px] text-emerald-800">
            <strong>Đánh giá chung ca live:</strong> Ca trực đạt chất lượng xuất sắc, phối hợp giữa Host và Trợ live nhịp nhàng.
          </div>
        </div>
      </div>
    </div>
  )
}

function RecapItem({ field, label, content }: { field: string; label: string; content: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-slate-800">{label}</span>
        <code className="text-[9px] text-slate-400 font-mono">{field}</code>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-600">{content}</p>
    </div>
  )
}

// -------------------------------------------------------------
// TAB 6: ACTIVITY & REVISION HISTORY (Hoạt động)
// -------------------------------------------------------------
function ActivityHistoryTab() {
  const events = [
    { time: '10/09 · 09:02', actor: 'Hệ thống', title: 'Xuất file báo cáo', desc: 'File Excel (.xlsx) được xuất phục vụ đối soát đối tác.' },
    { time: '10/09 · 08:30', actor: 'Nguyễn Trung Kiên (Leader)', title: 'Xác nhận báo cáo (Confirmed)', desc: 'Leader duyệt toàn bộ chỉ số và khóa báo cáo (Revision 2.0).' },
    { time: '09/09 · 16:45', actor: 'Trần Hoàng Nam (Admin)', title: 'Đối chiếu số liệu', desc: 'Kiểm tra sao kê TikTok Seller Center, đối chiếu số liệu đơn hàng.' },
    { time: '07/09 · 08:30', actor: 'Nguyễn A (Host)', title: 'Chuyển trạng thái Chờ duyệt (In Review)', desc: 'Hoàn thiện 9 mục recap và gửi báo cáo lên cấp quản lý.' },
    { time: '07/09 · 08:15', actor: 'Nguyễn A (Host)', title: 'Chỉnh sửa chỉ số thủ công', desc: 'Chỉnh sửa định dạng số CTR từ 36% sang 36.62% theo ảnh chụp.' },
    { time: '06/09 · 23:09', actor: 'Hệ thống Tesseract OCR', title: 'Hoàn tất quét OCR', desc: 'Trích xuất tự động 14 trường chỉ số từ screenshot (Confidence: 96.4%).' },
    { time: '06/09 · 23:08', actor: 'Nguyễn C (Technical)', title: 'Upload ảnh bằng chứng', desc: 'Đã tải lên ảnh dashboard kết thúc ca live (IMG-0906-01).' },
    { time: '06/09 · 23:05', actor: 'Hệ thống', title: 'Khởi tạo bản nháp báo cáo', desc: 'Báo cáo RPT-0906-01 được tạo tự động khi ca live hoàn tất.' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[14px] font-bold text-slate-900">Lịch sử hoạt động & Phiên bản (Revisions)</h3>
        <p className="text-[11px] text-slate-500">
          Nhật ký kiểm toán đầy đủ từ lúc khởi tạo ca live, nhận diện OCR, chỉnh sửa đến khi xác nhận cuối cùng
        </p>
      </div>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
        {events.map((ev, idx) => (
          <div key={ev.time + ev.title} className="relative flex items-start gap-3">
            <span className="absolute -left-6 mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white ring-4 ring-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <div className="flex-1 rounded-lg border border-slate-100 bg-white p-3 shadow-sm text-[11px]">
              <div className="flex items-center justify-between">
                <strong className="text-[12px] font-bold text-slate-900">{ev.title}</strong>
                <span className="text-[10px] text-slate-400 font-medium">{ev.time}</span>
              </div>
              <p className="mt-1 text-slate-600">{ev.desc}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                <User className="h-3 w-3 text-slate-400" />
                <span>Thực hiện bởi: {ev.actor}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------
// MODALS & QA DIALOGS
// -------------------------------------------------------------
function ReportDialog({
  state,
  report,
  onClose,
  onSwitchState,
}: {
  state: Exclude<ReportsPreview, 'none'>
  canonicalMetrics: MappedMetric[]
  report: MappedReport
  onClose: () => void
  onSwitchState: (next: Exclude<ReportsPreview, 'none'>) => void
}) {
  const titles: Record<Exclude<ReportsPreview, 'none'>, string> = {
    detail: 'Chi tiết báo cáo hoàn tất (Confirmed)',
    export: 'Xuất file báo cáo tổng hợp',
    evidence: 'Thư viện ảnh bằng chứng & Screenshots',
    partial: 'Báo cáo có dữ liệu một phần (Partial Metrics)',
    missing: 'Báo cáo chưa có dữ liệu (Missing Data)',
    success: 'Xuất file thành công',
    'ocr-review': 'Đối soát & Kiểm tra OCR (Verified)',
    'ocr-needs-review': 'Đối soát OCR Cần duyệt (Needs Review)',
    'ocr-failed': 'OCR Thất bại (Recognition Failed)',
    'stale-evidence': 'Bằng chứng quá hạn / Cũ (Stale Evidence)',
    'create-candidate': 'Khởi tạo báo cáo cho ca vừa hoàn tất',
    reopened: 'Báo cáo đã mở lại để điều chỉnh (Reopened)',
    archived: 'Báo cáo đã lưu trữ (Archived Record)',
  }

  const isWide = [
    'detail',
    'evidence',
    'ocr-review',
    'ocr-needs-review',
    'stale-evidence',
    'partial',
    'create-candidate',
  ].includes(state)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={titles[state]}
        className={`${
          isWide ? 'w-[840px]' : 'w-[520px]'
        } max-w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl`}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">{titles[state]}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {report.shift} · Mã: {report.id} ({report.date})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-6">
          {state === 'detail' && <DetailModalContent report={report} />}
          {state === 'export' && <ExportModalContent onExportSuccess={() => onSwitchState('success')} />}
          {state === 'evidence' && <EvidenceGalleryContent />}
          {state === 'partial' && <PartialModalContent />}
          {state === 'missing' && <MissingModalContent />}
          {state === 'success' && <SuccessModalContent onClose={onClose} />}
          {state === 'ocr-review' && <OcrReviewModalContent needsReview={false} />}
          {state === 'ocr-needs-review' && <OcrReviewModalContent needsReview={true} />}
          {state === 'ocr-failed' && <OcrFailedModalContent />}
          {state === 'stale-evidence' && <StaleEvidenceModalContent />}
          {state === 'create-candidate' && <CreateCandidateModalContent />}
          {state === 'reopened' && <ReopenedModalContent />}
          {state === 'archived' && <ArchivedModalContent />}

          <DialogFooter state={state} onClose={onClose} />
        </div>
      </section>
    </div>
  )
}

function DetailModalContent({ report }: { canonicalMetrics?: MappedMetric[], report: MappedReport }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-900 flex items-center justify-between">
        <div>
          <strong>Báo cáo đã xác nhận chính thức (Confirmed)</strong>
          <p className="text-blue-700">Tất cả chỉ số đã được đối soát với TikTok Shop Seller Center và khóa sửa đổi.</p>
        </div>
        <span className="rounded bg-emerald-600 text-white font-bold text-[10px] px-2 py-1">
          Revision 2.0 Locked
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-md border border-slate-200 p-3 space-y-2 text-[11px]">
          <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">Thông tin chốt ca</h4>
          <InfoRow label="Người duyệt" value="Nguyễn Trung Kiên (Leader)" />
          <InfoRow label="Thời điểm chốt" value="10/09/2026 · 08:30" />
          <InfoRow label="Doanh thu xác nhận" value="24.500.000 ₫" />
          <InfoRow label="Đơn hàng xác nhận" value="321 đơn" />
          <InfoRow label="CTR xác nhận" value="36.62%" />
        </div>
        <div className="rounded-md border border-slate-200 p-3 space-y-2 text-[11px]">
          <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">Bằng chứng & Hồ sơ</h4>
          <InfoRow label="Bằng chứng chính" value="tiktok_live_dashboard_2258.png" />
          <InfoRow label="Engine OCR" value="Tesseract.js v5.1.0" />
          <InfoRow label="Analytics status" value="Eligible (Đã tổng hợp)" />
          <InfoRow label="Trạng thái phân quyền" value="Read-only (Chỉ Admin mở lại)" />
        </div>
      </div>
    </div>
  )
}

function PartialModalContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="block text-[12px]">Báo cáo dữ liệu một phần (Partial Metrics)</strong>
          <span>
            Báo cáo chỉ ghi nhận một phần chỉ số từ nguồn dữ liệu. Các trường bị thiếu không tự động điền về 0.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-[11px]">
        <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
          <strong className="block text-emerald-800 mb-2 font-bold uppercase text-[10px]">Chỉ số đã ghi nhận (Available)</strong>
          <div className="space-y-1.5">
            <InfoRow label="Doanh thu" value="11.700.000 ₫" />
            <InfoRow label="Số đơn hàng" value="156 đơn" />
            <InfoRow label="Thời lượng" value="180 phút" />
          </div>
        </div>
        <div className="rounded-md border border-rose-200 bg-rose-50/50 p-3">
          <strong className="block text-rose-800 mb-2 font-bold uppercase text-[10px]">Chỉ số chưa có / bị thiếu (Missing)</strong>
          <div className="space-y-1.5">
            <InfoRow label="Tỷ lệ nhấp (CTR)" value="Missing (—)" />
            <InfoRow label="Tỷ lệ chuyển đổi (CVR)" value="Missing (—)" />
            <InfoRow label="Chi phí Ads" value="Unavailable (Chưa nhập)" />
          </div>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">
        * Quy tắc hệ thống: Dữ liệu bị thiếu (Missing/Null) không được tự động chuyển thành 0 để bảo toàn tính toàn vẹn dữ liệu.
      </p>
    </div>
  )
}

function MissingModalContent() {
  return (
    <div className="text-center py-4 space-y-3">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
        <XCircle className="h-8 w-8" />
      </div>
      <h3 className="text-[15px] font-bold text-slate-900">Chưa có dữ liệu báo cáo</h3>
      <p className="mx-auto max-w-[380px] text-[11px] leading-relaxed text-slate-500">
        Ca livestream đã kết thúc nhưng chưa ghi nhận dữ liệu chốt ca hoặc ảnh chụp màn hình bằng chứng.
      </p>
      <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 max-w-[400px] mx-auto text-left space-y-1">
        <div><strong>Hành động cần thực hiện:</strong></div>
        <div>1. Thu thập ảnh chụp màn hình dashboard ca live từ Host / Trợ live.</div>
        <div>2. Tải ảnh lên mục "OCR & Bằng chứng" để hệ thống tự động bóc tách số liệu.</div>
      </div>
    </div>
  )
}

function OcrReviewModalContent({ needsReview }: { needsReview: boolean }) {
  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg p-3 text-[11px] border flex items-center justify-between ${
          needsReview
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        <div>
          <strong>{needsReview ? 'OCR Cần kiểm tra lại (Needs Review)' : 'OCR Đã đối soát chuẩn xác (Verified)'}</strong>
          <p className={needsReview ? 'text-amber-700' : 'text-emerald-700'}>
            {needsReview
              ? 'Tỷ lệ nhận diện một số thẻ KPI < 80%. Vui lòng đối chiếu với ảnh bên trái.'
              : 'Tất cả các thẻ chỉ số chính đều có độ tin cậy > 95%.'}
          </p>
        </div>
        <span className="font-bold text-[11px] px-2 py-1 rounded bg-white/80 shadow-xs">
          {needsReview ? 'Confidence: 74.2%' : 'Confidence: 98.2%'}
        </span>
      </div>

      <div className="grid grid-cols-[1.1fr_1fr] gap-4">
        {/* Left Side: Mock Visual Image Preview */}
        <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 text-white flex flex-col justify-between h-[280px]">
          <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-800 pb-2">
            <span>TikTok Shop Live Dashboard Screenshot</span>
            <span className="text-emerald-400">ROI Active</span>
          </div>
          <div className="p-4 text-center">
            <ImageIcon className="mx-auto h-8 w-8 text-blue-400 mb-1" />
            <div className="text-[12px] font-bold">24.500.000₫ · 321 ĐƠN</div>
            <div className="text-[10px] text-slate-400">1.420 PCU · CTR 36.62%</div>
          </div>
          <div className="text-[10px] text-slate-400 text-center">
            Tọa độ nhận diện: crop_box: [40, 110, 960, 540]
          </div>
        </div>

        {/* Right Side: Verification Rows */}
        <div className="space-y-2 text-[11px]">
          <div className="rounded border border-slate-200 p-2 bg-slate-50 flex justify-between items-center">
            <div>
              <span className="text-slate-500 block text-[10px]">Doanh thu</span>
              <strong className="text-[12px] text-slate-800">24.500.000 ₫</strong>
            </div>
            <span className="text-emerald-600 font-semibold text-[10px]">98% Verified</span>
          </div>
          <div className="rounded border border-slate-200 p-2 bg-slate-50 flex justify-between items-center">
            <div>
              <span className="text-slate-500 block text-[10px]">Số đơn hàng</span>
              <strong className="text-[12px] text-slate-800">321 đơn</strong>
            </div>
            <span className="text-emerald-600 font-semibold text-[10px]">94% Verified</span>
          </div>
          <div
            className={`rounded border p-2 flex justify-between items-center ${
              needsReview ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div>
              <span className="text-slate-500 block text-[10px]">Tỷ lệ nhấp (CTR)</span>
              <strong className="text-[12px] text-slate-800">36.62%</strong>
            </div>
            <span className={needsReview ? 'text-amber-700 font-bold text-[10px]' : 'text-emerald-600 text-[10px]'}>
              {needsReview ? '72% Cần xem lại' : '96% Verified'}
            </span>
          </div>
          <button
            type="button"
            className="w-full mt-2 h-8 rounded border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5"
          >
            <Pencil className="h-3 w-3" /> Chỉnh sửa thủ công giá trị
          </button>
        </div>
      </div>
    </div>
  )
}

function OcrFailedModalContent() {
  return (
    <div className="text-center py-4 space-y-3">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
        <XCircle className="h-8 w-8" />
      </div>
      <h3 className="text-[15px] font-bold text-slate-900">OCR không thể đọc bằng chứng</h3>
      <p className="mx-auto max-w-[380px] text-[11px] leading-relaxed text-slate-500">
        Hình ảnh được tải lên quá mờ hoặc định dạng không đúng chuẩn dashboard livestream. Vui lòng tải lại ảnh rõ nét hơn.
      </p>
      <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 max-w-[420px] mx-auto text-left space-y-1">
        <div><strong>Mã lỗi:</strong> <code>OCR_LOW_CONFIDENCE_THRESHOLD (error_message: unreadable_canvas)</code></div>
        <div><strong>Độ phân giải ảnh:</strong> 640 × 360 (Khuyến nghị tối thiểu: 1280 × 720)</div>
      </div>
    </div>
  )
}

function StaleEvidenceModalContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2.5">
        <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="block text-[12px]">Bằng chứng chụp quá sớm (Stale Evidence)</strong>
          <span>
            Screenshot được chụp lúc 20:15 (chỉ 15 phút sau khi ca bắt đầu), trong khi ca kéo dài tới 23:00. Dữ liệu này không
            thể đại diện cho kết quả cuối ca.
          </span>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 p-3 space-y-2 text-[11px]">
        <InfoRow label="Thời điểm chụp" value="20:15 (Ca kết thúc: 23:00)" />
        <InfoRow label="Độ chênh lệch" value="2 giờ 45 phút trước khi chốt ca" />
        <InfoRow label="Trạng thái" value="Không được phép Confirmed" />
      </div>
    </div>
  )
}

function CreateCandidateModalContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-900">
        <strong>Tạo báo cáo tổng kết (Create Final Report)</strong>
        <p className="text-blue-700">
          Ca live SHF-20260906-A đã kết thúc lúc 23:00. Hệ thống đề xuất khởi tạo bản nháp với dữ liệu snapshot đã ghi nhận.
        </p>
      </div>
      <div className="rounded-md border border-slate-200 p-3 space-y-2 text-[11px]">
        <InfoRow label="Ca live" value="Pharmaton · 9.9 Livestream" />
        <InfoRow label="Thời lượng" value="180 phút (20:00 - 23:00)" />
        <InfoRow label="Host chính" value="Nguyễn A" />
        <InfoRow label="Ảnh chụp chốt ca" value="Đã có 1 ảnh snapshot (22:58)" />
      </div>
    </div>
  )
}

function ReopenedModalContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-[11px] text-purple-900 flex items-start gap-2.5">
        <Unlock className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
        <div>
          <strong className="block text-[12px]">Báo cáo đã được mở lại (Reopened)</strong>
          <span>
            Báo cáo đã được mở lại để kiểm tra và cập nhật thêm. Xem mục Hoạt động để biết người thực hiện, thời điểm và lý do được ghi nhận.
          </span>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 p-3 space-y-2 text-[11px]">
        <InfoRow label="Người thực hiện" value="Trần Hoàng Nam (Admin)" />
        <InfoRow label="Thời điểm mở lại" value="08/09/2026 · 14:00" />
        <InfoRow label="Trạng thái phân quyền" value="Có thể chỉnh sửa (Editable)" />
        <InfoRow label="Tra cứu lịch sử" value="Xem chi tiết tại tab Hoạt động" />
      </div>
    </div>
  )
}

function ArchivedModalContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-[11px] text-slate-800 flex items-start gap-2.5">
        <Archive className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <strong className="block text-[12px]">Hồ sơ đã lưu trữ (Archived)</strong>
          <span>Hồ sơ báo cáo đã được chuyển sang trạng thái lưu trữ (Archived). Phân quyền: Chỉ đọc (Read-only). Xem mục Hoạt động để tra cứu lịch sử thay đổi.</span>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 p-3 space-y-2 text-[11px]">
        <InfoRow label="Trạng thái hồ sơ" value="Đã lưu trữ (Archived)" />
        <InfoRow label="Phân quyền thao tác" value="Chỉ đọc (Read-only)" />
        <InfoRow label="Lịch sử đối soát" value="Ghi nhận đầy đủ trong nhật ký hoạt động" />
      </div>
    </div>
  )
}

function EvidenceGalleryContent() {
  const images = [
    {
      id: 'IMG-0906-01',
      title: 'Dashboard TikTok Shop chốt ca',
      time: '22:58 · Fresh',
      type: 'Dashboard (Cover)',
      size: '1.84 MB',
      ocr: 'Verified 98%',
    },
    {
      id: 'IMG-0906-02',
      title: 'Màn hình giữa ca live',
      time: '22:31 · Fresh',
      type: 'Dashboard',
      size: '1.72 MB',
      ocr: 'Needs review 72%',
    },
    {
      id: 'IMG-0906-03',
      title: 'Bàn live & Host chính',
      time: '21:15 · Fresh',
      type: 'Livestream Key Visual',
      size: '2.40 MB',
      ocr: 'Not scanned',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <span className="text-[12px] font-bold text-slate-800">Danh sách ảnh bằng chứng ca live (3 ảnh)</span>
        <button
          type="button"
          className="flex h-7 items-center gap-1 rounded bg-blue-600 px-2.5 text-[10px] font-semibold text-white"
        >
          <Upload className="h-3 w-3" /> Tải thêm ảnh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {images.map((img) => (
          <div key={img.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
            <div className="flex h-24 items-center justify-center bg-[#082743] text-white">
              <ImageIcon className="h-6 w-6 text-blue-400" />
            </div>
            <div className="p-2.5 text-[11px] space-y-1">
              <strong className="block text-[11px] text-slate-800 truncate">{img.title}</strong>
              <div className="text-[10px] text-slate-400">
                {img.time} · {img.size}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{img.type}</span>
                <span className="text-[10px] font-semibold text-emerald-600">{img.ocr}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportModalContent({ onExportSuccess }: { onExportSuccess: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[12px] font-semibold text-slate-800 mb-2">Định dạng file xuất</h4>
        <div className="grid grid-cols-2 gap-3">
          <Choice active label="Bảng tính Excel (.xlsx)" />
          <Choice label="Hồ sơ tài liệu PDF (.pdf)" />
        </div>
      </div>

      <div>
        <h4 className="text-[12px] font-semibold text-slate-800 mb-2">Mục dữ liệu kèm theo</h4>
        <div className="space-y-2">
          {['Tổng quan hiệu suất ca live', 'Bảng chỉ số chi tiết (15 metrics)', 'Ảnh bằng chứng OCR chốt ca', 'Nội dung 9 mục End-of-Shift Recap', 'Nhật ký kiểm toán & phiên bản'].map((item) => (
            <label key={item} className="flex items-center gap-2 text-[11px] text-slate-700">
              <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-white">
                <Check className="h-3 w-3" />
              </span>
              {item}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-800">
        File xuất tuân thủ đầy đủ mẫu báo cáo đối soát livestream chuẩn của sàn TikTok Shop và Shopee Live.
      </div>
    </div>
  )
}

function SuccessModalContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center py-5 space-y-3">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h3 className="text-[16px] font-bold text-slate-900">Xuất file báo cáo thành công</h3>
      <p className="mx-auto max-w-[360px] text-[11px] text-slate-500">
        File <code>RPT-0906-01_Pharmaton_LiveReport.xlsx</code> đã sẵn sàng tải xuống.
      </p>
    </div>
  )
}

function DialogFooter({
  state,
  onClose,
}: {
  state: Exclude<ReportsPreview, 'none'>
  onClose: () => void
}) {
  const isOcr = state === 'ocr-review' || state === 'ocr-needs-review'

  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onClose}
        className="h-9 rounded-md border border-slate-200 px-4 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
      >
        {state === 'export' ? 'Hủy bỏ' : 'Đóng'}
      </button>

      {isOcr && (
        <>
          <button
            type="button"
            className="flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Quét lại OCR
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white hover:bg-blue-700 shadow-xs"
          >
            Xác nhận số liệu
          </button>
        </>
      )}

      {state === 'export' && (
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white hover:bg-blue-700 shadow-xs"
        >
          Xác nhận xuất file
        </button>
      )}

      {state === 'ocr-failed' && (
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white hover:bg-blue-700 shadow-xs"
        >
          Thử lại OCR
        </button>
      )}

      {state === 'create-candidate' && (
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white hover:bg-blue-700 shadow-xs"
        >
          Tạo bản nháp báo cáo
        </button>
      )}
    </div>
  )
}

// -------------------------------------------------------------
// CONTROLLER & UI HELPERS
// -------------------------------------------------------------
function QaController({
  open,
  setOpen,
  onSelect,
}: {
  open: boolean
  setOpen: (value: boolean) => void
  onSelect: (state: Exclude<ReportsPreview, 'none'>) => void
}) {
  return (
    <div data-qa-controller="true" className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[240px] max-h-[460px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-2xl">
          <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Kịch bản Visual QA
          </div>
          <div className="space-y-0.5">
            {QA_STATES.map((item) => (
              <button
                key={item.id}
                data-qa-state={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        data-qa-trigger="true"
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-[12px] font-bold text-slate-700 shadow-md hover:bg-slate-50 transition-colors"
      >
        <Sparkles className="h-4 w-4 text-blue-600" />
        Kịch bản QA ({QA_STATES.length})
      </button>
    </div>
  )
}

function PerformanceLine() {
  return (
    <svg viewBox="0 0 520 92" className="mt-2 h-[76px] w-full" aria-label="Biểu đồ hiệu suất theo thời gian">
      <path d="M10 76H510M10 45H510M10 14H510" stroke="#f1f5f9" strokeWidth="1" />
      <polyline
        points="10,72 70,66 125,59 180,54 235,48 290,41 345,34 400,27 455,20 510,14"
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
      />
      <circle cx="400" cy="27" r="4" fill="#2563eb" className="animate-pulse" />
    </svg>
  )
}

function MetricCard({
  label,
  value,
  source,
  freshness,
}: {
  label: string
  value: string
  source: string
  freshness: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 shadow-2xs hover:bg-white hover:border-blue-200 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500 truncate">{label}</span>
        <Freshness value={freshness} />
      </div>
      <strong className="mt-1 block text-[15px] font-bold text-slate-900">{value}</strong>
      <span className="mt-1 block text-[10px] text-slate-400 font-medium">{source}</span>
    </div>
  )
}

function Freshness({ value }: { value: string }) {
  return (
    <span
      className={`text-[10px] font-bold ${
        value === 'Fresh'
          ? 'text-emerald-600'
          : value === 'Aging'
          ? 'text-amber-600'
          : value === 'Stale'
          ? 'text-rose-600'
          : 'text-slate-400'
      }`}
    >
      {value}
    </span>
  )
}

function FilterButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
    >
      {label}
      <ChevronDown className="h-3 w-3 text-slate-400" />
    </button>
  )
}

function Page({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded px-2.5 py-1 text-[11px] font-medium ${
        active ? 'bg-blue-600 text-white font-bold' : 'border border-slate-200 hover:bg-slate-50 cursor-pointer'
      }`}
    >
      {children}
    </span>
  )
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`w-fit rounded-md px-2 py-0.5 text-[10px] font-bold border ${className}`}>
      {children}
    </span>
  )
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 border border-slate-100 p-2.5">
      <span className="text-[10px] font-medium text-slate-400 block">{label}</span>
      <strong className="mt-0.5 block text-[11px] text-slate-800 font-semibold">{value}</strong>
    </div>
  )
}

function Choice({ active = false, label }: { active?: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border p-3 text-[12px] font-semibold cursor-pointer transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50/50 text-blue-700 ring-1 ring-blue-500'
          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full border flex items-center justify-center ${
          active ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
        }`}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      {label}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <strong className="text-slate-800 font-medium text-right">{value}</strong>
    </div>
  )
}

function CompactPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-white shadow-sm">
      <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-800 mb-2.5">{title}</h3>
      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line} className="flex items-start gap-2 text-[11px] text-slate-700">
            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
