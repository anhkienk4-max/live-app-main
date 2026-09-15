'use client'

import { Shift, Brand, Platform, ShiftRegistration } from '@/lib/types/database.types'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { useTranslation } from '@/lib/i18n'
import { CalendarShiftCard } from './CalendarShiftCard'
import { cn } from '@/lib/utils'

interface WeekViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  registrations: ShiftRegistration[]
  onShiftClick?: (shift: Shift) => void
}

export function WeekView({ currentDate, shifts, brands, platforms, registrations, onShiftClick }: WeekViewProps) {
  const { t } = useTranslation()
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  return (
    <div className="flex h-full overflow-x-auto bg-background">
      {weekDays.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd')
        const dayShifts = shifts.filter(s => s.date === dateStr).sort((a,b) => a.start_time.localeCompare(b.start_time))
        const isToday = isSameDay(date, today)

        return (
          <div key={date.toISOString()} className={cn("flex-1 min-w-[200px] border-r flex flex-col", isToday && "bg-primary/5")}>
            <div className="p-3 text-center border-b bg-muted/30 sticky top-0 z-10 backdrop-blur-md">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{format(date, 'EEE')}</div>
              <div className={cn("text-lg font-semibold", isToday && "text-primary")}>{format(date, 'd')}</div>
            </div>
            <div className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto pb-6">
              {dayShifts.map(shift => (
                <CalendarShiftCard
                  key={shift.id}
                  shift={shift}
                  variant="standard"
                  brand={brands.find(b => b.id === shift.brand_id)}
                  platform={platforms.find(p => p.id === shift.platform_id)}
                  registrations={registrations.filter(r => r.shift_id === shift.id)}
                  onClick={onShiftClick}
                />
              ))}
              {dayShifts.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded-md m-2 opacity-60">
                  {t('noShifts')}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
