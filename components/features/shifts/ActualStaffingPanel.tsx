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

function ActualStaffingWorkspace({ shift, currentUser }: ActualStaffingPanelProps) {
  const { toast } = useToast()
  const permission = resolveSystemPermission(currentUser)
  const isSupervisor = permission === 'admin' || permission === 'leader'
  const isCompleted = shift.status === 'completed'

  const [segments, setSegments] = React.useState<ActualSegment[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

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

  const readSequence = React.useRef(0)
  const loadSegments = React.useCallback(async () => {
    const sequence = ++readSequence.current
    setSegments([])
    setLoading(true)
    setLoadError(null)
    try {
      const res = await workforceService.getActualSegments(shift.id)
      if (sequence !== readSequence.current) return
      setSegments(res.segments)
    } catch (err: unknown) {
      if (sequence !== readSequence.current) return
      setSegments([])
      setLoadError(workforceErrorMessage(err))
      toast({
        title: 'Không thể tải minh chứng chấm công',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      if (sequence === readSequence.current) setLoading(false)
    }
  }, [shift.id, toast])

  React.useEffect(() => {
    const generation = readSequence
    const frame = requestAnimationFrame(() => {
      void loadSegments()
    })
    return () => { cancelAnimationFrame(frame); generation.current++ }
  }, [loadSegments])

  // Scheduled staff for quick selection
  const scheduledStaffOptions = [
    { role: 'host' as const, id: shift.host_id, label: 'Host chính' },
    { role: 'support' as const, id: shift.support_id, label: 'Trợ livestream' },
    { role: 'technical' as const, id: shift.technical_id, label: 'Kỹ thuật' },
  ].filter(s => Boolean(s.id))

  // Pre-fill time when opening record modal
  const openRecordModal = () => {
    setRecStaffId(shift.host_id || '')
    setRecRole('host')
    setRecEventKind('worked')
    setRecCoverageKind('planned')
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
      loadSegments()
    } catch (err: unknown) {
      setRecError(workforceErrorMessage(err))
    } finally {
      setRecSubmitting(false)
    }
  }

  const openReviewModal = (seg: ActualSegment) => {
    setReviewingSegment(seg)
    setRevDecision('approved')
    setRevNote('')
    setRevError(null)
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewingSegment) return
    setRevError(null)

    if (!revNote.trim() || revNote.trim().length < 8) {
      setRevError('Ghi chú phê duyệt phải có ít nhất 8 ký tự.')
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
        title: revDecision === 'approved' ? 'Đã phê duyệt minh chứng' : 'Đã từ chối minh chứng',
        description: `Phân đoạn chấm công đã được cập nhật trạng thái ${revDecision}.`,
      })

      setReviewingSegment(null)
      loadSegments()
    } catch (err: unknown) {
      setRevError(workforceErrorMessage(err))
    } finally {
      setRevSubmitting(false)
    }
  }

  const roleLabels: Record<WorkforceRole, string> = {
    host: 'Host',
    support: 'Trợ lý',
    technical: 'Kỹ thuật',
  }

  const coverageLabels: Record<string, string> = {
    planned: 'Theo lịch',
    cover: 'Trực thay (Ca PASS)',
    replacement: 'Thay thế (Đổi ca)',
    extra: 'Tăng cường / Co-Host',
  }

  // Detect Multi-Host / Co-Hosting
  const hostWorkedSegments = segments.filter(s => s.operational_role === 'host' && s.event_kind === 'worked')
  const isMultiHost = hostWorkedSegments.length > 1

  // Compute variance badges for display
  function renderVarianceBadges(seg: ActualSegment) {
    if (seg.event_kind !== 'worked' || !seg.actual_start_at || !seg.actual_end_at) return null
    const actualStart = Date.parse(seg.actual_start_at)
    const actualEnd = Date.parse(seg.actual_end_at)
    const plannedStart = shift.start_at ? Date.parse(shift.start_at) : null
    const plannedEnd = shift.end_at ? Date.parse(shift.end_at) : null

    const badges = []
    if (plannedStart && Number.isFinite(actualStart)) {
      const startDiff = Math.round((actualStart - plannedStart) / 60000)
      if (startDiff > 15) {
        badges.push(
          <span key="late" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
            Trễ {startDiff}p
          </span>
        )
      } else if (startDiff <= 0) {
        badges.push(
          <span key="ontime" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
            Đúng giờ
          </span>
        )
      }
    }
    if (plannedEnd && Number.isFinite(actualEnd)) {
      const endDiff = Math.round((actualEnd - plannedEnd) / 60000)
      if (endDiff > 0) {
        badges.push(
          <span key="ot" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
            +{endDiff}p tăng ca
          </span>
        )
      } else if (endDiff < -15) {
        badges.push(
          <span key="early" className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-800">
            Sớm {Math.abs(endDiff)}p
          </span>
        )
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
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>Ca làm việc chưa hoàn thành (Chưa thể chấm công)</span>
          </div>
          <p className="leading-relaxed">
            Chỉ ca làm việc có trạng thái <strong>Hoàn thành (Completed)</strong> mới có thể ghi nhận chấm công thực tế và phê duyệt thanh toán. Trạng thái hiện tại: <span className="font-mono uppercase font-semibold">{shift.status}</span>.
          </p>
        </div>
      )}

      {/* Multi-Host Information Alert */}
      {isMultiHost && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3 text-xs text-indigo-800 flex items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-indigo-600" />
          <span>
            <strong>Ca có nhiều Host (Co-Hosting / Chia ca):</strong> Phát hiện {hostWorkedSegments.length} phân đoạn Host làm việc. Các phân đoạn được tính toán độc lập theo từng nhân sự.
          </span>
        </div>
      )}

      {/* Header & Record Button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Chấm công thực tế & Phê duyệt độc lập (RC1.7A)
          </h4>
          <p className="text-xs text-slate-500">
            Minh chứng thời gian làm việc thực tế, vắng mặt có lý do và phân đoạn tăng ca / trực thay.
          </p>
        </div>

        {isCompleted && isSupervisor && (
          <Button
            size="sm"
            onClick={openRecordModal}
            className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ghi nhận chấm công
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
                const isCreator = Boolean(currentUser?.id && seg.created_by === currentUser.id)
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
                          title={isCreator ? 'Quy định phân lập trách nhiệm: Người tạo không thể tự duyệt' : 'Phê duyệt phân đoạn'}
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Ghi nhận chấm công ca làm việc
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Ghi nhận thời gian có mặt thực tế hoặc xác nhận vắng mặt kèm minh chứng đối soát.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordSubmit} className="space-y-4 pt-2">
            {recError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{recError}</span>
              </div>
            )}

            {/* Quick selection chips for scheduled staff */}
            {scheduledStaffOptions.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-600">Chọn nhanh theo lịch ca:</label>
                <div className="flex flex-wrap gap-1.5">
                  {scheduledStaffOptions.map(st => (
                    <button
                      key={st.role + '-' + st.id}
                      type="button"
                      onClick={() => {
                        setRecStaffId(st.id!)
                        setRecRole(st.role)
                        setRecCoverageKind('planned')
                      }}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        recStaffId === st.id && recRole === st.role
                          ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}: {st.id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="actualstaffingpanel-field-1" className="text-xs font-semibold text-slate-700">
                  Mã nhân sự (Staff ID) <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="actualstaffingpanel-field-1"
                  type="text"
                  required
                  placeholder="Nhập staff_id..."
                  value={recStaffId}
                  onChange={(e) => setRecStaffId(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Vai trò</label>
                <Select value={recRole} onValueChange={(val: WorkforceRole) => setRecRole(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Host (Live chính / Co-Host)</SelectItem>
                    <SelectItem value="support">Trợ lý (Assistant live)</SelectItem>
                    <SelectItem value="technical">Kỹ thuật (OBS / Mạng)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Sự kiện có mặt</label>
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
                    <SelectItem value="planned">Theo lịch (Planned)</SelectItem>
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
                  <label htmlFor="actualstaffingpanel-field-2" className="text-xs font-semibold text-slate-700">
                    Bắt đầu thực tế (ISO) <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    id="actualstaffingpanel-field-2"
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
                  <label htmlFor="actualstaffingpanel-field-3" className="text-xs font-semibold text-slate-700">
                    Kết thúc thực tế (ISO) <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    id="actualstaffingpanel-field-3"
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
              <label htmlFor="actualstaffingpanel-field-4" className="text-xs font-semibold text-slate-700">
                Ghi chú minh chứng đối soát <span className="text-rose-500">*</span>
              </label>
              <Textarea
                id="actualstaffingpanel-field-4"
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
                <label htmlFor="actualstaffingpanel-field-5" className="text-xs font-semibold text-slate-700">
                  Ghi chú của người xét duyệt <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  id="actualstaffingpanel-field-5"
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
                  <Button type="button" variant="outline" size="sm" onClick={() => { setReviewingSegment(null); void loadSegments() }}>
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
