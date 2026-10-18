'use client'

import * as React from 'react'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { pageRange } from '@/lib/utils/pagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
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
} from '@/lib/services/workforceService'

interface WorkforceTeamOverviewProps {
  overview: TeamOverviewType | null
  staffList: WorkforcePerformanceSummary[]
  month: string
  role: WorkforceRole
  loading?: boolean
  error?: string | null
  onSelectStaff: (staffId: string) => void
}

export function WorkforceTeamOverview({
  overview,
  staffList,
  loading = false,
  error = null,
  onSelectStaff,
}: WorkforceTeamOverviewProps) {
  const [searchTerm, setSearchTerm] = React.useState('')

  const filteredStaff = React.useMemo(() => {
    if (!searchTerm.trim()) return staffList
    const term = searchTerm.toLowerCase()
    return staffList.filter(
      (s) =>
        s.staffId.toLowerCase().includes(term) ||
        (s.name && s.name.toLowerCase().includes(term)) ||
        (s.department && s.department.toLowerCase().includes(term))
    )
  }, [staffList, searchTerm])

  const pagination = useListPagination('workforce_staff', 20)
  const range = pageRange(filteredStaff.length, pagination.page, pagination.pageSize)
  const pageRows = filteredStaff.slice((range.page - 1) * pagination.pageSize, range.page * pagination.pageSize)
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          Không thể tải tổng quan hiệu suất đội ngũ
        </h3>
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      </Card>
    )
  }

  if (!overview) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
        <p className="text-sm text-slate-500">
          Chưa có dữ liệu hiệu suất đội ngũ cho tháng và vai trò được chọn.
        </p>
      </Card>
    )
  }

  const hoursWorked = Math.floor(overview.actualMinutes / 60)
  const minutesWorked = overview.actualMinutes % 60

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Attendance Coverage */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Bao phủ chấm công
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {overview.attendanceCoveragePct !== null
                ? `${overview.attendanceCoveragePct}%`
                : 'Chưa có dữ liệu'}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {overview.verifiedShifts}/{overview.assignedShifts} ca có minh chứng xác minh
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Punctuality */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tỷ lệ đúng giờ
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-700">
              {overview.punctualityPct !== null
                ? `${overview.punctualityPct}%`
                : 'Chưa có dữ liệu'}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {overview.onTimeShifts} ca đúng giờ / {overview.lateShifts} ca đi muộn
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Total Actual Workload */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tổng giờ thực tế
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
              <BarChart2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">
              {hoursWorked}h {minutesWorked}p
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {overview.workedShifts} ca làm việc thực tế ({overview.actualMinutes.toLocaleString()} phút)
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Known Reliability */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Độ tin cậy xác minh
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50 text-purple-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-purple-900">
              {overview.knownReliabilityPct !== null
                ? `${overview.knownReliabilityPct}%`
                : 'Chưa có dữ liệu'}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {overview.approvedNoShows} ca vắng mặt có xác minh (No-show)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warnings & Integrity Strip */}
      {overview.unknownAttendanceShifts > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Có <strong>{overview.unknownAttendanceShifts}</strong> ca làm việc chưa có minh chứng chấm công. Hệ thống giữ trạng thái <em>Chưa rõ</em> thay vì quy chụp là vắng mặt hoặc đi muộn.
          </span>
        </div>
      )}

      {/* Staff Comparison Table */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              Bảng so sánh hiệu suất từng nhân sự ({staffList.length} nhân sự)
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Dữ liệu được tính toán dựa trên chứng từ đối soát độc lập đã được phê duyệt.
            </p>
          </div>

          <div className="w-full sm:w-64">
            <Input
              type="text"
              placeholder="Tìm theo tên hoặc mã nhân sự..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); pagination.reset() }}
              className="h-8 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Nhân sự</th>
                  <th className="px-3 py-2.5 text-center">Ca phân công</th>
                  <th className="px-3 py-2.5 text-center">Ca xác minh</th>
                  <th className="px-3 py-2.5 text-right">Giờ thực tế</th>
                  <th className="px-3 py-2.5 text-center">Đúng giờ</th>
                  <th className="px-3 py-2.5 text-center">Đi muộn</th>
                  <th className="px-3 py-2.5 text-center">Vắng (No-show)</th>
                  <th className="px-3 py-2.5 text-right font-bold">Đúng giờ %</th>
                  <th className="px-3 py-2.5 text-center">Hồ sơ</th>
                  <th className="px-3 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      Không tìm thấy nhân sự phù hợp.
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
                            <span className="ml-1 text-[10px] text-amber-600" title="Chưa có minh chứng">
                              ({staff.unknownAttendanceShifts}?)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-900">
                          {staffHours}h {staffMins}p
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
                              Đầy đủ
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                              Thiếu chứng từ
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
                            Xem chi tiết
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
        <HistoryPagination page={range.page} pageSize={pagination.pageSize} total={filteredStaff.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />

          </div>
        </CardContent>
      </Card>
    </div>
  )
}
