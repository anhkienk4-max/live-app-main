import type {
  OcrImageRecognition,
  OcrMetricValue,
  OcrRecognizedWord,
  OcrReviewData,
  ReportDashboardPlatform,
  ReportMetricKey,
  ReportMetricValue,
} from '@/lib/types/database.types'
import {
  isCanonicalMetricKey,
  selectBestMetricCandidates,
  shopeeMainMetricKeys,
  shopeeSupplementaryMetricKeys,
  tiktokCentralMetricKeys,
  type CanonicalMetricKey,
  type MetricCandidateInput,
  type MetricCandidateSelection,
} from '@/lib/utils/ocrCanonical'
import {
  normalizeMetricCellToRoi,
  roiCellBoundingBox,
} from '@/lib/utils/ocrRegionGeometry'
import {
  buildOcrLabelWindows,
  groupOcrWordLines,
  type OcrWordLine,
} from '@/lib/utils/ocrLabelGeometry'

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

// Keys are normalized by normalizeOcrLabel before lookup. Keep every Shopee
// label in this single strict map so similar KPI names cannot share a value.
export const shopeeLabelToMetric: Readonly<Record<string, ReportMetricKey>> = {
  sales: 'sales',
  sale: 'sales',
  revenue: 'sales',
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
  'average viewing duration': 'average_view_duration_seconds',
  'viewing duration': 'average_view_duration_seconds',
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
}

export const shopeeTemplateMetricOrder: readonly ReportMetricKey[] = shopeeMainMetricKeys

export const shopeeDashboardMetricOrder: readonly ReportMetricKey[] = [
  ...shopeeMainMetricKeys,
  ...shopeeSupplementaryMetricKeys,
]

const shopeeTemplateLabels: Readonly<Partial<Record<ReportMetricKey, string>>> = {
  sales: 'Sales',
  engaged_viewers: 'Engaged Viewer',
  comments: 'Comments',
  add_to_cart: 'ATC',
  total_views: 'Total Views',
  average_view_duration_seconds: 'Avg. Viewing Duration',
  comment_rate: 'Comments Rate',
  gpm: 'GPM',
  orders: 'Orders',
  average_basket_size: 'ABS',
  total_viewers: 'Total Viewers',
  pcu: 'PCU',
  ctr: 'CTR',
  click_to_order_rate: 'Click to Order Rate',
  buyers: 'Buyers',
  items_sold: 'Items Sold',
}

const shopeeCorrectedLabels: Readonly<Partial<Record<ReportMetricKey, string>>> = {
  ...shopeeTemplateLabels,
  sales: 'Sales (đ)',
  gpm: 'GPM (đ)',
  average_basket_size: 'ABS (đ)',
  click_to_order_rate: 'Click to Order Rate (CO)',
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
  shopee_live: shopeeLabelToMetric,
  other: {},
}

export type PlatformOcrValueType =
  | 'integer_count'
  | 'currency'
  | 'decimal_number'
  | 'percentage'
  | 'duration'
  | 'rate'
  | 'text'

export type PlatformOcrSection = {
  id: string
  metricOrder: readonly ReportMetricKey[]
  anchors: readonly ReportMetricKey[]
}

export type PlatformOcrContextualMistake = {
  normalizedText: string
  metric: ReportMetricKey
  section: string
  previous?: ReportMetricKey
  next?: ReportMetricKey
}

export type PlatformOcrConfig = {
  platform: Exclude<ReportDashboardPlatform, 'other'>
  aliases: Readonly<Record<string, ReportMetricKey>>
  metricOrder: readonly ReportMetricKey[]
  valueTypes: Readonly<Partial<Record<ReportMetricKey, PlatformOcrValueType>>>
  sections: readonly PlatformOcrSection[]
  sequenceOrders?: ReadonlyArray<{ id: string; metricOrder: readonly ReportMetricKey[] }>
  optionalMetrics: readonly ReportMetricKey[]
  commonMistakes: readonly PlatformOcrContextualMistake[]
  finalReportFields: readonly ReportMetricKey[]
  liveUpdateFields: readonly ReportMetricKey[]
}

const shopeeMetricValueTypes: PlatformOcrConfig['valueTypes'] = {
  sales: 'currency',
  revenue: 'currency',
  engaged_viewers: 'integer_count',
  comments: 'integer_count',
  add_to_cart: 'integer_count',
  total_views: 'integer_count',
  average_view_duration_seconds: 'duration',
  comment_rate: 'percentage',
  gpm: 'currency',
  orders: 'integer_count',
  average_basket_size: 'currency',
  total_viewers: 'integer_count',
  pcu: 'integer_count',
  ctr: 'percentage',
  click_to_order_rate: 'percentage',
  buyers: 'integer_count',
  items_sold: 'integer_count',
  likes: 'integer_count',
  shares: 'integer_count',
}

const tiktokMetricOrder: readonly ReportMetricKey[] = tiktokCentralMetricKeys

const tiktokMetricValueTypes: PlatformOcrConfig['valueTypes'] = {
  gmv: 'currency',
  items_sold: 'integer_count',
  current_viewers: 'integer_count',
  impressions: 'integer_count',
  total_views: 'integer_count',
  advertising_cost: 'currency',
  click_rate: 'percentage',
  roi_gmv_max: 'rate',
  ctor: 'percentage',
  average_view_duration_seconds: 'duration',
  new_followers: 'integer_count',
  buyers: 'integer_count',
  sku_orders: 'integer_count',
  comments: 'integer_count',
  product_clicks: 'integer_count',
  average_order_value: 'currency',
  live_ctr: 'percentage',
  shares: 'integer_count',
  estimated_gmv: 'currency',
  likes: 'integer_count',
}

export const platformOcrConfigs: Readonly<Record<Exclude<ReportDashboardPlatform, 'other'>, PlatformOcrConfig>> = {
  shopee_live: {
    platform: 'shopee_live',
    aliases: shopeeLabelToMetric,
    metricOrder: shopeeDashboardMetricOrder,
    valueTypes: shopeeMetricValueTypes,
    sections: [
      {
        id: 'headline',
        metricOrder: ['sales', 'engaged_viewers', 'comments', 'add_to_cart'],
        anchors: ['sales', 'engaged_viewers'],
      },
      {
        id: 'performance',
        metricOrder: [
          'total_views',
          'average_view_duration_seconds',
          'comment_rate',
          'gpm',
          'orders',
          'average_basket_size',
        ],
        anchors: ['total_views', 'average_view_duration_seconds', 'gpm'],
      },
      {
        id: 'conversion',
        metricOrder: ['total_viewers', 'pcu', 'ctr', 'click_to_order_rate', 'buyers', 'items_sold'],
        anchors: ['total_viewers', 'pcu', 'click_to_order_rate'],
      },
      {
        id: 'social_live',
        metricOrder: ['likes', 'shares', 'live_duration_seconds'],
        anchors: ['likes', 'shares', 'live_duration_seconds'],
      },
    ],
    sequenceOrders: [{ id: 'core_dashboard', metricOrder: shopeeTemplateMetricOrder }],
    optionalMetrics: ['revenue'],
    commonMistakes: [
      {
        normalizedText: 'l2',
        metric: 'orders',
        section: 'performance',
        previous: 'gpm',
        next: 'average_basket_size',
      },
    ],
    finalReportFields: shopeeDashboardMetricOrder,
    liveUpdateFields: shopeeDashboardMetricOrder,
  },
  tiktok_shop: {
    platform: 'tiktok_shop',
    aliases: aliases.tiktok_shop,
    metricOrder: tiktokMetricOrder,
    valueTypes: tiktokMetricValueTypes,
    sections: [
      {
        id: 'headline',
        metricOrder: ['gmv', 'items_sold', 'current_viewers'],
        anchors: ['gmv', 'items_sold'],
      },
      {
        id: 'traffic',
        metricOrder: ['impressions', 'total_views', 'advertising_cost', 'click_rate'],
        anchors: ['impressions', 'total_views', 'click_rate'],
      },
      {
        id: 'efficiency',
        metricOrder: ['roi_gmv_max', 'ctor', 'average_view_duration_seconds', 'new_followers'],
        anchors: ['roi_gmv_max', 'average_view_duration_seconds'],
      },
      {
        id: 'conversion',
        metricOrder: ['buyers', 'sku_orders', 'comments', 'product_clicks'],
        anchors: ['buyers', 'sku_orders', 'product_clicks'],
      },
      {
        id: 'value',
        metricOrder: ['average_order_value', 'live_ctr', 'shares', 'estimated_gmv'],
        anchors: ['average_order_value', 'live_ctr', 'estimated_gmv'],
      },
    ],
    optionalMetrics: ['likes', 'gmv_per_hour', 'gpm'],
    commonMistakes: [],
    finalReportFields: tiktokMetricOrder,
    liveUpdateFields: tiktokMetricOrder,
  },
}

export type LayoutValueKind =
  | 'count'
  | 'count_or_compact'
  | 'currency'
  | 'compact'
  | 'duration'
  | 'percentage'
  | 'ratio'
export type LayoutMetricCell = {
  key: ReportMetricKey
  label: string
  x: number
  y: number
  width: number
  height: number
  valueKind: LayoutValueKind
  displayFormat?: {
    compactSuffix?: 'K' | 'M'
    decimalPlaces?: number
  }
}

// Normalized against the original screenshot dimensions. These regions describe
// the value area of each fixed KPI card, not an OCR reading order.
export const platformMetricLayouts: Record<Exclude<ReportDashboardPlatform, 'other'>, LayoutMetricCell[]> = {
  shopee_live: [
    { key: 'sales', label: 'Sales', x: .437, y: .284, width: .24, height: .075, valueKind: 'currency', displayFormat: { decimalPlaces: 2 } },
    { key: 'engaged_viewers', label: 'Engaged Viewer', x: .225, y: .374, width: .10, height: .05, valueKind: 'count' },
    { key: 'comments', label: 'Comments', x: .437, y: .374, width: .08, height: .05, valueKind: 'count' },
    { key: 'add_to_cart', label: 'ATC', x: .648, y: .374, width: .08, height: .05, valueKind: 'count' },
    { key: 'total_views', label: 'Total Views', x: .175, y: .465, width: .09, height: .05, valueKind: 'count' },
    { key: 'average_view_duration_seconds', label: 'Avg. Viewing Duration', x: .277, y: .465, width: .10, height: .05, valueKind: 'duration' },
    { key: 'comment_rate', label: 'Comments Rate', x: .386, y: .465, width: .08, height: .05, valueKind: 'percentage', displayFormat: { decimalPlaces: 1 } },
    { key: 'gpm', label: 'GPM', x: .488, y: .465, width: .12, height: .05, valueKind: 'currency', displayFormat: { decimalPlaces: 2 } },
    { key: 'orders', label: 'Orders', x: .598, y: .465, width: .075, height: .05, valueKind: 'count' },
    { key: 'average_basket_size', label: 'ABS', x: .700, y: .465, width: .12, height: .05, valueKind: 'currency', displayFormat: { decimalPlaces: 2 } },
    { key: 'total_viewers', label: 'Total Viewers', x: .175, y: .525, width: .09, height: .05, valueKind: 'count' },
    { key: 'pcu', label: 'PCU', x: .277, y: .525, width: .075, height: .05, valueKind: 'count' },
    { key: 'ctr', label: 'CTR', x: .386, y: .525, width: .08, height: .05, valueKind: 'percentage', displayFormat: { decimalPlaces: 1 } },
    { key: 'click_to_order_rate', label: 'Click to Order Rate', x: .488, y: .525, width: .08, height: .05, valueKind: 'percentage', displayFormat: { decimalPlaces: 1 } },
    { key: 'buyers', label: 'Buyers', x: .598, y: .525, width: .075, height: .05, valueKind: 'count' },
    { key: 'items_sold', label: 'Items Sold', x: .700, y: .525, width: .075, height: .05, valueKind: 'count' },
    { key: 'likes', label: 'Likes', x: .806, y: .745, width: .065, height: .06, valueKind: 'count' },
    { key: 'shares', label: 'Shares', x: .872, y: .745, width: .065, height: .06, valueKind: 'count' },
    { key: 'live_duration_seconds', label: 'Duration', x: .905, y: .846, width: .11, height: .05, valueKind: 'duration' },
  ],
  tiktok_shop: [
    { key: 'gmv', label: 'GMV đã ghi nhận', x: .510, y: .187, width: .24, height: .085, valueKind: 'currency' },
    { key: 'items_sold', label: 'Số món bán ra từ sự kiện', x: .508, y: .240, width: .075, height: .045, valueKind: 'count' },
    { key: 'current_viewers', label: 'Người xem hiện tại', x: .647, y: .240, width: .06, height: .045, valueKind: 'count_or_compact' },
    { key: 'impressions', label: 'Lượt hiển thị', x: .264, y: .329, width: .08, height: .05, valueKind: 'compact', displayFormat: { compactSuffix: 'K', decimalPlaces: 2 } },
    { key: 'total_views', label: 'Lượt xem', x: .398, y: .329, width: .08, height: .05, valueKind: 'compact', displayFormat: { compactSuffix: 'K', decimalPlaces: 2 } },
    { key: 'advertising_cost', label: 'Chi phí quảng cáo', x: .537, y: .329, width: .08, height: .05, valueKind: 'compact', displayFormat: { compactSuffix: 'M', decimalPlaces: 2 } },
    { key: 'click_rate', label: 'Tỷ lệ nhấn', x: .676, y: .329, width: .08, height: .05, valueKind: 'percentage', displayFormat: { decimalPlaces: 2 } },
    { key: 'roi_gmv_max', label: 'ROI GMV Max', x: .264, y: .413, width: .08, height: .05, valueKind: 'ratio', displayFormat: { decimalPlaces: 2 } },
    { key: 'ctor', label: 'CTOR', x: .398, y: .413, width: .08, height: .05, valueKind: 'percentage', displayFormat: { decimalPlaces: 2 } },
    { key: 'average_view_duration_seconds', label: 'Thời lượng xem TB', x: .537, y: .413, width: .08, height: .05, valueKind: 'duration' },
    { key: 'new_followers', label: 'Người theo dõi mới', x: .676, y: .413, width: .07, height: .05, valueKind: 'count' },
    { key: 'buyers', label: 'Khách hàng', x: .264, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'sku_orders', label: 'Đơn hàng SKU đã ghi nhận', x: .398, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'comments', label: 'Bình luận', x: .537, y: .497, width: .07, height: .05, valueKind: 'count' },
    { key: 'product_clicks', label: 'Lượt nhấp vào sản phẩm', x: .676, y: .497, width: .07, height: .05, valueKind: 'count_or_compact', displayFormat: { compactSuffix: 'K', decimalPlaces: 2 } },
    { key: 'average_order_value', label: 'AOV', x: .264, y: .583, width: .09, height: .05, valueKind: 'compact', displayFormat: { compactSuffix: 'K', decimalPlaces: 2 } },
    { key: 'live_ctr', label: 'CTR của LIVE', x: .398, y: .583, width: .09, height: .05, valueKind: 'percentage' },
    { key: 'shares', label: 'Lượt chia sẻ', x: .537, y: .583, width: .07, height: .05, valueKind: 'count' },
    { key: 'estimated_gmv', label: 'GMV ước tính', x: .676, y: .583, width: .08, height: .05, valueKind: 'compact', displayFormat: { compactSuffix: 'M', decimalPlaces: 2 } },
  ],
}

export const normalizeOcrLabel = (label: string) => label
  .normalize('NFKC')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[Đđ]/g, 'd')
  .toLowerCase()
  .replace(/[%/]/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

export function mapOcrLabel(
  platform: ReportDashboardPlatform,
  label: string,
  expectedKeys?: Iterable<ReportMetricKey>,
): ReportMetricKey | undefined {
  const platformAliases = aliases[platform]
  const normalized = normalizeOcrLabel(cleanTrustedTextLabel(label))
  if (!normalized) return undefined
  const expected = expectedKeys ? new Set(expectedKeys) : null
  const candidates = [
    normalized,
    normalized.replace(/^(?:i|l|1)\s+/, ''),
    normalized.replace(/\s+(?:d|vnd|usd)$/, ''),
  ]

  for (const candidate of candidates) {
    const exact = platformAliases[candidate]
    if (exact && (!expected || expected.has(exact))) return exact
  }

  const allowedAliases = Object.entries(platformAliases)
    .filter((entry): entry is [string, ReportMetricKey] => !expected || expected.has(entry[1]))
  const prefixSuffixMatches = allowedAliases.filter(([alias]) => {
    if (alias.length < 4) return false
    return candidates.some(candidate =>
      candidate.startsWith(`${alias} `)
      || candidate.endsWith(` ${alias}`),
    )
  })
  const uniquePrefixSuffix = uniqueMetricKey(prefixSuffixMatches)
  if (uniquePrefixSuffix) return uniquePrefixSuffix

  const candidateTokens = new Set(normalized.split(' ').filter(Boolean))
  const tokenMatches = allowedAliases.filter(([alias]) => {
    const aliasTokens = alias.split(' ').filter(Boolean)
    if (aliasTokens.length < 2 || candidateTokens.size > aliasTokens.length + 2) return false
    const overlap = aliasTokens.filter(token => candidateTokens.has(token)).length
    return overlap / aliasTokens.length >= .8
  })
  const uniqueTokenMatch = uniqueMetricKey(tokenMatches)
  if (uniqueTokenMatch) return uniqueTokenMatch

  if (!expected) return undefined
  const fuzzyMatches = allowedAliases
    .filter(([alias]) => alias.length >= 4 && normalized.length >= 4)
    .map(([alias, key]) => ({ key, score: stringSimilarity(normalized, alias) }))
    .sort((left, right) => right.score - left.score)
  const best = fuzzyMatches[0]
  const competing = fuzzyMatches.find(candidate => candidate.key !== best?.key)
  return best
    && best.score >= .86
    && (!competing || best.score - competing.score >= .06)
    ? best.key
    : undefined
}

function uniqueMetricKey(matches: Array<[string, ReportMetricKey]>) {
  const keys = [...new Set(matches.map(([, key]) => key))]
  return keys.length === 1 ? keys[0] : undefined
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

  const compact = parseCompactOcrNumber(original)
  if (compact) return compact.value

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
  return Number.isFinite(parsed) ? parsed : original
}

export interface CompactOcrNumber {
  value: number
  normalized: string
  suffix: 'K' | 'M'
  decimalSeparator?: '.' | ','
  separatorInferred: boolean
  ambiguous: boolean
}

/**
 * Parses compact dashboard numbers without assuming a locale. A K/M suffix
 * makes a single dot or comma a decimal separator; repeated or malformed
 * punctuation is retained as review-required ambiguity instead of silently
 * dropping digits.
 */
export function parseCompactOcrNumber(raw: string): CompactOcrNumber | null {
  const compact = raw.trim().replace(/\s+/g, '').match(/^(-?\d[\d.,]*)([KM])$/i)
  if (!compact) return null
  const suffix = compact[2].toUpperCase() as 'K' | 'M'
  const multiplier = suffix === 'K' ? 1_000 : 1_000_000
  const numeric = compact[1]
  const separators = [...numeric.matchAll(/[.,]/g)]
  const lastSeparator = separators.at(-1)
  const decimalSeparator = lastSeparator?.[0] as '.' | ',' | undefined
  const trailingDigits = lastSeparator
    ? numeric.slice((lastSeparator.index || 0) + 1).replace(/\D/g, '').length
    : 0
  const ambiguous = separators.length > 1
    && (
      new Set(separators.map(separator => separator[0])).size === 1
      || trailingDigits === 0
      || trailingDigits > 3
    )
  const digitsBeforeDecimal = lastSeparator
    ? numeric.slice(0, lastSeparator.index).replace(/[.,]/g, '')
    : numeric
  const digitsAfterDecimal = lastSeparator
    ? numeric.slice((lastSeparator.index || 0) + 1).replace(/[.,]/g, '')
    : ''
  const normalized = lastSeparator && digitsAfterDecimal
    ? `${digitsBeforeDecimal}.${digitsAfterDecimal}`
    : digitsBeforeDecimal
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  const scaledValue = parsed * multiplier
  const integerValue = Math.round(scaledValue)
  return {
    value: Math.abs(scaledValue - integerValue) < Number.EPSILON * Math.max(1, Math.abs(scaledValue)) * 8
      ? integerValue
      : scaledValue,
    normalized: `${normalized}${suffix}`,
    suffix,
    decimalSeparator,
    separatorInferred: Boolean(decimalSeparator),
    ambiguous,
  }
}

function parseMetricOcrValue(
  platform: ReportDashboardPlatform,
  key: ReportMetricKey,
  raw: string,
): ReportMetricValue {
  if (key === 'average_view_duration_seconds' || key === 'live_duration_seconds') {
    const shortDuration = raw.trim().match(/^(\d{1,3}):(\d{2})$/)
    if (shortDuration) return Number(shortDuration[1]) * 60 + Number(shortDuration[2])
    const secondsDuration = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:s|sec|secs|second|seconds)$/i)
    if (secondsDuration) {
      const seconds = Number(secondsDuration[1].replace(',', '.'))
      return Number.isFinite(seconds) ? seconds : null
    }
  }
  const normalizedRaw = isPercentageMetric(key)
    ? raw.trim().replace(/([xX°ºoO])\s*$/, '%')
    : raw
  const declaredLayout = platform === 'other'
    ? undefined
    : platformMetricLayouts[platform].find(cell => cell.key === key)
  return parseOcrValue(normalizeLayoutCardValue(declaredLayout, normalizedRaw))
}

export function buildOcrMetric(
  platform: ReportDashboardPlatform,
  originalLabel: string,
  rawValue: string,
  confidence: OcrMetricValue['confidence'],
  source: NonNullable<OcrMetricValue['source']> = 'trusted_text',
  status: NonNullable<OcrMetricValue['status']> = 'review_required',
  normalizedKey?: ReportMetricKey,
): [ReportMetricKey, OcrMetricValue] | null {
  const key = normalizedKey || mapOcrLabel(platform, originalLabel)
  if (!key) return null
  const parsedValue = parseMetricOcrValue(platform, key, rawValue)
  if (
    parsedValue === null ||
    (typeof parsedValue === 'number' && !Number.isFinite(parsedValue)) ||
    validateMetricCandidate(key, parsedValue, rawValue)
  ) return null
  return [key, {
    value: parsedValue,
    candidate_value: parsedValue,
    normalized_value: parsedValue,
    confidence,
    needs_review: status !== 'confirmed' && status !== 'accepted',
    original_label: originalLabel,
    raw_value: rawValue,
    normalized_key: key,
    unit: inferMetricUnit(key, rawValue),
    source,
    status,
  }]
}

export function parseDashboardOcrText(
  platform: ReportDashboardPlatform,
  rawOutput: string,
  source: NonNullable<OcrMetricValue['source']> = 'trusted_text',
): OcrReviewData {
  const candidateInputs: MetricCandidateInput[] = []
  const unmappedFields: NonNullable<OcrReviewData['unmapped_fields']> = []
  const lines = rawOutput
    .split(/\r?\n/)
    .map(line => normalizeTrustedTextLine(line))
    .filter(Boolean)
  const consumed = new Set<number>()

  // Priority 1: an exact label and value on the same OCR line.
  for (let index = 0; index < lines.length; index += 1) {
    const separated = splitTrustedTextLine(platform, lines[index])
    if (!separated) continue
    consumed.add(index)
    const candidate = buildOcrMetric(
      platform,
      separated.label,
      separated.value,
      'medium',
      source,
      'review_required',
    )
    if (candidate) {
      collectMetricCandidate(candidateInputs, candidate[0], candidate[1])
    } else {
      addUnmappedTextField(unmappedFields, separated.label, separated.value, source)
    }
  }

  const semanticLines = lines.flatMap((line, index): SequentialSemanticLine[] => {
    if (consumed.has(index)) return []
    const key = mapOcrLabelWithContext(platform, lines, index)
    if (key) return [{ index, line, type: 'label', key }]
    const value = parseStandaloneOcrValue(platform, line)
    return value === null ? [] : [{ index, line, type: 'value', value }]
  })

  // Priority 2: an isolated label immediately followed by a compatible value.
  for (let index = 0; index < semanticLines.length - 1; index += 1) {
    const label = semanticLines[index]
    const value = semanticLines[index + 1]
    if (label.type !== 'label' || value.type !== 'value') continue
    const previousIsLabel = semanticLines[index - 1]?.type === 'label'
    const physicallyAdjacent = value.index === label.index + 1
    if (previousIsLabel || !physicallyAdjacent || !isSequentialValueCompatible(platform, label.key, value.line)) continue
    const candidate = buildOcrMetric(
      platform,
      label.line,
      value.line,
      'medium',
      source,
      'review_required',
      label.key,
    )
    if (!candidate) continue
    collectMetricCandidate(candidateInputs, candidate[0], candidate[1])
    consumed.add(label.index)
    consumed.add(value.index)
  }

  // Priority 3: consecutive label blocks followed by sequential value blocks.
  const remainingSemanticLines = semanticLines.filter(line => !consumed.has(line.index))
  for (let index = 0; index < remainingSemanticLines.length;) {
    if (remainingSemanticLines[index].type !== 'label') {
      index += 1
      continue
    }
    const labels: SequentialLabelLine[] = []
    while (remainingSemanticLines[index]?.type === 'label') {
      labels.push(remainingSemanticLines[index] as SequentialLabelLine)
      index += 1
    }
    const values: SequentialValueLine[] = []
    while (remainingSemanticLines[index]?.type === 'value') {
      values.push(remainingSemanticLines[index] as SequentialValueLine)
      index += 1
    }
    if (labels.length < 2 || values.length === 0) continue

    const sequentialPairs = pairSequentialLabelValueBlock(platform, labels, values)
    for (const [label, value] of sequentialPairs) {
      const candidate = buildOcrMetric(
        platform,
        label.line,
        value.line,
        'low',
        'raw_text_sequence',
        'review_required',
        label.key,
      )
      if (!candidate) continue
      collectMetricCandidate(candidateInputs, candidate[0], candidate[1])
      consumed.add(label.index)
      consumed.add(value.index)
    }

    // Priority 4: platform section/card order can recover omitted labels without
    // shifting a value outside the section that owns it.
    for (const { label, value, inferredLabel, sectionId } of pairPlatformTemplateOrder(platform, labels, values)) {
      const candidate = buildOcrMetric(
        platform,
        label.line,
        value.line,
        'low',
        'raw_text_sequence',
        'review_required',
        label.key,
      )
      if (!candidate) continue
      if (inferredLabel) {
        candidate[1].conflict_warning = `${label.line} was inferred from the ${platform} ${sectionId} KPI order because OCR omitted the label.`
      }
      collectMetricCandidate(candidateInputs, candidate[0], candidate[1])
      consumed.add(label.index)
      consumed.add(value.index)
    }
  }

  // Priority 5: some OCR layouts emit a value block before its label block.
  const reverseSemanticLines = semanticLines.filter(line => !consumed.has(line.index))
  for (let index = 0; index < reverseSemanticLines.length;) {
    if (reverseSemanticLines[index].type !== 'value') {
      index += 1
      continue
    }
    const values: SequentialValueLine[] = []
    while (reverseSemanticLines[index]?.type === 'value') {
      values.push(reverseSemanticLines[index] as SequentialValueLine)
      index += 1
    }
    const labels: SequentialLabelLine[] = []
    while (reverseSemanticLines[index]?.type === 'label') {
      labels.push(reverseSemanticLines[index] as SequentialLabelLine)
      index += 1
    }
    if (values.length === 0 || labels.length < 2) continue
    const pairs = [
      ...pairSequentialLabelValueBlock(platform, labels, values),
      ...pairPlatformTemplateOrder(platform, labels, values).map(({ label, value }) => [label, value] as [SequentialLabelLine, SequentialValueLine]),
    ]
    for (const [label, value] of pairs) {
      const candidate = buildOcrMetric(
        platform,
        label.line,
        value.line,
        'low',
        'raw_text_sequence',
        'review_required',
        label.key,
      )
      if (!candidate) continue
      collectMetricCandidate(candidateInputs, candidate[0], candidate[1])
      consumed.add(label.index)
      consumed.add(value.index)
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (consumed.has(index)) continue
    const key = mapOcrLabelWithContext(platform, lines, index)
    const value = parseStandaloneOcrValue(platform, lines[index])
    if (!key && value === null) {
      if (!/^\[(?:label|numeric|card) pass\]$/i.test(lines[index])) {
        addUnmappedTextField(
          unmappedFields,
          lines[index],
          '',
          source,
          'The OCR line is not a recognized metric label or value.',
        )
      }
      continue
    }
    addUnmappedTextField(
      unmappedFields,
      key ? lines[index] : `Unmapped OCR value (line ${index + 1})`,
      key ? '' : lines[index],
      key ? source : 'raw_text_sequence',
      key
        ? 'The OCR label has no unambiguous compatible value.'
        : 'The OCR value has no unambiguous compatible label.',
    )
  }

  const expectedKeys = platform === 'other'
    ? []
    : platformOcrConfigs[platform].metricOrder.filter(isCanonicalMetricKey)
  const selection = platform === 'tiktok_shop'
    ? selectTikTokHybridMetricCandidates(candidateInputs, expectedKeys)
    : selectBestMetricCandidates(candidateInputs, expectedKeys)
  const metrics: OcrReviewData['metrics'] = selection.selectedByKey
  applyCrossMetricSanity(metrics)

  return {
    status: 'review_required',
    source_platform: platform,
    metrics,
    discarded_conflicts: selection.discardedConflicts,
    missing_metric_keys: selection.missingKeys,
    unmapped_fields: filterKnownMetricUnmappedFields(platform, unmappedFields, expectedKeys),
    raw_output: rawOutput,
  }
}

export type PlatformOcrIdentifier = ReportDashboardPlatform | 'shopee' | 'tts'
export type ExistingOcrCandidates = OcrReviewData | OcrReviewData['metrics']

export interface ParsePlatformOcrTextOptions {
  platform: PlatformOcrIdentifier
  rawText: string
  existingCandidates?: ExistingOcrCandidates
}

export interface PlatformOcrParseResult {
  metrics: Partial<Record<ReportMetricKey, ReportMetricValue>>
  candidates: OcrReviewData['metrics']
  appliedKeys: ReportMetricKey[]
  reviewRequiredKeys: ReportMetricKey[]
  unmappedLines: string[]
  warnings: string[]
  review: OcrReviewData
}

export function parsePlatformOcrText({
  platform,
  rawText,
  existingCandidates,
}: ParsePlatformOcrTextOptions): PlatformOcrParseResult {
  const canonicalPlatform = platform === 'shopee'
    ? 'shopee_live'
    : platform === 'tts'
      ? 'tiktok_shop'
      : platform
  const parsedReview = parseDashboardOcrText(canonicalPlatform, rawText, 'raw_text_exact')
  const candidateInputs: MetricCandidateInput[] = []
  const existingReview = existingCandidates && 'metrics' in existingCandidates
    ? existingCandidates
    : undefined
  const existingMetrics = existingCandidates
    ? 'metrics' in existingCandidates
      ? existingCandidates.metrics
      : existingCandidates
    : {}
  for (const [key, candidate] of Object.entries(existingMetrics) as Array<[ReportMetricKey, OcrMetricValue | undefined]>) {
    if (candidate) collectMetricCandidate(candidateInputs, key, { ...candidate })
  }
  for (const [key, candidate] of Object.entries(parsedReview.metrics) as Array<[ReportMetricKey, OcrMetricValue | undefined]>) {
    if (candidate) collectMetricCandidate(candidateInputs, key, { ...candidate })
  }
  const expectedKeys = canonicalPlatform === 'other'
    ? []
    : platformOcrConfigs[canonicalPlatform].metricOrder.filter(isCanonicalMetricKey)
  const selection = platform === 'tiktok_shop'
    ? selectTikTokHybridMetricCandidates(
      candidateInputs,
      expectedKeys,
      tiktokConfidenceContext(existingReview?.region_diagnostics),
    )
    : selectBestMetricCandidates(candidateInputs, expectedKeys)
  const candidates: OcrReviewData['metrics'] = selection.selectedByKey

  const review: OcrReviewData = {
    ...parsedReview,
    status: Object.values(candidates).some(candidate => metricHasUsableValue(candidate!))
      ? 'review_required'
      : parsedReview.status,
    metrics: candidates,
    discarded_conflicts: selection.discardedConflicts,
    missing_metric_keys: selection.missingKeys,
    raw_output: existingReview?.raw_output || parsedReview.raw_output,
    raw_diagnostic_output: existingReview?.raw_diagnostic_output,
    source_platform: existingReview?.source_platform || parsedReview.source_platform,
    engine: existingReview?.engine || parsedReview.engine,
    recognition_language: existingReview?.recognition_language || parsedReview.recognition_language,
    overall_confidence: existingReview?.overall_confidence ?? parsedReview.overall_confidence,
    crop_box: existingReview?.crop_box || parsedReview.crop_box,
    original_dimensions: existingReview?.original_dimensions || parsedReview.original_dimensions,
    processed_dimensions: existingReview?.processed_dimensions || parsedReview.processed_dimensions,
    region_diagnostics: existingReview?.region_diagnostics || parsedReview.region_diagnostics,
    error_message: existingReview?.error_message || parsedReview.error_message,
    unmapped_fields: [
      ...(existingCandidates && 'metrics' in existingCandidates ? existingCandidates.unmapped_fields || [] : []),
      ...(parsedReview.unmapped_fields || []),
    ],
  }
  const allowedKeys = canonicalPlatform === 'other'
    ? new Set<ReportMetricKey>()
    : new Set(platformOcrConfigs[canonicalPlatform].finalReportFields)
  const metrics: Partial<Record<ReportMetricKey, ReportMetricValue>> = {}
  const appliedKeys: ReportMetricKey[] = []
  const reviewRequiredKeys: ReportMetricKey[] = []
  for (const [key, candidate] of Object.entries(candidates) as Array<[ReportMetricKey, OcrMetricValue | undefined]>) {
    if (!candidate || !allowedKeys.has(key) || !metricHasUsableValue(candidate)) continue
    const value = candidate.value ?? candidate.candidate_value
    if (value === null || value === undefined) continue
    metrics[key] = value
    appliedKeys.push(key)
    if (
      candidate.status === 'review_required'
      || candidate.status === 'low_confidence'
      || candidate.needs_review
    ) reviewRequiredKeys.push(key)
  }
  const unmappedLines = (review.unmapped_fields || []).map(field =>
    [field.original_label, field.original_value].filter(Boolean).join(': '),
  )
  const warnings = [...new Set([
    ...Object.values(candidates).flatMap(candidate => candidate?.conflict_warning ? [candidate.conflict_warning] : []),
    ...Object.values(candidates).flatMap(candidate => candidate?.rejection_reason ? [candidate.rejection_reason] : []),
    ...(review.error_message ? [review.error_message] : []),
  ])]
  return {
    metrics,
    candidates,
    appliedKeys,
    reviewRequiredKeys,
    unmappedLines,
    warnings,
    review,
  }
}

export function mapDashboardImageRecognition(
  platform: ReportDashboardPlatform,
  recognition: OcrImageRecognition,
): OcrReviewData {
  if (recognition.region_diagnostics?.selection_required) {
    const expectedKeys = platform === 'other'
      ? []
      : platformOcrConfigs[platform].metricOrder.filter(isCanonicalMetricKey)
    return {
      status: 'review_required',
      source_platform: platform,
      engine: recognition.engine,
      recognition_language: recognition.language,
      overall_confidence: recognition.confidence,
      crop_box: recognition.crop_box,
      original_dimensions: recognition.original_dimensions,
      processed_dimensions: recognition.processed_dimensions,
      region_diagnostics: recognition.region_diagnostics,
      metrics: {},
      missing_metric_keys: expectedKeys,
      raw_output: '',
      raw_diagnostic_output: formatRecognitionOutput(recognition),
      diagnostic_export: buildOcrDiagnosticExport(
        platform,
        recognition,
        [],
        {
          selectedByKey: {},
          discardedConflicts: [],
          missingKeys: expectedKeys,
        },
      ),
      error_message: recognition.region_diagnostics.ambiguous
        ? 'Several dashboard regions are similarly strong. Select one region and retry OCR.'
        : 'A dashboard region could not be selected confidently. Adjust the region and retry OCR.',
    }
  }
  const candidateInputs: MetricCandidateInput[] = []
  const unmappedFields: NonNullable<OcrReviewData['unmapped_fields']> = []
  const consumedWords = new Set<OcrRecognizedWord>()
  const lines = groupRecognizedWords(recognition.words)
  const labelWindows = buildOcrLabelWindows(recognition.words.filter(word =>
    word.pass === 'label'
    && !word.line_id.startsWith('card-label:'),
  ))
  const recognizedLabelOwners = findRecognizedMetricLabels(platform, labelWindows)
  const selectedRegion = recognition.region_diagnostics?.dashboard_candidates.find(candidate =>
    candidate.id === recognition.region_diagnostics?.selected_candidate_id,
  )
  const recognizedWordHeights = recognition.words
    .map(word => word.bounding_box.height)
    .filter(height => Number.isFinite(height) && height > 0)
    .sort((left, right) => left - right)
  const observedTextScale = recognizedWordHeights.length
    ? recognizedWordHeights[Math.floor(recognizedWordHeights.length / 2)] / 16
    : 1
  const spatialScale = Math.max(
    .45,
    Math.min(
      3,
      selectedRegion
        ? selectedRegion.bounding_box.width / 1_000
        : observedTextScale,
    ),
  )

  applyCardOutputCandidates(platform, recognition, candidateInputs, consumedWords)

  for (const owner of recognizedLabelOwners) {
      const alias = { key: owner.key }
      const match = { similarity: owner.similarity }
      const labelWords = owner.words
      if (labelWords.some(word => consumedWords.has(word))) continue
      const labelConfidence = Math.min(...labelWords.map(word => word.confidence))
      if (labelConfidence < 65) continue
      const pairedValue = findMetricValueWord(
        lines,
        owner.window,
        labelWords,
        consumedWords,
        spatialScale,
      )
      if (!pairedValue) continue
      if (
        platform === 'tiktok_shop'
        && valueBelongsToCloserMetricLabel(
          platform,
          owner,
          pairedValue.word,
          recognizedLabelOwners,
          spatialScale,
        )
      ) continue
      const expectedCell = platform === 'other'
        ? undefined
        : platformMetricLayouts[platform].find(cell => cell.key === alias.key)
      const selectedRegionValueBox = expectedCell && selectedRegion && platform === 'shopee_live'
        ? roiCellBoundingBox(
          selectedRegion,
          normalizeMetricCellToRoi(platform, expectedCell),
          'value',
        )
        : undefined
      if (
        expectedCell
        && (
          selectedRegionValueBox
            ? !wordCenterIsInsideBox(pairedValue.word, selectedRegionValueBox, 1.25)
            : selectedRegion
              ? false
              : !wordIsInsideLayoutCell(
                pairedValue.word,
                expectedCell,
                recognition.original_dimensions,
                1.2,
              )
        )
      ) continue

      const layoutCell = platform === 'other'
        ? undefined
        : platformMetricLayouts[platform].find(cell => cell.key === alias.key)
      const normalizedShapeValue = normalizeLayoutCardValue(layoutCell, pairedValue.word.text)
      const parsedValue = layoutCell
        ? parseOcrValue(normalizedShapeValue)
        : parseMetricOcrValue(platform, alias.key, pairedValue.word.text)
      const compactMetadata = parseCompactOcrNumber(normalizedShapeValue)
      const valueShapeScore = layoutCell
        ? layoutValueShapeScore(layoutCell.valueKind, normalizedShapeValue, parsedValue)
        : 1
      const sanityError = valueShapeScore < .75
        ? 'The OCR value shape is incompatible with the declared KPI type.'
        : validateMetricCandidate(alias.key, parsedValue, normalizedShapeValue)
      const confidenceNumber = Math.min(
        labelConfidence,
        pairedValue.word.confidence,
        pairedValue.spatialScore * 100,
        match.similarity * 100,
      )
      const confidence = confidenceFromScore(confidenceNumber)
      const exactLabel = match.similarity >= .95
      const accepted = confidence === 'high'
        && exactLabel
        && pairedValue.competingValues === 0
        && !sanityError
        && !compactMetadata?.ambiguous
      const labelBox = unionBoundingBoxes(labelWords)
      const valueBox = pairedValue.word.bounding_box
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
        label_box: labelBox,
        value_box: valueBox,
        pairing_reason: compactMetadata?.ambiguous
          ? 'Compact-number punctuation is ambiguous and requires review.'
          : accepted
          ? 'Exact label and value occupy the same platform KPI card.'
          : pairedValue.competingValues > 0
            ? 'Multiple nearby values compete for this label.'
            : 'Label and value were paired by bounded spatial proximity.',
        pair_score: confidenceNumber / 100,
        source: match.similarity >= 0.95 && pairedValue.pairing !== 'spatial'
          ? 'word_box_exact'
          : 'spatial_fallback',
        status: sanityError ? 'rejected' : accepted ? 'confirmed' : 'review_required',
        rejection_reason: sanityError
          || (compactMetadata?.ambiguous
            ? 'Compact-number punctuation is ambiguous and must be reviewed.'
            : accepted
              ? undefined
              : 'Image OCR confidence or spatial pairing is below the auto-fill threshold.'),
        label_confidence: labelConfidence,
        value_confidence: pairedValue.word.confidence,
        spatial_score: pairedValue.spatialScore,
        label_source: 'ocr_text',
        value_source_pass: pairedValue.word.pass,
        strategy: 'normalized_roi',
        preprocessing_pass: pairedValue.word.line_id.includes('roi-adaptive')
          ? 'adaptive_roi'
          : 'normalized_roi',
        evidence_source_family: pairedValue.word.evidence_source_family || 'normalized_roi_ocr',
        evidence_group: pairedValue.word.evidence_group || 'normalized_roi:primary',
        supporting_word_boxes: [labelBox, valueBox],
      }
      collectMetricCandidate(candidateInputs, alias.key, candidate)
      labelWords.forEach(word => consumedWords.add(word))
      for (const supportingWord of pairedValue.supportingWords || [pairedValue.word]) {
        consumedWords.add(supportingWord)
      }
  }

  if (
    platform !== 'other'
    && (
      platform === 'shopee_live'
      || !recognition.region_diagnostics?.selected_candidate_id
    )
  ) {
    applyPlatformLayoutCandidates(platform, recognition, candidateInputs, consumedWords)
  }
  // Raw text is intentionally last. Browser/Tesseract reading order is unstable
  // for these dashboards, so text may fill gaps but cannot replace grounded
  // card, word-box, or normalized-grid candidates.
  const normalizedStrategyText = recognition.pass_output.strategy_text?.normalized_roi
    || recognition.text
  const normalizedEvidenceGroup = recognition.words.find(word =>
    word.evidence_source_family === 'normalized_roi_ocr',
  )?.evidence_group || 'normalized_roi:primary'
  applyExactRawTextCandidates(
    platform,
    normalizedStrategyText,
    candidateInputs,
    'normalized_roi',
    normalizedEvidenceGroup,
  )
  if (recognition.text && recognition.text !== normalizedStrategyText) {
    applyExactRawTextCandidates(
      platform,
      recognition.text,
      candidateInputs,
      'normalized_roi',
      normalizedEvidenceGroup,
    )
  }
  if (
    recognition.pass_output.label
    && recognition.pass_output.label !== normalizedStrategyText
    && recognition.pass_output.label !== recognition.text
  ) {
    applyExactRawTextCandidates(
      platform,
      recognition.pass_output.label,
      candidateInputs,
      'normalized_roi',
      normalizedEvidenceGroup,
    )
  }
  const legacyStrategyText = recognition.pass_output.strategy_text?.legacy_relative
  if (legacyStrategyText && legacyStrategyText !== normalizedStrategyText) {
    applyExactRawTextCandidates(
      platform,
      legacyStrategyText,
      candidateInputs,
      'legacy_relative',
      recognition.words.find(word =>
        word.evidence_source_family === 'legacy_full_image_ocr',
      )?.evidence_group || 'legacy_full_image:primary',
    )
  }

  const expectedKeys = platform === 'other'
    ? []
    : platformOcrConfigs[platform].metricOrder.filter(isCanonicalMetricKey)
  const selection = platform === 'tiktok_shop'
    ? selectTikTokHybridMetricCandidates(
      candidateInputs,
      expectedKeys,
      tiktokConfidenceContext(recognition.region_diagnostics),
    )
    : selectBestMetricCandidates(candidateInputs, expectedKeys)
  const metrics: OcrReviewData['metrics'] = selection.selectedByKey
  applyCrossMetricSanity(metrics)
  if (platform !== 'other') {
    for (const [key, metric] of Object.entries(metrics) as Array<[ReportMetricKey, OcrMetricValue | undefined]>) {
      if (!metric) continue
      const normalizedValue = metric.value ?? metric.candidate_value
      metric.raw_ocr_label ??= recognition.pass_output.card_labels?.[key]?.find(Boolean)
        || metric.original_label
        || ''
      metric.corrected_source_label ??= correctedPlatformMetricLabel(platform, key)
      metric.raw_ocr_value ??= metric.raw_value || ''
      metric.normalized_value ??= normalizedValue
      if (normalizedValue !== undefined) {
        metric.corrected_display_value ??= formatCorrectedMetricValue(platform, key, normalizedValue)
      }
    }
  }

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
      source: 'spatial_fallback',
      rejection_reason: `No spatially valid ${platform} label/value pair matched this cropped KPI text.`,
    })
  }

  const allExpectedMetricsConfirmed = expectedKeys.length > 0 && expectedKeys.every(key =>
    metrics[key]?.status === 'confirmed' && metricHasUsableValue(metrics[key]!),
  )
  return {
    status: allExpectedMetricsConfirmed
      ? 'confirmed'
      : recognition.text.trim() || recognition.words.length
        ? 'review_required'
        : 'failed',
    source_platform: platform,
    engine: recognition.engine,
    recognition_language: recognition.language,
    overall_confidence: recognition.confidence,
    crop_box: recognition.crop_box,
    original_dimensions: recognition.original_dimensions,
    processed_dimensions: recognition.processed_dimensions,
    region_diagnostics: recognition.region_diagnostics,
    metrics,
    discarded_conflicts: selection.discardedConflicts,
    missing_metric_keys: selection.missingKeys,
    unmapped_fields: filterKnownMetricUnmappedFields(platform, unmappedFields, expectedKeys),
    raw_output: platform === 'other'
      ? recognition.text.trim()
      : formatCorrectedDashboardOcrText(platform, metrics),
    raw_diagnostic_output: formatRecognitionOutput(recognition),
    diagnostic_export: buildOcrDiagnosticExport(
      platform,
      recognition,
      candidateInputs,
      selection,
    ),
    error_message: recognition.text.trim() ? undefined : 'The OCR engine did not find readable text in this image.',
  }
}

export interface SpatialOcrMetricCandidate {
  canonical_key: ReportMetricKey
  raw_label: string
  raw_value: string
  normalized_value: ReportMetricValue
  label_box?: OcrMetricValue['label_box']
  value_box?: OcrMetricValue['value_box']
  source: NonNullable<OcrMetricValue['source']> | 'missing'
  confidence: OcrMetricValue['confidence']
  status: 'confirmed' | 'review_required' | 'missing'
  pairing_reason: string
  pair_score: number
}

export interface SpatialOcrExtractionResult {
  metrics: OcrReviewData['metrics']
  candidates: SpatialOcrMetricCandidate[]
  unmatchedLabels: string[]
  unmatchedValues: string[]
  diagnostics: {
    sourcePriority: readonly string[]
    confirmed: number
    reviewRequired: number
    missing: number
  }
}

export function extractPlatformMetricsFromSpatialOcr({
  platform,
  imageWidth,
  imageHeight,
  words,
  lines = [],
  cardOutput,
}: {
  platform: Exclude<ReportDashboardPlatform, 'other'>
  imageWidth: number
  imageHeight: number
  words: OcrRecognizedWord[]
  lines?: OcrRecognizedWord[][]
  cardOutput?: Record<string, string[]>
}): SpatialOcrExtractionResult {
  const spatialWords = words.length ? words : lines.flat()
  const review = mapDashboardImageRecognition(platform, {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: '',
    pass_output: {
      label: '',
      numeric: '',
      card: cardOutput,
    },
    confidence: spatialWords.length
      ? spatialWords.reduce((sum, word) => sum + word.confidence, 0) / spatialWords.length
      : 0,
    words: spatialWords,
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: imageWidth, height: imageHeight },
    processed_dimensions: { width: imageWidth, height: imageHeight },
  })
  const expectedKeys = platformOcrConfigs[platform].metricOrder
  const candidates = expectedKeys.map(key => {
    const metric = review.metrics[key]
    if (!metric || !metricHasUsableValue(metric)) {
      return {
        canonical_key: key,
        raw_label: preferredPlatformMetricLabel(platform, key),
        raw_value: '',
        normalized_value: null,
        source: 'missing' as const,
        confidence: 'low' as const,
        status: 'missing' as const,
        pairing_reason: 'No spatially valid value was recognized in the expected KPI region.',
        pair_score: 0,
      }
    }
    return {
      canonical_key: key,
      raw_label: metric.original_label || preferredPlatformMetricLabel(platform, key),
      raw_value: metric.raw_value || '',
      normalized_value: metric.value ?? metric.candidate_value ?? null,
      label_box: metric.label_box,
      value_box: metric.value_box || metric.bounding_box,
      source: metric.source || 'image_ocr',
      confidence: metric.confidence,
      status: metric.status === 'confirmed' || metric.status === 'accepted'
        ? 'confirmed' as const
        : 'review_required' as const,
      pairing_reason: metric.pairing_reason || 'Spatial OCR candidate requires review.',
      pair_score: metric.pair_score ?? candidateScore(metric) / 100,
    }
  })
  return {
    metrics: review.metrics,
    candidates,
    unmatchedLabels: (review.unmapped_fields || [])
      .map(field => field.original_label)
      .filter(Boolean),
    unmatchedValues: (review.unmapped_fields || [])
      .map(field => field.original_value)
      .filter(Boolean),
    diagnostics: {
      sourcePriority: [
        'same_card',
        'label_value_proximity',
        'platform_grid',
        'raw_text_same_line',
        'raw_text_sequence',
      ],
      confirmed: candidates.filter(candidate => candidate.status === 'confirmed').length,
      reviewRequired: candidates.filter(candidate => candidate.status === 'review_required').length,
      missing: candidates.filter(candidate => candidate.status === 'missing').length,
    },
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

function normalizeTrustedTextLine(line: string) {
  const normalized = line
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/^[\s|!¦•·▪►▶◆◇]+/, '')
    .replace(/[‐‑‒–—]+/g, '-')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return ''
  if (/^(?:[-_=~*.]{3,}|[<>]{1,2}|\d+\s*\/\s*\d+)$/u.test(normalized)) return ''
  if (/^(?:next|previous|back|close|page\s+\d+)$/i.test(normalized)) return ''
  if (!/[\p{L}\p{N}]/u.test(normalized)) return ''
  return normalized
}

function mapOcrLabelWithContext(
  platform: ReportDashboardPlatform,
  lines: string[],
  index: number,
) {
  const direct = mapOcrLabel(platform, lines[index])
  if (direct || platform === 'other') return direct
  const config = platformOcrConfigs[platform]
  const normalizedText = normalizeOcrLabel(lines[index])
  const mistakes = config.commonMistakes.filter(mistake => mistake.normalizedText === normalizedText)

  const previous = findNearbyMappedLabel(platform, lines, index, -1)
  const next = findNearbyMappedLabel(platform, lines, index, 1)
  const contextualMistake = mistakes.find(mistake => {
    const section = config.sections.find(candidate => candidate.id === mistake.section)
    return section
      && section.metricOrder.includes(mistake.metric)
      && (!mistake.previous || previous === mistake.previous)
      && (!mistake.next || next === mistake.next)
  })?.metric
  if (contextualMistake) return contextualMistake

  const nearbySection = config.sections.find(section =>
    (previous && section.metricOrder.includes(previous))
    || (next && section.metricOrder.includes(next)),
  )
  return nearbySection
    ? mapOcrLabel(platform, lines[index], nearbySection.metricOrder)
    : undefined
}

function findNearbyMappedLabel(
  platform: ReportDashboardPlatform,
  lines: string[],
  start: number,
  direction: -1 | 1,
) {
  for (
    let index = start + direction, distance = 1;
    index >= 0 && index < lines.length && distance <= 4;
    index += direction, distance += 1
  ) {
    const key = mapOcrLabel(platform, lines[index])
    if (key) return key
    if (parseStandaloneOcrValue(platform, lines[index]) !== null) break
  }
  return undefined
}

type SequentialLabelLine = {
  index: number
  line: string
  type: 'label'
  key: ReportMetricKey
}

type SequentialValueLine = {
  index: number
  line: string
  type: 'value'
  value: ReportMetricValue
}

type SequentialSemanticLine = SequentialLabelLine | SequentialValueLine

function parseStandaloneOcrValue(
  platform: ReportDashboardPlatform,
  line: string,
): ReportMetricValue {
  if (!/\d/.test(line) || splitTrustedTextLine(platform, line)) return null
  const parsed = parseOcrValue(line)
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function pairSequentialLabelValueBlock(
  platform: ReportDashboardPlatform,
  labels: SequentialLabelLine[],
  values: SequentialValueLine[],
): Array<[SequentialLabelLine, SequentialValueLine]> {
  if (labels.length === values.length) {
    return labels.flatMap((label, index) =>
      isSequentialValueCompatible(platform, label.key, values[index].line)
        ? [[label, values[index]]]
        : [],
    )
  }

  // If a value is missing or extra, retain only mutual one-to-one type matches.
  // Ambiguous count/currency shifts stay unmapped for manual review.
  const compatibleValuesByLabel = labels.map(label =>
    values.filter(value => isSequentialValueCompatible(platform, label.key, value.line)),
  )
  const compatibleLabelsByValue = values.map(value =>
    labels.filter(label => isSequentialValueCompatible(platform, label.key, value.line)),
  )
  const pairs = labels.flatMap((label, labelIndex) => {
    const compatibleValues = compatibleValuesByLabel[labelIndex]
    if (compatibleValues.length !== 1) return []
    const value = compatibleValues[0]
    const valueIndex = values.indexOf(value)
    return compatibleLabelsByValue[valueIndex].length === 1
      ? [[label, value] as [SequentialLabelLine, SequentialValueLine]]
      : []
  })
  return pairs.filter((pair, index) =>
    index === 0
    || pairs[index - 1][0].index < pair[0].index
      && pairs[index - 1][1].index < pair[1].index,
  )
}

function pairPlatformTemplateOrder(
  platform: ReportDashboardPlatform,
  labels: SequentialLabelLine[],
  values: SequentialValueLine[],
) {
  if (platform === 'other') return []
  const config = platformOcrConfigs[platform]
  const templates = [
    ...config.sections.map(section => ({
      id: section.id,
      order: section.metricOrder,
      minimumRecognizedLabels: Math.min(2, section.metricOrder.length),
    })),
    ...(config.sequenceOrders || []).map(sequence => ({
      id: sequence.id,
      order: sequence.metricOrder,
      minimumRecognizedLabels: Math.min(3, sequence.metricOrder.length),
    })),
    {
      id: 'dashboard',
      order: config.metricOrder,
      minimumRecognizedLabels: Math.min(3, config.metricOrder.length),
    },
  ]
  const recognizedKeys = labels.map(label => label.key)
  const selectedTemplate = templates.find(template => {
    if (values.length !== template.order.length || labels.length < template.minimumRecognizedLabels) return false
    if (!recognizedKeys.every(key => template.order.includes(key))) return false
    let cursor = 0
    return recognizedKeys.every(key => {
      const index = template.order.indexOf(key, cursor)
      if (index < 0) return false
      cursor = index + 1
      return true
    })
  })
  if (!selectedTemplate) return []

  const labelByKey = new Map(labels.map(label => [label.key, label]))
  return selectedTemplate.order.flatMap((key, index) => {
    const value = values[index]
    if (!value || !isSequentialValueCompatible(platform, key, value.line)) return []
    const recognizedLabel = labelByKey.get(key)
    const label: SequentialLabelLine = recognizedLabel || {
      index: value.index,
      line: preferredPlatformMetricLabel(platform, key),
      type: 'label',
      key,
    }
    return [{
      label,
      value,
      inferredLabel: !recognizedLabel,
      sectionId: selectedTemplate.id,
    }]
  })
}

function preferredPlatformMetricLabel(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  key: ReportMetricKey,
) {
  if (platform === 'shopee_live' && shopeeTemplateLabels[key]) return shopeeTemplateLabels[key]!
  return Object.entries(platformOcrConfigs[platform].aliases)
    .find(([, candidateKey]) => candidateKey === key)?.[0]
    || key
}

function correctedPlatformMetricLabel(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  key: ReportMetricKey,
) {
  if (platform === 'shopee_live' && shopeeCorrectedLabels[key]) {
    return shopeeCorrectedLabels[key]!
  }
  return platformMetricLayouts[platform].find(cell => cell.key === key)?.label
    || preferredPlatformMetricLabel(platform, key)
}

function isSequentialValueCompatible(
  platform: ReportDashboardPlatform,
  key: ReportMetricKey,
  rawValue: string,
) {
  const parsedValue = parseMetricOcrValue(platform, key, rawValue)
  if (validateMetricCandidate(key, parsedValue, rawValue)) return false
  if (typeof parsedValue !== 'number' || !Number.isFinite(parsedValue)) return false
  if (platform === 'other') return true
  const kind = platformOcrConfigs[platform].valueTypes[key]
  if (!kind) return false
  const hasPercent = /(?:%|[xX°ºoO])\s*$/.test(rawValue.trim())
  const isDuration = isDurationOcrToken(rawValue)
  const hasCurrency = /₫|đ|vnd|usd|\$/i.test(rawValue)
  if (kind === 'percentage') return !isDuration && !hasCurrency && parsedValue >= 0 && parsedValue <= 100
  if (kind === 'duration') return isDuration
  if (hasPercent || isDuration) return false
  if (kind === 'integer_count') return !hasCurrency && Number.isInteger(parsedValue)
  return true
}

function isPercentageMetric(key: ReportMetricKey) {
  return [
    'ctr',
    'conversion_rate',
    'click_rate',
    'live_ctr',
    'ctor',
    'comment_rate',
    'click_to_order_rate',
  ].includes(key)
}

function isDurationOcrToken(rawValue: string) {
  const trimmed = rawValue.trim()
  return /^(?:\d{1,2}:)?\d{1,3}:\d{2}$/.test(trimmed)
    || /^\d+(?:[.,]\d+)?\s*(?:s|sec|secs|second|seconds)$/i.test(trimmed)
    || /^\d{1,2}\s*m\s*\d{1,2}\s*s?$/i.test(trimmed)
}

function addUnmappedTextField(
  unmappedFields: NonNullable<OcrReviewData['unmapped_fields']>,
  label: string,
  value: string,
  source: NonNullable<OcrMetricValue['source']>,
  reason = 'The OCR text has no recognizable valid label/value pair.',
) {
  unmappedFields.push({
    original_label: label,
    original_value: value,
    confidence: 'low',
    source,
    rejection_reason: reason,
  })
}

function filterKnownMetricUnmappedFields(
  platform: ReportDashboardPlatform,
  fields: NonNullable<OcrReviewData['unmapped_fields']>,
  expectedKeys: readonly ReportMetricKey[],
) {
  return fields.filter(field =>
    !mapOcrLabel(platform, field.original_label, expectedKeys),
  )
}

function applyCardOutputCandidates(
  platform: ReportDashboardPlatform,
  recognition: OcrImageRecognition,
  candidates: MetricCandidateInput[],
  consumedWords: Set<OcrRecognizedWord>,
) {
  const cardOutput = recognition.pass_output.card
  if (!cardOutput) return
  const allowedKeys = new Set<ReportMetricKey>([
    ...commonReportMetricKeys,
    ...platformMetricKeys[platform],
  ])

  for (const [rawKey, values] of Object.entries(cardOutput)) {
    const key = rawKey as ReportMetricKey
    if (!allowedKeys.has(key)) continue
    const layoutCell = platformMetricLayouts[platform as Exclude<ReportDashboardPlatform, 'other'>]
      ?.find(cell => cell.key === key)
    const cardLabels = recognition.pass_output.card_labels?.[key] || []
    const cardDiagnostics = recognition.pass_output.card_diagnostics?.[key] || []
    const observedValues = cardDiagnostics.some(diagnostic => diagnostic.text.trim())
      ? cardDiagnostics.map(diagnostic => diagnostic.text)
      : values
    const anchoredCard = cardLabels.some(label =>
      mapOcrLabel(platform, label, [key]) === key,
    )
    const reconstructedCompact = reconstructCompactOcrValue(layoutCell, observedValues)
    const cardValues = reconstructedCompact && !observedValues.includes(reconstructedCompact)
      ? [reconstructedCompact, ...observedValues]
      : observedValues
    const cardCandidates = cardValues.flatMap((value, variantIndex) => {
      const normalizedRaw = normalizeLayoutCardValue(layoutCell, value)
      const parsedValue = parseMetricOcrValue(platform, key, normalizedRaw)
      const compactMetadata = parseCompactOcrNumber(normalizedRaw)
      if (validateMetricCandidate(key, parsedValue, normalizedRaw)) return []
      const shapeScore = layoutCell
        ? layoutValueShapeScore(layoutCell.valueKind, normalizedRaw, parsedValue)
        : 1
      const rawQualityScore = layoutCell
        ? layoutCardRawQualityScore(layoutCell, value)
        : 1
      const cardWord = findCardValueWord(key, value, recognition)
      const matchingDiagnostics = cardDiagnostics
        .filter(diagnostic => diagnostic.text === value)
      const priorMatchingValues = cardValues
        .slice(0, variantIndex)
        .filter(previousValue => previousValue === value)
        .length
      const cardDiagnostic = matchingDiagnostics[priorMatchingValues]
        || matchingDiagnostics[0]
      return [{
        value,
        normalizedRaw,
        parsedValue,
        compactMetadata,
        shapeScore,
        rawQualityScore,
        cardWord,
        cardDiagnostic,
        evidenceGroup: cardDiagnostic?.evidence_group
          || cardWord?.evidence_group
          || `anchor_card:${key}`,
        variantIndex,
        selectionScore:
          shapeScore * 10
          + rawQualityScore * 2
          + (cardDiagnostic?.confidence || cardWord?.confidence || 0) / 100
          - variantIndex * .05,
      }]
    })
    const consensusCandidates = cardCandidates.map(candidate => ({
      ...candidate,
      supportCount: new Set(cardCandidates
        .filter(other => metricValuesEqual(other.parsedValue, candidate.parsedValue))
        .map(other => other.evidenceGroup))
        .size,
      selectionScore: candidate.selectionScore + new Set(cardCandidates
        .filter(other => metricValuesEqual(other.parsedValue, candidate.parsedValue))
        .map(other => other.evidenceGroup))
        .size * 3
        + Math.min(
          .6,
          Math.max(
            0,
            cardCandidates.filter(other =>
              metricValuesEqual(other.parsedValue, candidate.parsedValue),
            ).length - 1,
          ) * .3,
        ),
    }))
    const viableCandidates = consensusCandidates
      .map(candidate => ({
        ...candidate,
        supportingWord: findCardValueWordSupport(platform, key, candidate.parsedValue, recognition),
        conflictingWord: findConflictingCardValueWord(platform, key, candidate.parsedValue, recognition),
      }))
      .map(candidate => ({
        ...candidate,
        selectionScore:
          candidate.selectionScore
          + (candidate.supportingWord ? 4 : 0)
          - (candidate.conflictingWord && !candidate.supportingWord ? 2 : 0),
      }))
      .filter(candidate =>
        candidate.shapeScore >= 0.75
        && !(
          platform === 'shopee_live'
          && !recognition.region_diagnostics?.selected_candidate_id
          && candidate.conflictingWord
          && !candidate.supportingWord
        )
        && (
          candidate.cardWord
          || candidate.supportingWord
          || anchoredCard
          || (
            platform === 'tiktok_shop'
            && Boolean(candidate.cardDiagnostic?.bounding_box)
          )
          || recognition.words.every(word => word.pass === 'card')
        ),
      )
    for (const candidate of viableCandidates) {
      const rawValue = candidate.value
      const parsedValue = candidate.parsedValue
      if (parsedValue === null || (typeof parsedValue === 'number' && !Number.isFinite(parsedValue))) continue
      const repaired = candidate.normalizedRaw !== rawValue.trim()
      const ambiguousCompact = candidate.compactMetadata?.ambiguous || false
      const independentValueConfidence = candidate.supportingWord?.confidence
        || (candidate.supportCount >= 2
          ? candidate.cardDiagnostic?.confidence || candidate.cardWord?.confidence
          : undefined)
      const clearPair = Boolean(
        !repaired
        && !ambiguousCompact
        && (independentValueConfidence || 0) >= 85
        && candidate.shapeScore >= .85,
      )
      const valueEvidence = candidate.cardWord || candidate.supportingWord
      const valueBox = valueEvidence?.bounding_box
      const cardDiagnostic = candidate.cardDiagnostic
      collectMetricCandidate(candidates, key, {
        value: parsedValue,
        candidate_value: parsedValue,
        normalized_value: parsedValue,
        raw_ocr_label: recognition.pass_output.card_labels?.[key]?.find(Boolean) || '',
        corrected_source_label: layoutCell
          ? correctedPlatformMetricLabel(
            platform as Exclude<ReportDashboardPlatform, 'other'>,
            key,
          )
          : rawKey,
        raw_ocr_value: rawValue,
        corrected_display_value: layoutCell
          ? formatCorrectedMetricValue(
            platform as Exclude<ReportDashboardPlatform, 'other'>,
            key,
            parsedValue,
          )
          : String(parsedValue),
        confidence: clearPair ? 'high' : 'medium',
        needs_review: !clearPair,
        original_label: layoutCell?.label || rawKey,
        raw_value: rawValue,
        normalized_key: key,
        unit: inferMetricUnit(key, candidate.normalizedRaw),
        bounding_box: valueBox,
        value_box: valueBox,
        pairing_reason: ambiguousCompact
          ? 'Compact-number punctuation is ambiguous and requires review.'
          : repaired
          ? 'Card value format was normalized using the declared grid-cell display format.'
          : clearPair
            ? 'Card OCR value is independently supported inside the same KPI grid cell.'
            : 'Card OCR found a typed value, but independent word-box evidence is incomplete.',
        pair_score: candidate.selectionScore,
        source: platform === 'tiktok_shop' && repaired
          ? 'spatial_fallback'
          : anchoredCard
            ? 'word_box_exact'
            : 'card_exact',
        status: clearPair ? 'confirmed' : 'review_required',
        rejection_reason: ambiguousCompact
          ? 'Compact-number punctuation is ambiguous and must be reviewed.'
          : repaired
            ? 'The displayed value format was repaired and must be reviewed.'
            : undefined,
        label_confidence: 100,
        label_source: anchoredCard && !(platform === 'tiktok_shop' && repaired)
          ? 'ocr_text'
          : 'platform_layout',
        value_confidence: cardDiagnostic?.confidence || valueEvidence?.confidence,
        spatial_score: clearPair ? 1 : undefined,
        value_source_pass: 'card',
        strategy: 'anchor_card',
        preprocessing_pass: cardDiagnostic?.preprocessing_pass,
        evidence_source_family: cardDiagnostic?.evidence_source_family
          || candidate.cardWord?.evidence_source_family
          || 'anchor_aligned_card_crop',
        evidence_group: cardDiagnostic?.evidence_group
          || candidate.cardWord?.evidence_group
          || candidate.evidenceGroup,
        supporting_word_boxes: cardDiagnostic
          ? [cardDiagnostic.bounding_box]
          : valueBox
            ? [valueBox]
            : undefined,
      })
      if (candidate.cardWord) consumedWords.add(candidate.cardWord)
    }
  }
}

function normalizeLayoutCardValue(
  cell: LayoutMetricCell | undefined,
  rawValue: string,
) {
  const trimmed = rawValue.trim()
  let glyphNormalized = /\d/.test(trimmed)
    ? trimmed
      .replace(/[Óó]/g, '6')
      .replace(/^[sS](?=\d)/, '5')
      .replace(/(?<=\d)[oO](?=\d|$)/g, '0')
      .replace(
        cell?.valueKind === 'compact' ? /[xX«]\s*$/ : /$^/,
        cell?.displayFormat?.compactSuffix || 'K',
      )
    : trimmed
  if (cell?.valueKind === 'compact' && cell.displayFormat?.compactSuffix && /\d/.test(glyphNormalized)) {
    const suffix = cell.displayFormat.compactSuffix
    glyphNormalized = glyphNormalized
      .replace(/([KM])\s*[.;:]+$/i, '$1')
      .replace(/(?<=[\d.,\s])[aA](?=\d)/g, '4')
      .replace(/\s+(?=[.,]\d{2}[KMxXÃ‚Â«]\s*$)/, '')
    glyphNormalized = glyphNormalized.replace(
      new RegExp(`^(\\d{1,3})\\s+(\\d{${cell.displayFormat.decimalPlaces || 2}})(?=[xXÂ«${suffix}]\\s*$)`, 'i'),
      '$1.$2',
    )
    glyphNormalized = glyphNormalized.replace(
      new RegExp(`([\\d.,])${suffix === 'M' ? 'm[nma]*' : 'k[kx]*'}$`, 'i'),
      `$1${suffix}`,
    )
  }
  if (cell?.valueKind === 'duration' && /^\d{1,5}[:;]$/.test(glyphNormalized)) {
    return `${glyphNormalized.slice(0, -1)}s`
  }
  if (cell?.valueKind === 'duration') {
    const minuteSecond = glyphNormalized
      .replace(/\s+/g, '')
      .replace(/:$/, 's')
      .match(/^(\d{1,2})m(\d{1,2})s?$/i)
    if (minuteSecond) {
      return `${minuteSecond[1]}:${minuteSecond[2].padStart(2, '0')}`
    }
  }
  if (cell?.valueKind === 'count_or_compact') {
    let normalizedCompact = glyphNormalized
      .replace(
        /^([mnlI|])\s*(\d)(\d{2})([KM])$/i,
        '$2.$3$4',
      )
      .replace(/^([mnlI|])(?=[.,]\d+[KM]$)/i, '1')
      .replace(/^[a-z]+\s*(?=\d)/i, '')
    const compactFormat = cell.displayFormat
    if (
      compactFormat?.compactSuffix
      && compactFormat.decimalPlaces
      && new RegExp(
        `^\\d{${compactFormat.decimalPlaces + 1}}${compactFormat.compactSuffix}$`,
        'i',
      ).test(normalizedCompact)
    ) {
      const digits = normalizedCompact.replace(/\D/g, '')
      normalizedCompact = `${digits.slice(0, -compactFormat.decimalPlaces)}.${digits.slice(-compactFormat.decimalPlaces)}${compactFormat.compactSuffix}`
    }
    return normalizedCompact
  }
  const format = cell?.displayFormat
  if (!format) {
    if (
      cell?.valueKind === 'percentage'
      && /^\d{3,4}\s*%?$/.test(glyphNormalized)
    ) {
      const digits = glyphNormalized.replace(/\D/g, '')
      for (let decimalPlaces = 1; decimalPlaces < digits.length; decimalPlaces += 1) {
        const inferredValue = Number(digits) / (10 ** decimalPlaces)
        if (inferredValue <= 100) return String(inferredValue)
      }
    }
    return glyphNormalized
  }
  let normalized = glyphNormalized.replace(/([0-9])[:;]([0-9])/g, '$1.$2')
  const suffix = format.compactSuffix
  if (suffix) {
    const suffixPattern = new RegExp(`${suffix}$`, 'i')
    normalized = normalized.replace(suffixPattern, '')
  }
  const declaredDecimalPlaces = format.decimalPlaces
  if (declaredDecimalPlaces) {
    const digits = normalized.replace(/\D/g, '')
    const separators = [...normalized.matchAll(/[.,]/g)].map(match => match.index || 0)
    const lastSeparator = separators.at(-1)
    const trailingDigits = lastSeparator === undefined
      ? 0
      : normalized.slice(lastSeparator + 1).replace(/\D/g, '').length
    const needsDeclaredDecimal = cell.valueKind !== 'currency'
      && digits.length > declaredDecimalPlaces
      && (
        separators.length === 0
        || trailingDigits === 0
      )
    const malformedCurrencySeparators = cell.valueKind === 'currency'
      && digits.length > declaredDecimalPlaces
      && (
        separators.length >= 2 && trailingDigits === declaredDecimalPlaces
        || separators.length === 1 && trailingDigits > declaredDecimalPlaces + 1
      )
    const inferredBoundedPercentage = cell.valueKind === 'percentage'
      && separators.length === 0
      && Number(digits) / (10 ** declaredDecimalPlaces) > 100
      ? Array.from(
        { length: Math.max(0, digits.length - declaredDecimalPlaces - 1) },
        (_, index) => declaredDecimalPlaces + index + 1,
      ).map(inferredPlaces => Number(digits) / (10 ** inferredPlaces))
        .find(inferredValue => inferredValue <= 100)
      : undefined
    if (inferredBoundedPercentage !== undefined) {
      const decimalScale = 10 ** declaredDecimalPlaces
      normalized = String(
        Math.round((inferredBoundedPercentage + Number.EPSILON) * decimalScale) / decimalScale,
      )
    } else if (needsDeclaredDecimal || malformedCurrencySeparators) {
      normalized = `${digits.slice(0, -declaredDecimalPlaces)}.${digits.slice(-declaredDecimalPlaces)}`
    }
  }
  return `${normalized}${suffix || ''}`
}

function layoutCardRawQualityScore(cell: LayoutMetricCell, rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed || !/\d/.test(trimmed)) return 0
  if (/\d\s+\d/.test(trimmed)) return .15
  if (cell.valueKind === 'percentage') {
    if (/^\d{1,3}[.,]\d{1,2}\s*%?$/.test(trimmed)) return 1
    if (/^\d{2,3}\s*%?$/.test(trimmed) && cell.displayFormat?.decimalPlaces) return .85
    return .35
  }
  if (cell.valueKind === 'duration') {
    return /^(?:\d{1,2}:)?\d{1,3}:\d{2}$/.test(trimmed) ? 1 : .45
  }
  if (cell.valueKind === 'compact') {
    if (/^\d+[:;]\d+$/.test(trimmed) && cell.displayFormat?.decimalPlaces) return 1.25
    if (/^\d{1,3}(?:[.,]\d+)?[KM]$/i.test(trimmed)) return 1
    return /^\d+(?:[.,]\d+)?[KM]$/i.test(trimmed) ? .35 : .45
  }
  if (cell.valueKind === 'count_or_compact') {
    return /^\d+(?:[.,]\d+)?[KM]?$/i.test(trimmed) ? 1 : .4
  }
  if (cell.valueKind === 'currency') {
    return /^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(trimmed)
      ? 1
      : /^\d+(?:[.,]\d+)?$/.test(trimmed)
        ? .75
        : .3
  }
  return /^\d+(?:[.,]\d+)?$/.test(trimmed) ? 1 : .4
}

export function reconstructCompactOcrValue(
  cell: LayoutMetricCell | undefined,
  values: readonly string[],
) {
  const suffix = cell?.displayFormat?.compactSuffix
  const decimalPlaces = cell?.displayFormat?.decimalPlaces
  if (cell?.valueKind !== 'compact' || !suffix || !decimalPlaces) return undefined
  const repeatedSuffix = new RegExp(`${suffix}+$`, 'i')
  const headed = values
    .map(value => value.replace(/\s+/g, '').replace(repeatedSuffix, suffix))
    .find(value => new RegExp(`^\\d{1,2}${suffix}$`, 'i').test(value))
  const fractional = values
    .map(value => value.replace(/\s+/g, ''))
    .find(value =>
      !/[KM]/i.test(value)
      && value.replace(/\D/g, '').length === decimalPlaces,
    )
  if (!headed || !fractional) return undefined
  const headedDigits = headed.replace(/\D/g, '')
  const fractionalDigits = fractional.replace(/\D/g, '')
  const integerDigits = headedDigits.length > 1
    && headedDigits.endsWith(fractionalDigits.slice(0, 1))
    ? headedDigits.slice(0, -1)
    : headedDigits
  return `${integerDigits}.${fractionalDigits}${suffix}`
}

function formatCorrectedMetricValue(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  key: ReportMetricKey,
  value: ReportMetricValue,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '')
  const cell = platformMetricLayouts[platform].find(candidate => candidate.key === key)
  if (!cell) return String(value)
  if (cell.valueKind === 'duration') {
    if (platform === 'shopee_live') {
      const totalSeconds = Math.max(0, Math.round(value))
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      return [hours, minutes, seconds].map(part => String(part).padStart(2, '0')).join(':')
    }
    return `${Math.max(0, Math.round(value))}s`
  }
  if (cell.valueKind === 'compact' && cell.displayFormat?.compactSuffix) {
    const divisor = cell.displayFormat.compactSuffix === 'M' ? 1_000_000 : 1_000
    return `${formatViDecimal(
      value / divisor,
      cell.displayFormat.decimalPlaces ?? 2,
      cell.displayFormat.decimalPlaces ?? 2,
    )}${cell.displayFormat.compactSuffix}`
  }
  if (cell.valueKind === 'percentage') {
    const decimals = cell.displayFormat?.decimalPlaces
      ?? Math.min(2, decimalPlaces(value))
    return `${formatViDecimal(value, decimals, decimals)}%`
  }
  if (cell.valueKind === 'currency') {
    return formatViDecimal(value, platform === 'shopee_live' ? 2 : 0, platform === 'shopee_live' ? 2 : 0)
  }
  if (cell.valueKind === 'ratio') {
    return formatViDecimal(value, 0, cell.displayFormat?.decimalPlaces ?? 2)
  }
  return formatViDecimal(value, 0, 0)
}

function decimalPlaces(value: number) {
  const decimal = String(value).split('.')[1]
  return decimal?.length || 0
}

function formatViDecimal(value: number, minimumFractionDigits: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true,
  }).format(value)
}

export function formatCorrectedDashboardOcrText(
  platform: ReportDashboardPlatform,
  metrics: OcrReviewData['metrics'],
) {
  if (platform === 'other') return ''
  const orderedKeys = platform === 'shopee_live'
    ? shopeeMainMetricKeys
    : tiktokCentralMetricKeys
  return orderedKeys.flatMap(key => {
    const metric = metrics[key]
    const value = metric?.value ?? metric?.candidate_value
    if (value === null || value === undefined) return []
    const label = correctedPlatformMetricLabel(platform, key)
    const display = metric?.corrected_display_value
      || formatCorrectedMetricValue(platform, key, value)
    return [`${label}: ${display}`]
  }).join('\n')
}

function findCardValueWord(
  key: ReportMetricKey,
  rawValue: string,
  recognition: OcrImageRecognition,
) {
  return recognition.words.find(word =>
    word.pass === 'card'
    && word.line_id.startsWith(`card:${key}:`)
    && word.text === rawValue,
  )
}

function applyExactRawTextCandidates(
  platform: ReportDashboardPlatform,
  rawText: string,
  candidates: MetricCandidateInput[],
  strategy: NonNullable<OcrMetricValue['strategy']>,
  evidenceGroup: string,
) {
  const exactReview = parseDashboardOcrText(platform, rawText, 'raw_text_exact')
  for (const [key, candidate] of Object.entries(exactReview.metrics) as Array<[ReportMetricKey, OcrMetricValue]>) {
    if (!metricHasUsableValue(candidate)) continue
    const layoutCell = platform === 'other'
      ? undefined
      : platformMetricLayouts[platform].find(cell => cell.key === key)
    const rawValue = candidate.raw_value || ''
    const normalizedRaw = normalizeLayoutCardValue(layoutCell, rawValue)
    const value = candidate.value ?? candidate.candidate_value
    if (value === undefined) continue
    if (
      layoutCell
      && layoutValueShapeScore(layoutCell.valueKind, normalizedRaw, value) < .75
    ) continue
    collectMetricCandidate(candidates, key, {
      ...candidate,
      label_source: 'ocr_text',
      strategy,
      preprocessing_pass: strategy === 'legacy_relative'
        ? 'original_full_image'
        : 'normalized_roi',
      evidence_source_family: strategy === 'legacy_relative'
        ? 'legacy_full_image_ocr'
        : 'normalized_roi_ocr',
      evidence_group: evidenceGroup,
    })
  }
}

function findCardValueWordSupport(
  platform: ReportDashboardPlatform,
  key: ReportMetricKey,
  value: ReportMetricValue,
  recognition: OcrImageRecognition,
) {
  const independentWords = recognition.words.filter(word => word.pass !== 'card')
  if (!independentWords.length) return undefined
  const cell = platformMetricLayouts[platform as Exclude<ReportDashboardPlatform, 'other'>]
    ?.find(candidate => candidate.key === key)
  if (!cell || !recognition.original_dimensions.width || !recognition.original_dimensions.height) return undefined
  return independentWords.find(word =>
    wordIsInsideRecognizedMetricCell(
      platform as Exclude<ReportDashboardPlatform, 'other'>,
      word,
      cell,
      recognition,
    )
    && metricValuesEqual(parseLayoutEvidenceValue(cell, word.text), value),
  )
}

function findConflictingCardValueWord(
  platform: ReportDashboardPlatform,
  key: ReportMetricKey,
  value: ReportMetricValue,
  recognition: OcrImageRecognition,
) {
  const cell = platformMetricLayouts[platform as Exclude<ReportDashboardPlatform, 'other'>]
    ?.find(candidate => candidate.key === key)
  if (!cell) return undefined
  return recognition.words.find(word =>
    word.pass !== 'card'
    && word.confidence >= 85
    && wordIsInsideRecognizedMetricCell(
      platform as Exclude<ReportDashboardPlatform, 'other'>,
      word,
      cell,
      recognition,
    )
    && parseLayoutEvidenceValue(cell, word.text) !== null
    && !metricValuesEqual(parseLayoutEvidenceValue(cell, word.text), value),
  )
}

function parseLayoutEvidenceValue(cell: LayoutMetricCell, rawValue: string) {
  return parseOcrValue(normalizeLayoutCardValue(cell, rawValue))
}

export function buildDashboardOcrReviewFromRecognition(
  platform: ReportDashboardPlatform,
  recognition: OcrImageRecognition,
): OcrReviewData {
  // Parse the text carried by this recognition result directly. This deliberately
  // does not depend on React state, word boxes, card output, or confidence data.
  const textCandidates = [...new Set([
    recognition.text.trim(),
    recognition.pass_output.label.trim(),
  ].filter(Boolean))]
  const selectedTextCandidate = textCandidates
    .map(text => ({
      text,
      review: parseDashboardOcrText(platform, text, 'raw_text_exact'),
    }))
    .sort((left, right) =>
      Object.keys(right.review.metrics).length - Object.keys(left.review.metrics).length,
    )[0]
  const recognizedText = selectedTextCandidate?.text || ''
  const review = mapDashboardImageRecognition(platform, {
    ...recognition,
    text: recognizedText,
  })
  if (Object.keys(review.metrics).length > 0) {
    if (review.status !== 'confirmed') review.status = 'review_required'
    review.error_message = undefined
  }
  review.raw_output ||= recognizedText
  review.raw_diagnostic_output ||= formatRecognitionOutput(recognition)
  return review
}

function metricHasUsableValue(metric: OcrMetricValue) {
  const value = metric.value ?? metric.candidate_value
  return value !== null &&
    value !== undefined &&
    (typeof value !== 'number' || Number.isFinite(value))
}

function tiktokConfidenceContext(
  diagnostics: OcrReviewData['region_diagnostics'] | undefined,
) {
  const selected = diagnostics?.dashboard_candidates.find(candidate =>
    candidate.id === diagnostics.selected_candidate_id,
  )
  return selected
    ? {
      roiConfidence: selected.confidence,
      anchorCount: selected.anchor_count,
    }
    : undefined
}

function collectMetricCandidate(
  candidates: MetricCandidateInput[],
  key: ReportMetricKey,
  metric: OcrMetricValue,
) {
  if (isCanonicalMetricKey(key)) candidates.push({ key, metric })
}

function isTikTokReliableEvidenceCandidate(candidate: MetricCandidateInput) {
  return candidate.metric.strategy !== 'legacy_relative'
    && candidate.metric.preprocessing_pass !== 'adaptive_roi'
}

function isTikTokAgreementCandidate(candidate: MetricCandidateInput) {
  if (!isTikTokReliableEvidenceCandidate(candidate)) return false
  if (candidate.metric.preprocessing_pass === 'geometry_compact_reconstruction') return false
  if (candidate.metric.strategy !== 'anchor_card') return true
  return (candidate.metric.value_confidence || 0) >= 30
}

function isTikTokConfirmationEvidenceCandidate(candidate: MetricCandidateInput) {
  if (isTikTokAgreementCandidate(candidate)) return true
  return candidate.metric.strategy === 'legacy_relative'
    && candidate.metric.source === 'raw_text_exact'
    && candidate.metric.normalized_key === candidate.key
    && Boolean((candidate.metric.raw_value || candidate.metric.raw_ocr_value || '').match(/\d/))
}

function tiktokCandidateConfidence(candidate: MetricCandidateInput) {
  if (typeof candidate.metric.value_confidence === 'number') {
    return candidate.metric.value_confidence
  }
  switch (candidate.metric.confidence) {
    case 'high':
      return 90
    case 'medium':
      return 70
    default:
      return 40
  }
}

function tiktokCompactFormatIsVisuallySupported(
  key: CanonicalMetricKey,
  candidates: readonly MetricCandidateInput[],
) {
  const cell = platformMetricLayouts.tiktok_shop.find(candidate => candidate.key === key)
  if (!cell || (cell.valueKind !== 'compact' && cell.valueKind !== 'count_or_compact')) {
    return true
  }
  const selectedValue = candidates[0]?.metric.value ?? candidates[0]?.metric.candidate_value
  const usesCompactNotation = candidates.some(candidate =>
    /[KM]\s*$/i.test(candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''),
  ) || (typeof selectedValue === 'number' && selectedValue >= 1_000)
  if (!usesCompactNotation) return true

  const declaredDigits = cell.displayFormat?.decimalPlaces
  const visuallySupportedGroups = new Set(candidates.flatMap(candidate => {
    const raw = (candidate.metric.raw_value || candidate.metric.raw_ocr_value || '')
      .trim()
      .replace(/[\s;:]+$/, '')
    const hasVisibleSuffix = /[KM]$/i.test(raw)
    const hasVisiblePrecision = declaredDigits
      ? new RegExp(`[.,]\\d{${declaredDigits}}[KM]$`, 'i').test(raw)
      : hasVisibleSuffix
    return hasVisibleSuffix && hasVisiblePrecision
      ? [tiktokEvidenceGroup(candidate.metric)]
      : []
  }))
  return visuallySupportedGroups.size >= 2
}

function tiktokPreprocessingEvidenceAgrees(
  winnerCandidates: readonly MetricCandidateInput[],
  allKeyCandidates: readonly MetricCandidateInput[],
) {
  const winnerValue = winnerCandidates[0]?.metric.value
    ?? winnerCandidates[0]?.metric.candidate_value
  if (winnerValue === undefined) return false

  const winningGroups = new Set(winnerCandidates
    .filter(isTikTokConfirmationEvidenceCandidate)
    .map(candidate => tiktokEvidenceGroup(candidate.metric)))
  for (const evidenceGroup of winningGroups) {
    const groupCandidates = allKeyCandidates.filter(candidate =>
      isTikTokConfirmationEvidenceCandidate(candidate)
      && tiktokEvidenceGroup(candidate.metric) === evidenceGroup,
    )
    const selectedConfidence = Math.max(
      ...groupCandidates
        .filter(candidate => metricValuesEqual(
          candidate.metric.value ?? candidate.metric.candidate_value,
          winnerValue,
        ))
        .map(tiktokCandidateConfidence),
      0,
    )
    const similarlyStrongConflict = groupCandidates.some(candidate => {
      const value = candidate.metric.value ?? candidate.metric.candidate_value
      return !metricValuesEqual(value, winnerValue)
        && tiktokCandidateConfidence(candidate) >= selectedConfidence - 8
    })
    if (similarlyStrongConflict) return false
  }
  return true
}

function assessTikTokConfirmation(
  key: CanonicalMetricKey,
  winnerCandidates: readonly MetricCandidateInput[],
  allKeyCandidates: readonly MetricCandidateInput[],
  decisive: boolean,
  context?: { roiConfidence?: number; anchorCount?: number },
) {
  const agreementCandidates = winnerCandidates.filter(isTikTokConfirmationEvidenceCandidate)
  const evidenceGroups = new Set(agreementCandidates
    .map(candidate => tiktokEvidenceGroup(candidate.metric)))
  const cell = platformMetricLayouts.tiktok_shop.find(candidate => candidate.key === key)
  const usesCompactNotation = agreementCandidates.some(candidate =>
    /[KM]\s*$/i.test(candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''),
  )
  // A card crop and normalized ROI can share the same ambiguous count glyph.
  // Plain integer counts therefore need a third, separately recognized full-image
  // label/value observation. Compact values with a visible K/M suffix retain the
  // two-group threshold because their magnitude and punctuation are explicit.
  const highConfidenceRegionOwnership = (context?.roiConfidence || 0) >= .98
    && (context?.anchorCount || 0) >= 9
  const requiredEvidenceGroups = (
    cell?.valueKind === 'count'
    || (cell?.valueKind === 'count_or_compact' && !usesCompactNotation)
  ) && !highConfidenceRegionOwnership ? 3 : 2
  const hasAnchorCardOwnership = agreementCandidates.some(candidate =>
    candidate.metric.strategy === 'anchor_card'
    && candidate.metric.normalized_key === key
    && tiktokEvidenceGroup(candidate.metric).startsWith('anchor_card:')
    && Boolean(candidate.metric.supporting_word_boxes?.length),
  )
  const hasNormalizedRoiOwnership = agreementCandidates.some(candidate =>
    candidate.metric.strategy === 'normalized_roi'
    && candidate.metric.normalized_key === key
    && tiktokEvidenceGroup(candidate.metric).startsWith('normalized_roi:')
    && (
      candidate.metric.label_source === 'ocr_text'
      || Boolean(candidate.metric.supporting_word_boxes?.length)
    ),
  )
  const formatSupported = tiktokCompactFormatIsVisuallySupported(key, agreementCandidates)
  const preprocessingAgrees = tiktokPreprocessingEvidenceAgrees(
    winnerCandidates,
    allKeyCandidates,
  )
  const confirmed = evidenceGroups.size >= requiredEvidenceGroups
    && hasAnchorCardOwnership
    && hasNormalizedRoiOwnership
    && decisive
    && formatSupported
    && preprocessingAgrees
  const reason = confirmed
    ? `TikTok confidence policy confirmed this value because ${evidenceGroups.size} independent evidence groups agree (minimum ${requiredEvidenceGroups}), card ownership is explicit, no similarly strong conflict exists, and the displayed value format is visually supported.`
    : undefined
  return { confirmed, evidenceGroups, reason }
}

function selectTikTokHybridMetricCandidates(
  candidates: readonly MetricCandidateInput[],
  expectedKeys: readonly CanonicalMetricKey[],
  context?: { roiConfidence?: number; anchorCount?: number },
): MetricCandidateSelection {
  const expandedCandidates = [
    ...candidates,
    ...buildTikTokComplementaryCompactCandidates(candidates),
  ]
  const baseline = selectBestMetricCandidates(expandedCandidates, expectedKeys)
  const selectedByKey: MetricCandidateSelection['selectedByKey'] = {}
  const discardedConflicts: MetricCandidateSelection['discardedConflicts'] = []

  for (const key of expectedKeys) {
    const keyCandidates = expandedCandidates.filter(candidate =>
      candidate.key === key && metricHasUsableValue(candidate.metric),
    )
    if (!keyCandidates.length) continue
    const grouped = new Map<string, MetricCandidateInput[]>()
    for (const candidate of keyCandidates) {
      const value = candidate.metric.value ?? candidate.metric.candidate_value
      const signature = typeof value === 'number'
        ? `number:${value}`
        : `${typeof value}:${String(value ?? '')}`
      const entries = grouped.get(signature) || []
      entries.push(candidate)
      grouped.set(signature, entries)
    }
    const rankedGroups = [...grouped.values()]
      .map(group => ({
        group,
        score: tiktokStrategyGroupScore(key, group, keyCandidates),
      }))
      .sort((left, right) => right.score - left.score)
    const winner = rankedGroups[0]
    if (!winner) continue
    const selected = selectBestMetricCandidates(winner.group, [key]).selectedByKey[key]
    if (!selected) continue
    const runnerUp = rankedGroups[1]
    const strategyCandidates = keyCandidates.flatMap(candidate =>
      candidate.metric.strategy
        ? [{
          strategy: candidate.metric.strategy,
          raw_text: candidate.metric.raw_value || candidate.metric.raw_ocr_value || '',
          value_candidate: candidate.metric.value ?? candidate.metric.candidate_value ?? null,
          confidence: candidate.metric.confidence,
          card_ownership: key,
          preprocessing_pass: candidate.metric.preprocessing_pass,
          evidence_source_family: candidate.metric.evidence_source_family,
          evidence_group: candidate.metric.evidence_group,
          supporting_word_boxes: candidate.metric.supporting_word_boxes,
          rejection_reason: candidate.metric.rejection_reason,
        }]
        : [],
    )
    const decisive = !runnerUp || winner.score - runnerUp.score >= .35
    const confirmation = assessTikTokConfirmation(
      key,
      winner.group,
      keyCandidates,
      decisive,
      context,
    )
    const evidenceSummary = winner.group.map(candidate =>
      `${candidate.metric.strategy || 'unclassified'}`
      + `/${tiktokEvidenceGroup(candidate.metric)}`
      + `/${candidate.metric.preprocessing_pass || 'unknown'}`
      + `=${candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''}`,
    ).join(', ')
    selectedByKey[key] = confirmation.confirmed
      ? {
        ...selected,
        status: 'confirmed',
        confidence: 'high',
        needs_review: false,
        conflict_warning: undefined,
        rejection_reason: undefined,
        strategy_candidates: strategyCandidates,
        pairing_reason: `${confirmation.reason} Evidence: ${evidenceSummary}.`,
      }
      : {
        ...selected,
        status: 'review_required',
        needs_review: true,
        conflict_warning: decisive
          ? selected.conflict_warning
          : 'TikTok OCR strategies produced similarly strong conflicting values.',
        strategy_candidates: strategyCandidates,
      }

    const selectedValue = selected.value ?? selected.candidate_value
    for (const discardedGroup of rankedGroups.slice(1)) {
      const discarded = selectBestMetricCandidates(discardedGroup.group, [key]).selectedByKey[key]
      if (!discarded) continue
      discardedConflicts.push({
        canonical_key: key,
        selected_source: selected.source,
        discarded_source: discarded.source,
        selected_value: selectedValue,
        discarded_value: discarded.value ?? discarded.candidate_value,
        reason: `TikTok hybrid evidence score ${winner.score.toFixed(2)} exceeded ${discardedGroup.score.toFixed(2)} using strategy ownership, value shape, preprocessing agreement, and confidence.`,
      })
    }
  }

  return {
    selectedByKey: {
      ...baseline.selectedByKey,
      ...selectedByKey,
    },
    discardedConflicts,
    missingKeys: expectedKeys.filter(key => !selectedByKey[key] && !baseline.selectedByKey[key]),
  }
}

function buildTikTokComplementaryCompactCandidates(
  candidates: readonly MetricCandidateInput[],
): MetricCandidateInput[] {
  const reconstructed: MetricCandidateInput[] = []
  const seen = new Set<string>()
  for (const cell of platformMetricLayouts.tiktok_shop) {
    if (cell.valueKind !== 'compact' || !cell.displayFormat?.compactSuffix) continue
    if (!isCanonicalMetricKey(cell.key)) continue
    const keyCandidates = candidates.filter(candidate =>
      candidate.key === cell.key && metricHasUsableValue(candidate.metric))
    for (const normalizedCandidate of keyCandidates) {
      if (normalizedCandidate.metric.strategy !== 'normalized_roi') continue
      const normalizedRaw = (
        normalizedCandidate.metric.raw_value
        || normalizedCandidate.metric.raw_ocr_value
        || ''
      ).replace(/\s+/g, '')
      const ambiguous = normalizedRaw.match(/^(\d{2})([A-Za-z])(\d)([KkMmXx])$/)
      if (!ambiguous) continue
      for (const cardCandidate of keyCandidates) {
        if (
          cardCandidate.metric.strategy !== 'anchor_card'
          || tiktokEvidenceGroup(cardCandidate.metric)
            === tiktokEvidenceGroup(normalizedCandidate.metric)
        ) continue
        const cardRaw = cardCandidate.metric.raw_value
          || cardCandidate.metric.raw_ocr_value
          || ''
        const cardDigits = cardRaw.replace(/\D/g, '')
        if (cardDigits.length < 2 || cardDigits.at(-1) !== ambiguous[3]) continue
        const fusedDigits = `${ambiguous[1]}${cardDigits.slice(-2)}`
        const decimalPlaces = cell.displayFormat.decimalPlaces || 2
        if (fusedDigits.length <= decimalPlaces) continue
        const reconstructedRaw = `${fusedDigits.slice(0, -decimalPlaces)}.${fusedDigits.slice(-decimalPlaces)}${cell.displayFormat.compactSuffix}`
        const value = parseMetricOcrValue('tiktok_shop', cell.key, reconstructedRaw)
        if (validateMetricCandidate(cell.key, value, reconstructedRaw)) continue
        const signature = `${cell.key}:${String(value)}`
        if (seen.has(signature)) continue
        seen.add(signature)
        reconstructed.push({
          key: cell.key,
          metric: {
            value,
            candidate_value: value,
            normalized_value: value,
            confidence: 'low',
            needs_review: true,
            status: 'review_required',
            original_label: cell.label,
            raw_value: reconstructedRaw,
            raw_ocr_value: `${normalizedRaw} + ${cardRaw}`,
            normalized_key: cell.key,
            unit: inferMetricUnit(cell.key, reconstructedRaw),
            source: 'spatial_fallback',
            strategy: 'anchor_card',
            value_source_pass: 'card',
            preprocessing_pass: 'geometry_compact_reconstruction',
            evidence_source_family: normalizedCandidate.metric.evidence_source_family
              || 'normalized_roi_ocr',
            evidence_group: normalizedCandidate.metric.evidence_group
              || 'normalized_roi:primary',
            supporting_word_boxes: [
              ...(normalizedCandidate.metric.supporting_word_boxes || []),
              ...(cardCandidate.metric.supporting_word_boxes || []),
            ],
            rejection_reason: 'Independent compact-number views preserved complementary glyphs; the reconstructed value requires review.',
          },
        })
      }
    }
  }
  return reconstructed
}

function tiktokStrategyGroupScore(
  key: CanonicalMetricKey,
  candidates: readonly MetricCandidateInput[],
  allKeyCandidates: readonly MetricCandidateInput[],
) {
  const cell = platformMetricLayouts.tiktok_shop.find(candidate => candidate.key === key)
  const reliableCandidates = candidates.filter(isTikTokReliableEvidenceCandidate)
  const scoringCandidates = reliableCandidates.length ? reliableCandidates : candidates
  const agreementCandidates = reliableCandidates.filter(isTikTokAgreementCandidate)
  const reliableStrategies = new Set(agreementCandidates
    .map(candidate => candidate.metric.strategy || 'unclassified'))
  const reliableEvidenceGroups = new Set(agreementCandidates
    .map(candidate => tiktokEvidenceGroup(candidate.metric)))
  const strategyWeight = Math.max(...candidates.map(candidate => {
    if (
      candidate.metric.strategy === 'anchor_card'
      || candidate.metric.strategy === 'normalized_roi'
    ) {
      if (
        candidate.metric.strategy === 'normalized_roi'
        && cell?.valueKind === 'count'
      ) return 5.2
      return candidate.metric.strategy === 'normalized_roi' ? 3.8 : 4.2
    }
    if (candidate.metric.strategy === 'legacy_relative') return 1
    return 2
  }))
  const formatQuality = cell
    ? Math.max(...scoringCandidates.map(candidate => {
      const raw = candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''
      const normalized = normalizeLayoutCardValue(cell, raw)
      const value = candidate.metric.value ?? candidate.metric.candidate_value
      const shape = layoutValueShapeScore(cell.valueKind, normalized, value ?? null)
      const compact = normalized.match(/^[-+]?\d+(?:[.,](\d+))?[KM]$/i)
      const fractionDigits = compact?.[1]?.length || 0
      const declaredDigits = cell.displayFormat?.decimalPlaces
      const cleanedRaw = raw.trim().replace(/[\s.;:]+$/, '')
      const explicitDeclaredPrecision = declaredDigits
        ? new RegExp(`[.,:;]\\d{${declaredDigits}}(?:[KM])?$`, 'i').test(cleanedRaw)
        : false
      const inferredDeclaredPrecision = declaredDigits
        ? new RegExp(`^\\d{${declaredDigits + 1}}(?:%|[KM])?$`, 'i')
          .test(raw.trim().replace(/\s+/g, ''))
        : false
      const groupedPrimaryGmv = cell.key === 'gmv'
        && candidate.metric.strategy === 'normalized_roi'
        && /^\d{1,3}(?:[.,]\d{3}){2,}$/.test(raw.trim())
      const adaptiveFormatRecovery = cell.valueKind === 'compact'
        && explicitDeclaredPrecision
        && candidate.metric.strategy === 'anchor_card'
        && (
          candidate.metric.preprocessing_pass === 'adaptive_light_text'
          || candidate.metric.preprocessing_pass === 'adaptive_dark_text'
        )
        && cleanedRaw !== raw.trim()
      const adaptiveInferredFormatRecovery = cell.valueKind === 'compact'
        && inferredDeclaredPrecision
        && /[KM]\s*[\s.;:]*$/i.test(raw.trim())
        && candidate.metric.strategy === 'anchor_card'
        && (
          candidate.metric.preprocessing_pass === 'adaptive_light_text'
          || candidate.metric.preprocessing_pass === 'adaptive_dark_text'
        )
        && (candidate.metric.value_confidence || 0) >= 30
      const compactIntegerDigits = compact
        ? normalized.split(/[.,]/, 1)[0].replace(/\D/g, '').length
        : 0
      const formatBonus = cell.valueKind === 'count_or_compact'
        ? compact
          ? declaredDigits && fractionDigits === declaredDigits
            ? 4.5
            : fractionDigits > 0 ? 1.5 : .2
          : Number.isInteger(value) ? 1 : 0
        : cell.valueKind === 'compact' && declaredDigits
          ? fractionDigits === declaredDigits
            ? explicitDeclaredPrecision
              ? 3.5
              : inferredDeclaredPrecision ? 3 : 1.5
            : 0
          : (cell.valueKind === 'percentage' || cell.valueKind === 'ratio')
            && declaredDigits
            && (
              new RegExp(`[.,:]\\d{${declaredDigits}}(?:%|[KM])?$`, 'i').test(raw.trim())
              || inferredDeclaredPrecision
            )
            ? inferredDeclaredPrecision ? 2 : 1.5
            : cell.valueKind === 'percentage' && /\d[.,]\d/.test(normalized)
              ? 1
              : cell.valueKind === 'duration'
                ? /^\d{1,2}\s*m\s*\d{1,2}\s*s?$/i.test(raw.trim())
                  ? 3
                  : /^\d+(?:[.,]\d+)?\s*s$/i.test(raw.trim()) ? .5 : 0
              : 0
      return shape * 2
        + formatBonus
        + (groupedPrimaryGmv ? 2.5 : 0)
        + (adaptiveFormatRecovery ? 2.5 : 0)
        + (adaptiveInferredFormatRecovery ? 2.5 : 0)
        - (cell.valueKind === 'compact' && compactIntegerDigits > 3
          ? Math.min(5, (compactIntegerDigits - 3) * 2)
          : 0)
        - tiktokMergedNumericTokenPenalty(candidate.metric, cell)
    }))
    : 0
  const independentEvidenceBonus = Math.min(
    2,
    Math.max(0, reliableEvidenceGroups.size - 1),
  )
  // Repeated preprocessing of one crop is only a small within-family
  // tie-breaker. It never creates an independent evidence group and therefore
  // cannot confirm a metric on its own.
  const sameGroupRepeatQuality = Math.min(
    .35,
    Math.max(0, agreementCandidates.length - reliableEvidenceGroups.size) * .12,
  )
  const independentStrategyBonus = Math.min(
    .5,
    Math.max(0, reliableStrategies.size - 1) * .25,
  )
  const pairQuality = Math.max(...scoringCandidates.map(candidate => {
    const pairScore = candidate.metric.pair_score || 0
    return candidate.metric.strategy === 'anchor_card'
      ? Math.min(.25, pairScore / 50)
      : Math.min(.5, pairScore / 2)
  }))
  const confidenceQuality = Math.max(...scoringCandidates.map(candidate =>
    Math.min(.5, (candidate.metric.value_confidence || 0) / 200),
  ))
  const preprocessingQuality = Math.max(...scoringCandidates.map(candidate => {
    const valueConfidence = candidate.metric.value_confidence || 0
    switch (candidate.metric.preprocessing_pass) {
      case 'inverted_grayscale':
        return valueConfidence >= 30 ? 1.35 : .45
      case 'original_color':
        return valueConfidence >= 30 ? 1.3 : .45
      case 'local_contrast':
        return valueConfidence >= 30 ? 1.15 : .4
      case 'fixed_threshold':
        return valueConfidence >= 30 ? .8 : .3
      case 'normalized_roi':
        return 1.5
      case 'geometry_compact_reconstruction':
        return 4.5
      case 'adaptive_light_text':
      case 'adaptive_dark_text':
      case 'adaptive_roi':
        return .2
      case 'original_full_image':
        return .15
      default:
        return 0
    }
  }))
  const sourceOwnershipQuality = Math.max(...scoringCandidates.map(candidate => {
    switch (candidate.metric.source) {
      case 'word_box_exact':
      case 'card_exact':
        return .6
      case 'spatial_fallback':
        return .25
      case 'raw_text_sequence':
        if (candidate.metric.strategy !== 'normalized_roi') return -2.5
        if (cell?.valueKind === 'count' || cell?.valueKind === 'duration') return .65
        return cell?.valueKind === 'compact' || cell?.valueKind === 'count_or_compact'
          ? .15
          : -2.5
      default:
        return 0
    }
  }))
  const crossEvidenceProximity = tiktokCrossEvidenceProximityBonus(
    key,
    candidates,
    allKeyCandidates,
    cell,
  )
  const exactEvidenceSupport = Math.min(
    1.5,
    Math.max(
      0,
      new Set(candidates
        .filter(candidate => candidate.metric.strategy !== 'legacy_relative')
        .map(candidate => tiktokEvidenceGroup(candidate.metric)))
        .size - 1,
    ) * 1.5,
  )
  const normalizedSpatialEvidence = cell?.valueKind === 'compact'
    && candidates.some(candidate => {
      if (
        candidate.metric.strategy !== 'normalized_roi'
        || (candidate.metric.supporting_word_boxes?.length || 0) < 2
        || (candidate.metric.value_confidence || 0) < 20
      ) return false
      const raw = candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''
      if (/-/.test(raw)) return false
      const normalized = normalizeLayoutCardValue(cell, raw)
      const declaredDigits = cell.displayFormat?.decimalPlaces
      return Boolean(
        declaredDigits
        && new RegExp(`[.,]\\d{${declaredDigits}}[KM]$`, 'i').test(normalized),
      )
    })
    ? 3.9
    : 0
  const sameCropCompactSupport = (
    cell?.valueKind === 'compact' || cell?.valueKind === 'count_or_compact'
  )
    ? Math.min(
      .35,
      Math.max(
        0,
        new Set(candidates
          .filter(candidate => candidate.metric.strategy === 'anchor_card')
          .map(candidate =>
            candidate.metric.preprocessing_pass || candidate.metric.source || 'unknown'))
          .size - 1,
      ),
    )
    : 0
  const normalizedCountNoisePenalty = cell?.valueKind === 'count'
    && scoringCandidates.every(candidate => {
      if (candidate.metric.strategy !== 'normalized_roi') return false
      const raw = candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''
      return !/^\s*\d+\s*$/.test(raw)
    })
    ? 1
    : 0
  const informationCompleteness = tiktokInformationCompletenessBonus(
    candidates,
    allKeyCandidates,
    cell,
  )
  return strategyWeight
    + formatQuality
    + independentEvidenceBonus
    + sameGroupRepeatQuality
    + independentStrategyBonus
    + pairQuality
    + confidenceQuality
    + preprocessingQuality
    + sourceOwnershipQuality
    + crossEvidenceProximity
    + exactEvidenceSupport
    + normalizedSpatialEvidence
    + sameCropCompactSupport
    + informationCompleteness
    - normalizedCountNoisePenalty
}

function tiktokInformationCompletenessBonus(
  candidates: readonly MetricCandidateInput[],
  allKeyCandidates: readonly MetricCandidateInput[],
  cell: LayoutMetricCell | undefined,
) {
  if (cell?.valueKind === 'compact' || cell?.valueKind === 'count_or_compact') {
    const isNormalizedOnly = candidates.every(candidate =>
      candidate.metric.strategy === 'normalized_roi')
    if (!isNormalizedOnly) return 0
    const originalCardCandidates = allKeyCandidates.filter(candidate =>
      candidate.metric.strategy === 'anchor_card')
    if (!originalCardCandidates.length) return 0
    const visibleDigitCount = (candidate: MetricCandidateInput) =>
      (candidate.metric.raw_value || candidate.metric.raw_ocr_value || '')
        .replace(/\D/g, '')
        .length
    const candidateDigits = Math.max(...candidates.map(visibleDigitCount))
    const maximumDigits = Math.max(...originalCardCandidates.map(visibleDigitCount))
    const candidateConfidence = Math.max(...candidates.map(candidate =>
      candidate.metric.value_confidence || 0))
    const longerCandidateConfidence = Math.max(
      ...originalCardCandidates
        .filter(candidate => visibleDigitCount(candidate) > candidateDigits)
        .map(candidate => candidate.metric.value_confidence || 0),
      0,
    )
    return candidateDigits < maximumDigits
      && longerCandidateConfidence >= candidateConfidence - 20
      ? -2.5
      : 0
  }
  const anchorCandidates = candidates.filter(candidate =>
    candidate.metric.strategy === 'anchor_card')
  if (!anchorCandidates.length) return 0
  const evidenceGroups = new Set(anchorCandidates.map(candidate =>
    tiktokEvidenceGroup(candidate.metric)))
  const comparable = allKeyCandidates.filter(candidate =>
    candidate.metric.strategy === 'anchor_card'
    && evidenceGroups.has(tiktokEvidenceGroup(candidate.metric)))
  if (!comparable.length) return 0
  const digitCount = (candidate: MetricCandidateInput) =>
    (candidate.metric.raw_value || candidate.metric.raw_ocr_value || '')
      .replace(/\D/g, '')
      .length
  const candidateDigits = Math.max(...anchorCandidates.map(digitCount))
  const maximumDigits = Math.max(...comparable.map(digitCount))
  if (!candidateDigits || candidateDigits < maximumDigits) return 0
  const candidateConfidence = Math.max(...anchorCandidates.map(candidate =>
    candidate.metric.value_confidence || 0))
  const maximumConfidence = Math.max(...comparable.map(candidate =>
    candidate.metric.value_confidence || 0))
  const minimumConfidence = anchorCandidates.some(candidate => {
    const raw = candidate.metric.raw_value || candidate.metric.raw_ocr_value || ''
    return /%$/.test(raw.trim())
  }) ? 0 : 25
  return candidateConfidence >= minimumConfidence
    && maximumConfidence - candidateConfidence <= 12
    ? .75
    : 0
}

function tiktokCrossEvidenceProximityBonus(
  key: CanonicalMetricKey,
  candidates: readonly MetricCandidateInput[],
  allKeyCandidates: readonly MetricCandidateInput[],
  cell: LayoutMetricCell | undefined,
) {
  if (
    !cell
    || !['percentage', 'ratio', 'compact', 'count_or_compact', 'count'].includes(cell.valueKind)
  ) return 0
  const candidateValues = candidates.flatMap(candidate => {
    const value = candidate.metric.value ?? candidate.metric.candidate_value
    return typeof value === 'number' && Number.isFinite(value) ? [value] : []
  })
  if (!candidateValues.length) return 0
  const evidenceGroups = new Set(candidates.map(candidate =>
    tiktokEvidenceGroup(candidate.metric)))
  const otherValues = allKeyCandidates.flatMap(candidate => {
    if (evidenceGroups.has(tiktokEvidenceGroup(candidate.metric))) return []
    const value = candidate.metric.value ?? candidate.metric.candidate_value
    return typeof value === 'number' && Number.isFinite(value) ? [value] : []
  })
  if (!otherValues.length) return 0
  const isClose = candidateValues.some(value =>
    otherValues.some(otherValue => {
      if (cell.valueKind === 'percentage' || cell.valueKind === 'ratio') {
        return Math.abs(value - otherValue) <= .05
      }
      if (cell.valueKind === 'count') return Math.abs(value - otherValue) <= 1
      const scale = Math.max(Math.abs(value), Math.abs(otherValue), 1)
      return Math.abs(value - otherValue) / scale <= .005
    }))
  return isClose ? 1.75 : 0
}

function tiktokEvidenceGroup(metric: OcrMetricValue) {
  if (metric.evidence_group) return metric.evidence_group
  if (metric.strategy === 'anchor_card') {
    return `anchor_card:${metric.normalized_key || 'unknown'}`
  }
  if (metric.strategy === 'normalized_roi') return 'normalized_roi:primary'
  if (metric.strategy === 'legacy_relative') return 'legacy_full_image:primary'
  return `${metric.source || 'unknown'}:${metric.value_source_pass || 'unknown'}`
}

function tiktokMergedNumericTokenPenalty(
  metric: OcrMetricValue,
  cell: LayoutMetricCell,
) {
  if (metric.strategy === 'anchor_card') return 0
  const raw = metric.raw_value || metric.raw_ocr_value || ''
  if (!raw.trim()) return 0
  const numericTokens = raw.match(/\d+(?:[.,:]\d+)*(?:[KM])?/gi) || []
  if (numericTokens.length <= 1) return 0
  if (
    cell.valueKind === 'duration'
    && numericTokens.length === 2
    && /^\s*\d+\s*(?:m|min)\s*\d+\s*s?\s*$/i.test(raw)
  ) return 0
  return Math.min(5, (numericTokens.length - 1) * 2.5)
}

function metricValuesEqual(left: ReportMetricValue | undefined, right: ReportMetricValue | undefined) {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < Number.EPSILON
  }
  return left === right
}

function buildOcrDiagnosticExport(
  platform: ReportDashboardPlatform,
  recognition: OcrImageRecognition,
  candidates: readonly MetricCandidateInput[],
  selection: MetricCandidateSelection,
): NonNullable<OcrReviewData['diagnostic_export']> {
  return {
    schema_version: '1',
    generated_at: new Date().toISOString(),
    source_platform: platform,
    runtime: recognition.runtime_diagnostics,
    raw_ocr_text: recognition.text,
    strategy_text: recognition.pass_output.strategy_text,
    words: recognition.words,
    card_diagnostics: recognition.pass_output.card_diagnostics || {},
    region_diagnostics: recognition.region_diagnostics,
    candidates: candidates.map(candidate => ({
      canonical_key: candidate.key,
      metric: candidate.metric,
    })),
    selected_metrics: selection.selectedByKey,
    discarded_conflicts: selection.discardedConflicts,
    missing_metric_keys: selection.missingKeys,
  }
}

function formatRecognitionOutput(recognition: OcrImageRecognition) {
  const runtimeOutput = recognition.runtime_diagnostics
    ? JSON.stringify(recognition.runtime_diagnostics, null, 2)
    : ''
  const regionOutput = recognition.region_diagnostics
    ? JSON.stringify({
      original_dimensions: recognition.region_diagnostics.original_dimensions,
      platform_candidates: recognition.region_diagnostics.platform_candidates,
      dashboard_candidates: recognition.region_diagnostics.dashboard_candidates.map(candidate => ({
        id: candidate.id,
        platform: candidate.platform,
        bounding_box: candidate.bounding_box,
        quadrilateral: candidate.quadrilateral,
        confidence: candidate.confidence,
        anchor_count: candidate.anchor_count,
        anchors: candidate.anchor_keys,
        area_ratio: candidate.area_ratio,
        aspect_ratio: candidate.aspect_ratio,
        ocr_readability: candidate.ocr_readability,
        source_method: candidate.source_method,
        perspective_correction_applied: candidate.perspective_correction_applied,
        layout_family: candidate.layout_family,
      })),
      selected_candidate_id: recognition.region_diagnostics.selected_candidate_id,
      selected_roi: recognition.region_diagnostics.selected_roi,
      normalized_roi_dimensions: recognition.region_diagnostics.normalized_roi_dimensions,
      perspective_correction_applied: recognition.region_diagnostics.perspective_correction_applied,
      ambiguous: recognition.region_diagnostics.ambiguous,
      selection_required: recognition.region_diagnostics.selection_required,
      selection_reason: recognition.region_diagnostics.selection_reason,
      fallback_usage: recognition.region_diagnostics.fallback_usage,
    }, null, 2)
    : ''
  const cardLabelOutput = recognition.pass_output.card_labels
    ? Object.entries(recognition.pass_output.card_labels)
      .map(([key, values]) => `${key}: ${values.filter(Boolean).join(' | ') || '—'}`)
      .join('\n')
    : ''
  const cardOutput = recognition.pass_output.card
    ? Object.entries(recognition.pass_output.card)
      .map(([key, values]) => `${key}: ${values.filter(Boolean).join(' | ') || '—'}`)
      .join('\n')
    : ''
  const cardDiagnostics = recognition.pass_output.card_diagnostics
    ? JSON.stringify(recognition.pass_output.card_diagnostics, null, 2)
    : ''
  const strategyOutput = recognition.pass_output.strategy_text
    ? Object.entries(recognition.pass_output.strategy_text)
      .map(([strategy, text]) => `[${strategy} strategy]\n${text}`)
      .join('\n\n')
    : ''
  return [
    runtimeOutput ? `[runtime diagnostics]\n${runtimeOutput}` : '',
    regionOutput ? `[region detection]\n${regionOutput}` : '',
    '[label pass]',
    recognition.pass_output.label,
    '[numeric pass]',
    recognition.pass_output.numeric,
    cardLabelOutput ? `[card label pass]\n${cardLabelOutput}` : '',
    cardOutput ? `[card pass]\n${cardOutput}` : '',
    cardDiagnostics ? `[card diagnostics]\n${cardDiagnostics}` : '',
    strategyOutput,
  ].filter(Boolean).join('\n\n')
}

function groupRecognizedWords(words: OcrRecognizedWord[]) {
  return groupOcrWordLines(words)
}

type RecognizedMetricLabel = {
  key: ReportMetricKey
  words: OcrRecognizedWord[]
  window: OcrWordLine
  similarity: number
}

function findRecognizedMetricLabels(
  platform: ReportDashboardPlatform,
  windows: OcrWordLine[],
): RecognizedMetricLabel[] {
  const metricAliases = Object.entries(aliases[platform])
    .map(([label, key]) => ({ key, tokens: label.split(' ') }))
    .sort((left, right) => right.tokens.length - left.tokens.length)
  const seen = new Set<string>()
  return windows.flatMap(window => {
    const searchableWords = window.words.filter(word => normalizeOcrLabel(word.text))
    const normalizedWords = searchableWords.map(word => normalizeOcrLabel(word.text))
    return metricAliases.flatMap(alias => {
      const match = findFuzzyTokenSequence(normalizedWords, alias.tokens)
      if (!match || match.similarity < .82) return []
      const matchedWords = searchableWords.slice(match.start, match.start + alias.tokens.length)
      if (!matchedWords.length) return []
      const signature = `${alias.key}:${matchedWords.map(word =>
        `${word.line_id}:${word.line_index}:${word.bounding_box.x}:${word.bounding_box.y}`,
      ).join('|')}`
      if (seen.has(signature)) return []
      seen.add(signature)
      return [{
        key: alias.key,
        words: matchedWords,
        window,
        similarity: match.similarity,
      }]
    })
  }).sort((left, right) =>
    right.similarity - left.similarity
    || right.words.length - left.words.length,
  )
}

function valueBelongsToCloserMetricLabel(
  platform: ReportDashboardPlatform,
  selected: RecognizedMetricLabel,
  valueWord: OcrRecognizedWord,
  labels: RecognizedMetricLabel[],
  spatialScale: number,
) {
  const selectedDistance = labelValueOwnershipDistance(
    unionBoundingBoxes(selected.words),
    valueWord,
    spatialScale,
  )
  return labels.some(candidate => {
    if (candidate === selected || candidate.key === selected.key) return false
    const parsed = parseMetricOcrValue(platform, candidate.key, valueWord.text)
    if (validateMetricCandidate(candidate.key, parsed, valueWord.text)) return false
    const candidateDistance = labelValueOwnershipDistance(
      unionBoundingBoxes(candidate.words),
      valueWord,
      spatialScale,
    )
    return candidateDistance + .14 < selectedDistance
  })
}

function labelValueOwnershipDistance(
  labelBox: { x: number; y: number; width: number; height: number },
  valueWord: OcrRecognizedWord,
  spatialScale: number,
) {
  const labelCenterX = labelBox.x + labelBox.width / 2
  const labelCenterY = labelBox.y + labelBox.height / 2
  const valueCenterX = valueWord.bounding_box.x + valueWord.bounding_box.width / 2
  const valueCenterY = valueWord.bounding_box.y + valueWord.bounding_box.height / 2
  const belowGap = Math.max(0, valueWord.bounding_box.y - (labelBox.y + labelBox.height))
  const sameLine = Math.abs(valueCenterY - labelCenterY)
    <= Math.max(labelBox.height, valueWord.bounding_box.height) * 1.2
  if (sameLine) {
    const rightGap = Math.max(0, valueWord.bounding_box.x - (labelBox.x + labelBox.width))
    return rightGap / Math.max(40 * spatialScale, labelBox.width)
  }
  return Math.hypot(
    Math.abs(valueCenterX - labelCenterX) / Math.max(35 * spatialScale, labelBox.width * .5),
    belowGap / Math.max(55 * spatialScale, labelBox.height * 3),
  )
}

function applyPlatformLayoutCandidates(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  recognition: OcrImageRecognition,
  candidateInputs: MetricCandidateInput[],
  consumedWords: Set<OcrRecognizedWord>,
) {
  const dimensions = recognition.original_dimensions
  if (!dimensions.width || !dimensions.height) return

  for (const cell of platformMetricLayouts[platform]) {
    const expectedValueBox = recognizedMetricCellBox(platform, cell, recognition)
    const labelMatch = findLayoutLabelWords(platform, cell, recognition)
    const wordsInCell = recognition.words.filter(word => {
      if (!/\d/.test(word.text)) return false
      return wordCenterIsInsideBox(word, expectedValueBox)
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
      const normalizedRaw = normalizeLayoutCardValue(cell, rawValue)
      const parsedValue = parseMetricOcrValue(platform, cell.key, normalizedRaw)
      const sanityError = validateMetricCandidate(cell.key, parsedValue, normalizedRaw)
      const shapeScore = layoutValueShapeScore(cell.valueKind, normalizedRaw, parsedValue)
      if (sanityError || shapeScore <= 0) return []
      const box = unionBoundingBoxes(words)
      const centerX = box.x + box.width / 2
      const centerY = box.y + box.height / 2
      const expectedCenterX = expectedValueBox.x + expectedValueBox.width / 2
      const expectedCenterY = expectedValueBox.y + expectedValueBox.height / 2
      const relativeDistance = Math.hypot(
        (centerX - expectedCenterX) / Math.max(expectedValueBox.width / 2, 1),
        (centerY - expectedCenterY) / Math.max(expectedValueBox.height / 2, 1),
      )
      const rawSpatialScore = 1 - Math.min(1, relativeDistance) * .35
      const spatialScore = words[0].pass === 'card' ? Math.min(.95, rawSpatialScore) : rawSpatialScore
      const valueConfidence = Math.min(...words.map(word => word.confidence))
      const passBonus = layoutPassBonus(cell.valueKind, words[0].pass)
      const selectionScore = shapeScore * .45 + (valueConfidence / 100) * .2 + spatialScore * .3 + passBonus
      return [{
        words,
        rawValue,
        normalizedRaw,
        parsedValue,
        spatialScore,
        valueConfidence,
        selectionScore,
        pass: words[0].pass,
      }]
    }).sort((left, right) => right.selectionScore - left.selectionScore)

    if (!candidates.length) continue
    for (const candidate of candidates) {
      const competingValues = candidates.filter(other =>
        other !== candidate
        && !metricValuesEqual(other.parsedValue, candidate.parsedValue)
        && candidate.selectionScore - other.selectionScore < .12,
      ).length
      const confidenceNumber = Math.min(candidate.valueConfidence, candidate.spatialScore * 100)
      const confidence = confidenceFromScore(confidenceNumber)
      const accepted = confidence === 'high'
        && Boolean(labelMatch && labelMatch.similarity >= .95)
        && competingValues === 0
      const valueBox = unionBoundingBoxes(candidate.words)
      const pairScore = Math.min(
        1,
        candidate.selectionScore + (labelMatch ? labelMatch.similarity * .1 : 0),
      )
      collectMetricCandidate(candidateInputs, cell.key, {
        value: candidate.parsedValue,
        candidate_value: candidate.parsedValue,
        confidence,
        needs_review: !accepted,
        original_label: cell.label,
        raw_value: candidate.rawValue,
        normalized_key: cell.key,
        unit: inferMetricUnit(cell.key, candidate.rawValue),
        bounding_box: labelMatch
          ? unionBoundingBoxes([...labelMatch.words, ...candidate.words])
          : valueBox,
        label_box: labelMatch ? unionBoundingBoxes(labelMatch.words) : undefined,
        value_box: valueBox,
        pairing_reason: accepted
          ? 'Exact label and value were found in the same normalized platform grid cell.'
          : competingValues > 0
            ? 'The platform grid cell contains competing OCR values.'
            : labelMatch
              ? 'The value is in the expected grid cell, but OCR confidence needs review.'
              : 'The value was inferred from the platform grid position without a readable label.',
        pair_score: pairScore,
        source: 'spatial_fallback',
        status: accepted ? 'confirmed' : 'review_required',
        rejection_reason: candidate.normalizedRaw !== candidate.rawValue
          ? 'The displayed value format was repaired using the identified KPI card.'
          : accepted
            ? undefined
            : 'The platform card was located, but OCR value confidence is below the auto-fill threshold.',
        label_confidence: 100,
        value_confidence: candidate.valueConfidence,
        spatial_score: candidate.spatialScore,
        label_source: 'platform_layout',
        value_source_pass: candidate.pass,
        evidence_source_family: candidate.words[0]?.evidence_source_family,
        evidence_group: candidate.words[0]?.evidence_group,
      })
    }
    candidates[0].words.forEach(word => consumedWords.add(word))
    labelMatch?.words.forEach(word => consumedWords.add(word))
  }
}

function findLayoutLabelWords(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  cell: LayoutMetricCell,
  recognition: OcrImageRecognition,
) {
  const words = recognition.words
  const dimensions = recognition.original_dimensions
  const expectedValueBox = recognizedMetricCellBox(platform, cell, recognition)
  const expectedCenterX = expectedValueBox.x + expectedValueBox.width / 2
  const expectedCenterY = expectedValueBox.y + expectedValueBox.height / 2
  const metricAliases = Object.entries(aliases[platform])
    .filter((entry): entry is [string, ReportMetricKey] => entry[1] === cell.key)
    .map(([label]) => ({ label, tokens: label.split(' ') }))
    .sort((left, right) => right.tokens.length - left.tokens.length)
  const lines = groupRecognizedWords(words.filter(word => word.pass === 'label'))
  return lines.flatMap(line => {
    const searchableWords = line.words.filter(word => normalizeOcrLabel(word.text))
    const normalizedWords = searchableWords.map(word => normalizeOcrLabel(word.text))
    return metricAliases.flatMap(alias => {
      const match = findFuzzyTokenSequence(normalizedWords, alias.tokens)
      if (!match || match.similarity < .82) return []
      const matchedWords = searchableWords.slice(match.start, match.start + alias.tokens.length)
      if (!matchedWords.length) return []
      const box = unionBoundingBoxes(matchedWords)
      const centerX = box.x + box.width / 2
      const centerY = box.y + box.height / 2
      const horizontalLimit = Math.max(expectedValueBox.width * .75, dimensions.width * .045)
      const verticalLimit = Math.max(expectedValueBox.height * 1.5, dimensions.height * .055)
      const aboveValue = centerY <= expectedCenterY + expectedValueBox.height / 2
        && centerY >= expectedCenterY - verticalLimit
      if (Math.abs(centerX - expectedCenterX) > horizontalLimit || !aboveValue) return []
      return [{
        words: matchedWords,
        similarity: match.similarity,
        distance: Math.hypot(
          (centerX - expectedCenterX) / horizontalLimit,
          (expectedCenterY - centerY) / verticalLimit,
        ),
      }]
    })
  }).sort((left, right) =>
    right.similarity - left.similarity || left.distance - right.distance,
  )[0]
}

function recognizedMetricCellBox(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  cell: LayoutMetricCell,
  recognition: OcrImageRecognition,
) {
  const selectedRegion = recognition.region_diagnostics?.dashboard_candidates.find(candidate =>
    candidate.id === recognition.region_diagnostics?.selected_candidate_id,
  )
  if (selectedRegion) {
    return roiCellBoundingBox(
      selectedRegion,
      normalizeMetricCellToRoi(platform, cell),
      'value',
    )
  }
  return {
    x: (cell.x - cell.width / 2) * recognition.original_dimensions.width,
    y: (cell.y - cell.height / 2) * recognition.original_dimensions.height,
    width: cell.width * recognition.original_dimensions.width,
    height: cell.height * recognition.original_dimensions.height,
  }
}

function wordIsInsideRecognizedMetricCell(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  word: OcrRecognizedWord,
  cell: LayoutMetricCell,
  recognition: OcrImageRecognition,
  expansion = 1,
) {
  return wordCenterIsInsideBox(
    word,
    recognizedMetricCellBox(platform, cell, recognition),
    expansion,
  )
}

function wordIsInsideLayoutCell(
  word: OcrRecognizedWord,
  cell: LayoutMetricCell,
  dimensions: { width: number; height: number },
  expansion = 1,
) {
  if (!dimensions.width || !dimensions.height) return false
  const centerX = (word.bounding_box.x + word.bounding_box.width / 2) / dimensions.width
  const centerY = (word.bounding_box.y + word.bounding_box.height / 2) / dimensions.height
  return Math.abs(centerX - cell.x) <= cell.width * expansion / 2
    && Math.abs(centerY - cell.y) <= cell.height * expansion / 2
}

function wordCenterIsInsideBox(
  word: OcrRecognizedWord,
  box: { x: number; y: number; width: number; height: number },
  expansion = 1,
) {
  const centerX = word.bounding_box.x + word.bounding_box.width / 2
  const centerY = word.bounding_box.y + word.bounding_box.height / 2
  const halfWidth = box.width * expansion / 2
  const halfHeight = box.height * expansion / 2
  const boxCenterX = box.x + box.width / 2
  const boxCenterY = box.y + box.height / 2
  return Math.abs(centerX - boxCenterX) <= halfWidth
    && Math.abs(centerY - boxCenterY) <= halfHeight
}

function layoutPassBonus(
  kind: LayoutValueKind,
  pass: OcrRecognizedWord['pass'],
) {
  if (kind === 'count' || kind === 'count_or_compact') return pass === 'label' ? .02 : .03
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
    case 'count_or_compact':
      return compact && decimal
        ? 1
        : compact
          ? .8
          : Number.isInteger(parsedValue)
            ? .95
            : .4
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
  spatialScale = 1,
) {
  const labelBox = unionBoundingBoxes(labelWords)
  const labelCenterX = labelBox.x + labelBox.width / 2
  const labelRight = labelBox.x + labelBox.width
  const labelCenterY = labelBox.y + labelBox.height / 2
  const labelBottom = labelBox.y + labelBox.height
  const candidates = lines
    .flatMap(line => line.words)
    .filter(word =>
      word.pass !== 'card'
      && /\d/.test(word.text)
      && !consumedWords.has(word),
    )
    .map(word => {
      const centerX = word.bounding_box.x + word.bounding_box.width / 2
      const centerY = word.bounding_box.y + word.bounding_box.height / 2
      const verticalGap = word.bounding_box.y - labelBottom
      const horizontalGap = Math.abs(centerX - labelCenterX)
      const rightGap = word.bounding_box.x - labelRight
      const sameLine = Math.abs(centerY - labelCenterY) <= Math.max(labelBox.height, word.bounding_box.height)
        && rightGap >= -5 * spatialScale
        && rightGap <= 120 * spatialScale
      const sameColumn = verticalGap >= -3 * spatialScale
        && verticalGap <= 70 * spatialScale
        && horizontalGap <= Math.max(35 * spatialScale, labelBox.width * 0.35)
      const spatialFallback = verticalGap >= 0
        && verticalGap <= 60 * spatialScale
        && horizontalGap <= Math.max(50 * spatialScale, labelBox.width * 0.45)
      const spatialScore = sameLine
        ? rightGap <= 40 * spatialScale
          ? 1
          : 1 - Math.min(
            0.45,
            (rightGap - 40 * spatialScale) / (180 * spatialScale),
          )
        : sameColumn
          ? 1 - Math.min(
            0.3,
            (verticalGap / (70 * spatialScale)) * 0.2
            + (horizontalGap / Math.max(35 * spatialScale, labelBox.width * 0.35)) * 0.1,
          )
          : spatialFallback
            ? 0.7
            : 0
      return {
        word,
        spatialScore,
        pairing: sameLine ? 'same_line' as const : sameColumn ? 'same_column' as const : 'spatial' as const,
      }
    })
    .filter(candidate => candidate.spatialScore >= 0.65)
    .sort((left, right) =>
      (
        right.spatialScore
        + (right.word.pass === 'numeric' ? .05 : right.word.pass === 'label' ? .04 : 0)
      ) - (
        left.spatialScore
        + (left.word.pass === 'numeric' ? .05 : left.word.pass === 'label' ? .04 : 0)
      ),
    )
  // Keep label/value pairing inside the same OCR pass whenever that pass
  // produced a viable value. A value from an isolated card crop can be closer
  // in absolute pixels, but it belongs to a different recognition coordinate
  // context and is already evaluated independently by applyCardOutputCandidates.
  const samePassCandidates = candidates.filter(candidate =>
    candidate.word.pass === labelLine.pass,
  )
  const rankedCandidates = samePassCandidates.length > 0 ? samePassCandidates : candidates
  const selected = rankedCandidates[0]
  if (!selected) return undefined
  const suffix = lines.flatMap(line => line.words).find(word => {
    if (!/^[KM]$/i.test(word.text.trim())) return false
    if (word.pass !== selected.word.pass || consumedWords.has(word)) return false
    const selectedRight = selected.word.bounding_box.x + selected.word.bounding_box.width
    const gap = word.bounding_box.x - selectedRight
    const selectedCenterY = selected.word.bounding_box.y + selected.word.bounding_box.height / 2
    const suffixCenterY = word.bounding_box.y + word.bounding_box.height / 2
    return gap >= -2 * spatialScale
      && gap <= Math.max(18 * spatialScale, selected.word.bounding_box.height)
      && Math.abs(selectedCenterY - suffixCenterY) <= Math.max(
        selected.word.bounding_box.height,
        word.bounding_box.height,
      )
  })
  const supportingWords = suffix ? [selected.word, suffix] : [selected.word]
  const selectedWord = suffix
    ? {
      ...selected.word,
      text: `${selected.word.text}${suffix.text.trim()}`,
      confidence: Math.min(selected.word.confidence, suffix.confidence),
      bounding_box: unionBoundingBoxes(supportingWords),
    }
    : selected.word
  const selectedValue = parseOcrValue(selectedWord.text)
  const competingValues = rankedCandidates.filter(candidate =>
    candidate !== selected
    && !metricValuesEqual(parseOcrValue(candidate.word.text), selectedValue)
    && selected.spatialScore - candidate.spatialScore < .12,
  ).length
  return {
    ...selected,
    word: selectedWord,
    supportingWords,
    competingValues,
  }
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
  const currencyMetrics = new Set<ReportMetricKey>([
    'revenue', 'gmv', 'sales', 'gpm', 'average_basket_size',
    'average_order_value', 'gmv_per_hour', 'advertising_cost', 'estimated_gmv',
  ])
  const countMetrics = new Set<ReportMetricKey>([
    'orders', 'buyers', 'items_sold', 'total_views', 'engaged_viewers', 'peak_concurrent_viewers',
    'product_clicks', 'likes', 'comments', 'shares', 'new_followers', 'current_viewers',
    'impressions', 'sku_orders', 'add_to_cart', 'pcu', 'total_viewers',
  ])

  if (percentageMetrics.has(key) && value > 100) return 'Percentage metrics must be between 0 and 100.'
  if (percentageMetrics.has(key) && /₫|đ|vnd|usd|\$/i.test(rawValue)) return 'A currency token cannot be mapped into a percentage metric.'
  if (percentageMetrics.has(key) && isDurationOcrToken(rawValue)) return 'A duration token cannot be mapped into a percentage metric.'
  if (durationMetrics.has(key) && value > 86_400) return 'Duration metrics must be between 0 and 86,400 seconds.'
  if (durationMetrics.has(key) && !isDurationOcrToken(rawValue)) return 'A duration metric must use HH:MM:SS, MM:SS, or seconds.'
  if (countMetrics.has(key) && !Number.isInteger(value)) return 'Count metrics must be whole numbers.'
  if (countMetrics.has(key) && /(?:%|[xX°ºoO])\s*$/.test(rawValue.trim())) return 'A percentage token cannot be mapped into a count metric.'
  if (countMetrics.has(key) && isDurationOcrToken(rawValue)) return 'A duration token cannot be mapped into a count metric.'
  if (countMetrics.has(key) && /₫|đ|usd/i.test(rawValue)) return 'A currency token cannot be mapped into a count metric.'
  if (countMetrics.has(key) && /₫|đ|vnd|\$/i.test(rawValue)) return 'A currency token cannot be mapped into a count metric.'
  if (currencyMetrics.has(key) && (/(?:%|[xX°ºoO])\s*$/.test(rawValue.trim()) || isDurationOcrToken(rawValue))) {
    return 'A percentage or duration token cannot be mapped into a currency metric.'
  }
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
  if (isPercentageMetric(key) || rawValue.includes('%')) return 'percent'
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
