import { useState } from 'react'
import {
  LayoutGrid, Briefcase, Clock3, Users, ArrowLeftRight, MonitorPlay,
  BarChart2, Bell, ChevronRight, CheckCircle2, Circle, AlertTriangle,
  MessageSquare, Plus, Pause, Square, Activity,
  UserCheck, Camera, Mic, Wifi, Check, Heart, ShoppingBag, Link2
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type LiveTab = 'overview' | 'staff' | 'notes' | 'issues' | 'checklist'
type StaffStatus = 'live' | 'ready' | 'absent'
type HealthStatus = 'ok' | 'warning' | 'error'
type ActivityType = 'note' | 'checklist' | 'system'
type IssueSeverity = 'warning' | 'critical' | 'info'
type AvatarTone = 'orange' | 'blue' | 'purple' | 'green' | 'rose'

/**
 * Embed-ready live session model.
 * MOCK MODE (now): liveUrl/embedUrl are undefined → renders static phone preview.
 * FUTURE: populate from shift record; provider-specific adapter renders embed/iframe.
 */
type LiveProvider = 'tiktok' | 'shopee' | 'other'

interface LiveSessionPreviewFixture {
  provider: LiveProvider
  liveUrl?: string
  embedUrl?: string
  title: string
  host: string
  viewerCount: number
}

interface ChecklistItem { id: number; label: string; done: boolean; doneAt?: string }
interface ActivityItem  { time: string; author: string; content: string; type: ActivityType }
interface NoteItem      { time: string; author: string; content: string }
interface IssueItem     { id: number; time: string; reporter: string; content: string; severity: IssueSeverity; resolved: boolean }
interface StaffMember   { name: string; role: string; initials: string; tone: AvatarTone; status: StaffStatus; checkinTime: string }

// ── Fixtures ──────────────────────────────────────────────────────────────────
const LIVE_SESSION: LiveSessionPreviewFixture = {
  provider: 'shopee',
  liveUrl: undefined,
  embedUrl: undefined,
  title: 'Pharmaton T9 - Flash Sale 50%',
  host: 'Lê Thảo Vy',
  viewerCount: 1247,
}

const STAFF: StaffMember[] = [
  { name: 'Lê Thảo Vy',  role: 'Host',    initials: 'VY', tone: 'orange', status: 'live',  checkinTime: '13:55' },
  { name: 'Trần Minh Quân',   role: 'Camera',  initials: 'MQ', tone: 'blue',   status: 'live',  checkinTime: '13:50' },
  { name: 'Phạm Gia Huy',  role: 'Support', initials: 'GH', tone: 'purple', status: 'ready', checkinTime: '14:00' },
  { name: 'Nguyễn Thu Hà',  role: 'Support', initials: 'TH', tone: 'green', status: 'ready', checkinTime: '14:00' },
  { name: 'Đặng Minh Khoa',  role: 'Support', initials: 'MK', tone: 'rose', status: 'ready', checkinTime: '14:00' },
]

const CHECKLIST: ChecklistItem[] = [
  { id: 1, label: 'Setup studio',            done: true,  doneAt: '13:30' },
  { id: 2, label: 'Kiểm tra âm thanh',       done: true,  doneAt: '13:45' },
  { id: 3, label: 'Kiểm tra ánh sáng',       done: true,  doneAt: '14:00' },
  { id: 4, label: 'Kiểm tra setup sản phẩm', done: true,  doneAt: '14:02' },
  { id: 5, label: 'Bắt đầu livestream',      done: true,  doneAt: '14:05' },
  { id: 6, label: 'Theo dõi bình luận',      done: false },
  { id: 7, label: 'Chốt mini game',          done: false },
  { id: 8, label: 'Tổng kết phiên live',     done: false },
]
const CHECKLIST_TOTAL = 8
const CHECKLIST_DONE  = CHECKLIST.filter(c => c.done).length

const NOTES: NoteItem[] = [
  { time: '15:24', author: 'Nguyễn Trung Kiên', content: 'Kiểm tra âm thanh ok' },
  { time: '15:18', author: 'Lê Thảo Vy',          content: 'Khách hỏi về deal combo' },
  { time: '15:10', author: 'Trần Minh Quân',           content: 'Đã setup xong backdrop' },
  { time: '14:55', author: 'Phạm Gia Huy',          content: 'Chuẩn bị sản phẩm xong' },
  { time: '14:30', author: 'Nguyễn Trung Kiên', content: 'Bắt đầu đúng giờ, mọi thứ sẵn sàng' },
]

const ISSUES: IssueItem[] = [
  { id: 1, time: '15:05', reporter: 'Phạm Gia Huy', content: 'Mạng lag nhẹ, đã xử lý', severity: 'warning', resolved: true },
]

const ACTIVITY: ActivityItem[] = [
  { time: '15:24', author: 'Nguyễn Trung Kiên', content: 'Kiểm tra âm thanh ok',       type: 'note'      },
  { time: '15:18', author: 'Trần Minh Quân',           content: 'Đã hoàn thành: Setup light', type: 'checklist' },
  { time: '15:05', author: 'Phạm Gia Huy',          content: 'Mạng lag nhẹ, đã xử lý',     type: 'note'      },
  { time: '14:32', author: 'Nguyễn Trung Kiên', content: 'OK, tiếp tục theo plan!',    type: 'system'    },
]

const LIVE_COMMENTS = [
  { user: 'mai_shopper', text: 'Có ship COD không ạ?',  color: 'text-pink-300'    },
  { user: 'tuan_le99',   text: 'Giá tốt quá chị ơi!',   color: 'text-sky-300'     },
  { user: 'hoa_nguyen',  text: 'Cho em đặt 2 hộp nhé',  color: 'text-emerald-300' },
]

// ── Shared helpers ────────────────────────────────────────────────────────────
function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <a href="#" className={`flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
      {icon}{label}
    </a>
  )
}
function Av({ initials, tone }: { initials: string; tone: AvatarTone }) {
  const c: Record<AvatarTone, string> = {
    orange: 'bg-amber-100 text-amber-700 border-amber-200',
    blue:   'bg-blue-100   text-blue-700   border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    green:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    rose:   'bg-rose-100   text-rose-700   border-rose-200',
  }
  return <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${c[tone]}`}>{initials}</div>
}
function SBadge({ status }: { status: StaffStatus }) {
  if (status === 'live')  return <span className="text-[12px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">Đang live</span>
  if (status === 'ready') return <span className="text-[12px] font-bold bg-blue-100    text-blue-700    px-2 py-0.5 rounded-full border border-blue-200">Sẵn sàng</span>
  return <span className="text-[12px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">Vắng mặt</span>
}
function IR({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[13px] text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-[13px] text-right ${highlight ? 'font-bold text-emerald-700' : 'font-medium text-slate-800'}`}>{value}</span>
    </div>
  )
}
function HR({ icon, label, status, detail }: { icon: React.ReactNode; label: string; status: HealthStatus; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={status === 'ok' ? 'text-emerald-500' : status === 'warning' ? 'text-amber-500' : 'text-red-500'}>{icon}</span>
      <span className="text-[13px] text-slate-700 flex-1">{label}</span>
      {status === 'ok'      && <span className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">OK</span>}
      {status === 'warning' && <span className="text-[12px] font-bold text-amber-600   bg-amber-50   px-1.5 py-0.5 rounded border border-amber-200">{detail ?? 'Warning'}</span>}
      {status === 'error'   && <span className="text-[12px] font-bold text-red-600     bg-red-50     px-1.5 py-0.5 rounded border border-red-200">Lỗi</span>}
    </div>
  )
}
function QA({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="w-full flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:bg-slate-50 text-left transition-colors">
      <span className="text-slate-500">{icon}</span>{label}
    </button>
  )
}
function SHead({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-3">{children}</p>
}

// ── Embed-ready Live Session Preview ─────────────────────────────────────────
/**
 * Architecture hook: in production, when session.embedUrl is populated,
 * replace MockPhonePreview with a provider-specific adapter/iframe.
 * No network calls, SDK, or iframe in this static pass.
 */
function LiveSessionPreview({ session }: { session: LiveSessionPreviewFixture }) {
  // Future: if (session.embedUrl) return <LiveEmbedPlayer session={session} />
  return <MockPhonePreview session={session} />
}

function MockPhonePreview({ session: _session }: { session: LiveSessionPreviewFixture }) {
  return (
    <div
      className="relative w-[260px] flex-shrink-0 rounded-[28px] border-[6px] border-white/10 shadow-xl overflow-hidden bg-black mx-auto"
      style={{ aspectRatio: '9 / 16' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950" />
      <div className="absolute inset-0 flex flex-col justify-between p-3 z-10">

        {/* TOP ROW */}
        <div className="flex items-start justify-between pt-2">
          <div className="flex items-center gap-1.5">
            <span className="bg-red-500 text-white text-[12px] font-black px-2 py-0.5 rounded-sm tracking-wide">LIVE</span>
            <span className="text-white text-[12px] font-semibold bg-black/50 px-2 py-0.5 rounded-full">1,247</span>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400 fill-red-400" />
            <span className="text-white/50 text-[12px]">x</span>
          </div>
        </div>

        {/* HOST ROW */}
        <div className="flex items-center gap-2 -mt-1">
          <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 border-2 border-white/30">VY</div>
          <div>
            <div className="text-white text-[12px] font-bold leading-tight">@le_thao_vy</div>
            <div className="text-white/50 text-[11px] leading-tight">Shopee Live</div>
          </div>
        </div>

        {/* CENTER product area */}
        <div className="flex-1 flex items-center justify-center my-3">
          <div className="w-24 h-24 rounded-xl border border-white/20 bg-white/10 flex flex-col items-center justify-center gap-1.5">
            <ShoppingBag className="w-8 h-8 text-white/60" />
            <span className="text-white/50 text-[11px] text-center leading-tight font-medium">Pharmaton T9</span>
            <span className="text-yellow-300 text-[11px] font-bold">Flash Sale</span>
          </div>
        </div>

        {/* FLOATING hearts */}
        <div className="absolute right-3 bottom-[108px] flex flex-col items-center gap-2">
          <Heart className="w-5 h-5 text-red-400 fill-red-400" />
          <Heart className="w-4 h-4 text-pink-300 fill-pink-300 opacity-60" />
          <Heart className="w-3 h-3 text-rose-300 fill-rose-300 opacity-40" />
        </div>

        {/* COMMENTS */}
        <div className="space-y-1 mb-2">
          {LIVE_COMMENTS.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 bg-black/40 rounded-lg px-2 py-1">
              <span className={`text-[11px] font-bold flex-shrink-0 ${c.color}`}>{c.user}</span>
              <span className="text-white/80 text-[11px] leading-tight line-clamp-1">{c.text}</span>
            </div>
          ))}
        </div>

        {/* PINNED PRODUCT CTA */}
        <div className="bg-red-500/90 rounded-lg px-2.5 py-1.5 flex items-center justify-between mb-1.5">
          <div>
            <div className="text-white text-[11px] font-bold leading-tight">Pharmaton T9 - 3 viên/ngày</div>
            <div className="text-yellow-200 text-[12px] font-black">189.000đ <span className="text-white/50 line-through text-[10px]">380.000đ</span></div>
          </div>
          <span className="text-white text-[11px] font-bold bg-white/20 px-2 py-1 rounded-lg flex-shrink-0">Mua</span>
        </div>

        {/* BOTTOM BAR */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1 flex-1">
            <span className="text-white/40 text-[11px]">Bình luận...</span>
          </div>
          <Heart className="w-4 h-4 text-white/60" />
          <ShoppingBag className="w-4 h-4 text-white/60" />
        </div>

      </div>
    </div>
  )
}

// ── 3-Column Overview ─────────────────────────────────────────────────────────
function OverviewTab() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-[290px_minmax(520px,1fr)_280px] gap-5 items-start">

        {/* LEFT: Context & Actions */}
        <div className="flex flex-col gap-5">
          <section>
            <SHead>Thông tin ca</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 shadow-sm">
              <IR label="Thời gian" value="14:00 - 17:00" />
              <IR label="Nền tảng" value="Shopee Live" />
              <IR label="Studio" value="Studio A, Tầng 3" />
              <IR label="Trạng thái" value="Đang diễn ra" highlight />
            </div>
          </section>

          <section>
            <SHead>Hệ thống</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 shadow-sm">
              <HR icon={<Wifi size={14} />} label="Kết nối mạng" status="ok" />
              <HR icon={<Camera size={14} />} label="Tín hiệu hình ảnh" status="ok" />
              <HR icon={<Mic size={14} />} label="Tín hiệu âm thanh" status="warning" detail="Noise" />
              <HR icon={<Activity size={14} />} label="Đồng bộ sản phẩm" status="ok" />
            </div>
          </section>

          <section>
            <SHead>Hành động nhanh</SHead>
            <div className="space-y-2">
              <QA icon={<Plus size={14} />} label="Thêm ghi chú" />
              <QA icon={<AlertTriangle size={14} />} label="Báo cáo sự cố" />
              <QA icon={<MessageSquare size={14} />} label="Gửi tin nhắn host" />
            </div>
          </section>
        </div>

        {/* CENTER: Live Monitor (The Density Upgrade) */}
        <div className="flex flex-col">
          <SHead>Giám sát phiên Live</SHead>
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[14px] font-bold text-slate-800">LIVE MONITOR</span>
              </div>
            </div>
            {/* The 2-part internal composition */}
            <div className="p-5 flex gap-6">
              <div className="flex-shrink-0">
                <LiveSessionPreview session={LIVE_SESSION} />
              </div>
              <div className="flex-1 flex flex-col gap-5 min-w-0">
                
                {/* Phiên Live */}
                <section>
                  <SHead>Phiên Live</SHead>
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-md border border-slate-100">
                    <h3 className="text-[14px] font-bold text-slate-900 truncate mb-1">{LIVE_SESSION.title}</h3>
                    <p className="text-[13px] text-slate-600">Nền tảng: <span className="font-medium text-slate-900">Shopee Live</span></p>
                    <p className="text-[13px] text-slate-600">Host: <span className="font-medium text-slate-900">{LIVE_SESSION.host}</span></p>
                    <p className="text-[13px] text-slate-600">Người xem: <span className="font-medium text-slate-900">{LIVE_SESSION.viewerCount.toLocaleString()}</span></p>
                    <p className="text-[13px] text-slate-600">Bắt đầu: <span className="font-medium text-slate-900">14:00</span></p>
                    <p className="text-[13px] text-slate-600">Thời gian live: <span className="font-medium text-slate-900 font-mono">01:24:15</span></p>
                  </div>
                </section>

                {/* Nội dung đang chạy */}
                <section>
                  <SHead>Nội dung đang chạy</SHead>
                  <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[13px] text-blue-600 font-bold mb-0.5 uppercase tracking-wide">Flash Sale 50%</p>
                        <p className="text-[14px] font-semibold text-slate-900">Pharmaton T9</p>
                      </div>
                      <span className="text-[13px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">189.000đ</span>
                    </div>
                  </div>
                </section>

                {/* Link phiên live */}
                <section>
                  <SHead>Link phiên live</SHead>
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 border-dashed p-3 rounded-md">
                    <span className="text-[13px] text-slate-500 italic">Chưa kết nối link</span>
                    <button className="text-[13px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"><Link2 size={14}/> Gắn link</button>
                  </div>
                </section>

              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Activity Feed & Summaries */}
        <div className="flex flex-col gap-5">
          <section className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Hoạt động gần đây</p>
              <button className="text-[13px] text-blue-600 font-medium">Xem tất cả</button>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 relative">
              <div className="absolute left-[27px] top-4 bottom-4 w-px bg-slate-100" />
              <div className="space-y-4">
                {ACTIVITY.map((act, i) => (
                  <div key={i} className="flex gap-3 relative z-10">
                    <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {act.type === 'note' && <MessageSquare className="w-3.5 h-3.5 text-blue-500" />}
                      {act.type === 'checklist' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                      {act.type === 'system' && <Activity className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className="text-[13px] font-medium text-slate-900 truncate">{act.author}</span>
                        <span className="text-[12px] text-slate-400 flex-shrink-0 ml-2">{act.time}</span>
                      </div>
                      <p className="text-[13px] text-slate-600 leading-relaxed">{act.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <SHead>Tình trạng kết nối</SHead>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-3">
              <IR label="Internet" value="OK" highlight />
              <IR label="Camera" value="OK" highlight />
              <IR label="Microphone" value="OK" highlight />
              <IR label="Stream" value="Lag nhẹ" />
            </div>
          </section>

          <section>
            <SHead>Tổng quan phiên</SHead>
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 space-y-3">
              <IR label="Nhân sự" value="5/5 staff" />
              <IR label="Checklist" value="5/8 checklist" />
              <IR label="Sự cố" value="1 issue resolved" />
              <IR label="Người xem" value="1,247 viewers" />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── 2-Column Tabs ─────────────────────────────────────────────────────────────
function TwoColumnLayout({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  // Use items-start to prevent vertical stretching of content-driven cards.
  return (
    <div className="p-6 flex gap-6 items-start">
      <div className="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {main}
      </div>
      <div className="w-[320px] flex-shrink-0 flex flex-col gap-6">
        {rail}
      </div>
    </div>
  )
}

// 1. Staff Tab
function StaffTab() {
  return (
    <TwoColumnLayout
      main={
        <div className="p-0">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Danh sách nhân sự ({STAFF.length})</h2>
            <button className="h-7 px-3 rounded text-[13px] font-medium bg-blue-50 text-blue-700 flex items-center gap-1.5"><Plus size={14}/> Thêm nhân sự</button>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-[13px] font-bold text-slate-500 uppercase">Nhân sự</th>
                <th className="px-5 py-3 text-[13px] font-bold text-slate-500 uppercase">Vai trò</th>
                <th className="px-5 py-3 text-[13px] font-bold text-slate-500 uppercase">Check-in</th>
                <th className="px-5 py-3 text-[13px] font-bold text-slate-500 uppercase text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {STAFF.map((s, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Av initials={s.initials} tone={s.tone} />
                      <span className="text-[14px] font-medium text-slate-900">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[14px] text-slate-600">{s.role}</td>
                  <td className="px-5 py-3 text-[13px] text-slate-500 font-mono">{s.checkinTime}</td>
                  <td className="px-5 py-3 text-right"><SBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      rail={
        <>
          <section>
            <SHead>Thống kê điểm danh</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <div className="text-[24px] font-bold text-slate-900 leading-none mb-1">5/5</div>
                  <div className="text-[13px] text-slate-500">Đã check-in</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-4 h-4 text-emerald-600"/></div>
              </div>
              <div className="space-y-2">
                <IR label="Host" value="1/1" />
                <IR label="Camera" value="1/1" />
                <IR label="Support" value="3/3" />
              </div>
            </div>
          </section>

          <section>
            <SHead>Trạng thái live</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
               <IR label="Đang live" value="2" />
               <IR label="Sẵn sàng" value="3" />
            </div>
          </section>
        </>
      }
    />
  )
}

// 2. Notes Tab
function NotesTab() {
  return (
    <TwoColumnLayout
      main={
        <div className="flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Ghi chú ({NOTES.length})</h2>
            <button className="h-7 px-3 rounded text-[13px] font-medium bg-blue-50 text-blue-700 flex items-center gap-1.5"><Plus size={14}/> Thêm ghi chú</button>
          </div>
          <div className="p-5 space-y-4">
            {NOTES.map((n, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50/50">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-[12px] flex items-center justify-center flex-shrink-0">
                  {n.author.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[14px] font-semibold text-slate-900">{n.author}</span>
                    <span className="text-[13px] text-slate-400">{n.time}</span>
                  </div>
                  <p className="text-[14px] text-slate-700 leading-relaxed">{n.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      }
      rail={
        <>
          <section>
            <SHead>Tổng quan ghi chú</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
               <IR label="Tổng số" value="5 ghi chú" />
               <IR label="Gần nhất" value="15:24" />
               <IR label="Người cập nhật" value="Nguyễn Trung Kiên" />
            </div>
          </section>

          <section>
            <SHead>Phân loại ghi chú</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
               <IR label="Kỹ thuật & Setup" value="2" />
               <IR label="Nội dung Live" value="2" />
               <IR label="Chung" value="1" />
            </div>
          </section>
        </>
      }
    />
  )
}

// 3. Issues Tab
function IssuesTab() {
  return (
    <TwoColumnLayout
      main={
        <div className="flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Sự cố ({ISSUES.length})</h2>
            <button className="h-7 px-3 rounded text-[13px] font-medium bg-red-50 text-red-700 flex items-center gap-1.5"><AlertTriangle size={14}/> Báo cáo sự cố</button>
          </div>
          <div className="p-5 space-y-4">
            {ISSUES.map(iss => (
              <div key={iss.id} className="flex gap-4 p-4 rounded-lg border border-amber-200 bg-amber-50">
                <div className="mt-0.5"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[14px] font-bold text-amber-900">{iss.content}</span>
                    <span className="text-[13px] text-amber-700 bg-amber-200/50 px-2 py-0.5 rounded-full font-medium">Đã xử lý</span>
                  </div>
                  <div className="text-[13px] text-amber-700/80 flex items-center gap-2">
                    <span>Bởi {iss.reporter}</span>
                    <span>•</span>
                    <span>{iss.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      }
      rail={
        <>
          <section>
            <SHead>Tổng quan sự cố</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
               <IR label="Đang mở" value="0" />
               <IR label="Đã giải quyết" value="1" />
               <div className="pt-2 border-t border-slate-100 mt-2">
                 <IR label="Mức độ nghiêm trọng" value="0 Critical / 1 Warning" />
               </div>
            </div>
          </section>

          <section>
            <SHead>Tình trạng kết nối</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm space-y-3">
              <IR label="Internet" value="OK" highlight />
              <IR label="Camera" value="OK" highlight />
              <IR label="Microphone" value="OK" highlight />
              <IR label="Stream" value="Lag nhẹ" />
            </div>
          </section>
        </>
      }
    />
  )
}

// 4. Checklist Tab
function ChecklistTab() {
  return (
    <TwoColumnLayout
      main={
        <div className="flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Checklist vận hành</h2>
            <span className="text-[13px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">{CHECKLIST_DONE}/{CHECKLIST_TOTAL} Hoàn thành</span>
          </div>
          <div className="p-5">
            <div className="space-y-1">
              {CHECKLIST.map(c => (
                <label key={c.id} className="flex items-center gap-3 p-3 rounded hover:bg-slate-50 cursor-pointer group transition-colors">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${c.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 group-hover:border-blue-500'}`}>
                    {c.done && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className={`text-[14px] flex-1 ${c.done ? 'text-slate-500 line-through' : 'text-slate-700 font-medium'}`}>{c.label}</span>
                  {c.doneAt && <span className="text-[13px] text-slate-400 font-mono">{c.doneAt}</span>}
                </label>
              ))}
            </div>
          </div>
        </div>
      }
      rail={
        <>
          <section>
            <SHead>Tiến độ</SHead>
            <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-slate-700">Hoàn thành</span>
                <span className="text-[13px] font-bold text-emerald-600">{Math.round((CHECKLIST_DONE/CHECKLIST_TOTAL)*100)}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4">
                <div className="bg-emerald-500 h-full" style={{ width: `${(CHECKLIST_DONE/CHECKLIST_TOTAL)*100}%` }} />
              </div>
              <div className="space-y-2">
                <IR label="Hoàn thành" value={CHECKLIST_DONE.toString()} />
                <IR label="Còn lại" value={(CHECKLIST_TOTAL - CHECKLIST_DONE).toString()} />
              </div>
            </div>
          </section>
        </>
      }
    />
  )
}

// ── Root Export ───────────────────────────────────────────────────────────────
export function LiveOperationsReferenceMock() {
  const [activeTab, setActiveTab] = useState<LiveTab>('overview')

  const TABS: { id: LiveTab; label: string; count?: number }[] = [
    { id: 'overview',  label: 'Tổng quan' },
    { id: 'staff',     label: 'Nhân sự',   count: STAFF.length },
    { id: 'notes',     label: 'Ghi chú',   count: NOTES.length },
    { id: 'issues',    label: 'Sự cố',     count: ISSUES.length },
    { id: 'checklist', label: 'Checklist', count: CHECKLIST_TOTAL },
  ]

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] overflow-hidden font-sans text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-[248px] bg-[#082743] text-white flex flex-col flex-shrink-0 z-20">
        <div className="h-[56px] flex items-center px-4 font-bold text-lg tracking-tight border-b border-white/10">
          <div className="w-6 h-6 bg-blue-600 rounded mr-2 flex items-center justify-center">
            <div className="w-2 h-3 bg-white rounded-sm" />
          </div>
          LiveStream Ops
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 mt-2">
          <NavItem icon={<LayoutGrid size={18} />}     label="My Workspace" />
          <NavItem icon={<Briefcase size={18} />}      label="My Schedule"  />
          <NavItem icon={<Clock3 size={18} />}         label="Calendar"     />
          <NavItem icon={<Clock3 size={18} />}         label="Shifts"       />
          <NavItem icon={<Users size={18} />}          label="Staffing"     />
          <NavItem icon={<ArrowLeftRight size={18} />} label="My Swaps"     />
          <NavItem icon={<CheckCircle2 size={18} />}   label="Approvals"    />
          <NavItem icon={<MonitorPlay size={18} />}    label="Live" active  />
          <NavItem icon={<BarChart2 size={18} />}      label="Reports"      />
          <NavItem icon={<Bell size={18} />}           label="Notifications"/>
        </div>
        <div className="p-4 border-t border-white/10 flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[12px] font-bold text-slate-700 flex-shrink-0">NK</span>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">Nguyễn Trung Kiên</span>
            <span className="text-xs text-slate-400 truncate">Member</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOPBAR */}
        <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[14px] text-slate-500">
            <span className="font-medium cursor-pointer hover:text-blue-600">Live</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-900 font-semibold">Pharmaton T9</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-slate-500"><Bell className="w-5 h-5" /></button>
            <span className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[12px] font-bold text-slate-700">NK</span>
          </div>
        </header>

        {/* SHIFT BANNER */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-[18px] font-bold text-slate-900">Pharmaton T9 - 10/09/2026</h1>
              <span className="flex items-center gap-1 bg-emerald-500 text-white text-[13px] font-bold px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />LIVE
              </span>
              <span className="text-[14px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">01:24:15</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-4 rounded-md border border-amber-300 bg-amber-50 text-amber-700 text-[13px] font-semibold flex items-center gap-1.5">
                <Pause className="w-3.5 h-3.5" /> Tạm dừng
              </button>
              <button className="h-8 px-4 rounded-md bg-red-500 text-white text-[13px] font-semibold flex items-center gap-1.5 shadow-sm">
                <Square className="w-3.5 h-3.5 fill-white" /> Kết thúc ca
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-[13px] text-slate-500">
            <span>Studio A</span>
            <span>14:00-17:00</span>
            <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />5/5 staff</span>
            <span>Shopee Live</span>
          </div>
        </div>

        {/* TABS */}
        <div className="bg-white border-b border-slate-200 px-6 flex-shrink-0">
          <div className="flex items-center">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-[14px] font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          {activeTab === 'overview'  && <OverviewTab  />}
          {activeTab === 'staff'     && <StaffTab     />}
          {activeTab === 'notes'     && <NotesTab     />}
          {activeTab === 'issues'    && <IssuesTab    />}
          {activeTab === 'checklist' && <ChecklistTab />}
        </div>
      </main>
    </div>
  )
}
