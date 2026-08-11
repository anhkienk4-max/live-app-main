'use client'

import { Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'

interface ListViewProps {
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  onShiftClick?: (shift: Shift) => void
}

export function ListView({ shifts, brands, platforms, users, onShiftClick }: ListViewProps) {
  const { t } = useTranslation()
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'
  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getUserName = (userId?: string) => userId ? users.find(u => u.id === userId)?.full_name || 'Unassigned' : 'Unassigned'

  const sortedShifts = [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  })

  if (sortedShifts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <p className="text-lg">No shifts found matching your criteria</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortedShifts.map((shift) => (
        <button
          type="button"
          key={shift.id}
          className="w-full rounded-lg border p-4 text-left transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`list-shift-${shift.id}`}
          style={{ borderLeft: `4px solid ${getBrandColor(shift.brand_id)}` }}
          onClick={() => onShiftClick?.(shift)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 flex-1">
              <div className="text-sm font-semibold min-w-[110px]">
                {format(new Date(shift.date), 'MMM d, yyyy')}
              </div>
              <div className="min-w-[150px] text-sm font-medium">{formatShiftTimeRange(shift)}</div>
              <div className="text-sm font-semibold text-gray-900">{getBrandName(shift.brand_id)}</div>
              <div className="text-sm text-gray-600">{getPlatformName(shift.platform_id)}</div>
              <div className="text-sm text-gray-500"><span className="font-medium">{t('studio')}:</span> {shift.studio || t('notUpdated')}</div>
              <div className="text-sm text-gray-500">
                <span className="font-medium">Host:</span> {getUserName(shift.host_id)}
              </div>
              <div className="text-sm text-gray-500"><span className="font-medium">Support:</span> {getUserName(shift.support_id)}</div>
              <div className="text-sm text-gray-500"><span className="font-medium">Technical:</span> {getUserName(shift.technical_id)}</div>
            </div>
            <Badge variant={shift.status === 'live' ? 'destructive' : shift.status === 'completed' ? 'default' : 'secondary'}>
              {shift.status}
            </Badge>
          </div>
        </button>
      ))}
    </div>
  )
}
