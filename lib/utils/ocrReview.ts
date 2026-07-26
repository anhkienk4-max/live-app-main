import type {
  OcrMetricValue,
  ReportDashboardPlatform,
  OcrReviewData,
  ReportMetricValue,
} from '@/lib/types/database.types'
import {
  applySelectedMetricsToState,
  candidateNumericValue,
  isCanonicalMetricKey,
  metricValueToInput,
  parseMetricInputValue,
  platformCanonicalMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
  type MetricValue,
} from '@/lib/utils/ocrCanonical'
import {
  parsePlatformOcrText,
  type ExistingOcrCandidates,
} from '@/lib/utils/ocrMetrics'

export type OcrMetricFilter = 'data' | 'all' | 'review_required' | 'confirmed'
export type MetricInputState = MetricState
export type OcrCandidateCollection = OcrReviewData | OcrReviewData['metrics']

export function canonicalizeOcrReview(review: OcrReviewData): OcrReviewData {
  const expectedKeys = new Set(platformCanonicalMetricKeys(review.source_platform || 'other'))
  const metrics: OcrReviewData['metrics'] = {}
  for (const [rawKey, metric] of Object.entries(review.metrics)) {
    if (!metric || !isCanonicalMetricKey(rawKey)) continue
    if (expectedKeys.size > 0 && !expectedKeys.has(rawKey)) continue
    metrics[rawKey] = { ...metric, normalized_key: rawKey }
  }
  return {
    ...review,
    metrics,
    missing_metric_keys: platformCanonicalMetricKeys(review.source_platform || 'other')
      .filter(key => !metrics[key]),
  }
}

export interface ParseAndApplyOcrTextOptions {
  platform: ReportDashboardPlatform
  rawText: string
  currentMetrics: MetricState
  overwriteOcrValues: boolean
  protectedKeys?: Iterable<CanonicalMetricKey>
  existingCandidates?: ExistingOcrCandidates
}

export interface OcrTextApplicationResult {
  metrics: MetricState
  appliedKeys: CanonicalMetricKey[]
  reviewRequiredKeys: CanonicalMetricKey[]
  unmappedLines: string[]
  warnings: string[]
  review: OcrReviewData
}

export function parseAndApplyOcrText({
  platform,
  rawText,
  currentMetrics,
  overwriteOcrValues,
  protectedKeys = [],
  existingCandidates,
}: ParseAndApplyOcrTextOptions): OcrTextApplicationResult {
  const parsed = parsePlatformOcrText({ platform, rawText, existingCandidates })
  const review = canonicalizeOcrReview(parsed.review)
  const incomingMetrics = applySelectedMetricsToState({}, review)
  const protectedSet = new Set(protectedKeys)
  if (!overwriteOcrValues) {
    for (const [key, value] of Object.entries(currentMetrics) as Array<[CanonicalMetricKey, MetricValue | undefined]>) {
      if (value !== undefined && value !== null) protectedSet.add(key)
    }
  }
  const metrics = applySelectedMetricsToState(currentMetrics, review, { protectedKeys: protectedSet })
  const appliedKeys = (Object.keys(incomingMetrics) as CanonicalMetricKey[])
    .filter(key => !protectedSet.has(key) && metrics[key] === incomingMetrics[key])
  const reviewRequiredKeys = appliedKeys.filter(key => {
    const metric = review.metrics[key]
    return metric?.status === 'review_required'
      || metric?.status === 'low_confidence'
      || metric?.needs_review === true
  })
  return {
    metrics,
    appliedKeys,
    reviewRequiredKeys,
    unmappedLines: parsed.unmappedLines,
    warnings: parsed.warnings,
    review,
  }
}

export function ocrCandidateMetricKeys(candidates: OcrCandidateCollection): CanonicalMetricKey[] {
  return Object.keys(applySelectedMetricsToState({}, candidates)) as CanonicalMetricKey[]
}

export function clearOcrDerivedMetricState(
  currentMetrics: MetricState,
  derivedKeys: Iterable<CanonicalMetricKey>,
  protectedKeys: Iterable<CanonicalMetricKey> = [],
): MetricState {
  const protectedSet = new Set(protectedKeys)
  const nextMetrics = { ...currentMetrics }
  for (const key of derivedKeys) {
    if (!protectedSet.has(key)) delete nextMetrics[key]
  }
  return nextMetrics
}

export function platformMetricBindingKeys(platform: ReportDashboardPlatform): CanonicalMetricKey[] {
  return [...platformCanonicalMetricKeys(platform)]
}

export function shouldInitializeOcrSelection(
  initializedSelectionId: string | null,
  nextSelectionId: string,
  open: boolean,
) {
  return open && initializedSelectionId !== nextSelectionId
}

export function metricInputValue(metric?: OcrMetricValue) {
  return metric ? metricValueToInput(candidateNumericValue(metric)) : ''
}

export function reviewInputValues(review: OcrReviewData) {
  return applySelectedMetricsToState({}, review)
}

const parseReviewInput = (value: string | number | null | undefined): ReportMetricValue => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return value == null ? null : parseMetricInputValue(value)
}

export function markMetricManual(
  review: OcrReviewData,
  key: CanonicalMetricKey,
  value: string | number | null,
  userId: string,
  timestamp = new Date().toISOString(),
): OcrReviewData {
  const existing = review.metrics[key]
  const parsed = parseReviewInput(value)
  const next: OcrMetricValue = {
    value: parsed,
    candidate_value: existing?.candidate_value,
    normalized_value: existing?.normalized_value,
    raw_ocr_label: existing?.raw_ocr_label,
    corrected_source_label: existing?.corrected_source_label,
    raw_ocr_value: existing?.raw_ocr_value,
    corrected_display_value: existing?.corrected_display_value,
    confidence: existing?.confidence || 'high',
    needs_review: false,
    original_label: existing?.original_label,
    raw_value: existing?.raw_value,
    normalized_key: key,
    unit: existing?.unit,
    bounding_box: existing?.bounding_box,
    label_box: existing?.label_box,
    value_box: existing?.value_box,
    pairing_reason: existing?.pairing_reason,
    pair_score: existing?.pair_score,
    source: 'manual',
    status: parsed == null ? 'empty' : 'manual',
    label_confidence: existing?.label_confidence,
    value_confidence: existing?.value_confidence,
    spatial_score: existing?.spatial_score,
    label_source: existing?.label_source,
    value_source_pass: existing?.value_source_pass,
    manual_edit: {
      original_value: existing?.raw_value,
      normalized_ocr_value: existing?.candidate_value,
      manual_value: parsed,
      edited_by: userId,
      edited_at: timestamp,
    },
  }
  return {
    ...review,
    metrics: { ...review.metrics, [key]: next },
  }
}

export function confirmReviewMetric(
  review: OcrReviewData,
  key: CanonicalMetricKey,
  value: string | number | null,
  userId: string,
  timestamp = new Date().toISOString(),
): OcrReviewData {
  const existing = review.metrics[key]
  if (!existing) return review
  const parsed = parseReviewInput(value)
  if (parsed == null) return review
  return {
    ...review,
    metrics: {
      ...review.metrics,
      [key]: {
        ...existing,
        value: parsed,
        needs_review: false,
        status: 'confirmed',
        confirmed_by: userId,
        confirmed_at: timestamp,
      },
    },
  }
}

export function confirmAllReviewMetrics(
  review: OcrReviewData,
  values: MetricState,
  userId: string,
  timestamp = new Date().toISOString(),
) {
  return Object.keys(review.metrics).reduce((current, rawKey) => {
    if (!isCanonicalMetricKey(rawKey)) return current
    return ['review_required', 'low_confidence'].includes(current.metrics[rawKey]?.status || '')
      ? confirmReviewMetric(current, rawKey, values[rawKey] ?? null, userId, timestamp)
      : current
  }, review)
}

export function resetMetricToOcr(review: OcrReviewData, key: CanonicalMetricKey): OcrReviewData {
  const existing = review.metrics[key]
  if (!existing || existing.candidate_value == null) return review
  return {
    ...review,
    metrics: {
      ...review.metrics,
      [key]: {
        ...existing,
        value: existing.candidate_value,
        source: existing.label_source || existing.value_source_pass ? 'image_ocr' : existing.source,
        status: existing.confidence === 'high' ? 'accepted' : 'review_required',
        needs_review: existing.confidence !== 'high',
        confirmed_by: undefined,
        confirmed_at: undefined,
        manual_edit: undefined,
      },
    },
  }
}

export function clearReviewMetric(
  review: OcrReviewData,
  key: CanonicalMetricKey,
  userId: string,
  timestamp = new Date().toISOString(),
) {
  return markMetricManual(review, key, null, userId, timestamp)
}

export function reviewRequiredCount(review?: OcrReviewData | null) {
  return Object.values(review?.metrics || {}).filter(
    metric => metric?.status === 'review_required' || metric?.status === 'low_confidence' || metric?.needs_review,
  ).length
}

export function metricMatchesFilter(
  filter: OcrMetricFilter,
  value: MetricValue | undefined,
  metric?: OcrMetricValue,
) {
  if (filter === 'all') return true
  if (filter === 'data') return value !== null && value !== undefined
  if (filter === 'review_required') {
    return metric?.status === 'review_required'
      || metric?.status === 'low_confidence'
      || metric?.needs_review === true
  }
  return metric?.status === 'confirmed' || metric?.status === 'accepted' || metric?.status === 'manual'
}
