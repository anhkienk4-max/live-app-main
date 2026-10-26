'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import {
  readMySelfAttendance,
  writeSelfAttendancePhotoCheckIn,
  writeSelfAttendancePhotoCheckOut,
  recoverSelfAttendancePhotoCheckIn,
  recoverSelfAttendancePhotoCheckOut,
} from '@/lib/services/supabaseSelfAttendanceService'
import type { AttendanceRole, AttendanceEventKind, SelfAttendanceEvent } from '@/lib/utils/selfAttendanceContract'

export interface SelfAttendanceShiftContext {
  date: string
  start_time: string
  end_time: string
  brand: string
  platform: string
  title?: string | null
  studio?: string | null
  crossesMidnight?: boolean
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
  const [busy, setBusy] = React.useState(false)
  const [writeError, setWriteError] = React.useState<string | null>(null)
  const [photo, setPhoto] = React.useState<File | null>(null)
  const [photoSource, setPhotoSource] = React.useState<'camera' | 'file_picker'>('camera')
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null)
  const [photoFeatureReady] = React.useState(() => {
    return process.env.NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO==='true'
  })
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const pickerRef = React.useRef<HTMLInputElement>(null)
  const lock = React.useRef(false)
  const requestIds = React.useRef<Partial<Record<AttendanceEventKind, string>>>({})
  const [prevKey, setPrevKey] = React.useState(key)

  if (prevKey !== key) {
    setPrevKey(key)
    setPhoto(null)
    setPhotoPreview(null)
    setWriteError(null)
  }

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

  React.useEffect(() => {
    if (!photo) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setPhotoPreview(reader.result)
    }
    reader.readAsDataURL(photo)
    return () => {
      reader.onload = null
      reader.abort()
    }
  }, [photo])

  const ready = snapshot?.key === key && !snapshot.error
  const rows = ready ? snapshot.items.filter(r => r.role === role) : []
  const checkedIn = rows.find(row => row.event === 'check_in')
  const checkedOut = rows.find(row => row.event === 'check_out')
  const nextAction: AttendanceEventKind | null = !ready
    ? null
    : !checkedIn
    ? 'check_in'
    : !checkedOut
    ? 'check_out'
    : null

  function selectPhoto(file: File | undefined, source: 'camera' | 'file_picker') {
    setWriteError(null)
    if (!file) return
    if (
      file.size < 1 ||
      file.size > 4 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setPhoto(null)
      setPhotoPreview(null)
      setWriteError(
        en
          ? 'Choose a JPG, PNG or WebP image up to 4 MB.'
          : 'Ảnh JPG, PNG hoặc WebP, tối đa 4 MB. Vui lòng chụp/chọn lại.'
      )
      return
    }
    setPhotoPreview(null)
    setPhoto(file)
    setPhotoSource(source)
  }

  async function submit(kind: AttendanceEventKind) {
    if (lock.current || !ready || kind !== nextAction) return
    if (!photoFeatureReady) {
      setWriteError(
        kind === 'check_in'
          ? en
            ? 'Photo check-in is unavailable in this environment.'
            : 'Lưu ảnh Drive chưa được kích hoạt cho môi trường này.'
          : en
          ? 'Photo check-out is unavailable in this environment.'
          : 'Lưu ảnh Drive chưa được kích hoạt cho môi trường này.'
      )
      return
    }
    if (!photo) {
      setWriteError(
        kind === 'check_in'
          ? en
            ? 'Take or choose a check-in photo first.'
            : 'Cần chụp hoặc chọn ảnh check-in trước khi xác nhận.'
          : en
          ? 'Take or choose a check-out photo first.'
          : 'Cần chụp hoặc chọn ảnh check-out trước khi xác nhận.'
      )
      return
    }
    lock.current = true
    setBusy(true)
    setWriteError(null)
    requestIds.current[kind]??=crypto.randomUUID()
    try {
      if (kind === 'check_in') {
        await writeSelfAttendancePhotoCheckIn(
          shiftId,
          role,
          requestIds.current[kind]!,
          photo,
          photoSource
        )
      } else {
        await writeSelfAttendancePhotoCheckOut(
          shiftId,
          role,
          requestIds.current[kind]!,
          photo,
          photoSource
        )
      }
      requestIds.current[kind] = undefined
      setPhoto(null)
      setPhotoPreview(null)
      if (cameraRef.current) cameraRef.current.value = ''
      if (pickerRef.current) pickerRef.current.value = ''
      setSnapshot(null)
      setNonce(v => v + 1)
    } catch (error) {
      setWriteError(
        error instanceof Error
          ? error.message
          : en
          ? 'Could not record attendance. Try again.'
          : 'Không thể ghi nhận chấm công, vui lòng thử lại.'
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function recoverPendingPhoto(kind: AttendanceEventKind) {
    if (lock.current || !ready || kind !== nextAction || !photoFeatureReady) return
    lock.current = true
    setBusy(true)
    setWriteError(null)
    const requestId = requestIds.current[kind] ?? crypto.randomUUID()
    requestIds.current[kind] = requestId
    try {
      if (kind === 'check_in') {
        await recoverSelfAttendancePhotoCheckIn(shiftId, role, requestId)
      } else {
        await recoverSelfAttendancePhotoCheckOut(shiftId, role, requestId)
      }
      requestIds.current[kind] = undefined
      setPhoto(null)
      setPhotoPreview(null)
      if (cameraRef.current) cameraRef.current.value = ''
      if (pickerRef.current) pickerRef.current.value = ''
      setSnapshot(null)
      setNonce(v => v + 1)
    } catch (error) {
      setWriteError(
        error instanceof Error && error.message === 'ATTENDANCE_PHOTO_RECOVERY_UNAVAILABLE'
          ? en
            ? 'No saved photo to recover. Take a photo to continue.'
            : 'Không có ảnh đã lưu cần khôi phục. Hãy chụp ảnh để tiếp tục.'
          : error instanceof Error
          ? error.message
          : en
          ? 'Could not recover attendance. Try again.'
          : 'Không khôi phục được, vui lòng thử lại.'
      )
    } finally {
      lock.current = false
      setBusy(false)
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
      className="space-y-3 rounded-md border p-3"
      data-testid="self-attendance-panel"
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {en ? 'My shift attendance' : 'Chấm công ca của tôi'} · {roleNames[role]}
        </h3>
        <p className="text-xs text-muted-foreground">
          {en
            ? 'The server records event times. Attendance photos await review and do not count as approved work or pay.'
            : 'Thời gian do server ghi nhận. Ảnh điểm danh chỉ là bằng chứng chờ đối chiếu, chưa phải giờ công được duyệt hoặc tiền lương.'}
        </p>
      </div>
      <dl
        className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-3"
        data-testid="attendance-live-shift-context"
      >
        <div>
          <dt className="text-muted-foreground">{en ? 'Shift date' : 'Ngày ca'}</dt>
          <dd className="font-medium">{shiftContext.date}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Live hours' : 'Khung giờ live'}</dt>
          <dd className="font-medium">
            {shiftContext.start_time.slice(0, 5)}–{shiftContext.end_time.slice(0, 5)}
            {shiftContext.crossesMidnight ? ` (${en ? 'next day' : 'qua ngày sau'})` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Brand' : 'Thương hiệu'}</dt>
          <dd className="font-medium">{shiftContext.brand}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Platform' : 'Nền tảng'}</dt>
          <dd className="font-medium">{shiftContext.platform}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Studio' : 'Phòng live'}</dt>
          <dd className="font-medium">{shiftContext.studio || (en ? 'Not provided' : 'Chưa có')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{en ? 'Shift title' : 'Nội dung ca'}</dt>
          <dd className="font-medium">{shiftContext.title || 'Livestream'}</dd>
        </div>
      </dl>

      {!ready && !snapshot?.error ? (
        <p role="status" className="text-xs">
          {en ? 'Checking attendance history…' : 'Đang kiểm tra nhật ký...'}
        </p>
      ) : null}
      {snapshot?.key === key && snapshot.error ? (
        <p role="alert" className="text-xs text-red-600">
          {en ? 'Could not load attendance: ' : 'Không thể tải chấm công: '}
          {snapshot.error}
        </p>
      ) : null}
      {ready ? (
        <p
          role="status"
          data-testid="self-attendance-status"
          className="text-sm font-medium"
          aria-live="polite"
        >
          {checkedOut
            ? en
              ? 'Checked out'
              : 'Đã check-out'
            : checkedIn
            ? en
              ? 'Checked in · Check-out available'
              : 'Đã check-in · Có thể check-out'
            : en
            ? 'Not checked in'
            : 'Chưa check-in'}
        </p>
      ) : null}

      {/* Shift history timestamps and photo flags */}
      {checkedIn ? (
        <p className="text-xs">
          Check-in: {displayTime(checkedIn.recorded_at, language)}
          {checkedIn.photo_available
            ? en
              ? ' · Drive photo attached'
              : ' · Đã gắn ảnh Drive'
            : en
            ? ' · No verified photo'
            : ' · Chưa có ảnh được xác minh'}
        </p>
      ) : null}
      {checkedOut ? (
        <p className="text-xs">
          Check-out: {displayTime(checkedOut.recorded_at, language)}
          {checkedOut.photo_available
            ? en
              ? ' · Drive photo attached'
              : ' · Đã gắn ảnh Drive'
            : en
            ? ' · No verified photo'
            : ' · Chưa có ảnh được xác minh'}
        </p>
      ) : null}

      {/* Render both photos separately in shift history */}
      {checkedIn?.photo_available ? (
        <div className="space-y-1" data-testid="attendance-checkin-evidence">
          <p className="text-xs font-medium">
            {en ? 'Check-in photo evidence' : 'Ảnh bằng chứng check-in'}
          </p>
          {/* Authenticated route enforces owner or scoped reviewer permission. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="max-h-52 max-w-full rounded-md border object-contain"
            src={'/api/workforce/self-attendance-photo?event_id=' + encodeURIComponent(checkedIn.event_id)}
            alt={en ? 'Check-in attendance evidence' : 'Ảnh bằng chứng check-in'}
          />
        </div>
      ) : null}

      {checkedOut?.photo_available ? (
        <div className="space-y-1" data-testid="attendance-checkout-evidence">
          <p className="text-xs font-medium">
            {en ? 'Check-out photo evidence' : 'Ảnh bằng chứng check-out'}
          </p>
          {/* Authenticated route enforces owner or scoped reviewer permission. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="max-h-52 max-w-full rounded-md border object-contain"
            src={'/api/workforce/self-attendance-photo?event_id=' + encodeURIComponent(checkedOut.event_id)}
            alt={en ? 'Check-out attendance evidence' : 'Ảnh bằng chứng check-out'}
          />
        </div>
      ) : null}

      {checkedIn ? (
        <p className="text-xs text-amber-700">
          {en
            ? 'Awaiting manager review of worked time'
            : 'Đang chờ quản lý đối chiếu và duyệt giờ công'}
        </p>
      ) : null}

      {/* Gated message when photo feature is OFF */}
      {nextAction && !photoFeatureReady ? (
        <p role="status" className="text-xs text-amber-700">
          {nextAction === 'check_in'
            ? en
              ? 'Photo check-in awaits verified Google Drive access. Check-in cannot be recorded yet.'
              : 'Check-in ảnh đang chờ xác nhận quyền lưu trên Google Drive. Chưa thể ghi nhận check-in.'
            : en
            ? 'Photo check-out awaits verified Google Drive access. Check-out cannot be recorded yet.'
            : 'Check-out ảnh đang chờ xác nhận quyền lưu trên Google Drive. Chưa thể ghi nhận check-out.'}
        </p>
      ) : null}

      {/* Camera / Photo Capture UI for nextAction */}
      {nextAction && photoFeatureReady ? (
        <div
          className="space-y-2 rounded-md border p-3"
          data-testid={nextAction === 'check_in' ? 'attendance-checkin-camera' : 'attendance-checkout-camera'}
        >
          <p className="text-xs font-medium">
            {nextAction === 'check_in'
              ? en
                ? 'Check-in photo required (JPG/PNG/WebP, up to 4 MB)'
                : 'Ảnh check-in bắt buộc (JPG/PNG/WebP, tối đa 4 MB)'
              : en
              ? 'Check-out photo required (JPG/PNG/WebP, up to 4 MB)'
              : 'Ảnh check-out bắt buộc (JPG/PNG/WebP, tối đa 4 MB)'}
          </p>
          <p className="text-xs text-muted-foreground">
            {nextAction === 'check_in'
              ? en
                ? 'Take a photo in the live room. It will be stored in the role and month folder in Drive CHECK IN/OUT.'
                : 'Chụp ảnh tại phòng live để xác nhận có mặt. Ảnh sẽ được lưu tại Drive CHECK IN/OUT đúng tháng và vai trò.'
              : en
              ? 'Take a photo at shift completion. It will be stored in the role and month folder in Drive CHECK IN/OUT.'
                : 'Chụp ảnh tại phòng live lúc kết thúc ca để xác nhận rời ca. Ảnh sẽ được lưu tại Drive CHECK IN/OUT đúng tháng và vai trò.'}
          </p>
          <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
            className="sr-only"
            aria-label={
              nextAction === 'check_in'
                ? en
                  ? 'Take check-in photo with camera'
                  : 'Chụp ảnh check-in bằng camera'
                : en
                ? 'Take check-out photo with camera'
                : 'Chụp ảnh check-out bằng camera'
            }
            onChange={e => selectPhoto(e.target.files?.[0], 'camera')}
          />
          <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label={
              nextAction === 'check_in'
                ? en
                  ? 'Choose existing check-in photo'
                  : 'Chọn ảnh check-in có sẵn'
                : en
                ? 'Choose existing check-out photo'
                : 'Chọn ảnh check-out có sẵn'
            }
            onChange={e => selectPhoto(e.target.files?.[0], 'file_picker')}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              {en ? 'Take photo' : 'Chụp ảnh'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => pickerRef.current?.click()}
            >
              {en ? 'Choose photo' : 'Chọn ảnh'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void recoverPendingPhoto(nextAction)}
            >
              {nextAction === 'check_in'
                ? en
                  ? 'Recover uploaded check-in'
                  : 'Khôi phục check-in đã gửi ảnh'
                : en
                ? 'Recover uploaded check-out'
                  : 'Khôi phục check-out đã gửi ảnh'}
            </Button>
          </div>
          {photoPreview ? (
            <div className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                className="max-h-48 max-w-full rounded-md border object-contain"
                alt={
                  nextAction === 'check_in'
                    ? en
                      ? 'Photo to upload for check-in'
                      : 'Ảnh sẽ gửi để check-in'
                    : en
                    ? 'Photo to upload for check-out'
                    : 'Ảnh sẽ gửi để check-out'
                }
              />
              <p className="text-xs text-muted-foreground">
                {en ? 'Selected photo' : 'Ảnh đã chọn'}: {photo?.name},{' '}
                {photo ? Math.ceil(photo.size / 1024) : 0} KB.{' '}
                {en ? 'Upload starts on confirmation.' : 'Sẽ tải vào Drive khi xác nhận.'}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {writeError ? <p role="alert" className="text-xs text-red-600">{writeError}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setSnapshot(null)
            setNonce(v => v + 1)
          }}
        >
          {en ? 'Retry / Refresh' : 'Thử lại / Tải lại'}
        </Button>
        {nextAction && photoFeatureReady ? (
          <Button
            type="button"
            size="sm"
            disabled={busy || !photo}
            onClick={() => void submit(nextAction)}
          >
            {busy
              ? en
                ? 'Recording…'
                : 'Đang ghi nhận...'
              : nextAction === 'check_in'
              ? en
                ? 'Upload photo and check in'
                : 'Tải ảnh và check-in'
              : en
              ? 'Upload photo and check-out'
              : 'Tải ảnh và check-out'}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
