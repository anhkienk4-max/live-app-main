import React from 'react'
import {
  Radio, Users, Calendar, FileText, ShieldAlert, AlertTriangle,
  Clock, CheckCircle, Eye, TrendingUp, TrendingDown,
} from 'lucide-react'

// View-Model

export type LiveHealthStatus = 'good' | 'warning' | 'critical' | 'unknown'
export type StatusColor = 'green' | 'orange' | 'red' | 'slate'

export interface LiveShiftItem {
  brand: string
  platform: string
  duration: string | null
  viewers: string | null
  health: LiveHealthStatus
}

export interface OperationRowItem {
  brand: string
  shiftTime: string
  platform: string
  status: string
  statusColor: StatusColor
  metrics: string
  manager: string
}

export interface AttentionItem {
  key: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  context: string
  time: string
  action: string
}

export interface PerformanceData {
  viewers: string
  viewersChange: string
  viewersChangePositive: boolean
  revenue: string
  revenueChange: string
  revenueChangePositive: boolean
  conversionRate: string
  conversionChange: string
  conversionChangePositive: boolean
}

export interface ActivityLogEntry {
  iconName: 'check' | 'alert' | 'user' | 'file'
  iconBg: string
  title: string
  user: string
  time: string
}

export interface AdminDashboardViewModel {
  liveCount: number
  todaysShiftsCount: number
  missingStaffCount: number | null
  pendingCount: number
  dqAttention: AttentionItem[]
  liveShifts: LiveShiftItem[]
  todaysOperations: OperationRowItem[]
  performance: PerformanceData | null
  activityLog: ActivityLogEntry[] | null
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
          <span className="text-[32px] font-bold text-slate-900 leading-[1] tracking-tight">{value}</span>
        </div>
      </div>
      <span className="text-[13px] text-slate-500 font-medium">{subtitle}</span>
    </div>
  )
}

interface AttentionRowProps { severity: AttentionItem['severity']; title: string; context: string; time: string; action: string }
function AttentionRow({ severity, title, context, time, action }: AttentionRowProps) {
  const map: Record<AttentionItem['severity'], { icon: React.ReactNode; bg: string; border: string }> = {
    critical: { icon: <ShieldAlert className="w-5 h-5 text-red-600" />, bg: 'bg-red-50', border: 'border-red-100' },
    high:     { icon: <AlertTriangle className="w-5 h-5 text-orange-500" />, bg: 'bg-orange-50', border: 'border-orange-100' },
    medium:   { icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50', border: 'border-amber-100' },
    low:      { icon: <CheckCircle className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50', border: 'border-blue-100' },
  }
  const s = map[severity]
  return (
    <div className={`flex items-center justify-between px-4 py-3.5 rounded-lg border hover:border-slate-300 hover:bg-slate-50 transition-colors ${severity === 'critical' ? 'bg-red-50/30 border-red-100' : 'border-transparent'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${s.bg} ${s.border}`}>{s.icon}</div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-slate-900 leading-snug mb-0.5">{title}</span>
          <span className="text-[13px] text-slate-600 leading-snug">{context}</span>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <span className={`text-[12px] font-bold whitespace-nowrap ${severity === 'critical' ? 'text-red-500' : 'text-slate-500'}`}>{time}</span>
        <button className={`px-4 py-1.5 border hover:bg-slate-50 text-[12px] font-bold rounded-md shadow-sm shrink-0 transition-colors ${severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white border-slate-300 text-slate-700'}`}>{action}</button>
      </div>
    </div>
  )
}

interface LiveItemProps { brand: string; platform: string; duration: string | null; viewers: string | null; health: LiveHealthStatus }
function LiveItem({ brand, platform, duration, viewers, health }: LiveItemProps) {
  const dot: Record<LiveHealthStatus, string> = {
    good:    'bg-emerald-500 border-emerald-600',
    warning: 'bg-amber-500 border-amber-600',
    critical:'bg-red-500 border-red-600',
    unknown: 'bg-slate-400 border-slate-500',
  }
  return (
    <div className="flex items-center justify-between p-3.5 border border-slate-200 rounded-lg bg-white shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700 shadow-inner">
          <span className="font-bold text-[14px]">{brand.charAt(0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-slate-900">{brand}</span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase">{platform}</span>
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold">
            <span className="text-red-600 flex items-center gap-1.5 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span> LIVE {duration ?? ''}
            </span>
            <span className="text-slate-600 flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-slate-400" /> {viewers ?? '—'}</span>
          </div>
        </div>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full shadow-sm border ${dot[health]}`} title={health}></div>
    </div>
  )
}

interface OperationRowProps { brand: string; shiftTime: string; platform: string; status: string; statusColor: StatusColor; metrics: string; manager: string }
function OperationRowItem({ brand, shiftTime, platform, status, statusColor, metrics, manager }: OperationRowProps) {
  const pill: Record<StatusColor, string> = {
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:    'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-amber-50 text-amber-700 border-amber-200',
    slate:  'bg-slate-50 text-slate-700 border-slate-200',
  }
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-5 py-3.5 text-[13px] font-bold text-slate-900 whitespace-nowrap">{brand}</td>
      <td className="px-5 py-3.5 text-[13px] font-medium text-slate-700 whitespace-nowrap">{shiftTime}</td>
      <td className="px-5 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">{platform}</td>
      <td className="px-5 py-3.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-md border ${pill[statusColor]}`}>
          {statusColor === 'red' && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse mr-1.5"></span>}
          {status}
        </span>
      </td>
      <td className="px-5 py-3.5 text-[13px] font-bold text-slate-900 whitespace-nowrap">{metrics}</td>
      <td className="px-5 py-3.5 text-[13px] font-medium text-slate-700">{manager}</td>
    </tr>
  )
}

interface PerfMetricProps { title: string; value: string; change: string; positive: boolean; icon: React.ReactNode }
function PerfMetric({ title, value, change, positive, icon }: PerfMetricProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[13px] font-semibold text-slate-500 mb-1">{title}</span>
      <span className="text-[26px] font-bold text-slate-900 tracking-tight leading-none mb-2">{value}</span>
      <div className="flex items-center gap-1.5 text-[12px] font-bold">
        {icon}
        <span className={positive ? 'text-emerald-600' : 'text-red-500'}>{change}</span>
        <span className="font-medium text-slate-400">vs hôm qua</span>
      </div>
    </div>
  )
}

interface ActLogRowProps { iconName: ActivityLogEntry['iconName']; iconBg: string; title: string; user: string; time: string }
function ActLogRow({ iconName, iconBg, title, user, time }: ActLogRowProps) {
  const icons: Record<ActivityLogEntry['iconName'], React.ReactNode> = {
    check: <CheckCircle className="w-4 h-4 text-emerald-600" />,
    alert: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    user:  <Users className="w-4 h-4 text-blue-500" />,
    file:  <FileText className="w-4 h-4 text-purple-500" />,
  }
  return (
    <div className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors rounded-lg">
      <div className="flex items-start gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-slate-100 ${iconBg} mt-0.5 shadow-sm`}>{icons[iconName]}</div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-slate-900 leading-tight">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-indigo-600">{user}</span>
            <span className="text-[12px] text-slate-300">·</span>
            <span className="text-[12px] text-slate-500 font-medium">{time}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Main export

export function AdminDashboardView({
  liveCount, todaysShiftsCount, missingStaffCount, pendingCount,
  dqAttention, liveShifts, todaysOperations, performance, activityLog,
}: AdminDashboardViewModel) {
  return (
    <main className="p-8 flex flex-col gap-6 overflow-y-auto">
      <div className="flex flex-col gap-1 mb-1">
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight">Operations Dashboard</h1>
        <p className="text-[14px] text-slate-500 font-medium">Real-time operations overview and team performance</p>
      </div>

      <div className="grid grid-cols-4 gap-5">
        <KpiCard icon={<Radio className="w-5 h-5 text-red-600" />} iconBg="bg-red-50" title="LIVE NOW" value={liveCount.toString()} subtitle="Active sessions" />
        <KpiCard icon={<Calendar className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-50" title="TODAY'S SHIFTS" value={todaysShiftsCount.toString()} subtitle="Scheduled today" />
        <KpiCard icon={<Users className="w-5 h-5 text-amber-500" />} iconBg="bg-amber-50" title="MISSING STAFF" value={missingStaffCount !== null ? missingStaffCount.toString() : '—'} subtitle="Needs resolution" />
        <KpiCard icon={<FileText className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-50" title="PENDING" value={pendingCount.toString()} subtitle="Need review" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Operational Attention</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-2">
            <div className="flex flex-col divide-y divide-slate-50 flex-1 justify-center">
              {dqAttention.length > 0 ? dqAttention.map((item) => (
                <AttentionRow key={item.key} severity={item.severity} title={item.title} context={item.context} time={item.time} action={item.action} />
              )) : (
                <div className="text-center py-8 text-sm text-slate-500">Không có mục cần chú ý</div>
              )}
            </div>
          </div>
        </div>
        <div className="col-span-4 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Live Now</h2>
          <div className="flex flex-col gap-3 flex-1">
            {liveShifts.length > 0 ? liveShifts.map((item, i) => (
              <LiveItem key={i} brand={item.brand} platform={item.platform} duration={item.duration} viewers={item.viewers} health={item.health} />
            )) : (
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 text-center text-sm text-slate-500 flex-1 flex items-center justify-center">Không có ca đang live</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        <h2 className="text-[16px] font-bold text-slate-900 mb-3">{"Today's Operations"}</h2>
        <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm overflow-hidden">
          {todaysOperations.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Brand</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Thời gian</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Platform</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chỉ số</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quản lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {todaysOperations.map((op, i) => (
                  <OperationRowItem key={i} brand={op.brand} shiftTime={op.shiftTime} platform={op.platform} status={op.status} statusColor={op.statusColor} metrics={op.metrics} manager={op.manager} />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Không có ca làm việc hôm nay</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 pb-6">
        <div className="col-span-5 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Performance</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex-1">
            {performance !== null ? (
              <div className="grid grid-cols-3 gap-4 h-full">
                <PerfMetric title="Lượt xem" value={performance.viewers} change={performance.viewersChange} positive={performance.viewersChangePositive} icon={performance.viewersChangePositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
                <PerfMetric title="Doanh thu" value={performance.revenue} change={performance.revenueChange} positive={performance.revenueChangePositive} icon={performance.revenueChangePositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
                <PerfMetric title="Tỷ lệ chuyển đổi" value={performance.conversionRate} change={performance.conversionChange} positive={performance.conversionChangePositive} icon={performance.conversionChangePositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />} />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">Dữ liệu chưa khả dụng</div>
            )}
          </div>
        </div>
        <div className="col-span-7 flex flex-col">
          <h2 className="text-[16px] font-bold text-slate-900 mb-3">Activity Log</h2>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-2">
            <div className="flex flex-col divide-y divide-slate-50 flex-1 justify-center">
              {activityLog === null ? (
                <div className="text-center py-8 text-sm text-slate-500">Dữ liệu chưa khả dụng</div>
              ) : activityLog.length > 0 ? activityLog.map((log, i) => (
                <ActLogRow key={i} iconName={log.iconName} iconBg={log.iconBg} title={log.title} user={log.user} time={log.time} />
              )) : (
                <div className="text-center py-8 text-sm text-slate-500">Không có hoạt động gần đây</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
