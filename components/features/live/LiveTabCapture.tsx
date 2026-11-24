'use client'

import * as React from 'react'
import { MonitorPlay, Volume2, VolumeX, ScreenShare, ScreenShareOff } from 'lucide-react'
import type { Shift } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { useOptionalLiveTabPublisher } from './LiveTabPublisherContext'

/**
 * User-approved browser-tab capture for the selected shift.
 * No iframe; delegates persistent lifecycle and multi-account gateway
 * publishing to LiveTabPublisherProvider when mounted inside the app shell.
 */
export function LiveTabCapture({ shift }: { shift?: Shift } = {}) {
  const publisher = useOptionalLiveTabPublisher()
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const mountedRef = React.useRef(true)
  const persistentManagedRef = React.useRef(false)
  const [localStarting, setStarting] = React.useState(false)
  const [localActive, setActive] = React.useState(false)
  const [localAudioAvailable, setAudioAvailable] = React.useState(false)
  const [playAudio, setPlayAudio] = React.useState(false)
  const [localError, setError] = React.useState<string | null>(null)

  const isPersistent = Boolean(publisher && shift)
  const isPublishingThisShift = Boolean(
    publisher
    && shift
    && publisher.activeShift?.id === shift.id
    && publisher.captureState === 'capturing'
    && publisher.stream,
  )
  const isPublishingOtherShift = Boolean(
    publisher
    && shift
    && publisher.activeShift
    && publisher.activeShift.id !== shift.id
    && publisher.captureState === 'capturing',
  )

  const active = isPersistent ? isPublishingThisShift : localActive
  const starting = isPersistent
    ? Boolean(publisher && shift && publisher.activeShift?.id === shift.id && publisher.captureState === 'requesting')
    : localStarting
  const audioAvailable = isPersistent ? Boolean(isPublishingThisShift && publisher?.audioAvailable) : localAudioAvailable
  const error = isPersistent
    ? (localError ?? (publisher && shift && publisher.activeShift?.id === shift.id ? (publisher.publishError ?? publisher.error) : null))
    : localError

  React.useEffect(() => {
    persistentManagedRef.current = isPersistent
  }, [isPersistent])

  const stopCapture = React.useCallback(() => {
    if (isPersistent && publisher && shift && publisher.activeShift?.id === shift.id) {
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      void publisher.stopCapture('idle')
      if (mountedRef.current) {
        setActive(false)
        setAudioAvailable(false)
        setPlayAudio(false)
      }
      return
    }
    const stream = streamRef.current
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    stream?.getTracks().forEach(track => track.stop())
    if (mountedRef.current) {
      setActive(false)
      setAudioAvailable(false)
      setPlayAudio(false)
    }
  }, [isPersistent, publisher, shift])

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Changing shift or navigating away stops capture only in unpinned local-only mode.
      if (!persistentManagedRef.current) {
        streamRef.current?.getTracks().forEach(track => track.stop())
      }
      streamRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (isPersistent && publisher && shift && publisher.activeShift?.id === shift.id) {
      streamRef.current = publisher.stream
    }
    if (!active || !videoRef.current || !streamRef.current) return
    const element = videoRef.current
    element.srcObject = streamRef.current
    void element.play().catch(() => {
      if (mountedRef.current) setError('Không thể phát bản xem trước. Kiểm tra tab nguồn và thử lại.')
    })
    return () => { element.srcObject = null }
  }, [active, isPersistent, publisher, publisher?.stream, shift])

  const startCapture = async () => {
    if (starting || active) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      const msg = 'Trình duyệt này không hỗ trợ chia sẻ tab. Hãy dùng Microsoft Edge hoặc Chrome trên máy tính.'
      if (isPersistent && publisher) publisher.setCaptureFailure('unsupported', msg)
      setError(msg)
      return
    }
    setStarting(true)
    setError(null)
    if (isPersistent && publisher && shift) {
      publisher.setRequesting({
        id: shift.id,
        title: shift.title || shift.date,
        studio: shift.studio,
        brand_id: shift.brand_id,
        platform_id: shift.platform_id,
        status: shift.status,
      })
    }
    try {
      // Must be called directly from a user's click; permission is never persisted.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (!mountedRef.current && !(isPersistent && publisher && shift)) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        stream.getTracks().forEach(track => track.stop())
        throw new Error('NO_VIDEO_TRACK')
      }
      if (isPersistent && publisher && shift) {
        await publisher.attachAndPublishStream(shift, stream)
      } else {
        streamRef.current = stream
        videoTrack.addEventListener('ended', stopCapture, { once: true })
        setAudioAvailable(stream.getAudioTracks().length > 0)
        setActive(true)
      }
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : ''
      const message = name === 'NotAllowedError' || name === 'AbortError'
        ? 'Bạn đã hủy hoặc từ chối chia sẻ. Hãy bấm lại và chọn đúng tab LIVE.'
        : 'Không thể lấy hình ảnh tab. Kiểm tra quyền chia sẻ và trạng thái phát của tab LIVE.'
      if (isPersistent && publisher) {
        publisher.setCaptureFailure(
          name === 'NotAllowedError' || name === 'AbortError' ? 'permission-denied' : 'idle',
          message,
        )
      }
      if (mountedRef.current) setError(message)
    } finally {
      if (mountedRef.current) setStarting(false)
    }
  }

  return (
    <section className="mt-3 rounded-lg border bg-white p-3" data-testid="live-tab-capture">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Xem hình ảnh LIVE ngay trong Monitor</h4>
          <p className="mt-1 max-w-2xl text-xs text-slate-600">
            Mở phiên phát ở tab TikTok/Shopee riêng. Sau đó bấm chia sẻ, chọn đúng tab LIVE trong hộp thoại Edge.
            Không chọn tab ADA Monitor để tránh hiệu ứng lặp màn hình.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void startCapture()}
              disabled={starting}
              data-testid="start-live-tab-capture"
            >
              <ScreenShare className="mr-2 h-4 w-4" />
              {starting ? 'Đang chờ chọn tab…' : 'Chia sẻ tab LIVE vào Monitor'}
            </Button>
          ) : (
            <>
              {audioAvailable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPlayAudio(value => !value)}
                  data-testid="toggle-live-tab-audio"
                >
                  {playAudio ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
                  {playAudio ? 'Tắt tiếng bản xem' : 'Bật tiếng bản xem'}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={stopCapture}
                data-testid="stop-live-tab-capture"
              >
                <ScreenShareOff className="mr-2 h-4 w-4" />
                Dừng chia sẻ
              </Button>
            </>
          )}
        </div>
      </div>

      {isPublishingOtherShift && publisher?.activeShift && (
        <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-900" data-testid="other-shift-sharing-notice">
          Đang duy trì chia sẻ nền cho ca: <strong>{publisher.activeShift.title}</strong>. Bấm bắt đầu ở ca này nếu bạn muốn chuyển phiên phát.
        </p>
      )}

      {error && <p role="alert" className="mt-2 text-xs text-red-700" data-testid="live-tab-capture-error">{error}</p>}

      {(active || isPublishingThisShift) && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-700">
            <MonitorPlay className="h-4 w-4" />
            <span>
              {publisher?.publishStatus === 'publishing'
                ? 'Đang phát tab đã chọn (duy trì nền khi chuyển ca và đồng bộ đa tài khoản)'
                : 'Đang hiển thị tab đã chọn trên thiết bị này'}
            </span>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={!playAudio}
            controls
            className="max-h-[560px] w-full rounded-lg bg-black object-contain"
            data-testid="local-live-tab-player"
            aria-label="Hình ảnh tab livestream do người dùng chia sẻ"
          />
          <p className="text-xs text-slate-500">
            Đây là hình ảnh tab được chia sẻ trực tiếp bởi nhân sự vận hành ca, không phải API video từ TikTok/Shopee.
            Chỉ các tài khoản được cấp quyền mới xem được luồng trực tiếp; bấm Dừng chia sẻ khi kết thúc.
          </p>
        </div>
      )}
    </section>
  )
}
