'use client'

import { pageRange } from '@/lib/utils/pagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { useTranslation } from '@/lib/i18n'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  BarChart2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import type {
  WorkforceTeamOverview as TeamOverviewType,
  WorkforcePerformanceSummary,
  WorkforceRole,
  Pagination,
} from '@/lib/services/workforceService'

interface WorkforceTeamOverviewProps {
  overview: TeamOverviewType | null
  staffList: WorkforcePerformanceSummary[]
  period: string
  role: WorkforceRole
  view?: 'team' | 'table' | 'cards'
  staffPagination?: Pagination
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  searchDraft?: string
  staffDraft?: string
  onApplyFilters?: (search: string, staffId: string) => void
  sort?: 'name' | 'assigned' | 'approved_minutes' | 'punctuality'
  direction?: 'asc' | 'desc'
  onSortChange?: (sort: 'name' | 'assigned' | 'approved_minutes' | 'punctuality', direction: 'asc' | 'desc') => void
  record?: 'complete' | 'incomplete' | null
  onRecordChange?: (record: 'complete' | 'incomplete' | null) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onSelectStaff: (staffId: string) => void
}

export function WorkforceTeamOverview({
  overview,
  staffList,
  period,
  view = 'team',
  staffPagination,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  searchDraft = '',
  staffDraft = '',
  onApplyFilters,
  sort = 'name',
  direction = 'asc',
  onSortChange,
  record = null,
  onRecordChange,
  loading = false,
  error = null,
  onRetry,
  onSelectStaff,
}: WorkforceTeamOverviewProps) {
  const { language } = useTranslation()
  const en = language === 'en'
  const total = staffPagination?.total_count ?? staffList.length
  const range = pageRange(total, page, pageSize)
  const pageRows = staffPagination ? staffList : staffList.slice((range.page - 1) * pageSize, range.page * pageSize)
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse border-slate-200 bg-white">
              <CardHeader className="h-10 pb-0" />
              <CardContent className="h-16" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50/50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
        <h3 className="mt-2 text-sm font-semibold text-rose-900">
          {en ? 'Could not load team performance' : 'Không thể tải tổng quan hiệu suất đội ngũ'}
        </h3>
        <p className="mt-1 text-xs text-rose-600">{error}</p>
        {onRetry && <Button className="mt-3" variant="outline" onClick={onRetry}>{en ? 'Retry' : 'Thử lại'}</Button>}
      </Card>
    )
  }

  if (!overview) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
        <p className="text-sm text-slate-500">
          {en ? `No team performance data for ${period} and this role.` : `Chưa có dữ liệu hiệu suất đội ngũ cho kỳ ${period} và vai trò được chọn.`}
        </p>
      </Card>
    )
  }

  if (view === 'team' && overview.staffCount === 0) {
    return <Card className="border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600" role="status">
      {en ? `No assigned shifts or approved attendance for ${period}.` : `Chưa có ca phân công hoặc chấm công đã duyệt trong kỳ ${period}.`}
    </Card>
  }

  const hoursWorked = Math.floor(overview.actualMinutes / 60)
  const minutesWorked = overview.actualMinutes % 60

  return (
    <div className="space-y-6">
      {view === 'team' && <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {/* Card 1: Attendance Coverage */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {en ? 'Attendance coverage' : 'Bao phủ chấm công'}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {overview.attendanceCoveragePct !== null
                ? `${overview.attendanceCoveragePct}%`
                : (en ? 'No data' : 'Chưa có dữ liệu')}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {en ? `${overview.verifiedShifts}/${overview.assignedShifts} shifts verified` : `${overview.verifiedShifts}/${overview.assignedShifts} ca có minh chứng xác minh`}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Punctuality */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {en ? 'Timeliness' : 'Tỷ lệ đúng giờ'}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-700">
              {overview.punctualityPct !== null
                ? `${overview.punctualityPct}%`
                : (en ? 'No data' : 'Chưa có dữ liệu')}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {en ? `${overview.onTimeShifts} on time / ${overview.lateShifts} late` : `${overview.onTimeShifts} ca đúng giờ / ${overview.lateShifts} ca đi muộn`}
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Total Actual Workload */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {en ? 'Approved actual time' : 'Tổng giờ thực tế'}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
              <BarChart2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {overview.verifiedShifts > 0 ? `${hoursWorked}h ${minutesWorked}p` : (en ? 'No approved data' : 'Chưa có dữ liệu duyệt')}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {en ? `${overview.workedShifts} approved worked shifts (${overview.actualMinutes.toLocaleString()} minutes)` : `${overview.workedShifts} ca làm việc thực tế (${overview.actualMinutes.toLocaleString()} phút)`}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Known Reliability */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {en ? 'Verified reliability' : 'Độ tin cậy xác minh'}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-purple-900">
              {overview.knownReliabilityPct !== null
                ? `${overview.knownReliabilityPct}%`
                : (en ? 'No data' : 'Chưa có dữ liệu')}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {en ? `${overview.approvedNoShows} approved no-shows` : `${overview.approvedNoShows} ca vắng mặt có xác minh (No-show)`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warnings & Integrity Strip */}
      {overview.unknownAttendanceShifts > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            {en ? <>{overview.unknownAttendanceShifts} shifts have no approved attendance evidence. Their status remains unknown.</> : <>Có <strong>{overview.unknownAttendanceShifts}</strong> ca làm việc chưa có minh chứng chấm công. Hệ thống giữ trạng thái <em>Chưa rõ</em> thay vì quy chụp là vắng mặt hoặc đi muộn.</>}
          </span>
        </div>
      )}
      </>}

      {/* Staff Comparison Table */}
      {view !== 'team' && <form onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); onApplyFilters?.(String(values.get('search') || ''), String(values.get('staff') || '')) }} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Input key={`search:${searchDraft}`} name="search" aria-label={en ? 'Search staff' : 'Tìm nhân sự'} placeholder={en ? 'Search name or ID' : 'Tìm tên hoặc mã nhân sự'} defaultValue={searchDraft} />
        <Input key={`staff:${staffDraft}`} name="staff" aria-label={en ? 'Staff ID filter' : 'Lọc mã nhân sự'} placeholder={en ? 'Exact staff ID' : 'Mã nhân sự chính xác'} defaultValue={staffDraft} />
        <select aria-label={en ? 'Evidence status column' : 'Cột tình trạng minh chứng'} value={record || 'all'} onChange={event => onRecordChange?.(event.target.value === 'all' ? null : event.target.value as 'complete' | 'incomplete')} className="min-h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
          <option value="all">{en ? 'All evidence states' : 'Mọi tình trạng minh chứng'}</option>
          <option value="complete">{en ? 'Complete record' : 'Hồ sơ đầy đủ'}</option>
          <option value="incomplete">{en ? 'Incomplete record' : 'Thiếu chứng từ'}</option>
        </select>
        <select aria-label={en ? 'Sort staff' : 'Sắp xếp nhân sự'} value={`${sort}:${direction}`} onChange={event => { const [key, order] = event.target.value.split(':'); onSortChange?.(key as typeof sort, order as typeof direction) }} className="min-h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
          <option value="name:asc">{en ? 'Name A–Z' : 'Tên A–Z'}</option>
          <option value="name:desc">{en ? 'Name Z–A' : 'Tên Z–A'}</option>
          <option value="assigned:desc">{en ? 'Most assigned shifts' : 'Nhiều ca phân công'}</option>
          <option value="approved_minutes:desc">{en ? 'Most approved minutes' : 'Nhiều phút đã duyệt'}</option>
          <option value="punctuality:desc">{en ? 'Highest timeliness' : 'Đúng giờ cao nhất'}</option>
        </select>
        <Button type="submit">{en ? 'Apply' : 'Áp dụng'}</Button>
      </form>}
      {view === 'table' && <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              {en ? 'Staff performance table' : 'Bảng so sánh hiệu suất từng nhân sự'} ({total})
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              {en ? 'Metrics use independently approved attendance evidence.' : 'Dữ liệu được tính toán dựa trên chứng từ đối soát độc lập đã được phê duyệt.'}
            </p>
          </div>

        </CardHeader>

        <CardContent className="p-4">
          <div role="region" aria-label={en ? 'Scrollable staff table' : 'Bảng nhân sự có thể cuộn ngang'} tabIndex={0} className="max-w-full overflow-x-auto rounded-md border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">{en ? 'Staff' : 'Nhân sự'}</th>
                  <th className="px-3 py-2.5 text-center">{en ? 'Assigned' : 'Ca phân công'}</th>
                  <th className="px-3 py-2.5 text-center">{en ? 'Verified' : 'Ca xác minh'}</th>
                  <th className="px-3 py-2.5 text-right">{en ? 'Approved time' : 'Giờ thực tế'}</th>
                  <th className="px-3 py-2.5 text-center">{en ? 'On time' : 'Đúng giờ'}</th>
                  <th className="px-3 py-2.5 text-center">{en ? 'Late' : 'Đi muộn'}</th>
                  <th className="px-3 py-2.5 text-center">{en ? 'No-show' : 'Vắng (No-show)'}</th>
                  <th className="px-3 py-2.5 text-right font-bold">{en ? 'Timeliness %' : 'Đúng giờ %'}</th>
                  <th className="px-3 py-2.5 text-center">{en ? 'Record' : 'Hồ sơ'}</th>
                  <th className="px-3 py-2.5 text-right">{en ? 'Action' : 'Thao tác'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {total === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      {en ? 'No staff match this period and filter.' : 'Không tìm thấy nhân sự phù hợp trong kỳ và bộ lọc này.'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((staff) => {
                    const staffHours = Math.floor(staff.approvedActualMinutes / 60)
                    const staffMins = staff.approvedActualMinutes % 60
                    return (
                      <tr key={staff.staffId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">
                            {staff.name || staff.staffId}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {staff.staffId} {staff.department ? `• ${staff.department}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-slate-600">
                          {staff.assignedShifts}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono">
                          <span className="font-semibold text-slate-900">{staff.verifiedShifts}</span>
                          {staff.unknownAttendanceShifts > 0 && (
                            <span className="ml-1 text-[10px] text-amber-600" title={en ? 'No approved evidence' : 'Chưa có minh chứng'}>
                              ({staff.unknownAttendanceShifts}?)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-900">
                          {staff.verifiedShifts > 0 ? `${staffHours}h ${staffMins}p` : (en ? 'No approved data' : 'Chưa có dữ liệu duyệt')}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-emerald-700">
                          {staff.onTimeShifts}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-amber-700">
                          {staff.lateShifts > 0 ? staff.lateShifts : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-rose-700">
                          {staff.approvedNoShows > 0 ? staff.approvedNoShows : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {staff.punctualityPct !== null ? (
                            <span
                              className={
                                staff.punctualityPct >= 90
                                  ? 'text-emerald-700'
                                  : staff.punctualityPct >= 75
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }
                            >
                              {staff.punctualityPct}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">N/A</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {staff.isComplete ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                              {en ? 'Complete' : 'Đầy đủ'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                              {en ? 'Incomplete' : 'Thiếu chứng từ'}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onSelectStaff(staff.staffId)}
                            className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {en ? 'View details' : 'Xem chi tiết'}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <HistoryPagination page={staffPagination?.page ?? range.page} pageSize={pageSize} total={total} onPageChange={onPageChange || (() => undefined)} onPageSizeChange={onPageSizeChange} />
        </CardContent>
      </Card>}
      {view === 'cards' && <div className="space-y-3">
        {total === 0 ? <Card className="p-6 text-center text-sm text-slate-500">{en ? 'No staff match this period and filter.' : 'Không tìm thấy nhân sự phù hợp trong kỳ và bộ lọc này.'}</Card> :
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pageRows.map(staff => <Card key={staff.staffId} className="border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">{staff.name || staff.staffId}</h3>
            <p className="text-xs text-slate-500">{staff.staffId}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-slate-500">{en ? 'Assigned' : 'Phân công'}</dt><dd>{staff.assignedShifts}</dd></div>
              <div><dt className="text-slate-500">{en ? 'Verified' : 'Xác minh'}</dt><dd>{staff.verifiedShifts}</dd></div>
              <div><dt className="text-slate-500">{en ? 'Approved time' : 'Giờ đã duyệt'}</dt><dd>{staff.verifiedShifts > 0 ? `${Math.floor(staff.approvedActualMinutes / 60)}h ${staff.approvedActualMinutes % 60}p` : (en ? 'No data' : 'Chưa có dữ liệu')}</dd></div>
              <div><dt className="text-slate-500">{en ? 'Timeliness' : 'Đúng giờ'}</dt><dd>{staff.punctualityPct === null ? (en ? 'No data' : 'Chưa có dữ liệu') : `${staff.punctualityPct}%`}</dd></div>
            </dl>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => onSelectStaff(staff.staffId)}>{en ? 'View individual' : 'Xem cá nhân'}</Button>
          </Card>)}</div>}
        <HistoryPagination page={staffPagination?.page ?? range.page} pageSize={pageSize} total={total} onPageChange={onPageChange || (() => undefined)} onPageSizeChange={onPageSizeChange} />
      </div>}
    </div>
  )
}
