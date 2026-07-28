import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { OcrReviewData } from '../lib/types/database.types.ts'
import {
  applySelectedMetricsToState,
  type CanonicalMetricKey,
  type MetricState,
} from '../lib/utils/ocrCanonical.ts'
import { parseDashboardOcrText } from '../lib/utils/ocrMetrics.ts'
import {
  canonicalizeOcrReview,
  clearOcrDerivedMetricState,
  ocrCandidateMetricKeys,
  parseAndApplyOcrText,
  platformMetricBindingKeys,
  shouldInitializeOcrSelection,
} from '../lib/utils/ocrReview.ts'

const shopeeSample = [
  'Sales: 21.281.718,00',
  'Engaged Viewer: 521',
  'Comments: 51',
  'ATC: 436',
  'Total Views: 13.262',
  'Avg. Viewing Duration: 00:00:25',
  'Comments Rate: 0,4%',
  'GPM: 1.604.714,07',
  'Orders: 109',
  'ABS: 195.245,12',
  'Total Viewers: 8.380',
  'PCU: 107',
  'CTR: 8,4%',
  'Click to Order Rate: 9,8%',
  'Buyers: 104',
  'Items Sold: 116',
].join('\n')

const expectedShopeeMetrics: MetricState = {
  sales: 21281718,
  engaged_viewers: 521,
  comments: 51,
  add_to_cart: 436,
  total_views: 13262,
  average_view_duration_seconds: 25,
  comment_rate: 0.4,
  gpm: 1604714.07,
  orders: 109,
  average_basket_size: 195245.12,
  total_viewers: 8380,
  pcu: 107,
  ctr: 8.4,
  click_to_order_rate: 9.8,
  buyers: 104,
  items_sold: 116,
}

test('canonical review accepts confirmed, review, and low-confidence candidates', () => {
  const parsed = parseDashboardOcrText('shopee_live', shopeeSample, 'raw_text_exact')
  const review: OcrReviewData = {
    ...parsed,
    metrics: Object.fromEntries(
      Object.entries(parsed.metrics).map(([key, metric], index) => [
        key,
        metric && {
          ...metric,
          normalized_key: 'orders',
          status: index % 3 === 0
            ? 'confirmed'
            : index % 3 === 1
              ? 'review_required'
              : 'low_confidence',
        },
      ]),
    ),
  }

  const canonical = canonicalizeOcrReview(review)
  assert.deepEqual(applySelectedMetricsToState({}, canonical), expectedShopeeMetrics)
  assert.deepEqual(Object.keys(canonical.metrics), Object.keys(expectedShopeeMetrics))
  for (const [key, metric] of Object.entries(canonical.metrics)) {
    assert.equal(metric?.normalized_key, key)
  }
})

test('canonical selector preserves zero and excludes rejected, invalid, and non-finite values', () => {
  const review: OcrReviewData = {
    status: 'review_required',
    metrics: {
      comments: {
        value: 0,
        normalized_key: 'comments',
        confidence: 'high',
        status: 'confirmed',
      },
      orders: {
        value: 109,
        normalized_key: 'orders',
        confidence: 'high',
        status: 'rejected',
      },
      pcu: {
        value: Number.NaN,
        normalized_key: 'pcu',
        confidence: 'low',
        status: 'low_confidence',
      },
      sales: {
        value: Number.POSITIVE_INFINITY,
        normalized_key: 'sales',
        confidence: 'low',
        status: 'review_required',
      },
      gpm: {
        value: null,
        normalized_key: 'gpm',
        confidence: 'low',
        status: 'empty',
      },
    },
  }

  assert.deepEqual(applySelectedMetricsToState({}, review), { comments: 0 })
  assert.deepEqual(ocrCandidateMetricKeys(review), ['comments'])
})

test('automatic OCR merge preserves protected edits and explicit Apply replaces them', () => {
  const review = parseDashboardOcrText(
    'shopee_live',
    'Sales: 21.281.718,00\nOrders: 109',
    'raw_text_exact',
  )
  const current: MetricState = { sales: 999, orders: 8 }
  const protectedKeys: CanonicalMetricKey[] = ['sales', 'orders']

  assert.deepEqual(
    applySelectedMetricsToState(current, review, { protectedKeys }),
    current,
  )
  assert.deepEqual(
    applySelectedMetricsToState(current, review, {
      protectedKeys,
      overwriteProtected: true,
    }),
    { sales: 21281718, orders: 109 },
  )
})

test('OCR reset clears derived values and preserves protected manual metrics', () => {
  const metricState: MetricState = { sales: 21281718, comments: 51, likes: 4 }
  const clearedMetrics = clearOcrDerivedMetricState(
    metricState,
    ['sales', 'comments', 'likes'],
    ['likes'],
  )
  assert.deepEqual(clearedMetrics, { likes: 4 })
})

test('same selected shift does not reinitialize OCR state during rerenders', () => {
  assert.equal(shouldInitializeOcrSelection(null, 'shift-1', true), true)
  assert.equal(shouldInitializeOcrSelection('shift-1', 'shift-1', true), false)
  assert.equal(shouldInitializeOcrSelection('shift-1', 'shift-2', true), true)
  assert.equal(shouldInitializeOcrSelection(null, 'shift-1', false), false)
})

test('production-like and development-like OCR application use the same canonical path', () => {
  const first = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: shopeeSample,
    currentMetrics: {},
    overwriteOcrValues: true,
  })
  const second = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: shopeeSample,
    currentMetrics: {},
    overwriteOcrValues: true,
  })

  assert.deepEqual(first.metrics, expectedShopeeMetrics)
  assert.deepEqual(second.metrics, expectedShopeeMetrics)
  assert.deepEqual(ocrCandidateMetricKeys(first.review), Object.keys(expectedShopeeMetrics))
  const bindings = new Set(platformMetricBindingKeys('shopee_live'))
  for (const key of Object.keys(expectedShopeeMetrics)) {
    assert.equal(bindings.has(key as CanonicalMetricKey), true)
  }
})

test('both production forms bind canonical metric state to rendered inputs', () => {
  const reportSource = readFileSync(
    new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url),
    'utf8',
  )
  const liveSource = readFileSync(
    new URL('../components/features/live/DashboardUpdateModal.tsx', import.meta.url),
    'utf8',
  )
  const boundFieldsSource = readFileSync(
    new URL('../components/features/reports/OcrBoundMetricFields.tsx', import.meta.url),
    'utf8',
  )

  assert.match(reportSource, /setMetricValues\(current => parseAndApplyOcrText/)
  assert.match(
    reportSource,
    /setMetricValues\(current => \{\s*const merged = applySelectedMetricsToState/,
  )
  assert.match(reportSource, /values=\{metricValues\}/)
  assert.match(liveSource, /setMetricValues\(current => parseAndApplyOcrText/)
  assert.match(liveSource, /setMetricValues\(current => applySelectedMetricsToState/)
  assert.match(liveSource, /values=\{metricValues\}/)
  assert.match(boundFieldsSource, /value=\{metricValueToInput\(values\[key\]\)\}/)
})
