import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { OcrBoundMetricFields } from '../components/features/reports/OcrBoundMetricFields.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import type { OcrReviewData, ReportDashboardPlatform } from '../lib/types/database.types.ts'
import {
  defaultFinalReportMetricFilter,
  finalReportMetricKeysForFilter,
} from '../lib/utils/finalReportMetricFilter.ts'
import { parseAndApplyOcrText } from '../lib/utils/ocrReview.ts'

const emptyReview: OcrReviewData = { status: 'waiting', metrics: {} }

function filteredKeys(
  platform: ReportDashboardPlatform,
  filter: 'all' | 'data',
  values: Record<string, number | null | undefined> = {},
) {
  return finalReportMetricKeysForFilter({
    platform,
    filter,
    values,
    review: emptyReview,
  })
}

function renderedInputCount(
  metricKeys: ReturnType<typeof filteredKeys>['main'],
  platform: ReportDashboardPlatform,
) {
  const html = renderToStaticMarkup(
    <LanguageProvider>
      <OcrBoundMetricFields
        metricKeys={metricKeys}
        values={{}}
        review={emptyReview}
        editable
        canReview={false}
        onChange={() => undefined}
      />
    </LanguageProvider>,
  )

  return {
    html,
    inputCount: (html.match(/<input/g) || []).length,
    platform,
  }
}

test('new Shopee Final Report defaults to all and renders all KPI cards before OCR', () => {
  assert.equal(defaultFinalReportMetricFilter, 'all')
  const keys = filteredKeys('shopee_live', defaultFinalReportMetricFilter)
  assert.equal(keys.main.length, 16)
  assert.equal(keys.supplementary.length, 3)
  assert.equal(renderedInputCount(keys.main, 'shopee_live').inputCount, 16)
  assert.equal(renderedInputCount(keys.supplementary, 'shopee_live').inputCount, 3)
})

test('new TikTok Final Report defaults to all and renders all KPI cards before OCR', () => {
  assert.equal(defaultFinalReportMetricFilter, 'all')
  const keys = filteredKeys('tiktok_shop', defaultFinalReportMetricFilter)
  assert.equal(keys.main.length, 19)
  assert.equal(keys.supplementary.length, 0)
  assert.equal(renderedInputCount(keys.main, 'tiktok_shop').inputCount, 19)
})

test('data filter with an empty report has no matching Shopee or TikTok metrics', () => {
  for (const platform of ['shopee_live', 'tiktok_shop'] as const) {
    const keys = filteredKeys(platform, 'data')
    assert.equal(keys.main.length, 0)
    assert.equal(keys.supplementary.length, 0)
  }

  const source = readFileSync(
    new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url),
    'utf8',
  )
  assert.match(source, /data-testid="ocr-main-metrics-empty"/)
  assert.match(source, /metricFilter === 'data' \? 'noMetricsWithData'/)
})

test('OCR-populated Shopee values remain visible through the data filter', () => {
  const result = parseAndApplyOcrText({
    platform: 'shopee_live',
    rawText: ['Sales: 21.281.718,00', 'Orders: 109', 'PCU: 107'].join('\n'),
    currentMetrics: {},
    overwriteOcrValues: true,
  })
  const keys = finalReportMetricKeysForFilter({
    platform: 'shopee_live',
    filter: 'data',
    values: result.metrics,
    review: result.review,
  })

  assert.equal(result.metrics.sales, 21281718)
  assert.equal(result.metrics.orders, 109)
  assert.equal(result.metrics.pcu, 107)
  assert.ok(keys.main.includes('sales'))
  assert.ok(keys.main.includes('orders'))
  assert.ok(keys.main.includes('pcu'))
})

test('Final Report keeps gallery after KPI sections and notes last', () => {
  const source = readFileSync(
    new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url),
    'utf8',
  )
  const mainMetrics = source.indexOf('data-testid="ocr-main-metrics"')
  const supplementaryMetrics = source.indexOf('data-testid="ocr-supplementary-metrics"')
  const gallery = source.indexOf('<LiveReportImageEditor')
  const notes = source.indexOf('data-testid="final-report-notes-section"')

  assert.ok(mainMetrics >= 0)
  assert.ok(supplementaryMetrics > mainMetrics)
  assert.ok(gallery > supplementaryMetrics)
  assert.ok(notes > gallery)
})
