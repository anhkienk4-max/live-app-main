import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  OcrImageRecognition,
  OcrRecognizedWord,
  ReportDashboardPlatform,
  ReportMetricKey,
} from '../lib/types/database.types.ts'
import {
  buildDashboardOcrReviewFromRecognition,
  platformMetricLayouts,
} from '../lib/utils/ocrMetrics.ts'

const dimensions = { width: 1920, height: 1080 }

function cardWords(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  card: Record<string, string[]>,
): OcrRecognizedWord[] {
  return Object.entries(card).flatMap(([rawKey, values]) => {
    const key = rawKey as ReportMetricKey
    const cell = platformMetricLayouts[platform].find(candidate => candidate.key === key)
    assert.ok(cell)
    return values.map((value, index) => ({
      text: value,
      confidence: 92 - index,
      line_id: `card:${key}:${index}`,
      block_index: index,
      line_index: 0,
      platform,
      source: 'image_ocr' as const,
      pass: 'card' as const,
      bounding_box: {
        x: (cell.x - cell.width / 2) * dimensions.width,
        y: (cell.y - cell.height / 2) * dimensions.height,
        width: cell.width * dimensions.width,
        height: cell.height * dimensions.height,
      },
    }))
  })
}

function recognition(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  rawText: string,
  card: Record<string, string[]>,
  cardLabels: Record<string, string[]>,
): OcrImageRecognition {
  return {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: rawText,
    pass_output: {
      label: rawText,
      numeric: '',
      card,
      card_labels: cardLabels,
    },
    confidence: 88,
    words: cardWords(platform, card),
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: dimensions,
    processed_dimensions: dimensions,
  }
}

test('Shopee keeps noisy OCR diagnostics but exposes corrected dashboard text', () => {
  const rawText = [
    '—:',
    '=5',
    '21 281.71 8,00',
    'L2',
    'ABS (0)',
    '04x',
    '84x',
  ].join('\n')
  const card = {
    sales: ['21 281.71 8,00'],
    engaged_viewers: ['521'],
    comments: ['51'],
    add_to_cart: ['436'],
    total_views: ['13.262'],
    average_view_duration_seconds: ['00:00:25'],
    comment_rate: ['04x'],
    gpm: ['1.604.714,07'],
    orders: ['109'],
    average_basket_size: ['195.245,12'],
    total_viewers: ['8.380'],
    pcu: ['107'],
    ctr: ['84x'],
    click_to_order_rate: ['9.8%'],
    buyers: ['104'],
    items_sold: ['116'],
  }
  const review = buildDashboardOcrReviewFromRecognition(
    'shopee_live',
    recognition('shopee_live', rawText, card, {
      sales: ['—:'],
      orders: ['L2'],
      average_basket_size: ['ABS (0)'],
      total_viewers: ['Total Viewer:'],
      ctr: [''],
    }),
  )

  const expectedLines = [
    'Sales (đ): 21.281.718,00',
    'Comments Rate: 0,4%',
    'GPM (đ): 1.604.714,07',
    'Orders: 109',
    'ABS (đ): 195.245,12',
    'Total Viewers: 8.380',
    'CTR: 8,4%',
  ]
  for (const line of expectedLines) assert.match(review.raw_output || '', new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const noisy of ['21 281.71 8,00', 'L2', 'ABS (0)', '04x', '84x']) {
    assert.doesNotMatch(review.raw_output || '', new RegExp(noisy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(review.raw_diagnostic_output || '', new RegExp(noisy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.equal(review.metrics.orders?.raw_ocr_label, 'L2')
  assert.equal(review.metrics.orders?.corrected_source_label, 'Orders')
  assert.equal(review.metrics.orders?.raw_ocr_value, '109')
  assert.equal(review.metrics.orders?.corrected_display_value, '109')
  assert.equal(review.metrics.orders?.normalized_value, 109)
})

test('TikTok uses exact platform labels and corrected card display values', () => {
  const card = {
    gmv: ['8,761,919'],
    items_sold: ['103'],
    current_viewers: ['7'],
    impressions: ['91.95K'],
    total_views: ['2.31K'],
    advertising_cost: ['2.11M'],
    click_rate: ['252%'],
    roi_gmv_max: ['495'],
    ctor: ['6.26%'],
    average_view_duration_seconds: ['40:'],
    new_followers: ['18'],
    buyers: ['46'],
    sku_orders: ['95'],
    comments: ['234'],
    product_clicks: ['847'],
    average_order_value: ['165.32K'],
    live_ctr: ['36,62%'],
    shares: ['60'],
    estimated_gmv: ['8.98M'],
  }
  const review = buildDashboardOcrReviewFromRecognition(
    'tiktok_shop',
    recognition('tiktok_shop', '252%\n40:', card, {
      click_rate: ['Ty le nhan'],
      average_view_duration_seconds: ['Thoi luong xem TB'],
    }),
  )

  assert.match(review.raw_output || '', /GMV đã ghi nhận: 8\.761\.919/)
  assert.match(review.raw_output || '', /Tỷ lệ nhấn: 2,52%/)
  assert.match(review.raw_output || '', /Thời lượng xem TB: 40s/)
  assert.match(review.raw_output || '', /GMV ước tính: 8,98M/)
  assert.equal(review.metrics.click_rate?.normalized_value, 2.52)
  assert.equal(review.metrics.average_view_duration_seconds?.normalized_value, 40)
  assert.match(review.raw_diagnostic_output || '', /252%/)
  assert.match(review.raw_diagnostic_output || '', /40:/)
})
