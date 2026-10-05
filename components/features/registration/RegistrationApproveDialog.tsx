'use client'

import * as React from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { shiftRegistrationService, type ShiftRoleCapacity } from '@/lib/services/dataService'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'

interface RegistrationApproveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  registration: ShiftRegistration | null
  applicant?: User
  shift?: Shift
  capacity?: ShiftRoleCapacity
  reviewerId: string
  onSuccess: () => Promise<void>
}

export function RegistrationApproveDialog({
  open,
  onOpenChange,
  registration,
  applicant,
  shift,
  capacity,
  reviewerId,
  onSuccess,
}: RegistrationApproveDialogProps) {
  const { toast } = useToast()
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      setNotes('')
      setError(null)
      setSubmitting(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  if (!registration) return null

  const applicantName = applicant?.full_name || registration.imported_name || registration.user_id
  const confirmed = capacity?.approved ?? 0
  const required = capacity?.required ?? 1
  const afterConfirmed = Math.min(required, confirmed + 1)

  const handleApprove = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await shiftRegistrationService.approve(
        registration.id,
        reviewerId,
        notes.trim() || undefined,
        registration.version
      )
      toast({
        title: 'Phê duyệt thành công',
        description: `Đã duyệt đơn #${registration.id} cho ${applicantName}. Nhân sự đã được ghi nhận trên ca trực.`,
        variant: 'success',
      })
      onOpenChange(false)
      await onSuccess()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể phê duyệt đơn đăng ký.'
      setError(message)
      toast({
        title: 'Lỗi phê duyệt',
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
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>Xác nhận phê duyệt đơn đăng ký ca trực</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Đơn #{registration.id} · Ứng viên: <strong className="text-slate-800">{applicantName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-950 space-y-2">
            <div className="font-semibold text-xs flex items-center justify-between">
              <span>Tác động chỉ tiêu nhân sự ca (Staffing Impact):</span>
              <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-[10px] text-emerald-800 uppercase font-bold">
                {registration.operational_role}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/60">
              <span className="text-emerald-800">Định mức hiện tại:</span>
              <span className="font-mono font-bold">{confirmed} / {required} nhân sự</span>
            </div>
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>Định mức sau phê duyệt:</span>
              <span className="font-mono text-emerald-700">{afterConfirmed} / {required} nhân sự</span>
            </div>
            <p className="text-[11px] text-emerald-800/90 leading-relaxed pt-1">
              Phê duyệt đơn này sẽ chuyển trạng thái đăng ký thành <code>approved</code>. Bản ghi ShiftRegistration đóng vai trò là căn cứ phân bổ nhân sự chính thức trực tiếp trên ca trực.
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
              Ghi chú phê duyệt (Tùy chọn):
            </label>
            <Input
              type="text"
              placeholder="Ví dụ: Đạt yêu cầu kỹ năng, đã xác nhận qua phỏng vấn"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-xs"
              disabled={submitting}
            />
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
              onClick={handleApprove}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                'Xác nhận duyệt & Gán phân bổ'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
