'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  FileText, Users, Calendar, Clock, MapPin, CheckCircle2, AlertTriangle,
  AlertCircle, XCircle, Search, Filter, MoreHorizontal, ArrowRight, UserPlus,
  RefreshCw, Shield, ShieldCheck, ShieldAlert, Check, X, ChevronRight,
  ExternalLink, Info, Sparkles, History, CalendarDays, BarChart2,
  Lock, ArrowLeftRight, Layers, Eye, HelpCircle, Clock3, Ban, CheckSquare,
  FileSpreadsheet, UserCheck
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PeopleOpsReferenceShell } from './PeopleOpsReferenceShell'

// =============================================================================
// TYPES & QA STATES (WAVE 08 REGISTRATION)
// =============================================================================

export type RegistrationQaStateId =
  | '01-registration-main'
  | '02-active-filters'
  | '03-request-detail'
  | '04-pending'
  | '05-eligibility-pass'
  | '06-eligibility-warning'
  | '07-blocking-conflict'
  | '08-capacity-available'
  | '09-capacity-full'
  | '10-approve-dialog'
  | '11-approve-impact'
  | '12-reject-dialog'
  | '13-rejection-reason-validation'
  | '14-approved-registration'
  | '15-rejected-registration'
  | '16-cancelled-registration'
  | '17-staffing-linkage'
  | '18-duplicate-request'
  | '19-registration-cutoff'
  | '20-self-registration'
  | '21-history'
  | '22-permission-read-only'
  | '23-concurrency'
  | '24-empty'
  | '25-no-results'
  | '26-success'
  | '27-error'

export type CanonicalOperationalRole = 'host' | 'support' | 'technical'
export type CanonicalRegistrationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type RegistrationSource = 'self_registration' | 'manual_assignment' | 'legacy_assignment'
export type MatchMethod = 'exact' | 'normalized' | 'manual'

export interface ShiftRegistrationItem {
  id: string // REG-001
  shift_id: string // REG-002
  user_id: string // REG-003
  operational_role: CanonicalOperationalRole // REG-004
  status: CanonicalRegistrationStatus // REG-005
  source: RegistrationSource // REG-006
  requested_at: string // REG-007
  reviewed_by?: string // REG-008
  reviewed_at?: string // REG-009
  review_notes?: string // REG-010
  cancelled_at?: string // REG-011
  imported_name?: string // REG-012
  created_at: string // REG-013
  updated_at: string // REG-014
  version: number // REG-015

  // Joined applicant metadata
  applicant_name: string
  applicant_email: string
  avatar_initials: string
  avatar_color: string
  applicant_roles: CanonicalOperationalRole[]
  applicant_status: 'active' | 'temporary_leave' | 'left'
  weekly_shifts_count: number
  weekly_hours: number
  fit_score: number // [NEW_ONLY_UNBACKED = YES]

  // Joined shift context
  shift_title: string
  brand: string
  platform: 'TikTok Shop' | 'Shopee Live'
  studio: string
  shift_date: string
  shift_time: string
  shift_cutoff_at: string
  registration_locked: boolean
  role_capacity_required: number
  role_capacity_confirmed: number

  // Evaluated eligibility & conflicts
  eligibility_status: 'pass' | 'warning' | 'conflict_blocking'
  eligibility_reasons: string[]
  conflict_type?: 'overlap' | 'duplicate' | 'temporary_leave' | 'none'
  conflict_details?: string
  duplicate_request_id?: string
}

export interface RegistrationAuditItem {
  id: string
  registration_id: string
  timestamp: string
  actor: string
  actor_permission: 'admin' | 'leader' | 'member' | 'system'
  action: 'requested' | 'approved' | 'rejected' | 'cancelled' | 'staffing_linked'
  details: string
}

// =============================================================================
// DETERMINISTIC FIXTURE DATA
// =============================================================================

export const FIXTURE_REGISTRATIONS: ShiftRegistrationItem[] = [
  {
    id: 'REG-1049',
    shift_id: 'SFT-101',
    user_id: 'usr-mai',
    operational_role: 'host',
    status: 'pending',
    source: 'self_registration',
    requested_at: '2026-09-08 09:15',
    created_at: '2026-09-08 09:15:10',
    updated_at: '2026-09-08 09:15:10',
    version: 1,
    applicant_name: 'Nguyễn Thị Mai Anh',
    applicant_email: 'maianh.nguyen@livestream.vn',
    avatar_initials: 'MA',
    avatar_color: 'bg-emerald-100 text-emerald-700',
    applicant_roles: ['host', 'support'],
    applicant_status: 'active',
    weekly_shifts_count: 2,
    weekly_hours: 7.0,
    fit_score: 95,
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    brand: 'Sanofi / Pharmaton',
    platform: 'TikTok Shop',
    studio: 'Studio A (Tầng 3)',
    shift_date: '10/09/2026',
    shift_time: '14:00 – 17:00',
    shift_cutoff_at: '2026-09-10 12:00',
    registration_locked: false,
    role_capacity_required: 1,
    role_capacity_confirmed: 0,
    eligibility_status: 'pass',
    eligibility_reasons: [
      'Đạt chuẩn năng lực vai trò Host',
      'Tài khoản & nhân sự đang hoạt động',
      'Không trùng lịch với ca phát sóng nào khác',
      'Chỉ tiêu Host còn 1 suất trống (0/1)',
      'Đăng ký trước thời hạn đóng sổ (cutoff)'
    ]
  },
  {
    id: 'REG-1050',
    shift_id: 'SFT-101',
    user_id: 'usr-minh',
    operational_role: 'support',
    status: 'pending',
    source: 'self_registration',
    requested_at: '2026-09-08 09:40',
    created_at: '2026-09-08 09:40:22',
    updated_at: '2026-09-08 09:40:22',
    version: 1,
    applicant_name: 'Lê Tuấn Minh',
    applicant_email: 'tuanminh.le@livestream.vn',
    avatar_initials: 'TM',
    avatar_color: 'bg-amber-100 text-amber-700',
    applicant_roles: ['support', 'technical'],
    applicant_status: 'active',
    weekly_shifts_count: 4,
    weekly_hours: 14.5,
    fit_score: 91,
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    brand: 'Sanofi / Pharmaton',
    platform: 'TikTok Shop',
    studio: 'Studio A (Tầng 3)',
    shift_date: '10/09/2026',
    shift_time: '14:00 – 17:00',
    shift_cutoff_at: '2026-09-10 12:00',
    registration_locked: false,
    role_capacity_required: 2,
    role_capacity_confirmed: 1,
    eligibility_status: 'warning',
    eligibility_reasons: [
      'Đạt chuẩn năng lực vai trò Support',
      'Cảnh báo tải ca: Đã phân 4 ca tuần này (14.5h / 20.0h khuyến nghị)',
      'Không trùng lịch phát sóng cùng giờ',
      'Còn 1 suất Support trống (1/2)'
    ],
    conflict_type: 'none'
  },
  {
    id: 'REG-1051',
    shift_id: 'SFT-101',
    user_id: 'usr-anh',
    operational_role: 'support',
    status: 'pending',
    source: 'manual_assignment',
    requested_at: '2026-09-08 10:05',
    created_at: '2026-09-08 10:05:00',
    updated_at: '2026-09-08 10:05:00',
    version: 1,
    applicant_name: 'Bùi Việt Anh',
    applicant_email: 'vietanh.bui@livestream.vn',
    avatar_initials: 'VA',
    avatar_color: 'bg-teal-100 text-teal-700',
    applicant_roles: ['support', 'technical'],
    applicant_status: 'active',
    weekly_shifts_count: 3,
    weekly_hours: 11.0,
    fit_score: 84,
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    brand: 'Sanofi / Pharmaton',
    platform: 'TikTok Shop',
    studio: 'Studio A (Tầng 3)',
    shift_date: '10/09/2026',
    shift_time: '14:00 – 17:00',
    shift_cutoff_at: '2026-09-10 12:00',
    registration_locked: false,
    role_capacity_required: 2,
    role_capacity_confirmed: 1,
    eligibility_status: 'conflict_blocking',
    eligibility_reasons: [
      'Xung đột lịch trực chặn phê duyệt: Trùng giờ với ca SFT-088 "Vinhomes Mega Live" (13:30 – 16:30 cùng ngày)',
      'Thời gian chồng lấn: 150 phút'
    ],
    conflict_type: 'overlap',
    conflict_details: 'Nhân sự đã được phân bổ chính thức vào ca SFT-088 tại Studio C.'
  },
  {
    id: 'REG-1048',
    shift_id: 'SFT-101',
    user_id: 'usr-thao',
    operational_role: 'host',
    status: 'pending',
    source: 'self_registration',
    requested_at: '2026-09-08 08:30',
    created_at: '2026-09-08 08:30:15',
    updated_at: '2026-09-08 08:30:15',
    version: 1,
    applicant_name: 'Đỗ Phương Thảo',
    applicant_email: 'phuongthao.do@livestream.vn',
    avatar_initials: 'PT',
    avatar_color: 'bg-purple-100 text-purple-700',
    applicant_roles: ['host'],
    applicant_status: 'active',
    weekly_shifts_count: 1,
    weekly_hours: 3.5,
    fit_score: 96,
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    brand: 'Sanofi / Pharmaton',
    platform: 'TikTok Shop',
    studio: 'Studio A (Tầng 3)',
    shift_date: '10/09/2026',
    shift_time: '14:00 – 17:00',
    shift_cutoff_at: '2026-09-10 12:00',
    registration_locked: false,
    role_capacity_required: 1,
    role_capacity_confirmed: 1,
    eligibility_status: 'conflict_blocking',
    eligibility_reasons: [
      'Định mức vị trí Host đã đủ (1/1 suất). Phê duyệt sẽ vượt hạn mức ca trực.',
      'Phát hiện đơn trùng lặp: Ứng viên đã có đơn đăng ký nhận ca này đang chờ xét (REG-1047).'
    ],
    conflict_type: 'duplicate',
    conflict_details: 'Đã tồn tại đơn đăng ký số REG-1047 từ ứng viên cho cùng ca trực.',
    duplicate_request_id: 'REG-1047'
  },
  {
    id: 'REG-1035',
    shift_id: 'SFT-102',
    user_id: 'usr-lan',
    operational_role: 'host',
    status: 'approved',
    source: 'legacy_assignment',
    requested_at: '2026-09-07 14:10',
    reviewed_by: 'Admin Nguyễn Quản Trị',
    reviewed_at: '2026-09-07 16:30',
    review_notes: 'Đã phê duyệt đơn đăng ký, xác nhận nhân sự chính thức trên ca trực.',
    created_at: '2026-09-07 14:10:00',
    updated_at: '2026-09-07 16:30:00',
    version: 2,
    applicant_name: 'Phạm Ngọc Lan',
    applicant_email: 'ngoclan.pham@livestream.vn',
    avatar_initials: 'NL',
    avatar_color: 'bg-pink-100 text-pink-700',
    applicant_roles: ['host'],
    applicant_status: 'active',
    weekly_shifts_count: 3,
    weekly_hours: 10.5,
    fit_score: 98,
    shift_title: 'Shopee Super Brand Day – L\'Oreal Paris',
    brand: 'L\'Oreal Paris',
    platform: 'Shopee Live',
    studio: 'Studio B (Tầng 4)',
    shift_date: '10/09/2026',
    shift_time: '19:00 – 22:00',
    shift_cutoff_at: '2026-09-10 16:00',
    registration_locked: false,
    role_capacity_required: 2,
    role_capacity_confirmed: 2,
    eligibility_status: 'pass',
    eligibility_reasons: [
      'Đã duyệt chính thức bởi Admin Nguyễn Quản Trị',
      'Đã kích hoạt vị trí phân bổ nhân sự tương ứng'
    ]
  },
  {
    id: 'REG-1028',
    shift_id: 'SFT-103',
    user_id: 'usr-binh',
    operational_role: 'host',
    status: 'rejected',
    source: 'self_registration',
    requested_at: '2026-09-06 11:20',
    reviewed_by: 'Leader Hoàng Trưởng Ca',
    reviewed_at: '2026-09-06 14:45',
    review_notes: 'Chưa đủ chứng chỉ kiểm duyệt livestream ngành hàng điện tử cao cấp Samsung.',
    created_at: '2026-09-06 11:20:00',
    updated_at: '2026-09-06 14:45:00',
    version: 2,
    applicant_name: 'Trần Văn Bình',
    applicant_email: 'vanbinh.tran@livestream.vn',
    avatar_initials: 'VB',
    avatar_color: 'bg-slate-100 text-slate-700',
    applicant_roles: ['host', 'support'],
    applicant_status: 'temporary_leave',
    weekly_shifts_count: 0,
    weekly_hours: 0,
    fit_score: 72,
    shift_title: 'Samsung Galaxy Livestream Sale',
    brand: 'Samsung',
    platform: 'TikTok Shop',
    studio: 'Studio C (Tầng 2)',
    shift_date: '11/09/2026',
    shift_time: '09:00 – 12:00',
    shift_cutoff_at: '2026-09-11 07:00',
    registration_locked: true,
    role_capacity_required: 1,
    role_capacity_confirmed: 0,
    eligibility_status: 'conflict_blocking',
    eligibility_reasons: [
      'Không đủ chứng chỉ năng lực Host ngành hàng điện tử',
      'Nhân sự đang trong diện tạm nghỉ (temporary_leave)'
    ],
    conflict_type: 'temporary_leave',
    conflict_details: 'Nhân sự đang trong thời gian nghỉ phép tạm thời đến hết 15/09/2026.'
  },
  {
    id: 'REG-1022',
    shift_id: 'SFT-101',
    user_id: 'usr-hoang',
    operational_role: 'host',
    status: 'cancelled',
    source: 'self_registration',
    requested_at: '2026-09-07 10:00',
    cancelled_at: '2026-09-08 11:30',
    review_notes: 'Thành viên tự hủy đăng ký trước thời hạn cutoff ca trực.',
    created_at: '2026-09-07 10:00:00',
    updated_at: '2026-09-08 11:30:00',
    version: 2,
    applicant_name: 'Hoàng Trọng Nghĩa',
    applicant_email: 'nghia.hoang@livestream.vn',
    avatar_initials: 'HN',
    avatar_color: 'bg-slate-200 text-slate-700',
    applicant_roles: ['host', 'support'],
    applicant_status: 'active',
    weekly_shifts_count: 2,
    weekly_hours: 6.0,
    fit_score: 91,
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    brand: 'Sanofi / Pharmaton',
    platform: 'TikTok Shop',
    studio: 'Studio A (Tầng 3)',
    shift_date: '10/09/2026',
    shift_time: '14:00 – 17:00',
    shift_cutoff_at: '2026-09-10 12:00',
    registration_locked: false,
    role_capacity_required: 1,
    role_capacity_confirmed: 0,
    eligibility_status: 'pass',
    eligibility_reasons: [
      'Đơn đã bị hủy bởi thành viên (AuditAction: cancel_registration)',
      'Không chiếm dụng định mức ca trực (isStaffedRegistration = false)'
    ],
    conflict_type: 'none'
  }
]

export const REGISTRATION_AUDIT_LOGS: RegistrationAuditItem[] = [
  {
    id: 'AUD-01',
    registration_id: 'REG-1049',
    timestamp: '2026-09-08 09:15:10',
    actor: 'Nguyễn Thị Mai Anh',
    actor_permission: 'member',
    action: 'requested',
    details: 'Gửi đơn đăng ký nhận ca SFT-101 (Pharmaton Live) với vai trò Host. Nguồn: Tự đăng ký (self_registration).'
  },
  {
    id: 'AUD-02',
    registration_id: 'REG-1035',
    timestamp: '2026-09-07 16:30:00',
    actor: 'Admin Nguyễn Quản Trị',
    actor_permission: 'admin',
    action: 'approved',
    details: 'Phê duyệt đơn đăng ký REG-1035. Xác nhận nhân sự chính thức đảm nhiệm vai trò Host trên ca trực.'
  },
  {
    id: 'AUD-03',
    registration_id: 'REG-1035',
    timestamp: '2026-09-07 16:30:05',
    actor: 'Hệ thống vận hành',
    actor_permission: 'system',
    action: 'staffing_linked',
    details: 'Đồng bộ tự động: Cập nhật chỉ tiêu Host ca SFT-102 từ 1/2 lên 2/2. Trạng thái ca: Đủ nhân sự.'
  },
  {
    id: 'AUD-04',
    registration_id: 'REG-1028',
    timestamp: '2026-09-06 14:45:00',
    actor: 'Hoàng Trưởng Ca',
    actor_permission: 'leader',
    action: 'rejected',
    details: 'Từ chối đơn đăng ký. Lý do bắt buộc: Chưa đủ chứng chỉ kiểm duyệt livestream ngành hàng điện tử Samsung.'
  },
  {
    id: 'AUD-05',
    registration_id: 'REG-1022',
    timestamp: '2026-09-08 11:30:00',
    actor: 'Hoàng Trọng Nghĩa',
    actor_permission: 'member',
    action: 'cancelled',
    details: 'Thành viên tự hủy đơn đăng ký trước giờ cutoff (cancel_registration RPC). Không chiếm dụng chỉ tiêu ca.'
  }
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function RegistrationReferenceMock() {
  const searchParams = useSearchParams()
  const initialQaParam = (searchParams.get('state') || searchParams.get('qaState') || '01-registration-main') as RegistrationQaStateId

  const [qaState, setQaState] = useState<RegistrationQaStateId>(initialQaParam)
  const [selectedRegId, setSelectedRegId] = useState<string>('REG-1049')
  const [statusFilter, setStatusFilter] = useState<'all' | CanonicalRegistrationStatus>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | CanonicalOperationalRole>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [qaOpen, setQaOpen] = useState(false)

  // Sync state if URL search param changes
  useEffect(() => {
    const p = searchParams.get('state') || searchParams.get('qaState')
    if (p) {
      setQaState(p as RegistrationQaStateId)
    }
  }, [searchParams])

  // Select registration item based on state override
  const activeReg = useMemo(() => {
    if (qaState === '06-eligibility-warning') {
      return FIXTURE_REGISTRATIONS.find(r => r.id === 'REG-1050') || FIXTURE_REGISTRATIONS[0]
    }
    if (qaState === '07-blocking-conflict') {
      return FIXTURE_REGISTRATIONS.find(r => r.id === 'REG-1051') || FIXTURE_REGISTRATIONS[0]
    }
    if (qaState === '09-capacity-full' || qaState === '18-duplicate-request') {
      return FIXTURE_REGISTRATIONS.find(r => r.id === 'REG-1048') || FIXTURE_REGISTRATIONS[0]
    }
    if (qaState === '14-approved-registration' || qaState === '17-staffing-linkage') {
      return FIXTURE_REGISTRATIONS.find(r => r.id === 'REG-1035') || FIXTURE_REGISTRATIONS[0]
    }
    if (qaState === '15-rejected-registration') {
      return FIXTURE_REGISTRATIONS.find(r => r.id === 'REG-1028') || FIXTURE_REGISTRATIONS[0]
    }
    if (qaState === '16-cancelled-registration') {
      return FIXTURE_REGISTRATIONS.find(r => r.id === 'REG-1022') || FIXTURE_REGISTRATIONS[0]
    }
    return FIXTURE_REGISTRATIONS.find(r => r.id === selectedRegId) || FIXTURE_REGISTRATIONS[0]
  }, [selectedRegId, qaState])

  // Metrics
  const totalCount = FIXTURE_REGISTRATIONS.length
  const pendingCount = FIXTURE_REGISTRATIONS.filter(r => r.status === 'pending').length
  const approvedCount = FIXTURE_REGISTRATIONS.filter(r => r.status === 'approved').length
  const rejectedCount = FIXTURE_REGISTRATIONS.filter(r => r.status === 'rejected').length
  const cancelledCount = FIXTURE_REGISTRATIONS.filter(r => r.status === 'cancelled').length

  // Filtered registrations
  const displayRegistrations = useMemo(() => {
    if (qaState === '24-empty') return []
    if (qaState === '25-no-results') return []

    return FIXTURE_REGISTRATIONS.filter(r => {
      // Force filter for state 02 and 04
      if (qaState === '02-active-filters') {
        if (r.status !== 'pending' || r.operational_role !== 'host') return false
      }
      if (qaState === '04-pending') {
        if (r.status !== 'pending') return false
      }
      if (qaState === '16-cancelled-registration') {
        // Show all but keep REG-1022 visible or filter
      }

      // Normal filters
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (roleFilter !== 'all' && r.operational_role !== roleFilter) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesName = r.applicant_name.toLowerCase().includes(q)
        const matchesShift = r.shift_title.toLowerCase().includes(q)
        const matchesId = r.id.toLowerCase().includes(q)
        if (!matchesName && !matchesShift && !matchesId) return false
      }
      return true
    })
  }, [statusFilter, roleFilter, searchQuery, qaState])

  return (
    <PeopleOpsReferenceShell
      active="Registration"
      searchPlaceholder="Tìm kiếm đơn đăng ký, ứng viên, ca trực, vai trò..."
    >
      <div data-testid="registration-reference-mock" className="flex h-full flex-col bg-slate-50 text-slate-900">
        {/* TOP STATUS BAR: CAS & READ-ONLY BANNERS */}
        {qaState === '22-permission-read-only' && (
          <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-6 py-2 text-[12px] text-amber-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span>
                <strong>Chế độ chỉ xem (Permission Read-Only):</strong> Bạn đang đăng nhập với quyền <strong>Member (registrations:read)</strong>. Thao tác phê duyệt và từ chối đơn bị vô hiệu hóa.
              </span>
            </div>
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 text-[10px]">
              registrations:review = DENIED
            </Badge>
          </div>
        )}

        {qaState === '23-concurrency' && (
          <div className="flex items-center justify-between bg-rose-50 border-b border-rose-200 px-6 py-2 text-[12px] text-rose-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>
                <strong>Xung đột cập nhật đồng thời (Optimistic Concurrency Conflict):</strong> Đơn đăng ký {activeReg.id} đã bị thay đổi bởi quản trị viên khác (Bản ghi local v1 vs Máy chủ v2). Vui lòng làm mới dữ liệu để xem trạng thái phê duyệt mới nhất trước khi thao tác tiếp.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQaState('01-registration-main')}
              className="flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Tải lại dữ liệu (Reload v2)</span>
            </button>
          </div>
        )}

        {/* HEADER SECTION */}
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Hàng đợi đăng ký ca trực</h1>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700">
                  Registration Workspace
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Thẩm định tính hợp lệ, phê duyệt và liên kết đơn đăng ký với phân bổ nhân sự vận hành (Staffing).
              </p>
            </div>

            {/* HEADER METRICS SUMMARY */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-center">
                <span className="text-[11px] text-slate-500 font-medium">TỔNG SỐ ĐƠN:</span>
                <span className="text-sm font-bold text-slate-900">{totalCount}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-center">
                <span className="text-[11px] text-amber-700 font-medium">CHỜ XÉT DUYỆT:</span>
                <span className="text-sm font-bold text-amber-800">{pendingCount} đơn</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-center">
                <span className="text-[11px] text-emerald-700 font-medium">ĐÃ PHÊ DUYỆT:</span>
                <span className="text-sm font-bold text-emerald-800">{approvedCount} đơn</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-1.5 text-center">
                <span className="text-[11px] text-rose-700 font-medium">ĐÃ TỪ CHỐI:</span>
                <span className="text-sm font-bold text-rose-800">{rejectedCount} đơn</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-center">
                <span className="text-[11px] text-slate-600 font-medium">ĐÃ HỦY:</span>
                <span className="text-sm font-bold text-slate-700">{cancelledCount} đơn</span>
              </div>
            </div>
          </div>

          {/* CONTROLS & FILTER BAR */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search Bar */}
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo mã đơn, nhân sự, ca..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-[12px] text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Status Tabs */}
              <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'all' && qaState !== '02-active-filters' && qaState !== '04-pending' && qaState !== '16-cancelled-registration'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'pending' || qaState === '02-active-filters' || qaState === '04-pending'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Chờ duyệt ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('approved')}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'approved' && qaState !== '02-active-filters' && qaState !== '04-pending'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đã duyệt ({approvedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('rejected')}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'rejected' && qaState !== '02-active-filters' && qaState !== '04-pending'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Từ chối ({rejectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('cancelled')}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'cancelled' || qaState === '16-cancelled-registration'
                      ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đã hủy ({cancelledCount})
                </button>
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 border border-slate-200 bg-white rounded-md px-2 py-1">
                <Filter className="h-3 w-3 text-slate-400" />
                <span>Vai trò:</span>
                <select
                  value={qaState === '02-active-filters' ? 'host' : roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | CanonicalOperationalRole)}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="all">Tất cả vai trò</option>
                  <option value="host">Host (MC chính)</option>
                  <option value="support">Support (Trợ live)</option>
                  <option value="technical">Technical (Kỹ thuật)</option>
                </select>
              </div>

              {(statusFilter !== 'all' || roleFilter !== 'all' || searchQuery || qaState === '02-active-filters') && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all')
                    setRoleFilter('all')
                    setSearchQuery('')
                    setQaState('01-registration-main')
                  }}
                  className="text-[11px] text-blue-600 hover:underline px-1"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQaState('20-self-registration')}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
              >
                <UserPlus className="h-3.5 w-3.5 text-blue-600" />
                <span>Tự đăng ký ca (Member)</span>
              </button>
              <button
                type="button"
                onClick={() => setQaState('21-history')}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
              >
                <History className="h-3.5 w-3.5 text-slate-600" />
                <span>Lịch sử kiểm toán</span>
              </button>
            </div>
          </div>
        </div>

        {/* TOAST ALERTS (STATE 26 & 27) */}
        {qaState === '26-success' && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>
                <strong>Phê duyệt đơn đăng ký thành công!</strong> Đã duyệt {activeReg.id} cho <strong>{activeReg.applicant_name}</strong> xác nhận nhân sự chính thức trên ca trực.
              </span>
            </div>
            <button type="button" onClick={() => setQaState('01-registration-main')} className="text-emerald-700 hover:text-emerald-900">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {qaState === '27-error' && (
          <div className="mx-6 mt-3 flex items-center justify-between rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-[12px] text-rose-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>
                <strong>Lỗi phê duyệt: Phát hiện xung đột lịch trực!</strong> Không thể phê duyệt đơn {activeReg.id} do nhân sự bị trùng giờ với ca Vinhomes Mega Live (13:30 – 16:30).
              </span>
            </div>
            <button type="button" onClick={() => setQaState('01-registration-main')} className="text-rose-700 hover:text-rose-900">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* MAIN WORKSPACE CONTENT: SPLIT QUEUE & DETAIL */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: REGISTRATION QUEUE TABLE */}
          <div className="flex-1 overflow-y-auto border-r border-slate-200 bg-white">
            {displayRegistrations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                {qaState === '25-no-results' ? (
                  <>
                    <Search className="h-10 w-10 text-slate-300 mb-2" />
                    <h3 className="text-sm font-bold text-slate-800">Không tìm thấy kết quả phù hợp</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Không tìm thấy đơn đăng ký nào khớp với tiêu chí tìm kiếm hiện tại. Vui lòng thử lại với từ khóa khác.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        setStatusFilter('all')
                        setRoleFilter('all')
                        setQaState('01-registration-main')
                      }}
                      className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Đặt lại bộ lọc
                    </button>
                  </>
                ) : (
                  <>
                    <FileText className="h-10 w-10 text-slate-300 mb-2" />
                    <h3 className="text-sm font-bold text-slate-800">Hàng đợi đăng ký trống</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Hiện tại không có đơn đăng ký ca trực nào cần xử lý trong hệ thống.
                    </p>
                    <button
                      type="button"
                      onClick={() => setQaState('01-registration-main')}
                      className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      Tải lại danh sách mặc định
                    </button>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold text-slate-600 backdrop-blur-xs">
                    <th className="py-2.5 px-4">MÃ ĐƠN & ỨNG VIÊN</th>
                    <th className="py-2.5 px-3">VAI TRÒ YÊU CẦU</th>
                    <th className="py-2.5 px-3">CA PHÁT SÓNG</th>
                    <th className="py-2.5 px-3 text-center">HẠN MỨC</th>
                    <th className="py-2.5 px-3 text-center">THẨM ĐỊNH</th>
                    <th className="py-2.5 px-4 text-right">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px]">
                  {displayRegistrations.map((reg) => {
                    const isSelected = reg.id === activeReg.id
                    return (
                      <tr
                        key={reg.id}
                        onClick={() => setSelectedRegId(reg.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* APPLICANT IDENTITY (Col 1) */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${reg.avatar_color}`}>
                              {reg.avatar_initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                                <span>{reg.applicant_name}</span>
                                <span className="font-mono text-[10px] text-slate-400 font-normal">#{reg.id}</span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {reg.requested_at} · <span className="font-mono">{reg.source}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* REQUESTED ROLE (Col 2) */}
                        <td className="py-3 px-3">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-bold tracking-wider ${
                              reg.operational_role === 'host'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : reg.operational_role === 'support'
                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                : 'border-purple-200 bg-purple-50 text-purple-700'
                            }`}
                          >
                            {reg.operational_role}
                          </Badge>
                        </td>

                        {/* SHIFT CONTEXT (Col 3) */}
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800 truncate max-w-[200px]" title={reg.shift_title}>
                            {reg.shift_title}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {reg.shift_date} · {reg.shift_time}
                          </div>
                        </td>

                        {/* ROLE CAPACITY (Col 4) */}
                        <td className="py-3 px-3 text-center">
                          <span className={`font-mono font-bold text-[11px] ${
                            reg.role_capacity_confirmed >= reg.role_capacity_required
                              ? 'text-rose-600'
                              : 'text-slate-700'
                          }`}>
                            {reg.role_capacity_confirmed}/{reg.role_capacity_required}
                          </span>
                        </td>

                        {/* ELIGIBILITY & CONFLICT RISK (Col 5) */}
                        <td className="py-3 px-3 text-center">
                          {reg.status === 'approved' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-semibold">
                              ✓ Đã duyệt
                            </Badge>
                          ) : reg.status === 'rejected' ? (
                            <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px] font-semibold">
                              ✕ Từ chối
                            </Badge>
                          ) : reg.status === 'cancelled' ? (
                            <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-semibold">
                              Đã hủy
                            </Badge>
                          ) : reg.eligibility_status === 'pass' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Đạt</span>
                            </span>
                          ) : reg.eligibility_status === 'warning' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>Cảnh báo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600">
                              <XCircle className="h-3.5 w-3.5" />
                              <span>Xung đột</span>
                            </span>
                          )}
                        </td>

                        {/* DECISION ACTIONS (Col 6) */}
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedRegId(reg.id)
                              setQaState('03-request-detail')
                            }}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* RIGHT: COMPREHENSIVE REQUEST DETAIL DRAWER */}
          <div className="w-[440px] flex-shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50/50 p-4 space-y-4">
            {/* 1. APPLICANT & REQUEST HEADER */}
            <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600">{activeReg.id}</span>
                    <span className="text-[10px] text-slate-400 font-mono">revision v{activeReg.version}</span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-0.5">{activeReg.applicant_name}</h3>
                  <div className="text-[11px] text-slate-500">{activeReg.applicant_email}</div>
                </div>
                {activeReg.status === 'pending' ? (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-semibold">
                    Chờ xem xét
                  </Badge>
                ) : activeReg.status === 'approved' ? (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-semibold">
                    Đã phê duyệt
                  </Badge>
                ) : activeReg.status === 'rejected' ? (
                  <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 text-[10px] font-semibold">
                    Đã từ chối
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700 text-[10px] font-semibold">
                    Đã hủy (Cancelled)
                  </Badge>
                )}
              </div>

              {/* REQUEST METADATA BAR */}
              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-[10px]">
                <div>
                  <span className="text-slate-400 block uppercase">VAI TRÒ YÊU CẦU:</span>
                  <span className="font-bold text-slate-800 uppercase">{activeReg.operational_role}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase">THỜI ĐIỂM NỘP:</span>
                  <span className="text-slate-700">{activeReg.requested_at}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase">NGUỒN ĐƠN:</span>
                  <span className="font-mono text-slate-700">{activeReg.source}</span>
                </div>
              </div>
            </div>

            {/* 2. SHIFT CONTEXT PANEL */}
            <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>BỐI CẢNH CA PHÁT SÓNG</span>
                <span className="font-mono text-blue-600 font-semibold">{activeReg.shift_id}</span>
              </div>
              <div className="space-y-1 text-[11px]">
                <div className="font-semibold text-slate-900">{activeReg.shift_title}</div>
                <div className="text-slate-600 flex items-center gap-2 text-[10px]">
                  <span>📅 {activeReg.shift_date}</span>
                  <span>⏰ {activeReg.shift_time}</span>
                  <span>📍 {activeReg.studio}</span>
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex justify-between">
                  <span>Hạn đóng đăng ký: {activeReg.shift_cutoff_at}</span>
                  <span className="font-semibold text-slate-700">Định biên vai trò: {activeReg.role_capacity_confirmed}/{activeReg.role_capacity_required}</span>
                </div>
              </div>
            </div>

            {/* 3. ELIGIBILITY RULES & AUDIT CHECKLIST */}
            <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>KẾT QUẢ THẨM ĐỊNH ĐIỀU KIỆN (OLD AUTHORITY)</span>
                {activeReg.eligibility_status === 'pass' ? (
                  <span className="text-[10px] font-bold text-emerald-600">100% ĐẠT</span>
                ) : activeReg.eligibility_status === 'warning' ? (
                  <span className="text-[10px] font-bold text-amber-600">CẢNH BÁO</span>
                ) : (
                  <span className="text-[10px] font-bold text-rose-600">XUNG ĐỘT CHẶN</span>
                )}
              </div>

              <div className="space-y-1.5 text-[11px]">
                {activeReg.eligibility_reasons.map((reason, idx) => (
                  <div key={idx} className="flex items-start gap-1.5">
                    {reason.includes('Xung đột') || reason.includes('đã đủ') || reason.includes('trùng lặp') || reason.includes('Không đủ') ? (
                      <XCircle className="h-3.5 w-3.5 text-rose-600 mt-0.5 flex-shrink-0" />
                    ) : reason.includes('Cảnh báo') ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={reason.includes('Xung đột') || reason.includes('đã đủ') ? 'text-rose-700 font-medium' : reason.includes('Cảnh báo') ? 'text-amber-800' : 'text-slate-700'}>
                      {reason}
                    </span>
                  </div>
                ))}
              </div>

              {/* UNBACKED FIT SCORE DISCLOSURE */}
              <div className="mt-2 rounded bg-slate-50 p-2 text-[10px] text-slate-500 border border-slate-100 flex items-center justify-between">
                <span>Điểm dự báo mức độ phù hợp (AI Fit Score):</span>
                <span className="font-bold text-slate-800">{activeReg.fit_score}%</span>
                <Badge variant="outline" className="border-slate-300 text-[9px] text-slate-500">
                  NEW_ONLY_UNBACKED = YES
                </Badge>
              </div>
            </div>

            {/* 4. CANCELLED RECORD HIGHLIGHT (FOR REG-1022 / STATE 16) */}
            {activeReg.status === 'cancelled' && (
              <div className="rounded-lg border border-slate-300 bg-slate-100/90 p-3.5 text-[11px] text-slate-900 space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock3 className="h-4 w-4 text-slate-600" />
                  <span>Chứng cứ đơn đã hủy (Cancelled Registration Evidence)</span>
                </div>
                <div className="text-[10px] space-y-1 text-slate-700">
                  <div>Thời điểm hủy (REG-011 cancelled_at): <strong className="font-mono text-slate-900">{activeReg.cancelled_at}</strong></div>
                  <div>Ghi chú hủy (REG-010 review_notes): <span>{activeReg.review_notes}</span></div>
                  <div>Hành động kiểm toán: <code className="bg-slate-200 px-1 rounded font-mono">cancel_registration</code> qua RPC <code className="font-mono">cancel_own_shift_registration</code></div>
                  <div className="mt-1 pt-1 border-t border-slate-300 text-slate-600">
                    Quy tắc toàn vẹn: Đơn hủy không được tính vào định mức nhân sự đã chốt (isStaffedRegistration = false) và giải phóng vị trí ca trực.
                  </div>
                </div>
              </div>
            )}

            {/* 5. ARCHITECTURAL SEPARATION & STAFFING PROJECTION CALLOUT */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-[11px] text-blue-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-600" />
                <span>Quy tắc kiến trúc: Quy trình Đăng ký vs Góc nhìn Phân bổ vận hành</span>
              </div>
              <p className="text-[10px] leading-relaxed text-blue-800">
                Đơn đăng ký (ShiftRegistration) là đề nghị tham gia ca trực. Khi được phê duyệt, bản ghi trở thành căn cứ phân bổ chính thức trên ca trực; góc nhìn vận hành giải quyết nhân sự trực tiếp từ đơn đã duyệt mà không tạo thực thể phân bổ riêng biệt.
              </p>
            </div>

            {/* 6. AUDIT / HISTORICAL DECISION INFO */}
            {activeReg.status !== 'pending' && activeReg.status !== 'cancelled' && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700 space-y-1">
                <div className="font-semibold text-slate-900">
                  Đơn đã được xử lý bởi <strong className="text-slate-800">{activeReg.reviewed_by}</strong> lúc {activeReg.reviewed_at}:
                </div>
                <p className="italic text-slate-600 text-[10px]">
                  &ldquo;{activeReg.review_notes}&rdquo;
                </p>
                {activeReg.status === 'approved' && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-emerald-700 font-medium">✓ Đã liên kết vị trí ca trực: SFT-102 (Host)</span>
                    <button
                      type="button"
                      onClick={() => setQaState('17-staffing-linkage')}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      Xem liên kết
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 7. ACTION BUTTONS */}
            <div className="flex items-center gap-2 pt-1">
              {activeReg.status === 'cancelled' ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-md border border-slate-200 bg-slate-100 py-2 text-[12px] font-semibold text-slate-400 cursor-not-allowed"
                >
                  Đơn đã hủy - Không khả dụng
                </button>
              ) : activeReg.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    disabled={qaState === '22-permission-read-only'}
                    onClick={() => setQaState('10-approve-dialog')}
                    className="flex-1 rounded-md bg-emerald-600 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                  >
                    ✓ Phê duyệt đơn
                  </button>
                  <button
                    type="button"
                    disabled={qaState === '22-permission-read-only'}
                    onClick={() => setQaState('12-reject-dialog')}
                    className="flex-1 rounded-md border border-rose-200 bg-rose-50 py-2 text-[12px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    ✕ Từ chối
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setQaState('17-staffing-linkage')}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  <Layers className="h-3.5 w-3.5 text-purple-600" />
                  <span>Đối soát Phân bổ vận hành</span>
                </button>
              )}
            </div>

            {/* LINK TO FULL DETAILS MODAL */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setQaState('03-request-detail')}
                className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <span>Xem chi tiết 15 trường cơ sở dữ liệu (REG-001 ~ REG-015)</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* DETERMINISTIC QA MODALS & DIALOGS */}
        {/* ===================================================================== */}

        {/* STATE 03: CANONICAL 15 DB FIELDS INSPECTOR */}
        {qaState === '03-request-detail' && (
          <ModalWrapper title="Bản ghi đăng ký ca trực (ShiftRegistration Data Inspector)" onClose={() => setQaState('01-registration-main')}>
            <div className="space-y-3 text-[11px]">
              <p className="text-slate-600">
                Toàn bộ 15 trường dữ liệu chuẩn theo hợp đồng cơ sở dữ liệu (lib/types/database.types.ts):
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-001 id</span>
                  <span className="font-bold text-slate-800">{activeReg.id}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-002 shift_id</span>
                  <span className="font-bold text-slate-800">{activeReg.shift_id}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-003 user_id</span>
                  <span className="font-bold text-slate-800">{activeReg.user_id}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-004 operational_role</span>
                  <span className="font-bold text-slate-800">{activeReg.operational_role}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-005 status</span>
                  <span className="font-bold text-slate-800">{activeReg.status}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-006 source</span>
                  <span className="font-bold text-slate-800">{activeReg.source}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-007 requested_at</span>
                  <span className="font-bold text-slate-800">{activeReg.requested_at}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-008 reviewed_by</span>
                  <span className="font-bold text-slate-800">{activeReg.reviewed_by || '(null)'}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-009 reviewed_at</span>
                  <span className="font-bold text-slate-800">{activeReg.reviewed_at || '(null)'}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-010 review_notes</span>
                  <span className="font-bold text-slate-800">{activeReg.review_notes || '(null)'}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-011 cancelled_at</span>
                  <span className="font-bold text-slate-800">{activeReg.cancelled_at || '(null)'}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-012 imported_name</span>
                  <span className="font-bold text-slate-800">{activeReg.imported_name || '(null)'}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-013 created_at</span>
                  <span className="font-bold text-slate-800">{activeReg.created_at}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2">
                  <span className="text-slate-400 block">REG-014 updated_at</span>
                  <span className="font-bold text-slate-800">{activeReg.updated_at}</span>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 p-2 col-span-2">
                  <span className="text-slate-400 block">REG-015 version (CAS Concurrency)</span>
                  <span className="font-bold text-blue-700">{activeReg.version}</span>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md bg-slate-800 px-4 py-1.5 font-semibold text-white hover:bg-slate-900"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 10 & 11: APPROVE DIALOG & IMPACT NOTICE */}
        {(qaState === '10-approve-dialog' || qaState === '11-approve-impact') && (
          <ModalWrapper
            title="Xác nhận phê duyệt đơn đăng ký ca trực"
            subtitle={`Đơn #${activeReg.id} · Ứng viên: ${activeReg.applicant_name}`}
            onClose={() => setQaState('01-registration-main')}
          >
            <div className="space-y-4 text-[12px]">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-[13px]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Xác nhận duyệt vai trò {activeReg.operational_role.toUpperCase()}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  Bạn đang thao tác duyệt đơn của <strong>{activeReg.applicant_name}</strong> cho ca <strong>{activeReg.shift_title}</strong>.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 text-[11px]">
                  <div>
                    <span className="text-[10px] text-emerald-700 block">Hạn mức trước khi duyệt:</span>
                    <span className="font-mono font-bold text-slate-800">{activeReg.role_capacity_confirmed}/{activeReg.role_capacity_required}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 block">Hạn mức sau khi duyệt:</span>
                    <span className="font-mono font-bold text-emerald-700">{activeReg.role_capacity_confirmed + 1}/{activeReg.role_capacity_required} (Đủ chỉ tiêu)</span>
                  </div>
                </div>
              </div>

              {/* IMPACT NOTICE */}
              <div className="rounded-md border border-blue-200 bg-blue-50/80 p-3 text-[11px] text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-blue-600" />
                  <span>Tác động vận hành (Operational Staffing Effect):</span>
                </div>
                <p className="text-[10px] leading-relaxed text-blue-800">
                  Hành động này cập nhật trạng thái đơn {activeReg.id} thành <code>approved</code>. Bản ghi ShiftRegistration được phê duyệt này trở thành căn cứ phân bổ nhân sự chính thức (authoritative for staffing). Hạn mức vai trò được cập nhật, góc nhìn điều phối vận hành ca trực {activeReg.shift_id} sẽ tự động phân giải {activeReg.applicant_name} vào vai trò {activeReg.operational_role.toUpperCase()}, và toàn bộ lịch sử đăng ký được lưu trữ vĩnh viễn.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Ghi chú phê duyệt (Tùy chọn):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Đạt yêu cầu thương hiệu, đã duyệt bởi Admin"
                  defaultValue="Đạt chuẩn kỹ năng, đã xác nhận qua phỏng vấn"
                  className="h-8 w-full rounded border border-slate-200 px-2.5 text-[12px] focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('26-success')}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-700 shadow-sm"
                >
                  Xác nhận duyệt & Gán phân bổ
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 12 & 13: REJECT DIALOG & MANDATORY REASON VALIDATION */}
        {(qaState === '12-reject-dialog' || qaState === '13-rejection-reason-validation') && (
          <ModalWrapper
            title="Từ chối đơn đăng ký ca trực"
            subtitle={`Đơn #${activeReg.id} · Ứng viên: ${activeReg.applicant_name}`}
            onClose={() => setQaState('01-registration-main')}
          >
            <div className="space-y-4 text-[12px]">
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3.5 text-rose-950 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-[13px]">
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Xác nhận từ chối đơn đăng ký</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-800">
                  Đơn đăng ký sẽ chuyển sang trạng thái <code>rejected</code>. Vị trí {activeReg.operational_role.toUpperCase()} trong ca trực sẽ tiếp tục mở cho ứng viên khác.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Lý do từ chối (Bắt buộc theo chuẩn kiểm toán):
                </label>
                <textarea
                  rows={3}
                  value={qaState === '13-rejection-reason-validation' ? '' : rejectReason || 'Không đáp ứng tiêu chuẩn giọng nói và phong cách thương hiệu.'}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết từ chối..."
                  className={`w-full rounded border p-2 text-[12px] focus:outline-none ${
                    qaState === '13-rejection-reason-validation' ? 'border-rose-500 bg-rose-50/30' : 'border-slate-200'
                  }`}
                />
                {qaState === '13-rejection-reason-validation' && (
                  <div className="mt-1 text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Vui lòng nhập lý do từ chối (Không được để trống theo quy định kiểm toán).</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (qaState === '13-rejection-reason-validation') return
                    setQaState('01-registration-main')
                  }}
                  className="rounded-md bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700 shadow-sm"
                >
                  Xác nhận từ chối đơn
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 17: REGISTRATION VS STAFFING SEPARATION & LINKAGE */}
        {qaState === '17-staffing-linkage' && (
          <ModalWrapper title="Registration vs Staffing Separation & Linkage" onClose={() => setQaState('01-registration-main')}>
            <div className="space-y-4 text-[12px]">
              <div className="rounded-lg border border-purple-200 bg-purple-50/70 p-3.5 text-purple-900 space-y-2">
                <div className="font-bold text-[13px] flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-600" />
                  <span>Quy trình Đăng ký vs Góc nhìn Phân bổ vận hành (Conceptual Separation)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-purple-800">
                  Quy trình đăng ký (Registration workflow) và góc nhìn phân bổ vận hành (Operational Staffing view) là hai khái niệm nghiệp vụ khác nhau. Mối quan hệ phân bổ nhân sự chính thức được lưu trữ trực tiếp bởi bản ghi <code>ShiftRegistration</code> đã duyệt; không có thực thể phân bổ riêng biệt nào được tạo ra.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                {/* Registration Side */}
                <div className="rounded border border-slate-200 bg-white p-3 space-y-1.5">
                  <span className="font-bold text-slate-800 block text-[12px] border-b border-slate-100 pb-1">
                    Registration Workflow Record
                  </span>
                  <div>Mã đăng ký: <strong className="font-mono text-blue-600">{activeReg.id}</strong></div>
                  <div>Bảng cơ sở dữ liệu: <code className="bg-slate-100 text-slate-700 px-1 rounded">shift_registrations</code></div>
                  <div>Ứng viên: <span className="font-medium text-slate-900">{activeReg.applicant_name}</span></div>
                  <div>Vai trò yêu cầu: <span className="font-semibold text-slate-800 uppercase">{activeReg.operational_role}</span></div>
                  <div>Trạng thái: <Badge className="bg-emerald-100 text-emerald-800 text-[9px] font-bold">approved</Badge></div>
                  <div>Nguồn gốc (source): <code className="text-blue-700 bg-blue-50 px-1 rounded">{activeReg.source}</code></div>
                  <div>Thời điểm nộp: <span className="text-slate-600">{activeReg.requested_at}</span></div>
                </div>

                {/* Operational Staffing View Side */}
                <div className="rounded border border-slate-200 bg-white p-3 space-y-1.5">
                  <span className="font-bold text-slate-800 block text-[12px] border-b border-slate-100 pb-1">
                    Operational Staffing View
                  </span>
                  <div>Ca trực: <strong className="font-mono text-purple-600">{activeReg.shift_id}</strong></div>
                  <div>Vai trò ca: <span className="font-semibold text-slate-800 uppercase">{activeReg.operational_role}</span></div>
                  <div>Nhân sự đảm nhiệm: <span className="font-medium text-slate-900">{activeReg.applicant_name}</span></div>
                  <div>Định biên ca: <span className="font-mono font-bold text-emerald-700">{activeReg.role_capacity_confirmed}/{activeReg.role_capacity_required} (Đã chốt)</span></div>
                  <div>Căn cứ nguồn gốc: <code className="text-purple-700 bg-purple-50 px-1 rounded">provenance: {activeReg.id}</code></div>
                  <div>Nguồn dữ liệu: <span className="text-slate-600 text-[10px]">Trích xuất từ ShiftRegistration (status = approved)</span></div>
                </div>
              </div>

              <div className="rounded bg-slate-50 border border-slate-200 p-2.5 text-[10px] text-slate-600 leading-relaxed">
                Registration and operational staffing are different workflow concepts. The authoritative staffing relationship is backed by ShiftRegistration; no separate StaffingAssignment persistence entity is implied here.
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 19: REGISTRATION CUTOFF LOCKED STATE */}
        {qaState === '19-registration-cutoff' && (
          <ModalWrapper title="Cảnh báo: Ca trực đã khóa đăng ký (Cutoff Expired)" onClose={() => setQaState('01-registration-main')}>
            <div className="space-y-4 text-[12px]">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 space-y-2">
                <div className="flex items-center gap-2 font-bold text-[13px]">
                  <Lock className="h-4 w-4 text-amber-700" />
                  <span>Ca trực đã vượt quá thời hạn đăng ký (registration_cutoff_at)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-900">
                  Ca trực <strong>{activeReg.shift_title}</strong> có mốc cutoff tại <strong>{activeReg.shift_cutoff_at}</strong>. Hệ thống tự động khóa tính năng đăng ký mới và thẩm định để chuẩn bị phát sóng.
                </p>
                <div className="mt-2 text-[10px] text-amber-800">
                  Quy định nghiệp vụ (SETTINGS-001): Ca trực tự động đóng nhận đơn trước 2 tiếng phát sóng. Mọi phân bổ bổ sung phải được thực hiện thủ công bởi Leader qua Staffing Workspace.
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md bg-amber-700 px-4 py-1.5 font-semibold text-white hover:bg-amber-800 shadow-sm"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 20: MEMBER SELF-REGISTRATION MODAL */}
        {qaState === '20-self-registration' && (
          <ModalWrapper
            title="Đăng ký nhận ca trực (Member Self-Registration)"
            subtitle="Chọn ca phát sóng còn trống và vai trò đăng ký"
            onClose={() => setQaState('01-registration-main')}
          >
            <div className="space-y-4 text-[12px]">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Chọn ca trực mở (Open Shifts):</label>
                <select className="h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-[12px] text-slate-800 focus:outline-none">
                  <option>Pharmaton – TikTok Live (10/09 · 14:00–17:00 · Trống 1 Support)</option>
                  <option>Shopee Super Brand Day (10/09 · 19:00–22:00 · Trống 1 Host)</option>
                  <option>Samsung Galaxy Live (11/09 · 09:00–12:00 · Trống 1 Technical)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Chọn vai trò ứng tuyển (Canonical):</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex items-center gap-1.5 rounded border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="selfRole" defaultChecked />
                    <span className="font-semibold text-slate-800">Host</span>
                  </label>
                  <label className="flex items-center gap-1.5 rounded border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="selfRole" />
                    <span className="font-semibold text-slate-800">Hỗ trợ</span>
                  </label>
                  <label className="flex items-center gap-1.5 rounded border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input type="radio" name="selfRole" />
                    <span className="font-semibold text-slate-800">Kỹ thuật</span>
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[10px] space-y-1 text-slate-600">
                <div className="font-bold text-slate-700">Kiểm tra tự động trước khi gửi:</div>
                <div>✓ Đã kiểm tra lịch không trùng ca khác</div>
                <div>✓ Chưa đăng ký ca này trước đó</div>
                <div>✓ Trước thời hạn đóng sổ (cutoff)</div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('26-success')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Gửi đơn đăng ký
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 21: AUDIT TRAIL MODAL */}
        {qaState === '21-history' && (
          <ModalWrapper title="Lịch sử kiểm toán đơn đăng ký (Registration Audit Trail)" onClose={() => setQaState('01-registration-main')}>
            <div className="space-y-3 text-[11px]">
              <p className="text-slate-600 text-[10px]">
                Ghi nhận đầy đủ chuỗi sự kiện đăng ký, người thẩm định, người phê duyệt và liên kết phân bổ:
              </p>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {REGISTRATION_AUDIT_LOGS.map((log) => (
                  <div key={log.id} className="rounded border border-slate-200 bg-white p-2.5 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-mono">{log.timestamp}</span>
                      <span className="font-semibold text-slate-800">{log.actor} ({log.actor_permission})</span>
                    </div>
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span>Mã đơn {log.registration_id}</span>
                      <span>·</span>
                      <span className={`uppercase text-[10px] ${
                        log.action === 'approved' ? 'text-emerald-700' :
                        log.action === 'rejected' ? 'text-rose-700' :
                        log.action === 'cancelled' ? 'text-slate-600' :
                        log.action === 'staffing_linked' ? 'text-purple-700' :
                        'text-blue-700'
                      }`}>
                        {log.action}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      {log.details}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-registration-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* BOTTOM QA CONTROLLER DOCK */}
        <div data-qa-controller className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-950/95 p-2 text-white shadow-xl backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-400 font-bold">QA WAVE 08:</span>
              <span className="font-mono text-slate-300 font-semibold">{qaState}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQaOpen(!qaOpen)}
                className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                {qaOpen ? 'Ẩn bộ điều khiển QA' : 'Mở 27 QA States'}
              </button>
            </div>
          </div>

          {qaOpen && (
            <div className="mx-auto mt-2 max-w-7xl border-t border-slate-800/80 pt-2">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-1 max-h-40 overflow-y-auto pr-1">
                {[
                  { id: '01-registration-main', label: '01 Main Queue' },
                  { id: '02-active-filters', label: '02 Active Filters' },
                  { id: '03-request-detail', label: '03 15 DB Fields' },
                  { id: '04-pending', label: '04 Pending List' },
                  { id: '05-eligibility-pass', label: '05 Elig Pass' },
                  { id: '06-eligibility-warning', label: '06 Elig Warning' },
                  { id: '07-blocking-conflict', label: '07 Blocking Collision' },
                  { id: '08-capacity-available', label: '08 Capacity Available' },
                  { id: '09-capacity-full', label: '09 Capacity Full' },
                  { id: '10-approve-dialog', label: '10 Approve Dialog' },
                  { id: '11-approve-impact', label: '11 Staffing Effect' },
                  { id: '12-reject-dialog', label: '12 Reject Dialog' },
                  { id: '13-rejection-reason-validation', label: '13 Reject Reason' },
                  { id: '14-approved-registration', label: '14 Approved Reg' },
                  { id: '15-rejected-registration', label: '15 Rejected Reg' },
                  { id: '16-cancelled-registration', label: '16 Cancelled Reg' },
                  { id: '17-staffing-linkage', label: '17 Staffing Linkage' },
                  { id: '18-duplicate-request', label: '18 Duplicate Req' },
                  { id: '19-registration-cutoff', label: '19 Cutoff Locked' },
                  { id: '20-self-registration', label: '20 Self Registration' },
                  { id: '21-history', label: '21 History Audit' },
                  { id: '22-permission-read-only', label: '22 Read-Only Perm' },
                  { id: '23-concurrency', label: '23 Concurrency CAS' },
                  { id: '24-empty', label: '24 Empty Workspace' },
                  { id: '25-no-results', label: '25 No Results' },
                  { id: '26-success', label: '26 Toast Success' },
                  { id: '27-error', label: '27 Toast Error' }
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    data-qa-trigger={st.id}
                    onClick={() => setQaState(st.id as RegistrationQaStateId)}
                    className={`rounded px-2 py-1 text-left truncate font-mono text-[10px] transition-colors ${
                      qaState === st.id
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PeopleOpsReferenceShell>
  )
}

function ModalWrapper({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
