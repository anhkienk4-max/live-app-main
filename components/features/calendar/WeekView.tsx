'use client'

import { Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { format, startOfWeek, addDays } from 'date-fns'
import { enUS, vi } from 'date-fns/locale'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'

interface WeekViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  onShiftClick?: (shift: Shift) => void
}

export function WeekView({ currentDate, shifts, brands, platforms, onShiftClick }: WeekViewProps) {
  const { language, t } = useTranslation()
  const locale = language === 'vi' ? vi : enUS
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  
  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.filter(s => s.date === dateStr)
  }

  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || t('notProvided')
  const getStatusLabel = (status: Shift['status']) => t(status === 'live' ? 'liveStatus' : status)

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day) => {
        const dayShifts = getShiftsForDate(day)
        return (
          <div key={day.toString()} className="border rounded-lg p-3 min-h-[300px]">
            <div className="font-semibold mb-3 text-center">
              <div className="text-sm text-gray-600">{format(day, 'EEE', { locale })}</div>
              <div className="text-2xl">{format(day, 'd')}</div>
            </div>
            <div className="space-y-2">
              {dayShifts.map((shift) => (
                <button
                  type="button"
                  key={shift.id}
                  className="w-full rounded p-2 text-left text-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`week-shift-${shift.id}`}
                  aria-label={`${shift.title || getBrandName(shift.brand_id)} · ${formatShiftTimeRange(shift)} · ${getStatusLabel(shift.status)}`}
                  style={{ backgroundColor: getBrandColor(shift.brand_id) + '15', borderLeft: `4px solid ${getBrandColor(shift.brand_id)}` }}
                  onClick={() => onShiftClick?.(shift)}
                >
                  <div className="font-medium">{formatShiftTimeRange(shift)}</div>
                  <div className="truncate text-sm font-semibold">{shift.title?.trim() || `${getBrandName(shift.brand_id)} live`}</div>
                  <div className="text-xs truncate text-gray-700">{getBrandName(shift.brand_id)}</div>
                  <div className="truncate text-[11px] text-gray-600">{t('studio')}: {shift.studio || t('notUpdated')}</div>
                  <Badge variant={shift.status === 'live' ? 'destructive' : 'secondary'} className="text-[10px] mt-1">
                    {getStatusLabel(shift.status)}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
