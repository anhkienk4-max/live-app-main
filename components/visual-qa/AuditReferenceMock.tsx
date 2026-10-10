'use client'

import React, { useState, useEffect, useMemo, ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  Eye,
  Calendar,
  User,
  Shield,
  Layers,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  Code,
  FileText,
  FileCode,
  History,
  Lock,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Laptop,
  Globe,
  Sliders,
  Sparkles,
  Database,
  ExternalLink,
  ChevronLeft,
  X,
  FileSpreadsheet,
  ListFilter,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Split,
  Maximize2,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react'
import { AdminSystemReferenceShell } from '@/components/visual-qa/AdminSystemReferenceShell'
import type { AuditAction, AuditLog, AuditModule, SystemPermission } from '@/lib/types/database.types'

export type AuditQaState =
  | '01-main-workspace'
  | '02-active-filters'
  | '03-search-result'
  | '04-event-detail'
  | '05-actor-attribution'
  | '06-entity-provenance'
  | '07-before-after-diff'
  | '08-before-only'
  | '09-after-only'
  | '10-metadata-context'
  | '11-raw-json'
  | '12-structured-table'
  | '13-settings-event'
  | '14-shift-event'
  | '15-staffing-event'
  | '16-registration-event'
  | '17-swap-event'
  | '18-import-event'
  | '19-report-event'
  | '20-permission-restriction'
  | '21-immutable-append-only'
  | '22-actor-spoof-protection'
  | '23-entity-history'
  | '24-correlation-context'
  | '25-empty'
  | '26-no-results'
  | '27-loading'
  | '28-refreshing'
  | '29-error'
  | '30-long-json-stress'
  | '31-dense-history-stress'

export interface AuditStateOption {
  id: AuditQaState
  num: string
  label: string
  group: 'CORE' | 'DIFF' | 'DOMAINS' | 'SECURITY' | 'SYSTEM' | 'STRESS'
}

export const AUDIT_STATES: AuditStateOption[] = [
  { id: '01-main-workspace', num: '01', label: 'Bàn làm việc kiểm toán chính', group: 'CORE' },
  { id: '02-active-filters', num: '02', label: 'Bộ lọc đa chiều kích hoạt', group: 'CORE' },
  { id: '03-search-result', num: '03', label: 'Kết quả tìm kiếm thực thể / tương quan', group: 'CORE' },
  { id: '04-event-detail', num: '04', label: 'Thanh kiểm tra chi tiết sự kiện', group: 'CORE' },
  { id: '05-actor-attribution', num: '05', label: 'Xác thực & danh tính người thực hiện', group: 'SECURITY' },
  { id: '06-entity-provenance', num: '06', label: 'Nguồn gốc & phả hệ thực thể', group: 'CORE' },
  { id: '07-before-after-diff', num: '07', label: 'So sánh Before / After (Diff View)', group: 'DIFF' },
  { id: '08-before-only', num: '08', label: 'Chỉ có Before (Ghi nhận DELETE)', group: 'DIFF' },
  { id: '09-after-only', num: '09', label: 'Chỉ có After (Ghi nhận INSERT)', group: 'DIFF' },
  { id: '10-metadata-context', num: '10', label: 'Ngữ cảnh giao dịch & Metadata', group: 'CORE' },
  { id: '11-raw-json', num: '11', label: 'Dữ liệu thô JSONB đã khử nhạy cảm', group: 'CORE' },
  { id: '12-structured-table', num: '12', label: 'Dạng bảng cấu trúc thuộc tính', group: 'CORE' },
  { id: '13-settings-event', num: '13', label: 'Sự kiện kiểm toán Cài đặt (Settings)', group: 'DOMAINS' },
  { id: '14-shift-event', num: '14', label: 'Sự kiện kiểm toán Ca làm việc (Shift)', group: 'DOMAINS' },
  { id: '15-staffing-event', num: '15', label: 'Sự kiện kiểm toán Phân công nhân sự', group: 'DOMAINS' },
  { id: '16-registration-event', num: '16', label: 'Sự kiện kiểm toán Đăng ký ca', group: 'DOMAINS' },
  { id: '17-swap-event', num: '17', label: 'Sự kiện kiểm toán Đổi ca (Swap)', group: 'DOMAINS' },
  { id: '18-import-event', num: '18', label: 'Sự kiện kiểm toán Nhập lô (Import Batch)', group: 'DOMAINS' },
  { id: '19-report-event', num: '19', label: 'Sự kiện kiểm toán Báo cáo doanh thu', group: 'DOMAINS' },
  { id: '20-permission-restriction', num: '20', label: 'Phân quyền RLS (Leader vs Member)', group: 'SECURITY' },
  { id: '21-immutable-append-only', num: '21', label: 'Cam kết Bất biến & Chỉ thêm (Append-Only)', group: 'SECURITY' },
  { id: '22-actor-spoof-protection', num: '22', label: 'Cơ chế chống giả mạo danh tính (Trigger-Guarded)', group: 'SECURITY' },
  { id: '23-entity-history', num: '23', label: 'Lịch sử kiểm toán theo dòng thời gian thực thể', group: 'CORE' },
  { id: '24-correlation-context', num: '24', label: 'Ngữ cảnh tương quan giao dịch nguyên tử', group: 'CORE' },
  { id: '25-empty', num: '25', label: 'Lịch sử kiểm toán trống', group: 'SYSTEM' },
  { id: '26-no-results', num: '26', label: 'Không tìm thấy kết quả', group: 'SYSTEM' },
  { id: '27-loading', num: '27', label: 'Đang tải dữ liệu', group: 'SYSTEM' },
  { id: '28-refreshing', num: '28', label: 'Đang làm mới dữ liệu', group: 'SYSTEM' },
  { id: '29-error', num: '29', label: 'Lỗi truy vấn máy chủ', group: 'SYSTEM' },
  { id: '30-long-json-stress', num: '30', label: 'Kiểm thử tải JSON lớn & Cuộn nội bộ', group: 'STRESS' },
  { id: '31-dense-history-stress', num: '31', label: 'Kiểm thử mật độ cao (100+ sự kiện)', group: 'STRESS' },
]

// ============================================================================
// CANONICAL PRODUCTION AUDIT FIXTURES (100% CROSS-DOMAIN CONSISTENT)
// ============================================================================

export interface CanonicalAuditEvent extends AuditLog {
  initials: string
}

export const CANONICAL_AUDIT_EVENTS: CanonicalAuditEvent[] = [
  // 1. Settings Audit Event
  {
    id: 'audit-set-2026-0925-01',
    timestamp: '2026-09-25T14:32:05.120Z',
    actor_id: 'usr-admin-001',
    actor_auth_user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    actor_business_user_id: 'usr-admin-001',
    actor_name: 'Nguyễn Văn A',
    actor_role: 'admin',
    module: 'settings',
    action: 'update',
    entity_type: 'operational_settings',
    entity_id: 'setting-global-ops',
    entity_name: 'Cấu hình vận hành mặc định',
    before: {
      default_shift_duration_minutes: 180,
      timezone: 'Asia/Ho_Chi_Minh',
      auto_remind_hours_before: 2,
      registration_freeze_hours: 12,
      max_overtime_hours_weekly: 16,
    },
    after: {
      default_shift_duration_minutes: 240,
      timezone: 'Asia/Ho_Chi_Minh',
      auto_remind_hours_before: 4,
      registration_freeze_hours: 24,
      max_overtime_hours_weekly: 20,
    },
    changed_fields: ['default_shift_duration_minutes', 'auto_remind_hours_before', 'registration_freeze_hours', 'max_overtime_hours_weekly'],
    reason: 'Điều chỉnh thời gian khóa đăng ký và thời lượng ca phục vụ chiến dịch Q4/2026',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-cf812a45-7890-4abc-9012-def345678901',
    entity_exists: true,
    review_status: 'reviewed',
    admin_note: 'Đã thông báo toàn bộ Leader và đội ngũ nhân sự trước khi áp dụng thay đổi thời gian đóng đăng ký.',
    handling_reason: 'Phê duyệt cấu hình mở rộng khung giờ live',
    initials: 'NA',
  },

  // 2. Shift Audit Event
  {
    id: 'audit-shf-2026-0925-02',
    timestamp: '2026-09-25T13:45:10.450Z',
    actor_id: 'usr-leader-002',
    actor_auth_user_id: 'b1ffcd88-8b1a-4fe7-aa5c-5aa8ac270b22',
    actor_business_user_id: 'usr-leader-002',
    actor_name: 'Trần Thị B',
    actor_role: 'leader',
    module: 'calendar',
    action: 'update',
    entity_type: 'shifts',
    entity_id: 'shf-pharmaton-102',
    entity_name: 'Pharmaton Livestream D9',
    before: {
      start_time: '09:00',
      end_time: '12:00',
      status: 'published',
      required_host_count: 1,
      required_support_count: 1,
      version: 1,
    },
    after: {
      start_time: '10:00',
      end_time: '13:00',
      status: 'published',
      required_host_count: 2,
      required_support_count: 1,
      version: 2,
    },
    changed_fields: ['start_time', 'end_time', 'required_host_count', 'version'],
    reason: 'Nhãn hàng Pharmaton yêu cầu lùi 1 giờ và bổ sung 1 Host hỗ trợ chốt deal',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-778899aa-bbcc-4455-6677-8899aabbccdd',
    entity_exists: true,
    review_status: 'unreviewed',
    initials: 'TB',
  },

  // 3. Staffing Audit Event
  {
    id: 'audit-stf-2026-0925-03',
    timestamp: '2026-09-25T11:20:00.800Z',
    actor_id: 'usr-leader-002',
    actor_auth_user_id: 'b1ffcd88-8b1a-4fe7-aa5c-5aa8ac270b22',
    actor_business_user_id: 'usr-leader-002',
    actor_name: 'Trần Thị B',
    actor_role: 'leader',
    module: 'staff',
    action: 'assign',
    entity_type: 'shifts',
    entity_id: 'shf-corbiere-104',
    entity_name: 'Corbiere Live Sale Q3',
    before: {
      host_names: [],
      assigned_staff_count: 0,
      staffing_status: 'unstaffed',
    },
    after: {
      host_names: ['Đặng Thu Thảo'],
      assigned_staff_count: 1,
      staffing_status: 'partially_staffed',
    },
    changed_fields: ['host_names', 'assigned_staff_count', 'staffing_status'],
    reason: 'Gán thủ công Host Đặng Thu Thảo vào ca Corbiere theo chứng chỉ kinh nghiệm dược phẩm',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-aa112233-4455-6677-8899-001122334455',
    entity_exists: true,
    review_status: 'unreviewed',
    initials: 'TB',
  },

  // 4. Registration Audit Event
  {
    id: 'audit-reg-2026-0925-04',
    timestamp: '2026-09-25T10:15:30.220Z',
    actor_id: 'usr-leader-002',
    actor_auth_user_id: 'b1ffcd88-8b1a-4fe7-aa5c-5aa8ac270b22',
    actor_business_user_id: 'usr-leader-002',
    actor_name: 'Trần Thị B',
    actor_role: 'leader',
    module: 'calendar',
    action: 'approve',
    entity_type: 'shift_registrations',
    entity_id: 'reg-801',
    entity_name: 'Đăng ký ca: Đặng Thu Thảo · Pharmaton D9',
    before: {
      status: 'pending',
      queue_position: 1,
      approved_at: null,
    },
    after: {
      status: 'approved',
      queue_position: 0,
      approved_at: '2026-09-25T10:15:30Z',
      approved_by: 'usr-leader-002',
    },
    changed_fields: ['status', 'queue_position', 'approved_at', 'approved_by'],
    reason: 'Phê duyệt đơn đăng ký ca sau khi đối soát khung giờ trống và chuyên môn sản phẩm',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-33445566-7788-99aa-bbcc-ddeeff001122',
    entity_exists: true,
    review_status: 'unreviewed',
    initials: 'TB',
  },

  // 5. Swap Audit Event
  {
    id: 'audit-swp-2026-0925-05',
    timestamp: '2026-09-25T09:40:15.600Z',
    actor_id: 'usr-admin-001',
    actor_auth_user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    actor_business_user_id: 'usr-admin-001',
    actor_name: 'Nguyễn Văn A',
    actor_role: 'admin',
    module: 'swaps',
    action: 'approve',
    entity_type: 'swap_requests',
    entity_id: 'swap-req-101',
    entity_name: 'Yêu cầu đổi ca #SWP-101 (Lê Văn C ⇄ Phạm Hoàng D)',
    before: {
      status: 'pending_peer',
      peer_response: null,
      admin_override: false,
    },
    after: {
      status: 'completed',
      peer_response: 'accepted',
      admin_override: true,
      completed_at: '2026-09-25T09:40:15Z',
    },
    changed_fields: ['status', 'peer_response', 'admin_override', 'completed_at'],
    reason: 'Quản trị viên phê chuẩn đổi ca khẩn cấp do nhân sự Host có việc đột xuất gia đình',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-9900aabb-ccdd-eeff-1122-334455667788',
    entity_exists: true,
    review_status: 'resolved',
    admin_note: 'Đã hoàn tất hoán đổi sổ cái ca trực tương ứng trên cả 2 lịch trình.',
    initials: 'NA',
  },

  // 6. Import Audit Event
  {
    id: 'audit-imp-2026-0925-06',
    timestamp: '2026-09-25T09:16:00.000Z',
    actor_id: 'usr-admin-001',
    actor_auth_user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    actor_business_user_id: 'usr-admin-001',
    actor_name: 'Nguyễn Văn A',
    actor_role: 'admin',
    module: 'imports',
    action: 'confirm',
    entity_type: 'schedule_import_batches',
    entity_id: 'IMP-2026-0925-01',
    entity_name: 'Lô nhập lich_livestream_tuan_39.xlsx',
    before: {
      status: 'previewed',
      imported_rows: null,
      confirmed_at: null,
    },
    after: {
      status: 'confirmed',
      total_rows: 140,
      valid_rows: 124,
      warning_rows: 8,
      imported_rows: 132,
      duplicate_rows: 5,
      failed_rows: 3,
      confirmed_at: '2026-09-25T09:16:00Z',
    },
    changed_fields: ['status', 'imported_rows', 'confirmed_at'],
    reason: 'Xác nhận tạo 132 ca làm việc (124 ca sạch + 8 ca cảnh báo) liên kết mã lô IMP-2026-0925-01',
    source: 'excel_import',
    status: 'success',
    correlation_id: 'req-imp-2026-0925-tx-001',
    entity_exists: true,
    review_status: 'reviewed',
    admin_note: 'Lô nhập thành công 132 ca trực tuần 39. 3 dòng lỗi schema được bảo lưu hồ sơ.',
    initials: 'NA',
  },

  // 7. Report Audit Event
  {
    id: 'audit-rep-2026-0925-07',
    timestamp: '2026-09-25T08:30:45.300Z',
    actor_id: 'usr-leader-002',
    actor_auth_user_id: 'b1ffcd88-8b1a-4fe7-aa5c-5aa8ac270b22',
    actor_business_user_id: 'usr-leader-002',
    actor_name: 'Trần Thị B',
    actor_role: 'leader',
    module: 'reports',
    action: 'confirm',
    entity_type: 'reports',
    entity_id: 'rep-2026-0924-d9',
    entity_name: 'Báo cáo ca phát sóng Pharmaton T9 D9',
    before: {
      status: 'draft',
      revenue_actual: 0,
      orders_count: 0,
      cas_version: 1,
      is_locked: false,
    },
    after: {
      status: 'confirmed',
      revenue_actual: 145000000,
      orders_count: 320,
      cas_version: 2,
      is_locked: true,
      confirmed_at: '2026-09-25T08:30:45Z',
    },
    changed_fields: ['status', 'revenue_actual', 'orders_count', 'cas_version', 'is_locked', 'confirmed_at'],
    reason: 'Khóa đối soát doanh thu thực tế và chỉ số OCR phiên live ca tối 24/09',
    source: 'ocr',
    status: 'success',
    correlation_id: 'req-ocr-rep-99887766-5544',
    entity_exists: true,
    review_status: 'reviewed',
    initials: 'TB',
  },

  // 8. Delete Mutation (Before-Only record)
  {
    id: 'audit-del-2026-0925-08',
    timestamp: '2026-09-25T07:15:20.100Z',
    actor_id: 'usr-admin-001',
    actor_auth_user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    actor_business_user_id: 'usr-admin-001',
    actor_name: 'Nguyễn Văn A',
    actor_role: 'admin',
    module: 'calendar',
    action: 'delete',
    entity_type: 'shifts',
    entity_id: 'shf-deleted-999',
    entity_name: 'Ca thử nghiệm hệ thống TikTok #999',
    before: {
      id: 'shf-deleted-999',
      date: '2026-09-24',
      start_time: '23:00',
      end_time: '01:00',
      brand_name: 'TestBrand',
      platform: 'TikTok',
      status: 'cancelled',
      created_by: 'usr-admin-001',
    },
    after: undefined,
    changed_fields: ['deleted_all_fields'],
    reason: 'Xóa hoàn toàn bản ghi ca trực rác tạo trong môi trường diễn tập',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-del-shf-11223344-5566',
    entity_exists: false,
    review_status: 'action_required',
    admin_note: 'Bản ghi vật lý đã xóa khỏi bảng shifts. Dấu vết kiểm toán được lưu vĩnh viễn trong audit_logs.',
    initials: 'NA',
  },

  // 9. Insert Mutation (After-Only record)
  {
    id: 'audit-ins-2026-0925-09',
    timestamp: '2026-09-25T06:50:00.000Z',
    actor_id: 'usr-leader-002',
    actor_auth_user_id: 'b1ffcd88-8b1a-4fe7-aa5c-5aa8ac270b22',
    actor_business_user_id: 'usr-leader-002',
    actor_name: 'Trần Thị B',
    actor_role: 'leader',
    module: 'campaigns',
    action: 'create',
    entity_type: 'campaigns',
    entity_id: 'cmp-oct-wellness-2026',
    entity_name: 'Chiến dịch Sức Khỏe Gia Đình T10/2026',
    before: undefined,
    after: {
      id: 'cmp-oct-wellness-2026',
      name: 'Chiến dịch Sức Khỏe Gia Đình T10/2026',
      brand_id: 'brd-pharmaton-01',
      start_date: '2026-10-01',
      end_date: '2026-10-15',
      target_revenue: 1200000000,
      status: 'active',
    },
    changed_fields: ['id', 'name', 'brand_id', 'start_date', 'end_date', 'target_revenue', 'status'],
    reason: 'Khởi tạo chiến dịch bán hàng trực tiếp đầu quý 4',
    source: 'manual',
    status: 'success',
    correlation_id: 'req-cmp-create-88990011',
    entity_exists: true,
    review_status: 'unreviewed',
    initials: 'TB',
  },

  // 10. Failed Operation Record
  {
    id: 'audit-err-2026-0925-10',
    timestamp: '2026-09-25T05:22:18.900Z',
    actor_id: 'usr-member-003',
    actor_auth_user_id: 'c2eedd77-7a09-4ed6-994b-49979b160c33',
    actor_business_user_id: 'usr-member-003',
    actor_name: 'Lê Văn C',
    actor_role: 'member',
    module: 'settings',
    action: 'update',
    entity_type: 'operational_settings',
    entity_id: 'setting-global-ops',
    entity_name: 'Cấu hình vận hành mặc định',
    before: undefined,
    after: undefined,
    changed_fields: [],
    reason: 'Thao tác bị chặn bởi Row Level Security: Thành viên không có quyền cập nhật cấu hình hệ thống',
    source: 'manual',
    status: 'failed',
    error_code: '42501_INSUFFICIENT_PRIVILEGE',
    correlation_id: 'req-sec-deny-44556677',
    entity_exists: true,
    review_status: 'action_required',
    admin_note: 'Phát hiện yêu cầu ghi không hợp lệ từ tài khoản Member; RLS guard đã bảo vệ thành công.',
    initials: 'LC',
  },
]

// ============================================================================
// STRESS TEST FIXTURES
// ============================================================================

export const LONG_JSON_EVENT: CanonicalAuditEvent = {
  id: 'audit-stress-long-json-01',
  timestamp: '2026-09-25T15:00:00.000Z',
  actor_id: 'usr-system-daemon',
  actor_auth_user_id: undefined,
  actor_business_user_id: undefined,
  actor_name: 'Hệ thống tự động (Automated Sync Daemon)',
  actor_role: 'admin',
  module: 'live',
  action: 'update',
  entity_type: 'live_sessions_telemetry',
  entity_id: 'live-telemetry-session-pharmaton-q3-heavy',
  entity_name: 'Bản ghi viễn trắc chi tiết phiên phát sóng TikTok Live Mega',
  before: {
    resolution_width: 1080,
    resolution_height: 1920,
    bitrate_kbps: 4500,
    fps: 30,
    audio_codec: 'aac',
    video_codec: 'h264',
    server_nodes: ['node-sg-01', 'node-sg-02', 'node-vn-edge-03'],
    peak_concurrent_viewers: 14200,
    engagement_breakdown: {
      likes: 1250000,
      comments: 48900,
      shares: 12300,
      clicks_to_cart: 8750,
      conversions: 412,
    },
    geo_distribution: [
      { province: 'Hà Nội', percent: 34.5, latency_ms: 12 },
      { province: 'TP. Hồ Chí Minh', percent: 42.1, latency_ms: 15 },
      { province: 'Đà Nẵng', percent: 11.2, latency_ms: 22 },
      { province: 'Khác', percent: 12.2, latency_ms: 35 },
    ],
    sku_realtime_velocity: Array.from({ length: 25 }, (_, i) => ({
      sku_code: `SKU-PHARM-2026-${String(i + 1).padStart(3, '0')}`,
      product_name: `Sản phẩm mẫu dược phẩm chăm sóc sức khỏe #${i + 1}`,
      units_sold_in_window: 10 + i * 3,
      gross_merchandise_value_vnd: (10 + i * 3) * 350000,
      inventory_remaining: 500 - (10 + i * 3),
      flash_deal_active: i % 2 === 0,
      discount_voucher_applied: `DISCOUNT_VOUCHER_CODE_V${i + 100}`,
      channel_commissions: { tiktok_take: 0.05, agency_take: 0.12, brand_net: 0.83 },
    })),
  },
  after: {
    resolution_width: 1080,
    resolution_height: 1920,
    bitrate_kbps: 6000,
    fps: 60,
    audio_codec: 'aac',
    video_codec: 'h265',
    server_nodes: ['node-sg-01', 'node-sg-02', 'node-vn-edge-03', 'node-vn-edge-04'],
    peak_concurrent_viewers: 18950,
    engagement_breakdown: {
      likes: 1890000,
      comments: 65400,
      shares: 19800,
      clicks_to_cart: 14200,
      conversions: 685,
    },
    geo_distribution: [
      { province: 'Hà Nội', percent: 36.2, latency_ms: 11 },
      { province: 'TP. Hồ Chí Minh', percent: 40.5, latency_ms: 14 },
      { province: 'Đà Nẵng', percent: 12.0, latency_ms: 20 },
      { province: 'Khác', percent: 11.3, latency_ms: 32 },
    ],
    sku_realtime_velocity: Array.from({ length: 25 }, (_, i) => ({
      sku_code: `SKU-PHARM-2026-${String(i + 1).padStart(3, '0')}`,
      product_name: `Sản phẩm mẫu dược phẩm chăm sóc sức khỏe #${i + 1}`,
      units_sold_in_window: 18 + i * 5,
      gross_merchandise_value_vnd: (18 + i * 5) * 350000,
      inventory_remaining: 500 - (18 + i * 5),
      flash_deal_active: true,
      discount_voucher_applied: `DISCOUNT_VOUCHER_CODE_V${i + 100}`,
      channel_commissions: { tiktok_take: 0.05, agency_take: 0.12, brand_net: 0.83 },
    })),
  },
  changed_fields: ['bitrate_kbps', 'fps', 'video_codec', 'server_nodes', 'peak_concurrent_viewers', 'engagement_breakdown', 'sku_realtime_velocity'],
  reason: 'Đồng bộ định kỳ gói telemetry hiệu năng và doanh số phiên live mega peak-hour',
  source: 'system',
  status: 'success',
  correlation_id: 'req-stress-deep-nested-telemetry-001',
  entity_exists: true,
  review_status: 'reviewed',
  admin_note: 'Tải JSON lớn 50+ thuộc tính lồng nhau được xử lý an toàn qua bộ khử nhạy cảm đệ quy.',
  initials: 'SY',
}

export const DENSE_HISTORY_EVENTS: CanonicalAuditEvent[] = Array.from({ length: 120 }, (_, index) => {
  const i = index + 1
  const actors = [
    { id: 'usr-admin-001', name: 'Nguyễn Văn A', role: 'admin' as SystemPermission, initials: 'NA' },
    { id: 'usr-leader-002', name: 'Trần Thị B', role: 'leader' as SystemPermission, initials: 'TB' },
    { id: 'usr-member-003', name: 'Lê Văn C', role: 'member' as SystemPermission, initials: 'LC' },
    { id: 'usr-member-004', name: 'Phạm Hoàng D', role: 'member' as SystemPermission, initials: 'PD' },
    { id: 'usr-system-daemon', name: 'Hệ thống tự động', role: 'admin' as SystemPermission, initials: 'SY' },
  ]
  const actor = actors[index % actors.length]
  const modules: AuditModule[] = ['calendar', 'live', 'reports', 'staff', 'brands', 'campaigns', 'swaps', 'imports', 'settings']
  const m = modules[index % modules.length]
  const acts: AuditAction[] = ['create', 'update', 'approve', 'confirm', 'assign', 'register', 'lock']
  const a = acts[index % acts.length]
  const status: 'success' | 'failed' = index % 17 === 0 ? 'failed' : 'success'

  return {
    id: `audit-dense-${String(i).padStart(4, '0')}`,
    timestamp: new Date(Date.parse('2026-09-25T15:00:00Z') - index * 90_000).toISOString(),
    actor_id: actor.id,
    actor_auth_user_id: actor.id === 'usr-system-daemon' ? undefined : `auth-${actor.id}`,
    actor_business_user_id: actor.id === 'usr-system-daemon' ? undefined : actor.id,
    actor_name: actor.name,
    actor_role: actor.role,
    module: m,
    action: a,
    entity_type: m === 'calendar' ? 'shifts' : m === 'reports' ? 'reports' : m === 'imports' ? 'schedule_import_batches' : 'business_users',
    entity_id: `ent-${m.slice(0, 3)}-${String(i).padStart(4, '0')}`,
    entity_name: `Bản ghi vận hành ${m} #${i}`,
    before: { status: 'pending', version: 1, sequence: i },
    after: { status: status === 'success' ? 'confirmed' : 'failed', version: 2, sequence: i },
    changed_fields: ['status', 'version'],
    reason: `Ghi nhận tự động giao dịch nguyên tử thứ ${i} trong chu kỳ vận hành`,
    source: i % 5 === 0 ? 'excel_import' : i % 7 === 0 ? 'ocr' : 'manual',
    status,
    correlation_id: `corr-tx-${String(Math.floor(i / 3)).padStart(3, '0')}`,
    entity_exists: true,
    review_status: 'unreviewed',
    initials: actor.initials,
  }
})

// ============================================================================
// MAIN AUDIT MOCK COMPONENT
// ============================================================================

export function AuditReferenceMock({ initialState = '01-main-workspace' }: { initialState?: AuditQaState }) {
  const searchParams = useSearchParams()
  const requestedParam = searchParams.get('state') || searchParams.get('qaState')
  const showQa = searchParams.get('qa') === '1'

  const [activeState, setActiveState] = useState<AuditQaState>(() => {
    if (requestedParam && AUDIT_STATES.some(item => item.id === requestedParam)) {
      return requestedParam as AuditQaState
    }
    return initialState
  })

  useEffect(() => {
    if (requestedParam && AUDIT_STATES.some(item => item.id === requestedParam)) {
      setActiveState(requestedParam as AuditQaState)
    }
  }, [requestedParam])

  const currentStateObj = useMemo(
    () => AUDIT_STATES.find(s => s.id === activeState) || AUDIT_STATES[0],
    [activeState]
  )

  // Selected event for inspector
  const [selectedEventId, setSelectedEventId] = useState<string>(() => {
    if (activeState === '13-settings-event') return 'audit-set-2026-0925-01'
    if (activeState === '14-shift-event') return 'audit-shf-2026-0925-02'
    if (activeState === '15-staffing-event') return 'audit-stf-2026-0925-03'
    if (activeState === '16-registration-event') return 'audit-reg-2026-0925-04'
    if (activeState === '17-swap-event') return 'audit-swp-2026-0925-05'
    if (activeState === '18-import-event') return 'audit-imp-2026-0925-06'
    if (activeState === '19-report-event') return 'audit-rep-2026-0925-07'
    if (activeState === '08-before-only') return 'audit-del-2026-0925-08'
    if (activeState === '09-after-only') return 'audit-ins-2026-0925-09'
    if (activeState === '30-long-json-stress') return 'audit-stress-long-json-01'
    return 'audit-set-2026-0925-01'
  })

  // Selected tab in detail inspector
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'diff' | 'before' | 'after' | 'table' | 'json' | 'history' | 'review'>(() => {
    if (activeState === '07-before-after-diff') return 'diff'
    if (activeState === '08-before-only') return 'before'
    if (activeState === '09-after-only') return 'after'
    if (activeState === '10-metadata-context') return 'overview'
    if (activeState === '11-raw-json' || activeState === '30-long-json-stress') return 'json'
    if (activeState === '12-structured-table') return 'table'
    if (activeState === '23-entity-history') return 'history'
    return 'overview'
  })

  // Update selection & tab when state changes
  useEffect(() => {
    if (activeState === '04-event-detail') {
      setSelectedEventId('audit-shf-2026-0925-02')
      setInspectorTab('overview')
    } else if (activeState === '05-actor-attribution') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('overview')
    } else if (activeState === '06-entity-provenance') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('overview')
    } else if (activeState === '10-metadata-context') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('overview')
    } else if (activeState === '12-structured-table') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('table')
    } else if (activeState === '13-settings-event') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('overview')
    } else if (activeState === '14-shift-event') {
      setSelectedEventId('audit-shf-2026-0925-02')
      setInspectorTab('overview')
    } else if (activeState === '15-staffing-event') {
      setSelectedEventId('audit-stf-2026-0925-03')
      setInspectorTab('overview')
    } else if (activeState === '16-registration-event') {
      setSelectedEventId('audit-reg-2026-0925-04')
      setInspectorTab('overview')
    } else if (activeState === '17-swap-event') {
      setSelectedEventId('audit-swp-2026-0925-05')
      setInspectorTab('overview')
    } else if (activeState === '18-import-event') {
      setSelectedEventId('audit-imp-2026-0925-06')
      setInspectorTab('overview')
    } else if (activeState === '19-report-event') {
      setSelectedEventId('audit-rep-2026-0925-07')
      setInspectorTab('overview')
    } else if (activeState === '07-before-after-diff') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('diff')
    } else if (activeState === '08-before-only') {
      setSelectedEventId('audit-del-2026-0925-08')
      setInspectorTab('before')
    } else if (activeState === '09-after-only') {
      setSelectedEventId('audit-ins-2026-0925-09')
      setInspectorTab('after')
    } else if (activeState === '11-raw-json') {
      setSelectedEventId('audit-set-2026-0925-01')
      setInspectorTab('json')
    } else if (activeState === '23-entity-history') {
      setSelectedEventId('audit-shf-2026-0925-02')
      setInspectorTab('history')
    } else if (activeState === '30-long-json-stress') {
      setSelectedEventId('audit-stress-long-json-01')
      setInspectorTab('json')
    }
  }, [activeState])

  const isInspectorOpen = useMemo(() => {
    return [
      '04-event-detail',
      '05-actor-attribution',
      '06-entity-provenance',
      '07-before-after-diff',
      '08-before-only',
      '09-after-only',
      '10-metadata-context',
      '11-raw-json',
      '12-structured-table',
      '13-settings-event',
      '14-shift-event',
      '15-staffing-event',
      '16-registration-event',
      '17-swap-event',
      '18-import-event',
      '19-report-event',
      '23-entity-history',
      '24-correlation-context',
      '30-long-json-stress',
    ].includes(activeState)
  }, [activeState])

  // Active filter state
  const isFiltered = activeState === '02-active-filters'
  const isSearchState = activeState === '03-search-result'
  const isDense = activeState === '31-dense-history-stress'

  const eventsList = useMemo(() => {
    if (activeState === '25-empty') return []
    if (activeState === '26-no-results') return []
    if (activeState === '30-long-json-stress') return [LONG_JSON_EVENT, ...CANONICAL_AUDIT_EVENTS]
    if (isDense) return DENSE_HISTORY_EVENTS
    if (isFiltered) {
      // Filtered to calendar & shifts, success
      return CANONICAL_AUDIT_EVENTS.filter(e => e.module === 'calendar' || e.module === 'staff')
    }
    if (isSearchState) {
      // Search for Pharmaton
      return CANONICAL_AUDIT_EVENTS.filter(e => e.entity_name.toLowerCase().includes('pharmaton'))
    }
    return CANONICAL_AUDIT_EVENTS
  }, [activeState, isDense, isFiltered, isSearchState])

  const selectedEvent = useMemo(() => {
    if (activeState === '30-long-json-stress') return LONG_JSON_EVENT
    const found = [...CANONICAL_AUDIT_EVENTS, ...DENSE_HISTORY_EVENTS, LONG_JSON_EVENT].find(e => e.id === selectedEventId)
    return found || CANONICAL_AUDIT_EVENTS[0]
  }, [activeState, selectedEventId])

  return (
    <div data-testid="audit-reference-mock" className="w-full">
      <AdminSystemReferenceShell active="Audit" searchPlaceholder="Tìm kiếm bản ghi, mã giao dịch (correlation_id), đối tượng...">
        <main lang="vi" translate="no" className="notranslate min-h-[calc(100vh-56px)] px-5 py-4 text-[12px] text-slate-800">

          {/* Top Operational State Banner - Rendered ONLY when qa=1 */}
          {showQa && (
            <div data-qa-controller className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                  QA STATE {currentStateObj.num}
                </span>
                <strong className="text-[12px] text-slate-800">{currentStateObj.label}</strong>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500 font-mono">[{activeState}]</code>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
                <span className="rounded bg-slate-50 border border-slate-200 px-1.5 py-0.5">
                  Bảng thẩm quyền: <strong className="font-mono text-slate-800">public.audit_logs</strong>
                </span>
                <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-emerald-800 font-medium">
                  Append-Only · Triggers Guarded
                </span>
                <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-blue-800 font-medium">
                  RLS: Admin 100% · Leader Scoped · Member Denied
                </span>
              </div>
            </div>
          )}

          {/* Quick QA State Switcher - Rendered ONLY when qa=1 */}
          {showQa && (
            <div data-qa-controller className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 shadow-inner">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wide">
                  Điều hướng nhanh Visual-QA States (Wave 12 · Audit Log · 31 States)
                </span>
                <span className="text-[9px] text-slate-500">31 trạng thái kiểm toán có thẩm quyền</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
                {AUDIT_STATES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveState(item.id)}
                    className={`truncate rounded px-2 py-1 text-left text-[9px] font-medium transition-colors ${
                      activeState === item.id
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-blue-50'
                    }`}
                  >
                    {item.num}. {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main Audit Workspace Header */}
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-bold tracking-tight text-slate-900">Nhật ký kiểm toán</h1>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  audit_logs
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  Append-Only
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Lưu vết kiểm toán bất biến theo thời gian thực (Database Trigger-Guarded). Toàn vẹn 100% dữ liệu trước/sau biến động và thẩm quyền tài khoản.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveState('21-immutable-append-only')}
                className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Nguyên tắc bảo vệ
              </button>
              <button
                type="button"
                onClick={() => setActiveState('20-permission-restriction')}
                className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <KeyRound className="h-3.5 w-3.5 text-blue-600" />
                Phân quyền RLS
              </button>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Xuất tệp kiểm toán
              </button>
            </div>
          </header>

          {/* Operational Attention & Architectural Invariants Banner */}
          <section className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">TỔNG SỐ SỰ KIỆN GHI NHẬN</span>
              <strong className="mt-0.5 block text-[18px] font-bold text-slate-900">
                {isDense ? '120 bản ghi' : '10 sự kiện chuẩn'}
              </strong>
              <span className="mt-0.5 block text-[9px] text-slate-500">Được chốt giao dịch tự động trong DB</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">THẨM QUYỀN GHI (MUTATION)</span>
              <strong className="mt-0.5 block text-[18px] font-bold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Trigger Bắt buộc
              </strong>
              <span className="mt-0.5 block text-[9px] text-slate-500">Ghi đồng thời trong cùng Transaction</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">CHỐNG GIẢ MẠO ACTOR</span>
              <strong className="mt-0.5 block text-[18px] font-bold text-blue-700 flex items-center gap-1.5">
                <Lock className="h-4 w-4" /> auth.uid() Session
              </strong>
              <span className="mt-0.5 block text-[9px] text-slate-500">Không cho phép client tự gửi Actor ID</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wide">CHÍNH SÁCH BẢO MẬT HÀNG (RLS)</span>
              <strong className="mt-0.5 block text-[18px] font-bold text-purple-700 flex items-center gap-1.5">
                <Eye className="h-4 w-4" /> Admin: 100% · Leader: Scoped
              </strong>
              <span className="mt-0.5 block text-[9px] text-slate-500">Member: 403 Forbidden (RLS Denied)</span>
            </div>
          </section>

          {/* Filter Bar */}
          <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[240px]">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    readOnly
                    value={isSearchState ? 'Pharmaton' : ''}
                    placeholder="Tìm theo đối tượng, ID, mã tương quan..."
                    className="h-8 w-full rounded border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>

                {/* Module selector */}
                <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-2 text-[10px] text-slate-700 gap-1.5">
                  <span className="text-slate-400">Module:</span>
                  <strong className="font-semibold text-slate-800">
                    {isFiltered ? 'calendar, staff' : 'Tất cả (10)'}
                  </strong>
                </div>

                {/* Action selector */}
                <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-2 text-[10px] text-slate-700 gap-1.5">
                  <span className="text-slate-400">Hành động:</span>
                  <strong className="font-semibold text-slate-800">
                    {isFiltered ? 'update, assign' : 'Tất cả (32)'}
                  </strong>
                </div>

                {/* Actor selector */}
                <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-2 text-[10px] text-slate-700 gap-1.5">
                  <span className="text-slate-400">Người thực hiện:</span>
                  <strong className="font-semibold text-slate-800">Tất cả</strong>
                </div>

                {/* Status selector */}
                <div className="flex h-8 items-center rounded border border-slate-200 bg-white px-2 text-[10px] text-slate-700 gap-1.5">
                  <span className="text-slate-400">Trạng thái:</span>
                  <strong className="font-semibold text-slate-800">
                    {isFiltered ? 'Thành công (success)' : 'Tất cả (success / failed)'}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(isFiltered || isSearchState) && (
                  <button
                    type="button"
                    onClick={() => setActiveState('01-main-workspace')}
                    className="flex h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-blue-700 hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" />
                    Xóa bộ lọc
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveState('28-refreshing')}
                  className="flex h-8 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  Làm mới
                </button>
              </div>
            </div>

            {/* Filter Active Pill Indicator */}
            {isFiltered && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px]">
                <span className="text-slate-500 font-medium">Bộ lọc đang bật:</span>
                <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-800 font-mono">module: calendar, staff</span>
                <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-800 font-mono">action: update, assign</span>
                <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-800 font-mono">status: success</span>
                <span className="text-slate-400 text-[9px] ml-1">(Khớp 2 sự kiện thỏa mãn)</span>
              </div>
            )}
            {isSearchState && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px]">
                <span className="text-slate-500 font-medium">Tìm kiếm từ khóa:</span>
                <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-800 font-mono">query: &quot;Pharmaton&quot;</span>
                <span className="text-slate-400 text-[9px] ml-1">(Khớp 2 sự kiện chứa nhãn hàng Pharmaton)</span>
              </div>
            )}
          </section>

          {/* Conditional Special Views: Permission Restriction, Immutability, Actor Spoof, Loading, Refreshing, Error, Empty */}
          {activeState === '20-permission-restriction' && (
            <div className="mt-3 space-y-3">
              <section className="rounded-lg border border-red-200 bg-red-50/70 p-4 shadow-2xs">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[13px] font-bold text-red-900">Quyền hạn tài khoản Thành viên (Member RLS Denied · 403 Forbidden)</h2>
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold font-mono text-red-800">RLS POLICY: BLOCKED</span>
                    </div>
                    <p className="mt-1 text-[10px] text-red-800 leading-relaxed max-w-3xl">
                      Chính sách bảo mật hàng (Row Level Security) trên bảng <code>public.audit_logs</code> nghiêm cấm tài khoản có <code>system_permission = &apos;member&apos;</code> truy vấn trực tiếp bản ghi kiểm toán toàn hệ thống. Mọi truy vấn từ vai trò Thành viên bị từ chối ở tầng database engine.
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
                <h3 className="text-[12px] font-bold text-slate-800">Ma trận thẩm quyền đọc Nhật ký kiểm toán (Audit Read Matrix)</h3>
                <div className="mt-2 overflow-hidden rounded border border-slate-100 text-[10px]">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                      <tr>
                        <th className="px-3 py-2">VAI TRÒ (SYSTEM_PERMISSION)</th>
                        <th className="px-3 py-2">PHẠM VI TRUY CẬP KIỂM TOÁN</th>
                        <th className="px-3 py-2">CHÍNH SÁCH RLS (MIGRATION RULE)</th>
                        <th className="px-3 py-2">TRẠNG THÁI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <tr>
                        <td className="px-3 py-2 font-bold text-slate-900">admin</td>
                        <td className="px-3 py-2 text-slate-700">Toàn quyền xem tất cả 10 modules</td>
                        <td className="px-3 py-2 text-slate-500">private.current_system_permission() = &apos;admin&apos;</td>
                        <td className="px-3 py-2"><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-bold">100% UNRESTRICTED</span></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-bold text-slate-900">leader</td>
                        <td className="px-3 py-2 text-slate-700">6 modules vận hành (calendar, live, reports, campaigns, swaps, imports)</td>
                        <td className="px-3 py-2 text-slate-500">module in (&apos;calendar&apos;,&apos;live&apos;,&apos;reports&apos;,&apos;campaigns&apos;,&apos;swaps&apos;,&apos;imports&apos;)</td>
                        <td className="px-3 py-2"><span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 font-bold">SCOPED MODULES</span></td>
                      </tr>
                      <tr className="bg-red-50/30">
                        <td className="px-3 py-2 font-bold text-red-900">member</td>
                        <td className="px-3 py-2 text-red-700">Không có quyền truy cập</td>
                        <td className="px-3 py-2 text-slate-500">Evaluates to FALSE; no select policy granted</td>
                        <td className="px-3 py-2"><span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-bold">DENIED (403)</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {activeState === '21-immutable-append-only' && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Lock className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-[13px] font-bold text-emerald-950">Cam kết Kiến trúc Bất biến & Chỉ thêm (Immutable & Append-Only Guarantees)</h2>
                  <p className="mt-1 text-[10px] text-emerald-900 leading-relaxed max-w-3xl">
                    Bảng <code>public.audit_logs</code> được thiết kế theo chuẩn pháp lý kiểm toán bất biến:
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[10px] text-emerald-800 list-disc list-inside">
                    <li><strong>Không có quyền UPDATE/DELETE:</strong> Database engine đã thu hồi quyền <code>REVOKE ALL ON public.audit_logs FROM anon, authenticated</code> và chỉ cấp quyền <code>GRANT SELECT</code>.</li>
                    <li><strong>Ghi nhận nguyên tử (Atomicity):</strong> Mọi sự kiện được ghi thông qua Trigger <code>private.capture_audit_row_change()</code> thực thi sau mỗi thay đổi bảng nghiệp vụ trong cùng giao dịch (transaction). Nếu thao tác kiểm toán thất bại, toàn bộ mutation nghiệp vụ sẽ roll back.</li>
                    <li><strong>Tách biệt đánh giá hành chính:</strong> Ghi chú duyệt của Admin được tách biệt hoàn toàn sang bảng đồng hành <code>public.audit_log_reviews</code> thông qua hàm <code>update_audit_review</code>, bảo toàn 100% bản ghi gốc không thể bị sửa đổi.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeState === '22-actor-spoof-protection' && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-[13px] font-bold text-blue-950">Cơ chế Chống giả mạo Danh tính Thực hiện (Actor Spoof Protection)</h2>
                  <p className="mt-1 text-[10px] text-blue-900 leading-relaxed max-w-3xl">
                    Khách hàng và tầng giao diện (Frontend) hoàn toàn không có khả năng tự chỉ định trường <code>actor_business_user_id</code> hoặc <code>actor_name</code>:
                  </p>
                  <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
                    <div className="rounded border border-blue-200 bg-white p-3">
                      <strong className="block text-blue-900 font-bold">1. Thẩm quyền xác thực (Session Anchor)</strong>
                      <span className="mt-1 block text-slate-600 leading-relaxed">
                        Hàm Trigger sử dụng trực tiếp <code>auth.uid()</code> từ JWT phiên Supabase và hàm <code>private.current_business_user_id()</code> để tra cứu hồ sơ người dùng trong <code>public.business_users</code>.
                      </span>
                    </div>
                    <div className="rounded border border-blue-200 bg-white p-3">
                      <strong className="block text-blue-900 font-bold">2. Chống ghi đè Actor từ Payload</strong>
                      <span className="mt-1 block text-slate-600 leading-relaxed">
                        Dù client gửi bất kỳ tham số nào trong body request, trigger luôn ghi đè danh tính người thực hiện dựa trên ngữ cảnh phiên có chữ ký số mã hóa của máy chủ.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System States: Empty, Loading, Refreshing, Error */}
          {activeState === '25-empty' && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-12 text-center shadow-2xs">
              <History className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-3 text-[14px] font-bold text-slate-800">Chưa có sự kiện kiểm toán nào được ghi nhận</h3>
              <p className="mt-1 text-[10px] text-slate-500 max-w-md mx-auto">
                Bảng <code>audit_logs</code> hiện chưa ghi nhận sự kiện biến động dữ liệu nào. Các thay đổi ca trực, báo cáo và phân quyền sẽ tự động hiển thị tại đây.
              </p>
            </div>
          )}

          {activeState === '26-no-results' && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-10 text-center shadow-2xs">
              <Search className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 text-[13px] font-bold text-slate-800">Không tìm thấy bản ghi kiểm toán phù hợp</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                Không có sự kiện nào khớp với điều kiện lọc hoặc từ khóa tìm kiếm hiện tại.
              </p>
              <button
                type="button"
                onClick={() => setActiveState('01-main-workspace')}
                className="mt-3 rounded border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-slate-50"
              >
                Xóa toàn bộ bộ lọc
              </button>
            </div>
          )}

          {activeState === '27-loading' && (
            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-12 text-center shadow-2xs">
              <RefreshCw className="mx-auto h-8 w-8 text-blue-600 animate-spin" />
              <h3 className="mt-3 text-[13px] font-bold text-slate-800">Đang tải lịch sử kiểm toán từ máy chủ</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                Đang đối soát quyền hạn RLS và kết nối luồng sự kiện audit_logs...
              </p>
            </div>
          )}

          {activeState === '28-refreshing' && (
            <div className="mt-2 mb-2 flex items-center justify-between rounded bg-blue-50/80 border border-blue-200 px-3 py-1.5 text-[10px] text-blue-800">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                Đang làm mới danh sách kiểm toán từ Supabase...
              </span>
              <span className="text-[9px] text-blue-600">Dữ liệu hiển thị phía dưới vẫn được giữ nguyên</span>
            </div>
          )}

          {activeState === '29-error' && (
            <div className="mt-6 rounded-lg border border-red-200 bg-white p-10 text-center shadow-2xs">
              <XCircle className="mx-auto h-10 w-10 text-red-600" />
              <h3 className="mt-3 text-[13px] font-bold text-slate-800">Không thể tải nhật ký kiểm toán</h3>
              <p className="mt-1 text-[10px] text-slate-500 font-mono">
                Mã lỗi: ERR_AUDIT_LOG_FETCH_FAILED. Lỗi kết nối RPC hoặc phiên đăng nhập đã hết hạn.
              </p>
              <button
                type="button"
                onClick={() => setActiveState('01-main-workspace')}
                className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700"
              >
                Thử kết nối lại
              </button>
            </div>
          )}

          {/* Main Table + Detail Split View */}
          {activeState !== '25-empty' && activeState !== '26-no-results' && activeState !== '27-loading' && activeState !== '29-error' && (
            <div className={`mt-3 grid gap-3 ${isInspectorOpen ? 'grid-cols-1 lg:grid-cols-[1fr_480px]' : 'grid-cols-1'}`}>

              {/* Event Table Section */}
              <section className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden flex flex-col">
                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <strong className="text-[11px] font-bold text-slate-800">Danh sách sự kiện kiểm toán</strong>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-mono text-slate-700">
                      {eventsList.length} sự kiện
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Sắp xếp: Mới nhất trước</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="border-b border-slate-200 bg-slate-50/50 text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                      <tr>
                        <th className="px-3 py-2">Thời gian</th>
                        <th className="px-3 py-2">Người thực hiện</th>
                        <th className="px-3 py-2">Module & Hành động</th>
                        <th className="px-3 py-2">Đối tượng (Entity)</th>
                        <th className="px-3 py-2">Trạng thái & Nguồn</th>
                        <th className="px-3 py-2">Mã tương quan (Correlation)</th>
                        <th className="px-3 py-2 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[10px]">
                      {eventsList.map(entry => {
                        const isSelected = entry.id === selectedEvent.id
                        return (
                          <tr
                            key={entry.id}
                            onClick={() => {
                              setSelectedEventId(entry.id)
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50/80 font-medium' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* Time */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-mono text-slate-700 block font-semibold">
                                {entry.timestamp.slice(11, 19)}
                              </span>
                              <span className="text-[9px] text-slate-400 font-mono">
                                {entry.timestamp.slice(0, 10)}
                              </span>
                            </td>

                            {/* Actor */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-700 border border-slate-200 font-mono">
                                  {entry.initials}
                                </span>
                                <div className="min-w-0">
                                  <strong className="block truncate text-[10px] text-slate-800">{entry.actor_name}</strong>
                                  <span className="block text-[8px] text-slate-400 font-mono capitalize">
                                    {entry.actor_role} · {entry.actor_id}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Module & Action */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold font-mono ${
                                  entry.module === 'settings' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                  entry.module === 'calendar' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                  entry.module === 'reports' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                  entry.module === 'imports' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                                  entry.module === 'swaps' ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' :
                                  'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                  {entry.module}
                                </span>
                                <span className="font-mono text-slate-600 font-semibold">{entry.action}</span>
                              </div>
                            </td>

                            {/* Entity */}
                            <td className="px-3 py-2 max-w-[180px]">
                              <strong className="block truncate text-[10px] text-slate-900" title={entry.entity_name}>
                                {entry.entity_name}
                              </strong>
                              <span className="block truncate text-[8px] font-mono text-slate-400">
                                {entry.entity_type} · {entry.entity_id}
                              </span>
                            </td>

                            {/* Status & Source */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase font-mono ${
                                  entry.status === 'success'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  {entry.status === 'success' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                                  {entry.status}
                                </span>
                                <span className="rounded bg-slate-50 border border-slate-200 px-1 py-0.5 text-[8px] text-slate-500 font-mono">
                                  {entry.source}
                                </span>
                              </div>
                            </td>

                            {/* Correlation ID */}
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-mono text-[9px] text-slate-500" title={entry.correlation_id}>
                                {entry.correlation_id.slice(0, 16)}...
                              </span>
                            </td>

                            {/* Detail CTA */}
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedEventId(entry.id)
                                }}
                                className="rounded border border-slate-200 bg-white px-2 py-1 text-[9px] font-medium text-slate-700 hover:bg-slate-100 shadow-2xs"
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Hiển thị {eventsList.length} sự kiện trên tổng số {eventsList.length}</span>
                  <div className="flex gap-1 font-mono text-[9px]">
                    <span className="rounded bg-blue-600 px-2 py-0.5 text-white font-bold">Trang 1</span>
                  </div>
                </div>
              </section>

              {/* Event Detail Slide-Over Inspector */}
              {isInspectorOpen && (
                <aside className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden flex flex-col max-h-[820px]">
                  {/* Inspector Header */}
                  <header className="border-b border-slate-100 bg-slate-50 px-4 py-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[8px] font-bold font-mono text-white">
                          EVENT ID
                        </span>
                        <code className="text-[10px] font-mono text-slate-700">{selectedEvent.id}</code>
                      </div>
                      <h2 className="mt-1 text-[13px] font-bold text-slate-900 leading-tight">
                        {selectedEvent.entity_name}
                      </h2>
                      <span className="mt-0.5 block text-[9px] text-slate-400 font-mono">
                        {selectedEvent.timestamp} · {selectedEvent.module} · {selectedEvent.action}
                      </span>
                    </div>
                  </header>

                  {/* Inspector Tabs */}
                  <div className="flex border-b border-slate-100 bg-white px-2 text-[10px] overflow-x-auto">
                    {[
                      { id: 'overview', label: 'Tổng quan' },
                      { id: 'diff', label: 'So sánh (Diff)' },
                      { id: 'before', label: 'Before' },
                      { id: 'after', label: 'After' },
                      { id: 'table', label: 'Bảng thuộc tính' },
                      { id: 'json', label: 'Raw JSON' },
                      { id: 'history', label: 'Lịch sử thực thể' },
                      { id: 'review', label: 'Đánh giá Admin' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setInspectorTab(tab.id as typeof inspectorTab)}
                        className={`px-3 py-2 font-medium border-b-2 whitespace-nowrap transition-colors ${
                          inspectorTab === tab.id
                            ? 'border-blue-600 text-blue-700 font-bold'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Inspector Content Region */}
                  <div className="p-4 overflow-y-auto space-y-3.5 flex-1">

                    {/* TAB: OVERVIEW */}
                    {inspectorTab === 'overview' && (
                      <div className="space-y-3">
                        {/* State 05: Actor Attribution Focus */}
                        {activeState === '05-actor-attribution' && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3.5 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold">✓</span>
                                <strong className="text-[11px] font-bold text-indigo-950">XÁC THỰC DANH TÍNH VÀ THẨM QUYỀN (ACTOR PROVENANCE)</strong>
                              </div>
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-indigo-800">SPOOF_GUARD_ACTIVE</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] bg-white p-2.5 rounded border border-indigo-100">
                              <div>
                                <span className="text-slate-400 block text-[9px]">Supabase Auth JWT (Session):</span>
                                <code className="text-indigo-900 font-mono text-[9px] font-bold">{selectedEvent.actor_auth_user_id || 'System Daemon'}</code>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px]">Thực thể Business User:</span>
                                <code className="text-indigo-900 font-mono text-[9px] font-bold">{selectedEvent.actor_business_user_id || 'null'} (public.business_users)</code>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px]">Vai trò thẩm quyền (Permission):</span>
                                <span className="text-indigo-900 font-bold capitalize">{selectedEvent.actor_role}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px]">Bảo vệ chống mạo danh:</span>
                                <span className="text-emerald-700 font-bold">100% Khóa bởi Database Trigger</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* State 06: Entity Provenance Focus */}
                        {activeState === '06-entity-provenance' && (
                          <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-3.5 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white text-[10px] font-bold">☍</span>
                                <strong className="text-[11px] font-bold text-sky-950">PHẢ HỆ VÀ NGUỒN GỐC THỰC THỂ (ENTITY PROVENANCE TREE)</strong>
                              </div>
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-800">entity_exists: true</span>
                            </div>
                            <div className="text-[10px] bg-white p-2.5 rounded border border-sky-100 space-y-1.5">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                <span className="text-slate-500 font-medium">Thực thể hiện tại:</span>
                                <code className="font-mono text-slate-800 font-bold">{selectedEvent.entity_type} · {selectedEvent.entity_id}</code>
                              </div>
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                <span className="text-slate-500 font-medium">Nguồn khởi tạo (Origin):</span>
                                <span className="text-sky-800 font-mono">Bản ghi hệ thống gốc (Initial System Provisioning)</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500 font-medium">Liên kết nghiệp vụ phụ thuộc:</span>
                                <span className="text-slate-700 font-medium">9 ca làm việc kế thừa hạn ngạch · 12 lượt đăng ký</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* State 10: Metadata Context Focus */}
                        {activeState === '10-metadata-context' && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">ℹ</span>
                                <strong className="text-[11px] font-bold text-amber-950">NGỮ CẢNH GIAO DỊCH & METADATA PHÂN HỆ</strong>
                              </div>
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-800">RECURSIVE_SANITIZED</span>
                            </div>
                            <div className="text-[10px] bg-white p-2.5 rounded border border-amber-100 space-y-1.5">
                              <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-1">
                                <div>
                                  <span className="text-slate-400 block text-[9px]">Mã tương quan (correlation_id):</span>
                                  <code className="text-slate-800 font-mono text-[9px] font-bold">{selectedEvent.correlation_id || 'corr-tx-20260925-001'}</code>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[9px]">Nguồn phát sinh (source):</span>
                                  <span className="text-slate-800 font-bold capitalize">{selectedEvent.source || 'web_app'}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px]">Lý do thực hiện nghiệp vụ (reason):</span>
                                <span className="text-slate-700 italic font-medium">{selectedEvent.reason}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* State 13: Settings Event Isolated Domain Banner */}
                        {activeState === '13-settings-event' && (
                          <div className="rounded-lg border border-purple-200 bg-purple-50/80 p-3 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-white text-[10px] font-bold">⚙</span>
                              <strong className="text-[11px] font-bold text-purple-950">KIỂM TOÁN CẤU HÌNH HỆ THỐNG (SETTINGS) — PAYLOAD CÔ LẬP 100%</strong>
                            </div>
                            <p className="mt-1 text-[10px] text-purple-900 leading-relaxed">
                              Sự kiện thuộc bảng <code>system_settings</code>, không có rò rỉ dữ liệu từ phân hệ Ca làm việc hay Nhân sự. Mọi thay đổi đều được ghi vết trước/sau chuẩn xác.
                            </p>
                          </div>
                        )}

                        {/* State 24: Correlation / Transaction Context Focus */}
                        {activeState === '24-correlation-context' && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3.5 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">⇌</span>
                                <strong className="text-[11px] font-bold text-emerald-950">GIAO DỊCH NGUYÊN TỬ TƯƠNG QUAN (ATOMIC TRANSACTION COUPLING)</strong>
                              </div>
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-800">3 SỰ KIỆN LIÊN KẾT</span>
                            </div>
                            <div className="text-[10px] bg-white p-2.5 rounded border border-emerald-100 space-y-2">
                              <p className="text-slate-600 leading-relaxed">
                                Các bản ghi kiểm toán dưới đây cùng chia sẻ mã tương quan <code className="font-bold text-emerald-800">corr-tx-20260925-001</code> và được cam kết đồng thời trong transaction đơn:
                              </p>
                              <div className="space-y-1 font-mono text-[9px]">
                                <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
                                  <span>1. shifts :: update (SHF-2026-0925-01)</span>
                                  <span className="text-emerald-700 font-bold">COMMITTED</span>
                                </div>
                                <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
                                  <span>2. shift_registrations :: assign (STF-2026-0925-03)</span>
                                  <span className="text-emerald-700 font-bold">COMMITTED</span>
                                </div>
                                <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
                                  <span>3. shift_registrations :: approve (REG-2026-0925-04)</span>
                                  <span className="text-emerald-700 font-bold">COMMITTED</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Status & Timing Banner */}
                        <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/70 p-2.5 text-[10px]">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">KẾT QUẢ GIAO DỊCH</span>
                            <strong className={`mt-0.5 block text-[11px] font-bold ${
                              selectedEvent.status === 'success' ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {selectedEvent.status === 'success' ? 'THÀNH CÔNG (SUCCESS)' : 'THẤT BẠI (FAILED)'}
                            </strong>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[9px] uppercase font-bold">THỜI GIAN GHI NHẬN</span>
                            <span className="font-mono text-[10px] text-slate-700">{selectedEvent.timestamp}</span>
                          </div>
                        </div>

                        {/* Actor Attribution Panel */}
                        <div className="rounded-md border border-slate-100 bg-white p-3 space-y-2 text-[10px]">
                          <strong className="block text-[10px] font-bold text-slate-800 uppercase tracking-wide">
                            Thẩm quyền & Danh tính người thực hiện (Actor Attribution)
                          </strong>
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                            <div>
                              <span className="text-slate-400 text-[9px] block">Họ và tên:</span>
                              <strong className="text-slate-800">{selectedEvent.actor_name}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">Vai trò hệ thống:</span>
                              <span className="font-mono text-blue-700 font-bold capitalize">{selectedEvent.actor_role}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">Business User ID:</span>
                              <code className="text-slate-600 font-mono text-[9px]">{selectedEvent.actor_business_user_id || 'null (system)'}</code>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">Auth UUID (Session):</span>
                              <code className="text-slate-600 font-mono text-[8px] truncate block" title={selectedEvent.actor_auth_user_id || 'System Daemon'}>
                                {selectedEvent.actor_auth_user_id ? `${selectedEvent.actor_auth_user_id.slice(0, 16)}...` : 'System Daemon'}
                              </code>
                            </div>
                          </div>
                        </div>

                        {/* Target Entity Provenance */}
                        <div className="rounded-md border border-slate-100 bg-white p-3 space-y-2 text-[10px]">
                          <strong className="block text-[10px] font-bold text-slate-800 uppercase tracking-wide">
                            Thực thể bị tác động (Target Entity)
                          </strong>
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                            <div>
                              <span className="text-slate-400 text-[9px] block">Loại thực thể (Table):</span>
                              <code className="font-mono font-bold text-slate-800">{selectedEvent.entity_type}</code>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">Mã thực thể (Entity ID):</span>
                              <code className="font-mono text-slate-700">{selectedEvent.entity_id}</code>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 text-[9px] block">Tên hiển thị:</span>
                              <strong className="text-slate-800">{selectedEvent.entity_name}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Context & Correlation */}
                        <div className="rounded-md border border-slate-100 bg-white p-3 space-y-2 text-[10px]">
                          <strong className="block text-[10px] font-bold text-slate-800 uppercase tracking-wide">
                            Ngữ cảnh giao dịch (Transaction Context)
                          </strong>
                          <div className="space-y-1.5 pt-1 border-t border-slate-50">
                            <div>
                              <span className="text-slate-400 text-[9px] block">Correlation ID:</span>
                              <code className="font-mono text-purple-700 font-bold text-[9px]">{selectedEvent.correlation_id}</code>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[9px] block">Nguồn phát sinh (source):</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-700">{selectedEvent.source}</span>
                            </div>
                            {selectedEvent.reason && (
                              <div>
                                <span className="text-slate-400 text-[9px] block">Lý do thay đổi:</span>
                                <p className="text-slate-700 text-[10px] leading-relaxed bg-slate-50 p-2 rounded border border-slate-100">
                                  {selectedEvent.reason}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: DIFF */}
                    {inspectorTab === 'diff' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>Các trường thay đổi (changed_fields):</span>
                          <span className="font-mono text-blue-700 font-bold">
                            {selectedEvent.changed_fields?.length || 0} trường
                          </span>
                        </div>

                        {/* Changed Fields Diff Grid */}
                        <div className="space-y-2">
                          {selectedEvent.changed_fields && selectedEvent.changed_fields.length > 0 ? (
                            selectedEvent.changed_fields.map(field => {
                              const beforeVal = selectedEvent.before ? (selectedEvent.before as Record<string, unknown>)[field] : undefined
                              const afterVal = selectedEvent.after ? (selectedEvent.after as Record<string, unknown>)[field] : undefined
                              return (
                                <div key={field} className="rounded border border-slate-200 bg-slate-50/50 p-2 text-[10px]">
                                  <span className="font-mono font-bold text-slate-800 block mb-1">{field}</span>
                                  <div className="grid grid-cols-[1fr_16px_1fr] items-center gap-1.5 font-mono text-[9px]">
                                    <div className="rounded bg-red-50 border border-red-100 p-1.5 text-red-800 truncate" title={String(beforeVal)}>
                                      <span className="text-[8px] text-red-500 uppercase block font-sans">Before</span>
                                      {beforeVal !== undefined ? JSON.stringify(beforeVal) : '<null>'}
                                    </div>
                                    <ArrowRight className="h-3 w-3 text-slate-400 mx-auto" />
                                    <div className="rounded bg-emerald-50 border border-emerald-100 p-1.5 text-emerald-800 truncate" title={String(afterVal)}>
                                      <span className="text-[8px] text-emerald-500 uppercase block font-sans">After</span>
                                      {afterVal !== undefined ? JSON.stringify(afterVal) : '<null>'}
                                    </div>
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <div className="rounded bg-slate-50 p-4 text-center text-slate-400 text-[10px]">
                              Không có trường nào bị sửa đổi giá trị
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB: BEFORE ONLY */}
                    {inspectorTab === 'before' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <strong className="text-slate-800">Trạng thái trước biến động (before_data)</strong>
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[9px] text-red-700 font-mono">
                            {selectedEvent.before ? 'ĐÃ LƯU VẾT' : 'NULL (INSERT SỰ KIỆN)'}
                          </span>
                        </div>
                        {selectedEvent.before ? (
                          <pre className="rounded border border-slate-200 bg-slate-900 p-3 font-mono text-[9px] text-red-300 overflow-x-auto">
                            {JSON.stringify(selectedEvent.before, null, 2)}
                          </pre>
                        ) : (
                          <div className="rounded border border-dashed border-slate-200 p-6 text-center text-slate-400 text-[10px]">
                            Thao tác INSERT: Chưa có dữ liệu trước khi tạo mới.
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: AFTER ONLY */}
                    {inspectorTab === 'after' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <strong className="text-slate-800">Trạng thái sau biến động (after_data)</strong>
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700 font-mono">
                            {selectedEvent.after ? 'ĐÃ LƯU VẾT' : 'NULL (DELETE SỰ KIỆN)'}
                          </span>
                        </div>
                        {selectedEvent.after ? (
                          <pre className="rounded border border-slate-200 bg-slate-900 p-3 font-mono text-[9px] text-emerald-300 overflow-x-auto">
                            {JSON.stringify(selectedEvent.after, null, 2)}
                          </pre>
                        ) : (
                          <div className="rounded border border-dashed border-slate-200 p-6 text-center text-slate-400 text-[10px]">
                            Thao tác DELETE: Bản ghi đã bị xóa khỏi hệ thống.
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: STRUCTURED PROPERTY TABLE */}
                    {inspectorTab === 'table' && (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                          <header className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-800 flex items-center justify-between">
                            <span>Bảng So Sánh Thuộc Tính Cấu Trúc</span>
                            <span className="text-[9px] font-normal text-slate-500 font-mono">Entity: {selectedEvent.entity_type}</span>
                          </header>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[10px] border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-100/60 font-semibold text-slate-600">
                                  <th className="px-3 py-2">Thuộc tính (Property)</th>
                                  <th className="px-3 py-2">Trước thay đổi (Old)</th>
                                  <th className="px-3 py-2">Sau thay đổi (New)</th>
                                  <th className="px-3 py-2 text-right">Trạng thái</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {Array.from(new Set([
                                  ...Object.keys(selectedEvent.before || {}),
                                  ...Object.keys(selectedEvent.after || {}),
                                ])).map((key) => {
                                  const bVal = selectedEvent.before ? (selectedEvent.before as Record<string, unknown>)[key] : undefined;
                                  const aVal = selectedEvent.after ? (selectedEvent.after as Record<string, unknown>)[key] : undefined;
                                  const isAdded = bVal === undefined && aVal !== undefined;
                                  const isRemoved = bVal !== undefined && aVal === undefined;
                                  const isChanged = bVal !== undefined && aVal !== undefined && JSON.stringify(bVal) !== JSON.stringify(aVal);

                                  return (
                                    <tr key={key} className={isChanged ? 'bg-amber-50/40' : isAdded ? 'bg-emerald-50/40' : isRemoved ? 'bg-red-50/40' : 'bg-white'}>
                                      <td className="px-3 py-2 font-mono font-medium text-slate-800">{key}</td>
                                      <td className="px-3 py-2 font-mono text-slate-600">
                                        {bVal !== undefined ? (typeof bVal === 'object' ? JSON.stringify(bVal) : String(bVal)) : <span className="text-slate-400 italic">null</span>}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-slate-900 font-semibold">
                                        {aVal !== undefined ? (typeof aVal === 'object' ? JSON.stringify(aVal) : String(aVal)) : <span className="text-slate-400 italic">null</span>}
                                      </td>
                                      <td className="px-3 py-2 text-right whitespace-nowrap">
                                        {isChanged && <span className="rounded bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 text-[9px]">SỬA ĐỔI</span>}
                                        {isAdded && <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 text-[9px]">THÊM MỚI</span>}
                                        {isRemoved && <span className="rounded bg-red-100 text-red-800 font-bold px-1.5 py-0.5 text-[9px]">ĐÃ XÓA</span>}
                                        {!isChanged && !isAdded && !isRemoved && <span className="text-slate-400 text-[9px]">Không đổi</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: RAW JSON */}
                    {inspectorTab === 'json' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <strong className="text-slate-800">Bản ghi JSONB đầy đủ (Sanitized Audit Payload)</strong>
                          <span className="text-[9px] text-slate-400">Đã tự động loại bỏ mật khẩu & bí mật</span>
                        </div>
                        <pre className="rounded border border-slate-200 bg-slate-950 p-3.5 font-mono text-[9px] leading-relaxed text-emerald-400 overflow-x-auto max-h-[500px]">
                          {JSON.stringify(selectedEvent, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* TAB: ENTITY HISTORY */}
                    {inspectorTab === 'history' && (
                      <div className="space-y-2">
                        <div className="text-[10px] text-slate-500 mb-2">
                          Lịch sử vòng đời đối tượng: <strong className="text-slate-800 font-mono">{selectedEvent.entity_id}</strong>
                        </div>
                        <div className="relative border-l border-slate-200 ml-2 space-y-4 pl-3.5 text-[10px]">
                          <div className="relative">
                            <span className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
                            <span className="text-[9px] text-slate-400 font-mono block">25/09/2026 13:45</span>
                            <strong className="text-slate-900 block">Cập nhật khung giờ & bổ sung Host</strong>
                            <span className="text-slate-500 text-[9px]">Bởi: Trần Thị B (leader)</span>
                          </div>
                          <div className="relative">
                            <span className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400 ring-2 ring-white" />
                            <span className="text-[9px] text-slate-400 font-mono block">25/09/2026 10:15</span>
                            <strong className="text-slate-900 block">Duyệt đăng ký nhân sự Host Đặng Thu Thảo</strong>
                            <span className="text-slate-500 text-[9px]">Bởi: Trần Thị B (leader)</span>
                          </div>
                          <div className="relative">
                            <span className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-600 ring-2 ring-white" />
                            <span className="text-[9px] text-slate-400 font-mono block">25/09/2026 09:16</span>
                            <strong className="text-slate-900 block">Tạo mới từ lô nhập Excel lich_livestream_tuan_39.xlsx</strong>
                            <span className="text-slate-500 text-[9px]">Bởi: Nguyễn Văn A (admin)</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: ADMIN REVIEW */}
                    {inspectorTab === 'review' && (
                      <div className="space-y-3 text-[10px]">
                        <div className="rounded border border-slate-200 bg-slate-50/70 p-3">
                          <strong className="block text-[11px] font-bold text-slate-800">
                            Bảng kiểm tra hành chính (public.audit_log_reviews)
                          </strong>
                          <p className="mt-1 text-slate-500 text-[9px] leading-relaxed">
                            Bảng review riêng biệt cho phép Quản trị viên ghi chú xử lý nghiệp vụ mà không làm thay đổi bản ghi bất biến <code>audit_logs</code> gốc.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <span className="text-slate-500 block text-[9px] font-bold uppercase">Trạng thái rà soát:</span>
                            <div className="mt-1 flex gap-2">
                              {(['unreviewed', 'reviewed', 'action_required', 'resolved'] as const).map(st => (
                                <span
                                  key={st}
                                  className={`rounded px-2 py-1 text-[9px] font-mono font-bold capitalize border ${
                                    selectedEvent.review_status === st
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {st}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px] font-bold uppercase">Ghi chú Quản trị viên (admin_note):</span>
                            <div className="mt-1 rounded border border-slate-200 bg-white p-2.5 text-slate-800 text-[10px] leading-relaxed">
                              {selectedEvent.admin_note || 'Chưa có ghi chú kiểm toán hành chính.'}
                            </div>
                          </div>
                          {selectedEvent.handling_reason && (
                            <div>
                              <span className="text-slate-500 block text-[9px] font-bold uppercase">Lý do giải trình (handling_reason):</span>
                              <div className="mt-1 rounded border border-slate-200 bg-slate-50 p-2 text-slate-700 text-[10px]">
                                {selectedEvent.handling_reason}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Inspector Footer */}
                  <footer className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 flex items-center justify-between text-[10px]">
                    <span className="font-mono text-slate-500 text-[9px]">
                      Module: <strong className="text-slate-800">{selectedEvent.module}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectorTab('overview')}
                      className="text-blue-600 hover:text-blue-800 font-semibold text-[10px]"
                    >
                      Đầu trang
                    </button>
                  </footer>
                </aside>
              )}
            </div>
          )}

        </main>
      </AdminSystemReferenceShell>
    </div>
  )
}
