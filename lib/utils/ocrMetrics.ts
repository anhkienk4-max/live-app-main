import type {
  OcrImageRecognition,
  OcrMetricValue,
  OcrRecognizedWord,
  OcrReviewData,
  ReportDashboardPlatform,
  ReportMetricKey,
  ReportMetricValue,
} from '@/lib/types/database.types'

export const commonReportMetricKeys: ReportMetricKey[] = [
  'revenue', 'gmv', 'orders', 'buyers', 'items_sold', 'total_views',
  'engaged_viewers', 'peak_concurrent_viewers', 'average_view_duration_seconds',
  'product_clicks', 'ctr', 'conversion_rate', 'average_order_value', 'likes',
  'comments', 'shares', 'new_followers', 'live_duration_seconds', 'started_at',
  'ended_at',
]

export const platformMetricKeys: Record<ReportDashboardPlatform, ReportMetricKey[]> = {
  tiktok_shop: [
    'current_viewers', 'impressions', 'gmv_per_hour', 'gpm', 'click_rate',
    'live_ctr', 'advertising_cost', 'sku_orders', 'ctor', 'roi_gmv_max',
    'estimated_gmv',
  ],
  shopee_live: [
    'sales', 'add_to_cart', 'comment_rate', 'average_basket_size', 'pcu',
    'click_to_order_rate', 'total_viewers', 'gpm',
  ],
  other: [],
}

const aliases: Record<ReportDashboardPlatform, Record<string, ReportMetricKey>> = {
  tiktok_shop: {
    'gmv da ghi nhan': 'gmv',
    'recognized gmv': 'gmv',
    'so mon ban ra': 'items_sold',
    'so mon ban ra tu su kien': 'items_sold',
    'items sold': 'items_sold',
    'nguoi xem hien tai': 'current_viewers',
    'current viewers': 'current_viewers',
    'luot hien thi': 'impressions',
    impressions: 'impressions',
    'luot xem': 'total_views',
    views: 'total_views',
    'gmv gio': 'gmv_per_hour',
    'gmv hour': 'gmv_per_hour',
    'gpm hien thi': 'gpm',
    gpm: 'gpm',
    'ty le nhan': 'click_rate',
    'click rate': 'click_rate',
    'ctr cua live': 'live_ctr',
    'live ctr': 'live_ctr',
    'chi phi quang cao': 'advertising_cost',
    'advertising cost': 'advertising_cost',
    'khach hang': 'buyers',
    customers: 'buyers',
    'don hang sku': 'sku_orders',
    'don hang sku da ghi nhan': 'sku_orders',
    'sku orders': 'sku_orders',
    'thoi luong xem tb': 'average_view_duration_seconds',
    'average viewing duration': 'average_view_duration_seconds',
    ctor: 'ctor',
    'binh luan': 'comments',
    comments: 'comments',
    'luot chia se': 'shares',
    shares: 'shares',
    'nguoi theo doi moi': 'new_followers',
    'new followers': 'new_followers',
    thich: 'likes',
    likes: 'likes',
    'roi gmv max': 'roi_gmv_max',
    'gmv uoc tinh': 'estimated_gmv',
    'estimated gmv': 'estimated_gmv',
    'luot nhap vao san pham': 'product_clicks',
    'product clicks': 'product_clicks',
    aov: 'average_order_value',
    'average order value': 'average_order_value',
  },
  shopee_live: {
    sales: 'sales',
    sale: 'sales',
    'doanh thu': 'sales',
    'engaged viewer': 'engaged_viewers',
    'engaged viewers': 'engaged_viewers',
    'nguoi xem tuong tac': 'engaged_viewers',
    comments: 'comments',
    comment: 'comments',
    'binh luan': 'comments',
    atc: 'add_to_cart',
    'add to cart': 'add_to_cart',
    'total views': 'total_views',
    'total view': 'total_views',
    'tong luot xem': 'total_views',
    'avg viewing duration': 'average_view_duration_seconds',
    'avg. viewing duration': 'average_view_duration_seconds',
    'thoi luong xem tb': 'average_view_duration_seconds',
    'comments rate': 'comment_rate',
    'comment rate': 'comment_rate',
    'ty le binh luan': 'comment_rate',
    gpm: 'gpm',
    orders: 'orders',
    order: 'orders',
    'don hang': 'orders',
    abs: 'average_basket_size',
    'average basket size': 'average_basket_size',
    'total viewers': 'total_viewers',
    'total viewer': 'total_viewers',
    'tong nguoi xem': 'total_viewers',
    pcu: 'pcu',
    ctr: 'ctr',
    'click to order rate': 'click_to_order_rate',
    'click to order': 'click_to_order_rate',
    'click to order rate co': 'click_to_order_rate',
    buyers: 'buyers',
    buyer: 'buyers',
    'nguoi mua': 'buyers',
    'items sold': 'items_sold',
    'item sold': 'items_sold',
    'san pham da ban': 'items_sold',
    likes: 'likes',
    thich: 'likes',
    shares: 'shares',
    'luot chia se': 'shares',
    'start at': 'started_at',
    'bat dau luc': 'started_at',
    duration: 'live_duration_seconds',
    'thoi luong': 'live_duration_seconds',
  },
  other: {},
}

export type LayoutValueKind = 'count' | 'currency' | 'compact' | 'duration' | 'percentage' | 'ratio'
export type LayoutMetricCell = {
  key: ReportMetricKey
  label: string
  x: number
  y: number
  width: number
  height: number
  valueKind: LayoutValueKind
}

// Normalized against the original screenshot dimensions. These regions describe
// the value area of each fixed KPI card, not an OCR reading order.
export const platformMetricLayouts: Record<Exclude<ReportDashboardPlatform, 'other'>, LayoutMetricCell[]> = {
  shopee_live: [
    { key: 'sales', label: 'Sales', x: .437, y: .284, width: .24, height: .075, valueKind: 'currency' },
    { key: 'engaged_viewers', label: 'Engaged Viewer', x: .225, y: .374, width: .10, height: .05, valueKind: 'count' },
    { key: 'comments', label: 'Comments', x: .437, y: .374, width: .08, height: .05, valueKind: 'count' },
    { key: 'add_to_cart', label: 'ATC', x: .648, y: .374, width: .08, height: .05, valueKind: 'count' },
    { key: 'total_views', label: 'Total Views', x: .175, y: .465, width: .09, height: .05, valueKind: 'count' },
    { key: 'average_view_duration_seconds', label: 'Avg. Viewing Duration', x: .277, y: .465, width: .10, height: .05, valueKind: 'duration' },
    { key: 'comment_rate', label: 'Comments Rate', x: .386, y: .465, width: .08, height: .05, valueKind: 'percentage' },
    { key: 'gpm', label: 'GPM', x: .488, y: .465, width: .12, height: .05, valueKind: 'currency' },
    { key: 'orders', label: 'Orders', x: .598, y: .465, width: .075, height: .05, valueKind: 'count' },
    { key: 'average_basket_size', label: 'ABS', x: .700, y: .465, width: .12, height: .05, valueKind: 'currency' },
    { key: 'total_viewers', label: 'Total Viewers', x: .175, y: .525, width: .09, height: .05, valueKind: 'count' },
    { key: 'pcu', label: 'PCU', x: .277, y: .525, width: .075, height: .05, valueKind: 'count' },
    { key: 'ctr', label: 'CTR', x: .386, y: .525, width: .08, height: .05, valueKind: 'percentage' },
    { key: 'click_to_order_rate', label: 'Click to Order Rate', x: .488, y: .525, width: .08, height: .05, valueKind: 'percentage' },
    { key: 'buyers', label: 'Buyers', x: .598, y: .525, width: .075, height: .05, valueKind: 'count' },
    { key: 'items_sold', label: 'Items Sold', x: .700, y: .525, width: .075, height: .05, valueKind: 'count' },
  ],
  tiktok_shop: [
    { key: 'gmv', label: 'GMV đã ghi nhận', x: .510, y: .187, width: .24, height: .085, valueKind: 'currency' },
    { key: 'items_sold', label: 'Số món bán ra từ sự kiện', x: .508, y: .240, width: .075, height: .045, valueKind: 'count' },
    { key: 'current_viewers', label: 'Người xem hiện tại', x: .647, y: .240, width: .06, height: .045, valueKind: 'count' },
    { key: 'impressions', label: 'Lượt hiển thị', x: .264, y: .329, width: .08, height: .05, valueKind: 'compact' },
    { key: 'total_views', label: 'Lượt xem', x: .398, y: .329, width: .08, height: .05, valueKind: 'compact' },
    { key: 'advertising_cost', label: 'Chi phí quảng cáo', x: .537, y: .329, width: .08, height: .05, valueKind: 'compact' },
    { key: 'click_rate', label: 'Tỷ lệ nhấn', x: .676, y: .329, width: .08, height: .05, valueKind: 'percentage' },
    { key: 'roi_gmv_max', label: 'ROI GMV Max', x: .264, y: .413, width: .08, height: .05, valueKind: 'ratio' },
    { key: 'ctor', label: 'CTOR', x: .398, y: .413, width: .08, height: .05, valueKind: 'percentage' },
    { key: 'average_view_duration_seconds', label: 'Thời lượng xem TB', x: .537, y: .413, width: .08, height: .05, valueKind: 'duration' },
    { key: 'new_followers', label: 'Người theo dõi mới', x: .676, y: .413, width: .07, height: .05, valueKind: 'count' },
    { key: 'buyers', label: 'Khách hàng', x: .264, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'sku_orders', label: 'Đơn hàng SKU đã ghi nhận', x: .398, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'comments', label: 'Bình luận', x: .537, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'product_clicks', label: 'Lượt nhấp vào sản phẩm', x: .676, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'average_order_value', label: 'AOV', x: .264, y: .583, width: .09, height: .05, valueKind: 'compact' },
    { key: 'live_ctr', label: 'CTR của LIVE', x: .398, y: .583, width: .09, height: .05, valueKind: 'percentage' },
    { key: 'shares', label: 'Lượt chia sẻ', x: .537, y: .583, width: .07, height: .05, valueKind: 'count' },
    { key: 'estimated_gmv', label: 'GMV ước tính', x: .676, y: .583, width: .08, height: .05, valueKind: 'compact' },
  ],
}

export const normalizeOcrLabel = (label: string) => label
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[Đđ]/g, 'd')
  .toLowerCase()
  .replace(/[%/]/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

export function mapOcrLabel(platform: ReportDashboardPlatform, label: string): ReportMetricKey | undefined {
  return aliases[platform][normalizeOcrLabel(label)]
}

export function parseOcrValue(raw: string): ReportMetricValue {
  const original = raw.trim()
  if (!original) return null
  const duration = original.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (duration) {
    return Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
  }
  if (/^\d{1,2}:\d{2}(\s*[AP]M)?$/i.test(original) || /^\d{4}-\d{2}-\d{2}/.test(original)) {
    return original
  }

  const suffix = original.match(/([KM])\s*%?$/i)?.[1]?.toUpperCase()
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : 1
  let numeric = original
    .replace(/[₫đ$€£¥₱]/gi, '')
    .replace(/[^\d,.\-]/g, '')
  if (!numeric || numeric === '-') return null

  const comma = numeric.lastIndexOf(',')
  const dot = numeric.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    numeric = numeric
      .replace(decimal === ',' ? /\./g : /,/g, '')
      .replace(decimal, '.')
  } else if (comma >= 0) {
    const decimals = numeric.length - comma - 1
    numeric = decimals === 3 && !original.includes('%') ? numeric.replace(/,/g, '') : numeric.replace(',', '.')
  } else if (dot >= 0) {
    const parts = numeric.split('.')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && !original.includes('%'))) {
      numeric = parts.join('')
    }
  }

  const parsed = Number(numeric)
  return Number.isFinite(parsed) ? parsed * multiplier : original
}

export function buildOcrMetric(
  platform: ReportDashboardPlatform,
  originalLabel: string,
  rawValue: string,
  confidence: OcrMetricValue['confidence'],
): [ReportMetricKey, OcrMetricValue] | null {
  const key = mapOcrLabel(platform, originalLabel)
  if (!key) return null
  const parsedValue = parseOcrValue(rawValue)
  if (
    parsedValue === null ||
    (typeof parsedValue === 'number' && !Number.isFinite(parsedValue))
  ) return null
  return [key, {
    value: parsedValue,
    candidate_value: parsedValue,
    confidence,
    needs_review: true,
    original_label: originalLabel,
    raw_value: rawValue,
    normalized_key: key,
    unit: inferMetricUnit(key, rawValue),
    source: 'trusted_text',
    status: 'review_required',
  }]
}

export function parseDashboardOcrText(
  platform: ReportDashboardPlatform,
  rawOutput: string,
): OcrReviewData {
  const metrics: OcrReviewData['metrics'] = {}
  const unmappedFields: NonNullable<OcrReviewData['unmapped_fields']> = []
  const lines = rawOutput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const separator = splitTrustedTextLine(platform, line)
    const nextLine = lines[index + 1]
    const nextLineCandidate = !separator && mapOcrLabel(platform, line) && nextLine
      ? buildOcrMetric(platform, line, nextLine, 'medium')
      : null
    const candidate = separator
      ? buildOcrMetric(platform, separator.label, separator.value, 'medium')
      : nextLineCandidate

    if (nextLineCandidate) index += 1
    if (!separator && !nextLineCandidate) {
      unmappedFields.push({
        original_label: line,
        original_value: '',
        confidence: 'low',
        source: 'trusted_text',
        rejection_reason: 'The trusted text line has no recognizable label/value pair.',
      })
      continue
    }
    if (!candidate) {
      unmappedFields.push({
        original_label: separator?.label || line,
        original_value: separator?.value || nextLine || '',
        confidence: 'low',
        source: 'trusted_text',
        rejection_reason: `No ${platform} metric label matched this trusted text field.`,
      })
      continue
    }
    metrics[candidate[0]] = candidate[1]
  }

  return {
    status: 'review_required',
    source_platform: platform,
    metrics,
    unmapped_fields: unmappedFields,
    raw_output: rawOutput,
  }
}

export function mapDashboardImageRecognition(
  platform: ReportDashboardPlatform,
  recognition: OcrImageRecognition,
): OcrReviewData {
  const metrics: OcrReviewData['metrics'] = {}
  const unmappedFields: NonNullable<OcrReviewData['unmapped_fields']> = []
  const consumedWords = new Set<OcrRecognizedWord>()
  const lines = groupRecognizedWords(recognition.words)
  const aliasesByLength = Object.entries(aliases[platform])
    .map(([label, key]) => ({ label, key, tokens: label.split(' ') }))
    .sort((left, right) => right.tokens.length - left.tokens.length)

  for (const line of lines.filter(candidate => candidate.pass === 'label')) {
    const searchableWords = line.words.filter(word => normalizeOcrLabel(word.text))
    const normalizedWords = searchableWords.map(word => normalizeOcrLabel(word.text))
    const lineMatches = aliasesByLength
      .map(alias => ({ alias, match: findFuzzyTokenSequence(normalizedWords, alias.tokens) }))
      .filter((candidate): candidate is { alias: typeof aliasesByLength[number]; match: { start: number; similarity: number } } =>
        Boolean(candidate.match && candidate.match.similarity >= 0.82),
      )
      .sort((left, right) =>
        right.match.similarity - left.match.similarity ||
        right.alias.tokens.length - left.alias.tokens.length,
      )
    for (const { alias, match } of lineMatches) {

      const labelWords = searchableWords.slice(match.start, match.start + alias.tokens.length)
      if (labelWords.some(word => consumedWords.has(word))) continue
      const labelConfidence = Math.min(...labelWords.map(word => word.confidence))
      if (labelConfidence < 65) continue
      const pairedValue = findMetricValueWord(lines, line, labelWords, consumedWords)
      if (!pairedValue) continue

      const parsedValue = parseOcrValue(pairedValue.word.text)
      const sanityError = validateMetricCandidate(alias.key, parsedValue, pairedValue.word.text)
      const confidenceNumber = Math.min(
        labelConfidence,
        pairedValue.word.confidence,
        pairedValue.spatialScore * 100,
        match.similarity * 100,
      )
      const confidence = confidenceFromScore(confidenceNumber)
      const accepted = confidence === 'high' && !sanityError
      const candidate: OcrMetricValue = {
        value: sanityError ? null : parsedValue,
        candidate_value: parsedValue,
        confidence,
        needs_review: !accepted,
        original_label: labelWords.map(word => word.text).join(' '),
        raw_value: pairedValue.word.text,
        normalized_key: alias.key,
        unit: inferMetricUnit(alias.key, pairedValue.word.text),
        bounding_box: unionBoundingBoxes([...labelWords, pairedValue.word]),
        source: 'image_ocr',
        status: sanityError ? 'rejected' : accepted ? 'accepted' : 'review_required',
        rejection_reason: sanityError || (accepted ? undefined : 'Image OCR confidence or spatial pairing is below the auto-fill threshold.'),
        label_confidence: labelConfidence,
        value_confidence: pairedValue.word.confidence,
        spatial_score: pairedValue.spatialScore,
        label_source: 'ocr_text',
        value_source_pass: pairedValue.word.pass,
      }
      const existing = metrics[alias.key]
      if (!existing || confidenceNumber > candidateScore(existing)) {
        metrics[alias.key] = candidate
      }
      labelWords.forEach(word => consumedWords.add(word))
      consumedWords.add(pairedValue.word)
    }
  }

  if (platform !== 'other') {
    applyPlatformLayoutCandidates(platform, recognition, metrics, consumedWords)
  }

  applyCardOutputCandidates(platform, recognition.pass_output.card, metrics)
  applyImageTextFallback(platform, recognition.text, metrics)
  applyCrossMetricSanity(metrics)

  for (const line of lines) {
    const remaining = line.words.filter(word => !consumedWords.has(word))
    if (!remaining.length) continue
    const lineText = remaining.map(word => word.text).join(' ').trim()
    if (!lineText || !/\d/.test(lineText)) continue
    const firstNumeric = remaining.findIndex(word => /\d/.test(word.text))
    unmappedFields.push({
      original_label: firstNumeric > 0
        ? remaining.slice(0, firstNumeric).map(word => word.text).join(' ')
        : `Unmapped OCR value (${line.id})`,
      original_value: remaining.slice(Math.max(firstNumeric, 0)).map(word => word.text).join(' '),
      confidence: confidenceFromScore(Math.min(...remaining.map(word => word.confidence))),
      bounding_box: unionBoundingBoxes(remaining),
      source: 'image_ocr',
      rejection_reason: `No spatially valid ${platform} label/value pair matched this cropped KPI text.`,
    })
  }

  return {
    status: recognition.text.trim() ? 'review_required' : 'failed',
    source_platform: platform,
    engine: recognition.engine,
    recognition_language: recognition.language,
    overall_confidence: recognition.confidence,
    crop_box: recognition.crop_box,
    original_dimensions: recognition.original_dimensions,
    processed_dimensions: recognition.processed_dimensions,
    metrics,
    unmapped_fields: unmappedFields,
    raw_output: formatRecognitionOutput(recognition),
    error_message: recognition.text.trim() ? undefined : 'The OCR engine did not find readable text in this image.',
  }
}

function splitTrustedTextLine(
  platform: ReportDashboardPlatform,
  line: string,
): { label: string; value: string } | null {
  const separated = line.match(/^(.+?)\s*(?::|=|\t)\s*(.+)$/)
  if (separated) {
    const label = cleanTrustedTextLabel(separated[1])
    if (mapOcrLabel(platform, label)) return { label, value: separated[2].trim() }
  }

  const numericStart = line.search(/-?\d/)
  if (numericStart <= 0) return null
  const label = cleanTrustedTextLabel(line.slice(0, numericStart).replace(/[\s:=|-]+$/g, ''))
  const value = line.slice(numericStart).trim()
  return mapOcrLabel(platform, label) ? { label, value } : null
}

function cleanTrustedTextLabel(label: string) {
  return label
    .replace(/\(\s*(?:vnd|usd|\$|₫|đ)\s*\)/gi, '')
    .trim()
}

function applyCardOutputCandidates(
  platform: ReportDashboardPlatform,
  cardOutput: Record<string, string[]> | undefined,
  metrics: OcrReviewData['metrics'],
) {
  if (!cardOutput) return
  const allowedKeys = new Set<ReportMetricKey>([
    ...commonReportMetricKeys,
    ...platformMetricKeys[platform],
  ])

  for (const [rawKey, values] of Object.entries(cardOutput)) {
    const key = rawKey as ReportMetricKey
    if (!allowedKeys.has(key)) continue
    const rawValue = values.find(value => {
      const parsedValue = parseOcrValue(value)
      return !validateMetricCandidate(key, parsedValue, value)
    })
    if (rawValue === undefined) continue
    const parsedValue = parseOcrValue(rawValue)
    if (parsedValue === null || (typeof parsedValue === 'number' && !Number.isFinite(parsedValue))) continue
    const existing = metrics[key]
    if (existing && existing.status !== 'rejected' && metricHasUsableValue(existing)) continue
    metrics[key] = {
      value: parsedValue,
      candidate_value: parsedValue,
      confidence: 'medium',
      needs_review: true,
      original_label: platformMetricLayouts[platform as Exclude<ReportDashboardPlatform, 'other'>]
        ?.find(cell => cell.key === key)?.label || rawKey,
      raw_value: rawValue,
      normalized_key: key,
      unit: inferMetricUnit(key, rawValue),
      source: 'image_ocr',
      status: 'review_required',
      label_confidence: 100,
      label_source: 'platform_layout',
      value_source_pass: 'card',
    }
  }
}

function applyImageTextFallback(
  platform: ReportDashboardPlatform,
  rawText: string,
  metrics: OcrReviewData['metrics'],
) {
  const fallback = parseDashboardOcrText(platform, rawText)
  for (const [key, candidate] of Object.entries(fallback.metrics) as Array<[ReportMetricKey, OcrMetricValue]>) {
    if (!metricHasUsableValue(candidate)) continue
    const existing = metrics[key]
    if (existing && existing.status !== 'rejected' && metricHasUsableValue(existing)) continue
    metrics[key] = {
      ...candidate,
      source: 'image_ocr',
      label_source: 'ocr_text',
    }
  }
}

function metricHasUsableValue(metric: OcrMetricValue) {
  const value = metric.value ?? metric.candidate_value
  return value !== null &&
    value !== undefined &&
    (typeof value !== 'number' || Number.isFinite(value))
}

function formatRecognitionOutput(recognition: OcrImageRecognition) {
  const cardOutput = recognition.pass_output.card
    ? Object.entries(recognition.pass_output.card)
      .map(([key, values]) => `${key}: ${values.filter(Boolean).join(' | ') || '—'}`)
      .join('\n')
    : ''
  return [
    '[label pass]',
    recognition.pass_output.label,
    '[numeric pass]',
    recognition.pass_output.numeric,
    cardOutput ? `[card pass]\n${cardOutput}` : '',
  ].filter(Boolean).join('\n\n')
}

function groupRecognizedWords(words: OcrRecognizedWord[]) {
  const grouped = new Map<string, OcrRecognizedWord[]>()
  for (const word of words) {
    const lineWords = grouped.get(word.line_id) || []
    lineWords.push(word)
    grouped.set(word.line_id, lineWords)
  }
  return [...grouped.entries()]
    .map(([id, lineWords]) => ({
      id,
      pass: lineWords[0].pass,
      words: lineWords.sort((left, right) => left.bounding_box.x - right.bounding_box.x),
      top: Math.min(...lineWords.map(word => word.bounding_box.y)),
    }))
    .sort((left, right) => left.top - right.top)
}

function applyPlatformLayoutCandidates(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  recognition: OcrImageRecognition,
  metrics: OcrReviewData['metrics'],
  consumedWords: Set<OcrRecognizedWord>,
) {
  const dimensions = recognition.original_dimensions
  if (!dimensions.width || !dimensions.height) return

  for (const cell of platformMetricLayouts[platform]) {
    const wordsInCell = recognition.words.filter(word => {
      if (!/\d/.test(word.text)) return false
      const centerX = (word.bounding_box.x + word.bounding_box.width / 2) / dimensions.width
      const centerY = (word.bounding_box.y + word.bounding_box.height / 2) / dimensions.height
      return Math.abs(centerX - cell.x) <= cell.width / 2 &&
        Math.abs(centerY - cell.y) <= cell.height / 2
    })
    if (!wordsInCell.length) continue

    const grouped = new Map<string, OcrRecognizedWord[]>()
    wordsInCell.forEach(word => {
      const current = grouped.get(word.line_id) || []
      current.push(word)
      grouped.set(word.line_id, current)
    })
    const wordSets = [
      ...[...grouped.values()].map(words => words.sort((left, right) => left.bounding_box.x - right.bounding_box.x)),
      ...wordsInCell.map(word => [word]),
    ]
    const seen = new Set<string>()
    const candidates = wordSets.flatMap(words => {
      const rawValue = words.map(word => word.text).join(' ').trim()
      const signature = `${words[0].pass}:${rawValue}:${words[0].bounding_box.x}:${words[0].bounding_box.y}`
      if (seen.has(signature)) return []
      seen.add(signature)
      const parsedValue = parseOcrValue(rawValue)
      const sanityError = validateMetricCandidate(cell.key, parsedValue, rawValue)
      const shapeScore = layoutValueShapeScore(cell.valueKind, rawValue, parsedValue)
      if (sanityError || shapeScore <= 0) return []
      const box = unionBoundingBoxes(words)
      const centerX = (box.x + box.width / 2) / dimensions.width
      const centerY = (box.y + box.height / 2) / dimensions.height
      const relativeDistance = Math.hypot(
        (centerX - cell.x) / Math.max(cell.width / 2, .001),
        (centerY - cell.y) / Math.max(cell.height / 2, .001),
      )
      const rawSpatialScore = 1 - Math.min(1, relativeDistance) * .35
      const spatialScore = words[0].pass === 'card' ? Math.min(.95, rawSpatialScore) : rawSpatialScore
      const valueConfidence = Math.min(...words.map(word => word.confidence))
      const passBonus = layoutPassBonus(cell.valueKind, words[0].pass)
      const selectionScore = shapeScore * .45 + (valueConfidence / 100) * .2 + spatialScore * .3 + passBonus
      return [{
        words,
        rawValue,
        parsedValue,
        spatialScore,
        valueConfidence,
        selectionScore,
        pass: words[0].pass,
      }]
    }).sort((left, right) => right.selectionScore - left.selectionScore)

    const selected = candidates[0]
    if (!selected) continue
    const confidenceNumber = Math.min(selected.valueConfidence, selected.spatialScore * 100)
    const confidence = confidenceFromScore(confidenceNumber)
    const sanityError = validateMetricCandidate(cell.key, selected.parsedValue, selected.rawValue)
    const accepted = confidence === 'high' && !sanityError
    const layoutCandidate: OcrMetricValue = {
      value: sanityError ? null : selected.parsedValue,
      candidate_value: selected.parsedValue,
      confidence,
      needs_review: !accepted,
      original_label: cell.label,
      raw_value: selected.rawValue,
      normalized_key: cell.key,
      unit: inferMetricUnit(cell.key, selected.rawValue),
      bounding_box: unionBoundingBoxes(selected.words),
      source: 'image_ocr',
      status: sanityError ? 'rejected' : accepted ? 'accepted' : 'review_required',
      rejection_reason: sanityError || (accepted ? undefined : 'The platform card was located, but OCR value confidence is below the auto-fill threshold.'),
      label_confidence: 100,
      value_confidence: selected.valueConfidence,
      spatial_score: selected.spatialScore,
      label_source: 'platform_layout',
      value_source_pass: selected.pass,
    }
    const existing = metrics[cell.key]
    if (!existing || candidateScore(layoutCandidate) >= candidateScore(existing)) {
      metrics[cell.key] = layoutCandidate
    }
    wordsInCell.forEach(word => consumedWords.add(word))
  }
}

function layoutPassBonus(
  kind: LayoutValueKind,
  pass: OcrRecognizedWord['pass'],
) {
  if (kind === 'count') return pass === 'label' ? .02 : .03
  if (kind === 'percentage') return pass === 'label' ? .04 : pass === 'card' ? .03 : .02
  return pass === 'card' ? .05 : pass === 'numeric' ? .03 : .02
}

function layoutValueShapeScore(
  kind: LayoutValueKind,
  rawValue: string,
  parsedValue: ReportMetricValue,
) {
  if (typeof parsedValue !== 'number' || !Number.isFinite(parsedValue)) return 0
  const compact = /[KM]\s*$/i.test(rawValue)
  const decimal = /\d[.,]\d/.test(rawValue)
  const percent = rawValue.includes('%')
  switch (kind) {
    case 'percentage':
      return decimal && percent ? 1 : decimal ? .95 : percent ? .75 : .45
    case 'duration':
      return rawValue.includes(':') ? 1 : /[smh]\s*$/i.test(rawValue) ? .9 : .55
    case 'compact':
      return compact && decimal ? 1 : compact ? .6 : decimal ? .35 : .25
    case 'currency':
      return /[.,].*[.,]/.test(rawValue) ? 1 : /[.,]/.test(rawValue) ? .9 : .6
    case 'ratio':
      return decimal ? .95 : .45
    case 'count':
      return Number.isInteger(parsedValue) ? .95 : .5
  }
}

function findFuzzyTokenSequence(words: string[], tokens: string[]) {
  let best: { start: number; similarity: number } | null = null
  for (let start = 0; start <= words.length - tokens.length; start += 1) {
    const candidate = words.slice(start, start + tokens.length).join(' ')
    const expected = tokens.join(' ')
    const similarity = stringSimilarity(candidate, expected)
    if (!best || similarity > best.similarity) best = { start, similarity }
  }
  return best
}

function findMetricValueWord(
  lines: ReturnType<typeof groupRecognizedWords>,
  labelLine: ReturnType<typeof groupRecognizedWords>[number],
  labelWords: OcrRecognizedWord[],
  consumedWords: Set<OcrRecognizedWord>,
) {
  const labelBox = unionBoundingBoxes(labelWords)
  const labelCenterX = labelBox.x + labelBox.width / 2
  const labelRight = labelBox.x + labelBox.width
  const labelCenterY = labelBox.y + labelBox.height / 2
  const labelBottom = labelBox.y + labelBox.height
  return lines
    .flatMap(line => line.words)
    .filter(word => /\d/.test(word.text) && !consumedWords.has(word))
    .map(word => {
      const centerX = word.bounding_box.x + word.bounding_box.width / 2
      const centerY = word.bounding_box.y + word.bounding_box.height / 2
      const verticalGap = word.bounding_box.y - labelBottom
      const horizontalGap = Math.abs(centerX - labelCenterX)
      const rightGap = word.bounding_box.x - labelRight
      const sameLine = Math.abs(centerY - labelCenterY) <= Math.max(labelBox.height, word.bounding_box.height)
      const spatialScore = sameLine && rightGap >= -5 && rightGap <= 160
        ? rightGap <= 40
          ? 1
          : 1 - Math.min(0.5, (rightGap - 40) / 240)
        : verticalGap >= -5 && verticalGap <= 90 && horizontalGap <= Math.max(55, labelBox.width * 0.55)
          ? 1 - Math.min(1, (verticalGap / 90) * 0.55 + (horizontalGap / Math.max(55, labelBox.width * 0.55)) * 0.45)
          : 0
      return { word, spatialScore }
    })
    .filter(candidate => candidate.spatialScore >= 0.65)
    .sort((left, right) =>
      (right.spatialScore + (right.word.pass === 'numeric' ? 0.05 : 0)) -
      (left.spatialScore + (left.word.pass === 'numeric' ? 0.05 : 0)),
    )[0]
}

function unionBoundingBoxes(words: OcrRecognizedWord[]) {
  const x = Math.min(...words.map(word => word.bounding_box.x))
  const y = Math.min(...words.map(word => word.bounding_box.y))
  const right = Math.max(...words.map(word => word.bounding_box.x + word.bounding_box.width))
  const bottom = Math.max(...words.map(word => word.bounding_box.y + word.bounding_box.height))
  return { x, y, width: right - x, height: bottom - y }
}

function confidenceFromScore(score: number): OcrMetricValue['confidence'] {
  if (score >= 85) return 'high'
  if (score >= 65) return 'medium'
  return 'low'
}

function candidateScore(candidate: OcrMetricValue) {
  return Math.min(
    candidate.label_confidence ?? 0,
    candidate.value_confidence ?? 0,
    (candidate.spatial_score ?? 0) * 100,
  )
}

function stringSimilarity(left: string, right: string) {
  if (left === right) return 1
  const rows = Array.from({ length: left.length + 1 }, (_, row) => [row])
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
  }
  return 1 - rows[left.length][right.length] / Math.max(left.length, right.length, 1)
}

function validateMetricCandidate(
  key: ReportMetricKey,
  value: ReportMetricValue,
  rawValue: string,
): string | null {
  if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return 'The OCR value could not be parsed.'
  if (key === 'started_at' || key === 'ended_at') return typeof value === 'string' ? null : 'The timestamp format is invalid.'
  if (typeof value !== 'number' || value < 0) return 'The metric must be a non-negative number.'

  const percentageMetrics = new Set<ReportMetricKey>([
    'ctr', 'conversion_rate', 'click_rate', 'live_ctr', 'ctor', 'comment_rate', 'click_to_order_rate',
  ])
  const durationMetrics = new Set<ReportMetricKey>(['average_view_duration_seconds', 'live_duration_seconds'])
  const countMetrics = new Set<ReportMetricKey>([
    'orders', 'buyers', 'items_sold', 'total_views', 'engaged_viewers', 'peak_concurrent_viewers',
    'product_clicks', 'likes', 'comments', 'shares', 'new_followers', 'current_viewers',
    'impressions', 'sku_orders', 'add_to_cart', 'pcu', 'total_viewers',
  ])

  if (percentageMetrics.has(key) && value > 100) return 'Percentage metrics must be between 0 and 100.'
  if (durationMetrics.has(key) && value > 86_400) return 'Duration metrics must be between 0 and 86,400 seconds.'
  if (countMetrics.has(key) && !Number.isInteger(value)) return 'Count metrics must be whole numbers.'
  if (countMetrics.has(key) && /₫|đ|vnd|\$/i.test(rawValue)) return 'A currency token cannot be mapped into a count metric.'
  return null
}

function applyCrossMetricSanity(metrics: OcrReviewData['metrics']) {
  const relationships: Array<[ReportMetricKey, ReportMetricKey, string]> = [
    ['pcu', 'total_viewers', 'PCU cannot exceed Total Viewers.'],
    ['engaged_viewers', 'total_viewers', 'Engaged Viewer cannot exceed Total Viewers.'],
    ['buyers', 'total_viewers', 'Buyers cannot exceed Total Viewers.'],
    ['comments', 'total_views', 'Comments cannot exceed Total Views.'],
    ['shares', 'total_views', 'Shares cannot exceed Total Views.'],
  ]
  for (const [smallerKey, largerKey, message] of relationships) {
    const smaller = metrics[smallerKey]
    const larger = metrics[largerKey]
    if (!smaller || !larger) continue
    const smallerValue = smaller.candidate_value
    const largerValue = larger.candidate_value
    if (typeof smallerValue !== 'number' || typeof largerValue !== 'number' || smallerValue <= largerValue) continue
    metrics[smallerKey] = {
      ...smaller,
      value: null,
      needs_review: true,
      status: 'rejected',
      rejection_reason: message,
    }
  }
}

function inferMetricUnit(key: ReportMetricKey, rawValue: string): string {
  if (rawValue.includes('%')) return 'percent'
  if (/₫|đ|vnd/i.test(rawValue) || [
    'revenue', 'gmv', 'sales', 'gpm', 'average_basket_size',
    'average_order_value', 'gmv_per_hour', 'advertising_cost', 'estimated_gmv',
  ].includes(key)) return 'VND'
  if (key.includes('duration')) return 'seconds'
  return 'count'
}

export function numericMetric(value: ReportMetricValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
