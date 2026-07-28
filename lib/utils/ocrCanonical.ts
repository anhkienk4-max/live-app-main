import type {
  OcrMetricValue,
  OcrReviewData,
  ReportDashboardPlatform,
  ReportMetricKey,
  ReportMetricValue,
} from '@/lib/types/database.types'

export const shopeeMainMetricKeys = [
  'sales',
  'engaged_viewers',
  'comments',
  'add_to_cart',
  'total_views',
  'average_view_duration_seconds',
  'comment_rate',
  'gpm',
  'orders',
  'average_basket_size',
  'total_viewers',
  'pcu',
  'ctr',
  'click_to_order_rate',
  'buyers',
  'items_sold',
] as const satisfies readonly ReportMetricKey[]

export const shopeeSupplementaryMetricKeys = [
  'likes',
  'shares',
  'live_duration_seconds',
] as const satisfies readonly ReportMetricKey[]

export const tiktokCentralMetricKeys = [
  'gmv',
  'items_sold',
  'current_viewers',
  'impressions',
  'total_views',
  'advertising_cost',
  'click_rate',
  'roi_gmv_max',
  'ctor',
  'average_view_duration_seconds',
  'new_followers',
  'buyers',
  'sku_orders',
  'comments',
  'product_clicks',
  'average_order_value',
  'live_ctr',
  'shares',
  'estimated_gmv',
] as const satisfies readonly ReportMetricKey[]

export const canonicalMetricKeys = [
  ...shopeeMainMetricKeys,
  ...shopeeSupplementaryMetricKeys,
  ...tiktokCentralMetricKeys,
] as const

export type CanonicalMetricKey = typeof canonicalMetricKeys[number]
export type MetricValue = number | null
export type MetricState = Partial<Record<CanonicalMetricKey, MetricValue>>

const canonicalMetricKeySet = new Set<ReportMetricKey>(canonicalMetricKeys)
const integerCountMetricKeys = new Set<CanonicalMetricKey>([
  'engaged_viewers',
  'comments',
  'add_to_cart',
  'total_views',
  'orders',
  'total_viewers',
  'pcu',
  'buyers',
  'items_sold',
  'likes',
  'shares',
  'current_viewers',
  'impressions',
  'new_followers',
  'sku_orders',
  'product_clicks',
])

export function isCanonicalMetricKey(key: string): key is CanonicalMetricKey {
  return canonicalMetricKeySet.has(key as ReportMetricKey)
}

export function platformCanonicalMetricKeys(platform: ReportDashboardPlatform): readonly CanonicalMetricKey[] {
  if (platform === 'shopee_live') {
    return [...shopeeMainMetricKeys, ...shopeeSupplementaryMetricKeys]
  }
  if (platform === 'tiktok_shop') return tiktokCentralMetricKeys
  return []
}

export interface MetricCandidateInput {
  key: CanonicalMetricKey
  metric: OcrMetricValue
}

export interface DiscardedMetricConflict {
  canonical_key: CanonicalMetricKey
  selected_source: OcrMetricValue['source']
  discarded_source: OcrMetricValue['source']
  selected_value: ReportMetricValue | undefined
  discarded_value: ReportMetricValue | undefined
  reason: string
}

export interface MetricCandidateSelection {
  selectedByKey: Partial<Record<CanonicalMetricKey, OcrMetricValue>>
  discardedConflicts: DiscardedMetricConflict[]
  missingKeys: CanonicalMetricKey[]
}

const sourcePriority = (metric: OcrMetricValue) => {
  if (metric.source === 'manual' || metric.source === 'imported') return 6
  // A readable label paired with a nearby type-compatible value is the
  // strongest OCR evidence. Grid/card geometry is intentionally secondary so
  // viewport and layout changes cannot silently override semantic anchors.
  if (metric.source === 'word_box_exact') return 5
  if (metric.source === 'spatial_fallback' && metric.label_source === 'ocr_text') return 4.5
  if (metric.source === 'card_exact') return 4
  if (
    metric.source === 'spatial_fallback'
    && metric.rejection_reason?.includes('displayed value format was repaired')
  ) return 1.75
  if (metric.source === 'spatial_fallback' && metric.label_source === 'platform_layout') return 3.5
  if (metric.source === 'spatial_fallback') return 3
  if (
    metric.source === 'raw_text_exact'
    || metric.source === 'trusted_text'
    || metric.source === 'local_tesseract_text'
  ) return 2
  if (metric.source === 'raw_text_sequence') return 1
  return 0
}

const confidenceRank = (confidence: OcrMetricValue['confidence']) =>
  confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1

const statusRank = (status: OcrMetricValue['status']) => {
  if (status === 'manual' || status === 'confirmed' || status === 'accepted') return 3
  if (status === 'review_required' || status === 'low_confidence') return 2
  if (status === 'empty') return 1
  return 0
}

const usableValue = (metric: OcrMetricValue) => {
  if (metric.status === 'rejected' || metric.status === 'empty') return false
  const value = metric.value ?? metric.candidate_value
  return value !== null
    && value !== undefined
    && (typeof value !== 'number' || Number.isFinite(value))
}

const stableCandidateText = (candidate: MetricCandidateInput) => [
  candidate.metric.source || '',
  candidate.metric.original_label || '',
  candidate.metric.raw_value || '',
  String(candidate.metric.value ?? candidate.metric.candidate_value ?? ''),
].join('\u0000')

const compareCandidates = (left: MetricCandidateInput, right: MetricCandidateInput) =>
  Number(usableValue(right.metric)) - Number(usableValue(left.metric))
  || sourcePriority(right.metric) - sourcePriority(left.metric)
  || statusRank(right.metric.status) - statusRank(left.metric.status)
  || (right.metric.pair_score ?? 0) - (left.metric.pair_score ?? 0)
  || confidenceRank(right.metric.confidence) - confidenceRank(left.metric.confidence)
  || (right.metric.value_confidence ?? 0) - (left.metric.value_confidence ?? 0)
  || stableCandidateText(left).localeCompare(stableCandidateText(right))

const metricValue = (metric: OcrMetricValue) => metric.value ?? metric.candidate_value

const metricValuesEqual = (left: ReportMetricValue | undefined, right: ReportMetricValue | undefined) =>
  typeof left === 'number' && typeof right === 'number'
    ? Math.abs(left - right) < Number.EPSILON
    : left === right

const metricValueSignature = (metric: OcrMetricValue) => {
  const value = metricValue(metric)
  return typeof value === 'number'
    ? `number:${value}`
    : `${typeof value}:${String(value ?? '')}`
}

const evidenceChannel = (metric: OcrMetricValue) => {
  if (metric.source === 'manual' || metric.source === 'imported') return metric.source
  if (
    metric.source === 'raw_text_exact'
    || metric.source === 'raw_text_sequence'
    || metric.source === 'trusted_text'
    || metric.source === 'local_tesseract_text'
  ) return 'raw_text'
  if (metric.value_source_pass === 'label') return 'label_pass'
  if (metric.value_source_pass === 'numeric') return 'numeric_pass'
  if (metric.value_source_pass === 'card') return 'card_pass'
  return metric.source || 'unknown'
}

const isRepeatedGlyphRecovery = (
  key: CanonicalMetricKey,
  candidate: MetricCandidateInput,
  allCandidates: readonly MetricCandidateInput[],
) => {
  if (!integerCountMetricKeys.has(key) || evidenceChannel(candidate.metric) !== 'card_pass') return false
  const value = metricValue(candidate.metric)
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return false
  const expanded = String(value)
  return allCandidates.some(other => {
    if (other === candidate || evidenceChannel(other.metric) === 'card_pass') return false
    const otherValue = metricValue(other.metric)
    if (typeof otherValue !== 'number' || !Number.isInteger(otherValue) || otherValue < 0) return false
    const compressed = String(otherValue)
    if (expanded.length !== compressed.length + 1) return false
    return [...expanded].some((glyph, index) =>
      (glyph === expanded[index - 1] || glyph === expanded[index + 1])
      && `${expanded.slice(0, index)}${expanded.slice(index + 1)}` === compressed,
    )
  })
}

const isCardInsertionArtifact = (
  key: CanonicalMetricKey,
  candidate: MetricCandidateInput,
  allCandidates: readonly MetricCandidateInput[],
) => {
  if (
    !integerCountMetricKeys.has(key)
    || evidenceChannel(candidate.metric) !== 'card_pass'
    || isRepeatedGlyphRecovery(key, candidate, allCandidates)
  ) return false
  const value = metricValue(candidate.metric)
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return false
  const expanded = String(value)
  return allCandidates.some(other => {
    if (other === candidate || evidenceChannel(other.metric) === 'card_pass') return false
    const otherValue = metricValue(other.metric)
    if (typeof otherValue !== 'number' || !Number.isInteger(otherValue) || otherValue < 0) return false
    const compressed = String(otherValue)
    if (expanded.length !== compressed.length + 1) return false
    return [...expanded].some((_, index) =>
      `${expanded.slice(0, index)}${expanded.slice(index + 1)}` === compressed,
    )
  })
}

export function selectBestMetricCandidates(
  candidates: readonly MetricCandidateInput[],
  expectedKeys: readonly CanonicalMetricKey[] = canonicalMetricKeys,
): MetricCandidateSelection {
  const selectedByKey: MetricCandidateSelection['selectedByKey'] = {}
  const discardedConflicts: DiscardedMetricConflict[] = []

  for (const key of expectedKeys) {
    const keyCandidates = candidates
      .filter(candidate => candidate.key === key && usableValue(candidate.metric))
    const supportByValue = new Map<string, Set<string>>()
    for (const candidate of keyCandidates) {
      const signature = metricValueSignature(candidate.metric)
      const channels = supportByValue.get(signature) || new Set<string>()
      channels.add(evidenceChannel(candidate.metric))
      supportByValue.set(signature, channels)
    }
    const ranked = keyCandidates.sort((left, right) => {
      const protectedLeft = sourcePriority(left.metric) >= 6
      const protectedRight = sourcePriority(right.metric) >= 6
      if (protectedLeft || protectedRight) return compareCandidates(left, right)
      const repeatedGlyphLeft = isRepeatedGlyphRecovery(key, left, keyCandidates)
      const repeatedGlyphRight = isRepeatedGlyphRecovery(key, right, keyCandidates)
      if (repeatedGlyphLeft !== repeatedGlyphRight) {
        return Number(repeatedGlyphRight) - Number(repeatedGlyphLeft)
      }
      const insertionArtifactLeft = isCardInsertionArtifact(key, left, keyCandidates)
      const insertionArtifactRight = isCardInsertionArtifact(key, right, keyCandidates)
      if (insertionArtifactLeft !== insertionArtifactRight) {
        return Number(insertionArtifactLeft) - Number(insertionArtifactRight)
      }
      const leftSupport = supportByValue.get(metricValueSignature(left.metric))?.size || 0
      const rightSupport = supportByValue.get(metricValueSignature(right.metric))?.size || 0
      return rightSupport - leftSupport || compareCandidates(left, right)
    })
    const selected = ranked[0]
    if (!selected) continue
    selectedByKey[key] = selected.metric
    for (const discarded of ranked.slice(1)) {
      if (metricValuesEqual(metricValue(selected.metric), metricValue(discarded.metric))) continue
      discardedConflicts.push({
        canonical_key: key,
        selected_source: selected.metric.source,
        discarded_source: discarded.metric.source,
        selected_value: metricValue(selected.metric),
        discarded_value: metricValue(discarded.metric),
        reason: `Kept ${selected.metric.source || 'unknown'} candidate because it has deterministic source priority ${sourcePriority(selected.metric)} over ${sourcePriority(discarded.metric)}.`,
      })
    }
  }

  return {
    selectedByKey,
    discardedConflicts,
    missingKeys: expectedKeys.filter(key => !selectedByKey[key]),
  }
}

export interface ApplySelectedMetricsOptions {
  protectedKeys?: Iterable<CanonicalMetricKey>
  overwriteProtected?: boolean
}

export function candidateNumericValue(metric: OcrMetricValue): number | null {
  if (metric.status === 'rejected' || metric.status === 'empty') return null
  const rawValue = metric.value ?? metric.candidate_value
  const parsed = typeof rawValue === 'number'
    ? rawValue
    : typeof rawValue === 'string'
      ? Number(rawValue.trim())
      : null
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

export function applySelectedMetricsToState(
  current: MetricState,
  candidates: OcrReviewData | OcrReviewData['metrics'],
  options: ApplySelectedMetricsOptions = {},
): MetricState {
  const protectedKeys = new Set(options.protectedKeys || [])
  const metrics = 'metrics' in candidates ? candidates.metrics : candidates
  const next = { ...current }
  for (const [rawKey, metric] of Object.entries(metrics)) {
    if (!metric || !isCanonicalMetricKey(rawKey)) continue
    if (!options.overwriteProtected && protectedKeys.has(rawKey)) continue
    const value = candidateNumericValue(metric)
    if (value !== null) next[rawKey] = value
  }
  return next
}

export function parseMetricInputValue(rawValue: string): MetricValue {
  const trimmed = rawValue.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function metricValueToInput(value: MetricValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}
