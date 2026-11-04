'use client'

import * as React from 'react'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { pageRange } from '@/lib/utils/pagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import {
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils/currency'
import {
  workforceService,
  workforceErrorMessage,
  type PayrollPeriod,
  type PayrollLine,
  type PayrollAudit,
  type PayrollPeriodStatus,
  type WorkforceRole,
  type RecalculationLineDiff,
  type RecalculationDiffSummary,
  type PayrollReconciliationSummary,
  WorkforceServiceError,
} from '@/lib/services/workforceService'

interface PayrollDraftWorkspaceProps {
  period: PayrollPeriod
  lines: PayrollLine[]
  currentUserId?: string
  currentUserRole?: string
  audit?: PayrollAudit[]
  onRefresh: () => void
}

export function PayrollDraftWorkspace({
  period,
  lines,
  currentUserId,
  currentUserRole,
  audit = [],
  onRefresh,
}: PayrollDraftWorkspaceProps) {
  const { toast } = useToast()
  const correctionIntent = React.useRef<Parameters<typeof workforceService.correctLine>[0] | null>(null)
  const voidIntent = React.useRef<Parameters<typeof workforceService.voidLine>[0] | null>(null)
  const [showVoided, setShowVoided] = React.useState(true)

  // Transition Modal State
  const [isTransitionOpen, setIsTransitionOpen] = React.useState(false)
  const [transitionTarget, setTransitionTarget] = React.useState<PayrollPeriodStatus>('reviewed')
  const [transitionReason, setTransitionReason] = React.useState('')
  const [transitionSubmitting, setTransitionSubmitting] = React.useState(false)
  const [transitionError, setTransitionError] = React.useState<string | null>(null)

  // Prepare Line Modal State
  const [isPrepareOpen, setIsPrepareOpen] = React.useState(false)
  const [prepSegmentId, setPrepSegmentId] = React.useState('')
  const [prepPayableMinutes, setPrepPayableMinutes] = React.useState<number>(0)
  const [prepOvertimeMinutes, setPrepOvertimeMinutes] = React.useState<number>(0)
  const [prepAdjustmentVnd, setPrepAdjustmentVnd] = React.useState<number>(0)
  const [prepAdjustmentReason, setPrepAdjustmentReason] = React.useState('')
  const [prepSubmitting, setPrepSubmitting] = React.useState(false)
  const [prepError, setPrepError] = React.useState<string | null>(null)

  // Correct Line Modal State
  const [correctingLine, setCorrectingLine] = React.useState<PayrollLine | null>(null)
  const [corrPayableMinutes, setCorrPayableMinutes] = React.useState<number>(0)
  const [corrOvertimeMinutes, setCorrOvertimeMinutes] = React.useState<number>(0)
  const [corrAdjustmentVnd, setCorrAdjustmentVnd] = React.useState<number>(0)
  const [corrAdjustmentReason, setCorrAdjustmentReason] = React.useState('')
  const [corrReason, setCorrReason] = React.useState('')
  const [corrSubmitting, setCorrSubmitting] = React.useState(false)
  const [corrError, setCorrError] = React.useState<string | null>(null)
  const [corrReplayed, setCorrReplayed] = React.useState(false)

  // Void Line Modal State
  const [voidingLine, setVoidingLine] = React.useState<PayrollLine | null>(null)
  const [voidReason, setVoidReason] = React.useState('')
  const [voidSubmitting, setVoidSubmitting] = React.useState(false)
  const [voidError, setVoidError] = React.useState<string | null>(null)
  const [autoCalculating, setAutoCalculating] = React.useState(false)

  // Recalculation & Reconciliation State
  const [reconciliation, setReconciliation] = React.useState<PayrollReconciliationSummary | null>(null)
  const [isRecalcOpen, setIsRecalcOpen] = React.useState(false)
  const [loadingPreview, setLoadingPreview] = React.useState(false)
  const [recalcDiffs, setRecalcDiffs] = React.useState<RecalculationLineDiff[]>([])
  const [recalcSummary, setRecalcSummary] = React.useState<RecalculationDiffSummary | null>(null)
  const [recalcReason, setRecalcReason] = React.useState('')
  const [recalculating, setRecalculating] = React.useState(false)
  const [recalcError, setRecalcError] = React.useState<string | null>(null)
  const [unapprovedOtExceptions, setUnapprovedOtExceptions] = React.useState<
    Array<{ segmentId: string; staffId: string; shiftDate: string; reason: string }>
  >([])

  const isDraft = period.status === 'draft'

  const activeLines = React.useMemo(() => lines.filter(l => !l.voided_at), [lines])
  const voidedLines = React.useMemo(() => lines.filter(l => Boolean(l.voided_at)), [lines])
  const displayedLines = React.useMemo(
    () => (showVoided ? lines : activeLines),
    [lines, activeLines, showVoided]
  )

  // --- TRANSITIONS ---
  const nextTransitionConfig: Partial<
    Record<
      PayrollPeriodStatus,
      {
        nextStatus: PayrollPeriodStatus
        buttonLabel: string
        dialogTitle: string
        description: string
      }
    >
  > = {
    draft: {
      nextStatus: 'reviewed',
      buttonLabel: 'Chuyển sang Đã rà soát (Review)',
      dialogTitle: 'Rà soát bảng lương (Draft → Reviewed)',
      description:
        'Xác nhận đã kiểm tra đối soát tất cả phân đoạn ca làm việc và đơn giá. Người khởi tạo hoặc người sửa đổi dòng lương không được tự duyệt bước này.',
    },
    reviewed: {
      nextStatus: 'confirmed',
      buttonLabel: 'Xác nhận bảng lương (Confirm)',
      dialogTitle: 'Xác nhận bảng lương (Reviewed → Confirmed)',
      description:
        'Cấp quản lý thứ hai xác nhận bảng lương độc lập với người rà soát trước đó. Không được trùng người rà soát.',
    },
    confirmed: {
      nextStatus: 'payroll_ready',
      buttonLabel: 'Sẵn sàng chi trả (Ready)',
      dialogTitle: 'Chuyển sang Sẵn sàng chi trả (Confirmed → Ready)',
      description:
        'Chuẩn bị danh sách thanh toán chính thức cho bộ phận tài chính kế toán.',
    },
    payroll_ready: {
      nextStatus: 'locked',
      buttonLabel: 'Khóa sổ bảng lương (Lock)',
      dialogTitle: 'Khóa sổ bảng lương vĩnh viễn (Ready → Locked)',
      description:
        'Hành động này sẽ khóa sổ bảng lương vĩnh viễn. Không thể mở lại hay sửa đổi bất kỳ dòng nào sau khi khóa. File CSV chính thức sẽ được kích hoạt tải xuống.',
    },
  }

  const currentTransition = nextTransitionConfig[period.status]
  const canTransition = currentUserRole === 'admin' && Boolean(currentUserId)
    && !(period.status === 'draft' && period.created_by === currentUserId)
    && !(period.status === 'draft' && audit.some(row => row.actor_id === currentUserId && ['correct_line', 'void_line'].includes(row.action)))
    && !(period.status === 'reviewed' && period.reviewed_by === currentUserId)

  const openTransitionModal = () => {
    if (!currentTransition || !canTransition) return
    setTransitionTarget(currentTransition.nextStatus)
    setTransitionReason('')
    setTransitionError(null)
    setIsTransitionOpen(true)
  }

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canTransition) return
    setTransitionError(null)

    if (!transitionReason.trim() || transitionReason.trim().length < 8) {
      setTransitionError('Vui lòng nhập lý do chuyển trạng thái (ít nhất 8 ký tự).')
      return
    }

    try {
      setTransitionSubmitting(true)
      await workforceService.transitionPeriod({
        periodId: period.id,
        expectedStatus: period.status,
        targetStatus: transitionTarget,
        reason: transitionReason.trim(),
      })

      toast({
        title: 'Chuyển trạng thái thành công',
        description: `Bảng lương đã chuyển sang trạng thái ${transitionTarget.toUpperCase()}.`,
      })

      setIsTransitionOpen(false)
      onRefresh()
    } catch (err: unknown) {
      setTransitionError(
        workforceErrorMessage(err)
      )
    } finally {
      setTransitionSubmitting(false)
    }
  }

  // --- AUTO CALCULATE DRAFT ---
  const handleAutoCalculate = async () => {
    try {
      setAutoCalculating(true)
      const res = await workforceService.autoCalculateDraft(period.id)
      if (res.reconciliation) {
        setReconciliation(res.reconciliation)
      }
      if (res.unapproved_ot_exceptions) {
        setUnapprovedOtExceptions(res.unapproved_ot_exceptions)
      }
      if (res.prepared_count > 0) {
        toast({
          title: 'Tự động tính lương thành công',
          description: `Đã tính ${res.prepared_count} dòng lương mới từ dữ liệu chấm công đã duyệt. ${res.reconciliation ? `(Đối soát: ${res.reconciliation.reconciled_count}/${res.reconciliation.total_approved_segments} ca)` : ''}`,
        })
      } else if (res.reconciliation && !res.reconciliation.is_fully_reconciled) {
        toast({
          title: 'Còn ca chưa được đối soát',
          description: `Có ${res.reconciliation.unreconciled_count} ca làm việc chưa thể tính lương do thiếu đơn giá được duyệt.`,
          variant: 'destructive',
        })
      } else if (res.skipped_count > 0) {
        toast({
          title: 'Không có dòng mới cần nạp',
          description: `Tất cả ${res.reconciliation?.total_approved_segments ?? res.skipped_count} phân đoạn chấm công đã được tính toán đầy đủ trong chu kỳ.`,
        })
      } else {
        toast({
          title: 'Không tìm thấy ca chấm công',
          description: 'Không có phân đoạn chấm công nào được duyệt trong khoảng ngày của chu kỳ này.',
        })
      }
      onRefresh()
    } catch (err: unknown) {
      toast({
        title: 'Tính toán tự động thất bại',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setAutoCalculating(false)
    }
  }

  // --- RECALCULATE DRAFT (PREVIEW & EXECUTE) ---
  const handleOpenRecalculateModal = async () => {
    try {
      setLoadingPreview(true)
      setRecalcError(null)
      setRecalcReason('')
      const res = await workforceService.previewRecalculation(period.id)
      setRecalcDiffs(res.diffs)
      setRecalcSummary(res.summary)
      setIsRecalcOpen(true)
    } catch (err: unknown) {
      toast({
        title: 'Không thể xem trước tính lại',
        description: workforceErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleRecalculateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recalcReason.trim() || recalcReason.trim().length < 8) {
      setRecalcError('Lý do tính lại là bắt buộc (tối thiểu 8 ký tự).')
      return
    }

    try {
      setRecalculating(true)
      setRecalcError(null)
      const res = await workforceService.recalculateDraft({
        periodId: period.id,
        reason: recalcReason.trim(),
        requestId: crypto.randomUUID(),
      })
      toast({
        title: 'Tính lại lương theo giá mới thành công',
        description: `Đã cập nhật ${res.recalculated_count} dòng lương. Khoản điều chỉnh của kế toán được giữ nguyên.`,
      })
      setIsRecalcOpen(false)
      onRefresh()
    } catch (err: unknown) {
      setRecalcError(workforceErrorMessage(err))
    } finally {
      setRecalculating(false)
    }
  }

  // --- PREPARE LINE ---
  const handlePrepareSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPrepError(null)

    if (!prepSegmentId.trim()) {
      setPrepError('Vui lòng nhập Mã phân đoạn ca (Segment ID) hợp lệ.')
      return
    }

    if (prepAdjustmentVnd !== 0 && (!prepAdjustmentReason.trim() || prepAdjustmentReason.trim().length < 8)) {
      setPrepError('Khoản điều chỉnh khác 0 yêu cầu phải có lý do giải trình (ít nhất 8 ký tự).')
      return
    }

    try {
      setPrepSubmitting(true)
      await workforceService.prepareLine({
        periodId: period.id,
        segmentId: prepSegmentId.trim(),
        payableMinutes: prepPayableMinutes,
        overtimeMinutes: prepOvertimeMinutes,
        adjustmentVnd: prepAdjustmentVnd,
        adjustmentReason: prepAdjustmentVnd !== 0 ? prepAdjustmentReason.trim() : null,
      })

      toast({
        title: 'Nạp dòng lương thành công',
        description: 'Phân đoạn làm việc đã được tính toán và lưu vào bản nháp.',
      })

      setIsPrepareOpen(false)
      setPrepSegmentId('')
      setPrepAdjustmentReason('')
      onRefresh()
    } catch (err: unknown) {
      setPrepError(
        workforceErrorMessage(err)
      )
    } finally {
      setPrepSubmitting(false)
    }
  }

  // --- CORRECT LINE ---
  const openCorrectModal = (line: PayrollLine) => {
    setCorrectingLine(line)
    setCorrPayableMinutes(line.payable_minutes)
    setCorrOvertimeMinutes(line.overtime_minutes)
    setCorrAdjustmentVnd(line.adjustment_vnd)
    setCorrAdjustmentReason(line.adjustment_reason || '')
    setCorrReason('')
    setCorrError(null)
    setCorrReplayed(false)
  }

  const handleCorrectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!correctingLine) return
    setCorrError(null)
    setCorrReplayed(false)

    if (!corrReason.trim() || corrReason.trim().length < 8) {
      setCorrError('Lý do sửa đổi là bắt buộc (ít nhất 8 ký tự).')
      return
    }

    if (corrOvertimeMinutes > corrPayableMinutes) {
      setCorrError('Số phút tăng ca không được vượt quá số phút tính lương.')
      return
    }

    if (corrAdjustmentVnd !== 0 && (!corrAdjustmentReason.trim() || corrAdjustmentReason.trim().length < 8)) {
      setCorrError('Điều chỉnh khác 0 yêu cầu phải có lý do giải trình (ít nhất 8 ký tự).')
      return
    }

    try {
      setCorrSubmitting(true)
      const requestId = correctionIntent.current?.requestId ?? crypto.randomUUID()
      const payload = {
        periodId: period.id,
        lineId: correctingLine.id,
        expectedVersion: correctingLine.version,
        requestId,
        reason: corrReason.trim(),
        payableMinutes: corrPayableMinutes,
        overtimeMinutes: corrOvertimeMinutes,
        adjustmentVnd: corrAdjustmentVnd,
        adjustmentReason: corrAdjustmentVnd !== 0 ? corrAdjustmentReason.trim() : null,
      }
      if (correctionIntent.current && JSON.stringify(correctionIntent.current) !== JSON.stringify(payload)) {
        setCorrError('Retry phải giữ nguyên dữ liệu đã gửi. Tải lại và đối soát audit trước khi tạo yêu cầu mới.')
        return
      }
      correctionIntent.current = payload
      const res = await workforceService.correctLine(payload)
      correctionIntent.current = null

      if (res.replayed) {
        setCorrReplayed(true)
        toast({
          title: 'Yêu cầu lặp lại (Replayed Receipt)',
          description: 'Hệ thống đã nhận diện lại yêu cầu điều chỉnh giống hệt trước đó.',
        })
      } else {
        toast({
          title: 'Điều chỉnh dòng lương thành công',
          description: `Dòng lương đã được nâng cấp lên phiên bản v${res.line.version}.`,
        })
      }

      setCorrectingLine(null)
      onRefresh()
    } catch (err: unknown) {
      setCorrError(
        workforceErrorMessage(err)
      )
      if (err instanceof WorkforceServiceError && err.status === 409) {
        correctionIntent.current = null
        setCorrectingLine(null)
        onRefresh()
        toast({ title: 'Dữ liệu đã thay đổi', description: 'Đã tải lại dữ liệu hiện hành. Kiểm tra audit trước khi tạo yêu cầu mới.', variant: 'destructive' })
      }
    } finally {
      setCorrSubmitting(false)
    }
  }

  // --- VOID LINE ---
  const openVoidModal = (line: PayrollLine) => {
    setVoidingLine(line)
    setVoidReason('')
    setVoidError(null)
  }

  const handleVoidSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voidingLine) return
    setVoidError(null)

    if (!voidReason.trim() || voidReason.trim().length < 8) {
      setVoidError('Lý do vô hiệu hóa là bắt buộc (ít nhất 8 ký tự).')
      return
    }

    try {
      setVoidSubmitting(true)
      const requestId = voidIntent.current?.requestId ?? crypto.randomUUID()
      const payload = {
        periodId: period.id,
        lineId: voidingLine.id,
        expectedVersion: voidingLine.version,
        requestId,
        reason: voidReason.trim(),
      }
      if (voidIntent.current && JSON.stringify(voidIntent.current) !== JSON.stringify(payload)) {
        setVoidError('Retry phải giữ nguyên lý do đã gửi. Tải lại và đối soát audit trước khi tạo yêu cầu mới.')
        return
      }
      voidIntent.current = payload
      await workforceService.voidLine(payload)
      voidIntent.current = null

      toast({
        title: 'Đã vô hiệu hóa dòng lương',
        description: 'Dòng lương đã bị loại khỏi tổng thanh toán vĩnh viễn và lưu vào lịch sử kiểm toán.',
      })

      setVoidingLine(null)
      onRefresh()
    } catch (err: unknown) {
      setVoidError(
        workforceErrorMessage(err)
      )
      if (err instanceof WorkforceServiceError && err.status === 409) {
        voidIntent.current = null
        setVoidingLine(null)
        onRefresh()
        toast({ title: 'Không thể void bản ghi cũ', description: 'Đã tải lại trạng thái hiện hành. Không tự ghi đè dữ liệu.', variant: 'destructive' })
      }
    } finally {
      setVoidSubmitting(false)
    }
  }

  const roleLabels: Record<WorkforceRole, string> = {
    host: 'Host',
    support: 'Trợ lý',
    technical: 'Kỹ thuật',
  }

  const pagination = useListPagination('payroll_lines', 20)
  const range = pageRange(displayedLines.length, pagination.page, pagination.pageSize)
  const pageRows = displayedLines.slice((range.page - 1) * pagination.pageSize, range.page * pagination.pageSize)
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-bold text-slate-900">
            Không gian đối soát & Dòng lương chi tiết
          </CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">
            Xem xét từng phân đoạn ca, hiệu chỉnh số phút, điều chỉnh số tiền và quản lý phê duyệt đa cấp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Voided */}
          {voidedLines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowVoided(!showVoided)}
              className="text-xs text-slate-600"
            >
              {showVoided ? 'Ẩn dòng đã vô hiệu' : `Hiện dòng vô hiệu (${voidedLines.length})`}
            </Button>
          )}

          {/* Auto Calculate button */}
          {isDraft && (
            <Button
              size="sm"
              onClick={handleAutoCalculate}
              disabled={autoCalculating}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${autoCalculating ? 'animate-spin' : ''}`} />
              {autoCalculating ? 'Đang tính toán…' : 'Tự động tính từ chấm công'}
            </Button>
          )}

          {/* Recalculate button */}
          {isDraft && activeLines.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenRecalculateModal}
              disabled={loadingPreview || recalculating}
              className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50 shadow-sm"
            >
              <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${loadingPreview ? 'animate-spin' : ''}`} />
              {loadingPreview ? 'Đang kiểm tra…' : 'Tính lại theo giá mới'}
            </Button>
          )}

          {/* Prepare Line button */}
          {isDraft && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPrepareOpen(true)}
              className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5 mr-1 text-blue-600" />
              Chuẩn bị dòng lương
            </Button>
          )}

          {/* Transition Button */}
          {currentTransition && (
            <Button
              size="sm"
              onClick={openTransitionModal}
              disabled={activeLines.length === 0 || !canTransition}
              className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
            >
              <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
              {currentTransition.buttonLabel}
            </Button>
          )}
        </div>
      </CardHeader>

      {!canTransition && currentTransition && <p className="px-4 text-xs text-amber-700" role="status">Cần một Admin độc lập để phê duyệt bước này.</p>}
      <CardContent className="p-4 space-y-4">
        {/* Reconciliation Summary Alert */}
        {reconciliation && (
          <div
            className={`rounded-lg border p-3.5 text-xs ${
              reconciliation.is_fully_reconciled
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                : 'border-amber-200 bg-amber-50/70 text-amber-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                {reconciliation.is_fully_reconciled ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                )}
                <span>
                  {reconciliation.is_fully_reconciled
                    ? `Đối soát hoàn tất: 100% (${reconciliation.reconciled_count}/${reconciliation.total_approved_segments} ca làm việc đã được tính lương)`
                    : `Cảnh báo đối soát: Có ${reconciliation.unreconciled_count}/${reconciliation.total_approved_segments} ca làm việc chưa thể tính lương`}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Tỷ lệ đối soát: {reconciliation.total_approved_segments > 0 ? Math.round((reconciliation.reconciled_count / reconciliation.total_approved_segments) * 100) : 100}%
              </span>
            </div>

            {!reconciliation.is_fully_reconciled && (
              <div className="mt-2.5 pt-2 border-t border-amber-200/60 text-[11px] space-y-1">
                <p className="font-medium text-amber-800">
                  ⚠️ Lưu ý: Theo chính sách chốt lương, bạn sẽ không thể chuyển bảng lương sang trạng thái &ldquo;Reviewed&rdquo; hoặc &ldquo;Locked&rdquo; nếu còn ca chấm công chưa có đơn giá hợp lệ.
                </p>
                {reconciliation.unreconciled_segments.length > 0 && (
                  <div className="mt-1 max-h-28 overflow-y-auto space-y-1 bg-white/70 rounded p-2 border border-amber-200/80">
                    <p className="font-semibold text-slate-700">Danh sách ca chưa đối soát:</p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      {reconciliation.unreconciled_segments.map((seg) => (
                        <li key={seg.segmentId}>
                          <strong>{seg.staffId}</strong> ({seg.role}, {seg.shiftDate}): {seg.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Unapproved OT Exceptions Warning */}
        {unapprovedOtExceptions.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-900 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Cảnh báo tăng ca: Có {unapprovedOtExceptions.length} ca làm việc có ghi chú tăng ca nhưng chưa được quản lý phê duyệt OT (đã tính OT = 0 theo quy định)
              </span>
            </div>
            <div className="mt-2 text-[11px] text-amber-800">
              <p className="mb-1 font-medium text-slate-700">Chi tiết các ca cần kế toán đối soát trước khi duyệt:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                {unapprovedOtExceptions.map((ex) => (
                  <li key={ex.segmentId}>
                    <strong>{ex.staffId}</strong> ({ex.shiftDate}): Ghi nhận tăng ca trong chứng từ nhưng chưa có phê duyệt OT chính thức của quản lý ca.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Lines Table */}
        <div role="region" aria-label="Bảng dữ liệu, cuộn ngang / Scroll horizontally" tabIndex={0} className="max-w-full overflow-x-auto rounded-md border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Nhân sự & Vai trò</th>
                <th className="px-3 py-2.5">Phân đoạn ca</th>
                <th className="px-3 py-2.5 text-right">Phút thực tế</th>
                <th className="px-3 py-2.5 text-right">Tính lương</th>
                <th className="px-3 py-2.5 text-right">Tăng ca</th>
                <th className="px-3 py-2.5 text-right">Đơn giá / OT</th>
                <th className="px-3 py-2.5 text-right">Lương gộp</th>
                <th className="px-3 py-2.5 text-right">Điều chỉnh</th>
                <th className="px-3 py-2.5 text-right font-bold">Thực lĩnh</th>
                <th className="px-3 py-2.5 text-center">Trạng thái</th>
                {isDraft && <th className="px-3 py-2.5 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedLines.length === 0 ? (
                <tr>
                  <td colSpan={isDraft ? 11 : 10} className="py-12 text-center">
                    <div className="mx-auto max-w-sm space-y-3">
                      <p className="text-sm font-semibold text-slate-700">Chưa có dòng lương nào trong chu kỳ này</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Bạn có thể nhấn <strong>&ldquo;Tự động tính từ chấm công&rdquo;</strong> để quét các ca chấm công đã duyệt và áp khung lương tương ứng, hoặc bấm <strong>&ldquo;Chuẩn bị dòng lương&rdquo;</strong> để nạp thủ công.
                      </p>
                      {isDraft && (
                        <div className="pt-2">
                          <Button
                            size="sm"
                            onClick={handleAutoCalculate}
                            disabled={autoCalculating}
                            className="bg-emerald-600 hover:bg-emerald-700 text-xs text-white"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                            Tự động tính từ chấm công ngay
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((line) => {
                  const isVoided = Boolean(line.voided_at)
                  return (
                    <tr
                      key={line.id}
                      className={`transition-colors ${
                        isVoided ? 'bg-slate-50/80 text-slate-400' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Staff & Role */}
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-bold text-slate-900">
                          {line.staff_id}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {roleLabels[line.operational_role]}
                        </div>
                      </td>

                      {/* Segment */}
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-[10px] text-slate-500 truncate max-w-[110px]" title={line.segment_id}>
                          {line.segment_id}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          v{line.version}
                        </span>
                      </td>

                      {/* Actual Minutes */}
                      <td className="px-3 py-2.5 text-right font-mono">
                        {line.actual_minutes}p
                      </td>

                      {/* Payable Minutes */}
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                        {line.payable_minutes}p
                      </td>

                      {/* OT Minutes */}
                      <td className="px-3 py-2.5 text-right font-mono text-indigo-600">
                        {line.overtime_minutes > 0 ? `+${line.overtime_minutes}p` : '—'}
                      </td>

                      {/* Rate */}
                      <td className="px-3 py-2.5 text-right">
                        <div className="font-mono font-medium">
                          {formatCurrency(line.rate_vnd_per_hour)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(line.overtime_multiplier_basis_points / 10000).toFixed(2)}x
                        </div>
                      </td>

                      {/* Gross */}
                      <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-900">
                        <div>{formatCurrency(line.gross_vnd)}</div>
                        <div
                          className="text-[9px] text-slate-400 font-mono cursor-help truncate max-w-[140px] ml-auto"
                          title={`Công thức: (${line.payable_minutes - line.overtime_minutes}p chuẩn × ${formatCurrency(line.rate_vnd_per_hour)} ÷ 60) + (${line.overtime_minutes}p OT × ${formatCurrency(line.rate_vnd_per_hour)} × ${(line.overtime_multiplier_basis_points / 10000).toFixed(2)}x ÷ 60)`}
                        >
                          {line.payable_minutes}p @ {formatCurrency(line.rate_vnd_per_hour)}/h
                        </div>
                      </td>

                      {/* Adjustment */}
                      <td className="px-3 py-2.5 text-right font-mono">
                        {line.adjustment_vnd !== 0 ? (
                          <div>
                            <span
                              className={`font-medium ${
                                line.adjustment_vnd < 0 ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {line.adjustment_vnd > 0 ? '+' : ''}
                              {formatCurrency(line.adjustment_vnd)}
                            </span>
                            {line.adjustment_reason && (
                              <div className="text-[9px] text-slate-400 truncate max-w-[90px]" title={line.adjustment_reason}>
                                {line.adjustment_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* Net */}
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-blue-900">
                        {formatCurrency(line.net_vnd)}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5 text-center">
                        {isVoided ? (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">
                            Đã vô hiệu
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                            Hợp lệ
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      {isDraft && (
                        <td className="px-3 py-2.5 text-right space-x-1">
                          {!isVoided ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openCorrectModal(line)}
                                className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                aria-label="Điều chỉnh dòng lương"
                                title="Điều chỉnh dòng lương"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openVoidModal(line)}
                                className="h-7 w-7 p-0 text-slate-600 hover:text-rose-600 hover:bg-rose-50"
                                aria-label="Vô hiệu hóa dòng lương"
                                title="Vô hiệu hóa dòng lương"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Khóa vết</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        <HistoryPagination page={range.page} pageSize={pagination.pageSize} total={displayedLines.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />

        </div>
      </CardContent>

      {/* TRANSITION MODAL */}
      <Dialog open={isTransitionOpen} onOpenChange={setIsTransitionOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {currentTransition?.dialogTitle}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {currentTransition?.description}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTransitionSubmit} className="space-y-4 pt-2">
            {transitionError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{transitionError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="payrolldraftworkspace-field-1" className="text-xs font-semibold text-slate-700">
                Lý do & Căn cứ chuyển trạng thái <span className="text-rose-500">*</span>
              </label>
              <Textarea id="payrolldraftworkspace-field-1"
                required
                rows={3}
                placeholder="Nhập lý do đối soát, kiểm tra chứng từ hoặc quyết định phê duyệt..."
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                className="text-xs"
              />
              <span className="text-[10px] text-slate-400">
                Tối thiểu 8 ký tự, tối đa 2000 ký tự.
              </span>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTransitionOpen(false)}
                disabled={transitionSubmitting}
                className="text-xs"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={transitionSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
              >
                {transitionSubmitting ? 'Đang xử lý...' : 'Xác nhận chuyển'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PREPARE LINE MODAL */}
      <Dialog open={isPrepareOpen} onOpenChange={setIsPrepareOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Chuẩn bị dòng lương từ phân đoạn ca
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Nạp phân đoạn ca đã được chấm công và phê duyệt độc lập vào chu kỳ tính lương.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePrepareSubmit} className="space-y-4 pt-2">
            {prepError && (
              <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{prepError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="payrolldraftworkspace-field-2" className="text-xs font-semibold text-slate-700">
                Mã phân đoạn worked đã được duyệt độc lập <span className="text-rose-500">*</span>
              </label>
              <Input id="payrolldraftworkspace-field-2"
                type="text"
                required
                placeholder="Nhập ID phân đoạn ca làm việc..."
                value={prepSegmentId}
                onChange={(e) => setPrepSegmentId(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>

            <p className="text-xs text-slate-500">Payable bao gồm OT. Nhập số phút theo chính sách đã duyệt; không tự áp dụng break hoặc phạt trễ.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="payrolldraftworkspace-field-3" className="text-xs font-semibold text-slate-700">
                  Số phút tính lương <span className="text-rose-500">*</span>
                </label>
                <Input id="payrolldraftworkspace-field-3"
                  type="number"
                  min="0"
                  max="1440"
                  required
                  value={prepPayableMinutes}
                  onChange={(e) => setPrepPayableMinutes(Number(e.target.value))}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="payrolldraftworkspace-field-4" className="text-xs font-semibold text-slate-700">
                  Số phút tăng ca (OT) <span className="text-rose-500">*</span>
                </label>
                <Input id="payrolldraftworkspace-field-4"
                  type="number"
                  min="0"
                  max="1440"
                  required
                  value={prepOvertimeMinutes}
                  onChange={(e) => setPrepOvertimeMinutes(Number(e.target.value))}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payrolldraftworkspace-field-5" className="text-xs font-semibold text-slate-700">
                Khoản điều chỉnh (VND)
              </label>
              <Input id="payrolldraftworkspace-field-5"
                type="number"
                step="1"
                value={prepAdjustmentVnd}
                onChange={(e) => setPrepAdjustmentVnd(Number(e.target.value))}
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-slate-500">
                {formatCurrency(prepAdjustmentVnd)} (nhập số âm nếu trừ tiền)
              </span>
            </div>

            {prepAdjustmentVnd !== 0 && (
              <div className="space-y-1.5">
                <label htmlFor="payrolldraftworkspace-field-6" className="text-xs font-semibold text-slate-700">
                  Lý do điều chỉnh <span className="text-rose-500">*</span>
                </label>
                <Input id="payrolldraftworkspace-field-6"
                  type="text"
                  required
                  placeholder="Lý do điều chỉnh (tối thiểu 8 ký tự)..."
                  value={prepAdjustmentReason}
                  onChange={(e) => setPrepAdjustmentReason(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            <div className="rounded-md bg-blue-50 p-2.5 text-[11px] text-blue-700 border border-blue-200">
              Số tiền Lương gộp và Thực lĩnh sẽ được máy chủ và CSDL tự động tính toán dựa trên khung lương được duyệt tại ngày làm việc.
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPrepareOpen(false)}
                disabled={prepSubmitting}
                className="text-xs"
              >
                Hủy bỏ
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={prepSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
              >
                {prepSubmitting ? 'Đang nạp...' : 'Thêm dòng lương'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CORRECT LINE MODAL */}
      <Dialog open={Boolean(correctingLine)} onOpenChange={(open) => !open && setCorrectingLine(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Điều chỉnh dòng lương (Phiên bản v{correctingLine?.version})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Sửa đổi thời lượng tính lương, tăng ca hoặc khoản điều chỉnh. Mọi thay đổi được ghi nhận trong lịch sử kiểm toán.
            </DialogDescription>
          </DialogHeader>

          {correctingLine && (
            <form onSubmit={handleCorrectSubmit} className="space-y-4 pt-2">
              {corrError && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{corrError}</span>
                </div>
              )}

              {corrReplayed && (
                <div className="flex items-center gap-2 rounded-md bg-blue-50 p-2.5 text-xs text-blue-700 border border-blue-200">
                  <RotateCcw className="h-4 w-4 shrink-0 text-blue-600" />
                  <span>Yêu cầu này đã được xử lý trước đó (Replayed Receipt). Dữ liệu hiện tại đã được đồng bộ.</span>
                </div>
              )}

              {/* Before vs After Summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-2">
                <div className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                  So sánh trước & sau điều chỉnh
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500">Trước điều chỉnh:</span>
                    <ul className="mt-1 space-y-0.5 text-slate-700 font-mono">
                      <li>Tính lương: {correctingLine.payable_minutes}p</li>
                      <li>Tăng ca: {correctingLine.overtime_minutes}p</li>
                      <li>Điều chỉnh: {formatCurrency(correctingLine.adjustment_vnd)}</li>
                      <li>Lương gộp: {formatCurrency(correctingLine.gross_vnd)}</li>
                    </ul>
                  </div>
                  <div>
                    <span className="text-slate-500">Dự kiến sau điều chỉnh:</span>
                    <ul className="mt-1 space-y-0.5 text-blue-800 font-mono font-medium">
                      <li>Tính lương: {corrPayableMinutes}p</li>
                      <li>Tăng ca: {corrOvertimeMinutes}p</li>
                      <li>Điều chỉnh: {formatCurrency(corrAdjustmentVnd)}</li>
                      <li className="text-slate-500 text-[10px] italic">(Server/DB sẽ tính lại Gross/Net)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="payrolldraftworkspace-field-7" className="text-xs font-semibold text-slate-700">
                    Số phút tính lương <span className="text-rose-500">*</span>
                  </label>
                  <Input id="payrolldraftworkspace-field-7"
                    type="number"
                    min="0"
                    max={correctingLine.actual_minutes}
                    required
                    value={corrPayableMinutes}
                    onChange={(e) => setCorrPayableMinutes(Number(e.target.value))}
                    className="h-9 text-xs"
                  />
                  <span className="text-[10px] text-slate-500">
                    Tối đa {correctingLine.actual_minutes}p (phút thực tế)
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="payrolldraftworkspace-field-8" className="text-xs font-semibold text-slate-700">
                    Số phút tăng ca <span className="text-rose-500">*</span>
                  </label>
                  <Input id="payrolldraftworkspace-field-8"
                    type="number"
                    min="0"
                    max={corrPayableMinutes}
                    required
                    value={corrOvertimeMinutes}
                    onChange={(e) => setCorrOvertimeMinutes(Number(e.target.value))}
                    className="h-9 text-xs"
                  />
                  <span className="text-[10px] text-slate-500">
                    Không quá số phút tính lương
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="payrolldraftworkspace-field-9" className="text-xs font-semibold text-slate-700">
                    Điều chỉnh (VND)
                  </label>
                  <Input id="payrolldraftworkspace-field-9"
                    type="number"
                    step="1"
                    value={corrAdjustmentVnd}
                    onChange={(e) => setCorrAdjustmentVnd(Number(e.target.value))}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="payrolldraftworkspace-field-10" className="text-xs font-semibold text-slate-700">
                    Lý do giải trình điều chỉnh
                  </label>
                  <Input id="payrolldraftworkspace-field-10"
                    type="text"
                    placeholder="Lý do điều chỉnh số tiền..."
                    value={corrAdjustmentReason}
                    onChange={(e) => setCorrAdjustmentReason(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="payrolldraftworkspace-field-11" className="text-xs font-semibold text-slate-700">
                  Lý do sửa đổi dòng lương <span className="text-rose-500">*</span>
                </label>
                <Textarea id="payrolldraftworkspace-field-11"
                  required
                  rows={2}
                  placeholder="Ghi rõ lý do điều chỉnh để lưu vào biên bản kiểm toán (tối thiểu 8 ký tự)..."
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  className="text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {corrError && <Button type="button" variant="outline" disabled={corrSubmitting} onClick={() => { correctionIntent.current = null; setCorrectingLine(null); onRefresh() }}>Tải lại và đối soát audit</Button>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCorrectingLine(null)}
                  disabled={corrSubmitting}
                  className="text-xs"
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={corrSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-xs text-white"
                >
                  {corrSubmitting ? 'Đang lưu...' : 'Lưu điều chỉnh'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* VOID LINE MODAL */}
      <Dialog open={Boolean(voidingLine)} onOpenChange={(open) => !open && setVoidingLine(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-600 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Cảnh báo: Vô hiệu hóa dòng lương
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 font-medium">
              Thao tác này là vĩnh viễn (Terminal Void) và không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          {voidingLine && (
            <form onSubmit={handleVoidSubmit} className="space-y-4 pt-2">
              {voidError && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{voidError}</span>
                </div>
              )}

              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 space-y-1.5">
                <p className="font-semibold">Lưu ý quan trọng:</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>Dòng lương này sẽ <strong>không được tính</strong> vào tổng lương gộp hay thực lĩnh.</li>
                  <li>Dữ liệu ca và số tiền vẫn được lưu trữ làm bằng chứng kiểm toán.</li>
                  <li>Phân đoạn ca này <strong>không thể được chi trả lại</strong> ở bất kỳ chu kỳ nào khác trong tương lai.</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="payrolldraftworkspace-field-12" className="text-xs font-semibold text-slate-700">
                  Lý do vô hiệu hóa <span className="text-rose-500">*</span>
                </label>
                <Textarea id="payrolldraftworkspace-field-12"
                  required
                  rows={3}
                  placeholder="Nhập lý do vô hiệu hóa phân đoạn lương này (tối thiểu 8 ký tự)..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {voidError && <Button type="button" variant="outline" disabled={voidSubmitting} onClick={() => { voidIntent.current = null; setVoidingLine(null); onRefresh() }}>Tải lại và đối soát audit</Button>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidingLine(null)}
                  disabled={voidSubmitting}
                  className="text-xs"
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={voidSubmitting}
                  className="bg-rose-600 hover:bg-rose-700 text-xs text-white"
                >
                  {voidSubmitting ? 'Đang vô hiệu...' : 'Xác nhận vô hiệu hóa'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* RECALCULATE DRAFT MODAL WITH PREVIEW DIFF */}
      <Dialog open={isRecalcOpen} onOpenChange={(open) => !open && !recalculating && setIsRecalcOpen(false)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-indigo-600" />
              Tính lại lương theo khung giá mới (Rate Recalculation)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Xem trước sự thay đổi đơn giá và chênh lệch tiền lương trước khi cập nhật.
              Các khoản điều chỉnh và lý do của kế toán sẽ được giữ nguyên 100%.
            </DialogDescription>
          </DialogHeader>

          {recalcError && (
            <div className="flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{recalcError}</span>
            </div>
          )}

          {recalcSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-1">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-center">
                <p className="text-[11px] text-slate-500">Dòng thay đổi</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  {recalcSummary.changedLinesCount} / {recalcSummary.totalLines}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-center">
                <p className="text-[11px] text-slate-500">Chênh lệch gộp</p>
                <p
                  className={`text-sm font-bold mt-0.5 ${
                    recalcSummary.totalGrossDeltaVnd > 0
                      ? 'text-emerald-600'
                      : recalcSummary.totalGrossDeltaVnd < 0
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  }`}
                >
                  {recalcSummary.totalGrossDeltaVnd > 0 ? '+' : ''}
                  {formatCurrency(recalcSummary.totalGrossDeltaVnd)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-center">
                <p className="text-[11px] text-slate-500">Chênh lệch thực lĩnh</p>
                <p
                  className={`text-sm font-bold mt-0.5 ${
                    recalcSummary.totalNetDeltaVnd > 0
                      ? 'text-emerald-600'
                      : recalcSummary.totalNetDeltaVnd < 0
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  }`}
                >
                  {recalcSummary.totalNetDeltaVnd > 0 ? '+' : ''}
                  {formatCurrency(recalcSummary.totalNetDeltaVnd)}
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-center">
                <p className="text-[11px] text-blue-600 font-medium">Bảo toàn điều chỉnh</p>
                <p className="text-sm font-bold text-blue-700 mt-0.5">
                  {recalcSummary.preservedAdjustmentsCount} dòng
                </p>
              </div>
            </div>
          )}

          {recalcDiffs.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">
              Không có dữ liệu dòng lương nào để so sánh.
            </div>
          ) : recalcSummary?.changedLinesCount === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-center text-xs text-emerald-800 space-y-1">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
              <p className="font-semibold text-emerald-900">Khung giá đã đồng bộ</p>
              <p>Tất cả các dòng lương hiện tại đều đã khớp với khung giá mới nhất có hiệu lực. Không có chênh lệch nào cần cập nhật.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Chi tiết chênh lệch các dòng lương thay đổi:</p>
              <div className="max-h-60 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b bg-slate-50 font-semibold text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Nhân sự & Vai trò</th>
                      <th className="px-3 py-2 text-right">Đơn giá cũ → mới</th>
                      <th className="px-3 py-2 text-right">Lương gộp cũ → mới</th>
                      <th className="px-3 py-2 text-right">Điều chỉnh giữ nguyên</th>
                      <th className="px-3 py-2 text-right font-bold">Chênh lệch thực lĩnh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recalcDiffs
                      .filter((d) => d.rateChanged)
                      .map((d) => (
                        <tr key={d.lineId} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-800">{d.staffId}</span>
                            <span className="ml-1.5 text-[10px] text-slate-500 font-mono">({d.role})</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span className="text-slate-500 line-through mr-1">
                              {formatCurrency(d.oldRateVndPerHour)}
                            </span>
                            <span className="font-bold text-indigo-700">
                              {formatCurrency(d.newRateVndPerHour ?? 0)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span className="text-slate-500 mr-1">
                              {formatCurrency(d.oldGrossVnd)}
                            </span>
                            →
                            <span className="font-semibold text-slate-800 ml-1">
                              {formatCurrency(d.newGrossVnd ?? 0)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-blue-600">
                            {formatCurrency(d.adjustmentVnd)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            <span
                              className={
                                d.netDeltaVnd > 0
                                  ? 'text-emerald-600'
                                  : d.netDeltaVnd < 0
                                  ? 'text-rose-600'
                                  : 'text-slate-600'
                              }
                            >
                              {d.netDeltaVnd > 0 ? '+' : ''}
                              {formatCurrency(d.netDeltaVnd)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <form onSubmit={handleRecalculateSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="recalc-reason-input" className="text-xs font-semibold text-slate-700">
                Lý do tính lại bảng lương <span className="text-rose-500">*</span>
              </label>
              <Textarea
                id="recalc-reason-input"
                required
                rows={2}
                placeholder="Nhập lý do tính lại theo khung giá mới (tối thiểu 8 ký tự, ví dụ: Cập nhật đơn giá Host tháng 10)..."
                value={recalcReason}
                onChange={(e) => setRecalcReason(e.target.value)}
                className="text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRecalcOpen(false)}
                disabled={recalculating}
                className="text-xs"
              >
                Đóng
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={recalculating || (recalcSummary?.changedLinesCount === 0)}
                className="bg-indigo-600 hover:bg-indigo-700 text-xs text-white"
              >
                {recalculating ? 'Đang tính lại…' : 'Xác nhận tính lại theo giá mới'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
