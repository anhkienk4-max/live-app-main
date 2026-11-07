'use client'

import { useState } from 'react'
import Image from 'next/image'

function safeLogoUrl(value?: string): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function BrandLogo({ brandId, brandName, logoUrl, size = 40, className = '' }: {
  brandId: string
  brandName: string
  logoUrl?: string | null
  size?: number
  className?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const imageUrl = safeLogoUrl(logoUrl ?? undefined) && failedUrl !== logoUrl ? logoUrl : null

  if (imageUrl) {
    return <Image
      unoptimized
      src={imageUrl}
      alt={`${brandName} logo`}
      width={size}
      height={size}
      onError={() => setFailedUrl(imageUrl)}
      data-brand-id={brandId}
      className={`shrink-0 rounded-lg border border-slate-200 bg-white object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  }

  const initials = brandName.trim().split(/\s+/u).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?'
  return <span
    role="img"
    aria-label={`${brandName} logo`}
    data-brand-id={brandId}
    className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 font-semibold text-slate-600 ${className}`}
    style={{ width: size, height: size }}
  >{initials}</span>
}
