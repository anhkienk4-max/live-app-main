'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Users, UserCheck, UserX, Shield, ShieldAlert, ShieldCheck, Mail, Phone,
  CalendarDays, MoreHorizontal, Pencil, X, Search, ChevronDown, CheckCircle2,
  XCircle, AlertTriangle, AlertCircle, RefreshCw, RotateCcw, Power, PowerOff,
  Archive, Briefcase, Plus, Filter, Clock, Eye, Layers, ExternalLink,
  HelpCircle, FileText, Check, ArrowRight, UserPlus, Sparkles, Building2,
  Calendar, CheckSquare, BarChart3, AlertOctagon, Undo2, Lock, Tag, UserMinus
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PeopleOpsReferenceShell } from './PeopleOpsReferenceShell'

// =============================================================================
// TYPES & QA STATES
// =============================================================================

export type PeopleQaStateId =
  | '01-people-main'
  | '02-active-filters'
  | '03-person-detail'
  | '04-system-permission'
  | '05-operational-roles'
  | '06-staff-status'
  | '07-account-status'
  | '08-pending-account-request'
  | '09-approve-account'
  | '10-reject-account'
  | '11-provisioning'
  | '12-provisioning-failed'
  | '13-archive-impact'
  | '14-archived-person'
  | '15-restore'
  | '16-temporary-leave'
  | '17-left-staff'
  | '18-workload'
  | '19-concurrency'
  | '20-self-protection'
  | '21-permission-read-only'
  | '22-empty'
  | '23-no-results'
  | '24-success'
  | '25-error'

export type PeopleWorkspaceTab = 'staff' | 'requests' | 'archived'

export interface UserRecord {
  id: string
  auth_user_id?: string
  email: string
  full_name: string
  avatar_url?: string
  avatar_storage_path?: string
  phone?: string
  role: 'admin' | 'leader' | 'staff'
  system_permission: 'admin' | 'leader' | 'member'
  operational_roles: ('host' | 'support' | 'technical')[]
  department?: string
  status: 'active' | 'temporary_leave' | 'left' | 'archived'
  account_status: 'active' | 'pending_approval' | 'pending_email_verification' | 'inactive' | 'rejected'
  email_verified: boolean
  auth_provider: 'email' | 'google'
  join_date: string
  created_at: string
  updated_at: string
  deleted_at?: string
  deleted_by?: string
  archived_at?: string
  archived_by?: string
  deletion_reason?: string
  version: number
  workload: {
    host: number
    support: number
    technical: number
    total: number
  }
  status_note?: string
  unbacked_rating?: string
  unbacked_skills?: string[]
  unbacked_roles?: string[]
  avatar_bg?: string
  initials?: string
}

export interface AccountRequestRecord {
  id: string
  version: number
  email: string
  full_name: string
  phone: string
  department: string
  requested_role: 'host' | 'support' | 'technical'
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  provisioning_status: 'not_started' | 'in_progress' | 'invited' | 'linked' | 'failed'
  provisioning_error_code?: string
  rejection_reason?: string
  submitted_at: string
  reviewed_at?: string
  reviewed_by?: string
  avatar_bg?: string
  initials?: string
}
// =============================================================================
// FIXTURE DATA (RECONCILED AUTHORITATIVE STATE)
// =============================================================================

export const CURRENT_USER: UserRecord = {
  id: 'usr-admin-kien',
  auth_user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'kien.nguyen@livestream.vn',
  full_name: 'Nguyễn Trung Kiên',
  avatar_url: '',
  avatar_storage_path: 'avatars/usr-admin-kien.png',
  phone: '+84 90 888 7766',
  role: 'admin',
  system_permission: 'admin',
  operational_roles: ['host', 'technical'],
  department: 'Operations & Engineering',
  status: 'active',
  account_status: 'active',
  email_verified: true,
  auth_provider: 'google',
  join_date: '2023-11-01',
  created_at: '2023-11-01T08:00:00.000Z',
  updated_at: '2026-09-20T10:00:00.000Z',
  version: 3,
  workload: { host: 8, support: 2, technical: 14, total: 24 },
  initials: 'NK',
  avatar_bg: 'bg-blue-100 text-blue-700',
  unbacked_rating: '5.0/5',
  unbacked_skills: ['Ops Director', 'OBS Master', 'RTMP Streaming'],
}

// 47 total current staff = 42 Active + 3 Temporary Leave + 2 Left
export const STAFF_RECORDS: UserRecord[] = [
  CURRENT_USER,
  {
    id: 'usr-mai',
    auth_user_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    email: 'mai.nguyen@gmail.com',
    full_name: 'Nguyễn Thị Mai',
    avatar_url: '',
    avatar_storage_path: 'avatars/usr-mai.png',
    phone: '+84 32 456 7890',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-03-15',
    created_at: '2024-03-15T09:00:00.000Z',
    updated_at: '2026-09-10T14:30:00.000Z',
    version: 2,
    workload: { host: 18, support: 2, technical: 0, total: 20 },
    initials: 'NM',
    avatar_bg: 'bg-rose-100 text-rose-700',
    unbacked_rating: '4.9/5',
    unbacked_skills: ['Livestream Pro', 'Sales Healthcare', 'TikTok Live'],
    unbacked_roles: ['Host', 'Moderator'],
  },
  {
    id: 'usr-nam',
    auth_user_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    email: 'nam.tran@gmail.com',
    full_name: 'Trần Văn Nam',
    avatar_url: '',
    avatar_storage_path: 'avatars/usr-nam.png',
    phone: '+84 90 123 4567',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Creator Ops',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-04-20',
    created_at: '2024-04-20T08:00:00.000Z',
    updated_at: '2026-08-15T11:00:00.000Z',
    version: 1,
    workload: { host: 0, support: 22, technical: 3, total: 25 },
    initials: 'TN',
    avatar_bg: 'bg-blue-100 text-blue-700',
    unbacked_rating: '4.7/5',
    unbacked_skills: ['Deal Pinning', 'Chat Support', 'Shopee Live'],
  },
  {
    id: 'usr-huong',
    auth_user_id: 'd4e5f6a7-b8c9-0123-def1-234567890123',
    email: 'huong.le@gmail.com',
    full_name: 'Lê Thị Hương',
    avatar_url: '',
    avatar_storage_path: 'avatars/usr-huong.png',
    phone: '+84 98 765 4321',
    role: 'leader',
    system_permission: 'leader',
    operational_roles: ['host', 'support'],
    department: 'Live Commerce',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-02-10',
    created_at: '2024-02-10T09:00:00.000Z',
    updated_at: '2026-09-01T16:00:00.000Z',
    version: 4,
    workload: { host: 14, support: 6, technical: 0, total: 20 },
    initials: 'LH',
    avatar_bg: 'bg-violet-100 text-violet-700',
    unbacked_rating: '4.8/5',
    unbacked_skills: ['Team Lead', 'Host Beauty', 'Crisis Handling'],
  },
  {
    id: 'usr-quan',
    auth_user_id: 'e5f6a7b8-c9d0-1234-ef12-345678901234',
    email: 'quan.pham@gmail.com',
    full_name: 'Phạm Minh Quân',
    avatar_url: '',
    avatar_storage_path: 'avatars/usr-quan.png',
    phone: '+84 37 888 9999',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'],
    department: 'Technical Ops',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-01-05',
    created_at: '2024-01-05T08:00:00.000Z',
    updated_at: '2026-09-18T10:00:00.000Z',
    version: 3,
    workload: { host: 0, support: 0, technical: 28, total: 28 },
    initials: 'PQ',
    avatar_bg: 'bg-fuchsia-100 text-fuchsia-700',
    unbacked_rating: '4.9/5',
    unbacked_skills: ['OBS Specialist', 'Lighting Setup', 'Audio Mixer'],
  },
  {
    id: 'usr-tuan',
    auth_user_id: 'f6a7b8c9-d0e1-2345-f123-456789012345',
    email: 'tuan.hoang@gmail.com',
    full_name: 'Hoàng Anh Tuấn',
    avatar_url: '',
    avatar_storage_path: 'avatars/usr-tuan.png',
    phone: '+84 93 111 2233',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-03-12',
    created_at: '2024-03-12T08:30:00.000Z',
    updated_at: '2026-08-30T14:00:00.000Z',
    version: 1,
    workload: { host: 16, support: 0, technical: 0, total: 16 },
    initials: 'HT',
    avatar_bg: 'bg-cyan-100 text-cyan-700',
    unbacked_rating: '4.6/5',
    unbacked_skills: ['Electronics Host', 'Fast Pitching'],
  },
  {
    id: 'usr-trang',
    auth_user_id: 'a7b8c9d0-e1f2-3456-1234-567890123456',
    email: 'trang.mai@gmail.com',
    full_name: 'Mai Thùy Trang',
    avatar_url: '',
    phone: '+84 91 333 4455',
    role: 'leader',
    system_permission: 'leader',
    operational_roles: ['host', 'support'],
    department: 'Creator Ops',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-01-20',
    created_at: '2024-01-20T09:00:00.000Z',
    updated_at: '2026-09-12T11:00:00.000Z',
    version: 2,
    workload: { host: 10, support: 12, technical: 0, total: 22 },
    initials: 'MT',
    avatar_bg: 'bg-emerald-100 text-emerald-700',
    unbacked_rating: '4.8/5',
  },
  {
    id: 'usr-duc',
    auth_user_id: 'b8c9d0e1-f2a3-4567-2345-678901234567',
    email: 'duc.nguyen@gmail.com',
    full_name: 'Nguyễn Minh Đức',
    avatar_url: '',
    phone: '+84 96 555 6677',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'],
    department: 'Technical Ops',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-02-01',
    created_at: '2024-02-01T08:00:00.000Z',
    updated_at: '2026-09-15T15:00:00.000Z',
    version: 2,
    workload: { host: 0, support: 0, technical: 26, total: 26 },
    initials: 'MD',
    avatar_bg: 'bg-indigo-100 text-indigo-700',
    unbacked_rating: '4.7/5',
  },
  {
    id: 'usr-thao',
    auth_user_id: 'c9d0e1f2-a3b4-5678-3456-789012345678',
    email: 'thao.le@gmail.com',
    full_name: 'Lê Phương Thảo',
    avatar_url: '',
    phone: '+84 97 111 4455',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Live Commerce',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-05-02',
    created_at: '2024-05-02T09:00:00.000Z',
    updated_at: '2026-09-14T10:00:00.000Z',
    version: 1,
    workload: { host: 0, support: 19, technical: 0, total: 19 },
    initials: 'PT',
    avatar_bg: 'bg-pink-100 text-pink-700',
    unbacked_rating: '4.9/5',
  },
  {
    id: 'usr-hoang',
    auth_user_id: 'd0e1f2a3-b4c5-6789-4567-890123456789',
    email: 'hoang.vu@gmail.com',
    full_name: 'Vũ Huy Hoàng',
    avatar_url: '',
    phone: '+84 98 222 3344',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-04-11',
    created_at: '2024-04-11T08:00:00.000Z',
    updated_at: '2026-08-20T16:00:00.000Z',
    version: 1,
    workload: { host: 15, support: 0, technical: 0, total: 15 },
    initials: 'HH',
    avatar_bg: 'bg-amber-100 text-amber-700',
    unbacked_rating: '4.6/5',
  },
  {
    id: 'usr-linh',
    auth_user_id: 'e1f2a3b4-c5d6-7890-5678-901234567890',
    email: 'linh.nguyen@gmail.com',
    full_name: 'Nguyễn Thị Linh',
    avatar_url: '',
    phone: '+84 91 666 7788',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Creator Ops',
    status: 'active',
    account_status: 'pending_approval',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-09-01',
    created_at: '2024-09-01T08:00:00.000Z',
    updated_at: '2026-09-24T09:00:00.000Z',
    version: 1,
    workload: { host: 0, support: 4, technical: 0, total: 4 },
    initials: 'NL',
    avatar_bg: 'bg-indigo-100 text-indigo-700',
    unbacked_rating: '4.5/5',
  },
  {
    id: 'usr-yen',
    auth_user_id: 'f2a3b4c5-d6e7-8901-6789-012345678901',
    email: 'yen.do@gmail.com',
    full_name: 'Đỗ Hải Yến',
    avatar_url: '',
    phone: '+84 94 777 8899',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-06-01',
    created_at: '2024-06-01T09:00:00.000Z',
    updated_at: '2026-09-19T14:00:00.000Z',
    version: 1,
    workload: { host: 12, support: 0, technical: 0, total: 12 },
    initials: 'HY',
    avatar_bg: 'bg-rose-100 text-rose-700',
    unbacked_rating: '4.7/5',
  },
  {
    id: 'usr-an',
    auth_user_id: 'a3b4c5d6-e7f8-9012-7890-123456789012',
    email: 'an.bui@gmail.com',
    full_name: 'Bùi Gia An',
    avatar_url: '',
    phone: '+84 93 444 5566',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'],
    department: 'Technical Ops',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-05-15',
    created_at: '2024-05-15T08:00:00.000Z',
    updated_at: '2026-09-17T11:00:00.000Z',
    version: 1,
    workload: { host: 0, support: 0, technical: 17, total: 17 },
    initials: 'GA',
    avatar_bg: 'bg-sky-100 text-sky-700',
    unbacked_rating: '4.8/5',
  },
  // Additional active staff to reconcile exact count to 42 active staff
  ...Array.from({ length: 29 }, (_, i) => {
    const idx = i + 14
    const roles: ('host' | 'support' | 'technical')[] = i % 3 === 0 ? ['host'] : i % 3 === 1 ? ['support'] : ['technical']
    const roleName = roles[0]
    const depts = ['Live Commerce', 'Creator Ops', 'Technical Ops']
    const names = [
      'Trịnh Kim Ngân', 'Đặng Quốc Bảo', 'Phan Thanh Trúc', 'Lê Hữu Đạt', 'Ngô Bảo Châu',
      'Dương Thùy Linh', 'Hoàng Minh Khôi', 'Vũ Tuyết Mai', 'Bùi Tiến Dũng', 'Lý Hải Đăng',
      'Đoàn Thúy Vi', 'Cao Minh Triết', 'Lâm Khánh Chi', 'Tạ Đình Phong', 'Hà Kiều Anh',
      'Thái Gia Hưng', 'Nguyễn Quỳnh Nga', 'Trần Hữu Kiên', 'Lê Bích Ngọc', 'Phạm Trọng Tấn',
      'Đặng Hoài Nam', 'Võ Hồng Nhung', 'Đỗ Thành Vinh', 'Phan Ánh Nguyệt', 'Hồ Quang Hiếu',
      'Trương Thảo Nhi', 'Lương Bằng Quang', 'Nguyễn Cao Kỳ', 'Phạm Đình Thái'
    ]
    const name = names[i] || `Nhân sự Vận hành ${idx}`
    const initials = name.split(' ').map(n => n[0]).slice(-2).join('').toUpperCase()
    return {
      id: `usr-act-${idx}`,
      auth_user_id: `auth-uuid-act-${idx}-9999-0000`,
      email: `staff.${idx}@livestream.vn`,
      full_name: name,
      avatar_url: '',
      phone: `+84 9${(i % 9) + 1} ${100 + i} ${200 + i}`,
      role: 'staff' as const,
      system_permission: 'member' as const,
      operational_roles: roles,
      department: depts[i % 3],
      status: 'active' as const,
      account_status: (i === 5 ? 'pending_email_verification' : 'active') as 'active' | 'pending_email_verification',
      email_verified: i !== 5,
      auth_provider: (i % 2 === 0 ? 'email' : 'google') as 'email' | 'google',
      join_date: '2024-06-10',
      created_at: '2024-06-10T08:00:00.000Z',
      updated_at: '2026-09-01T08:00:00.000Z',
      version: 1,
      workload: {
        host: roleName === 'host' ? 8 + (i % 7) : 0,
        support: roleName === 'support' ? 10 + (i % 8) : 0,
        technical: roleName === 'technical' ? 12 + (i % 9) : 0,
        total: 10 + (i % 10),
      },
      initials,
      avatar_bg: 'bg-slate-100 text-slate-700',
      unbacked_rating: '4.6/5',
    }
  }),
  // 3 Staff on Temporary Leave (Tạm nghỉ)
  {
    id: 'usr-ngoc',
    auth_user_id: 'b4c5d6e7-f8a9-0123-8901-234567890123',
    email: 'ngoc.vu@gmail.com',
    full_name: 'Vũ Thị Ngọc',
    avatar_url: '',
    phone: '+84 35 222 3344',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Creator Ops',
    status: 'temporary_leave',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-06-18',
    created_at: '2024-06-18T09:00:00.000Z',
    updated_at: '2026-09-01T08:00:00.000Z',
    version: 2,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'VN',
    avatar_bg: 'bg-amber-100 text-amber-700',
    status_note: 'Nghỉ thai sản có phép từ 01/09/2026 đến 01/03/2027. Tạm giữ quyền đăng nhập, miễn tự động phân ca.',
  },
  {
    id: 'usr-thang',
    auth_user_id: 'c5d6e7f8-a9b0-1234-9012-345678901234',
    email: 'thang.tran@gmail.com',
    full_name: 'Trần Quốc Thắng',
    avatar_url: '',
    phone: '+84 94 333 4455',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'],
    department: 'Technical Ops',
    status: 'temporary_leave',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-02-15',
    created_at: '2024-02-15T09:00:00.000Z',
    updated_at: '2026-09-20T10:00:00.000Z',
    version: 1,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'QT',
    avatar_bg: 'bg-amber-100 text-amber-700',
    status_note: 'Nghỉ đào tạo nâng cao công nghệ RTMP & âm thanh phòng Studio đến 15/10/2026.',
  },
  {
    id: 'usr-phuong',
    auth_user_id: 'd6e7f8a9-b0c1-2345-0123-456789012345',
    email: 'phuong.dang@gmail.com',
    full_name: 'Đặng Thu Phương',
    avatar_url: '',
    phone: '+84 91 222 9988',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'temporary_leave',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-05-10',
    created_at: '2024-05-10T09:00:00.000Z',
    updated_at: '2026-09-22T09:00:00.000Z',
    version: 1,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'TP',
    avatar_bg: 'bg-amber-100 text-amber-700',
    status_note: 'Nghỉ việc riêng có phép từ 20/09 đến 10/10/2026. Lịch ca được tạm hoãn phân công.',
  },
  // 2 Staff Departed / Left (Đã rời)
  {
    id: 'usr-huy',
    auth_user_id: 'e7f8a9b0-c1d2-3456-1234-567890123456',
    email: 'huy.do@gmail.com',
    full_name: 'Đỗ Quang Huy',
    avatar_url: '',
    phone: '+84 36 444 5566',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'left',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-03-01',
    created_at: '2024-03-01T08:00:00.000Z',
    updated_at: '2026-08-15T17:00:00.000Z',
    version: 2,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'QH',
    avatar_bg: 'bg-slate-100 text-slate-500',
    status_note: 'Đã hoàn tất bàn giao và rời việc ngày 15/08/2026. Đã thu hồi quyền đăng nhập, toàn bộ lịch sử ca quá khứ được bảo lưu.',
  },
  {
    id: 'usr-van',
    auth_user_id: 'f8a9b0c1-d2e3-4567-2345-678901234567',
    email: 'van.le@gmail.com',
    full_name: 'Lê Cẩm Vân',
    avatar_url: '',
    phone: '+84 97 888 1122',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Creator Ops',
    status: 'left',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-04-01',
    created_at: '2024-04-01T08:00:00.000Z',
    updated_at: '2026-06-30T17:00:00.000Z',
    version: 2,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'CV',
    avatar_bg: 'bg-slate-100 text-slate-500',
    status_note: 'Đã rời việc ngày 30/06/2026. Lịch sử phân ca kiểm toán được bảo lưu.',
  },
]

// 5 Archived Staff Records (Soft-deleted)
export const ARCHIVED_RECORDS: UserRecord[] = [
  {
    id: 'usr-arc-1',
    auth_user_id: 'a9b0c1d2-e3f4-5678-3456-789012345678',
    email: 'hung.bui@gmail.com',
    full_name: 'Bùi Văn Hùng',
    phone: '+84 98 111 9988',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'],
    department: 'Technical Ops',
    status: 'archived',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2023-12-01',
    created_at: '2023-12-01T08:00:00.000Z',
    updated_at: '2026-07-01T08:00:00.000Z',
    deleted_at: '2026-07-01T08:00:00.000Z',
    deleted_by: 'Nguyễn Trung Kiên (Admin)',
    archived_at: '2026-07-01T08:00:00.000Z',
    archived_by: 'Nguyễn Trung Kiên (Admin)',
    deletion_reason: 'Thanh lý hợp đồng dự án cũ và chuyển giao thiết bị',
    version: 3,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'VH',
    avatar_bg: 'bg-zinc-100 text-zinc-600',
  },
  {
    id: 'usr-arc-2',
    auth_user_id: 'b0c1d2e3-f4a5-6789-4567-890123456789',
    email: 'be.tran@gmail.com',
    full_name: 'Trần Thị Bé',
    phone: '+84 90 222 8877',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Creator Ops',
    status: 'archived',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-01-15',
    created_at: '2024-01-15T09:00:00.000Z',
    updated_at: '2026-06-15T10:30:00.000Z',
    deleted_at: '2026-06-15T10:30:00.000Z',
    deleted_by: 'Nguyễn Trung Kiên (Admin)',
    archived_at: '2026-06-15T10:30:00.000Z',
    archived_by: 'Nguyễn Trung Kiên (Admin)',
    deletion_reason: 'Chuyển sang đơn vị kinh doanh đối tác',
    version: 2,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'TB',
    avatar_bg: 'bg-zinc-100 text-zinc-600',
  },
  {
    id: 'usr-arc-3',
    auth_user_id: 'c1d2e3f4-a5b6-7890-5678-901234567890',
    email: 'long.pham@gmail.com',
    full_name: 'Phạm Hoàng Long',
    phone: '+84 93 333 7766',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    department: 'Live Commerce',
    status: 'archived',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'google',
    join_date: '2024-02-20',
    created_at: '2024-02-20T08:30:00.000Z',
    updated_at: '2026-05-20T14:15:00.000Z',
    deleted_at: '2026-05-20T14:15:00.000Z',
    deleted_by: 'Nguyễn Trung Kiên (Admin)',
    archived_at: '2026-05-20T14:15:00.000Z',
    archived_by: 'Nguyễn Trung Kiên (Admin)',
    deletion_reason: 'Ngừng hợp tác theo nguyện vọng cá nhân',
    version: 2,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'HL',
    avatar_bg: 'bg-zinc-100 text-zinc-600',
  },
  {
    id: 'usr-arc-4',
    auth_user_id: 'd2e3f4a5-b6c7-8901-6789-012345678901',
    email: 'duyen.ngo@gmail.com',
    full_name: 'Ngô Mỹ Duyên',
    phone: '+84 91 444 6655',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['support'],
    department: 'Creator Ops',
    status: 'archived',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2024-01-08',
    created_at: '2024-01-08T09:00:00.000Z',
    updated_at: '2026-04-10T09:00:00.000Z',
    deleted_at: '2026-04-10T09:00:00.000Z',
    deleted_by: 'Nguyễn Trung Kiên (Admin)',
    archived_at: '2026-04-10T09:00:00.000Z',
    archived_by: 'Nguyễn Trung Kiên (Admin)',
    deletion_reason: 'Lưu trữ hồ sơ thực tập sinh kết thúc kỳ thực tập',
    version: 1,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'MD',
    avatar_bg: 'bg-zinc-100 text-zinc-600',
  },
  {
    id: 'usr-arc-5',
    auth_user_id: 'e3f4a5b6-c7d8-9012-7890-123456789012',
    email: 'trong.vu@gmail.com',
    full_name: 'Vũ Đình Trọng',
    phone: '+84 97 555 5544',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['technical'],
    department: 'Technical Ops',
    status: 'archived',
    account_status: 'inactive',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2023-11-15',
    created_at: '2023-11-15T08:00:00.000Z',
    updated_at: '2026-03-01T11:00:00.000Z',
    deleted_at: '2026-03-01T11:00:00.000Z',
    deleted_by: 'Nguyễn Trung Kiên (Admin)',
    archived_at: '2026-03-01T11:00:00.000Z',
    archived_by: 'Nguyễn Trung Kiên (Admin)',
    deletion_reason: 'Tái cơ cấu bộ phận kỹ thuật studio cũ',
    version: 2,
    workload: { host: 0, support: 0, technical: 0, total: 0 },
    initials: 'DT',
    avatar_bg: 'bg-zinc-100 text-zinc-600',
  },
]

// 4 Account Requests (Pending queue - separate from current staff total)
export const ACCOUNT_REQUESTS: AccountRequestRecord[] = [
  {
    id: 'req-001',
    version: 1,
    full_name: 'Lê Thị Diễm Quỳnh',
    email: 'diemquynh.le@gmail.com',
    phone: '+84 90 999 1122',
    department: 'Live Commerce',
    requested_role: 'host',
    status: 'pending',
    provisioning_status: 'not_started',
    submitted_at: '2026-09-25T08:30:00.000Z',
    initials: 'DQ',
    avatar_bg: 'bg-rose-100 text-rose-700',
  },
  {
    id: 'req-002',
    version: 1,
    full_name: 'Phan Minh Khang',
    email: 'khang.phan@gmail.com',
    phone: '+84 91 888 2233',
    department: 'Technical Ops',
    requested_role: 'technical',
    status: 'pending',
    provisioning_status: 'not_started',
    submitted_at: '2026-09-25T09:15:00.000Z',
    initials: 'MK',
    avatar_bg: 'bg-fuchsia-100 text-fuchsia-700',
  },
  {
    id: 'req-003',
    version: 1,
    full_name: 'Trần Bảo Vy',
    email: 'baovy.tran@gmail.com',
    phone: '+84 93 777 3344',
    department: 'Creator Ops',
    requested_role: 'support',
    status: 'pending',
    provisioning_status: 'in_progress',
    submitted_at: '2026-09-24T14:00:00.000Z',
    initials: 'BV',
    avatar_bg: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'req-004',
    version: 2,
    full_name: 'Hoàng Quốc Đạt',
    email: 'dat.hoang@gmail.com',
    phone: '+84 96 666 4455',
    department: 'Technical Ops',
    requested_role: 'technical',
    status: 'pending',
    provisioning_status: 'failed',
    provisioning_error_code: 'ERR_AUTH_SYNC_TIMEOUT',
    submitted_at: '2026-09-24T16:20:00.000Z',
    reviewed_at: '2026-09-24T16:25:00.000Z',
    reviewed_by: 'Nguyễn Trung Kiên (Admin)',
    initials: 'QD',
    avatar_bg: 'bg-red-100 text-red-700',
  },
]

// System Permission Matrix
export const SYSTEM_PERMISSIONS_MATRIX = [
  {
    module: 'Quản lý tài khoản (staff.manage)',
    description: 'Tạo, sửa, khóa, lưu trữ tài khoản nhân sự',
    admin: true,
    leader: false,
    member: false,
  },
  {
    module: 'Duyệt yêu cầu tài khoản mới',
    description: 'Chấp thuận, từ chối và kích hoạt cấp phát Supabase Auth',
    admin: true,
    leader: false,
    member: false,
  },
  {
    module: 'Phân quyền hệ thống (System Permission)',
    description: 'Chỉ định quyền Admin, Leader hoặc Member',
    admin: true,
    leader: false,
    member: false,
  },
  {
    module: 'Phân công ca trực (shift.assign)',
    description: 'Gán Host, Support, Technical vào ca livestream',
    admin: true,
    leader: true,
    member: false,
  },
  {
    module: 'Xem danh sách nhân sự toàn hệ thống',
    description: 'Xem toàn bộ danh sách, thông tin liên hệ và lịch ca',
    admin: true,
    leader: true,
    member: false, // Member chỉ xem hồ sơ của chính mình
  },
  {
    module: 'Lưu trữ & Khôi phục hồ sơ nhân sự',
    description: 'Lưu trữ (Soft-delete) và phục hồi nhân sự vào bảng lương/ca',
    admin: true,
    leader: false,
    member: false,
  },
]
// =============================================================================
// UI HELPERS & BADGE RENDERERS
// =============================================================================

function renderSystemPermissionBadge(perm: 'admin' | 'leader' | 'member') {
  switch (perm) {
    case 'admin':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200"><ShieldCheck className="h-3 w-3" />Admin</span>
    case 'leader':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200"><Shield className="h-3 w-3" />Leader</span>
    case 'member':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">Member</span>
  }
}

function renderOperationalRolesPills(roles?: ('host' | 'support' | 'technical')[]) {
  if (!roles || roles.length === 0) return <span className="text-slate-400 text-[11px]">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map(r => {
        let cls = 'bg-slate-100 text-slate-700 border-slate-200'
        let label: string = r
        if (r === 'host') {
          cls = 'bg-rose-50 text-rose-700 border-rose-200'
          label = 'Host'
        } else if (r === 'support') {
          cls = 'bg-blue-50 text-blue-700 border-blue-200'
          label = 'Support'
        } else if (r === 'technical') {
          cls = 'bg-amber-50 text-amber-700 border-amber-200'
          label = 'Technical'
        }
        return (
          <span key={r} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
            {label}
          </span>
        )
      })}
    </div>
  )
}

function renderStaffStatusBadge(status: 'active' | 'temporary_leave' | 'left' | 'archived') {
  switch (status) {
    case 'active':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Đang làm việc</span>
    case 'temporary_leave':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="h-3 w-3" />Tạm nghỉ</span>
    case 'left':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-300"><UserMinus className="h-3 w-3" />Đã rời</span>
    case 'archived':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-300"><Archive className="h-3 w-3" />Đã lưu trữ</span>
  }
}

function renderAccountStatusBadge(status: 'active' | 'pending_approval' | 'pending_email_verification' | 'inactive' | 'rejected') {
  switch (status) {
    case 'active':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Đã kích hoạt</span>
    case 'pending_approval':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300"><Clock className="h-3 w-3" />Chờ duyệt</span>
    case 'pending_email_verification':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">Chờ xác thực email</span>
    case 'inactive':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Tạm khóa</span>
    case 'rejected':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 border border-red-300">Đã từ chối</span>
  }
}

function renderProvisioningStatusBadge(status: 'not_started' | 'in_progress' | 'invited' | 'linked' | 'failed') {
  switch (status) {
    case 'not_started':
      return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">Chưa bắt đầu</span>
    case 'in_progress':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><RefreshCw className="h-3 w-3 animate-spin text-blue-600" />Đang cấp phát</span>
    case 'invited':
    case 'linked':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3" />Hoàn tất</span>
    case 'failed':
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-300"><XCircle className="h-3 w-3" />Thất bại</span>
  }
}
// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PeopleReferenceMock() {
  const searchParams = useSearchParams()
  const initialQaParam = (searchParams.get('state') || searchParams.get('qaState') || '01-people-main') as PeopleQaStateId

  const [qaState, setQaState] = useState<PeopleQaStateId>(initialQaParam)
  const [activeTab, setActiveTab] = useState<PeopleWorkspaceTab>('staff')
  const [selectedPersonId, setSelectedPersonId] = useState<string>('usr-mai')
  const [selectedRequestId, setSelectedRequestId] = useState<string>('req-001')

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPermission, setFilterPermission] = useState('all')
  const [filterRole, setFilterRole] = useState('all')
  const [filterStaffStatus, setFilterStaffStatus] = useState('all')
  const [filterAccountStatus, setFilterAccountStatus] = useState('all')
  const [filterDepartment, setFilterDepartment] = useState('all')

  // Modal & Overlay state
  const [isDetailOpen, setIsDetailOpen] = useState(true)
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [isProvisioningModalOpen, setIsProvisioningModalOpen] = useState(false)
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false)
  const [isConcurrencyModalOpen, setIsConcurrencyModalOpen] = useState(false)
  const [isSelfProtectionWarningOpen, setIsSelfProtectionWarningOpen] = useState(false)
  const [isPermissionMatrixOpen, setIsPermissionMatrixOpen] = useState(false)
  const [isWorkloadModalOpen, setIsWorkloadModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; title: string; text: string } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isQaControllerOpen, setIsQaControllerOpen] = useState(false)

  // Synchronize state with qaState
  useEffect(() => {
    // Reset defaults first
    setIsApproveModalOpen(false)
    setIsRejectModalOpen(false)
    setIsProvisioningModalOpen(false)
    setIsArchiveModalOpen(false)
    setIsRestoreModalOpen(false)
    setIsConcurrencyModalOpen(false)
    setIsSelfProtectionWarningOpen(false)
    setIsPermissionMatrixOpen(false)
    setIsWorkloadModalOpen(false)
    setToastMessage(null)
    setSearchTerm('')
    setFilterPermission('all')
    setFilterRole('all')
    setFilterStaffStatus('all')
    setFilterAccountStatus('all')
    setFilterDepartment('all')

    switch (qaState) {
      case '01-people-main':
        setActiveTab('staff')
        setSelectedPersonId('usr-mai')
        setIsDetailOpen(true)
        break
      case '02-active-filters':
        setActiveTab('staff')
        setFilterPermission('member')
        setFilterRole('host')
        setFilterStaffStatus('active')
        setSelectedPersonId('usr-mai')
        setIsDetailOpen(false)
        break
      case '03-person-detail':
        setActiveTab('staff')
        setSelectedPersonId('usr-mai')
        setIsDetailOpen(true)
        break
      case '04-system-permission':
        setActiveTab('staff')
        setIsPermissionMatrixOpen(true)
        break
      case '05-operational-roles':
        setActiveTab('staff')
        setFilterRole('technical')
        setSelectedPersonId('usr-quan')
        setIsDetailOpen(true)
        break
      case '06-staff-status':
        setActiveTab('staff')
        setIsDetailOpen(false)
        break
      case '07-account-status':
        setActiveTab('staff')
        setIsDetailOpen(false)
        break
      case '08-pending-account-request':
        setActiveTab('requests')
        setIsDetailOpen(false)
        break
      case '09-approve-account':
        setActiveTab('requests')
        setSelectedRequestId('req-001')
        setIsApproveModalOpen(true)
        break
      case '10-reject-account':
        setActiveTab('requests')
        setSelectedRequestId('req-002')
        setRejectionReason('Ứng viên chưa đủ thời lượng kinh nghiệm livestream bán hàng tối thiểu (yêu cầu tối thiểu 6 tháng tại các sàn thương mại).')
        setIsRejectModalOpen(true)
        break
      case '11-provisioning':
        setActiveTab('requests')
        setSelectedRequestId('req-003')
        setIsProvisioningModalOpen(true)
        break
      case '12-provisioning-failed':
        setActiveTab('requests')
        setSelectedRequestId('req-004')
        break
      case '13-archive-impact':
        setActiveTab('staff')
        setSelectedPersonId('usr-quan')
        setIsArchiveModalOpen(true)
        break
      case '14-archived-person':
        setActiveTab('archived')
        setSelectedPersonId('usr-arc-1')
        setIsDetailOpen(true)
        break
      case '15-restore':
        setActiveTab('archived')
        setSelectedPersonId('usr-arc-1')
        setIsRestoreModalOpen(true)
        break
      case '16-temporary-leave':
        setActiveTab('staff')
        setFilterStaffStatus('temporary_leave')
        setSelectedPersonId('usr-ngoc')
        setIsDetailOpen(true)
        break
      case '17-left-staff':
        setActiveTab('staff')
        setFilterStaffStatus('left')
        setSelectedPersonId('usr-huy')
        setIsDetailOpen(true)
        break
      case '18-workload':
        setActiveTab('staff')
        setIsWorkloadModalOpen(true)
        break
      case '19-concurrency':
        setActiveTab('staff')
        setSelectedPersonId('usr-mai')
        setIsConcurrencyModalOpen(true)
        break
      case '20-self-protection':
        setActiveTab('staff')
        setSelectedPersonId('usr-admin-kien')
        setIsSelfProtectionWarningOpen(true)
        setIsDetailOpen(true)
        break
      case '21-permission-read-only':
        setActiveTab('staff')
        setSelectedPersonId('usr-mai')
        setIsDetailOpen(true)
        break
      case '22-empty':
        setActiveTab('staff')
        setIsDetailOpen(false)
        break
      case '23-no-results':
        setActiveTab('staff')
        setSearchTerm('xyz_search_not_found_999')
        setIsDetailOpen(false)
        break
      case '24-success':
        setActiveTab('staff')
        setToastMessage({
          type: 'success',
          title: 'Thao tác thành công',
          text: 'Đã cập nhật vai trò vận hành và trạng thái phân công nhân sự thành công.',
        })
        break
      case '25-error':
        setActiveTab('requests')
        setSelectedRequestId('req-004')
        setToastMessage({
          type: 'error',
          title: 'Lỗi cấp phát tài khoản',
          text: 'Không thể đồng bộ Supabase Auth (Mã lỗi: ERR_AUTH_SYNC_TIMEOUT). Vui lòng thử lại.',
        })
        break
    }
  }, [qaState])

  // Current selected person
  const selectedPerson = useMemo(() => {
    if (activeTab === 'archived') {
      return ARCHIVED_RECORDS.find(u => u.id === selectedPersonId) || ARCHIVED_RECORDS[0]
    }
    return STAFF_RECORDS.find(u => u.id === selectedPersonId) || STAFF_RECORDS[0]
  }, [activeTab, selectedPersonId])

  const selectedRequest = useMemo(() => {
    return ACCOUNT_REQUESTS.find(r => r.id === selectedRequestId) || ACCOUNT_REQUESTS[0]
  }, [selectedRequestId])

  // Filtered staff records
  const filteredStaff = useMemo(() => {
    if (qaState === '22-empty') return []
    return STAFF_RECORDS.filter(p => {
      if (searchTerm) {
        const query = searchTerm.toLowerCase()
        const matchName = p.full_name.toLowerCase().includes(query)
        const matchEmail = p.email.toLowerCase().includes(query)
        const matchDept = p.department?.toLowerCase().includes(query)
        if (!matchName && !matchEmail && !matchDept) return false
      }
      if (filterPermission !== 'all' && p.system_permission !== filterPermission) return false
      if (filterRole !== 'all' && !p.operational_roles.includes(filterRole as any)) return false
      if (filterStaffStatus !== 'all' && p.status !== filterStaffStatus) return false
      if (filterAccountStatus !== 'all' && p.account_status !== filterAccountStatus) return false
      if (filterDepartment !== 'all' && p.department !== filterDepartment) return false
      return true
    })
  }, [filterAccountStatus, filterDepartment, filterPermission, filterRole, filterStaffStatus, qaState, searchTerm])

  const isReadOnlyMode = qaState === '21-permission-read-only'
  return (
    <PeopleOpsReferenceShell active="Staff" searchPlaceholder="Tìm kiếm nhân sự theo tên, email, vai trò, phòng ban...">
      <div className="p-6 space-y-5" data-testid="people-reference-mock" data-qa-state={qaState}>
        {/* Read-Only Notice for Member Role */}
        {isReadOnlyMode && (
          <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-xs">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0" />
              <div>
                <p className="text-[13px] font-bold">Chế độ xem chỉ đọc (Read-Only Mode) — Quyền Member</p>
                <p className="text-[12px] text-amber-700">Tài khoản của bạn không có quyền <code>staff.manage</code>. Chỉ xem thông tin cá nhân và ca trực, không thể sửa đổi hoặc phê duyệt tài khoản.</p>
              </div>
            </div>
            <span className="rounded bg-amber-200/80 px-2.5 py-1 text-[11px] font-semibold text-amber-900">Quyền bị giới hạn</span>
          </div>
        )}

        {/* Toast Feedback Banner */}
        {toastMessage && (
          <div className={`flex items-center justify-between rounded-lg border px-4 py-3 shadow-md ${
            toastMessage.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}>
            <div className="flex items-center gap-3">
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              )}
              <div>
                <p className="text-[13px] font-bold">{toastMessage.title}</p>
                <p className="text-[12px] opacity-90">{toastMessage.text}</p>
              </div>
            </div>
            <button type="button" onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Top Header & Header Metric Cards (Mathematically Reconciled) */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900">Quản lý nhân sự & tài khoản</h1>
            <p className="text-[13px] text-slate-500">Quản lý hồ sơ vận hành, phân quyền hệ thống, vai trò livestream và kiểm toán tài khoản.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPermissionMatrixOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <ShieldCheck className="h-4 w-4 text-purple-600" />
              Ma trận phân quyền
            </button>
            <button
              type="button"
              onClick={() => setIsWorkloadModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Tải ca vận hành
            </button>
            {!isReadOnlyMode && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('requests')
                  setSelectedRequestId('req-001')
                  setIsApproveModalOpen(true)
                }}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 shadow-xs"
              >
                <UserPlus className="h-4 w-4" />
                Thêm nhân sự mới
              </button>
            )}
          </div>
        </div>

        {/* 4 Header Metric Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">Tổng nhân sự đang làm</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Users className="h-4 w-4" /></span>
            </div>
            <div className="mt-2 text-[26px] font-bold text-slate-900">47</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
              <span className="font-semibold text-emerald-600">42 Đang làm việc</span> · <span>3 Tạm nghỉ</span> · <span>2 Đã rời</span>
            </div>
          </div>

          <div className={`rounded-xl border p-4 shadow-xs transition-all cursor-pointer ${
            activeTab === 'requests' ? 'border-amber-400 bg-amber-50/50' : 'border-slate-200 bg-white hover:border-amber-300'
          }`} onClick={() => setActiveTab('requests')}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">Yêu cầu tài khoản chờ duyệt</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Clock className="h-4 w-4" /></span>
            </div>
            <div className="mt-2 text-[26px] font-bold text-amber-700">4</div>
            <div className="mt-1 text-[11px] text-slate-500">
              <span className="font-semibold text-amber-600">3 Chờ duyệt</span> · <span className="font-semibold text-red-500">1 Lỗi cấp phát</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">Nhân sự tạm nghỉ / Vắng mặt</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Calendar className="h-4 w-4" /></span>
            </div>
            <div className="mt-2 text-[26px] font-bold text-slate-900">3</div>
            <div className="mt-1 text-[11px] text-slate-500">Tạm giữ quyền đăng nhập, miễn tự động phân ca</div>
          </div>

          <div className={`rounded-xl border p-4 shadow-xs transition-all cursor-pointer ${
            activeTab === 'archived' ? 'border-zinc-400 bg-zinc-50' : 'border-slate-200 bg-white hover:border-zinc-300'
          }`} onClick={() => setActiveTab('archived')}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">Hồ sơ đã lưu trữ (Archived)</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"><Archive className="h-4 w-4" /></span>
            </div>
            <div className="mt-2 text-[26px] font-bold text-slate-900">5</div>
            <div className="mt-1 text-[11px] text-slate-500">Lưu trữ lịch sử phân ca & kiểm toán hợp đồng</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              activeTab === 'staff'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="h-4 w-4" />
            Danh sách nhân sự ({STAFF_RECORDS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              activeTab === 'requests'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Yêu cầu tài khoản ({ACCOUNT_REQUESTS.length})
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">4</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              activeTab === 'archived'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Archive className="h-4 w-4" />
            Hồ sơ đã lưu trữ ({ARCHIVED_RECORDS.length})
          </button>
        </div>
        {/* TAB 1: DANH SÁCH NHÂN SỰ */}
        {activeTab === 'staff' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
              <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-[12px] bg-slate-50/50">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Lọc theo tên, email hoặc phòng ban..."
                  className="w-full bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')}><X className="h-3 w-3 text-slate-400" /></button>
                )}
              </div>

              {/* System Permission Filter */}
              <div className="flex items-center gap-1.5">
                <select
                  value={filterPermission}
                  onChange={e => setFilterPermission(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 outline-none hover:border-slate-300"
                >
                  <option value="all">Quyền hệ thống: Tất cả</option>
                  <option value="admin">Admin (Quản trị)</option>
                  <option value="leader">Leader (Trưởng nhóm)</option>
                  <option value="member">Member (Thành viên)</option>
                </select>
              </div>

              {/* Operational Role Filter */}
              <div className="flex items-center gap-1.5">
                <select
                  value={filterRole}
                  onChange={e => setFilterRole(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 outline-none hover:border-slate-300"
                >
                  <option value="all">Vai trò vận hành: Tất cả</option>
                  <option value="host">Host livestream</option>
                  <option value="support">Support (Trợ lý)</option>
                  <option value="technical">Technical (Kỹ thuật)</option>
                </select>
              </div>

              {/* Staff Status Filter */}
              <div className="flex items-center gap-1.5">
                <select
                  value={filterStaffStatus}
                  onChange={e => setFilterStaffStatus(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 outline-none hover:border-slate-300"
                >
                  <option value="all">Trạng thái việc làm: Tất cả</option>
                  <option value="active">Đang làm việc</option>
                  <option value="temporary_leave">Tạm nghỉ</option>
                  <option value="left">Đã rời</option>
                </select>
              </div>

              {/* Account Status Filter */}
              <div className="flex items-center gap-1.5">
                <select
                  value={filterAccountStatus}
                  onChange={e => setFilterAccountStatus(e.target.value)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 outline-none hover:border-slate-300"
                >
                  <option value="all">Trạng thái tài khoản: Tất cả</option>
                  <option value="active">Đã kích hoạt</option>
                  <option value="pending_approval">Chờ duyệt</option>
                  <option value="pending_email_verification">Chờ xác thực email</option>
                  <option value="inactive">Tạm khóa</option>
                </select>
              </div>

              {/* Reset button */}
              {(filterPermission !== 'all' || filterRole !== 'all' || filterStaffStatus !== 'all' || filterAccountStatus !== 'all' || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterPermission('all')
                    setFilterRole('all')
                    setFilterStaffStatus('all')
                    setFilterAccountStatus('all')
                    setSearchTerm('')
                  }}
                  className="h-8 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {/* Active Filter Chips Bar */}
            {(filterPermission !== 'all' || filterRole !== 'all' || filterStaffStatus !== 'all' || filterAccountStatus !== 'all') && (
              <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">Bộ lọc đang áp dụng:</span>
                {filterPermission !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 font-medium text-purple-700 border border-purple-200">
                    Quyền: {filterPermission.toUpperCase()}
                    <button type="button" onClick={() => setFilterPermission('all')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterRole !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700 border border-blue-200">
                    Vai trò: {filterRole.toUpperCase()}
                    <button type="button" onClick={() => setFilterRole('all')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterStaffStatus !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 border border-emerald-200">
                    Việc làm: {filterStaffStatus === 'active' ? 'Đang làm việc' : filterStaffStatus === 'temporary_leave' ? 'Tạm nghỉ' : 'Đã rời'}
                    <button type="button" onClick={() => setFilterStaffStatus('all')}><X className="h-3 w-3" /></button>
                  </span>
                )}
                {filterAccountStatus !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 border border-slate-200">
                    Tài khoản: {filterAccountStatus}
                    <button type="button" onClick={() => setFilterAccountStatus('all')}><X className="h-3 w-3" /></button>
                  </span>
                )}
              </div>
            )}

            {/* Layout grid with table and detail panel */}
            <div className={`grid gap-4 items-start ${isDetailOpen ? 'grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
              {/* Main Staff Table */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                {filteredStaff.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                      <Users className="h-6 w-6" />
                    </div>
                    {qaState === '22-empty' ? (
                      <>
                        <h3 className="text-[15px] font-bold text-slate-800">Chưa có nhân sự nào trong hệ thống</h3>
                        <p className="mt-1 max-w-sm text-[12px] text-slate-500">Hệ thống chưa ghi nhận tài khoản nhân sự. Bạn có thể thêm nhân sự thủ công hoặc duyệt các yêu cầu tài khoản đang chờ.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('requests')
                            setIsApproveModalOpen(true)
                          }}
                          className="mt-4 flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
                        >
                          <UserPlus className="h-4 w-4" />
                          Thêm nhân sự đầu tiên
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="text-[15px] font-bold text-slate-800">Không tìm thấy kết quả phù hợp</h3>
                        <p className="mt-1 text-[12px] text-slate-500">Không có nhân sự nào thỏa mãn từ khóa hoặc bộ lọc đang chọn.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('')
                            setFilterPermission('all')
                            setFilterRole('all')
                            setFilterStaffStatus('all')
                            setFilterAccountStatus('all')
                          }}
                          className="mt-3 text-[12px] font-semibold text-blue-600 hover:underline"
                        >
                          Xóa bộ lọc tìm kiếm
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[38px_1.5fr_1fr_1.1fr_1fr_1.1fr_1fr_1fr_64px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <span />
                      <span>Nhân sự</span>
                      <span>Quyền hệ thống</span>
                      <span>Vai trò vận hành</span>
                      <span>Phòng ban</span>
                      <span>Trạng thái việc làm</span>
                      <span>Tài khoản</span>
                      <span>Tải ca</span>
                      <span className="text-right">Thao tác</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {filteredStaff.map(person => {
                        const isSelected = selectedPersonId === person.id
                        const isSelf = person.id === CURRENT_USER.id
                        return (
                          <div
                            key={person.id}
                            onClick={() => {
                              setSelectedPersonId(person.id)
                              setIsDetailOpen(true)
                            }}
                            className={`grid grid-cols-[38px_1.5fr_1fr_1.1fr_1fr_1.1fr_1fr_1fr_64px] items-center gap-3 px-4 py-2.5 text-left text-[12px] transition-colors cursor-pointer ${
                              isSelected ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : 'hover:bg-slate-50/80 bg-white'
                            }`}
                          >
                            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${person.avatar_bg || 'bg-slate-100 text-slate-700'}`}>
                              {person.initials || 'U'}
                            </span>
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold text-slate-900">{person.full_name}</span>
                                {isSelf && (
                                  <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-700 shrink-0">Bạn</span>
                                )}
                              </div>
                              <span className="block truncate text-[11px] text-slate-400">{person.email}</span>
                            </div>
                            <div>{renderSystemPermissionBadge(person.system_permission)}</div>
                            <div>{renderOperationalRolesPills(person.operational_roles)}</div>
                            <div className="truncate text-slate-600 text-[11px]">{person.department || '—'}</div>
                            <div>{renderStaffStatusBadge(person.status)}</div>
                            <div>{renderAccountStatusBadge(person.account_status)}</div>
                            <div className="text-[11px] font-medium text-slate-700">
                              {person.workload.total > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="font-bold text-blue-700">{person.workload.total} ca</span>
                                  <span className="text-[10px] text-slate-400">({person.workload.host}H·{person.workload.support}S·{person.workload.technical}T)</span>
                                </span>
                              ) : (
                                <span className="text-slate-400">0 ca</span>
                              )}
                            </div>
                            <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                aria-label="Xem chi tiết"
                                onClick={() => {
                                  setSelectedPersonId(person.id)
                                  setIsDetailOpen(true)
                                }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {!isReadOnlyMode && (
                                <button
                                  type="button"
                                  aria-label="Thao tác"
                                  onClick={() => {
                                    setSelectedPersonId(person.id)
                                    if (isSelf) {
                                      setIsSelfProtectionWarningOpen(true)
                                    } else {
                                      setIsArchiveModalOpen(true)
                                    }
                                  }}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500 bg-slate-50/50">
                      <span>Hiển thị 1–{filteredStaff.length} của {STAFF_RECORDS.length} nhân sự</span>
                      <div className="flex items-center gap-1">
                        <span className="rounded border border-slate-200 px-2 py-1 bg-white">‹</span>
                        <span className="rounded bg-blue-600 px-2.5 py-1 text-white font-bold">1</span>
                        <span className="rounded border border-slate-200 px-2 py-1 bg-white">2</span>
                        <span className="rounded border border-slate-200 px-2 py-1 bg-white">›</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Right Detail Panel Drawer */}
              {isDetailOpen && selectedPerson && (
                <aside className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                  <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/50 p-4">
                    <div className="flex gap-3">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-full text-[14px] font-bold ${selectedPerson.avatar_bg || 'bg-slate-100 text-slate-700'}`}>
                        {selectedPerson.initials || 'U'}
                      </span>
                      <div>
                        <h2 className="text-[14px] font-bold text-slate-900">{selectedPerson.full_name}</h2>
                        <p className="text-[11px] text-slate-400 truncate max-w-[190px]">{selectedPerson.email}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {renderSystemPermissionBadge(selectedPerson.system_permission)}
                          {renderStaffStatusBadge(selectedPerson.status)}
                        </div>
                      </div>
                    </div>
                    <button type="button" aria-label="Đóng bảng thông tin" onClick={() => setIsDetailOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-4 max-h-[680px] overflow-y-auto text-[11px]">
                    {/* SECTION 1: IDENTITY */}
                    <div>
                      <h3 className="mb-2 text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-blue-600" />
                        1. Thông tin định danh (Identity)
                      </h3>
                      <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Họ và tên:</span><span className="font-semibold text-slate-800">{selectedPerson.full_name}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Email liên hệ:</span><span className="font-mono text-slate-700 truncate">{selectedPerson.email}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Số điện thoại:</span><span className="text-slate-700">{selectedPerson.phone || '—'}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Phòng ban:</span><span className="text-slate-700">{selectedPerson.department || '—'}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Auth UUID:</span><span className="font-mono text-[10px] text-slate-500 truncate">{selectedPerson.auth_user_id || 'Chưa liên kết'}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Xác thực email:</span><span>{selectedPerson.email_verified ? <span className="text-emerald-700 font-semibold">✓ Đã xác thực</span> : <span className="text-amber-700">Chưa xác thực</span>}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Nhà cung cấp:</span><span className="capitalize text-slate-700">{selectedPerson.auth_provider}</span></div>
                        <div className="grid grid-cols-[90px_1fr]"><span className="text-slate-400">Avatar Path:</span><span className="font-mono text-[10px] text-slate-400 truncate">{selectedPerson.avatar_storage_path || 'storage/avatars/default.png'}</span></div>
                      </div>
                    </div>

                    {/* SECTION 2: ACCESS & SYSTEM PERMISSION */}
                    <div>
                      <h3 className="mb-2 text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-purple-600" />
                        2. Quyền hệ thống & Truy cập (Access)
                      </h3>
                      <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                        <div className="grid grid-cols-[100px_1fr] items-center"><span className="text-slate-400">Quyền hệ thống:</span><div>{renderSystemPermissionBadge(selectedPerson.system_permission)}</div></div>
                        <div className="grid grid-cols-[100px_1fr] items-center"><span className="text-slate-400">User Role (DB):</span><code className="text-slate-700 text-[10px]">{selectedPerson.role}</code></div>
                        <div className="grid grid-cols-[100px_1fr] items-center"><span className="text-slate-400">Trạng thái tài khoản:</span><div>{renderAccountStatusBadge(selectedPerson.account_status)}</div></div>
                        <div className="grid grid-cols-[100px_1fr]"><span className="text-slate-400">Quyền quản trị:</span><span className="text-slate-700">{selectedPerson.system_permission === 'admin' ? 'Toàn quyền (staff.manage, shift.assign)' : selectedPerson.system_permission === 'leader' ? 'Quản lý ca (shift.assign)' : 'Chỉ xem ca cá nhân'}</span></div>
                      </div>
                    </div>

                    {/* SECTION 3: OPERATIONS & WORKLOAD */}
                    <div>
                      <h3 className="mb-2 text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                        3. Vận hành & Phân ca (Operations)
                      </h3>
                      <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                        <div className="grid grid-cols-[100px_1fr] items-center"><span className="text-slate-400">Vai trò vận hành:</span><div>{renderOperationalRolesPills(selectedPerson.operational_roles)}</div></div>
                        <div className="grid grid-cols-[100px_1fr]"><span className="text-slate-400">Trạng thái việc làm:</span><div>{renderStaffStatusBadge(selectedPerson.status)}</div></div>
                        {selectedPerson.status_note && (
                          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
                            <strong>Ghi chú trạng thái:</strong> {selectedPerson.status_note}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          <div className="rounded bg-white p-1.5 text-center border border-slate-200">
                            <span className="block text-[14px] font-bold text-rose-700">{selectedPerson.workload.host}</span>
                            <span className="text-[9px] text-slate-400">Ca Host</span>
                          </div>
                          <div className="rounded bg-white p-1.5 text-center border border-slate-200">
                            <span className="block text-[14px] font-bold text-blue-700">{selectedPerson.workload.support}</span>
                            <span className="text-[9px] text-slate-400">Ca Support</span>
                          </div>
                          <div className="rounded bg-white p-1.5 text-center border border-slate-200">
                            <span className="block text-[14px] font-bold text-amber-700">{selectedPerson.workload.technical}</span>
                            <span className="text-[9px] text-slate-400">Ca Technical</span>
                          </div>
                        </div>

                        {/* Unbacked High-Fi attributes clearly marked */}
                        <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-slate-500">Chỉ số trực quan (High-Fi UI Only):</span>
                            <span className="rounded bg-purple-100 px-1 text-[8px] font-bold text-purple-700 border border-purple-200">NEW_ONLY_UNBACKED</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-600">
                            <span>Đánh giá hiệu suất:</span>
                            <span className="font-bold text-slate-800">{selectedPerson.unbacked_rating || '4.8/5'}</span>
                          </div>
                          {selectedPerson.unbacked_skills && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {selectedPerson.unbacked_skills.map(s => (
                                <span key={s} className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-700">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* SECTION 4: AUDIT HISTORY & VERSION */}
                    <div>
                      <h3 className="mb-2 text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-600" />
                        4. Lịch sử & Kiểm toán (History & Concurrency)
                      </h3>
                      <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-[10px] text-slate-600">
                        <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400">Ngày tham gia:</span><span>{selectedPerson.join_date}</span></div>
                        <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400">Thời điểm tạo:</span><span>{new Date(selectedPerson.created_at).toLocaleString('vi-VN')}</span></div>
                        <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400">Cập nhật cuối:</span><span>{new Date(selectedPerson.updated_at).toLocaleString('vi-VN')}</span></div>
                        <div className="grid grid-cols-[145px_1fr] items-center"><span className="text-slate-400">Phiên bản (CAS):</span><span className="rounded bg-slate-200 px-1.5 py-0.2 font-mono font-bold text-slate-800 w-fit">v{selectedPerson.version}</span></div>
                        {(selectedPerson.archived_at || selectedPerson.deleted_at) && (
                          <>
                            {selectedPerson.deleted_at && (
                              <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400 font-medium">Xóa mềm lúc (deleted_at):</span><span className="text-rose-700 font-semibold">{new Date(selectedPerson.deleted_at).toLocaleString('vi-VN')}</span></div>
                            )}
                            {selectedPerson.archived_at && (
                              <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400 font-medium">Lưu trữ lúc (archived_at):</span><span className="text-amber-700 font-semibold">{new Date(selectedPerson.archived_at).toLocaleString('vi-VN')}</span></div>
                            )}
                            {selectedPerson.archived_by && (
                              <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400">Người lưu trữ:</span><span>{selectedPerson.archived_by}</span></div>
                            )}
                            {selectedPerson.deletion_reason && (
                              <div className="grid grid-cols-[145px_1fr]"><span className="text-slate-400">Lý do:</span><span className="italic">{selectedPerson.deletion_reason}</span></div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions in drawer */}
                    {!isReadOnlyMode && (
                      <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                        {selectedPerson.id === CURRENT_USER.id ? (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center text-[10px] font-semibold text-blue-800">
                            Tự bảo vệ tài khoản quản trị (Self-Protection Guard Active)
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setIsConcurrencyModalOpen(true)}
                              className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Sửa hồ sơ
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsArchiveModalOpen(true)}
                              className="flex items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Lưu trữ
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}
        {/* TAB 2: YÊU CẦU TÀI KHOẢN (ACCOUNT REQUESTS) */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-amber-900 shadow-xs">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-700 shrink-0" />
                <div>
                  <h3 className="text-[13px] font-bold">Hàng đợi yêu cầu tài khoản nhân sự mới (Pending Account Requests)</h3>
                  <p className="text-[12px] text-amber-800">Các yêu cầu đăng ký tài khoản cần Quản trị viên (Admin) phê duyệt trước khi hệ thống cấp phát tài khoản Supabase Auth và phân quyền.</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-200 px-3 py-1 text-[11px] font-bold text-amber-900">4 Yêu cầu</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="grid grid-cols-[38px_1.5fr_1.1fr_1fr_1.2fr_1.1fr_1.2fr_130px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span />
                <span>Người đăng ký</span>
                <span>Phòng ban</span>
                <span>Vai trò đề xuất</span>
                <span>Thời điểm gửi</span>
                <span>Trạng thái duyệt</span>
                <span>Cấp phát Auth</span>
                <span className="text-right">Thao tác</span>
              </div>

              <div className="divide-y divide-slate-100">
                {ACCOUNT_REQUESTS.map(req => {
                  const isSelected = selectedRequestId === req.id
                  return (
                    <div
                      key={req.id}
                      onClick={() => setSelectedRequestId(req.id)}
                      className={`grid grid-cols-[38px_1.5fr_1.1fr_1fr_1.2fr_1.1fr_1.2fr_130px] items-center gap-3 px-4 py-3 text-left text-[12px] transition-colors cursor-pointer ${
                        isSelected ? 'bg-amber-50/70 border-l-4 border-l-amber-500' : 'hover:bg-slate-50 bg-white'
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${req.avatar_bg || 'bg-slate-100 text-slate-700'}`}>
                        {req.initials}
                      </span>
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-semibold text-slate-900">{req.full_name}</div>
                        <div className="truncate text-[11px] text-slate-400">{req.email} · {req.phone}</div>
                      </div>
                      <div className="text-[11px] text-slate-600">{req.department}</div>
                      <div>{renderOperationalRolesPills([req.requested_role])}</div>
                      <div className="text-[11px] text-slate-500">{new Date(req.submitted_at).toLocaleString('vi-VN')}</div>
                      <div>
                        {req.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <Clock className="h-3 w-3" />Chờ duyệt
                          </span>
                        ) : req.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />Đã duyệt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3" />Từ chối
                          </span>
                        )}
                      </div>
                      <div>
                        {renderProvisioningStatusBadge(req.provisioning_status)}
                        {req.provisioning_error_code && (
                          <span className="block font-mono text-[9px] text-red-600 font-semibold">{req.provisioning_error_code}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                        {req.provisioning_status === 'failed' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRequestId(req.id)
                              setIsProvisioningModalOpen(true)
                            }}
                            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 shadow-xs"
                          >
                            <RotateCcw className="h-3 w-3" />Thử lại
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRequestId(req.id)
                                setIsApproveModalOpen(true)
                              }}
                              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 shadow-xs"
                            >
                              Duyệt
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRequestId(req.id)
                                setRejectionReason('')
                                setIsRejectModalOpen(true)
                              }}
                              className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HỒ SƠ ĐÃ LƯU TRỮ (ARCHIVED RECORDS) */}
        {activeTab === 'archived' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-zinc-900 shadow-xs">
              <div className="flex items-center gap-3">
                <Archive className="h-5 w-5 text-zinc-700 shrink-0" />
                <div>
                  <h3 className="text-[13px] font-bold">Lưu trữ hồ sơ nhân sự (Soft-deleted Staff Records)</h3>
                  <p className="text-[12px] text-zinc-600">Hồ sơ đã lưu trữ bảo lưu lịch sử phân ca kiểm toán với mốc xóa mềm <strong>deleted_at</strong> và thời điểm lưu trữ <strong>archived_at</strong>. Tài khoản đăng nhập đã bị vô hiệu hóa.</p>
                </div>
              </div>
              <span className="rounded-full bg-zinc-200 px-3 py-1 text-[11px] font-bold text-zinc-800">5 Hồ sơ</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="grid grid-cols-[38px_1.5fr_1.1fr_1fr_1.2fr_1.2fr_1.5fr_100px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span />
                <span>Nhân sự</span>
                <span>Phòng ban</span>
                <span>Vai trò vận hành</span>
                <span>Thời điểm lưu trữ</span>
                <span>Người thực hiện</span>
                <span>Lý do lưu trữ</span>
                <span className="text-right">Thao tác</span>
              </div>

              <div className="divide-y divide-slate-100">
                {ARCHIVED_RECORDS.map(person => {
                  const isSelected = selectedPersonId === person.id
                  return (
                    <div
                      key={person.id}
                      onClick={() => {
                        setSelectedPersonId(person.id)
                        setIsDetailOpen(true)
                      }}
                      className={`grid grid-cols-[38px_1.5fr_1.1fr_1fr_1.2fr_1.2fr_1.5fr_100px] items-center gap-3 px-4 py-3 text-left text-[12px] transition-colors cursor-pointer ${
                        isSelected ? 'bg-zinc-100/70 border-l-4 border-l-zinc-600' : 'hover:bg-slate-50 bg-white'
                      }`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold shrink-0 ${person.avatar_bg || 'bg-zinc-200 text-zinc-700'}`}>
                        {person.initials}
                      </span>
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-semibold text-slate-900">{person.full_name}</div>
                        <div className="truncate text-[11px] text-slate-400">{person.email}</div>
                      </div>
                      <div className="text-[11px] text-slate-600">{person.department}</div>
                      <div>{renderOperationalRolesPills(person.operational_roles)}</div>
                      <div className="text-[11px] space-y-0.5">
                        <div className="font-mono text-[10px] text-rose-700"><span className="text-slate-400 font-sans">Xóa mềm (deleted_at):</span> {person.deleted_at ? new Date(person.deleted_at).toLocaleDateString('vi-VN') : '—'}</div>
                        <div className="font-mono text-[10px] text-amber-700"><span className="text-slate-400 font-sans">Lưu trữ (archived_at):</span> {person.archived_at ? new Date(person.archived_at).toLocaleDateString('vi-VN') : '—'}</div>
                      </div>
                      <div className="text-[11px] text-slate-700 font-medium">{person.archived_by || 'Admin'}</div>
                      <div className="text-[11px] text-slate-600 italic truncate">{person.deletion_reason || 'Lưu trữ theo quy định'}</div>
                      <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPersonId(person.id)
                            setIsRestoreModalOpen(true)
                          }}
                          className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 shadow-xs"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Khôi phục
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {/* =====================================================================
            MODALS & OVERLAYS
        ===================================================================== */}

        {/* 1. APPROVE ACCOUNT REQUEST MODAL */}
        {isApproveModalOpen && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-[15px] font-bold text-slate-900">Phê duyệt yêu cầu tài khoản</h3>
                </div>
                <button type="button" onClick={() => setIsApproveModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-2.5 text-[12px] bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="grid grid-cols-[110px_1fr]"><span className="text-slate-500">Người đăng ký:</span><span className="font-bold text-slate-800">{selectedRequest.full_name}</span></div>
                <div className="grid grid-cols-[110px_1fr]"><span className="text-slate-500">Email:</span><span className="font-mono text-slate-700">{selectedRequest.email}</span></div>
                <div className="grid grid-cols-[110px_1fr]"><span className="text-slate-500">Số điện thoại:</span><span className="text-slate-700">{selectedRequest.phone}</span></div>
                <div className="grid grid-cols-[110px_1fr]"><span className="text-slate-500">Phòng ban:</span><span className="text-slate-700">{selectedRequest.department}</span></div>
                <div className="grid grid-cols-[110px_1fr] items-center"><span className="text-slate-500">Vai trò đề xuất:</span><div>{renderOperationalRolesPills([selectedRequest.requested_role])}</div></div>
                <div className="grid grid-cols-[110px_1fr]"><span className="text-slate-500">Quyền hệ thống:</span><span className="font-semibold text-purple-700">Member (Mặc định cho nhân sự vận hành)</span></div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Sau khi phê duyệt, hệ thống sẽ tự động kích hoạt tiến trình cấp phát tài khoản Supabase Auth và gửi email thiết lập mật khẩu đến người dùng.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsApproveModalOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Hủy</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsApproveModalOpen(false)
                    setToastMessage({
                      type: 'success',
                      title: 'Đã phê duyệt tài khoản',
                      text: `Yêu cầu của ${selectedRequest.full_name} đã được chấp thuận. Đang khởi tạo cấp phát tài khoản.`,
                    })
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-700 shadow-xs"
                >
                  Xác nhận phê duyệt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. REJECT ACCOUNT REQUEST MODAL */}
        {isRejectModalOpen && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <h3 className="text-[15px] font-bold text-slate-900">Từ chối yêu cầu tài khoản</h3>
                </div>
                <button type="button" onClick={() => setIsRejectModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-1.5 text-[12px] bg-red-50/60 p-3 rounded-lg border border-red-200 text-red-900">
                <div className="font-semibold">{selectedRequest.full_name} ({selectedRequest.email})</div>
                <div className="text-[11px] text-red-700">Yêu cầu vai trò: <strong className="uppercase">{selectedRequest.requested_role}</strong> · Phòng ban: {selectedRequest.department}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-slate-700">Lý do từ chối (Bắt buộc theo chuẩn kiểm toán): *</label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Nhập chi tiết lý do từ chối để gửi thông báo cho người đăng ký..."
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-[12px] outline-none focus:border-red-500 text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsRejectModalOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Hủy</button>
                <button
                  type="button"
                  disabled={!rejectionReason.trim()}
                  onClick={() => {
                    setIsRejectModalOpen(false)
                    setToastMessage({
                      type: 'success',
                      title: 'Đã từ chối yêu cầu',
                      text: `Đã ghi nhận lý do từ chối cho hồ sơ của ${selectedRequest.full_name}.`,
                    })
                  }}
                  className={`rounded-lg px-4 py-2 text-[12px] font-bold text-white shadow-xs ${
                    rejectionReason.trim() ? 'bg-red-600 hover:bg-red-700' : 'bg-red-300 cursor-not-allowed'
                  }`}
                >
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 3. PROVISIONING STATE / RETRY MODAL */}
        {isProvisioningModalOpen && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                  <h3 className="text-[15px] font-bold text-slate-900">Tiến trình cấp phát tài khoản (Provisioning)</h3>
                </div>
                <button type="button" onClick={() => setIsProvisioningModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[12px]">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-900">Bước 1: Tạo UUID Supabase Auth</span>
                    <p className="text-[10px] text-emerald-700 font-mono">auth_user_id: a9b0c1d2-0000-4444-8888-abcdef123456</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-blue-200 bg-blue-50 text-[12px]">
                  <RefreshCw className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
                  <div>
                    <span className="font-bold text-blue-900">Bước 2: Gửi email thiết lập mật khẩu & xác thực</span>
                    <p className="text-[10px] text-blue-700">Đang gửi thư mời đến: {selectedRequest.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[12px] opacity-60">
                  <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-700">Bước 3: Đồng bộ phân quyền Member & Vai trò vận hành</span>
                    <p className="text-[10px] text-slate-500">Chờ người dùng xác nhận lần đầu</p>
                  </div>
                </div>
              </div>

              {selectedRequest.provisioning_error_code && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    Mã lỗi: {selectedRequest.provisioning_error_code}
                  </div>
                  <p>Tiến trình đồng bộ tài khoản bị gián đoạn do phản hồi máy chủ xác thực quá thời gian. Bạn có thể nhấn Thử lại cấp phát.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsProvisioningModalOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Đóng</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsProvisioningModalOpen(false)
                    setToastMessage({
                      type: 'success',
                      title: 'Đang thử lại cấp phát',
                      text: `Hệ thống đang kích hoạt lại luồng cấp phát cho ${selectedRequest.full_name}.`,
                    })
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-700 shadow-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Thử lại cấp phát
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. ARCHIVE IMPACT WARNING MODAL */}
        {isArchiveModalOpen && selectedPerson && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-5 w-5 text-red-600" />
                  <h3 className="text-[15px] font-bold text-slate-900">Xác nhận lưu trữ hồ sơ nhân sự (Archive)</h3>
                </div>
                <button type="button" onClick={() => setIsArchiveModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 text-[12px] text-red-900 space-y-1">
                <p className="font-bold">Bạn đang chuẩn bị lưu trữ hồ sơ của: {selectedPerson.full_name}</p>
                <p className="text-[11px] text-red-700 font-mono">{selectedPerson.email} · Quyền: {selectedPerson.system_permission}</p>
              </div>

              <div className="space-y-2 text-[11px] text-slate-600">
                <p className="font-bold text-slate-800">Tác động khi thực hiện lưu trữ (Archive Impact):</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Tự động hủy phân công:</strong> Nhân sự sẽ bị gỡ khỏi toàn bộ các ca trực trong tương lai.</li>
                  <li><strong>Thu hồi quyền truy cập:</strong> Tài khoản đăng nhập Supabase Auth bị vô hiệu hóa ngay lập tức.</li>
                  <li><strong>Bảo lưu lịch sử ca trực:</strong> Toàn bộ dữ liệu ca quá khứ, báo cáo doanh thu và chấm công được lưu trữ nguyên vẹn để phục vụ kiểm toán.</li>
                  <li><strong>Lưu vết kiểm toán:</strong> Hệ thống ghi nhận <code>archived_at</code>, <code>archived_by</code> và <code>deletion_reason</code>.</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsArchiveModalOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Hủy</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsArchiveModalOpen(false)
                    setToastMessage({
                      type: 'success',
                      title: 'Đã lưu trữ hồ sơ nhân sự',
                      text: `Hồ sơ của ${selectedPerson.full_name} đã được chuyển vào mục Lưu trữ.`,
                    })
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-red-700 shadow-xs"
                >
                  Xác nhận lưu trữ hồ sơ
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 5. RESTORE CONFIRMATION MODAL */}
        {isRestoreModalOpen && selectedPerson && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-blue-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5 text-blue-600" />
                  <h3 className="text-[15px] font-bold text-slate-900">Khôi phục hồ sơ nhân sự (Restore)</h3>
                </div>
                <button type="button" onClick={() => setIsRestoreModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[12px] text-blue-900 space-y-1.5">
                <p className="font-bold">Khôi phục nhân sự: {selectedPerson.full_name}</p>
                <div className="space-y-1 pt-0.5 text-[11px] text-blue-800">
                  <p><span className="text-slate-500">Xóa mềm lúc (deleted_at):</span> <strong className="text-rose-700">{selectedPerson.deleted_at ? new Date(selectedPerson.deleted_at).toLocaleString('vi-VN') : '—'}</strong></p>
                  <p><span className="text-slate-500">Lưu trữ lúc (archived_at):</span> <strong className="text-amber-700">{selectedPerson.archived_at ? new Date(selectedPerson.archived_at).toLocaleString('vi-VN') : '—'}</strong></p>
                </div>
                <p className="text-[11px] text-blue-700 italic">Lý do cũ: {selectedPerson.deletion_reason}</p>
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                Sau khi khôi phục, hồ sơ sẽ chuyển lại trạng thái <strong>Đang làm việc (Active)</strong>, quyền đăng nhập hệ thống được mở lại và nhân sự có thể tiếp tục nhận phân công ca livestream.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsRestoreModalOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Hủy</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoreModalOpen(false)
                    setToastMessage({
                      type: 'success',
                      title: 'Đã khôi phục nhân sự',
                      text: `Hồ sơ của ${selectedPerson.full_name} đã hoạt động trở lại.`,
                    })
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-700 shadow-xs"
                >
                  Xác nhận khôi phục
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. CONCURRENCY COLLISION MODAL */}
        {isConcurrencyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="text-[15px] font-bold text-slate-900">Xung đột phiên bản dữ liệu (Concurrency)</h3>
                </div>
                <button type="button" onClick={() => setIsConcurrencyModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 space-y-2">
                <p className="font-bold">Bản ghi nhân sự đã bị thay đổi bởi Quản trị viên khác trong khi bạn đang thao tác.</p>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-amber-200">
                  <div>
                    <span className="text-amber-700 block">Phiên bản trên máy bạn:</span>
                    <span className="font-mono font-bold text-slate-800">v1 (Stale Version)</span>
                  </div>
                  <div>
                    <span className="text-amber-700 block">Phiên bản trên máy chủ:</span>
                    <span className="font-mono font-bold text-emerald-700">v2 (Current Server)</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Để tránh ghi đè dữ liệu và duy trì tính toàn vẹn (Optimistic Concurrency Control), vui lòng tải lại dữ liệu mới nhất từ máy chủ trước khi tiếp tục chỉnh sửa.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsConcurrencyModalOpen(false)} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">Đóng</button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConcurrencyModalOpen(false)
                    setToastMessage({
                      type: 'success',
                      title: 'Đã làm mới dữ liệu',
                      text: 'Dữ liệu nhân sự đã được đồng bộ với phiên bản mới nhất trên máy chủ (v2).',
                    })
                  }}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-amber-700 shadow-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Làm mới dữ liệu (Refresh)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 7. SELF-PROTECTION WARNING DIALOG */}
        {isSelfProtectionWarningOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-xl border border-blue-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  <h3 className="text-[15px] font-bold text-slate-900">Bảo vệ tài khoản quản trị (Self-Protection)</h3>
                </div>
                <button type="button" onClick={() => setIsSelfProtectionWarningOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[12px] text-blue-900 space-y-1.5">
                <p className="font-bold">Bạn đang xem tài khoản của chính mình: {CURRENT_USER.full_name}</p>
                <p className="text-[11px] text-blue-700">Email: {CURRENT_USER.email} · Quyền hệ thống: <span className="font-bold">ADMIN</span></p>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-600">
                <p className="font-semibold text-slate-800">Quy tắc tự bảo vệ được kích hoạt:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Không thể tự khóa tài khoản:</strong> Nút Tạm khóa bị vô hiệu hóa.</li>
                  <li><strong>Không thể tự lưu trữ/xóa:</strong> Nút Lưu trữ bị vô hiệu hóa.</li>
                  <li><strong>Không thể tự hạ quyền:</strong> Quyền hệ thống Admin và Email đăng nhập bị khóa cứng trong biểu mẫu chỉnh sửa.</li>
                </ul>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSelfProtectionWarningOpen(false)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-700 shadow-xs"
                >
                  Đã hiểu quy tắc
                </button>
              </div>
            </div>
          </div>
        )}
        {/* 8. SYSTEM PERMISSION MATRIX DIALOG */}
        {isPermissionMatrixOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-purple-600" />
                  <h3 className="text-[16px] font-bold text-slate-900">Ma trận phân quyền hệ thống (System Permissions Matrix)</h3>
                </div>
                <button type="button" onClick={() => setIsPermissionMatrixOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <p className="text-[12px] text-slate-500">
                Phân biệt rõ ràng giữa <strong>Quyền hệ thống (Admin, Leader, Member)</strong> và <strong>Vai trò vận hành (Host, Support, Technical)</strong>.
              </p>

              <div className="overflow-hidden rounded-lg border border-slate-200 text-[12px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-bold text-slate-600">
                      <th className="p-3">Tính năng / Quyền hạn</th>
                      <th className="p-3 text-center">Admin</th>
                      <th className="p-3 text-center">Leader</th>
                      <th className="p-3 text-center">Member</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SYSTEM_PERMISSIONS_MATRIX.map(row => (
                      <tr key={row.module} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 block">{row.module}</span>
                          <span className="text-[10px] text-slate-400">{row.description}</span>
                        </td>
                        <td className="p-3 text-center">
                          {row.admin ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">✓</span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {row.leader ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold">✓</span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {row.member ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold">✓</span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPermissionMatrixOpen(false)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-700 shadow-xs"
                >
                  Đóng ma trận
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 9. WORKLOAD DISTRIBUTION MODAL */}
        {isWorkloadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  <h3 className="text-[16px] font-bold text-slate-900">Phân bố khối lượng công việc (Workload Distribution)</h3>
                </div>
                <button type="button" onClick={() => setIsWorkloadModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 text-[12px] max-h-[420px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-left text-[11px] font-bold text-slate-600">
                    <tr>
                      <th className="p-3">Nhân sự</th>
                      <th className="p-3">Vai trò đảm nhiệm</th>
                      <th className="p-3 text-center">Ca Host</th>
                      <th className="p-3 text-center">Ca Support</th>
                      <th className="p-3 text-center">Ca Tech</th>
                      <th className="p-3 text-right">Tổng ca đã giao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {STAFF_RECORDS.slice(0, 10).map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 block">{s.full_name}</span>
                          <span className="text-[10px] text-slate-400">{s.email}</span>
                        </td>
                        <td className="p-3">{renderOperationalRolesPills(s.operational_roles)}</td>
                        <td className="p-3 text-center font-semibold text-rose-700">{s.workload.host}</td>
                        <td className="p-3 text-center font-semibold text-blue-700">{s.workload.support}</td>
                        <td className="p-3 text-center font-semibold text-amber-700">{s.workload.technical}</td>
                        <td className="p-3 text-right font-bold text-slate-900">{s.workload.total} ca</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsWorkloadModalOpen(false)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-700 shadow-xs"
                >
                  Đóng thống kê tải ca
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            QA STATE CONTROLLER (Docked at bottom, collapsible)
        ===================================================================== */}
        <div data-qa-controller className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-white shadow-2xl transition-all">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono font-bold tracking-wider text-emerald-400">
                QA CONTROLLER (WAVE 06 — PEOPLE CONVERGENCE)
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                STATE: {qaState}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsQaControllerOpen(!isQaControllerOpen)}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 font-mono"
            >
              {isQaControllerOpen ? 'Thu gọn ▲' : 'Mở rộng 25 trạng thái ▼'}
            </button>
          </div>

          {isQaControllerOpen && (
            <div className="p-3 max-h-[180px] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 text-[11px]">
                {[
                  { id: '01-people-main', label: '01 Main Roster' },
                  { id: '02-active-filters', label: '02 Active Filters' },
                  { id: '03-person-detail', label: '03 Person Detail' },
                  { id: '04-system-permission', label: '04 Perm Matrix' },
                  { id: '05-operational-roles', label: '05 Op Roles' },
                  { id: '06-staff-status', label: '06 Staff Status' },
                  { id: '07-account-status', label: '07 Account Status' },
                  { id: '08-pending-account-request', label: '08 Account Requests' },
                  { id: '09-approve-account', label: '09 Approve Modal' },
                  { id: '10-reject-account', label: '10 Reject Modal' },
                  { id: '11-provisioning', label: '11 Provisioning' },
                  { id: '12-provisioning-failed', label: '12 Provision Failed' },
                  { id: '13-archive-impact', label: '13 Archive Impact' },
                  { id: '14-archived-person', label: '14 Archived Records' },
                  { id: '15-restore', label: '15 Restore Modal' },
                  { id: '16-temporary-leave', label: '16 Temp Leave' },
                  { id: '17-left-staff', label: '17 Left Staff' },
                  { id: '18-workload', label: '18 Workload' },
                  { id: '19-concurrency', label: '19 Concurrency CAS' },
                  { id: '20-self-protection', label: '20 Self Protection' },
                  { id: '21-permission-read-only', label: '21 Read Only' },
                  { id: '22-empty', label: '22 Empty Roster' },
                  { id: '23-no-results', label: '23 No Results' },
                  { id: '24-success', label: '24 Success Toast' },
                  { id: '25-error', label: '25 Error Toast' },
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    data-qa-trigger={st.id}
                    onClick={() => setQaState(st.id as PeopleQaStateId)}
                    className={`rounded px-2 py-1 text-left truncate font-mono text-[10px] transition-colors ${
                      qaState === st.id
                        ? 'bg-emerald-500 font-bold text-slate-950 shadow-xs'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
