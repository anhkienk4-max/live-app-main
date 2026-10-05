'use client'

import React, { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Briefcase, Users, Calendar, Clock, MapPin, CheckCircle2, AlertTriangle,
  AlertCircle, XCircle, Search, Filter, MoreHorizontal, ArrowRight, UserPlus,
  UserMinus, RefreshCw, Shield, ShieldCheck, ShieldAlert, Check, X, ChevronRight,
  ExternalLink, Info, Sparkles, History, CalendarDays, BarChart2, Radio,
  Lock, ArrowLeftRight, Layers, FileSpreadsheet, Eye, HelpCircle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PeopleOpsReferenceShell } from './PeopleOpsReferenceShell'

// =============================================================================
// TYPES & QA STATES (WAVE 07 STAFFING)
// =============================================================================

export type StaffingQaStateId =
  | '01-staffing-main'
  | '02-shift-selected'
  | '03-fully-staffed'
  | '04-understaffed'
  | '05-role-capacity'
  | '06-assign-staff'
  | '07-eligible-candidates'
  | '08-ineligible-candidate'
  | '09-availability-conflict'
  | '10-overlap-conflict'
  | '11-capacity-full'
  | '12-approved-registration'
  | '13-imported-staffing'
  | '14-unassign-impact'
  | '15-role-reassignment'
  | '16-auto-balance'
  | '17-staff-schedule'
  | '18-workload'
  | '19-staffing-history'
  | '20-permission-read-only'
  | '21-concurrency'
  | '22-no-eligible-candidates'
  | '23-empty'
  | '24-success'
  | '25-error'

export type CanonicalOperationalRole = 'host' | 'support' | 'technical'

export interface RoleCapacity {
  required: number
  confirmed: number
  pending: number
}

export interface AssignmentRecord {
  id: string
  shift_id: string
  user_id: string
  name: string
  avatar_initials: string
  avatar_color: string
  role: CanonicalOperationalRole
  unbacked_auxiliary_label?: string // e.g. "Backup" or "Producer" [NEW_ONLY_UNBACKED = YES]
  status: 'confirmed' | 'pending' | 'removed'
  source: 'manual' | 'approved_registration' | 'imported_staffing'
  match_method: 'exact' | 'normalized' | 'manual' // STAFF-001
  fit_score?: number // STAFF-002 [NEW_ONLY_UNBACKED = YES]
  registration_id?: string
  import_batch_id?: string
  imported_name?: string
  assigned_at: string
  assigned_by: string
}

export interface ShiftStaffingRecord {
  id: string
  title: string
  brand: string
  platform: 'TikTok Shop' | 'Shopee Live'
  studio: string
  date: string
  time: string
  status: 'published' | 'preparing' | 'completed'
  version: number // Concurrency revision
  capacity: {
    host: RoleCapacity
    support: RoleCapacity
    technical: RoleCapacity
  }
  assignments: AssignmentRecord[]
}

export interface StaffCandidate {
  id: string
  full_name: string
  email: string
  avatar_initials: string
  avatar_color: string
  operational_roles: CanonicalOperationalRole[]
  staff_status: 'active' | 'temporary_leave' | 'left'
  account_status: 'active' | 'inactive'
  availability_status: 'available' | 'unavailable' | 'conflicted'
  availability_reason?: string
  conflict_type?: 'none' | 'overlap' | 'role_mismatch' | 'leave_inactive' | 'capacity_full'
  conflict_detail?: string
  fit_score: number // STAFF-002 [NEW_ONLY_UNBACKED = YES]
  weekly_shifts_count: number
  weekly_hours: number
}

export interface StaffingAuditItem {
  id: string
  timestamp: string
  actor: string
  actor_role: string
  action: 'assign_manual' | 'approve_registration' | 'unassign' | 'reassign_role' | 'import_resolved'
  role: CanonicalOperationalRole
  shift_title: string
  target_user: string
  details: string
}

// =============================================================================
// DETERMINISTIC FIXTURE DATA
// =============================================================================

export const FIXTURE_SHIFTS: ShiftStaffingRecord[] = [
  {
    id: 'SFT-101',
    title: 'Pharmaton – TikTok Live Mega Day',
    brand: 'Sanofi / Pharmaton',
    platform: 'TikTok Shop',
    studio: 'Studio A (Tầng 3)',
    date: '10/09/2026',
    time: '14:00 – 17:00',
    status: 'published',
    version: 1,
    capacity: {
      host: { required: 1, confirmed: 1, pending: 0 },
      support: { required: 2, confirmed: 1, pending: 0 },
      technical: { required: 1, confirmed: 1, pending: 0 },
    },
    assignments: [
      {
        id: 'ASG-101',
        shift_id: 'SFT-101',
        user_id: 'usr-mai',
        name: 'Nguyễn Thị Mai Anh',
        avatar_initials: 'MA',
        avatar_color: 'bg-emerald-100 text-emerald-700',
        role: 'host',
        status: 'confirmed',
        source: 'approved_registration',
        match_method: 'exact', // STAFF-001
        fit_score: 98, // STAFF-002
        registration_id: 'REG-1049',
        assigned_at: '2026-09-08 09:30',
        assigned_by: 'Admin Nguyễn Quản Trị'
      },
      {
        id: 'ASG-102',
        shift_id: 'SFT-101',
        user_id: 'usr-huy',
        name: 'Trần Quốc Huy',
        avatar_initials: 'QH',
        avatar_color: 'bg-blue-100 text-blue-700',
        role: 'support',
        status: 'confirmed',
        source: 'manual',
        match_method: 'manual', // STAFF-001
        fit_score: 91, // STAFF-002
        assigned_at: '2026-09-08 14:15',
        assigned_by: 'Leader Hoàng Trưởng Ca'
      },
      {
        id: 'ASG-103',
        shift_id: 'SFT-101',
        user_id: 'usr-long',
        name: 'Lê Hoàng Long',
        avatar_initials: 'HL',
        avatar_color: 'bg-purple-100 text-purple-700',
        role: 'technical',
        status: 'confirmed',
        source: 'imported_staffing',
        match_method: 'normalized', // STAFF-001
        fit_score: 87, // STAFF-002
        import_batch_id: 'IMP-20260908-01',
        imported_name: 'Hoang Long Tech',
        assigned_at: '2026-09-08 10:00',
        assigned_by: 'Hệ thống Import Lịch'
      }
    ]
  },
  {
    id: 'SFT-102',
    title: 'Shopee Super Brand Day – L\'Oreal Paris',
    brand: 'L\'Oreal Paris',
    platform: 'Shopee Live',
    studio: 'Studio B (Tầng 4)',
    date: '10/09/2026',
    time: '18:00 – 22:00',
    status: 'published',
    version: 2,
    capacity: {
      host: { required: 2, confirmed: 2, pending: 0 },
      support: { required: 3, confirmed: 3, pending: 0 },
      technical: { required: 1, confirmed: 1, pending: 0 },
    },
    assignments: [
      {
        id: 'ASG-201',
        shift_id: 'SFT-102',
        user_id: 'usr-lan',
        name: 'Phạm Ngọc Lan',
        avatar_initials: 'NL',
        avatar_color: 'bg-rose-100 text-rose-700',
        role: 'host',
        status: 'confirmed',
        source: 'approved_registration',
        match_method: 'exact',
        fit_score: 95,
        registration_id: 'REG-1052',
        assigned_at: '2026-09-08 11:00',
        assigned_by: 'Admin Nguyễn Quản Trị'
      },
      {
        id: 'ASG-202',
        shift_id: 'SFT-102',
        user_id: 'usr-thao',
        name: 'Đỗ Phương Thảo',
        avatar_initials: 'PT',
        avatar_color: 'bg-pink-100 text-pink-700',
        role: 'host',
        status: 'confirmed',
        source: 'manual',
        match_method: 'manual',
        fit_score: 93,
        assigned_at: '2026-09-08 11:20',
        assigned_by: 'Leader Hoàng Trưởng Ca'
      },
      {
        id: 'ASG-203',
        shift_id: 'SFT-102',
        user_id: 'usr-minh',
        name: 'Lê Tuấn Minh',
        avatar_initials: 'TM',
        avatar_color: 'bg-amber-100 text-amber-700',
        role: 'support',
        status: 'confirmed',
        source: 'manual',
        match_method: 'manual',
        fit_score: 89,
        assigned_at: '2026-09-08 14:00',
        assigned_by: 'Leader Hoàng Trưởng Ca'
      },
      {
        id: 'ASG-204',
        shift_id: 'SFT-102',
        user_id: 'usr-duc',
        name: 'Vũ Minh Đức',
        avatar_initials: 'MD',
        avatar_color: 'bg-cyan-100 text-cyan-700',
        role: 'support',
        status: 'confirmed',
        source: 'approved_registration',
        match_method: 'exact',
        fit_score: 92,
        registration_id: 'REG-1055',
        assigned_at: '2026-09-08 15:30',
        assigned_by: 'Admin Nguyễn Quản Trị'
      },
      {
        id: 'ASG-205',
        shift_id: 'SFT-102',
        user_id: 'usr-anh',
        name: 'Bùi Việt Anh',
        avatar_initials: 'VA',
        avatar_color: 'bg-teal-100 text-teal-700',
        role: 'support',
        status: 'confirmed',
        source: 'manual',
        match_method: 'manual',
        fit_score: 86,
        assigned_at: '2026-09-08 16:00',
        assigned_by: 'Leader Hoàng Trưởng Ca'
      },
      {
        id: 'ASG-206',
        shift_id: 'SFT-102',
        user_id: 'usr-nam',
        name: 'Đặng Hoài Nam',
        avatar_initials: 'HN',
        avatar_color: 'bg-indigo-100 text-indigo-700',
        role: 'technical',
        status: 'confirmed',
        source: 'approved_registration',
        match_method: 'exact',
        fit_score: 97,
        registration_id: 'REG-1058',
        assigned_at: '2026-09-08 09:00',
        assigned_by: 'Admin Nguyễn Quản Trị'
      }
    ]
  },
  {
    id: 'SFT-103',
    title: 'Samsung Galaxy Livestream Sale',
    brand: 'Samsung Vietnam',
    platform: 'TikTok Shop',
    studio: 'Studio C (Tầng 2)',
    date: '11/09/2026',
    time: '09:00 – 12:00',
    status: 'published',
    version: 1,
    capacity: {
      host: { required: 1, confirmed: 0, pending: 0 },
      support: { required: 2, confirmed: 0, pending: 0 },
      technical: { required: 1, confirmed: 1, pending: 0 },
    },
    assignments: [
      {
        id: 'ASG-301',
        shift_id: 'SFT-103',
        user_id: 'usr-long',
        name: 'Lê Hoàng Long',
        avatar_initials: 'HL',
        avatar_color: 'bg-purple-100 text-purple-700',
        role: 'technical',
        status: 'confirmed',
        source: 'approved_registration',
        match_method: 'exact',
        fit_score: 94,
        registration_id: 'REG-1060',
        assigned_at: '2026-09-08 17:00',
        assigned_by: 'Admin Nguyễn Quản Trị'
      }
    ]
  },
  {
    id: 'SFT-104',
    title: 'Vinamilk Gia Đình Sức Khỏe',
    brand: 'Vinamilk',
    platform: 'Shopee Live',
    studio: 'Studio A (Tầng 3)',
    date: '11/09/2026',
    time: '13:00 – 16:00',
    status: 'published',
    version: 1,
    capacity: {
      host: { required: 1, confirmed: 1, pending: 0 },
      support: { required: 1, confirmed: 1, pending: 0 },
      technical: { required: 1, confirmed: 0, pending: 0 },
    },
    assignments: [
      {
        id: 'ASG-401',
        shift_id: 'SFT-104',
        user_id: 'usr-lan',
        name: 'Phạm Ngọc Lan',
        avatar_initials: 'NL',
        avatar_color: 'bg-rose-100 text-rose-700',
        role: 'host',
        status: 'confirmed',
        source: 'manual',
        match_method: 'manual',
        fit_score: 90,
        assigned_at: '2026-09-08 18:00',
        assigned_by: 'Leader Hoàng Trưởng Ca'
      },
      {
        id: 'ASG-402',
        shift_id: 'SFT-104',
        user_id: 'usr-minh',
        name: 'Lê Tuấn Minh',
        avatar_initials: 'TM',
        avatar_color: 'bg-amber-100 text-amber-700',
        role: 'support',
        status: 'confirmed',
        source: 'manual',
        match_method: 'manual',
        fit_score: 88,
        assigned_at: '2026-09-08 18:15',
        assigned_by: 'Leader Hoàng Trưởng Ca'
      }
    ]
  }
]

export const FIXTURE_CANDIDATES: StaffCandidate[] = [
  {
    id: 'cnd-01',
    full_name: 'Lê Tuấn Minh',
    email: 'tuanminh.le@livestream.vn',
    avatar_initials: 'TM',
    avatar_color: 'bg-amber-100 text-amber-700',
    operational_roles: ['support', 'technical'],
    staff_status: 'active',
    account_status: 'active',
    availability_status: 'available',
    fit_score: 96, // STAFF-002
    weekly_shifts_count: 2,
    weekly_hours: 7
  },
  {
    id: 'cnd-02',
    full_name: 'Vũ Minh Đức',
    email: 'minhduc.vu@livestream.vn',
    avatar_initials: 'MD',
    avatar_color: 'bg-cyan-100 text-cyan-700',
    operational_roles: ['support'],
    staff_status: 'active',
    account_status: 'active',
    availability_status: 'available',
    fit_score: 92, // STAFF-002
    weekly_shifts_count: 1,
    weekly_hours: 4
  },
  {
    id: 'cnd-03',
    full_name: 'Trần Văn Bình',
    email: 'vanbinh.tran@livestream.vn',
    avatar_initials: 'VB',
    avatar_color: 'bg-slate-200 text-slate-700',
    operational_roles: ['technical'],
    staff_status: 'temporary_leave',
    account_status: 'active',
    availability_status: 'unavailable',
    availability_reason: 'Nhân viên đang trong diện tạm nghỉ phép cá nhân (10/09 - 15/09)',
    conflict_type: 'leave_inactive',
    conflict_detail: 'Không đủ điều kiện: Nhân viên đang tạm nghỉ việc và không có kỹ năng vai trò Support',
    fit_score: 45,
    weekly_shifts_count: 0,
    weekly_hours: 0
  },
  {
    id: 'cnd-04',
    full_name: 'Hoàng Nhật Minh',
    email: 'nhatminh.hoang@livestream.vn',
    avatar_initials: 'NM',
    avatar_color: 'bg-rose-100 text-rose-700',
    operational_roles: ['support', 'host'],
    staff_status: 'active',
    account_status: 'active',
    availability_status: 'unavailable',
    availability_reason: 'Bận: Đăng ký lịch bận đột xuất từ 13:00 đến 18:00 ngày 10/09/2026',
    conflict_type: 'none',
    conflict_detail: 'Không khả dụng trong khung thời gian ca trực',
    fit_score: 82,
    weekly_shifts_count: 3,
    weekly_hours: 11
  },
  {
    id: 'cnd-05',
    full_name: 'Bùi Việt Anh',
    email: 'vietanh.bui@livestream.vn',
    avatar_initials: 'VA',
    avatar_color: 'bg-teal-100 text-teal-700',
    operational_roles: ['support', 'technical'],
    staff_status: 'active',
    account_status: 'active',
    availability_status: 'conflicted',
    availability_reason: 'Trùng giờ với ca SFT-088 "Vinhomes Mega Live" (13:30 – 16:30)',
    conflict_type: 'overlap',
    conflict_detail: 'Xung đột chồng chéo ca: Đã được phân bổ vào ca SFT-088 từ 13:30 đến 16:30 cùng ngày (Trùng 150 phút)',
    fit_score: 88,
    weekly_shifts_count: 4,
    weekly_hours: 15
  }
]

export const FIXTURE_AUDIT_LOGS: StaffingAuditItem[] = [
  {
    id: 'LOG-001',
    timestamp: '2026-09-08 14:15:22',
    actor: 'Hoàng Trưởng Ca',
    actor_role: 'Leader',
    action: 'assign_manual',
    role: 'support',
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    target_user: 'Trần Quốc Huy',
    details: 'Gán thủ công vào vị trí Support 1/2. Nguồn: Thủ công (manual).'
  },
  {
    id: 'LOG-002',
    timestamp: '2026-09-08 10:00:15',
    actor: 'Hệ thống Import Lịch',
    actor_role: 'System',
    action: 'import_resolved',
    role: 'technical',
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    target_user: 'Lê Hoàng Long',
    details: 'Đồng bộ từ Batch #IMP-20260908-01 (Tên file: Lich_T9_final.xlsx). Khớp chuẩn hóa (match_method: normalized).'
  },
  {
    id: 'LOG-003',
    timestamp: '2026-09-08 09:30:40',
    actor: 'Nguyễn Quản Trị',
    actor_role: 'Admin',
    action: 'approve_registration',
    role: 'host',
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    target_user: 'Nguyễn Thị Mai Anh',
    details: 'Duyệt đơn đăng ký #REG-1049. Chuyển đổi thành phân bổ chính thức (match_method: exact).'
  },
  {
    id: 'LOG-004',
    timestamp: '2026-09-07 16:45:10',
    actor: 'Nguyễn Quản Trị',
    actor_role: 'Admin',
    action: 'reassign_role',
    role: 'support',
    shift_title: 'Shopee Super Brand Day – L\'Oreal Paris',
    target_user: 'Vũ Minh Đức',
    details: 'Điều chỉnh vai trò từ Host sang Support theo yêu cầu khối vận hành.'
  },
  {
    id: 'LOG-005',
    timestamp: '2026-09-07 11:20:05',
    actor: 'Hoàng Trưởng Ca',
    actor_role: 'Leader',
    action: 'unassign',
    role: 'support',
    shift_title: 'Pharmaton – TikTok Live Mega Day',
    target_user: 'Đỗ Phương Thảo',
    details: 'Gỡ phân bổ do nhân sự xin nghỉ đột xuất. Để lại khoảng trống 1 Support cần bổ sung.'
  }
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function StaffingReferenceMock() {
  const searchParams = useSearchParams()
  const initialQaParam = (searchParams.get('state') || searchParams.get('qaState') || '01-staffing-main') as StaffingQaStateId

  const [qaState, setQaState] = useState<StaffingQaStateId>(initialQaParam)
  const [selectedShiftId, setSelectedShiftId] = useState<string>('SFT-101')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | CanonicalOperationalRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'fully_staffed' | 'understaffed'>('all')
  const [qaOpen, setQaOpen] = useState(false)

  // Sync state if URL search param changes
  React.useEffect(() => {
    const p = searchParams.get('state') || searchParams.get('qaState')
    if (p) {
      setQaState(p as StaffingQaStateId)
    }
  }, [searchParams])

  // Select shift based on state override
  const activeShift = useMemo(() => {
    if (qaState === '03-fully-staffed') {
      return FIXTURE_SHIFTS.find(s => s.id === 'SFT-102') || FIXTURE_SHIFTS[0]
    }
    if (qaState === '04-understaffed') {
      return FIXTURE_SHIFTS.find(s => s.id === 'SFT-103') || FIXTURE_SHIFTS[0]
    }
    return FIXTURE_SHIFTS.find(s => s.id === selectedShiftId) || FIXTURE_SHIFTS[0]
  }, [selectedShiftId, qaState])

  // Computed summary metrics
  const totalShiftsCount = FIXTURE_SHIFTS.length
  const fullyStaffedCount = FIXTURE_SHIFTS.filter(s => {
    const hostFull = s.capacity.host.confirmed >= s.capacity.host.required
    const supportFull = s.capacity.support.confirmed >= s.capacity.support.required
    const techFull = s.capacity.technical.confirmed >= s.capacity.technical.required
    return hostFull && supportFull && techFull
  }).length
  const understaffedCount = totalShiftsCount - fullyStaffedCount

  // Filtered shifts
  const displayShifts = useMemo(() => {
    if (qaState === '23-empty') return []
    return FIXTURE_SHIFTS.filter(s => {
      const matchSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.studio.toLowerCase().includes(searchQuery.toLowerCase())

      const hostFull = s.capacity.host.confirmed >= s.capacity.host.required
      const supportFull = s.capacity.support.confirmed >= s.capacity.support.required
      const techFull = s.capacity.technical.confirmed >= s.capacity.technical.required
      const isFull = hostFull && supportFull && techFull

      const matchStatus = statusFilter === 'all' ? true :
        statusFilter === 'fully_staffed' ? isFull : !isFull

      return matchSearch && matchStatus
    })
  }, [searchQuery, statusFilter, qaState])

  const isReadOnly = qaState === '20-permission-read-only'

  return (
    <PeopleOpsReferenceShell active="Staffing" searchPlaceholder="Tìm kiếm ca trực, nhân sự, vai trò...">
      <div data-testid="staffing-reference-mock" className="relative flex flex-1 flex-col overflow-y-auto bg-slate-50 text-slate-900">

        {/* READ-ONLY BANNER FOR STATE 20 */}
        {isReadOnly && (
          <div className="border-b border-amber-300 bg-amber-50 px-6 py-2.5 text-[12px] text-amber-900 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>Chế độ chỉ xem (Permission Read-Only):</strong> Bạn đang xem với quyền <strong>Member (staff.read)</strong>. Các thao tác phân bổ, gỡ và điều chỉnh vai trò bị vô hiệu hóa.
              </span>
            </div>
            <Badge variant="outline" className="border-amber-300 text-amber-800 text-[10px] bg-amber-100">
              staff.manage = DENIED
            </Badge>
          </div>
        )}

        {/* CONCURRENCY CAS CONFLICT BANNER FOR STATE 21 */}
        {qaState === '21-concurrency' && (
          <div className="border-b border-rose-300 bg-rose-50 px-6 py-3 text-[12px] text-rose-900 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <div>
                <strong>Xung đột cập nhật đồng thời (Optimistic Concurrency Conflict):</strong> Ca trực đã bị thay đổi bởi người dùng khác trên máy chủ (Dữ liệu local v1 vs Server v2).
                <div className="text-[11px] text-rose-700 mt-0.5">Vui lòng tải lại dữ liệu ca trực trước khi thực hiện phân bổ mới để tránh ghi đè thông tin.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-600 text-white font-medium text-[11px] hover:bg-rose-700 shadow-sm">
                <RefreshCw className="h-3 w-3" /> Tải lại dữ liệu (Reload v2)
              </button>
            </div>
          </div>
        )}

        {/* TOAST SUCCESS FOR STATE 24 */}
        {qaState === '24-success' && (
          <div className="absolute top-4 right-6 z-50 flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-xl transition-all animate-in fade-in slide-in-from-top-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-[12px] font-bold">Phân bổ nhân sự thành công</div>
              <div className="text-[11px] text-emerald-700">Đã gán thành công <strong>Lê Tuấn Minh</strong> vào vị trí <strong>Support</strong> cho ca <em>{activeShift.title}</em>.</div>
            </div>
            <button type="button" onClick={() => setQaState('01-staffing-main')} className="ml-2 text-emerald-700 hover:text-emerald-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* TOAST ERROR FOR STATE 25 */}
        {qaState === '25-error' && (
          <div className="absolute top-4 right-6 z-50 flex items-center gap-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900 shadow-xl transition-all animate-in fade-in slide-in-from-top-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <div className="text-[12px] font-bold">Lỗi phân bổ: Phát hiện xung đột lịch trực</div>
              <div className="text-[11px] text-rose-700">Không thể phân bổ <strong>Bùi Việt Anh</strong> do trùng 150 phút với ca <em>Vinhomes Mega Live (13:30 – 16:30)</em>.</div>
            </div>
            <button type="button" onClick={() => setQaState('01-staffing-main')} className="ml-2 text-rose-700 hover:text-rose-900">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* HEADER & CONTROLS */}
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-bold tracking-tight text-slate-900">Phân bổ nhân sự ca trực</h1>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[11px]">
                  Staffing Workspace
                </Badge>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Quản lý hạn mức chỉ tiêu, phân bổ nhân sự, kiểm tra tính hợp lệ và xử lý khoảng trống vận hành
              </p>
            </div>

            {/* Quick KPI stats */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-center">
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Tổng số ca</div>
                <div className="text-[14px] font-bold text-slate-800">{totalShiftsCount}</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-center">
                <div className="text-[10px] font-semibold text-emerald-700 uppercase">Đủ nhân sự</div>
                <div className="text-[14px] font-bold text-emerald-700">{fullyStaffedCount} ca</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-center">
                <div className="text-[10px] font-semibold text-amber-700 uppercase">Thiếu nhân sự</div>
                <div className="text-[14px] font-bold text-amber-700">{understaffedCount} ca</div>
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo ca, thương hiệu, studio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-[12px] text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Tất cả ca
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('understaffed')}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${statusFilter === 'understaffed' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Cần bổ sung ({understaffedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('fully_staffed')}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${statusFilter === 'fully_staffed' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Đủ người ({fullyStaffedCount})
                </button>
              </div>

              <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                <span>10/09/2026 – 11/09/2026</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQaState('16-auto-balance')}
                disabled={isReadOnly}
                className={`flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                <span>Cân đối tự động</span>
                <span className="text-[9px] font-normal text-slate-400 border border-slate-200 rounded px-1">[NEW_ONLY_UNBACKED = YES]</span>
              </button>

              <button
                type="button"
                onClick={() => setQaState('19-staffing-history')}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <History className="h-3.5 w-3.5 text-slate-500" />
                <span>Lịch sử phân ca</span>
              </button>
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT: 2 COLUMNS (LEFT: SHIFTS LIST, RIGHT: OPERATIONAL ASSIGNMENT PANEL) */}
        <div className="flex-1 p-6">
          {qaState === '23-empty' ? (
            <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Briefcase className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-[14px] font-bold text-slate-800">Không có ca trực cần phân bổ</h3>
              <p className="mt-1 max-w-sm text-[12px] text-slate-500">
                Không tìm thấy ca trực nào trong khoảng thời gian hoặc bộ lọc đã chọn. Hãy kiểm tra lại khoảng ngày hoặc thiết lập lịch ca mới.
              </p>
              <button
                type="button"
                onClick={() => setQaState('01-staffing-main')}
                className="mt-4 rounded-md bg-blue-600 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                Đặt lại bộ lọc mặc định
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6 items-start">

              {/* LEFT COLUMN: SHIFT CARDS LIST (7 COLS) */}
              <div className="col-span-12 lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between text-[12px] text-slate-500 px-1">
                  <span>Danh sách ca phát sóng ({displayShifts.length} ca)</span>
                  <span>Nhấp vào thẻ ca để xem chi tiết & điều phối</span>
                </div>

                <div className="space-y-2.5">
                  {displayShifts.map((shift) => {
                    const isSelected = shift.id === activeShift.id
                    const hostNeed = shift.capacity.host.required - shift.capacity.host.confirmed
                    const supportNeed = shift.capacity.support.required - shift.capacity.support.confirmed
                    const techNeed = shift.capacity.technical.required - shift.capacity.technical.confirmed
                    const totalRequired = shift.capacity.host.required + shift.capacity.support.required + shift.capacity.technical.required
                    const totalConfirmed = shift.capacity.host.confirmed + shift.capacity.support.confirmed + shift.capacity.technical.confirmed
                    const isFullyStaffed = totalConfirmed >= totalRequired

                    return (
                      <div
                        key={shift.id}
                        onClick={() => setSelectedShiftId(shift.id)}
                        className={`cursor-pointer rounded-lg border bg-white p-4 transition-all shadow-sm ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                            : 'border-slate-200 hover:border-slate-300 hover:shadow'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono font-semibold text-slate-400">{shift.id}</span>
                              <h3 className="text-[13px] font-bold text-slate-900">{shift.title}</h3>
                              <Badge variant="outline" className={`text-[10px] ${shift.platform === 'TikTok Shop' ? 'border-neutral-300 text-neutral-800' : 'border-orange-200 text-orange-700'}`}>
                                {shift.platform}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-slate-400" />{shift.date}</span>
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" />{shift.time}</span>
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{shift.studio}</span>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            {isFullyStaffed ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" /> Đủ nhân sự ({totalConfirmed}/{totalRequired})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                                <AlertTriangle className="h-3 w-3" /> Thiếu {totalRequired - totalConfirmed} vị trí
                              </span>
                            )}
                          </div>
                        </div>

                        {/* CAPACITY STATUS CHIPS BY ROLE */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px]">
                          <div className="flex items-center gap-2">
                            {/* Host Capacity Chip */}
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                              hostNeed > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                              <strong>Host:</strong> {shift.capacity.host.confirmed}/{shift.capacity.host.required}
                              {hostNeed > 0 && <span className="font-bold text-rose-600">(Thiếu {hostNeed})</span>}
                            </span>

                            {/* Support Capacity Chip */}
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                              supportNeed > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                              <strong>Support:</strong> {shift.capacity.support.confirmed}/{shift.capacity.support.required}
                              {supportNeed > 0 && <span className="font-bold text-amber-600">(Thiếu {supportNeed})</span>}
                            </span>

                            {/* Technical Capacity Chip */}
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                              techNeed > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                              <strong>Technical:</strong> {shift.capacity.technical.confirmed}/{shift.capacity.technical.required}
                              {techNeed > 0 && <span className="font-bold text-rose-600">(Thiếu {techNeed})</span>}
                            </span>
                          </div>

                          {/* ASSIGNED AVATARS PREVIEW */}
                          <div className="flex items-center -space-x-1.5">
                            {shift.assignments.map((asg) => (
                              <div
                                key={asg.id}
                                title={`${asg.name} (${asg.role.toUpperCase()})`}
                                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold ${asg.avatar_color} shadow-xs`}
                              >
                                {asg.avatar_initials}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* RIGHT COLUMN: OPERATIONAL ASSIGNMENT WORKSPACE (5 COLS) */}
              <div className="col-span-12 lg:col-span-5">
                <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sticky top-6">

                  {/* SHIFT SELECTED HEADER */}
                  <div className="border-b border-slate-100 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-semibold text-blue-600">{activeShift.id}</span>
                          <span className="text-[11px] text-slate-400">· Revision v{activeShift.version}</span>
                        </div>
                        <h2 className="text-[15px] font-bold text-slate-900 mt-0.5">{activeShift.title}</h2>
                        <div className="text-[12px] text-slate-600">{activeShift.brand}</div>
                      </div>
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px]">
                        Sắp diễn ra
                      </Badge>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 text-slate-400" />{activeShift.date}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-slate-400" />{activeShift.time}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" />{activeShift.studio}</span>
                    </div>
                  </div>

                  {/* OVERALL CAPACITY DONUT & PROGRESS BAR */}
                  {(() => {
                    const totalReq = activeShift.capacity.host.required + activeShift.capacity.support.required + activeShift.capacity.technical.required
                    const totalConf = activeShift.capacity.host.confirmed + activeShift.capacity.support.confirmed + activeShift.capacity.technical.confirmed
                    const pct = Math.round((totalConf / (totalReq || 1)) * 100)
                    const missingTotal = Math.max(0, totalReq - totalConf)

                    return (
                      <div className="flex items-center gap-4 border-b border-slate-100 py-4">
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[5px] border-emerald-500 border-r-slate-200">
                          <span className="text-[12px] font-bold text-slate-800">{pct}%</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="font-bold text-slate-800">Tổng quan định biên ca trực</span>
                            <span className="font-semibold text-slate-700">{totalConf}/{totalReq} vị trí</span>
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="mt-1 text-[11px]">
                            {missingTotal === 0 ? (
                              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Đã đủ 100% nhân sự định biên
                              </span>
                            ) : (
                              <span className="font-semibold text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Còn thiếu {missingTotal} vị trí cần phân bổ
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* ROLE CAPACITY BREAKDOWN & ASSIGNMENT SLOTS */}
                  <div className="py-4 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-[12px] font-bold text-slate-800 uppercase tracking-wide">
                          Vị trí vận hành (Canonical Roles)
                        </h3>
                        <span className="text-[10px] text-slate-400">Host · Support · Technical</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQaState('05-role-capacity')}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                      >
                        Chi tiết hạn mức <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="space-y-3">

                      {/* 1. HOST SECTION */}
                      <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            <span>Host chính</span>
                          </span>
                          <span className={activeShift.capacity.host.confirmed >= activeShift.capacity.host.required ? 'text-emerald-700' : 'text-rose-700'}>
                            {activeShift.capacity.host.confirmed}/{activeShift.capacity.host.required}
                          </span>
                        </div>

                        {activeShift.assignments.filter(a => a.role === 'host').map(asg => (
                          <div key={asg.id} className="mt-1 flex items-center justify-between rounded bg-white p-2 border border-slate-200/80 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${asg.avatar_color}`}>
                                {asg.avatar_initials}
                              </div>
                              <div>
                                <div className="text-[11px] font-bold text-slate-800">{asg.name}</div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <span>{asg.source === 'approved_registration' ? 'Duyệt đăng ký (#REG-1049)' : 'Gán thủ công'}</span>
                                  <span>· match: {asg.match_method}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQaState('15-role-reassignment')}
                                disabled={isReadOnly}
                                title="Đổi vai trò"
                                className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setQaState('14-unassign-impact')}
                                disabled={isReadOnly}
                                title="Gỡ nhân sự"
                                className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {activeShift.capacity.host.confirmed < activeShift.capacity.host.required && (
                          <div className="mt-1 flex items-center justify-between rounded border border-dashed border-rose-300 bg-rose-50/50 p-2 text-[11px] text-rose-800">
                            <span>Chưa có Host cho ca</span>
                            <button
                              type="button"
                              onClick={() => setQaState('06-assign-staff')}
                              disabled={isReadOnly}
                              className="font-bold text-rose-700 hover:text-rose-900 underline text-[11px]"
                            >
                              + Phân bổ Host
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 2. SUPPORT SECTION */}
                      <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            <span>Trợ lý & Hỗ trợ (Support)</span>
                          </span>
                          <span className={activeShift.capacity.support.confirmed >= activeShift.capacity.support.required ? 'text-emerald-700' : 'text-amber-700'}>
                            {activeShift.capacity.support.confirmed}/{activeShift.capacity.support.required}
                          </span>
                        </div>

                        {activeShift.assignments.filter(a => a.role === 'support').map(asg => (
                          <div key={asg.id} className="mt-1 flex items-center justify-between rounded bg-white p-2 border border-slate-200/80 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${asg.avatar_color}`}>
                                {asg.avatar_initials}
                              </div>
                              <div>
                                <div className="text-[11px] font-bold text-slate-800">{asg.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  <span>{asg.source === 'approved_registration' ? 'Duyệt đăng ký' : 'Gán thủ công'}</span>
                                  <span> · match: {asg.match_method}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQaState('15-role-reassignment')}
                                disabled={isReadOnly}
                                title="Đổi vai trò"
                                className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setQaState('14-unassign-impact')}
                                disabled={isReadOnly}
                                title="Gỡ nhân sự"
                                className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {activeShift.capacity.support.confirmed < activeShift.capacity.support.required && (
                          <div className="mt-1 flex items-center justify-between rounded border border-dashed border-amber-300 bg-amber-50/50 p-2 text-[11px] text-amber-800">
                            <span>Thiếu {activeShift.capacity.support.required - activeShift.capacity.support.confirmed} vị trí Support</span>
                            <button
                              type="button"
                              onClick={() => setQaState('06-assign-staff')}
                              disabled={isReadOnly}
                              className="font-bold text-blue-700 hover:text-blue-900 underline text-[11px]"
                            >
                              + Phân bổ Support
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 3. TECHNICAL SECTION */}
                      <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-purple-500" />
                            <span>Kỹ thuật (Technical)</span>
                          </span>
                          <span className={activeShift.capacity.technical.confirmed >= activeShift.capacity.technical.required ? 'text-emerald-700' : 'text-rose-700'}>
                            {activeShift.capacity.technical.confirmed}/{activeShift.capacity.technical.required}
                          </span>
                        </div>

                        {activeShift.assignments.filter(a => a.role === 'technical').map(asg => (
                          <div key={asg.id} className="mt-1 flex items-center justify-between rounded bg-white p-2 border border-slate-200/80 shadow-2xs">
                            <div className="flex items-center gap-2">
                              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${asg.avatar_color}`}>
                                {asg.avatar_initials}
                              </div>
                              <div>
                                <div className="text-[11px] font-bold text-slate-800">{asg.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  <span>{asg.source === 'imported_staffing' ? 'Import từ lịch (#IMP-01)' : 'Thủ công'}</span>
                                  <span> · match: {asg.match_method}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQaState('13-imported-staffing')}
                                title="Xem nguồn import"
                                className="p-1 text-slate-400 hover:text-purple-600"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setQaState('14-unassign-impact')}
                                disabled={isReadOnly}
                                title="Gỡ nhân sự"
                                className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {activeShift.capacity.technical.confirmed < activeShift.capacity.technical.required && (
                          <div className="mt-1 flex items-center justify-between rounded border border-dashed border-rose-300 bg-rose-50/50 p-2 text-[11px] text-rose-800">
                            <span>Chưa có nhân sự kỹ thuật</span>
                            <button
                              type="button"
                              onClick={() => setQaState('06-assign-staff')}
                              disabled={isReadOnly}
                              className="font-bold text-purple-700 hover:text-purple-900 underline text-[11px]"
                            >
                              + Phân bổ Tech
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* DOWNSTREAM GAP ALERT CALLOUT */}
                  {activeShift.capacity.support.confirmed < activeShift.capacity.support.required && (
                    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-0.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <span>Khoảng trống cần xử lý trước giờ phát sóng:</span>
                      </div>
                      Ca trực đang thiếu 1 nhân sự vị trí <strong>Support</strong>. Cần hoàn tất phê duyệt hoặc phân bổ trước 12:00 cùng ngày.
                    </div>
                  )}

                  {/* OPERATIONAL WORKSPACE QUICK ACTIONS */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setQaState('12-approved-registration')}
                      className="flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      <span>Duyệt đăng ký (4)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQaState('17-staff-schedule')}
                      className="flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      <Calendar className="h-3 w-3 text-blue-600" />
                      <span>Lịch trình nhân sự</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQaState('18-workload')}
                      className="flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      <BarChart2 className="h-3 w-3 text-slate-500" />
                      <span>Khối lượng tuần</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQaState('11-capacity-full')}
                      className="flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      <ShieldAlert className="h-3 w-3 text-purple-600" />
                      <span>Kiểm tra giới hạn</span>
                    </button>
                  </div>

                </aside>
              </div>

            </div>
          )}
        </div>

        {/* ===================================================================
            QA MODALS & POPUPS PER STATE
        ==================================================================== */}

        {/* STATE 05: ROLE CAPACITY BREAKDOWN MODAL */}
        {qaState === '05-role-capacity' && (
          <ModalWrapper title="Chi tiết định biên hạn mức vai trò (Role Capacity)" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="text-[12px] text-slate-600">
                Ca trực: <strong>{activeShift.title}</strong> ({activeShift.time} · {activeShift.studio})
              </div>

              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                <div className="grid grid-cols-4 p-3 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                  <span>Vai trò</span>
                  <span className="text-center">Yêu cầu (Required)</span>
                  <span className="text-center">Đã xác nhận (Confirmed)</span>
                  <span className="text-right">Còn thiếu (Needed)</span>
                </div>

                {/* Host */}
                <div className="grid grid-cols-4 items-center p-3 text-[12px]">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Host
                  </span>
                  <span className="text-center font-mono font-bold text-slate-700">{activeShift.capacity.host.required}</span>
                  <span className="text-center font-mono text-emerald-600 font-bold">{activeShift.capacity.host.confirmed}</span>
                  <span className="text-right font-mono font-bold text-slate-700">
                    {Math.max(0, activeShift.capacity.host.required - activeShift.capacity.host.confirmed)}
                  </span>
                </div>

                {/* Support */}
                <div className="grid grid-cols-4 items-center p-3 text-[12px]">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Support
                  </span>
                  <span className="text-center font-mono font-bold text-slate-700">{activeShift.capacity.support.required}</span>
                  <span className="text-center font-mono text-emerald-600 font-bold">{activeShift.capacity.support.confirmed}</span>
                  <span className="text-right font-mono font-bold text-amber-600">
                    {Math.max(0, activeShift.capacity.support.required - activeShift.capacity.support.confirmed)}
                  </span>
                </div>

                {/* Technical */}
                <div className="grid grid-cols-4 items-center p-3 text-[12px]">
                  <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500" /> Technical
                  </span>
                  <span className="text-center font-mono font-bold text-slate-700">{activeShift.capacity.technical.required}</span>
                  <span className="text-center font-mono text-emerald-600 font-bold">{activeShift.capacity.technical.confirmed}</span>
                  <span className="text-right font-mono font-bold text-slate-700">
                    {Math.max(0, activeShift.capacity.technical.required - activeShift.capacity.technical.confirmed)}
                  </span>
                </div>
              </div>

              <div className="rounded-md bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed border border-slate-200">
                <strong>Quy tắc nghiệp vụ:</strong> Hạn mức vai trò được thiết lập độc lập cho từng vai trò vận hành canonical (Host, Support, Technical). Không tự động chuyển đổi định biên giữa các vai trò khác nhau.
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 06, 07, 08, 09, 10, 22: ASSIGN STAFF MODAL & CANDIDATE EVALUATION */}
        {(qaState === '06-assign-staff' ||
          qaState === '07-eligible-candidates' ||
          qaState === '08-ineligible-candidate' ||
          qaState === '09-availability-conflict' ||
          qaState === '10-overlap-conflict' ||
          qaState === '22-no-eligible-candidates') && (
          <ModalWrapper
            title="Phân bổ nhân sự vào ca trực"
            subtitle={`${activeShift.title} · ${activeShift.time} · ${activeShift.studio}`}
            onClose={() => setQaState('01-staffing-main')}
          >
            <div className="space-y-4">

              {/* TARGET ROLE & CAPACITY BAR */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-[12px]">
                <div>
                  <div className="text-[11px] font-semibold text-blue-700 uppercase">Vị trí cần phân bổ</div>
                  <div className="text-[13px] font-bold text-blue-900">Support (Trợ lý livestream)</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-blue-700">Hiện tại: <strong>1/2 vị trí</strong></div>
                  <div className="text-[11px] font-bold text-amber-700">Còn thiếu: 1 vị trí</div>
                </div>
              </div>

              {/* FILTER CANDIDATES SEARCH */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm nhân sự theo tên, email, kỹ năng..."
                    className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-3 text-[12px] focus:outline-none focus:border-blue-500"
                    defaultValue={qaState === '22-no-eligible-candidates' ? 'Tìm nhân sự không tồn tại' : ''}
                  />
                </div>
                <Badge variant="outline" className="border-slate-300 text-slate-600 text-[11px]">
                  {qaState === '22-no-eligible-candidates' ? '0 ứng viên' : `${FIXTURE_CANDIDATES.length} ứng viên`}
                </Badge>
              </div>

              {/* FIT SCORE UNBACKED DISCLOSURE BANNER */}
              <div className="flex items-center justify-between gap-2 rounded-md border border-purple-200/80 bg-purple-50/70 px-2.5 py-1.5 text-[11px] text-purple-900">
                <span className="flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  <span>Điểm Fit chỉ là mô phỏng High-Fi, chưa có contract/backend production.</span>
                </span>
                <Badge variant="outline" className="border-purple-300 text-purple-800 text-[9px] bg-purple-100/60 font-mono shrink-0">
                  NEW_ONLY_UNBACKED
                </Badge>
              </div>

              {/* CANDIDATES LIST */}
              {qaState === '22-no-eligible-candidates' ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-8 text-center bg-slate-50">
                  <Users className="h-8 w-8 text-slate-400 mb-2" />
                  <div className="text-[13px] font-bold text-slate-800">Không tìm thấy ứng viên phù hợp</div>
                  <div className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    Không có nhân sự nào thỏa mãn vai trò Support và có trạng thái sẵn sàng trong khung giờ này.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {FIXTURE_CANDIDATES.map((cand) => {
                    const isCandidateEligible = cand.availability_status === 'available' && cand.staff_status === 'active' && cand.operational_roles.includes('support')
                    const isSpecificIneligible = qaState === '08-ineligible-candidate' && cand.id === 'cnd-03'
                    const isSpecificAvailability = qaState === '09-availability-conflict' && cand.id === 'cnd-04'
                    const isSpecificOverlap = qaState === '10-overlap-conflict' && cand.id === 'cnd-05'

                    return (
                      <div
                        key={cand.id}
                        className={`rounded-lg border p-3 transition-all ${
                          isSpecificIneligible || isSpecificAvailability || isSpecificOverlap
                            ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-200'
                            : isCandidateEligible
                            ? 'border-slate-200 bg-white hover:border-blue-300 shadow-2xs'
                            : 'border-slate-200 bg-slate-50/70 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${cand.avatar_color}`}>
                              {cand.avatar_initials}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-bold text-slate-900">{cand.full_name}</span>
                                <span className="text-[10px] text-slate-400">({cand.email})</span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px]">
                                <span className="text-slate-500">
                                  Vai trò: <strong>{cand.operational_roles.join(', ')}</strong>
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500">
                                  Đã phân tuần: <strong>{cand.weekly_shifts_count} ca ({cand.weekly_hours}h)</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {/* Fit Score with explicit unbacked disclosure (STAFF-002) */}
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-[11px] font-bold text-purple-700">{cand.fit_score}% Fit</span>
                                <span className="text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-1 rounded">
                                  Tham khảo
                                </span>
                                <span className="text-[8px] text-slate-500 border border-slate-200 px-1 rounded font-mono">
                                  NEW_ONLY_UNBACKED
                                </span>
                              </div>
                              <div className="text-[9px] text-slate-400">Chưa có dữ liệu production</div>
                            </div>

                            {/* Status badge */}
                            <div className="mt-1">
                              {cand.availability_status === 'available' && isCandidateEligible ? (
                                <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-medium border-emerald-200">
                                  <Check className="h-3 w-3 mr-0.5" /> Sẵn sàng
                                </Badge>
                              ) : cand.availability_status === 'conflicted' ? (
                                <Badge variant="destructive" className="text-[10px] font-medium">
                                  <AlertCircle className="h-3 w-3 mr-0.5" /> Trùng lịch
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] font-medium text-slate-600">
                                  <X className="h-3 w-3 mr-0.5" /> Không khả dụng
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* REASONS / CONFLICT NOTICE */}
                        {cand.availability_reason && (
                          <div className="mt-2.5 rounded bg-rose-50/80 p-2 text-[11px] text-rose-800 border border-rose-200">
                            <strong>Lý do không khả dụng:</strong> {cand.availability_reason}
                            {cand.conflict_detail && <div className="mt-0.5 text-rose-700">{cand.conflict_detail}</div>}
                          </div>
                        )}

                        {/* ACTION BUTTON */}
                        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                          <span className="text-[10px] text-slate-400">Nguồn gán: Thủ công (match_method: manual)</span>
                          <button
                            type="button"
                            disabled={!isCandidateEligible || isReadOnly}
                            onClick={() => setQaState('24-success')}
                            className={`rounded px-3 py-1 font-semibold transition-colors ${
                              isCandidateEligible && !isReadOnly
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-2xs'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            + Phân bổ vào ca
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 11: CAPACITY FULL BLOCKING STATE */}
        {qaState === '11-capacity-full' && (
          <ModalWrapper title="Cảnh báo: Hạn mức vai trò đã đủ (Capacity Full)" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-4 text-[12px] text-purple-900">
                <ShieldAlert className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[13px] text-purple-950">Vị trí Host đã đủ hạn mức (1/1)</h4>
                  <p className="mt-1 leading-relaxed text-purple-800">
                    Ca trực <strong>{activeShift.title}</strong> chỉ yêu cầu <strong>1 Host</strong> và vị trí này đã được xác nhận bởi <strong>Nguyễn Thị Mai Anh</strong>.
                  </p>
                  <p className="mt-2 text-[11px] text-purple-700">
                    Hệ thống chặn phân bổ thêm để tránh dư thừa nhân sự. Nếu muốn thay đổi nhân sự, vui lòng gỡ phân bổ hiện tại hoặc nâng chỉ tiêu định biên ca trực.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md bg-purple-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-purple-700 shadow-sm"
                >
                  Đã hiểu & quay lại
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 12: APPROVED REGISTRATION PROVENANCE DETAILS */}
        {qaState === '12-approved-registration' && (
          <ModalWrapper title="Chi tiết nguồn phân bổ: Đơn đăng ký ca trực" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-[12px]">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-[13px]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Đăng ký đã được phê duyệt (Approved Registration)</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-slate-700 pt-2 border-t border-emerald-200/60">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Mã đăng ký (Registration ID):</span>
                    <span className="font-mono font-bold text-slate-800">REG-1049</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Phương thức khớp (STAFF-001):</span>
                    <Badge variant="outline" className="border-emerald-300 text-emerald-800 font-mono text-[10px]">
                      match_method: exact
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Nhân sự:</span>
                    <span className="font-semibold text-slate-900">Nguyễn Thị Mai Anh (Host)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Thời điểm duyệt:</span>
                    <span className="text-slate-800">2026-09-08 09:30</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Người duyệt:</span>
                    <span className="font-medium text-slate-800">Admin Nguyễn Quản Trị</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Trạng thái phân bổ:</span>
                    <span className="font-bold text-emerald-700">Đã gán vào ca (Confirmed)</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed">
                <strong>Nguyên tắc phân định:</strong> Bản ghi <em>ShiftRegistration</em> (Đăng ký) và bản ghi <em>Staffing Assignment</em> (Phân bổ vận hành) là hai thực thể liên kết nhưng độc lập. Việc phê duyệt đăng ký sẽ kích hoạt tạo phân bổ chính thức với nguồn gốc được bảo tồn nguyên vẹn.
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 13: IMPORTED STAFFING PROVENANCE DETAILS */}
        {qaState === '13-imported-staffing' && (
          <ModalWrapper title="Chi tiết nguồn phân bổ: Nhập từ file lịch (Imported Staffing)" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-200 bg-purple-50/70 p-4 text-[12px]">
                <div className="flex items-center gap-2 font-bold text-purple-900 text-[13px]">
                  <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                  <span>Dữ liệu phân bổ từ tệp Excel bên ngoài</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-slate-700 pt-2 border-t border-purple-200/60">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Mã lô Import (Import Batch ID):</span>
                    <span className="font-mono font-bold text-purple-900">IMP-20260908-01</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Phương thức khớp (STAFF-001):</span>
                    <Badge variant="outline" className="border-purple-300 text-purple-800 font-mono text-[10px]">
                      match_method: normalized
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Tên gốc trong tệp:</span>
                    <span className="font-mono text-slate-800">&quot;Hoang Long Tech&quot;</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Tài khoản chuẩn hóa:</span>
                    <span className="font-semibold text-slate-900">Lê Hoàng Long (usr-long)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Trạng thái đối soát:</span>
                    <span className="font-bold text-emerald-700">Đã khớp danh tính (Resolved)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Thời gian nhập:</span>
                    <span className="text-slate-800">2026-09-08 10:00:15</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed">
                <strong>Quy tắc Import:</strong> Khi đồng bộ từ bảng tính, hệ thống tự động chuẩn hóa tên người dùng không dấu và ánh xạ sang tài khoản nhân viên chính thức trong hệ thống.
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 14: UNASSIGN CONFIRMATION & DOWNSTREAM IMPACT */}
        {qaState === '14-unassign-impact' && (
          <ModalWrapper title="Xác nhận gỡ nhân sự khỏi ca trực" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-[12px] text-rose-900">
                <div className="flex items-center gap-2 font-bold text-[13px] text-rose-950">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>Cảnh báo tác động thiếu hụt nhân sự (Downstream Capacity Impact)</span>
                </div>
                <p className="mt-2 leading-relaxed">
                  Bạn đang thao tác gỡ nhân sự <strong>Trần Quốc Huy</strong> khỏi vị trí <strong>Support</strong> của ca <em>{activeShift.title}</em>.
                </p>
                <div className="mt-3 rounded bg-white/80 p-2.5 border border-rose-200 text-[11px] space-y-1 text-rose-800">
                  <div>· Hạn mức Support sẽ giảm từ <strong>1/2</strong> xuống <strong>0/2</strong> (Thiếu 2 người).</div>
                  <div>· Ca trực sẽ chuyển sang trạng thái <strong>Cần bổ sung nhân sự gấp</strong>.</div>
                  <div>· Hệ thống sẽ lưu vết hành động này vào Lịch sử phân ca (Staffing Audit Trail).</div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Lý do gỡ nhân sự (Bắt buộc):</label>
                <select className="h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-[12px] focus:outline-none">
                  <option>Điều phối sang ca trực khẩn cấp khác</option>
                  <option>Nhân sự báo bận / xin nghỉ đột xuất</option>
                  <option>Không đủ tiêu chuẩn kỹ thuật thương hiệu</option>
                  <option>Sai sót trong phân bổ thủ công</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md bg-rose-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 shadow-sm"
                >
                  Xác nhận gỡ nhân sự
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 15: ROLE REASSIGNMENT MODAL */}
        {qaState === '15-role-reassignment' && (
          <ModalWrapper title="Điều chỉnh vai trò nhân sự trong ca" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px]">
                <div className="text-[11px] text-slate-500 uppercase font-semibold">Nhân sự được điều chỉnh</div>
                <div className="text-[13px] font-bold text-slate-800 mt-0.5">Trần Quốc Huy (usr-huy)</div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Vai trò hiện tại trong ca: <Badge variant="outline" className="border-blue-300 text-blue-700 font-semibold text-[10px]">Support</Badge>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1.5">Chọn vai trò mới (Canonical Roles):</label>
                <div className="space-y-2">
                  <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-[12px] hover:bg-slate-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input type="radio" name="reassign_role" value="host" defaultChecked className="text-blue-600" />
                      <span className="font-bold text-slate-800">Host (Người phát trực tiếp)</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                      Đạt năng lực kỹ năng
                    </span>
                  </label>

                  <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-[12px] hover:bg-slate-50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input type="radio" name="reassign_role" value="technical" className="text-blue-600" />
                      <span className="font-bold text-slate-800">Technical (Kỹ thuật viên)</span>
                    </div>
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-semibold">
                      Chưa kích hoạt vai trò này
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-md bg-amber-50 p-3 text-[11px] text-amber-800 border border-amber-200">
                <strong>Lưu ý:</strong> Chuyển sang vị trí Host sẽ làm trống 1 suất Support hiện tại và tự động cập nhật lại hạn mức các vai trò.
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('24-success')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Lưu thay đổi vai trò
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 16: AUTO-BALANCE PROPOSAL PREVIEW [NEW_ONLY_UNBACKED = YES] */}
        {qaState === '16-auto-balance' && (
          <ModalWrapper
            title="Đề xuất cân đối nhân sự tự động"
            subtitle="Hệ thống đề xuất dựa trên điểm phù hợp [NEW_ONLY_UNBACKED = YES]"
            onClose={() => setQaState('01-staffing-main')}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-200 bg-purple-50/70 p-3 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-900">Gợi ý lấp đầy 2 khoảng trống ca trực</span>
                  <Badge variant="outline" className="border-purple-300 text-purple-800 text-[10px]">
                    NEW_ONLY_UNBACKED = YES
                  </Badge>
                </div>
                <p className="text-[11px] text-purple-700 mt-1">
                  Thuật toán tự động quét 14 nhân sự có kỹ năng phù hợp, kiểm tra lịch bận và đề xuất phương án tối ưu:
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[12px]">
                    <div>
                      <span className="font-bold text-slate-800">Lê Tuấn Minh</span>
                      <span className="text-slate-500 text-[11px] block">Đề xuất vào vị trí: <strong>Support (Pharmaton Live)</strong></span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-purple-700">96% Phù hợp</span>
                      <span className="text-[10px] text-emerald-600 block">Không trùng lịch</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[12px]">
                    <div>
                      <span className="font-bold text-slate-800">Vũ Minh Đức</span>
                      <span className="text-slate-500 text-[11px] block">Đề xuất vào vị trí: <strong>Support 2 (Samsung Live)</strong></span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-bold text-purple-700">92% Phù hợp</span>
                      <span className="text-[10px] text-emerald-600 block">Đã có 1 ca/tuần</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('24-success')}
                  className="rounded-md bg-purple-600 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-purple-700 shadow-sm"
                >
                  Áp dụng đề xuất
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 17: STAFF SCHEDULE CONTEXT */}
        {qaState === '17-staff-schedule' && (
          <ModalWrapper title="Lịch trình tuần của nhân sự: Nguyễn Thị Mai Anh" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12px]">
                <div>
                  <span className="font-bold text-slate-900">Nguyễn Thị Mai Anh (Host)</span>
                  <span className="text-slate-500 block text-[11px]">Tuần hiện tại: 10/09/2026 – 16/09/2026</span>
                </div>
                <Badge className="bg-blue-100 text-blue-800 text-[11px]">Tổng 4 ca trực (14 giờ)</Badge>
              </div>

              <div className="space-y-2 text-[12px]">
                <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">Thứ 5, 10/09 (Hôm nay): 14:00 – 17:00</span>
                    <span className="text-[11px] text-slate-600 block">Pharmaton – TikTok Live (Studio A) · Vai trò: Host</span>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-800 text-[10px]">Đang chọn</Badge>
                </div>

                <div className="rounded border border-slate-200 bg-white p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">Thứ 6, 11/09: 18:00 – 21:00</span>
                    <span className="text-[11px] text-slate-600 block">Maybelline New York (Studio B) · Vai trò: Host</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">3 giờ</span>
                </div>

                <div className="rounded border border-slate-200 bg-white p-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900">Thứ 7, 12/09: 09:00 – 13:00</span>
                    <span className="text-[11px] text-slate-600 block">Shopee Super Tech Day (Studio A) · Vai trò: Host</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">4 giờ</span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 18: WORKLOAD CONTEXT */}
        {qaState === '18-workload' && (
          <ModalWrapper title="Bối cảnh khối lượng công việc (Workload Distribution)" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-4 text-[12px]">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Số ca tuần này</div>
                  <div className="text-[16px] font-bold text-slate-800 mt-0.5">4 ca</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Tổng số giờ</div>
                  <div className="text-[16px] font-bold text-blue-600 mt-0.5">14.0 giờ</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Tải công việc</div>
                  <div className="text-[16px] font-bold text-emerald-600 mt-0.5">An toàn (70%)</div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">Hạn mức giờ khuyến nghị / tuần</span>
                  <span className="font-bold text-slate-800">14 / 20 giờ</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: '70%' }} />
                </div>
                <div className="text-[10px] text-slate-500">
                  Nhân sự còn 6.0 giờ trống trước khi chạm ngưỡng tối đa (20 giờ/tuần).
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* STATE 19: STAFFING HISTORY & AUDIT LOG */}
        {qaState === '19-staffing-history' && (
          <ModalWrapper title="Lịch sử phân bổ & Kiểm toán ca trực" onClose={() => setQaState('01-staffing-main')}>
            <div className="space-y-3">
              <div className="text-[12px] text-slate-500">
                Nhật ký kiểm toán ghi nhận mọi thay đổi phân bổ, người thực hiện và mốc thời gian:
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white max-h-80 overflow-y-auto">
                {FIXTURE_AUDIT_LOGS.map((log) => (
                  <div key={log.id} className="p-3 text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="font-mono text-[10px]">{log.timestamp}</span>
                      <Badge variant="outline" className="text-[10px] font-medium border-slate-200">
                        {log.actor} ({log.actor_role})
                      </Badge>
                    </div>
                    <div className="font-bold text-slate-900 text-[12px]">
                      {log.target_user} · <span className="uppercase text-blue-600">{log.role}</span>
                    </div>
                    <div className="text-slate-600 leading-relaxed">{log.details}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setQaState('01-staffing-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* ===================================================================
            QA STATE CONTROLLER (Docked at bottom, collapsible)
        ==================================================================== */}
        <div data-qa-controller className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-white shadow-2xl transition-all">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-300">
                WAVE 07 STAFFING QA CONTROLLER
              </span>
              <span className="rounded bg-blue-900/60 px-1.5 py-0.5 text-[10px] text-blue-300 font-mono">
                {qaState}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQaOpen(!qaOpen)}
              className="rounded bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
            >
              {qaOpen ? 'Thu gọn ▲' : 'Mở rộng 25 States ▼'}
            </button>
          </div>

          {qaOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-1.5 p-3 max-h-56 overflow-y-auto text-[11px]">
              {[
                { id: '01-staffing-main', label: '01 Main Staffing' },
                { id: '02-shift-selected', label: '02 Shift Selected' },
                { id: '03-fully-staffed', label: '03 Fully Staffed' },
                { id: '04-understaffed', label: '04 Understaffed' },
                { id: '05-role-capacity', label: '05 Role Capacity' },
                { id: '06-assign-staff', label: '06 Assign Staff' },
                { id: '07-eligible-candidates', label: '07 Eligible Staff' },
                { id: '08-ineligible-candidate', label: '08 Ineligible Staff' },
                { id: '09-availability-conflict', label: '09 Avail Conflict' },
                { id: '10-overlap-conflict', label: '10 Overlap Conflict' },
                { id: '11-capacity-full', label: '11 Capacity Full' },
                { id: '12-approved-registration', label: '12 Approved Reg' },
                { id: '13-imported-staffing', label: '13 Imported Source' },
                { id: '14-unassign-impact', label: '14 Unassign Impact' },
                { id: '15-role-reassignment', label: '15 Reassign Role' },
                { id: '16-auto-balance', label: '16 Auto Balance' },
                { id: '17-staff-schedule', label: '17 Staff Schedule' },
                { id: '18-workload', label: '18 Workload Context' },
                { id: '19-staffing-history', label: '19 Staff History' },
                { id: '20-permission-read-only', label: '20 Read-Only Perm' },
                { id: '21-concurrency', label: '21 Concurrency CAS' },
                { id: '22-no-eligible-candidates', label: '22 No Candidates' },
                { id: '23-empty', label: '23 Empty Workspace' },
                { id: '24-success', label: '24 Toast Success' },
                { id: '25-error', label: '25 Toast Error' }
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  data-qa-trigger={st.id}
                  onClick={() => setQaState(st.id as StaffingQaStateId)}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
