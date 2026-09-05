'use client'

import { Shift, Brand, Platform, User, ShiftRegistration } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { format, startOfWeek, addDays } from 'date-fns'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { resolveStaffingLabels } from '@/lib/utils/staffingResolver'

interface WeekViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  registrations: ShiftRegistration[]
  onShiftClick?: (shift: Shift) => void
}

export function WeekView({ currentDate, shifts, brands, platforms, users, registrations, onShiftClick }: WeekViewProps) {
  const { t } = useTranslation()
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  
  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.filter(s => s.date === dateStr)
  }

  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'

  return (
    <div className="grid grid-cols-7 gap-2">
      {weekDays.map((day) => {
        const dayShifts = getShiftsForDate(day)
        return (
          <div key={day.toString()} className="border rounded-lg p-3 min-h-[300px]">
            <div className="font-semibold mb-3 text-center">
              <div className="text-sm text-gray-600">{format(day, 'EEE')}</div>
              <div className="text-2xl">{format(day, 'd')}</div>
            </div>
            <div className="space-y-2">
              {dayShifts.map((shift) => (
                <button
                  type="button"
                  key={shift.id}
                  className="w-full rounded p-2 text-left text-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`week-shift-${shift.id}`}
                  style={{ backgroundColor: getBrandColor(shift.brand_id) + '15', borderLeft: `4px solid ${getBrandColor(shift.brand_id)}` }}
                  onClick={() => onShiftClick?.(shift)}
                >
                  <div className="font-medium">{formatShiftTimeRange(shift)}</div>
                  <div className="text-xs truncate text-gray-700">{getBrandName(shift.brand_id)}</div>
                  <div className="truncate text-[11px] text-gray-600 mb-1">{t('studio')}: {shift.studio || t('notUpdated')}</div>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {(() => {
                      const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
                      const labels = resolveStaffingLabels(shift, shiftRegistrations, users, t)
                      return labels.map((lbl, idx) => (
                        <span key={lbl.id + idx} className={`text-[10px] px-1 rounded bg-white/50 border border-gray-200 truncate max-w-full ${lbl.isUnassigned ? 'text-gray-400 italic' : 'text-gray-700 font-medium'}`}>
                          {lbl.name}
                        </span>
                      ))
                    })()}
                  </div>
                  <Badge variant={shift.status === 'live' ? 'destructive' : 'secondary'} className="text-[10px] mt-1">
                    {shift.status}
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
