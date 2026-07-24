import type { OcrCropBox, OcrImageRecognition, ReportDashboardPlatform } from '@/lib/types/database.types'
import {
  isLegacyOcrApiSuccess,
  isOcrApiSuccess,
  type OcrApiFailure,
  type OcrApiResponse,
} from '@/lib/services/ocrApiContract'

export class OcrApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly contentType: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'OcrApiResponseError'
  }
}

export async function parseOcrApiResponse(response: Response): Promise<OcrImageRecognition> {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  const responseText = await response.text()

  if (!contentType.includes('application/json')) {
    throw new OcrApiResponseError(
      `OCR API returned an unexpected non-JSON response (status ${response.status}).`,
      response.status,
      contentType,
    )
  }

  let payload: OcrApiResponse | OcrImageRecognition
  try {
    payload = JSON.parse(responseText) as OcrApiResponse | OcrImageRecognition
  } catch {
    throw new OcrApiResponseError(
      `OCR API returned invalid JSON (status ${response.status}).`,
      response.status,
      contentType,
    )
  }

  if (response.ok && isOcrApiSuccess(payload)) return payload.data
  // Keep compatibility with an already-running server during a rolling deployment.
  if (response.ok && isLegacyOcrApiSuccess(payload)) return payload

  const failure = payload as Partial<OcrApiFailure>
  const message = failure.error?.message || `Image recognition failed (status ${response.status}).`
  throw new OcrApiResponseError(
    message,
    response.status,
    contentType,
    failure.error?.code,
  )
}

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
  return parseOcrApiResponse(response)
}
