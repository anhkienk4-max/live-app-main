'use client'

import React from 'react'
import { useTranslation } from '@/lib/i18n'
import type { User } from '@/lib/types/database.types'
import {
  shiftIncidentService,
  type ShiftIncidentRecord,
} from '@/lib/services/shiftIncidentService'
import type { ShiftIncidentReviewState, ShiftIncidentType } from '@/lib/types/shiftIncidentContract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  Info,
  RefreshCw,
  ShieldAlert,
  UserCheck,
} from 'lucide-react'

interface StaffIncidentHistoryPanelProps {
  targetUserId: string
  targetUserName?: string
  currentUser?: User | null
  className?: string
}

const INCIDENT_TYPE_CONFIG: Record<
  ShiftIncidentType,
  { labelVi: string; labelEn: string; className: string }
> = {
  skip: {
    labelVi: 'Bỏ ca',
    labelEn: 'Skip',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
  absent: {
    labelVi: 'Vắng mặt',
    labelEn: 'Absent',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  authorized_absence: {
    labelVi: 'Nghỉ phép hợp lệ',
    labelEn: 'Authorized Absence',
    className: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  late: {
    labelVi: 'Đi trễ',
    labelEn: 'Late',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  early_leave: {
    labelVi: 'Về sớm',
    labelEn: 'Early Leave',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  approved_pass: {
    labelVi: 'Chuyển ca hợp lệ',
    labelEn: 'Approved Pass',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  approved_swap: {
    labelVi: 'Đổi ca hợp lệ',
    labelEn: 'Approved Swap',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  planned_reassignment: {
    labelVi: 'Phân công lại',
    labelEn: 'Planned Reassignment',
    className: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  other: {
    labelVi: 'Khác',
    labelEn: 'Other',
    className: 'bg-slate-100 text-slate-800 border-slate-300',
  },
}

const REVIEW_STATE_CONFIG: Record<
  ShiftIncidentReviewState,
  { labelVi: string; labelEn: string; className: string }
> = {
  pending: {
    labelVi: 'Chờ duyệt',
    labelEn: 'Pending',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  confirmed: {
    labelVi: 'Đã xác nhận',
    labelEn: 'Confirmed',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  rejected: {
    labelVi: 'Từ chối',
    labelEn: 'Rejected',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  },
  corrected: {
    labelVi: 'Đã hiệu chỉnh',
    labelEn: 'Corrected',
    className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
}

export function StaffIncidentHistoryPanel({
  targetUserId,
  targetUserName,
  currentUser,
  className = '',
}: StaffIncidentHistoryPanelProps) {
  const { language } = useTranslation()
  const isVi = language === 'vi'

  const [incidents, setIncidents] = React.useState<ShiftIncidentRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [schemaUnavailable, setSchemaUnavailable] = React.useState(false)

  // Scope check: member can only view their own history. Admin & leader can view team members.
  const isSelf = currentUser?.id === targetUserId
  const isPrivileged =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'leader' ||
    currentUser?.system_permission === 'admin' ||
    currentUser?.system_permission === 'leader'

  const isAccessAllowed = isSelf || isPrivileged

  const loadIncidents = React.useCallback(async () => {
    if (!isAccessAllowed || !targetUserId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await shiftIncidentService.getIncidentsForStaff(targetUserId)
      setIncidents(data)
      setSchemaUnavailable(false)
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes('SCHEMA_NOT_DEPLOYED') ||
          (err as { code?: string }).code === 'SCHEMA_NOT_DEPLOYED')
      ) {
        setSchemaUnavailable(true)
      } else {
        setIncidents([])
      }
    } finally {
      setLoading(false)
    }
  }, [isAccessAllowed, targetUserId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of staff incidents
    void loadIncidents()
  }, [loadIncidents])

  if (!isAccessAllowed) {
    return (
      <div
        className={`rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 ${className}`}
        data-testid="staff-incident-scope-denied"
      >
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            {isVi
              ? 'Giới hạn quyền xem: Nhân sự chỉ có thể xem lịch sử sự cố của chính mình.'
              : 'Access restricted: Staff can only view their own incident history.'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white p-3 space-y-3 ${className}`}
      data-testid="staff-incident-history-panel"
    >
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            {isVi ? 'Lịch sử sự cố & thay thế' : 'Incident & Replacement History'}
            {targetUserName && (
              <span className="font-normal text-muted-foreground ml-1">
                ({targetUserName})
              </span>
            )}
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
              {incidents.length}
            </Badge>
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isVi
              ? 'Lịch sử ghi nhận đổi ca, đi trễ, vắng mặt gắn với ca trực.'
              : 'Recorded shift replacements, late arrivals, and attendance incidents.'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void loadIncidents()}
          disabled={loading}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {isVi ? 'Tải lại' : 'Refresh'}
        </Button>
      </div>

      {schemaUnavailable ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          data-testid="staff-incident-schema-unavailable"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              {isVi
                ? 'Tính năng Sự cố ca trực chưa khả dụng trên môi trường này.'
                : 'Shift Incident feature is not yet deployed in this environment.'}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground text-[11px]">
            {isVi
              ? 'Dữ liệu sẽ tự động hiển thị sau khi backend hoàn tất di chuyển cơ sở dữ liệu.'
              : 'Data will appear automatically once backend migration is deployed.'}
          </p>
        </div>
      ) : loading ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          {isVi ? 'Đang tải lịch sử sự cố...' : 'Loading incident history...'}
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground">
          {isVi
            ? 'Nhân sự chưa có ghi nhận sự cố hoặc thay thế nào.'
            : 'No incidents or replacements recorded for this staff member.'}
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {incidents.map(inc => {
            const typeConfig = INCIDENT_TYPE_CONFIG[inc.incidentType] || INCIDENT_TYPE_CONFIG.other
            const reviewConfig = REVIEW_STATE_CONFIG[inc.reviewState] || REVIEW_STATE_CONFIG.pending
            const isOriginal = inc.originalStaffId === targetUserId

            return (
              <div
                key={inc.id}
                data-testid={`incident-item-${inc.id}`}
                className="rounded-lg border border-slate-100 bg-card p-3 text-xs space-y-2 shadow-2xs hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border ${typeConfig.className}`}
                    >
                      {isVi ? typeConfig.labelVi : typeConfig.labelEn}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${reviewConfig.className}`}
                    >
                      {isVi ? reviewConfig.labelVi : reviewConfig.labelEn}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {inc.role}
                    </Badge>
                  </div>
                  <time className="text-[11px] text-muted-foreground">
                    {inc.shiftDate || inc.businessDate}
                  </time>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded">
                  <div>
                    <span className="text-muted-foreground">
                      {isVi ? 'Ca trực:' : 'Shift:'}{' '}
                    </span>
                    <span className="font-medium text-foreground">
                      {inc.shiftTitle || inc.shiftId}
                      {inc.brandName ? ` (${inc.brandName})` : ''}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground">
                      {isVi ? 'Phân đoạn:' : 'Segment:'}{' '}
                    </span>
                    <span className="font-medium text-foreground">
                      {inc.staffingSegmentId || (isVi ? 'Cả ca' : 'Full shift')}
                    </span>
                  </div>

                  {inc.incidentType === 'late' && (
                    <div>
                      <span className="text-muted-foreground">
                        {isVi ? 'Thời gian trễ xác minh:' : 'Verified late time:'}{' '}
                      </span>
                      <span className="font-semibold text-amber-700">
                        {inc.verifiedLateMinutes != null
                          ? `${inc.verifiedLateMinutes} ${isVi ? 'phút' : 'mins'}`
                          : isVi ? 'Chưa xác định' : 'Unknown'}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-muted-foreground">
                      {isVi ? 'Vai trò tham gia:' : 'Participation:'}{' '}
                    </span>
                    <span className="font-medium text-foreground">
                      {isOriginal
                        ? isVi ? 'Nhân sự gốc (Gặp sự cố)' : 'Original Staff'
                        : isVi ? 'Nhân sự thay thế (Dự phòng)' : 'Replacement Staff'}
                    </span>
                  </div>

                  {inc.replacementStaffName && (
                    <div className="sm:col-span-2 flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {isVi ? 'Người thay thế:' : 'Replacement:'}{' '}
                      </span>
                      <span className="font-medium text-foreground">
                        {inc.replacementStaffName}
                      </span>
                    </div>
                  )}
                </div>

                {inc.reason && (
                  <p className="text-[11px] text-foreground leading-relaxed">
                    <span className="font-medium text-muted-foreground">
                      {isVi ? 'Lý do: ' : 'Reason: '}
                    </span>
                    {inc.reason}
                  </p>
                )}

                {inc.evidenceReferenceId && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <FileCheck2 className="h-3 w-3 text-primary" />
                    <span>
                      {isVi ? 'Mã minh chứng: ' : 'Evidence ref: '}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-foreground font-mono">
                        {inc.evidenceReferenceId}
                      </code>
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Non-punitive operational notice */}
      <div className="rounded border border-slate-100 bg-slate-50/60 p-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
        <span>
          {isVi
            ? 'Lưu ý: Dữ liệu sự cố phục vụ công tác điều phối vận hành ca trực, không tự động trừ lương hay thay đổi rate card.'
            : 'Notice: Incident records support operational scheduling and do not alter wage rates or payroll.'}
        </span>
      </div>
    </section>
  )
}
