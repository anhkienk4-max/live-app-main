import { z } from 'zod'
import type {
  OcrMetricValue,
  ReportDashboardPlatform,
  ReportMetricKey,
} from '@/lib/types/database.types'
import {
  shopeeMainMetricKeys,
  tiktokCentralMetricKeys,
} from '@/lib/utils/ocrCanonical'

export const visionPlatforms = ['tiktok', 'shopee'] as const
export type VisionOcrPlatform = typeof visionPlatforms[number]

export const visionMetricKeys = {
  tiktok: tiktokCentralMetricKeys,
  shopee: shopeeMainMetricKeys,
} as const satisfies Record<VisionOcrPlatform, readonly ReportMetricKey[]>

export type VisionMetricState = 'confirmed' | 'review_required' | 'missing'
export type VisionMetricReasoningCode =
  | 'direct_read'
  | 'ambiguous_glyph'
  | 'missing_suffix'
  | 'missing_decimal'
  | 'label_not_found'
  | 'not_visible'
  | 'conflict'
  | 'invalid_format'

export type VisionMetricResult = {
  key: string
  value: number | null
  rawText: string | null
  confidence: number | null
  state: VisionMetricState
  reasoningCode: VisionMetricReasoningCode
}
export type VisionOcrRequest = {
  platform: VisionOcrPlatform
  image: {
    bytes: Uint8Array
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
    width: number
    height: number
  }
  expectedMetricKeys: string[]
  requestId: string
}

export type VisionOcrResponse = {
  provider: 'mock' | 'openai'
  model: string
  metrics: VisionMetricResult[]
  warnings: string[]
  latencyMs: number
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export type HybridMetricCandidate = {
  value: number | null
  rawText: string | null
  confidence: number | null
  state: VisionMetricState
}

export type HybridMetricResult = {
  key: ReportMetricKey
  local: HybridMetricCandidate | null
  ai: HybridMetricCandidate | null
  selectedValue: number | null
  selectedSource: 'local' | 'ai' | 'agreement' | 'manual' | 'none'
  state: VisionMetricState
  difference?: number
  warning?: string
}

export const visionMetricResultSchema = z.object({
  key: z.string().min(1),
  value: z.number().finite().nullable(),
  rawText: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  state: z.enum(['confirmed', 'review_required', 'missing']),
  reasoningCode: z.enum([
    'direct_read',
    'ambiguous_glyph',
    'missing_suffix',
    'missing_decimal',
    'label_not_found',
    'not_visible',
    'conflict',
    'invalid_format',
  ]),
}).strict().superRefine((metric, context) => {
  if (metric.state === 'missing' && metric.value !== null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Missing metrics must have a null value.' })
  }
  if (metric.state !== 'missing' && metric.value === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Readable metrics require a finite value.' })
  }
})

const visionOcrResponseBaseSchema = z.object({
  provider: z.enum(['mock', 'openai']),
  model: z.string().min(1).max(120),
  metrics: z.array(visionMetricResultSchema),
  warnings: z.array(z.string().max(500)).max(50),
  latencyMs: z.number().finite().nonnegative(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  }).strict().optional(),
}).strict()

export function parseVisionOcrResponse(
  platform: VisionOcrPlatform,
  value: unknown,
): VisionOcrResponse {
  const response = visionOcrResponseBaseSchema.parse(value)
  const expectedKeys = visionMetricKeys[platform]
  const actualKeys = response.metrics.map(metric => metric.key)
  const actualKeySet = new Set(actualKeys)
  if (actualKeySet.size !== actualKeys.length) {
    throw new Error('Vision provider returned duplicate metric keys.')
  }
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some(key => !expectedKeys.includes(key as never))
    || expectedKeys.some(key => !actualKeySet.has(key))
  ) {
    throw new Error('Vision provider output does not match the canonical platform schema.')
  }
  return response
}

export function toVisionPlatform(platform: ReportDashboardPlatform): VisionOcrPlatform | null {
  if (platform === 'tiktok_shop') return 'tiktok'
  if (platform === 'shopee_live') return 'shopee'
  return null
}

export function localMetricCandidate(metric?: OcrMetricValue): HybridMetricCandidate | null {
  if (!metric) return null
  const numericValue = typeof metric.value === 'number'
    ? metric.value
    : typeof metric.candidate_value === 'number'
      ? metric.candidate_value
      : null
  if (numericValue === null || !Number.isFinite(numericValue)) return null
  const confidence = metric.value_confidence == null
    ? metric.confidence === 'high' ? 0.9 : metric.confidence === 'medium' ? 0.7 : 0.4
    : Math.max(0, Math.min(1, metric.value_confidence > 1 ? metric.value_confidence / 100 : metric.value_confidence))
  return {
    value: numericValue,
    rawText: metric.raw_value || metric.raw_ocr_value || null,
    confidence,
    state: metric.status === 'confirmed' || metric.status === 'accepted'
      ? 'confirmed'
      : 'review_required',
  }
}
