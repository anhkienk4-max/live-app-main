

import { Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { format, startOfWeek, addDays } from 'date-fns'

interface WeekViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  onShiftClick?: (shift: Shift) => void
}

export function WeekView({ currentDate, shifts, brands, platforms, onShiftClick }: WeekViewProps) {
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
                <div
                  key={shift.id}
                  className="p-2 rounded text-sm cursor-pointer hover:shadow-md transition-shadow"
                  style={{ backgroundColor: getBrandColor(shift.brand_id) + '15', borderLeft: `4px solid ${getBrandColor(shift.brand_id)}` }}
                  onClick={() => onShiftClick?.(shift)}
                >
                  <div className="font-medium">{shift.start_time} - {shift.end_time}</div>
                  <div className="text-xs truncate text-gray-700">{getBrandName(shift.brand_id)}</div>
                  <Badge variant={shift.status === 'live' ? 'destructive' : 'secondary'} className="text-[10px] mt-1">
                    {shift.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
