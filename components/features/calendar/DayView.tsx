'use client'

import { Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Clock, User as UserIcon } from 'lucide-react'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'

interface DayViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  onShiftClick?: (shift: Shift) => void
}

export function DayView({ currentDate, shifts, brands, platforms, users, onShiftClick }: DayViewProps) {
  const { t } = useTranslation()
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dayShifts = shifts.filter(s => s.date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time))
  
  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'
  const getUserName = (userId?: string) => userId ? users.find(u => u.id === userId)?.full_name || 'Unassigned' : 'Unassigned'

  return (
    <div>
      <h3 className="text-xl font-bold mb-4">{format(currentDate, 'EEEE, MMMM d, yyyy')}</h3>
      {dayShifts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Clock className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg">No shifts scheduled for this day</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayShifts.map((shift) => (
            <button
              type="button"
              key={shift.id}
              className="w-full rounded-lg border p-4 text-left transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`day-shift-${shift.id}`}
              style={{ borderLeft: `6px solid ${getBrandColor(shift.brand_id)}` }}
              onClick={() => onShiftClick?.(shift)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-semibold">{formatShiftTimeRange(shift)}</span>
                    <Badge variant={shift.status === 'live' ? 'destructive' : shift.status === 'completed' ? 'default' : 'secondary'}>
                      {shift.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="font-medium">Brand:</span>
                      <span className="ml-2">{getBrandName(shift.brand_id)}</span>
                    </div>
                    <div>
                      <span className="font-medium">Platform:</span>
                      <span className="ml-2">{getPlatformName(shift.platform_id)}</span>
                    </div>
                    <div>
                      <span className="font-medium">{t('studio')}:</span>
                      <span className="ml-2">{shift.studio || t('notUpdated')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-blue-600" />
                      <span className="text-gray-600">Host:</span>
                      <span className="font-medium">{getUserName(shift.host_id)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-green-600" />
                      <span className="text-gray-600">Support:</span>
                      <span className="font-medium">{getUserName(shift.support_id)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-purple-600" />
                      <span className="text-gray-600">Technical:</span>
                      <span className="font-medium">{getUserName(shift.technical_id)}</span>
                    </div>
                  </div>
                  {shift.product_notes && (
                    <div className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{shift.product_notes}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
