import type { ReactNode } from 'react'
import { AdaBrand } from '@/components/branding/AdaBrand'
import { ContentSkeleton } from '@/components/ui/content-skeleton'

/** Lightweight branded fallback for App Router loading boundaries. */
export function AdaLoadingScreen({
  embedded = false,
  overlay = false,
}: {
  embedded?: boolean
  overlay?: boolean
}): ReactNode {
  return (
    <div
      className={[
        'ada-loading-screen',
        embedded && 'ada-loading-screen--embedded',
        overlay && 'ada-loading-screen--overlay',
      ].filter(Boolean).join(' ')}
      aria-busy="true"
      data-testid="ada-loading-screen"
    >
      <div className="ada-loading-screen__glow" aria-hidden="true" />
      <div className="ada-loading-screen__content" role="status" aria-live="polite">
        <span className="ada-loading-screen__halo" aria-hidden="true" />
        <span className="ada-loading-screen__logo">
          <AdaBrand />
        </span>
        <span className="ada-loading-screen__caption">ĐANG TẢI · LOADING</span>
        <span className="ada-loading-screen__progress" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="sr-only">Đang tải ADA OPS Livestream</span>
      </div>
      {embedded && <ContentSkeleton />}
    </div>
  )
}
