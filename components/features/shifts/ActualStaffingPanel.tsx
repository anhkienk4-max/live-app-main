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
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { actualPickerInstant, actualPickerValue } from '@/lib/workforce/actualTime'
import type { ShiftRegistration, Shift, User as UserType } from '@/lib/types/database.types'
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
  users?: UserType[]
  registrations?: ShiftRegistration[]
}

export function ActualStaffingPanel({ shift, users, registrations }: ActualStaffingPanelProps) {
  const { currentUser, loading, error, capabilities, identityKey } = useWorkforceCapabilities()
  if (loading) return <p role="status">Đang xác minh phiên đăng nhập và quyền truy cập…</p>
  if (error) return <p role="alert">{error}</p>
  if (currentUser && !['admin', 'leader'].includes(resolveSystemPermission(currentUser))) return <p role="alert">Bạn không có quyền truy cập chấm công thực tế (403).</p>
  if (!capabilities?.actual_staffing) return <p role="status">Chấm công thực tế đang tắt. Vui lòng chờ cấu hình được phê duyệt.</p>
  return <ActualStaffingWorkspace key={identityKey + ':' + shift.id} shift={shift} currentUser={currentUser} users={users} registrations={registrations} />
}

function ActualStaffingWorkspace({ shift, currentUser, users = [], registrations = [] }: ActualStaffingPanelProps) {
  const { toast } = useToast()
  const permission = resolveSystemPermission(currentUser)
  const isSupervisor = permission === 'admin' || permission === 'leader'
  const isCompleted = shift.status === 'completed'

  const [segments, setSegments] = React.useState<ActualSegment[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  // Record Modal State
  const [isRecordOpen, setIsRecordOpen] = React.useState(false)
  const [amending, setAmending] = React.useState<ActualSegment | null>(null)
  const [amendReason, setAmendReason] = React.useState('')
  const [recConflict, setRecConflict] = React.useState(false)
  const intent = React.useRef<{ key: string; id: string } | null>(null)
  const staffOptions = [...new Set([shift.host_id, shift.support_id, shift.technical_id, ...registrations.filter(row => ['approved', 'manually_assigned', 'pending'].includes(row.status)).map(row => row.user_id)].filter((id): id is string => !!id))]
  const staffName = (id: string) => users.find(user => user.id === id)?.full_name ?? id
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
  const [revConflict, setRevConflict] = React.useState(false)

  const readSequence = React.useRef(0)
  const loadSegments = React.useCallback(async (signal?: AbortSignal) => {
    const sequence = ++readSequence.current
    setLoading(true)
    setLoadError(null)
    try {
      const res = await workforceService.getActualSegments(shift.id, signal)
      if (sequence !== readSequence.current || signal?.aborted) return
      setSegments(res.segments)
    } catch (err: unknown) {
      if (sequence !== readSequence.current || signal?.aborted) return
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
    const controller = new AbortController()
    const frame = requestAnimationFrame(() => {
      void loadSegments(controller.signal)
    })
    return () => { cancelAnimationFrame(frame); controller.abort(); generation.current++ }
  }, [loadSegments])

  // Pre-fill time when opening record modal
  const openRecordModal = (source?: ActualSegment) => {
    setAmending(source ?? null)
    setAmendReason('')
    setRecConflict(false)
    intent.current = null
    setRecStaffId(source?.staff_id ?? shift.host_id ?? staffOptions[0] ?? '')
    setRecRole(source?.operational_role ?? 'host')
    setRecEventKind(source?.event_kind ?? 'worked')
    setRecCoverageKind(source?.coverage_kind ?? 'planned')
    const planned = resolveShiftDateTime(shift.date, shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), shift.timezone)
    setRecStartTime(planned?.valid ? actualPickerValue(planned.startAt.toISOString(), shift.timezone) : '')
    setRecEndTime(planned?.valid ? actualPickerValue(planned.endAt.toISOString(), shift.timezone) : '')
    if (source?.actual_start_at) setRecStartTime(actualPickerValue(source.actual_start_at, shift.timezone))
    if (source?.actual_end_at) setRecEndTime(actualPickerValue(source.actual_end_at, shift.timezone))
    setRecEvidenceNote(source?.evidence_note ?? '')
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
      if (recConflict) return
      if (amending && amendReason.trim().length < 8) throw new Error('Lý do điều chỉnh phải có ít nhất 8 ký tự.')
      const actualStartAt = recEventKind === 'worked' ? actualPickerInstant(recStartTime, shift.timezone) : null
      const actualEndAt = recEventKind === 'worked' ? actualPickerInstant(recEndTime, shift.timezone) : null
      if (actualStartAt && actualEndAt && (Date.parse(actualEndAt) <= Date.parse(actualStartAt) || Date.parse(actualEndAt) - Date.parse(actualStartAt) > 86400000)) throw new Error('Khoảng làm việc phải lớn hơn 0 và không quá 24 giờ.')
      setRecSubmitting(true)
      if (amending) {
        const patch = { staff_id: recStaffId, operational_role: recRole, event_kind: recEventKind, coverage_kind: recCoverageKind, actual_start_at: actualStartAt, actual_end_at: actualEndAt, evidence_note: recEvidenceNote.trim() }
        const key = JSON.stringify({ id: amending.id, version: amending.version, patch, reason: amendReason.trim() })
        if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() }
        await workforceService.amendActualSegment({ segmentId: amending.id, expectedVersion: amending.version, requestId: intent.current.id, reason: amendReason.trim(), patch })
      } else await workforceService.recordActualSegment({
        shiftId: shift.id,
        staffId: recStaffId.trim(),
        operationalRole: recRole,
        eventKind: recEventKind,
        coverageKind: recCoverageKind,
        actualStartAt,
        actualEndAt,
        evidenceNote: recEvidenceNote.trim(),
      })

      toast({
        title: 'Ghi nhận chấm công thành công',
        description: 'Phân đoạn làm việc đã được tạo ở trạng thái Chờ duyệt (Draft).',
      })

      setIsRecordOpen(false)
      loadSegments()
    } catch (err: unknown) {
      if (err instanceof Error && 'status' in err && err.status === 409) { setRecConflict(true); void loadSegments() }
      setRecError(
        err instanceof Error && !('status' in err) ? err.message : workforceErrorMessage(err)
      )
    } finally {
      setRecSubmitting(false)
    }
  }

  const openReviewModal = (seg: ActualSegment) => {
    setRevConflict(false)
    setReviewingSegment(seg)
    setRevDecision('approved')
    setRevNote('')
    setRevError(null)
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewingSegment || revConflict) return
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
      if (err instanceof Error && 'status' in err && err.status === 409) { setRevConflict(true); void loadSegments() }
      setRevError(
        workforceErrorMessage(err)
      )
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
    cover: 'Trực thay',
    replacement: 'Thay thế',
    extra: 'Tăng cường',
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

      {/* Header & Record Button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Chấm công thực tế & Phê duyệt độc lập
          </h4>
          <p className="text-xs text-slate-500">
            Minh chứng thời gian làm việc thực tế, vắng mặt có lý do và phân đoạn tăng ca.
          </p>
        </div>

        {isCompleted && isSupervisor && (
          <Button
            size="sm"
            onClick={() => openRecordModal()}
            className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ghi nhận chấm công
          </Button>
        )}
      </div>

      {loadError && <p role="alert">{loadError}</p>}
      {/* Segments Table */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-slate-50 font-semibold text-slate-600">
            <tr>
              <th className="px-3 py-2.5">Nhân sự</th>
              <th className="px-3 py-2.5">Vai trò</th>
              <th className="px-3 py-2.5">Sự kiện</th>
              <th className="px-3 py-2.5">Hình thức</th>
              <th className="px-3 py-2.5">Thời gian thực tế</th>
              <th className="px-3 py-2.5">Ghi chú minh chứng</th>
              <th className="px-3 py-2.5">Trạng thái duyệt</th>
              <th className="px-3 py-2.5 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadError ? (
              <tr><td colSpan={7} className="p-4">Không thể tải minh chứng. Hãy thử lại.</td></tr>
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
                  Chưa có minh chứng chấm công: UNKNOWN. Không suy diễn thành no-show từ lịch ca.
                </td>
              </tr>
            ) : (
              segments.map((seg) => {
                const isCreator = currentUser?.id === seg.created_by || Boolean(seg.supersedes_segment_id && segments.find(source => source.id === seg.supersedes_segment_id)?.created_by === currentUser?.id)
                const isApproved = seg.review_status === 'approved'
                const isRejected = seg.review_status === 'rejected'
                const isDraftStatus = seg.review_status === 'draft'

                return (
                  <tr key={seg.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                      {staffName(seg.staff_id)}
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
                            {new Date(seg.actual_start_at).toLocaleString('vi-VN', { timeZone: shift.timezone ?? 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}
                            {' → '}
                            {new Date(seg.actual_end_at).toLocaleString('vi-VN', { timeZone: shift.timezone ?? 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Không có thời gian</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate text-slate-600" title={seg.evidence_note}>
                      {seg.evidence_note}
                      {seg.supersedes_segment_id && <p className="mt-1 whitespace-normal text-xs">Điều chỉnh {seg.supersedes_segment_id}: {seg.amendment_reason}</p>}
                      <span className="text-xs">v{seg.version}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {segments.some(child => child.supersedes_segment_id === seg.id && child.review_status === 'approved') && <Badge variant="outline">Đã thay thế</Badge>}
                      {isApproved ? (
                        <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Đã duyệt</span>
                        </div>
                      ) : isRejected ? (
                        <div className="flex items-center gap-1 text-rose-700 font-semibold text-[11px]">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Bị từ chối</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-700 font-semibold text-[11px]">
                          <Clock className="h-3.5 w-3.5" />
                          <span>Chờ duyệt</span>
                        </div>
                      )}
                      {seg.reviewed_by && (
                        <div className="text-[10px] text-slate-400">
                          Bởi {seg.reviewed_by}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isSupervisor && isCompleted && (!seg.supersedes_segment_id || isApproved) && !segments.some(child => child.supersedes_segment_id === seg.id && child.review_status !== 'rejected') && <Button size="sm" variant="outline" onClick={() => openRecordModal(seg)}>Điều chỉnh</Button>}
                      {isDraftStatus && isSupervisor && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isCreator}
                          onClick={() => openReviewModal(seg)}
                          className={`h-7 text-xs ${
                            isCreator ? 'opacity-50 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'
                          }`}
                          title={isCreator ? 'Người tạo không thể tự duyệt (Self-review blocked)' : 'Phê duyệt phân đoạn'}
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
              Ghi nhận thời gian có mặt thực tế hoặc xác nhận vắng mặt kèm minh chứng.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordSubmit} className="space-y-4 pt-2">
            {amending && <label className="block space-y-1 text-xs">Lý do điều chỉnh (đi trễ, về sớm, thay ca, làm thêm)<Textarea value={amendReason} onChange={event => setAmendReason(event.target.value)} required minLength={8} maxLength={2000} /></label>}
            {recError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{recError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="actualstaffingpanel-field-1" className="text-xs font-semibold text-slate-700">
                  Nhân sự <span className="text-rose-500">*</span>
                </label>
                <select id="actualstaffingpanel-field-1" required value={recStaffId} onChange={event => setRecStaffId(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-xs">
                  <option value="">Chọn nhân sự</option>
                  {[...new Set([...staffOptions, ...(amending ? [amending.staff_id] : [])])].map(id => <option key={id} value={id}>{staffName(id)}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Vai trò</label>
                <Select value={recRole} onValueChange={(val: WorkforceRole) => setRecRole(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="host">Host Livestream</SelectItem>
                    <SelectItem value="support">Trợ lý phiên Live</SelectItem>
                    <SelectItem value="technical">Kỹ thuật viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Sự kiện chấm công</label>
                <Select
                  value={recEventKind}
                  onValueChange={(val: 'worked' | 'no_show') => setRecEventKind(val)}
                >
                  <SelectTrigger aria-label="Sự kiện chấm công" className="h-9 text-xs">
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
                  onValueChange={(val: typeof recCoverageKind) => setRecCoverageKind(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Theo lịch (Planned)</SelectItem>
                    <SelectItem value="cover">Trực thay (Cover)</SelectItem>
                    <SelectItem value="replacement">Thay thế (Replacement)</SelectItem>
                    <SelectItem value="extra">Tăng cường (Extra)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {recEventKind === 'worked' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="actualstaffingpanel-field-2" className="text-xs font-semibold text-slate-700">
                    Bắt đầu thực tế  <span className="text-rose-500">*</span>
                  </label>
                  <Input id="actualstaffingpanel-field-2"
                    type="datetime-local"
                    required
                    aria-label="Bắt đầu thực tế"

                    value={recStartTime}
                    onChange={(e) => setRecStartTime(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="actualstaffingpanel-field-3" className="text-xs font-semibold text-slate-700">
                    Kết thúc thực tế  <span className="text-rose-500">*</span>
                  </label>
                  <Input id="actualstaffingpanel-field-3"
                    type="datetime-local"
                    required
                    aria-label="Kết thúc thực tế"

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
              <Textarea id="actualstaffingpanel-field-4" maxLength={2000}
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
                disabled={recSubmitting || recConflict}
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
                <Textarea id="actualstaffingpanel-field-5"
                  required
                  rows={2}
                  placeholder="Ghi rõ lý do phê duyệt hoặc từ chối (tối thiểu 8 ký tự)..."
                  value={revNote}
                  onChange={(e) => setRevNote(e.target.value)}
                  className="text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
              {revError && <Button type="button" variant="outline" onClick={() => { setReviewingSegment(null); void loadSegments() }}>Tải lại minh chứng</Button>}
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
                  disabled={revSubmitting || revConflict}
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
