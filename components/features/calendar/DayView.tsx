'use client'

import { format } from 'date-fns'
import { Shift, Brand, Platform, ShiftRegistration } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { CalendarShiftCard } from './CalendarShiftCard'

interface DayViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  registrations: ShiftRegistration[]
  onShiftClick?: (shift: Shift) => void
}

export function DayView({ currentDate, shifts, brands, platforms, registrations, onShiftClick }: DayViewProps) {
  const { t } = useTranslation()
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dayShifts = shifts.filter(s => s.date === dateStr).sort((a,b) => a.start_time.localeCompare(b.start_time))

  return (
    <div className="h-full max-w-3xl mx-auto py-6 px-4">
      <div className="mb-6 pb-4 border-b">
        <h2 className="text-2xl font-bold">{format(currentDate, 'EEEE, MMMM d, yyyy')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{dayShifts.length} {t('shiftsScheduled')}</p>
      </div>

      <div className="flex flex-col gap-4">
        {dayShifts.map(shift => (
          <CalendarShiftCard
            key={shift.id}
            shift={shift}
            variant="expanded"
            brand={brands.find(b => b.id === shift.brand_id)}
            platform={platforms.find(p => p.id === shift.platform_id)}
            registrations={registrations.filter(r => r.shift_id === shift.id)}
            onClick={onShiftClick}
          />
        ))}

        {dayShifts.length === 0 && (
          <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg bg-muted/10">
            {t('noShifts')}
          </div>
        )}
      </div>
    </div>
  )
}
