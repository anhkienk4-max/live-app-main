import assert from 'node:assert/strict'
import test from 'node:test'

import { parsePlatformOcrText, platformOcrConfigs } from '../lib/utils/ocrMetrics.ts'
import {
  applyOcrCandidatesToLiveUpdateForm,
  parseAndApplyOcrText,
  platformMetricBindingKeys,
  platformToFormBindings,
  type LiveUpdateOcrFormState,
} from '../lib/utils/ocrReview.ts'

const emptyLiveForm = (): LiveUpdateOcrFormState => ({
  revenue: '',
  gmv: '',
  orders: '',
  peak_viewers: '',
  current_viewers: '',
  total_views: '',
  total_viewers: '',
  likes: '',
  comments: '',
  shares: '',
  notes: '',
  screenshot_url: '',
})

const noisyShopeeText = [
  '--- LIVE Insight ---',
  'Sales',
  'Engaged Viewers',
  'Comments',
  'ATC',
  '21.281.718,00',
  '521',
  '51',
  '436',
  'Page 1',
  'Total Views',
  'Avg Viewing Duratlon',
  'Comments Rate',
  'GPM',
  'L2',
  'ABS',
  '13.262',
  '00:00:25',
  '0,4x',
  '1.604.714,07',
  '109',
  '195.245,12',
  'Total Viewers',
  'PCU',
  'Click to Order Rate',
  'Buyers',
  'Items Sold',
  '8.380',
  '107',
  '8,4x',
  '9,8o',
  '104',
  '116',
  'Likes: 1.735',
  'Shares: 8',
  'Duration: 02:01:46',
  'Sales Trends',
].join('\n')

const noisyTiktokText = [
  'Tổng quan dữ liệu LIVE',
  'GMV đã ghi nhận',
  'Số món bán ra từ sự kiện',
  'Current Viewers',
  '8.761.919',
  '103',
  '7',
  '=== traffic ===',
  'Lượt hiển thị',
  'Views',
  'Chi phí quảng cáo',
  'Tỷ lệ nhấn',
  '91.95K',
  '2.31K',
  '2.11M',
  '2,52x',
  'ROI GMV Max',
  'CTOR',
  'Average Viewing Duration',
  'Người theo dõi mới',
  '4.95',
  '6,26',
  '00:00:40',
  '18',
  'Khách hàng',
  'Đơn hàng SKU đã ghi nhận',
  'Comments',
  'Product Clicks',
  '46',
  '95',
  '234',
  '847',
  'AOV',
  'CTR của LIVE',
  'Shares',
  'GMV ước tính',
  '165.32K',
  '36,62o',
  '60',
  '8.98M',
  'GMV đã ghi nhận trend',
  'chart legend',
].join('\n')

test('platform configs own aliases, sections, value types, and form support for both dashboards', () => {
  for (const platform of ['shopee_live', 'tiktok_shop'] as const) {
    const config = platformOcrConfigs[platform]
    assert.equal(config.metricOrder.length > 0, true)
    assert.equal(config.sections.length > 0, true)
    assert.equal(Object.keys(config.aliases).length > 0, true)
    assert.equal(Object.keys(config.valueTypes).length > 0, true)
    assert.equal(config.finalReportFields.length, 19)
    assert.equal(config.liveUpdateFields.length, 19)
    assert.equal(Object.keys(platformToFormBindings[platform]).length, 19)
    assert.equal(platformMetricBindingKeys(platform, 'final_report').length, 19)
    assert.equal(platformMetricBindingKeys(platform, 'live_update').length, 19)
  }
})

test('noisy Shopee OCR recovers reliable metrics independently across sections', () => {
  const parsed = parsePlatformOcrText({
    platform: 'shopee',
    rawText: noisyShopeeText,
  })

  assert.equal(Object.keys(parsed.metrics).length, 19)
  assert.deepEqual(parsed.metrics, {
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
  })
  assert.equal(parsed.candidates.orders?.original_label, 'L2')
  assert.equal(parsed.candidates.ctr?.status, 'review_required')
  assert.equal(parsed.reviewRequiredKeys.includes('orders'), true)
  assert.equal(parsed.reviewRequiredKeys.includes('ctr'), true)
  assert.equal(parsed.unmappedLines.some(line => line.includes('Sales Trends')), true)
})

test('noisy TikTok/TTS OCR binds all 19 metrics despite noise and lost percent symbols', () => {
  const parsed = parsePlatformOcrText({
    platform: 'tts',
    rawText: noisyTiktokText,
  })

  assert.equal(Object.keys(parsed.metrics).length, 19)
  assert.equal(parsed.metrics.gmv, 8761919)
  assert.equal(parsed.metrics.items_sold, 103)
  assert.equal(parsed.metrics.current_viewers, 7)
  assert.equal(parsed.metrics.impressions, 91950)
  assert.equal(parsed.metrics.total_views, 2310)
  assert.equal(parsed.metrics.advertising_cost, 2110000)
  assert.equal(parsed.metrics.click_rate, 2.52)
  assert.equal(parsed.metrics.roi_gmv_max, 4.95)
  assert.equal(parsed.metrics.ctor, 6.26)
  assert.equal(parsed.metrics.average_view_duration_seconds, 40)
  assert.equal(parsed.metrics.new_followers, 18)
  assert.equal(parsed.metrics.buyers, 46)
  assert.equal(parsed.metrics.sku_orders, 95)
  assert.equal(parsed.metrics.comments, 234)
  assert.equal(parsed.metrics.product_clicks, 847)
  assert.equal(parsed.metrics.average_order_value, 165320)
  assert.equal(parsed.metrics.live_ctr, 36.62)
  assert.equal(parsed.metrics.shares, 60)
  assert.equal(parsed.metrics.estimated_gmv, 8980000)
  assert.equal(parsed.reviewRequiredKeys.includes('ctor'), true)
  assert.equal(parsed.unmappedLines.some(line => line.includes('GMV đã ghi nhận trend')), true)
})

test('shared parser output reaches actual Final Report and Live Update state without cross-mapping', () => {
  const reportResult = parseAndApplyOcrText({
    platform: 'tiktok_shop',
    rawText: noisyTiktokText,
    currentMetrics: { likes: '77' },
    overwriteOcrValues: true,
  })
  const liveState = applyOcrCandidatesToLiveUpdateForm({
    ...emptyLiveForm(),
    revenue: 'manual revenue',
    notes: 'keep note',
    screenshot_url: 'blob:keep',
  }, reportResult.review, ['revenue'])

  assert.equal(reportResult.metrics.gmv, '8761919')
  assert.equal(reportResult.metrics.advertising_cost, '2110000')
  assert.equal(reportResult.metrics.average_order_value, '165320')
  assert.equal(reportResult.metrics.likes, '77')
  assert.equal(liveState.gmv, '8761919')
  assert.equal(liveState.orders, '95')
  assert.equal(liveState.current_viewers, '7')
  assert.equal(liveState.total_views, '2310')
  assert.equal(liveState.comments, '234')
  assert.equal(liveState.shares, '60')
  assert.equal(liveState.revenue, 'manual revenue')
  assert.equal(liveState.notes, 'keep note')
  assert.equal(liveState.screenshot_url, 'blob:keep')
  assert.equal('advertising_cost' in liveState, false)
  assert.equal('average_order_value' in liveState, false)
})
