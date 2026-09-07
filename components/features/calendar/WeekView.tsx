'use client'

import { Shift, Brand, Platform, User, ShiftRegistration } from '@/lib/types/database.types'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
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

export function WeekView({ currentDate, shifts, brands, users, registrations, onShiftClick }: WeekViewProps) {
  const { t } = useTranslation()
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  const getShiftsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return shifts.filter(s => s.date === dateStr)
  }

  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'

  const renderStaffingChips = (shift: Shift) => {
    const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
    const labels = resolveStaffingLabels(shift, shiftRegistrations, users, t)
    if (labels.length === 0) return null
    const confirmedLabels = labels.filter(l => !l.isUnassigned)
    const unassignedLabels = labels.filter(l => l.isUnassigned)
    return (
      <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
        {confirmedLabels.map((lbl, idx) => (
          <span
            key={lbl.id + idx}
            className="text-[9px] px-1 py-0.5 rounded-sm bg-background border border-border text-foreground truncate max-w-full"
          >
            {lbl.name}
          </span>
        ))}
        {unassignedLabels.map((lbl, idx) => (
          <span
            key={lbl.id + 'u' + idx}
            className="text-[9px] px-1 py-0.5 rounded-sm border border-transparent text-muted-foreground italic truncate max-w-full"
          >
            {lbl.name}
          </span>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* DESKTOP: Horizontally scrollable 7-column grid with 140px min column width */}
      <div className="hidden sm:block overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="grid min-w-[980px]" style={{ gridTemplateColumns: 'repeat(7, minmax(140px, 1fr))' }}>
          {weekDays.map((day) => {
            const dayShifts = getShiftsForDate(day)
            const isToday = isSameDay(day, today)
            return (
              <div
                key={day.toString()}
                className={`min-h-[260px] border-r last:border-r-0 border-border px-2 pb-3 ${isToday ? 'bg-primary/[0.03]' : ''}`}
              >
                <div className={`flex items-center gap-1.5 py-2 mb-2 border-b ${isToday ? 'border-primary/20' : 'border-border/40'}`}>
                  <span className={`text-[10px] uppercase tracking-wider font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={`text-sm font-semibold h-5 w-5 flex items-center justify-center rounded-full shrink-0 ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayShifts.length > 0 && (
                    <span className="ml-auto text-[9px] text-muted-foreground">
                      {dayShifts.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {dayShifts.map((shift) => (
                    <button
                      type="button"
                      key={shift.id}
                      className="w-full flex flex-col rounded-md p-2 text-left text-sm transition-all bg-background border-l-[3px] border-y border-r border-border hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`week-shift-${shift.id}`}
                      style={{ borderLeftColor: getBrandColor(shift.brand_id) }}
                      onClick={() => onShiftClick?.(shift)}
                    >
                      <div className="flex items-center justify-between w-full gap-1 mb-0.5">
                        <span className="font-semibold text-[11px] leading-tight text-foreground whitespace-nowrap">
                          {formatShiftTimeRange(shift)}
                        </span>
                        <span className="shrink-0">
                          <ShiftStatusBadge status={shift.status} className="text-[9px] h-4 px-1 border-none" />
                        </span>
                      </div>
                      <div className="text-[11px] font-medium text-foreground truncate leading-tight mb-0.5">
                        {getBrandName(shift.brand_id)}
                      </div>
                      {shift.studio && (
                        <div className="text-[10px] text-muted-foreground truncate leading-tight mb-1">
                          {shift.studio}
                        </div>
                      )}
                      {renderStaffingChips(shift)}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* MOBILE: Compact date-grouped agenda — no full-height day columns, no dead space */}
      <div className="sm:hidden divide-y divide-border/50">
        {weekDays.map((day) => {
          const dayShifts = getShiftsForDate(day)
          const isToday = isSameDay(day, today)
          return (
            <div key={day.toString()} className={isToday ? 'bg-primary/[0.03]' : ''}>
              <div className={`flex items-center gap-2 px-1 py-2 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className="text-[10px] uppercase tracking-wider font-semibold">
                  {format(day, 'EEE')}
                </span>
                <span className={`text-sm font-bold h-5 w-5 flex items-center justify-center rounded-full shrink-0 ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>
                  {format(day, 'd')}
                </span>
                <span className="text-[10px] text-muted-foreground">{format(day, 'MMM d')}</span>
                {dayShifts.length === 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground/50 italic">{t('noShiftsScheduled')}</span>
                )}
              </div>
              {dayShifts.length > 0 && (
                <div className="px-1 pb-2 space-y-1">
                  {dayShifts.map((shift) => {
                    const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
                    const labels = resolveStaffingLabels(shift, shiftRegistrations, users, t)
                    const confirmedLabels = labels.filter(l => !l.isUnassigned)
                    const unassignedLabels = labels.filter(l => l.isUnassigned)
                    return (
                      <button
                        type="button"
                        key={shift.id}
                        className="w-full text-left flex items-start gap-2 py-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted/20"
                        data-testid={`week-shift-mobile-${shift.id}`}
                        onClick={() => onShiftClick?.(shift)}
                      >
                        <span
                          className="shrink-0 mt-1 w-[3px] rounded-full self-stretch"
                          style={{ backgroundColor: getBrandColor(shift.brand_id) }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                              {formatShiftTimeRange(shift)}
                            </span>
                            <ShiftStatusBadge status={shift.status} className="text-[9px] h-4 px-1 shrink-0 border-none" />
                          </div>
                          <div className="text-xs font-medium text-foreground truncate">
                            {getBrandName(shift.brand_id)}
                          </div>
                          {shift.studio && (
                            <div className="text-[10px] text-muted-foreground truncate">
                              {shift.studio}
                            </div>
                          )}
                          {labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {confirmedLabels.map((lbl, idx) => (
                                <span key={lbl.id + idx} className="text-[9px] px-1 py-0.5 rounded-sm bg-muted/50 border border-border text-foreground">
                                  {lbl.name}
                                </span>
                              ))}
                              {unassignedLabels.map((lbl, idx) => (
                                <span key={lbl.id + 'u' + idx} className="text-[9px] px-1 py-0.5 text-muted-foreground italic">
                                  {lbl.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
