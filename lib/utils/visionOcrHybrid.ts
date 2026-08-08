import type {
  OcrReviewData,
  ReportMetricKey,
  ReportMetricValue,
} from '@/lib/types/database.types'
import type {
  HybridMetricCandidate,
  HybridMetricResult,
  VisionMetricResult,
  VisionOcrPlatform,
} from '@/lib/visionOcr/types'
import {
  localMetricCandidate,
  visionMetricKeys,
} from '@/lib/visionOcr/types'

const equalNumbers = (left: number, right: number) => Object.is(left, right)

const aiCandidate = (metric: VisionMetricResult): HybridMetricCandidate | null =>
  metric.value === null || metric.state === 'missing'
    ? null
    : {
        value: metric.value,
        rawText: metric.rawText,
        confidence: metric.confidence,
        state: metric.state,
      }

export function compareVisionMetrics({
  platform,
  localReview,
  aiMetrics,
  manualValues = {},
  protectedKeys = new Set<ReportMetricKey>(),
}: {
  platform: VisionOcrPlatform
  localReview?: OcrReviewData | null
  aiMetrics: readonly VisionMetricResult[]
  manualValues?: Partial<Record<ReportMetricKey, ReportMetricValue>>
  protectedKeys?: ReadonlySet<ReportMetricKey>
}): HybridMetricResult[] {
  const aiByKey = new Map(aiMetrics.map(metric => [metric.key, metric]))
  return visionMetricKeys[platform].map(key => {
    const local = localMetricCandidate(localReview?.metrics[key])
    const ai = aiCandidate(aiByKey.get(key) || {
      key,
      value: null,
      rawText: null,
      confidence: null,
      state: 'missing',
      reasoningCode: 'not_visible',
    })
    const manual = manualValues[key]
    if (protectedKeys.has(key) && typeof manual === 'number' && Number.isFinite(manual)) {
      return {
        key,
        local,
        ai,
        selectedValue: manual,
        selectedSource: 'manual',
        state: 'confirmed',
        warning: 'user_edited_value_preserved',
      }
    }
    if (local?.value != null && ai?.value != null && equalNumbers(local.value, ai.value)) {
      return {
        key,
        local,
        ai,
        selectedValue: local.value,
        selectedSource: 'agreement',
        state: 'confirmed',
      }
    }
    if (local?.value != null && ai?.value != null) {
      return {
        key,
        local,
        ai,
        selectedValue: null,
        selectedSource: 'none',
        state: 'review_required',
        difference: Math.abs(local.value - ai.value),
        warning: 'conflict',
      }
    }
    if (ai?.value != null) {
      return {
        key,
        local: null,
        ai,
        selectedValue: ai.value,
        selectedSource: 'ai',
        state: 'review_required',
        warning: 'ai_only',
      }
    }
    if (local?.value != null) {
      return {
        key,
        local,
        ai: null,
        selectedValue: local.value,
        selectedSource: 'local',
        state: local.state,
        warning: 'local_only',
      }
    }
    return {
      key,
      local: null,
      ai: null,
      selectedValue: null,
      selectedSource: 'none',
      state: 'missing',
      warning: 'both_missing',
    }
  })
}
export function resolveHybridMetric(
  result: HybridMetricResult,
  source: 'local' | 'ai' | 'manual',
  manualValue?: number | null,
): HybridMetricResult {
  const value = source === 'manual'
    ? manualValue ?? null
    : source === 'local'
      ? result.local?.value ?? null
      : result.ai?.value ?? null
  if (value === null || !Number.isFinite(value)) {
    return { ...result, selectedValue: null, selectedSource: 'none', state: 'missing' }
  }
  return {
    ...result,
    selectedValue: value,
    selectedSource: source,
    state: 'confirmed',
    warning: undefined,
  }
}

export function hybridResultsToMetricValues(results: readonly HybridMetricResult[]) {
  const values: Partial<Record<ReportMetricKey, number | null>> = {}
  for (const result of results) {
    if (result.selectedValue !== null) values[result.key] = result.selectedValue
  }
  return values
}

export function mergeHybridResultsIntoReview(
  current: OcrReviewData | null | undefined,
  results: readonly HybridMetricResult[],
): OcrReviewData {
  const metrics = { ...(current?.metrics || {}) }
  for (const result of results) {
    metrics[result.key] = {
      ...metrics[result.key],
      value: result.selectedValue,
      candidate_value: result.selectedValue,
      normalized_value: result.selectedValue,
      raw_value: result.selectedSource === 'ai' ? result.ai?.rawText || undefined : result.local?.rawText || undefined,
      confidence: result.state === 'confirmed' ? 'high' : result.state === 'missing' ? 'low' : 'medium',
      needs_review: result.state === 'review_required',
      normalized_key: result.key,
      source: result.selectedSource === 'manual'
        ? 'manual'
        : result.selectedSource === 'ai'
          ? 'ai_vision'
          : result.selectedSource === 'agreement'
            ? 'hybrid_agreement'
            : metrics[result.key]?.source || 'image_ocr',
      status: result.state === 'confirmed' ? 'confirmed' : result.state === 'missing' ? 'empty' : 'review_required',
      conflict_warning: result.warning,
    }
  }
  const reviewRequired = results.some(result => result.state === 'review_required')
  return {
    ...(current || { source_platform: undefined }),
    status: reviewRequired ? 'review_required' : 'confirmed',
    metrics,
    missing_metric_keys: results.filter(result => result.state === 'missing').map(result => result.key),
  }
}

export function parseVisionDisplayValue(input: string): number | null {
  const normalized = input.trim().replace(/\s+/g, '')
  if (!normalized) return null
  const duration = normalized.match(/^(?:(\d+)m)?(?:(\d+)s)?$/i)
  if (duration && (duration[1] || duration[2])) {
    return Number(duration[1] || 0) * 60 + Number(duration[2] || 0)
  }
  const suffix = normalized.match(/([km])$/i)?.[1]?.toLowerCase()
  const withoutSuffix = suffix ? normalized.slice(0, -1) : normalized
  const lastComma = withoutSuffix.lastIndexOf(',')
  const lastDot = withoutSuffix.lastIndexOf('.')
  let canonical = withoutSuffix
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalIndex = Math.max(lastComma, lastDot)
    canonical = `${withoutSuffix.slice(0, decimalIndex).replace(/[.,]/g, '')}.${withoutSuffix.slice(decimalIndex + 1)}`
  } else if (lastComma >= 0) {
    const decimalDigits = withoutSuffix.length - lastComma - 1
    canonical = decimalDigits <= 2
      ? withoutSuffix.replace(/\./g, '').replace(',', '.')
      : withoutSuffix.replace(/,/g, '')
  } else if ((withoutSuffix.match(/\./g) || []).length > 1) {
    canonical = withoutSuffix.replace(/\./g, '')
  }
  const value = Number(canonical)
  if (!Number.isFinite(value)) return null
  return value * (suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1)
}
