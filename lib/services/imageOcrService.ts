import type { OcrCropBox, OcrImageRecognition, ReportDashboardPlatform } from '@/lib/types/database.types'
import {
  isLegacyOcrApiSuccess,
  isOcrApiSuccess,
  type OcrApiFailure,
  type OcrApiResponse,
} from '@/lib/services/ocrApiContract'
import { clampOcrCrop, defaultOcrCrop } from '@/lib/utils/ocrImage'

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
  const imageBlob = await imageResponse.blob()

  let browserFailure: unknown
  if (typeof window !== 'undefined') {
    try {
      return await recognizeDashboardImageInBrowser(imageBlob, platform, cropBox)
    } catch (error) {
      browserFailure = error
    }
  }

  try {
    return await recognizeDashboardImageOnServer(imageBlob, platform, cropBox)
  } catch (serverFailure) {
    if (browserFailure instanceof Error) {
      throw new Error(
        `${serverFailure instanceof Error ? serverFailure.message : 'Server OCR unavailable.'} `
        + `Browser OCR also failed: ${browserFailure.message}`,
      )
    }
    throw serverFailure
  }
}

async function recognizeDashboardImageOnServer(
  imageBlob: Blob,
  platform: ReportDashboardPlatform,
  cropBox?: OcrCropBox,
) {
  const formData = new FormData()
  formData.append('image', imageBlob, 'dashboard-image')
  formData.append('platform', platform)
  if (cropBox) formData.append('crop', JSON.stringify(cropBox))

  const response = await fetch('/api/ocr', {
    method: 'POST',
    body: formData,
  })
  return parseOcrApiResponse(response)
}

async function recognizeDashboardImageInBrowser(
  imageBlob: Blob,
  platform: ReportDashboardPlatform,
  requestedCrop?: OcrCropBox,
): Promise<OcrImageRecognition> {
  const [{ createWorker, OEM, PSM }, bitmap] = await Promise.all([
    import('tesseract.js'),
    createImageBitmap(imageBlob),
  ])
  const cropBox = clampOcrCrop(requestedCrop || defaultOcrCrop(platform))
  const left = Math.max(0, Math.floor(cropBox.left * bitmap.width))
  const top = Math.max(0, Math.floor(cropBox.top * bitmap.height))
  const width = Math.max(1, Math.min(bitmap.width - left, Math.round(cropBox.width * bitmap.width)))
  const height = Math.max(1, Math.min(bitmap.height - top, Math.round(cropBox.height * bitmap.height)))
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Browser OCR canvas is unavailable.')
  }
  context.drawImage(bitmap, left, top, width, height, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const worker = await createWorker('eng+vie', OEM.LSTM_ONLY)
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const result = await worker.recognize(canvas, { rotateAuto: false }, { text: true })
    const text = result.data.text.trim()
    return {
      engine: 'tesseract.js',
      language: 'eng+vie',
      text,
      pass_output: {
        label: text,
        numeric: '',
      },
      confidence: result.data.confidence,
      words: [],
      crop_box: cropBox,
      original_dimensions: { width: bitmap.width, height: bitmap.height },
      processed_dimensions: { width: canvas.width, height: canvas.height },
    }
  } finally {
    await worker.terminate()
  }
}
