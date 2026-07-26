import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { POST } from '../app/api/ocr/route.ts'
import type { ReportDashboardPlatform, ReportMetricKey } from '../lib/types/database.types.ts'
import {
  buildDashboardOcrReviewFromRecognition,
  parseDashboardOcrText,
} from '../lib/utils/ocrMetrics.ts'
import { reviewInputValues } from '../lib/utils/ocrReview.ts'

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
    expected: {
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
    },
  },
]

for (const fixture of fixtures) {
  const imagePath = process.env[fixture.environmentPath]
  test(`real ${fixture.platform} screenshot reaches spatial OCR metrics`, {
    skip: imagePath ? false : `${fixture.environmentPath} is not configured`,
    timeout: 300_000,
  }, async () => {
    assert.ok(imagePath)
    const bytes = await readFile(imagePath)
    const formData = new FormData()
    formData.append('platform', fixture.platform)
    formData.append('crop', JSON.stringify({ left: 0, top: 0, width: 1, height: 1 }))
    formData.append('image', new File([bytes], `${fixture.platform}.jpg`, { type: 'image/jpeg' }))
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
    const review = buildDashboardOcrReviewFromRecognition(fixture.platform, body.data)
    const values = reviewInputValues(review)
    const rawOnlyValues = reviewInputValues(parseDashboardOcrText(
      fixture.platform,
      body.data.pass_output.label,
      'raw_text_exact',
    ))
    const mismatches = Object.entries(fixture.expected).flatMap(([key, expected]) =>
      values[key as ReportMetricKey] === Number(expected)
        ? []
        : [`${key}: expected ${expected}, received ${values[key as ReportMetricKey] ?? 'missing'}`],
    )
    assert.deepEqual(
      mismatches,
      [],
      JSON.stringify({
        card: body.data.pass_output.card,
        labelText: body.data.pass_output.label,
        numericText: body.data.pass_output.numeric,
        finalMetrics: Object.fromEntries(Object.entries(review.metrics).map(([key, metric]) => [key, {
          raw: metric.raw_value,
          value: metric.value,
          source: metric.source,
          confidence: metric.value_confidence,
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
      else if (rawOnlyValues[key] === Number(expected)) counts.correct += 1
      else counts.incorrect += 1
      return counts
    }, { correct: 0, incorrect: 0, missing: 0 })
    console.info(JSON.stringify({
      platform: fixture.platform,
      rawOnlyBaseline,
      spatialStatuses,
      spatialCorrect: expectedEntries.filter(([key, expected]) => values[key] === Number(expected)).length,
    }))
  })
}

export function expectedRealScreenshotMetrics(platform: ReportDashboardPlatform) {
  return fixtures.find(fixture => fixture.platform === platform)?.expected
}
