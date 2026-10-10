'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
  X,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldCheck,
  Users,
  UserCheck,
  FileText,
  BarChart3,
  RefreshCw,
  Search,
  Sparkles,
  ArrowRight,
  Database,
  Eye,
  CheckCircle2,
  XCircle,
  WifiOff,
  Inbox
} from 'lucide-react'
import { OpsWorkflowReferenceShell } from './OpsWorkflowReferenceShell'
import type { AppNotification, NotificationType, NotificationSeverity } from '@/lib/types/database.types'

export type NotificationQaStateId =
  | '01-notifications-main'
  | '02-unread-filter'
  | '03-read-filter'
  | '04-notification-detail'
  | '05-swap-provenance'
  | '06-registration-provenance'
  | '07-report-provenance'
  | '08-shift-staffing-provenance'
  | '09-actionable-notification'
  | '10-read-notification'
  | '11-mark-as-read-preview'
  | '12-mark-all-read-preview'
  | '13-stale-source-state'
  | '14-source-unavailable'
  | '15-notification-history'
  | '16-notification-settings'
  | '17-independent-toast'
  | '18-unread-toast'
  | '19-read-toast'
  | '20-recipient-isolation'
  | '21-member-view'
  | '22-leader-view'
  | '23-no-action-terminal'
  | '24-empty-inbox'
  | '25-no-results'
  | '26-loading'
  | '27-refreshing'
  | '28-retrieval-error'
  | '29-mark-read-error'
  | '30-offline-stale'
  | '31-long-content-stress'
  | '32-dense-notification-list'
  | '33-success-feedback'
  | '34-generic-error-feedback'

export interface ExtendedNotificationItem extends AppNotification {
  source_title?: string
  source_status?: string
  actor_name?: string
  predicted_urgency_score?: number // [NEW_ONLY_UNBACKED]
  smart_group?: 'Hôm nay' | 'Hôm qua' | 'Trước đó' // [NEW_ONLY_UNBACKED]
}

export const CANONICAL_NOTIFICATIONS: ExtendedNotificationItem[] = [
  {
    id: 'notif-101',
    type: 'swap_request',
    title: 'Yêu cầu đổi ca mới',
    message: 'Nguyễn Văn Bình (usr-01) đã gửi yêu cầu thay thế ca cho ca Pharmaton - TikTok Live Mega Day ngày 12/09/2026.',
    severity: 'info',
    user_id: 'usr-03',
    related_entity_type: 'swap_request',
    related_entity_id: 'SWP-101',
    action_url: '/swaps',
    event_key: 'swap_request:SWP-101:usr-03',
    read_at: null,
    created_at: '2026-09-08T08:35:00Z',
    source_title: 'Pharmaton - TikTok Live Mega Day (12/09 14:00)',
    source_status: 'pending',
    actor_name: 'Nguyễn Văn Bình',
    predicted_urgency_score: 88,
    smart_group: 'Hôm nay'
  },
  {
    id: 'notif-102',
    type: 'registration_submitted',
    title: 'Đăng ký ca mới cần duyệt',
    message: 'Trần Minh Anh (usr-02) đã đăng ký vị trí Host cho ca Corbiere - Shopee Live vào ngày 15/09/2026.',
    severity: 'warning',
    user_id: 'usr-lead-01',
    related_entity_type: 'shift_registration',
    related_entity_id: 'REG-103',
    action_url: '/calendar',
    event_key: 'registration_submitted:REG-103:usr-lead-01',
    read_at: null,
    created_at: '2026-09-08T09:10:00Z',
    source_title: 'Corbiere - Shopee Live (15/09 18:00)',
    source_status: 'pending',
    actor_name: 'Trần Minh Anh',
    predicted_urgency_score: 75,
    smart_group: 'Hôm nay'
  },
  {
    id: 'notif-103',
    type: 'swap_approved',
    title: 'Yêu cầu đổi ca đã được phê duyệt',
    message: 'Yêu cầu đổi chéo ca Shopee Super Brand Day (SWP-102) giữa Đỗ Phương Thảo và Phạm Ngọc Lan đã được phê duyệt hoàn tất.',
    severity: 'success',
    user_id: 'usr-04',
    related_entity_type: 'swap_request',
    related_entity_id: 'SWP-102',
    action_url: '/swaps',
    event_key: 'swap_approved:SWP-102:usr-04:completed',
    read_at: '2026-09-09T10:15:00Z',
    created_at: '2026-09-09T09:45:00Z',
    source_title: "Shopee Super Brand Day - L'Oreal",
    source_status: 'completed',
    actor_name: 'Trần Thị Mai (Leader)',
    predicted_urgency_score: 40,
    smart_group: 'Hôm qua'
  },
  {
    id: 'notif-104',
    type: 'report_submitted',
    title: 'Báo cáo ca livestream đã nộp',
    message: 'Báo cáo doanh thu ca Unilever TikTok Live (REP-101) đã được gửi và đang chờ Leader rà soát duyệt số liệu.',
    severity: 'info',
    user_id: 'usr-lead-01',
    related_entity_type: 'report',
    related_entity_id: 'REP-101',
    action_url: '/reports',
    event_key: 'report_submitted:REP-101:usr-lead-01',
    read_at: null,
    created_at: '2026-09-09T16:20:00Z',
    source_title: 'Báo cáo ca Unilever TikTok Live',
    source_status: 'in_review',
    actor_name: 'Nguyễn Văn Bình',
    predicted_urgency_score: 82,
    smart_group: 'Hôm qua'
  },
  {
    id: 'notif-105',
    type: 'shift_assigned',
    title: 'Bạn được phân bổ ca làm việc mới',
    message: 'Bạn đã được chỉ định vào vai trò Support cho ca Lactacyd Super Live lúc 09:00–12:00 ngày 16/09/2026 tại Studio B.',
    severity: 'info',
    user_id: 'usr-01',
    related_entity_type: 'shift',
    related_entity_id: 'shift-103',
    action_url: '/calendar?tab=mine',
    event_key: 'shift_assigned:shift-103:usr-01',
    read_at: '2026-09-07T14:00:00Z',
    created_at: '2026-09-07T11:30:00Z',
    source_title: 'Lactacyd Super Live (Studio B)',
    source_status: 'confirmed',
    actor_name: 'Phạm Minh Đức (Điều phối)',
    predicted_urgency_score: 55,
    smart_group: 'Trước đó'
  },
  {
    id: 'notif-106',
    type: 'report_reviewed',
    title: 'Báo cáo ca làm đã được duyệt',
    message: 'Báo cáo ca Vinamilk Mega Stream (REP-099) đã được duyệt và xác nhận số liệu doanh thu hoàn tất.',
    severity: 'success',
    user_id: 'usr-01',
    related_entity_type: 'report',
    related_entity_id: 'REP-099',
    action_url: '/reports',
    event_key: 'report_reviewed:REP-099:usr-01:confirmed',
    read_at: '2026-09-06T18:00:00Z',
    created_at: '2026-09-06T17:45:00Z',
    source_title: 'Báo cáo Vinamilk Mega Stream',
    source_status: 'confirmed',
    actor_name: 'Trần Thị Mai (Leader)',
    predicted_urgency_score: 30,
    smart_group: 'Trước đó'
  },
  {
    id: 'notif-107',
    type: 'import_completed',
    title: 'Nhập lịch tự động hoàn tất',
    message: 'File lịch tuần W37 (IMP-2026-09-A) đã nhập thành công 42 ca livestream mới vào hệ thống.',
    severity: 'success',
    user_id: 'usr-lead-01',
    related_entity_type: 'schedule_import',
    related_entity_id: 'IMP-101',
    action_url: '/calendar',
    event_key: 'import_completed:IMP-101:usr-lead-01',
    read_at: '2026-09-05T09:00:00Z',
    created_at: '2026-09-05T08:50:00Z',
    source_title: 'Batch Import Lịch Tuần W37',
    source_status: 'confirmed',
    actor_name: 'Hệ thống tự động',
    predicted_urgency_score: 20,
    smart_group: 'Trước đó'
  },
  {
    id: 'notif-108',
    type: 'system',
    title: 'Bảo trì hệ thống vận hành',
    message: 'Hệ thống sẽ tạm gián đoạn để nâng cấp hạ tầng từ 23:00 đến 01:00 đêm Chủ Nhật 13/09/2026.',
    severity: 'warning',
    user_id: 'usr-01',
    related_entity_type: 'system',
    related_entity_id: 'SYS-2026-09-01',
    action_url: '/notifications',
    event_key: 'system:maintenance:2026-09-13',
    read_at: '2026-09-08T12:00:00Z',
    created_at: '2026-09-08T07:00:00Z',
    source_title: 'Thông báo kỹ thuật Ops Live',
    source_status: 'active',
    actor_name: 'Quản trị viên IT',
    predicted_urgency_score: 60,
    smart_group: 'Hôm nay'
  }
]

export const QA_STATE_OPTIONS: { id: NotificationQaStateId; label: string }[] = [
  { id: '01-notifications-main', label: '01 Thông báo chính (Main)' },
  { id: '02-unread-filter', label: '02 Lọc Chưa đọc' },
  { id: '03-read-filter', label: '03 Lọc Đã đọc' },
  { id: '04-notification-detail', label: '04 Chi tiết thông báo' },
  { id: '05-swap-provenance', label: '05 Nguồn Đổi ca (Swap)' },
  { id: '06-registration-provenance', label: '06 Nguồn Đăng ký ca' },
  { id: '07-report-provenance', label: '07 Nguồn Báo cáo ca' },
  { id: '08-shift-staffing-provenance', label: '08 Nguồn Phân bổ ca' },
  { id: '09-actionable-notification', label: '09 Thông báo có điều hướng CTA' },
  { id: '10-read-notification', label: '10 Thông báo đã đọc' },
  { id: '11-mark-as-read-preview', label: '11 Đánh dấu đã đọc' },
  { id: '12-mark-all-read-preview', label: '12 Đánh dấu tất cả đã đọc' },
  { id: '13-stale-source-state', label: '13 Dữ liệu nguồn đã thay đổi' },
  { id: '14-source-unavailable', label: '14 Đối tượng nguồn không khả dụng' },
  { id: '15-notification-history', label: '15 Lịch sử thông báo' },
  { id: '16-notification-settings', label: '16 Cài đặt thông báo' },
  { id: '17-independent-toast', label: '17 Toast thời gian thực độc lập' },
  { id: '18-unread-toast', label: '18 Toast chưa đọc (Khớp fixture)' },
  { id: '19-read-toast', label: '19 Toast đã đọc' },
  { id: '20-recipient-isolation', label: '20 Cách ly người nhận (RLS)' },
  { id: '21-member-view', label: '21 Giao diện Thành viên (Member)' },
  { id: '22-leader-view', label: '22 Giao diện Trưởng nhóm (Leader)' },
  { id: '23-no-action-terminal', label: '23 Thông báo không hành động' },
  { id: '24-empty-inbox', label: '24 Hộp thư trống' },
  { id: '25-no-results', label: '25 Không tìm thấy kết quả' },
  { id: '26-loading', label: '26 Trạng thái đang tải (Loading)' },
  { id: '27-refreshing', label: '27 Làm mới danh sách (Refreshing)' },
  { id: '28-retrieval-error', label: '28 Lỗi tải danh sách (Network Error)' },
  { id: '29-mark-read-error', label: '29 Lỗi đánh dấu đã đọc (42501)' },
  { id: '30-offline-stale', label: '30 Ngoại tuyến / Lưu đệm cục bộ' },
  { id: '31-long-content-stress', label: '31 Văn bản dài (Stress Test)' },
  { id: '32-dense-notification-list', label: '32 Danh sách mật độ cao (Dense)' },
  { id: '33-success-feedback', label: '33 Phản hồi thành công' },
  { id: '34-generic-error-feedback', label: '34 Phản hồi lỗi hệ thống' }
]

function getNotificationIcon(type: NotificationType): LucideIcon {
  if (type.startsWith('swap')) return Copy
  if (type.startsWith('registration') || type.startsWith('staffing')) return UserCheck
  if (type.startsWith('report')) return BarChart3
  if (type === 'shift_assigned') return CalendarDays
  if (type.startsWith('import')) return CheckCircle2
  return Bell
}

function getSeverityBadge(severity: NotificationSeverity) {
  switch (severity) {
    case 'error':
      return { label: 'Khẩn cấp', pill: 'bg-red-50 text-red-700 border-red-200', tone: 'bg-red-50 text-red-600' }
    case 'warning':
      return { label: 'Cần chú ý', pill: 'bg-amber-50 text-amber-700 border-amber-200', tone: 'bg-amber-50 text-amber-600' }
    case 'success':
      return { label: 'Hoàn tất', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', tone: 'bg-emerald-50 text-emerald-600' }
    default:
      return { label: 'Thông tin', pill: 'bg-blue-50 text-blue-700 border-blue-200', tone: 'bg-blue-50 text-blue-600' }
  }
}

function getTypeLabel(type: NotificationType): string {
  switch (type) {
    case 'swap_request': return 'Yêu cầu đổi ca'
    case 'swap_approved': return 'Đổi ca duyệt'
    case 'swap_accepted': return 'Đổi ca chấp nhận'
    case 'swap_rejected': return 'Đổi ca từ chối'
    case 'registration_submitted': return 'Đăng ký ca'
    case 'staffing_approval': return 'Duyệt nhân sự'
    case 'staffing_rejection': return 'Từ chối nhân sự'
    case 'shift_assigned': return 'Phân bổ ca'
    case 'report_submitted': return 'Nộp báo cáo'
    case 'report_reviewed': return 'Duyệt báo cáo'
    case 'import_completed': return 'Nhập lịch'
    case 'import_warning': return 'Cảnh báo nhập'
    case 'import_failure': return 'Lỗi nhập lịch'
    case 'account_request_submitted': return 'Yêu cầu tài khoản'
    case 'system': return 'Hệ thống'
    default: return type
  }
}

export function NotificationsReferenceMock({ initialState }: { initialState?: NotificationQaStateId }) {
  const searchParams = useSearchParams()
  const initialQaParam = (searchParams.get('state') || searchParams.get('qaState') || initialState || '01-notifications-main') as NotificationQaStateId
  const [qaState, setQaState] = useState<NotificationQaStateId>(initialQaParam)
  const [qaOpen, setQaOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('notif-101')
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'read'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  // Synchronize state with URL parameters
  useEffect(() => {
    const p = searchParams.get('state') || searchParams.get('qaState')
    if (p) {
      setQaState(p as NotificationQaStateId)
    }
  }, [searchParams])

  // Synchronize tabs or modals with qaState
  useEffect(() => {
    if (qaState === '02-unread-filter') setActiveTab('unread')
    else if (qaState === '03-read-filter') setActiveTab('read')
    else setActiveTab('all')

    if (qaState === '05-swap-provenance' || qaState === '09-actionable-notification' || qaState === '11-mark-as-read-preview') {
      setSelectedId('notif-101')
    } else if (qaState === '06-registration-provenance') {
      setSelectedId('notif-102')
    } else if (qaState === '07-report-provenance' || qaState === '13-stale-source-state') {
      setSelectedId('notif-104')
    } else if (qaState === '08-shift-staffing-provenance') {
      setSelectedId('notif-105')
    } else if (qaState === '10-read-notification') {
      setSelectedId('notif-103')
    } else if (qaState === '14-source-unavailable') {
      setSelectedId('notif-105')
    } else if (qaState === '23-no-action-terminal') {
      setSelectedId('notif-108')
    }

    if (qaState === '15-notification-history') setShowHistoryModal(true)
    else setShowHistoryModal(false)

    if (qaState === '16-notification-settings') setShowSettingsModal(true)
    else setShowSettingsModal(false)
  }, [qaState])

  // Compute notifications based on QA state transitions
  const currentNotifications = useMemo(() => {
    let list = [...CANONICAL_NOTIFICATIONS]

    if (qaState === '24-empty-inbox') {
      list = []
    } else if (qaState === '11-mark-as-read-preview' || qaState === '19-read-toast') {
      // Static after-state for notif-101; the production RPC writes read and read_at.
      list = list.map((item) =>
        item.id === 'notif-101'
          ? { ...item, read_at: '2026-09-08T09:00:00Z' }
          : item
      )
    } else if (qaState === '12-mark-all-read-preview') {
      // Static after-state. The timestamp follows every fixture creation time.
      list = list.map((item) => ({
        ...item,
        read_at: item.read_at || '2026-09-09T17:00:00Z'
      }))
    } else if (qaState === '21-member-view') {
      // Recipient isolation for usr-01 (Member)
      list = list.filter((item) => item.user_id === 'usr-01')
    } else if (qaState === '22-leader-view') {
      // Recipient isolation for usr-lead-01 (Leader)
      list = list.filter((item) => item.user_id === 'usr-lead-01')
    } else if (qaState === '31-long-content-stress') {
      // Injected long-content stress item
      list = [
        {
          id: 'notif-stress-01',
          type: 'system',
          title: 'Cảnh báo vận hành cực kỳ nghiêm trọng: Lỗi đồng bộ tín hiệu máy chủ phát sóng đa tầng trên hệ thống TikTok Shop Live & Shopee Live Đông Nam Á',
          message: 'Hệ thống giám sát tự động Ops Livestream phát hiện sự cố mất gói dữ liệu nghiêm trọng vượt ngưỡng 45% tại phòng thu Studio B trong khung giờ cao điểm 19:30–21:30. Yêu cầu toàn bộ Kỹ thuật viên (Technical Staff) và Quản lý vận hành (Operations Leader) lập tức truy cập bảng điều khiển kiểm tra đường truyền dự phòng (Backup RTMP ingest stream url: rtmps://live-stream-cdn.platform.ops/primary-live-stream-backup-channel-node-0982-southeast-asia-zone), tiến hành xác thực thiết bị ghi hình và gửi báo cáo khẩn cấp.',
          severity: 'error',
          user_id: 'usr-01',
          related_entity_type: 'system_incident',
          related_entity_id: 'INC-2026-09-88991244-CRITICAL-INFRA-FAILURE',
          action_url: '/notifications?incident=INC-2026-09-88991244',
          event_key: 'incident:INC-2026-09-88991244:usr-01',
          read_at: null,
          created_at: '2026-09-08T19:35:00Z',
          source_title: 'Sự cố hạ tầng phát sóng trực tiếp Đông Nam Á',
          source_status: 'investigating',
          actor_name: 'Giám sát hạ tầng tự động (System Daemon)',
          predicted_urgency_score: 99,
          smart_group: 'Hôm nay'
        },
        ...list
      ]
    } else if (qaState === '32-dense-notification-list') {
      // Replicate to 12 items for dense inspection
      const extraItems: ExtendedNotificationItem[] = [
        {
          id: 'notif-109',
          type: 'shift_assigned',
          title: 'Phân bổ ca trực kỹ thuật',
          message: 'Bạn được chỉ định trực kỹ thuật ca Colgate Brand Day 18/09.',
          severity: 'info',
          user_id: 'usr-01',
          related_entity_type: 'shift',
          related_entity_id: 'shift-109',
          action_url: '/calendar?tab=mine',
          event_key: 'shift_assigned:shift-109:usr-01',
          read_at: null,
          created_at: '2026-09-08T06:00:00Z',
          source_title: 'Colgate Brand Day',
          source_status: 'confirmed',
          actor_name: 'Điều phối viên',
          predicted_urgency_score: 50,
          smart_group: 'Hôm nay'
        },
        {
          id: 'notif-110',
          type: 'swap_request',
          title: 'Yêu cầu đổi ca bổ sung',
          message: 'Đỗ Phương Thảo yêu cầu đổi ca Unilever ngày 19/09.',
          severity: 'info',
          user_id: 'usr-01',
          related_entity_type: 'swap_request',
          related_entity_id: 'SWP-109',
          action_url: '/swaps',
          event_key: 'swap_request:SWP-109:usr-01',
          read_at: '2026-09-08T05:00:00Z',
          created_at: '2026-09-08T04:30:00Z',
          source_title: 'Unilever Mega Live',
          source_status: 'pending',
          actor_name: 'Đỗ Phương Thảo',
          predicted_urgency_score: 65,
          smart_group: 'Hôm nay'
        },
        {
          id: 'notif-111',
          type: 'registration_submitted',
          title: 'Đăng ký ca mới chờ rà soát',
          message: 'Vũ Minh Tuấn đăng ký ca Support 20/09.',
          severity: 'warning',
          user_id: 'usr-lead-01',
          related_entity_type: 'shift_registration',
          related_entity_id: 'REG-111',
          action_url: '/calendar',
          event_key: 'registration_submitted:REG-111:usr-lead-01',
          read_at: null,
          created_at: '2026-09-07T20:00:00Z',
          source_title: 'Corbiere T9',
          source_status: 'pending',
          actor_name: 'Vũ Minh Tuấn',
          predicted_urgency_score: 70,
          smart_group: 'Hôm qua'
        },
        {
          id: 'notif-112',
          type: 'system',
          title: 'Sao lưu dữ liệu định kỳ',
          message: 'Hệ thống đã hoàn tất bản sao lưu snapshot lúc 02:00 sáng.',
          severity: 'info',
          user_id: 'usr-01',
          related_entity_type: 'system',
          related_entity_id: 'SYS-BAK-01',
          action_url: '/notifications',
          event_key: 'system:backup:2026-09-08',
          read_at: '2026-09-08T03:00:00Z',
          created_at: '2026-09-08T02:00:00Z',
          source_title: 'Hệ thống sao lưu',
          source_status: 'completed',
          actor_name: 'Tự động',
          predicted_urgency_score: 10,
          smart_group: 'Hôm nay'
        }
      ]
      list = [...list, ...extraItems]
    }
    return list
  }, [qaState])

  // Tallies for tabs and badges
  const tallies = useMemo(() => {
    const total = currentNotifications.length
    const unread = currentNotifications.filter((n) => n.read_at == null).length
    const read = total - unread
    return { total, unread, read }
  }, [currentNotifications])

  // Filtered notifications to display in list
  const displayedNotifications = useMemo(() => {
    if (qaState === '24-empty-inbox') return []
    if (qaState === '25-no-results') return []

    let res = currentNotifications

    if (activeTab === 'unread') {
      res = res.filter((n) => n.read_at == null)
    } else if (activeTab === 'read') {
      res = res.filter((n) => n.read_at != null)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      res = res.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q) ||
          (n.related_entity_id && n.related_entity_id.toLowerCase().includes(q))
      )
    }
    return res
  }, [currentNotifications, activeTab, searchQuery, qaState])

  // Selected notification object
  const selectedNotification = useMemo(() => {
    return (
      currentNotifications.find((n) => n.id === selectedId) ??
      currentNotifications[0]
    )
  }, [currentNotifications, selectedId])

  return (
    <OpsWorkflowReferenceShell
      active="Notifications"
      searchPlaceholder="Tìm kiếm thông báo, mã đối tượng (SWP, REG, REP)..."
      unreadCount={tallies.unread}
    >
      <main data-testid="notifications-reference-mock" className="px-6 py-5">
        {/* Offline / Stale Banner for state 30 */}
        {qaState === '30-offline-stale' && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm">
            <div className="flex items-center gap-3">
              <WifiOff className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-[13px] font-bold">Chế độ ngoại tuyến (Offline Mode) - Đang hiển thị bản sao lưu đệm cục bộ</p>
                <p className="text-[12px] text-amber-700">Mất kết nối tới máy chủ thời gian thực. Các thay đổi trạng thái đọc sẽ được đồng bộ khi kết nối trở lại.</p>
              </div>
            </div>
            <span className="rounded bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Bản sao lúc 09:15</span>
          </div>
        )}

        {/* Retrieval Error Banner for state 28 */}
        {qaState === '28-retrieval-error' && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-[13px] font-bold">Lỗi truy xuất dữ liệu thông báo (500 Internal Server Error)</p>
                <p className="text-[12px] text-red-700">Không thể tải danh sách thông báo từ máy chủ Supabase. Vui lòng thử lại sau.</p>
              </div>
            </div>
            <button type="button" onClick={() => setQaState('01-notifications-main')} className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700">
              <RefreshCw className="h-3.5 w-3.5" /> Thử lại
            </button>
          </div>
        )}

        {/* Mark Read Error Banner for state 29 */}
        {qaState === '29-mark-read-error' && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-900 shadow-sm">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-[13px] font-bold">Không thể đánh dấu đã đọc: Quyền truy cập bị từ chối (42501 NOTIFICATION_NOT_OWNED)</p>
                <p className="text-[12px] text-red-700">Thao tác `mark_notification_read` thất bại do bạn không phải là người nhận sở hữu thông báo này. Trạng thái chưa đọc được giữ nguyên.</p>
              </div>
            </div>
            <button type="button" onClick={() => setQaState('01-notifications-main')} className="rounded-md border border-red-200 bg-white px-3 py-1 text-[11px] font-semibold text-red-700">
              Đóng
            </button>
          </div>
        )}

        {/* Refreshing Banner for state 27 */}
        {qaState === '27-refreshing' && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2 text-[12px] font-semibold text-blue-700 shadow-sm">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
            <span>Đang làm mới danh sách thông báo và đồng bộ sự kiện mới nhất từ máy chủ...</span>
          </div>
        )}

        {/* Header section */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-bold tracking-tight text-slate-950">Thông báo</h1>
              {qaState === '21-member-view' && (
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                  Góc nhìn: Thành viên (usr-01 Nguyễn Văn Bình)
                </span>
              )}
              {qaState === '22-leader-view' && (
                <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
                  Góc nhìn: Trưởng ca / Leader (usr-lead-01 Trần Thị Mai)
                </span>
              )}
              {qaState === '20-recipient-isolation' && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <ShieldCheck className="h-3.5 w-3.5" /> RLS Cách ly người nhận
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              Theo dõi cập nhật vận hành, yêu cầu đổi ca, đăng ký và báo cáo cần xử lý
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQaState('12-mark-all-read-preview')}
              className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-[12px] font-semibold text-blue-600 shadow-sm hover:bg-slate-50"
            >
              <CheckCheck className="h-4 w-4" />
              Đánh dấu tất cả đã đọc
            </button>
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              aria-label="Lịch sử thông báo"
              className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Clock3 className="h-4 w-4 text-slate-500" />
              Lịch sử thông báo
            </button>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              aria-label="Cài đặt thông báo"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mark All Read Confirmation Banner for state 12 */}
        {qaState === '12-mark-all-read-preview' && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-[13px] font-bold">Xem trước kết quả: tất cả 3 thông báo chưa đọc thành ĐÃ ĐỌC</p>
                <p className="text-[12px] text-emerald-700">Chưa đọc 3 &rarr; 0. Bản ghi sau thao tác có read = true và read_at; production dùng RPC mark_all_notifications_read. Không ghi dữ liệu trong màn hình này.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQaState('01-notifications-main')}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Hoàn tác xem trước
            </button>
          </div>
        )}

        {/* Mark As Read Preview Banner for state 11 */}
        {qaState === '11-mark-as-read-preview' && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-blue-900 shadow-sm">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-[13px] font-bold">Xem trước kết quả: thông báo notif-101 đã đọc</p>
                <p className="text-[12px] text-blue-700">read = true, read_at = 2026-09-08T09:00:00Z; chưa đọc 3 &rarr; 2. Production dùng RPC mark_notification_read. SWP-101 vẫn &apos;pending&apos;.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQaState('01-notifications-main')}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-800 hover:bg-blue-100"
            >
              Hoàn tất
            </button>
          </div>
        )}

        {/* Recipient Isolation Inspector for state 20 */}
        {qaState === '20-recipient-isolation' && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 text-indigo-950 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-[12px]">
                <h3 className="font-bold text-[13px] text-indigo-900">Quy tắc cách ly người nhận & An toàn bảo mật RLS (Row Level Security)</h3>
                <p className="text-indigo-800 leading-5">
                  Production Supabase áp dụng chính sách bảo mật <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono text-[11px]">notifications_select_own</code>: Người dùng chỉ được đọc thông báo khi <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono text-[11px]">recipient_id = current_business_user_id()</code> hoặc <code className="rounded bg-indigo-100 px-1 py-0.5 font-mono text-[11px]">user_id = auth.uid()</code>.
                </p>
                <p className="text-indigo-800 leading-5">recipient_id là ID business_users; user_id trong bảng là auth.users ID cũ. AppNotification.user_id là ID người nhận đã chuẩn hóa cho giao diện.</p>
                <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-indigo-700 font-medium">
                  <span>&bull; Thành viên (Member usr-01): Xem 3 thông báo cá nhân (ca được phân bổ, báo cáo đã duyệt, thông báo hệ thống).</span>
                  <span>&bull; Trưởng ca (Leader usr-lead-01): Xem 3 thông báo hàng đợi duyệt (đăng ký mới cần duyệt, báo cáo cần duyệt, kết quả import).</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main 2-column workspace */}
        <div className="mt-4 grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-start gap-4">
          {/* Left column: List and filters */}
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Filter Tabs */}
            <div className="flex items-center gap-5 border-b border-slate-200 px-4 text-[12px] font-semibold text-slate-500">
              <button
                type="button"
                onClick={() => { setActiveTab('all'); if (qaState === '02-unread-filter' || qaState === '03-read-filter') setQaState('01-notifications-main') }}
                className={`py-3 transition-colors ${activeTab === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'}`}
              >
                Tất cả ({tallies.total})
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('unread'); setQaState('02-unread-filter') }}
                className={`flex items-center gap-1.5 py-3 transition-colors ${activeTab === 'unread' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'}`}
              >
                Chưa đọc ({tallies.unread})
                {tallies.unread > 0 && <span className="h-2 w-2 rounded-full bg-blue-600" />}
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('read'); setQaState('03-read-filter') }}
                className={`py-3 transition-colors ${activeTab === 'read' ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-slate-800'}`}
              >
                Đã đọc ({tallies.read})
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Hiển thị {displayedNotifications.length} mục</span>
              </div>
            </div>

            {/* List Body */}
            {qaState === '26-loading' ? (
              <LoadingSkeleton />
            ) : qaState === '24-empty-inbox' ? (
              <EmptyInbox onReset={() => setQaState('01-notifications-main')} />
            ) : qaState === '25-no-results' ? (
              <NoResults onReset={() => setQaState('01-notifications-main')} />
            ) : (
              <div className={`divide-y divide-slate-100 ${qaState === '32-dense-notification-list' ? 'max-h-[620px] overflow-y-auto' : ''}`}>
                {displayedNotifications.map((item) => {
                  const isSelected = item.id === selectedId
                  const isUnread = item.read_at == null
                  const Icon = getNotificationIcon(item.type)
                  const sev = getSeverityBadge(item.severity)
                  const typeLabel = getTypeLabel(item.type)

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-l-4 border-l-blue-600 bg-blue-50/40'
                          : isUnread
                          ? 'border-l-4 border-l-amber-500 bg-amber-50/15 hover:bg-slate-50'
                          : 'border-l-4 border-l-transparent hover:bg-slate-50'
                      } ${qaState === '32-dense-notification-list' ? 'p-2.5' : 'p-3.5'}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon Container */}
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${sev.tone}`}>
                          <Icon className="h-4 w-4" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <h2 className={`truncate text-[13px] ${isUnread ? 'font-bold text-slate-950' : 'font-medium text-slate-800'}`}>
                                {item.title}
                              </h2>
                              {isUnread && (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" title="Chưa đọc" />
                              )}
                            </div>
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {formatRelativeTime(item.created_at)}
                            </span>
                          </div>

                          <p className={`mt-0.5 text-slate-600 leading-snug ${qaState === '31-long-content-stress' && item.id.includes('stress') ? 'text-[12px]' : 'line-clamp-2 text-[12px]'}`}>
                            {item.message}
                          </p>

                          {/* Metadata row */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                              {typeLabel}
                            </span>
                            <span className={`rounded border px-1.5 py-0.5 font-medium ${sev.pill}`}>
                              {sev.label}
                            </span>
                            {item.related_entity_id && (
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-700">
                                {item.related_entity_id}
                              </span>
                            )}
                            {item.read_at && (
                              <span className="ml-auto text-[10px] text-slate-400">
                                Đã đọc: {formatTime(item.read_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Right column: Notification Detail & Technical Inspector */}
          {qaState === '24-empty-inbox' ? (
            <aside className="flex h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-slate-400">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-[13px]">Hộp thư trống, không có thông báo nào được chọn</p>
            </aside>
          ) : selectedNotification ? (
            <NotificationDetailPanel
              notification={selectedNotification}
              qaState={qaState}
              onMarkRead={() => setQaState('11-mark-as-read-preview')}
            />
          ) : (
            <aside className="flex h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-slate-400">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-[13px]">Chọn một thông báo ở danh sách bên trái để xem chi tiết</p>
            </aside>
          )}
        </div>
      </main>

      {/* Floating Realtime Toasts for states 17, 18, 19, 33, 34 */}
      {(qaState === '17-independent-toast' ||
        qaState === '18-unread-toast' ||
        qaState === '19-read-toast' ||
        qaState === '33-success-feedback' ||
        qaState === '34-generic-error-feedback') && (
        <ToastContainer qaState={qaState} notification={qaState === '18-unread-toast' ? selectedNotification : undefined} onClose={() => setQaState('01-notifications-main')} />
      )}

      {/* Settings Modal (State 16) */}
      {showSettingsModal && (
        <NotificationSettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {/* History Delivery Modal (State 15) */}
      {showHistoryModal && (
        <NotificationHistoryModal onClose={() => setShowHistoryModal(false)} />
      )}

      {/* QA States Floating Controller */}
      <div data-qa-controller="true" className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {qaOpen && (
          <div className="max-h-[460px] w-[320px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Wave 10 QA States</span>
              <button type="button" onClick={() => setQaOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5">
              {QA_STATE_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setQaState(item.id); setQaOpen(false) }}
                  className={`block w-full rounded px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                    qaState === item.id
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setQaOpen(!qaOpen)}
          className="flex h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-[12px] font-bold text-slate-700 shadow-md hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
          <span>QA Controller ({qaState.slice(0, 2)})</span>
        </button>
      </div>
    </OpsWorkflowReferenceShell>
  )
}

function NotificationDetailPanel({
  notification,
  qaState,
  onMarkRead
}: {
  notification: ExtendedNotificationItem
  qaState: NotificationQaStateId
  onMarkRead: () => void
}) {
  const isUnread = notification.read_at == null
  const sev = getSeverityBadge(notification.severity)
  const Icon = getNotificationIcon(notification.type)
  const isStale = qaState === '13-stale-source-state'
  const isSourceMissing = qaState === '14-source-unavailable'

  return (
    <aside className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Detail Header */}
      <header className="border-b border-slate-100 bg-slate-50/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${sev.tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <span className="font-mono text-[11px] font-bold text-slate-500">{notification.id}</span>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-slate-200/70 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                  {getTypeLabel(notification.type)}
                </span>
                <span className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold ${sev.pill}`}>
                  {sev.label}
                </span>
              </div>
            </div>
          </div>

          {/* Read Status Pill */}
          <div className="text-right">
            {isUnread ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Chưa đọc
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                <Check className="h-3 w-3 text-emerald-600" /> Đã đọc
              </span>
            )}
            <div className="mt-0.5 text-[10px] text-slate-400">
              Tạo lúc: {formatTime(notification.created_at)}
            </div>
          </div>
        </div>

        <h2 className="mt-3 text-[16px] font-bold text-slate-950 leading-snug">
          {notification.title}
        </h2>
      </header>

      {/* Content & Stale/Missing Alerts */}
      <div className="p-4 space-y-4">
        {/* State 04 Inspection Banner */}
        {qaState === '04-notification-detail' && (
          <div className="flex items-center gap-2 rounded-md border-2 border-blue-500 bg-blue-50/90 p-2.5 text-[12px] font-bold text-blue-900 shadow-sm">
            <Eye className="h-4 w-4 text-blue-600 shrink-0" />
            <span>[QA State 04] Đang mở rộng xem chi tiết hợp đồng 12 trường dữ liệu Canonical AppNotification (NOTIF-001 &rarr; NOTIF-012)</span>
          </div>
        )}

        {/* State 05 Swap Provenance Banner */}
        {qaState === '05-swap-provenance' && (
          <div className="flex items-center gap-2 rounded-md border-2 border-emerald-500 bg-emerald-50/90 p-2.5 text-[12px] font-bold text-emerald-900 shadow-sm">
            <Database className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>[QA State 05] Truy vết nguồn gốc SwapRequest: SWP-101 (requester: usr-01, target: usr-03, shift: shift-101)</span>
          </div>
        )}

        {/* State 09 Actionable CTA Banner */}
        {qaState === '09-actionable-notification' && (
          <div className="flex items-center gap-2 rounded-md border-2 border-purple-500 bg-purple-50/90 p-2.5 text-[12px] font-bold text-purple-900 shadow-sm">
            <ArrowRight className="h-4 w-4 text-purple-600 shrink-0" />
            <span>[QA State 09] Thông báo có hành động: Nút 'Đi đến đối tượng nguồn' chuyển hướng đến /swaps. Không đột biến dữ liệu nghiệp vụ tại đây.</span>
          </div>
        )}
        {/* Stale Alert for state 13 */}
        {isStale && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Dữ liệu nguồn đã thay đổi (Source item has changed)</p>
              <p className="mt-0.5 text-amber-800">
                Yêu cầu nguồn ({notification.related_entity_id}) đã chuyển trạng thái sang &apos;Đã xử lý / Hủy&apos; bởi thành viên khác. Thao tác điều hướng đã bị vô hiệu hóa để tránh xung đột dữ liệu.
              </p>
            </div>
          </div>
        )}

        {/* Source Missing Alert for state 14 */}
        {isSourceMissing && (
          <div className="flex items-start gap-2.5 rounded-md border border-red-300 bg-red-50 p-3 text-[12px] text-red-900">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Đối tượng nguồn không khả dụng (Source entity unavailable)</p>
              <p className="mt-0.5 text-red-800">
                Bản ghi nguồn ({notification.related_entity_id}) không còn tồn tại hoặc đã bị lưu trữ trong hệ thống. Thông tin lịch sử thông báo vẫn được bảo lưu an toàn.
              </p>
            </div>
          </div>
        )}

        {/* Full Message Body */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Nội dung thông báo</label>
          <div className="rounded-md border border-slate-100 bg-slate-50/50 p-3 text-[13px] text-slate-800 leading-relaxed">
            {notification.message}
          </div>
        </div>

        {/* Source Domain Provenance Card */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-[12px] space-y-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-blue-600" />
              Nguồn gốc nghiệp vụ (Source Domain Provenance)
            </span>
            <span className="font-mono text-[11px] font-semibold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded">
              {notification.related_entity_type}: {notification.related_entity_id}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            <div>
              <span className="text-slate-400 block">Tiêu đề đối tượng nguồn:</span>
              <strong className="text-slate-800">{notification.source_title || 'N/A'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Trạng thái đối tượng nguồn:</span>
              <span className="inline-block font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                {notification.source_status || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Tác nhân phát sinh sự kiện:</span>
              <span className="text-slate-700 font-medium">{notification.actor_name || 'Hệ thống'}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Đường dẫn điều hướng (action_url):</span>
              <span className="font-mono text-slate-600">{notification.action_url || '/notifications'}</span>
            </div>
          </div>

          <div className="mt-1 rounded bg-blue-50/60 p-2 text-[11px] text-blue-800 border border-blue-100 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Nguyên tắc thẩm quyền dữ liệu:</strong> Thông báo là bản ghi chuyển phát sự kiện. Nút hành động chỉ thực hiện điều hướng đến màn hình nguồn ({notification.action_url}), không thực hiện phê duyệt hay thay đổi dữ liệu nghiệp vụ ngay tại màn hình thông báo.
            </span>
          </div>
        </div>

        {/* Action Button Area */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {isUnread ? (
            <button
              type="button"
              onClick={onMarkRead}
              className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Check className="h-4 w-4 text-emerald-600" />
              Đánh dấu đã đọc
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <CheckCheck className="h-4 w-4 text-emerald-600" />
              Đã đọc vào: {formatTime(notification.read_at)}
            </span>
          )}

          {notification.action_url && (
            <button
              type="button"
              disabled={isStale || isSourceMissing}
              onClick={() => {
                alert(`Điều hướng tới luồng nghiệp vụ nguồn: ${notification.action_url}`)
              }}
              className={`flex h-9 items-center gap-1.5 rounded-md px-4 text-[12px] font-bold text-white shadow-sm transition-colors ${
                isStale || isSourceMissing
                  ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <span>Đi đến đối tượng nguồn</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Canonical Technical Metadata (NOTIF-001 through NOTIF-012) */}
        <div className="border-t border-slate-200 pt-3">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Hợp đồng dữ liệu Production (AppNotification Schema Inspector)
          </label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-[11px] font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-001 id (UUID):</span>
              <span className="font-bold text-slate-800">{notification.id}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-002 type:</span>
              <span className="text-blue-700 font-bold">{notification.type}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-005 severity:</span>
              <span className="font-semibold text-slate-800">{notification.severity}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-006 user_id:</span>
              <span className="text-slate-800">{notification.user_id}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-007 related_entity_type:</span>
              <span className="text-slate-800">{notification.related_entity_type || 'null'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-008 related_entity_id:</span>
              <span className="text-slate-800">{notification.related_entity_id || 'null'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-009 action_url:</span>
              <span className="text-slate-800">{notification.action_url || 'null'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-010 event_key:</span>
              <span className="text-slate-600 truncate block" title={notification.event_key}>{notification.event_key || 'null'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-011 read_at:</span>
              <span className={notification.read_at ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                {notification.read_at || 'null (Chưa đọc)'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">NOTIF-012 created_at:</span>
              <span className="text-slate-700">{notification.created_at}</span>
            </div>
          </div>

          {/* High-Fi Unbacked Concept Disclosures */}
          <div className="mt-3 rounded border border-amber-200 bg-amber-50/50 p-2.5 text-[11px] text-amber-900">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-600" />
                Điểm ưu tiên dự đoán (Predicted Urgency Score): {notification.predicted_urgency_score}/100
              </span>
              <span className="rounded bg-amber-200/80 px-1.5 py-0.2 font-mono text-[9px] font-bold text-amber-900">
                NEW_ONLY_UNBACKED = YES
              </span>
            </div>
            <p className="mt-1 text-[10px] text-amber-800">
              Chỉ số này do giao diện High-Fi mô phỏng để sắp xếp độ ưu tiên thị giác, không được lưu trữ trong bảng `public.notifications` của cơ sở dữ liệu.
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function ToastContainer({
  qaState,
  notification,
  onClose
}: {
  qaState: NotificationQaStateId
  notification?: ExtendedNotificationItem
  onClose: () => void
}) {
  let title = 'Yêu cầu đổi ca mới (SWP-101)'
  let message = 'Nguyễn Văn Bình (usr-01) đã gửi yêu cầu thay thế ca cho ca Pharmaton.'
  let time = '2 phút trước'
  let tone = 'bg-blue-50 text-blue-600'
  let Icon = Copy

  if (qaState === '17-independent-toast') {
    // A separate realtime event; the selected detail remains unchanged.
    title = 'Phiên phát sóng trực tiếp mới đã bắt đầu'
    message = 'Phòng thu Studio B vừa kích hoạt tín hiệu phát trực tiếp cho ca Lactacyd Super Live.'
    time = 'Vừa xong'
    tone = 'bg-indigo-50 text-indigo-600'
    Icon = Megaphone
  } else if (qaState === '18-unread-toast' && notification) {
    // Matched toast reads the selected record, including its source and recipient identity.
    title = notification.title
    message = notification.message
    time = formatTime(notification.created_at)
    tone = getSeverityBadge(notification.severity).tone
    Icon = getNotificationIcon(notification.type)
  } else if (qaState === '19-read-toast') {
    title = 'Xem trước: thông báo đã đọc'
    message = 'Bản ghi mô phỏng có read = true và read_at; chưa đọc giảm từ 3 xuống 2.'
    time = 'Vừa xong'
    tone = 'bg-emerald-50 text-emerald-600'
    Icon = Check
  } else if (qaState === '33-success-feedback') {
    title = 'Xem trước thao tác thành công'
    message = 'Trạng thái thông báo đã được cập nhật trong bản xem trước tĩnh.'
    time = 'Vừa xong'
    tone = 'bg-emerald-50 text-emerald-600'
    Icon = CheckCircle2
  } else if (qaState === '34-generic-error-feedback') {
    title = 'Có lỗi xảy ra trong quá trình xử lý'
    message = 'Hệ thống không thể thực hiện thao tác do lỗi kết nối mạng. Vui lòng thử lại.'
    time = 'Vừa xong'
    tone = 'bg-red-50 text-red-600'
    Icon = AlertCircle
  }

  return (
    <div className="fixed top-20 right-6 z-50 w-[380px] animate-in fade-in slide-in-from-top-4 duration-200" data-notification-id={qaState === '18-unread-toast' ? notification?.id : undefined} data-notification-type={qaState === '18-unread-toast' ? notification?.type : undefined} data-recipient-id={qaState === '18-unread-toast' ? notification?.user_id : undefined} data-source-type={qaState === '18-unread-toast' ? notification?.related_entity_type : undefined} data-source-id={qaState === '18-unread-toast' ? notification?.related_entity_id : undefined} data-created-at={qaState === '18-unread-toast' ? notification?.created_at : undefined}>
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-slate-900 truncate">{title}</h3>
            <span className="text-[10px] text-slate-400 shrink-0">{time}</span>
          </div>
          <p className="mt-1 text-[12px] text-slate-600 leading-snug">{message}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400">Realtime Toast Channel</span>
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const [personalEnabled, setPersonalEnabled] = useState(true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-label="Cài đặt thông báo" className="w-[640px] max-w-[calc(100vw-48px)] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Cài đặt thông báo cá nhân</h2>
            <p className="text-[11px] text-slate-500">Bản xem trước tùy chọn cá nhân; không ghi cài đặt</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {/* The old personal setting exists, but dataService stores it in sessionStorage, not the notification database. */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-slate-900">Bật thông báo hệ thống</span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-800">
                  Tùy chọn phiên: notifications_enabled
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Cho phép ứng dụng hiển thị thông báo thời gian thực khi có ca mới, yêu cầu đổi ca hoặc báo cáo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPersonalEnabled(!personalEnabled)}
              className={`flex h-6 w-11 rounded-full p-1 transition-colors ${personalEnabled ? 'bg-blue-600 justify-end' : 'bg-slate-300 justify-start'}`}
            >
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* Settings Domain Disclosure */}
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-[11px] text-indigo-900">
            <span className="font-bold block mb-0.5">Phân định thẩm quyền Cài đặt Vận hành:</span>
            <p className="text-indigo-800 leading-snug">
              Cài đặt thông báo toàn đội ngũ (<code className="font-mono text-[10px]">SETTINGS-005 team_notifications_enabled</code>) thuộc thẩm quyền của phân hệ <strong>Cài đặt Vận hành (Settings Domain)</strong>. Giao diện tại đây chỉ quản lý tùy chọn cá nhân của tài khoản hiện hành.
            </p>
          </div>

          {/* High-Fi Channel Toggles (UNBACKED Disclosure) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-slate-700">Kênh nhận thông báo (Mô phỏng High-Fi)</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.2 font-mono text-[9px] font-bold text-amber-800">
                Email / Push chưa hỗ trợ
              </span>
            </div>

            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-[12px]">
              <div className="flex items-center justify-between p-3">
                <div>
                  <strong className="block text-slate-800">In-App (Thông báo trong ứng dụng)</strong>
                  <span className="text-[11px] text-slate-400">Kênh chính thức được hỗ trợ bởi Supabase Realtime</span>
                </div>
                <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 text-[11px]">Bắt buộc bật</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <div>
                  <strong className="block text-slate-800">Email Digest (Tổng hợp qua Email)</strong>
                  <span className="text-[11px] text-slate-400">Gửi email tóm tắt ca làm việc trước 24 giờ</span>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 text-[11px]">Chưa hỗ trợ DB</span>
              </div>
              <div className="flex items-center justify-between p-3">
                <div>
                  <strong className="block text-slate-800">Push Notification (Thông báo đẩy di động)</strong>
                  <span className="text-[11px] text-slate-400">Đẩy thông báo qua trình duyệt hoặc thiết bị di động</span>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 text-[11px]">Chưa hỗ trợ DB</span>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3.5">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
            Hủy
          </button>
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-700">
            Đóng xem trước
          </button>
        </footer>
      </section>
    </div>
  )
}

function NotificationHistoryModal({ onClose }: { onClose: () => void }) {
  const recipientNames: Record<string, string> = {
    'usr-01': 'Nguyễn Văn Bình',
    'usr-03': 'Bùi Việt Anh',
    'usr-04': 'Đỗ Phương Thảo',
    'usr-lead-01': 'Trần Thị Mai',
  }
  const historyRows = CANONICAL_NOTIFICATIONS.map((item) => ({
    time: formatTime(item.created_at),
    id: item.id,
    recipient: `${item.user_id} (${recipientNames[item.user_id] ?? 'Không rõ tên'})`,
    type: item.type,
    channel: 'In-app',
    status: item.read_at ? `Đã đọc (${formatTime(item.read_at).slice(0, 5)})` : 'Chưa đọc',
    eventKey: item.event_key,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-label="Lịch sử thông báo" className="w-[840px] max-w-[calc(100vw-48px)] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Lịch sử sự kiện thông báo</h2>
            <p className="text-[11px] text-slate-500">Thời gian tạo và trạng thái đọc từ bản ghi thông báo trong ứng dụng</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          <div className="mb-3 rounded bg-blue-50/70 p-2.5 text-[11px] text-blue-900 border border-blue-100 flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Nguồn dữ liệu:</strong> Tổng hợp từ notifications.id, event_key, created_at và read_at. Không có bảng kiểm toán chuyển phát riêng; đây không phải Nhật ký Kiểm toán nghiệp vụ.
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2.5">Thời gian tạo</th>
                  <th className="px-3 py-2.5">Mã ID</th>
                  <th className="px-3 py-2.5">Người nhận</th>
                  <th className="px-3 py-2.5">Loại sự kiện</th>
                  <th className="px-3 py-2.5">Kênh</th>
                  <th className="px-3 py-2.5">Trạng thái đọc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {historyRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.time}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900" title={row.eventKey}>{row.id}</td>
                    <td className="px-3 py-2">{row.recipient}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                        {row.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{row.channel}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded px-2 py-0.5 font-semibold text-[10px] ${
                        row.status.includes('Chưa đọc')
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3.5">
          <button type="button" onClick={onClose} className="h-9 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-700">
            Đóng
          </button>
        </footer>
      </section>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
          <div className="h-9 w-9 rounded-lg bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-slate-200" />
            <div className="h-3 w-3/4 rounded bg-slate-100" />
            <div className="h-3 w-1/4 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyInbox({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-500">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="mt-3 text-[15px] font-bold text-slate-800">Hộp thư thông báo trống</h3>
      <p className="mt-1 text-[12px] text-slate-500 max-w-[280px]">
        Bạn hiện không có thông báo nào cần xử lý hoặc theo dõi trong danh sách.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
      >
        Tải lại thông báo
      </button>
    </div>
  )
}

function NoResults({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex h-[360px] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Search className="h-7 w-7" />
      </div>
      <h3 className="mt-3 text-[15px] font-bold text-slate-800">Không tìm thấy thông báo phù hợp</h3>
      <p className="mt-1 text-[12px] text-slate-500 max-w-[280px]">
        Không có thông báo nào khớp với tiêu chí tìm kiếm hoặc bộ lọc hiện tại.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Đặt lại bộ lọc
      </button>
    </div>
  )
}

function formatRelativeTime(isoString: string): string {
  if (isoString.includes('2026-09-08')) return 'Hôm nay'
  if (isoString.includes('2026-09-09')) return 'Hôm qua'
  return 'Gần đây'
}

function formatTime(isoString?: string | null): string {
  if (!isoString) return 'N/A'
  try {
    const d = new Date(isoString)
    const hours = d.getUTCHours().toString().padStart(2, '0')
    const mins = d.getUTCMinutes().toString().padStart(2, '0')
    const day = d.getUTCDate().toString().padStart(2, '0')
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0')
    const year = d.getUTCFullYear()
    return `${hours}:${mins} - ${day}/${month}/${year}`
  } catch {
    return isoString
  }
}
