import type { OcrCropBox, ReportDashboardPlatform } from '@/lib/types/database.types'

const cropTemplates: Record<Exclude<ReportDashboardPlatform, 'other'>, OcrCropBox> = {
  shopee_live: { left: 0.11, top: 0.18, width: 0.66, height: 0.42 },
  tiktok_shop: { left: 0.22, top: 0.08, width: 0.58, height: 0.57 },
}

export function defaultOcrCrop(platform: ReportDashboardPlatform): OcrCropBox {
  return platform === 'other'
    ? { left: 0, top: 0, width: 1, height: 1 }
    : { ...cropTemplates[platform] }
}

export function clampOcrCrop(crop: OcrCropBox): OcrCropBox {
  const left = clamp(crop.left, 0, 0.95)
  const top = clamp(crop.top, 0, 0.95)
  const width = clamp(crop.width, 0.05, 1 - left)
  const height = clamp(crop.height, 0.05, 1 - top)
  return { left, top, width, height }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}
