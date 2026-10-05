import React from 'react'
import {
  Radio, Users, Calendar, FileText, ArrowRight, CheckCircle,
  AlertTriangle, Clock, ArrowLeftRight, FolderCheck, ArrowUp,
} from 'lucide-react'

// View-Model

export type ScheduleStatusColor = 'blue' | 'green' | 'orange' | 'red' | 'slate'

export interface ScheduleItem {
  time: string
  brand: string
  platform: string
  status: string
  statusColor: ScheduleStatusColor
  /** null = staffing truth unavailable */
  staffing: string | null
}

export interface DecisionItem {
  key: string
  type: 'registration' | 'swap' | 'report' | 'dq'
  title: string
  subtitle: string
  time: string
  action: string
  iconBg: string
}

export interface UpcomingLiveItem {
  brand: string
  /** null = campaign data unavailable */
  campaign: string | null
  title: string
  timing: string
  host: string
  support: string
  technical: string
}

export interface StaffingHealthData {
  label: string
  filled: number
  total: number
  pct: number
}

export interface LeaderDashboardViewModel {
  liveCount: number
  todaysShiftsCount: number
  /** null = unavailable */
  missingStaffCount: number | null
  pendingCount: number
  /** null = source unavailable; [] = loaded, verified empty */
  decisions: DecisionItem[] | null
  todaysSchedule: ScheduleItem[]
  /** null = no authoritative staffing capacity data */
  staffingHealth: StaffingHealthData | null
  /** null = no upcoming live shift */
  upcomingLive: UpcomingLiveItem | null
  /** null = source unavailable; [] = loaded, verified empty */
  activityLog: ActivityEntry[] | null
}

export interface ActivityEntry {
  iconBg: string
  title: string
  subtitle: string
  time: string
}

// Sub-components

interface KpiCardProps { icon: React.ReactNode; iconBg: string; title: string; value: string; subtitle: string }
function KpiCard({ icon, iconBg, title, value, subtitle }: KpiCardProps) {
  return (
    <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex flex-col justify-center">
      <div className="flex items-center gap-4 mb-3">
        <div className={`w-[48px] h-[48px] rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <div className="flex flex-col justify-center">
          <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{title}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold text-slate-900 leading-[1] tracking-tight">{value}</span>
            <span className="text-[13px] text-slate-500 font-medium">{subtitle}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ScheduleRowProps { time: string; brand: string; platform: string; status: string; statusColor: ScheduleStatusColor; staffing: string | null }
function ScheduleRow({ time, brand, platform, status, statusColor, staffing }: ScheduleRowProps) {
  const pill: Record<ScheduleStatusColor, string> = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    orange: 'bg-amber-50 text-amber-700 border-amber-200',
    red:    'bg-red-50 text-red-700 border-red-200',
    slate:  'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-5 py-3 text-[13px] font-medium text-slate-900 whitespace-nowrap">{time}</td>
      <td className="px-5 py-3 text-[13px] text-slate-600 whitespace-nowrap">{brand}</td>
      <td className="px-5 py-3 text-[13px] text-slate-600 whitespace-nowrap">{platform}</td>
      <td className="px-5 py-3 whitespace-nowrap">
        <span className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-md border ${pill[statusColor]}`}>{status}</span>
      </td>
      <td className="px-5 py-3 text-[13px] text-slate-600">{staffing ?? '—'}</td>
      <td className="px-5 py-3 text-[13px] whitespace-nowrap">
        <a href="#" className="font-semibold text-blue-600 hover:underline">Xem chi tiết</a>
      </td>
    </tr>
  )
}

interface DecisionRowProps { type: DecisionItem['type']; title: string; subtitle: string; time: string; action: string; iconBg: string }
function DecisionRow({ type, title, subtitle, time, action, iconBg }: DecisionRowProps) {
  const icons: Record<DecisionItem['type'], React.ReactNode> = {
    registration: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    swap:         <ArrowLeftRight className="w-4 h-4 text-amber-500" />,
    report:       <FileText className="w-4 h-4 text-blue-500" />,
    dq:           <AlertTriangle className="w-4 h-4 text-red-500" />,
  }
  return (
    <div className="flex items-center justify-between px-3 py-3 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>{icons[type]}</div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-slate-900 leading-snug">{title}</span>
          <span className="text-[12px] text-slate-500 leading-snug mt-0.5">{subtitle}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[12px] font-medium text-red-500 whitespace-nowrap">{time}</span>
        <button className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[12px] font-bold rounded-md shadow-sm shrink-0 transition-colors">{action}</button>
      </div>
    </div>
  )
}

// Main export

export function LeaderDashboardView({
  liveCount, todaysShiftsCount, missingStaffCount, pendingCount,
  decisions, todaysSchedule, staffingHealth, upcomingLive, activityLog,
}: LeaderDashboardViewModel) {
  return (
    <main className="p-8 flex flex-col gap-6 overflow-y-auto">
      <div className="flex items-start justify-between mb-1">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight">Leader Dashboard</h1>
          <p className="text-[14px] text-slate-500 font-medium">Team schedule, staffing and action queue</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-[13px] font-bold text-slate-700 rounded-lg shadow-sm transition-colors">
          <FolderCheck className="w-4 h-4" />
          Review Attention
        </button>
      </div>

      {/* ROW 1: KPIs */}
      <div className="grid grid-cols-4 gap-5">
        <KpiCard icon={<Calendar className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-50" title="TEAM SHIFTS" value={todaysShiftsCount.toString()} subtitle="Today" />
        <KpiCard icon={<Radio className="w-5 h-5 text-red-600" />} iconBg="bg-red-50" title="LIVE" value={liveCount.toString()} subtitle="Active now" />
        <KpiCard icon={<Users className="w-5 h-5 text-amber-500" />} iconBg="bg-amber-50" title="MISSING STAFF" value={missingStaffCount !== null ? missingStaffCount.toString() : '—'} subtitle="Resolve today" />
        <KpiCard icon={<FileText className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-50" title="PENDING" value={pendingCount.toString()} subtitle="Need review" />
      </div>

      {/* ROW 2: SCHEDULE (7/12) + DECISIONS (5/12) */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[16px] font-bold text-slate-900">{"Today's Team Schedule"}</h2>
            <a href="#" className="text-[13px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
              Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
            {todaysSchedule.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Giờ</th>
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Brand</th>
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Platform</th>
              <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Nhân sự</th>
                    <th className="px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {todaysSchedule.map((s, i) => (
                    <ScheduleRow key={i} time={s.time} brand={s.brand} platform={s.platform} status={s.status} statusColor={s.statusColor} staffing={s.staffing} />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Không có ca nào hôm nay</div>
            )}
          </div>
        </div>

        <div className="col-span-5 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Decision Queue</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-2">
            {decisions === null ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Dữ liệu chưa khả dụng</div>
            ) : decisions.length > 0 ? (
              <div className="flex flex-col divide-y divide-slate-50 flex-1">
                {decisions.map((d) => (
                  <DecisionRow key={d.key} type={d.type} title={d.title} subtitle={d.subtitle} time={d.time} action={d.action} iconBg={d.iconBg} />
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Không có quyết định chờ xử lý</div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: UPCOMING LIVE + STAFFING HEALTH */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Upcoming Live</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex-1">
            {upcomingLive ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 rounded border border-indigo-100">
                    {upcomingLive.campaign ?? 'Livestream'}
                  </span>
                </div>
                <div>
                  <h3 className="text-[20px] font-bold text-slate-900">{upcomingLive.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-[13px] text-slate-600">{upcomingLive.timing}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {[{ role: 'Host', name: upcomingLive.host }, { role: 'Support', name: upcomingLive.support }, { role: 'Technical', name: upcomingLive.technical }].map(({ role, name }) => (
                    <div key={role} className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-[11px] font-bold text-slate-500 uppercase">{role}</span>
                      <span className="text-[14px] font-bold text-slate-900 mt-0.5">{name || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">Không có ca sắp tới</div>
            )}
          </div>
        </div>

        <div className="col-span-5 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Staffing Health</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex-1">
            {staffingHealth ? (
              <div className="flex flex-col gap-3 h-full justify-center">
                <div className="flex justify-between items-baseline">
                  <span className="text-[14px] font-semibold text-slate-700">{staffingHealth.label}</span>
                  <span className="text-[24px] font-bold text-slate-900">{staffingHealth.filled} <span className="text-[14px] text-slate-500">/ {staffingHealth.total}</span></span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${staffingHealth.pct >= 80 ? 'bg-emerald-500' : staffingHealth.pct >= 60 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.min(staffingHealth.pct, 100)}%` }}></div>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUp className="w-4 h-4 text-slate-500" />
                  <span className="text-[13px] font-bold text-slate-900">{staffingHealth.pct}%</span>
                  <span className="text-[13px] text-slate-500">đã được phân công</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">Dữ liệu chưa khả dụng</div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 4: ACTIVITY LOG */}
      <div className="flex flex-col pb-6">
        <h2 className="text-[16px] font-bold text-slate-900 mb-3">Activity Log</h2>
        <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-2">
          {activityLog === null ? (
            <div className="text-center py-8 text-sm text-slate-500">Dữ liệu chưa khả dụng</div>
          ) : activityLog.length > 0 ? (
            <div className="flex flex-col divide-y divide-slate-50">
              {activityLog.map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors rounded-lg">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${entry.iconBg}`}>
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-slate-900">{entry.title}</span>
                      <span className="text-[13px] text-slate-600">{entry.subtitle}</span>
                    </div>
                  </div>
                  <span className="text-[12px] font-medium text-slate-500 shrink-0">{entry.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-slate-500">Không có hoạt động gần đây</div>
          )}
        </div>
      </div>
    </main>
  )
}
