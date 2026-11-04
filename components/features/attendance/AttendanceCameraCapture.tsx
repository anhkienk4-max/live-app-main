'use client'

import * as React from 'react'
import {
  Camera,
  RefreshCw,
  SwitchCamera,
  Check,
  X,
  AlertTriangle,
  FileImage,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'
import type { AttendanceRole, AttendanceEventKind } from '@/lib/utils/selfAttendanceContract'

export interface AttendanceCameraCaptureProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCapture: (file: File, source: 'camera') => void
  shiftContext: {
    title?: string | null
    date: string
    start_time: string
    end_time: string
    brand: string
    platform: string
    studio?: string | null
  }
  role: AttendanceRole
  eventKind: AttendanceEventKind
  onFallbackToPicker?: () => void
}

type CameraMode = 'idle' | 'streaming' | 'captured' | 'error'

export function AttendanceCameraCapture({
  open,
  onOpenChange,
  onCapture,
  shiftContext,
  role,
  eventKind,
  onFallbackToPicker,
}: AttendanceCameraCaptureProps) {
  const { language } = useTranslation()
  const en = language === 'en'

  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const blobUrlRef = React.useRef<string | null>(null)

  const [mode, setMode] = React.useState<CameraMode>('idle')
  const [facingMode, setFacingMode] = React.useState<'environment' | 'user'>('environment')
  const [capturedBlobUrl, setCapturedBlobUrl] = React.useState<string | null>(null)
  const [capturedFile, setCapturedFile] = React.useState<File | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [switching, setSwitching] = React.useState(false)

  // Adjust state during render when open changes
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setMode('idle')
      setCapturedFile(null)
      setCapturedBlobUrl(null)
      setErrorMessage(null)
      setSwitching(false)
    }
  }

  const roleNames: Record<AttendanceRole, string> = {
    host: 'Host',
    support: en ? 'Support' : 'Trợ live',
    technical: en ? 'Technical' : 'Kỹ thuật',
  }

  const eventTitle =
    eventKind === 'check_in'
      ? en
        ? 'Check-in Attendance Camera'
        : 'Chụp ảnh Check-in'
      : en
      ? 'Check-out Attendance Camera'
      : 'Chụp ảnh Check-out'

  // Safely stop all active tracks and reset video srcObject
  const stopStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // ignore track stop error
        }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Start media stream from getUserMedia asynchronously
  const startCamera = React.useCallback(
    async (facing: 'environment' | 'user') => {
      stopStream()

      if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        setErrorMessage(
          en
            ? 'In-app camera is not supported on this browser or connection (HTTPS required).'
            : 'Trình duyệt hoặc kết nối hiện tại không hỗ trợ camera trực tiếp (yêu cầu HTTPS).'
        )
        setMode('error')
        return
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            await videoRef.current.play()
          } catch {
            // auto-play might throw if dialog wasn't focused yet, ignored
          }
        }

        setMode('streaming')
        setErrorMessage(null)
        setSwitching(false)
      } catch (err) {
        const error = err as Error
        const name = error.name || ''

        let message = en ? 'Camera connection failed.' : 'Không thể kết nối camera.'
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          message = en
            ? 'Camera permission denied. Please allow camera access in browser settings, or use the fallback camera button below.'
            : 'Quyền truy cập camera bị từ chối. Vui lòng cho phép quyền trong cài đặt trình duyệt hoặc bấm nút camera hệ thống bên dưới.'
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          message = en
            ? 'No camera found on this device. Please select an existing photo.'
            : 'Không tìm thấy camera trên thiết bị này. Vui lòng chọn ảnh từ bộ nhớ.'
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          message = en
            ? 'Camera is currently in use by another application or tab.'
            : 'Camera đang bị ứng dụng hoặc thẻ khác sử dụng.'
        } else if (name === 'OverconstrainedError') {
          message = en
            ? 'The requested camera resolution or facing mode is not supported.'
            : 'Thiết bị không hỗ trợ độ phân giải hoặc chế độ camera này.'
        }

        setErrorMessage(message)
        setMode('error')
        setSwitching(false)
      }
    },
    [en, stopStream]
  )

  // Initialize camera when opened
  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    if (open) {
      timer = setTimeout(() => {
        void startCamera(facingMode)
      }, 0)
    } else {
      stopStream()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }

    return () => {
      if (timer) clearTimeout(timer)
      stopStream()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [open, facingMode, startCamera, stopStream])

  // Stop camera when tab visibility changes or user navigates
  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && streamRef.current) {
        stopStream()
      } else if (!document.hidden && open && mode === 'streaming' && !streamRef.current) {
        void startCamera(facingMode)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [open, mode, facingMode, startCamera, stopStream])

  // Snapshot from video to canvas
  const captureSnapshot = React.useCallback(() => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return

    let width = video.videoWidth
    let height = video.videoHeight

    // Limit maximum dimensions to 1920x1080 to prevent memory blowouts while preserving quality
    const maxDim = 1920
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width)
        width = maxDim
      } else {
        width = Math.round((width * maxDim) / height)
        height = maxDim
      }
    }

    const canvas = canvasRef.current || document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw frame
    ctx.drawImage(video, 0, 0, width, height)

    // Convert frame to JPEG blob
    canvas.toBlob(
      (blob) => {
        if (!blob) return

        const fileName = `${eventKind}_${role}_${Date.now()}.jpg`
        const file = new File([blob], fileName, { type: 'image/jpeg' })

        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
        }
        const objectUrl = URL.createObjectURL(blob)
        blobUrlRef.current = objectUrl

        setCapturedBlobUrl(objectUrl)
        setCapturedFile(file)
        setMode('captured')

        // Stop stream while reviewing to save battery and turn off camera hardware light
        stopStream()
      },
      'image/jpeg',
      0.85
    )
  }, [eventKind, role, stopStream])

  // Retake photo
  const handleRetake = React.useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setCapturedBlobUrl(null)
    setCapturedFile(null)
    setSwitching(true)
    void startCamera(facingMode)
  }, [startCamera, facingMode])

  // Confirm photo and pass back
  const handleConfirm = React.useCallback(() => {
    if (!capturedFile) return
    onCapture(capturedFile, 'camera')
    stopStream()
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setCapturedBlobUrl(null)
    setCapturedFile(null)
    onOpenChange(false)
  }, [capturedFile, onCapture, stopStream, onOpenChange])

  // Switch between front and back camera
  const handleToggleFacing = React.useCallback(() => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextFacing)
    setSwitching(true)
    void startCamera(nextFacing)
  }, [facingMode, startCamera])

  // Fallback to native OS capture
  const handleFallback = React.useCallback(() => {
    stopStream()
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setCapturedBlobUrl(null)
    setCapturedFile(null)
    onOpenChange(false)
    if (onFallbackToPicker) {
      onFallbackToPicker()
    }
  }, [stopStream, onOpenChange, onFallbackToPicker])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="attendance-camera-capture"
        className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-lg p-0 overflow-hidden flex flex-col gap-0 border-slate-800 bg-slate-950 text-slate-100 shadow-2xl"
      >
        {/* Header */}
        <DialogHeader className="border-b border-slate-800 px-4 py-3 bg-slate-900/90 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <DialogTitle className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Camera className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="truncate">{eventTitle}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 truncate">
                {shiftContext.brand} · {shiftContext.platform} · {roleNames[role]}
              </DialogDescription>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] uppercase font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            >
              {eventKind === 'check_in' ? 'Check-in' : 'Check-out'}
            </Badge>
          </div>
        </DialogHeader>

        {/* Viewfinder / Preview viewport */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[380px] bg-black flex items-center justify-center overflow-hidden">
          {/* Live Video stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${mode === 'streaming' ? 'block' : 'hidden'}`}
            data-testid="camera-video-preview"
          />

          {/* Offscreen Canvas for snapshot */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Viewfinder Target Overlays (Only while streaming) */}
          {mode === 'streaming' && (
            <div
              className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6"
              aria-hidden="true"
            >
              <div className="flex justify-between items-start">
                <div className="h-6 w-6 border-t-2 border-l-2 border-emerald-400/80 rounded-tl-sm" />
                <div className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur-xs border border-emerald-500/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Viewfinder
                </div>
                <div className="h-6 w-6 border-t-2 border-r-2 border-emerald-400/80 rounded-tr-sm" />
              </div>
              <div className="flex justify-between items-end">
                <div className="h-6 w-6 border-b-2 border-l-2 border-emerald-400/80 rounded-bl-sm" />
                <p className="text-[11px] text-slate-300/80 bg-slate-900/60 px-3 py-1 rounded-md backdrop-blur-xs text-center max-w-[80%]">
                  {en
                    ? 'Center your face and live studio context'
                    : 'Căn chỉnh gương mặt và không gian phòng live'}
                </p>
                <div className="h-6 w-6 border-b-2 border-r-2 border-emerald-400/80 rounded-br-sm" />
              </div>
            </div>
          )}

          {/* Captured Snapshot Preview */}
          {mode === 'captured' && capturedBlobUrl && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedBlobUrl}
                alt={en ? 'Captured attendance photo preview' : 'Xem lại ảnh điểm danh vừa chụp'}
                className="max-h-[50vh] sm:max-h-[60vh] max-w-full object-contain"
                data-testid="camera-captured-preview"
              />
              <div className="absolute top-3 right-3 rounded-md bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-200 border border-slate-700 backdrop-blur-xs">
                {capturedFile ? `${Math.ceil(capturedFile.size / 1024)} KB` : ''} · JPEG
              </div>
            </div>
          )}

          {/* Error / Fallback State */}
          {mode === 'error' && (
            <div
              role="alert"
              data-testid="camera-error-message"
              className="p-6 text-center max-w-md space-y-4"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-rose-300">
                  {en ? 'Camera Access Notice' : 'Thông báo truy cập camera'}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">{errorMessage}</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="camera-retry-button"
                  onClick={() => {
                    setSwitching(true)
                    void startCamera(facingMode)
                  }}
                  className="w-full sm:w-auto text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {en ? 'Retry Camera' : 'Thử lại camera'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  data-testid="camera-fallback-button"
                  onClick={handleFallback}
                  className="w-full sm:w-auto text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <FileImage className="mr-1.5 h-3.5 w-3.5" />
                  {en ? 'Use OS Camera / File' : 'Dùng camera hệ thống / File'}
                </Button>
              </div>
            </div>
          )}

          {/* Loading / Switching Spinner */}
          {switching && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-xs">
              <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                {en ? 'Connecting camera…' : 'Đang mở camera…'}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="border-t border-slate-800 bg-slate-900/90 p-3 sm:p-4">
          {mode === 'streaming' ? (
            <div className="flex items-center justify-between gap-3 max-w-sm mx-auto">
              {/* Flip camera facing mode */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="camera-switch-facing"
                disabled={switching}
                onClick={handleToggleFacing}
                className="h-10 w-10 p-0 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full"
                title={en ? 'Switch front / rear camera' : 'Đổi camera trước / sau'}
                aria-label={en ? 'Switch camera facing mode' : 'Đổi chiều camera'}
              >
                <SwitchCamera className="h-5 w-5" />
              </Button>

              {/* Central Capture Button */}
              <button
                type="button"
                data-testid="camera-capture-trigger"
                disabled={switching}
                onClick={captureSnapshot}
                className="h-14 w-14 rounded-full border-4 border-slate-700 bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition-all flex items-center justify-center shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                aria-label={en ? 'Take photo' : 'Bấm chụp ảnh'}
              >
                <div className="h-10 w-10 rounded-full border-2 border-slate-900 bg-white" />
              </button>

              {/* Cancel Button */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="camera-cancel-trigger"
                onClick={() => onOpenChange(false)}
                className="h-10 w-10 p-0 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-full"
                title={en ? 'Cancel' : 'Hủy'}
                aria-label={en ? 'Cancel camera' : 'Đóng camera'}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : mode === 'captured' ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="camera-retake-trigger"
                onClick={handleRetake}
                className="flex-1 text-xs border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {en ? 'Retake Photo' : 'Chụp lại'}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="camera-confirm-trigger"
                onClick={handleConfirm}
                className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {en ? 'Use This Photo' : 'Xác nhận ảnh'}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs border-slate-700 bg-slate-800 text-slate-300"
              >
                {en ? 'Close' : 'Đóng'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
