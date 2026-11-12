'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Camera, FileImage, Lock, ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import type { AttendanceEventKind } from '@/lib/utils/selfAttendanceContract'

interface AdminProxyAttendanceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  registrations: ShiftRegistration[]
  users?: User[]
}

export function AdminProxyAttendanceModal({
  open,
  onOpenChange,
  shift,
  registrations,
  users = [],
}: AdminProxyAttendanceModalProps) {
  const { language } = useTranslation()
  const en = language === 'en'

  const approvedRegistrations = React.useMemo(() => {
    return registrations.filter(r => r.status === 'approved' || r.status === 'manually_assigned')
  }, [registrations])

  const [selectedStaffIdState, setSelectedStaffId] = React.useState<string>('')
  const selectedStaffId = (approvedRegistrations.some(r => r.user_id === selectedStaffIdState)
    ? selectedStaffIdState
    : approvedRegistrations[0]?.user_id) || ''
  const [eventKind, setEventKind] = React.useState<AttendanceEventKind>('check_in')
  const [effectiveTime, setEffectiveTime] = React.useState<string>(shift.start_time || '10:00')
  const [reason, setReason] = React.useState<string>('')
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null)
  const [photoSource, setPhotoSource] = React.useState<'camera' | 'file_picker'>('file_picker')
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null)

  const selectedStaffRegistration = approvedRegistrations.find(r => r.user_id === selectedStaffId)
  const selectedUser = users.find(u => u.id === selectedStaffId)
  const staffDisplayName = selectedUser?.full_name || selectedStaffRegistration?.user_id || 'Nhân sự'

  const handleSelectFile = (file?: File, source: 'camera' | 'file_picker' = 'file_picker') => {
    if (!file) return
    setPhoto(file)
    setPhotoSource(source)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const isFormValid = Boolean(
    selectedStaffId &&
    reason.trim().length >= 8 &&
    effectiveTime
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" data-testid="admin-proxy-attendance-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-indigo-600" />
            <DialogTitle>
              {en ? 'Admin Proxy Attendance Entry' : 'Bổ sung chấm công hộ (Admin)'}
            </DialogTitle>
          </div>
          <DialogDescription>
            {en
              ? 'Administrator supplemental attendance recording for assigned personnel (Owner Addendum #183).'
              : 'Giao diện dành riêng cho Admin bổ sung bằng chứng và điều chỉnh chấm công cho nhân sự được phân công theo Owner Addendum #183.'}
          </DialogDescription>
        </DialogHeader>

        {/* C5 Backend Safety Lock Alert Banner */}
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 space-y-2"
          data-testid="admin-proxy-attendance-locked-alert"
        >
          <div className="flex items-center gap-2 font-semibold text-amber-950">
            <Lock className="h-4 w-4 text-amber-700" />
            <span>Chờ C5 Backend RPC: proxy_attendance_record</span>
          </div>
          <p className="leading-relaxed">
            Hành động ghi nhận chấm công hộ yêu cầu backend C5 hoàn tất RPC có thẩm quyền với audit log bất biến. Nút Lưu tạm thời bị khóa an toàn để bảo vệ tính toàn vẹn dữ liệu.
          </p>
        </div>

        <div className="space-y-4 text-xs">
          {/* 1. Target Staff Selection */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">
              {en ? 'Assigned Personnel' : 'Nhân sự được phân công ca'}
            </label>
            {approvedRegistrations.length > 0 ? (
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                data-testid="admin-proxy-staff-select"
              >
                {approvedRegistrations.map(r => {
                  const u = users.find(item => item.id === r.user_id)
                  const name = u?.full_name || r.user_id
                  return (
                    <option key={r.id} value={r.user_id}>
                      {name} — {r.operational_role.toUpperCase()}
                    </option>
                  )
                })}
              </select>
            ) : (
              <p className="text-muted-foreground italic">
                Ca này chưa có nhân sự được duyệt phân công chính thức.
              </p>
            )}
          </div>

          {/* 2. Event Kind & Source */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">
                {en ? 'Event Kind' : 'Loại sự kiện'}
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={eventKind === 'check_in' ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => {
                    setEventKind('check_in')
                    setEffectiveTime(shift.start_time || '10:00')
                  }}
                  data-testid="admin-proxy-event-checkin"
                >
                  Check-in (Vào ca)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={eventKind === 'check_out' ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => {
                    setEventKind('check_out')
                    setEffectiveTime(shift.end_time || '18:00')
                  }}
                  data-testid="admin-proxy-event-checkout"
                >
                  Check-out (Rời ca)
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">
                {en ? 'Effective Attendance Time' : 'Giờ chấm công thực tế điều chỉnh'}
              </label>
              <Input
                type="time"
                value={effectiveTime}
                onChange={e => setEffectiveTime(e.target.value)}
                className="text-xs"
                data-testid="admin-proxy-effective-time-input"
              />
            </div>
          </div>

          {/* 3. Original Server Timestamp Display (Immutable) */}
          <div className="rounded-md border bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-600">Timestamp Server gốc:</span>
              <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 font-mono text-[10px]">
                BẤT BIẾN (IMMUTABLE)
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Timestamp server thực tế khi nhân sự thao tác (nếu có) sẽ luôn được bảo toàn nguyên vẹn trong ledger audit, không thể bị ghi đè bởi thao tác proxy.
            </p>
          </div>

          {/* 4. Photo Evidence (Optional in Proxy) */}
          <div className="space-y-2 rounded-md border p-3">
            <label className="font-semibold text-slate-700 block">
              {en ? 'Supplemental Photo Evidence' : 'Minh chứng ảnh bổ sung (Tùy chọn)'}
            </label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={e => handleSelectFile(e.target.files?.[0], 'camera')}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => handleSelectFile(e.target.files?.[0], 'file_picker')}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cameraInputRef.current?.click()}
                data-testid="admin-proxy-camera-btn"
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {en ? 'Camera' : 'Chụp ảnh'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                data-testid="admin-proxy-picker-btn"
              >
                <FileImage className="mr-1.5 h-3.5 w-3.5" />
                {en ? 'Gallery / File' : 'Chọn ảnh'}
              </Button>
              {photo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoto(null)
                    setPhotoPreview(null)
                  }}
                >
                  Xóa ảnh
                </Button>
              )}
            </div>
            {photoPreview && (
              <div className="mt-2 space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Proxy evidence preview"
                  className="max-h-40 max-w-full rounded border object-contain"
                />
                <p className="text-[11px] text-slate-500">
                  {photo?.name} ({photo ? Math.ceil(photo.size / 1024) : 0} KB)
                </p>
              </div>
            )}
          </div>

          {/* 5. Required Reason (Min 8 characters) */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-700 flex items-center justify-between">
              <span>{en ? 'Reason for Proxy Attendance' : 'Lý do bổ sung chấm công hộ (Bắt buộc)'}</span>
              <span className="text-[10px] text-slate-400 font-normal">Tối thiểu 8 ký tự</span>
            </label>
            <Textarea
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ví dụ: Nhân sự quên check-in do hỗ trợ setup kỹ thuật khẩn cấp..."
              className="text-xs"
              data-testid="admin-proxy-reason-input"
            />
          </div>

          {/* 6. Before / After Diff View */}
          <div className="rounded-md border bg-slate-50 p-3 space-y-2">
            <span className="font-semibold text-slate-700 block">So sánh Before / After:</span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded border bg-white p-2">
                <span className="font-medium text-slate-500 block">Trước (Before):</span>
                <p className="mt-1">Nhân sự: {staffDisplayName}</p>
                <p>Trạng thái: Chưa ghi nhận / Theo nhật ký cá nhân</p>
              </div>
              <div className="rounded border border-indigo-200 bg-indigo-50/50 p-2 text-indigo-950">
                <span className="font-medium text-indigo-700 block">Sau (After):</span>
                <p className="mt-1">Sự kiện: {eventKind === 'check_in' ? 'Check-in' : 'Check-out'}</p>
                <p>Giờ hiệu lực: {effectiveTime}</p>
                <p>Nguồn ảnh: {photo ? (photoSource === 'camera' ? 'Camera trực tiếp' : 'File ảnh tải lên') : 'Không đính kèm'}</p>
                <p>Ghi chú: Admin Proxy ({reason || '—'})</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground mr-auto" data-testid="admin-proxy-validation-hint">
            {isFormValid ? 'Form hợp lệ (chờ C5 RPC)' : 'Yêu cầu: Chọn nhân sự, giờ hợp lệ, lý do tối thiểu 8 ký tự'}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {en ? 'Cancel' : 'Hủy'}
          </Button>
          <Button
            type="button"
            disabled={true /* Always disabled pending C5 RPC */}
            title="Đang khóa an toàn chờ RPC C5 backend: proxy_attendance_record"
            data-testid="admin-proxy-submit-btn"
          >
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            {en ? 'Save Proxy Attendance (Locked)' : 'Lưu chấm công hộ (Đang khóa)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
