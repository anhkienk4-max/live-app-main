import type {
  OcrMetricValue,
  OcrReviewData,
  ReportMetricKey,
  ReportMetricValue,
} from '@/lib/types/database.types'

export type OcrMetricFilter = 'data' | 'all' | 'review_required' | 'confirmed'

export function metricInputValue(metric?: OcrMetricValue) {
  if (!metric || metric.status === 'rejected') return ''
  const value = metric.value ?? metric.candidate_value
  return value == null ? '' : String(value)
}

export function reviewInputValues(review: OcrReviewData) {
  return Object.fromEntries(
    Object.entries(review.metrics).map(([key, metric]) => [key, metricInputValue(metric)]),
  ) as Partial<Record<ReportMetricKey, string>>
}

export function parseReviewInput(key: ReportMetricKey, value: string): ReportMetricValue {
  if (!value.trim()) return null
  if (key === 'started_at' || key === 'ended_at') return value.trim()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function markMetricManual(
  review: OcrReviewData,
  key: ReportMetricKey,
  value: string,
  userId: string,
  timestamp = new Date().toISOString(),
): OcrReviewData {
  const existing = review.metrics[key]
  const parsed = parseReviewInput(key, value)
  const next: OcrMetricValue = {
    value: parsed,
    candidate_value: existing?.candidate_value,
    confidence: existing?.confidence || 'high',
    needs_review: false,
    original_label: existing?.original_label,
    raw_value: existing?.raw_value,
    normalized_key: key,
    unit: existing?.unit,
    bounding_box: existing?.bounding_box,
    source: 'manual',
    status: parsed == null ? 'empty' : 'manual',
    rejection_reason: undefined,
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
  key: ReportMetricKey,
  value: string,
  userId: string,
  timestamp = new Date().toISOString(),
): OcrReviewData {
  const existing = review.metrics[key]
  if (!existing) return review
  const parsed = parseReviewInput(key, value)
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
  values: Partial<Record<ReportMetricKey, string>>,
  userId: string,
  timestamp = new Date().toISOString(),
) {
  return Object.keys(review.metrics).reduce(
    (current, key) => current.metrics[key as ReportMetricKey]?.status === 'review_required'
      ? confirmReviewMetric(current, key as ReportMetricKey, values[key as ReportMetricKey] || '', userId, timestamp)
      : current,
    review,
  )
}

export function resetMetricToOcr(review: OcrReviewData, key: ReportMetricKey): OcrReviewData {
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
  key: ReportMetricKey,
  userId: string,
  timestamp = new Date().toISOString(),
) {
  return markMetricManual(review, key, '', userId, timestamp)
}

export function reviewRequiredCount(review?: OcrReviewData | null) {
  return Object.values(review?.metrics || {}).filter(
    metric => metric?.status === 'review_required' || metric?.needs_review,
  ).length
}

export function metricMatchesFilter(
  filter: OcrMetricFilter,
  value: string,
  metric?: OcrMetricValue,
) {
  if (filter === 'all') return true
  if (filter === 'data') return value !== ''
  if (filter === 'review_required') return metric?.status === 'review_required' || metric?.needs_review === true
  return metric?.status === 'confirmed' || metric?.status === 'accepted' || metric?.status === 'manual'
}
