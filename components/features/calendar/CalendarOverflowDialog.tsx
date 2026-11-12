'use client'

import * as React from 'react'
import { Search, Clock, AlertTriangle, CheckCircle, Eye, Edit2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BrandLogo } from '@/components/features/brands/BrandLogo'
import { hasPermission } from '@/lib/permissions'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import type { Shift, Brand, Platform, User } from '@/lib/types/database.types'
import type { TimelineOverflowBadge } from '@/lib/utils/timeGrid'

export interface CalendarOverflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  badge: TimelineOverflowBadge<unknown> | null
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  currentUser?: User | null
  onShiftClick?: (shift: Shift) => void
  onEditShift?: (shift: Shift) => void
}

interface CalendarOverflowDialogBodyProps {
  badge: TimelineOverflowBadge<unknown>
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  currentUser?: User | null
  onShiftClick?: (shift: Shift) => void
  onEditShift?: (shift: Shift) => void
  onOpenChange: (open: boolean) => void
}

function CalendarOverflowDialogBody({
  badge,
  brands,
  platforms,
  users,
  currentUser = null,
  onShiftClick,
  onEditShift,
  onOpenChange,
}: CalendarOverflowDialogBodyProps) {
  const { language } = useTranslation()
  const [search, setSearch] = React.useState('')

  // Extract raw shifts from cluster or overflow
  const rawList: Shift[] = (badge.allClusterShifts || []).map(item => {
    if (typeof item === 'object' && item !== null && 'shift' in item) {
      const candidate = (item as { shift?: unknown }).shift
      if (candidate && typeof candidate === 'object' && 'id' in candidate) {
        return candidate as Shift
      }
    }
    return item as Shift
  })

  // Filter shifts by search query
  const filteredShifts = rawList.filter(shift => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const brand = brands.find(b => b.id === shift.brand_id)?.name?.toLowerCase() || ''
    const platform = platforms.find(p => p.id === shift.platform_id)?.name?.toLowerCase() || ''
    const host = users.find(u => u.id === shift.host_id)?.full_name?.toLowerCase() || ''
    const support = users.find(u => u.id === shift.support_id)?.full_name?.toLowerCase() || ''
    const title = (shift.title || '').toLowerCase()
    const studio = (shift.studio || '').toLowerCase()
    const status = (shift.status || '').toLowerCase()
    return brand.includes(q) || platform.includes(q) || host.includes(q) || support.includes(q) || title.includes(q) || studio.includes(q) || status.includes(q)
  })

  const getBrand = (id: string) => brands.find(b => b.id === id)
  const getPlatform = (id: string) => platforms.find(p => p.id === id)
  const getUser = (id?: string) => users.find(u => u.id === id)

  const canEdit = currentUser && hasPermission(currentUser, 'shifts.edit')

  return (
    <>
      {/* Header */}
      <DialogHeader className="p-4 sm:p-5 border-b bg-slate-50/70 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-blue-600 shrink-0" aria-hidden="true" />
              <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                {badge.timeLabel} · {rawList.length} {language === 'vi' ? 'ca livestream' : 'livestreams'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {language === 'vi'
                ? 'Danh sách các ca livestream đồng thời hoặc giao nhau trong khung giờ này.'
                : 'Concurrent and overlapping shifts scheduled within this time window.'}
            </DialogDescription>
          </div>
        </div>

        {/* Quick Search Input */}
        {rawList.length > 3 && (
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" aria-hidden="true" />
            <Input
              type="text"
              placeholder={language === 'vi' ? 'Tìm theo nhãn hàng, host, sàn...' : 'Search brand, host, platform...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-white"
              autoFocus={false}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </DialogHeader>

      {/* Scrollable Shift List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 divide-y divide-slate-100">
        {filteredShifts.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {search ? 'Không tìm thấy ca nào khớp với từ khóa tìm kiếm.' : 'Không có ca nào trong khung giờ này.'}
          </div>
        ) : (
          filteredShifts.map((shift, idx) => {
            const brand = getBrand(shift.brand_id)
            const platform = getPlatform(shift.platform_id)
            const host = getUser(shift.host_id)
            const support = getUser(shift.support_id)

            const hostName = shift.host_names?.length
              ? shift.host_names.join(', ')
              : (host?.full_name || host?.email)
            const supportName = shift.assistant_names?.length
              ? shift.assistant_names.join(', ')
              : (support?.full_name || support?.email)

            const isMissingHost = !hostName
            const isMissingSupport = !supportName

            const platformName = platform?.name || 'Livestream'
            const platformLower = platformName.toLowerCase()
            const isTikTok = platformLower.includes('tiktok')
            const isShopee = platformLower.includes('shopee')
            const platformBadgeClass = isTikTok
              ? 'bg-slate-900 text-cyan-300 border-slate-800'
              : isShopee
              ? 'bg-orange-50 text-orange-700 border-orange-200'
              : 'bg-slate-100 text-slate-700 border-slate-200'

            return (
              <div
                key={shift.id}
                className={`pt-3 first:pt-0 rounded-lg p-3 transition-colors hover:bg-slate-50/80 border border-transparent hover:border-slate-200 ${
                  idx > 0 ? 'mt-2' : ''
                }`}
                data-testid={`overflow-shift-item-${shift.id}`}
              >
                {/* Top Row: Brand + Platform + Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BrandLogo
                      brandId={shift.brand_id}
                      brandName={brand?.name || 'Brand'}
                      logoUrl={brand?.logo_url}
                      size={32}
                      className="rounded-md shadow-xs shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-slate-900">
                        {shift.title || brand?.name || 'Livestream Shift'}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider border ${platformBadgeClass}`}>
                          {platformName}
                        </span>
                        {shift.studio && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            · {shift.studio}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={shift.status === 'live' ? 'destructive' : shift.status === 'completed' ? 'default' : 'secondary'}
                      className="text-[10px] font-semibold"
                    >
                      {shift.status}
                    </Badge>
                  </div>
                </div>

                {/* Middle Row: Time Window & Shortage Status */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 px-2.5 py-1.5 rounded-md border border-slate-100">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <Clock className="size-3.5 text-slate-400" aria-hidden="true" />
                    <span>{formatShiftTimeRange(shift)}</span>
                  </div>

                  <div>
                    {isMissingHost && isMissingSupport ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="size-3" /> Thiếu Host & Trợ
                      </span>
                    ) : isMissingHost ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="size-3" /> Thiếu Host
                      </span>
                    ) : isMissingSupport ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                        <AlertTriangle className="size-3" /> Thiếu Trợ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                        <CheckCircle className="size-3" /> Đủ nhân sự
                      </span>
                    )}
                  </div>
                </div>

                {/* Staffing Assignment Row */}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {/* Host */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Host:</span>
                    {hostName ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar size="sm" className="size-5 shrink-0 border border-slate-200">
                          {host?.avatar_url && !hostName.includes(',') && <AvatarImage src={host.avatar_url} alt={hostName} />}
                          <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700 font-bold">
                            {hostName.includes(',') ? `${hostName.split(',').length}H` : hostName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-xs text-slate-800" title={hostName}>
                          {hostName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-red-500 font-medium">Chưa phân công</span>
                    )}
                  </div>

                  {/* Support */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Trợ:</span>
                    {supportName ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar size="sm" className="size-5 shrink-0 border border-slate-200">
                          {support?.avatar_url && !supportName.includes(',') && <AvatarImage src={support.avatar_url} alt={supportName} />}
                          <AvatarFallback className="text-[10px] bg-purple-100 text-purple-700 font-bold">
                            {supportName.includes(',') ? `${supportName.split(',').length}T` : supportName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-xs text-slate-800" title={supportName}>
                          {supportName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">Chưa phân công</span>
                    )}
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="mt-2.5 flex items-center justify-end gap-2 pt-2 border-t border-slate-100/80">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs font-medium"
                    onClick={() => {
                      onOpenChange(false)
                      onShiftClick?.(shift)
                    }}
                  >
                    <Eye className="size-3.5 mr-1" /> {language === 'vi' ? 'Xem chi tiết' : 'View Details'}
                  </Button>
                  {canEdit && onEditShift && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-medium"
                      onClick={() => {
                        onOpenChange(false)
                        onEditShift(shift)
                      }}
                    >
                      <Edit2 className="size-3.5 mr-1" /> {language === 'vi' ? 'Sửa ca' : 'Edit Shift'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

export function CalendarOverflowDialog({
  open,
  onOpenChange,
  badge,
  brands,
  platforms,
  users,
  currentUser = null,
  onShiftClick,
  onEditShift,
}: CalendarOverflowDialogProps) {
  if (!badge) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <CalendarOverflowDialogBody
          key={badge.id}
          badge={badge}
          brands={brands}
          platforms={platforms}
          users={users}
          currentUser={currentUser}
          onShiftClick={onShiftClick}
          onEditShift={onEditShift}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}
