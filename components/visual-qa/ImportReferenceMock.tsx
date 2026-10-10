'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  History,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
  FileText,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AdminSystemReferenceShell } from './AdminSystemReferenceShell'

export type ImportView =
  | 'entry' | 'file-selected' | 'sheets-selected' | 'template' | 'mapping' | 'preview' | 'validation-clean'
  | 'validation-warning' | 'validation-error' | 'duplicate' | 'confirmation' | 'processing'
  | 'partial-result' | 'success-result' | 'failure' | 'recovery' | 'cancel-confirm' | 'cancelled'
  | 'history' | 'schedule-changes' | 'batch-detail' | 'row-detail' | 'provenance' | 'read-only' | 'empty'
  | 'no-results' | 'loading' | 'refreshing' | 'error'

export const VIEWS: { id: ImportView; label: string; num: string }[] = [
  { id: 'entry', label: 'Import chính', num: '01' },
  { id: 'file-selected', label: 'Đã chọn tệp Excel', num: '02' },
  { id: 'sheets-selected', label: 'Chọn Google Sheets', num: '03' },
  { id: 'template', label: 'Mẫu & yêu cầu', num: '04' },
  { id: 'mapping', label: 'Ánh xạ cột', num: '05' },
  { id: 'preview', label: 'Xem trước toàn bộ', num: '06' },
  { id: 'validation-clean', label: 'Dữ liệu hợp lệ', num: '07' },
  { id: 'validation-warning', label: 'Có cảnh báo', num: '08' },
  { id: 'validation-error', label: 'Lỗi xác thực', num: '09' },
  { id: 'duplicate', label: 'Ca trùng lặp', num: '10' },
  { id: 'confirmation', label: 'Xác nhận nhập lô', num: '11' },
  { id: 'processing', label: 'Đang xử lý (101/140)', num: '12' },
  { id: 'partial-result', label: 'Kết quả một phần (101 đã xử lý · 39 chờ)', num: '13' },
  { id: 'success-result', label: 'Đã xác nhận thành công', num: '14' },
  { id: 'failure', label: 'Thất bại (status: failed)', num: '15' },
  { id: 'recovery', label: 'Khôi phục dòng lỗi', num: '16' },
  { id: 'cancel-confirm', label: 'Xác nhận hủy', num: '17' },
  { id: 'cancelled', label: 'Đã hủy (status: cancelled)', num: '18' },
  { id: 'history', label: 'Lịch sử nhập', num: '19' },
  { id: 'schedule-changes', label: 'Lịch sử thay đổi lịch', num: '20' },
  { id: 'batch-detail', label: 'Chi tiết lô', num: '21' },
  { id: 'row-detail', label: 'Chi tiết dòng', num: '22' },
  { id: 'provenance', label: 'Nguồn gốc & danh tính', num: '23' },
  { id: 'read-only', label: 'Quyền hạn bị từ chối · Member (RLS Denied)', num: '24' },
  { id: 'empty', label: 'Lịch sử trống', num: '25' },
  { id: 'no-results', label: 'Không có kết quả', num: '26' },
  { id: 'loading', label: 'Đang tải', num: '27' },
  { id: 'refreshing', label: 'Đang làm mới', num: '28' },
  { id: 'error', label: 'Lỗi tải dữ liệu', num: '29' },
]

export const PREVIEW_ROWS = [
  { row: 2, date: '25/09/2026', start: '09:00', end: '12:00', brand: 'Pharmaton', platform: 'TikTok', campaign: 'Health Week', title: 'Pharmaton Livestream', result: 'Hợp lệ', tone: 'green', outcome: 'pending' },
  { row: 3, date: '25/09/2026', start: '13:00', end: '16:00', brand: 'Lactacyd', platform: 'Shopee', campaign: 'Care Days', title: 'Lactacyd D9', result: 'Hợp lệ', tone: 'green', outcome: 'pending' },
  { row: 4, date: '26/09/2026', start: '10:00', end: '13:00', brand: 'Ostelin', platform: 'TikTok', campaign: 'Wellness', title: 'Ostelin Q3', result: 'Cảnh báo', tone: 'amber', issue: 'Ca qua đêm hoặc thiếu vai trò nhân sự', outcome: 'warning' },
  { row: 5, date: '26/09/2026', start: '14:00', end: '17:00', brand: 'Corbiere', platform: 'UnknownPlat', campaign: 'Summer', title: 'Corbiere Live', result: 'Lỗi', tone: 'red', issue: 'Nền tảng không hợp lệ (INVALID_PLATFORM)', outcome: 'validation_failed' },
  { row: 6, date: '27/09/2026', start: '09:00', end: '12:00', brand: 'Pharmaton', platform: 'TikTok', campaign: 'Health Week', title: 'Pharmaton T9', result: 'Trùng ca', tone: 'violet', issue: 'Trùng ngày & giờ bắt đầu với ca hiện có', outcome: 'duplicate_skipped' },
]

export function ImportReferenceMock({ initialState = 'preview' }: { initialState?: ImportView }) {
  const searchParams = useSearchParams()
  const requestedParam = searchParams.get('state') || searchParams.get('qaState')
  const showQa = searchParams.get('qa') === '1'

  const [view, setView] = useState<ImportView>(() => {
    if (requestedParam && VIEWS.some(item => item.id === requestedParam)) {
      return requestedParam as ImportView
    }
    return initialState
  })

  useEffect(() => {
    if (requestedParam && VIEWS.some(item => item.id === requestedParam)) {
      setView(requestedParam as ImportView)
    }
  }, [requestedParam])

  const set = (next: ImportView) => setView(next)
  const isHistory = ['history', 'schedule-changes', 'batch-detail', 'row-detail', 'empty', 'no-results', 'loading', 'refreshing', 'error'].includes(view)
  const currentViewObj = VIEWS.find(v => v.id === view) || VIEWS[0]

  return (
    <div data-testid="import-reference-mock" className="w-full">
      <AdminSystemReferenceShell active="Import Data" searchPlaceholder="Tìm kiếm lô nhập, tên tệp...">
        <main lang="vi" translate="no" className="notranslate min-h-[calc(100vh-56px)] px-5 py-4 text-[12px]">
          {/* Top Operational State Banner - Render ONLY when qa=1 */}
          {showQa && (
            <div data-qa-controller className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                  QA STATE {currentViewObj.num}
                </span>
                <strong className="text-[12px] text-slate-800">{currentViewObj.label}</strong>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500 font-mono">[{view}]</code>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
                <span className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5">
                  Batch ID: <strong className="font-mono text-slate-800">IMP-2026-0925-01</strong>
                </span>
                <span className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5">
                  Nguồn: <strong className="text-slate-800">excel</strong> (lich_livestream_tuan_39.xlsx)
                </span>
                <span className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5">
                  Tổng: <strong className="text-slate-800">140 dòng</strong>
                </span>
                <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-emerald-800">
                  124 hợp lệ + 8 cảnh báo = 132 nhập
                </span>
              </div>
            </div>
          )}

          {/* Quick QA State Switcher Drawer - Render ONLY when qa=1 */}
          {showQa && (
            <div data-qa-controller className="mb-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3 shadow-inner">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wide">
                  Điều hướng nhanh Visual-QA States (Wave 11 · Import)
                </span>
                <span className="text-[9px] text-blue-700">29 trạng thái xác thực</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
                {VIEWS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => set(item.id)}
                    className={`truncate rounded px-2 py-1 text-left text-[9px] font-medium transition-colors ${
                      view === item.id
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-blue-100'
                    }`}
                  >
                    {item.num}. {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-bold tracking-tight text-slate-900">Nhập dữ liệu lịch</h1>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                  Import Batch
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Nhập và đối soát các lô lịch phát sóng từ Excel hoặc Google Sheets theo hợp đồng dữ liệu chuẩn.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set('history')}
                className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-[11px] font-semibold transition-colors ${
                  isHistory ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                Lịch sử nhập lô
              </button>
              <button
                type="button"
                onClick={() => set('template')}
                className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Download className="h-3.5 w-3.5" />
                Tải mẫu Excel (.xlsx)
              </button>
            </div>
          </header>

          {!isHistory && <WorkflowStepper view={view} />}
          <div className="mt-3">
            {isHistory ? (
              <HistoryView view={view} setView={set} />
            ) : (
              <WorkflowView view={view} setView={set} />
            )}
          </div>
        </main>
      </AdminSystemReferenceShell>
    </div>
  )
}

function WorkflowStepper({ view }: { view: ImportView }) {
  const step =
    ['entry', 'file-selected', 'sheets-selected', 'template'].includes(view)
      ? 1
      : ['mapping', 'preview', 'validation-clean', 'validation-warning', 'validation-error', 'duplicate'].includes(view)
      ? 2
      : ['confirmation'].includes(view)
      ? 3
      : 4

  const steps = [
    { num: 1, label: 'Tải tệp & Nguồn' },
    { num: 2, label: 'Ánh xạ & Xem trước' },
    { num: 3, label: 'Xác nhận lô' },
    { num: 4, label: 'Kết quả xử lý' },
  ]

  return (
    <div className="my-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-xs">
      {steps.map((s, idx) => {
        const isCurrent = step === s.num
        const isDone = step > s.num
        return (
          <div key={s.num} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                isDone
                  ? 'bg-emerald-600 text-white'
                  : isCurrent
                  ? 'bg-blue-600 text-white ring-2 ring-blue-100'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : s.num}
            </span>
            <span className={`text-[11px] ${isCurrent ? 'font-bold text-blue-700' : isDone ? 'font-medium text-slate-700' : 'text-slate-400'}`}>
              {s.label}
            </span>
            {idx < steps.length - 1 && <span className="mx-2 h-px w-10 bg-slate-200 hidden sm:block" />}
          </div>
        )
      })}
    </div>
  )
}

function WorkflowView({ view, setView }: { view: ImportView; setView: (view: ImportView) => void }) {
  if (view === 'entry' || view === 'file-selected' || view === 'sheets-selected' || view === 'template') {
    return <EntryView view={view} setView={setView} />
  }
  if (view === 'mapping' || ['preview', 'validation-clean', 'validation-warning', 'validation-error', 'duplicate'].includes(view)) {
    return <PreviewView view={view} setView={setView} />
  }
  if (view === 'confirmation') return <ConfirmationView setView={setView} />
  if (view === 'processing') return <ProcessingView setView={setView} />
  if (view === 'success-result' || view === 'partial-result') {
    return <ResultView partial={view === 'partial-result'} setView={setView} />
  }
  if (view === 'failure' || view === 'recovery') {
    return <FailureView recovery={view === 'recovery'} setView={setView} />
  }
  if (view === 'cancel-confirm' || view === 'cancelled') {
    return <CancelView cancelled={view === 'cancelled'} setView={setView} />
  }
  if (view === 'provenance') return <ProvenanceView setView={setView} />
  if (view === 'read-only') return <ReadOnlyView setView={setView} />
  return <SystemStateView view={view} setView={setView} />
}

function EntryView({ view, setView }: { view: ImportView; setView: (view: ImportView) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
        <SectionTitle
          icon={FileUp}
          title={view === 'template' ? 'Mẫu và yêu cầu định dạng' : 'Tạo lô nhập lịch phát sóng'}
          subtitle="Nguồn nhập được lưu kèm tên tệp và trạng thái lô (ScheduleImportBatch: source, source_name)."
        />

        {view === 'template' ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50/60 p-3">
              <FileSpreadsheet className="h-8 w-8 text-blue-600" />
              <div className="min-w-0 flex-1">
                <strong className="block text-[12px] text-slate-800">shift_import_template.xlsx</strong>
                <span className="text-[10px] text-slate-500">Excel workbook · gồm 2 sheets: Schedule và Instructions</span>
              </div>
              <span className="rounded bg-white border border-blue-200 px-2 py-1 text-[10px] font-semibold text-blue-700">XLSX</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCard label="Nguồn 1: Excel" value=".xlsx / .xls" detail="Bảng tính lịch làm việc chuẩn" />
              <InfoCard label="Nguồn 2: Google Sheets" value="Google Sheets URL" detail="Liên kết bảng tính trực tuyến có quyền đọc" />
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">
              <strong className="text-slate-800">Quy định định dạng:</strong> Không nhận CSV tải trực tiếp.
              Mẫu bao gồm các cột: <strong>Ngày</strong>, <strong>Giờ bắt đầu</strong>, <strong>Giờ kết thúc</strong>, <strong>Thương hiệu</strong>, <strong>Nền tảng</strong> (bắt buộc).
              Các cột <em>Chiến dịch</em>, <em>Tiêu đề ca</em>, <em>Studio</em>, số lượng vai trò và <em>Ghi chú</em> là trường tùy chọn theo dữ liệu nguồn.
            </div>
            <ActionButton onClick={() => setView('entry')} label="Quay lại nhập lịch" />
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setView('file-selected')}
                className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                  view === 'file-selected' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                <span>
                  <strong className="block text-[11px]">Tệp Excel</strong>
                  <span className="text-[10px] text-slate-500">.xlsx hoặc .xls</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView('sheets-selected')}
                className={`flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                  view === 'sheets-selected' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Database className="h-6 w-6 text-emerald-600" />
                <span>
                  <strong className="block text-[11px]">Google Sheets</strong>
                  <span className="text-[10px] text-slate-500">Dán URL trang tính</span>
                </span>
              </button>
            </div>

            {view === 'file-selected' || view === 'sheets-selected' ? (
              <div className="mt-3 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
                {view === 'file-selected' ? (
                  <FileSpreadsheet className="h-7 w-7 text-emerald-700" />
                ) : (
                  <Database className="h-7 w-7 text-emerald-700" />
                )}
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[11px] text-slate-800">
                    {view === 'file-selected' ? 'lich_livestream_tuan_39.xlsx' : 'Google Sheets · Kế hoạch lịch tuần 39'}
                  </strong>
                  <span className="text-[10px] text-slate-500">
                    {view === 'file-selected'
                      ? 'Excel · 140 dòng đã đọc trong bản xem trước tĩnh'
                      : 'google_sheets · URL nguồn được dùng khi nhập thật; ở QA không có request mạng'}
                  </span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setView('file-selected')}
                className="mt-3 flex h-28 w-full flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50/60 text-center hover:bg-slate-100/60 transition-colors"
              >
                <FileUp className="h-6 w-6 text-blue-500" />
                <strong className="mt-1 text-[11px] text-slate-700">Chọn tệp lịch làm việc (.xlsx)</strong>
                <span className="mt-0.5 text-[10px] text-slate-400">Kéo thả hoặc nhấp để tải tệp lên</span>
              </button>
            )}

            {view === 'sheets-selected' && (
              <div className="mt-3">
                <Field
                  label="URL Google Sheets · fixture"
                  value="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZj29/edit#gid=0"
                />
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field
                label="Tên nguồn (source_name)"
                value={
                  view === 'file-selected'
                    ? 'lich_livestream_tuan_39.xlsx'
                    : view === 'sheets-selected'
                    ? 'Kế hoạch lịch tuần 39'
                    : 'Chưa chọn nguồn'
                }
              />
              <Field label="Trạng thái khởi tạo (status)" value="previewed (tạo sau khi xem trước)" />
            </div>

            <label className="mt-3 flex items-start gap-2 rounded-md border border-slate-100 p-3 text-[10px] leading-4 text-slate-500">
              <input type="checkbox" checked readOnly className="mt-0.5 accent-blue-600" />
              Tôi xác nhận dữ liệu nguồn được dùng để xem trước và nhập lịch. Chưa có dữ liệu ca làm việc nào được ghi vào cơ sở dữ liệu khi ở bước này.
            </label>

            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={() => setView('template')} className="text-[10px] font-semibold text-blue-700 hover:underline">
                Xem mẫu và định dạng chuẩn
              </button>
              <ActionButton onClick={() => setView('mapping')} label="Tiếp tục xem trước & ánh xạ" icon={ArrowRight} />
            </div>
          </>
        )}
      </section>

      <aside className="space-y-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-[12px] font-bold text-slate-800">Trường lịch được đọc (Database Contract)</h2>
          <div className="mt-2.5 space-y-1.5 text-[10px] text-slate-600">
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" /><strong>date:</strong> Ngày làm việc (bắt buộc)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" /><strong>start_time:</strong> Giờ bắt đầu HH:mm (bắt buộc)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" /><strong>end_time:</strong> Giờ kết thúc HH:mm (bắt buộc)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" /><strong>brand_name:</strong> Tên thương hiệu (bắt buộc)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" /><strong>platform_name:</strong> Nền tảng phát sóng (bắt buộc)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span>campaign_name:</span> Tên chiến dịch (tùy chọn)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span>title:</span> Tiêu đề ca (tùy chọn / fallback)</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span>studio / notes:</span> Phòng live & ghi chú</div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /><span>host / support / tech:</span> Tên nhân sự gốc</div>
          </div>
        </section>
        <Notice
          tone="blue"
          title="Bảo toàn danh tính nhân sự"
          text="Tên nhân sự trong tệp là nhãn nguồn nguyên bản (imported_name, REG-012). Hệ thống tuyệt đối không tự ý bịa canonical user_id khi chưa đối khớp danh tính."
        />
        <Notice
          tone="slate"
          title="Môi trường Visual-QA"
          text="Các nút và tệp mẫu trên màn hình QA không gửi mạng, không tải lên tệp thật và không ghi đè dữ liệu cơ sở dữ liệu."
        />
      </aside>
    </div>
  )
}

function PreviewView({ view, setView }: { view: ImportView; setView: (view: ImportView) => void }) {
  const mapping = view === 'mapping'
  const clean = view === 'validation-clean'
  const warning = view === 'validation-warning'
  const error = view === 'validation-error'
  const duplicate = view === 'duplicate'

  const filteredRows = clean
    ? PREVIEW_ROWS.filter(r => r.result === 'Hợp lệ')
    : warning
    ? PREVIEW_ROWS.filter(r => r.result === 'Cảnh báo')
    : error
    ? PREVIEW_ROWS.filter(r => r.result === 'Lỗi')
    : duplicate
    ? PREVIEW_ROWS.filter(r => r.result === 'Trùng ca')
    : PREVIEW_ROWS

  return (
    <div className="space-y-3">
      {/* Batch Header Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-slate-800">Lô xem trước: lich_livestream_tuan_39.xlsx</h2>
            <StatusBadge label="status: previewed" tone="blue" />
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-600">
              batch_id: IMP-2026-0925-01
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Nguồn: excel · Người tạo: Nguyễn Văn A (Admin OPS) · Tạo lúc: 25/09/2026 08:30 · Đối soát: 124 sạch + 8 cảnh báo = 132 nhập
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton onClick={() => setView('entry')} label="Chọn tệp khác" outline />
          <ActionButton onClick={() => setView('confirmation')} label="Tiến hành xác nhận lô" icon={Check} />
        </div>
      </section>

      {/* Reconciled Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Metric label="Tổng dòng (total_rows)" value="140" tone="slate" detail="140 dòng phân tích" />
        <Metric label="Hợp lệ (valid_rows)" value="124" tone="green" detail="Sạch 100% không lỗi" />
        <Metric label="Có cảnh báo (warning_rows)" value="8" tone="amber" detail="Vẫn được tạo ca" />
        <Metric label="Lỗi chặn (invalid_rows)" value="3" tone="red" detail="Bị loại trừ khi nhập" />
        <Metric label="Trùng lặp (duplicate_rows)" value="5" tone="violet" detail="Bỏ qua bảo vệ ca cũ" />
      </div>

      {/* Invariant Equation Verification Banner */}
      <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50/50 px-3 py-1.5 text-[10px] text-blue-900">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
          <span>
            <strong>Đẳng thức đối soát:</strong> 124 hợp lệ + 8 cảnh báo + 3 lỗi + 5 trùng lặp = <strong>140 tổng dòng</strong>.
            Khi xác nhận: 124 sạch + 8 cảnh báo = <strong>132 ca được tạo</strong>.
          </span>
        </div>
        <span className="font-mono text-[9px] font-bold text-blue-700">RECONCILED 100%</span>
      </div>

      {/* Unbacked Concept Disclosures where applicable */}
      {mapping && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-[10px] text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>UNBACKED-IMPORT-001 (AI Auto-Mapping):</strong> Đề xuất ánh xạ AI tự động là tính năng High-Fi preview;
              backend production dùng từ điển alias xác định trong <code>excelUtils.ts</code>.
            </span>
          </div>
          <span className="rounded bg-amber-200 px-2 py-0.5 text-[9px] font-bold text-amber-900">NEW_ONLY_UNBACKED</span>
        </div>
      )}

      {duplicate && (
        <div className="flex items-center justify-between rounded-md border border-violet-200 bg-violet-50/70 p-2.5 text-[10px] text-violet-900">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-violet-600 shrink-0" />
            <span>
              <strong>UNBACKED-IMPORT-002 (Smart Duplicate Score):</strong> Điểm tin cậy trùng khớp 98% là hiển thị High-Fi;
              production đối soát trùng dựa trên trùng lặp chính xác ngày + giờ + thương hiệu.
            </span>
          </div>
          <span className="rounded bg-violet-200 px-2 py-0.5 text-[9px] font-bold text-violet-900">NEW_ONLY_UNBACKED</span>
        </div>
      )}

      {/* Mapping or Table View */}
      {mapping ? (
        <MappingTable setView={setView} />
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setView('preview')}
                className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                  view === 'preview' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả (140)
              </button>
              <button
                type="button"
                onClick={() => setView('validation-clean')}
                className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                  clean ? 'bg-emerald-100 text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hợp lệ (124)
              </button>
              <button
                type="button"
                onClick={() => setView('validation-warning')}
                className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                  warning ? 'bg-amber-100 text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cảnh báo (8)
              </button>
              <button
                type="button"
                onClick={() => setView('validation-error')}
                className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                  error ? 'bg-red-100 text-red-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lỗi xác thực (3)
              </button>
              <button
                type="button"
                onClick={() => setView('duplicate')}
                className={`rounded px-2.5 py-1 font-semibold transition-colors ${
                  duplicate ? 'bg-violet-100 text-violet-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Trùng lặp (5)
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView('mapping')}
                className="text-[10px] font-semibold text-blue-700 hover:underline"
              >
                Xem cấu hình ánh xạ cột
              </button>
            </div>
          </div>

          {/* Canonical 8-Column Preview Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-12">Dòng</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Bắt đầu</th>
                  <th className="px-3 py-2">Kết thúc</th>
                  <th className="px-3 py-2">Thương hiệu</th>
                  <th className="px-3 py-2">Nền tảng</th>
                  <th className="px-3 py-2">Chiến dịch</th>
                  <th className="px-3 py-2">Tiêu đề ca</th>
                  <th className="px-3 py-2">Kết quả</th>
                  <th className="px-3 py-2 text-right">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map(row => (
                  <tr key={row.row} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2 font-mono text-slate-500 font-bold">#{row.row}</td>
                    <td className="px-3 py-2 text-slate-800 font-medium">{row.date}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{row.start}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{row.end}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.brand}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                        {row.platform}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.campaign}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.title}</td>
                    <td className="px-3 py-2">
                      <StatusBadge label={row.result} tone={row.tone} />
                      {row.issue && <span className="block mt-0.5 text-[9px] text-slate-400">{row.issue}</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setView('row-detail')}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Soát dòng
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-3 py-2 text-[9px] text-slate-400 flex items-center justify-between">
            <span>Hiển thị mẫu các dòng đại diện theo phân loại. Tổng số dòng trong tệp nguồn: 140 dòng.</span>
            <span>Các cột bắt buộc: Ngày, Giờ bắt đầu, Giờ kết thúc, Thương hiệu, Nền tảng</span>
          </div>
        </section>
      )}
    </div>
  )
}

function MappingTable({ setView }: { setView: (view: ImportView) => void }) {
  const MAPPINGS = [
    { src: 'Ngay / Date', target: 'date', type: 'text (DD/MM/YYYY)', req: true, status: 'Đã khớp chính xác' },
    { src: 'Gio bat dau / Start', target: 'start_time', type: 'text (HH:mm)', req: true, status: 'Đã khớp chính xác' },
    { src: 'Gio ket thuc / End', target: 'end_time', type: 'text (HH:mm)', req: true, status: 'Đã khớp chính xác' },
    { src: 'Thuong hieu / Brand', target: 'brand_name', type: 'text', req: true, status: 'Đã khớp chính xác' },
    { src: 'Nen tang / Platform', target: 'platform_name', type: 'text', req: true, status: 'Đã khớp chính xác' },
    { src: 'Chien dich / Campaign', target: 'campaign_name', type: 'text (optional)', req: false, status: 'Đã khớp' },
    { src: 'Tieu de / Title', target: 'title', type: 'text (optional)', req: false, status: 'Fallback tự động' },
    { src: 'Studio', target: 'studio', type: 'text (optional)', req: false, status: 'Đã khớp' },
    { src: 'Ghi chu / Notes', target: 'notes / product_notes', type: 'text (optional)', req: false, status: 'Đã khớp' },
  ]

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-[12px] font-bold text-slate-800">Cấu hình ánh xạ cột (Excel Headers -&gt; Database Fields)</h3>
          <p className="text-[10px] text-slate-500">Đối chiếu tên cột trong bảng tính với schema ScheduleImportRow chuẩn.</p>
        </div>
        <ActionButton onClick={() => setView('preview')} label="Quay lại bảng xem trước" outline />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-50 text-[9px] font-bold uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Cột nguồn Excel</th>
              <th className="px-3 py-2">Trường đích cơ sở dữ liệu</th>
              <th className="px-3 py-2">Kiểu & Ràng buộc</th>
              <th className="px-3 py-2">Trạng thái ánh xạ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MAPPINGS.map(m => (
              <tr key={m.target} className="hover:bg-slate-50/50">
                <td className="px-3 py-2 font-medium text-slate-800">{m.src}</td>
                <td className="px-3 py-2 font-mono text-blue-700">{m.target}</td>
                <td className="px-3 py-2 text-slate-500">
                  {m.req ? <span className="font-semibold text-red-600">Bắt buộc</span> : <span className="text-slate-400">Tùy chọn</span>} · {m.type}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[10px]">
                    <Check className="h-3 w-3" /> {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ConfirmationView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <div className="mx-auto grid max-w-[980px] grid-cols-[minmax(0,1fr)_310px] gap-3">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <SectionTitle
          icon={ShieldAlert}
          title="Xác nhận nhập lô lịch làm việc"
          subtitle="Kiểm tra đối soát cuối cùng trước khi ghi ca vào hệ thống (confirm_schedule_import_batch)."
        />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Sẽ tạo ca mới (imported)" value="132" tone="green" detail="124 sạch + 8 cảnh báo" />
          <Metric label="Loại trừ do lỗi (failed)" value="3" tone="red" detail="Chặn do vi phạm schema" />
          <Metric label="Bỏ qua do trùng (skipped)" value="5" tone="violet" detail="Bảo vệ ca hiện hữu" />
        </div>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-[10px] leading-5 text-amber-900">
          <strong>Lưu ý về 8 dòng có cảnh báo:</strong> Các dòng này vẫn đủ điều kiện tạo ca nhưng sẽ được gắn nhãn outcome <code>warning</code> (e.g. ca kéo dài qua đêm hoặc chưa đủ vai trò).
          3 dòng <code>validation_failed</code> bị loại bỏ hoàn toàn.
          5 dòng <code>duplicate_skipped</code> không ghi đè lên các ca đang hoạt động.
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">
          <InfoRow label="Mã lô nhập (batch_id)" value="IMP-2026-0925-01" />
          <InfoRow label="Tên tệp nguồn (source_name)" value="lich_livestream_tuan_39.xlsx" />
          <InfoRow label="Người thực hiện (created_by)" value="Nguyễn Văn A (Admin OPS)" />
          <InfoRow label="Thời điểm xem trước (created_at)" value="25/09/2026 08:30" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <ActionButton onClick={() => setView('preview')} label="Quay lại bảng xem trước" icon={ArrowLeft} outline />
          <div className="flex items-center gap-2">
            <ActionButton onClick={() => setView('cancel-confirm')} label="Hủy lô" outline />
            <ActionButton onClick={() => setView('processing')} label="Xác nhận tạo 132 ca" icon={Check} />
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="text-[12px] font-bold text-slate-800">Phương trình đối soát lô</h2>
          <div className="mt-3 space-y-2 text-[10px]">
            <InfoRow label="Tổng số dòng nguồn" value="140" />
            <InfoRow label="Dòng hợp lệ tuyệt đối" value="124" />
            <InfoRow label="Dòng có cảnh báo hợp lệ" value="8" />
            <InfoRow label="Dòng lỗi chặn" value="3" />
            <InfoRow label="Dòng trùng thời gian" value="5" />
            <div className="border-t border-slate-100 pt-2 font-semibold text-blue-900 flex justify-between">
              <span>Ca sẽ xuất hiện:</span>
              <span>132 ca</span>
            </div>
          </div>
        </section>
        <Notice
          tone="blue"
          title="Quyền hạn xác nhận"
          text="Chỉ Leader hoặc Admin mới có quyền gọi RPC confirm_schedule_import_batch. Member không được phép."
        />
      </aside>
    </div>
  )
}

function ProcessingView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <section className="mx-auto mt-6 max-w-[660px] rounded-lg border border-slate-200 bg-white p-6 text-center shadow-xs">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </span>
      <h2 className="mt-3 text-[15px] font-bold text-slate-800">Đang ghi kết quả từng dòng vào cơ sở dữ liệu</h2>
      <p className="mt-1 text-[11px] text-slate-500">
        Trạng thái tiến trình là bản chụp tĩnh determinism phục vụ QA; không dùng đồng hồ hẹn giờ giả lập.
      </p>
      <div className="mx-auto mt-5 h-2.5 max-w-[480px] overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-[72%] rounded-full bg-blue-600" />
      </div>
      <div className="mt-1.5 flex justify-between max-w-[480px] mx-auto text-[10px] text-slate-500 font-mono">
        <span>101 / 140 dòng đã xử lý</span>
        <strong className="text-blue-700">72% hoàn tất</strong>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 text-left">
        <Metric label="Đang chờ ghi" value="39" tone="slate" detail="Chờ xử lý" />
        <Metric label="Đã ghi sạch" value="91" tone="green" detail="Tạo ca thành công" />
        <Metric label="Ghi kèm cảnh báo" value="5" tone="amber" detail="Gắn cờ warning" />
        <Metric label="Lỗi tạm & trùng" value="5" tone="red" detail="1 lỗi, 2 retry, 2 trùng" />
      </div>
      <p className="mt-3 text-[10px] text-slate-500">
        Phân rã 101 dòng đã xử lý: 91 imported + 5 warning + 1 failed + 2 retryable + 2 duplicate = 101.
        101 đã xử lý + 39 pending = 140 tổng dòng (Reconciled).
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setView('partial-result')}
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Xem kết quả một phần (13)
        </button>
        <button
          type="button"
          onClick={() => setView('success-result')}
          className="rounded-md bg-blue-600 px-4 py-2 text-[10px] font-semibold text-white hover:bg-blue-700"
        >
          Xem kết quả hoàn tất (14)
        </button>
      </div>
    </section>
  )
}

function ResultView({ partial, setView }: { partial: boolean; setView: (view: ImportView) => void }) {
  return (
    <div className="space-y-3">
      <section
        className={`flex items-center gap-3 rounded-lg border p-4 shadow-xs ${
          partial ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'
        }`}
      >
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            partial ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {partial ? <AlertTriangle className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={`text-[13px] font-bold ${partial ? 'text-amber-900' : 'text-emerald-900'}`}>
            {partial
              ? 'Lô đang xử lý dở dang (Kết quả một phần: 101 đã xử lý · 39 chờ)'
              : 'Lô nhập đã được xác nhận thành công'}
          </h2>
          <p className={`text-[10px] mt-0.5 ${partial ? 'text-amber-800' : 'text-emerald-800'}`}>
            {partial
              ? 'Lô có trạng thái previewed; 101 dòng đã đối soát outcome, 39 dòng còn pending. Tuyệt đối không hiển thị thành công giả.'
              : '132 ca làm việc đã được tạo trong hệ thống (= 124 imported + 8 warning); gắn mã liên kết import_batch_id: IMP-2026-0925-01 (SHIFT-028).'}
          </p>
        </div>
        <span className="rounded bg-white px-2.5 py-1 text-[10px] font-bold font-mono text-slate-700 border border-slate-200">
          status: {partial ? 'previewed' : 'confirmed'}
        </span>
      </section>

      {partial ? (
        /* PARTIAL STATE RECONCILED METRICS (101 Processed + 39 Pending = 140) */
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Metric label="Đã xử lý (processed)" value="101" tone="slate" detail="91 imp + 5 warn + 5 khác" />
          <Metric label="Còn chờ (pending)" value="39" tone="blue" detail="Chưa ghi outcome" />
          <Metric label="Ghi sạch (imported)" value="91" tone="green" detail="Tạo ca sạch tạm tính" />
          <Metric label="Ghi cảnh báo (warning)" value="5" tone="amber" detail="Tạo ca + cờ warning" />
          <Metric label="Lỗi tạm & trùng" value="5" tone="red" detail="1 failed + 2 retry + 2 dup" />
        </div>
      ) : (
        /* FINAL CONFIRMED BATCH METRICS (124 clean + 8 warning = 132 imported) */
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Metric label="Tổng ca đã lưu (imported_rows)" value="132" tone="green" detail="124 sạch + 8 cảnh báo" />
          <Metric label="Lỗi xác thực (failed_rows)" value="3" tone="red" detail="invalid_rows = 3" />
          <Metric label="Bỏ qua do trùng (duplicate_rows)" value="5" tone="violet" detail="duplicate_skipped" />
          <Metric label="Có thể thử lại (retryable_rows)" value="2" tone="amber" detail="2 <= 3 lỗi" />
          <Metric label="Tổng số dòng nguồn (total_rows)" value="140" tone="slate" detail="132 + 3 + 5 = 140" />
        </div>
      )}

      {/* Explicit Equation & Outcome Breakdown */}
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-3">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 bg-slate-50/50">
            <div>
              <h3 className="text-[11px] font-bold text-slate-800">
                {partial ? 'Đối soát dòng xử lý một phần (101 đã ghi + 39 chờ = 140)' : 'Đối soát outcome dòng với trường đếm lô (Row Outcome vs Batch Counters)'}
              </h3>
              <p className="text-[9px] text-slate-400">
                {partial
                  ? 'Tất cả các dòng không pending gộp lại đúng bằng 101 dòng.'
                  : '8 dòng warning cũng tạo ca thành công và đóng góp vào imported_rows: 124 + 8 = 132.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setView(partial ? 'recovery' : 'history')}
              className="text-[10px] font-semibold text-blue-700 hover:underline"
            >
              {partial ? 'Xem dòng lỗi cần sửa' : 'Xem lịch sử các lô'}
            </button>
          </header>

          <div className="grid grid-cols-[1fr_80px_140px] bg-slate-50 px-3 py-2 text-[9px] font-bold uppercase text-slate-400">
            <span>Outcome dòng (ScheduleImportRowOutcome)</span>
            <span className="text-right">Số dòng</span>
            <span className="text-right">Đóng góp trường lô</span>
          </div>

          <div className="divide-y divide-slate-100 text-[10px]">
            {partial ? (
              <>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-emerald-700 font-bold">imported</span>
                  <strong className="text-right">91</strong>
                  <span className="text-right text-slate-500 font-mono text-[9px]">Tạo ca sạch tạm</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-amber-700 font-bold">warning</span>
                  <strong className="text-right">5</strong>
                  <span className="text-right text-slate-500 font-mono text-[9px]">Tạo ca + cờ warning</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-red-700 font-bold">validation_failed</span>
                  <strong className="text-right">1</strong>
                  <span className="text-right text-slate-500 font-mono text-[9px]">Lỗi cứng schema</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-amber-600 font-bold">retryable</span>
                  <strong className="text-right">2</strong>
                  <span className="text-right text-slate-500 font-mono text-[9px]">Lỗi sửa được</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-violet-700 font-bold">duplicate_skipped</span>
                  <strong className="text-right">2</strong>
                  <span className="text-right text-slate-500 font-mono text-[9px]">Trùng lặp bỏ qua</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2 bg-slate-50/60 font-semibold">
                  <span>Tổng đã xử lý (processed_rows)</span>
                  <strong className="text-right text-blue-700 font-bold">101</strong>
                  <span className="text-right text-slate-600 font-mono text-[9px]">91+5+1+2+2 = 101</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-slate-500 font-bold">pending</span>
                  <strong className="text-right text-slate-700">39</strong>
                  <span className="text-right text-slate-400 font-mono text-[9px]">Đang chờ ghi</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2 bg-blue-50/50 font-bold text-blue-900 border-t border-blue-200">
                  <span>Tổng cộng (total_rows)</span>
                  <span className="text-right">140</span>
                  <span className="text-right text-[9px]">101 + 39 = 140 OK</span>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-emerald-700 font-bold">imported</span>
                  <strong className="text-right">124</strong>
                  <span className="text-right text-slate-600 font-mono text-[9px]">Đóng góp 124 vào imported_rows</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-amber-700 font-bold">warning</span>
                  <strong className="text-right">8</strong>
                  <span className="text-right text-slate-600 font-mono text-[9px]">warning_rows = 8 VÀ +8 imported</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-red-700 font-bold">validation_failed</span>
                  <strong className="text-right">3</strong>
                  <span className="text-right text-slate-600 font-mono text-[9px]">failed_rows / invalid = 3</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2">
                  <span className="font-mono text-violet-700 font-bold">duplicate_skipped</span>
                  <strong className="text-right">5</strong>
                  <span className="text-right text-slate-600 font-mono text-[9px]">duplicate_rows = 5</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2 bg-emerald-50/60 font-bold text-emerald-900 border-t border-emerald-200">
                  <span>Tổng ca tạo (imported_rows)</span>
                  <span className="text-right">132</span>
                  <span className="text-right text-[9px]">124 sạch + 8 cảnh báo</span>
                </div>
                <div className="grid grid-cols-[1fr_80px_140px] px-3 py-2 bg-slate-50 font-bold text-slate-800">
                  <span>Tổng số dòng (total_rows)</span>
                  <span className="text-right">140</span>
                  <span className="text-right text-[9px]">132 + 3 + 5 = 140 OK</span>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <h3 className="text-[11px] font-bold text-slate-800">Thông tin lô nhập</h3>
          <div className="mt-2.5 space-y-2 text-[10px]">
            <InfoRow label="Batch ID" value="IMP-2026-0925-01" />
            <InfoRow label="Nguồn (source)" value="excel" />
            <InfoRow label="Tên tệp (source_name)" value="lich_livestream_tuan_39.xlsx" />
            <InfoRow label="Người tạo (created_by)" value="Nguyễn Văn A (Admin OPS)" />
            <InfoRow label="Thời gian tạo (created_at)" value="25/09/2026 08:30" />
            <InfoRow label="Thời gian xác nhận (confirmed_at)" value={partial ? 'Chưa xác nhận (null)' : '25/09/2026 09:16'} />
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
            <ActionButton onClick={() => setView('provenance')} label="Xem nguồn gốc ca (SHIFT-028)" outline />
            <ActionButton onClick={() => setView('history')} label="Xem lịch sử các lô nhập" outline />
          </div>
        </section>
      </div>
    </div>
  )
}

function FailureView({ recovery, setView }: { recovery: boolean; setView: (view: ImportView) => void }) {
  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-red-200 bg-red-50/50 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <XCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-red-900">
                {recovery ? 'Phân loại khôi phục & giải trình dòng lỗi' : 'Lô nhập thất bại: fail_schedule_import_batch'}
              </h2>
              <StatusBadge label="status: failed" tone="red" />
            </div>
            <p className="mt-0.5 text-[10px] text-red-800 leading-4">
              {recovery
                ? 'Lô mang trạng thái failed. Trong 3 dòng lỗi, 2 dòng có thể sửa được dữ liệu nguồn (retryable_rows = 2), 1 dòng là lỗi schema cứng không thể khắc phục tự động.'
                : 'Lô nhập đã bị đánh dấu thất bại do lỗi schema nghiêm trọng. Mã lỗi: SCHEMA_INVALID_PLATFORM. Trạng thái batch là failed (terminal cho đến khi chạy reconciliation).'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_310px] gap-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
          <h3 className="text-[12px] font-bold text-slate-800">Danh sách các dòng lỗi trong lô</h3>
          <div className="mt-3 space-y-2">
            <div className="rounded border border-amber-200 bg-amber-50/30 p-2.5 text-[10px]">
              <div className="flex items-center justify-between">
                <strong className="text-amber-900">Dòng #5: Nền tảng không hợp lệ</strong>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold font-mono text-amber-800">
                  INVALID_PLATFORM (Retryable)
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                Giá trị: <code>platform_name = 'UnknownPlat'</code>. Có thể sửa trong tệp nguồn thành TikTok hoặc Shopee để nhập lại.
              </p>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50/30 p-2.5 text-[10px]">
              <div className="flex items-center justify-between">
                <strong className="text-amber-900">Dòng #12: Thứ tự thời gian ngược</strong>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold font-mono text-amber-800">
                  TIME_ORDER_INVALID (Retryable)
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                Giá trị: Giờ kết thúc 08:00 trước giờ bắt đầu 10:00. Có thể sửa lại mốc giờ trong tệp nguồn hoặc bật cờ qua đêm.
              </p>
            </div>
            <div className="rounded border border-red-200 bg-red-50/30 p-2.5 text-[10px]">
              <div className="flex items-center justify-between">
                <strong className="text-red-900">Dòng #7: Thiếu tên thương hiệu bắt buộc</strong>
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold font-mono text-red-800">
                  REQUIRED_FIELD_MISSING (Hard Error)
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                Ô thương hiệu trống hoàn toàn trong bảng tính nguồn; không thể tự suy diễn hoặc ghi nhận ca làm việc.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
            <ActionButton onClick={() => setView('history')} label="Xem lịch sử lô" outline />
            {recovery ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView('entry')}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700 shadow-xs"
                >
                  Tải lên tệp đã chỉnh sửa
                </button>
              </div>
            ) : (
              <ActionButton onClick={() => setView('recovery')} label="Xem giải trình khôi phục" icon={RefreshCw} />
            )}
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
            <h3 className="text-[11px] font-bold text-slate-800">Quy tắc thẩm quyền Khôi phục (Recovery Authority)</h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-600">
              <strong>DEDICATED_RETRY_RPC = NO:</strong> Hệ thống không có RPC riêng mang tên <code>retry_schedule_import_batch</code>.
            </p>
            <p className="mt-1 text-[10px] leading-5 text-slate-600">
              <strong>RECOVERY_MUTATION_WORKFLOW = YES:</strong> Lô <code>failed</code> vẫn cho phép ghi nhận outcome (<code>record_schedule_import_batch_outcomes</code>), tạo ca bổ sung trên cùng lô, và chuyển sang <code>confirmed</code>.
            </p>
            <p className="mt-1 text-[10px] leading-5 text-slate-600">
              <strong>FAILED_TO_PREVIEWED = NO:</strong> Lô <code>failed</code> không bao giờ quay về <code>previewed</code>.
            </p>
            <div className="mt-3 rounded bg-blue-50 p-2 text-[9px] text-blue-900 border border-blue-200">
              <strong>Thao tác giao diện (Case B):</strong> Hướng dẫn người vận hành tải lên tệp nguồn đã chỉnh sửa để nhập lại một cách an toàn.
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function CancelView({ cancelled, setView }: { cancelled: boolean; setView: (view: ImportView) => void }) {
  return (
    <div className="mx-auto max-w-[700px] rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cancelled ? 'bg-slate-700 text-white' : 'bg-amber-600 text-white'}`}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold text-slate-800">
            {cancelled ? 'Lô nhập đã bị hủy (status = cancelled)' : 'Xác nhận hủy bỏ lô nhập lịch?'}
          </h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            {cancelled
              ? 'Lô IMP-2026-0925-01 đã được đánh dấu hủy bởi người vận hành. Trạng thái này là terminal; không thể tiếp tục xác nhận lô này.'
              : 'Thao tác này gọi RPC cancel_schedule_import_batch. Toàn bộ các dòng xem trước chưa tạo ca sẽ bị hủy bỏ.'}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3 text-[10px] space-y-2">
        <InfoRow label="Lô xử lý" value="IMP-2026-0925-01" />
        <InfoRow label="Tác nhân" value="Nguyễn Văn A (Admin OPS)" />
        <InfoRow label="Lý do hủy" value="Người vận hành yêu cầu hủy để cập nhật tệp lịch mới tuần 39" />
        <InfoRow label="Thời điểm" value="25/09/2026 08:40" />
      </div>

      <div className="mt-5 flex items-center justify-between">
        <ActionButton onClick={() => setView('preview')} label="Quay lại xem trước" outline />
        {cancelled ? (
          <ActionButton onClick={() => setView('history')} label="Trở về lịch sử nhập lô" />
        ) : (
          <button
            type="button"
            onClick={() => setView('cancelled')}
            className="flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-3 text-[10px] font-semibold text-white hover:bg-red-700"
          >
            Xác nhận hủy lô ngay
          </button>
        )}
      </div>
    </div>
  )
}

function HistoryView({ view, setView }: { view: ImportView; setView: (view: ImportView) => void }) {
  if (view === 'batch-detail') return <BatchDetailView setView={setView} />
  if (view === 'row-detail') return <RowDetailView setView={setView} />
  if (view === 'schedule-changes') return <ScheduleChangesView setView={setView} />
  if (view === 'empty') return <EmptyHistoryView setView={setView} />
  if (view === 'no-results') return <NoResultsView setView={setView} />
  if (view === 'loading' || view === 'refreshing' || view === 'error') {
    return <SystemStateView view={view} setView={setView} />
  }

  const BATCHES = [
    { id: 'IMP-2026-0925-01', src: 'excel', file: 'lich_livestream_tuan_39.xlsx', status: 'confirmed', total: 140, imported: 132, dup: 5, failed: 3, creator: 'Nguyễn Văn A', created: '25/09 08:30', confirmed: '25/09 09:16' },
    { id: 'IMP-2026-0918-02', src: 'google_sheets', file: 'Kế hoạch lịch tuần 38', status: 'confirmed', total: 120, imported: 120, dup: 0, failed: 0, creator: 'Trần Thị B', created: '18/09 14:00', confirmed: '18/09 14:10' },
    { id: 'IMP-2026-0911-01', src: 'excel', file: 'lich_thang_9_final.xlsx', status: 'cancelled', total: 90, imported: 0, dup: 0, failed: 0, creator: 'Nguyễn Văn A', created: '11/09 10:15', confirmed: '-' },
    { id: 'IMP-2026-0904-03', src: 'excel', file: 'lich_khai_truong.xlsx', status: 'failed', total: 60, imported: 0, dup: 0, failed: 15, creator: 'Lê Văn C', created: '04/09 16:45', confirmed: '-' },
  ]

  return (
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm mã lô, tên tệp..."
              defaultValue=""
              className="h-8 w-64 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-[10px] text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setView('schedule-changes')}
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Nhật ký thay đổi lịch (ScheduleChangeLog)
          </button>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton onClick={() => setView('entry')} label="Tạo lô nhập mới" icon={FileUp} />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2">Mã lô (batch_id)</th>
                <th className="px-3 py-2">Nguồn</th>
                <th className="px-3 py-2">Tên tệp / nguồn</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2 text-right">Tổng dòng</th>
                <th className="px-3 py-2 text-right">Đã nhập</th>
                <th className="px-3 py-2 text-right">Trùng</th>
                <th className="px-3 py-2 text-right">Lỗi</th>
                <th className="px-3 py-2">Người tạo</th>
                <th className="px-3 py-2">Thời gian tạo</th>
                <th className="px-3 py-2">Xác nhận lúc</th>
                <th className="px-3 py-2 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BATCHES.map(b => (
                <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-3 py-2 font-mono font-bold text-blue-700">{b.id}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600 font-mono">
                      {b.src}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{b.file}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      label={b.status}
                      tone={b.status === 'confirmed' ? 'green' : b.status === 'failed' ? 'red' : 'slate'}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{b.total}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">{b.imported}</td>
                  <td className="px-3 py-2 text-right font-mono text-violet-700">{b.dup}</td>
                  <td className="px-3 py-2 text-right font-mono text-red-700">{b.failed}</td>
                  <td className="px-3 py-2 text-slate-600">{b.creator}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{b.created}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{b.confirmed}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setView('batch-detail')}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Chi tiết lô
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function BatchDetailView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('history')}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">Chi tiết lô: IMP-2026-0925-01</h2>
            <p className="text-[10px] text-slate-500">Mã định danh duy nhất trong schedule_import_batches (IMPORT-001).</p>
          </div>
        </div>
        <StatusBadge label="status: confirmed" tone="green" />
      </div>

      {/* Full 15-Field Batch Inspector */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="text-[12px] font-bold text-slate-800 mb-3">Thông số kỹ thuật lô (ScheduleImportBatch Model)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[10px]">
          <InfoCard label="001. batch_id" value="IMP-2026-0925-01" detail="Khóa chính lô" />
          <InfoCard label="002. source" value="excel" detail="ScheduleImportSource" />
          <InfoCard label="003. source_name" value="lich_livestream_tuan_39.xlsx" detail="Tên tệp gốc" />
          <InfoCard label="004. status" value="confirmed" detail="ScheduleImportStatus" />
          <InfoCard label="005. total_rows" value="140" detail="Tổng số dòng nguồn" />
          <InfoCard label="006. valid_rows" value="124" detail="Dòng sạch hợp lệ" />
          <InfoCard label="007. invalid_rows" value="3" detail="Dòng lỗi chặn" />
          <InfoCard label="008. warning_rows" value="8" detail="Dòng có cảnh báo" />
          <InfoCard label="009. imported_rows" value="132" detail="124 sạch + 8 cảnh báo" />
          <InfoCard label="010. duplicate_rows" value="5" detail="Dòng trùng bỏ qua" />
          <InfoCard label="011. failed_rows" value="3" detail="Dòng thất bại" />
          <InfoCard label="012. retryable_rows" value="2" detail="Dòng lỗi có thể sửa" />
          <InfoCard label="013. created_by" value="Nguyễn Văn A" detail="User ID / Actor" />
          <InfoCard label="014. created_at" value="2026-09-25 08:30" detail="Thời điểm tải lên" />
          <InfoCard label="015. confirmed_at" value="2026-09-25 09:16" detail="Thời điểm xác nhận" />
        </div>
      </section>

      {/* Row Samples in this Batch */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-bold text-slate-800">Các dòng thuộc lô (ScheduleImportRow Sample)</h3>
          <button
            type="button"
            onClick={() => setView('row-detail')}
            className="text-[10px] font-semibold text-blue-700 hover:underline"
          >
            Soát chi tiết dòng #4
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead className="bg-slate-50 text-[9px] font-bold uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1.5">016. row</th>
                <th className="px-2 py-1.5">017. date</th>
                <th className="px-2 py-1.5">018. start</th>
                <th className="px-2 py-1.5">019. end</th>
                <th className="px-2 py-1.5">020. brand</th>
                <th className="px-2 py-1.5">021. platform</th>
                <th className="px-2 py-1.5">022. campaign</th>
                <th className="px-2 py-1.5">023. title</th>
                <th className="px-2 py-1.5">Liên kết ca (SHIFT-028)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50">
                <td className="px-2 py-1.5 font-bold font-mono">#2</td>
                <td className="px-2 py-1.5">25/09/2026</td>
                <td className="px-2 py-1.5 font-mono">09:00</td>
                <td className="px-2 py-1.5 font-mono">12:00</td>
                <td className="px-2 py-1.5 font-semibold">Pharmaton</td>
                <td className="px-2 py-1.5">TikTok</td>
                <td className="px-2 py-1.5">Health Week</td>
                <td className="px-2 py-1.5">Pharmaton Livestream</td>
                <td className="px-2 py-1.5 font-mono text-blue-700">shift-live-101</td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="px-2 py-1.5 font-bold font-mono">#3</td>
                <td className="px-2 py-1.5">25/09/2026</td>
                <td className="px-2 py-1.5 font-mono">13:00</td>
                <td className="px-2 py-1.5 font-mono">16:00</td>
                <td className="px-2 py-1.5 font-semibold">Lactacyd</td>
                <td className="px-2 py-1.5">Shopee</td>
                <td className="px-2 py-1.5">Care Days</td>
                <td className="px-2 py-1.5">Lactacyd D9</td>
                <td className="px-2 py-1.5 font-mono text-blue-700">shift-live-102</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function RowDetailView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <div className="mx-auto max-w-[840px] rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('preview')}
            className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">Soát kỹ thuật dòng: #4 (ScheduleImportRow)</h2>
            <p className="text-[10px] text-slate-500">Đối chiếu giá trị nguồn gốc Excel và giá trị chuẩn hóa trong hệ thống.</p>
          </div>
        </div>
        <StatusBadge label="outcome: warning" tone="amber" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Canonical Normalized Values */}
        <section className="rounded border border-slate-200 bg-slate-50/50 p-3">
          <h4 className="text-[11px] font-bold text-slate-800 mb-2">Giá trị chuẩn hóa (ScheduleImportRow)</h4>
          <div className="space-y-1.5 text-[10px]">
            <InfoRow label="016. row_number" value="4" />
            <InfoRow label="017. date" value="26/09/2026" />
            <InfoRow label="018. start_time" value="10:00" />
            <InfoRow label="019. end_time" value="13:00" />
            <InfoRow label="020. brand_name" value="Ostelin" />
            <InfoRow label="021. platform_name" value="TikTok" />
            <InfoRow label="022. campaign_name" value="Wellness" />
            <InfoRow label="023. title" value="Ostelin Q3" />
          </div>
        </section>

        {/* Staffing and Technical Linkage */}
        <section className="rounded border border-slate-200 bg-white p-3 space-y-2">
          <h4 className="text-[11px] font-bold text-slate-800">Liên kết & Nguồn gốc nhân sự</h4>
          <div className="space-y-1.5 text-[10px]">
            <InfoRow label="Mã lô liên kết (import_batch_id, SHIFT-028)" value="IMP-2026-0925-01" />
            <InfoRow label="Tên nhân sự nhập (imported_name, REG-012)" value="Đặng Thu Thảo" />
            <InfoRow label="Vai trò yêu cầu" value="Host (1), Support (1)" />
            <InfoRow label="Trạng thái phân công" value="Unassigned (Chưa đối khớp ID)" />
          </div>
          <div className="mt-3 rounded bg-amber-50 p-2 text-[9px] text-amber-900 border border-amber-100">
            <strong>Bảo vệ danh tính:</strong> Tên "Đặng Thu Thảo" được lưu nguyên bản. Hệ thống không tự ý tạo tài khoản hay gán ID ngẫu nhiên.
          </div>
        </section>
      </div>

      <div className="mt-5 flex justify-end">
        <ActionButton onClick={() => setView('preview')} label="Đóng chi tiết dòng" />
      </div>
    </div>
  )
}

function ScheduleChangesView({ setView }: { setView: (view: ImportView) => void }) {
  const LOGS = [
    { id: 'LOG-101', time: '25/09 09:16', actor: 'Nguyễn Văn A', act: 'create_shift', shift: 'SHIFT-101', src: 'excel_import', reason: 'Tạo ca từ lô IMP-2026-0925-01 (SHIFT-028)' },
    { id: 'LOG-102', time: '25/09 09:16', actor: 'Nguyễn Văn A', act: 'create_shift', shift: 'SHIFT-102', src: 'excel_import', reason: 'Tạo ca từ lô IMP-2026-0925-01 (SHIFT-028)' },
    { id: 'LOG-103', time: '25/09 09:16', actor: 'Nguyễn Văn A', act: 'flag_warning', shift: 'SHIFT-104', src: 'excel_import', reason: 'Gắn cờ cảnh báo ca qua đêm (SHIFT-028)' },
    { id: 'LOG-104', time: '25/09 09:25', actor: 'Trần Thị B', act: 'manual_assign', shift: 'SHIFT-104', src: 'manual', reason: 'Phân công Host sau khi đối soát nhân sự' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">Nhật ký thay đổi lịch (ScheduleChangeLog)</h2>
          <p className="text-[10px] text-slate-500">
            Lịch sử truy vết biến động ca làm việc phát sinh từ nhập lô (source = 'excel_import').
          </p>
        </div>
        <ActionButton onClick={() => setView('history')} label="Quay lại danh sách lô" outline />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-slate-50 text-[9px] font-bold uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2">Mã nhật ký</th>
              <th className="px-3 py-2">Thời gian</th>
              <th className="px-3 py-2">Tác nhân</th>
              <th className="px-3 py-2">Hành động</th>
              <th className="px-3 py-2">Mã ca (shift_id)</th>
              <th className="px-3 py-2">Nguồn thay đổi</th>
              <th className="px-3 py-2">Chi tiết / Lý do</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {LOGS.map(log => (
              <tr key={log.id} className="hover:bg-slate-50/70">
                <td className="px-3 py-2 font-mono font-bold text-slate-700">{log.id}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{log.time}</td>
                <td className="px-3 py-2 font-medium text-slate-800">{log.actor}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{log.act}</td>
                <td className="px-3 py-2 font-mono font-bold text-slate-800">{log.shift}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono text-slate-600">
                    {log.src}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{log.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function ProvenanceView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <div className="mx-auto max-w-[860px] space-y-3">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">Truy vết nguồn gốc & Danh tính nhân sự (Provenance)</h2>
            <p className="text-[10px] text-slate-500">Mối liên kết giữa tệp nhập, lô nhập, ca phát sóng và nhân sự được phân công.</p>
          </div>
          <ActionButton onClick={() => setView('preview')} label="Đóng kiểm tra" outline />
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-[11px] text-blue-900">
            <strong>Sơ đồ kế thừa nguồn gốc (Lineage):</strong>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px]">
              <span className="rounded bg-white border border-blue-200 px-2 py-1">Tệp: lich_livestream_tuan_39.xlsx</span>
              <span>-&gt;</span>
              <span className="rounded bg-white border border-blue-200 px-2 py-1">Lô: IMP-2026-0925-01 (IMPORT-001)</span>
              <span>-&gt;</span>
              <span className="rounded bg-white border border-blue-200 px-2 py-1">Ca: SHIFT-101 (import_batch_id, SHIFT-028)</span>
              <span>-&gt;</span>
              <span className="rounded bg-white border border-blue-200 px-2 py-1">Nhân sự: Đặng Thu Thảo (imported_name, REG-012)</span>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2 text-[10px]">
            <h4 className="font-bold text-slate-800">Quy tắc bảo vệ danh tính (Staff Identity Fabrication Guard)</h4>
            <p className="text-slate-600 leading-5">
              Hệ thống lưu trữ chuỗi văn bản nguyên bản từ Excel vào trường <code>imported_name</code> của ShiftRegistration.
              Nếu chuỗi này không thể ánh xạ một-một với hồ sơ nhân sự trong danh bạ qua phương thức đối khớp chuẩn, ca làm việc được đánh dấu là
              <strong> Chưa phân công (Unassigned)</strong> kèm nhãn nguồn gốc.
              Hệ thống <em>tuyệt đối không bịa đặt canonical user_id</em> hoặc biến văn bản thuần túy thành danh tính đã xác nhận.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function ReadOnlyView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <div className="mx-auto max-w-[760px] rounded-lg border border-red-200 bg-white p-6 shadow-xs">
      <div className="flex gap-3">
        <LockKeyhole className="h-6 w-6 text-red-600 shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold text-red-900">Truy cập bị từ chối · Quyền hạn tài khoản Member (RLS Denied)</h2>
            <span className="rounded bg-red-100 px-2 py-0.5 text-[9px] font-bold font-mono text-red-800 border border-red-200">
              403 RLS_DENIED
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-600 leading-5">
            Tài khoản có quyền <code>member</code> không có thẩm quyền đọc danh sách lịch sử lô nhập hoặc thực hiện bất kỳ thao tác nhập lịch nào.
            Chính sách bảo mật hàng (Row Level Security) và RPC guards trên cơ sở dữ liệu ngăn chặn hoàn toàn truy cập.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
        <InfoCard
          label="MEMBER_CAN_READ_IMPORT_BATCHES"
          value="Bị từ chối (NO)"
          detail="RLS policy schedule_import_batches_leader_select chỉ cấp quyền cho Leader / Admin"
        />
        <InfoCard
          label="MEMBER_CAN_MUTATE_IMPORT_BATCHES"
          value="Bị từ chối (NO)"
          detail="RPC private.require_shift_actor(true) chặn tạo, xem trước, ghi outcome, xác nhận hoặc hủy"
        />
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
        <span className="text-[9px] text-slate-400">Không hiển thị dữ liệu lô nhập nhạy cảm cho Member.</span>
        <button
          type="button"
          onClick={() => setView('entry')}
          className="rounded border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Trở về màn hình chính
        </button>
      </div>
    </div>
  )
}

function EmptyHistoryView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-xs">
      <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-300" />
      <h3 className="mt-3 text-[14px] font-bold text-slate-800">Chưa có lô nhập lịch nào trong hệ thống</h3>
      <p className="mt-1 text-[10px] text-slate-500 max-w-sm mx-auto">
        Bảng schedule_import_batches chưa có bản ghi nào. Hãy tải lên tệp lịch làm việc đầu tiên để bắt đầu đối soát.
      </p>
      <div className="mt-4">
        <ActionButton onClick={() => setView('entry')} label="Tạo lô nhập lịch mới" icon={FileUp} />
      </div>
    </section>
  )
}

function NoResultsView({ setView }: { setView: (view: ImportView) => void }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-xs">
      <Search className="mx-auto h-10 w-10 text-slate-300" />
      <h3 className="mt-3 text-[13px] font-bold text-slate-800">Không tìm thấy lô nhập phù hợp</h3>
      <p className="mt-1 text-[10px] text-slate-500">
        Không có lô nào khớp với điều kiện lọc hoặc từ khóa tìm kiếm hiện tại.
      </p>
      <button
        type="button"
        onClick={() => setView('history')}
        className="mt-4 h-8 rounded border border-slate-200 bg-white px-3 text-[10px] font-semibold text-blue-700 hover:bg-slate-50"
      >
        Xóa bộ lọc tìm kiếm
      </button>
    </section>
  )
}

function SystemStateView({ view, setView }: { view: ImportView; setView: (view: ImportView) => void }) {
  const isErr = view === 'error'
  const isRef = view === 'refreshing'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-xs">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-500">
        {isErr ? (
          <CircleAlert className="h-6 w-6 text-red-600" />
        ) : (
          <LoaderCircle className="h-6 w-6 text-blue-600 animate-spin" />
        )}
      </span>
      <h3 className="mt-3 text-[13px] font-bold text-slate-800">
        {isErr
          ? 'Không thể kết nối đến máy chủ để tải lịch sử lô nhập'
          : isRef
          ? 'Đang làm mới danh sách lịch sử lô nhập'
          : 'Đang tải dữ liệu lô nhập lịch'}
      </h3>
      <p className="mt-1 text-[10px] text-slate-500">
        {isErr
          ? 'Mã lỗi: FETCH_BATCH_HISTORY_FAILED. Không có trạng thái batch nào được suy diễn thành công.'
          : 'Giữ nguyên dữ liệu hiện tại trong khi kết nối với Supabase RPC.'}
      </p>
      <button
        type="button"
        onClick={() => setView('history')}
        className="mt-4 h-8 rounded border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        {isErr ? 'Thử tải lại' : 'Hủy thao tác'}
      </button>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[13px] font-bold text-slate-800">{title}</h2>
        <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[9px] font-semibold text-slate-500 uppercase">{label}</span>
      <div className="mt-1 flex h-8 items-center rounded border border-slate-200 bg-slate-50 px-2.5 text-[10px] text-slate-700 font-mono truncate">
        {value}
      </div>
    </div>
  )
}

function InfoCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-100 bg-slate-50/70 p-2.5">
      <span className="block text-[9px] text-slate-400 font-medium">{label}</span>
      <strong className="mt-0.5 block truncate text-[11px] text-slate-800">{value}</strong>
      <span className="mt-0.5 block text-[9px] leading-4 text-slate-500 truncate">{detail}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1.5 text-[10px] last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <strong className="text-right font-semibold text-slate-800">{value}</strong>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: string
  tone: 'slate' | 'green' | 'red' | 'amber' | 'violet' | 'blue'
  detail?: string
}) {
  const colors = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    violet: 'text-violet-700',
    blue: 'text-blue-700',
  }
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-2xs">
      <span className="block truncate text-[9px] text-slate-400 font-medium uppercase">{label}</span>
      <strong className={`mt-0.5 block text-[17px] font-bold ${colors[tone]}`}>{value}</strong>
      {detail && <span className="mt-0.5 block text-[8px] text-slate-400 truncate">{detail}</span>}
    </div>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold font-mono ${
        colors[tone] ?? colors.slate
      }`}
    >
      {label}
    </span>
  )
}

function Notice({ tone, title, text }: { tone: string; title: string; text: string }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'blue' ? 'border-blue-100 bg-blue-50/50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex gap-2">
        <Info
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
            tone === 'blue' ? 'text-blue-700' : 'text-slate-500'
          }`}
        />
        <div>
          <h3 className="text-[10px] font-bold text-slate-800">{title}</h3>
          <p className="mt-0.5 text-[9px] leading-4 text-slate-500">{text}</p>
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  onClick,
  label,
  icon: Icon,
  outline = false,
}: {
  onClick: () => void
  label: string
  icon?: LucideIcon
  outline?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[10px] font-semibold transition-colors ${
        outline
          ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xs'
      }`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  )
}
