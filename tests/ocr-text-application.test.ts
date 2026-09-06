import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  parseAndApplyOcrText,
} from '../lib/utils/ocrReview.ts'

const actualQaRawText = [
  'Sales',
  'Engaged Viewer',
  'Comments',
  'ATC',
  'Total Views',
  'Avg. Viewing Duration',
  'Comments Rate',
  'GPM',
  'Orders',
  'ABS',
  'Total Viewer',
  'PCU',
  'Click to Order Rate',
  'Buyers',
  'Items Sold',
  '',
  '21.281.718,00',
  '521',
  '51',
  '436',
  '13.262',
  '00:00:25',
  '0,4%',
  '1.604.714,07',
  '109',
  '195.245,12',
  '8.380',
  '107',
  '8,4%',
  '9,8%',
  '104',
  '116',
].join('\n')

const expectedMetrics = {
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
}

test('Apply OCR data creates the canonical state rendered by Final Report inputs', () => {
  const result = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: actualQaRawText,
    currentMetrics: { likes: '7' },
    overwriteOcrValues: true,
  })

  assert.deepEqual(result.metrics, { likes: '7', ...expectedMetrics })
  assert.deepEqual([...result.appliedKeys].sort(), Object.keys(expectedMetrics).sort())
  assert.equal(result.reviewRequiredKeys.length, 16)
  assert.equal(result.unmappedLines.length, 0)
  assert.equal(result.warnings.some(warning => warning.includes('CTR was inferred')), true)
})

test('Apply OCR data populates the canonical Live Update metric state without legacy form mirroring', () => {
  const result = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: actualQaRawText,
    currentMetrics: {},
    overwriteOcrValues: true,
  })

  assert.equal(result.metrics.sales, 21281718)
  assert.equal(result.metrics.orders, 109)
  assert.equal(result.metrics.pcu, 107)
  assert.equal(result.metrics.total_views, 13262)
  assert.equal(result.metrics.total_viewers, 8380)
  assert.equal(result.metrics.comments, 51)
  assert.equal(result.metrics.ctr, 8.4)
  assert.equal(result.metrics.add_to_cart, 436)
})

test('clicking Apply again updates OCR-derived values but keeps protected manual metrics', () => {
  const first = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: 'Sales: 100\nOrders: 2',
    currentMetrics: {},
    overwriteOcrValues: true,
  })
  const reapplied = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: 'Sales: 250\nOrders: 4',
    currentMetrics: first.metrics,
    overwriteOcrValues: true,
  })
  const protectedResult = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: 'Sales: 999\nOrders: 8',
    currentMetrics: { ...reapplied.metrics, sales: 300 },
    overwriteOcrValues: true,
    protectedKeys: ['sales'],
  })

  assert.equal(reapplied.metrics.sales, 250)
  assert.equal(reapplied.metrics.orders, 4)
  assert.equal(protectedResult.metrics.sales, 300)
  assert.equal(protectedResult.metrics.orders, 8)
})

test('Apply OCR data preserves valid zero values', () => {
  const result = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: 'Comments: 0\nComments Rate: 0%',
    currentMetrics: {},
    overwriteOcrValues: true,
  })

  assert.equal(result.metrics.comments, 0)
  assert.equal(result.metrics.comment_rate, 0)
})

test('both Apply OCR buttons and automatic recognition paths update the state bound to form inputs', () => {
  const reportSource = readFileSync(
    new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url),
    'utf8',
  )
  const liveSource = readFileSync(
    new URL('../components/features/live/DashboardUpdateModal.tsx', import.meta.url),
    'utf8',
  )
  const boundFieldsSource = readFileSync(
    new URL('../components/features/reports/OcrBoundMetricFields.tsx', import.meta.url),
    'utf8',
  )

  assert.match(reportSource, /data-testid="apply-report-ocr-text"/)
  assert.match(reportSource, /onClick=\{\(\) => applyRawOcrText\(\)\}/)
  assert.match(reportSource, /applyRawOcrText\(recognizedText, candidate\)/)
  assert.match(reportSource, /setMetricValues\(current => parseAndApplyOcrText/)
  assert.match(reportSource, /values=\{metricValues\}/)

  assert.match(liveSource, /data-testid="apply-live-ocr-text"/)
  assert.match(liveSource, /onClick=\{\(\) => applyRawOcrText\(\)\}/)
  assert.match(liveSource, /applyRawOcrText\(recognizedText, review\)/)
  assert.match(liveSource, /setMetricValues\(current => parseAndApplyOcrText/)
  assert.doesNotMatch(liveSource, /applyOcrCandidatesToLiveUpdateForm/)
  assert.doesNotMatch(liveSource, /formData\.(?:revenue|gmv|orders|peak_viewers|current_viewers|total_views|total_viewers|likes|comments|shares)/)
  assert.match(liveSource, /values=\{metricValues\}/)
  assert.match(boundFieldsSource, /value=\{metricValueToInput\(values\[key\]\)\}/)
})
