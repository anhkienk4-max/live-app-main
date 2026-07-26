import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { OcrReviewData, ReportMetricKey } from '../lib/types/database.types.ts'
import { parseDashboardOcrText } from '../lib/utils/ocrMetrics.ts'
import {
  applyOcrCandidatesToLiveUpdateForm,
  applyOcrCandidatesToMetricState,
  canonicalizeOcrReview,
  clearOcrDerivedLiveUpdateForm,
  clearOcrDerivedMetricState,
  liveUpdateFieldsForMetricKeys,
  ocrCandidateMetricKeys,
  shouldInitializeOcrSelection,
  type LiveUpdateOcrFormState,
} from '../lib/utils/ocrReview.ts'

const shopeeSample = [
  'Sales: 21.281.718,00',
  'Engaged Viewer: 521',
  'Comments: 51',
  'ATC: 436',
  'Total Views: 13.262',
  'Avg. Viewing Duration: 00:00:25',
  'Comments Rate: 0,4%',
  'GPM: 1.604.714,07',
  'Orders: 109',
  'ABS: 195.245,12',
  'Total Viewers: 8.380',
  'PCU: 107',
  'CTR: 8,4%',
  'Click to Order Rate: 9,8%',
  'Buyers: 104',
  'Items Sold: 116',
].join('\n')

const expectedShopeeMetrics = {
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

test('Final Report state uses normalized_key and accepts confirmed, review, and low-confidence candidates', () => {
  const parsed = parseDashboardOcrText('shopee_live', shopeeSample, 'raw_text_exact')
  const review: OcrReviewData = {
    ...parsed,
    metrics: Object.fromEntries(
      Object.entries(parsed.metrics).map(([key, metric], index) => [
        `server_${key}`,
        metric && {
          ...metric,
          normalized_key: key as ReportMetricKey,
          status: index % 3 === 0
            ? 'confirmed'
            : index % 3 === 1
              ? 'review_required'
              : 'low_confidence',
        },
      ]),
    ),
  }

  const state = applyOcrCandidatesToMetricState({ likes: '77' }, review)
  assert.deepEqual(state, { likes: '77', ...expectedShopeeMetrics })
  assert.equal(Object.keys(state).some(key => key.startsWith('server_')), false)
  assert.deepEqual(
    Object.keys(canonicalizeOcrReview(review).metrics),
    Object.keys(expectedShopeeMetrics),
  )
})

test('candidate adapter preserves zero and excludes rejected, invalid, and non-finite values', () => {
  const review: OcrReviewData = {
    status: 'review_required',
    metrics: {
      zero_comments: {
        value: 0,
        normalized_key: 'comments',
        confidence: 'high',
        status: 'confirmed',
      },
      rejected_orders: {
        value: 109,
        normalized_key: 'orders',
        confidence: 'high',
        status: 'rejected',
      },
      invalid_pcu: {
        value: Number.NaN,
        normalized_key: 'pcu',
        confidence: 'low',
        status: 'low_confidence',
      },
      infinite_sales: {
        value: Number.POSITIVE_INFINITY,
        normalized_key: 'sales',
        confidence: 'low',
        status: 'review_required',
      },
      empty_gpm: {
        value: null,
        normalized_key: 'gpm',
        confidence: 'low',
        status: 'empty',
      },
    },
  }

  assert.deepEqual(applyOcrCandidatesToMetricState({}, review), { comments: '0' })
})

test('automatic OCR merge preserves manual edits and explicit Apply again replaces matching fields', () => {
  const review = parseDashboardOcrText('shopee_live', 'Sales: 21.281.718,00\nOrders: 109', 'raw_text_exact')
  const current = { sales: '999', orders: '8', notes: 'not a metric' } as Partial<Record<ReportMetricKey, string>>
  const protectedKeys: ReportMetricKey[] = ['sales', 'orders']

  assert.deepEqual(
    applyOcrCandidatesToMetricState(current, review, { protectedKeys }),
    current,
  )
  assert.deepEqual(
    applyOcrCandidatesToMetricState(current, review, {
      protectedKeys,
      overwriteProtected: true,
    }),
    { ...current, sales: '21281718', orders: '109' },
  )
})

test('Live Dashboard Update maps only supported aliases and preserves unrelated form fields', () => {
  const review = parseDashboardOcrText('shopee_live', shopeeSample, 'raw_text_exact')
  const current: LiveUpdateOcrFormState = {
    ...emptyLiveForm(),
    gmv: '88',
    current_viewers: '7',
    notes: 'manual note',
    screenshot_url: 'blob:dashboard',
  }
  const next = applyOcrCandidatesToLiveUpdateForm(current, review)

  assert.equal(next.revenue, '21281718')
  assert.equal(next.orders, '109')
  assert.equal(next.peak_viewers, '107')
  assert.equal(next.total_views, '13262')
  assert.equal(next.total_viewers, '8380')
  assert.equal(next.comments, '51')
  assert.equal(next.gmv, '88')
  assert.equal(next.current_viewers, '7')
  assert.equal(next.notes, 'manual note')
  assert.equal(next.screenshot_url, 'blob:dashboard')
  assert.equal('add_to_cart' in next, false)
  assert.equal('engaged_viewers' in next, false)
})

test('Live Dashboard Update protects manual form fields until explicit Apply again', () => {
  const review = parseDashboardOcrText('shopee_live', 'Sales: 21.281.718,00\nOrders: 109\nPCU: 107', 'raw_text_exact')
  const current = {
    ...emptyLiveForm(),
    revenue: '500',
    orders: '8',
    notes: 'keep',
  }
  const protectedResult = applyOcrCandidatesToLiveUpdateForm(current, review, ['revenue', 'orders'])
  const reappliedResult = applyOcrCandidatesToLiveUpdateForm(current, review)

  assert.equal(protectedResult.revenue, '500')
  assert.equal(protectedResult.orders, '8')
  assert.equal(protectedResult.peak_viewers, '107')
  assert.equal(reappliedResult.revenue, '21281718')
  assert.equal(reappliedResult.orders, '109')
  assert.equal(reappliedResult.notes, 'keep')
})

test('OCR reset clears derived values but preserves manual fields, notes, and screenshot', () => {
  const metricState = { sales: '21281718', comments: '51', likes: '4' }
  const clearedMetrics = clearOcrDerivedMetricState(
    metricState,
    ['sales', 'comments', 'likes'],
    ['likes'],
  )
  assert.deepEqual(clearedMetrics, { likes: '4' })

  const formState = {
    ...emptyLiveForm(),
    revenue: '21281718',
    orders: '109',
    current_viewers: '7',
    notes: 'keep note',
    screenshot_url: 'blob:keep',
  }
  const clearedForm = clearOcrDerivedLiveUpdateForm(
    formState,
    ['revenue', 'orders', 'current_viewers'],
    ['current_viewers'],
  )
  assert.deepEqual(clearedForm, {
    ...emptyLiveForm(),
    current_viewers: '7',
    notes: 'keep note',
    screenshot_url: 'blob:keep',
  })
})

test('same selected shift does not reinitialize OCR state during rerenders', () => {
  assert.equal(shouldInitializeOcrSelection(null, 'shift-1', true), true)
  assert.equal(shouldInitializeOcrSelection('shift-1', 'shift-1', true), false)
  assert.equal(shouldInitializeOcrSelection('shift-1', 'shift-2', true), true)
  assert.equal(shouldInitializeOcrSelection(null, 'shift-1', false), false)
})

test('production-like and development-like candidate application use identical code paths', () => {
  const review = parseDashboardOcrText('shopee_live', shopeeSample, 'raw_text_exact')
  const first = applyOcrCandidatesToMetricState({}, review)
  const second = applyOcrCandidatesToMetricState({}, review)
  assert.deepEqual(first, expectedShopeeMetrics)
  assert.deepEqual(second, expectedShopeeMetrics)
  assert.deepEqual(liveUpdateFieldsForMetricKeys(ocrCandidateMetricKeys(review)).sort(), [
    'comments',
    'orders',
    'peak_viewers',
    'revenue',
    'total_viewers',
    'total_views',
  ])
})

test('both production form components bind the canonical adapter output to rendered input state', () => {
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

  assert.match(reportSource, /setMetrics\(current => \{\s*const merged = applyOcrCandidatesToMetricState/)
  assert.match(reportSource, /values=\{metrics\}/)
  assert.match(liveSource, /setMetricValues\(current => applyOcrCandidatesToMetricState/)
  assert.match(liveSource, /setFormData\(current => applyOcrCandidatesToLiveUpdateForm/)
  assert.match(liveSource, /value=\{formData\.revenue\}/)
  assert.match(liveSource, /value=\{formData\.orders\}/)
  assert.match(liveSource, /value=\{formData\.peak_viewers\}/)
  assert.match(liveSource, /values=\{metricValues\}/)
  assert.match(boundFieldsSource, /value=\{values\[key\] \?\? ''\}/)
})
