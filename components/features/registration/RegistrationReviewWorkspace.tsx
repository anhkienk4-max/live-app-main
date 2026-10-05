'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Search, Filter, RefreshCw, ShieldAlert,
  AlertTriangle, History, UserPlus,
  FileText, ChevronRight
} from 'lucide-react'
import type {
  Brand,
  OperationalRole,
  Platform,
  RegistrationStatus,
  Shift,
  ShiftRegistration,
  User,
} from '@/lib/types/database.types'
import {
  brandService,
  platformService,
  shiftRegistrationService,
  shiftService,
  userService,
  getShiftRoleCapacities,
    type ShiftRoleCapacity,
} from '@/lib/services/dataService'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { RegistrationApproveDialog } from './RegistrationApproveDialog'
import { RegistrationRejectDialog } from './RegistrationRejectDialog'
import { RegistrationAuditHistoryDialog } from './RegistrationAuditHistoryDialog'
import { RegistrationRequestDetailPanel } from './RegistrationRequestDetailPanel'

type StatusFilter = 'all' | RegistrationStatus
type RoleFilter = 'all' | OperationalRole

export function RegistrationReviewWorkspace() {
  const { currentUser } = useCurrentUser()
  const { toast } = useToast()

  // State
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [capacities, setCapacities] = React.useState<Record<string, Record<OperationalRole, ShiftRoleCapacity>>>({})

  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [selectedRegId, setSelectedRegId] = React.useState<string | null>(null)
  const [showMobileDetail, setShowMobileDetail] = React.useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>('all')

  // Concurrency & Dialogs
  const [concurrencyError, setConcurrencyError] = React.useState<string | null>(null)
  const [approveDialogOpen, setApproveDialogOpen] = React.useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false)
  const [auditDialogOpen, setAuditDialogOpen] = React.useState(false)

  // Permission
  const canReview = currentUser ? hasPermission(currentUser, 'shifts.approve_registration') : false

  // Load Data
  const loadData = React.useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    else setRefreshing(true)
    setConcurrencyError(null)

    try {
      const [allRegs, allShifts, allUsers, allBrands, allPlatforms] = await Promise.all([
        shiftRegistrationService.getAll(),
        shiftService.getAll(),
        userService.getAll(),
        brandService.getAll(),
        platformService.getAll(),
      ])

      setRegistrations(allRegs)
      setShifts(allShifts)
      setUsers(allUsers)
      setBrands(allBrands)
      setPlatforms(allPlatforms)

      const capsMap: Record<string, Record<OperationalRole, ShiftRoleCapacity>> = {}
      for (const shift of allShifts) {
        const capsList = getShiftRoleCapacities(shift, allRegs)
        const hostCap = capsList.find(c => c.role === 'host') || { role: 'host' as OperationalRole, required: shift.required_host_count ?? 1, approved: 0, pending: 0, remaining: 1 }
        const supportCap = capsList.find(c => c.role === 'support') || { role: 'support' as OperationalRole, required: shift.required_support_count ?? 2, approved: 0, pending: 0, remaining: 2 }
        const technicalCap = capsList.find(c => c.role === 'technical') || { role: 'technical' as OperationalRole, required: shift.required_technical_count ?? 1, approved: 0, pending: 0, remaining: 1 }
        capsMap[shift.id] = { host: hostCap, support: supportCap, technical: technicalCap }
      }
      setCapacities(capsMap)

      // Set initial selected item if none or if current not found
      if (allRegs.length > 0) {
        setSelectedRegId(prev => {
          if (prev && allRegs.some(r => r.id === prev)) return prev
          return allRegs[0].id
        })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi tải dữ liệu đăng ký ca.'
      toast({
        title: 'Lỗi tải dữ liệu',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadData()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loadData])

  // Lookups
  const userMap = React.useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const shiftMap = React.useMemo(() => new Map(shifts.map(s => [s.id, s])), [shifts])
  const brandMap = React.useMemo(() => new Map(brands.map(b => [b.id, b])), [brands])
  const platformMap = React.useMemo(() => new Map(platforms.map(p => [p.id, p])), [platforms])

  // Counts
  const totalCount = registrations.length
  const pendingCount = registrations.filter(r => r.status === 'pending').length
  const approvedCount = registrations.filter(r => r.status === 'approved' || r.status === 'manually_assigned').length
  const rejectedCount = registrations.filter(r => r.status === 'rejected').length
  const cancelledCount = registrations.filter(r => r.status === 'cancelled' || r.status === 'removed').length

  // Filtered List
  const filteredRegistrations = React.useMemo(() => {
    return registrations.filter(reg => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'approved') {
          if (reg.status !== 'approved' && reg.status !== 'manually_assigned') return false
        } else if (statusFilter === 'cancelled') {
          if (reg.status !== 'cancelled' && reg.status !== 'removed') return false
        } else if (reg.status !== statusFilter) {
          return false
        }
      }

      // Role filter
      if (roleFilter !== 'all' && reg.operational_role !== roleFilter) {
        return false
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const user = userMap.get(reg.user_id)
        const shift = shiftMap.get(reg.shift_id)
        const nameMatch = user?.full_name?.toLowerCase().includes(q) || reg.imported_name?.toLowerCase().includes(q)
        const emailMatch = user?.email?.toLowerCase().includes(q)
        const shiftMatch = shift?.title?.toLowerCase().includes(q) || reg.shift_id.toLowerCase().includes(q)
        const idMatch = reg.id.toLowerCase().includes(q)
        if (!nameMatch && !emailMatch && !shiftMatch && !idMatch) return false
      }

      return true
    })
  }, [registrations, statusFilter, roleFilter, searchQuery, userMap, shiftMap])

  // Active Selected Item
  const activeReg = React.useMemo(() => {
    if (!selectedRegId) return filteredRegistrations[0] || null
    return registrations.find(r => r.id === selectedRegId) || filteredRegistrations[0] || null
  }, [selectedRegId, registrations, filteredRegistrations])

  const activeApplicant = activeReg ? userMap.get(activeReg.user_id) : undefined
  const activeShift = activeReg ? shiftMap.get(activeReg.shift_id) : undefined
  const activeBrand = activeShift?.brand_id ? brandMap.get(activeShift.brand_id) : undefined
  const activePlatform = activeShift?.platform_id ? platformMap.get(activeShift.platform_id) : undefined
  const activeCapacity = activeShift && activeReg && capacities[activeShift.id]
    ? capacities[activeShift.id][activeReg.operational_role]
    : undefined

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <ContentSkeleton />
      </div>
    )
  }

  return (
    <div data-testid="registration-review-workspace" className="flex flex-col min-h-[680px] h-[calc(100vh-12rem)] bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
      {/* 1. READ-ONLY BANNER FOR MEMBERS */}
      {!canReview && (
        <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Chế độ chỉ xem (Permission Read-Only):</strong> Tài khoản của bạn không có quyền phê duyệt/từ chối đơn đăng ký ca. Các thao tác quyết định bị vô hiệu hóa.
            </span>
          </div>
          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 text-[10px]">
            shifts.approve_registration = DENIED
          </Badge>
        </div>
      )}

      {/* 2. CAS CONCURRENCY BANNER */}
      {concurrencyError && (
        <div className="flex items-center justify-between bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>
              <strong>Xung đột cập nhật đồng thời (Optimistic Concurrency Conflict):</strong> {concurrencyError}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs border-rose-300 bg-white text-rose-700 hover:bg-rose-100"
            onClick={() => void loadData(true)}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Tải lại dữ liệu
          </Button>
        </div>
      )}

      {/* 3. HEADER CONTROLS & METRICS */}
      <div className="border-b border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Hàng đợi xét duyệt đăng ký ca</h2>
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700">
                Review Workspace
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Thẩm định năng lực, kiểm tra xung đột và phê duyệt đăng ký ca trực vận hành livestream.
            </p>
          </div>

          {/* Counts */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">TỔNG ĐƠN</span>
              <span className="font-bold text-slate-800">{totalCount}</span>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-center">
              <span className="text-[10px] text-amber-700 block font-medium">CHỜ DUYỆT</span>
              <span className="font-bold text-amber-800">{pendingCount}</span>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-center">
              <span className="text-[10px] text-emerald-700 block font-medium">ĐÃ DUYỆT</span>
              <span className="font-bold text-emerald-800">{approvedCount}</span>
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-center">
              <span className="text-[10px] text-rose-700 block font-medium">TỪ CHỐI</span>
              <span className="font-bold text-rose-800">{rejectedCount}</span>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-center">
              <span className="text-[10px] text-slate-500 block font-medium">ĐÃ HỦY</span>
              <span className="font-bold text-slate-700">{cancelledCount}</span>
            </div>
          </div>
        </div>

        {/* Filters and Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Tìm mã đơn, nhân sự, ca..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-white"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  statusFilter === 'all'
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
                  statusFilter === 'pending'
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
                  statusFilter === 'approved'
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
                  statusFilter === 'rejected'
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
                  statusFilter === 'cancelled'
                    ? 'bg-blue-600 text-white shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đã hủy ({cancelledCount})
              </button>
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 bg-white rounded-md px-2 py-1">
              <Filter className="h-3 w-3 text-slate-400" />
              <span>Vai trò:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none"
              >
                <option value="all">Tất cả</option>
                <option value="host">Host</option>
                <option value="support">Support</option>
                <option value="technical">Technical</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(statusFilter !== 'all' || roleFilter !== 'all' || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all')
                  setRoleFilter('all')
                  setSearchQuery('')
                }}
                className="text-xs text-blue-600 hover:underline px-1"
              >
                Xóa lọc
              </button>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <Link href="/calendar?tab=mine">
              <Button variant="outline" size="sm" className="h-8 text-xs bg-white">
                <UserPlus className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                <span>Tự đăng ký (Member)</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white"
              onClick={() => setAuditDialogOpen(true)}
            >
              <History className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
              <span>Lịch sử kiểm toán</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-slate-600"
              disabled={refreshing}
              onClick={() => void loadData(true)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* 4. MAIN SPLIT VIEW (LEFT: QUEUE, RIGHT: DETAIL) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* LEFT PANE: QUEUE */}
        <div className={`flex-1 overflow-y-auto ${showMobileDetail ? 'hidden lg:block' : 'block'}`}>
          {filteredRegistrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
              {searchQuery.trim() || statusFilter !== 'all' || roleFilter !== 'all' ? (
                <>
                  <Search className="h-10 w-10 text-slate-300 mb-2" />
                  <h3 className="text-sm font-bold text-slate-800">Không tìm thấy kết quả phù hợp</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Không có đơn đăng ký nào khớp với tiêu chí tìm kiếm hiện tại.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => {
                      setSearchQuery('')
                      setStatusFilter('all')
                      setRoleFilter('all')
                    }}
                  >
                    Đặt lại bộ lọc
                  </Button>
                </>
              ) : (
                <>
                  <FileText className="h-10 w-10 text-slate-300 mb-2" />
                  <h3 className="text-sm font-bold text-slate-800">Hàng đợi đăng ký trống</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Hiện tại không có đơn đăng ký ca trực nào trong hệ thống.
                  </p>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-xs text-[11px] font-bold text-slate-500 border-b border-slate-200 z-10">
                <tr>
                  <th className="py-2.5 px-4">MÃ ĐƠN & ỨNG VIÊN</th>
                  <th className="py-2.5 px-3">VAI TRÒ</th>
                  <th className="py-2.5 px-3">CA PHÁT SÓNG</th>
                  <th className="py-2.5 px-3 text-center">ĐỊNH BIÊN</th>
                  <th className="py-2.5 px-3 text-center">TRẠNG THÁI</th>
                  <th className="py-2.5 px-4 text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRegistrations.map((reg) => {
                  const isSelected = activeReg?.id === reg.id
                  const user = userMap.get(reg.user_id)
                  const shift = shiftMap.get(reg.shift_id)
                  const cap = shift && capacities[shift.id] ? capacities[shift.id][reg.operational_role] : undefined
                  const userName = user?.full_name || reg.imported_name || reg.user_id
                  const initials = userName
                    .split(' ')
                    .map(p => p[0])
                    .filter(Boolean)
                    .slice(-2)
                    .join('')
                    .toUpperCase() || 'US'

                  return (
                    <tr
                      key={reg.id}
                      onClick={() => {
                        setSelectedRegId(reg.id)
                        setShowMobileDetail(true)
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                              <span>{userName}</span>
                              <span className="font-mono text-[10px] text-slate-400 font-normal">#{reg.id}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {reg.requested_at ? new Date(reg.requested_at).toLocaleDateString('vi-VN') : 'N/A'} · <span className="font-mono">{reg.source}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Requested Role */}
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

                      {/* Shift Context */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-800 truncate max-w-[200px]" title={shift?.title}>
                          {shift?.title || `#${reg.shift_id}`}
                        </div>
                        {shift && (
                          <div className="text-[10px] text-slate-500">
                            {shift.date} · {shift.start_time} – {shift.end_time}
                          </div>
                        )}
                      </td>

                      {/* Capacity */}
                      <td className="py-3 px-3 text-center">
                        {cap ? (
                          <span className={`font-mono font-bold text-[11px] ${
                            cap.approved >= cap.required ? 'text-rose-600' : 'text-slate-700'
                          }`}>
                            {cap.approved}/{cap.required}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        {reg.status === 'approved' || reg.status === 'manually_assigned' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                            ✓ Đã duyệt
                          </Badge>
                        ) : reg.status === 'rejected' ? (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                            ✕ Từ chối
                          </Badge>
                        ) : reg.status === 'cancelled' || reg.status === 'removed' ? (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px]">
                            Đã hủy
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                            Chờ duyệt
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRegId(reg.id)
                            setShowMobileDetail(true)
                          }}
                        >
                          Chi tiết
                          <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* RIGHT PANE: DETAIL DRAWER (DESKTOP OR MOBILE SHEET) */}
        {activeReg && (
          <div className={`w-full lg:w-[420px] flex-shrink-0 border-l border-slate-200 bg-white ${
            showMobileDetail ? 'block absolute inset-0 z-20 lg:relative lg:inset-auto' : 'hidden lg:block'
          }`}>
            <RegistrationRequestDetailPanel
              registration={activeReg}
              applicant={activeApplicant}
              shift={activeShift}
              brand={activeBrand}
              platform={activePlatform}
              capacity={activeCapacity}
              allUserRegistrations={registrations}
              allShifts={shifts}
              canReview={canReview}
              onOpenApprove={() => setApproveDialogOpen(true)}
              onOpenReject={() => setRejectDialogOpen(true)}
              onCloseMobile={() => setShowMobileDetail(false)}
            />
          </div>
        )}
      </div>

      {/* 5. MODAL DIALOGS */}
      <RegistrationApproveDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        registration={activeReg}
        applicant={activeApplicant}
        shift={activeShift}
        capacity={activeCapacity}
        reviewerId={currentUser?.id || 'system'}
        onSuccess={async () => {
          await loadData(true)
        }}
      />

      <RegistrationRejectDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        registration={activeReg}
        applicant={activeApplicant}
        shift={activeShift}
        reviewerId={currentUser?.id || 'system'}
        onSuccess={async () => {
          await loadData(true)
        }}
      />

      <RegistrationAuditHistoryDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        currentUser={currentUser}
        registrationId={activeReg?.id}
      />
    </div>
  )
}
