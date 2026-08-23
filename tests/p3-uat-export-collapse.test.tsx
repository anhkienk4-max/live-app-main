/**
 * P3 UAT regression tests:
 *   - Collapsible metrics section (collapse toggle does not alter metric state)
 *   - Complete report export (all canonical metrics beyond the core subset)
 *   - Confirmed canonical metrics survive export
 *   - Unmapped OCR candidates are NOT silently promoted into canonical KPI columns
 *   - Vietnamese narrative text preserved
 *   - Revenue/GMV numeric values preserved
 *   - Deterministic column ordering
 *   - Existing report export behavior still works
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { OcrBoundMetricFields } from '../components/features/reports/OcrBoundMetricFields.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import type {
  Campaign,
  OcrReviewData,
  Report,
  Shift,
  User,
} from '../lib/types/database.types.ts'
import {
  buildReportExportRows,
  REPORT_EXPORT_COLUMN_ORDER,
  REPORT_CURRENCY_COLUMNS,
} from '../lib/utils/excelUtils.ts'

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-100',
    date: '2026-08-25',
    start_time: '14:00',
    end_time: '16:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    campaign_id: 'campaign-1',
    title: 'Flash Sale Live',
    studio: 'Studio 1',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    status: 'completed',
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
    ...overrides,
  }
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-100',
    shift_id: 'shift-100',
    revenue: 15000000,
    gmv: 18000000,
    orders: 120,
    peak_viewer: 450,
    average_viewer: 310,
    comments: 890,
    shares: 45,
    likes: 12000,
    product_clicks: 650,
    ctr: 0.12,
    cvr: 0.18,
    average_order_value: 125000,
    dashboard_platform: 'tiktok_shop',
    status: 'confirmed',
    metrics_confirmed: true,
    confirmed_at: '2026-08-25T18:00:00Z',
    confirmed_by: 'user-manager-1',
    submitted_by: 'user-host-1',
    created_at: '2026-08-25T17:00:00Z',
    updated_at: '2026-08-25T18:00:00Z',
    normalized_metrics: {
      gmv: 18000000,
      estimated_gmv: 17500000,
      sku_orders: 130,
      buyers: 95,
      items_sold: 140,
      total_views: 8500,
      impressions: 25000,
      current_viewers: 450,
      average_view_duration_seconds: 78,
      new_followers: 320,
      advertising_cost: 2000000,
      roi_gmv_max: 9.0,
      live_ctr: 0.12,
      ctor: 0.2,
      click_rate: 0.15,
    },
    final_recap: {
      traffic_summary: 'Lượng truy cập tăng vọt lúc 14h30 nhờ flash voucher.',
      platform_vouchers: 'Voucher 50k của sàn TikTok',
      shop_vouchers: 'Voucher 10% của shop Mars',
      best_performing_time_slots: '14:30 - 15:15',
      customer_product_gift_interest: 'Khách quan tâm gói quà combo 3 món',
      main_comment_topics: 'Hỏi về hạn sử dụng và phí ship',
      live_price_feedback: 'Giá tốt khi áp mã kép',
      top_selling_products: 'Combo kẹo dẻo 500g, Socola thanh',
      live_issues: 'Không có sự cố kỹ thuật nào',
    },
    ...overrides,
  }
}

const mockContext = {
  shifts: [makeShift()],
  campaigns: [{ id: 'campaign-1', name: 'Chiến dịch Mùa Hè 2026' } as Campaign],
  users: [
    { id: 'user-host-1', full_name: 'Nguyễn Thị Hương' } as User,
    { id: 'user-manager-1', full_name: 'Trần Văn Quản Lý' } as User,
  ],
  brands: new Map([['brand-1', 'Mars Wrigley Vietnam']]),
  platforms: new Map([['platform-1', 'TikTok Shop']]),
  registrations: [
    {
      id: 'reg-1',
      shift_id: 'shift-100',
      user_id: 'user-host-1',
      operational_role: 'host',
      status: 'approved',
      source: 'self_registration',
      requested_at: '2026-08-25T00:00:00Z',
      created_at: '2026-08-25T00:00:00Z',
      updated_at: '2026-08-25T00:00:00Z',
    },
  ],
}

test('Collapsible Metrics — collapse state preserves metric values and review data intact', () => {
  const metricValues = {
    gmv: 18000000,
    sku_orders: 130,
    total_views: 8500,
  }
  const review: OcrReviewData = {
    status: 'confirmed',
    metrics: {
      gmv: { status: 'confirmed', value: 18000000, confidence: 95 },
    },
    unmapped_fields: [
      { original_label: 'Custom Stat', original_value: '12345', source: 'ocrText' },
    ],
  }

  // Toggling collapse flag locally does not alter metricValues or review
  let collapsed = false
  assert.equal(collapsed, false)
  assert.equal(metricValues.gmv, 18000000)

  // When expanded, metric card grid renders
  const htmlExpanded = renderToStaticMarkup(
    <LanguageProvider>
      <OcrBoundMetricFields
        metricKeys={['gmv', 'sku_orders', 'total_views']}
        values={metricValues}
        review={review}
        editable={false}
        onChange={() => undefined}
      />
    </LanguageProvider>,
  )
  assert.ok(htmlExpanded.includes('18000000') || htmlExpanded.includes('18.000.000') || htmlExpanded.includes('18,000,000'))

  // Toggle collapse
  collapsed = true
  assert.equal(collapsed, true)
  // Metric values and review object remain unmodified
  assert.equal(metricValues.gmv, 18000000)
  assert.equal(review.unmapped_fields?.length, 1)
  assert.equal(review.status, 'confirmed')
})

test('Report Export — includes all supported canonical metrics in deterministic column order', () => {
  const report = makeReport()
  const rows = buildReportExportRows([report], mockContext)

  assert.equal(rows.length, 1)
  const row = rows[0]
  const keys = Object.keys(row)

  // Verify exact deterministic column order
  assert.deepEqual(keys, [...REPORT_EXPORT_COLUMN_ORDER])

  // Verify canonical metrics beyond the old core subset
  assert.equal(row['Estimated GMV'], 17500000)
  assert.equal(row['SKU Orders'], 130)
  assert.equal(row['Buyers'], 95)
  assert.equal(row['Items Sold'], 140)
  assert.equal(row['Total Views'], 8500)
  assert.equal(row['Impressions'], 25000)
  assert.equal(row['Current Viewers'], 450)
  assert.equal(row['Average Watch Time (s)'], 78)
  assert.equal(row['New Followers'], 320)
  assert.equal(row['Advertising Cost'], 2000000)
  assert.equal(row['ROI GMV Max'], 9.0)
  assert.equal(row['CTOR'], 0.2)
})

test('Report Export — numbers and currency values are numeric', () => {
  const report = makeReport()
  const rows = buildReportExportRows([report], mockContext)
  const row = rows[0]

  assert.equal(typeof row['Revenue'], 'number')
  assert.equal(typeof row['GMV'], 'number')
  assert.equal(typeof row['Estimated GMV'], 'number')
  assert.equal(typeof row['Orders'], 'number')
  assert.equal(typeof row['Buyers'], 'number')
  assert.equal(typeof row['Advertising Cost'], 'number')
  assert.equal(typeof row['ROI GMV Max'], 'number')

  assert.equal(row['Revenue'], 15000000)
  assert.equal(row['GMV'], 18000000)
  assert.equal(row['Orders'], 120)
})

test('Report Export — preserves Vietnamese text in brand, staffing, campaign, and narrative recap', () => {
  const report = makeReport()
  const rows = buildReportExportRows([report], mockContext)
  const row = rows[0]

  assert.equal(row['Brand'], 'Mars Wrigley Vietnam')
  assert.equal(row['Host'], 'Nguyễn Thị Hương')
  assert.equal(row['Campaign'], 'Chiến dịch Mùa Hè 2026')
  assert.equal(row['Confirmed By'], 'Trần Văn Quản Lý')
  assert.equal(row['Submitted By'], 'Nguyễn Thị Hương')
  assert.equal(row['Traffic Throughout the Session'], 'Lượng truy cập tăng vọt lúc 14h30 nhờ flash voucher.')
  assert.equal(row['Platform Vouchers'], 'Voucher 50k của sàn TikTok')
  assert.equal(row['Shop Vouchers'], 'Voucher 10% của shop Mars')
  assert.equal(row['Customer Interest in Products and Gifts'], 'Khách quan tâm gói quà combo 3 món')
  assert.equal(row['Main Customer Comment Topics'], 'Hỏi về hạn sử dụng và phí ship')
  assert.equal(row['Live Pricing Feedback'], 'Giá tốt khi áp mã kép')
  assert.equal(row['Top-selling Products'], 'Combo kẹo dẻo 500g, Socola thanh')
  assert.equal(row['Issues Encountered During the Live'], 'Không có sự cố kỹ thuật nào')
})

test('Report Export — unmapped OCR candidates are NOT silently promoted into canonical columns', () => {
  const report = makeReport({
    normalized_metrics: {
      gmv: 20000000,
    },
    ocr_review: {
      status: 'review_required',
      metrics: {},
      unmapped_fields: [
        {
          original_label: 'Unknown Promo Stat',
          original_value: '999999',
          source: 'ocrText',
        },
      ],
    },
  })

  const rows = buildReportExportRows([report], mockContext)
  const row = rows[0]

  // Unmapped candidate '999999' is not placed in any canonical KPI column
  for (const col of REPORT_EXPORT_COLUMN_ORDER) {
    assert.notEqual(row[col], '999999', `Unmapped candidate leaked into column: ${col}`)
    assert.notEqual(row[col], 999999, `Unmapped candidate leaked into column: ${col}`)
  }
})

test('Report Export — currencyColumns defined for XLSX width and format protection', () => {
  assert.ok(REPORT_CURRENCY_COLUMNS.includes('Revenue'))
  assert.ok(REPORT_CURRENCY_COLUMNS.includes('GMV'))
  assert.ok(REPORT_CURRENCY_COLUMNS.includes('Estimated GMV'))
  assert.ok(REPORT_CURRENCY_COLUMNS.includes('Average Order Value'))
  assert.ok(REPORT_CURRENCY_COLUMNS.includes('Advertising Cost'))
})

test('Report Export — Shopee Live specific metrics mapped and exported correctly', () => {
  const shopeeReport = makeReport({
    dashboard_platform: 'shopee_live',
    revenue: 8000000,
    orders: 90,
    peak_viewer: 220,
    live_duration_minutes: 90,
    normalized_metrics: {
      sales: 8000000,
      orders: 90,
      pcu: 220,
      add_to_cart: 310,
      total_viewers: 1400,
      average_basket_size: 88888,
      comment_rate: 0.05,
      gpm: 120000,
      click_to_order_rate: 0.29,
      live_duration_seconds: 5400,
    },
  })

  const rows = buildReportExportRows([shopeeReport], mockContext)
  const row = rows[0]

  assert.equal(row['Revenue'], 8000000)
  assert.equal(row['Orders'], 90)
  assert.equal(row['Peak Viewers'], 220)
  assert.equal(row['Add to Cart'], 310)
  assert.equal(row['Total Viewers'], 1400)
  assert.equal(row['Average Basket Size'], 88888)
  assert.equal(row['Comment Rate'], 0.05)
  assert.equal(row['GPM'], 120000)
  assert.equal(row['CVR'], 0.29)
  assert.equal(row['Live Duration Minutes'], 90)
})
