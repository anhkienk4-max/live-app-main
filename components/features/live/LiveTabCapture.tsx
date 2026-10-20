'use client'

import * as React from 'react'
import { MonitorPlay, Volume2, VolumeX, ScreenShare, ScreenShareOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * User-approved, local-only browser-tab capture for the currently selected
 * live shift. No iframe, media proxy, recording, uploads or shared sessions.
 * The operator selects the TikTok/Shopee tab in the browser's own picker.
 */
export function LiveTabCapture() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const mountedRef = React.useRef(true)
  const [starting, setStarting] = React.useState(false)
  const [active, setActive] = React.useState(false)
  const [playAudio, setPlayAudio] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const stopCapture = React.useCallback(() => {
    const stream = streamRef.current
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    stream?.getTracks().forEach(track => track.stop())
    if (mountedRef.current) {
      setActive(false)
      setPlayAudio(false)
    }
  }, [])

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Changing shift, navigating away or signing out ends local capture.
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!active || !videoRef.current || !streamRef.current) return
    const element = videoRef.current
    element.srcObject = streamRef.current
    void element.play().catch(() => {
      if (mountedRef.current) setError('Không thể phát bản xem trước. Kiểm tra tab nguồn và thử lại.')
    })
    return () => { element.srcObject = null }
  }, [active])

  const startCapture = async () => {
    if (starting || active) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setError('Trình duyệt này không hỗ trợ chia sẻ tab. Hãy dùng Microsoft Edge hoặc Chrome trên máy tính.')
      return
    }
    setStarting(true)
    setError(null)
    try {
      // Must be called directly from a user's click; permission is never persisted.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        stream.getTracks().forEach(track => track.stop())
        throw new Error('NO_VIDEO_TRACK')
      }
      streamRef.current = stream
      videoTrack.addEventListener('ended', stopCapture, { once: true })
      setActive(true)
    } catch (cause) {
      if (!mountedRef.current) return
      const name = cause instanceof Error ? cause.name : ''
      setError(name === 'NotAllowedError' || name === 'AbortError'
        ? 'Bạn đã hủy hoặc từ chối chia sẻ. Hãy bấm lại và chọn đúng tab LIVE.'
        : 'Không thể lấy hình ảnh tab. Kiểm tra quyền chia sẻ và trạng thái phát của tab LIVE.')
    } finally {
      if (mountedRef.current) setStarting(false)
    }
  }

  return <section className="mt-3 rounded-lg border bg-white p-3" data-testid="live-tab-capture">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold">Xem hình ảnh LIVE ngay trong Monitor</h4>
        <p className="mt-1 max-w-2xl text-xs text-slate-600">
          Mở phiên phát ở tab TikTok/Shopee riêng. Sau đó bấm chia sẻ, chọn đúng tab LIVE trong hộp thoại Edge.
          Không chọn tab ADA Monitor để tránh hiệu ứng lặp màn hình.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!active ? <Button type="button" size="sm" onClick={() => void startCapture()}
          disabled={starting} data-testid="start-live-tab-capture">
          <ScreenShare className="mr-2 h-4 w-4" />{starting ? 'Đang chờ chọn tab…' : 'Chia sẻ tab LIVE vào Monitor'}
        </Button> : <>
          {Boolean(streamRef.current?.getAudioTracks().length) && <Button type="button" size="sm" variant="outline"
            onClick={() => setPlayAudio(value => !value)} data-testid="toggle-live-tab-audio">
            {playAudio ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
            {playAudio ? 'Tắt tiếng bản xem' : 'Bật tiếng bản xem'}
          </Button>}
          <Button type="button" size="sm" variant="outline" onClick={stopCapture}
            data-testid="stop-live-tab-capture"><ScreenShareOff className="mr-2 h-4 w-4" />Dừng chia sẻ</Button>
        </>}
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    {active && <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-emerald-700"><MonitorPlay className="h-4 w-4" />Đang hiển thị tab đã chọn trên thiết bị này</div>
      <video ref={videoRef} autoPlay playsInline muted={!playAudio} controls
        className="max-h-[560px] w-full rounded-lg bg-black object-contain"
        data-testid="local-live-tab-player" aria-label="Hình ảnh tab livestream do người dùng chia sẻ" />
      <p className="text-xs text-slate-500">
        Đây là hình ảnh tab cục bộ, không phải nguồn video lấy từ API TikTok/Shopee.
        Không ghi hình hoặc gửi hình ảnh lên máy chủ ADA. Dừng chia sẻ khi không cần theo dõi.
      </p>
    </div>}
  </section>
}
