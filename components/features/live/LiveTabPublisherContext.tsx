'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Radio, ScreenShareOff, ArrowUpRight, AlertCircle } from 'lucide-react'
import type { Shift } from '@/lib/types/database.types'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import {
  deleteGatewayStream,
  pushGatewayVideoFrame,
  requestPublishSessionHeartbeat,
  requestPublishSessionStart,
  requestPublishSessionStop,
  type PublishSessionGrant,
} from '@/lib/media/liveTabGatewayClient'

export type PersistentCaptureState =
  | 'idle'
  | 'requesting'
  | 'capturing'
  | 'capture-ended'
  | 'permission-denied'
  | 'unsupported'

export type PersistentPublishStatus =
  | 'idle'
  | 'starting'
  | 'publishing'
  | 'local-only'
  | 'duplicate-blocked'
  | 'error'

export type ActiveSharedShiftSummary = Pick<
  Shift,
  'id' | 'title' | 'studio' | 'brand_id' | 'platform_id' | 'status'
>

export interface LiveTabPublisherContextValue {
  activeShift: ActiveSharedShiftSummary | null
  publisherUserId: string | null
  captureState: PersistentCaptureState
  publishStatus: PersistentPublishStatus
  publishError: string | null
  stream: MediaStream | null
  audioAvailable: boolean
  error: string | null
  setRequesting: (shift: ActiveSharedShiftSummary | null) => void
  setCaptureFailure: (state: PersistentCaptureState, message: string) => void
  attachAndPublishStream: (shift: Shift, stream: MediaStream) => Promise<void>
  stopCapture: (nextState?: PersistentCaptureState) => Promise<void>
  reportShiftStatus: (shiftId: string, status: Shift['status']) => void
}

const LiveTabPublisherContext = React.createContext<LiveTabPublisherContextValue | null>(null)

export function useOptionalLiveTabPublisher(): LiveTabPublisherContextValue | null {
  return React.useContext(LiveTabPublisherContext)
}

export function LiveTabPublisherProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useCurrentUser()
  const router = useRouter()

  const [activeShift, setActiveShift] = React.useState<ActiveSharedShiftSummary | null>(null)
  const [publisherUserId, setPublisherUserId] = React.useState<string | null>(null)
  const [captureState, setCaptureState] = React.useState<PersistentCaptureState>('idle')
  const [publishStatus, setPublishStatus] = React.useState<PersistentPublishStatus>('idle')
  const [publishError, setPublishError] = React.useState<string | null>(null)
  const [stream, setStream] = React.useState<MediaStream | null>(null)
  const [audioAvailable, setAudioAvailable] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const streamRef = React.useRef<MediaStream | null>(null)
  const publishVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const publishGrantRef = React.useRef<PublishSessionGrant | null>(null)
  const activeShiftRef = React.useRef<ActiveSharedShiftSummary | null>(null)
  const publisherUserIdRef = React.useRef<string | null>(null)
  const trackEndedCleanupRef = React.useRef<(() => void) | null>(null)
  const stopInFlightRef = React.useRef<Promise<void> | null>(null)

  const currentUserId = currentUser?.id ?? null
  const currentUserActive =
    Boolean(currentUser)
    && currentUser?.status === 'active'
    && (!currentUser?.account_status || currentUser.account_status === 'active')

  const stopCapture = React.useCallback(async (nextState: PersistentCaptureState = 'idle') => {
    if (stopInFlightRef.current) {
      await stopInFlightRef.current
      return
    }
    const runner = (async () => {
      trackEndedCleanupRef.current?.()
      trackEndedCleanupRef.current = null

      const currentStream = streamRef.current
      streamRef.current = null
      setStream(null)
      currentStream?.getTracks().forEach(track => {
        try {
          track.stop()
        } catch {
          // Ignore track stop failures on already-ended streams.
        }
      })

      const activeGrant = publishGrantRef.current
      publishGrantRef.current = null
      const actorForStop = publisherUserIdRef.current ?? currentUserId
      if (activeGrant) {
        await Promise.all([
          deleteGatewayStream(activeGrant),
          requestPublishSessionStop({
            shiftId: activeGrant.shiftId,
            sessionId: activeGrant.sessionId,
            actorId: actorForStop,
          }),
        ])
      }

      setAudioAvailable(false)
      setCaptureState(nextState)
      setPublishStatus('idle')
      setPublishError(null)
      if (nextState === 'idle') {
        activeShiftRef.current = null
        publisherUserIdRef.current = null
        setActiveShift(null)
        setPublisherUserId(null)
      }
    })()
    stopInFlightRef.current = runner
    try {
      await runner
    } finally {
      stopInFlightRef.current = null
    }
  }, [currentUserId])

  // Logout, identity change, or deactivation automatically revokes active tab sharing.
  React.useEffect(() => {
    const lockedUserId = publisherUserIdRef.current
    if (!lockedUserId) return
    if (!currentUserActive || currentUserId !== lockedUserId) {
      void stopCapture('idle')
    }
  }, [currentUserActive, currentUserId, stopCapture])

  // Clean up on full app shell unmount (window close / navigation out of dashboard shell).
  React.useEffect(() => {
    return () => {
      trackEndedCleanupRef.current?.()
      streamRef.current?.getTracks().forEach(track => track.stop())
      const grant = publishGrantRef.current
      if (grant) {
        void deleteGatewayStream(grant)
        void requestPublishSessionStop({
          shiftId: grant.shiftId,
          sessionId: grant.sessionId,
          actorId: publisherUserIdRef.current,
        })
      }
      publishGrantRef.current = null
      streamRef.current = null
    }
  }, [])

  // Background offscreen video -> frame publisher loop. Runs independently of /live route or active modal!
  React.useEffect(() => {
    if (captureState !== 'capturing' || !stream) return
    let cancelled = false
    let sending = false
    let seq = 0

    const video = publishVideoRef.current ?? document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    void video.play().catch(() => undefined)

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    const frameTimer = window.setInterval(async () => {
      if (cancelled || sending) return
      const grant = publishGrantRef.current
      if (!grant || !ctx || video.videoWidth <= 0 || video.videoHeight <= 0) return

      const maxWidth = 480
      const scale = Math.min(1, maxWidth / video.videoWidth)
      const width = Math.max(160, Math.round(video.videoWidth * scale))
      const height = Math.max(90, Math.round(video.videoHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.drawImage(video, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72)

      sending = true
      try {
        seq += 1
        const result = await pushGatewayVideoFrame({
          grant,
          seq,
          width,
          height,
          dataUrl,
        })
        if (!cancelled && !result.ok) {
          if (result.status === 409) {
            setPublishStatus('duplicate-blocked')
            setPublishError('Đã có tài khoản khác đang phát cho ca này.')
            await stopCapture('idle')
          } else if (result.status === 401 || result.status === 403) {
            setPublishStatus('error')
            setPublishError('Phiên phát không còn hiệu lực. Hãy thử chia sẻ lại.')
            await stopCapture('idle')
          }
        }
      } catch {
        // Transient network jitter does not kill local capture immediately.
      } finally {
        sending = false
      }
    }, 100)

    const renewTimer = window.setInterval(async () => {
      if (cancelled) return
      const currentGrant = publishGrantRef.current
      if (!currentGrant) return
      try {
        const refreshed = await requestPublishSessionHeartbeat({
          shiftId: currentGrant.shiftId,
          sessionId: currentGrant.sessionId,
          actorId: publisherUserIdRef.current,
        })
        if (!cancelled) {
          publishGrantRef.current = refreshed
        }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : 'MEDIA_PUBLISH_REVOKED'
          setPublishStatus('error')
          setPublishError(`Phiên phát đã dừng: ${message}`)
          await stopCapture('idle')
        }
      }
    }, 35_000)

    return () => {
      cancelled = true
      window.clearInterval(frameTimer)
      window.clearInterval(renewTimer)
      video.pause()
      video.srcObject = null
    }
  }, [captureState, stopCapture, stream])

  const setRequesting = React.useCallback((shift: ActiveSharedShiftSummary | null) => {
    setError(null)
    setPublishError(null)
    setCaptureState('requesting')
    if (shift) {
      activeShiftRef.current = shift
      setActiveShift(shift)
    }
  }, [])

  const setCaptureFailure = React.useCallback((state: PersistentCaptureState, message: string) => {
    setError(message)
    setCaptureState(state)
    if (!streamRef.current) {
      activeShiftRef.current = null
      publisherUserIdRef.current = null
      setActiveShift(null)
      setPublisherUserId(null)
    }
  }, [])

  const attachAndPublishStream = React.useCallback(async (shift: Shift, incomingStream: MediaStream) => {
    const videoTrack = incomingStream.getVideoTracks()[0]
    if (!videoTrack) {
      incomingStream.getTracks().forEach(track => track.stop())
      setCaptureFailure('unsupported', 'Không tìm thấy luồng hình ảnh từ tab được chọn.')
      return
    }

    if (streamRef.current && streamRef.current !== incomingStream) {
      await stopCapture('idle')
    }

    const summary: ActiveSharedShiftSummary = {
      id: shift.id,
      title: shift.title || shift.date,
      studio: shift.studio,
      brand_id: shift.brand_id,
      platform_id: shift.platform_id,
      status: shift.status,
    }

    streamRef.current = incomingStream
    activeShiftRef.current = summary
    publisherUserIdRef.current = currentUserId
    setActiveShift(summary)
    setPublisherUserId(currentUserId)
    setStream(incomingStream)
    setAudioAvailable(incomingStream.getAudioTracks().length > 0)
    setError(null)
    setCaptureState('capturing')

    const handleEnded = () => {
      setError('Chia sẻ tab đã dừng từ trình duyệt hoặc tab nguồn đã đóng.')
      void stopCapture('capture-ended')
    }
    videoTrack.addEventListener('ended', handleEnded, { once: true })
    trackEndedCleanupRef.current = () => videoTrack.removeEventListener('ended', handleEnded)

    setPublishStatus('starting')
    setPublishError(null)
    try {
      const grant = await requestPublishSessionStart({
        shiftId: shift.id,
        actorId: currentUserId,
      })
      if (streamRef.current !== incomingStream) {
        await deleteGatewayStream(grant)
        await requestPublishSessionStop({ shiftId: shift.id, sessionId: grant.sessionId, actorId: currentUserId })
        return
      }
      publishGrantRef.current = grant
      setPublishStatus('publishing')
    } catch (cause) {
      if (streamRef.current !== incomingStream) return
      const code = cause instanceof Error ? cause.message : 'MEDIA_PUBLISH_UNAVAILABLE'
      if (code === 'DUPLICATE_ACTIVE_PUBLISHER') {
        setPublishStatus('duplicate-blocked')
        setPublishError('Ca này đang có người khác chia sẻ tab trực tiếp. Không thể phát trùng đồng thời.')
        await stopCapture('idle')
      } else if (code === 'MEDIA_PERMISSION_DENIED') {
        setPublishStatus('error')
        setPublishError('Tài khoản hiện tại không có quyền phát luồng cho ca này.')
        await stopCapture('idle')
      } else {
        // Keep local preview available if gateway backend is unconfigured in standalone UI tests.
        setPublishStatus('local-only')
        setPublishError('Chế độ xem cục bộ (chưa bật máy chủ phát đa tài khoản).')
      }
    }
  }, [currentUserId, setCaptureFailure, stopCapture])

  const reportShiftStatus = React.useCallback((shiftId: string, status: Shift['status']) => {
    if (
      activeShiftRef.current?.id === shiftId
      && (status === 'completed' || status === 'cancelled')
    ) {
      setError('Ca livestream đã kết thúc hoặc bị huỷ, hệ thống tự động dừng chia sẻ.')
      void stopCapture('idle')
    }
  }, [stopCapture])

  const returnToSharedShift = () => {
    if (!activeShift) return
    window.dispatchEvent(new CustomEvent('ada:select-live-shift', { detail: { shiftId: activeShift.id } }))
    router.push(`/live?shift=${encodeURIComponent(activeShift.id)}`)
  }

  const value: LiveTabPublisherContextValue = {
    activeShift,
    publisherUserId,
    captureState,
    publishStatus,
    publishError,
    stream,
    audioAvailable,
    error,
    setRequesting,
    setCaptureFailure,
    attachAndPublishStream,
    stopCapture,
    reportShiftStatus,
  }

  return (
    <LiveTabPublisherContext.Provider value={value}>
      <video
        ref={publishVideoRef}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        className="pointer-events-none fixed -left-px -top-px h-px w-px opacity-0"
      />
      {activeShift && (captureState === 'capturing' || captureState === 'capture-ended') && (
        <div
          role="status"
          aria-live="polite"
          data-testid="persistent-live-sharing-banner"
          className={`flex w-full min-w-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs ${
            captureState === 'capturing'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {captureState === 'capturing' ? (
              <Radio className="h-3.5 w-3.5 shrink-0 animate-pulse text-emerald-600" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            )}
            <span className="truncate font-semibold">
              {captureState === 'capturing' ? 'Đang chia sẻ tab LIVE:' : 'Chia sẻ tab đã kết thúc:'}{' '}
              {activeShift.title}
            </span>
            {activeShift.studio && (
              <span className="rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                {activeShift.studio}
              </span>
            )}
            {captureState === 'capturing' && publishStatus === 'publishing' && (
              <span
                data-testid="persistent-live-publish-badge"
                className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white"
              >
                Đang phát đa tài khoản
              </span>
            )}
            {captureState === 'capturing' && publishStatus === 'local-only' && (
              <span className="rounded-full bg-slate-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                Xem cục bộ
              </span>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={returnToSharedShift}
              data-testid="return-to-shared-shift"
              className="h-7 bg-white px-2.5 text-xs"
            >
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
              Quay lại ca đang phát
            </Button>
            {captureState === 'capturing' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void stopCapture('idle')}
                data-testid="global-stop-tab-capture"
                className="h-7 border-red-200 bg-white px-2.5 text-xs text-red-700 hover:bg-red-50"
              >
                <ScreenShareOff className="mr-1 h-3.5 w-3.5" />
                Dừng chia sẻ
              </Button>
            )}
          </div>
        </div>
      )}
      {children}
    </LiveTabPublisherContext.Provider>
  )
}
