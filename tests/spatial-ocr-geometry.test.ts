import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { OcrBoundMetricFields } from '../components/features/reports/OcrBoundMetricFields.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import type {
  OcrImageRecognition,
  OcrRecognizedWord,
  ReportDashboardPlatform,
  ReportMetricKey,
} from '../lib/types/database.types.ts'
import {
  buildOcrMetric,
  extractPlatformMetricsFromSpatialOcr,
  mapDashboardImageRecognition,
  platformMetricLayouts,
} from '../lib/utils/ocrMetrics.ts'
import { mapBrowserTesseractBlocksToWords } from '../lib/services/imageOcrService.ts'
import { reviewInputValues } from '../lib/utils/ocrReview.ts'

type Platform = Exclude<ReportDashboardPlatform, 'other'>

const shopeeFixture = {
  dimensions: { width: 1920, height: 1080 },
  values: {
    sales: ['Sales', '21.281.718'],
    engaged_viewers: ['Engaged Viewer', '521'],
    comments: ['Comments', '51'],
    add_to_cart: ['ATC', '436'],
    total_views: ['Total Views', '13.262'],
    average_view_duration_seconds: ['Avg. Viewing Duration', '00:00:25'],
    comment_rate: ['Comments Rate', '0,4%'],
    gpm: ['GPM', '1.604.714,07'],
    orders: ['Orders', '109'],
    average_basket_size: ['ABS', '195.245,12'],
    total_viewers: ['Total Viewers', '8.380'],
    pcu: ['PCU', '107'],
    ctr: ['CTR', '8,4%'],
    click_to_order_rate: ['Click to Order Rate', '9,8%'],
    buyers: ['Buyers', '104'],
    items_sold: ['Items Sold', '116'],
    likes: ['Likes', '1.735'],
    shares: ['Shares', '8'],
    live_duration_seconds: ['Duration', '02:01:46'],
  } satisfies Partial<Record<ReportMetricKey, readonly [string, string]>>,
}

const tiktokFixture = {
  dimensions: { width: 1748, height: 926 },
  values: {
    gmv: ['Recognized GMV', '8,761,919'],
    items_sold: ['Items Sold', '103'],
    current_viewers: ['Current Viewers', '7'],
    impressions: ['Impressions', '91.95K'],
    total_views: ['Views', '2.31K'],
    advertising_cost: ['Advertising Cost', '2.11M'],
    click_rate: ['Click Rate', '2.52%'],
    roi_gmv_max: ['ROI GMV Max', '4.95'],
    ctor: ['CTOR', '6.26%'],
    average_view_duration_seconds: ['Average Viewing Duration', '40s'],
    new_followers: ['New Followers', '18'],
    buyers: ['Customers', '46'],
    sku_orders: ['SKU Orders', '95'],
    comments: ['Comments', '234'],
    product_clicks: ['Product Clicks', '847'],
    average_order_value: ['AOV', '165.32K'],
    live_ctr: ['LIVE CTR', '36.62%'],
    shares: ['Shares', '60'],
    estimated_gmv: ['Estimated GMV', '8.98M'],
  } satisfies Partial<Record<ReportMetricKey, readonly [string, string]>>,
}

const expectedShopee = {
  sales: '21281718',
  engaged_viewers: '521',
  comments: '51',
  add_to_cart: '436',
  total_views: '13262',
  average_view_duration_seconds: '25',
  comment_rate: '0.4',
  gpm: '1604714.07',
  orders: '109',
  average_basket_size: '195245.12',
  total_viewers: '8380',
  pcu: '107',
  ctr: '8.4',
  click_to_order_rate: '9.8',
  buyers: '104',
  items_sold: '116',
  likes: '1735',
  shares: '8',
  live_duration_seconds: '7306',
}

const expectedTiktok = {
  gmv: '8761919',
  items_sold: '103',
  current_viewers: '7',
  impressions: '91950',
  total_views: '2310',
  advertising_cost: '2110000',
  click_rate: '2.52',
  roi_gmv_max: '4.95',
  ctor: '6.26',
  average_view_duration_seconds: '40',
  new_followers: '18',
  buyers: '46',
  sku_orders: '95',
  comments: '234',
  product_clicks: '847',
  average_order_value: '165320',
  live_ctr: '36.62',
  shares: '60',
  estimated_gmv: '8980000',
}

const stringifyMetricState = (values: Record<string, number | null | undefined>) =>
  Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === 'number' ? [[key, String(value)]] : [],
    ),
  )

function fixtureWords(
  platform: Platform,
  dimensions: { width: number; height: number },
  values: Partial<Record<ReportMetricKey, readonly [string, string]>>,
) {
  return platformMetricLayouts[platform].flatMap(cell => {
    const fixture = values[cell.key]
    if (!fixture) return []
    const [label, value] = fixture
    const centerX = cell.x * dimensions.width
    const valueCenterY = cell.y * dimensions.height
    const labelCenterY = (cell.y - Math.min(cell.height * .5, .025)) * dimensions.height
    const labelParts = label.split(' ')
    const totalLabelWidth = labelParts.reduce((sum, part) => sum + Math.max(12, part.length * 7), 0)
      + Math.max(0, labelParts.length - 1) * 5
    let labelX = centerX - totalLabelWidth / 2
    const labelWords = labelParts.map((part, index): OcrRecognizedWord => {
      const width = Math.max(12, part.length * 7)
      const word = recognizedWord(platform, part, labelX, labelCenterY - 7, width, 14, 'label', `label:${cell.key}`)
      labelX += width + 5
      word.line_index = index
      return word
    })
    const valueWidth = Math.max(18, value.length * 8)
    return [
      ...labelWords,
      recognizedWord(
        platform,
        value,
        centerX - valueWidth / 2,
        valueCenterY - 9,
        valueWidth,
        18,
        'numeric',
        `value:${cell.key}`,
      ),
    ]
  })
}

function recognizedWord(
  platform: Platform,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  pass: OcrRecognizedWord['pass'],
  lineId: string,
): OcrRecognizedWord {
  return {
    text,
    confidence: 96,
    line_id: lineId,
    block_index: 0,
    line_index: 0,
    platform,
    source: 'image_ocr',
    pass,
    bounding_box: { x, y, width, height },
  }
}

test('Shopee screenshot geometry binds all 19 KPI cards without cross-mapping', () => {
  const words = fixtureWords('shopee_live', shopeeFixture.dimensions, shopeeFixture.values)
  const extracted = extractPlatformMetricsFromSpatialOcr({
    platform: 'shopee_live',
    imageWidth: shopeeFixture.dimensions.width,
    imageHeight: shopeeFixture.dimensions.height,
    words,
  })

  assert.deepEqual(stringifyMetricState(reviewInputValues({
    status: 'confirmed',
    metrics: extracted.metrics,
  })), expectedShopee)
  assert.equal(extracted.diagnostics.confirmed, 19)
  assert.equal(extracted.diagnostics.reviewRequired, 0)
  assert.equal(extracted.diagnostics.missing, 0)
  assert.equal(extracted.candidates.every(candidate =>
    candidate.label_box && candidate.value_box && candidate.pair_score >= .85,
  ), true)
})

test('TikTok screenshot geometry binds all 19 KPI cards without cross-mapping', () => {
  const words = fixtureWords('tiktok_shop', tiktokFixture.dimensions, tiktokFixture.values)
  const extracted = extractPlatformMetricsFromSpatialOcr({
    platform: 'tiktok_shop',
    imageWidth: tiktokFixture.dimensions.width,
    imageHeight: tiktokFixture.dimensions.height,
    words,
  })

  assert.deepEqual(stringifyMetricState(reviewInputValues({
    status: 'confirmed',
    metrics: extracted.metrics,
  })), expectedTiktok)
  assert.equal(
    extracted.diagnostics.confirmed + extracted.diagnostics.reviewRequired,
    19,
  )
  assert.equal(extracted.diagnostics.missing, 0)
})

test('spatial card evidence overrides conflicting flattened Shopee text', () => {
  const words = fixtureWords('shopee_live', shopeeFixture.dimensions, shopeeFixture.values)
  const recognition: OcrImageRecognition = {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: [
      'GPM: 21.281.718',
      'ABS: 0',
      'Click to Order Rate: 84',
    ].join('\n'),
    pass_output: { label: '', numeric: '' },
    confidence: 96,
    words,
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: shopeeFixture.dimensions,
    processed_dimensions: shopeeFixture.dimensions,
  }
  const review = mapDashboardImageRecognition('shopee_live', recognition)

  assert.equal(review.metrics.sales?.value, 21281718)
  assert.equal(review.metrics.gpm?.value, 1604714.07)
  assert.equal(review.metrics.average_basket_size?.value, 195245.12)
  assert.equal(review.metrics.ctr?.value, 8.4)
  assert.equal(review.metrics.click_to_order_rate?.value, 9.8)
  assert.notEqual(review.metrics.gpm?.source, 'raw_text_exact')
  assert.notEqual(review.metrics.average_basket_size?.source, 'raw_text_exact')
})

test('TikTok card variants preserve the dashboard display format before normalization', () => {
  const cardOutput = {
    total_views: ['251K', '2:31'],
    advertising_cost: ['2mm', '21m', '11'],
    click_rate: ['252%'],
    roi_gmv_max: ['495'],
    average_view_duration_seconds: ['40:'],
    average_order_value: ['165.52k', '16532k', '165.32k', '16532k'],
    live_ctr: ['26,62%', '36.62%', '36,62%'],
    estimated_gmv: ['898m'],
  }
  const words = Object.entries(cardOutput).flatMap(([rawKey, variants]) => {
    const key = rawKey as ReportMetricKey
    const cell = platformMetricLayouts.tiktok_shop.find(candidate => candidate.key === key)
    assert.ok(cell)
    return variants.map((value, variantIndex) => recognizedWord(
      'tiktok_shop',
      value,
      (cell.x - cell.width / 2) * tiktokFixture.dimensions.width,
      (cell.y - cell.height / 2) * tiktokFixture.dimensions.height,
      cell.width * tiktokFixture.dimensions.width,
      cell.height * tiktokFixture.dimensions.height,
      'card',
      `card:${key}:${variantIndex}`,
    ))
  })
  const extracted = extractPlatformMetricsFromSpatialOcr({
    platform: 'tiktok_shop',
    imageWidth: tiktokFixture.dimensions.width,
    imageHeight: tiktokFixture.dimensions.height,
    words,
    cardOutput,
  })
  const values = reviewInputValues({ status: 'review_required', metrics: extracted.metrics })

  assert.equal(values.total_views, 2310)
  assert.equal(values.advertising_cost, 2110000)
  assert.equal(values.click_rate, 2.52)
  assert.equal(values.roi_gmv_max, 4.95)
  assert.equal(values.average_view_duration_seconds, 40)
  assert.equal(values.average_order_value, 165320)
  assert.equal(values.live_ctr, 36.62)
  assert.equal(values.estimated_gmv, 8980000)
})

test('a weak Shopee card reading cannot replace a strong conflicting word inside the same cell', () => {
  const cell = platformMetricLayouts.shopee_live.find(candidate => candidate.key === 'items_sold')
  assert.ok(cell)
  const words = fixtureWords('shopee_live', shopeeFixture.dimensions, {
    items_sold: ['Items Sold', '116'],
  })
  words.push({
    ...recognizedWord(
      'shopee_live',
      '16',
      (cell.x - cell.width / 2) * shopeeFixture.dimensions.width,
      (cell.y - cell.height / 2) * shopeeFixture.dimensions.height,
      cell.width * shopeeFixture.dimensions.width,
      cell.height * shopeeFixture.dimensions.height,
      'card',
      'card:items_sold:0',
    ),
    confidence: 83,
  })
  const extracted = extractPlatformMetricsFromSpatialOcr({
    platform: 'shopee_live',
    imageWidth: shopeeFixture.dimensions.width,
    imageHeight: shopeeFixture.dimensions.height,
    words,
    cardOutput: { items_sold: ['16'] },
  })

  assert.equal(extracted.metrics.items_sold?.value, 116)
  assert.notEqual(extracted.metrics.items_sold?.source, 'card_exact')
})

test('Shopee percentage repair uses the declared precision only when the default reading exceeds 100', () => {
  const repaired = buildOcrMetric(
    'shopee_live',
    'Click to Order Rate',
    '1145',
    'medium',
    'trusted_text',
    'review_required',
    'click_to_order_rate',
  )

  assert.ok(repaired)
  assert.equal(repaired[1].value, 11.5)
  assert.equal(repaired[1].status, 'review_required')
})

test('spatial candidates render into the shared Final Report and Live Update metric inputs', () => {
  for (const fixture of [
    {
      platform: 'shopee_live' as const,
      dimensions: shopeeFixture.dimensions,
      values: shopeeFixture.values,
      expected: expectedShopee,
    },
    {
      platform: 'tiktok_shop' as const,
      dimensions: tiktokFixture.dimensions,
      values: tiktokFixture.values,
      expected: expectedTiktok,
    },
  ]) {
    const extracted = extractPlatformMetricsFromSpatialOcr({
      platform: fixture.platform,
      imageWidth: fixture.dimensions.width,
      imageHeight: fixture.dimensions.height,
      words: fixtureWords(fixture.platform, fixture.dimensions, fixture.values),
    })
    const values = reviewInputValues({ status: 'confirmed', metrics: extracted.metrics })
    const html = renderToStaticMarkup(createElement(
      LanguageProvider,
      null,
      createElement(OcrBoundMetricFields, {
        metricKeys: Object.keys(fixture.expected) as ReportMetricKey[],
        values,
        review: { status: 'confirmed', metrics: extracted.metrics },
        editable: true,
        canReview: false,
        onChange: () => undefined,
      }),
    ))
    for (const [key, expected] of Object.entries(fixture.expected)) {
      const input = html.match(new RegExp(`<input[^>]*id="ocr-metric-input-${key}"[^>]*>`))?.[0]
      assert.ok(input, `${fixture.platform} did not render ${key}`)
      assert.match(input, new RegExp(`value="${expected.replace('.', '\\.')}"`))
    }
  }
})

test('browser Tesseract blocks preserve crop-relative word geometry in original-image coordinates', () => {
  const words = mapBrowserTesseractBlocksToWords([{
    paragraphs: [{
      lines: [{
        words: [{
          text: '21.281.718',
          confidence: 97,
          bbox: { x0: 100, y0: 80, x1: 300, y1: 120 },
        }],
      }],
    }],
  }], 'shopee_live', { left: 442, top: 194 }, 2)

  assert.deepEqual(words[0]?.bounding_box, {
    x: 492,
    y: 234,
    width: 100,
    height: 20,
  })
  assert.equal(words[0]?.text, '21.281.718')
  assert.equal(words[0]?.confidence, 97)
})
