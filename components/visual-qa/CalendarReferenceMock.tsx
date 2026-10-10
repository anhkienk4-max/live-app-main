'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Calendar as CalendarIcon, Clock, Users, MapPin, MonitorPlay, Search, Bell,
  ChevronLeft, ChevronRight, Plus, CheckCircle2, AlertTriangle, AlertCircle,
  FileSpreadsheet, FileText, UploadCloud, History, UserCheck, ShieldAlert, Sparkles,
  Download, Trash2, X, Filter, LayoutGrid, Briefcase, ArrowLeftRight, CheckSquare,
  BarChart2, ShieldCheck, MoreHorizontal, Layers, Check, Copy, ExternalLink, HelpCircle
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// =============================================================================
// TYPES & QA STATES
// =============================================================================

export type CalendarQaStateId =
  | '01-calendar-month-main'
  | '02-week'
  | '03-day'
  | '04-list'
  | '05-more-filters'
  | '06-multiple-active-filters'
  | '07-selection-bulk-toolbar'
  | '08-bulk-approval'
  | '09-bulk-delete-impact'
  | '10-bulk-export'
  | '11-open-shifts'
  | '12-my-shifts'
  | '13-import-schedule'
  | '14-import-history'
  | '15-shift-detail'
  | '16-empty-no-results'
  | '17-permission-restricted'

export type CalendarWorkspaceId =
  | 'calendar'
  | 'open-shifts'
  | 'my-shifts'
  | 'import-schedule'
  | 'import-history'

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list'

export interface ShiftItem {
  id: string
  title: string
  brand: string
  platform: string
  campaign: string
  date: string // YYYY-MM-DD
  dayOfWeek: string
  dayIndex: number // 0 = Mon, 6 = Sun
  startTime: string
  endTime: string
  durationHours: number
  studio: string
  status: 'Scheduled' | 'Live' | 'Completed' | 'Draft' | 'In Review'
  host: string
  support: string
  technical: string
  hostApproved: boolean
  supportApproved: boolean
  technicalApproved: boolean
  requiredHost: number
  requiredSupport: number
  requiredTechnical: number
  currentHost: number
  currentSupport: number
  currentTechnical: number
  registrationState: 'Open' | 'Cutoff' | 'Locked'
  hasImportedStaffing: boolean
  importBatchId: string
  color: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'indigo'
  avatars: string[]
  notes: string
  attachments: { name: string; size: string }[]
}

export interface ImportBatchItem {
  batchId: string
  fileName: string
  uploadedBy: string
  timestamp: string
  totalRows: number
  validRows: number
  warningRows: number
  errorRows: number
  status: 'Completed' | 'Warning' | 'Failed'
}

// =============================================================================
// CANONICAL CALENDAR FIXTURE DATA (OCTOBER 2026 FOCUS)
// =============================================================================

export const CANONICAL_SHIFTS: ShiftItem[] = [
  {
    id: 'SH-2026-1001-001',
    title: 'Pharmaton - TikTok Shop Sáng',
    brand: 'Pharmaton',
    platform: 'TikTok Shop',
    campaign: 'Mega Live Đầu Tháng 10',
    date: '2026-10-01',
    dayOfWeek: 'Thứ Năm',
    dayIndex: 3,
    startTime: '09:00',
    endTime: '13:00',
    durationHours: 4,
    studio: 'Studio A - Tầng 2',
    status: 'Completed',
    host: 'Lan Anh',
    support: 'Kiên',
    technical: 'Minh Khang',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Locked',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'blue',
    avatars: ['LA', 'NK', 'MK'],
    notes: 'Ca phát mở đầu chiến dịch tháng 10. Đạt doanh thu 35.100.000₫.',
    attachments: [
      { name: 'Kich_ban_Pharmaton_1001.pdf', size: '1.2 MB' },
      { name: 'Shotlist_Pharmaton.xlsx', size: '340 KB' }
    ]
  },
  {
    id: 'SH-2026-1002-002',
    title: 'TechGear Pro - TikTok Shop',
    brand: 'TechGear Pro',
    platform: 'TikTok Shop',
    campaign: 'Siêu Sale Đồ Công Nghệ',
    date: '2026-10-02',
    dayOfWeek: 'Thứ Sáu',
    dayIndex: 4,
    startTime: '09:00',
    endTime: '13:00',
    durationHours: 4,
    studio: 'Studio B - Tầng 3',
    status: 'Completed',
    host: 'Minh Tuấn',
    support: 'Hữu Lộc',
    technical: 'Hoàng',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Locked',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'indigo',
    avatars: ['MT', 'HL', 'VH'],
    notes: 'Sản phẩm chủ lực bàn phím cơ & tai nghe gaming.',
    attachments: [
      { name: 'TechGear_Brief_V2.pdf', size: '2.4 MB' }
    ]
  },
  {
    id: 'SH-2026-1002-003',
    title: 'Anker - Shopee Live Chiều',
    brand: 'Anker',
    platform: 'Shopee Live',
    campaign: 'Anker Brand Day',
    date: '2026-10-02',
    dayOfWeek: 'Thứ Sáu',
    dayIndex: 4,
    startTime: '14:00',
    endTime: '18:00',
    durationHours: 4,
    studio: 'Studio C - Quận 7',
    status: 'Completed',
    host: 'Lan Anh',
    support: 'Kiên',
    technical: 'Quang Huy',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Locked',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'emerald',
    avatars: ['LA', 'NK', 'QH'],
    notes: 'Pin dự phòng & củ sạc GaN Anker Prime. 88 đơn hàng.',
    attachments: [
      { name: 'Anker_Deal_Sheet.xlsx', size: '510 KB' }
    ]
  },
  {
    id: 'SH-2026-1003-004',
    title: 'Fashion Nova - Shopee Live',
    brand: 'Fashion Nova',
    platform: 'Shopee Live',
    campaign: 'Thu Đông 2026 Fashion Fest',
    date: '2026-10-03',
    dayOfWeek: 'Thứ Bảy',
    dayIndex: 5,
    startTime: '14:00',
    endTime: '18:00',
    durationHours: 4,
    studio: 'Studio A - Tầng 2',
    status: 'Completed',
    host: 'Hoàng Yến',
    support: 'Phương Thảo',
    technical: 'Minh Khang',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Locked',
    hasImportedStaffing: false,
    importBatchId: 'MANUAL',
    color: 'purple',
    avatars: ['HY', 'PT', 'MK'],
    notes: 'Trình diễn bộ sưu tập Thu Đông mới. Doanh thu 58.900.000₫.',
    attachments: [
      { name: 'Fashion_Lookbook.pdf', size: '5.1 MB' }
    ]
  },
  {
    id: 'SH-2026-1004-005',
    title: 'Ostelin - TikTok Shop Live',
    brand: 'Ostelin',
    platform: 'TikTok Shop',
    campaign: 'Chiến Dịch 9.9 & Mega Live 10.10',
    date: '2026-10-04',
    dayOfWeek: 'Chủ Nhật',
    dayIndex: 6,
    startTime: '14:00',
    endTime: '17:00',
    durationHours: 3,
    studio: 'Studio C - Quận 7',
    status: 'Live',
    host: 'Min (Lan Anh)',
    support: 'Kiên',
    technical: 'Hoàng',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: false,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 0,
    registrationState: 'Open',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'blue',
    avatars: ['MK', 'NK'],
    notes: 'Livestream giới thiệu Ostelin Calcium + D3. Phiên live trọng điểm của ngày.',
    attachments: [
      { name: 'Brief_Ostelin_9.9.pdf', size: '1.4 MB' },
      { name: 'Shotlist_v1.xlsx', size: '420 KB' }
    ]
  },
  {
    id: 'SH-2026-1004-006',
    title: 'Beauty Flash Sale - Lazada Live',
    brand: 'Beauty Essentials',
    platform: 'Lazada Live',
    campaign: 'Flash Sale Cuối Tuần',
    date: '2026-10-04',
    dayOfWeek: 'Chủ Nhật',
    dayIndex: 6,
    startTime: '10:00',
    endTime: '14:00',
    durationHours: 4,
    studio: 'Studio B - Tầng 3',
    status: 'Scheduled',
    host: 'Sarah Johnson',
    support: 'Emily Davis',
    technical: 'Quang Huy',
    hostApproved: true,
    supportApproved: false,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 2,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Open',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'rose',
    avatars: ['SJ', 'ED'],
    notes: 'Ca mở: Đang cần thêm 1 Support trực sàn Lazada. Đã duyệt Sarah & Emily.',
    attachments: [
      { name: 'Beauty_Voucher_Guide.pdf', size: '890 KB' }
    ]
  },
  {
    id: 'SH-2026-1004-007',
    title: 'Ecovacs - Siêu Sale Robot Hút Bụi',
    brand: 'Ecovacs',
    platform: 'TikTok Shop',
    campaign: 'Ecovacs Super Brand Day',
    date: '2026-10-04',
    dayOfWeek: 'Chủ Nhật',
    dayIndex: 6,
    startTime: '19:00',
    endTime: '23:00',
    durationHours: 4,
    studio: 'Studio A - Tầng 2',
    status: 'Scheduled',
    host: 'Hoàng Yến',
    support: 'Phương Thảo',
    technical: 'Minh Khang',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Cutoff',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'indigo',
    avatars: ['HY', 'PT', 'MK'],
    notes: 'Phiên live cao điểm buổi tối. Robot hút bụi Deebot X2 Omni.',
    attachments: [
      { name: 'Ecovacs_Demo_Script.pdf', size: '3.1 MB' }
    ]
  },
  {
    id: 'SH-2026-1005-008',
    title: 'Home Living - Facebook Live',
    brand: 'Home Living',
    platform: 'Facebook Live',
    campaign: 'Nội Thất Tiện Ích',
    date: '2026-10-05',
    dayOfWeek: 'Thứ Hai',
    dayIndex: 0,
    startTime: '11:00',
    endTime: '15:00',
    durationHours: 4,
    studio: 'Online Broadcast',
    status: 'Scheduled',
    host: 'Chưa phân công',
    support: 'Tuấn Kiệt',
    technical: 'Hải My',
    hostApproved: false,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 0,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Open',
    hasImportedStaffing: false,
    importBatchId: 'MANUAL',
    color: 'amber',
    avatars: ['TK', 'HM'],
    notes: 'Ca mở: Đang khuyết Host chính. Đã mở đăng ký tự do.',
    attachments: []
  },
  {
    id: 'SH-2026-1006-009',
    title: 'Lactacyd - Chăm Sóc Sức Khỏe',
    brand: 'Lactacyd',
    platform: 'TikTok Shop',
    campaign: 'Sức Khỏe Phụ Nữ 2026',
    date: '2026-10-06',
    dayOfWeek: 'Thứ Ba',
    dayIndex: 1,
    startTime: '09:00',
    endTime: '12:00',
    durationHours: 3,
    studio: 'Studio B - Tầng 3',
    status: 'Scheduled',
    host: 'Lan Anh',
    support: 'Kiên',
    technical: 'Minh Khang',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Locked',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'emerald',
    avatars: ['LA', 'NK', 'MK'],
    notes: 'Livestream kết hợp tư vấn chuyên gia.',
    attachments: [
      { name: 'Lactacyd_QnA.pdf', size: '1.1 MB' }
    ]
  },
  {
    id: 'SH-2026-1007-010',
    title: 'Baseus - Phụ Kiện Sạc Nhanh',
    brand: 'Baseus',
    platform: 'Shopee Live',
    campaign: 'Siêu Hội Phụ Kiện Công Nghệ',
    date: '2026-10-07',
    dayOfWeek: 'Thứ Tư',
    dayIndex: 2,
    startTime: '19:00',
    endTime: '23:00',
    durationHours: 4,
    studio: 'Studio D - Tân Bình',
    status: 'Scheduled',
    host: 'Minh Tuấn',
    support: 'Hữu Lộc',
    technical: 'Hoàng',
    hostApproved: true,
    supportApproved: true,
    technicalApproved: true,
    requiredHost: 1,
    requiredSupport: 1,
    requiredTechnical: 1,
    currentHost: 1,
    currentSupport: 1,
    currentTechnical: 1,
    registrationState: 'Locked',
    hasImportedStaffing: true,
    importBatchId: 'IMP-20261001-01',
    color: 'blue',
    avatars: ['MT', 'HL', 'VH'],
    notes: 'Flash sale củ sạc 65W & dây cáp bọc dù.',
    attachments: []
  }
]

export const IMPORT_BATCHES_DATA: ImportBatchItem[] = [
  {
    batchId: 'IMP-20261001-01',
    fileName: 'Lich_Livestream_Thang_10_Chuan.xlsx',
    uploadedBy: 'Admin (Kien Nguyen)',
    timestamp: '2026-10-01 08:30:15',
    totalRows: 14,
    validRows: 14,
    warningRows: 0,
    errorRows: 0,
    status: 'Completed'
  },
  {
    batchId: 'IMP-20260928-02',
    fileName: 'Lich_Ca_Tuan_40_2026.xlsx',
    uploadedBy: 'Leader (Hoang Yen)',
    timestamp: '2026-09-28 14:12:00',
    totalRows: 20,
    validRows: 19,
    warningRows: 1,
    errorRows: 0,
    status: 'Warning'
  },
  {
    batchId: 'IMP-20260920-01',
    fileName: 'Schedule_Dac_Biet_MegaLive.csv',
    uploadedBy: 'Admin (Kien Nguyen)',
    timestamp: '2026-09-20 17:45:22',
    totalRows: 8,
    validRows: 8,
    warningRows: 0,
    errorRows: 0,
    status: 'Completed'
  }
]

// =============================================================================
// MAIN COMPONENT: CalendarReferenceMock
// =============================================================================

export function CalendarReferenceMock() {
  // Navigation & Workspace State
  const [qaState, setQaState] = useState<CalendarQaStateId>('01-calendar-month-main')
  const [workspace, setWorkspace] = useState<CalendarWorkspaceId>('calendar')
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [currentDateStr, setCurrentDateStr] = useState<string>('Tháng 10, 2026')

  // Search & Filter States (13 Authoritative Dimensions: 5 Quick + 12 Advanced Drawer)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterBrand, setFilterBrand] = useState<string[]>([])
  const [filterPlatform, setFilterPlatform] = useState<string[]>([])
  const [filterCampaign, setFilterCampaign] = useState<string[]>([])
  const [filterStudio, setFilterStudio] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterHost, setFilterHost] = useState<string>('all')
  const [filterSupport, setFilterSupport] = useState<string>('all')
  const [filterTechnical, setFilterTechnical] = useState<string>('all')
  const [filterOperationalRole, setFilterOperationalRole] = useState<string[]>([])
  const [filterStaffingState, setFilterStaffingState] = useState<string>('all')
  const [filterRegistrationState, setFilterRegistrationState] = useState<string>('all')
  const [hasImportedOnly, setHasImportedOnly] = useState<boolean>(false)
  const [filterTimeRange, setFilterTimeRange] = useState<string>('all')
  const [customTimeStart, setCustomTimeStart] = useState<string>('08:00')
  const [customTimeEnd, setCustomTimeEnd] = useState<string>('22:00')

  const activeFilterCount = useMemo(() => {
    return (
      filterBrand.length +
      filterPlatform.length +
      filterCampaign.length +
      (filterStudio !== 'all' ? 1 : 0) +
      (filterStatus !== 'all' ? 1 : 0) +
      (filterHost !== 'all' ? 1 : 0) +
      (filterSupport !== 'all' ? 1 : 0) +
      (filterTechnical !== 'all' ? 1 : 0) +
      filterOperationalRole.length +
      (filterStaffingState !== 'all' ? 1 : 0) +
      (filterRegistrationState !== 'all' ? 1 : 0) +
      (hasImportedOnly ? 1 : 0) +
      (filterTimeRange !== 'all' ? 1 : 0)
    )
  }, [
    filterBrand, filterPlatform, filterCampaign, filterStudio, filterStatus,
    filterHost, filterSupport, filterTechnical, filterOperationalRole,
    filterStaffingState, filterRegistrationState, hasImportedOnly, filterTimeRange
  ])

  // Selection & Detail States
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([])
  const [activeShiftDetail, setActiveShiftDetail] = useState<ShiftItem | null>(CANONICAL_SHIFTS[4]) // Ostelin default
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(true)

  // Modals & Drawers
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState<boolean>(false)
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState<boolean>(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false)

  // Permission presentation
  const [currentRole, setCurrentRole] = useState<'admin' | 'leader' | 'member'>('member')

  // ---------------------------------------------------------------------------
  // DETERMINISTIC QA STATE CONTROLLER
  // ---------------------------------------------------------------------------
  const handleQaStateChange = useCallback((newState: CalendarQaStateId) => {
    setQaState(newState)

    // Reset modals & transient state
    setIsMoreFiltersOpen(false)
    setIsApprovalModalOpen(false)
    setIsDeleteModalOpen(false)
    setIsExportModalOpen(false)
    setCurrentRole('member')

    switch (newState) {
      case '01-calendar-month-main':
        setWorkspace('calendar')
        setViewMode('month')
        setFilterBrand([])
        setFilterPlatform([])
        setSelectedShiftIds([])
        setActiveShiftDetail(CANONICAL_SHIFTS[4])
        setIsDetailOpen(true)
        break

      case '02-week':
        setWorkspace('calendar')
        setViewMode('week')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '03-day':
        setWorkspace('calendar')
        setViewMode('day')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '04-list':
        setWorkspace('calendar')
        setViewMode('list')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '05-more-filters':
        setWorkspace('calendar')
        setViewMode('month')
        setIsMoreFiltersOpen(true)
        setIsDetailOpen(false)
        break

      case '06-multiple-active-filters':
        setWorkspace('calendar')
        setViewMode('month')
        // OR within Brand: Ostelin OR Lactacyd
        setFilterBrand(['Ostelin', 'Lactacyd'])
        // AND across Platform: TikTok Shop
        setFilterPlatform(['TikTok Shop'])
        // AND restored Advanced Filter: Campaign (Chiến Dịch 9.9 & Mega Live 10.10)
        setFilterCampaign(['Chiến Dịch 9.9 & Mega Live 10.10'])
        // AND restored Canonical Operational Role: Host
        setFilterOperationalRole(['Host'])
        setIsDetailOpen(false)
        break

      case '07-selection-bulk-toolbar':
        setWorkspace('calendar')
        setViewMode('list')
        // 3 shifts selected
        setSelectedShiftIds(['SH-2026-1001-001', 'SH-2026-1002-002', 'SH-2026-1004-005'])
        setIsDetailOpen(false)
        break

      case '08-bulk-approval':
        setWorkspace('calendar')
        setViewMode('list')
        setSelectedShiftIds(['SH-2026-1001-001', 'SH-2026-1002-002', 'SH-2026-1004-005'])
        setIsApprovalModalOpen(true)
        break

      case '09-bulk-delete-impact':
        setWorkspace('calendar')
        setViewMode('list')
        setSelectedShiftIds(['SH-2026-1001-001', 'SH-2026-1002-002', 'SH-2026-1004-005'])
        setIsDeleteModalOpen(true)
        break

      case '10-bulk-export':
        setWorkspace('calendar')
        setViewMode('list')
        setSelectedShiftIds(['SH-2026-1001-001', 'SH-2026-1002-002', 'SH-2026-1004-005'])
        setIsExportModalOpen(true)
        break

      case '11-open-shifts':
        setWorkspace('open-shifts')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '12-my-shifts':
        setWorkspace('my-shifts')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '13-import-schedule':
        setWorkspace('import-schedule')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '14-import-history':
        setWorkspace('import-history')
        setSelectedShiftIds([])
        setIsDetailOpen(false)
        break

      case '15-shift-detail':
        setWorkspace('calendar')
        setViewMode('month')
        setActiveShiftDetail(CANONICAL_SHIFTS[4])
        setIsDetailOpen(true)
        break

      case '16-empty-no-results':
        setWorkspace('calendar')
        setViewMode('month')
        setFilterBrand(['NonExistentBrand'])
        setIsDetailOpen(false)
        break

      case '17-permission-restricted':
        setWorkspace('calendar')
        setViewMode('month')
        setCurrentRole('member')
        setIsDetailOpen(false)
        break
    }
  }, [])

  // Automation / window listener exposure
  useEffect(() => {
    if (typeof window === 'undefined') return
    const win = window as any
    win.__setCalendarQaState = (st: CalendarQaStateId) => handleQaStateChange(st)

    const params = new URLSearchParams(window.location.search)
    const qaParam = params.get('qaState') as CalendarQaStateId
    if (qaParam) {
      handleQaStateChange(qaParam)
    }
  }, [handleQaStateChange])

  // ---------------------------------------------------------------------------
  // FILTERING LOGIC (OR WITHIN DIMENSION, AND ACROSS DIMENSIONS)
  // ---------------------------------------------------------------------------
  const filteredShifts = useMemo(() => {
    return CANONICAL_SHIFTS.filter(shift => {
      // 1. Brand Filter: OR within dimension
      if (filterBrand.length > 0 && !filterBrand.includes(shift.brand)) return false

      // 2. Platform Filter: OR within dimension
      if (filterPlatform.length > 0 && !filterPlatform.includes(shift.platform)) return false

      // 3. Campaign Filter: OR within dimension (multi-select)
      if (filterCampaign.length > 0 && !filterCampaign.includes(shift.campaign)) return false

      // 4. Studio Filter
      if (filterStudio !== 'all' && !shift.studio.toLowerCase().includes(filterStudio.toLowerCase())) return false

      // 5. Status Filter (Quick filter bar)
      if (filterStatus !== 'all' && shift.status.toLowerCase() !== filterStatus.toLowerCase()) return false

      // 6. Host Filter
      if (filterHost !== 'all' && !shift.host.toLowerCase().includes(filterHost.toLowerCase())) return false

      // 7. Support Filter
      if (filterSupport !== 'all' && !shift.support.toLowerCase().includes(filterSupport.toLowerCase())) return false

      // 8. Technical Filter
      if (filterTechnical !== 'all' && !shift.technical.toLowerCase().includes(filterTechnical.toLowerCase())) return false

      // 9. Operational Role Filter (Canonical roles: Host, Support, Technical)
      if (filterOperationalRole.length > 0) {
        const matchesRole = filterOperationalRole.some(role => {
          if (role === 'Host' && shift.host && shift.host !== 'Chưa có' && shift.host !== '—') return true
          if (role === 'Support' && shift.support && shift.support !== 'Chưa có' && shift.support !== '—') return true
          if (role === 'Technical' && shift.technical && shift.technical !== 'Chưa có' && shift.technical !== '—') return true
          return false
        })
        if (!matchesRole) return false
      }

      // 10. Staffing State Filter
      const filledCount = shift.currentHost + shift.currentSupport + shift.currentTechnical
      const reqCount = shift.requiredHost + shift.requiredSupport + shift.requiredTechnical
      if (filterStaffingState === 'full' && (filledCount < reqCount)) return false
      if (filterStaffingState === 'gap' && (filledCount >= reqCount)) return false
      if (filterStaffingState === 'unassigned' && (filledCount > 0)) return false

      // 11. Registration State Filter
      if (filterRegistrationState !== 'all' && shift.registrationState !== filterRegistrationState) return false

      // 12. Imported Staffing Only Filter
      if (hasImportedOnly && !shift.hasImportedStaffing) return false

      // 13. Time Range Filter (Presets & Custom)
      if (filterTimeRange === 'morning') {
        const h = parseInt(shift.startTime.split(':')[0])
        if (h < 6 || h >= 12) return false
      } else if (filterTimeRange === 'afternoon') {
        const h = parseInt(shift.startTime.split(':')[0])
        if (h < 12 || h >= 18) return false
      } else if (filterTimeRange === 'evening') {
        const h = parseInt(shift.startTime.split(':')[0])
        if (h < 18 || h >= 22) return false
      } else if (filterTimeRange === 'night') {
        const h = parseInt(shift.startTime.split(':')[0])
        if (h < 22 && h >= 6) return false
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = shift.title.toLowerCase().includes(q)
        const matchBrand = shift.brand.toLowerCase().includes(q)
        const matchHost = shift.host.toLowerCase().includes(q)
        const matchStudio = shift.studio.toLowerCase().includes(q)
        if (!matchTitle && !matchBrand && !matchHost && !matchStudio) return false
      }

      return true
    })
  }, [
    filterBrand, filterPlatform, filterCampaign, filterStudio, filterStatus,
    filterHost, filterSupport, filterTechnical, filterOperationalRole,
    filterStaffingState, filterRegistrationState, hasImportedOnly, filterTimeRange, searchQuery
  ])

  // Open shifts subset
  const openShiftsList = useMemo(() => {
    return CANONICAL_SHIFTS.filter(
      s => s.currentHost < s.requiredHost ||
           s.currentSupport < s.requiredSupport ||
           s.currentTechnical < s.requiredTechnical ||
           s.registrationState === 'Open'
    )
  }, [])

  // My shifts subset (for current user Kiên / Support)
  const myShiftsList = useMemo(() => {
    return CANONICAL_SHIFTS.filter(
      s => s.support.toLowerCase().includes('kiên') || s.host.toLowerCase().includes('kiên')
    )
  }, [])

  // Multi-selection helpers
  const handleSelectShift = (id: string) => {
    setSelectedShiftIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSelectAllVisible = () => {
    if (selectedShiftIds.length === filteredShifts.length) {
      setSelectedShiftIds([])
    } else {
      setSelectedShiftIds(filteredShifts.map(s => s.id))
    }
  }

  return (
    <div
      lang="vi"
      translate="no"
      className="notranslate flex h-screen w-full bg-[#F8FAFC] overflow-hidden font-sans text-slate-900"
      data-qa-controller="calendar"
      data-qa-state={qaState}
    >
      {/* ===================================================================== */}
      {/* 1. LEFT SIDEBAR (248px) - Approved High-Fi Baseline */}
      {/* ===================================================================== */}
      <aside className="w-[248px] bg-[#082743] text-white flex flex-col shrink-0 z-20 select-none">
        {/* Brand Header */}
        <div className="h-[56px] flex items-center px-4 font-bold text-lg tracking-tight border-b border-white/10">
          <div className="w-6 h-6 bg-blue-600 rounded mr-2 flex items-center justify-center">
            <div className="w-2 h-3 bg-white rounded-xs"></div>
          </div>
          LiveStream Ops
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 mt-1 text-xs">
          <NavItem icon={<LayoutGrid size={16} />} label="My Workspace" />
          <NavItem icon={<Briefcase size={16} />} label="My Schedule" />
          <NavItem icon={<CalendarIcon size={16} />} label="Calendar" active />
          <NavItem icon={<Clock size={16} />} label="Shifts" />
          <NavItem icon={<Users size={16} />} label="Staffing" />
          <NavItem icon={<ArrowLeftRight size={16} />} label="My Swaps" />
          <NavItem icon={<CheckSquare size={16} />} label="Approvals" />
          <NavItem icon={<MonitorPlay size={16} />} label="Live" />
          <NavItem icon={<BarChart2 size={16} />} label="Reports" />
          <NavItem icon={<Bell size={16} />} label="Notifications" />
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs">
            NK
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-white truncate">Nguyễn Trung Kiên</div>
            <div className="text-[10px] text-blue-200 capitalize">{currentRole}</div>
          </div>
        </div>
      </aside>

      {/* ===================================================================== */}
      {/* 2. MAIN CALENDAR CONTAINER */}
      {/* ===================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* TOP NAVBAR */}
        <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
          <div className="relative w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm kiếm ca, brand, host, studio..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              <Bell className="w-4 h-4" />
              <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5 ring-2 ring-white"></span>
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <span className="text-xs font-semibold text-slate-800">Nguyễn Trung Kiên</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                {currentRole.toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* PERMISSION RESTRICTED BANNER (State 17) */}
        {qaState === '17-permission-restricted' && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Chế độ Xem Hạn Chế (Member Read-Only):</strong> Tài khoản của bạn không có quyền Tạo ca mới hoặc Duyệt nhân sự. Các thao tác này yêu cầu quyền <strong>Leader / Admin</strong>.
              </span>
            </div>
            <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-mono">
              READ_ONLY
            </span>
          </div>
        )}

        {/* CALENDAR SUBHEADER: WORKSPACES & VIEW CONTROLLERS */}
        <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-3 shrink-0 space-y-3">
          {/* Row 1: Workspace Tabs & Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                Calendar
              </h1>

              {/* Horizontal Workspaces Pill Navigation */}
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
                <button
                  onClick={() => setWorkspace('calendar')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    workspace === 'calendar'
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Shift calendar
                </button>
                <button
                  onClick={() => setWorkspace('open-shifts')}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    workspace === 'open-shifts'
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Open Shifts
                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">
                    {openShiftsList.length}
                  </span>
                </button>
                <button
                  onClick={() => setWorkspace('my-shifts')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    workspace === 'my-shifts'
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My shifts
                </button>
                <button
                  onClick={() => setWorkspace('import-schedule')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    workspace === 'import-schedule'
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Import schedule
                </button>
                <button
                  onClick={() => setWorkspace('import-history')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    workspace === 'import-history'
                      ? 'bg-white text-blue-700 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Import history
                </button>
              </div>
            </div>

            {/* Top Right Actions */}
            <div className="flex items-center gap-2">
              <button
                disabled={qaState === '17-permission-restricted'}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors shadow-xs ${
                  qaState === '17-permission-restricted'
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Create Shift</span>
              </button>
            </div>
          </div>

          {/* Row 2: Date Navigator & Views (Only visible in 'calendar' workspace) */}
          {workspace === 'calendar' && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* Date Nav */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentDateStr('Tháng 9, 2026')}
                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-slate-800 px-2 min-w-32 text-center">
                    {currentDateStr}
                  </span>
                  <button
                    onClick={() => setCurrentDateStr('Tháng 10, 2026')}
                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => setCurrentDateStr('Tháng 10, 2026')}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                >
                  Today
                </button>
              </div>

              {/* View Switchers: Month, Week, Day, List */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
                {(['month', 'week', 'day', 'list'] as CalendarViewMode[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className={`px-3 py-1 rounded-md transition-all capitalize ${
                      viewMode === v
                        ? 'bg-white text-slate-900 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* QUICK FILTERS TOOLBAR */}
        {workspace === 'calendar' && (
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Brand Filter */}
              <select
                value={filterBrand[0] || 'all'}
                onChange={e => {
                  const val = e.target.value
                  setFilterBrand(val === 'all' ? [] : [val])
                }}
                className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Tất cả brand ({filterBrand.length > 0 ? `${filterBrand.length} đã chọn` : '4+'})</option>
                <option value="Ostelin">Ostelin</option>
                <option value="Lactacyd">Lactacyd</option>
                <option value="Anker">Anker</option>
                <option value="Baseus">Baseus</option>
                <option value="UGREEN">UGREEN</option>
                <option value="Pharmaton">Pharmaton</option>
              </select>

              {/* Platform Filter */}
              <select
                value={filterPlatform[0] || 'all'}
                onChange={e => {
                  const val = e.target.value
                  setFilterPlatform(val === 'all' ? [] : [val])
                }}
                className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Tất cả platform ({filterPlatform.length > 0 ? `${filterPlatform.length} đã chọn` : '4'})</option>
                <option value="TikTok Shop">TikTok Shop</option>
                <option value="Shopee Live">Shopee Live</option>
                <option value="Lazada Live">Lazada Live</option>
                <option value="Facebook Live">Facebook Live</option>
              </select>

              {/* Studio Filter */}
              <select
                value={filterStudio}
                onChange={e => setFilterStudio(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Tất cả địa điểm (5)</option>
                <option value="Studio A">Studio A - Tầng 2</option>
                <option value="Studio B">Studio B - Tầng 3</option>
                <option value="Studio C">Studio C - Q.7</option>
                <option value="Studio D">Studio D - Tân Bình</option>
                <option value="Online">Online Broadcast</option>
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-white border border-slate-200 rounded-md px-2.5 py-1 text-slate-700 font-medium focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Live">Live</option>
                <option value="Completed">Completed</option>
                <option value="Draft">Draft</option>
              </select>

              {/* More Filters Button */}
              <button
                onClick={() => setIsMoreFiltersOpen(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-medium transition-colors ${
                  isMoreFiltersOpen || activeFilterCount > 0
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                <span>Bộ lọc nâng cao ({activeFilterCount})</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Staffing Approval Badge Button */}
              <button
                onClick={() => setIsApprovalModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-slate-700 font-medium transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Staffing approval ({selectedShiftIds.length})</span>
              </button>

              {/* Export Excel Button */}
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-md text-slate-700 font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE FILTER CHIPS (State 06 demonstration: OR within Brand, AND across Platform, Campaign & Role) */}
        {workspace === 'calendar' && (filterBrand.length > 0 || filterPlatform.length > 0 || filterCampaign.length > 0 || filterOperationalRole.length > 0) && (
          <div className="bg-blue-50/70 border-b border-blue-200 px-6 py-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Filter className="w-3 h-3 text-blue-600" />
              <span>Bộ lọc đang kích hoạt ({activeFilterCount}):</span>
            </span>
            {filterBrand.map(b => (
              <span
                key={b}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-blue-300 text-blue-800 text-[11px] font-medium shadow-2xs"
              >
                Brand: <strong>{b}</strong> <span className="text-[10px] text-blue-500 font-bold">(OR)</span>
                <button
                  onClick={() => setFilterBrand(prev => prev.filter(x => x !== b))}
                  className="hover:text-blue-950 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filterPlatform.map(p => (
              <span
                key={p}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-emerald-300 text-emerald-800 text-[11px] font-medium shadow-2xs"
              >
                Platform: <strong>{p}</strong> <span className="text-[10px] text-emerald-600 font-bold">(AND)</span>
                <button
                  onClick={() => setFilterPlatform(prev => prev.filter(x => x !== p))}
                  className="hover:text-emerald-950 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filterCampaign.map(c => (
              <span
                key={c}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-purple-300 text-purple-800 text-[11px] font-medium shadow-2xs"
              >
                Campaign: <strong>{c}</strong> <span className="text-[10px] text-purple-600 font-bold">(AND)</span>
                <button
                  onClick={() => setFilterCampaign(prev => prev.filter(x => x !== c))}
                  className="hover:text-purple-950 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {filterOperationalRole.map(r => (
              <span
                key={r}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-amber-300 text-amber-800 text-[11px] font-medium shadow-2xs"
              >
                Role: <strong>{r}</strong> <span className="text-[10px] text-amber-600 font-bold">(AND)</span>
                <button
                  onClick={() => setFilterOperationalRole(prev => prev.filter(x => x !== r))}
                  className="hover:text-amber-950 ml-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setFilterBrand([])
                setFilterPlatform([])
                setFilterCampaign([])
                setFilterStudio('all')
                setFilterStatus('all')
                setFilterHost('all')
                setFilterSupport('all')
                setFilterTechnical('all')
                setFilterOperationalRole([])
                setFilterStaffingState('all')
                setFilterRegistrationState('all')
                setHasImportedOnly(false)
                setFilterTimeRange('all')
              }}
              className="text-[11px] text-red-600 hover:text-red-700 hover:underline font-semibold ml-2 cursor-pointer"
            >
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}

        {/* MAIN BODY: WORKSPACE CANVAS & DETAIL PANEL */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-5">
            {/* WORKSPACE 1: SHIFT CALENDAR */}
            {workspace === 'calendar' && (
              <>
                {filteredShifts.length === 0 ? (
                  /* STATE 16: EMPTY STATE */
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto mt-12 shadow-xs">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
                      <Filter className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Không tìm thấy ca làm việc phù hợp</h3>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Không có ca livestream nào khớp với các tiêu chí lọc hiện tại. Vui lòng thử xóa bớt bộ lọc hoặc chọn khoảng thời gian khác.
                    </p>
                    <button
                      onClick={() => {
                        setFilterBrand([])
                        setFilterPlatform([])
                        setFilterStudio('all')
                        setFilterStatus('all')
                      }}
                      className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Đặt lại tất cả bộ lọc
                    </button>
                  </div>
                ) : (
                  <>
                    {/* VIEW 1: MONTH VIEW (October 2026 Grid) */}
                    {viewMode === 'month' && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                        {/* Day of Week Headers */}
                        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2 text-xs font-semibold text-slate-600">
                          <div>Thứ Hai</div>
                          <div>Thứ Ba</div>
                          <div>Thứ Tư</div>
                          <div>Thứ Năm</div>
                          <div>Thứ Sáu</div>
                          <div>Thứ Bảy</div>
                          <div>Chủ Nhật</div>
                        </div>

                        {/* Month Grid Cells (5 Weeks x 7 Days) */}
                        <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 text-xs min-h-[580px]">
                          {/* Oct 1 to Oct 7 Sample Render */}
                          {Array.from({ length: 35 }).map((_, idx) => {
                            const dayNum = idx - 2 // Offset to start Oct 1 on Thursday
                            const isCurrentMonth = dayNum >= 1 && dayNum <= 31
                            const dateStr = `2026-10-${String(dayNum).padStart(2, '0')}`
                            const dayShifts = filteredShifts.filter(s => s.date === dateStr)
                            const isToday = dayNum === 4

                            return (
                              <div
                                key={idx}
                                className={`min-h-[110px] p-2 flex flex-col justify-between transition-colors ${
                                  !isCurrentMonth ? 'bg-slate-50/50 text-slate-300' : 'bg-white hover:bg-slate-50/50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                                      isToday
                                        ? 'bg-blue-600 text-white font-bold'
                                        : isCurrentMonth
                                        ? 'text-slate-700'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {isCurrentMonth ? dayNum : ''}
                                  </span>
                                  {dayShifts.length > 0 && (
                                    <span className="text-[10px] font-bold text-slate-400">
                                      {dayShifts.length} ca
                                    </span>
                                  )}
                                </div>

                                {/* Shift Cards Inside Day */}
                                <div className="space-y-1.5 mt-1 flex-1">
                                  {dayShifts.map(shift => (
                                    <div
                                      key={shift.id}
                                      onClick={() => {
                                        setActiveShiftDetail(shift)
                                        setIsDetailOpen(true)
                                      }}
                                      className={`p-2 rounded-lg border text-left cursor-pointer transition-all shadow-2xs ${
                                        activeShiftDetail?.id === shift.id
                                          ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-200'
                                          : shift.color === 'blue'
                                          ? 'border-blue-200 bg-blue-50/50 hover:border-blue-300'
                                          : shift.color === 'emerald'
                                          ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300'
                                          : shift.color === 'purple'
                                          ? 'border-purple-200 bg-purple-50/50 hover:border-purple-300'
                                          : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                                        <span>{shift.startTime} - {shift.endTime}</span>
                                        <span
                                          className={`px-1.5 py-0.2 rounded-xs font-semibold uppercase text-[9px] ${
                                            shift.status === 'Live'
                                              ? 'bg-red-500 text-white animate-pulse'
                                              : shift.status === 'Completed'
                                              ? 'bg-slate-200 text-slate-700'
                                              : 'bg-blue-100 text-blue-700'
                                          }`}
                                        >
                                          {shift.status}
                                        </span>
                                      </div>
                                      <div className="font-bold text-slate-900 text-[11px] truncate mt-0.5">
                                        {shift.brand}
                                      </div>
                                      <div className="text-[10px] text-slate-500 truncate">
                                        {shift.studio}
                                      </div>
                                      <div className="mt-1 flex items-center justify-between pt-1 border-t border-slate-100">
                                        <div className="flex -space-x-1">
                                          {shift.avatars.map((av, avIdx) => (
                                            <span
                                              key={avIdx}
                                              className="w-4 h-4 rounded-full bg-slate-300 text-slate-700 text-[8px] font-bold flex items-center justify-center border border-white"
                                            >
                                              {av}
                                            </span>
                                          ))}
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-400">
                                          {shift.platform === 'TikTok Shop' ? 'TikTok' : shift.platform.split(' ')[0]}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* VIEW 2: WEEK VIEW (Hourly 08:00 - 23:00 timeline) */}
                    {viewMode === 'week' && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                        <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50 text-center py-2 text-xs font-semibold text-slate-600">
                          <div className="w-16">Giờ</div>
                          <div>Thứ Hai 28/09</div>
                          <div>Thứ Ba 29/09</div>
                          <div>Thứ Tư 30/09</div>
                          <div>Thứ Năm 01/10</div>
                          <div>Thứ Sáu 02/10</div>
                          <div>Thứ Bảy 03/10</div>
                          <div className="text-blue-600 font-bold">Chủ Nhật 04/10</div>
                        </div>

                        <div className="divide-y divide-slate-100 text-xs">
                          {['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'].map(hour => (
                            <div key={hour} className="grid grid-cols-8 min-h-[72px] divide-x divide-slate-100">
                              <div className="w-16 p-2 text-slate-400 font-mono text-[11px] text-right bg-slate-50/50">
                                {hour}
                              </div>
                              {/* 7 Days Columns */}
                              {Array.from({ length: 7 }).map((_, dIdx) => {
                                const matching = filteredShifts.filter(
                                  s => s.dayIndex === dIdx && parseInt(s.startTime.split(':')[0]) <= parseInt(hour.split(':')[0]) && parseInt(s.endTime.split(':')[0]) > parseInt(hour.split(':')[0])
                                )
                                return (
                                  <div key={dIdx} className="p-1.5 relative hover:bg-slate-50/40 transition-colors">
                                    {matching.map(shift => (
                                      <div
                                        key={shift.id}
                                        onClick={() => {
                                          setActiveShiftDetail(shift)
                                          setIsDetailOpen(true)
                                        }}
                                        className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-slate-900 cursor-pointer shadow-2xs hover:border-blue-400"
                                      >
                                        <div className="font-bold text-[11px] truncate text-blue-950">{shift.brand}</div>
                                        <div className="text-[10px] text-slate-500">{shift.startTime} - {shift.endTime}</div>
                                        <div className="text-[9px] text-slate-400">{shift.studio}</div>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* VIEW 3: DAY VIEW (Multi-Studio Schedule for 04/10/2026) */}
                    {viewMode === 'day' && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">Lịch Vận Hành Ngày 04/10/2026 (Chủ Nhật)</h3>
                            <p className="text-xs text-slate-500">Phân luồng theo 4 phòng phát trực tiếp song song</p>
                          </div>
                          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-md">
                            4 Ca Live Phát Sóng
                          </span>
                        </div>

                        <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-700 text-center py-2 divide-x divide-slate-200">
                          <div>Studio A - Tầng 2</div>
                          <div>Studio B - Tầng 3</div>
                          <div>Studio C - Quận 7</div>
                          <div>Online Broadcast</div>
                        </div>

                        <div className="grid grid-cols-4 divide-x divide-slate-100 min-h-[460px] p-3 gap-3">
                          {/* Studio A */}
                          <div className="space-y-3">
                            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-900">
                                <span>19:00 - 23:00</span>
                                <Badge className="bg-indigo-600 text-white text-[10px]">Scheduled</Badge>
                              </div>
                              <div className="font-bold text-sm text-slate-900 mt-1">Ecovacs - Deebot X2 Omni</div>
                              <div className="text-xs text-slate-600 mt-1">Host: Hoàng Yến | Tech: Minh Khang</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">Sàn: TikTok Shop</div>
                            </div>
                          </div>

                          {/* Studio B */}
                          <div className="space-y-3">
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-rose-900">
                                <span>10:00 - 14:00</span>
                                <Badge className="bg-rose-600 text-white text-[10px]">Open Shift</Badge>
                              </div>
                              <div className="font-bold text-sm text-slate-900 mt-1">Beauty Essentials Flash Sale</div>
                              <div className="text-xs text-slate-600 mt-1">Host: Sarah Johnson | Cần 1 Support</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">Sàn: Lazada Live</div>
                            </div>
                          </div>

                          {/* Studio C */}
                          <div className="space-y-3">
                            <div className="p-3 bg-blue-50 border border-blue-300 rounded-xl ring-2 ring-blue-100">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-blue-900">
                                <span>14:00 - 17:00</span>
                                <Badge className="bg-red-500 text-white text-[10px] animate-pulse">LIVE NOW</Badge>
                              </div>
                              <div className="font-bold text-sm text-slate-900 mt-1">Ostelin - TikTok Shop Live</div>
                              <div className="text-xs text-slate-600 mt-1">Host: Min | Support: Kiên | Tech: Hoàng</div>
                              <div className="text-[11px] text-blue-700 mt-1 font-semibold">Doanh thu tạm tính: 24.500.000₫</div>
                            </div>
                          </div>

                          {/* Online Broadcast */}
                          <div className="space-y-3">
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center py-8">
                              <span className="text-xs text-slate-400">Không có ca phát online trong ngày</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* VIEW 4: DENSE LIST VIEW (For fast scanning, selection & bulk operations) */}
                    {viewMode === 'list' && (
                      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold select-none">
                            <tr>
                              <th className="p-3 w-10 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedShiftIds.length === filteredShifts.length && filteredShifts.length > 0}
                                  onChange={handleSelectAllVisible}
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                />
                              </th>
                              <th className="p-3">Ngày &amp; Giờ</th>
                              <th className="p-3">Thương hiệu</th>
                              <th className="p-3">Sàn TMĐT</th>
                              <th className="p-3">Địa điểm (Studio)</th>
                              <th className="p-3">Nhân sự ca</th>
                              <th className="p-3 text-center">Trạng thái</th>
                              <th className="p-3 text-right">Hành động</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredShifts.map(shift => {
                              const isSelected = selectedShiftIds.includes(shift.id)
                              const hasGap = shift.currentSupport < shift.requiredSupport || shift.currentHost < shift.requiredHost

                              return (
                                <tr
                                  key={shift.id}
                                  className={`hover:bg-slate-50/70 transition-colors ${
                                    isSelected ? 'bg-blue-50/50' : ''
                                  }`}
                                >
                                  <td className="p-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleSelectShift(shift.id)}
                                      className="rounded text-blue-600 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="p-3 font-medium text-slate-900 whitespace-nowrap">
                                    <div>{shift.date}</div>
                                    <div className="text-[11px] text-slate-500">{shift.startTime} - {shift.endTime}</div>
                                  </td>
                                  <td className="p-3 font-bold text-slate-900">
                                    <div>{shift.brand}</div>
                                    <div className="text-[10px] text-slate-400 font-normal truncate max-w-44">{shift.campaign}</div>
                                  </td>
                                  <td className="p-3 text-slate-700">{shift.platform}</td>
                                  <td className="p-3 text-slate-600">{shift.studio}</td>
                                  <td className="p-3">
                                    <div className="text-[11px] text-slate-800">
                                      Host: <strong>{shift.host}</strong> | Support: {shift.support}
                                    </div>
                                    {hasGap && (
                                      <div className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded mt-0.5 border border-amber-200">
                                        <AlertTriangle className="w-3 h-3" />
                                        Staffing gap: Thiếu vị trí
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3 text-center">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        shift.status === 'Live'
                                          ? 'bg-red-100 text-red-700'
                                          : shift.status === 'Completed'
                                          ? 'bg-slate-100 text-slate-700'
                                          : 'bg-blue-100 text-blue-700'
                                      }`}
                                    >
                                      {shift.status}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right whitespace-nowrap space-x-1">
                                    <button
                                      onClick={() => {
                                        setActiveShiftDetail(shift)
                                        setIsDetailOpen(true)
                                      }}
                                      className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md font-semibold"
                                    >
                                      Chi tiết
                                    </button>
                                    <button
                                      disabled={qaState === '17-permission-restricted'}
                                      className="px-2.5 py-1 text-xs bg-slate-900 text-white hover:bg-slate-800 rounded-md font-medium disabled:bg-slate-200 disabled:text-slate-400"
                                    >
                                      Register
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* WORKSPACE 2: OPEN SHIFTS (Operational staffing workspace) */}
            {workspace === 'open-shifts' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Danh Sách Ca Đang Mở Đăng Ký ({openShiftsList.length} Ca)</h3>
                    <p className="text-xs text-slate-500">Các ca cần bổ sung nhân sự vận hành. Nhân viên có thể đăng ký trực tiếp hoặc quản lý chỉ định.</p>
                  </div>
                  <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold">
                    Cần bổ sung nhân sự
                  </span>
                </div>

                <div className="space-y-4">
                  {openShiftsList.map(shift => (
                    <div key={shift.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-slate-900">{shift.title}</span>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Open Shifts</Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {shift.date} · {shift.startTime} - {shift.endTime} | {shift.studio}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setActiveShiftDetail(shift)
                              setIsDetailOpen(true)
                            }}
                            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
                          >
                            View Shift Detail
                          </button>
                          <button className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-xs">
                            Register
                          </button>
                        </div>
                      </div>

                      {/* Role Breakdown Table */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Host */}
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between text-xs font-semibold mb-2">
                            <span>Host ({shift.currentHost}/{shift.requiredHost})</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 rounded">Full</span>
                          </div>
                          <div className="text-xs text-slate-700">Đã duyệt: <strong>{shift.host}</strong></div>
                        </div>

                        {/* Support */}
                        <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200">
                          <div className="flex items-center justify-between text-xs font-semibold mb-2">
                            <span className="text-amber-900">Support ({shift.currentSupport}/{shift.requiredSupport})</span>
                            <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 rounded font-bold">Available (Thiếu 1)</span>
                          </div>
                          <div className="text-xs text-slate-700">Đã duyệt: {shift.support}</div>
                          <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center gap-2">
                            <select className="text-[11px] bg-white border border-slate-300 rounded px-2 py-1 w-full text-slate-700">
                              <option>Chọn nhân sự đủ điều kiện...</option>
                              <option>Hữu Lộc (Support)</option>
                              <option>Phương Thảo (Support)</option>
                            </select>
                            <button className="px-2.5 py-1 text-[11px] bg-slate-900 text-white rounded font-medium shrink-0">
                              Assign
                            </button>
                          </div>
                        </div>

                        {/* Technical */}
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between text-xs font-semibold mb-2">
                            <span>Technical ({shift.currentTechnical}/{shift.requiredTechnical})</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 rounded">Full</span>
                          </div>
                          <div className="text-xs text-slate-700">Đã duyệt: <strong>{shift.technical}</strong></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WORKSPACE 3: MY SHIFTS */}
            {workspace === 'my-shifts' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Lịch Làm Việc Của Tôi ({myShiftsList.length} Ca Được Phân Công)</h3>
                    <p className="text-xs text-slate-500">Danh sách các ca bạn đã được phân công và duyệt chính thức.</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                    Vai trò: Support (Trợ lý livestream)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myShiftsList.map(shift => (
                    <div key={shift.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                          {shift.date}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          shift.status === 'Live' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {shift.status}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{shift.title}</h4>
                        <div className="text-xs text-slate-500 mt-1">Giờ live: {shift.startTime} - {shift.endTime} | {shift.studio}</div>
                        <div className="text-xs text-slate-600 mt-1">Đồng đội: Host <strong>{shift.host}</strong> | Tech: {shift.technical}</div>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đã xác nhận phân công
                        </span>
                        <button className="text-blue-600 hover:underline font-medium">
                          Yêu cầu đổi ca
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WORKSPACE 4: IMPORT SCHEDULE */}
            {workspace === 'import-schedule' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs max-w-2xl mx-auto mt-4 space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-blue-600" />
                    Nhập Lịch Livestream Tự Động (Import Schedule)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tải lên danh sách ca livestream từ tệp Excel chuẩn để phân bổ lịch hàng loạt.
                  </p>
                </div>

                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50/50">
                  <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <div className="text-xs font-semibold text-slate-800">Kéo và thả tệp lịch Excel (.xlsx, .csv) vào đây</div>
                  <div className="text-[11px] text-slate-400 mt-1">Hỗ trợ kích thước tối đa 10 MB</div>
                  <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                    Chọn tệp từ máy tính
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
                  <span>Chưa có mẫu biểu chuẩn? Tải tệp mẫu Excel:</span>
                  <button className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline">
                    <Download className="w-3.5 h-3.5" />
                    Mau_Lich_Livestream_v2.xlsx
                  </button>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                  <div className="font-bold">Đợt nhập gần nhất: Batch #IMP-20261001-01</div>
                  <div className="text-[11px] text-blue-800">14 ca đã nhập thành công lúc 08:30 ngày 01/10/2026 bởi Admin.</div>
                </div>
              </div>
            )}

            {/* WORKSPACE 5: IMPORT HISTORY */}
            {workspace === 'import-history' && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <History className="w-4 h-4 text-blue-600" />
                      Lịch Sử Nhập Lịch Ca Livestream (Import History)
                    </h3>
                    <p className="text-xs text-slate-500">Toàn bộ hồ sơ kiểm toán các đợt đồng bộ lịch làm việc.</p>
                  </div>
                </div>

                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-3">Mã đợt (Batch ID)</th>
                      <th className="p-3">Tên tệp nguồn</th>
                      <th className="p-3">Người tải lên</th>
                      <th className="p-3">Thời gian</th>
                      <th className="p-3 text-right">Tổng dòng</th>
                      <th className="p-3 text-right">Hợp lệ</th>
                      <th className="p-3 text-right">Cảnh báo/Lỗi</th>
                      <th className="p-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {IMPORT_BATCHES_DATA.map(b => (
                      <tr key={b.batchId} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-blue-700">{b.batchId}</td>
                        <td className="p-3 font-medium text-slate-900">{b.fileName}</td>
                        <td className="p-3 text-slate-600">{b.uploadedBy}</td>
                        <td className="p-3 text-slate-500">{b.timestamp}</td>
                        <td className="p-3 text-right font-medium">{b.totalRows}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">{b.validRows}</td>
                        <td className="p-3 text-right text-slate-500">{b.warningRows} / {b.errorRows}</td>
                        <td className="p-3 text-center">
                          <Badge className={b.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                            {b.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* RIGHT DETAIL PANEL (Slide-over / Sheet) */}
          {/* ================================================================= */}
          {isDetailOpen && activeShiftDetail && workspace === 'calendar' && (
            <aside className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 shadow-lg">
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Chi tiết ca làm việc
                </span>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                {/* Brand & Title */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-slate-900">{activeShiftDetail.title}</span>
                    <Badge className={activeShiftDetail.status === 'Live' ? 'bg-red-500 text-white' : 'bg-blue-100 text-blue-700'}>
                      {activeShiftDetail.status}
                    </Badge>
                  </div>
                  <div className="text-slate-500 text-[11px]">{activeShiftDetail.campaign}</div>
                </div>

                {/* Core Properties */}
                <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>
                      {activeShiftDetail.dayOfWeek}, {activeShiftDetail.date} · {activeShiftDetail.startTime} - {activeShiftDetail.endTime} ({activeShiftDetail.durationHours} giờ)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span>{activeShiftDetail.studio} (Asia/Ho_Chi_Minh)</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <MonitorPlay className="w-4 h-4 text-slate-400" />
                    <span>Sàn: <strong>{activeShiftDetail.platform}</strong></span>
                  </div>
                </div>

                {/* Staffing Checklist */}
                <div>
                  <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    Phân Công Nhân Sự (Staffing Roster)
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div>
                        <span className="text-slate-500">Host:</span> <strong>{activeShiftDetail.host}</strong>
                      </div>
                      {activeShiftDetail.hostApproved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <span suppressHydrationWarning className="text-[10px] text-amber-600 font-semibold">Chờ duyệt</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div>
                        <span className="text-slate-500">Support:</span> <strong>{activeShiftDetail.support}</strong>
                      </div>
                      {activeShiftDetail.supportApproved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <span suppressHydrationWarning className="text-[10px] text-amber-600 font-semibold">Chờ duyệt</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <div>
                        <span className="text-slate-500">Technical:</span> <strong>{activeShiftDetail.technical}</strong>
                      </div>
                      {activeShiftDetail.technicalApproved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <span suppressHydrationWarning className="text-[10px] text-amber-600 font-semibold">Chờ duyệt</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description & Notes */}
                <div>
                  <h4 className="font-bold text-slate-900 mb-1">Ghi Chú Vận Hành</h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {activeShiftDetail.notes}
                  </p>
                </div>

                {/* Attachments */}
                {activeShiftDetail.attachments.length > 0 && (
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      Tài Liệu Đính Kèm ({activeShiftDetail.attachments.length})
                    </h4>
                    <div className="space-y-1">
                      {activeShiftDetail.attachments.map((att, aIdx) => (
                        <div key={aIdx} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100 text-[11px]">
                          <span className="truncate text-blue-700 font-medium">{att.name}</span>
                          <span className="text-slate-400">{att.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Provenance Box */}
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[10px] text-slate-500 space-y-0.5">
                  <div>Mã ca: <strong className="font-mono text-slate-700">{activeShiftDetail.id}</strong></div>
                  <div>Nguồn: {activeShiftDetail.hasImportedStaffing ? `Import Batch (${activeShiftDetail.importBatchId})` : 'Tạo thủ công'}</div>
                  <div>Đăng ký: {activeShiftDetail.registrationState} | Hạn chót: 12:00</div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
                <button
                  disabled={qaState === '17-permission-restricted'}
                  className="flex-1 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  disabled={qaState === '17-permission-restricted'}
                  className="flex-1 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Duplicate
                </button>
                <button className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">
                  View Full
                </button>
              </div>
            </aside>
          )}
        </div>

        {/* =================================================================== */}
        {/* SELECTION / BULK TOOLBAR (State 07) */}
        {/* =================================================================== */}
        {selectedShiftIds.length > 0 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-4 text-xs border border-slate-700 animate-in slide-in-from-bottom-2">
            <span className="font-bold flex items-center gap-1.5 text-blue-300">
              <CheckSquare className="w-4 h-4" />
              Đã chọn {selectedShiftIds.length} ca làm việc
            </span>

            <div className="h-4 w-px bg-slate-700"></div>

            <button
              onClick={() => setIsApprovalModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-bold text-white transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Duyệt nhân sự
            </button>

            <button
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium text-slate-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất danh sách
            </button>

            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-600/90 hover:bg-red-600 rounded-lg font-bold text-white transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Xóa ca đã chọn
            </button>

            <button
              onClick={() => setSelectedShiftIds([])}
              className="text-slate-400 hover:text-white ml-2 text-[11px]"
            >
              Bỏ chọn
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL 05: MORE FILTERS DRAWER (13 Dimensions) */}
      {/* ===================================================================== */}
      {/* MORE FILTERS DRAWER (12 ADVANCED DIMENSIONS: CORE, PEOPLE, OPERATIONAL, TIME) */}
      {/* ===================================================================== */}
      {isMoreFiltersOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-2xs">
          <div className="w-[480px] max-w-full bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right z-50">
            {/* FIXED HEADER */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Filter className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Bộ lọc nâng cao (More Filters)</h3>
                  <p className="text-[11px] text-slate-500">12 tiêu chí chuyên sâu • Status nằm tại thanh lọc nhanh</p>
                </div>
              </div>
              <button
                onClick={() => setIsMoreFiltersOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* INTERNALLY SCROLLABLE BODY */}
            <div id="more-filters-scroll-body" className="p-5 flex-1 overflow-y-auto space-y-6 text-xs text-slate-600">
              
              {/* GROUP 1: THÔNG TIN CỐT LÕI (Core Dimensions) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    1. Nhóm thông tin cốt lõi (Core)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">4 dimensions</span>
                </div>

                {/* 1. Brand (OR semantics) */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1.5">
                    1. Thương hiệu (Brand - OR)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['Ostelin', 'Lactacyd', 'Bio-Oil', 'CeraVe'].map(b => (
                      <label
                        key={b}
                        className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-colors ${
                          filterBrand.includes(b)
                            ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={filterBrand.includes(b)}
                          onChange={() => {
                            setFilterBrand(prev =>
                              prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
                            )
                          }}
                          className="rounded text-blue-600"
                        />
                        <span>{b}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 2. Platform (AND across dimensions) */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1.5">
                    2. Sàn TMĐT (Platform - AND)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['TikTok Shop', 'Shopee Live', 'Lazada Live', 'Facebook Live'].map(p => (
                      <label
                        key={p}
                        className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-colors ${
                          filterPlatform.includes(p)
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={filterPlatform.includes(p)}
                          onChange={() => {
                            setFilterPlatform(prev =>
                              prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                            )
                          }}
                          className="rounded text-emerald-600"
                        />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 3. Campaign (Multi-select) */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1.5">
                    3. Chiến dịch phát sóng (Campaign - Multi-select)
                  </label>
                  <div className="space-y-1.5">
                    {[
                      'Chiến Dịch 9.9 & Mega Live 10.10',
                      'Flash Sale Cuối Tuần',
                      'Ecovacs Super Brand Day',
                      'Thu Đông 2026 Fashion Fest',
                      'Lactacyd Chăm Sóc Mẹ & Bé'
                    ].map(c => (
                      <label
                        key={c}
                        className={`flex items-center gap-2 p-1.5 rounded border cursor-pointer transition-colors ${
                          filterCampaign.includes(c)
                            ? 'bg-purple-50 border-purple-300 text-purple-900 font-medium'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={filterCampaign.includes(c)}
                          onChange={() => {
                            setFilterCampaign(prev =>
                              prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                            )
                          }}
                          className="rounded text-purple-600"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 4. Studio */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    4. Phòng phát sóng (Studio)
                  </label>
                  <select
                    value={filterStudio}
                    onChange={e => setFilterStudio(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="all">Tất cả studio (Studio A, B, C, D, Online)</option>
                    <option value="Studio A">Studio A - Tầng 2</option>
                    <option value="Studio B">Studio B - Tầng 3</option>
                    <option value="Studio C">Studio C - Quận 7</option>
                    <option value="Studio D">Studio D - Tân Bình</option>
                    <option value="Online">Online Broadcast</option>
                  </select>
                </div>
              </div>

              {/* GROUP 2: NHÂN SỰ & VAI TRÒ TÁC NGHIỆP (People & Role Dimensions) */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    2. Nhân sự & Vai trò (People & Role)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">4 dimensions</span>
                </div>

                {/* 5. Operational Role (Canonical roles only) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-semibold text-slate-700">
                      5. Vai trò tác nghiệp (Operational Role)
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">3 vai trò chuẩn</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { role: 'Host', desc: 'Người dẫn' },
                      { role: 'Support', desc: 'Trợ giảng' },
                      { role: 'Technical', desc: 'Kỹ thuật' }
                    ].map(item => (
                      <label
                        key={item.role}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer text-center transition-colors ${
                          filterOperationalRole.includes(item.role)
                            ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={filterOperationalRole.includes(item.role)}
                          onChange={() => {
                            setFilterOperationalRole(prev =>
                              prev.includes(item.role) ? prev.filter(x => x !== item.role) : [...prev, item.role]
                            )
                          }}
                          className="rounded text-amber-600 mb-1"
                        />
                        <span className="text-xs">{item.role}</span>
                        <span className="text-[9px] text-slate-400">{item.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 6. Host Personnel */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    6. Nhân sự Host chính
                  </label>
                  <select
                    value={filterHost}
                    onChange={e => setFilterHost(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="all">Tất cả nhân sự Host</option>
                    <option value="Lan Anh">Lan Anh (Senior Host)</option>
                    <option value="Minh Tuấn">Minh Tuấn</option>
                    <option value="Hoàng Yến">Hoàng Yến</option>
                    <option value="Thu Trang">Thu Trang</option>
                  </select>
                </div>

                {/* 7. Support Personnel */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    7. Nhân sự Hỗ trợ (Support)
                  </label>
                  <select
                    value={filterSupport}
                    onChange={e => setFilterSupport(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="all">Tất cả nhân sự Support</option>
                    <option value="Kiên">Kiên (Nguyễn Trung Kiên)</option>
                    <option value="Emily Davis">Emily Davis</option>
                    <option value="Hữu Lộc">Hữu Lộc</option>
                    <option value="Phương Thảo">Phương Thảo</option>
                  </select>
                </div>

                {/* 8. Technical Personnel */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    8. Nhân sự Kỹ thuật (Technical)
                  </label>
                  <select
                    value={filterTechnical}
                    onChange={e => setFilterTechnical(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="all">Tất cả nhân sự Technical</option>
                    <option value="Hoàng">Hoàng (OBS Specialist)</option>
                    <option value="Minh Khang">Minh Khang</option>
                    <option value="Quang Huy">Quang Huy</option>
                  </select>
                </div>
              </div>

              {/* GROUP 3: VẬN HÀNH & NGUỒN DỮ LIỆU (Operational Dimensions) */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    3. Vận hành & Nguồn ca (Operational)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">3 dimensions</span>
                </div>

                {/* 9. Staffing State */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    9. Tình trạng nhân sự (Staffing State)
                  </label>
                  <select
                    value={filterStaffingState}
                    onChange={e => setFilterStaffingState(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="all">Tất cả tình trạng phân bổ</option>
                    <option value="full">Đủ người (Fully Staffed)</option>
                    <option value="gap">Khuyết vị trí (Staffing Gap)</option>
                    <option value="unassigned">Chưa phân công (Unassigned)</option>
                  </select>
                </div>

                {/* 10. Registration State */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    10. Tình trạng đăng ký (Registration State)
                  </label>
                  <select
                    value={filterRegistrationState}
                    onChange={e => setFilterRegistrationState(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="all">Tất cả trạng thái đăng ký</option>
                    <option value="Open">Đang mở đăng ký (Open)</option>
                    <option value="Cutoff">Đã khóa hạn chót (Cutoff)</option>
                    <option value="Locked">Đã chốt lịch (Locked)</option>
                  </select>
                </div>

                {/* 11. Has Imported Staffing Checkbox */}
                <div className="pt-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer font-medium text-slate-800 hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={hasImportedOnly}
                      onChange={e => setHasImportedOnly(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>11. Chỉ hiện ca làm việc nhập tự động (Has Imported Staffing)</span>
                  </label>
                </div>
              </div>

              {/* GROUP 4: KHUNG GIỜ & THỜI GIAN (Time Range Dimensions) */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                    4. Khung giờ phát sóng (Time Range)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">1 dimension</span>
                </div>

                {/* 12. Time Range Presets & Custom Inputs */}
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    12. Khung giờ phát sóng trong ngày
                  </label>
                  <select
                    value={filterTimeRange}
                    onChange={e => setFilterTimeRange(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2 bg-white text-slate-800 mb-2"
                  >
                    <option value="all">Tất cả khung giờ (00:00 - 24:00)</option>
                    <option value="morning">Ca Sáng (08:00 - 12:00)</option>
                    <option value="afternoon">Ca Chiều (13:00 - 17:00)</option>
                    <option value="evening">Ca Tối (18:00 - 22:00)</option>
                    <option value="night">Ca Đêm (22:00 - 02:00)</option>
                    <option value="custom">Tùy chỉnh khoảng giờ (Custom)</option>
                  </select>

                  {filterTimeRange === 'custom' && (
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <span>Từ:</span>
                        <input
                          type="time"
                          value={customTimeStart}
                          onChange={e => setCustomTimeStart(e.target.value)}
                          className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <span>Đến:</span>
                        <input
                          type="time"
                          value={customTimeEnd}
                          onChange={e => setCustomTimeEnd(e.target.value)}
                          className="border border-slate-200 rounded px-1.5 py-0.5 bg-white text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* FIXED FOOTER */}
            <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
              <button
                onClick={() => {
                  setFilterBrand([])
                  setFilterPlatform([])
                  setFilterCampaign([])
                  setFilterStudio('all')
                  setFilterHost('all')
                  setFilterSupport('all')
                  setFilterTechnical('all')
                  setFilterOperationalRole([])
                  setFilterStaffingState('all')
                  setFilterRegistrationState('all')
                  setHasImportedOnly(false)
                  setFilterTimeRange('all')
                }}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
              >
                Đặt lại ({activeFilterCount})
              </button>
              <button
                onClick={() => setIsMoreFiltersOpen(false)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
              >
                Áp dụng bộ lọc ({activeFilterCount})
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===================================================================== */}
      {/* MODAL 08: BULK APPROVAL IMPACT MODAL */}
      {/* ===================================================================== */}
      {isApprovalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <UserCheck className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Duyệt Phân Công Nhân Sự Hàng Loạt</h3>
              </div>
              <button onClick={() => setIsApprovalModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <p>Hệ thống đã kiểm tra tính hợp lệ của <strong>{selectedShiftIds.length} ca làm việc</strong> đã chọn:</p>

              <div className="space-y-2">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    2 Ca Đủ Điều Kiện Duyệt Ngay:
                  </div>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-emerald-900 text-[11px]">
                    <li>SH-2026-1001-001 (Pharmaton · 09:00 - 13:00)</li>
                    <li>SH-2026-1002-002 (TechGear Pro · 09:00 - 13:00)</li>
                  </ul>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="font-bold text-amber-950 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    1 Ca Cần Kiểm Tra (Trùng ca trực Support):
                  </div>
                  <p className="mt-1 text-amber-900 text-[11px]">
                    SH-2026-1004-005 (Ostelin): Nhân sự Support Kiên đang được phân công trùng giờ với ca Beauty Flash Sale.
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-slate-500">
                * Thao tác duyệt sẽ gửi thông báo xác nhận lịch đến ứng dụng Telegram và email của nhân sự.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsApprovalModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  alert('Static Action: Đã duyệt 2 ca hợp lệ thành công!')
                  setIsApprovalModalOpen(false)
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Xác nhận duyệt (2 ca)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 09: BULK DELETE IMPACT WARNING DIALOG */}
      {/* ===================================================================== */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-red-200 w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-red-100 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Cảnh Báo Xóa Ca Làm Việc Hàng Loạt</h3>
              </div>
              <button onClick={() => setIsDeleteModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-950 font-medium">
                Bạn đang chuẩn bị xóa <strong>{selectedShiftIds.length} ca làm việc</strong> khỏi hệ thống lịch phát sóng.
                Hành động này mang tính phá hủy và không thể khôi phục.
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-1">Các tác động phụ thuộc (Dependency Impact):</h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600 text-[11px]">
                  <li><strong>5 lượt phân công nhân sự</strong> (Host, Support, Tech) sẽ bị hủy bỏ ngay lập tức.</li>
                  <li><strong>2 lượt đăng ký ca mở đang chờ</strong> sẽ tự động chuyển sang trạng thái Hủy.</li>
                  <li>Lịch sử đồng bộ thuộc đợt <strong>Batch #IMP-20261001-01</strong> sẽ ghi nhận trạng thái đã xóa.</li>
                  <li>Hệ thống phòng phát sẽ giải phóng studio cho các phiên phát khác.</li>
                </ul>
              </div>

              <div className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                Yêu cầu quyền <strong>Admin</strong> để xác nhận lệnh xóa vĩnh viễn này.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  alert('Static Action: Đã mô phỏng xóa các ca làm việc thành công.')
                  setIsDeleteModalOpen(false)
                  setSelectedShiftIds([])
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Xác nhận xóa ({selectedShiftIds.length} ca)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 10: BULK EXPORT DIALOG */}
      {/* ===================================================================== */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-blue-600">
                <Download className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900">Xuất Lịch Ca Livestream</h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div>
                <label className="font-semibold block mb-1 text-slate-800">Phạm vi xuất dữ liệu:</label>
                <select className="w-full border border-slate-200 rounded p-2 bg-slate-50 font-medium">
                  <option>{selectedShiftIds.length > 0 ? `${selectedShiftIds.length} ca đã chọn qua bảng danh sách` : 'Toàn bộ ca trong bộ lọc hiện tại (10 ca)'}</option>
                  <option>Toàn bộ lịch phát sóng Tháng 10/2026</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1 text-slate-800">Định dạng tệp:</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg border-2 border-blue-600 bg-blue-50 text-blue-900 font-bold flex items-center gap-2 cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    <span>Excel (.xlsx)</span>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2 cursor-pointer">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>CSV (.csv)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600" />
                  <span>Kèm chi tiết danh sách nhân sự (Host, Support, Tech)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded text-blue-600" />
                  <span>Kèm mã phòng Studio và liên kết phát trực tiếp</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  alert('Static Action: Đã bắt đầu tải về tệp Excel lịch livestream!')
                  setIsExportModalOpen(false)
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Tải về tệp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* FLOATING QA CONTROLLER (Deterministic State Switcher) */}
      {/* ===================================================================== */}
      <div id="calendar-qa-controller" data-qa-controller="true" className="fixed bottom-3 right-3 z-40 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 p-3 max-w-2xl select-none">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold tracking-wide uppercase text-slate-300">
              Calendar Wave 04 Visual QA Controller
            </span>
          </div>
          <span className="font-mono text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-emerald-400 border border-slate-700">
            {qaState}
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-1 text-[11px]">
          {[
            { id: '01-calendar-month-main', label: '01 Month' },
            { id: '02-week', label: '02 Week' },
            { id: '03-day', label: '03 Day' },
            { id: '04-list', label: '04 List' },
            { id: '05-more-filters', label: '05 Filters' },
            { id: '06-multiple-active-filters', label: '06 Active' },
            { id: '07-selection-bulk-toolbar', label: '07 Select' },
            { id: '08-bulk-approval', label: '08 Approve' },
            { id: '09-bulk-delete-impact', label: '09 Delete' },
            { id: '10-bulk-export', label: '10 Export' },
            { id: '11-open-shifts', label: '11 Open' },
            { id: '12-my-shifts', label: '12 My' },
            { id: '13-import-schedule', label: '13 Sched' },
            { id: '14-import-history', label: '14 Hist' },
            { id: '15-shift-detail', label: '15 Detail' },
            { id: '16-empty-no-results', label: '16 Empty' },
            { id: '17-permission-restricted', label: '17 Locked' }
          ].map(st => (
            <button
              key={st.id}
              data-qa-trigger={st.id}
              onClick={() => handleQaStateChange(st.id as CalendarQaStateId)}
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

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        active ? 'bg-blue-600 text-white font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </div>
  )
}

export default CalendarReferenceMock
