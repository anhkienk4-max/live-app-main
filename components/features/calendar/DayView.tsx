'use client'

import { format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import type { Shift, Brand, Platform, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { shiftsForGridDate } from '@/lib/utils/timeGrid'
import { ShiftCard } from '@/components/features/shifts/ShiftCard'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/permissions'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'

interface DayViewProps {
  currentDate: Date
  shifts: Shift[]
  allShifts?: Shift[]
  onRegister?: (shiftId: string, role: OperationalRole) => Promise<void>
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  registrations?: ShiftRegistration[]
  currentUser?: User | null
  onShiftClick?: (shift: Shift) => void
  hasActiveFilters?: boolean
  onClearFilters?: () => void
  onCreateShift?: () => void
}

export function DayView({ currentDate, shifts, allShifts = shifts, onRegister, brands, platforms, registrations = [], currentUser = null, onShiftClick, hasActiveFilters = false, onClearFilters, onCreateShift }: DayViewProps) {
  const { t, language } = useTranslation()
  const dayShifts = shiftsForGridDate(shifts, format(currentDate, 'yyyy-MM-dd'))
  const context = { currentDate, brands, platforms, registrations }
  return <section className="space-y-3 p-3" aria-label={t('day')}>
    <h3 className="text-base font-semibold">{format(currentDate, 'EEEE, dd/MM/yyyy', { locale: language === 'vi' ? vi : enUS })} · {dayShifts.length} {t('totalShifts')}</h3>
    {!dayShifts.length && <div className="space-y-3 py-8 text-center">
      <p className="text-sm text-muted-foreground">{t('noShiftsScheduled')}</p>
      {hasActiveFilters ? <Button variant="outline" onClick={onClearFilters}>{t('resetFilters')}</Button>
        : hasPermission(currentUser, 'shifts.edit') && <Button onClick={onCreateShift}>{t('newShift')}</Button>}
    </div>}
    {dayShifts.map(({ shift, start_time, continuation }) => <div key={shift.id} className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-start gap-2" data-testid={`day-shift-${shift.id}`}>
      <time className="pt-3 text-xs font-medium text-muted-foreground">{start_time.slice(0, 5)}</time>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium">{formatShiftTimeRange(shift)}</p>
        {continuation && <p className="text-xs text-muted-foreground">{language === 'vi' ? 'Tiếp từ ngày' : 'Continues from'} {shift.date}</p>}
        <ShiftCard shift={shift} variant="compact" context={context} onClick={() => onShiftClick?.(shift)} />
        {currentUser && onRegister && <ShiftRegistrationActions shift={shift} currentUser={currentUser} allShifts={allShifts} registrations={registrations} onRegister={role => onRegister(shift.id, role)} />}
      </div>
    </div>)}
  </section>
}
