'use client'

import { useEffect, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Native install prompts are browser-controlled. In particular, iOS Safari
 * must use Share > Add to Home Screen instead of a scripted install.
 */
export function PwaInstallControl({ compact = false }: { compact?: boolean }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [isAppleMobile, setIsAppleMobile] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)')
    const sync = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
    sync()
    setIsAppleMobile(/iPhone|iPad|iPod/.test(navigator.userAgent))
    const capture = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallEvent)
    }
    const installedHandler = () => {
      setInstalled(true)
      setShowHelp(false)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', installedHandler)
    standalone.addEventListener?.('change', sync)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', installedHandler)
      standalone.removeEventListener?.('change', sync)
    }
  }, [])

  const install = async () => {
    if (!installEvent) {
      setShowHelp(value => !value)
      return
    }
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === 'accepted') setShowHelp(false)
      else setShowHelp(true)
    } catch {
      setShowHelp(true)
    } finally {
      setInstallEvent(null)
    }
  }

  return (
    <div data-testid="pwa-install-control" className={compact ? 'w-full text-center' : 'w-full'}>
      <button
        type="button"
        data-testid="pwa-install-button"
        onClick={install}
        disabled={installed}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-default disabled:opacity-65"
      >
        {installed ? <Smartphone aria-hidden="true" className="size-4" /> : <Download aria-hidden="true" className="size-4" />}
        {installed ? 'ADA OPS đã được cài trên máy' : 'Cài ADA OPS / Tạo lối tắt'}
      </button>
      {showHelp && !installed && (
        <div role="status" data-testid="pwa-install-help" className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-700">
          {isAppleMobile ? (
            <p>iPhone/iPad: mở trang này bằng <strong>Safari</strong>, nhấn <strong>Chia sẻ</strong> rồi chọn <strong>Thêm vào Màn hình chính</strong> và <strong>Thêm</strong>.</p>
          ) : (
            <p>Android: mở <strong>Chrome</strong> hoặc trình duyệt hỗ trợ, nhấn menu <strong>⋮</strong>, chọn <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>. Nếu chưa có mục cài đặt, thử tải lại trang.</p>
          )}
          <p className="mt-1 text-slate-500">Việc cài đặt do trình duyệt và hệ điều hành quyết định. Lối tắt vẫn cần đăng nhập ADA OPS như bình thường.</p>
        </div>
      )}
    </div>
  )
}
