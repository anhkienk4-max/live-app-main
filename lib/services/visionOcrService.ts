'use client'

import type { OcrCropBox, ReportDashboardPlatform } from '@/lib/types/database.types'
import { clampOcrCrop } from '@/lib/utils/ocrImage'
import {
  parseVisionOcrResponse,
  toVisionPlatform,
  type VisionOcrResponse,
} from '@/lib/visionOcr/types'

const visionOcrPrivacyConsentKey = 'livestream-ops-ai-ocr-privacy-consent-v1'

export class VisionOcrClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'VisionOcrClientError'
  }
}
async function loadImage(imageUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new VisionOcrClientError('INVALID_CROP', 'The selected KPI crop could not be decoded.', 400))
    image.src = imageUrl
  })
}

export async function renderSelectedOcrCrop(imageUrl: string, cropBox: OcrCropBox) {
  const image = await loadImage(imageUrl)
  const crop = clampOcrCrop(cropBox)
  const sourceX = Math.round(crop.left * image.naturalWidth)
  const sourceY = Math.round(crop.top * image.naturalHeight)
  const width = Math.round(crop.width * image.naturalWidth)
  const height = Math.round(crop.height * image.naturalHeight)
  if (width < 32 || height < 32) throw new VisionOcrClientError('INVALID_CROP', 'The selected KPI crop is too small.', 400)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new VisionOcrClientError('INVALID_CROP', 'The selected KPI crop could not be rendered.', 400)
  context.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  canvas.width = 0
  canvas.height = 0
  if (!blob || blob.size === 0) throw new VisionOcrClientError('INVALID_CROP', 'The selected KPI crop is empty.', 400)
  return { blob, width, height }
}

export async function requestVisionOcr({
  platform,
  imageUrl,
  cropBox,
}: {
  platform: ReportDashboardPlatform
  imageUrl: string
  cropBox: OcrCropBox
}): Promise<VisionOcrResponse> {
  if (window.localStorage.getItem(visionOcrPrivacyConsentKey) !== 'accepted') {
    throw new VisionOcrClientError('PRIVACY_CONSENT_REQUIRED', 'AI Vision OCR privacy consent is required.', 400)
  }
  const visionPlatform = toVisionPlatform(platform)
  if (!visionPlatform) throw new VisionOcrClientError('UNSUPPORTED_PLATFORM', 'Select TikTok Shop or Shopee Live.', 400)
  const crop = await renderSelectedOcrCrop(imageUrl, cropBox)
  const formData = new FormData()
  formData.set('image', new File([crop.blob], 'selected-kpi-crop.png', { type: 'image/png' }))
  formData.set('platform', visionPlatform)
  formData.set('crop_width', String(crop.width))
  formData.set('crop_height', String(crop.height))
  formData.set('request_id', crypto.randomUUID())
  formData.set('privacy_consent', 'accepted')
  const response = await fetch('/api/ocr/vision', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  const payload = await response.json().catch(() => null) as {
    ok?: boolean
    data?: unknown
    error?: { code?: string; message?: string }
  } | null
  if (!response.ok || !payload?.ok || !payload.data) {
    throw new VisionOcrClientError(
      payload?.error?.code || 'AI_OCR_FAILED',
      payload?.error?.message || 'AI Vision OCR is unavailable.',
      response.status,
    )
  }
  return parseVisionOcrResponse(visionPlatform, payload.data)
}
