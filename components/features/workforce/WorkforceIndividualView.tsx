'use client'

import * as React from 'react'
import {
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  BarChart2,
  Info,
  RefreshCw,
  } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  workforceService,
  workforceErrorMessage,
  type WorkforcePerformanceSummary,
  type WorkforceRole,
} from '@/lib/services/workforceService'

interface WorkforceIndividualViewProps {
  staffId: string
  role: WorkforceRole
  month: string
  canSelectOtherStaff?: boolean
  availableStaff?: Array<{ id: string; name: string | null }>
  onStaffChange?: (newStaffId: string) => void
  onRoleChange?: (newRole: WorkforceRole) => void
  onMonthChange?: (newMonth: string) => void
}

export function WorkforceIndividualView({
  staffId,
  role,
  month,
  canSelectOtherStaff = false,
  onStaffChange,
  onRoleChange,
  onMonthChange,
}: WorkforceIndividualViewProps) {
  const { toast } = useToast()
  const [summary, setSummary] = React.useState<WorkforcePerformanceSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadPerformance = React.useCallback(async () => {
    if (!staffId) return
    setLoading(true)
    try {
      setError(null)
      const res = await workforceService.getWorkforcePerformance({
        staffId,
        role,
        month,
      })
      setSummary(res.summary)
    } catch (err: unknown) {
      const msg = workforceErrorMessage(err)
      setSummary(null)
      setError(msg)
      toast({
        title: 'Không thể tải hiệu suất cá nhân',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [staffId, role, month, toast])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void loadPerformance()
    })
    return () => cancelAnimationFrame(frame)
  }, [loadPerformance])

  const roleLabels: Record<WorkforceRole, string> = {
    host: 'Host Livestream',
    support: 'Trợ lý phiên Live',
    technical: 'Kỹ thuật viên',
  }

  const hoursWorked = summary ? Math.floor(summary.approvedActualMinutes / 60) : 0
  const minutesWorked = summary ? summary.approvedActualMinutes % 60 : 0

  return (
    <div className="space-y-6">
      {/* Filter / Scope Toolbar */}
      <Card className="border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 items-end">
          {canSelectOtherStaff && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Nhân sự (Staff ID)
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <Input
                  type="text"
                  value={staffId}
                  onChange={(e) => onStaffChange?.(e.target.value)}
                  placeholder="Nhập staff_id..."
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vai trò đánh giá
            </label>
            <Select
              value={role}
              onValueChange={(val: WorkforceRole) => onRoleChange?.(val)}
            >
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="host">Host Livestream</SelectItem>
                <SelectItem value="support">Trợ lý phiên Live</SelectItem>
                <SelectItem value="technical">Kỹ thuật viên</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Tháng đánh giá
            </label>
            <Input
              type="month"
              value={month}
              onChange={(e) => onMonthChange?.(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadPerformance()}
              disabled={loading}
              className="h-8 text-xs w-full sm:w-auto"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới số liệu
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Scorecard */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse border-slate-200 bg-white">
              <CardHeader className="h-10 pb-0" />
              <CardContent className="h-16" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="border-rose-200 bg-rose-50/50 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
          <h3 className="mt-2 text-sm font-semibold text-rose-900">
            Không thể hiển thị dữ liệu hiệu suất
          </h3>
          <p className="mt-1 text-xs text-rose-600">{error}</p>
        </Card>
      ) : summary ? (
        <div className="space-y-6">
          {/* Header Profile Badge */}
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-lg">
                <User className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {summary.name || summary.staffId}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-500">
                  <span className="font-mono">ID: {summary.staffId}</span>
                  <span>•</span>
                  <span>Vai trò: <strong className="text-slate-700">{roleLabels[summary.role]}</strong></span>
                  <span>•</span>
                  <span>Tháng: <strong className="text-slate-700">{month}</strong></span>
                </div>
              </div>
            </div>

            <div>
              {summary.isComplete ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-xs py-1 px-3">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Hồ sơ chấm công hoàn tất
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs py-1 px-3">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-600" />
                  Chưa đầy đủ chứng từ xác minh
                </Badge>
              )}
            </div>
          </div>

          {/* 4 Primary KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Punctuality */}
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
                  {summary.punctualityPct !== null
                    ? `${summary.punctualityPct}%`
                    : 'N/A - Chưa có dữ liệu'}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {summary.onTimeShifts} ca đúng giờ / {summary.lateShifts} ca trễ quá mức ân hạn
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Attendance Coverage */}
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
                <div className="text-2xl font-bold tracking-tight text-blue-900">
                  {summary.attendanceCoveragePct !== null
                    ? `${summary.attendanceCoveragePct}%`
                    : 'N/A - Chưa có dữ liệu'}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {summary.verifiedShifts}/{summary.assignedShifts} ca phân công đã xác minh
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Actual Hours */}
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Thời lượng làm thực tế
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
                  {summary.approvedWorkedShifts} ca làm thực tế ({summary.approvedActualMinutes.toLocaleString()} phút)
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
                  {summary.knownReliabilityPct !== null
                    ? `${summary.knownReliabilityPct}%`
                    : 'N/A - Chưa có dữ liệu'}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {summary.approvedNoShows} ca xác nhận vắng (No-show)
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Evidence Integrity Notice */}
          {summary.warning === 'INCOMPLETE_ATTENDANCE_EVIDENCE' && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Cảnh báo minh chứng chưa hoàn tất:</strong> Trong tháng có {summary.unknownAttendanceShifts} ca làm việc chưa có dữ liệu chấm công được phê duyệt. Hệ thống không tự động tính là 0 công hoặc vắng mặt; vui lòng hoàn tất chấm công tại mục Chi tiết ca.
              </span>
            </div>
          )}

          {/* Revenue Attribution Gating (Scientific & Honesty rule) */}
          <Card className="border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 shrink-0 text-slate-400 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Chỉ số Doanh thu & Đơn hàng (GMV / Giờ)
                </h4>
                <p className="text-xs text-slate-500">
                  Chưa có dữ liệu phân bổ trực tiếp (<strong>N/A</strong>). Theo tiêu chuẩn vận hành, hệ thống không tự phân bổ chia đều doanh thu của phiên Live cho nhân sự khi chưa có dữ liệu phân bổ phiên được xác nhận chính thức từ quản lý ca.
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
