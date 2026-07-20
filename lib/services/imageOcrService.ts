import type { OcrCropBox, OcrImageRecognition, ReportDashboardPlatform } from '@/lib/types/database.types'

export async function recognizeDashboardImage(
  imageUrl: string,
  platform: ReportDashboardPlatform,
  cropBox?: OcrCropBox,
): Promise<OcrImageRecognition> {
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    throw new Error('The selected dashboard image could not be read.')
  }

  const formData = new FormData()
  formData.append('image', await imageResponse.blob(), 'dashboard-image')
  formData.append('platform', platform)
  if (cropBox) formData.append('crop', JSON.stringify(cropBox))

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  })
  const payload = await response.json() as OcrImageRecognition | { error?: string }
  if (!response.ok || !('engine' in payload)) {
    throw new Error('error' in payload && payload.error ? payload.error : 'Image recognition failed.')
  }
  return payload
}
