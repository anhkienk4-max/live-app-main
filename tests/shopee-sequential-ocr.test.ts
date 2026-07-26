import assert from 'node:assert/strict'
import test from 'node:test'

import { parseDashboardOcrText } from '../lib/utils/ocrMetrics.ts'
import {
  applyOcrCandidatesToLiveUpdateForm,
  applyOcrCandidatesToMetricState,
  type LiveUpdateOcrFormState,
} from '../lib/utils/ocrReview.ts'

const sequentialShopeeText = [
  'Sales',
  'Engaged Viewer',
  'Comments',
  'ATC',
  'Total Views',
  'Viewing Duration',
  'Comments Rate',
  'GPM',
  'Orders',
  'ABS',
  'Total Viewers',
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
  '9,8%',
  '104',
  '116',
].join('\n')

const expectedSequentialMetrics = {
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
  click_to_order_rate: '9.8',
  buyers: '104',
  items_sold: '116',
}

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

test('real Shopee label block followed by value block creates all 15 candidates', () => {
  const review = parseDashboardOcrText('shopee_live', sequentialShopeeText, 'raw_text_exact')
  const formState = applyOcrCandidatesToMetricState({}, review)

  assert.equal(Object.keys(review.metrics).length, 15)
  assert.deepEqual(formState, expectedSequentialMetrics)
  assert.equal(Object.values(review.metrics).every(candidate =>
    candidate?.source === 'raw_text_sequence'
    && candidate.status === 'review_required'
    && candidate.normalized_key
    && candidate.normalized_value !== null
    && candidate.bounding_box === undefined,
  ), true)
})

test('all sequential candidates reach Final Report state and supported metrics reach Live Update state', () => {
  const review = parseDashboardOcrText('shopee_live', sequentialShopeeText, 'raw_text_exact')
  const finalReportState = applyOcrCandidatesToMetricState({ likes: '7' }, review)
  const liveState = applyOcrCandidatesToLiveUpdateForm({
    ...emptyLiveForm(),
    gmv: '88',
    current_viewers: '6',
    notes: 'keep note',
    screenshot_url: 'blob:keep',
  }, review)

  assert.deepEqual(finalReportState, { likes: '7', ...expectedSequentialMetrics })
  assert.equal(liveState.revenue, '21281718')
  assert.equal(liveState.orders, '109')
  assert.equal(liveState.peak_viewers, '107')
  assert.equal(liveState.total_views, '13262')
  assert.equal(liveState.total_viewers, '8380')
  assert.equal(liveState.comments, '51')
  assert.equal(liveState.gmv, '88')
  assert.equal(liveState.current_viewers, '6')
  assert.equal(liveState.notes, 'keep note')
  assert.equal(liveState.screenshot_url, 'blob:keep')
  assert.equal('add_to_cart' in liveState, false)
  assert.equal('engaged_viewers' in liveState, false)
})

test('partial and noisy Shopee labels pair with immediate next-line values', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'I Viewing Duration',
    '00:00:25',
    '| Comments Rate',
    '0.4%',
    'GPM (đ)',
    '1.604.714,07',
    'Click to Order Rate (CO)',
    '9.8%',
  ].join('\n'), 'raw_text_exact')

  assert.equal(review.metrics.average_view_duration_seconds?.value, 25)
  assert.equal(review.metrics.comment_rate?.value, 0.4)
  assert.equal(review.metrics.gpm?.value, 1604714.07)
  assert.equal(review.metrics.click_to_order_rate?.value, 9.8)
  assert.equal(Object.values(review.metrics).every(candidate =>
    candidate?.source === 'raw_text_exact' && candidate.status === 'confirmed',
  ), true)
})

test('same-line and mixed sequential text preserve extraction priority', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'Sales: 21.281.718,00',
    'OCR decorative heading',
    'Orders',
    'PCU',
    '109',
    '107',
    'Sales',
    '999',
  ].join('\n'), 'raw_text_exact')

  assert.equal(review.metrics.sales?.value, 21281718)
  assert.equal(review.metrics.sales?.source, 'raw_text_exact')
  assert.equal(review.metrics.orders?.value, 109)
  assert.equal(review.metrics.pcu?.value, 107)
})

test('one missing value keeps only unique type matches and rejects ambiguous shifts', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'Orders',
    'ABS',
    'Comments Rate',
    '109',
    '9.8%',
  ].join('\n'), 'raw_text_exact')

  assert.equal(review.metrics.comment_rate?.value, 9.8)
  assert.equal(review.metrics.orders, undefined)
  assert.equal(review.metrics.average_basket_size, undefined)
  assert.equal(review.unmapped_fields?.some(field => field.original_label === 'Orders'), true)
  assert.equal(review.unmapped_fields?.some(field => field.original_label === 'ABS'), true)
})

test('incompatible positional values never cross-map percentage and count metrics', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'Orders',
    'Click to Order Rate',
    '9.8%',
    '109',
  ].join('\n'), 'raw_text_exact')

  assert.equal(review.metrics.orders, undefined)
  assert.equal(review.metrics.click_to_order_rate, undefined)
  assert.equal(Object.keys(review.metrics).length, 0)
})

test('same-line type guards reject percentage, currency, and malformed duration cross-maps', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'Orders: 9%',
    'Comments Rate: 9đ',
    'Sales: 9%',
    'Viewing Duration: 25',
  ].join('\n'), 'raw_text_exact')

  assert.equal(Object.keys(review.metrics).length, 0)
  assert.equal(review.unmapped_fields?.length, 4)
})

test('sequential candidates preserve valid zero values', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'Comments',
    'Comments Rate',
    '0',
    '0%',
  ].join('\n'), 'raw_text_exact')

  assert.equal(review.metrics.comments?.value, 0)
  assert.equal(review.metrics.comment_rate?.value, 0)
  assert.equal(applyOcrCandidatesToMetricState({}, review).comments, '0')
  assert.equal(applyOcrCandidatesToMetricState({}, review).comment_rate, '0')
})

test('extra noisy lines do not change deterministic sequential pairing', () => {
  const noisy = sequentialShopeeText.replace(
    'Comments Rate\nGPM',
    'Comments Rate\n--- LIVE Insight ---\nGPM',
  )
  const review = parseDashboardOcrText('shopee_live', noisy, 'raw_text_exact')

  assert.equal(Object.keys(review.metrics).length, 15)
  assert.deepEqual(applyOcrCandidatesToMetricState({}, review), expectedSequentialMetrics)
  assert.equal(review.unmapped_fields?.some(field => field.original_label.includes('LIVE Insight')), true)
})
