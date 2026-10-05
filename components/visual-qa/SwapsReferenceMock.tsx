'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  Clock3,
  ChevronDown,
  Search,
  Plus,
  Download,
  Check,
  X,
  AlertTriangle,
  Send,
  UserCheck,
  RefreshCw,
  AlertCircle,
  Lock,
  Layers,
  Sparkles,
  Ban,
  CheckCircle2,
  XCircle,
  Eye,
  ArrowLeftRight
} from 'lucide-react'
import { OpsWorkflowReferenceShell } from './OpsWorkflowReferenceShell'

export type SwapQaStateId =
  | '01-swaps-main'
  | '02-active-filters'
  | '03-swap-detail'
  | '04-requested-by-me'
  | '05-requests-for-me'
  | '06-create-choose-shift'
  | '07-create-choose-replacement'
  | '08-create-review'
  | '09-eligible-replacement'
  | '10-ineligible-replacement'
  | '11-overlap-conflict'
  | '12-duplicate-request'
  | '13-awaiting-participant'
  | '14-participant-accept'
  | '15-participant-decline'
  | '16-waiting-leader-approval'
  | '17-leader-decision-panel'
  | '18-leader-approve'
  | '19-leader-reject'
  | '20-mutation-completed'
  | '21-mutation-failed'
  | '22-requester-cancel'
  | '23-cancelled-terminal'
  | '24-rejected-terminal'
  | '25-declined-terminal'
  | '26-completed-terminal'
  | '27-stale-underlying-assignment'
  | '28-concurrency-cas'
  | '29-permission-read-only'
  | '30-history-timeline'
  | '31-empty'
  | '32-no-results'
  | '33-success-feedback'
  | '34-error-feedback'

export interface SwapRequestItem {
  id: string
  shift_id: string
  shift_title: string
  date: string
  time: string
  studio: string
  platform: string
  brand: string
  requester_id: string
  requester_name: string
  requester_role: 'host' | 'support' | 'technical'
  operational_role: 'host' | 'support' | 'technical'
  mode: 'replacement' | 'exchange'
  source_shift_id: string
  target_shift_id?: string | null
  target_shift_title?: string | null
  source_registration_id: string
  counterpart_registration_id?: string | null
  counterpart_id?: string | null
  counterpart_name?: string | null
  original_staff_id: string
  replacement_staff_id?: string | null
  replacement_staff_name?: string | null
  new_host_id?: string | null
  new_support_id?: string | null
  new_technical_id?: string | null
  reason: string
  notes?: string
  status: 'pending' | 'accepted' | 'approved' | 'completed' | 'rejected' | 'cancelled'
  approved_by?: string | null
  approved_at?: string | null
  responded_at?: string | null
  responded_by?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
  version: number
  approval_history: Array<{
    action: 'created' | 'accepted' | 'rejected' | 'cancelled' | 'approved' | 'completed'
    actor_id: string
    actor_name: string
    at: string
    from_status?: string | null
    to_status: string
    reason?: string
    notes?: string
  }>
}

const CANONICAL_SWAPS: SwapRequestItem[] = [
  {
    id: 'SWP-101',
    shift_id: 'shift-101',
    shift_title: 'Pharmaton - TikTok Live Mega Day',
    date: '12/09/2026',
    time: '14:00–17:00',
    studio: 'Studio 1',
    platform: 'TikTok Live',
    brand: 'Pharmaton',
    requester_id: 'usr-01',
    requester_name: 'Nguyễn Văn Bình',
    requester_role: 'host',
    operational_role: 'host',
    mode: 'replacement',
    source_shift_id: 'shift-101',
    source_registration_id: 'REG-101',
    original_staff_id: 'usr-01',
    replacement_staff_id: 'usr-03',
    replacement_staff_name: 'Bùi Việt Anh',
    new_host_id: 'usr-03',
    reason: 'Trùng lịch thi học kỳ tại trường, cần người thế ca',
    notes: 'Đã trao đổi trước và xác nhận Bùi Việt Anh có thời gian rảnh',
    status: 'pending',
    created_at: '2026-09-08T08:30:00Z',
    updated_at: '2026-09-08T08:30:00Z',
    version: 1,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-01',
        actor_name: 'Nguyễn Văn Bình',
        at: '2026-09-08T08:30:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Trùng lịch thi học kỳ tại trường, cần người thế ca',
      },
    ],
  },
  {
    id: 'SWP-102',
    shift_id: 'shift-104',
    shift_title: 'Samsung Galaxy Livestream Sale',
    date: '14/09/2026',
    time: '18:00–21:30',
    studio: 'Studio 2',
    platform: 'Shopee Live',
    brand: 'Samsung',
    requester_id: 'usr-04',
    requester_name: 'Đỗ Phương Thảo',
    requester_role: 'host',
    operational_role: 'host',
    mode: 'exchange',
    source_shift_id: 'shift-104',
    target_shift_id: 'shift-105',
    target_shift_title: "Shopee Super Brand Day - L'Oreal",
    source_registration_id: 'REG-104',
    counterpart_registration_id: 'REG-105',
    counterpart_id: 'usr-05',
    counterpart_name: 'Phạm Ngọc Lan',
    original_staff_id: 'usr-04',
    new_host_id: 'usr-05',
    reason: 'Đổi chéo để sắp xếp lịch trực cuối tuần',
    notes: 'Hai bên đã thống nhất đổi ca qua lại',
    status: 'accepted',
    responded_at: '2026-09-09T14:32:00Z',
    responded_by: 'usr-05',
    created_at: '2026-09-09T09:15:00Z',
    updated_at: '2026-09-09T14:32:00Z',
    version: 2,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-04',
        actor_name: 'Đỗ Phương Thảo',
        at: '2026-09-09T09:15:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Đổi chéo để sắp xếp lịch trực cuối tuần',
      },
      {
        action: 'accepted',
        actor_id: 'usr-05',
        actor_name: 'Phạm Ngọc Lan',
        at: '2026-09-09T14:32:00Z',
        from_status: 'pending',
        to_status: 'accepted',
        notes: 'Đồng ý đổi chéo ca với Đỗ Phương Thảo',
      },
    ],
  },
  {
    id: 'SWP-103',
    shift_id: 'shift-102',
    shift_title: 'Sunhouse Flash Sale Mega',
    date: '10/09/2026',
    time: '13:00–16:00',
    studio: 'Studio 3',
    platform: 'TikTok Live',
    brand: 'Sunhouse',
    requester_id: 'usr-02',
    requester_name: 'Lê Tuấn Minh',
    requester_role: 'technical',
    operational_role: 'technical',
    mode: 'replacement',
    source_shift_id: 'shift-102',
    source_registration_id: 'REG-102',
    original_staff_id: 'usr-02',
    replacement_staff_id: 'usr-06',
    replacement_staff_name: 'Hoàng Trọng Nghĩa',
    new_technical_id: 'usr-06',
    reason: 'Bận hỗ trợ kỹ thuật đột xuất cho sự kiện ra mắt',
    notes: 'Đã hoàn tất phân bổ nhân sự vào ca',
    status: 'completed',
    approved_by: 'usr-admin',
    approved_at: '2026-09-09T17:10:00Z',
    responded_at: '2026-09-09T15:00:00Z',
    responded_by: 'usr-06',
    completed_at: '2026-09-09T17:11:00Z',
    created_at: '2026-09-09T10:00:00Z',
    updated_at: '2026-09-09T17:11:00Z',
    version: 3,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-02',
        actor_name: 'Lê Tuấn Minh',
        at: '2026-09-09T10:00:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Bận hỗ trợ kỹ thuật đột xuất cho sự kiện ra mắt',
      },
      {
        action: 'accepted',
        actor_id: 'usr-06',
        actor_name: 'Hoàng Trọng Nghĩa',
        at: '2026-09-09T15:00:00Z',
        from_status: 'pending',
        to_status: 'accepted',
        notes: 'Sẵn sàng nhận ca kỹ thuật thay thế',
      },
      {
        action: 'approved',
        actor_id: 'usr-admin',
        actor_name: 'Trần Thị Mai Anh (Leader)',
        at: '2026-09-09T17:10:00Z',
        from_status: 'accepted',
        to_status: 'approved',
        notes: 'Phê duyệt phân bổ kỹ thuật viên thay thế',
      },
      {
        action: 'completed',
        actor_id: 'system',
        actor_name: 'Hệ thống tự động',
        at: '2026-09-09T17:11:00Z',
        from_status: 'approved',
        to_status: 'completed',
        notes: 'Đã cập nhật ShiftRegistration REG-102 (cancelled) và REG-112 (approved, manual_assignment)',
      },
    ],
  },
  {
    id: 'SWP-104',
    shift_id: 'shift-107',
    shift_title: 'Lock&Lock Gia Dụng Thông Minh',
    date: '15/09/2026',
    time: '09:00–12:00',
    studio: 'Studio 1',
    platform: 'Lazada Live',
    brand: 'Lock&Lock',
    requester_id: 'usr-07',
    requester_name: 'Trần Văn Bình',
    requester_role: 'support',
    operational_role: 'support',
    mode: 'replacement',
    source_shift_id: 'shift-107',
    source_registration_id: 'REG-107',
    original_staff_id: 'usr-07',
    replacement_staff_id: 'usr-08',
    replacement_staff_name: 'Nguyễn Thị Mai Anh',
    new_support_id: 'usr-08',
    reason: 'Trùng lịch công tác tại chi nhánh',
    notes: 'Từ chối do người thay thế chưa qua đào tạo hệ thống chốt đơn Lock&Lock',
    status: 'rejected',
    approved_by: 'usr-admin',
    approved_at: '2026-09-10T11:20:00Z',
    created_at: '2026-09-09T16:00:00Z',
    updated_at: '2026-09-10T11:20:00Z',
    version: 2,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-07',
        actor_name: 'Trần Văn Bình',
        at: '2026-09-09T16:00:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Trùng lịch công tác tại chi nhánh',
      },
      {
        action: 'rejected',
        actor_id: 'usr-admin',
        actor_name: 'Trần Thị Mai Anh (Leader)',
        at: '2026-09-10T11:20:00Z',
        from_status: 'pending',
        to_status: 'rejected',
        notes: 'Không phê duyệt: Người thay thế chưa hoàn thành chứng chỉ vận hành Lock&Lock',
      },
    ],
  },
  {
    id: 'SWP-105',
    shift_id: 'shift-108',
    shift_title: 'Shiseido Beauty Live Festival',
    date: '16/09/2026',
    time: '19:00–22:00',
    studio: 'Studio 2',
    platform: 'TikTok Live',
    brand: 'Shiseido',
    requester_id: 'usr-01',
    requester_name: 'Nguyễn Văn Bình',
    requester_role: 'host',
    operational_role: 'host',
    mode: 'replacement',
    source_shift_id: 'shift-108',
    source_registration_id: 'REG-108',
    original_staff_id: 'usr-01',
    replacement_staff_id: 'usr-04',
    replacement_staff_name: 'Đỗ Phương Thảo',
    new_host_id: 'usr-04',
    reason: 'Kế hoạch cá nhân thay đổi, đã tự sắp xếp trực được ca này',
    notes: 'Người yêu cầu chủ động huỷ đơn',
    status: 'cancelled',
    created_at: '2026-09-04T08:00:00Z',
    updated_at: '2026-09-04T10:10:00Z',
    version: 2,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-01',
        actor_name: 'Nguyễn Văn Bình',
        at: '2026-09-04T08:00:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Kế hoạch cá nhân thay đổi, đã tự sắp xếp trực được ca này',
      },
      {
        action: 'cancelled',
        actor_id: 'usr-01',
        actor_name: 'Nguyễn Văn Bình',
        at: '2026-09-04T10:10:00Z',
        from_status: 'pending',
        to_status: 'cancelled',
        reason: 'Huỷ do tự sắp xếp được thời gian',
      },
    ],
  },
  {
    id: 'SWP-106',
    shift_id: 'shift-109',
    shift_title: 'Anlene Gold Dinh Dưỡng Khoẻ',
    date: '18/09/2026',
    time: '10:00–13:00',
    studio: 'Studio 3',
    platform: 'Shopee Live',
    brand: 'Anlene',
    requester_id: 'usr-09',
    requester_name: 'Vũ Thu Hằng',
    requester_role: 'support',
    operational_role: 'support',
    mode: 'exchange',
    source_shift_id: 'shift-109',
    target_shift_id: 'shift-110',
    target_shift_title: 'Ensure Gold Livestream Sức Khoẻ',
    source_registration_id: 'REG-109',
    counterpart_registration_id: 'REG-110',
    counterpart_id: 'usr-10',
    counterpart_name: 'Nguyễn Đức Huy',
    original_staff_id: 'usr-09',
    new_support_id: 'usr-10',
    reason: 'Đổi chéo ca sáng sang ca chiều cùng ngày',
    status: 'pending',
    created_at: '2026-09-10T08:00:00Z',
    updated_at: '2026-09-10T08:00:00Z',
    version: 1,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-09',
        actor_name: 'Vũ Thu Hằng',
        at: '2026-09-10T08:00:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Đổi chéo ca sáng sang ca chiều cùng ngày',
      },
    ],
  },
  {
    id: 'SWP-107',
    shift_id: 'shift-111',
    shift_title: 'Corbiere Trực Tiếp Sức Khoẻ Vàng',
    date: '20/09/2026',
    time: '10:00–14:00',
    studio: 'Studio 1',
    platform: 'TikTok Live',
    brand: 'Corbiere',
    requester_id: 'usr-06',
    requester_name: 'Hoàng Trọng Nghĩa',
    requester_role: 'technical',
    operational_role: 'technical',
    mode: 'replacement',
    source_shift_id: 'shift-111',
    source_registration_id: 'REG-111',
    original_staff_id: 'usr-06',
    replacement_staff_id: 'usr-02',
    replacement_staff_name: 'Lê Tuấn Minh',
    new_technical_id: 'usr-02',
    reason: 'Hỗ trợ đồng đội ca kỹ thuật đặc thù',
    status: 'accepted',
    responded_at: '2026-09-10T12:00:00Z',
    responded_by: 'usr-02',
    created_at: '2026-09-10T09:00:00Z',
    updated_at: '2026-09-10T12:00:00Z',
    version: 2,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-06',
        actor_name: 'Hoàng Trọng Nghĩa',
        at: '2026-09-10T09:00:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Hỗ trợ đồng đội ca kỹ thuật đặc thù',
      },
      {
        action: 'accepted',
        actor_id: 'usr-02',
        actor_name: 'Lê Tuấn Minh',
        at: '2026-09-10T12:00:00Z',
        from_status: 'pending',
        to_status: 'accepted',
        notes: 'Đã sẵn sàng thiết bị và xác nhận nhận ca',
      },
    ],
  },
  {
    id: 'SWP-108',
    shift_id: 'shift-112',
    shift_title: 'Enterogermina Livestream Chuyên Sâu',
    date: '22/09/2026',
    time: '14:00–17:00',
    studio: 'Studio 2',
    platform: 'TikTok Live',
    brand: 'Enterogermina',
    requester_id: 'usr-05',
    requester_name: 'Phạm Ngọc Lan',
    requester_role: 'support',
    operational_role: 'support',
    mode: 'replacement',
    source_shift_id: 'shift-112',
    source_registration_id: 'REG-112',
    original_staff_id: 'usr-05',
    replacement_staff_id: 'usr-03',
    replacement_staff_name: 'Bùi Việt Anh',
    new_support_id: 'usr-03',
    reason: 'Đổi ca việc gia đình',
    status: 'completed',
    approved_by: 'usr-admin',
    approved_at: '2026-09-11T10:00:00Z',
    responded_at: '2026-09-11T09:00:00Z',
    responded_by: 'usr-03',
    completed_at: '2026-09-11T10:01:00Z',
    created_at: '2026-09-10T14:00:00Z',
    updated_at: '2026-09-11T10:01:00Z',
    version: 3,
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-05',
        actor_name: 'Phạm Ngọc Lan',
        at: '2026-09-10T14:00:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Đổi ca việc gia đình',
      },
      {
        action: 'accepted',
        actor_id: 'usr-03',
        actor_name: 'Bùi Việt Anh',
        at: '2026-09-11T09:00:00Z',
        from_status: 'pending',
        to_status: 'accepted',
      },
      {
        action: 'approved',
        actor_id: 'usr-admin',
        actor_name: 'Trần Thị Mai Anh (Leader)',
        at: '2026-09-11T10:00:00Z',
        from_status: 'accepted',
        to_status: 'approved',
      },
      {
        action: 'completed',
        actor_id: 'system',
        actor_name: 'Hệ thống tự động',
        at: '2026-09-11T10:01:00Z',
        from_status: 'approved',
        to_status: 'completed',
      },
    ],
  },
]


export function getSwp101Snapshot(qaState: SwapQaStateId): SwapRequestItem {
  const base = CANONICAL_SWAPS[0]
  // ACCEPTED states: participant accepted, waiting leader, decision panel, approve dialog, reject dialog, or mutation failed rollback
  if (
    qaState === '14-participant-accept' ||
    qaState === '16-waiting-leader-approval' ||
    qaState === '17-leader-decision-panel' ||
    qaState === '18-leader-approve' ||
    qaState === '19-leader-reject' ||
    qaState === '21-mutation-failed'
  ) {
    return {
      ...base,
      status: 'accepted',
      version: 2,
      responded_by: 'usr-03',
      responded_at: '2026-09-08T10:15:00Z',
      updated_at: '2026-09-08T10:15:00Z',
      approval_history: [
        {
          action: 'created',
          actor_id: 'usr-01',
          actor_name: 'Nguyễn Văn Bình',
          at: '2026-09-08T08:30:00Z',
          from_status: null,
          to_status: 'pending',
          reason: 'Trùng lịch thi học kỳ tại trường, cần người thế ca',
        },
        {
          action: 'accepted',
          actor_id: 'usr-03',
          actor_name: 'Bùi Việt Anh',
          at: '2026-09-08T10:15:00Z',
          from_status: 'pending',
          to_status: 'accepted',
          notes: 'Đồng ý nhận ca đổi từ Nguyễn Văn Bình',
        },
      ],
    }
  }

  // COMPLETED states: approved & completed via atomic mutation
  if (qaState === '20-mutation-completed' || qaState === '26-completed-terminal') {
    return {
      ...base,
      status: 'completed',
      version: 3,
      responded_by: 'usr-03',
      responded_at: '2026-09-08T10:15:00Z',
      approved_by: 'usr-lead-01',
      approved_at: '2026-09-08T14:30:00Z',
      completed_at: '2026-09-08T14:30:00Z',
      updated_at: '2026-09-08T14:30:00Z',
      notes: 'Đã duyệt đổi ca hợp lệ và cập nhật sổ phân bổ ShiftRegistration (REG-901)',
      approval_history: [
        {
          action: 'created',
          actor_id: 'usr-01',
          actor_name: 'Nguyễn Văn Bình',
          at: '2026-09-08T08:30:00Z',
          from_status: null,
          to_status: 'pending',
          reason: 'Trùng lịch thi học kỳ tại trường, cần người thế ca',
        },
        {
          action: 'accepted',
          actor_id: 'usr-03',
          actor_name: 'Bùi Việt Anh',
          at: '2026-09-08T10:15:00Z',
          from_status: 'pending',
          to_status: 'accepted',
          notes: 'Đồng ý nhận ca đổi từ Nguyễn Văn Bình',
        },
        {
          action: 'approved',
          actor_id: 'usr-lead-01',
          actor_name: 'Trần Thị Mai Anh (Leader)',
          at: '2026-09-08T14:30:00Z',
          from_status: 'accepted',
          to_status: 'approved',
          notes: 'Duyệt chuyển giao ca trực Host, thực hiện mutation ShiftRegistration',
        },
        {
          action: 'completed',
          actor_id: 'system',
          actor_name: 'Hệ thống tự động',
          at: '2026-09-08T14:30:00Z',
          from_status: 'approved',
          to_status: 'completed',
        },
      ],
    }
  }

  // DEFAULT / PENDING:
  return {
    ...base,
    status: 'pending',
    version: 1,
    responded_by: undefined,
    responded_at: undefined,
    approved_by: undefined,
    approved_at: undefined,
    completed_at: undefined,
    created_at: '2026-09-08T08:30:00Z',
    updated_at: '2026-09-08T08:30:00Z',
    approval_history: [
      {
        action: 'created',
        actor_id: 'usr-01',
        actor_name: 'Nguyễn Văn Bình',
        at: '2026-09-08T08:30:00Z',
        from_status: null,
        to_status: 'pending',
        reason: 'Trùng lịch thi học kỳ tại trường, cần người thế ca',
      },
    ],
  }
}

export function SwapsReferenceMock({ initialState }: { initialState?: SwapQaStateId }) {
  const searchParams = useSearchParams()
  const initialQaParam = (searchParams.get('state') || searchParams.get('qaState') || initialState || '01-swaps-main') as SwapQaStateId
  const [qaState, setQaState] = useState<SwapQaStateId>(initialQaParam)
  const [qaOpen, setQaOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('SWP-101')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const p = searchParams.get('state') || searchParams.get('qaState')
    if (p) {
      setQaState(p as SwapQaStateId)
    }
  }, [searchParams])

  const currentSwaps = useMemo(() => {
    const swp101 = getSwp101Snapshot(qaState)
    return [swp101, ...CANONICAL_SWAPS.slice(1)]
  }, [qaState])

  const selectedSwap = useMemo(() => {
    return currentSwaps.find((s) => s.id === selectedId) ?? currentSwaps[0]
  }, [currentSwaps, selectedId])

  // Count tallies
  const tallies = useMemo(() => {
    return {
      total: currentSwaps.length,
      pending: currentSwaps.filter((s) => s.status === 'pending').length,
      accepted: currentSwaps.filter((s) => s.status === 'accepted').length,
      completed: currentSwaps.filter((s) => s.status === 'completed').length,
      rejected: currentSwaps.filter((s) => s.status === 'rejected').length,
      cancelled: currentSwaps.filter((s) => s.status === 'cancelled').length,
      requestedByMe: currentSwaps.filter((s) => s.requester_id === 'usr-01').length,
      requestsForMe: currentSwaps.filter((s) => s.replacement_staff_id === 'usr-03' || s.counterpart_id === 'usr-03').length,
    }
  }, [])

  // Filtered swaps depending on state
  const displayedSwaps = useMemo(() => {
    if (qaState === '31-empty') return []
    if (qaState === '32-no-results') return []
    if (qaState === '04-requested-by-me') {
      return currentSwaps.filter((s) => s.requester_id === 'usr-01')
    }
    if (qaState === '05-requests-for-me') {
      return currentSwaps.filter((s) => s.replacement_staff_id === 'usr-03' || s.counterpart_id === 'usr-03')
    }
    if (qaState === '02-active-filters') {
      return currentSwaps.filter((s) => s.mode === 'replacement' && s.operational_role === 'host' && s.status === 'pending')
    }
    if (qaState === '13-awaiting-participant') {
      return currentSwaps.filter((s) => s.status === 'pending')
    }
    if (qaState === '16-waiting-leader-approval') {
      return currentSwaps.filter((s) => s.status === 'accepted')
    }
    if (qaState === '23-cancelled-terminal') {
      return currentSwaps.filter((s) => s.status === 'cancelled')
    }
    if (qaState === '24-rejected-terminal') {
      return currentSwaps.filter((s) => s.status === 'rejected')
    }
    if (qaState === '26-completed-terminal') {
      return currentSwaps.filter((s) => s.status === 'completed')
    }
    return currentSwaps
  }, [currentSwaps, qaState])

  return (
    <OpsWorkflowReferenceShell active="Swaps" searchPlaceholder="Tìm kiếm mã đơn, ca trực, nhân sự đổi ca...">
      <div data-testid="swaps-reference-mock" className="relative flex flex-col min-h-screen pb-16">
        {/* TOP WORKSPACE HEADER */}
        <div className="border-b border-slate-200 bg-white px-6 py-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">Quản lý đổi ca (Shift Swaps)</h1>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  {tallies.total} Yêu cầu
                </span>
                {qaState === '29-permission-read-only' && (
                  <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    <Lock className="h-3 w-3" /> Chế độ xem thành viên (swaps.approve: Không có quyền)
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Quy trình đổi ca có kiểm soát: Đề xuất → Người nhận phản hồi → Leader phê duyệt → Cập nhật ShiftRegistration
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                Xuất Excel
              </button>
              {qaState !== '29-permission-read-only' && (
                <button
                  type="button"
                  data-qa-trigger="06-create-choose-shift"
                  onClick={() => setQaState('06-create-choose-shift')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tạo yêu cầu đổi ca
                </button>
              )}
            </div>
          </div>

          {/* WORKSPACE METRIC TABS */}
          <div className="mt-4 flex items-center gap-2 border-b border-slate-200 text-xs font-medium text-slate-500 overflow-x-auto pb-0">
            <button
              type="button"
              onClick={() => setQaState('01-swaps-main')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '01-swaps-main' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-700'
              }`}
            >
              Tất cả ({tallies.total})
            </button>
            <button
              type="button"
              onClick={() => setQaState('13-awaiting-participant')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '13-awaiting-participant' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-700'
              }`}
            >
              Chờ phản hồi ({tallies.pending})
            </button>
            <button
              type="button"
              onClick={() => setQaState('16-waiting-leader-approval')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '16-waiting-leader-approval' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-700'
              }`}
            >
              Chờ Leader duyệt ({tallies.accepted})
            </button>
            <button
              type="button"
              onClick={() => setQaState('26-completed-terminal')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '26-completed-terminal' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-700'
              }`}
            >
              Đã hoàn tất ({tallies.completed})
            </button>
            <button
              type="button"
              onClick={() => setQaState('24-rejected-terminal')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '24-rejected-terminal' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-700'
              }`}
            >
              Đã từ chối ({tallies.rejected})
            </button>
            <button
              type="button"
              onClick={() => setQaState('23-cancelled-terminal')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '23-cancelled-terminal' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-700'
              }`}
            >
              Đã huỷ ({tallies.cancelled})
            </button>

            <span className="h-4 w-px bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={() => setQaState('04-requested-by-me')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '04-requested-by-me' ? 'border-blue-600 text-blue-600' : 'border-transparent text-purple-700 hover:text-purple-900'
              }`}
            >
              Tôi yêu cầu ({tallies.requestedByMe})
            </button>
            <button
              type="button"
              onClick={() => setQaState('05-requests-for-me')}
              className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
                qaState === '05-requests-for-me' ? 'border-blue-600 text-blue-600' : 'border-transparent text-emerald-700 hover:text-emerald-900'
              }`}
            >
              Yêu cầu cho tôi ({tallies.requestsForMe})
            </button>
          </div>
        </div>

        {/* FEEDBACK TOASTS FOR STATE 33 & 34 */}
        {qaState === '33-success-feedback' && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span><strong>Thành công:</strong> Yêu cầu đổi ca SWP-101 đã được tạo và gửi tới người nhận phản hồi!</span>
            </div>
            <button type="button" onClick={() => setQaState('01-swaps-main')} className="text-emerald-600 hover:text-emerald-800 font-bold">×</button>
          </div>
        )}

        {qaState === '34-error-feedback' && (
          <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span><strong>Lỗi kết nối máy chủ:</strong> Không thể áp dụng cập nhật đổi ca (ERR_NETWORK_TIMEOUT). Vui lòng thử lại sau.</span>
            </div>
            <button type="button" onClick={() => setQaState('01-swaps-main')} className="text-rose-600 hover:text-rose-800 font-bold">×</button>
          </div>
        )}

        {/* FILTER BAR & CHIPS */}
        <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
              <span>Tháng 09/2026</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              <span>Phương thức: {qaState === '02-active-filters' ? 'Thế ca (Replacement)' : 'Tất cả'}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              <span>Vai trò: {qaState === '02-active-filters' ? 'Host' : 'Tất cả'}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
              <span>Trạng thái: {qaState === '02-active-filters' ? 'Chờ phản hồi' : 'Tất cả'}</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </div>

            {qaState === '02-active-filters' && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                  Mode: Replacement <X className="h-3 w-3 cursor-pointer" onClick={() => setQaState('01-swaps-main')} />
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Role: Host <X className="h-3 w-3 cursor-pointer" onClick={() => setQaState('01-swaps-main')} />
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Status: Pending <X className="h-3 w-3 cursor-pointer" onClick={() => setQaState('01-swaps-main')} />
                </span>
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  Xoá tất cả
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã đơn, tên, ca..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-56 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setQaState('02-active-filters')}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              Bộ lọc
            </button>
          </div>
        </div>

        {/* MAIN QUEUE CONTENT TABLE */}
        <div className="flex-1 p-6">
          {qaState === '31-empty' ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Send className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Không có yêu cầu đổi ca nào</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Chưa có đơn đổi ca nào được ghi nhận trong hệ thống hoặc toàn bộ yêu cầu đã được xử lý xong.
              </p>
              <button
                type="button"
                onClick={() => setQaState('01-swaps-main')}
                className="mt-4 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Quay lại danh sách chính
              </button>
            </div>
          ) : qaState === '32-no-results' ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">Không tìm thấy kết quả phù hợp</h3>
              <p className="mt-1 text-xs text-slate-500">
                Không tìm thấy yêu cầu đổi ca nào khớp với bộ lọc hoặc từ khoá tìm kiếm của bạn.
              </p>
              <button
                type="button"
                onClick={() => setQaState('01-swaps-main')}
                className="mt-4 rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Xoá bộ lọc tìm kiếm
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 border-collapse">
                  <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Mã đơn & Ngày</th>
                      <th className="py-3 px-4">Ca trực & Studio</th>
                      <th className="py-3 px-4">Người yêu cầu & Vai trò</th>
                      <th className="py-3 px-4">Phương thức</th>
                      <th className="py-3 px-4">Người nhận / Ca đổi</th>
                      <th className="py-3 px-4">Lý do</th>
                      <th className="py-3 px-4">Trạng thái</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedSwaps.map((swap) => {
                      const isPending = swap.status === 'pending'
                      const isAccepted = swap.status === 'accepted'
                      const isCompleted = swap.status === 'completed'
                      const isRejected = swap.status === 'rejected'
                      const isCancelled = swap.status === 'cancelled'

                      return (
                        <tr
                          key={swap.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            selectedId === swap.id ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          {/* MÃ ĐƠN & NGÀY */}
                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(swap.id)
                                setQaState('03-swap-detail')
                              }}
                              className="font-bold text-blue-600 hover:underline flex items-center gap-1 font-mono text-[11px]"
                            >
                              {swap.id}
                            </button>
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                              {swap.date} · v{swap.version}
                            </span>
                          </td>

                          {/* CA TRỰC & STUDIO */}
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 block truncate max-w-[200px]">
                              {swap.shift_title}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                              <span>{swap.time}</span>
                              <span>·</span>
                              <span>{swap.studio}</span>
                            </div>
                          </td>

                          {/* NGƯỜI YÊU CẦU & VAI TRÒ */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                                {swap.requester_name.slice(-2)}
                              </span>
                              <div>
                                <span className="font-medium text-slate-800 block text-xs">
                                  {swap.requester_name}
                                </span>
                                <span className={`inline-block text-[9px] font-bold uppercase rounded px-1 mt-0.5 ${
                                  swap.operational_role === 'host'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : swap.operational_role === 'support'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {swap.operational_role}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* PHƯƠNG THỨC */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                              swap.mode === 'replacement'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}>
                              {swap.mode === 'replacement' ? <UserCheck className="h-3 w-3" /> : <ArrowLeftRight className="h-3 w-3" />}
                              {swap.mode === 'replacement' ? 'Thế ca' : 'Đổi chéo'}
                            </span>
                          </td>

                          {/* NGƯỜI NHẬN / CA ĐỔI */}
                          <td className="py-3.5 px-4">
                            {swap.mode === 'replacement' ? (
                              <div className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                                  {swap.replacement_staff_name ? swap.replacement_staff_name.slice(-2) : '??'}
                                </span>
                                <span className="font-medium text-slate-800 text-xs">
                                  {swap.replacement_staff_name ?? 'Chưa chỉ định'}
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="font-medium text-slate-800 block text-xs truncate max-w-[160px]">
                                  {swap.counterpart_name}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[160px]">
                                  {swap.target_shift_title ?? 'Ca đối ứng'}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* LÝ DO */}
                          <td className="py-3.5 px-4 max-w-[180px]">
                            <p className="truncate text-slate-600 text-xs" title={swap.reason}>
                              {swap.reason}
                            </p>
                          </td>

                          {/* TRẠNG THÁI */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              isPending
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : isAccepted
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : isCompleted
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isRejected
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {isPending && <Clock3 className="h-3 w-3" />}
                              {isAccepted && <Check className="h-3 w-3" />}
                              {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                              {isRejected && <XCircle className="h-3 w-3" />}
                              {isCancelled && <Ban className="h-3 w-3" />}
                              {isPending
                                ? 'Chờ phản hồi'
                                : isAccepted
                                ? 'Chờ Leader duyệt'
                                : isCompleted
                                ? 'Đã hoàn tất'
                                : isRejected
                                ? 'Đã từ chối'
                                : 'Đã huỷ'}
                            </span>
                          </td>

                          {/* THAO TÁC CONTEXTUAL */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {qaState === '04-requested-by-me' && isPending && (
                                <button
                                  type="button"
                                  data-qa-trigger="22-requester-cancel"
                                  onClick={() => {
                                    setSelectedId(swap.id)
                                    setQaState('22-requester-cancel')
                                  }}
                                  className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                                >
                                  Huỷ đơn
                                </button>
                              )}

                              {qaState === '05-requests-for-me' && isPending && (
                                <>
                                  <button
                                    type="button"
                                    data-qa-trigger="14-participant-accept"
                                    onClick={() => {
                                      setSelectedId(swap.id)
                                      setQaState('14-participant-accept')
                                    }}
                                    className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                  >
                                    Nhận ca
                                  </button>
                                  <button
                                    type="button"
                                    data-qa-trigger="15-participant-decline"
                                    onClick={() => {
                                      setSelectedId(swap.id)
                                      setQaState('15-participant-decline')
                                    }}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Từ chối
                                  </button>
                                </>
                              )}

                              {isAccepted && qaState !== '29-permission-read-only' && (
                                <button
                                  type="button"
                                  data-qa-trigger="17-leader-decision-panel"
                                  onClick={() => {
                                    setSelectedId(swap.id)
                                    setQaState('17-leader-decision-panel')
                                  }}
                                  className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 shadow-2xs"
                                >
                                  Xem xét duyệt
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(swap.id)
                                  setQaState('03-swap-detail')
                                }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* TABLE FOOTER */}
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-[11px] text-slate-500 bg-slate-50/50">
                <span>Hiển thị {displayedSwaps.length} trên tổng số {tallies.total} đơn đổi ca</span>
                <div className="flex items-center gap-1">
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-400 cursor-not-allowed">‹</span>
                  <span className="rounded bg-blue-600 px-2 py-0.5 font-bold text-white">1</span>
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-400 cursor-not-allowed">›</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL 03: SWAP DETAIL - 27 DB FIELDS */}
        {qaState === '03-swap-detail' && (
          <ModalWrapper
            title="Chi tiết hợp đồng dữ liệu yêu cầu đổi ca (Swap Request Data Contract)"
            subtitle="Hiển thị đầy đủ 27 trường dữ liệu chuẩn hoá theo schema lib/types/database.types.ts :: SwapRequest"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-4 text-xs">
              <div className="rounded-lg bg-blue-50/60 border border-blue-200 p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-blue-700 font-mono">MÃ ĐƠN: {selectedSwap.id}</span>
                  <h3 className="font-bold text-slate-900 text-sm mt-0.5">{selectedSwap.shift_title}</h3>
                  <p className="text-[11px] text-slate-600 mt-0.5">{selectedSwap.date} · {selectedSwap.time} · {selectedSwap.studio}</p>
                </div>
                <div className="text-right">
                  <span className="rounded bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[10px] uppercase block mb-1">
                    Trạng thái: {selectedSwap.status}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Version: {selectedSwap.version}</span>
                </div>
              </div>

              <div className="max-h-[380px] overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50/30">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'SWAP-001 id', value: selectedSwap.id },
                    { key: 'SWAP-002 shift_id', value: selectedSwap.shift_id },
                    { key: 'SWAP-003 requester_id', value: selectedSwap.requester_id },
                    { key: 'SWAP-004 operational_role', value: selectedSwap.operational_role },
                    { key: 'SWAP-005 mode', value: selectedSwap.mode },
                    { key: 'SWAP-006 source_shift_id', value: selectedSwap.source_shift_id },
                    { key: 'SWAP-007 target_shift_id', value: selectedSwap.target_shift_id ?? 'null (chế độ thế ca)' },
                    { key: 'SWAP-008 source_reg_id', value: selectedSwap.source_registration_id },
                    { key: 'SWAP-009 counterpart_reg_id', value: selectedSwap.counterpart_registration_id ?? 'null' },
                    { key: 'SWAP-010 counterpart_id', value: selectedSwap.counterpart_id ?? 'null' },
                    { key: 'SWAP-011 original_staff_id', value: selectedSwap.original_staff_id },
                    { key: 'SWAP-012 replacement_staff_id', value: selectedSwap.replacement_staff_id ?? 'null' },
                    { key: 'SWAP-013 new_host_id', value: selectedSwap.new_host_id ?? 'null' },
                    { key: 'SWAP-014 new_support_id', value: selectedSwap.new_support_id ?? 'null' },
                    { key: 'SWAP-015 new_technical_id', value: selectedSwap.new_technical_id ?? 'null' },
                    { key: 'SWAP-016 reason', value: selectedSwap.reason },
                    { key: 'SWAP-017 notes', value: selectedSwap.notes ?? 'Không có ghi chú' },
                    { key: 'SWAP-018 approval_history', value: `${selectedSwap.approval_history.length} sự kiện kiểm toán` },
                    { key: 'SWAP-019 status', value: selectedSwap.status },
                    { key: 'SWAP-020 approved_by', value: selectedSwap.approved_by ?? 'Chưa duyệt' },
                    { key: 'SWAP-021 approved_at', value: selectedSwap.approved_at ?? 'Chưa duyệt' },
                    { key: 'SWAP-022 responded_at', value: selectedSwap.responded_at ?? 'Chưa phản hồi' },
                    { key: 'SWAP-023 responded_by', value: selectedSwap.responded_by ?? 'Chưa phản hồi' },
                    { key: 'SWAP-024 completed_at', value: selectedSwap.completed_at ?? 'Chưa hoàn tất' },
                    { key: 'SWAP-025 created_at', value: selectedSwap.created_at },
                    { key: 'SWAP-026 updated_at', value: selectedSwap.updated_at },
                    { key: 'SWAP-027 version', value: `Revision: ${selectedSwap.version}` },
                  ].map((field) => (
                    <div key={field.key} className="rounded border border-slate-200 bg-white p-2">
                      <span className="block font-mono text-[9px] font-bold text-slate-400 uppercase truncate">
                        {field.key}
                      </span>
                      <strong className="block text-[11px] font-medium text-slate-800 mt-0.5 truncate" title={String(field.value)}>
                        {String(field.value)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 06: CREATE SWAP STEP 1 - CHOOSE SHIFT */}
        {qaState === '06-create-choose-shift' && (
          <ModalWrapper
            title="Tạo yêu cầu đổi ca — Bước 1: Chọn ca làm việc thuộc quyền sở hữu"
            subtitle="Chỉ những ca làm việc đã được phân bổ hợp lệ (ShiftRegistration approved) mới đủ điều kiện đổi"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">Chọn ca làm việc bạn muốn đổi sang người khác hoặc đổi chéo:</p>
              <div className="space-y-2">
                <div className="rounded-lg border-2 border-blue-600 bg-blue-50/40 p-3 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Pharmaton - TikTok Live Mega Day</span>
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Host (REG-101)</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                    <span>12/09/2026</span>
                    <span>14:00–17:00</span>
                    <span>Studio 1</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 cursor-pointer opacity-70">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Shiseido Beauty Live Festival</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Host (REG-108)</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                    <span>16/09/2026</span>
                    <span>19:00–22:00</span>
                    <span>Studio 2</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  data-qa-trigger="07-create-choose-replacement"
                  onClick={() => setQaState('07-create-choose-replacement')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Tiếp tục: Chọn người thay thế →
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 07: CREATE SWAP STEP 2 - CHOOSE REPLACEMENT */}
        {qaState === '07-create-choose-replacement' && (
          <ModalWrapper
            title="Tạo yêu cầu đổi ca — Bước 2: Chọn phương thức & nhân sự thay thế"
            subtitle="Hỗ trợ 2 phương thức chuẩn: Thế ca (Replacement) và Đổi chéo ca (Exchange)"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border-2 border-blue-600 bg-blue-50/30 p-2.5 cursor-pointer">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <UserCheck className="h-4 w-4 text-blue-600" />
                    <span>Thế ca (Replacement)</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">Chỉ định một đồng đội nhận thay toàn bộ ca trực này của bạn.</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer hover:border-slate-300">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <ArrowLeftRight className="h-4 w-4 text-purple-600" />
                    <span>Đổi chéo (Exchange)</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">Đổi ca này lấy một ca trực cụ thể khác của đồng đội.</p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chọn nhân sự nhận ca thay thế (Host):</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  <div className="flex items-center justify-between rounded-md border-2 border-emerald-500 bg-emerald-50/40 p-2 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800">VA</span>
                      <div>
                        <strong className="block text-slate-800 text-xs">Bùi Việt Anh (Host)</strong>
                        <span className="text-[10px] text-emerald-700 font-semibold">Đủ điều kiện vai trò · 0 xung đột ca</span>
                      </div>
                    </div>
                    <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">Khả dụng</span>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-2 hover:border-slate-300 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">PT</span>
                      <div>
                        <strong className="block text-slate-800 text-xs">Đỗ Phương Thảo (Host)</strong>
                        <span className="text-[10px] text-slate-500">Đủ điều kiện vai trò · Có lịch rảnh</span>
                      </div>
                    </div>
                    <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px]">Khả dụng</span>
                  </div>
                </div>
              </div>

              {/* UNBACKED DISCLOSURE */}
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-800 space-y-1">
                <span className="font-bold flex items-center gap-1 text-[10px] uppercase text-amber-900">
                  <Sparkles className="h-3 w-3 text-amber-600" />
                  [CHƯA HỖ TRỢ BỞI DATABASE / EXPERIMENTAL UNBACKED]
                </span>
                <p className="text-[10px] leading-relaxed text-amber-900/80">
                  Đề xuất đổi ca thông minh dựa trên độ rảnh và vị trí địa lý là tính năng thử nghiệm phía giao diện, chưa được lưu trữ hoặc xác thực bởi schema Supabase.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('06-create-choose-shift')}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  ← Quay lại
                </button>
                <button
                  type="button"
                  data-qa-trigger="08-create-review"
                  onClick={() => setQaState('08-create-review')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Tiếp tục: Xem lại & Gửi →
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 08: CREATE SWAP STEP 3 - REVIEW & SUBMIT */}
        {qaState === '08-create-review' && (
          <ModalWrapper
            title="Tạo yêu cầu đổi ca — Bước 3: Xem lại thông tin & Gửi đề xuất"
            subtitle="Kiểm tra tính hợp lệ về vai trò, ca trực và ghi rõ lý do đổi ca"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Ca làm việc gốc:</span>
                    <strong className="block text-slate-900 text-xs">Pharmaton - TikTok Live Mega Day</strong>
                    <span className="text-[11px] text-slate-500">12/09/2026 · 14:00–17:00 · Studio 1</span>
                  </div>
                  <span className="rounded bg-rose-50 border border-rose-200 text-rose-700 font-bold px-2 py-0.5 text-[10px] uppercase">
                    Host (REG-101)
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Người nhận thay thế:</span>
                    <strong className="block text-slate-900 text-xs">Bùi Việt Anh</strong>
                    <span className="text-[10px] text-emerald-700 font-medium">Host được chứng nhận · Không có xung đột lịch</span>
                  </div>
                  <span className="rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold px-2 py-0.5 text-[10px]">
                    Phương thức: Thế ca
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1">
                  Lý do đổi ca (Bắt buộc):
                </label>
                <textarea
                  readOnly
                  rows={2}
                  value="Trùng lịch thi học kỳ tại trường, cần người thế ca"
                  className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-700 bg-white"
                />
              </div>

              <div className="rounded border border-blue-200 bg-blue-50/50 p-2 text-[11px] text-blue-800">
                <strong>Quy trình xử lý:</strong> Sau khi gửi, đơn sẽ ở trạng thái <em>Chờ phản hồi</em> để Bùi Việt Anh chấp nhận trước khi chuyển tới Leader phê duyệt cuối cùng.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('07-create-choose-replacement')}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  ← Sửa thông tin
                </button>
                <button
                  type="button"
                  data-qa-trigger="33-success-feedback"
                  onClick={() => setQaState('33-success-feedback')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 shadow-xs"
                >
                  Gửi yêu cầu đổi ca
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 09: ELIGIBLE REPLACEMENT INSPECTION */}
        {qaState === '09-eligible-replacement' && (
          <ModalWrapper
            title="Thẩm định ứng viên thay thế — Đủ điều kiện hợp lệ (Eligible)"
            subtitle="Kiểm tra hợp lệ vai trò, tính sẵn sàng và xung đột lịch theo tiêu chuẩn vận hành"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-200 text-xs font-bold text-emerald-800">
                      VA
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Bùi Việt Anh</h4>
                      <p className="text-[11px] text-slate-500 font-mono">ID: usr-03 · buivietanh@ops.livestream</p>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-600 text-white font-bold px-2 py-0.5 text-[10px]">
                    HỢP LỆ ĐỔI CA
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Tài khoản: Hoạt động (active)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Vai trò: Chuẩn Host được cấp phép</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Lịch trình: 0 ca trùng (No overlap)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Giới hạn ca tuần: Còn 2 ca khả dụng</span>
                  </div>
                </div>
              </div>

              {/* UNBACKED SUITABILITY SCORE DISCLOSURE */}
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1 text-[10px] uppercase text-amber-900">
                    <Sparkles className="h-3 w-3 text-amber-600" />
                    [CHƯA HỖ TRỢ BỞI DATABASE / EXPERIMENTAL UNBACKED]
                  </span>
                  <span className="font-bold text-amber-900">Độ phù hợp: 94%</span>
                </div>
                <p className="text-[10px] leading-relaxed text-amber-900/80">
                  Điểm tương thích thay thế được tính toán mô phỏng từ lịch sử ca và độ khả dụng, không lưu trong schema cơ sở dữ liệu.
                </p>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Xác nhận ứng viên
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 10: INELIGIBLE REPLACEMENT */}
        {qaState === '10-ineligible-replacement' && (
          <ModalWrapper
            title="Thẩm định ứng viên — Không đủ điều kiện vai trò (Ineligible Role)"
            subtitle="Cảnh báo chặn: Ứng viên không sở hữu vai trò vận hành khớp với ca làm việc"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-200 text-xs font-bold text-rose-800">
                      MA
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Nguyễn Thị Mai Anh</h4>
                      <p className="text-[11px] text-slate-500 font-mono">ID: usr-08 · maianh@ops.livestream</p>
                    </div>
                  </div>
                  <span className="rounded bg-rose-600 text-white font-bold px-2 py-0.5 text-[10px]">
                    KHÔNG ĐỦ ĐIỀU KIỆN
                  </span>
                </div>

                <div className="mt-3 rounded border border-rose-200 bg-white p-3 text-[11px] text-rose-800 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-rose-900">Lỗi vai trò vận hành (Operational Role Mismatch):</strong>
                      <p className="text-slate-600">
                        Ca trực yêu cầu vai trò <strong>Host</strong>, nhưng Nguyễn Thị Mai Anh chỉ được phân quyền vai trò <strong>Support</strong>. Hệ thống không cho phép thế chéo sai vai trò chuyên môn.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('07-create-choose-replacement')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Chọn ứng viên khác
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 11: OVERLAP CONFLICT */}
        {qaState === '11-overlap-conflict' && (
          <ModalWrapper
            title="Thẩm định ứng viên — Xung đột lịch trình (Schedule Overlap Collision)"
            subtitle="Cảnh báo chặn: Ứng viên đã được phân bổ vào một ca trực khác trùng thời gian"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800">
                      TN
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">Hoàng Trọng Nghĩa</h4>
                      <p className="text-[11px] text-slate-500 font-mono">ID: usr-06 · nghĩa@ops.livestream</p>
                    </div>
                  </div>
                  <span className="rounded bg-amber-600 text-white font-bold px-2 py-0.5 text-[10px]">
                    XUNG ĐỘT TRÙNG LỊCH
                  </span>
                </div>

                <div className="mt-3 rounded border border-amber-200 bg-white p-3 text-[11px] text-amber-900 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-amber-950">Trùng ca trực đang diễn ra:</strong>
                      <p className="text-slate-600">
                        Nhân sự đã có ca <em>Shopee Live Mega Super Sale</em> từ <strong>13:30 – 16:30</strong> cùng ngày 12/09/2026. Thời gian trùng lặp 2.5 giờ vi phạm quy tắc phân bổ đơn độc quyền.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('07-create-choose-replacement')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Chọn người khác
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 12: DUPLICATE ACTIVE REQUEST */}
        {qaState === '12-duplicate-request' && (
          <ModalWrapper
            title="Cảnh báo chặn: Đã tồn tại yêu cầu đổi ca đang hoạt động"
            subtitle="Quy tắc nghiệp vụ: Mỗi ca làm việc chỉ được phép có tối đa một yêu cầu đổi ca đang xử lý"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <Ban className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-950 text-sm">Yêu cầu SWP-101 đang chờ xử lý</h4>
                    <p className="text-rose-800 text-[11px] mt-1 leading-relaxed">
                      Ca trực <strong>Pharmaton - TikTok Live Mega Day (REG-101)</strong> hiện đã có yêu cầu đổi ca gửi tới <strong>Bùi Việt Anh</strong> đang ở trạng thái <em>Chờ phản hồi</em>. Bạn không thể tạo thêm yêu cầu đổi ca trùng lặp cho cùng một lượt phân bổ.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800 block mb-1">Gợi ý xử lý:</span>
                <ul className="list-disc pl-4 space-y-1 text-slate-500">
                  <li>Chờ người nhận hiện tại phản hồi chấp nhận hoặc từ chối.</li>
                  <li>Hoặc huỷ yêu cầu SWP-101 hiện tại trước khi tạo đề xuất mới.</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId('SWP-101')
                    setQaState('03-swap-detail')
                  }}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Xem đơn SWP-101 hiện tại
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 13: AWAITING PARTICIPANT RESPONSE */}
        {qaState === '13-awaiting-participant' && (
          <ModalWrapper
            title="Trạng thái quy trình: Đang chờ người nhận phản hồi (Awaiting Participant)"
            subtitle="Đơn đổi ca đã được ghi nhận vào hệ thống và đang chờ sự xác nhận từ đồng đội được chỉ định"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-mono text-[10px] text-amber-800 font-bold uppercase">Mã đơn: SWP-101</span>
                  <h4 className="font-bold text-slate-900 text-sm mt-0.5">Pharmaton - TikTok Live Mega Day</h4>
                  <p className="text-[11px] text-slate-600">Người đề xuất: Nguyễn Văn Bình → Người nhận: Bùi Việt Anh</p>
                </div>
                <span className="rounded bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[10px]">
                  CHỜ PHẢN HỒI
                </span>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-600 space-y-1">
                <strong className="block text-slate-800">Lưu ý quản trị:</strong>
                <p>
                  Ở giai đoạn này, Leader chưa thể thực hiện hành động phê duyệt cho đến khi Bùi Việt Anh bấm <em>Chấp nhận</em>. Nếu người nhận từ chối, đơn sẽ kết thúc với trạng thái từ chối.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  data-qa-trigger="14-participant-accept"
                  onClick={() => setQaState('14-participant-accept')}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-700"
                >
                  Mô phỏng: Người nhận đồng ý →
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 14: PARTICIPANT ACCEPT CONFIRMATION */}
        {qaState === '14-participant-accept' && (
          <ModalWrapper
            title="Xác nhận chấp nhận nhận ca thay thế (Participant Accept)"
            subtitle="Phản hồi từ người được đề xuất nhận ca trực thay đồng đội"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
                  <span className="font-bold text-slate-900 text-sm">Pharmaton - TikTok Live Mega Day</span>
                  <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">
                    Vai trò: Host
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>12/09/2026 · 14:00–17:00 (Studio 1)</span>
                  <span>Người đề xuất: <strong>Nguyễn Văn Bình</strong></span>
                </div>
              </div>

              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900 space-y-1">
                <strong className="block text-blue-950 font-bold">Lưu ý quan trọng:</strong>
                <p>
                  Việc bạn bấm <em>Đồng ý nhận ca</em> sẽ chuyển trạng thái đơn sang <strong>Chờ Leader phê duyệt (Accepted)</strong>. Lịch trực chính thức <strong>chưa thay đổi</strong> cho đến khi Leader/Admin bấm phê duyệt cuối cùng.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  data-qa-trigger="16-waiting-leader-approval"
                  onClick={() => setQaState('16-waiting-leader-approval')}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-700 shadow-xs"
                >
                  Đồng ý nhận ca thay thế
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 15: PARTICIPANT DECLINE */}
        {qaState === '15-participant-decline' && (
          <ModalWrapper
            title="Từ chối yêu cầu thế ca (Participant Decline)"
            subtitle="Thông báo cho người yêu cầu biết bạn không thể nhận ca trực này"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <p className="text-slate-600">
                Bạn đang từ chối nhận ca <strong>Pharmaton - TikTok Live Mega Day</strong> từ Nguyễn Văn Bình. Đơn đổi ca sẽ kết thúc với trạng thái từ chối.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Lý do từ chối (Không bắt buộc):
                </label>
                <textarea
                  rows={2}
                  placeholder="Ví dụ: Bận lịch gia đình, không thể sắp xếp thêm ca..."
                  className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  data-qa-trigger="25-declined-terminal"
                  onClick={() => setQaState('25-declined-terminal')}
                  className="rounded-md bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700"
                >
                  Xác nhận từ chối
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 16: WAITING LEADER APPROVAL */}
        {qaState === '16-waiting-leader-approval' && (
          <ModalWrapper
            title="Trạng thái quy trình: Đang chờ Leader phê duyệt (Waiting Leader Approval)"
            subtitle="Người nhận đã đồng ý nhận ca, hệ thống đang chờ quyết định duyệt phân bổ của Leader/Admin"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-[10px] text-blue-700 font-bold uppercase">MÃ ĐƠN: SWP-101</span>
                    <h4 className="font-bold text-slate-900 text-sm mt-0.5">Pharmaton - TikTok Live Mega Day</h4>
                    <p className="text-[11px] text-slate-600">12/09/2026 · 14:00–17:00 (Studio 1)</p>
                  </div>
                  <span className="rounded bg-blue-100 text-blue-800 font-bold px-2 py-0.5 text-[10px]">
                    CHỜ LEADER DUYỆT
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-blue-200/60 flex items-center gap-2 text-[11px] text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Bùi Việt Anh đã bấm chấp nhận lúc 10:15 08/09/2026 (responded_at: 2026-09-08T10:15:00Z)</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  data-qa-trigger="17-leader-decision-panel"
                  onClick={() => setQaState('17-leader-decision-panel')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Mở bảng xét duyệt Leader →
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 17: LEADER DECISION PANEL */}
        {qaState === '17-leader-decision-panel' && (
          <ModalWrapper
            title="Bảng xét duyệt đổi ca của Leader (Leader Decision Panel)"
            subtitle="So sánh trực tiếp phân bổ hiện tại và nhân sự thay thế trước khi ra quyết định cập nhật lịch"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {/* CURRENT ASSIGNMENT */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Phân bổ hiện tại (Current)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      VB
                    </span>
                    <div>
                      <strong className="block text-slate-900 text-xs">Nguyễn Văn Bình</strong>
                      <span className="text-[10px] text-slate-500 font-mono">REG-101 · Host</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 space-y-0.5">
                    <div>Ca: Pharmaton Live Mega</div>
                    <div>Giờ: 14:00–17:00 (Studio 1)</div>
                    <div>Lý do: Trùng lịch thi trường</div>
                  </div>
                </div>

                {/* PROPOSED REPLACEMENT */}
                <div className="rounded-lg border-2 border-blue-500 bg-blue-50/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                      Đề xuất thay thế (Proposed)
                    </span>
                    <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5">
                      Đã đồng ý
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-200 text-xs font-bold text-blue-800">
                      VA
                    </span>
                    <div>
                      <strong className="block text-slate-900 text-xs">Bùi Việt Anh</strong>
                      <span className="text-[10px] text-blue-700 font-mono">Đủ chuẩn Host</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-blue-200 text-[11px] text-emerald-800 space-y-0.5">
                    <div>✓ Vai trò Host hợp lệ</div>
                    <div>✓ 0 xung đột lịch trực</div>
                    <div>✓ Đã bấm nhận ca lúc 14:32</div>
                  </div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                <strong>Hệ quả vận hành:</strong> Khi phê duyệt, hệ thống sẽ tự động cập nhật bản ghi <code>ShiftRegistration</code>: huỷ phân bổ của Nguyễn Văn Bình và tạo phân bổ mới cho Bùi Việt Anh với nguồn <code>manual_assignment</code>.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  data-qa-trigger="19-leader-reject"
                  onClick={() => setQaState('19-leader-reject')}
                  className="rounded-md border border-rose-200 bg-rose-50 px-3.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Từ chối đổi ca
                </button>
                <button
                  type="button"
                  data-qa-trigger="18-leader-approve"
                  onClick={() => setQaState('18-leader-approve')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 shadow-xs"
                >
                  Phê duyệt đổi ca
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 18: LEADER APPROVE CONFIRMATION */}
        {qaState === '18-leader-approve' && (
          <ModalWrapper
            title="Xác nhận phê duyệt đổi ca (Leader Approve)"
            subtitle="Hành động này sẽ thực hiện cập nhật phân bổ nhân sự chính thức trên cơ sở dữ liệu"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <p className="text-slate-600">
                Bạn đang phê duyệt chuyển giao ca trực <strong>Pharmaton - TikTok Live Mega Day</strong> từ Nguyễn Văn Bình sang Bùi Việt Anh.
              </p>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 text-[11px] text-slate-700">
                <span className="font-semibold text-slate-900 block mb-1">Cơ chế cập nhật nguyên tử (Atomic Mutation):</span>
                <div>1. ShiftRegistration REG-101 → Chuyển trạng thái sang <strong>cancelled</strong>.</div>
                <div>2. ShiftRegistration mới (<strong>REG-901</strong>) → Tạo cho Bùi Việt Anh với trạng thái <strong>approved</strong> (nguồn: <code>manual_assignment</code>).</div>
                <div>3. SwapRequest SWP-101 → Chuyển trạng thái sang <strong>completed</strong>.</div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú của người duyệt (Tuỳ chọn):</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Đã duyệt phân bổ thay thế..."
                  defaultValue="Phê duyệt phân bổ Host thay thế hợp lệ"
                  className="w-full rounded-md border border-slate-200 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('17-leader-decision-panel')}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  data-qa-trigger="20-mutation-completed"
                  onClick={() => setQaState('20-mutation-completed')}
                  className="rounded-md bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-700 shadow-xs"
                >
                  Xác nhận phê duyệt & Cập nhật nhân sự
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 19: LEADER REJECT */}
        {qaState === '19-leader-reject' && (
          <ModalWrapper
            title="Từ chối yêu cầu đổi ca (Leader Rejection)"
            subtitle="Yêu cầu cung cấp lý do từ chối để thông báo minh bạch cho người yêu cầu"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <p className="text-slate-600">
                Bạn đang từ chối yêu cầu đổi ca SWP-101. Đơn sẽ chuyển sang trạng thái <strong>Đã từ chối (Rejected)</strong> và lịch ca trực của Nguyễn Văn Bình vẫn giữ nguyên.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Lý do từ chối (Bắt buộc):
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi rõ lý do không thể duyệt đổi ca..."
                  defaultValue="Không đủ nhân sự dự phòng Host cho khung giờ cao điểm này"
                  className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('17-leader-decision-panel')}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  data-qa-trigger="24-rejected-terminal"
                  onClick={() => setQaState('24-rejected-terminal')}
                  className="rounded-md bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700"
                >
                  Xác nhận từ chối đơn
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 20: FINAL MUTATION COMPLETED */}
        {qaState === '20-mutation-completed' && (
          <ModalWrapper
            title="Đổi ca hoàn tất thành công (Swap Completed)"
            subtitle="Cập nhật nhân sự vận hành đã được xác nhận và ghi nhận vào sổ đăng ký ca ShiftRegistration"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-4 text-xs">
              <div className="text-center py-2">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h3 className="mt-2 text-base font-bold text-slate-900">Đổi ca thành công & Lịch trực đã cập nhật</h3>
                <p className="mt-0.5 text-slate-500 text-xs">Mã đơn SWP-101 đã hoàn tất (Completed)</p>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2 text-[11px] text-slate-700">
                <strong className="block text-emerald-950 font-bold">Xác nhận cập nhật ShiftRegistration:</strong>
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
                  <span>Ca trực: <strong>Pharmaton - TikTok Live Mega Day</strong></span>
                  <span className="font-mono text-slate-500">12/09/2026 14:00–17:00</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div className="rounded border border-slate-200 bg-white p-2">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Đăng ký cũ (Huỷ):</span>
                    <strong className="block text-slate-800 mt-0.5">Nguyễn Văn Bình</strong>
                    <span className="text-[10px] text-rose-700 font-mono">REG-101 · cancelled</span>
                  </div>
                  <div className="rounded border border-emerald-300 bg-white p-2">
                    <span className="text-[10px] text-emerald-700 uppercase font-bold">Đăng ký mới (Duyệt):</span>
                    <strong className="block text-slate-900 mt-0.5">Bùi Việt Anh</strong>
                    <span className="text-[10px] text-emerald-700 font-mono">REG-901 → approved (manual)</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Quay về danh sách đổi ca
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 21: FINAL MUTATION FAILED / FALSE SUCCESS PROTECTION */}
        {qaState === '21-mutation-failed' && (
          <ModalWrapper
            title="Lỗi cập nhật nhân sự — Bảo vệ chống báo thành công giả (False-Success Protection)"
            subtitle="Leader đã chấp nhận duyệt nhưng giao dịch cập nhật ShiftRegistration thất bại"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-950 text-sm">Không thể hoàn tất đổi ca</h4>
                    <p className="text-rose-800 text-[11px] mt-1 leading-relaxed">
                      Thay đổi nhân sự vận hành <strong>chưa được xác nhận</strong>. Giao dịch cập nhật ShiftRegistration thất bại với lỗi:
                    </p>
                    <code className="mt-1.5 block rounded bg-rose-100 p-2 font-mono text-[10px] text-rose-900 border border-rose-200">
                      ERR_STAFFING_MUTATION_FAILED: Ca làm việc đã bị khoá lịch vận hành (Shift locked by live coordinator).
                    </code>
                  </div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                <strong>Nguyên tắc bảo vệ:</strong> Giao diện không đánh dấu <em>Đã hoàn tất</em> khi chưa có cam kết ghi nhận thực tế từ cơ sở dữ liệu. Trạng thái đơn tự động rollback về <em>Chờ duyệt</em> (rollback state: <code>accepted</code> trong transaction nguyên tử) để bảo vệ tính toàn vẹn phân bổ.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('17-leader-decision-panel')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
                >
                  Thử lại thao tác duyệt
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 22: REQUESTER CANCEL CONFIRMATION */}
        {qaState === '22-requester-cancel' && (
          <ModalWrapper
            title="Huỷ yêu cầu đổi ca (Cancel Own Request)"
            subtitle="Người yêu cầu có quyền huỷ đơn khi đơn chưa được Leader phê duyệt"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <p className="text-slate-600">
                Bạn có chắc chắn muốn huỷ yêu cầu đổi ca <strong>SWP-101</strong> không? Sau khi huỷ, yêu cầu sẽ đóng lại và không còn hiệu lực.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Lý do huỷ (Bắt buộc):
                </label>
                <textarea
                  rows={2}
                  defaultValue="Kế hoạch cá nhân thay đổi, đã tự sắp xếp trực được ca này"
                  className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Không, quay lại
                </button>
                <button
                  type="button"
                  data-qa-trigger="23-cancelled-terminal"
                  onClick={() => setQaState('23-cancelled-terminal')}
                  className="rounded-md bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700"
                >
                  Xác nhận huỷ đơn
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 23: CANCELLED TERMINAL VIEW */}
        {qaState === '23-cancelled-terminal' && (
          <ModalWrapper
            title="Bản ghi yêu cầu đã huỷ (Cancelled Terminal State)"
            subtitle="Đơn đổi ca đã kết thúc, không thể thực hiện thêm thao tác đột biến nào"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-500 font-bold uppercase">MÃ ĐƠN: SWP-105</span>
                  <span className="rounded bg-slate-200 text-slate-700 font-bold px-2 py-0.5 text-[10px]">
                    ĐÃ HUỶ (CANCELLED)
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 text-sm">Shiseido Beauty Live Festival</h4>
                <div className="text-[11px] text-slate-500 space-y-0.5 pt-1 border-t border-slate-200">
                  <div>Người huỷ: <strong>Nguyễn Văn Bình (Requester)</strong></div>
                  <div>Thời gian huỷ: 2026-09-04 10:10:00</div>
                  <div>Lý do: Kế hoạch cá nhân thay đổi, đã tự sắp xếp trực được ca này</div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-2.5 text-[11px] text-slate-500">
                Bản ghi được lưu trữ bảo toàn lịch sử kiểm toán trong <code>swap_requests</code> với <code>status = 'cancelled'</code> (không xóa mềm / không soft delete), bảo toàn toàn bộ <code>approval_history</code>, người yêu cầu hủy và thời điểm hủy <code>updated_at</code>.
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 24: REJECTED TERMINAL VIEW */}
        {qaState === '24-rejected-terminal' && (
          <ModalWrapper
            title="Bản ghi yêu cầu bị từ chối (Rejected Terminal State)"
            subtitle="Leader/Admin đã từ chối phê duyệt yêu cầu đổi ca này"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-rose-700 font-bold uppercase">MÃ ĐƠN: SWP-104</span>
                  <span className="rounded bg-rose-100 text-rose-800 font-bold px-2 py-0.5 text-[10px]">
                    ĐÃ TỪ CHỐI (REJECTED)
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Lock&Lock Gia Dụng Thông Minh</h4>
                <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-rose-200/60">
                  <div>Người từ chối: <strong>Trần Thị Mai Anh (Leader/Admin)</strong></div>
                  <div>Thời gian: 2026-09-10 11:20:00</div>
                  <div>Lý do từ chối: Không phê duyệt: Người thay thế chưa hoàn thành chứng chỉ vận hành Lock&Lock</div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 25: DECLINED TERMINAL VIEW */}
        {qaState === '25-declined-terminal' && (
          <ModalWrapper
            title="Bản ghi người nhận từ chối (Participant Declined Outcome)"
            subtitle="Ứng viên thay thế đã phản hồi từ chối nhận ca"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-amber-800 font-bold uppercase">MÃ ĐƠN: SWP-101</span>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-rose-100 text-rose-800 font-bold px-2 py-0.5 text-[10px]">
                      DB: status = 'rejected'
                    </span>
                    <span className="rounded bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[10px]">
                      Người nhận từ chối (Participant Declined)
                    </span>
                  </div>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Pharmaton - TikTok Live Mega Day</h4>
                <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-amber-200/60">
                  <div>Người phản hồi: <strong>Bùi Việt Anh (Participant)</strong></div>
                  <div>Phản hồi: Từ chối nhận ca thay thế</div>
                  <div>Lý do: Bận lịch học đột xuất, không thể nhận thêm ca</div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 26: COMPLETED TERMINAL VIEW */}
        {qaState === '26-completed-terminal' && (
          <ModalWrapper
            title="Bản ghi yêu cầu đã hoàn tất (Completed Terminal Record)"
            subtitle="Đơn đổi ca đã hoàn tất trọn vẹn mọi bước và cập nhật nhân sự trên sổ cái"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-emerald-800 font-bold uppercase">MÃ ĐƠN: SWP-103</span>
                  <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">
                    HOÀN TẤT (COMPLETED)
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Sunhouse Flash Sale Mega</h4>
                <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-emerald-200/60">
                  <div>Hoàn tất lúc: 2026-09-09 17:11:00</div>
                  <div>Người duyệt: <strong>Trần Thị Mai Anh (Leader)</strong></div>
                  <div>Nhân sự trực chính thức: <strong>Hoàng Trọng Nghĩa (Technical)</strong></div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600">
                Phân bổ vận hành được truy xuất trực tiếp từ <code>ShiftRegistration</code> nguồn <code>manual_assignment</code>.
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 27: STALE UNDERLYING ASSIGNMENT */}
        {qaState === '27-stale-underlying-assignment' && (
          <ModalWrapper
            title="Cảnh báo: Yêu cầu đổi ca không còn hiệu lực (Stale Assignment)"
            subtitle="Phân bổ ca trực gốc đã bị thay đổi hoặc huỷ bỏ trước khi đơn đổi ca được duyệt"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-950 text-sm">Phân bổ gốc đã thay đổi ngoài hệ thống</h4>
                    <p className="text-amber-900 text-[11px] mt-1 leading-relaxed">
                      Bản ghi đăng ký ca <code>REG-101</code> hiện không còn ở trạng thái <em>approved/manually_assigned</em> (hoặc ca trực đã bị huỷ bởi quản trị viên). Thao tác phê duyệt đổi ca bị chặn để bảo vệ tính toàn vẹn dữ liệu.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                Nút phê duyệt đã bị vô hiệu hoá. Vui lòng làm mới danh sách để đồng bộ trạng thái mới nhất từ cơ sở dữ liệu.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Làm mới dữ liệu ca trực
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 28: CONCURRENCY CAS CONFLICT */}
        {qaState === '28-concurrency-cas' && (
          <ModalWrapper
            title="Xung đột phiên bản cập nhật (Optimistic Concurrency Conflict)"
            subtitle="Kiểm soát xung đột phiên bản qua version / expected_version ngăn chặn ghi đè dữ liệu mất mát"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3.5 text-xs">
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <Layers className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-rose-950 text-sm">Phiên bản bản ghi không khớp (STALE_WRITE)</h4>
                    <p className="text-rose-800 text-[11px] mt-1 leading-relaxed">
                      Yêu cầu đổi ca SWP-101 đã được cập nhật bởi một người dùng khác hoặc một luồng xử lý song song kể từ lần cuối bạn tải dữ liệu:
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="rounded bg-white p-1.5 border border-rose-200 text-rose-800">
                        Phiên bản bạn đang gửi: <strong>expected_version = 1</strong>
                      </div>
                      <div className="rounded bg-white p-1.5 border border-rose-200 text-slate-800">
                        Phiên bản hiện tại trên server: <strong>current_version = 2</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-slate-600 text-[11px]">
                Hành động của bạn đã bị từ chối để tránh ghi đè dữ liệu mới hơn. Vui lòng tải lại dữ liệu mới nhất.
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md border border-slate-200 px-3.5 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
                  className="rounded-md bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Tải lại phiên bản mới nhất (v2)
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {/* MODAL 30: HISTORY & AUDIT TIMELINE */}
        {qaState === '30-history-timeline' && (
          <ModalWrapper
            title="Lịch sử kiểm toán quy trình đổi ca (Swap Audit Timeline)"
            subtitle="Ghi nhận toàn vẹn chuỗi sự kiện, thời điểm, người thực hiện và thay đổi trạng thái"
            onClose={() => setQaState('01-swaps-main')}
          >
            <div className="space-y-3 text-xs">
              <div className="rounded bg-slate-50 p-2.5 border border-slate-200 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 block">SWP-103 · Sunhouse Flash Sale Mega</strong>
                  <span className="text-[10px] text-slate-500">Lê Tuấn Minh → Hoàng Trọng Nghĩa (Technical)</span>
                </div>
                <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[10px]">
                  COMPLETED
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {CANONICAL_SWAPS[2].approval_history.map((event, index) => (
                  <div key={index} className="rounded border border-slate-200 bg-white p-2.5 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{event.actor_name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{event.at}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="font-bold uppercase text-blue-700">{event.action}</span>
                      {event.from_status && (
                        <span className="text-slate-400">({event.from_status} → {event.to_status})</span>
                      )}
                    </div>
                    {event.notes && <p className="text-[10px] text-slate-600">{event.notes}</p>}
                    {event.reason && <p className="text-[10px] text-slate-600">Lý do: {event.reason}</p>}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQaState('01-swaps-main')}
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
              <span className="font-mono text-emerald-400 font-bold">QA WAVE 09:</span>
              <span className="font-mono text-slate-300 font-semibold">{qaState}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQaOpen(!qaOpen)}
                className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
              >
                {qaOpen ? 'Ẩn bộ điều khiển QA' : 'Mở 34 QA States'}
              </button>
            </div>
          </div>

          {qaOpen && (
            <div className="mx-auto mt-2 max-w-7xl border-t border-slate-800/80 pt-2">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-1 max-h-44 overflow-y-auto pr-1">
                {[
                  { id: '01-swaps-main', label: '01 Main Queue' },
                  { id: '02-active-filters', label: '02 Active Filters' },
                  { id: '03-swap-detail', label: '03 27 DB Fields' },
                  { id: '04-requested-by-me', label: '04 My Requests' },
                  { id: '05-requests-for-me', label: '05 Requests for Me' },
                  { id: '06-create-choose-shift', label: '06 Create Choose Shift' },
                  { id: '07-create-choose-replacement', label: '07 Create Replacement' },
                  { id: '08-create-review', label: '08 Create Review' },
                  { id: '09-eligible-replacement', label: '09 Eligible Cand' },
                  { id: '10-ineligible-replacement', label: '10 Ineligible Cand' },
                  { id: '11-overlap-conflict', label: '11 Overlap Conflict' },
                  { id: '12-duplicate-request', label: '12 Duplicate Active' },
                  { id: '13-awaiting-participant', label: '13 Await Participant' },
                  { id: '14-participant-accept', label: '14 Participant Accept' },
                  { id: '15-participant-decline', label: '15 Participant Decline' },
                  { id: '16-waiting-leader-approval', label: '16 Await Leader' },
                  { id: '17-leader-decision-panel', label: '17 Leader Decision' },
                  { id: '18-leader-approve', label: '18 Leader Approve' },
                  { id: '19-leader-reject', label: '19 Leader Reject' },
                  { id: '20-mutation-completed', label: '20 Mutation Success' },
                  { id: '21-mutation-failed', label: '21 Mutation Failed' },
                  { id: '22-requester-cancel', label: '22 Cancel Dialog' },
                  { id: '23-cancelled-terminal', label: '23 Cancelled Record' },
                  { id: '24-rejected-terminal', label: '24 Rejected Record' },
                  { id: '25-declined-terminal', label: '25 Declined Record' },
                  { id: '26-completed-terminal', label: '26 Completed Record' },
                  { id: '27-stale-underlying-assignment', label: '27 Stale Assign' },
                  { id: '28-concurrency-cas', label: '28 Concurrency CAS' },
                  { id: '29-permission-read-only', label: '29 Read-Only Perm' },
                  { id: '30-history-timeline', label: '30 History Audit' },
                  { id: '31-empty', label: '31 Empty State' },
                  { id: '32-no-results', label: '32 No Results' },
                  { id: '33-success-feedback', label: '33 Toast Success' },
                  { id: '34-error-feedback', label: '34 Toast Error' }
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    data-qa-trigger={st.id}
                    onClick={() => setQaState(st.id as SwapQaStateId)}
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
    </OpsWorkflowReferenceShell>
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
