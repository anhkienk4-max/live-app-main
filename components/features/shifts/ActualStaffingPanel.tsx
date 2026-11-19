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
  type ActualSegmentsResponse,
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
  const isAdmin = permission === 'admin'
  const isCompleted = shift.status === 'completed'
  const requiresPayrollFinal = shift.date >= '2026-11-10'

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
  const [confirmingPayrollSegment, setConfirmingPayrollSegment] = React.useState<ActualSegment | null>(null)
  const [payrollConfirmReason, setPayrollConfirmReason] = React.useState('')
  const [payrollConfirmError, setPayrollConfirmError] = React.useState<string | null>(null)
  const [payrollConfirmSubmitting, setPayrollConfirmSubmitting] = React.useState(false)
  const [overtimeSegment,setOvertimeSegment]=React.useState<ActualSegment|null>(null)
  const [overtimeStart,setOvertimeStart]=React.useState('')
  const [overtimeEnd,setOvertimeEnd]=React.useState('')
  const [overtimeDayClass,setOvertimeDayClass]=React.useState<'weekday'|'weekend'|'holiday'>('weekday')
  const [overtimeTimeClass,setOvertimeTimeClass]=React.useState<'day'|'night'>('day')
  const [overtimeReason,setOvertimeReason]=React.useState('')
  const [overtimeReceipt,setOvertimeReceipt]=React.useState('')
  const [overtimeError,setOvertimeError]=React.useState<string|null>(null)
  const [overtimeSubmitting,setOvertimeSubmitting]=React.useState(false)
  const [cancellationContext,setCancellationContext]=React.useState<ActualSegmentsResponse['cancellation_compensation_context']>()
  const [compensationOpen,setCompensationOpen]=React.useState(false)
  const [compensationCandidate,setCompensationCandidate]=React.useState('')
  const [compensationPeriod,setCompensationPeriod]=React.useState('')
  const [compensationReceipt,setCompensationReceipt]=React.useState('')
  const [compensationCancelReason,setCompensationCancelReason]=React.useState('')
  const [compensationReason,setCompensationReason]=React.useState('')
  const [compensationAmount,setCompensationAmount]=React.useState('')
  const [compensationError,setCompensationError]=React.useState<string|null>(null)
  const [compensationSubmitting,setCompensationSubmitting]=React.useState(false)
  const [compensationIntentLocked,setCompensationIntentLocked]=React.useState(false)
  const compensationIntent=React.useRef<{payload:string;idempotencyKey:string}|null>(null)
  const compensationSubmitLock=React.useRef(false)

  const compensationCandidates = React.useMemo(() => [
    ...segments.filter(segment => segment.event_kind === 'worked' && segment.review_status === 'approved'
      && segment.actual_start_at && segment.actual_end_at)
      .map(segment => ({
        value: `segment:${segment.id}`,
        staffId: segment.staff_id,
        role: segment.operational_role,
        actualSegmentId: segment.id,
        registrationId: null,
        label: `${segment.staff_id} · ${roleLabels[segment.operational_role]} · ${Math.max(0, Math.floor((Date.parse(segment.actual_end_at!) - Date.parse(segment.actual_start_at!)) / 1000))} giây đã duyệt`,
      })),
    ...(cancellationContext?.registrations ?? []).map(registration => ({
      value: `registration:${registration.id}`,
      staffId: registration.user_id,
      role: registration.operational_role,
      actualSegmentId: null,
      registrationId: registration.id,
      label: `${registration.user_id} · ${roleLabels[registration.operational_role]} · chưa ghi nhận thời gian làm`,
    })),
  ], [segments, cancellationContext])

  const reload = React.useCallback(() => {
    setLoading(true)
    setLoadError(null)
    void workforceService.getActualSegments(shift.id)
      .then((res) => {
        setSegments(res.segments || [])
        setCancellationContext(res.cancellation_compensation_context)
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
          setCancellationContext(res.cancellation_compensation_context)
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

        const isException = Boolean(
      reviewingSegment.coverage_verification?.is_exception ||
      reviewingSegment.evidence_note.includes('[EXCEPTION')
    )

    if (isException && revDecision === 'approved' && revNote.trim().length < 15) {
      setRevError('Phê duyệt hồ sơ diện ngoại lệ bắt buộc phải có ghi chú giải trình tối thiểu 15 ký tự.')
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
      } else if (msg.includes('WORKFORCE_EXCEPTION_APPROVAL_NOTE_REQUIRED')) {
        setRevError('Phê duyệt ngoại lệ yêu cầu ghi chú giải trình ít nhất 15 ký tự.')
      } else if (msg.includes('WORKFORCE_PLANNED_STAFF_UNSCHEDULED')) {
        setRevError('Không thể phê duyệt: Ca theo lịch (Planned) không có trong danh sách phân công chính thức.')
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

  const handlePayrollConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmingPayrollSegment || payrollConfirmReason.trim().length < 8) return
    setPayrollConfirmSubmitting(true)
    setPayrollConfirmError(null)
    try {
      const result = await workforceService.confirmPayrollSegment({
        segmentId: confirmingPayrollSegment.id,
        expectedVersion: confirmingPayrollSegment.payroll_decision?.version ?? 0,
        idempotencyKey: crypto.randomUUID(),
        reason: payrollConfirmReason.trim(),
      })
      if (result.decision.state === 'payroll_hold') {
        toast({
          title: 'Payroll vẫn đang HOLD',
          description: result.decision.missing_evidence.join(', ') || 'Cần bổ sung minh chứng bắt buộc.',
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Admin đã xác nhận Payroll', description: 'Quyết định được lưu cùng lịch sử kiểm toán.' })
      }
      setConfirmingPayrollSegment(null)
      setPayrollConfirmReason('')
      reload()
    } catch (err: unknown) {
      setPayrollConfirmError(workforceErrorMessage(err))
    } finally {
      setPayrollConfirmSubmitting(false)
    }
  }

  const handleOvertimeSubmit=async(event:React.FormEvent)=>{
    event.preventDefault()
    const segment=overtimeSegment
    if(!segment||!segment.actual_start_at||!segment.actual_end_at)return
    setOvertimeError(null)
    const vnInstant=(value:string)=>new Date(`${value}${value.length===16?':00':''}+07:00`).toISOString()
    try{
      const start=vnInstant(overtimeStart),end=vnInstant(overtimeEnd)
      if(Date.parse(start)<Date.parse(segment.actual_start_at)||Date.parse(end)>Date.parse(segment.actual_end_at)||Date.parse(end)<=Date.parse(start))
        throw new Error('Khoảng OT phải nằm trong giờ thực tế đã duyệt của phân đoạn.')
      setOvertimeSubmitting(true)
      await workforceService.requestOvertime({segmentId:segment.id,startAt:start,endAt:end,
        dayClass:overtimeDayClass,timeClass:overtimeTimeClass,reason:overtimeReason.trim(),
        evidenceReceiptId:overtimeReceipt.trim(),idempotencyKey:crypto.randomUUID()})
      toast({title:'Đã gửi đề xuất OT',description:'OT chỉ được tính sau khi Admin xác nhận rate card hiệu lực.'})
      setOvertimeSegment(null)
      reload()
    }catch(error){setOvertimeError(error instanceof Error?error.message:workforceErrorMessage(error))}
    finally{setOvertimeSubmitting(false)}
  }

  const handleOvertimeDecision=async(decision:'leader_preapprove'|'admin_confirm'|'reject')=>{
    const request=overtimeSegment?.overtime_request
    if(!request)return
    setOvertimeError(null)
    try{
      setOvertimeSubmitting(true)
      await workforceService.decideOvertimeRequest({requestId:request.id,expectedVersion:request.version,
        decision,reason:overtimeReason.trim(),idempotencyKey:crypto.randomUUID()})
      toast({title:decision==='admin_confirm'?'OT đã được Admin xác nhận':'Đã lưu quyết định OT'})
      setOvertimeSegment(null)
      reload()
    }catch(error){setOvertimeError(workforceErrorMessage(error))}
    finally{setOvertimeSubmitting(false)}
  }

  const handleCompensationSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (compensationSubmitLock.current || !cancellationContext?.available) return
    const candidate = compensationCandidates.find(item => item.value === compensationCandidate)
    const amount = Number(compensationAmount)
    if (!candidate || !compensationPeriod || !compensationReceipt
      || !compensationCancelReason.trim() || compensationCancelReason.trim().length < 8
      || compensationReason.trim().length < 8 || !Number.isSafeInteger(amount)
      || amount < 1 || amount > 1_000_000_000_000) {
      setCompensationError('Chọn nhân sự, kỳ lương và bằng chứng đã xác minh; nhập số tiền VND hợp lệ cùng lý do hủy và lý do đề xuất (mỗi lý do tối thiểu 8 ký tự).')
      return
    }
    const payload = {
      shiftId: shift.id,
      staffId: candidate.staffId,
      operationalRole: candidate.role,
      actualSegmentId: candidate.actualSegmentId,
      registrationId: candidate.registrationId,
      periodId: compensationPeriod,
      cancellationReason: compensationCancelReason.trim(),
      reason: compensationReason.trim(),
      evidenceReceiptId: compensationReceipt,
      proposedAmountVnd: amount,
    }
    const fingerprint = JSON.stringify(payload)
    if (compensationIntent.current && compensationIntent.current.payload !== fingerprint) {
      setCompensationError('Đề xuất trước có thể đã được ghi nhận. Không đổi nội dung khi retry; hãy tải lại và kiểm tra danh sách trước khi tạo đề xuất mới.')
      return
    }
    compensationIntent.current ??= { payload: fingerprint, idempotencyKey: crypto.randomUUID() }
    setCompensationIntentLocked(true)
    compensationSubmitLock.current = true
    setCompensationSubmitting(true)
    setCompensationError(null)
    try {
      await workforceService.proposeCancellationCompensation({ ...payload, idempotencyKey: compensationIntent.current.idempotencyKey })
      compensationIntent.current = null
      setCompensationIntentLocked(false)
      setCompensationOpen(false)
      setCompensationCandidate('')
      setCompensationPeriod('')
      setCompensationReceipt('')
      setCompensationCancelReason('')
      setCompensationReason('')
      setCompensationAmount('')
      toast({ title: isAdmin ? 'Đã lưu khoản hỗ trợ' : 'Đã gửi đề xuất cho Admin', description: isAdmin ? 'Khoản hỗ trợ được ghi nhận qua xác nhận Admin.' : 'Leader không thể xác nhận cuối khoản hỗ trợ.' })
      reload()
    } catch (error) {
      setCompensationError(workforceErrorMessage(error))
    } finally {
      compensationSubmitLock.current = false
      setCompensationSubmitting(false)
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
        {shift.status === 'cancelled' && isSupervisor && cancellationContext?.available && compensationCandidates.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => { setCompensationOpen(true); setCompensationError(null) }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Đề xuất hỗ trợ hủy ca
          </Button>
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
                      <div>{coverageLabels[seg.coverage_kind] || seg.coverage_kind}</div>
                      {(seg.coverage_verification?.is_exception || seg.evidence_note.includes('[EXCEPTION')) && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 mt-0.5" title={`Ngoại lệ chưa xác minh qua lịch/đổi ca (${seg.coverage_verification?.matched_source || 'unverified'})`}>
                          Diện ngoại lệ
                        </span>
                      )}
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
                      {isApproved && seg.payroll_decision?.state === 'payroll_hold' ? (
                        <div className="space-y-1 text-rose-700">
                          <div className="flex items-center gap-1 font-semibold text-[11px]"><AlertTriangle className="h-3.5 w-3.5" />PAYROLL_HOLD</div>
                          <span className="block max-w-48 text-[10px]">Thiếu: {seg.payroll_decision.missing_evidence.join(', ') || 'Admin confirmation'}</span>
                        </div>
                      ) : isApproved && seg.payroll_decision?.state === 'pending_admin_confirmation' ? (
                        <div className="flex items-center gap-1 text-amber-700 font-semibold text-[11px]"><Clock className="h-3.5 w-3.5" />Chờ Admin xác nhận Payroll</div>
                      ) : isApproved && seg.payroll_decision?.state === 'admin_confirmed' ? (
                        <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]"><CheckCircle2 className="h-3.5 w-3.5" />Admin đã xác nhận Payroll</div>
                      ) : isApproved ? (
                        <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{requiresPayrollFinal ? 'Giờ thực tế đã duyệt; chưa xác nhận Payroll' : `Đã duyệt (v${seg.version})`}</span>
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
                      {isApproved&&seg.event_kind==='worked'&&requiresPayrollFinal&&seg.overtime_request?(
                        <div className="mt-1 text-[10px] text-slate-600">OT {seg.overtime_request.day_class}/{seg.overtime_request.time_class} · {seg.overtime_request.state==='admin_confirmed'?'Admin đã duyệt':seg.overtime_request.state==='rejected'?'Đã từ chối':seg.overtime_request.leader_preapproved_by?'Chờ Admin xác nhận':'Chờ xem xét'} · {seg.overtime_request.overtime_seconds}s</div>
                      ):null}
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
                      {isSupervisor&&isApproved&&seg.event_kind==='worked'&&requiresPayrollFinal&&!seg.overtime_request&&seg.overtime_available!==false&&(
                        <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={()=>{
                          setOvertimeSegment(seg);setOvertimeStart('');setOvertimeEnd('');setOvertimeDayClass('weekday');
                          setOvertimeTimeClass('day');setOvertimeReason('');setOvertimeReceipt('');setOvertimeError(null)
                        }}>Đề xuất OT</Button>
                      )}
                      {isAdmin&&seg.overtime_request?.state==='pending_admin_confirmation'&&(
                        <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={()=>{
                          setOvertimeSegment(seg);setOvertimeReason('Admin xác nhận OT đã đối chiếu');setOvertimeError(null)
                        }}>Duyệt OT</Button>
                      )}
                      {permission==='leader'&&seg.overtime_request?.state==='pending_admin_confirmation'&&!seg.overtime_request.leader_preapproved_by&&(
                        <Button size="sm" variant="outline" className="mt-1 h-7 text-xs" onClick={()=>{
                          setOvertimeSegment(seg);setOvertimeReason('Leader đã đối chiếu đề xuất OT');setOvertimeError(null)
                        }}>Duyệt sơ bộ OT</Button>
                      )}
                      {isAdmin && requiresPayrollFinal && isApproved && seg.event_kind === 'worked'
                        && seg.payroll_decision?.state !== 'admin_confirmed'
                        && seg.payroll_decision_available !== false && (
                        <Button size="sm" variant="outline" className="mt-1 h-7 text-xs"
                          onClick={() => {
                            setConfirmingPayrollSegment(seg)
                            setPayrollConfirmReason('')
                            setPayrollConfirmError(null)
                          }}>
                          Xác nhận Payroll
                        </Button>
                      )}
                      {isAdmin && requiresPayrollFinal && isApproved && seg.payroll_decision_available === false && (
                        <span className="block text-[10px] text-rose-700">Migration C5.15 chưa khả dụng</span>
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

              {(reviewingSegment.coverage_verification?.is_exception || reviewingSegment.evidence_note.includes('[EXCEPTION')) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-2.5 text-xs text-amber-900 space-y-1">
                  <div className="flex items-center gap-1 font-semibold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <span>Hồ sơ chấm công diện NGOẠI LỆ</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Nguồn xác minh: <span className="font-mono">{reviewingSegment.coverage_verification?.matched_source || 'unverified_exception'}</span>
                  </p>
                  <p className="text-[11px] text-amber-900 font-medium">
                    * Lưu ý xét duyệt: Ca ngoại lệ bắt buộc phải có giải trình lý do phê duyệt tối thiểu 15 ký tự.
                  </p>
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

      <Dialog open={Boolean(confirmingPayrollSegment)} onOpenChange={(open) => !open && setConfirmingPayrollSegment(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>Xác nhận Payroll cho phân đoạn</DialogTitle>
            <DialogDescription>
              Chỉ Admin có quyền Payroll mới có thể xác nhận cuối. Máy chủ sẽ kiểm tra lại Attendance, báo cáo cuối và KV/Visibility đã lưu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayrollConfirm} className="space-y-4">
            {payrollConfirmError && <p role="alert" className="text-sm text-rose-700">{payrollConfirmError}</p>}
            <p className="text-xs text-slate-600">Nhân sự: {confirmingPayrollSegment?.staff_id} · {confirmingPayrollSegment?.operational_role}</p>
            <label htmlFor="actualstaffingpanel-payroll-confirm-reason" className="text-xs font-semibold">Lý do xác nhận</label>
            <Textarea id="actualstaffingpanel-payroll-confirm-reason" value={payrollConfirmReason}
              onChange={event => setPayrollConfirmReason(event.target.value)} minLength={8} maxLength={2000} required />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmingPayrollSegment(null)}>Đóng</Button>
              <Button type="submit" disabled={payrollConfirmSubmitting || payrollConfirmReason.trim().length < 8}>
                {payrollConfirmSubmitting ? 'Đang kiểm tra...' : 'Xác nhận và kiểm tra HOLD'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(overtimeSegment)} onOpenChange={open=>!open&&!overtimeSubmitting&&setOvertimeSegment(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg">
          <DialogHeader><DialogTitle>Phê duyệt tăng ca có cấu trúc</DialogTitle>
            <DialogDescription>OT chỉ tính trong giờ thực tế đã duyệt, theo rate card Admin đã cấu hình và xác nhận. Không có rate hợp lệ thì OT không được tính.</DialogDescription>
          </DialogHeader>
          {overtimeError?<p role="alert" className="text-sm text-rose-700">{overtimeError}</p>:null}
          {overtimeSegment?.overtime_request? <div className="space-y-3 text-sm">
            <p>Nhân sự {overtimeSegment.staff_id} · {overtimeSegment.operational_role} · {overtimeSegment.overtime_request.day_class}/{overtimeSegment.overtime_request.time_class} · {overtimeSegment.overtime_request.overtime_seconds} giây</p>
            <p>Trạng thái: {overtimeSegment.overtime_request.state}. Rate card: {overtimeSegment.overtime_request.rate_card_id??'chưa xác nhận'}.</p>
            <Textarea aria-label="Lý do quyết định OT" minLength={8} maxLength={2000} value={overtimeReason} onChange={e=>setOvertimeReason(e.target.value)} />
            <DialogFooter>
              {permission==='leader'&&!overtimeSegment.overtime_request.leader_preapproved_by?<Button type="button" variant="outline" disabled={overtimeSubmitting||overtimeReason.trim().length<8} onClick={()=>void handleOvertimeDecision('leader_preapprove')}>Duyệt sơ bộ</Button>:null}
              {isAdmin?<><Button type="button" variant="outline" disabled={overtimeSubmitting||overtimeReason.trim().length<8} onClick={()=>void handleOvertimeDecision('reject')}>Từ chối</Button><Button type="button" disabled={overtimeSubmitting||overtimeReason.trim().length<8} onClick={()=>void handleOvertimeDecision('admin_confirm')}>Admin xác nhận</Button></>:null}
            </DialogFooter>
          </div>:<form onSubmit={handleOvertimeSubmit} className="space-y-3">
            <p className="text-xs text-slate-600">{overtimeSegment?.staff_id} · {overtimeSegment?.operational_role}. Phân loại thời gian là đề xuất có cấu trúc và được người duyệt đối chiếu.</p>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs">Bắt đầu OT (giờ Việt Nam)<Input type="datetime-local" step="1" required value={overtimeStart} onChange={e=>setOvertimeStart(e.target.value)} /></label>
              <label className="text-xs">Kết thúc OT (giờ Việt Nam)<Input type="datetime-local" step="1" required value={overtimeEnd} onChange={e=>setOvertimeEnd(e.target.value)} /></label></div>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs">Ngày<select className="mt-1 block w-full rounded border p-2" value={overtimeDayClass} onChange={e=>setOvertimeDayClass(e.target.value as typeof overtimeDayClass)}><option value="weekday">Ngày thường</option><option value="weekend">Cuối tuần</option><option value="holiday">Ngày lễ</option></select></label>
              <label className="text-xs">Khung giờ<select className="mt-1 block w-full rounded border p-2" value={overtimeTimeClass} onChange={e=>setOvertimeTimeClass(e.target.value as typeof overtimeTimeClass)}><option value="day">Ban ngày</option><option value="night">Ban đêm</option></select></label></div>
            <Input required minLength={1} maxLength={120} aria-label="ID biên nhận minh chứng OT đã xác minh" placeholder="ID biên nhận file có SHA-256 đã xác minh" value={overtimeReceipt} onChange={e=>setOvertimeReceipt(e.target.value)} />
            <Textarea required minLength={8} maxLength={2000} aria-label="Lý do đề xuất OT" placeholder="Lý do và căn cứ đề xuất OT" value={overtimeReason} onChange={e=>setOvertimeReason(e.target.value)} />
            <DialogFooter><Button type="button" variant="outline" disabled={overtimeSubmitting} onClick={()=>setOvertimeSegment(null)}>Hủy</Button><Button type="submit" disabled={overtimeSubmitting}>{overtimeSubmitting?'Đang gửi…':'Gửi đề xuất'}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={compensationOpen} onOpenChange={open => !compensationSubmitting && setCompensationOpen(open)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>Đề xuất hỗ trợ do Brand/ADA hủy ca</DialogTitle>
            <DialogDescription>Giờ thực tế đã duyệt được giữ riêng. Thời gian chưa làm không tự sinh lương và không có mức hỗ trợ tối thiểu. {isAdmin ? 'Đề xuất Admin gửi được xác nhận trực tiếp theo quyền hiện có.' : 'Đề xuất của Leader chỉ có hiệu lực sau Admin xác nhận.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompensationSubmit} className="space-y-3">
            {compensationError && <p role="alert" className="text-sm text-rose-700">{compensationError}</p>}
            <label className="block space-y-1 text-xs">Nhân sự và thời gian thực tế
              <select required disabled={compensationIntentLocked || compensationSubmitting} value={compensationCandidate} onChange={event => setCompensationCandidate(event.target.value)} className="block w-full rounded border bg-white px-3 py-2 text-sm">
                <option value="">Chọn hồ sơ</option>{compensationCandidates.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs">Kỳ Payroll
              <select required disabled={compensationIntentLocked || compensationSubmitting} value={compensationPeriod} onChange={event => setCompensationPeriod(event.target.value)} className="block w-full rounded border bg-white px-3 py-2 text-sm">
                <option value="">Chọn kỳ đang mở</option>{cancellationContext?.periods.map(period => <option key={period.id} value={period.id}>{period.period_start} → {period.period_end}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs">Bằng chứng lưu trữ đã xác minh
              <select required disabled={compensationIntentLocked || compensationSubmitting} value={compensationReceipt} onChange={event => setCompensationReceipt(event.target.value)} className="block w-full rounded border bg-white px-3 py-2 text-sm">
                <option value="">Chọn biên nhận</option>{cancellationContext?.evidence_receipts.map(receipt => <option key={receipt.id} value={receipt.id}>{receipt.created_at} · {receipt.id}</option>)}
              </select>
            </label>
            <Input required minLength={8} maxLength={2000} disabled={compensationIntentLocked || compensationSubmitting} aria-label="Lý do hủy ca" placeholder="Lý do Brand/ADA hủy ca" value={compensationCancelReason} onChange={event => setCompensationCancelReason(event.target.value)} />
            <Input required type="number" min={1} max={1_000_000_000_000} step={1} inputMode="numeric" disabled={compensationIntentLocked || compensationSubmitting} aria-label="Khoản hỗ trợ đề xuất VND" placeholder="Số tiền đề xuất (VND), không có mức mặc định" value={compensationAmount} onChange={event => setCompensationAmount(event.target.value)} />
            <Textarea required minLength={8} maxLength={2000} disabled={compensationIntentLocked || compensationSubmitting} aria-label="Lý do đề xuất hỗ trợ" placeholder="Căn cứ đề xuất, tối thiểu 8 ký tự" value={compensationReason} onChange={event => setCompensationReason(event.target.value)} />
            {compensationIntentLocked && <p role="status" className="text-xs text-amber-700">Retry sẽ gửi nguyên payload với cùng idempotency key. Không chỉnh nội dung cho đến khi xác định kết quả lần gửi trước.</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={compensationSubmitting} onClick={() => setCompensationOpen(false)}>Đóng</Button>
              <Button type="submit" disabled={compensationSubmitting || !cancellationContext?.available}>{compensationSubmitting ? 'Đang gửi…' : 'Gửi để Admin xác nhận'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
