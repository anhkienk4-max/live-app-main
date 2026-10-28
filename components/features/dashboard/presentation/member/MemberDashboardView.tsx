import React from 'react'
import { OpsMobileHome } from '../OpsMobileHome'
import {
  Calendar, CheckCircle, Clock, MapPin, ArrowRight,
  ArrowLeftRight, FileText, AlertTriangle,
} from 'lucide-react'

// View-Model

export interface NextShiftData {
  /** null = cannot compute countdown reliably */
  startsIn: string | null
  brand: string
  platform: string
  /** Formatted date+time string */
  time: string
  role: string
  /** null = location data unavailable */
  location: string | null
}

export interface ScheduleEntry {
  date: string
  onView?: () => void
  time: string
  brand: string
  platform: string
  role: string
}

export interface ActionEntry {
  type: 'report' | 'swap' | 'warning'
  title: string
  time: string
  description: string
}

export interface OpenShiftEntry {
  brand: string
  time: string
  platform: string
  role: string
}

export interface RequestEntry {
  type: 'swap' | 'registration'
  title: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface NotificationEntry {
  title: string
  time: string
  unread: boolean
}

export interface MemberDashboardViewModel {
  nextShift: NextShiftData | null
  onOpenNextShift?: () => void
  mySchedule: ScheduleEntry[]
  /** null = source unavailable; [] = loaded, verified empty */
  myActions: ActionEntry[] | null
  /** null = source unavailable; [] = loaded, verified empty */
  openShifts: OpenShiftEntry[] | null
  /** null = source unavailable; [] = loaded, verified empty */
  myRequests: RequestEntry[] | null
  /** null = source unavailable; [] = loaded, verified empty */
  notifications: NotificationEntry[] | null
  userName?: string
}

// Sub-components

interface ScheduleItemProps { onView?: () => void; date: string; time: string; brand: string; platform: string; role: string }
function ScheduleItem({ date, time, brand, platform, role, onView }: ScheduleItemProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors bg-slate-50/50">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center font-bold text-[13px] text-slate-700">
          {brand.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-[14px] text-slate-900">{brand}</span>
          <span className="text-[12px] text-slate-500">{date} · {time} · {platform}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-sm">{role}</span>
        <button type="button" aria-label="Xem chi tiết ca" disabled={!onView} onClick={onView} className="text-slate-400 hover:text-indigo-600"><ArrowRight className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

interface ActionCardProps { type: ActionEntry['type']; title: string; time: string; description: string }
function ActionCard({ type, title, time, description }: ActionCardProps) {
  const isWarning = type === 'warning'
  const isSwap = type === 'swap'
  return (
    <div className={`p-3.5 rounded-lg border flex flex-col gap-2 ${isWarning ? 'bg-red-50/50 border-red-100' : isSwap ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isWarning ? <AlertTriangle className="w-4 h-4 text-red-500" /> : isSwap ? <ArrowLeftRight className="w-4 h-4 text-amber-500" /> : <FileText className="w-4 h-4 text-blue-500" />}
          <span className="font-bold text-[13px] text-slate-900">{title}</span>
        </div>
        <span className="text-[11px] font-medium text-slate-500">{time}</span>
      </div>
      <p className="text-[12px] text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

interface OpenShiftItemProps { brand: string; time: string; platform: string; role: string }
function OpenShiftItem({ brand, time, platform, role }: OpenShiftItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors group cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
          <Calendar className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-[13px] text-slate-900 group-hover:text-indigo-700 transition-colors">{brand}</span>
          <span className="text-[11px] text-slate-500">{time} · {platform}</span>
        </div>
      </div>
      <a href="/calendar?tab=open" className="inline-flex min-h-11 items-center text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors">
        Đăng ký {role}
      </a>
    </div>
  )
}

interface RequestItemProps { type: RequestEntry['type']; title: string; status: RequestEntry['status'] }
function RequestItem({ type, title, status }: RequestItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${type === 'swap' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'}`}>
          {type === 'swap' ? <ArrowLeftRight className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
        </div>
        <span className="font-semibold text-[13px] text-slate-800">{title}</span>
      </div>
      <span className={`text-[11px] font-bold px-2 py-1 rounded uppercase tracking-wider ${status === 'approved' ? 'text-emerald-700 bg-emerald-50' : status === 'pending' ? 'text-amber-700 bg-amber-50' : 'text-slate-500 bg-slate-100'}`}>
        {status}
      </span>
    </div>
  )
}

interface NotificationItemProps { title: string; time: string; unread: boolean }
function NotificationItem({ title, time, unread }: NotificationItemProps) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${unread ? 'bg-indigo-50/50 border border-indigo-100' : 'border border-transparent'}`}>
      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${unread ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
      <div className="flex flex-col">
        <span className={`text-[13px] ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{title}</span>
        <span className="text-[11px] text-slate-500 mt-0.5">{time}</span>
      </div>
    </div>
  )
}

// Main export

export function MemberDashboardView({
  nextShift, onOpenNextShift, mySchedule, myActions, openShifts, myRequests, notifications, userName,
}: MemberDashboardViewModel) {
  const attention = myActions?.map((item, index) => ({
    key: item.type + index, title: item.title, description: item.description,
    href: item.type === 'swap' ? '/swaps' : item.type === 'report' ? '/reports' : '/data-quality',
    level: item.type === 'warning' ? 'critical' as const : 'info' as const,
  })) ?? null
  return (
    <>
    <OpsMobileHome
      role="member" userName={userName} shiftCount={mySchedule.length} shiftLabel="Ca trong lịch của tôi"
      liveCount={0} pendingCount={myRequests === null ? null : myRequests.filter(item => item.status === 'pending').length}
      attention={attention} shift={nextShift ? { key: nextShift.brand + nextShift.time, brand: nextShift.brand, platform: nextShift.platform, time: nextShift.time, status: nextShift.role, onView: onOpenNextShift } : null}
    />
    <main className="hidden min-w-0 flex-col gap-6 overflow-y-auto p-4 md:flex sm:p-8">
      <div className="flex flex-col gap-1 mb-1">
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight">My Workspace</h1>
        <p className="text-[14px] text-slate-500 font-medium">Welcome back! Ready for your upcoming shifts today?</p>
      </div>

      {/* NEXT SHIFT — 12/12 */}
      <div className="w-full bg-white rounded-[16px] border border-slate-200 shadow-sm p-4 sm:p-6 flex flex-col gap-4 lg:flex-row lg:gap-0 items-stretch min-h-[170px] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>
        {nextShift ? (
          <>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 rounded border border-indigo-100">Next Shift</span>
                {nextShift.startsIn && (
                  <span className="flex items-center gap-1.5 text-[12px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                    <Clock className="w-3.5 h-3.5" /> {nextShift.startsIn}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <div className="w-12 h-12 shrink-0 sm:w-[72px] sm:h-[72px] rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[22px] font-bold text-slate-700 shadow-sm">
                  {nextShift.brand.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <h2 className="break-words text-xl sm:text-[24px] font-bold text-slate-900 leading-snug [overflow-wrap:anywhere]">{nextShift.brand}</h2>
                    <span className="text-[12px] font-semibold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 rounded">{nextShift.platform}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-[13px] text-slate-600 mt-1">
                    <span className="flex items-center gap-1.5 font-medium"><Calendar className="w-4 h-4 text-slate-400" /> {nextShift.time}</span>
                    <span className="flex items-center gap-1.5 font-bold text-slate-700"><CheckCircle className="w-4 h-4 text-emerald-500" /> {nextShift.role}</span>
                    <span className="flex items-center gap-1.5 font-medium"><MapPin className="w-4 h-4 text-slate-400" /> {nextShift.location ?? '—'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="w-full flex flex-col items-end justify-center border-t border-slate-100 pt-4 lg:w-[280px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
              <button type="button" data-testid="member-next-shift-details" disabled={!onOpenNextShift} onClick={onOpenNextShift} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold rounded-md shadow-sm transition-colors flex items-center justify-center gap-2">
                <ArrowRight className="w-4 h-4" /> Xem chi tiết ca
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Không có ca làm việc sắp tới.</div>
        )}
      </div>

      {/* ROW 2: MY SCHEDULE (7/12) + MY ACTIONS (5/12) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6">
        <div className="min-w-0 xl:col-span-7 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[16px] font-bold text-slate-900">My Schedule</h2>
          </div>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 flex flex-col flex-1">
            <div className="space-y-3">
              {mySchedule.length > 0 ? mySchedule.slice(0, 6).map((s, i) => (
                <ScheduleItem key={i} date={s.date} time={s.time} brand={s.brand} platform={s.platform} role={s.role} onView={s.onView} />
              )) : (
                <div className="text-center text-sm text-slate-500 py-4">Không có lịch trình</div>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 xl:col-span-5 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[16px] font-bold text-slate-900">My Actions</h2>
          </div>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 flex flex-col gap-3 flex-1">
            {myActions === null ? (
              <div className="text-center text-sm text-slate-500 py-4">Dữ liệu chưa khả dụng</div>
            ) : myActions.length > 0 ? myActions.slice(0, 6).map((a, i) => (
              <ActionCard key={i} type={a.type} title={a.title} time={a.time} description={a.description} />
            )) : (
              <div className="text-center text-sm text-slate-500 py-4">Không có hành động nào</div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: OPEN SHIFTS — 12/12 */}
      <div className="flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[16px] font-bold text-slate-900">Open Shifts For You</h2>
        </div>
        <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4">
          <div className="space-y-3">
            {openShifts === null ? (
              <div className="text-center text-sm text-slate-500 py-4">Dữ liệu chưa khả dụng</div>
            ) : openShifts.length > 0 ? openShifts.slice(0, 6).map((s, i) => (
              <OpenShiftItem key={i} brand={s.brand} time={s.time} platform={s.platform} role={s.role} />
            )) : (
              <div className="text-center text-sm text-slate-500 py-4">Không có ca mở</div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 4: MY REQUESTS (6/12) + NOTIFICATIONS (6/12) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6 pb-6">
        <div className="min-w-0 xl:col-span-6 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[16px] font-bold text-slate-900">My Requests</h2>
          </div>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 flex flex-col flex-1">
            <div className="space-y-3">
              {myRequests === null ? (
                <div className="text-center text-sm text-slate-500 py-4">Dữ liệu chưa khả dụng</div>
              ) : myRequests.length > 0 ? myRequests.slice(0, 6).map((r, i) => (
                <RequestItem key={i} type={r.type} title={r.title} status={r.status} />
              )) : (
                <div className="text-center text-sm text-slate-500 py-4">Không có yêu cầu</div>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 xl:col-span-6 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[16px] font-bold text-slate-900">Recent Notifications</h2>
          </div>
          <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 flex flex-col flex-1">
            <div className="space-y-3">
              {notifications === null ? (
                <div className="text-center text-sm text-slate-500 py-4">Dữ liệu chưa khả dụng</div>
              ) : notifications.length > 0 ? notifications.slice(0, 6).map((n, i) => (
                <NotificationItem key={i} title={n.title} time={n.time} unread={n.unread} />
              )) : (
                <div className="text-center text-sm text-slate-500 py-4">Không có thông báo</div>
              )}
            </div>
          </div>
        </div>
      </div>
    <nav aria-label="Xem tất cả" className="flex flex-wrap gap-4 text-sm"><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/calendar">Xem tất cả: Lịch</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/reports">Xem tất cả: Báo cáo</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/notifications">Xem tất cả: Thông báo</a></nav>
    </main>
    </>
  )
}
