import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  OcrPoint,
  OcrRecognizedWord,
  ReportDashboardPlatform,
  ReportMetricKey,
} from '../lib/types/database.types.ts'
import {
  detectDashboardRegions,
  platformRoiMetricLayouts,
  roiCellBoundingBox,
} from '../lib/utils/dashboardRegionDetection.ts'
import { mapDashboardImageRecognition } from '../lib/utils/ocrMetrics.ts'

type Platform = Exclude<ReportDashboardPlatform, 'other'>

const anchorLabels: Record<Platform, Partial<Record<ReportMetricKey, string>>> = {
  shopee_live: {
    sales: 'Sales',
    engaged_viewers: 'Engaged Viewer',
    add_to_cart: 'ATC',
    total_views: 'Total Views',
    gpm: 'GPM',
    pcu: 'PCU',
    click_to_order_rate: 'Click to Order Rate',
    items_sold: 'Items Sold',
  },
  tiktok_shop: {
    gmv: 'Recognized GMV',
    items_sold: 'Items Sold',
    current_viewers: 'Current Viewers',
    impressions: 'Impressions',
    advertising_cost: 'Advertising Cost',
    roi_gmv_max: 'ROI GMV Max',
    sku_orders: 'SKU Orders',
    average_order_value: 'Average Order Value',
    live_ctr: 'LIVE CTR',
    estimated_gmv: 'Estimated GMV',
  },
}

const standardShopeeQuad: [OcrPoint, OcrPoint, OcrPoint, OcrPoint] = [
  { x: 260, y: 150 },
  { x: 1480, y: 150 },
  { x: 1480, y: 680 },
  { x: 260, y: 680 },
]

const shiftedTikTokQuad: [OcrPoint, OcrPoint, OcrPoint, OcrPoint] = [
  { x: 520, y: 90 },
  { x: 1710, y: 120 },
  { x: 1660, y: 880 },
  { x: 470, y: 830 },
]

test('Shopee ROI detection is invariant to full-image shift and scale', () => {
  const words = anchorWords('shopee_live', standardShopeeQuad)
  const result = detectDashboardRegions({
    words,
    imageWidth: 2200,
    imageHeight: 1200,
    requestedPlatform: 'shopee_live',
  })

  assert.ok(result.selected, JSON.stringify(result, null, 2))
  assert.equal(result.selected.platform, 'shopee_live')
  assert.ok(result.selected.anchor_count >= 6)
  assert.ok(result.selected.confidence >= .68)
  assert.ok(Math.abs(result.selected.bounding_box.x - 260) < 90)
  assert.equal(result.diagnostics.selection_required, false)
})

test('a partially cropped Shopee dashboard remains detectable when enough KPI anchors are visible', () => {
  const croppedQuad: [OcrPoint, OcrPoint, OcrPoint, OcrPoint] = [
    { x: -140, y: 70 },
    { x: 1080, y: 70 },
    { x: 1080, y: 600 },
    { x: -140, y: 600 },
  ]
  const words = anchorWords('shopee_live', croppedQuad)
    .filter(word =>
      word.bounding_box.x + word.bounding_box.width > 0
      && word.bounding_box.x < 1200,
    )
  const result = detectDashboardRegions({
    words,
    imageWidth: 1200,
    imageHeight: 720,
    requestedPlatform: 'shopee_live',
  })

  assert.ok(result.selected, JSON.stringify(result, null, 2))
  assert.equal(result.selected.platform, 'shopee_live')
  assert.ok(result.selected.anchor_count >= 5)
  assert.ok(result.selected.bounding_box.x >= 0)
  assert.equal(result.diagnostics.selection_required, false)
})

test('TikTok ROI detection supports scaled, shifted, and perspective-like dashboards', () => {
  const words = anchorWords('tiktok_shop', shiftedTikTokQuad)
  const result = detectDashboardRegions({
    words,
    imageWidth: 2400,
    imageHeight: 1200,
    requestedPlatform: 'tiktok_shop',
  })

  assert.ok(result.selected)
  assert.equal(result.selected.platform, 'tiktok_shop')
  assert.ok(result.selected.anchor_count >= 7)
  assert.ok([
    'anchor_homography',
    'anchor_affine',
    'anchor_similarity',
  ].includes(result.selected.source_method))
  assert.equal(result.diagnostics.normalized_roi_dimensions?.width, 2400)
  assert.ok(result.selected.bounding_box.width > 900)
  assert.equal(
    result.diagnostics.perspective_correction_applied,
    result.selected.perspective_correction_applied,
  )
})

test('a composite image detects both platforms without mixing candidates', () => {
  const shopeeQuad = translateQuad(standardShopeeQuad, -180, 120, .58)
  const tiktokQuad = translateQuad(shiftedTikTokQuad, 690, 60, .50)
  const words = [
    ...anchorWords('shopee_live', shopeeQuad, 'left'),
    ...anchorWords('tiktok_shop', tiktokQuad, 'right'),
  ]
  const result = detectDashboardRegions({
    words,
    imageWidth: 2200,
    imageHeight: 1200,
  })

  assert.ok(result.candidates.some(candidate => candidate.platform === 'shopee_live'))
  assert.ok(result.candidates.some(candidate => candidate.platform === 'tiktok_shop'))
  const shopeeCandidate = result.candidates.find(candidate => candidate.platform === 'shopee_live')
  const tiktokCandidate = result.candidates.find(candidate => candidate.platform === 'tiktok_shop')
  assert.ok(shopeeCandidate?.anchor_keys.includes('sales'))
  assert.ok(tiktokCandidate?.anchor_keys.includes('gmv'))
  assert.ok(
    shopeeCandidate.bounding_box.x + shopeeCandidate.bounding_box.width
      < tiktokCandidate.bounding_box.x + tiktokCandidate.bounding_box.width,
  )
})

test('similarly strong duplicate dashboards require explicit region selection', () => {
  const left = translateQuad(standardShopeeQuad, -150, 150, .55)
  const right = translateQuad(standardShopeeQuad, 900, 150, .55)
  const words = [
    ...anchorWords('shopee_live', left, 'duplicate-left'),
    ...anchorWords('shopee_live', right, 'duplicate-right'),
  ]
  const result = detectDashboardRegions({
    words,
    imageWidth: 2100,
    imageHeight: 1000,
    requestedPlatform: 'shopee_live',
  })

  assert.ok(result.candidates.length >= 2)
  assert.equal(result.selected, undefined)
  assert.equal(result.diagnostics.ambiguous, true)
  assert.equal(result.diagnostics.selection_required, true)

  const review = mapDashboardImageRecognition('shopee_live', {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: 'Sales 100 Sales 200',
    pass_output: { label: 'Sales 100 Sales 200', numeric: '' },
    confidence: 95,
    words,
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: 2100, height: 1000 },
    processed_dimensions: { width: 2100, height: 1000 },
    region_diagnostics: result.diagnostics,
  })
  assert.deepEqual(review.metrics, {})
  assert.equal(review.region_diagnostics?.selection_required, true)
})

test('manual crop wins deterministically and normalized card boxes stay inside it', () => {
  const manualCrop = { left: .2, top: .15, width: .55, height: .5 }
  const result = detectDashboardRegions({
    words: [],
    imageWidth: 2000,
    imageHeight: 1000,
    requestedPlatform: 'shopee_live',
    requestedCrop: manualCrop,
  })
  assert.equal(result.selected?.source_method, 'manual_crop')
  assert.deepEqual(result.selected?.crop_box, manualCrop)
  const sales = platformRoiMetricLayouts.shopee_live.find(cell => cell.key === 'sales')
  assert.ok(sales)
  const box = roiCellBoundingBox(result.selected!, sales, 'value')
  assert.ok(box.x >= result.selected!.bounding_box.x)
  assert.ok(box.y >= result.selected!.bounding_box.y)
  assert.ok(box.x + box.width <= result.selected!.bounding_box.x + result.selected!.bounding_box.width)
  assert.ok(box.y + box.height <= result.selected!.bounding_box.y + result.selected!.bounding_box.height)
})

test('no recognizable dashboard returns a safe selection-required result', () => {
  const result = detectDashboardRegions({
    words: [],
    imageWidth: 1920,
    imageHeight: 1080,
    requestedPlatform: 'tiktok_shop',
  })
  assert.equal(result.candidates.length, 0)
  assert.equal(result.selected, undefined)
  assert.equal(result.diagnostics.selection_reason, 'no_candidate')
  assert.equal(result.diagnostics.selection_required, true)
})

function anchorWords(
  platform: Platform,
  quad: [OcrPoint, OcrPoint, OcrPoint, OcrPoint],
  prefix = platform,
): OcrRecognizedWord[] {
  const labels = anchorLabels[platform]
  return platformRoiMetricLayouts[platform].flatMap(cell => {
    const label = labels[cell.key]
    if (!label || cell.x < 0 || cell.x > 1 || cell.y < 0 || cell.y > 1) return []
    const point = mapQuad(
      quad,
      cell.x,
      cell.y - (platform === 'tiktok_shop' ? .058 : .07),
    )
    const parts = label.split(' ')
    const widths = parts.map(part => Math.max(12, part.length * 7))
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + (parts.length - 1) * 4
    let x = point.x - totalWidth / 2
    return parts.map((part, index) => {
      const width = widths[index]
      const word: OcrRecognizedWord = {
        text: part,
        confidence: 96,
        line_id: `${prefix}:${cell.key}`,
        block_index: 0,
        line_index: index,
        platform,
        source: 'image_ocr',
        pass: 'label',
        bounding_box: { x, y: point.y - 8, width, height: 16 },
      }
      x += width + 4
      return word
    })
  })
}

function mapQuad(
  [topLeft, topRight, bottomRight, bottomLeft]: [OcrPoint, OcrPoint, OcrPoint, OcrPoint],
  x: number,
  y: number,
) {
  return {
    x:
      topLeft.x * (1 - x) * (1 - y)
      + topRight.x * x * (1 - y)
      + bottomRight.x * x * y
      + bottomLeft.x * (1 - x) * y,
    y:
      topLeft.y * (1 - x) * (1 - y)
      + topRight.y * x * (1 - y)
      + bottomRight.y * x * y
      + bottomLeft.y * (1 - x) * y,
  }
}

function translateQuad(
  quad: [OcrPoint, OcrPoint, OcrPoint, OcrPoint],
  x: number,
  y: number,
  scale: number,
): [OcrPoint, OcrPoint, OcrPoint, OcrPoint] {
  return quad.map(point => ({
    x: point.x * scale + x,
    y: point.y * scale + y,
  })) as [OcrPoint, OcrPoint, OcrPoint, OcrPoint]
}
