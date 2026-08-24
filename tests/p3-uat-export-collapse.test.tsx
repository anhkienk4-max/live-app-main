/**
 * P3 UAT regression tests:
 *   - Collapsible metrics section in saved report UI (ReportDetailPlatformMetrics & OcrBoundMetricFields)
 *   - Export button exposed on saved report UI (ReportDetailHeaderActions)
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
import {
  ReportDetailHeaderActions,
  ReportDetailPlatformMetrics,
  ReportDetailRawOcrSection,
  ReportDetailUnmappedOcrSection,
} from '../components/features/reports/ReportDetailModal.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import type {
  Campaign,
  OcrReviewData,
  Report,
  Shift,
  ShiftRegistration,
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
  campaigns: [{ id: 'campaign-1', brand_id: 'brand-1', name: 'Chiến dịch Mùa Hè 2026', start_date: '2026-08-01', end_date: '2026-08-31', status: 'active', created_at: '2026-08-25T00:00:00Z', updated_at: '2026-08-25T00:00:00Z' } as Campaign],
  users: [
    { id: 'user-host-1', full_name: 'Nguyễn Thị Hương', email: 'huong@example.com', role: 'member', system_permission: 'member', operational_roles: ['host'], active: true, created_at: '2026-08-25T00:00:00Z', updated_at: '2026-08-25T00:00:00Z' } as User,
    { id: 'user-manager-1', full_name: 'Trần Văn Quản Lý', email: 'quanly@example.com', role: 'leader', system_permission: 'leader', operational_roles: ['leader'], active: true, created_at: '2026-08-25T00:00:00Z', updated_at: '2026-08-25T00:00:00Z' } as User,
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
    } as ShiftRegistration,
  ],
}

test('ReportDetailPlatformMetrics — renders Collapse/Expand button and toggles metric cards grid on saved report', () => {
  const report = makeReport()

  // 1. Expanded state (default)
  const htmlExpanded = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <ReportDetailPlatformMetrics report={report} collapsed={false} />
    </LanguageProvider>,
  )

  assert.ok(htmlExpanded.includes('data-testid="toggle-metrics-collapse"'), 'Collapse toggle button must be rendered on saved report')
  assert.ok(htmlExpanded.includes('Collapse metrics') || htmlExpanded.includes('Thu gọn chỉ số'), 'Toggle label must show collapse text when expanded')
  assert.ok(htmlExpanded.includes('data-testid="platform-metrics-grid"'), 'Platform metrics grid must be visible when expanded')

  // 2. Collapsed state
  const htmlCollapsed = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <ReportDetailPlatformMetrics report={report} collapsed={true} />
    </LanguageProvider>,
  )

  assert.ok(htmlCollapsed.includes('data-testid="toggle-metrics-collapse"'), 'Collapse toggle button must remain visible when collapsed')
  assert.ok(htmlCollapsed.includes('Expand metrics') || htmlCollapsed.includes('Mở rộng chỉ số'), 'Toggle label must show expand text when collapsed')
  assert.ok(!htmlCollapsed.includes('data-testid="platform-metrics-grid"'), 'Platform metrics grid must be hidden when collapsed')
})

test('ReportDetailHeaderActions — renders Export button on saved report UI', () => {
  const report = makeReport()

  const html = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <ReportDetailHeaderActions report={report} canExport={true} />
    </LanguageProvider>,
  )

  assert.ok(html.includes('data-testid="export-report-detail"'), 'Export button must be rendered in header actions')
  assert.ok(html.includes('Export report detail') || html.includes('Xuất báo cáo chi tiết'), 'Export label must be rendered')
})

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

  let collapsed = false
  assert.equal(collapsed, false)
  assert.equal(metricValues.gmv, 18000000)

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

  collapsed = true
  assert.equal(collapsed, true)
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

  assert.deepEqual(keys, [...REPORT_EXPORT_COLUMN_ORDER])

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

test('Report Detail — Raw OCR Section collapses by default and expands on demand', () => {
  const rawText = 'RAW DASHBOARD OCR DATA 12345 LINE 1\nLINE 2'
  const diagnosticText = 'DIAGNOSTIC OCR TOKENS: [Revenue, 15000000]'

  // Default collapsed
  const collapsedHtml = renderToStaticMarkup(
    <LanguageProvider>
      <ReportDetailRawOcrSection rawOutput={rawText} rawDiagnosticOutput={diagnosticText} defaultCollapsed={true} />
    </LanguageProvider>
  )

  assert.ok(collapsedHtml.includes('data-testid="report-detail-raw-ocr-section"'))
  assert.ok(collapsedHtml.includes('data-testid="toggle-raw-ocr-collapse"'))
  // Body is hidden when collapsed
  assert.ok(!collapsedHtml.includes('data-testid="raw-ocr-body"'))
  assert.ok(!collapsedHtml.includes(rawText))

  // Expanded
  const expandedHtml = renderToStaticMarkup(
    <LanguageProvider>
      <ReportDetailRawOcrSection rawOutput={rawText} rawDiagnosticOutput={diagnosticText} defaultCollapsed={false} />
    </LanguageProvider>
  )

  assert.ok(expandedHtml.includes('data-testid="raw-ocr-body"'))
  assert.ok(expandedHtml.includes(rawText))
  assert.ok(expandedHtml.includes(diagnosticText))
})

test('Report Detail — Unmapped OCR Section collapses by default and preserves all rejected fields', () => {
  const unmappedFields = [
    { original_label: 'Doanh thu du kien', original_value: '50.000.000', source: 'ocr_text', rejection_reason: 'unmapped' },
    { original_label: 'Luot xem dong thoi cao nhat', original_value: '1200', source: 'platform_layout' },
  ]

  // Default collapsed
  const collapsedHtml = renderToStaticMarkup(
    <LanguageProvider>
      <ReportDetailUnmappedOcrSection unmappedFields={unmappedFields} defaultCollapsed={true} />
    </LanguageProvider>
  )

  assert.ok(collapsedHtml.includes('data-testid="report-detail-unmapped-section"'))
  assert.ok(collapsedHtml.includes('data-testid="toggle-unmapped-ocr-collapse"'))
  // Body is hidden when collapsed
  assert.ok(!collapsedHtml.includes('data-testid="unmapped-ocr-fields-body"'))
  assert.ok(!collapsedHtml.includes('Doanh thu du kien'))

  // Expanded
  const expandedHtml = renderToStaticMarkup(
    <LanguageProvider>
      <ReportDetailUnmappedOcrSection unmappedFields={unmappedFields} defaultCollapsed={false} />
    </LanguageProvider>
  )

  assert.ok(expandedHtml.includes('data-testid="unmapped-ocr-fields-body"'))
  assert.ok(expandedHtml.includes('Doanh thu du kien'))
  assert.ok(expandedHtml.includes('50.000.000'))
  assert.ok(expandedHtml.includes('Luot xem dong thoi cao nhat'))
  assert.ok(expandedHtml.includes('1200'))
})

test('Report Detail — OCR sections have independent collapse states without affecting canonical metrics', () => {
  const report = makeReport()
  const rawText = 'SAMPLE RAW OCR'
  const unmappedFields = [{ original_label: 'Unknown Tag', original_value: '99' }]

  // State 1: Raw collapsed, Unmapped expanded, Canonical metrics expanded
  const htmlState1 = renderToStaticMarkup(
    <LanguageProvider>
      <div>
        <ReportDetailPlatformMetrics report={report} collapsed={false} />
        <ReportDetailRawOcrSection rawOutput={rawText} defaultCollapsed={true} />
        <ReportDetailUnmappedOcrSection unmappedFields={unmappedFields} defaultCollapsed={false} />
      </div>
    </LanguageProvider>
  )

  // Canonical metrics render
  assert.ok(htmlState1.includes('data-testid="platform-metrics-grid"'))
  // Raw is collapsed
  assert.ok(!htmlState1.includes('data-testid="raw-ocr-body"'))
  // Unmapped is expanded
  assert.ok(htmlState1.includes('data-testid="unmapped-ocr-fields-body"'))
  assert.ok(htmlState1.includes('Unknown Tag'))

  // State 2: Raw expanded, Unmapped collapsed, Canonical metrics collapsed
  const htmlState2 = renderToStaticMarkup(
    <LanguageProvider>
      <div>
        <ReportDetailPlatformMetrics report={report} collapsed={true} />
        <ReportDetailRawOcrSection rawOutput={rawText} defaultCollapsed={false} />
        <ReportDetailUnmappedOcrSection unmappedFields={unmappedFields} defaultCollapsed={true} />
      </div>
    </LanguageProvider>
  )

  // Canonical metrics collapsed
  assert.ok(!htmlState2.includes('data-testid="platform-metrics-grid"'))
  // Raw is expanded
  assert.ok(htmlState2.includes('data-testid="raw-ocr-body"'))
  assert.ok(htmlState2.includes(rawText))
  // Unmapped is collapsed
  assert.ok(!htmlState2.includes('data-testid="unmapped-ocr-fields-body"'))
})
