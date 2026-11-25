'use client'

import * as React from 'react'
import { Eye, Lock, Radio } from 'lucide-react'
import type { Shift } from '@/lib/types/database.types'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import {
  fetchAuthorizedGatewayFrame,
  fetchPublishSessionStatus,
  requestViewerSessionGrant,
  type ViewerSessionGrant,
} from '@/lib/media/liveTabGatewayClient'
import {
  subscribeWhepSession,
  isWebRtcSupported,
  type WhepSubscriberHandle,
} from '@/lib/media/webrtcClient'

/**
 * Authorized multi-account live tab stream viewer.
 * Short-lived ES256 read tokens live in a volatile useRef only (never stored
 * in localStorage, sessionStorage, cookies, or query parameters).
 */
export function LiveSharedStreamViewer({
  shift,
  isLocalPublisher,
}: {
  shift: Pick<Shift, 'id' | 'status'>
  isLocalPublisher: boolean
}) {
  const { currentUser } = useCurrentUser()
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const outputStreamRef = React.useRef<MediaStream | null>(null)
  const grantRef = React.useRef<ViewerSessionGrant | null>(null)
  const whepHandleRef = React.useRef<WhepSubscriberHandle | null>(null)
  const hadActiveSessionRef = React.useRef(false)
  const deniedRef = React.useRef(false)

  const [status, setStatus] = React.useState<'idle' | 'active' | 'denied' | 'ended'>('idle')
  const [deniedMessage, setDeniedMessage] = React.useState<string>('')
  const [publisherLabel, setPublisherLabel] = React.useState<string>('')

  const actorId = currentUser?.id ?? null
  const isEditableWindow = ['scheduled', 'preparing', 'live', 'paused'].includes(shift.status)

  React.useEffect(() => {
    const video = videoRef.current
    if (status === 'active' && video && outputStreamRef.current && video.srcObject !== outputStreamRef.current) {
      video.srcObject = outputStreamRef.current
      void video.play().catch(() => undefined)
    }
  }, [status])

  React.useEffect(() => {
    const videoEl = videoRef.current
    deniedRef.current = false
    if (!actorId || isLocalPublisher || !isEditableWindow) {
      grantRef.current = null
      outputStreamRef.current?.getTracks().forEach(track => track.stop())
      outputStreamRef.current = null
      if (videoEl) videoEl.srcObject = null
      setStatus(!isEditableWindow && !isLocalPublisher && hadActiveSessionRef.current ? 'ended' : 'idle')
      return
    }

    let cancelled = false
    let pollingGrant = false
    let pollingFrame = false
    let lastStatusProbeMs = 0
    let consecutiveUnauthorized = 0
    const controller = new AbortController()
    const offscreenCanvas = canvasRef.current ?? document.createElement('canvas')
    canvasRef.current = offscreenCanvas

    const clearPlayback = (nextStatus: 'idle' | 'denied' | 'ended', message = '') => {
      grantRef.current = null
      if (whepHandleRef.current) {
        void whepHandleRef.current.stop().catch(() => undefined)
        whepHandleRef.current = null
      }
      outputStreamRef.current?.getTracks().forEach(track => track.stop())
      outputStreamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setStatus(nextStatus)
      setDeniedMessage(message)
      if (nextStatus === 'denied') deniedRef.current = true
    }

    const ensureGrant = async (forceStatusCheck = false): Promise<ViewerSessionGrant | null> => {
      if (deniedRef.current) return null
      const existing = grantRef.current
      if (existing && !forceStatusCheck) {
        const exp = Date.parse(existing.expiresAt)
        if (Number.isFinite(exp) && exp - Date.now() > 15_000) {
          return existing
        }
      }
      if (pollingGrant) return grantRef.current

      if (!existing && !forceStatusCheck) {
        const now = Date.now()
        if (now - lastStatusProbeMs < 850) return null
        lastStatusProbeMs = now
        const probe = await fetchPublishSessionStatus({
          shiftId: shift.id,
          actorId,
          signal: controller.signal,
        }).catch(() => ({ active: false, denied: false }))
        if (cancelled) return null
        if (probe.denied) {
          clearPlayback('denied', 'Tài khoản của bạn chưa được cấp quyền xem luồng LIVE của ca này.')
          return null
        }
        if (!probe.active) {
          clearPlayback(hadActiveSessionRef.current ? 'ended' : 'idle')
          return null
        }
      }

      pollingGrant = true
      try {
        const result = await requestViewerSessionGrant({
          shiftId: shift.id,
          actorId,
          signal: controller.signal,
        })
        if (cancelled) return null
        if (!result.active || !result.grant) {
          if (result.deniedCode === 'MEDIA_PERMISSION_DENIED' || result.deniedCode === 'AUTHENTICATION_REQUIRED') {
            clearPlayback('denied', 'Tài khoản của bạn chưa được cấp quyền xem luồng LIVE của ca này.')
          } else {
            clearPlayback(hadActiveSessionRef.current ? 'ended' : 'idle')
          }
          return null
        }
        grantRef.current = result.grant
        hadActiveSessionRef.current = true
        setPublisherLabel(result.grant.publisherBusinessUserId ?? '')

        // Initiate real WebRTC WHEP connection if gateway and browser support it
        if (result.grant.whepUrl && isWebRtcSupported() && !whepHandleRef.current && process.env.NEXT_PUBLIC_USE_FRAME_FALLBACK !== 'true') {
          try {
            const handle = await subscribeWhepSession({
              whepUrl: result.grant.whepUrl,
              token: result.grant.token,
              signal: controller.signal,
              onTrack: (_track, stream) => {
                if (videoRef.current) {
                  videoRef.current.srcObject = stream
                  void videoRef.current.play().catch(() => undefined)
                }
                setStatus('active')
              },
              onConnectionStateChange: state => {
                if (state === 'failed') {
                  whepHandleRef.current = null
                }
              },
            })
            if (!cancelled && grantRef.current) {
              whepHandleRef.current = handle
            } else {
              void handle.stop()
            }
          } catch (whepError) {
            console.warn('[ADA Live] WebRTC WHEP subscription fallback to frames:', whepError)
          }
        }

        return result.grant
      } catch {
        return null
      } finally {
        pollingGrant = false
      }
    }

    const drawFrame = async (dataUrl: string, width: number, height: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'))
        img.src = dataUrl
      })
      if (cancelled || deniedRef.current || !grantRef.current) return

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      ctx.drawImage(img, 0, 0, width, height)

      if (!outputStreamRef.current && typeof canvas.captureStream === 'function') {
        outputStreamRef.current = canvas.captureStream(15)
      }
      const video = videoRef.current
      if (video && outputStreamRef.current && video.srcObject !== outputStreamRef.current) {
        video.srcObject = outputStreamRef.current
        void video.play().catch(() => undefined)
      }
      setStatus('active')
    }

    const tick = async () => {
      if (cancelled || pollingFrame || deniedRef.current) return
      // When WebRTC WHEP connection is active, media frames stream natively over RTP
      if (whepHandleRef.current && whepHandleRef.current.connectionState === 'connected') {
        return
      }
      pollingFrame = true
      try {
        const grant = await ensureGrant()
        if (cancelled || !grant) return
        const frame = await fetchAuthorizedGatewayFrame({
          grant,
          signal: controller.signal,
        })
        if (cancelled || deniedRef.current || !grantRef.current) return
        if (frame.kind === 'frame') {
          consecutiveUnauthorized = 0
          await drawFrame(frame.dataUrl, frame.width, frame.height)
          return
        }
        if (frame.kind === 'unauthorized') {
          consecutiveUnauthorized += 1
          grantRef.current = null
          if (consecutiveUnauthorized >= 2) {
            clearPlayback('denied', 'Quyền xem luồng LIVE đã bị thu hồi hoặc hết hạn.')
            return
          }
          const refreshed = await ensureGrant(true)
          if (!refreshed && !deniedRef.current) {
            clearPlayback('denied', 'Quyền xem luồng LIVE đã bị thu hồi hoặc hết hạn.')
          }
          return
        }
        consecutiveUnauthorized = 0
        clearPlayback('ended')
      } catch {
        // Ignore transient decode/network errors on cancelled frames.
      } finally {
        pollingFrame = false
      }
    }

    void tick()
    const frameInterval = window.setInterval(() => void tick(), 220)
    const sessionInterval = window.setInterval(() => {
      if (!deniedRef.current && grantRef.current) {
        void ensureGrant(true)
      }
    }, 1_500)

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(frameInterval)
      window.clearInterval(sessionInterval)
      if (whepHandleRef.current) {
        void whepHandleRef.current.stop().catch(() => undefined)
        whepHandleRef.current = null
      }
      grantRef.current = null
      outputStreamRef.current?.getTracks().forEach(track => track.stop())
      outputStreamRef.current = null
      if (videoEl) videoEl.srcObject = null
    }
  }, [actorId, isEditableWindow, isLocalPublisher, shift.id])

  if (isLocalPublisher) return null
  if (status === 'idle') return null

  return (
    <section
      className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3"
      data-testid="live-shared-stream-viewer"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
          {status === 'active' ? (
            <Radio className="h-4 w-4 animate-pulse text-emerald-600" />
          ) : (
            <Lock className="h-4 w-4 text-slate-500" />
          )}
          <span>Luồng tab LIVE được chia sẻ trong ca</span>
        </div>
        {status === 'active' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
            <Eye className="h-3 w-3" /> Đang đồng bộ hình ảnh từ thiết bị phát
            {publisherLabel ? ` (#${publisherLabel})` : ''}
          </span>
        )}
      </div>

      {status === 'denied' && (
        <p role="alert" className="mt-2 text-xs text-red-700" data-testid="live-shared-stream-denied">
          {deniedMessage}
        </p>
      )}

      {status === 'ended' && (
        <p role="status" className="mt-2 text-xs text-slate-600" data-testid="live-shared-stream-ended">
          Phiên chia sẻ tab đã kết thúc hoặc ca không còn phát.
        </p>
      )}

      <div className={status === 'active' ? 'mt-3' : 'hidden'}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls
          className="max-h-[480px] w-full rounded-lg bg-black object-contain"
          data-testid="live-shared-stream-video"
          aria-label="Hình ảnh tab livestream được chia sẻ qua phiên được cấp quyền"
        />
      </div>
    </section>
  )
}
