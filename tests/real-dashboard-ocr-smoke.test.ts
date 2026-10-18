import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'

import { POST } from '../app/api/ocr/route.ts'
import type { ReportDashboardPlatform, ReportMetricKey } from '../lib/types/database.types.ts'
import {
  buildDashboardOcrReviewFromRecognition,
  parseDashboardOcrText,
} from '../lib/utils/ocrMetrics.ts'
import { reviewInputValues } from '../lib/utils/ocrReview.ts'
import { proposeTikTokKpiPanelCrop } from '../lib/utils/dashboardRegionDetection.ts'

const fixtures = [
  {
    platform: 'shopee_live' as const,
    environmentPath: 'SHOPEE_SCREENSHOT',
    expected: {
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
    },
  },
  {
    platform: 'tiktok_shop' as const,
    environmentPath: 'TIKTOK_SCREENSHOT',
    fixturePath: 'e2e/fixtures/ocr/tiktok-layout-variants/tiktok-real-2026-06-26-evening.png',
    expected: {
      gmv: '13566119',
      items_sold: '140',
      impressions: '119520',
      total_views: '2400',
      advertising_cost: '3060000',
      click_rate: '2.02',
      roi_gmv_max: '5.23',
      ctor: '7.48',
      average_view_duration_seconds: '39',
      new_followers: '13',
      buyers: '62',
      sku_orders: '124',
      comments: '114',
      product_clicks: '1030',
      average_order_value: '176180',
      live_ctr: '42.74',
      shares: '8',
      estimated_gmv: '12130000',
    },
  },
]

const tiktokExpectedDisplay: Partial<Record<ReportMetricKey, string>> = {
  gmv: '13,566,119', items_sold: '140', impressions: '119.52K', total_views: '2.4K',
  advertising_cost: '3.06M', click_rate: '2.02%', roi_gmv_max: '5.23', ctor: '7.48%',
  average_view_duration_seconds: '39s', new_followers: '13', buyers: '62', sku_orders: '124',
  comments: '114', product_clicks: '1.03K', average_order_value: '176.18K', live_ctr: '42.74%',
  shares: '8', estimated_gmv: '12.13M',
}

function matchesExpectedDisplay(key: ReportMetricKey, actual: number | undefined, expected: string, platform: ReportDashboardPlatform) {
  if (actual === undefined) return false
  const display = platform === 'tiktok_shop' ? tiktokExpectedDisplay[key] : undefined
  if (!display) return actual === Number(expected)
  const compactMatch = display.match(/^([\d.]+)([KM])$/)
  if (compactMatch) {
    const factor = compactMatch[2] === 'M' ? 1_000_000 : 1_000
    const precision = compactMatch[1].split('.')[1]?.length || 0
    return (actual / factor).toFixed(precision) === compactMatch[1]
  }
  const unitMatch = display.match(/^([\d.]+)([%s])$/)
  if (unitMatch) {
    const precision = unitMatch[1].split('.')[1]?.length || 0
    return actual.toFixed(precision) === unitMatch[1]
  }
  return actual === Number(expected)
}
for (const fixture of fixtures) {
  const imagePath = process.env[fixture.environmentPath] || ('fixturePath' in fixture ? fixture.fixturePath : undefined)
  test(`real ${fixture.platform} screenshot never accepts unverified OCR values`, {
    skip: imagePath ? false : `${fixture.environmentPath} is not configured`,
    timeout: 300_000,
  }, async () => {
    assert.ok(imagePath)
    const bytes = await readFile(imagePath)
    const formData = new FormData()
    formData.append('platform', fixture.platform)
    let crop = { left: 0, top: 0, width: 1, height: 1 }
    if (fixture.platform === 'tiktok_shop') {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const proposal = proposeTikTokKpiPanelCrop(new Uint8ClampedArray(data), info.width, info.height)
      crop = proposal.crop_box
      assert.equal(proposal.source, 'gradient_panel')
      assert.ok(crop.left > 0.15 && crop.left < 0.4 && crop.width < 0.7, JSON.stringify(proposal))
    }
    formData.append('crop', JSON.stringify(crop))
    const type = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    formData.append('image', new File([bytes], `${fixture.platform}.${type === 'image/png' ? 'png' : 'jpg'}`, { type }))
    const response = await POST(new Request('http://localhost/api/ocr', {
      method: 'POST',
      body: formData,
    }))
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true)
    assert.equal(response.status, 200, await response.clone().text())
    const body = await response.json() as {
      ok: true
      data: Parameters<typeof buildDashboardOcrReviewFromRecognition>[1]
    }
    assert.equal(body.data.engine, 'tesseract.js')
    if ('fixturePath' in fixture && imagePath === fixture.fixturePath) {
      assert.equal(body.data.region_diagnostics?.selection_reason, 'anchor_calibrated_crop')
    }
    const review = buildDashboardOcrReviewFromRecognition(fixture.platform, body.data)
    const values = reviewInputValues(review)
    const rawOnlyValues = reviewInputValues(parseDashboardOcrText(
      fixture.platform,
      body.data.pass_output.label,
      'raw_text_exact',
    ))
    const mismatches = Object.entries(fixture.expected).flatMap(([key, expected]) =>
      matchesExpectedDisplay(
      key as ReportMetricKey,
      values[key as ReportMetricKey] as number | undefined,
      expected,
      fixture.platform,
    )
        ? []
        : [`${key}: expected ${expected}, received ${values[key as ReportMetricKey] ?? 'missing'}`],
    )
    const unsafeMismatches = Object.entries(fixture.expected).flatMap(([key, expected]) => {
      if (matchesExpectedDisplay(
        key as ReportMetricKey,
        values[key as ReportMetricKey] as number | undefined,
        expected,
        fixture.platform,
      )) return []
      const metric = review.metrics[key as ReportMetricKey]
      return metric && metric.status !== 'review_required' && metric.status !== 'low_confidence' && metric.status !== 'rejected' && metric.needs_review !== true
        ? [`${key}: incorrect ${values[key as ReportMetricKey]} was marked ${metric.status || 'accepted'}`]
        : []
    })
    assert.deepEqual(
      unsafeMismatches,
      [],
      JSON.stringify({
        exactMatches: Object.keys(fixture.expected).length - mismatches.length,
        totalExpected: Object.keys(fixture.expected).length,
        unsafeMismatches,
        card: body.data.pass_output.card,
        labelText: body.data.pass_output.label,
        numericText: body.data.pass_output.numeric,
        finalMetrics: Object.fromEntries(Object.entries(review.metrics).map(([key, metric]) => [key, {
          raw: metric.raw_value,
          value: metric.value,
          source: metric.source,
          confidence: metric.value_confidence,
          status: metric.status,
          needs_review: metric.needs_review,
          rejection_reason: metric.rejection_reason,
        }])),
        cardWords: body.data.words
          .filter(word => word.pass === 'card')
          .map(word => ({
            line: word.line_id,
            text: word.text,
            confidence: word.confidence,
          })),
      }, null, 2),
    )
    const expectedEntries = Object.entries(fixture.expected) as Array<[ReportMetricKey, string]>
    const spatialStatuses = expectedEntries.reduce((counts, [key]) => {
      const status = review.metrics[key]?.status
      if (status === 'confirmed' || status === 'accepted') counts.confirmed += 1
      else if (values[key] !== undefined) counts.review += 1
      else counts.missing += 1
      return counts
    }, { confirmed: 0, review: 0, missing: 0 })
    const rawOnlyBaseline = expectedEntries.reduce((counts, [key, expected]) => {
      if (rawOnlyValues[key] === undefined) counts.missing += 1
      else if (matchesExpectedDisplay(
        key,
        rawOnlyValues[key] as number | undefined,
        expected,
        fixture.platform,
      )) counts.correct += 1
      else counts.incorrect += 1
      return counts
    }, { correct: 0, incorrect: 0, missing: 0 })
    const metricDiagnostics = expectedEntries.map(([key, expected]) => {
      const metric = review.metrics[key]
      const cardPasses = body.data.pass_output.card_diagnostics?.[key] || []
      const firstCardRead = cardPasses.find(candidate => candidate.text.trim())
      const actualValue = values[key]
      const exactMatch = actualValue === Number(expected)
      const displayMatch = matchesExpectedDisplay(key, actualValue as number | undefined, expected, fixture.platform)
      return {
        key,
        expected_display: fixture.platform === 'tiktok_shop' ? tiktokExpectedDisplay[key] : expected,
        actual_ocr_raw: metric?.raw_value || metric?.raw_ocr_value || firstCardRead?.text || null,
        normalized_value: actualValue ?? null,
        label_detection_source: metric?.label_source || (metric ? metric.source : null) || null,
        bounding_box: metric?.value_box || metric?.bounding_box || firstCardRead?.bounding_box || null,
        candidate_confidence: metric?.value_confidence ?? firstCardRead?.confidence ?? null,
        outcome: actualValue === undefined ? 'missing' : displayMatch ? 'match' : 'incorrect',
        exact_numeric_match: exactMatch,
        status: metric?.status || 'missing',
        root_cause: metric?.rejection_reason || metric?.conflict_warning || metric?.pairing_reason || null,
      }
    })
    console.info(JSON.stringify({
      platform: fixture.platform,
      metricDiagnostics,
      rawOnlyBaseline,
      spatialStatuses,
      spatialCorrect: expectedEntries.filter(([key, expected]) => matchesExpectedDisplay(key, values[key] as number | undefined, expected, fixture.platform)).length,
    }))
  })
}

export function expectedRealScreenshotMetrics(platform: ReportDashboardPlatform) {
  return fixtures.find(fixture => fixture.platform === platform)?.expected
}
