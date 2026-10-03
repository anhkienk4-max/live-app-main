'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  LoaderCircle,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from 'lucide-react'
import { AdminSystemReferenceShell } from './AdminSystemReferenceShell'

type ImportStage = 'upload' | 'preview' | 'importing' | 'result'
type ImportStatus = 'Hợp lệ' | 'Cảnh báo' | 'Lỗi' | 'Trùng lặp'

const TOTALS = { total: 140, ready: 124, warning: 8, failed: 3, duplicate: 5 }

const PREVIEW_ROWS: { row: number; date: string; host: string; platform: string; brand: string; status: ImportStatus }[] = [
  { row: 1, date: '25/09/2026', host: 'Nguyễn Thị Mai', platform: 'TikTok', brand: 'Pharmaton', status: 'Hợp lệ' },
  { row: 2, date: '25/09/2026', host: 'Trần Văn Nam', platform: 'Shopee', brand: 'Lactacyd', status: 'Hợp lệ' },
  { row: 3, date: '26/09/2026', host: 'Lê Thị Hương', platform: 'TikTok', brand: 'Ostelin', status: 'Cảnh báo' },
  { row: 4, date: '26/09/2026', host: 'Phạm Minh Quân', platform: 'ABC', brand: 'Corbiere', status: 'Lỗi' },
  { row: 5, date: '27/09/2026', host: 'Nguyễn Thị Mai', platform: 'TikTok', brand: 'Pharmaton', status: 'Trùng lặp' },
  { row: 6, date: '27/09/2026', host: 'Vũ Thị Ngọc', platform: 'Shopee', brand: 'Lactacyd', status: 'Hợp lệ' },
  { row: 7, date: '28/09/2026', host: 'Hoàng Anh Tuấn', platform: 'TikTok', brand: 'Ostelin', status: 'Hợp lệ' },
  { row: 8, date: '28/09/2026', host: 'Trần Thu Trang', platform: 'Shopee', brand: 'Corbiere', status: 'Cảnh báo' },
]

const QA_STATES: { id: ImportStage; label: string }[] = [
  { id: 'upload', label: 'Tải lên file' },
  { id: 'preview', label: 'Kiểm tra & xem trước' },
  { id: 'importing', label: 'Đang nhập dữ liệu' },
  { id: 'result', label: 'Kết quả nhập' },
]

export function ImportReferenceMock({ initialState = 'preview' }: { initialState?: ImportStage }) {
  const [stage, setStage] = useState<ImportStage>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const [importType, setImportType] = useState('Ca làm việc')

  return (
    <AdminSystemReferenceShell active="Import Data" searchPlaceholder="Tìm kiếm nhân sự, ca làm việc, thương hiệu...">
      <main className="px-6 py-5">
        <header className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight">Nhập dữ liệu</h1><p className="mt-1 text-[12px] text-slate-500">Tải lên và đồng bộ dữ liệu vận hành từ file Excel hoặc CSV</p></div>
          <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold text-blue-600"><Download className="h-3.5 w-3.5" />Tải template mẫu</button>
        </header>

        <ImportStepper stage={stage} />
        {stage === 'upload' && <UploadStage importType={importType} setImportType={setImportType} onContinue={() => setStage('preview')} />}
        {stage === 'preview' && <PreviewStage onBack={() => setStage('upload')} onImport={() => setStage('importing')} />}
        {stage === 'importing' && <ImportingStage onComplete={() => setStage('result')} />}
        {stage === 'result' && <ResultStage onRetry={() => setStage('importing')} onRestart={() => setStage('upload')} />}
      </main>
      <QaController open={qaOpen} setOpen={setQaOpen} onSelect={(next) => { setStage(next); setQaOpen(false) }} />
    </AdminSystemReferenceShell>
  )
}

function ImportStepper({ stage }: { stage: ImportStage }) {
  const current = { upload: 1, preview: 2, importing: 3, result: 4 }[stage]
  const labels = [['Tải lên file', 'Chọn file & loại dữ liệu'], ['Kiểm tra dữ liệu', 'Ánh xạ & xem trước'], ['Xác nhận nhập', 'Xử lý dữ liệu'], ['Hoàn tất', 'Kết quả nhập dữ liệu']] as const
  return <div className="mx-auto mt-5 grid max-w-[980px] grid-cols-4">{labels.map(([title, copy], index) => <div key={title} className="relative text-center"><span className={`relative z-10 mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${index + 1 <= current ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{index + 1 < current ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><strong className={`mt-1 block text-[12px] ${index + 1 === current ? 'text-blue-600' : 'text-slate-700'}`}>{title}</strong><span className="text-[10px] text-slate-400">{copy}</span>{index < 3 && <span className={`absolute left-[57%] top-3 h-px w-[86%] ${index + 1 < current ? 'bg-blue-500' : 'bg-slate-200'}`} />}</div>)}</div>
}

function UploadStage({ importType, setImportType, onContinue }: { importType: string; setImportType: (value: string) => void; onContinue: () => void }) {
  const types = [{ label: 'Ca làm việc', icon: Database }, { label: 'Nhân sự', icon: Users }, { label: 'Đăng ký', icon: CheckCircle2 }, { label: 'Chiến dịch', icon: FileSpreadsheet }]
  return <div className="mx-auto mt-5 grid max-w-[1060px] grid-cols-[1.08fr_0.92fr] gap-4"><section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-[13px] font-bold">Chọn loại dữ liệu</h2><p className="mt-1 text-[11px] text-slate-400">Chọn nhóm dữ liệu bạn muốn nhập vào hệ thống.</p><div className="mt-3 grid grid-cols-2 gap-2">{types.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => setImportType(label)} className={`flex items-center gap-3 rounded-md border p-3 text-left ${importType === label ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Icon className="h-4 w-4" /></span><span className="flex-1 text-[12px] font-semibold">{label}</span><span className={`h-3 w-3 rounded-full border ${importType === label ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`} /></button>)}</div><div className="mt-3 flex h-[235px] flex-col items-center justify-center rounded-lg border border-dashed border-blue-300 bg-blue-50/30 text-center"><FileUp className="h-9 w-9 text-blue-600" /><strong className="mt-3 text-[13px]">Kéo thả file vào đây</strong><span className="my-1 text-[11px] text-slate-400">hoặc</span><button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Chọn file từ máy tính</button><span className="mt-3 text-[11px] text-slate-400">Hỗ trợ Excel (.xlsx, .xls) hoặc CSV (.csv) · Tối đa 10MB</span></div></section><section className="space-y-3"><div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-[13px] font-bold">Yêu cầu file dữ liệu</h2><button type="button" className="text-[11px] font-semibold text-blue-600">Tải template</button></div><div className="mt-3 space-y-2">{['Sử dụng template mẫu của hệ thống', 'Đảm bảo đúng định dạng cột dữ liệu', 'Mỗi dòng là một bản ghi duy nhất', 'Không để trống các cột bắt buộc'].map((item) => <div key={item} className="flex items-center gap-2 text-[11px] text-slate-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{item}</div>)}</div></div><div className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-[13px] font-bold">File đã chọn</h2><div className="mt-3 flex items-center gap-3 rounded-md bg-slate-50 p-3"><FileSpreadsheet className="h-8 w-8 text-emerald-600" /><div className="flex-1"><strong className="block text-[12px]">shift_import_20260928.xlsx</strong><span className="text-[10px] text-slate-400">2.4 MB · 140 dòng</span></div><span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Tải lên thành công</span></div><button type="button" onClick={onContinue} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-[12px] font-semibold text-white">Tiếp tục kiểm tra dữ liệu<ArrowRight className="h-3.5 w-3.5" /></button></div></section></div>
}

function PreviewStage({ onBack, onImport }: { onBack: () => void; onImport: () => void }) {
  return <div className="mt-5 grid grid-cols-[minmax(0,1fr)_290px] gap-4"><div className="space-y-3"><section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between"><div><h2 className="text-[13px] font-bold">Kiểm tra & ánh xạ dữ liệu</h2><p className="mt-1 text-[11px] text-slate-400">Xem trước dữ liệu và xác nhận ánh xạ các cột với hệ thống.</p></div><span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600">Hoàn tất ánh xạ</span></div><div className="mt-3 grid grid-cols-6 gap-2">{['Ngày ca', 'Người phụ trách', 'Nền tảng', 'Thương hiệu', 'Studio', 'Trạng thái'].map((label, index) => <div key={label} className="rounded-md border border-slate-200 p-2"><span className="text-[10px] text-slate-400">Cột {String.fromCharCode(65 + index)}</span><div className="mt-1 flex items-center justify-between text-[11px] font-medium">{label}<ChevronDown className="h-3 w-3 text-slate-400" /></div></div>)}</div></section><section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-[13px] font-bold">Xem trước dữ liệu ({TOTALS.total} dòng)</h2><p className="text-[10px] text-slate-400">Kiểm tra dữ liệu và xử lý lỗi trước khi nhập.</p></div><div className="flex h-9 w-[210px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[11px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm kiếm...</div></header><div className="grid grid-cols-[38px_92px_1.25fr_0.7fr_0.8fr_0.7fr] gap-2 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase text-slate-400"><span>#</span><span>Ngày ca</span><span>Người phụ trách</span><span>Nền tảng</span><span>Thương hiệu</span><span>Kết quả</span></div>{PREVIEW_ROWS.map((row) => <div key={row.row} className={`grid grid-cols-[38px_92px_1.25fr_0.7fr_0.8fr_0.7fr] items-center gap-2 border-t border-slate-100 px-4 py-2 text-[11px] ${row.status === 'Lỗi' ? 'bg-red-50/60' : row.status === 'Cảnh báo' ? 'bg-amber-50/60' : ''}`}><span className="text-slate-400">{row.row}</span><span>{row.date}</span><strong className="font-medium">{row.host}</strong><span>{row.platform}</span><span>{row.brand}</span><StatusBadge status={row.status} /></div>)}<footer className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400"><span>Hiển thị 1–8 của {TOTALS.total} dòng</span><div className="flex gap-1"><span className="rounded bg-blue-600 px-2 py-1 text-white">1</span><span className="rounded border border-slate-200 px-2 py-1">2</span><span className="rounded border border-slate-200 px-2 py-1">3</span><span className="px-1 py-1">…</span><span className="rounded border border-slate-200 px-2 py-1">18</span></div></footer></section></div><aside className="space-y-3"><SummaryPanel /><section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-[13px] font-bold">Lỗi & cảnh báo (16)</h2><div className="mt-3 space-y-2"><Issue tone="red" title="Thiếu trường bắt buộc" copy="Dòng 4 · Tên người phụ trách bị trống" count="3" /><Issue tone="amber" title="Sai định dạng ngày" copy="Dòng 8 · Dùng định dạng DD/MM/YYYY" count="5" /><Issue tone="red" title="Nền tảng không hỗ trợ" copy="Dòng 12 · Platform ABC" count="2" /><Issue tone="violet" title="Bản ghi trùng lặp" copy="5 dòng sẽ được bỏ qua" count="5" /><Issue tone="amber" title="Khoảng thời gian không hợp lệ" copy="Dòng 18 · Giờ kết thúc trước giờ bắt đầu" count="1" /></div></section><div className="flex gap-2"><button type="button" onClick={onBack} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-[12px] font-semibold"><ArrowLeft className="h-3.5 w-3.5" />Quay lại</button><button type="button" onClick={onImport} className="flex h-9 flex-[1.5] items-center justify-center gap-2 rounded-md bg-blue-600 text-[12px] font-semibold text-white"><Database className="h-3.5 w-3.5" />Nhập {TOTALS.ready + TOTALS.warning} dòng hợp lệ</button></div></aside></div>
}

function ImportingStage({ onComplete }: { onComplete: () => void }) {
  return <section className="mx-auto mt-7 max-w-[680px] rounded-lg border border-slate-200 bg-white p-8 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600"><LoaderCircle className="h-7 w-7 animate-spin" /></span><h2 className="mt-4 text-[15px] font-bold">Đang nhập dữ liệu</h2><p className="mt-1 text-[12px] text-slate-500">Hệ thống đang xử lý 140 dòng. Không đóng cửa sổ này.</p><div className="mx-auto mt-5 h-2 max-w-[520px] overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[72%] rounded-full bg-blue-600" /></div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>101 / 140 dòng</span><span>72%</span></div><div className="mt-6 grid grid-cols-4 gap-2"><Metric label="Đang chờ" value="39" tone="text-slate-700" /><Metric label="Đã nhập" value="96" tone="text-emerald-600" /><Metric label="Cảnh báo" value="3" tone="text-amber-600" /><Metric label="Thất bại" value="2" tone="text-red-600" /></div><button type="button" onClick={onComplete} className="mt-6 h-9 rounded-md border border-blue-200 px-5 text-[12px] font-semibold text-blue-600">Xem trạng thái hoàn tất</button></section>
}

function ResultStage({ onRetry, onRestart }: { onRetry: () => void; onRestart: () => void }) {
  return <div className="mt-5 space-y-3"><section className="flex items-center gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-5 w-5" /></span><div className="flex-1"><h2 className="text-[13px] font-bold text-emerald-800">Nhập dữ liệu hoàn tất với một phần lỗi</h2><p className="mt-0.5 text-[11px] text-emerald-700">132 dòng được nhập, 3 dòng thất bại và 5 dòng trùng lặp được bỏ qua.</p></div><span className="text-[12px] font-semibold text-emerald-700">Hoàn tất · 100%</span></section><div className="grid grid-cols-4 gap-3"><Metric label="Đã nhập" value="124" tone="text-emerald-600" /><Metric label="Nhập kèm cảnh báo" value="8" tone="text-amber-600" /><Metric label="Xác thực thất bại" value="3" tone="text-red-600" /><Metric label="Bỏ qua trùng lặp" value="5" tone="text-violet-600" /></div><div className="grid grid-cols-[minmax(0,1fr)_310px] gap-4"><section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><h2 className="text-[13px] font-bold">Dòng nhập thất bại (3)</h2><p className="text-[10px] text-slate-400">Sửa file nguồn hoặc thử lại các dòng có thể khôi phục.</p></div><button type="button" className="flex items-center gap-2 text-[11px] font-semibold text-blue-600"><Download className="h-3.5 w-3.5" />Tải báo cáo lỗi</button></header><div className="grid grid-cols-[40px_1.2fr_1fr_0.8fr_72px] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase text-slate-400"><span>Dòng</span><span>Dữ liệu</span><span>Lý do lỗi</span><span>Kết quả</span><span>Thao tác</span></div>{[['4', '26/09 · Corbiere · ABC', 'Nền tảng không hỗ trợ', 'Xác thực thất bại'], ['12', '27/09 · Pharmaton', 'Thiếu người phụ trách', 'Có thể thử lại'], ['28', 'Ngày không hợp lệ · Ostelin', 'Sai định dạng ngày', 'Có thể thử lại']].map(([row, data, reason, outcome]) => <div key={row} className="grid grid-cols-[40px_1.2fr_1fr_0.8fr_72px] items-center gap-3 border-t border-slate-100 px-4 py-3 text-[11px]"><span>{row}</span><span>{data}</span><span className="text-red-600">{reason}</span><span className={outcome === 'Có thể thử lại' ? 'text-amber-600' : 'text-red-600'}>{outcome}</span><button type="button" onClick={onRetry} className="text-left font-semibold text-blue-600">Thử lại</button></div>)}</section><aside className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-[13px] font-bold">Tổng kết nhập dữ liệu</h2><div className="mt-3 space-y-2"><InfoRow label="Tổng dòng trong file" value="140" /><InfoRow label="Đã nhập" value="124" /><InfoRow label="Cảnh báo" value="8" /><InfoRow label="Thất bại" value="3" /><InfoRow label="Trùng lặp" value="5" /><InfoRow label="Tổng đối soát" value="140 / 140" /></div><button type="button" onClick={onRetry} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-[12px] font-semibold text-white"><RefreshCw className="h-3.5 w-3.5" />Thử lại 2 dòng</button><button type="button" onClick={onRestart} className="mt-2 h-9 w-full rounded-md border border-slate-200 text-[12px] font-semibold">Quay lại trang nhập</button></aside></div></div>
}

function SummaryPanel() { return <section className="rounded-lg border border-slate-200 bg-white p-4"><h2 className="text-[13px] font-bold">Tóm tắt kết quả kiểm tra</h2><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Tổng số dòng" value="140" tone="text-slate-900" /><Metric label="Hợp lệ" value="124" tone="text-emerald-600" /><Metric label="Cảnh báo" value="8" tone="text-amber-600" /><Metric label="Lỗi dữ liệu" value="3" tone="text-red-600" /><Metric label="Trùng lặp" value="5" tone="text-violet-600" /><Metric label="Đối soát" value="140 / 140" tone="text-blue-600" /></div></section> }

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="rounded-md border border-slate-100 bg-white p-3 shadow-sm"><span className="text-[10px] text-slate-400">{label}</span><strong className={`mt-1 block text-[16px] ${tone}`}>{value}</strong></div> }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b border-slate-100 pb-2 text-[11px]"><span className="text-slate-400">{label}</span><strong>{value}</strong></div> }

function StatusBadge({ status }: { status: ImportStatus }) {
  const tones = { 'Hợp lệ': 'bg-emerald-50 text-emerald-600', 'Cảnh báo': 'bg-amber-50 text-amber-600', 'Lỗi': 'bg-red-50 text-red-600', 'Trùng lặp': 'bg-violet-50 text-violet-600' }
  const Icon = status === 'Hợp lệ' ? CheckCircle2 : status === 'Cảnh báo' ? AlertTriangle : status === 'Lỗi' ? XCircle : RefreshCw
  return <span className={`flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${tones[status]}`}><Icon className="h-3 w-3" />{status}</span>
}

function Issue({ tone, title, copy, count }: { tone: 'red' | 'amber' | 'violet'; title: string; copy: string; count: string }) {
  const style = tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600'
  const Icon = tone === 'red' ? CircleAlert : tone === 'amber' ? AlertTriangle : RefreshCw
  return <div className="flex items-start gap-2 rounded-md border border-slate-100 p-2"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style}`}><Icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><strong className="block text-[11px]">{title}</strong><span className="text-[10px] text-slate-400">{copy}</span></div><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>{count}</span></div>
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: ImportStage) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[185px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">Import QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}
