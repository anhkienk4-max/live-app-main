import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { parseAndApplyOcrText } from '../lib/utils/ocrReview.ts'
import { parseMetricInputValue, type MetricState } from '../lib/utils/ocrCanonical.ts'
import {
  getMissingFinalReportMetricKeys,
  serializeFinalReportMetricState,
} from '../lib/utils/ocrMetricSerialization.ts'

const shopeeMetrics: MetricState = {
  sales: 100,
  orders: 5,
  pcu: 10,
  total_viewers: 20,
  comments: 4,
  shares: 1,
  add_to_cart: 3,
  ctr: 2,
  click_to_order_rate: 4,
  average_basket_size: 20,
}

const tiktokMetrics: MetricState = {
  gmv: 100,
  sku_orders: 5,
  current_viewers: 10,
  total_views: 20,
  comments: 4,
  shares: 1,
  product_clicks: 3,
  live_ctr: 2,
  ctor: 4,
  average_order_value: 20,
}

test('Shares is required at confirmation for Shopee and TikTok', () => {
  assert.deepEqual(getMissingFinalReportMetricKeys('shopee_live', { ...shopeeMetrics, shares: null }), ['shares'])
  assert.deepEqual(getMissingFinalReportMetricKeys('tiktok_shop', { ...tiktokMetrics, shares: null }), ['shares'])
})

test('confirmation reports every missing required platform metric', () => {
  assert.deepEqual(getMissingFinalReportMetricKeys('shopee_live', {}), [
    'sales', 'orders', 'pcu', 'total_viewers', 'comments', 'shares',
    'add_to_cart', 'ctr', 'click_to_order_rate', 'average_basket_size',
  ])
  assert.deepEqual(getMissingFinalReportMetricKeys('tiktok_shop', {}), [
    'gmv', 'sku_orders', 'current_viewers', 'total_views', 'comments',
    'shares', 'product_clicks', 'live_ctr', 'ctor', 'average_order_value',
  ])
})

test('draft serialization preserves incomplete metrics and real zero values', () => {
  const report = serializeFinalReportMetricState('shopee_live', {
    sales: 0,
    orders: 5,
    comments: 2,
  })

  assert.equal(report.revenue, 0)
  assert.equal(report.shares, undefined)
  assert.equal(report.comments, 2)
  assert.deepEqual(report.normalized_metrics, { sales: 0, orders: 5, comments: 2 })
  assert.deepEqual(report.platform_metrics, report.normalized_metrics)

  const emptyDraft = serializeFinalReportMetricState('tiktok_shop', {})
  assert.equal(emptyDraft.revenue, undefined)
  assert.equal(emptyDraft.orders, undefined)
  assert.equal(emptyDraft.comments, undefined)
  assert.equal(emptyDraft.shares, undefined)
  assert.deepEqual(emptyDraft.normalized_metrics, {})
})

test('Shopee and TikTok OCR values satisfy their own required metrics', () => {
  const shopee = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: 'Sales: 100\nOrders: 5\nPCU: 10\nTotal Viewers: 20\nComments: 4\nShares: 1\nATC: 3\nCTR: 2%\nClick to Order Rate: 4%\nABS: 20',
    currentMetrics: {},
    overwriteOcrValues: true,
  })
  const tiktok = parseAndApplyOcrText({
    platform: 'tiktok_shop',
    rawText: [
      'GMV đã ghi nhận: 8.761.919',
      'Số món bán ra từ sự kiện: 103',
      'Người xem hiện tại: 7',
      'Lượt hiển thị: 91.95K',
      'Lượt xem: 2.31K',
      'Chi phí quảng cáo: 2.11M',
      'Tỷ lệ nhấn: 2,52%',
      'ROI GMV Max: 4.95',
      'CTOR: 6,26%',
      'Thời lượng xem TB: 40s',
      'Người theo dõi mới: 18',
      'Khách hàng: 46',
      'Đơn hàng SKU đã ghi nhận: 95',
      'Bình luận: 234',
      'Lượt nhấp vào sản phẩm: 847',
      'AOV: 165.32K',
      'CTR của LIVE: 36,62%',
      'Lượt chia sẻ: 60',
      'GMV ước tính: 8.98M',
    ].join('\n'),
    currentMetrics: {},
    overwriteOcrValues: true,
  })

  assert.deepEqual(getMissingFinalReportMetricKeys('shopee_live', shopee.metrics), [])
  assert.deepEqual(getMissingFinalReportMetricKeys('tiktok_shop', tiktok.metrics), [])
  assert.equal(serializeFinalReportMetricState('shopee_live', shopee.metrics).shares, 1)
  assert.equal(serializeFinalReportMetricState('tiktok_shop', tiktok.metrics).shares, 60)
})

test('manually entered zero is present and not confused with a missing metric', () => {
  const manualMetrics = { ...tiktokMetrics, shares: parseMetricInputValue('0') }
  const report = serializeFinalReportMetricState('tiktok_shop', manualMetrics)

  assert.deepEqual(getMissingFinalReportMetricKeys('tiktok_shop', manualMetrics), [])
  assert.equal(report.shares, 0)
  assert.equal(report.normalized_metrics?.shares, 0)
})

test('database migration stores missing draft metrics as null and guards confirmation', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260912083056_report_draft_nullable_metrics.sql', import.meta.url),
    'utf8',
  )

  assert.match(migration, /alter column shares drop not null/i)
  assert.match(migration, /\(p_data->>'shares'\)::integer/)
  assert.match(migration, /REPORT_REQUIRED_METRICS_MISSING/)
  assert.match(migration, /new\.dashboard_platform = 'shopee_live'/)
  assert.match(migration, /new\.dashboard_platform = 'tiktok_shop'/)
  assert.match(migration, /new\.status = 'confirmed' and not new\.metrics_confirmed/i)
  assert.match(migration, /new\.status not in \('confirmed', 'archived'\)/i)
  assert.match(migration, /REPORT_OCR_REVIEW_UNRESOLVED/)
  assert.match(migration, /status' in \('review_required', 'low_confidence'\)/i)
  assert.match(migration, /needs_review' = 'true'::jsonb/i)
  for (const column of ['revenue', 'orders', 'peak_viewer', 'average_viewer', 'comments', 'shares']) {
    assert.match(migration, new RegExp(`alter column ${column} drop not null`, 'i'))
  }
  for (const [metric, type] of [
    ['revenue', 'numeric'],
    ['orders', 'integer'],
    ['peak_viewer', 'integer'],
    ['average_viewer', 'integer'],
    ['comments', 'integer'],
    ['shares', 'integer'],
  ]) {
    assert.doesNotMatch(migration, new RegExp(`coalesce\\(\\(p_data->>'${metric}'\\)::${type}, 0\\)`, 'i'))
    assert.doesNotMatch(migration, new RegExp(`then coalesce\\(\\(p_patch->>'${metric}'\\)::${type}, 0\\)`, 'i'))
  }
})
