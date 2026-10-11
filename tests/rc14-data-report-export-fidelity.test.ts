import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'

import type { Report, DashboardUpdate, StoredFileArtifact } from '@/lib/types/database.types'
import { buildReportDetailWorkbookBytes, buildReportExportRows } from '@/lib/utils/excelUtils'

const shopeeReport = {
  id: 'report-shopee',
  shift_id: 'shift-shopee',
  dashboard_platform: 'shopee_live',
  status: 'confirmed',
  metrics_confirmed: true,
  revenue: 13416434,
  gmv: 13416434,
  orders: 67,
  peak_viewer: 9,
  average_viewer: 1164, // Legacy projection from total_viewers
  viewers: 1164,
  product_clicks: 251, // Legacy projection from add_to_cart
  average_order_value: 200245.28, // Legacy projection from average_basket_size
  comments: 4,
  shares: 6,
  normalized_metrics: {
    sales: 13416434,
    orders: 67,
    total_viewers: 1164,
    total_views: 2345,
    pcu: 9,
    add_to_cart: 251,
    average_basket_size: 200245.28,
    click_to_order_rate: 19.1,
    started_at: '2026-09-14T07:00:00+07:00',
  },
  platform_metrics: { sales: 13416434, total_viewers: 1164, add_to_cart: 251, pcu: 9 },
  created_at: '2026-09-14T10:00:00.000Z',
  updated_at: '2026-09-14T10:00:00.000Z',
} as unknown as Report

const context = {
  shifts: [],
  campaigns: [],
  users: [],
  brands: new Map<string, string>(),
  platforms: new Map<string, string>(),
  dashboardUpdates: [{
    id: 'update-1',
    shift_id: 'shift-shopee',
    time: '08:00',
    revenue: 5000000,
    orders: 21,
    peak_viewers: 7,
    current_viewers: 4,
    normalized_metrics: { gpm: 4000000 },
    created_at: '2026-09-14T01:00:00.000Z',
  } as unknown as DashboardUpdate],
  storedFiles: [{
    id: 'source-1',
    report_id: 'report-shopee',
    logical_category: 'data_source',
    provider: 'google_drive',
    external_file_id: 'google-file-1',
    file_name: 'source.csv',
    folder_path: 'Female AI livestream/Shopee Live/THÁNG 09.2026/DATA/SOURCE',
    checksum_sha256: 'abc123',
    created_at: '2026-09-14T01:00:00.000Z',
    deleted_at: null,
  } as unknown as StoredFileArtifact],
}

test('Shopee summary never mislabels legacy projections as distinct KPIs', () => {
  const [row] = buildReportExportRows([shopeeReport], context)
  assert.equal(row['Total Viewers'], 1164)
  assert.equal(row['Peak Viewers'], 9)
  assert.equal(row['Add to Cart'], 251)
  assert.equal(row['Average Basket Size'], 200245.28)
  assert.equal(row['Average Viewers'], '')
  assert.equal(row['Product Clicks'], '')
  assert.equal(row['Average Order Value'], '')
})

test('DATA/REPORT workbook exports 4 sheets, all captured metrics, timeline and evidence', () => {
  const bytes = buildReportDetailWorkbookBytes(shopeeReport, context)
  const workbook = XLSX.read(bytes, { type: 'array' })
  assert.deepEqual(workbook.SheetNames, [
    '01_SUMMARY',
    '02_ALL_METRICS',
    '03_LIVE_TIMELINE',
    '04_EVIDENCE',
  ])

  const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['01_SUMMARY'])[0]
  assert.equal(summary['Total Viewers'], 1164)
  assert.equal(summary['Average Viewers'] ?? '', '')
  assert.equal(summary['Product Clicks'] ?? '', '')

  const metrics = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['02_ALL_METRICS'])
  assert.ok(metrics.some(row => row.Source === 'normalized_metrics' && row['Metric Key'] === 'started_at'))
  assert.ok(metrics.some(row => row.Source === 'normalized_metrics' && row['Metric Key'] === 'add_to_cart' && row.Value === 251))
  assert.ok(metrics.some(row => row.Source === 'report_fields' && row['Metric Key'] === 'average_viewer'
    && String(row['Semantic Note']).includes('NOT') === false
    && String(row['Semantic Note']).includes('not average')))

  const timeline = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['03_LIVE_TIMELINE'])
  assert.ok(timeline.some(row => row['Snapshot ID'] === 'update-1' && row['Metric Key'] === 'orders' && row.Value === 21))
  assert.ok(timeline.some(row => row['Snapshot ID'] === 'update-1' && row['Metric Key'] === 'gpm' && row.Value === 4000000))

  const evidence = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['04_EVIDENCE'])
  assert.ok(evidence.some(row => row.Type === 'stored_file'
    && row.Field === 'external_file_id' && row.Value === 'google-file-1'))
})

test('TikTok export preserves product clicks while avoiding current-viewers-to-average projection', () => {
  const tiktok = {
    ...shopeeReport,
    id: 'report-tiktok',
    dashboard_platform: 'tiktok_shop',
    average_viewer: 40,
    product_clicks: 320,
    average_order_value: 100000,
    platform_metrics: { product_clicks: 320, current_viewers: 40, average_order_value: 100000 },
    normalized_metrics: { product_clicks: 320, current_viewers: 40, average_order_value: 100000 },
  } as Report
  const [row] = buildReportExportRows([tiktok], context)
  assert.equal(row['Average Viewers'], '')
  assert.equal(row['Product Clicks'], 320)
  assert.equal(row['Average Order Value'], 100000)
})
