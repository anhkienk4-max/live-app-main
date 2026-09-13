'use client'

import { Shift, Brand, Platform, User, ShiftRegistration } from '@/lib/types/database.types'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { format, startOfWeek, addDays, isSameDay } from 'date-fns'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { resolveStaffingLabels } from '@/lib/utils/staffingResolver'

type StaffingLabel = { id: string; name: string; isUnassigned?: boolean }

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

  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown Brand'
  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#ccc'

  const renderStaffingChips = (shift: Shift) => {
    const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
    const labels = resolveStaffingLabels(shift, shiftRegistrations, users, t)

    if (labels.length === 0) return null

    const confirmedLabels = labels.filter((l: StaffingLabel) => !l.isUnassigned)
    const unassignedLabels = labels.filter((l: StaffingLabel) => l.isUnassigned)

    return (
      <div className="flex flex-col gap-0.5 mt-1.5 pt-1.5 border-t border-border/40">
        {confirmedLabels.map((lbl: StaffingLabel, idx: number) => (
          <span
            key={lbl.id + idx}
            className="text-[10px] font-medium leading-none text-foreground truncate max-w-full"
          >
            {lbl.name}
          </span>
        ))}
        {unassignedLabels.map((lbl: StaffingLabel, idx: number) => (
          <span
            key={lbl.id + 'u' + idx}
            className="text-[10px] font-medium leading-none text-destructive/90 italic truncate max-w-full"
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
                className={`min-h-[260px] border-r last:border-r-0 border-border px-1.5 pb-3 ${isToday ? 'bg-primary/[0.02]' : ''}`}
              >
                <div className={`flex items-center gap-1.5 py-1.5 mb-2 border-b ${isToday ? 'border-primary/40' : 'border-border'}`}>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={`text-sm font-bold shrink-0 ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </span>
                  {dayShifts.length > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground font-medium">
                      {dayShifts.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayShifts.map((shift) => (
                    <button
                      type="button"
                      key={shift.id}
                      className="w-full flex flex-col rounded-sm p-1.5 text-left text-sm transition-colors bg-card/50 border-l-[3px] border-y border-r border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-sm"
                      data-testid={`week-shift-${shift.id}`}
                      style={{ borderLeftColor: getBrandColor(shift.brand_id) }}
                      onClick={() => onShiftClick?.(shift)}
                    >
                      <div className="flex items-start justify-between w-full gap-1 mb-1">
                        <span className="font-semibold text-[11px] leading-none text-foreground tracking-tight whitespace-nowrap">
                          {formatShiftTimeRange(shift)}
                        </span>
                        <span className="shrink-0 leading-none">
                          <ShiftStatusBadge status={shift.status} className="text-[9px] h-3.5 px-1 py-0 rounded-sm border-border/50" />
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
                        {getBrandName(shift.brand_id)}
                      </div>
                      {shift.studio && (
                        <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
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

      {/* MOBILE: Compact date-grouped agenda */}
      <div className="sm:hidden divide-y divide-border">
        {weekDays.map((day) => {
          const dayShifts = getShiftsForDate(day)
          const isToday = isSameDay(day, today)
          return (
            <div key={day.toString()} className={isToday ? 'bg-primary/[0.02]' : ''}>
              <div className={`flex items-baseline gap-2 px-2 py-1.5 ${isToday ? 'text-primary bg-primary/[0.03]' : 'text-muted-foreground bg-muted/10'}`}>
                <span className="text-[11px] uppercase tracking-wider font-bold">
                  {format(day, 'EEE')}
                </span>
                <span className={`text-base font-bold shrink-0 ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {format(day, 'd')}
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">{format(day, 'MMM')}</span>
                {dayShifts.length === 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground/60 italic">{t('noShiftsScheduled')}</span>
                )}
              </div>
              {dayShifts.length > 0 && (
                <div className="px-2 py-1.5 space-y-1.5">
                  {dayShifts.map((shift) => {
                    const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
                    const labels = resolveStaffingLabels(shift, shiftRegistrations, users, t)
                    const confirmedLabels = labels.filter((l: StaffingLabel) => !l.isUnassigned)
                    const unassignedLabels = labels.filter((l: StaffingLabel) => l.isUnassigned)
                    return (
                      <button
                        type="button"
                        key={shift.id}
                        className="w-full text-left flex items-stretch gap-2 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-muted/20"
                        data-testid={`week-shift-mobile-${shift.id}`}
                        onClick={() => onShiftClick?.(shift)}
                      >
                        <div
                          className="shrink-0 w-[3px] rounded-sm"
                          style={{ backgroundColor: getBrandColor(shift.brand_id) }}
                        />
                        <div className="min-w-0 flex-1 py-0.5">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-[12px] font-semibold text-foreground whitespace-nowrap">
                              {formatShiftTimeRange(shift)}
                            </span>
                            <ShiftStatusBadge status={shift.status} className="text-[9px] h-4 px-1.5 rounded-sm border-border/50 shrink-0" />
                          </div>
                          <div className="text-[12px] font-medium text-foreground line-clamp-2" title={getBrandName(shift.brand_id)}>
                            {getBrandName(shift.brand_id)}
                          </div>
                          {shift.studio && (
                            <div className="text-[11px] text-muted-foreground truncate" title={shift.studio}>
                              {shift.studio}
                            </div>
                          )}
                          {labels.length > 0 && (
                            <div className="flex flex-col gap-0.5 mt-1 border-t border-border/40 pt-1">
                              {confirmedLabels.map((lbl: StaffingLabel, idx: number) => (
                                <span key={lbl.id + idx} className="text-[11px] font-medium leading-tight text-foreground truncate" title={lbl.name}>
                                  {lbl.name}
                                </span>
                              ))}
                              {unassignedLabels.map((lbl: StaffingLabel, idx: number) => (
                                <span key={lbl.id + 'u' + idx} className="text-[11px] font-medium leading-tight text-destructive/90 italic truncate" title={lbl.name}>
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
