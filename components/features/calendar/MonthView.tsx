'use client'

import * as React from 'react'
import { Shift, Brand, Platform } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns'

interface MonthViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  onShiftClick?: (shift: Shift) => void
}

export function MonthView({ currentDate, shifts, brands, platforms, onShiftClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(monthEnd)

  const dateFormat = "d"
  const rows: Date[][] = []
  let days: Date[] = []
  let day = startDate

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      days.push(day)
      day = addDays(day, 1)
    }
    rows.push(days)
    days = []
  }

  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.filter(s => s.date === dateStr)
  }

  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'

  return (
    <div className="h-full">
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="bg-gray-50 p-2 text-center text-sm font-semibold text-gray-700">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-b-lg overflow-hidden">
        {rows.map((week, weekIdx) =>
          week.map((day, dayIdx) => {
            const dayShifts = getShiftsForDate(day)
            const isCurrentMonth = isSameMonth(day, monthStart)
            const isCurrentDay = isToday(day)

            return (
              <div
                key={dayIdx}
                className={`bg-white p-2 min-h-[120px] ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''} ${
                  isCurrentDay ? 'bg-blue-50 ring-2 ring-blue-500' : ''
                }`}
              >
                <div className={`text-sm font-semibold mb-2 ${isCurrentDay ? 'text-blue-600' : ''}`}>
                  {format(day, dateFormat)}
                </div>
                <div className="space-y-1">
                  {dayShifts.slice(0, 3).map((shift) => (
                    <div
                      key={shift.id}
                      className="text-xs p-1 rounded cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: getBrandColor(shift.brand_id) + '20', borderLeft: `3px solid ${getBrandColor(shift.brand_id)}` }}
                      onClick={() => onShiftClick?.(shift)}
                    >
                      <div className="font-medium truncate">{shift.start_time}</div>
                      <Badge variant={shift.status === 'live' ? 'destructive' : 'secondary'} className="text-[10px] py-0">
                        {shift.status}
                      </Badge>
                    </div>
                  ))}
                  {dayShifts.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">+{dayShifts.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
