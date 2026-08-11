'use client'

import { addDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { enUS, vi } from 'date-fns/locale'
import { Brand, Platform, Shift } from '@/lib/types/database.types'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'

interface MonthViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  onShiftClick?: (shift: Shift) => void
  onDayClick?: (date: Date) => void
}

export const MONTH_VISIBLE_EVENT_LIMITS = {
  narrow: 1,
  medium: 2,
  large: 3,
} as const

export function shiftsForCalendarDate(shifts: Shift[], date: Date) {
  const dateValue = format(date, 'yyyy-MM-dd')
  return shifts
    .filter(shift => shift.date === dateValue)
    .sort((left, right) =>
      left.start_time.localeCompare(right.start_time) ||
      (left.title || left.id).localeCompare(right.title || right.id),
    )
}

export function MonthView({
  currentDate,
  shifts,
  brands,
  platforms: _platforms,
  onShiftClick,
  onDayClick,
}: MonthViewProps) {
  const { language, t } = useTranslation()
  const locale = language === 'vi' ? vi : enUS
  const monthStart = startOfMonth(currentDate)
  const startDate = startOfWeek(monthStart)
  const endDate = endOfWeek(endOfMonth(monthStart))
  const calendarDays: Date[] = []

  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    calendarDays.push(day)
  }

  const brandColor = (brandId: string) =>
    brands.find(brand => brand.id === brandId)?.color || '#2563EB'
  const brandName = (brandId: string) =>
    brands.find(brand => brand.id === brandId)?.name || ''

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-lg border border-b-0 bg-border">
        {Array.from({ length: 7 }, (_, index) => addDays(startDate, index)).map(day => (
          <div className="min-w-0 bg-muted/60 px-1 py-2 text-center text-xs font-semibold text-muted-foreground sm:text-sm" key={day.toISOString()}>
            {format(day, 'EEE', { locale })}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border bg-border">
        {calendarDays.map(day => {
          const dayShifts = shiftsForCalendarDate(shifts, day)
          const currentMonth = isSameMonth(day, monthStart)
          const currentDay = isToday(day)
          return (
            <div
              className={`h-36 min-w-0 overflow-hidden bg-background p-1.5 sm:h-40 sm:p-2 lg:h-44 ${
                currentMonth ? '' : 'bg-muted/40 text-muted-foreground'
              } ${currentDay ? 'ring-2 ring-inset ring-primary' : ''}`}
              data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
              key={day.toISOString()}
              onClick={() => onDayClick?.(day)}
            >
              <button
                aria-label={t('openDaySessions', { date: format(day, 'PP', { locale }) })}
                className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  currentDay ? 'bg-primary text-primary-foreground' : ''
                }`}
                data-testid={`calendar-day-open-${format(day, 'yyyy-MM-dd')}`}
                onClick={event => {
                  event.stopPropagation()
                  onDayClick?.(day)
                }}
                type="button"
              >
                {format(day, 'd')}
              </button>

              <div className="min-w-0 space-y-1">
                {dayShifts.slice(0, MONTH_VISIBLE_EVENT_LIMITS.large).map((shift, index) => {
                  const crossesMidnight = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)?.crossesMidnight
                  const title = shift.title || `${brandName(shift.brand_id)} live`
                  const displayTitle = shift.studio ? `${title} · ${shift.studio}` : title
                  const visibility = index === 1 ? 'hidden md:flex' : index === 2 ? 'hidden lg:flex' : 'flex'
                  return (
                    <button
                      className={`${visibility} h-7 w-full min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 text-left text-[11px] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                      data-testid={`calendar-event-${shift.id}`}
                      key={shift.id}
                      onClick={event => {
                        event.stopPropagation()
                        onShiftClick?.(shift)
                      }}
                      style={{
                        backgroundColor: `${brandColor(shift.brand_id)}20`,
                        borderLeft: `3px solid ${brandColor(shift.brand_id)}`,
                      }}
                      title={`${shift.start_time}${crossesMidnight ? ' → +1' : ''} · ${displayTitle} · ${shift.status}`}
                      type="button"
                    >
                      <span className="shrink-0 font-semibold">{shift.start_time}{crossesMidnight ? ' +1' : ''}</span>
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap">{displayTitle}</span>
                      <span
                        aria-label={shift.status}
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          shift.status === 'live'
                            ? 'bg-red-500'
                            : shift.status === 'completed'
                              ? 'bg-green-500'
                              : shift.status === 'cancelled'
                                ? 'bg-gray-400'
                                : 'bg-blue-500'
                        }`}
                        title={shift.status}
                      />
                    </button>
                  )
                })}

                {dayShifts.length > MONTH_VISIBLE_EVENT_LIMITS.narrow && (
                  <button
                    className="block w-full truncate rounded px-1 text-center text-[11px] text-muted-foreground hover:bg-muted md:hidden"
                    data-testid={`calendar-more-narrow-${format(day, 'yyyy-MM-dd')}`}
                    onClick={event => {
                      event.stopPropagation()
                      onDayClick?.(day)
                    }}
                    type="button"
                  >
                    {t('moreSessions', { count: dayShifts.length - MONTH_VISIBLE_EVENT_LIMITS.narrow })}
                  </button>
                )}
                {dayShifts.length > MONTH_VISIBLE_EVENT_LIMITS.medium && (
                  <button
                    className="hidden w-full truncate rounded px-1 text-center text-[11px] text-muted-foreground hover:bg-muted md:block lg:hidden"
                    data-testid={`calendar-more-medium-${format(day, 'yyyy-MM-dd')}`}
                    onClick={event => {
                      event.stopPropagation()
                      onDayClick?.(day)
                    }}
                    type="button"
                  >
                    {t('moreSessions', { count: dayShifts.length - MONTH_VISIBLE_EVENT_LIMITS.medium })}
                  </button>
                )}
                {dayShifts.length > MONTH_VISIBLE_EVENT_LIMITS.large && (
                  <button
                    className="hidden w-full truncate rounded px-1 text-center text-[11px] text-muted-foreground hover:bg-muted lg:block"
                    data-testid={`calendar-more-large-${format(day, 'yyyy-MM-dd')}`}
                    onClick={event => {
                      event.stopPropagation()
                      onDayClick?.(day)
                    }}
                    type="button"
                  >
                    {t('moreSessions', { count: dayShifts.length - MONTH_VISIBLE_EVENT_LIMITS.large })}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
