'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'
import {
  readMySelfAttendance,
  writeSelfAttendancePhotoCheckIn,
  writeSelfAttendancePhotoCheckOut,
  recoverSelfAttendancePhotoCheckIn,
  recoverSelfAttendancePhotoCheckOut,
} from '@/lib/services/supabaseSelfAttendanceService'
import {
  calculateAttendanceTimePolicy,
  type AttendanceRole,
  type AttendanceEventKind,
  type SelfAttendanceEvent,
} from '@/lib/utils/selfAttendanceContract'
import { AttendanceCorrectionPanel } from './AttendanceCorrectionPanel'
import { AttendanceCameraCapture } from './AttendanceCameraCapture'
import {
  Camera,
  Clock,
  FileImage,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  User,
} from 'lucide-react'

export interface SelfAttendanceShiftContext {
  date: string
  start_time: string
  end_time: string
  brand: string
  platform: string
  title?: string | null
  studio?: string | null
  crossesMidnight?: boolean
  staffName?: string | null
  segmentIndex?: string | null
  segmentTime?: string | null
  segmentSummary?: string | null
}

const displayTime = (value: string, language: 'vi' | 'en') =>
  new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

export function SelfAttendancePanel({
  actorId,
  shiftId,
  role,
  shiftContext,
}: {
  actorId: string
  shiftId: string
  role: AttendanceRole
  shiftContext: SelfAttendanceShiftContext
}) {
  const { language } = useTranslation()
  const en = language === 'en'
  const key = actorId + ':' + shiftId + ':' + role
  const [nonce, setNonce] = React.useState(0)
  const [snapshot, setSnapshot] = React.useState<{
    key: string
    items: SelfAttendanceEvent[]
    error: string | null
  } | null>(null)

  // Feature flags
  const [photoFeatureReady] = React.useState(() => {
    return process.env.NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO === 'true'
  })

  // Time Policy calculation in Asia/Ho_Chi_Minh
  const timePolicy = React.useMemo(() => {
    return calculateAttendanceTimePolicy(
      shiftContext.start_time,
      shiftContext.end_time,
      role,
      'Asia/Ho_Chi_Minh'
    )
  }, [shiftContext.start_time, shiftContext.end_time, role])

  // --- CARD A: CHECK-IN STATE ---
  const [photoCheckIn, setPhotoCheckIn] = React.useState<File | null>(null)
  const [photoSourceCheckIn, setPhotoSourceCheckIn] = React.useState<'camera' | 'file_picker'>('camera')
  const [previewCheckIn, setPreviewCheckIn] = React.useState<string | null>(null)
  const [busyCheckIn, setBusyCheckIn] = React.useState(false)
  const [errorCheckIn, setErrorCheckIn] = React.useState<string | null>(null)
  const [cameraOpenCheckIn, setCameraOpenCheckIn] = React.useState(false)
  const cameraInputCheckInRef = React.useRef<HTMLInputElement | null>(null)
  const pickerInputCheckInRef = React.useRef<HTMLInputElement | null>(null)

  // --- CARD B: CHECK-OUT STATE ---
  const [photoCheckOut, setPhotoCheckOut] = React.useState<File | null>(null)
  const [photoSourceCheckOut, setPhotoSourceCheckOut] = React.useState<'camera' | 'file_picker'>('camera')
  const [previewCheckOut, setPreviewCheckOut] = React.useState<string | null>(null)
  const [busyCheckOut, setBusyCheckOut] = React.useState(false)
  const [errorCheckOut, setErrorCheckOut] = React.useState<string | null>(null)
  const [cameraOpenCheckOut, setCameraOpenCheckOut] = React.useState(false)
  const cameraInputCheckOutRef = React.useRef<HTMLInputElement | null>(null)
  const pickerInputCheckOutRef = React.useRef<HTMLInputElement | null>(null)

  // General lock & idempotent request tracking (preserves contract test invariant)
  const lock = React.useRef(false)
  const requestIds = React.useRef<Partial<Record<AttendanceEventKind, string>>>({})
  const [prevKey, setPrevKey] = React.useState(key)

  if (prevKey !== key) {
    setPrevKey(key)
    setPhotoCheckIn(null)
    setPreviewCheckIn(null)
    setErrorCheckIn(null)
    setPhotoCheckOut(null)
    setPreviewCheckOut(null)
    setErrorCheckOut(null)
  }

  // Load attendance events from server
  React.useEffect(() => {
    let active = true
    void readMySelfAttendance(shiftId, actorId)
      .then(items => {
        if (active) setSnapshot({ key, items, error: null })
      })
      .catch(error => {
        if (active)
          setSnapshot({
            key,
            items: [],
            error: error instanceof Error ? error.message : 'ATTENDANCE_READ_FAILED',
          })
      })
    return () => {
      active = false
    }
  }, [actorId, shiftId, key, nonce])

  const ready = snapshot?.key === key && !snapshot.error
  const rows = ready ? snapshot.items.filter(r => r.role === role) : []
  const checkedIn = rows.find(row => row.event === 'check_in')
  const checkedOut = rows.find(row => row.event === 'check_out')

  function handleSelectPhoto(
    file: File | undefined,
    source: 'camera' | 'file_picker',
    kind: AttendanceEventKind
  ) {
    if (kind === 'check_in') {
      setErrorCheckIn(null)
      if (!file) {
        setPhotoCheckIn(null)
        setPreviewCheckIn(null)
        return
      }
      if (
        file.size < 1 ||
        file.size > 4 * 1024 * 1024 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      ) {
        setPhotoCheckIn(null)
        setPreviewCheckIn(null)
        setErrorCheckIn(
          en
            ? 'Choose a JPG, PNG or WebP image up to 4 MB.'
            : 'Ảnh JPG, PNG hoặc WebP, tối đa 4 MB. Vui lòng chụp/chọn lại.'
        )
        return
      }
      setPhotoCheckIn(file)
      setPhotoSourceCheckIn(source)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setPreviewCheckIn(reader.result)
      }
      reader.readAsDataURL(file)
    } else {
      setErrorCheckOut(null)
      if (!file) {
        setPhotoCheckOut(null)
        setPreviewCheckOut(null)
        return
      }
      if (
        file.size < 1 ||
        file.size > 4 * 1024 * 1024 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      ) {
        setPhotoCheckOut(null)
        setPreviewCheckOut(null)
        setErrorCheckOut(
          en
            ? 'Choose a JPG, PNG or WebP image up to 4 MB.'
            : 'Ảnh JPG, PNG hoặc WebP, tối đa 4 MB. Vui lòng chụp/chọn lại.'
        )
        return
      }
      setPhotoCheckOut(file)
      setPhotoSourceCheckOut(source)
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') setPreviewCheckOut(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  async function submitCheckIn() {
    const kind: AttendanceEventKind = 'check_in'
    if (lock.current || !ready || checkedIn) return
    if (!photoFeatureReady) {
      setErrorCheckIn(
        en
          ? 'Photo check-in is unavailable in this environment.'
          : 'Lưu ảnh Drive chưa được kích hoạt cho môi trường này.'
      )
      return
    }
    if (!photoCheckIn) {
      setErrorCheckIn(
        en
          ? 'Take or choose a check-in photo first.'
          : 'Cần chụp hoặc chọn ảnh check-in trước khi xác nhận.'
      )
      return
    }

    lock.current = true
    setBusyCheckIn(true)
    setErrorCheckIn(null)
    requestIds.current[kind] ??= crypto.randomUUID()
    try {
      await writeSelfAttendancePhotoCheckIn(
        shiftId,
        role,
        requestIds.current[kind]!,
        photoCheckIn,
        photoSourceCheckIn
      )
      requestIds.current[kind] = undefined
      setPhotoCheckIn(null)
      setPreviewCheckIn(null)
      if (cameraInputCheckInRef.current) cameraInputCheckInRef.current.value = ''
      if (pickerInputCheckInRef.current) pickerInputCheckInRef.current.value = ''
      setSnapshot(null)
      setNonce(v => v + 1)
    } catch (err) {
      setErrorCheckIn(
        err instanceof Error
          ? err.message
          : en
          ? 'Could not record check-in. Try again.'
          : 'Không thể ghi nhận check-in, vui lòng thử lại.'
      )
    } finally {
      lock.current = false
      setBusyCheckIn(false)
    }
  }

  async function submitCheckOut() {
    const kind: AttendanceEventKind = 'check_out'
    if (lock.current || !ready || !checkedIn || checkedOut) return
    if (!photoFeatureReady) {
      setErrorCheckOut(
        en
          ? 'Photo check-out is unavailable in this environment.'
          : 'Lưu ảnh Drive chưa được kích hoạt cho môi trường này.'
      )
      return
    }
    if (!photoCheckOut) {
      setErrorCheckOut(
        en
          ? 'Take or choose a check-out photo first.'
          : 'Cần chụp hoặc chọn ảnh check-out trước khi xác nhận.'
      )
      return
    }

    lock.current = true
    setBusyCheckOut(true)
    setErrorCheckOut(null)
    requestIds.current[kind] ??= crypto.randomUUID()
    try {
      await writeSelfAttendancePhotoCheckOut(
        shiftId,
        role,
        requestIds.current[kind]!,
        photoCheckOut,
        photoSourceCheckOut
      )
      requestIds.current[kind] = undefined
      setPhotoCheckOut(null)
      setPreviewCheckOut(null)
      if (cameraInputCheckOutRef.current) cameraInputCheckOutRef.current.value = ''
      if (pickerInputCheckOutRef.current) pickerInputCheckOutRef.current.value = ''
      setSnapshot(null)
      setNonce(v => v + 1)
    } catch (err) {
      setErrorCheckOut(
        err instanceof Error
          ? err.message
          : en
          ? 'Could not record check-out. Try again.'
          : 'Không thể ghi nhận check-out, vui lòng thử lại.'
      )
    } finally {
      lock.current = false
      setBusyCheckOut(false)
    }
  }

  async function recoverPhoto(kind: AttendanceEventKind) {
    if (lock.current || !ready || !photoFeatureReady) return
    lock.current = true
    if (kind === 'check_in') {
      setBusyCheckIn(true)
      setErrorCheckIn(null)
    } else {
      setBusyCheckOut(true)
      setErrorCheckOut(null)
    }

    const requestId = requestIds.current[kind] ?? crypto.randomUUID()
    requestIds.current[kind] = requestId
    try {
      if (kind === 'check_in') {
        await recoverSelfAttendancePhotoCheckIn(shiftId, role, requestId)
      } else {
        await recoverSelfAttendancePhotoCheckOut(shiftId, role, requestId)
      }
      requestIds.current[kind] = undefined
      setSnapshot(null)
      setNonce(v => v + 1)
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'ATTENDANCE_PHOTO_RECOVERY_UNAVAILABLE'
          ? en
            ? 'No saved photo to recover. Take a photo to continue.'
            : 'Không có ảnh đã lưu cần khôi phục. Hãy chụp ảnh để tiếp tục.'
          : err instanceof Error
          ? err.message
          : en
          ? 'Could not recover attendance. Try again.'
          : 'Không khôi phục được, vui lòng thử lại.'

      if (kind === 'check_in') setErrorCheckIn(msg)
      else setErrorCheckOut(msg)
    } finally {
      lock.current = false
      setBusyCheckIn(false)
      setBusyCheckOut(false)
    }
  }

  const roleNames: Record<AttendanceRole, string> = {
    host: 'Host',
    support: en ? 'Support' : 'Trợ live',
    technical: en ? 'Technical' : 'Kỹ thuật',
  }

  return (
    <section
      aria-label={en ? 'My check-in / check-out' : 'Chấm công cá nhân'}
      className="space-y-4 rounded-md border p-3 bg-slate-50/50"
      data-testid="self-attendance-panel"
    >
      {/* 1. HEADER & OVERVIEW */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b pb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <User className="h-4 w-4 text-indigo-600" />
            <span>{en ? 'Personal Attendance' : 'Chấm công cá nhân'} · {roleNames[role]}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {en
              ? 'The server records event times in Asia/Ho_Chi_Minh. Photos serve as attendance evidence awaiting review.'
              : 'Thời gian do server ghi nhận (Asia/Ho_Chi_Minh). Ảnh điểm danh là bằng chứng chờ đối soát, không mặc định cộng/trừ lương.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700 text-xs">
            {timePolicy.timeZone}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyCheckIn || busyCheckOut}
            onClick={() => {
              setSnapshot(null)
              setNonce(v => v + 1)
            }}
            className="text-xs h-7"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            {en ? 'Refresh' : 'Tải lại'}
          </Button>
        </div>
      </div>

      {/* 2. STAFF & SEGMENT CONTEXT (Phase 3) */}
      <dl
        className="grid grid-cols-2 gap-2 rounded-md bg-white border p-3 text-xs sm:grid-cols-4 shadow-2xs"
        data-testid="attendance-live-shift-context"
      >
        <div data-testid="attendance-staff-context">
          <dt className="text-muted-foreground">{en ? 'Personnel' : 'Nhân sự'}</dt>
          <dd className="font-semibold text-slate-800">{shiftContext.staffName || 'Được duyệt phân công'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Role & Brand' : 'Vai trò & Thương hiệu'}</dt>
          <dd className="font-medium">{roleNames[role]} · {shiftContext.brand}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Live Hours' : 'Khung giờ ca'}</dt>
          <dd className="font-medium">
            {shiftContext.start_time.slice(0, 5)} – {shiftContext.end_time.slice(0, 5)}
            {shiftContext.crossesMidnight ? ` (${en ? 'next day' : 'qua đêm'})` : ''}
          </dd>
        </div>
        <div data-testid="attendance-segment-context">
          <dt className="text-muted-foreground">{en ? 'Segment Assignment' : 'Khung nhân sự (Segment)'}</dt>
          <dd className="font-medium">
            {shiftContext.segmentIndex
              ? `${shiftContext.segmentIndex} (${shiftContext.segmentTime || ''})`
              : shiftContext.segmentSummary || (en ? 'Single shift' : 'Ca đơn (Toàn ca)')}
          </dd>
        </div>
      </dl>

      {/* 3. TIME POLICY DISPLAY (Phase 4) */}
      <div
        className="rounded-md border border-slate-200 bg-white p-3 text-xs space-y-2 shadow-2xs"
        data-testid="attendance-time-policy-section"
      >
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <Clock className="h-3.5 w-3.5 text-indigo-600" />
          <span>{en ? 'Attendance Time Window & Expected Arrival Policy' : 'Chính sách thời gian gửi ảnh & Mốc có mặt'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-[11px]">
          <div>
            <span className="text-muted-foreground block">Cửa sổ Check-in:</span>
            <span className="font-medium text-slate-700">{timePolicy.checkInWindowLabel}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Mốc có mặt dự kiến ({roleNames[role]}):</span>
            <span className="font-semibold text-indigo-700">{timePolicy.expectedArrivalLabel}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Cửa sổ Check-out:</span>
            <span className="font-medium text-slate-700">{timePolicy.checkOutWindowLabel}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 italic pt-1 border-t border-dashed border-slate-100" data-testid="attendance-time-policy-disclaimer">
          * {timePolicy.compensationNotice}
        </p>
      </div>

      {/* Loading & Read Error Notices */}
      {!ready && !snapshot?.error && (
        <p role="status" className="text-xs text-slate-500">
          {en ? 'Checking attendance history…' : 'Đang kiểm tra nhật ký chấm công server…'}
        </p>
      )}
      {snapshot?.key === key && snapshot.error && (
        <p role="alert" className="text-xs text-red-600">
          {en ? 'Could not load attendance: ' : 'Không thể tải chấm công: '}
          {snapshot.error}
        </p>
      )}

      {/* Overall Status Banner */}
      {ready && (
        <div className="flex items-center justify-between rounded-md bg-white border px-3 py-2 text-xs shadow-2xs">
          <span className="text-slate-600">Trạng thái tổng thể:</span>
          <span
            role="status"
            data-testid="self-attendance-status"
            className="font-bold text-slate-800"
            aria-live="polite"
          >
            {checkedOut
              ? (en ? 'Completed (Checked out)' : 'Hoàn thành ca (Đã check-out)')
              : checkedIn
              ? (en ? 'In Progress (Checked in · Check-out available)' : 'Đang trong ca (Đã check-in · Có thể check-out)')
              : (en ? 'Not checked in' : 'Chưa check-in')}
          </span>
        </div>
      )}

      {/* 4. TWO INDEPENDENT EVENT CARDS (Phase 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ========================================================= */}
        {/* CARD A: CHECK-IN */}
        {/* ========================================================= */}
        <div
          className="rounded-lg border bg-white p-4 shadow-sm space-y-3 flex flex-col justify-between"
          data-testid="attendance-card-checkin"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-emerald-600" />
                <h4 className="text-sm font-semibold text-slate-900">
                  {en ? '1. Check-in (Arrival)' : '1. Check-in (Có mặt)'}
                </h4>
              </div>
              {checkedIn ? (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                  {en ? 'RECORDED' : 'ĐÃ GHI NHẬN'}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600 text-[10px]">
                  {en ? 'NOT RECORDED' : 'CHƯA CHECK-IN'}
                </Badge>
              )}
            </div>

            {/* Check-in Recorded Receipt or Input */}
            {checkedIn ? (
              <div className="space-y-2 text-xs">
                <div className="rounded bg-emerald-50/50 border border-emerald-200 p-2 text-emerald-950 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-800">Server Receipt:</span>
                    <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-700">
                      {checkedIn.verification_status}
                    </Badge>
                  </div>
                  <p className="font-mono text-[11px]">
                    {displayTime(checkedIn.recorded_at, language)}
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    {checkedIn.photo_available
                      ? (en ? '• Drive photo attached' : '• Đã gắn ảnh Drive')
                      : (en ? '• No verified photo' : '• Chưa có ảnh xác thực')}
                  </p>
                </div>

                {/* Authenticated Check-in Image Evidence */}
                {checkedIn.photo_available && (
                  <div className="space-y-1" data-testid="attendance-checkin-evidence">
                    <span className="font-medium text-slate-700 text-[11px]">
                      {en ? 'Check-in Photo Evidence:' : 'Ảnh bằng chứng Check-in:'}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="max-h-44 w-full rounded border object-contain bg-black/5"
                      src={'/api/workforce/self-attendance-photo?event_id=' + encodeURIComponent(checkedIn.event_id)}
                      alt="Check-in attendance evidence"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-slate-600">
                  {en
                    ? 'Take or select a photo in the live studio to record check-in.'
                    : 'Chụp ảnh tại phòng live để xác nhận có mặt đúng khung giờ quy định.'}
                </p>

                {/* Photo Inputs */}
                <input
                  ref={cameraInputCheckInRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleSelectPhoto(e.target.files?.[0], 'camera', 'check_in')}
                />
                <input
                  ref={pickerInputCheckInRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => handleSelectPhoto(e.target.files?.[0], 'file_picker', 'check_in')}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busyCheckIn}
                    data-testid="attendance-checkin-open-camera-btn"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
                        setCameraOpenCheckIn(true)
                      } else {
                        cameraInputCheckInRef.current?.click()
                      }
                    }}
                    className="text-xs"
                  >
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    {en ? 'Take photo' : 'Chụp ảnh'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyCheckIn}
                    data-testid="attendance-checkin-file-picker-btn"
                    onClick={() => pickerInputCheckInRef.current?.click()}
                    className="text-xs"
                  >
                    <FileImage className="mr-1.5 h-3.5 w-3.5" />
                    {en ? 'Choose photo' : 'Chọn ảnh'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyCheckIn}
                    data-testid="attendance-checkin-recover-btn"
                    onClick={() => void recoverPhoto('check_in')}
                    className="text-xs text-slate-500"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {en ? 'Recover' : 'Khôi phục'}
                  </Button>
                </div>

                <AttendanceCameraCapture
                  open={cameraOpenCheckIn}
                  onOpenChange={setCameraOpenCheckIn}
                  onCapture={(file, src) => handleSelectPhoto(file, src, 'check_in')}
                  shiftContext={shiftContext}
                  role={role}
                  eventKind="check_in"
                  onFallbackToPicker={() => cameraInputCheckInRef.current?.click()}
                />

                {/* Check-in Photo Preview */}
                {previewCheckIn && (
                  <div className="space-y-1 rounded border bg-slate-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewCheckIn}
                      className="max-h-36 w-full rounded border object-contain bg-white"
                      alt="Check-in preview"
                      data-testid="attendance-checkin-preview-img"
                    />
                    <p className="text-[10px] text-slate-500">
                      {photoCheckIn?.name} ({photoCheckIn ? Math.ceil(photoCheckIn.size / 1024) : 0} KB)
                    </p>
                  </div>
                )}

                {errorCheckIn && (
                  <p role="alert" className="text-xs text-rose-600" data-testid="attendance-checkin-error">
                    {errorCheckIn}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Submit Action for Check-In */}
          {!checkedIn && (
            <div className="pt-2 border-t mt-3">
              <Button
                type="button"
                size="sm"
                className="w-full text-xs font-semibold"
                disabled={busyCheckIn || !photoCheckIn}
                onClick={() => void submitCheckIn()}
                data-testid="attendance-checkin-submit-btn"
              >
                {busyCheckIn ? (en ? 'Recording…' : 'Đang ghi nhận…') : (en ? 'Upload photo and check-in' : 'Tải ảnh và Check-in')}
              </Button>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* CARD B: CHECK-OUT */}
        {/* ========================================================= */}
        <div
          className={`rounded-lg border p-4 shadow-sm space-y-3 flex flex-col justify-between ${
            !checkedIn ? 'bg-slate-50/70 border-slate-200 opacity-90' : 'bg-white'
          }`}
          data-testid="attendance-card-checkout"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <LogOut className={`h-4 w-4 ${checkedIn ? 'text-amber-600' : 'text-slate-400'}`} />
                <h4 className="text-sm font-semibold text-slate-900">
                  {en ? '2. Check-out (Departure)' : '2. Check-out (Rời ca)'}
                </h4>
              </div>
              {checkedOut ? (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                  {en ? 'RECORDED' : 'ĐÃ GHI NHẬN'}
                </Badge>
              ) : !checkedIn ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                  <Lock className="mr-1 h-3 w-3" />
                  {en ? 'LOCKED' : 'ĐANG KHÓA'}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 text-[10px]">
                  {en ? 'AVAILABLE' : 'CÓ THỂ CHECK-OUT'}
                </Badge>
              )}
            </div>

            {/* Locked Reason if Not Checked In (Phase 2 requirement: Do not hide card!) */}
            {!checkedIn ? (
              <div
                role="alert"
                className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 space-y-1"
                data-testid="attendance-checkout-locked-alert"
              >
                <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                  <Lock className="h-3.5 w-3.5 text-amber-700" />
                  <span>Check-out đang khóa</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Cần hoàn tất Check-in thành công trước khi có thể chụp ảnh và ghi nhận Check-out rời ca.
                </p>
              </div>
            ) : checkedOut ? (
              <div className="space-y-2 text-xs">
                <div className="rounded bg-emerald-50/50 border border-emerald-200 p-2 text-emerald-950 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-800">Server Receipt:</span>
                    <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-700">
                      {checkedOut.verification_status}
                    </Badge>
                  </div>
                  <p className="font-mono text-[11px]">
                    {displayTime(checkedOut.recorded_at, language)}
                  </p>
                  <p className="text-[10px] text-emerald-700">
                    {checkedOut.photo_available
                      ? (en ? '• Drive photo attached' : '• Đã gắn ảnh Drive')
                      : (en ? '• No verified photo' : '• Chưa có ảnh xác thực')}
                  </p>
                </div>

                {/* Authenticated Check-out Image Evidence */}
                {checkedOut.photo_available && (
                  <div className="space-y-1" data-testid="attendance-checkout-evidence">
                    <span className="font-medium text-slate-700 text-[11px]">
                      {en ? 'Check-out Photo Evidence:' : 'Ảnh bằng chứng Check-out:'}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="max-h-44 w-full rounded border object-contain bg-black/5"
                      src={'/api/workforce/self-attendance-photo?event_id=' + encodeURIComponent(checkedOut.event_id)}
                      alt="Check-out attendance evidence"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p className="text-slate-600">
                  {en
                    ? 'Take or select a photo at shift completion to record departure.'
                    : 'Chụp ảnh tại phòng live lúc hoàn tất ca trực để xác nhận rời ca.'}
                </p>

                {/* Photo Inputs */}
                <input
                  ref={cameraInputCheckOutRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleSelectPhoto(e.target.files?.[0], 'camera', 'check_out')}
                />
                <input
                  ref={pickerInputCheckOutRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => handleSelectPhoto(e.target.files?.[0], 'file_picker', 'check_out')}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busyCheckOut}
                    data-testid="attendance-checkout-open-camera-btn"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
                        setCameraOpenCheckOut(true)
                      } else {
                        cameraInputCheckOutRef.current?.click()
                      }
                    }}
                    className="text-xs"
                  >
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    {en ? 'Take photo' : 'Chụp ảnh'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyCheckOut}
                    data-testid="attendance-checkout-file-picker-btn"
                    onClick={() => pickerInputCheckOutRef.current?.click()}
                    className="text-xs"
                  >
                    <FileImage className="mr-1.5 h-3.5 w-3.5" />
                    {en ? 'Choose photo' : 'Chọn ảnh'}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyCheckOut}
                    data-testid="attendance-checkout-recover-btn"
                    onClick={() => void recoverPhoto('check_out')}
                    className="text-xs text-slate-500"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {en ? 'Recover' : 'Khôi phục'}
                  </Button>
                </div>

                <AttendanceCameraCapture
                  open={cameraOpenCheckOut}
                  onOpenChange={setCameraOpenCheckOut}
                  onCapture={(file, src) => handleSelectPhoto(file, src, 'check_out')}
                  shiftContext={shiftContext}
                  role={role}
                  eventKind="check_out"
                  onFallbackToPicker={() => cameraInputCheckOutRef.current?.click()}
                />

                {/* Check-out Photo Preview */}
                {previewCheckOut && (
                  <div className="space-y-1 rounded border bg-slate-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewCheckOut}
                      className="max-h-36 w-full rounded border object-contain bg-white"
                      alt="Check-out preview"
                      data-testid="attendance-checkout-preview-img"
                    />
                    <p className="text-[10px] text-slate-500">
                      {photoCheckOut?.name} ({photoCheckOut ? Math.ceil(photoCheckOut.size / 1024) : 0} KB)
                    </p>
                  </div>
                )}

                {errorCheckOut && (
                  <p role="alert" className="text-xs text-rose-600" data-testid="attendance-checkout-error">
                    {errorCheckOut}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Submit Action for Check-Out */}
          {checkedIn && !checkedOut && (
            <div className="pt-2 border-t mt-3">
              <Button
                type="button"
                size="sm"
                className="w-full text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                disabled={busyCheckOut || !photoCheckOut}
                onClick={() => void submitCheckOut()}
                data-testid="attendance-checkout-submit-btn"
              >
                {busyCheckOut ? (en ? 'Recording…' : 'Đang ghi nhận…') : (en ? 'Upload photo and check-out' : 'Tải ảnh và Check-out')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 5. CORRECTIONS & DRIVE REVIEWS */}
      {photoFeatureReady && (
        <AttendanceCorrectionPanel key={`${actorId}:${shiftId}`} shiftId={shiftId} />
      )}
    </section>
  )
}
