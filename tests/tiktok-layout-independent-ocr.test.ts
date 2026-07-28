import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  OcrRecognizedWord,
  ReportMetricKey,
} from '../lib/types/database.types.ts'
import { detectDashboardRegions } from '../lib/utils/dashboardRegionDetection.ts'
import {
  buildOcrMetric,
  mapDashboardImageRecognition,
  parseCompactOcrNumber,
} from '../lib/utils/ocrMetrics.ts'
import { reviewInputValues } from '../lib/utils/ocrReview.ts'

const expected = {
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
} satisfies Partial<Record<ReportMetricKey, number>>

const labels: Record<keyof typeof expected, string> = {
  gmv: 'Recognized GMV',
  items_sold: 'Items Sold',
  current_viewers: 'Current Viewers',
  impressions: 'Impressions',
  total_views: 'Views',
  advertising_cost: 'Advertising Cost',
  click_rate: 'Click Rate',
  roi_gmv_max: 'ROI GMV Max',
  ctor: 'CTOR',
  average_view_duration_seconds: 'Average Viewing Duration',
  new_followers: 'New Followers',
  buyers: 'Customers',
  sku_orders: 'SKU Orders',
  comments: 'Comments',
  product_clicks: 'Product Clicks',
  average_order_value: 'Average Order Value',
  live_ctr: 'LIVE CTR',
  shares: 'Shares',
  estimated_gmv: 'Estimated GMV',
}

const displayValues: Record<keyof typeof expected, string> = {
  gmv: '8,761,919',
  items_sold: '103',
  current_viewers: '7',
  impressions: '91,95K',
  total_views: '2.31K',
  advertising_cost: '2,11M',
  click_rate: '2.52%',
  roi_gmv_max: '4.95',
  ctor: '6,26%',
  average_view_duration_seconds: '40s',
  new_followers: '18',
  buyers: '46',
  sku_orders: '95',
  comments: '234',
  product_clicks: '847',
  average_order_value: '165,32K',
  live_ctr: '36.62%',
  shares: '60',
  estimated_gmv: '8,98M',
}

test('TikTok compact numbers preserve K/M magnitude for dot and comma locales', () => {
  const cases = new Map([
    ['91.95K', 91950],
    ['91,95K', 91950],
    ['2.31K', 2310],
    ['2,31K', 2310],
    ['2.11M', 2110000],
    ['2,11M', 2110000],
    ['8.98M', 8980000],
    ['8,98M', 8980000],
  ])
  for (const [raw, value] of cases) {
    const parsed = parseCompactOcrNumber(raw)
    assert.ok(parsed)
    assert.equal(parsed.value, value)
    assert.equal(parsed.ambiguous, false)
  }
  assert.equal(parseCompactOcrNumber('8..98M')?.ambiguous, true)
})

test('TikTok structural ROI and label proximity survive shifted cards, changed spacing, and wrapped labels', () => {
  const dimensions = { width: 2200, height: 1300 }
  const words = customLayoutWords({ left: 310, top: 130, width: 1460, height: 850 })
  const regions = detectDashboardRegions({
    words,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    requestedPlatform: 'tiktok_shop',
  })
  assert.ok(regions.selected, JSON.stringify(regions, null, 2))
  assert.equal(regions.selected.platform, 'tiktok_shop')
  assert.ok(regions.candidates.some(candidate =>
    candidate.source_method === 'anchor_cluster'
    && candidate.anchor_count >= 15,
  ))

  const review = mapDashboardImageRecognition('tiktok_shop', {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: '',
    pass_output: { label: '', numeric: '' },
    confidence: 96,
    words,
    crop_box: regions.selected.crop_box,
    original_dimensions: dimensions,
    processed_dimensions: dimensions,
    region_diagnostics: regions.diagnostics,
  })
  const actual = reviewInputValues(review)
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key as ReportMetricKey], value, key)
  }
  assert.equal(review.metrics.impressions?.value, 91950)
  assert.equal(review.metrics.total_views?.value, 2310)
  assert.equal(review.metrics.current_viewers?.value, 7)
})

test('duplicate TikTok structural dashboards stay isolated and require region selection', () => {
  const words = [
    ...customLayoutWords({ left: 100, top: 100, width: 900, height: 620 }, 'left'),
    ...customLayoutWords({ left: 2000, top: 110, width: 900, height: 620 }, 'right'),
  ]
  const result = detectDashboardRegions({
    words,
    imageWidth: 3100,
    imageHeight: 1000,
    requestedPlatform: 'tiktok_shop',
  })
  const structural = result.candidates.filter(candidate =>
    candidate.platform === 'tiktok_shop'
    && candidate.source_method === 'anchor_cluster',
  )
  assert.ok(structural.length >= 2, JSON.stringify(result, null, 2))
  assert.equal(result.selected, undefined)
  assert.equal(result.diagnostics.ambiguous, true)
  assert.equal(result.diagnostics.selection_required, true)
  assert.ok(structural.every(candidate => candidate.anchor_count >= 15))
})

test('TikTok zero values are preserved and incompatible candidates are rejected', () => {
  const zero = buildOcrMetric(
    'tiktok_shop',
    'Shares',
    '0',
    'high',
    'word_box_exact',
    'confirmed',
  )
  assert.ok(zero)
  assert.equal(zero[1].value, 0)

  assert.equal(buildOcrMetric(
    'tiktok_shop',
    'Current Viewers',
    '2.52%',
    'high',
    'word_box_exact',
    'confirmed',
  ), null)
  assert.equal(buildOcrMetric(
    'tiktok_shop',
    'Click Rate',
    '-1%',
    'high',
    'word_box_exact',
    'confirmed',
  ), null)
})

function customLayoutWords(
  box: { left: number; top: number; width: number; height: number },
  prefix = 'layout',
): OcrRecognizedWord[] {
  const keys = Object.keys(expected) as Array<keyof typeof expected>
  return keys.flatMap((key, index) => {
    const row = key === 'gmv' ? 0 : Math.floor((index - 1) / 4) + 1
    const column = key === 'gmv' ? 1.5 : (index - 1) % 4
    const rowY = box.top + box.height * (.08 + row * .16)
    const centerX = box.left + box.width * (.14 + column * .245)
    const labelParts = labels[key].split(' ')
    const wrapAt = ['advertising_cost', 'average_view_duration_seconds', 'product_clicks']
      .includes(key)
      ? Math.ceil(labelParts.length / 2)
      : labelParts.length
    const labelLines = [
      labelParts.slice(0, wrapAt),
      labelParts.slice(wrapAt),
    ].filter(parts => parts.length)
    const labelWords = labelLines.flatMap((parts, lineIndex) => {
      const widths = parts.map(part => Math.max(14, part.length * 7))
      const totalWidth = widths.reduce((sum, width) => sum + width, 0)
        + Math.max(0, parts.length - 1) * 5
      let x = centerX - totalWidth / 2
      return parts.map((part, wordIndex) => {
        const width = widths[wordIndex]
        const word = recognizedWord(
          part,
          x,
          rowY + lineIndex * 18,
          width,
          14,
          'label',
          `${prefix}:${key}:label:${lineIndex}`,
          wordIndex,
        )
        x += width + 5
        return word
      })
    })
    const value = displayValues[key]
    const valueWidth = Math.max(22, value.length * 9)
    return [
      ...labelWords,
      recognizedWord(
        value,
        centerX - valueWidth / 2,
        rowY + labelLines.length * 18 + 4,
        valueWidth,
        18,
        'numeric',
        `${prefix}:${key}:value`,
      ),
    ]
  })
}

function recognizedWord(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  pass: OcrRecognizedWord['pass'],
  lineId: string,
  lineIndex = 0,
): OcrRecognizedWord {
  return {
    text,
    confidence: 96,
    line_id: lineId,
    block_index: 0,
    line_index: lineIndex,
    platform: 'tiktok_shop',
    source: 'image_ocr',
    pass,
    bounding_box: { x, y, width, height },
  }
}
