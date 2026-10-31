import type { ReactNode } from 'react'
import { AdaBrand } from '@/components/branding/AdaBrand'

/** Full-screen transition indicator: one centered ADA logo, with no page preview behind it. */
export function AdaLoadingScreen({ overlay = false }: { overlay?: boolean }): ReactNode {
  return (
    <div
      className={[
        'ada-loading-screen',
        overlay && 'ada-loading-screen--overlay',
      ].filter(Boolean).join(' ')}
      aria-busy="true"
      data-testid="ada-loading-screen"
    >
      <div className="ada-loading-screen__logo" role="status" aria-live="polite">
        <AdaBrand />
        <span className="sr-only">Đang tải ADA OPS Livestream</span>
      </div>
    </div>
  )
}
