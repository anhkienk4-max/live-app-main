import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { OcrBoundMetricFields } from '../components/features/reports/OcrBoundMetricFields.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import {
  selectBestMetricCandidates,
  shopeeMainMetricKeys,
  shopeeSupplementaryMetricKeys,
  tiktokCentralMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '../lib/utils/ocrCanonical.ts'
import { parseAndApplyOcrText } from '../lib/utils/ocrReview.ts'
import {
  serializeCanonicalMetrics,
  serializeFinalReportMetricState,
  serializeLiveMetricState,
} from '../lib/utils/ocrMetricSerialization.ts'

const tiktokDashboardText = [
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
].join('\n')

const shopeeDashboardText = [
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
  'Likes: 1.735',
  'Shares: 8',
  'Duration: 02:01:46',
].join('\n')

const tiktokExpected: MetricState = {
  gmv: 8761919,
  items_sold: 103,
  current_viewers: 7,
  impressions: 91950,
  total_views: 2310,
  advertising_cost: 2110000,
  click_rate: 2.52,
  roi_gmv_max: 4.95,
  ctor: 6.26,
  average_view_duration_seconds: 40,
  new_followers: 18,
  buyers: 46,
  sku_orders: 95,
  comments: 234,
  product_clicks: 847,
  average_order_value: 165320,
  live_ctr: 36.62,
  shares: 60,
  estimated_gmv: 8980000,
}

const shopeeExpected: MetricState = {
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
  likes: 1735,
  shares: 8,
  live_duration_seconds: 7306,
}

function renderMetricInputs(
  keys: readonly CanonicalMetricKey[],
  values: MetricState,
  review: ReturnType<typeof parseAndApplyOcrText>['review'],
) {
  return renderToStaticMarkup(
    <LanguageProvider>
      <OcrBoundMetricFields
        metricKeys={keys}
        values={values}
        review={review}
        editable
        canReview={false}
        onChange={() => undefined}
      />
    </LanguageProvider>,
  )
}

function assertInputValue(html: string, key: CanonicalMetricKey, expected: number) {
  const input = html.match(new RegExp(`<input[^>]*id="ocr-metric-input-${key}"[^>]*>`))?.[0]
  assert.ok(input, `Rendered input ${key} was not found`)
  assert.match(input, new RegExp(`value="${String(expected).replace('.', '\\.')}"`))
}

test('Shopee renders 16 main KPI inputs and three separate supplementary inputs through one numeric state', () => {
  const result = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: shopeeDashboardText,
    currentMetrics: {},
    overwriteOcrValues: true,
  })
  assert.deepEqual(result.metrics, shopeeExpected)
  const mainHtml = renderMetricInputs(shopeeMainMetricKeys, result.metrics, result.review)
  const supplementaryHtml = renderMetricInputs(shopeeSupplementaryMetricKeys, result.metrics, result.review)
  assert.equal((mainHtml.match(/<input/g) || []).length, 16)
  assert.equal((supplementaryHtml.match(/<input/g) || []).length, 3)
  for (const key of shopeeMainMetricKeys) assertInputValue(mainHtml, key, shopeeExpected[key]!)
  for (const key of shopeeSupplementaryMetricKeys) assertInputValue(supplementaryHtml, key, shopeeExpected[key]!)
  assert.equal(result.review.unmapped_fields?.some(field => shopeeMainMetricKeys.includes(field.normalized_key as never)), false)
  assert.doesNotMatch(mainHtml, /ocr-metric-input-revenue/)
  assert.equal(shopeeExpected.average_basket_size, 195245.12)
  assert.equal(shopeeExpected.total_views, 13262)
})

test('TikTok renders exactly 19 central KPI inputs and preserves values on rerender', () => {
  const result = parseAndApplyOcrText({
    platform: 'tiktok_shop',
    rawText: tiktokDashboardText,
    currentMetrics: {},
    overwriteOcrValues: true,
  })
  assert.deepEqual(result.metrics, tiktokExpected)
  const firstRender = renderMetricInputs(tiktokCentralMetricKeys, result.metrics, result.review)
  const secondRender = renderMetricInputs(tiktokCentralMetricKeys, { ...result.metrics }, result.review)
  assert.equal((firstRender.match(/<input/g) || []).length, 19)
  assert.equal(secondRender, firstRender)
  for (const key of tiktokCentralMetricKeys) assertInputValue(firstRender, key, tiktokExpected[key]!)
  assert.notEqual(result.metrics.gmv, result.metrics.estimated_gmv)
  assert.equal(result.review.unmapped_fields?.some(field => tiktokCentralMetricKeys.includes(field.normalized_key as never)), false)
})

test('candidate selector is deterministic and raw sequence cannot overwrite same-card data', () => {
  const candidates = [
    {
      key: 'sales' as const,
      metric: { value: 99, confidence: 'high' as const, needs_review: true, source: 'raw_text_sequence' as const, status: 'review_required' as const },
    },
    {
      key: 'sales' as const,
      metric: { value: 21281718, confidence: 'high' as const, needs_review: false, source: 'card_exact' as const, status: 'confirmed' as const },
    },
  ]
  const forward = selectBestMetricCandidates(candidates, ['sales'])
  const reverse = selectBestMetricCandidates([...candidates].reverse(), ['sales'])
  assert.equal(forward.selectedByKey.sales?.value, 21281718)
  assert.deepEqual(reverse, forward)
  assert.equal(forward.discardedConflicts.length, 1)
})

test('submit adapters preserve missing metrics as undefined and never synthesize zero', () => {
  const canonical = serializeCanonicalMetrics('tiktok_shop', {
    gmv: 8761919,
    current_viewers: null,
  })
  assert.deepEqual(canonical, { gmv: 8761919 })

  const live = serializeLiveMetricState('tiktok_shop', tiktokExpected)
  assert.equal(live.revenue, 8761919)
  assert.equal(live.orders, 95)
  assert.equal(live.likes, undefined)
  assert.equal(live.total_viewers, undefined)

  const report = serializeFinalReportMetricState('tiktok_shop', tiktokExpected)
  assert.equal(report.likes, undefined)
  assert.equal(report.average_order_value, 165320)
})

test('both production modals bind exact platform lists to metricValues and never mirror KPI fields into formData', () => {
  const reportSource = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
  const liveSource = readFileSync(new URL('../components/features/live/DashboardUpdateModal.tsx', import.meta.url), 'utf8')
  for (const source of [reportSource, liveSource]) {
    assert.match(source, /values=\{metricValues\}/)
    assert.match(source, /metricKeys=\{filteredMainMetricKeys\}/)
    assert.doesNotMatch(source, /formData\.(?:revenue|gmv|orders|peak_viewers|current_viewers|total_views|total_viewers|likes|comments|shares)/)
    assert.doesNotMatch(source, /applyOcrCandidatesToLiveUpdateForm/)
  }
})
