import type { ReactNode } from 'react'
import { AdaBrand } from '@/components/branding/AdaBrand'

/**
 * Single global transition & splash screen:
 * Displays the approved neomorphic embossed disc, orbital rings, glowing cyan spheres,
 * and the centered ADA OPS Livestream brand lockup.
 */
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
      {/* Corner Luminous Waves */}
      <div className="ada-splash-wave-tl-1" aria-hidden="true" />
      <div className="ada-splash-wave-tl-2" aria-hidden="true" />
      <div className="ada-splash-wave-br-1" aria-hidden="true" />
      <div className="ada-splash-wave-br-2" aria-hidden="true" />

      {/* Orbital System Container */}
      <div className="ada-splash-orbit-system" aria-hidden="true">
        <div className="ada-splash-orbit-ring-outer" />
        <div className="ada-splash-orbit-ring-inner" />
        <div className="ada-splash-glow-arc-1" />
        <div className="ada-splash-glow-arc-2" />

        {/* 3D Glowing Cyan Spheres on Orbit */}
        <div className="ada-splash-sphere ada-splash-sphere--tr" />
        <div className="ada-splash-sphere ada-splash-sphere--bl" />
        <div className="ada-splash-sphere ada-splash-sphere--tl" />
        <div className="ada-splash-sphere ada-splash-sphere--br" />
        <div className="ada-splash-sphere ada-splash-sphere--top" />
        <div className="ada-splash-sphere ada-splash-sphere--r" />
        <div className="ada-splash-sphere ada-splash-sphere--b" />

        {/* Soft Neomorphic Center Embossed Circle */}
        <div className="ada-splash-center-disc">
          <div className="ada-splash-inner-recessed" />
        </div>
      </div>

      {/* Official Centered ADA Brand Lockup */}
      <div className="ada-loading-screen__logo" role="status" aria-live="polite">
        <AdaBrand />
        <span className="sr-only">Đang tải ADA OPS Livestream</span>
      </div>
    </div>
  )
}
