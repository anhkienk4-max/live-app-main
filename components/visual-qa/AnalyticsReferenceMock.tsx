'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  Wallet,
  ShoppingBag,
  Eye,
  Clock3,
  Filter,
  Download,
  Search,
  ChevronDown,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleAlert,
  X,
  MoreHorizontal,
  Layers,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  Users,
  Radio,
  Tv,
  Sparkles,
  Share2,
  MessageSquare,
  ThumbsUp,
  MousePointerClick,
  AlertTriangle,
  Info,
  Lock,
  PieChart,
  Building2,
  Activity,
  ChevronRight,
  ArrowRight
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type QaStateId =
  | '01-main'
  | '02-filters'
  | '03-dictionary'
  | '04-confirmed-basis'
  | '05-brand-breakdown'
  | '06-platform-breakdown'
  | '07-comparison'
  | '08-report-drilldown'
  | '09-partial'
  | '10-missing'
  | '11-no-eligible-reports'
  | '12-export'
  | '13-dense'
  | '14-unbacked'

export interface MetricDefinition {
  coverageId: string
  canonicalName: string
  displayName: string
  unit: string
  source: string
  formula: string
  aggregation: 'SUM' | 'AVG' | 'MAX' | 'RATIO' | 'COUNT'
  nullability: 'NON_NULL' | 'NULLABLE'
  timeBasis: string
  eligibleReportState: string
  dimensions: string[]
  supportedFilters: string[]
  notes: string
}

export interface ConfirmedReport {
  id: string
  shiftDate: string
  brand: string
  platform: 'TikTok Shop' | 'Shopee Live' | 'Lazada' | 'Facebook Live'
  sessionTitle: string
  timeSlot: string
  host: string
  revenue: number
  orders: number
  gmv: number
  peakViewer: number | null
  avgViewer: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  viewers: number | null
  productClicks: number | null
  ctr: number | null
  cvr: number | null
  aov: number
  durationMinutes: number
  ocrStatus: 'VERIFIED' | 'REVIEWED'
  status: 'confirmed'
  metricsConfirmed: boolean
}

export interface ExcludedReport {
  id: string
  shiftDate: string
  brand: string
  platform: string
  host: string
  status: 'draft' | 'in_review' | 'reopened' | 'archived'
  reasonExcluded: string
  tentativeRevenue: number
}

// 14 Canonical Metrics from MASTER_INFORMATION_COVERAGE.md + reportCount
export const METRIC_DICTIONARY: MetricDefinition[] = [
  {
    coverageId: 'METRIC-001',
    canonicalName: 'revenue',
    displayName: 'Doanh thu báo cáo',
    unit: '₫ (VND)',
    source: 'Confirmed Report (OCR / Xác nhận)',
    formula: 'SUM(report.revenue)',
    aggregation: 'SUM',
    nullability: 'NON_NULL',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date', 'host'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng doanh thu thực tế được đối soát từ báo cáo kết thúc ca đã duyệt.'
  },
  {
    coverageId: 'METRIC-002',
    canonicalName: 'orders',
    displayName: 'Số đơn hàng',
    unit: 'Đơn',
    source: 'Confirmed Report (OCR / Xác nhận)',
    formula: 'SUM(report.orders)',
    aggregation: 'SUM',
    nullability: 'NON_NULL',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date', 'host'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng số lượng đơn hàng phát sinh trong phiên live.'
  },
  {
    coverageId: 'METRIC-003',
    canonicalName: 'peak_viewer',
    displayName: 'Viewers đỉnh (PCU)',
    unit: 'Người xem',
    source: 'Confirmed Report (OCR / Analytics sàn)',
    formula: 'MAX(report.peak_viewer)',
    aggregation: 'MAX',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Số người xem đồng thời cao nhất (Peak Concurrent Users) ghi nhận trong kỳ.'
  },
  {
    coverageId: 'METRIC-004',
    canonicalName: 'average_viewer',
    displayName: 'Viewers trung bình (ACU)',
    unit: 'Người xem',
    source: 'Confirmed Report (OCR / Analytics sàn)',
    formula: 'AVG(report.average_viewer WHERE NOT NULL)',
    aggregation: 'AVG',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Số người xem trung bình mỗi ca. Không tính các ca thiếu dữ liệu vào mẫu chia.'
  },
  {
    coverageId: 'METRIC-005',
    canonicalName: 'likes',
    displayName: 'Lượt thích',
    unit: 'Lượt',
    source: 'Confirmed Report (OCR / Tương tác)',
    formula: 'SUM(report.likes WHERE NOT NULL)',
    aggregation: 'SUM',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng lượt thích phiên live từ sàn hỗ trợ tương tác.'
  },
  {
    coverageId: 'METRIC-006',
    canonicalName: 'comments',
    displayName: 'Bình luận',
    unit: 'Lượt',
    source: 'Confirmed Report (OCR / Tương tác)',
    formula: 'SUM(report.comments WHERE NOT NULL)',
    aggregation: 'SUM',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng lượt bình luận tương tác trong phiên.'
  },
  {
    coverageId: 'METRIC-007',
    canonicalName: 'shares',
    displayName: 'Chia sẻ',
    unit: 'Lượt',
    source: 'Confirmed Report (OCR / Tương tác)',
    formula: 'SUM(report.shares WHERE NOT NULL)',
    aggregation: 'SUM',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng lượt chia sẻ phiên live.'
  },
  {
    coverageId: 'METRIC-008',
    canonicalName: 'gmv',
    displayName: 'Tổng giá trị hàng hóa (GMV)',
    unit: '₫ (VND)',
    source: 'Confirmed Report (OCR / Sàn TMĐT)',
    formula: 'SUM(report.gmv)',
    aggregation: 'SUM',
    nullability: 'NON_NULL',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng giá trị đơn hàng gộp trước khi trừ voucher/hủy đơn.'
  },
  {
    coverageId: 'METRIC-009',
    canonicalName: 'viewers',
    displayName: 'Tổng người xem (Engaged Viewers)',
    unit: 'Người xem',
    source: 'Confirmed Report (OCR / Analytics sàn)',
    formula: 'SUM(report.viewers WHERE NOT NULL)',
    aggregation: 'SUM',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng lượt người xem tích lũy trong toàn bộ thời gian phát.'
  },
  {
    coverageId: 'METRIC-010',
    canonicalName: 'product_clicks',
    displayName: 'Lượt click sản phẩm',
    unit: 'Lượt',
    source: 'Confirmed Report (OCR / Giỏ hàng)',
    formula: 'SUM(report.product_clicks WHERE NOT NULL)',
    aggregation: 'SUM',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng số lần người xem bấm vào ghim giỏ hàng sản phẩm.'
  },
  {
    coverageId: 'METRIC-011',
    canonicalName: 'ctr',
    displayName: 'Tỷ lệ click sản phẩm (CTR)',
    unit: '%',
    source: 'Confirmed Report (Tỷ lệ tính toán)',
    formula: 'AVG(report.ctr WHERE NOT NULL)',
    aggregation: 'AVG',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tỷ lệ click giỏ hàng. Chỉ tính trung bình trên các ca có dữ liệu hợp lệ.'
  },
  {
    coverageId: 'METRIC-012',
    canonicalName: 'cvr',
    displayName: 'Tỷ lệ chuyển đổi đơn hàng (CVR)',
    unit: '%',
    source: 'Confirmed Report (Tỷ lệ tính toán)',
    formula: 'AVG(report.cvr WHERE NOT NULL)',
    aggregation: 'AVG',
    nullability: 'NULLABLE',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tỷ lệ người bấm sản phẩm ra quyết định chốt đơn.'
  },
  {
    coverageId: 'METRIC-013',
    canonicalName: 'average_order_value',
    displayName: 'Giá trị trung bình đơn (AOV)',
    unit: '₫/đơn',
    source: 'Confirmed Report (Tỷ lệ tính toán)',
    formula: 'SUM(revenue) / SUM(orders)',
    aggregation: 'RATIO',
    nullability: 'NON_NULL',
    timeBasis: 'Shift Date (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Giá trị trung bình mỗi đơn hàng. Tính theo tổng doanh thu chia tổng đơn.'
  },
  {
    coverageId: 'METRIC-014',
    canonicalName: 'live_duration_minutes',
    displayName: 'Tổng thời lượng phát live',
    unit: 'Giờ / Phút',
    source: 'System / Shift Timing (Báo cáo ca)',
    formula: 'SUM(report.duration_minutes)',
    aggregation: 'SUM',
    nullability: 'NON_NULL',
    timeBasis: 'Shift Duration (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date', 'host'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Tổng số giờ live thực tế được xác nhận kết ca.'
  },
  {
    coverageId: 'METRIC-COUNT',
    canonicalName: 'report_count',
    displayName: 'Số ca báo cáo đã xác nhận',
    unit: 'Ca',
    source: 'Report Repository Metadata',
    formula: 'COUNT(reports WHERE status == confirmed)',
    aggregation: 'COUNT',
    nullability: 'NON_NULL',
    timeBasis: 'Period Range (Asia/Ho_Chi_Minh)',
    eligibleReportState: 'status == confirmed AND metrics_confirmed == true',
    dimensions: ['brand', 'platform', 'date'],
    supportedFilters: ['dateRange', 'brand', 'platform'],
    notes: 'Cơ sở dữ liệu: Chỉ các ca đã được quản lý phê duyệt và OCR xác thực.'
  }
]

export const EXCLUDED_REPORTS: ExcludedReport[] = [
  {
    id: 'REP-2026-1004-EX01',
    shiftDate: '04/10/2026',
    brand: 'Anker',
    platform: 'TikTok Shop',
    host: 'Lan Anh',
    status: 'in_review',
    reasonExcluded: 'Báo cáo đang chờ Leader đối soát hóa đơn OCR',
    tentativeRevenue: 14200000
  },
  {
    id: 'REP-2026-1004-EX02',
    shiftDate: '04/10/2026',
    brand: 'Baseus',
    platform: 'Shopee Live',
    host: 'Minh Tuấn',
    status: 'in_review',
    reasonExcluded: 'Ảnh chụp OCR góc khuất chỉ số, KTV đang bổ sung ảnh phụ',
    tentativeRevenue: 9800000
  },
  {
    id: 'REP-2026-1003-EX03',
    shiftDate: '03/10/2026',
    brand: 'Ecovacs',
    platform: 'Lazada',
    host: 'Hoàng Yến',
    status: 'draft',
    reasonExcluded: 'Bản nháp KTV chưa hoàn thành nhập liệu kết ca',
    tentativeRevenue: 28500000
  },
  {
    id: 'REP-2026-1002-EX04',
    shiftDate: '02/10/2026',
    brand: 'UGREEN',
    platform: 'TikTok Shop',
    host: 'Thu Trang',
    status: 'reopened',
    reasonExcluded: 'Quản lý mở lại để đính chính mã đơn hoàn/hủy',
    tentativeRevenue: 11400000
  }
]

// 28 Authoritative Confirmed Reports (7 days: 28/09 to 04/10/2026)
// Total Revenue: 876.400.000 ₫ | Total Orders: 1.834 đơn | GMV: 935.000.000 ₫ | AOV: 477.863 ₫
export const CONFIRMED_REPORTS_DATA: ConfirmedReport[] = [
  {
    id: 'REP-2026-1004-001',
    shiftDate: '04/10/2026',
    brand: 'Anker',
    platform: 'TikTok Shop',
    sessionTitle: 'Anker Siêu Sale Phụ Kiện Sạc Nhanh',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 38500000,
    orders: 114,
    gmv: 41200000,
    peakViewer: 3250,
    avgViewer: 1420,
    likes: 8400,
    comments: 1250,
    shares: 310,
    viewers: 16800,
    productClicks: 3950,
    ctr: 23.5,
    cvr: 2.89,
    aov: 337719,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1004-002',
    shiftDate: '04/10/2026',
    brand: 'Baseus',
    platform: 'Shopee Live',
    sessionTitle: 'Baseus Cáp Sạc & Hub Đa Năng Độc Quyền',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 26800000,
    orders: 86,
    gmv: 28900000,
    peakViewer: 2180,
    avgViewer: 960,
    likes: 5600,
    comments: 890,
    shares: 180,
    viewers: 11400,
    productClicks: 2680,
    ctr: 23.5,
    cvr: 3.21,
    aov: 311628,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1004-003',
    shiftDate: '04/10/2026',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    sessionTitle: 'Ecovacs Robot Hút Bụi Deebot N30 Pro',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 64200000,
    orders: 48,
    gmv: 68500000,
    peakViewer: 4850,
    avgViewer: 2150,
    likes: 12800,
    comments: 2420,
    shares: 540,
    viewers: 28400,
    productClicks: 6200,
    ctr: 21.8,
    cvr: 0.77,
    aov: 1337500,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1004-004',
    shiftDate: '04/10/2026',
    brand: 'UGREEN',
    platform: 'Lazada',
    sessionTitle: 'UGREEN Tai Nghe & Dock Cắm Gaming',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 19400000,
    orders: 62,
    gmv: 20800000,
    peakViewer: 1420,
    avgViewer: 640,
    likes: 3400,
    comments: 510,
    shares: 120,
    viewers: 7200,
    productClicks: 1650,
    ctr: 22.9,
    cvr: 3.76,
    aov: 312903,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1003-005',
    shiftDate: '03/10/2026',
    brand: 'Anker',
    platform: 'Shopee Live',
    sessionTitle: 'Anker Mega Live Flash Sale Cuối Tuần',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 32400000,
    orders: 98,
    gmv: 34500000,
    peakViewer: 2890,
    avgViewer: 1280,
    likes: 7200,
    comments: 1140,
    shares: 260,
    viewers: 14500,
    productClicks: 3420,
    ctr: 23.6,
    cvr: 2.87,
    aov: 330612,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1003-006',
    shiftDate: '03/10/2026',
    brand: 'Baseus',
    platform: 'TikTok Shop',
    sessionTitle: 'Baseus Trợ Giá Sinh Viên Củ Sạc GaN',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 21500000,
    orders: 74,
    gmv: 23100000,
    peakViewer: 1950,
    avgViewer: 890,
    likes: 4800,
    comments: 760,
    shares: 150,
    viewers: 9800,
    productClicks: 2250,
    ctr: 23.0,
    cvr: 3.29,
    aov: 290541,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1003-007',
    shiftDate: '03/10/2026',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    sessionTitle: 'Ecovacs Trải Nghiệm Lau Nhà Tự Động X2 OMNI',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 58900000,
    orders: 41,
    gmv: 62400000,
    peakViewer: 4120,
    avgViewer: 1980,
    likes: 11200,
    comments: 2150,
    shares: 480,
    viewers: 25600,
    productClicks: 5600,
    ctr: 21.9,
    cvr: 0.73,
    aov: 1436585,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1003-008',
    shiftDate: '03/10/2026',
    brand: 'UGREEN',
    platform: 'Shopee Live',
    sessionTitle: 'UGREEN Phụ Kiện Macbook & Cáp HDMI 8K',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 17800000,
    orders: 54,
    gmv: 19200000,
    peakViewer: 1310,
    avgViewer: 580,
    likes: 2900,
    comments: 420,
    shares: 95,
    viewers: 6400,
    productClicks: 1480,
    ctr: 23.1,
    cvr: 3.65,
    aov: 329630,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1002-009',
    shiftDate: '02/10/2026',
    brand: 'Anker',
    platform: 'TikTok Shop',
    sessionTitle: 'Anker Loa Bluetooth Soundcore & Tai Nghe',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 29600000,
    orders: 88,
    gmv: 31400000,
    peakViewer: 2640,
    avgViewer: 1190,
    likes: 6800,
    comments: 980,
    shares: 240,
    viewers: 13200,
    productClicks: 3100,
    ctr: 23.5,
    cvr: 2.84,
    aov: 336364,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1002-010',
    shiftDate: '02/10/2026',
    brand: 'Baseus',
    platform: 'Shopee Live',
    sessionTitle: 'Baseus Pin Dự Phòng Blade Siêu Mỏng',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 24100000,
    orders: 79,
    gmv: 25800000,
    peakViewer: 2040,
    avgViewer: 910,
    likes: 5100,
    comments: 820,
    shares: 160,
    viewers: 10500,
    productClicks: 2450,
    ctr: 23.3,
    cvr: 3.22,
    aov: 305063,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1002-011',
    shiftDate: '02/10/2026',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    sessionTitle: 'Ecovacs Siêu Đại Tiệc Đồ Gia Dụng Thông Minh',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 52400000,
    orders: 39,
    gmv: 55600000,
    peakViewer: 3850,
    avgViewer: 1820,
    likes: 9800,
    comments: 1890,
    shares: 420,
    viewers: 22800,
    productClicks: 4950,
    ctr: 21.7,
    cvr: 0.79,
    aov: 1343590,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1002-012',
    shiftDate: '02/10/2026',
    brand: 'UGREEN',
    platform: 'TikTok Shop',
    sessionTitle: 'UGREEN Bộ Chuyển Đổi Type-C 9 Trong 1',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 16500000,
    orders: 49,
    gmv: 17600000,
    peakViewer: 1250,
    avgViewer: 540,
    likes: 2700,
    comments: 380,
    shares: 80,
    viewers: 5900,
    productClicks: 1350,
    ctr: 22.9,
    cvr: 3.63,
    aov: 336735,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1001-013',
    shiftDate: '01/10/2026',
    brand: 'Anker',
    platform: 'Shopee Live',
    sessionTitle: 'Anker Khai Xuân Đầu Tháng 10 Sale Lớn',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 35100000,
    orders: 106,
    gmv: 37200000,
    peakViewer: 3050,
    avgViewer: 1350,
    likes: 7900,
    comments: 1180,
    shares: 280,
    viewers: 15400,
    productClicks: 3650,
    ctr: 23.7,
    cvr: 2.90,
    aov: 331132,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1001-014',
    shiftDate: '01/10/2026',
    brand: 'Baseus',
    platform: 'TikTok Shop',
    sessionTitle: 'Baseus Đầu Tháng Sắm Phụ Kiện Ô Tô',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 22900000,
    orders: 76,
    gmv: 24500000,
    peakViewer: 2110,
    avgViewer: 940,
    likes: 5300,
    comments: 840,
    shares: 170,
    viewers: 10200,
    productClicks: 2380,
    ctr: 23.3,
    cvr: 3.19,
    aov: 301316,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1001-015',
    shiftDate: '01/10/2026',
    brand: 'Ecovacs',
    platform: 'Shopee Live',
    sessionTitle: 'Ecovacs Khai Tiệc Đầu Tháng Giảm 2 Triệu',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 49800000,
    orders: 36,
    gmv: 53100000,
    peakViewer: 3620,
    avgViewer: 1690,
    likes: 9100,
    comments: 1740,
    shares: 390,
    viewers: 21200,
    productClicks: 4600,
    ctr: 21.7,
    cvr: 0.78,
    aov: 1383333,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-1001-016',
    shiftDate: '01/10/2026',
    brand: 'UGREEN',
    platform: 'Facebook Live',
    sessionTitle: 'UGREEN Livestream Giới Thiệu Cáp Mới',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 14200000,
    orders: 43,
    gmv: 15300000,
    peakViewer: 980,
    avgViewer: 420,
    likes: 1800,
    comments: 290,
    shares: 60,
    viewers: 4800,
    productClicks: 1050,
    ctr: 21.9,
    cvr: 4.10,
    aov: 330233,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0930-017',
    shiftDate: '30/09/2026',
    brand: 'Anker',
    platform: 'TikTok Shop',
    sessionTitle: 'Anker Chốt Tháng 9 Deal Sốc Pin 10000mAh',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 31200000,
    orders: 94,
    gmv: 33100000,
    peakViewer: 2780,
    avgViewer: 1220,
    likes: 7100,
    comments: 1090,
    shares: 250,
    viewers: 13900,
    productClicks: 3250,
    ctr: 23.4,
    cvr: 2.89,
    aov: 331915,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0930-018',
    shiftDate: '30/09/2026',
    brand: 'Baseus',
    platform: 'Shopee Live',
    sessionTitle: 'Baseus Xả Kho Phụ Kiện Điện Thoại',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 20400000,
    orders: 68,
    gmv: 21800000,
    peakViewer: 1870,
    avgViewer: 850,
    likes: 4600,
    comments: 720,
    shares: 140,
    viewers: 9200,
    productClicks: 2100,
    ctr: 22.8,
    cvr: 3.24,
    aov: 300000,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0930-019',
    shiftDate: '30/09/2026',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    sessionTitle: 'Ecovacs Đêm Hội Robot T5 Max Giảm Giá',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 47200000,
    orders: 35,
    gmv: 50400000,
    peakViewer: 3450,
    avgViewer: 1610,
    likes: 8700,
    comments: 1620,
    shares: 370,
    viewers: 20100,
    productClicks: 4400,
    ctr: 21.9,
    cvr: 0.80,
    aov: 1348571,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0930-020',
    shiftDate: '30/09/2026',
    brand: 'UGREEN',
    platform: 'Lazada',
    sessionTitle: 'UGREEN Cáp Mạng & Thiết Bị Chuyển Đổi',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 15300000,
    orders: 47,
    gmv: 16400000,
    peakViewer: 1180,
    avgViewer: 510,
    likes: 2400,
    comments: 340,
    shares: 75,
    viewers: 5400,
    productClicks: 1220,
    ctr: 22.6,
    cvr: 3.85,
    aov: 325532,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0929-021',
    shiftDate: '29/09/2026',
    brand: 'Anker',
    platform: 'Shopee Live',
    sessionTitle: 'Anker Thứ Hai Năng Lượng Đón Tuần Mới',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 28400000,
    orders: 85,
    gmv: 30200000,
    peakViewer: 2510,
    avgViewer: 1140,
    likes: 6500,
    comments: 930,
    shares: 220,
    viewers: 12800,
    productClicks: 3000,
    ctr: 23.4,
    cvr: 2.83,
    aov: 334118,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0929-022',
    shiftDate: '29/09/2026',
    brand: 'Baseus',
    platform: 'TikTok Shop',
    sessionTitle: 'Baseus Khởi Động Tuần Mới Phụ Kiện Deal 1K',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 19800000,
    orders: 66,
    gmv: 21100000,
    peakViewer: 1810,
    avgViewer: 820,
    likes: 4400,
    comments: 690,
    shares: 130,
    viewers: 8900,
    productClicks: 2050,
    ctr: 23.0,
    cvr: 3.22,
    aov: 300000,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0929-023',
    shiftDate: '29/09/2026',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    sessionTitle: 'Ecovacs Giải Pháp Hút Bụi Căn Hộ Nhỏ',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 45600000,
    orders: 34,
    gmv: 48900000,
    peakViewer: 3320,
    avgViewer: 1550,
    likes: 8300,
    comments: 1540,
    shares: 350,
    viewers: 19400,
    productClicks: 4250,
    ctr: 21.9,
    cvr: 0.80,
    aov: 1341176,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0929-024',
    shiftDate: '29/09/2026',
    brand: 'UGREEN',
    platform: 'Shopee Live',
    sessionTitle: 'UGREEN Phụ Kiện Công Nghệ Văn Phòng',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 14900000,
    orders: 45,
    gmv: 16000000,
    peakViewer: 1140,
    avgViewer: 490,
    likes: 2300,
    comments: 320,
    shares: 70,
    viewers: 5200,
    productClicks: 1180,
    ctr: 22.7,
    cvr: 3.81,
    aov: 331111,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0928-025',
    shiftDate: '28/09/2026',
    brand: 'Anker',
    platform: 'TikTok Shop',
    sessionTitle: 'Anker Chủ Nhật Thảnh Thơi Săn Củ Sạc 65W',
    timeSlot: '09:00 - 13:00',
    host: 'Lan Anh',
    revenue: 33800000,
    orders: 101,
    gmv: 35900000,
    peakViewer: 2980,
    avgViewer: 1310,
    likes: 7600,
    comments: 1120,
    shares: 270,
    viewers: 14900,
    productClicks: 3500,
    ctr: 23.5,
    cvr: 2.89,
    aov: 334653,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0928-026',
    shiftDate: '28/09/2026',
    brand: 'Baseus',
    platform: 'Shopee Live',
    sessionTitle: 'Baseus Cuối Tuần Ưu Đãi Tai Nghe Bowie M2',
    timeSlot: '14:00 - 18:00',
    host: 'Minh Tuấn',
    revenue: 23500000,
    orders: 77,
    gmv: 25100000,
    peakViewer: 2080,
    avgViewer: 930,
    likes: 5200,
    comments: 810,
    shares: 165,
    viewers: 10400,
    productClicks: 2420,
    ctr: 23.3,
    cvr: 3.18,
    aov: 305195,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0928-027',
    shiftDate: '28/09/2026',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    sessionTitle: 'Ecovacs Chủ Nhật Thảnh Thơi Không Lo Dọn Nhà',
    timeSlot: '19:00 - 23:00',
    host: 'Hoàng Yến',
    revenue: 56100000,
    orders: 40,
    gmv: 59800000,
    peakViewer: 4050,
    avgViewer: 1910,
    likes: 10600,
    comments: 2040,
    shares: 460,
    viewers: 24800,
    productClicks: 5400,
    ctr: 21.8,
    cvr: 0.74,
    aov: 1402500,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  },
  {
    id: 'REP-2026-0928-028',
    shiftDate: '28/09/2026',
    brand: 'UGREEN',
    platform: 'Lazada',
    sessionTitle: 'UGREEN Siêu Cuối Tuần Chuột Không Dây & Cáp',
    timeSlot: '19:30 - 23:30',
    host: 'Thu Trang',
    revenue: 16100000,
    orders: 49,
    gmv: 17200000,
    peakViewer: 1220,
    avgViewer: 530,
    likes: 2600,
    comments: 360,
    shares: 80,
    viewers: 5700,
    productClicks: 1300,
    ctr: 22.8,
    cvr: 3.77,
    aov: 328571,
    durationMinutes: 240,
    ocrStatus: 'VERIFIED',
    status: 'confirmed',
    metricsConfirmed: true
  }
]

// Brand Summary (Mathematically verified against 28 reports; Sum = 876.400.000 ₫, 1.834 orders)
export const BRAND_PERFORMANCE = [
  {
    brand: 'Ecovacs',
    revenue: 374200000,
    orders: 273,
    gmv: 398700000,
    avgAov: 1370696,
    pcu: 4850,
    cvr: 0.77,
    reportCount: 7,
    share: 42.7,
    color: '#8B5CF6'
  },
  {
    brand: 'Anker',
    revenue: 229000000,
    orders: 686,
    gmv: 243500000,
    avgAov: 333819,
    pcu: 3250,
    cvr: 2.87,
    reportCount: 7,
    share: 26.1,
    color: '#3B82F6'
  },
  {
    brand: 'Baseus',
    revenue: 159000000,
    orders: 526,
    gmv: 170300000,
    avgAov: 302281,
    pcu: 2180,
    cvr: 3.22,
    reportCount: 7,
    share: 18.1,
    color: '#10B981'
  },
  {
    brand: 'UGREEN',
    revenue: 114200000,
    orders: 349,
    gmv: 122500000,
    avgAov: 327221,
    pcu: 1420,
    cvr: 3.80,
    reportCount: 7,
    share: 13.0,
    color: '#F59E0B'
  }
]

// Platform Share (Mathematically verified against 28 reports; Sum = 876.400.000 ₫, 1.834 orders, Shares = 100.0%)
export const PLATFORM_SHARE = [
  {
    platform: 'TikTok Shop',
    revenue: 538200000,
    orders: 899,
    share: 61.4,
    pcu: 4850,
    cvr: 2.10,
    reportCount: 14,
    color: '#000000'
  },
  {
    platform: 'Shopee Live',
    revenue: 273200000,
    orders: 734,
    share: 31.2,
    pcu: 3620,
    cvr: 2.97,
    reportCount: 10,
    color: '#EE4D2D'
  },
  {
    platform: 'Lazada',
    revenue: 50800000,
    orders: 158,
    share: 5.8,
    pcu: 1420,
    cvr: 3.79,
    reportCount: 3,
    color: '#0F146D'
  },
  {
    platform: 'Facebook Live',
    revenue: 14200000,
    orders: 43,
    share: 1.6,
    pcu: 980,
    cvr: 4.10,
    reportCount: 1,
    color: '#1877F2'
  }
]

// Staff Workload & Host Performance (Sum = 876.400.000 ₫, 112 hours)
export const HOST_PERFORMANCE = [
  {
    name: 'Hoàng Yến',
    role: 'Host Chuyên Ecovacs',
    confirmedReports: 7,
    hours: 28,
    revenue: 374200000,
    revPerHour: 13364286,
    avgPcu: 3894
  },
  {
    name: 'Lan Anh',
    role: 'Host Chính (Tech/Phụ kiện)',
    confirmedReports: 7,
    hours: 28,
    revenue: 229000000,
    revPerHour: 8178571,
    avgPcu: 2871
  },
  {
    name: 'Minh Tuấn',
    role: 'Host Phụ Kiện Baseus',
    confirmedReports: 7,
    hours: 28,
    revenue: 159000000,
    revPerHour: 5678571,
    avgPcu: 2006
  },
  {
    name: 'Thu Trang',
    role: 'Host UGREEN / Tech',
    confirmedReports: 7,
    hours: 28,
    revenue: 114200000,
    revPerHour: 4078571,
    avgPcu: 1214
  }
]

// Trend Data (7 Days Revenue & Orders; Sum = 876.400.000 ₫, 1.834 orders)
export const TREND_DATA = [
  { date: '28/09', label: 'CN (28/09)', revenue: 129500000, orders: 267, pcu: 4050 },
  { date: '29/09', label: 'T2 (29/09)', revenue: 108700000, orders: 230, pcu: 3320 },
  { date: '30/09', label: 'T3 (30/09)', revenue: 114100000, orders: 244, pcu: 3450 },
  { date: '01/10', label: 'T4 (01/10)', revenue: 122000000, orders: 261, pcu: 3620 },
  { date: '02/10', label: 'T5 (02/10)', revenue: 122600000, orders: 255, pcu: 3850 },
  { date: '03/10', label: 'T6 (03/10)', revenue: 130600000, orders: 267, pcu: 4120 },
  { date: '04/10', label: 'T7 (04/10)', revenue: 148900000, orders: 310, pcu: 4850 }
]

// Previous Period Aggregate (For 07-comparison: Previous 7 days)
export const PREV_PERIOD_TOTALS = {
  revenue: 767425569,
  orders: 1690,
  gmv: 812000000,
  aov: 454242,
  pcu: 4200,
  acu: 1120,
  cvr: 2.15,
  ctr: 21.4,
  viewers: 320000,
  productClicks: 71000,
  likes: 152000,
  comments: 25000,
  shares: 5600,
  durationHours: 112,
  confirmedReports: 28
}

// Helpers
export function formatVnd(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
}

export function formatNum(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('vi-VN').format(val)
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return `${val.toFixed(2)}%`
}

// OLD Formula: delta = previous === 0 ? '—' : ((totals - previous) / previous * 100).toFixed(1) + '%'
export function calculateDelta(current: number | null, previous: number | null): { text: string; positive: boolean } {
  if (current === null || previous === null || previous === 0) {
    return { text: '—', positive: true }
  }
  const diffPct = ((current - previous) / previous) * 100
  const isPos = diffPct >= 0
  return {
    text: `${isPos ? '+' : ''}${diffPct.toFixed(1)}%`,
    positive: isPos
  }
}

export function AnalyticsReferenceMock() {
  const [qaState, setQaState] = useState<QaStateId>('01-main')
  const [filterPeriod, setFilterPeriod] = useState<string>('7d')
  const [filterBrand, setFilterBrand] = useState<string>('all')
  const [filterPlatform, setFilterPlatform] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [denseMode, setDenseMode] = useState<boolean>(false)
  const [selectedDrilldown, setSelectedDrilldown] = useState<ConfirmedReport | null>(null)

  // Modals
  const [isDictionaryOpen, setIsDictionaryOpen] = useState<boolean>(false)
  const [isBasisOpen, setIsBasisOpen] = useState<boolean>(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false)
  const [isBrandModalOpen, setIsBrandModalOpen] = useState<boolean>(false)
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState<boolean>(false)
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false)
  const [isUnbackedModalOpen, setIsUnbackedModalOpen] = useState<boolean>(false)
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(false)

  // Explicit, deterministic state switcher with thorough transient UI reset
  const handleStateChange = useCallback((newState: QaStateId) => {
    setQaState(newState)

    // CRITICAL: Unconditionally reset all transient modals, drawers, and drilldown selections
    setSelectedDrilldown(null)
    setIsDictionaryOpen(false)
    setIsBasisOpen(false)
    setIsFiltersOpen(false)
    setIsBrandModalOpen(false)
    setIsPlatformModalOpen(false)
    setIsExportOpen(false)
    setIsUnbackedModalOpen(false)
    setIsComparisonMode(false)
    setDenseMode(false)

    // Open target surface exclusively according to QA state definition
    if (newState === '02-filters') {
      setIsFiltersOpen(true)
    } else if (newState === '03-dictionary') {
      setIsDictionaryOpen(true)
    } else if (newState === '04-confirmed-basis') {
      setIsBasisOpen(true)
    } else if (newState === '05-brand-breakdown') {
      setIsBrandModalOpen(true)
    } else if (newState === '06-platform-breakdown') {
      setIsPlatformModalOpen(true)
    } else if (newState === '07-comparison') {
      setIsComparisonMode(true)
    } else if (newState === '08-report-drilldown') {
      setSelectedDrilldown(CONFIRMED_REPORTS_DATA[0])
    } else if (newState === '12-export') {
      setIsExportOpen(true)
    } else if (newState === '13-dense') {
      setDenseMode(true)
    } else if (newState === '14-unbacked') {
      setIsUnbackedModalOpen(true)
    }
  }, [])

  // URL sync & Automation Exposure
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const stateParam = params.get('state') || params.get('qaState')
    if (stateParam && [
      '01-main', '02-filters', '03-dictionary', '04-confirmed-basis',
      '05-brand-breakdown', '06-platform-breakdown', '07-comparison',
      '08-report-drilldown', '09-partial', '10-missing',
      '11-no-eligible-reports', '12-export', '13-dense', '14-unbacked'
    ].includes(stateParam)) {
      handleStateChange(stateParam as QaStateId)
    }

    // Expose automation function
    ;(window as unknown as { __setAnalyticsQaState: (s: QaStateId) => void }).__setAnalyticsQaState = (s: QaStateId) => {
      handleStateChange(s)
    }
  }, [handleStateChange])

  // Eligible Confirmed Reports Filter
  const eligibleReports = useMemo(() => {
    if (qaState === '11-no-eligible-reports') {
      return [] // Simulates zero confirmed reports for this filtered period
    }

    let reports = CONFIRMED_REPORTS_DATA

    // In 09-partial: simulate 2 reports having null CTR / product clicks
    if (qaState === '09-partial') {
      reports = reports.map((r, idx) => {
        if (idx === 1 || idx === 3) {
          return { ...r, ctr: null, productClicks: null }
        }
        return r
      })
    }

    // In 10-missing: simulate nullable metrics being missing/unavailable across all reports in this state
    if (qaState === '10-missing') {
      reports = reports.map(r => ({
        ...r,
        likes: null,
        comments: null,
        shares: null,
        productClicks: null,
        ctr: null,
        viewers: null
      }))
    }

    // Apply Brand / Platform filters
    if (filterBrand !== 'all') {
      reports = reports.filter(r => r.brand.toLowerCase() === filterBrand.toLowerCase())
    }
    if (filterPlatform !== 'all') {
      reports = reports.filter(r => r.platform.toLowerCase() === filterPlatform.toLowerCase())
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      reports = reports.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.host.toLowerCase().includes(q) ||
        r.sessionTitle.toLowerCase().includes(q)
      )
    }

    return reports
  }, [qaState, filterBrand, filterPlatform, searchQuery])

  // Aggregation Engine (Strictly confirmed reports, NULL != 0)
  const aggregates = useMemo(() => {
    const count = eligibleReports.length
    if (count === 0) {
      return {
        revenue: 0,
        orders: 0,
        gmv: 0,
        pcu: 0,
        acu: 0,
        cvr: 0,
        ctr: 0,
        aov: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        viewers: 0,
        productClicks: 0,
        durationMinutes: 0,
        durationHours: 0,
        count: 0,
        ctrReportingCount: 0,
        ctrMissingCount: 0
      }
    }

    const sumRev = eligibleReports.reduce((acc, r) => acc + r.revenue, 0)
    const sumOrders = eligibleReports.reduce((acc, r) => acc + r.orders, 0)
    const sumGmv = eligibleReports.reduce((acc, r) => acc + r.gmv, 0)
    const maxPcu = Math.max(...eligibleReports.map(r => r.peakViewer || 0))

    // Valid Non-null averages (Do NOT coerce NULL to 0)
    const validAcus = eligibleReports.filter(r => r.avgViewer !== null).map(r => r.avgViewer!)
    const avgAcu = validAcus.length > 0 ? Math.round(validAcus.reduce((a, b) => a + b, 0) / validAcus.length) : null

    const validCtrs = eligibleReports.filter(r => r.ctr !== null).map(r => r.ctr!)
    const avgCtr = validCtrs.length > 0 ? Number((validCtrs.reduce((a, b) => a + b, 0) / validCtrs.length).toFixed(2)) : null

    const validCvrs = eligibleReports.filter(r => r.cvr !== null).map(r => r.cvr!)
    const avgCvr = validCvrs.length > 0 ? Number((validCvrs.reduce((a, b) => a + b, 0) / validCvrs.length).toFixed(2)) : null

    // AOV Ratio = SUM(revenue) / SUM(orders)
    const calculatedAov = sumOrders > 0 ? Math.round(sumRev / sumOrders) : 0

    // Engagement Sums
    const validLikes = eligibleReports.filter(r => r.likes !== null).map(r => r.likes!)
    const sumLikes = validLikes.length > 0 ? validLikes.reduce((a, b) => a + b, 0) : null

    const validComments = eligibleReports.filter(r => r.comments !== null).map(r => r.comments!)
    const sumComments = validComments.length > 0 ? validComments.reduce((a, b) => a + b, 0) : null

    const validShares = eligibleReports.filter(r => r.shares !== null).map(r => r.shares!)
    const sumShares = validShares.length > 0 ? validShares.reduce((a, b) => a + b, 0) : null

    const validViewers = eligibleReports.filter(r => r.viewers !== null).map(r => r.viewers!)
    const sumViewers = validViewers.length > 0 ? validViewers.reduce((a, b) => a + b, 0) : null

    const validClicks = eligibleReports.filter(r => r.productClicks !== null).map(r => r.productClicks!)
    const sumClicks = validClicks.length > 0 ? validClicks.reduce((a, b) => a + b, 0) : null

    const totalDurMin = eligibleReports.reduce((acc, r) => acc + r.durationMinutes, 0)
    const totalDurHours = Math.round(totalDurMin / 60)

    return {
      revenue: sumRev,
      orders: sumOrders,
      gmv: sumGmv,
      pcu: maxPcu,
      acu: avgAcu,
      cvr: avgCvr,
      ctr: avgCtr,
      aov: calculatedAov,
      likes: sumLikes,
      comments: sumComments,
      shares: sumShares,
      viewers: sumViewers,
      productClicks: sumClicks,
      durationMinutes: totalDurMin,
      durationHours: totalDurHours,
      count: eligibleReports.length,
      ctrReportingCount: validCtrs.length,
      ctrMissingCount: eligibleReports.length - validCtrs.length
    }
  }, [eligibleReports])

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 pb-28 relative font-sans"
      data-qa-controller="analytics"
      data-qa-state={qaState}
    >
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                Phân Tích &amp; Hiệu Suất Livestream
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Confirmed-Only Basis
              </span>
              {isComparisonMode && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <TrendingUp className="w-3.5 h-3.5" />
                  So sánh 7 ngày trước (+14.2%)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Tổng hợp dữ liệu chuẩn hóa từ <strong>{aggregates.count}/28</strong> Báo cáo Ca Đã Xác Nhận (Timezone: Asia/Ho_Chi_Minh)
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Confirmed Basis Button */}
            <button
              onClick={() => setIsBasisOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors"
              title="Xem nguồn gốc dữ liệu: Chỉ báo cáo đã xác nhận"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Cơ sở: 28 Ca xác nhận</span>
            </button>

            {/* KPI Dictionary Button */}
            <button
              onClick={() => setIsDictionaryOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Từ điển KPI</span>
            </button>

            {/* Filters Button */}
            <button
              onClick={() => setIsFiltersOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Bộ lọc</span>
            </button>

            {/* Comparison Toggle */}
            <button
              onClick={() => setIsComparisonMode(!isComparisonMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isComparisonMode
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{isComparisonMode ? 'Tắt so sánh' : 'So sánh kỳ'}</span>
            </button>

            {/* Export Dialog */}
            <button
              onClick={() => setIsExportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất dữ liệu</span>
            </button>
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Khoảng thời gian:</span>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {['today', 'yesterday', '7d', '30d', 'thisMonth'].map(p => {
                const label = p === 'today' ? 'Hôm nay' : p === 'yesterday' ? 'Hôm qua' : p === '7d' ? '7 ngày qua' : p === '30d' ? '30 ngày' : 'Tháng này'
                return (
                  <button
                    key={p}
                    onClick={() => setFilterPeriod(p)}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      filterPeriod === p ? 'bg-white text-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Thương hiệu:</span>
              <select
                value={filterBrand}
                onChange={e => setFilterBrand(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả thương hiệu (4)</option>
                <option value="Ecovacs">Ecovacs</option>
                <option value="Anker">Anker</option>
                <option value="Baseus">Baseus</option>
                <option value="UGREEN">UGREEN</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Sàn TMĐT:</span>
              <select
                value={filterPlatform}
                onChange={e => setFilterPlatform(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Tất cả sàn phát (4)</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Shopee Live">Shopee Live</option>
                <option value="Lazada">Lazada</option>
                <option value="Facebook Live">Facebook Live</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Quality Banners & Alerts */}
        {/* Confirmed Basis Banner */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold">Nguyên tắc Báo cáo đã xác nhận (Confirmed Only):</span>{' '}
              Chỉ các ca đã duyệt (status = confirmed, metrics_confirmed = true) mới đóng góp vào số liệu tổng hợp.{' '}
              <span className="text-emerald-700 font-medium">
                4 ca chưa đủ điều kiện (2 Đang duyệt, 1 Bản nháp, 1 Mở lại) đã tự động loại trừ khỏi tổng.
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsBasisOpen(true)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold underline underline-offset-2 shrink-0 ml-4"
          >
            Chi tiết 4 ca loại trừ &rarr;
          </button>
        </div>

        {/* Partial Coverage Alert (In State 09-partial) */}
        {qaState === '09-partial' && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950">Dữ liệu bán phần (Partial Metric Coverage): 26/28 ca có đủ chỉ số CTR và Lượt click</div>
              <p className="mt-0.5 text-amber-800">
                2 ca livestream chưa trích xuất được số liệu click sản phẩm từ OCR. Trung bình CTR (22.80%) được tính chính xác trên{' '}
                <strong>26 ca hợp lệ</strong>. Tuyệt đối <strong>KHÔNG ép giá trị thiếu về 0</strong> để tránh làm méo mó trung bình.
              </p>
            </div>
          </div>
        )}

        {/* Missing Metric Alert (In State 10-missing) */}
        {qaState === '10-missing' && (
          <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 flex items-start gap-3 text-xs text-rose-900">
            <CircleAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-rose-950">Chỉ số tương tác thiếu dữ liệu (Missing Metric Semantics)</div>
              <p className="mt-0.5 text-rose-800">
                Các phiên phát trên Facebook Live và một số ca UGREEN không có dữ liệu Lượt thích, Bình luận, Chia sẻ. Hệ thống hiển thị ký hiệu{' '}
                <strong className="underline">“—” (Không khả dụng)</strong> thay vì 0, bảo đảm tính minh bạch trong báo cáo.
              </p>
            </div>
          </div>
        )}

        {/* Empty State (In State 11-no-eligible-reports) */}
        {qaState === '11-no-eligible-reports' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <Filter className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Không có báo cáo hợp lệ đã xác nhận</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Trong phạm vi kỳ lọc hiện tại, không tìm thấy ca livestream nào ở trạng thái ĐÃ XÁC NHẬN (Confirmed).
              Các ca ở trạng thái Bản nháp, Đang duyệt hoặc Mở lại không được phép hiển thị trên Bảng phân tích.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setFilterBrand('all')
                  setFilterPlatform('all')
                  handleStateChange('01-main')
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                Đặt lại bộ lọc
              </button>
              <button
                onClick={() => setIsBasisOpen(true)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors"
              >
                Xem ca đang duyệt
              </button>
            </div>
          </div>
        )}

        {qaState !== '11-no-eligible-reports' && (
          <>
            {/* Primary KPI Summary Cards (6 Old Production Metrics) */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* METRIC-001: Revenue */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Doanh thu báo cáo</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600">SUM</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tracking-tight">
                  {formatVnd(aggregates.revenue)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {isComparisonMode ? (
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{calculateDelta(aggregates.revenue, PREV_PERIOD_TOTALS.revenue).text}</span>
                      <span className="text-slate-400 font-normal">vs 7d trước</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Từ {aggregates.count} ca kết thúc</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                  <span>METRIC-001</span>
                  <span className="text-indigo-600 font-medium">Confirmed Only</span>
                </div>
              </div>

              {/* METRIC-002: Orders */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Số đơn hàng</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600">SUM</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tracking-tight">
                  {formatNum(aggregates.orders)} <span className="text-xs font-normal text-slate-500">đơn</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {isComparisonMode ? (
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{calculateDelta(aggregates.orders, PREV_PERIOD_TOTALS.orders).text}</span>
                      <span className="text-slate-400 font-normal">vs 7d trước</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Đơn xác nhận OCR</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                  <span>METRIC-002</span>
                  <span>Non-null</span>
                </div>
              </div>

              {/* METRIC-013: Average Order Value (AOV) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">AOV (TB / đơn)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-indigo-50 text-indigo-700">RATIO</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tracking-tight">
                  {formatVnd(aggregates.aov)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {isComparisonMode ? (
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{calculateDelta(aggregates.aov, PREV_PERIOD_TOTALS.aov).text}</span>
                      <span className="text-slate-400 font-normal">vs 7d trước</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Doanh thu / Đơn</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                  <span>METRIC-013</span>
                  <span>Formula ratio</span>
                </div>
              </div>

              {/* METRIC-003: Peak Viewer (PCU) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Viewers đỉnh (PCU)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600">MAX</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tracking-tight">
                  {formatNum(aggregates.pcu)} <span className="text-xs font-normal text-slate-500">CCU</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {isComparisonMode ? (
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{calculateDelta(aggregates.pcu, PREV_PERIOD_TOTALS.pcu).text}</span>
                      <span className="text-slate-400 font-normal">vs 7d trước</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Ecovacs Siêu Sale</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                  <span>METRIC-003</span>
                  <span>Max qua 28 ca</span>
                </div>
              </div>

              {/* METRIC-004: Average Viewer (ACU) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Viewers TB (ACU)</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600">AVG</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tracking-tight">
                  {formatNum(aggregates.acu)} <span className="text-xs font-normal text-slate-500">ACU</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {isComparisonMode ? (
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{calculateDelta(aggregates.acu, PREV_PERIOD_TOTALS.acu).text}</span>
                      <span className="text-slate-400 font-normal">vs 7d trước</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Trung bình mỗi ca</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                  <span>METRIC-004</span>
                  <span>Chỉ tính ca có số</span>
                </div>
              </div>

              {/* METRIC-012: Conversion Rate (CVR) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs relative overflow-hidden group hover:border-indigo-300 transition-colors">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider">Tỷ lệ CVR</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-indigo-50 text-indigo-700">AVG</span>
                </div>
                <div className="text-lg font-bold text-slate-900 tracking-tight">
                  {formatPct(aggregates.cvr)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  {isComparisonMode ? (
                    <div className="flex items-center gap-1 font-semibold text-emerald-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{calculateDelta(aggregates.cvr, PREV_PERIOD_TOTALS.cvr).text}</span>
                      <span className="text-slate-400 font-normal">vs 7d trước</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Đơn hàng / Clicks</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1 flex items-center justify-between">
                  <span>METRIC-012</span>
                  <span>Formula AVG</span>
                </div>
              </div>
            </section>

            {/* Secondary / Engagement Metrics Grid (8 Old Metrics) */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Chỉ số tương tác &amp; Vận hành phiên Live (Engagement &amp; Operations)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400">
                  Chuẩn hóa theo METRIC-005 &rarr; METRIC-014
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* METRIC-008: GMV */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Tổng GMV ghi nhận</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatVnd(aggregates.gmv)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">METRIC-008 (SUM)</div>
                </div>

                {/* METRIC-009: Viewers */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Tổng người xem</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatNum(aggregates.viewers)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">METRIC-009 (Engaged)</div>
                </div>

                {/* METRIC-010: Product Clicks */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Click sản phẩm</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatNum(aggregates.productClicks)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">METRIC-010 (Giỏ hàng)</div>
                </div>

                {/* METRIC-011: CTR */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">CTR Giỏ hàng</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatPct(aggregates.ctr)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {qaState === '09-partial' ? '26/28 ca (Không ép 0)' : 'METRIC-011 (AVG)'}
                  </div>
                </div>

                {/* METRIC-005: Likes */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Lượt thích</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatNum(aggregates.likes)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {aggregates.likes === null ? (
                      <span className="text-amber-600 font-medium">Chưa có dữ liệu</span>
                    ) : (
                      'METRIC-005 (SUM)'
                    )}
                  </div>
                </div>

                {/* METRIC-006: Comments */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Bình luận</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatNum(aggregates.comments)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {aggregates.comments === null ? (
                      <span className="text-amber-600 font-medium">Chưa có dữ liệu</span>
                    ) : (
                      'METRIC-006 (SUM)'
                    )}
                  </div>
                </div>

                {/* METRIC-007: Shares */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Chia sẻ</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{formatNum(aggregates.shares)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {aggregates.shares === null ? (
                      <span className="text-amber-600 font-medium">Chưa có dữ liệu</span>
                    ) : (
                      'METRIC-007 (SUM)'
                    )}
                  </div>
                </div>

                {/* METRIC-014: Duration */}
                <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                  <div className="text-[11px] text-slate-500 font-medium truncate">Thời lượng live</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">{aggregates.durationHours} giờ</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">METRIC-014 ({aggregates.durationMinutes} ph)</div>
                </div>
              </div>
            </section>

            {/* Performance Panels: Trend Chart & Brand/Platform Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Trend Chart (SVG) */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Diễn biến Doanh thu &amp; Số đơn qua 7 ngày</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Chu kỳ phát thực tế từ 28/09/2026 đến 04/10/2026</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block"></span>
                      Doanh thu (VND)
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                      Số đơn hàng
                    </span>
                  </div>
                </div>

                {/* SVG Line / Bar visualization */}
                <div className="h-64 w-full relative pt-4">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 700 200">
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    <line x1="0" y1="40" x2="700" y2="40" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="0" y1="90" x2="700" y2="90" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="0" y1="140" x2="700" y2="140" stroke="#E2E8F0" strokeDasharray="3 3" />

                    {/* Area under curve */}
                    <path
                      d="M 50 140 L 150 160 L 250 152 L 350 142 L 450 140 L 550 128 L 650 95 L 650 190 L 50 190 Z"
                      fill="url(#revGrad)"
                    />

                    {/* Revenue Line */}
                    <path
                      d="M 50 140 L 150 160 L 250 152 L 350 142 L 450 140 L 550 128 L 650 95"
                      fill="none"
                      stroke="#4F46E5"
                      strokeWidth="3"
                    />

                    {/* Data Points */}
                    {TREND_DATA.map((d, i) => {
                      const cx = 50 + i * 100
                      const yMap = [140, 160, 152, 142, 140, 128, 95]
                      const cy = yMap[i]
                      return (
                        <g key={d.date} className="cursor-pointer group">
                          <circle cx={cx} cy={cy} r="5" fill="#FFFFFF" stroke="#4F46E5" strokeWidth="2.5" />
                          <circle cx={cx} cy={cy} r="8" fill="#4F46E5" fillOpacity="0" className="group-hover:fill-opacity-20 transition-all" />
                          {/* Value on top */}
                          <text x={cx} y={cy - 10} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1E293B">
                            {(d.revenue / 1000000).toFixed(1)}M
                          </text>
                          {/* X-axis label */}
                          <text x={cx} y={195} textAnchor="middle" fontSize="11" fill="#64748B">
                            {d.date}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              </div>

              {/* Platform Share Donut & Breakdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900">Tỷ trọng Sàn TMĐT</h3>
                    <button
                      onClick={() => setIsPlatformModalOpen(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Chi tiết &rarr;
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Dựa trên 28 ca đã xác nhận (Tổng: 876.400.000 ₫)</p>

                  <div className="space-y-3">
                    {PLATFORM_SHARE.map(p => (
                      <div key={p.platform} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800">{p.platform}</span>
                          <span className="text-slate-600 font-medium">
                            {formatVnd(p.revenue)} ({p.share}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${p.share}%`, backgroundColor: p.color }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>{p.orders} đơn • PCU: {p.pcu}</span>
                          <span>{p.reportCount} ca</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>TikTok Shop dẫn đầu 61.4%</span>
                  <span className="text-emerald-600 font-medium">100% khớp doanh thu</span>
                </div>
              </div>
            </div>

            {/* Brand Breakdown Cards */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hiệu Suất Theo Thương Hiệu (Brand Breakdown)</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Phân rã theo 4 thương hiệu vận hành chính (Tổng: 876.400.000 ₫)</p>
                </div>
                <button
                  onClick={() => setIsBrandModalOpen(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  Bảng so sánh chi tiết &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {BRAND_PERFORMANCE.map(b => (
                  <div
                    key={b.brand}
                    className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900">{b.brand}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        {b.share}% Doanh thu
                      </span>
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      {formatVnd(b.revenue)}
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Số đơn:</span>
                        <span className="font-semibold">{b.orders} đơn</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">AOV:</span>
                        <span className="font-semibold">{formatVnd(b.avgAov)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Viewers Đỉnh:</span>
                        <span className="font-semibold">{formatNum(b.pcu)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Tỷ lệ CVR:</span>
                        <span className="font-semibold">{b.cvr}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contributing Confirmed Reports Section (Drilldown Surface) */}
            <div
              data-qa-dense-table="true"
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Danh Sách Báo Cáo Ca Đã Xác Nhận Đóng Góp ({eligibleReports.length} Báo Cáo)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mỗi dòng tương ứng với 1 ca livestream kết thúc đã được đối soát OCR và duyệt chính thức. Bấm “Drilldown” để kiểm tra số liệu gốc.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Tìm mã báo cáo, host, thương hiệu..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-56"
                    />
                  </div>
                  <button
                    onClick={() => setDenseMode(!denseMode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      denseMode ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                    }`}
                  >
                    {denseMode ? 'Chế độ thu gọn' : 'Chế độ dày đặc'}
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[460px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap`}>Mã báo cáo</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap`}>Ngày &amp; Ca</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap`}>Thương hiệu</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap`}>Sàn</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap`}>Host</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-right`}>Doanh thu</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-right`}>Đơn</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-right`}>PCU</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-right`}>CTR</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-right`}>CVR</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-center`}>Trạng thái</th>
                      <th className={`px-3 ${denseMode ? 'py-1.5' : 'py-2.5'} whitespace-nowrap text-center`}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {eligibleReports.map(rep => (
                      <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} font-mono font-semibold text-indigo-700`}>
                          {rep.id}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-slate-600`}>
                          {rep.shiftDate} ({rep.timeSlot})
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} font-semibold text-slate-800`}>
                          {rep.brand}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-slate-600`}>
                          {rep.platform}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-slate-700`}>
                          {rep.host}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-right font-bold text-slate-900`}>
                          {formatVnd(rep.revenue)}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-right text-slate-700 font-medium`}>
                          {formatNum(rep.orders)}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-right text-slate-600`}>
                          {rep.peakViewer ? formatNum(rep.peakViewer) : '—'}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-right text-slate-600`}>
                          {rep.ctr !== null ? `${rep.ctr}%` : <span className="text-amber-600 font-medium">Chưa có</span>}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-right text-slate-600`}>
                          {rep.cvr !== null ? `${rep.cvr}%` : '—'}
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-center`}>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-2.5 h-2.5" />
                            OCR Đã duyệt
                          </span>
                        </td>
                        <td className={`px-3 ${denseMode ? 'py-1' : 'py-2'} text-center`}>
                          <button
                            onClick={() => setSelectedDrilldown(rep)}
                            className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md font-semibold text-[11px] transition-colors"
                          >
                            Drilldown
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 02: ADVANCED FILTERS DRAWER */}
      {/* ========================================================================= */}
      {isFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Bộ Lọc Phân Tích Nâng Cao</h3>
              </div>
              <button onClick={() => setIsFiltersOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Chu kỳ phân tích (Business Calendar):</label>
                <div className="grid grid-cols-3 gap-2">
                  {['today', 'yesterday', '7d', '30d', 'thisMonth', 'custom'].map(p => (
                    <button
                      key={p}
                      onClick={() => setFilterPeriod(p)}
                      className={`p-2 rounded-lg border text-center font-medium ${
                        filterPeriod === p ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p === 'today' ? 'Hôm nay' : p === 'yesterday' ? 'Hôm qua' : p === '7d' ? '7 ngày qua' : p === '30d' ? '30 ngày' : p === 'thisMonth' ? 'Tháng này' : 'Tùy chọn'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Múi giờ vận hành: Asia/Ho_Chi_Minh (GMT+7)</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Thương hiệu:</label>
                <select
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                >
                  <option value="all">Tất cả thương hiệu (Ecovacs, Anker, Baseus, UGREEN)</option>
                  <option value="Ecovacs">Ecovacs</option>
                  <option value="Anker">Anker</option>
                  <option value="Baseus">Baseus</option>
                  <option value="UGREEN">UGREEN</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Sàn TMĐT:</label>
                <select
                  value={filterPlatform}
                  onChange={e => setFilterPlatform(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                >
                  <option value="all">Tất cả sàn phát (TikTok Shop, Shopee Live, Lazada, Facebook)</option>
                  <option value="TikTok Shop">TikTok Shop</option>
                  <option value="Shopee Live">Shopee Live</option>
                  <option value="Lazada">Lazada</option>
                  <option value="Facebook Live">Facebook Live</option>
                </select>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Điều kiện dữ liệu: Báo cáo đã xác nhận (Bắt buộc)
                </div>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Hệ thống khóa cố định bộ lọc trạng thái ở mức <strong>Confirmed</strong>. Các bản nháp, ca đang duyệt không thể đóng góp vào chỉ số tổng hợp.
                </p>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center justify-between text-amber-900 font-bold">
                  <span>Phòng Studio (Phân đoạn mới)</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">NEW_ONLY_UNBACKED</span>
                </div>
                <p className="text-[11px] text-amber-800 mt-1">
                  Tính năng lọc theo phòng Studio (Studio 1, Studio 2) là phần mở rộng giao diện mới, chưa được bảo đảm bởi API production cũ.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsFiltersOpen(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                Áp dụng bộ lọc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 03: METRIC DICTIONARY MODAL */}
      {/* ========================================================================= */}
      {isDictionaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Từ Điển Chỉ Số KPI Chuẩn Hóa (Metric Dictionary)</h3>
              </div>
              <button onClick={() => setIsDictionaryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <p className="text-slate-500">
                Tất cả 14 chỉ số bên dưới được kế thừa 100% từ định nghĩa production cũ (OLD Analytics Authority), không tự sáng tạo công thức mới.
              </p>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Mã KPI</th>
                      <th className="p-2.5">Tên chỉ số</th>
                      <th className="p-2.5">Đơn vị</th>
                      <th className="p-2.5">Công thức / Quy tắc tính</th>
                      <th className="p-2.5">Hàm tổng hợp</th>
                      <th className="p-2.5">Khả năng rỗng</th>
                      <th className="p-2.5">Nguồn dữ liệu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {METRIC_DICTIONARY.map(m => (
                      <tr key={m.coverageId} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono font-bold text-indigo-700">{m.coverageId}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{m.displayName}</td>
                        <td className="p-2.5 text-slate-600">{m.unit}</td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-800 bg-slate-50/50">{m.formula}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                            m.aggregation === 'SUM' ? 'bg-blue-50 text-blue-700' :
                            m.aggregation === 'AVG' ? 'bg-amber-50 text-amber-700' :
                            m.aggregation === 'MAX' ? 'bg-rose-50 text-rose-700' :
                            m.aggregation === 'RATIO' ? 'bg-purple-50 text-purple-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {m.aggregation}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{m.nullability === 'NON_NULL' ? 'Không rỗng' : 'Có thể rỗng (—)'}</td>
                        <td className="p-2.5 text-slate-600">{m.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsDictionaryOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Đóng từ điển
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 04: CONFIRMED BASIS & EXCLUDED REPORTS MODAL */}
      {/* ========================================================================= */}
      {isBasisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Cơ Sở Dữ Liệu: 28 Ca Đã Xác Nhận &amp; 4 Ca Bị Loại Trừ
                </h3>
              </div>
              <button onClick={() => setIsBasisOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-emerald-900">
                <div className="font-bold">Quy tắc chuẩn hóa nghiêm ngặt:</div>
                <p className="mt-1 leading-relaxed text-emerald-800">
                  Analytics chỉ tổng hợp các ca có <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded">status = &apos;confirmed&apos;</code> và{' '}
                  <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded">metrics_confirmed = true</code>.
                  Tuyệt đối không để số liệu tạm thời từ ca đang phát trực tiếp, bản nháp, hoặc ca đang duyệt len lỏi vào tổng doanh thu.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">Danh sách 4 ca không đủ điều kiện (Excluded Reports):</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Mã báo cáo</th>
                        <th className="p-2.5">Ngày</th>
                        <th className="p-2.5">Thương hiệu</th>
                        <th className="p-2.5">Trạng thái</th>
                        <th className="p-2.5">Doanh thu tạm tính</th>
                        <th className="p-2.5">Lý do loại trừ khỏi Analytics</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {EXCLUDED_REPORTS.map(ex => (
                        <tr key={ex.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-slate-600">{ex.id}</td>
                          <td className="p-2.5">{ex.shiftDate}</td>
                          <td className="p-2.5 font-semibold text-slate-800">{ex.brand}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ex.status === 'in_review' ? 'bg-amber-100 text-amber-800' :
                              ex.status === 'draft' ? 'bg-slate-200 text-slate-700' :
                              ex.status === 'reopened' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {ex.status === 'in_review' ? 'Đang duyệt' : ex.status === 'draft' ? 'Bản nháp' : 'Mở lại'}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-400 line-through">{formatVnd(ex.tentativeRevenue)}</td>
                          <td className="p-2.5 text-slate-700">{ex.reasonExcluded}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsBasisOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 05: BRAND BREAKDOWN MODAL */}
      {/* ========================================================================= */}
      {isBrandModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Chi Tiết Báo Cáo Theo Thương Hiệu (Brand Breakdown)</h3>
              </div>
              <button onClick={() => setIsBrandModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Thương hiệu</th>
                    <th className="p-3 text-right">Doanh thu</th>
                    <th className="p-3 text-right">Số đơn</th>
                    <th className="p-3 text-right">GMV</th>
                    <th className="p-3 text-right">AOV</th>
                    <th className="p-3 text-right">Viewers Đỉnh</th>
                    <th className="p-3 text-right">CVR</th>
                    <th className="p-3 text-center">Số ca đã duyệt</th>
                    <th className="p-3 text-right">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {BRAND_PERFORMANCE.map(b => (
                    <tr key={b.brand} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{b.brand}</td>
                      <td className="p-3 text-right font-extrabold text-slate-900">{formatVnd(b.revenue)}</td>
                      <td className="p-3 text-right text-slate-700">{b.orders} đơn</td>
                      <td className="p-3 text-right text-slate-600">{formatVnd(b.gmv)}</td>
                      <td className="p-3 text-right text-slate-700 font-semibold">{formatVnd(b.avgAov)}</td>
                      <td className="p-3 text-right text-slate-600">{formatNum(b.pcu)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-600">{b.cvr}%</td>
                      <td className="p-3 text-center text-slate-700">{b.reportCount} ca</td>
                      <td className="p-3 text-right font-bold text-indigo-700">{b.share}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setIsBrandModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 06: PLATFORM BREAKDOWN MODAL */}
      {/* ========================================================================= */}
      {isPlatformModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Chi Tiết Báo Cáo Theo Sàn TMĐT (Platform Breakdown)</h3>
              </div>
              <button onClick={() => setIsPlatformModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Sàn TMĐT</th>
                    <th className="p-3 text-right">Doanh thu</th>
                    <th className="p-3 text-right">Số đơn</th>
                    <th className="p-3 text-right">Viewers Đỉnh</th>
                    <th className="p-3 text-right">CVR</th>
                    <th className="p-3 text-center">Số ca đã duyệt</th>
                    <th className="p-3 text-right">Tỷ trọng GMV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PLATFORM_SHARE.map(p => (
                    <tr key={p.platform} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{p.platform}</td>
                      <td className="p-3 text-right font-extrabold text-slate-900">{formatVnd(p.revenue)}</td>
                      <td className="p-3 text-right text-slate-700">{p.orders} đơn</td>
                      <td className="p-3 text-right text-slate-600">{formatNum(p.pcu)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-600">{p.cvr}%</td>
                      <td className="p-3 text-center text-slate-700">{p.reportCount} ca</td>
                      <td className="p-3 text-right font-bold text-indigo-700">{p.share}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setIsPlatformModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 08: REPORT DRILLDOWN MODAL */}
      {/* ========================================================================= */}
      {selectedDrilldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-indigo-700">{selectedDrilldown.id}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Confirmed Report
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedDrilldown.sessionTitle}</h3>
              </div>
              <button onClick={() => setSelectedDrilldown(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400">Thương hiệu:</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedDrilldown.brand}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400">Sàn phát:</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedDrilldown.platform}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400">Ngày phát:</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedDrilldown.shiftDate}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-400">Host chính:</span>
                <p className="font-bold text-slate-800 mt-0.5">{selectedDrilldown.host}</p>
              </div>
            </div>

            <div className="p-4 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-slate-800">Đóng góp chỉ số vào Analytics tổng:</div>
              <div className="grid grid-cols-2 gap-3 text-slate-600">
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span>Doanh thu đóng góp:</span>
                  <span className="font-bold text-slate-900">{formatVnd(selectedDrilldown.revenue)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span>Tỷ trọng doanh thu:</span>
                  <span className="font-bold text-indigo-700">
                    {((selectedDrilldown.revenue / aggregates.revenue) * 100).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span>Số đơn hàng:</span>
                  <span className="font-bold text-slate-900">{selectedDrilldown.orders} đơn</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span>AOV ca này:</span>
                  <span className="font-bold text-slate-900">{formatVnd(selectedDrilldown.aov)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span>PCU / ACU:</span>
                  <span className="font-bold text-slate-900">{selectedDrilldown.peakViewer} / {selectedDrilldown.avgViewer}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span>CTR / CVR:</span>
                  <span className="font-bold text-slate-900">{selectedDrilldown.ctr}% / {selectedDrilldown.cvr}%</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Dữ liệu OCR đã đối soát với báo cáo sàn TMĐT
              </span>
              <button
                onClick={() => setSelectedDrilldown(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 12: EXPORT DIALOG */}
      {/* ========================================================================= */}
      {isExportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Xuất Báo Cáo Phân Tích (Export)</h3>
              </div>
              <button onClick={() => setIsExportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Phạm vi thời gian:</span>
                <p className="font-semibold text-slate-800">7 ngày qua (28/09/2026 - 04/10/2026)</p>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Cơ sở dữ liệu:</span>
                <p className="font-semibold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  28 Báo cáo Ca Đã Xác Nhận (Confirmed Only - Tổng: 876.400.000 ₫)
                </p>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Định dạng xuất:</span>
                <div className="grid grid-cols-3 gap-2">
                  <button className="p-2.5 rounded-lg border border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold flex flex-col items-center gap-1">
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel (.xlsx)
                  </button>
                  <button className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex flex-col items-center gap-1">
                    <FileText className="w-4 h-4" />
                    CSV (.csv)
                  </button>
                  <button className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex flex-col items-center gap-1">
                    <Download className="w-4 h-4" />
                    PDF Tóm tắt
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsExportOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  alert('Static Export Action: Đã ghi nhận lệnh xuất báo cáo với 28 ca đã xác nhận (Tổng 876.400.000 ₫).')
                  setIsExportOpen(false)
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
              >
                Tải về tệp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 14: UNBACKED FEATURES HIGHLIGHT (NEW_ONLY_UNBACKED) */}
      {/* ========================================================================= */}
      {isUnbackedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-slate-900">Tính Năng Chưa Có Hậu Thuẫn (NEW_ONLY_UNBACKED)</h3>
              </div>
              <button onClick={() => setIsUnbackedModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Để bảo vệ tính toàn vẹn dữ liệu, các thành phần giao diện mới không có hợp đồng API backend từ production cũ
                được đánh dấu rõ ràng với nhãn <strong className="text-amber-800 font-mono">NEW_ONLY_UNBACKED</strong>:
              </p>

              <div className="space-y-2">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="font-bold text-amber-950">1. Lọc theo Phòng Studio (Studio Room Breakdown)</div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Hệ thống cũ không ghi nhận mã phòng studio trong hợp đồng báo cáo ca xác nhận.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="font-bold text-amber-950">2. Dự báo Realtime ca đang phát (Live In-flight Forecast)</div>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Analytics chỉ phục vụ báo cáo đối soát sau ca (Post-shift confirmed reports), không đưa số liệu ước đoán trực tiếp.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setIsUnbackedModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Đã ghi nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLOATING QA CONTROLLER (Deterministic State Switcher) */}
      {/* ========================================================================= */}
      <div className="fixed bottom-3 right-3 z-40 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 p-3 max-w-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-300">
              Analytics Wave 03 Visual QA Controller
            </span>
          </div>
          <span className="font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-emerald-400 border border-slate-700">
            {qaState}
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 text-[11px]">
          {[
            { id: '01-main', label: '01 Main' },
            { id: '02-filters', label: '02 Filters' },
            { id: '03-dictionary', label: '03 Dict' },
            { id: '04-confirmed-basis', label: '04 Basis' },
            { id: '05-brand-breakdown', label: '05 Brand' },
            { id: '06-platform-breakdown', label: '06 Plat' },
            { id: '07-comparison', label: '07 Comp' },
            { id: '08-report-drilldown', label: '08 Drill' },
            { id: '09-partial', label: '09 Part' },
            { id: '10-missing', label: '10 Miss' },
            { id: '11-no-eligible-reports', label: '11 Zero' },
            { id: '12-export', label: '12 Export' },
            { id: '13-dense', label: '13 Dense' },
            { id: '14-unbacked', label: '14 Unbacked' }
          ].map(st => (
            <button
              key={st.id}
              data-qa-trigger={st.id}
              onClick={() => handleStateChange(st.id as QaStateId)}
              className={`px-2 py-1 rounded-md text-center font-medium transition-all ${
                qaState === st.id
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AnalyticsReferenceMock
