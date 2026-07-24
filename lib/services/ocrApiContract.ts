import type { OcrImageRecognition } from '@/lib/types/database.types'

export type OcrApiErrorCode =
  | 'IMAGE_REQUIRED'
  | 'UNSUPPORTED_FILE'
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_PLATFORM'
  | 'INVALID_IMAGE'
  | 'OCR_SERVER_FAILED'
  | 'OCR_PROCESSING_FAILED'
  | 'OCR_TIMEOUT'

export type OcrApiSuccess = {
  ok: true
  data: OcrImageRecognition
}

export type OcrApiFailure = {
  ok: false
  error: {
    code: OcrApiErrorCode
    message: string
  }
}

export type OcrApiResponse = OcrApiSuccess | OcrApiFailure

export function ocrSuccessResponse(data: OcrImageRecognition, status = 200) {
  return Response.json({ ok: true, data } satisfies OcrApiSuccess, { status })
}

export function ocrErrorResponse(code: OcrApiErrorCode, message: string, status: number) {
  return Response.json({
    ok: false,
    error: { code, message },
  } satisfies OcrApiFailure, { status })
}

export function isOcrApiSuccess(value: unknown): value is OcrApiSuccess {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<OcrApiSuccess>
  return candidate.ok === true
    && !!candidate.data
    && typeof candidate.data === 'object'
    && typeof candidate.data.engine === 'string'
}

export function isLegacyOcrApiSuccess(value: unknown): value is OcrImageRecognition {
  return !!value
    && typeof value === 'object'
    && typeof (value as Partial<OcrImageRecognition>).engine === 'string'
}
