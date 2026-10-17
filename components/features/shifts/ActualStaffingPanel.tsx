'use client'

import * as React from 'react'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  RefreshCw,
  Users,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import type { Shift, User as UserType } from '@/lib/types/database.types'
import { resolveSystemPermission } from '@/lib/permissions'
import {
  workforceService,
  workforceErrorMessage,
  type ActualSegment,
  type WorkforceRole,
} from '@/lib/services/workforceService'
import {
  resolveShiftPlannedInterval,
  evaluateLateness,
  evaluateEndVariance,
} from '@/lib/workforce/latenessPolicy'

interface ActualStaffingPanelProps {
  shift: Shift
  currentUser: UserType | null
}

export function ActualStaffingPanel({ shift }: ActualStaffingPanelProps) {
  const { currentUser, loading, error, capabilities, identityKey } = useWorkforceCapabilities()
  if (loading) return <p role="status" className="text-xs text-slate-500">Đang xác minh phiên đăng nhập và quyền truy cập...</p>
  if (error) return <p role="alert" className="text-xs text-rose-600">{error}</p>
  if (currentUser && !['admin', 'leader'].includes(resolveSystemPermission(currentUser))) {
    return <p role="alert" className="text-xs text-rose-600">Bạn không có quyền truy cập chấm công thực tế (403).</p>
  }
  if (!capabilities?.actual_staffing) {
    return <p role="status" className="text-xs text-slate-500">Chức năng Chấm công thực tế đang tắt. Vui lòng chờ cấu hình được phê duyệt.</p>
  }
  return <ActualStaffingWorkspace key={identityKey + ':' + shift.id} shift={shift} currentUser={currentUser} />
}

const roleLabels: Record<WorkforceRole, string> = {
  host: 'Host (Chính / Co-host)',
  support: 'Trợ livestream (Assistant)',
  technical: 'Kỹ thuật viên (Technical)',
}

const coverageLabels: Record<string, string> = {
  planned: 'Theo lịch phân công (Planned)',
  cover: 'Trực thay / Ca PASS (Cover)',
  replacement: 'Thay thế đổi ca (Replacement)',
  extra: 'Tăng cường / Co-Host (Extra)',
}

function ActualStaffingWorkspace({ shift, currentUser }: ActualStaffingPanelProps) {
  const { toast } = useToast()
  const permission = resolveSystemPermission(currentUser)
  const isSupervisor = permission === 'admin' || permission === 'leader'
  const isCompleted = shift.status === 'completed'

  const [segments, setSegments] = React.useState<ActualSegment[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [latenessPolicy, setLatenessPolicy] = React.useState<{ grace_minutes: number; policy_status: string } | null>(null)
  const [plannedStaffList, setPlannedStaffList] = React.useState<Array<{ id: string; user_id: string; operational_role: string; status: string }>>([])

  // Record Modal State
  const [isRecordOpen, setIsRecordOpen] = React.useState(false)
  const [recStaffId, setRecStaffId] = React.useState('')
  const [recRole, setRecRole] = React.useState<WorkforceRole>('host')
  const [recEventKind, setRecEventKind] = React.useState<'worked' | 'no_show'>('worked')
  const [recCoverageKind, setRecCoverageKind] = React.useState<'planned' | 'cover' | 'replacement' | 'extra'>('planned')
  const [recStartTime, setRecStartTime] = React.useState('')
  const [recEndTime, setRecEndTime] = React.useState('')
  const [recEvidenceNote, setRecEvidenceNote] = React.useState('')
  const [recSubmitting, setRecSubmitting] = React.useState(false)
  const [recError, setRecError] = React.useState<string | null>(null)

  // Review Modal State
  const [reviewingSegment, setReviewingSegment] = React.useState<ActualSegment | null>(null)
  const [revDecision, setRevDecision] = React.useState<'approved' | 'rejected'>('approved')
  const [revNote, setRevNote] = React.useState('')
  const [revSubmitting, setRevSubmitting] = React.useState(false)
  const [revError, setRevError] = React.useState<string | null>(null)

  const reload = React.useCallback(() => {
    setLoading(true)
    setLoadError(null)
    void workforceService.getActualSegments(shift.id)
      .then((res) => {
        setSegments(res.segments || [])
        if (res.lateness_policy) setLatenessPolicy(res.lateness_policy)
        if (res.planned_staff) setPlannedStaffList(res.planned_staff)
      })
      .catch((e) => setLoadError(workforceErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [shift.id])

  React.useEffect(() => {
    let ignore = false
    void workforceService.getActualSegments(shift.id)
      .then((res) => {
        if (!ignore) {
          setSegments(res.segments || [])
          if (res.lateness_policy) setLatenessPolicy(res.lateness_policy)
          if (res.planned_staff) setPlannedStaffList(res.planned_staff)
          setLoadError(null)
        }
      })
      .catch((e) => {
        if (!ignore) setLoadError(workforceErrorMessage(e))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [shift.id])

  const openRecordModal = (presetStaffId?: string, presetRole?: WorkforceRole) => {
    setRecStaffId(presetStaffId || shift.host_id || '')
    setRecRole(presetRole || 'host')
    setRecEventKind('worked')
    setRecCoverageKind('planned')

    try {
      const interval = resolveShiftPlannedInterval(shift)
      setRecStartTime(interval.startIso)
      setRecEndTime(interval.endIso)
    } catch {
      if (shift.date && shift.start_time) {
        setRecStartTime(`${shift.date}T${shift.start_time.slice(0, 5)}:00+07:00`)
      } else {
        setRecStartTime('')
      }
      if (shift.date && shift.end_time) {
        setRecEndTime(`${shift.date}T${shift.end_time.slice(0, 5)}:00+07:00`)
      } else {
        setRecEndTime('')
      }
    }

    setRecEvidenceNote('')
    setRecError(null)
    setIsRecordOpen(true)
  }

  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecError(null)

    if (!recStaffId.trim()) {
      setRecError('Vui lòng nhập Mã nhân sự (Staff ID).')
      return
    }

    if (!recEvidenceNote.trim() || recEvidenceNote.trim().length < 8) {
      setRecError('Ghi chú minh chứng phải có ít nhất 8 ký tự.')
      return
    }

    if (recEventKind === 'worked') {
      if (!recStartTime || !recEndTime) {
        setRecError('Ca có mặt làm việc bắt buộc phải có thời gian bắt đầu và kết thúc.')
        return
      }
      if (!Number.isFinite(Date.parse(recStartTime)) || !Number.isFinite(Date.parse(recEndTime)) || Date.parse(recEndTime) <= Date.parse(recStartTime)) {
        setRecError('Thời gian kết thúc phải sau thời gian bắt đầu.')
        return
      }
    }

    try {
      setRecSubmitting(true)
      await workforceService.recordActualSegment({
        shiftId: shift.id,
        staffId: recStaffId.trim(),
        operationalRole: recRole,
        eventKind: recEventKind,
        coverageKind: recCoverageKind,
        actualStartAt: recEventKind === 'worked' ? recStartTime : null,
        actualEndAt: recEventKind === 'worked' ? recEndTime : null,
        evidenceNote: recEvidenceNote.trim(),
      })

      toast({
        title: 'Ghi nhận chấm công thành công',
        description: 'Phân đoạn làm việc đã được tạo ở trạng thái Chờ duyệt (Draft).',
      })

      setIsRecordOpen(false)
      reload()
    } catch (err: unknown) {
      const msg = workforceErrorMessage(err)
      if (msg.includes('WORKFORCE_APPROVED_STAFF_OVERLAP')) {
        setRecError('Xung đột lịch: Nhân sự này đã có ca làm việc được duyệt trùng khung giờ.')
      } else if (msg.includes('WORKFORCE_APPROVED_NO_SHOW_CONFLICT')) {
        setRecError('Xung đột: Đã tồn tại bản ghi mâu thuẫn (vắng mặt/có mặt) được duyệt cho ca này.')
      } else if (msg.includes('WORKFORCE_PLANNED_STAFF_UNSCHEDULED')) {
        setRecError('Nhân sự này không có trong lịch phân công ban đầu của ca. Vui lòng chọn hình thức "Trực thay", "Thay thế đổi ca" hoặc "Tăng cường".')
      } else {
        setRecError(msg)
      }
    } finally {
      setRecSubmitting(false)
    }
  }

  const openReviewModal = (seg: ActualSegment) => {
    const isCreator = Boolean(
      currentUser && (
        (currentUser.id && seg.created_by === currentUser.id) ||
        (currentUser.auth_user_id && seg.created_by === currentUser.auth_user_id)
      )
    )
    if (isCreator) {
      toast({
        title: 'Không thể tự duyệt',
        description: 'Quy tắc phân lập trách nhiệm: Bạn không được tự duyệt biên bản do chính mình tạo.',
        variant: 'destructive',
      })
      return
    }
    setReviewingSegment(seg)
    setRevDecision('approved')
    setRevNote('')
    setRevError(null)
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewingSegment) return
    setRevError(null)

    const isCreator = Boolean(
      currentUser && (
        (currentUser.id && reviewingSegment.created_by === currentUser.id) ||
        (currentUser.auth_user_id && reviewingSegment.created_by === currentUser.auth_user_id)
      )
    )
    if (isCreator) {
      setRevError('Quy tắc kiểm soát: Bạn không thể tự duyệt biên bản do chính mình tạo.')
      return
    }

    if (!revNote.trim() || revNote.trim().length < 8) {
      setRevError('Ghi chú xét duyệt phải có ít nhất 8 ký tự.')
      return
    }

    try {
      setRevSubmitting(true)
      await workforceService.reviewActualSegment({
        segmentId: reviewingSegment.id,
        expectedVersion: reviewingSegment.version,
        decision: revDecision,
        reviewNote: revNote.trim(),
      })

      toast({
        title: 'Xét duyệt hoàn tất',
        description: `Phân đoạn chấm công đã được ${revDecision === 'approved' ? 'phê duyệt' : 'từ chối'}.`,
      })

      setReviewingSegment(null)
      reload()
    } catch (err: unknown) {
      const msg = workforceErrorMessage(err)
      if (msg.includes('WORKFORCE_ACTUAL_STALE_OR_LOCKED')) {
        setRevError('Dữ liệu đã bị thay đổi bởi người khác hoặc đã bị khóa. Vui lòng tải lại.')
      } else if (msg.includes('WORKFORCE_SELF_REVIEW_BLOCKED')) {
        setRevError('Quy tắc kiểm soát nội bộ: Không thể tự phê duyệt biên bản do chính mình tạo.')
      } else if (msg.includes('WORKFORCE_APPROVED_STAFF_OVERLAP')) {
        setRevError('Không thể duyệt: Nhân sự này đã có ca làm việc được duyệt trùng khung giờ.')
      } else if (msg.includes('WORKFORCE_APPROVED_NO_SHOW_CONFLICT')) {
        setRevError('Không thể duyệt: Đã tồn tại bản ghi đối lập được duyệt cho nhân sự này trong ca.')
      } else {
        setRevError(msg)
      }
    } finally {
      setRevSubmitting(false)
    }
  }

  const graceMinutes = latenessPolicy?.grace_minutes ?? 0

  function renderVarianceBadges(seg: ActualSegment) {
    if (seg.event_kind !== 'worked' || !seg.actual_start_at || !seg.actual_end_at) return null

    let plannedStartIso: string | null = null
    let plannedEndIso: string | null = null
    try {
      const planned = resolveShiftPlannedInterval(shift)
      plannedStartIso = planned.startIso
      plannedEndIso = planned.endIso
    } catch {
      if (shift.start_at && shift.end_at) {
        plannedStartIso = shift.start_at
        plannedEndIso = shift.end_at
      }
    }

    const badges = []
    if (plannedStartIso) {
      try {
        const lateness = evaluateLateness(seg.actual_start_at, plannedStartIso, graceMinutes)
        if (lateness.isOnTime) {
          badges.push(
            <span key="ontime" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
              Đúng giờ
            </span>
          )
        } else if (lateness.isWithinGrace) {
          badges.push(
            <span key="grace" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800" title={`Trễ ${lateness.actualLateMinutes} phút (trong ân hạn ${graceMinutes}p)`}>
              Trong ân hạn (+{lateness.actualLateMinutes}p &le; {graceMinutes}p)
            </span>
          )
        } else {
          badges.push(
            <span key="late" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-800" title={`Trễ thực tế: ${lateness.actualLateMinutes}p, vượt ân hạn: ${lateness.lateAfterGraceMinutes}p`}>
              Đi trễ (+{lateness.actualLateMinutes}p{graceMinutes > 0 ? `, vượt ${lateness.lateAfterGraceMinutes}p` : ''})
            </span>
          )
        }
      } catch {
        // invalid timestamps ignore
      }
    }

    if (plannedEndIso) {
      try {
        const endVar = evaluateEndVariance(seg.actual_end_at, plannedEndIso)
        if (endVar.overtimeMinutes > 0) {
          badges.push(
            <span key="ot" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
              +{endVar.overtimeMinutes}p tăng ca
            </span>
          )
        } else if (endVar.earlyDepartureMinutes > 0) {
          badges.push(
            <span key="early" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-800">
              Sớm {endVar.earlyDepartureMinutes}p
            </span>
          )
        }
      } catch {
        // invalid timestamps ignore
      }
    }

    if (badges.length === 0) return null
    return <div className="flex flex-wrap gap-1 mt-1">{badges}</div>
  }

  return (
    <div className="space-y-4">
      {/* Shift status gate check */}
      {!isCompleted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Ca livestream chưa hoàn thành (Chưa Completed)</span>
          </div>
          <p className="leading-relaxed">
            Hệ thống tuân thủ nguyên tắc kiểm soát nội bộ: <strong>Chỉ các ca đã hoàn thành (Status = completed) mới được phép ghi nhận và đối soát chấm công thực tế.</strong> Không tự động suy diễn ca chưa bắt đầu hoặc đang diễn ra thành vắng mặt (no-show).
          </p>
        </div>
      )}

      {/* Policy and Information Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <Info className="h-4 w-4 text-blue-600 shrink-0" />
          <span>
            Chính sách ân hạn điểm danh:{' '}
            <strong className="font-semibold">{graceMinutes} phút</strong>{' '}
            <span className="text-slate-500">
              ({latenessPolicy?.policy_status === 'configured' ? 'Đã cấu hình' : 'Chờ xác nhận chính sách công ty'})
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
          <span>Phân lập trách nhiệm: Người ghi nhận không thể tự phê duyệt</span>
        </div>
      </div>

      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Minh chứng & Chấm công thực tế (Actual Staffing)
          </h3>
          <p className="text-xs text-slate-500">
            Ghi nhận giờ làm việc thực tế, xử lý ca qua đêm, đổi ca, ca PASS và nhiều Host.
          </p>
        </div>

        {isCompleted && isSupervisor && (
          <div className="flex flex-wrap items-center gap-2">
            {shift.host_id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openRecordModal(shift.host_id, 'host')}
                className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                + Host chính
              </Button>
            )}
            {shift.support_id && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openRecordModal(shift.support_id, 'support')}
                className="h-8 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                + Trợ live
              </Button>
            )}
            {plannedStaffList
              .filter((p) => p.user_id !== shift.host_id && p.user_id !== shift.support_id && p.user_id !== shift.technical_id)
              .map((p) => (
                <Button
                  key={p.id}
                  size="sm"
                  variant="outline"
                  onClick={() => openRecordModal(p.user_id, p.operational_role as WorkforceRole)}
                  className="h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  + {p.operational_role}: {p.user_id}
                </Button>
              ))}
            <Button
              size="sm"
              onClick={() => openRecordModal()}
              className="h-8 bg-blue-600 hover:bg-blue-700 text-xs text-white"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ghi nhận chấm công
            </Button>
          </div>
        )}
      </div>

      {loadError && <p role="alert" className="text-xs text-rose-600">{loadError}</p>}

      {/* Segments Table */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-slate-50 font-semibold text-slate-600">
            <tr>
              <th className="px-3 py-2.5">Nhân sự</th>
              <th className="px-3 py-2.5">Vai trò</th>
              <th className="px-3 py-2.5">Sự kiện</th>
              <th className="px-3 py-2.5">Hình thức</th>
              <th className="px-3 py-2.5">Thời gian thực tế & Độ lệch</th>
              <th className="px-3 py-2.5">Minh chứng</th>
              <th className="px-3 py-2.5">Trạng thái duyệt</th>
              <th className="px-3 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadError ? (
              <tr><td colSpan={8} className="p-4 text-center text-slate-500">Không thể tải minh chứng. Hãy thử lại.</td></tr>
            ) : loading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  <RefreshCw className="mx-auto h-4 w-4 animate-spin text-blue-600" />
                  <span className="mt-1 block">Đang tải minh chứng...</span>
                </td>
              </tr>
            ) : segments.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-500">
                  Chưa có minh chứng chấm công (UNKNOWN). Hệ thống không tự suy diễn thành vắng mặt từ lịch ca.
                </td>
              </tr>
            ) : (
              segments.map((seg) => {
                const isCreator = Boolean(
                  currentUser && (
                    (currentUser.id && seg.created_by === currentUser.id) ||
                    (currentUser.auth_user_id && seg.created_by === currentUser.auth_user_id)
                  )
                )
                const isApproved = seg.review_status === 'approved'
                const isRejected = seg.review_status === 'rejected'
                const isDraftStatus = seg.review_status === 'draft'

                return (
                  <tr key={seg.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                      {seg.staff_id}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">
                      {roleLabels[seg.operational_role]}
                    </td>
                    <td className="px-3 py-2.5">
                      {seg.event_kind === 'worked' ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                          Có mặt (Worked)
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">
                          Vắng mặt (No-show)
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {coverageLabels[seg.coverage_kind] || seg.coverage_kind}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-700">
                      {seg.event_kind === 'worked' && seg.actual_start_at && seg.actual_end_at ? (
                        <div>
                          <span>
                            {new Date(seg.actual_start_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            {' → '}
                            {new Date(seg.actual_end_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {renderVarianceBadges(seg)}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Không có thời gian</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate text-slate-600" title={seg.evidence_note}>
                      {seg.evidence_note}
                    </td>
                    <td className="px-3 py-2.5">
                      {isApproved ? (
                        <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Đã duyệt (v{seg.version})</span>
                        </div>
                      ) : isRejected ? (
                        <div className="flex items-center gap-1 text-rose-700 font-semibold text-[11px]">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Bị từ chối (v{seg.version})</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-700 font-semibold text-[11px]">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Chờ duyệt (v{seg.version})</span>
                        </div>
                      )}
                      {seg.reviewed_by && (
                        <div className="text-[10px] text-slate-400">
                          Bởi {seg.reviewed_by}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isDraftStatus && isSupervisor && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isCreator}
                          onClick={() => openReviewModal(seg)}
                          className={`h-7 text-xs ${
                            isCreator ? 'opacity-50 cursor-not-allowed text-slate-400' : 'text-blue-600 hover:bg-blue-50'
                          }`}
                          title={isCreator ? 'Quy tắc phân lập trách nhiệm: Người tạo không thể tự duyệt' : 'Phê duyệt phân đoạn'}
                        >
                          {isCreator ? 'Không thể tự duyệt' : 'Xét duyệt'}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* RECORD ATTENDANCE MODAL */}
      <Dialog open={isRecordOpen} onOpenChange={setIsRecordOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Ghi nhận minh chứng chấm công thực tế
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Tạo bản ghi chấm công (Draft) đối soát với lịch ca. Yêu cầu một quản lý khác phê duyệt.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordSubmit} className="space-y-4 pt-2">
            {recError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{recError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="actualstaffingpanel-field-staff-id" className="text-xs font-semibold text-slate-700">
                  Mã nhân sự (Staff ID) <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="actualstaffingpanel-field-staff-id"
                  required
                  aria-label="Mã nhân sự"
                  placeholder="usr-xxx..."
                  value={recStaffId}
                  onChange={(e) => setRecStaffId(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Vai trò vận hành</label>
                <Select
                  value={recRole}
                  onValueChange={(val: WorkforceRole) => setRecRole(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Host (Chính / Co-host)</SelectItem>
                    <SelectItem value="support">Trợ livestream (Assistant)</SelectItem>
                    <SelectItem value="technical">Kỹ thuật viên (Technical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Sự kiện tham gia</label>
                <Select
                  value={recEventKind}
                  onValueChange={(val: 'worked' | 'no_show') => setRecEventKind(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worked">Có mặt làm việc (Worked)</SelectItem>
                    <SelectItem value="no_show">Vắng mặt (No-show)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Hình thức phân công</label>
                <Select
                  value={recCoverageKind}
                  onValueChange={(val: 'planned' | 'cover' | 'replacement' | 'extra') => setRecCoverageKind(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Theo lịch phân công (Planned)</SelectItem>
                    <SelectItem value="cover">Trực thay / Ca PASS (Cover)</SelectItem>
                    <SelectItem value="replacement">Thay thế đổi ca (Replacement)</SelectItem>
                    <SelectItem value="extra">Tăng cường / Co-Host (Extra)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {recEventKind === 'worked' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="actualstaffingpanel-field-start-time" className="text-xs font-semibold text-slate-700">
                    Bắt đầu thực tế (ISO) <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    id="actualstaffingpanel-field-start-time"
                    type="text"
                    required
                    aria-label="Bắt đầu thực tế"
                    placeholder="YYYY-MM-DDTHH:MM:SS+07:00"
                    value={recStartTime}
                    onChange={(e) => setRecStartTime(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="actualstaffingpanel-field-end-time" className="text-xs font-semibold text-slate-700">
                    Kết thúc thực tế (ISO) <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    id="actualstaffingpanel-field-end-time"
                    type="text"
                    required
                    aria-label="Kết thúc thực tế"
                    placeholder="YYYY-MM-DDTHH:MM:SS+07:00"
                    value={recEndTime}
                    onChange={(e) => setRecEndTime(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="actualstaffingpanel-field-evidence-note" className="text-xs font-semibold text-slate-700">
                Ghi chú minh chứng đối soát <span className="text-rose-500">*</span>
              </label>
              <Textarea
                id="actualstaffingpanel-field-evidence-note"
                required
                rows={2}
                placeholder="Ghi rõ nguồn kiểm tra: camera, nhật ký phiên live, biên bản ca..."
                value={recEvidenceNote}
                onChange={(e) => setRecEvidenceNote(e.target.value)}
                className="text-xs"
              />
              <span className="text-[10px] text-slate-400">
                Tối thiểu 8 ký tự. Ghi chú này là bất biến sau khi lưu.
              </span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRecordOpen(false)}
                disabled={recSubmitting}
                className="text-xs"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={recSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
              >
                {recSubmitting ? 'Đang lưu...' : 'Lưu chấm công'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REVIEW SEGMENT MODAL */}
      <Dialog open={Boolean(reviewingSegment)} onOpenChange={(open) => !open && setReviewingSegment(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Phê duyệt minh chứng chấm công
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Quyết định duyệt hoặc từ chối phân đoạn chấm công của nhân sự {reviewingSegment?.staff_id}.
            </DialogDescription>
          </DialogHeader>

          {reviewingSegment && (
            <form onSubmit={handleReviewSubmit} className="space-y-4 pt-2">
              {revError && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{revError}</span>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-1">
                <div>
                  <span className="text-slate-500">Minh chứng ghi nhận: </span>
                  <span className="font-medium text-slate-800">&ldquo;{reviewingSegment.evidence_note}&rdquo;</span>
                </div>
                <div>
                  <span className="text-slate-500">Người ghi nhận: </span>
                  <span className="font-mono text-slate-700">{reviewingSegment.created_by}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Quyết định xét duyệt</label>
                <Select
                  value={revDecision}
                  onValueChange={(val: 'approved' | 'rejected') => setRevDecision(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Phê duyệt (Approved)</SelectItem>
                    <SelectItem value="rejected">Từ chối (Rejected)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="actualstaffingpanel-field-review-note" className="text-xs font-semibold text-slate-700">
                  Ghi chú của người xét duyệt <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  id="actualstaffingpanel-field-review-note"
                  required
                  rows={2}
                  placeholder="Ghi rõ lý do phê duyệt hoặc từ chối (tối thiểu 8 ký tự)..."
                  value={revNote}
                  onChange={(e) => setRevNote(e.target.value)}
                  className="text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {revError && (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setReviewingSegment(null); reload() }}>
                    Tải lại minh chứng
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewingSegment(null)}
                  disabled={revSubmitting}
                  className="text-xs"
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={revSubmitting}
                  className={`text-xs text-white ${
                    revDecision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {revSubmitting ? 'Đang lưu...' : revDecision === 'approved' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
