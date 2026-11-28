'use client'

import * as React from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Filter,
  Info,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { User } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  shiftIncidentService,
  type WorkforceIncidentSummary,
} from '@/lib/services/shiftIncidentService'

interface WorkforceIncidentSummaryPanelProps {
  initialPeriod?: string
  initialRole?: string
  currentUser?: User | null
  allowedBrandIds?: string[]
  allowedAgencyIds?: string[]
  onSelectStaff?: (staffId: string) => void
}

export function WorkforceIncidentSummaryPanel({
  initialPeriod,
  initialRole,
  currentUser,
  allowedBrandIds,
  allowedAgencyIds,
  onSelectStaff,
}: WorkforceIncidentSummaryPanelProps) {
  const { language } = useTranslation()
  const isVi = language === 'vi'

  const currentMonth = React.useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  // Scope detection
  const isMember = currentUser?.role === 'staff' || currentUser?.system_permission === 'member'
  const isLeader = currentUser?.role === 'leader' || currentUser?.system_permission === 'leader'

  // Filter states (8 filters required by Delta D Task 5)
  const [period, setPeriod] = React.useState(initialPeriod || currentMonth)
  const [employeeId, setEmployeeId] = React.useState(isMember && currentUser?.id ? currentUser.id : '')
  const [role, setRole] = React.useState(initialRole || 'all')
  const [brandId, setBrandId] = React.useState('all')
  const [agencyId, setAgencyId] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [incidentType, setIncidentType] = React.useState('all')

  const [loading, setLoading] = React.useState(true)
  const [schemaUnavailable, setSchemaUnavailable] = React.useState(false)
  const [summary, setSummary] = React.useState<WorkforceIncidentSummary | null>(null)

  // Enforce member self-only scope
  const effectiveEmployeeId = React.useMemo(() => {
    if (isMember && currentUser?.id) {
      return currentUser.id
    }
    return employeeId.trim() || undefined
  }, [isMember, currentUser?.id, employeeId])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await shiftIncidentService.getWorkforceSummary({
        month: period,
        employeeId: effectiveEmployeeId,
        role: role === 'all' ? undefined : role,
        brandId: brandId === 'all' ? undefined : brandId,
        agencyId: agencyId === 'all' ? undefined : agencyId,
        platform: platform === 'all' ? undefined : platform,
        status: status === 'all' ? undefined : status,
        incidentType: incidentType === 'all' ? undefined : incidentType,
      })
      setSummary(data)
      setSchemaUnavailable(false)
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('SCHEMA_NOT_DEPLOYED') ||
          (err as { code?: string }).code === 'SCHEMA_NOT_DEPLOYED')
      ) {
        setSchemaUnavailable(true)
      } else {
        setSummary(null)
      }
    } finally {
      setLoading(false)
    }
  }, [period, effectiveEmployeeId, role, brandId, agencyId, platform, status, incidentType])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of workforce incidents
    void loadData()
  }, [loadData])

  return (
    <div
      className="space-y-4"
      data-testid="workforce-incident-summary-panel"
    >
      {/* Scope Indicator Banners */}
      {isMember && (
        <div
          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"
          data-testid="member-self-scope-indicator"
        >
          <ShieldAlert className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            {isVi
              ? 'Chế độ xem cá nhân: Chỉ hiển thị dữ liệu sự cố liên quan đến bạn theo phân quyền.'
              : 'Personal Scope: Only incident data pertaining to your assignments is shown.'}
          </span>
        </div>
      )}

      {isLeader && (
        <div
          className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800"
          data-testid="leader-scope-indicator"
        >
          <UserCheck className="h-4 w-4 text-indigo-600 shrink-0" />
          <span>
            {isVi
              ? 'Chế độ quản lý đội ngũ (Leader Scope): Thống kê theo nhãn hàng và ca trực được ủy quyền.'
              : 'Leader Scope: Aggregates bounded by authorized brand and operational assignments.'}
          </span>
        </div>
      )}

      {/* Filter Toolbar with all 8 filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {isVi ? 'Bộ lọc:' : 'Filters:'}
          </div>

          {/* 1. Month selector */}
          <div className="w-32">
            <input
              type="month"
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs"
              data-testid="incident-summary-month-input"
              aria-label={isVi ? 'Tháng' : 'Month'}
            />
          </div>

          {/* 2. Employee search / filter */}
          <div className="w-36">
            <Input
              type="text"
              placeholder={isVi ? 'Mã / Tên NV...' : 'Staff ID / Name...'}
              value={isMember && currentUser?.id ? currentUser.id : employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              disabled={isMember}
              className="h-8 text-xs"
              data-testid="incident-employee-filter"
              aria-label={isVi ? 'Lọc theo nhân sự' : 'Filter by staff'}
            />
          </div>

          {/* 3. Role selector */}
          <div className="w-36">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 text-xs" data-testid="incident-role-filter">
                <SelectValue placeholder={isVi ? 'Tất cả vai trò' : 'All Roles'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isVi ? 'Tất cả vai trò' : 'All Roles'}
                </SelectItem>
                <SelectItem value="host" className="text-xs">Host Livestream</SelectItem>
                <SelectItem value="support" className="text-xs">
                  {isVi ? 'Trợ livestream' : 'Support'}
                </SelectItem>
                <SelectItem value="technical" className="text-xs">
                  {isVi ? 'Kỹ thuật' : 'Technical'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4. Brand selector */}
          <div className="w-32">
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger className="h-8 text-xs" data-testid="incident-brand-filter">
                <SelectValue placeholder={isVi ? 'Tất cả Brand' : 'All Brands'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isVi ? 'Tất cả Brand' : 'All Brands'}
                </SelectItem>
                {(allowedBrandIds ?? ['Brand Alpha', 'Brand Beta', 'Brand Gamma']).map(b => (
                  <SelectItem key={b} value={b} className="text-xs">
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 5. Agency selector */}
          <div className="w-32">
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger className="h-8 text-xs" data-testid="incident-agency-filter">
                <SelectValue placeholder={isVi ? 'Tất cả Agency' : 'All Agencies'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isVi ? 'Tất cả Agency' : 'All Agencies'}
                </SelectItem>
                {(allowedAgencyIds ?? ['Agency Standard', 'Agency In-House']).map(a => (
                  <SelectItem key={a} value={a} className="text-xs">
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 6. Platform selector */}
          <div className="w-32">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-8 text-xs" data-testid="incident-platform-filter">
                <SelectValue placeholder={isVi ? 'Nền tảng' : 'Platform'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isVi ? 'Tất cả nền tảng' : 'All Platforms'}
                </SelectItem>
                <SelectItem value="tiktok" className="text-xs">TikTok</SelectItem>
                <SelectItem value="shopee" className="text-xs">Shopee</SelectItem>
                <SelectItem value="lazada" className="text-xs">Lazada</SelectItem>
                <SelectItem value="facebook" className="text-xs">Facebook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 7. Incident Type filter */}
          <div className="w-36">
            <Select value={incidentType} onValueChange={setIncidentType}>
              <SelectTrigger className="h-8 text-xs" data-testid="incident-type-filter">
                <SelectValue placeholder={isVi ? 'Loại sự cố' : 'Incident Type'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isVi ? 'Tất cả loại sự cố' : 'All Incident Types'}
                </SelectItem>
                <SelectItem value="skip" className="text-xs">
                  {isVi ? 'Bỏ ca (Skip)' : 'Skip'}
                </SelectItem>
                <SelectItem value="absent" className="text-xs">
                  {isVi ? 'Vắng mặt (Absent)' : 'Absent'}
                </SelectItem>
                <SelectItem value="late" className="text-xs">
                  {isVi ? 'Đi trễ (Late)' : 'Late'}
                </SelectItem>
                <SelectItem value="early_leave" className="text-xs">
                  {isVi ? 'Về sớm (Early leave)' : 'Early Leave'}
                </SelectItem>
                <SelectItem value="approved_pass" className="text-xs">
                  {isVi ? 'Chuyển ca hợp lệ' : 'Approved Pass'}
                </SelectItem>
                <SelectItem value="approved_swap" className="text-xs">
                  {isVi ? 'Đổi ca hợp lệ' : 'Approved Swap'}
                </SelectItem>
                <SelectItem value="authorized_absence" className="text-xs">
                  {isVi ? 'Nghỉ phép hợp lệ' : 'Authorized Absence'}
                </SelectItem>
                <SelectItem value="planned_reassignment" className="text-xs">
                  {isVi ? 'Phân công lại' : 'Planned Reassignment'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 8. Review Status filter */}
          <div className="w-32">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-xs" data-testid="incident-status-filter">
                <SelectValue placeholder={isVi ? 'Trạng thái duyệt' : 'Review Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isVi ? 'Tất cả trạng thái' : 'All Statuses'}
                </SelectItem>
                <SelectItem value="pending" className="text-xs">
                  {isVi ? 'Chờ duyệt' : 'Pending'}
                </SelectItem>
                <SelectItem value="confirmed" className="text-xs">
                  {isVi ? 'Đã xác nhận' : 'Confirmed'}
                </SelectItem>
                <SelectItem value="rejected" className="text-xs">
                  {isVi ? 'Từ chối' : 'Rejected'}
                </SelectItem>
                <SelectItem value="corrected" className="text-xs">
                  {isVi ? 'Đã hiệu chỉnh' : 'Corrected'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
          className="h-8 px-2.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {isVi ? 'Làm mới' : 'Refresh'}
        </Button>
      </div>

      {schemaUnavailable ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
          data-testid="workforce-incident-schema-unavailable"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              {isVi
                ? 'Tính năng Tổng hợp sự cố nhân sự chưa khả dụng trên môi trường này.'
                : 'Workforce Incident Summary is not yet deployed in this environment.'}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground text-[11px]">
            {isVi
              ? 'Dữ liệu tổng hợp sẽ tự động hiển thị sau khi backend triển khai RPC get_workforce_incident_summary.'
              : 'Aggregates will display automatically after backend RPC get_workforce_incident_summary is deployed.'}
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards: 7 distinct operational breakdown cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            {/* Card 1: Total Incidents */}
            <Card className="shadow-2xs">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {isVi ? 'Tổng sự cố' : 'Total Incidents'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-foreground">
                  {summary?.totalIncidents ?? 0}
                </div>
                <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                  {summary?.pendingReviews ?? 0} {isVi ? 'chờ' : 'pending'} · {summary?.rejectedReviews ?? 0} {isVi ? 'hủy' : 'rejected'}
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Confirmed Violations (Skip / Absent) */}
            <Card className="shadow-2xs" data-testid="metric-confirmed-violations">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-rose-600">
                  {isVi ? 'Vi phạm (Skip/Vắng)' : 'Violations'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-rose-700">
                  {summary?.confirmedViolations ?? ((summary?.confirmedSkips ?? 0) + (summary?.confirmedAbsents ?? 0))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.confirmedSkips ?? 0} {isVi ? 'bỏ ca' : 'skips'} · {summary?.confirmedAbsents ?? 0} {isVi ? 'vắng' : 'absent'}
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Punctuality (Late / Early Leave) */}
            <Card className="shadow-2xs">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-amber-600">
                  {isVi ? 'Đúng giờ (Trễ/Về sớm)' : 'Punctuality'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-amber-700">
                  {summary?.confirmedPunctuality ?? ((summary?.confirmedLates ?? 0) + (summary?.confirmedEarlyLeaves ?? 0))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.confirmedLates ?? 0} {isVi ? 'trễ' : 'late'} · {summary?.confirmedEarlyLeaves ?? 0} {isVi ? 'sớm' : 'early'}
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Approved Adjustments (Pass / Swap / Reassignment) */}
            <Card className="shadow-2xs">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-blue-600">
                  {isVi ? 'Điều chỉnh hợp lệ' : 'Adjustments'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-blue-700">
                  {summary?.approvedChanges ?? ((summary?.approvedPasses ?? 0) + (summary?.approvedSwaps ?? 0) + (summary?.plannedReassignments ?? 0))}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.approvedSwaps ?? 0} {isVi ? 'đổi' : 'swap'} · {summary?.approvedPasses ?? 0} {isVi ? 'chuyển' : 'pass'}
                </div>
              </CardContent>
            </Card>

            {/* Card 5: Approved Leave (Authorized Absence) */}
            <Card className="shadow-2xs">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-sky-600">
                  {isVi ? 'Nghỉ phép có phép' : 'Authorized Leave'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-sky-700">
                  {summary?.authorizedAbsences ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {isVi ? 'nghỉ phép duyệt' : 'approved leave'}
                </div>
              </CardContent>
            </Card>

            {/* Card 6: Verified Late Minutes */}
            <Card className="shadow-2xs">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {isVi ? 'Phút trễ xác minh' : 'Late Minutes'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-foreground">
                  {summary?.totalVerifiedLateMinutes ?? 0}m
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.unknownDurationCount ?? 0} {isVi ? 'chưa rõ phút' : 'unknown'}
                </div>
              </CardContent>
            </Card>

            {/* Card 7: Affected Staff & Shifts */}
            <Card className="shadow-2xs">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {isVi ? 'Độ phủ ca / NS' : 'Coverage'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2.5 pt-0">
                <div className="text-xl font-bold text-foreground">
                  {summary?.distinctAffectedStaff ?? summary?.staffSummaries?.length ?? 0} {isVi ? 'NV' : 'Staff'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {summary?.distinctAffectedShifts ?? 0} {isVi ? 'ca trực' : 'shifts'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Employee Breakdown Table */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="p-3 border-b flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  {isVi ? 'Bảng chi tiết theo nhân sự' : 'Staff Breakdown'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {isVi
                    ? 'Thống kê sự cố, điều chỉnh ca và thời lượng đúng giờ theo từng cá nhân trong kỳ.'
                    : 'Individual operational incident and punctuality metrics for this period.'}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {isVi ? 'Đang tải dữ liệu tổng hợp...' : 'Loading summary data...'}
              </div>
            ) : !summary?.staffSummaries?.length ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {isVi ? 'Không có dữ liệu sự cố trong kỳ này.' : 'No incident data for this period.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] font-medium text-muted-foreground border-b">
                    <tr>
                      <th className="px-3 py-2.5">{isVi ? 'Nhân sự' : 'Staff'}</th>
                      <th className="px-3 py-2.5">{isVi ? 'Vai trò' : 'Role'}</th>
                      <th className="px-3 py-2.5 text-center">{isVi ? 'Tổng sự cố' : 'Total'}</th>
                      <th className="px-3 py-2.5 text-center">{isVi ? 'Bỏ ca / Vắng' : 'Skip/Absent'}</th>
                      <th className="px-3 py-2.5 text-center">{isVi ? 'Trễ / Về sớm' : 'Late/Early'}</th>
                      <th className="px-3 py-2.5 text-center">{isVi ? 'Phút trễ' : 'Late Mins'}</th>
                      <th className="px-3 py-2.5 text-center">{isVi ? 'Đổi ca / Phép' : 'Swap/Leave'}</th>
                      <th className="px-3 py-2.5 text-center">{isVi ? 'Chờ duyệt' : 'Pending'}</th>
                      <th className="px-3 py-2.5 text-right">{isVi ? 'Hành động' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.staffSummaries.map(staff => (
                      <tr
                        key={staff.staffId}
                        data-testid={`workforce-incident-row-${staff.staffId}`}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-3 py-2 font-medium text-foreground">
                          {staff.staffName}
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {staff.staffId}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">
                          {staff.role || '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-semibold">
                          {staff.totalIncidents}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {staff.skipCount + staff.absentCount > 0 ? (
                            <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50 text-[10px]">
                              {staff.skipCount + staff.absentCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {staff.lateCount + staff.earlyLeaveCount > 0 ? (
                            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 text-[10px]">
                              {staff.lateCount + staff.earlyLeaveCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center font-medium">
                          {staff.verifiedLateMinutes > 0 ? (
                            `${staff.verifiedLateMinutes}m`
                          ) : staff.unknownDurationCount > 0 ? (
                            <span className="text-amber-600 text-[10px] italic">
                              {staff.unknownDurationCount} {isVi ? 'chưa rõ' : 'unknown'}
                            </span>
                          ) : (
                            '0m'
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {staff.approvedSwapCount + staff.authorizedAbsenceCount + staff.approvedPassCount > 0 ? (
                            <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50 text-[10px]">
                              {staff.approvedSwapCount + staff.authorizedAbsenceCount + staff.approvedPassCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {staff.pendingCount > 0 ? (
                            <Badge variant="outline" className="text-amber-800 border-amber-300 bg-amber-100 text-[10px]">
                              {staff.pendingCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">0</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {onSelectStaff && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => onSelectStaff(staff.staffId)}
                              data-testid={`drilldown-staff-btn-${staff.staffId}`}
                            >
                              {isVi ? 'Chi tiết' : 'Drilldown'}
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Operational Policy Disclaimer */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-700">
                {isVi
                  ? 'Nguyên tắc vận hành không trừng phạt (Non-punitive operational metric):'
                  : 'Non-punitive operational metric policy:'}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                {isVi
                  ? 'Dữ liệu sự cố và thay thế nhân sự được sử dụng để điều phối ca trực, tối ưu độ phủ nhân sự và cải thiện chất lượng lịch phát sóng. Tuyệt đối không tự động giảm trừ lương, không thay đổi rate card và không tính phạt thiếu minh chứng.'
                  : 'Incident records are used exclusively for shift coordination and workforce coverage. They do not trigger automatic wage deductions, rate card penalties, or payroll modifications.'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
