import type { ReactNode } from 'react'

type BrandProps = {
  inverse?: boolean
  compact?: boolean
  className?: string
}

/**
 * ADA OPS visual lockup for the PWA shell.
 * Brand artwork follows the approved reference board's visual direction.
 * The official ADA Global vector logo must replace this rendition when supplied.
 */
export function AdaBrand({ inverse = false, compact = false, className = '' }: BrandProps): ReactNode {
  return (
    <span
      data-testid="ada-brand-lockup"
      className={['ada-brand', inverse && 'ada-brand--inverse', compact && 'ada-brand--compact', className].filter(Boolean).join(' ')}
      aria-label="ADA OPS Livestream"
    >
      <span className="ada-brand__symbol" aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false" aria-hidden="true" className="ada-brand__symbol-svg">
          <path d="M4 37.2 18.4 7.8a6.2 6.2 0 0 1 11.2 0L44 37.2a5.5 5.5 0 0 1-9.8 5L24 21.6 13.8 42.2a5.5 5.5 0 0 1-9.8-5Z" fill="#fff" />
          <path d="M14 38h20" stroke="#B5F4FF" strokeWidth="4.5" strokeLinecap="round" opacity=".8" />
        </svg>
      </span>
      <span className="ada-brand__type">
        <span className="ada-brand__name">ada<span className="ada-brand__ops">OPS</span></span>
        <span className="ada-brand__descriptor">LIVESTREAM</span>
      </span>
    </span>
  )
}
