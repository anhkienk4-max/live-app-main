'use client'

import * as React from 'react'
import { XCircle, AlertCircle, Loader2 } from 'lucide-react'
import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { shiftRegistrationService } from '@/lib/services/dataService'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'

interface RegistrationRejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  registration: ShiftRegistration | null
  applicant?: User
  shift?: Shift
  reviewerId: string
  onSuccess: () => Promise<void>
}

export function RegistrationRejectDialog({
  open,
  onOpenChange,
  registration,
  applicant,
  shift,
  reviewerId,
  onSuccess,
}: RegistrationRejectDialogProps) {
  const { toast } = useToast()
  const [reason, setReason] = React.useState('')
  const [validationError, setValidationError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      setReason('')
      setValidationError(null)
      setError(null)
      setSubmitting(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  if (!registration) return null

  const applicantName = applicant?.full_name || registration.imported_name || registration.user_id

  const handleReject = async () => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setValidationError('Vui lòng nhập lý do từ chối (Không được để trống theo quy định kiểm toán).')
      return
    }
    setValidationError(null)
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      await shiftRegistrationService.reject(
        registration.id,
        reviewerId,
        trimmed,
        registration.version
      )
      toast({
        title: 'Đã từ chối đơn đăng ký',
        description: `Đơn #${registration.id} của ${applicantName} đã được cập nhật sang trạng thái rejected.`,
        variant: 'success',
      })
      onOpenChange(false)
      await onSuccess()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể từ chối đơn đăng ký.'
      setError(message)
      toast({
        title: 'Lỗi từ chối đơn',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            <XCircle className="h-5 w-5 text-rose-600" />
            <span>Từ chối đơn đăng ký ca trực</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Đơn #{registration.id} · Ứng viên: <strong className="text-slate-800">{applicantName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3.5 text-rose-950 space-y-1.5">
            <div className="font-semibold text-xs flex items-center justify-between">
              <span>Xác nhận từ chối đơn đăng ký:</span>
              <Badge variant="outline" className="border-rose-300 bg-rose-100 text-[10px] text-rose-800 uppercase font-bold">
                {registration.operational_role}
              </Badge>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-800">
              Đơn đăng ký sẽ chuyển sang trạng thái <code>rejected</code> và ghi nhận lý do vào sổ kiểm toán (AuditTrail & review_notes). Vị trí {registration.operational_role.toUpperCase()} trong ca trực sẽ tiếp tục mở cho ứng viên khác.
            </p>
          </div>

          {shift && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 space-y-1 text-slate-700">
              <div className="font-semibold text-slate-900">{shift.title}</div>
              <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
                <span>Ngày: {shift.date}</span>
                <span>Giờ: {shift.start_time} – {shift.end_time}</span>
                {shift.studio && <span>Studio: {shift.studio}</span>}
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              Lý do từ chối (Bắt buộc theo chuẩn kiểm toán):
            </label>
            <Textarea
              rows={3}
              placeholder="Nhập lý do chi tiết từ chối..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (validationError && e.target.value.trim()) {
                  setValidationError(null)
                }
              }}
              className={`w-full text-xs ${validationError ? 'border-rose-500 bg-rose-50/30' : ''}`}
              disabled={submitting}
            />
            {validationError && (
              <div className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 flex-shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">Thao tác không thành công:</span> {error}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleReject}
              disabled={submitting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                'Xác nhận từ chối đơn'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
