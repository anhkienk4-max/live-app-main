import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { OCR_RUNTIME_CONFIG, pinnedBrowserWorkerOptions } from '../lib/services/ocrRuntimeConfig.ts'
import type {
  OcrImageRecognition,
  OcrRecognizedWord,
  ReportMetricKey,
} from '../lib/types/database.types.ts'
import { detectDashboardRegions } from '../lib/utils/dashboardRegionDetection.ts'
import {
  buildOcrMetric,
  mapDashboardImageRecognition,
  parseDashboardOcrText,
  parseCompactOcrNumber,
  platformMetricLayouts,
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

test('browser OCR runtime uses pinned local worker, core, and language assets', () => {
  assert.deepEqual(pinnedBrowserWorkerOptions(), {
    workerPath: '/ocr/tesseract/worker.min.js',
    corePath: '/ocr/tesseract/tesseract-core-lstm.wasm.js',
    langPath: '/ocr/tessdata',
    cacheMethod: 'none',
    gzip: true,
  })
  assert.equal(OCR_RUNTIME_CONFIG.tesseractVersion, '7.0.0')
  assert.equal(OCR_RUNTIME_CONFIG.coreVersion, '7.0.0')
  assert.equal(OCR_RUNTIME_CONFIG.languageDataVersion, '4.0.0_best_int')
  assert.equal(OCR_RUNTIME_CONFIG.language, 'eng+vie')

  const assets = [
    ['public/ocr/tesseract/worker.min.js', OCR_RUNTIME_CONFIG.assetSha256.worker],
    [
      'public/ocr/tesseract/tesseract-core-lstm.wasm.js',
      OCR_RUNTIME_CONFIG.assetSha256.coreJavascript,
    ],
    [
      'public/ocr/tesseract/tesseract-core-lstm.wasm',
      OCR_RUNTIME_CONFIG.assetSha256.coreWasm,
    ],
    ['public/ocr/tessdata/eng.traineddata.gz', OCR_RUNTIME_CONFIG.assetSha256.englishTrainedData],
    ['public/ocr/tessdata/vie.traineddata.gz', OCR_RUNTIME_CONFIG.assetSha256.vietnameseTrainedData],
  ] as const

  for (const [relativePath, expectedSha256] of assets) {
    const content = readFileSync(path.join(process.cwd(), relativePath))
    const actualSha256 = createHash('sha256').update(content).digest('hex').toUpperCase()
    assert.equal(actualSha256, expectedSha256, relativePath)
  }
})

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

test('TikTok normalized ROI text keeps traffic-card values in label order', () => {
  const review = parseDashboardOcrText('tiktok_shop', [
    'Lượt hiển thị',
    'Lượt xem',
    'Chi phí quảng cáo',
    'Tỷ lệ nhấn',
    '91.95K',
    '2.31K',
    '2.11M',
    '2.52%',
  ].join('\n'))
  const values = reviewInputValues(review)
  assert.equal(values.impressions, 91950)
  assert.equal(values.total_views, 2310)
  assert.equal(values.advertising_cost, 2110000)
  assert.equal(values.click_rate, 2.52)
})

test('TikTok count-or-compact cards preserve a suffix split from its numeric token', () => {
  const dimensions = { width: 2200, height: 1300 }
  const words = customLayoutWords({ left: 310, top: 130, width: 1460, height: 850 })
  const currentViewerValue = words.findIndex(word =>
    word.line_id === 'layout:current_viewers:value',
  )
  assert.ok(currentViewerValue >= 0)
  const original = words[currentViewerValue]
  words.splice(
    currentViewerValue,
    1,
    recognizedWord(
      '1.23',
      original.bounding_box.x,
      original.bounding_box.y,
      original.bounding_box.width - 12,
      original.bounding_box.height,
      'numeric',
      'layout:current_viewers:value',
    ),
    recognizedWord(
      'K',
      original.bounding_box.x + original.bounding_box.width - 10,
      original.bounding_box.y,
      10,
      original.bounding_box.height,
      'numeric',
      'layout:current_viewers:value',
      1,
    ),
  )

  const regions = detectDashboardRegions({
    words,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    requestedPlatform: 'tiktok_shop',
  })
  assert.ok(regions.selected)
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

  assert.equal(reviewInputValues(review).current_viewers, 1230)
  assert.equal(reviewInputValues(review).click_rate, expected.click_rate)
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
  assert.equal(buildOcrMetric(
    'tiktok_shop',
    'Estimated GMV',
    'not-a-number',
    'high',
    'word_box_exact',
    'confirmed',
  ), null)
  assert.equal(buildOcrMetric(
    'tiktok_shop',
    'Current Viewers',
    '1.23K',
    'high',
    'word_box_exact',
    'confirmed',
  )?.[1].value, 1230)
})

test('TikTok preprocessing variants from one card crop cannot create false independent consensus', () => {
  const commentsCell = platformMetricLayouts.tiktok_shop.find(cell => cell.key === 'comments')
  assert.ok(commentsCell)
  const cardBox = {
    x: (commentsCell.x - commentsCell.width / 2) * 1600,
    y: (commentsCell.y - commentsCell.height / 2) * 900,
    width: commentsCell.width * 1600,
    height: commentsCell.height * 900,
  }
  const evidenceGroup = 'anchor_card:candidate-1:comments'
  const cardWords = ['inverted_grayscale', 'fixed_threshold', 'adaptive_light_text']
    .map((preprocessingPass, index) => ({
      ...recognizedWord(
        '254',
        cardBox.x,
        cardBox.y,
        cardBox.width,
        cardBox.height,
        'card',
        `card:comments:${index}`,
      ),
      evidence_source_family: 'anchor_aligned_card_crop' as const,
      evidence_group: evidenceGroup,
      confidence: 94 - index,
      preprocessingPass,
    }))
  const recognition: OcrImageRecognition = {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: 'Comments: 234',
    pass_output: {
      label: 'Comments: 234',
      numeric: '',
      card: { comments: ['254', '254', '254'] },
      card_labels: { comments: ['Comments'] },
      card_diagnostics: {
        comments: cardWords.map(word => ({
          text: word.text,
          confidence: word.confidence,
          preprocessing_pass: word.preprocessingPass,
          evidence_source_family: word.evidence_source_family,
          evidence_group: word.evidence_group,
          bounding_box: word.bounding_box,
        })),
      },
      strategy_text: {
        normalized_roi: 'Comments: 234',
      },
    },
    confidence: 94,
    words: cardWords,
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: 1600, height: 900 },
    processed_dimensions: { width: 1600, height: 900 },
  }
  const review = mapDashboardImageRecognition('tiktok_shop', recognition)
  const metric = review.metrics.comments

  assert.ok(metric)
  if (metric.value === 254) {
    assert.equal(metric.status, 'review_required')
    assert.equal(metric.needs_review, true)
  }
  const selectedGroups = new Set(
    metric.strategy_candidates
      ?.filter(candidate => candidate.value_candidate === metric.value)
      .map(candidate => candidate.evidence_group),
  )
  if (selectedGroups.size <= 1) assert.notEqual(metric.status, 'confirmed')
})

test('TikTok advertising cost is confirmed when independent card and normalized ROI evidence agree', () => {
  const advertisingCell = platformMetricLayouts.tiktok_shop
    .find(cell => cell.key === 'advertising_cost')
  assert.ok(advertisingCell)
  const evidenceGroup = 'anchor_card:candidate-1:advertising_cost'
  const cardWord: OcrRecognizedWord = {
    ...recognizedWord(
      '2.11M',
      (advertisingCell.x - advertisingCell.width / 2) * 1600,
      (advertisingCell.y - advertisingCell.height / 2) * 900,
      advertisingCell.width * 1600,
      advertisingCell.height * 900,
      'card',
      'card:advertising_cost:0',
    ),
    evidence_source_family: 'anchor_aligned_card_crop',
    evidence_group: evidenceGroup,
  }
  const review = mapDashboardImageRecognition('tiktok_shop', {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: 'Advertising Cost: 2.11M',
    pass_output: {
      label: 'Advertising Cost: 2.11M',
      numeric: '',
      card: { advertising_cost: ['2.11M'] },
      card_labels: { advertising_cost: ['Advertising Cost'] },
      card_diagnostics: {
        advertising_cost: [{
          text: '2.11M',
          confidence: 96,
          preprocessing_pass: 'original_color',
          evidence_source_family: 'anchor_aligned_card_crop',
          evidence_group: evidenceGroup,
          bounding_box: cardWord.bounding_box,
        }],
      },
      strategy_text: {
        normalized_roi: 'Advertising Cost: 2.11M',
      },
    },
    confidence: 96,
    words: [cardWord],
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: 1600, height: 900 },
    processed_dimensions: { width: 1600, height: 900 },
  })

  assert.equal(review.metrics.advertising_cost?.value, 2110000)
  assert.equal(review.metrics.advertising_cost?.status, 'confirmed')
  assert.equal(review.metrics.advertising_cost?.needs_review, false)
  assert.match(
    review.metrics.advertising_cost?.pairing_reason || '',
    /2 independent evidence groups agree/,
  )
})

test('TikTok card diagnostics recover a visually owned compact value without creating confirmation consensus', () => {
  const totalViewsCell = platformMetricLayouts.tiktok_shop
    .find(cell => cell.key === 'total_views')
  assert.ok(totalViewsCell)
  const evidenceGroup = 'anchor_card:candidate-1:total_views'
  const boundingBox = {
    x: (totalViewsCell.x - totalViewsCell.width / 2) * 1600,
    y: (totalViewsCell.y - totalViewsCell.height / 2) * 900,
    width: totalViewsCell.width * 1600,
    height: totalViewsCell.height * 900,
  }
  const review = mapDashboardImageRecognition('tiktok_shop', {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: '',
    pass_output: {
      label: '',
      numeric: '',
      card: { total_views: ['2.0K'] },
      card_labels: { total_views: ['Lượt xem'] },
      card_diagnostics: {
        total_views: [
          {
            text: '2.0K',
            confidence: 29,
            preprocessing_pass: 'inverted_grayscale',
            evidence_source_family: 'anchor_aligned_card_crop',
            evidence_group: evidenceGroup,
            bounding_box: boundingBox,
          },
          {
            text: '201K',
            confidence: 43,
            preprocessing_pass: 'adaptive_light_text',
            evidence_source_family: 'anchor_aligned_card_crop',
            evidence_group: evidenceGroup,
            bounding_box: boundingBox,
          },
        ],
      },
      strategy_text: {
        normalized_roi: '',
      },
    },
    confidence: 43,
    words: [],
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: 1600, height: 900 },
    processed_dimensions: { width: 1600, height: 900 },
  })

  assert.equal(review.metrics.total_views?.value, 2010)
  assert.equal(review.metrics.total_views?.status, 'review_required')
  assert.equal(review.metrics.total_views?.needs_review, true)
  assert.equal(
    new Set(
      review.metrics.total_views?.strategy_candidates
        ?.filter(candidate => candidate.value_candidate === 2010)
        .map(candidate => candidate.evidence_group),
    ).size,
    1,
  )
})

test('TikTok normalized compact evidence cannot drop a glyph seen by the original card crop', () => {
  const estimatedGmvCell = platformMetricLayouts.tiktok_shop
    .find(cell => cell.key === 'estimated_gmv')
  assert.ok(estimatedGmvCell)
  const evidenceGroup = 'anchor_card:candidate-1:estimated_gmv'
  const boundingBox = {
    x: (estimatedGmvCell.x - estimatedGmvCell.width / 2) * 1600,
    y: (estimatedGmvCell.y - estimatedGmvCell.height / 2) * 900,
    width: estimatedGmvCell.width * 1600,
    height: estimatedGmvCell.height * 900,
  }
  const review = mapDashboardImageRecognition('tiktok_shop', {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: 'Estimated GMV: 1.25M',
    pass_output: {
      label: 'Estimated GMV: 1.25M',
      numeric: '',
      card: { estimated_gmv: ['12.13M', '12.13M'] },
      card_labels: { estimated_gmv: ['Estimated GMV'] },
      card_diagnostics: {
        estimated_gmv: [
          {
            text: '12.13M',
            confidence: 55,
            preprocessing_pass: 'original_color',
            evidence_source_family: 'anchor_aligned_card_crop',
            evidence_group: evidenceGroup,
            bounding_box: boundingBox,
          },
          {
            text: '12.13M',
            confidence: 58,
            preprocessing_pass: 'local_contrast',
            evidence_source_family: 'anchor_aligned_card_crop',
            evidence_group: evidenceGroup,
            bounding_box: boundingBox,
          },
        ],
      },
      strategy_text: {
        normalized_roi: 'Estimated GMV: 1.25M',
      },
    },
    confidence: 58,
    words: [],
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: 1600, height: 900 },
    processed_dimensions: { width: 1600, height: 900 },
  })

  assert.equal(review.metrics.estimated_gmv?.value, 12130000)
  assert.equal(review.metrics.estimated_gmv?.status, 'review_required')
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
