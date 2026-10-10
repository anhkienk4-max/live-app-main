'use client'

import React, { useState } from 'react'
import {
  LayoutGrid, Briefcase, Clock3, Users, ArrowLeftRight, MonitorPlay,
  BarChart2, Bell, ChevronRight, CheckCircle2, Circle, AlertTriangle,
  MessageSquare, Plus, Pause, Square, Activity,
  UserCheck, Camera, Mic, Wifi, Check, Heart, ShoppingBag, Link2,
  Layers, ArrowRight, Lock, Unlock, Trash2, Eye, Download, Upload,
  ScanText, ShieldAlert, FileText, CheckCircle, XCircle, AlertCircle,
  Info, Clock, TrendingUp, DollarSign, X, ChevronDown, ChevronUp,
  RefreshCw, SlidersHorizontal, ExternalLink, Maximize2, FileCheck
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
export type LiveTab = 'overview' | 'staff' | 'notes' | 'issues' | 'checklist' | 'activity'
export type StaffStatus = 'live' | 'ready' | 'absent'
export type HealthStatus = 'ok' | 'warning' | 'error'
export type ActivityType = 'note' | 'checklist' | 'system' | 'snapshot' | 'ocr' | 'report'
export type IssueSeverity = 'warning' | 'critical' | 'info'
export type AvatarTone = 'orange' | 'blue' | 'purple' | 'green' | 'rose'

export type LiveQaState =
  | 'none'
  | '01-live-main'
  | '02-fresh-snapshot'
  | '03-updates-missing'
  | '04-needs-review'
  | '05-metrics-expanded'
  | '06-evidence-detail'
  | '07-submit-update'
  | '08-snapshot-success'
  | '09-snapshot-stale'
  | '10-report-lineage'
  | '11-delete-confirm'
  | '12-delete-blocked'
  | '13-activity'
  | '14-ops-panels'
  | '15-missing-metric'

interface StaffMember {
  name: string
  canonicalRole: 'host' | 'support' | 'technical'
  roleDisplay: string
  avatar: string
  tone: AvatarTone
  status: StaffStatus
  phone?: string
  checkInTime?: string
}

interface ChecklistItem {
  id: number
  text: string
  completed: boolean
  assignedTo: string
  category: 'Kỹ thuật' | 'Nội dung' | 'Vận hành'
}

interface NoteItem {
  id: number
  author: string
  role: string
  time: string
  content: string
  pinned?: boolean
}

interface IssueItem {
  id: number
  title: string
  severity: IssueSeverity
  status: 'resolved' | 'investigating' | 'open'
  reportedBy: string
  time: string
}

interface ActivityEvent {
  id: string
  time: string
  author: string
  role: string
  content: string
  type: ActivityType
  badge?: string
}

export interface LiveMetricItem {
  key: string
  label: string
  value: string
  unit: string
  source: string
  confidence?: string
  freshness: 'Fresh' | 'Stale' | 'Missing' | 'Pending'
  status: 'confirmed' | 'verified' | 'needs-review' | 'missing' | 'unavailable'
  formula?: string
  lineageDestination?: string
}

// ── Master Canonical Metrics Inventory ────────────────────────────────────────
export const LIVE_CANONICAL_METRICS: LiveMetricItem[] = [
  { key: 'revenue', label: 'Doanh thu (Revenue)', value: '24.500.000 ₫', unit: 'VND', source: 'OCR Verified', confidence: '98%', freshness: 'Fresh', status: 'verified', formula: 'Thực thu sàn - chiết khấu voucher', lineageDestination: 'Report revenue (REPORT-006)' },
  { key: 'gmv', label: 'Tổng GMV', value: '25.800.000 ₫', unit: 'VND', source: 'OCR Verified', confidence: '96%', freshness: 'Fresh', status: 'verified', formula: 'Tổng giá trị giỏ hàng được đặt', lineageDestination: 'Report gmv (REPORT-020)' },
  { key: 'orders', label: 'Số đơn hàng (Orders)', value: '321', unit: 'Đơn', source: 'Imported/OCR', confidence: '94%', freshness: 'Fresh', status: 'verified', formula: 'Tổng đơn thanh toán thành công', lineageDestination: 'Report orders (REPORT-007)' },
  { key: 'current_viewers', label: 'Người xem hiện tại (CCU)', value: '842', unit: 'Người', source: 'Live Sync', confidence: '99%', freshness: 'Fresh', status: 'verified', formula: 'Đồng hồ theo dõi luồng phát sóng', lineageDestination: 'Shift monitor peak/live' },
  { key: 'peak_viewers', label: 'Người xem cao nhất (PCU)', value: '1.420', unit: 'Người', source: 'Live Sync / OCR', confidence: '99%', freshness: 'Fresh', status: 'verified', formula: 'Đỉnh người xem đồng thời cao nhất ca', lineageDestination: 'Report peak_viewer (REPORT-008)' },
  { key: 'average_viewers', label: 'Người xem trung bình (ACU)', value: '485', unit: 'Người', source: 'Calculated', confidence: '98%', freshness: 'Fresh', status: 'verified', formula: 'Tổng lượt xem / phút phát sóng', lineageDestination: 'Report average_viewer (REPORT-009)' },
  { key: 'total_viewers', label: 'Tổng người xem (Unique)', value: '12.850', unit: 'Người', source: 'Live Sync', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'Người dùng duy nhất vào xem stream', lineageDestination: 'Report viewers (REPORT-021)' },
  { key: 'total_views', label: 'Tổng lượt xem (Views)', value: '24.120', unit: 'Lượt', source: 'Live Sync', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'Tổng lượt bấm vào xem ca live', lineageDestination: 'DashboardUpdate.total_views' },
  { key: 'likes', label: 'Lượt thích (Likes)', value: '18.400', unit: 'Lượt', source: 'Live Sync', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'Tổng tương tác thả tim', lineageDestination: 'Report likes (REPORT-010)' },
  { key: 'comments', label: 'Bình luận (Comments)', value: '2.150', unit: 'Lượt', source: 'Live Sync', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'Tổng tin nhắn bình luận', lineageDestination: 'Report comments (REPORT-011)' },
  { key: 'shares', label: 'Chia sẻ (Shares)', value: '430', unit: 'Lượt', source: 'Live Sync', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'Tổng lượt chia sẻ link live', lineageDestination: 'Report shares (REPORT-012)' },
  { key: 'product_clicks', label: 'Nhấp sản phẩm (Clicks)', value: '4.710', unit: 'Lượt', source: 'Live Sync', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'Lượt nhấp vào giỏ hàng/sản phẩm', lineageDestination: 'Report product_clicks (REPORT-022)' },
  { key: 'ctr', label: 'Tỷ lệ nhấp (CTR)', value: '36.62%', unit: '%', source: 'Calculated', confidence: '—', freshness: 'Fresh', status: 'verified', formula: '(product_clicks / total_viewers) * 100', lineageDestination: 'Report ctr (REPORT-023)' },
  { key: 'cvr', label: 'Tỷ lệ chuyển đổi (CVR)', value: '6.81%', unit: '%', source: 'Calculated', confidence: '—', freshness: 'Fresh', status: 'verified', formula: '(orders / product_clicks) * 100', lineageDestination: 'Report cvr (REPORT-024)' },
  { key: 'average_order_value', label: 'Giá trị đơn TB (AOV)', value: '76.324 ₫', unit: 'VND', source: 'Calculated', confidence: '—', freshness: 'Fresh', status: 'verified', formula: 'revenue / orders', lineageDestination: 'Report aov (REPORT-025)' },
]

// ── Fixtures ──────────────────────────────────────────────────────────────────
const STAFF: StaffMember[] = [
  { name: 'Nguyễn Văn A', canonicalRole: 'host', roleDisplay: 'Host chính (Chốt đơn)', avatar: 'NA', tone: 'orange', status: 'live', phone: '0901 234 567', checkInTime: '13:45' },
  { name: 'Trần Thị B', canonicalRole: 'support', roleDisplay: 'Trợ live (Ghim SP & Voucher)', avatar: 'TB', tone: 'blue', status: 'live', phone: '0902 345 678', checkInTime: '13:50' },
  { name: 'Nguyễn Văn C', canonicalRole: 'technical', roleDisplay: 'Kỹ thuật (OBS / Âm thanh / Mạng)', avatar: 'NC', tone: 'purple', status: 'live', phone: '0903 456 789', checkInTime: '13:30' },
  { name: 'Phạm Thị D', canonicalRole: 'support', roleDisplay: 'Hỗ trợ kho / Soạn hàng', avatar: 'PD', tone: 'green', status: 'ready', phone: '0904 567 890', checkInTime: '14:00' },
  { name: 'Hoàng Văn E', canonicalRole: 'support', roleDisplay: 'Kiểm soát khung chat & Seeding', avatar: 'HE', tone: 'rose', status: 'ready', phone: '0905 678 901', checkInTime: '14:05' },
]

const CHECKLIST: ChecklistItem[] = [
  { id: 1, text: 'Kiểm tra âm thanh micro không dây và pin dự phòng', completed: true, assignedTo: 'Nguyễn Văn C', category: 'Kỹ thuật' },
  { id: 2, text: 'Đồng bộ danh sách 25 SKU Flash Sale lên TikTok Seller Center', completed: true, assignedTo: 'Trần Thị B', category: 'Vận hành' },
  { id: 3, text: 'Kiểm tra đường truyền internet băng thông dự phòng (Backup 4G)', completed: true, assignedTo: 'Nguyễn Văn C', category: 'Kỹ thuật' },
  { id: 4, text: 'Host trang điểm và kiểm tra kịch bản mở đầu ca live', completed: true, assignedTo: 'Nguyễn Văn A', category: 'Nội dung' },
  { id: 5, text: 'Chụp ảnh màn hình Dashboard mở ca (Snapshot #1)', completed: true, assignedTo: 'Nguyễn Văn C', category: 'Vận hành' },
  { id: 6, text: 'Ghim Voucher độc quyền 50K khi mắt xem vượt mốc 1.000', completed: false, assignedTo: 'Trần Thị B', category: 'Nội dung' },
  { id: 7, text: 'Cập nhật số liệu Dashboard giữa ca (Snapshot #4)', completed: true, assignedTo: 'Nguyễn Văn C', category: 'Vận hành' },
  { id: 8, text: 'Chụp ảnh chốt ca và gửi bản nháp báo cáo End-of-Shift', completed: false, assignedTo: 'Nguyễn Văn A', category: 'Vận hành' },
]

const NOTES: NoteItem[] = [
  { id: 1, author: 'Nguyễn Văn C (Technical)', role: 'Kỹ thuật', time: '14:45', content: 'Micro số 1 đã đổi pin dự phòng, tín hiệu âm thanh thu ổn định không còn rè.', pinned: true },
  { id: 2, author: 'Trần Thị B (Support)', role: 'Trợ live', time: '14:30', content: 'SKU Pharmaton Energy hộp 30 viên đã bán hết 150 suất Flash Sale đầu tiên, chuyển sang voucher 30K.', pinned: false },
  { id: 3, author: 'Nguyễn Văn A (Host)', role: 'Host chính', time: '14:15', content: 'Khách hỏi nhiều về hạn sử dụng lô mới, trợ live ghim link mô tả chi tiết sản phẩm.', pinned: false },
]

const ISSUES: IssueItem[] = [
  { id: 1, title: 'Micro 1 có tiếng ồn nhẹ lúc 14:10', severity: 'warning', status: 'resolved', reportedBy: 'Nguyễn Văn C', time: '14:10' },
  { id: 2, title: 'Voucher sàn Shopee bị trễ hiển thị 2 phút', severity: 'info', status: 'resolved', reportedBy: 'Trần Thị B', time: '14:18' },
]

const ACTIVITIES: ActivityEvent[] = [
  { id: 'ACT-08', time: '15:24', author: 'Nguyễn Văn C', role: 'Kỹ thuật', content: 'Chụp ảnh snapshot thành công: Đã ghi nhận bản chụp #4 (Snapshot 22:45) lên bucket live-dashboard-images.', type: 'snapshot', badge: 'Snapshot #4' },
  { id: 'ACT-07', time: '15:20', author: 'Hệ thống Tesseract OCR', role: 'OCR Engine', content: 'Bóc tách thành công 14 chỉ số doanh thu, đơn hàng và tỷ lệ chuyển đổi (Độ tin cậy: 98.2%).', type: 'ocr', badge: 'OCR Verified' },
  { id: 'ACT-06', time: '15:10', author: 'Trần Thị B', role: 'Trợ live', content: 'Ghim sản phẩm số 5: Pharmaton Energy 30 viên kèm mã giảm giá 15%.', type: 'note' },
  { id: 'ACT-05', time: '14:45', author: 'Nguyễn Văn C', role: 'Kỹ thuật', content: 'Hoàn thành checklist: Đổi pin micro dự phòng và cân chỉnh âm lượng OBS.', type: 'checklist' },
  { id: 'ACT-04', time: '14:30', author: 'Hệ thống', role: 'System', content: 'Người xem đồng thời (PCU) đạt mức cao nhất: 1.420 mắt xem.', type: 'system', badge: 'Peak Viewers' },
  { id: 'ACT-03', time: '14:15', author: 'Nguyễn Văn A', role: 'Host', content: 'Thêm ghi chú ca live: Khách hỏi hạn sử dụng lô sản xuất tháng 08/2026.', type: 'note' },
  { id: 'ACT-02', time: '14:00', author: 'Hệ thống', role: 'System', content: 'Bắt đầu phát sóng trực tiếp ca live SHF-20260906-A (Shopee Live / TikTok Shop).', type: 'system', badge: 'Session Started' },
  { id: 'ACT-01', time: '13:30', author: 'Nguyễn Văn C', role: 'Kỹ thuật', content: 'Check-in thiết bị phòng Studio A: Camera 4K, OBS Stream Studio, Micro Hollyland.', type: 'system' },
]

const LIVE_COMMENTS = [
  { user: 'thuha_92', text: 'Uống viên này sáng hay trưa vậy shop?', time: 'vừa xong' },
  { user: 'minhtuan.ops', text: 'Đã chốt combo 2 hộp nha host ơi!', time: '1s' },
  { user: 'lananh_beauty', text: 'Có mã freeship extra không shop?', time: '3s' },
  { user: 'duc.hoang', text: 'Host tư vấn kỹ quá, 10 điểm!', time: '5s' },
  { user: 'ngocmai_88', text: 'Cho em xem lại hộp màu cam với ạ', time: '8s' },
]

// ── Shared Helpers ────────────────────────────────────────────────────────────
function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium cursor-pointer transition-colors ${active ? 'bg-white/10 text-white font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}

function Av({ initials, tone }: { initials: string; tone: AvatarTone }) {
  const tones = {
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  return (
    <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[12px] font-bold shrink-0 ${tones[tone]}`}>
      {initials}
    </div>
  )
}

function SBadge({ status }: { status: StaffStatus }) {
  if (status === 'live') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white">Đang live</span>
  if (status === 'ready') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Sẵn sàng</span>
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Vắng</span>
}

function IR({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-blue-600 font-bold' : 'text-slate-900'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function HR({ icon, label, status, detail }: { icon: React.ReactNode; label: string; status: HealthStatus; detail?: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <div className="flex items-center gap-2 text-slate-700">
        <span className="text-slate-400">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {detail && <span className="text-[10px] font-semibold text-slate-400">{detail}</span>}
        <span className={`w-2 h-2 rounded-full ${status === 'ok' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`} />
      </div>
    </div>
  )
}

function QA({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} type="button" className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-700 text-left transition-colors">
      <span className="text-blue-600">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function SHead({ children, badge }: { children: React.ReactNode; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{children}</p>
      {badge && <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{badge}</span>}
    </div>
  )
}

// ── Phone Simulator Component ─────────────────────────────────────────────────
function MockPhonePreview() {
  return (
    <div className="w-[195px] h-[345px] bg-slate-900 rounded-[28px] p-2.5 shadow-md flex flex-col justify-between relative border-[3px] border-slate-800 text-white overflow-hidden shrink-0">
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-3 bg-black rounded-full z-20" />
      <div className="flex items-center justify-between relative z-10 text-[10px] pt-2 px-1">
        <div className="flex items-center gap-1 bg-black/40 backdrop-blur px-1.5 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="font-bold text-[9px]">LIVE</span>
          <span className="text-slate-300 text-[8px] pl-0.5">842</span>
        </div>
        <div className="flex items-center gap-1 bg-black/40 backdrop-blur px-1.5 py-0.5 rounded-full">
          <Heart size={10} className="text-rose-400 fill-rose-400" />
          <span className="text-[9px]">18.4K</span>
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30 flex items-center justify-center">
        <div className="text-center p-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-blue-600/30 border border-blue-400/40 flex items-center justify-center mb-2">
            <MonitorPlay size={24} className="text-blue-300" />
          </div>
          <p className="text-[11px] font-bold text-white drop-shadow">Pharmaton T9</p>
          <p className="text-[9px] text-slate-300 mt-0.5">Host: Nguyễn Văn A</p>
          <span className="inline-block mt-2 text-[9px] bg-emerald-500/80 text-white font-mono px-2 py-0.5 rounded-full">01:24:15</span>
        </div>
      </div>
      <div className="relative z-10 space-y-1">
        <div className="space-y-0.5 max-h-[72px] overflow-hidden text-[9px]">
          {LIVE_COMMENTS.slice(0, 3).map((c, i) => (
            <div key={i} className="bg-black/40 backdrop-blur rounded px-1.5 py-0.5 text-slate-200 truncate">
              <span className="font-semibold text-blue-300">{c.user}: </span>
              {c.text}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-black/60 backdrop-blur rounded-lg p-1.5 border border-white/10">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
              <ShoppingBag size={12} className="text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-amber-200 truncate">Pharmaton 30v</p>
              <p className="text-[8px] text-slate-300">189.000đ</p>
            </div>
          </div>
          <span className="text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold uppercase shrink-0">-50%</span>
        </div>
      </div>
    </div>
  )
}

// ── Root Live Operations Component ────────────────────────────────────────────
export function LiveOperationsReferenceMock({
  initialState = 'none',
  initialTab = 'overview',
}: {
  initialState?: LiveQaState
  initialTab?: LiveTab
}) {
  const [qaState, setQaState] = useState<LiveQaState>(initialState)
  const [activeTab, setActiveTab] = useState<LiveTab>(initialTab)
  const [qaMenuOpen, setQaMenuOpen] = useState(false)
  const [metricsExpanded, setMetricsExpanded] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  // Global test hook for automated Visual QA state switching
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).__setLiveQaState = (st: LiveQaState) => {
        setQaState(st)
        if (st === '13-activity') setActiveTab('activity')
        if (st === '14-ops-panels') setActiveTab('checklist')
      }
    }
  }, [])

  // Derived state configurations based on QA State
  const isUpdatesMissing = qaState === '03-updates-missing'
  const isNeedsReview = qaState === '04-needs-review'
  const isFreshSnapshot = qaState === '02-fresh-snapshot'
  const isSnapshotStale = qaState === '09-snapshot-stale'
  const isSnapshotSuccess = qaState === '08-snapshot-success'
  const isReportLineageState = qaState === '10-report-lineage'
  const isMissingMetricState = qaState === '15-missing-metric'

  // Metric values reflecting state
  const displayMetrics = LIVE_CANONICAL_METRICS.map(m => {
    if (isUpdatesMissing) {
      return { ...m, value: '—', status: 'missing' as const, freshness: 'Missing' as const }
    }
    if (isMissingMetricState) {
      if (m.key === 'ctr') return { ...m, value: 'Missing (—)', status: 'missing' as const, freshness: 'Missing' as const }
      if (m.key === 'revenue') return { ...m, value: '11.700.000 ₫' }
      if (m.key === 'orders') return { ...m, value: '156' }
    }
    if (isNeedsReview && m.key === 'ctr') {
      return { ...m, status: 'needs-review' as const, confidence: '74%' }
    }
    return m
  })

  const QA_STATE_OPTIONS: { id: LiveQaState; label: string }[] = [
    { id: '01-live-main', label: '01. Live Main (Command Center)' },
    { id: '02-fresh-snapshot', label: '02. Fresh Snapshot (Verified 22:45)' },
    { id: '03-updates-missing', label: '03. Updates Missing (Cảnh báo thiếu dữ liệu)' },
    { id: '04-needs-review', label: '04. Needs Review (Cần kiểm tra lại số liệu)' },
    { id: '05-metrics-expanded', label: '05. Metrics Expanded (15 chỉ số chuẩn)' },
    { id: '06-evidence-detail', label: '06. Evidence Detail (Bản chụp & OCR)' },
    { id: '07-submit-update', label: '07. Submit Dashboard Update (Modal nộp ảnh)' },
    { id: '08-snapshot-success', label: '08. Snapshot Success (Ghi nhận thành công)' },
    { id: '09-snapshot-stale', label: '09. Snapshot Stale (Dữ liệu cũ >30m)' },
    { id: '10-report-lineage', label: '10. Live to Report Lineage (Truy vết báo cáo)' },
    { id: '11-delete-confirm', label: '11. Delete Evidence Confirm (Xác nhận xóa)' },
    { id: '12-delete-blocked', label: '12. Delete Blocked (Khóa bởi Report Confirmed)' },
    { id: '13-activity', label: '13. Activity & History (Nhật ký sự kiện)' },
    { id: '14-ops-panels', label: '14. Ops Panels (Notes/Issues/Checklist)' },
    { id: '15-missing-metric', label: '15. Missing Metric (Quy tắc NULL != 0)' },
  ]

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] overflow-hidden font-sans text-slate-900 relative">
      {/* QA STATE CONTROLLER (Floating Unobtrusive Pill for Automated Review) */}
      <div data-qa-controller className="fixed bottom-3 right-3 z-50 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur text-white text-[11px] px-3 py-1.5 rounded-full shadow-lg border border-slate-700">
        <SlidersHorizontal size={13} className="text-blue-400" />
        <span className="font-semibold text-slate-200">Live QA State:</span>
        <div className="relative">
          <button
            type="button"
            data-qa-trigger
            onClick={() => setQaMenuOpen(!qaMenuOpen)}
            className="flex items-center gap-1 font-bold text-amber-300 hover:text-amber-200 bg-white/10 px-2 py-0.5 rounded transition-colors"
          >
            {qaState === 'none' ? '01-live-main' : qaState}
            <ChevronDown size={11} />
          </button>
          {qaMenuOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1.5 space-y-0.5 max-h-80 overflow-y-auto z-50">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Chọn trạng thái Visual QA
              </div>
              {QA_STATE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  data-qa-state={opt.id}
                  type="button"
                  onClick={() => {
                    setQaState(opt.id)
                    setQaMenuOpen(false)
                    if (opt.id === '13-activity') setActiveTab('activity')
                    if (opt.id === '14-ops-panels') setActiveTab('checklist')
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] transition-colors flex items-center justify-between ${qaState === opt.id ? 'bg-blue-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                  <span>{opt.label}</span>
                  {qaState === opt.id && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SIDEBAR (Dark Navy Enterprise Shell #082743) */}
      <aside className="w-[230px] bg-[#082743] text-white flex flex-col shrink-0 z-20 select-none">
        <div className="h-[52px] flex items-center px-4 font-bold text-[15px] tracking-tight border-b border-white/10">
          <div className="w-5 h-5 bg-blue-600 rounded mr-2 flex items-center justify-center">
            <div className="w-1.5 h-2.5 bg-white rounded-xs" />
          </div>
          LiveStream Ops
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 text-[12px]">
          <NavItem icon={<LayoutGrid size={16} />} label="Tổng quan (Workspace)" />
          <NavItem icon={<Briefcase size={16} />} label="Lịch cá nhân (My Schedule)" />
          <NavItem icon={<Clock3 size={16} />} label="Lịch ca (Calendar)" />
          <NavItem icon={<Users size={16} />} label="Phân công (Staffing)" />
          <NavItem icon={<ArrowLeftRight size={16} />} label="Đổi ca (Swaps)" />
          <NavItem icon={<MonitorPlay size={16} />} label="Vận hành Live" active />
          <NavItem icon={<BarChart2 size={16} />} label="Báo cáo (Reports)" />
          <NavItem icon={<Bell size={16} />} label="Thông báo" />
        </div>
        <div className="p-3 border-t border-white/10 flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-blue-500/30 border border-blue-400/40 flex items-center justify-center text-[11px] font-bold text-blue-200 shrink-0">NK</span>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-[12px] font-semibold text-slate-100 truncate">Nguyễn Trung Kiên</span>
            <span className="text-[10px] text-slate-400 truncate">Leader / Quản lý ca</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOP BREADCRUMB STRIP */}
        <header className="h-[44px] bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0 text-[12px]">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="hover:text-blue-600 cursor-pointer">Vận hành Live</span>
            <ChevronRight size={12} className="text-slate-400" />
            <span className="font-bold text-slate-900">Pharmaton T9 (SHF-20260906-A)</span>
            <span className="ml-2 text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">TikTok Shop</span>
            <span className="text-[10px] font-mono text-slate-400">rev: 3</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQaState('07-submit-update')}
              className="flex h-7 items-center gap-1.5 rounded bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-700 shadow-xs transition-colors"
            >
              <Upload size={12} />
              Gửi cập nhật Dashboard
            </button>
            <button
              type="button"
              onClick={() => setQaState('06-evidence-detail')}
              className="flex h-7 items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Eye size={12} className="text-blue-600" />
              Xem đối soát OCR
            </button>
          </div>
        </header>

        {/* SHIFT BANNER & CONTROLS */}
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-[16px] font-bold text-slate-900">
                Pharmaton T9 · Năng Lượng Đỉnh Cao
              </h1>
              <span className="flex items-center gap-1 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping inline-block" />
                ĐANG LIVE
              </span>
              <span className="text-[13px] font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                01:24:15
              </span>
              <span className="text-[11px] text-slate-500">
                (Còn lại: 01:35:45 · Tổng: 180 phút)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                className="h-7 px-3 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold flex items-center gap-1 hover:bg-amber-100 transition-colors"
              >
                <Pause size={12} /> {isPaused ? 'Tiếp tục ca' : 'Tạm dừng ca'}
              </button>
              <button
                type="button"
                className="h-7 px-3 rounded bg-red-600 text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-red-700 shadow-xs transition-colors"
              >
                <Square size={11} className="fill-white" /> Kết thúc ca
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-[11px] text-slate-500">
            <span><strong>Phòng live:</strong> Studio A</span>
            <span>•</span>
            <span><strong>Khung giờ:</strong> 20:00–23:00 (06/09/2026)</span>
            <span>•</span>
            <span><strong>Thương hiệu:</strong> Sanofi / Pharmaton</span>
            <span>•</span>
            <span><strong>Chiến dịch:</strong> Mega Sale 9.9</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-700">
              <UserCheck size={12} className="text-emerald-600" /> <strong>Nhân sự:</strong> 5/5 đã check-in
            </span>
            <span>•</span>
            <span><strong>Bản chụp:</strong> #4 (22:45)</span>
          </div>
        </div>

        {/* COMMERCIAL METRIC STRIP (Compact Density Presentation) */}
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 shrink-0 grid grid-cols-6 gap-2.5">
          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2 text-left">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Doanh thu (Revenue)</span>
              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded font-mono">Live</span>
            </div>
            <div className="text-[16px] font-bold text-slate-900 mt-0.5">
              {displayMetrics[0].value}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              {isUpdatesMissing ? 'Chưa cập nhật' : 'OCR: 98.2% · Khớp Seller Center'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2 text-left">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Tổng GMV</span>
              <span className="text-[9px] bg-slate-200 text-slate-600 px-1 rounded font-mono">Snapshot</span>
            </div>
            <div className="text-[16px] font-bold text-slate-900 mt-0.5">
              {displayMetrics[1].value}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              {isUpdatesMissing ? 'Chưa cập nhật' : 'Bản chụp lúc 22:45'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2 text-left">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Số đơn hàng (Orders)</span>
              <TrendingUp size={12} className="text-blue-500" />
            </div>
            <div className="text-[16px] font-bold text-blue-600 mt-0.5">
              {displayMetrics[2].value} {displayMetrics[2].value !== '—' && <span className="text-[11px] font-normal text-slate-500">đơn</span>}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              {isUpdatesMissing ? 'Chưa cập nhật' : 'Tốc độ: 3.8 đơn/phút'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2 text-left">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Mắt xem (CCU / Đỉnh)</span>
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            </div>
            <div className="text-[16px] font-bold text-slate-900 mt-0.5">
              {isUpdatesMissing ? '—' : '842 / 1.420'}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              {isUpdatesMissing ? 'Chưa cập nhật' : 'Trung bình: 485 ACU'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2 text-left">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Tỷ lệ nhấp (CTR)</span>
              {isNeedsReview && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">Review</span>}
            </div>
            <div className={`text-[16px] font-bold mt-0.5 ${isNeedsReview ? 'text-amber-700' : 'text-slate-900'}`}>
              {displayMetrics[12].value}
            </div>
            <div className="text-[9px] text-slate-400 mt-0.5 truncate">
              CVR: {isUpdatesMissing ? '—' : '6.81%'} · AOV: {isUpdatesMissing ? '—' : '76.3K'}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-blue-50/60 p-2 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-bold text-blue-900 uppercase">
              <span>Toàn bộ 15 chỉ số</span>
              <SlidersHorizontal size={11} className="text-blue-600" />
            </div>
            <button
              type="button"
              onClick={() => setQaState('05-metrics-expanded')}
              className="w-full text-center py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors mt-1"
            >
              Mở từ điển chỉ số →
            </button>
          </div>
        </div>

        {/* PROVENANCE & LIVE-TO-REPORT LINEAGE CALLOUT */}
        <div className="bg-slate-100 border-b border-slate-200 px-5 py-1.5 flex items-center justify-between text-[11px] shrink-0">
          <div className="flex items-center gap-2 text-slate-600">
            <Layers size={13} className="text-blue-600" />
            <strong className="text-slate-800">Truy vết dữ liệu Live → Báo cáo:</strong>
            <span>Snapshot #4 (22:45)</span>
            <ArrowRight size={11} className="text-slate-400" />
            <span>Tesseract OCR v5 (Độ tin cậy: 98.2%)</span>
            <ArrowRight size={11} className="text-slate-400" />
            <span className="font-semibold text-emerald-700">Liên kết Báo cáo chốt ca (RPT-0906-01)</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
            <span>Storage: live-dashboard-images</span>
            <span>•</span>
            <span>Path: dashboard/SHF-20260906-A/snapshot-04.png</span>
          </div>
        </div>

        {/* OPERATIONAL STATUS BANNERS */}
        {isUpdatesMissing && (
          <div className="mx-5 mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[13px] font-bold">Cảnh báo: Chưa có cập nhật số liệu (Updates Missing)</strong>
                <span>
                  Ca livestream đang phát sóng nhưng hệ thống chưa ghi nhận bản chụp Dashboard mới nhất (&gt;30 phút). Các chỉ số hiển thị ở trạng thái Chưa xác định (—) và không tự động điền về 0 (Quy tắc NULL != 0).
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQaState('07-submit-update')}
              className="shrink-0 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition-colors"
            >
              Gửi bản chụp ngay
            </button>
          </div>
        )}

        {isNeedsReview && (
          <div className="mx-5 mt-3 rounded-lg border border-purple-300 bg-purple-50 p-3 text-[12px] text-purple-900 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-purple-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[13px] font-bold">Yêu cầu đối soát: Chỉ số cần kiểm tra lại (Needs Review)</strong>
                <span>
                  Chỉ số Tỷ lệ nhấp (CTR: 36.62%) có độ tin cậy nhận diện OCR là 74% (dưới ngưỡng 85%). Kỹ thuật / Trợ live cần đối chiếu lại trực tiếp với Seller Center trước khi gửi chốt báo cáo.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQaState('06-evidence-detail')}
              className="shrink-0 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold transition-colors"
            >
              Xem vùng OCR
            </button>
          </div>
        )}

        {isSnapshotStale && (
          <div className="mx-5 mt-3 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-[12px] text-amber-900 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-2.5">
              <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[13px] font-bold">Dữ liệu chụp cũ: Bản snapshot đã quá 45 phút (Aging / Stale)</strong>
                <span>
                  Bản chụp gần nhất ghi nhận lúc 22:00 (đã trôi qua 45 phút). Hãy tải lên ảnh chụp mới nhất để quản lý ca nắm bắt số liệu thời gian thực.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQaState('07-submit-update')}
              className="shrink-0 px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition-colors"
            >
              Làm mới số liệu
            </button>
          </div>
        )}

        {isSnapshotSuccess && (
          <div className="mx-5 mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[12px] text-emerald-900 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-2.5">
              <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[13px] font-bold">Ghi nhận thành công: Snapshot #4 đã được lưu trữ an toàn</strong>
                <span>
                  Bản chụp màn hình lúc 22:45 đã được tải lên bucket <code>live-dashboard-images</code> và tự động bóc tách số liệu vào bản nháp báo cáo.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-mono text-emerald-700 self-center">id: dbu-0906-04</span>
          </div>
        )}

        {isReportLineageState && (
          <div className="mx-5 mt-3 rounded-lg border border-blue-300 bg-blue-50 p-3 text-[12px] text-blue-900 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-2.5">
              <Link2 size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-[13px] font-bold">Liên kết báo cáo cuối ca: Live → Report Lineage</strong>
                <span>
                  Toàn bộ bằng chứng và chỉ số bóc tách từ ca live này được tự động kế thừa vào Báo cáo cuối ca <strong>RPT-0906-01</strong>. Dữ liệu chỉ được đóng băng (Frozen) sau khi Leader xác nhận báo cáo.
                </span>
              </div>
            </div>
            <span className="text-[11px] font-bold text-blue-700 self-center bg-white px-2.5 py-1 rounded border border-blue-200">
              Mã báo cáo: RPT-0906-01
            </span>
          </div>
        )}

        {/* TABS NAVIGATION */}
        <div className="bg-white border-b border-slate-200 px-5 shrink-0 flex items-center justify-between">
          <div className="flex items-center">
            {[
              { id: 'overview', label: 'Tổng quan giám sát' },
              { id: 'staff', label: 'Nhân sự ca live', count: STAFF.length },
              { id: 'notes', label: 'Ghi chú vận hành', count: NOTES.length },
              { id: 'issues', label: 'Sự cố & Xử lý', count: ISSUES.length },
              { id: 'checklist', label: 'Checklist ca live', count: CHECKLIST.length },
              { id: 'activity', label: 'Nhật ký hoạt động (Audit)', count: ACTIVITIES.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as LiveTab)}
                className={`px-3.5 py-2.5 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 text-emerald-700 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Live Stream OK
            </span>
            <span>•</span>
            <span className="font-mono">FPS: 60 · Bitrate: 6.2 Mbps</span>
          </div>
        </div>

        {/* TAB WORKSPACE */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-[280px_minmax(500px,1fr)_300px] gap-4 items-start">
              {/* LEFT COLUMN: Shift Context & Actions */}
              <div className="flex flex-col gap-4">
                <section>
                  <SHead badge="Ca SHF-0906-A">Thông tin ca trực</SHead>
                  <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5 shadow-xs">
                    <IR label="Thời gian ca" value="20:00 - 23:00" />
                    <IR label="Nền tảng live" value="TikTok Shop Seller" highlight />
                    <IR label="Phòng Studio" value="Studio A (Tầng 3)" />
                    <IR label="Thương hiệu" value="Pharmaton Energy" />
                    <IR label="Chiến dịch" value="Payday Mega 9.9" />
                    <IR label="Trạng thái ca" value="Đang diễn ra (Live)" highlight />
                    <IR label="Thời lượng đã phát" value="01:24:15" mono />
                  </div>
                </section>

                <section>
                  <SHead badge="Unbacked Operational Cue">Hệ thống kỹ thuật</SHead>
                  <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5 shadow-xs">
                    <HR icon={<Wifi size={13} />} label="Đường truyền mạng LAN" status="ok" detail="120 Mbps" />
                    <HR icon={<Camera size={13} />} label="Tín hiệu Camera Sony 4K" status="ok" detail="1080p 60fps" />
                    <HR icon={<Mic size={13} />} label="Microphone Hollyland" status="ok" detail="Pin 85%" />
                    <HR icon={<Activity size={13} />} label="Đồng bộ kho TikTok" status="ok" detail="Hoàn tất" />
                  </div>
                </section>

                <section>
                  <SHead>Hành động nhanh</SHead>
                  <div className="space-y-1.5">
                    <QA icon={<Upload size={13} />} label="Gửi bản chụp Dashboard mới" onClick={() => setQaState('07-submit-update')} />
                    <QA icon={<Eye size={13} />} label="Kiểm tra đối soát OCR" onClick={() => setQaState('06-evidence-detail')} />
                    <QA icon={<Trash2 size={13} />} label="Xóa snapshot chưa chốt" onClick={() => setQaState('11-delete-confirm')} />
                    <QA icon={<Lock size={13} />} label="Kiểm tra khóa xóa (Report Lock)" onClick={() => setQaState('12-delete-blocked')} />
                  </div>
                </section>
              </div>

              {/* CENTER COLUMN: Live Monitor & Current Content */}
              <div className="flex flex-col">
                <SHead badge="Live Preview Fixture">Giám sát phiên phát sóng (Live Monitor)</SHead>
                <div className="bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[12px] font-bold text-slate-800">OBS STREAM MONITOR</span>
                      <span className="text-[10px] text-slate-500 font-mono">(Direct Studio Feed)</span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      Đang phát: 01:24:15
                    </span>
                  </div>

                  <div className="p-4 flex gap-5">
                    <MockPhonePreview />
                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                      {/* Session Info Details */}
                      <section>
                        <SHead>Chi tiết luồng trực tiếp</SHead>
                        <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-md border border-slate-200/60 text-[12px]">
                          <div className="font-bold text-slate-900 truncate">Pharmaton T9 - Năng Lượng Bền Bỉ</div>
                          <div className="text-slate-600">Nền tảng: <strong className="text-slate-900">TikTok Shop Seller Center</strong></div>
                          <div className="text-slate-600">Host chính: <strong className="text-slate-900">Nguyễn Văn A</strong></div>
                          <div className="text-slate-600">Mắt xem hiện tại: <strong className="text-slate-900">842 người</strong> (Đỉnh: 1.420)</div>
                          <div className="text-slate-600">Bản chụp gần nhất: <strong className="text-blue-700">Snapshot #4 (22:45)</strong></div>
                        </div>
                      </section>

                      {/* Current Content Highlight */}
                      <section>
                        <SHead badge="Unbacked Content Cue">Sản phẩm đang ghim trên luồng</SHead>
                        <div className="bg-blue-50/80 p-2.5 rounded-md border border-blue-200 text-[12px]">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[10px] text-blue-700 font-bold uppercase tracking-wide">Flash Sale Giờ Vàng (-50%)</p>
                              <p className="text-[13px] font-bold text-slate-900">Viên uống Pharmaton Energy hộp 30 viên</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">Mã SKU: PHA-ENE-30V · Đã bán: 182 hộp</p>
                            </div>
                            <span className="text-[12px] font-bold text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded">
                              189.000 ₫
                            </span>
                          </div>
                        </div>
                      </section>

                      {/* Lineage & Link Section */}
                      <section>
                        <SHead>Liên kết & Đường dẫn nguồn</SHead>
                        <div className="space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded">
                            <span className="text-slate-600">Dashboard Seller Center:</span>
                            <a href="#" className="font-semibold text-blue-600 hover:underline flex items-center gap-1">
                              seller-vn.tiktok.com/live <ExternalLink size={10} />
                            </a>
                          </div>
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded">
                            <span className="text-slate-600">Đường dẫn xem luồng live:</span>
                            <a href="#" className="font-semibold text-blue-600 hover:underline flex items-center gap-1">
                              tiktok.com/@pharmaton_official <ExternalLink size={10} />
                            </a>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Activity Feed & Session Summary */}
              <div className="flex flex-col gap-4">
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nhật ký trực tiếp</p>
                    <button type="button" onClick={() => setActiveTab('activity')} className="text-[11px] text-blue-600 font-semibold hover:underline">
                      Xem tất cả ({ACTIVITIES.length})
                    </button>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-3 relative">
                    <div className="space-y-3">
                      {ACTIVITIES.slice(0, 4).map((act) => (
                        <div key={act.id} className="flex gap-2.5 items-start text-[11px]">
                          <div className="w-5 h-5 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5 text-blue-600">
                            {act.type === 'snapshot' && <Camera size={11} />}
                            {act.type === 'ocr' && <ScanText size={11} />}
                            {act.type === 'note' && <MessageSquare size={11} />}
                            {act.type === 'system' && <Activity size={11} />}
                            {act.type === 'checklist' && <CheckCircle size={11} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 truncate">{act.author}</span>
                              <span className="text-[10px] text-slate-400">{act.time}</span>
                            </div>
                            <p className="text-slate-600 leading-tight mt-0.5">{act.content}</p>
                            {act.badge && (
                              <span className="inline-block mt-1 text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                {act.badge}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <SHead>Tóm tắt ca trực</SHead>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-3 space-y-2 text-[12px]">
                    <IR label="Nhân sự có mặt" value="5/5 nhân sự" />
                    <IR label="Checklist hoàn thành" value="6/8 mục" />
                    <IR label="Sự cố đã giải quyết" value="2 sự cố (Đã xong)" />
                    <IR label="Bản chụp Dashboard" value="4 bản snapshot" />
                    <IR label="Tốc độ tăng trưởng" value="+18% vs mục tiêu" highlight />
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: STAFFING */}
          {activeTab === 'staff' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 max-w-4xl space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Phân công nhân sự ca live (Staffing Roster)</h3>
                <p className="text-[12px] text-slate-500">
                  Danh sách nhân sự được phân công theo vai trò chuẩn (Host, Trợ live, Kỹ thuật) và trạng thái điểm danh thực tế
                </p>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {STAFF.map((member) => (
                  <div key={member.name} className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3">
                      <Av initials={member.avatar} tone={member.tone} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[13px] text-slate-900">{member.name}</span>
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono uppercase">
                            {member.canonicalRole}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{member.roleDisplay} · SĐT: {member.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[12px]">
                      <span className="text-slate-500">Check-in: <strong>{member.checkInTime}</strong></span>
                      <SBadge status={member.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: NOTES */}
          {activeTab === 'notes' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 max-w-4xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">Ghi chú vận hành ca live (Live Notes)</h3>
                  <p className="text-[12px] text-slate-500">
                    Bao gồm ghi chú kèm theo bản chụp Dashboard (DashboardUpdate.notes) và nhật ký vận hành studio
                  </p>
                </div>
                <button type="button" className="px-3 py-1.5 rounded bg-blue-600 text-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-blue-700 transition-colors">
                  <Plus size={13} /> Thêm ghi chú mới
                </button>
              </div>

              <div className="space-y-3">
                {NOTES.map((note) => (
                  <div key={note.id} className={`p-3.5 rounded-lg border ${note.pinned ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-1 text-[11px]">
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900">{note.author}</strong>
                        <span className="text-slate-400 font-mono">({note.role})</span>
                        {note.pinned && <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-bold uppercase">Ghim</span>}
                      </div>
                      <span className="text-slate-400">{note.time}</span>
                    </div>
                    <p className="text-[12px] text-slate-700 leading-relaxed">{note.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: ISSUES */}
          {activeTab === 'issues' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 max-w-4xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">Sự cố phát sinh & Khắc phục (Live Issues)</h3>
                  <p className="text-[12px] text-slate-500">
                    Theo dõi sự cố kỹ thuật, âm thanh, mạng hoặc sàn thương mại trong ca live (NEW_ONLY_UNBACKED)
                  </p>
                </div>
                <button type="button" className="px-3 py-1.5 rounded bg-red-600 text-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-red-700 transition-colors">
                  <AlertTriangle size={13} /> Báo cáo sự cố
                </button>
              </div>

              <div className="space-y-3">
                {ISSUES.map((iss) => (
                  <div key={iss.id} className="p-3.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle size={15} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-[13px] text-slate-900">{iss.title}</strong>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono uppercase">
                            {iss.severity}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Báo cáo bởi {iss.reportedBy} lúc {iss.time} · Trạng thái: <strong className="text-emerald-700">Đã xử lý xong</strong>
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                      Đã khắc phục
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 max-w-4xl space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Danh mục kiểm tra trước & trong ca (Live Checklist)</h3>
                <p className="text-[12px] text-slate-500">
                  Quy trình chuẩn hóa 8 bước đảm bảo chất lượng phát sóng và tuân thủ nguyên tắc vận hành (NEW_ONLY_UNBACKED)
                </p>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {CHECKLIST.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded flex items-center justify-center ${item.completed ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>
                        {item.completed && <Check size={13} />}
                      </span>
                      <div>
                        <p className={`text-[13px] ${item.completed ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>{item.text}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Phân loại: {item.category} · Người phụ trách: <strong>{item.assignedTo}</strong></p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {item.completed ? 'Hoàn thành' : 'Đang thực hiện'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: ACTIVITY / AUDIT */}
          {activeTab === 'activity' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 max-w-4xl space-y-4">
              <div>
                <h3 className="text-[15px] font-bold text-slate-900">Nhật ký kiểm toán & Hoạt động ca trực (Live Activity Audit)</h3>
                <p className="text-[12px] text-slate-500">
                  Ghi nhận đầy đủ theo trình tự thời gian mọi thao tác gửi snapshot, bóc tách OCR, ghim sản phẩm và ghi chú
                </p>
              </div>

              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {ACTIVITIES.map((act) => (
                  <div key={act.id} className="relative flex items-start gap-3 text-[12px]">
                    <span className="absolute -left-6 mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white ring-4 ring-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    <div className="flex-1 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                      <div className="flex items-center justify-between mb-1">
                        <strong className="text-slate-900 font-bold">{act.author} <span className="font-normal text-slate-500">({act.role})</span></strong>
                        <span className="text-[11px] text-slate-400 font-mono">{act.time}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed">{act.content}</p>
                      {act.badge && (
                        <span className="inline-block mt-1.5 text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {act.badge}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── MODALS & DIALOGS ─────────────────────────────────────────────────── */}

      {/* MODAL 1: SUBMIT DASHBOARD UPDATE */}
      {qaState === '07-submit-update' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Upload size={16} className="text-blue-600" />
                <h3 className="text-[15px] font-bold text-slate-900">Gửi cập nhật số liệu Dashboard (Submit Dashboard Update)</h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại"
                onClick={() => setQaState('none')}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-[12px]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ca livestream</label>
                  <input readOnly value="Pharmaton T9 (SHF-20260906-A)" className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-600 font-medium" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nền tảng thương mại</label>
                  <select defaultValue="tiktok_shop" className="w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-slate-800 font-medium">
                    <option value="tiktok_shop">TikTok Shop Seller Center</option>
                    <option value="shopee">Shopee Live Partner</option>
                    <option value="lazada">Lazada Live Studio</option>
                  </select>
                </div>
              </div>

              {/* Upload Zone */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tải lên ảnh chụp màn hình Dashboard kết thúc hoặc giữa ca (Durable Storage)
                </label>
                <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/40 p-4 text-center">
                  <Camera size={28} className="mx-auto text-blue-500 mb-1.5" />
                  <p className="font-semibold text-slate-800">Kéo thả ảnh hoặc bấm để chọn tệp</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Định dạng: PNG, JPG, WebP · Dung lượng tối đa: 10 MB · Lưu trữ an toàn tại bucket <code>live-dashboard-images</code></p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 border border-blue-200 shadow-xs">
                    <FileText size={12} />
                    <span>snapshot_tiktok_2245.png (1.4 MB) - Sẵn sàng quét OCR</span>
                  </div>
                </div>
              </div>

              {/* ROI Crop Preview & OCR Extraction */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ScanText size={14} className="text-purple-600" />
                    <strong className="text-slate-800">Vùng nhận diện OCR (Tesseract v5 + Vision OCR Hybrid):</strong>
                  </div>
                  <span className="text-[10px] font-mono text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded font-bold">
                    Crop ROI: [x:120, y:85, w:680, h:420]
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Doanh thu bóc tách</span>
                    <strong className="text-slate-900 text-[13px]">24.500.000 ₫</strong>
                    <span className="text-[9px] text-emerald-600 block">Độ tin cậy: 98%</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Số đơn hàng bóc tách</span>
                    <strong className="text-slate-900 text-[13px]">321 đơn</strong>
                    <span className="text-[9px] text-emerald-600 block">Độ tin cậy: 94%</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-500 block text-[10px]">Người xem đỉnh (PCU)</span>
                    <strong className="text-slate-900 text-[13px]">1.420 người</strong>
                    <span className="text-[9px] text-emerald-600 block">Độ tin cậy: 99%</span>
                  </div>
                </div>
              </div>

              {/* Notes Field */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú kèm theo bản chụp (DashboardUpdate.notes)</label>
                <textarea
                  rows={2}
                  defaultValue="Bản chụp thời điểm 22:45, ca live đạt mốc doanh thu 24.5M trước giờ đóng luồng."
                  className="w-full rounded border border-slate-300 p-2 text-slate-800 focus:outline-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
              <span className="text-[11px] text-slate-500 font-mono">Quy tắc: Không ghi đè 0 nếu ảnh thiếu trường</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQaState('none')}
                  className="px-3.5 py-1.5 rounded border border-slate-300 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('08-snapshot-success')}
                  className="px-4 py-1.5 rounded bg-blue-600 text-white text-[12px] font-bold hover:bg-blue-700 shadow-xs"
                >
                  Xác nhận lưu Snapshot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EVIDENCE DETAIL & OCR BREAKDOWN */}
      {qaState === '06-evidence-detail' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-blue-600" />
                <h3 className="text-[15px] font-bold text-slate-900">Chi tiết bằng chứng ảnh & Bóc tách OCR (Evidence Detail)</h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại"
                onClick={() => setQaState('none')}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-[12px]">
              {/* Evidence Metadata Header */}
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 block">Mã bằng chứng (ID)</span>
                  <strong className="text-slate-900 font-mono">IMG-LIVE-0906-01</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Thời điểm chụp / tải</span>
                  <strong className="text-slate-900">22:45 · 06/09/2026</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Người tải lên</span>
                  <strong className="text-slate-900">Nguyễn Văn C (Technical)</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Liên kết Báo cáo</span>
                  <span className="text-emerald-700 font-bold">RPT-0906-01 (Confirmed)</span>
                </div>
              </div>

              {/* Preview with Bounding Box Overlay */}
              <div className="rounded-lg border border-slate-300 bg-slate-900 p-3 text-center relative overflow-hidden">
                <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-600 rounded bg-slate-950/60 relative">
                  <div className="absolute inset-x-8 inset-y-6 border-2 border-emerald-400 bg-emerald-500/10 rounded flex flex-col justify-between p-3 pointer-events-none">
                    <span className="text-[10px] bg-emerald-500 text-white font-mono px-1.5 py-0.5 rounded self-start font-bold">
                      ROI: TikTok Seller Center Dashboard Area
                    </span>
                    <div className="flex justify-between text-[11px] text-emerald-200 font-mono bg-black/60 p-2 rounded backdrop-blur-xs">
                      <span>Doanh thu: 24.500.000 ₫ (98%)</span>
                      <span>Đơn hàng: 321 (94%)</span>
                      <span>PCU: 1.420 (99%)</span>
                    </div>
                  </div>
                  <MonitorPlay size={48} className="text-slate-600 mb-2" />
                  <p className="text-slate-400 text-[11px]">Screenshot Dashboard Ca Live - TikTok Shop Seller Center</p>
                  <p className="text-slate-500 text-[10px] font-mono mt-0.5">dashboard/SHF-20260906-A/snapshot-04.png · 1920x1080 · 1.4 MB</p>
                </div>
              </div>

              {/* Storage & Lineage Assurance */}
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-[11px] text-blue-900 flex items-start gap-2">
                <ShieldAlert size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Bảo vệ toàn vẹn bằng chứng đối soát:</strong> Ảnh chụp màn hình này đã được ghi nhận vào Báo cáo cuối ca đã xác nhận (RPT-0906-01). Hệ thống áp dụng quy tắc toàn vẹn khóa xóa (Referential Integrity): không thể xóa ảnh chụp này trừ khi Báo cáo được Mở lại (Reopen) bởi Quản trị viên.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
              <button
                type="button"
                onClick={() => setQaState('12-delete-blocked')}
                className="text-[12px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1.5"
              >
                <Trash2 size={13} /> Thử thao tác xóa bằng chứng
              </button>
              <button
                type="button"
                onClick={() => setQaState('none')}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: METRICS EXPANDED (All 15 Canonical Items) */}
      {(qaState === '05-metrics-expanded' || metricsExpanded) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-blue-600" />
                <h3 className="text-[15px] font-bold text-slate-900">Từ điển toàn bộ 15 chỉ số vận hành Live (Live Metrics Dictionary)</h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại"
                onClick={() => {
                  setQaState('none')
                  setMetricsExpanded(false)
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3 overflow-y-auto flex-1 text-[12px]">
              <p className="text-slate-500 text-[11px]">
                Toàn bộ chỉ số được bảo toàn 100% từ cấu trúc dữ liệu nguyên bản (OLD Production LIVE-001 đến LIVE-023), kèm công thức tính toán và đích đồng bộ sang Báo cáo chốt ca.
              </p>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3">Tên chỉ số</th>
                      <th className="py-2.5 px-3">Giá trị ca</th>
                      <th className="py-2.5 px-3">Nguồn / Tin cậy</th>
                      <th className="py-2.5 px-3">Công thức nghiệp vụ</th>
                      <th className="py-2.5 px-3">Đích kế thừa (Lineage)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayMetrics.map((m) => (
                      <tr key={m.key} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-semibold text-slate-900">{m.label}</td>
                        <td className="py-2 px-3 font-bold text-blue-700 font-mono">{m.value}</td>
                        <td className="py-2 px-3 text-slate-600">
                          <span>{m.source}</span>
                          {m.confidence && <span className="ml-1 text-[10px] text-emerald-700 font-mono">({m.confidence})</span>}
                        </td>
                        <td className="py-2 px-3 text-slate-500 font-mono text-[10px]">{m.formula || '—'}</td>
                        <td className="py-2 px-3 text-slate-700 text-[10px]">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{m.lineageDestination || 'Internal'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
              <span className="text-[11px] text-slate-500">Quy tắc toàn vẹn: Missing/Unavailable hiển thị —, không chuyển về 0</span>
              <button
                type="button"
                onClick={() => {
                  setQaState('none')
                  setMetricsExpanded(false)
                }}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE CONFIRM (Unconfirmed Snapshot) */}
      {qaState === '11-delete-confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-red-50/80">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-red-600" />
                <h3 className="text-[15px] font-bold text-red-900">Xác nhận xóa Snapshot (Delete Live Snapshot)</h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại"
                onClick={() => setQaState('none')}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-[12px] text-slate-700">
              <p>
                Bạn đang yêu cầu xóa bản snapshot <strong>Snapshot #3 (thời điểm 21:30)</strong>. Bản snapshot này chưa được chốt vào Báo cáo cuối ca.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                <strong>Lưu ý:</strong> Hành động này sẽ xóa vĩnh viễn tệp ảnh khỏi bucket <code>live-dashboard-images</code> và không thể khôi phục lại.
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lý do xóa (Bắt buộc cho nhật ký kiểm toán):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Chụp nhầm màn hình trang cá nhân..."
                  className="w-full rounded border border-slate-300 p-2 text-[12px] focus:outline-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setQaState('none')}
                className="px-3.5 py-1.5 rounded border border-slate-300 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => setQaState('none')}
                className="px-4 py-1.5 rounded bg-red-600 text-white text-[12px] font-bold hover:bg-red-700 shadow-xs"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DELETE BLOCKED BY CONFIRMED REPORT */}
      {qaState === '12-delete-blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-red-50">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-red-600" />
                <h3 className="text-[15px] font-bold text-red-900">Thao tác bị khóa (Deletion Blocked)</h3>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại"
                onClick={() => setQaState('none')}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3 text-[12px] text-slate-700">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-900 flex items-start gap-2">
                <ShieldAlert size={18} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-[12px]">Không thể xóa bản chụp này!</strong>
                  Snapshot này (IMG-LIVE-0906-01) đã được đối soát và liên kết trực tiếp vào <strong>Báo cáo đã xác nhận (RPT-0906-01)</strong>.
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã báo cáo liên kết:</span>
                  <strong className="text-slate-900 font-mono">RPT-0906-01</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trạng thái báo cáo:</span>
                  <strong className="text-emerald-700 font-bold">Confirmed (Đã chốt)</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Người xác nhận:</span>
                  <span className="text-slate-800">Nguyễn Trung Kiên (Leader)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Thời điểm chốt:</span>
                  <span className="text-slate-800">10/09/2026 · 08:30</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Để chỉnh sửa hoặc xóa bằng chứng, Quản trị viên cần thực hiện thao tác <strong>Mở lại báo cáo (Reopen Report)</strong> trong module Báo cáo trước khi thao tác tại đây.
              </p>
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setQaState('none')}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-800"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
