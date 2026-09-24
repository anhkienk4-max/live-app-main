'use client'

import { format } from 'date-fns'
import { Shift, Brand, Platform, User, ShiftRegistration } from '@/lib/types/database.types'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { Clock, User as UserIcon } from 'lucide-react'
import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { deriveShiftAttention } from '@/lib/ui/operational-attention'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { TIME_COLUMN_WIDTH, MINUTE_HEIGHT, calculateShiftPosition, calculateOverlaps, getCurrentTimePosition } from '@/lib/utils/timeGrid'
import React from 'react'
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { hasPermission } from "@/lib/permissions"

interface DayViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  registrations?: ShiftRegistration[]
  currentUser?: User | null
  onShiftClick?: (shift: Shift) => void
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onCreateShift?: () => void;
}

export function DayView({
  currentDate,
  shifts,
  brands,
  platforms,
  users,
  registrations = [],
  currentUser = null,
  onShiftClick,
  hasActiveFilters = false,
  onClearFilters,
  onCreateShift,
}: DayViewProps) {
  const { t } = useTranslation()
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dayShifts = shifts.filter(s => s.date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time))

  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const today = new Date();
  const isToday = format(today, 'yyyy-MM-dd') === dateStr;
  const layouts = calculateOverlaps(dayShifts);

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-xl font-bold mb-4 text-foreground">{format(currentDate, 'EEEE, MMMM d, yyyy')}</h3>

      {/* DESKTOP/TABLET: Time Grid */}
      <div className="hidden sm:block overflow-x-auto relative bg-background border rounded-lg shadow-sm" style={{ scrollbarWidth: "thin" }}>
        <div className="min-w-[700px] relative flex">
          {/* Time Axis Column */}
          <div
            className="relative shrink-0 border-r border-border bg-background z-20"
            style={{ width: TIME_COLUMN_WIDTH }}
          >
            {hours.map((hour) => (
              <div
                key={`time-${hour}`}
                className="relative text-right pr-2"
                style={{ height: 60 * MINUTE_HEIGHT }}
              >
                <span className="text-[10px] text-muted-foreground font-medium absolute top-[-7px] right-2 bg-background px-1">
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Horizontal Grid Lines */}
          <div className="absolute inset-0 left-[50px] pointer-events-none flex flex-col z-0">
            {hours.map((hour) => (
              <div
                key={`line-${hour}`}
                className="w-full border-t border-border/40"
                style={{ height: 60 * MINUTE_HEIGHT }}
              />
            ))}
          </div>

          {/* Day Column */}
          <div className="flex-1 relative bg-background z-10">
            {isToday && (
              <div
                className="absolute w-full z-20 pointer-events-none border-t-[1.5px] border-primary"
                style={{
                  top: getCurrentTimePosition(today),
                }}
              >
                <div className="absolute -top-1.5 -left-1 w-3 h-3 rounded-full bg-primary ring-2 ring-background"></div>
                <div className="absolute -top-5 left-3 bg-primary text-primary-foreground px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                  NOW {format(today, 'HH:mm')}
                </div>
              </div>
            )}

            {dayShifts.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
                <div className="text-center p-6 bg-background rounded-xl border shadow-sm max-w-sm">
                  <Clock className="h-8 w-8 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-lg font-medium text-foreground mb-4">
                    {hasActiveFilters ? "No shifts match these filters." : "No shifts scheduled for this day."}
                  </p>
                  {hasActiveFilters ? (
                    <Button variant="outline" onClick={onClearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    currentUser && hasPermission(currentUser, 'shifts.edit') ? (
                      <Button onClick={onCreateShift}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Shift
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('calendar:view', { detail: 'list' }))}>
                        Browse Open Shifts
                      </Button>
                    )
                  )}
                </div>
              </div>
            )}

            {dayShifts.map((shift) => {
              const pos = layouts[shift.id] || calculateShiftPosition(shift.start_time, shift.end_time, shift.crosses_midnight ?? false);
              return (
                <div
                  key={shift.id}
                  className="absolute z-10"
                  style={{
                    top: pos.top,
                    height: pos.height,
                    left: 'left' in pos ? pos.left : '0%',
                    width: 'width' in pos ? pos.width : '100%',
                    paddingLeft: '4px',
                    paddingRight: '4px'
                  }}
                >
                  <div
                    className="w-full h-full rounded-md border bg-card p-2 text-left shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-l-4 overflow-hidden relative flex flex-col"
                    data-testid={`day-shift-${shift.id}`}
                    style={{ borderLeftColor: getBrandColor(shift.brand_id) }}
                  >
                    <button type="button" className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm opacity-0" onClick={() => onShiftClick?.(shift)}>
                      <span className="sr-only">View {shift.title} details</span>
                    </button>
                    <div className="flex flex-col gap-1.5 relative z-20 pointer-events-none h-full">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tracking-tight text-foreground text-sm leading-none">{formatShiftTimeRange(shift)}</span>
                          <ShiftStatusBadge status={shift.status} className="scale-75 origin-left" />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground truncate leading-none">
                        <span className="text-foreground font-medium">{getBrandName(shift.brand_id)}</span>
                        <span>{getPlatformName(shift.platform_id)}</span>
                      </div>

                      {/* We only render compact staffing if there's enough height (e.g. > 60 mins) */}
                      {pos.height >= 72 && (
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          {(shift.required_host_count ?? 0) > 0 && (
                            <div className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3 text-blue-600" />
                              <span className="font-medium text-foreground">{shift.required_host_count}</span>
                            </div>
                          )}
                          {(shift.required_support_count ?? 0) > 0 && (
                            <div className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3 text-green-600" />
                              <span className="font-medium text-foreground">{shift.required_support_count}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {(() => {
                        const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
                        const pendingCount = shiftRegistrations.filter(r => r.status === 'pending').length
                        const todayDate = getCurrentBusinessDate()
                        const isUpcoming = shift.date >= todayDate

                        const required = {
                          host: shift.required_host_count ?? 1,
                          support: shift.required_support_count ?? 0,
                          technical: shift.required_technical_count ?? 0,
                        }
                        const staffed = {
                          host: shiftRegistrations.filter(r => r.operational_role === 'host' && isStaffedRegistration(r)).length,
                          support: shiftRegistrations.filter(r => r.operational_role === 'support' && isStaffedRegistration(r)).length,
                          technical: shiftRegistrations.filter(r => r.operational_role === 'technical' && isStaffedRegistration(r)).length,
                        }

                        const attention = deriveShiftAttention({
                          shiftId: shift.id,
                          shiftDate: shift.date,
                          shiftStatus: shift.status,
                          pendingCount,
                          isUpcoming,
                          required,
                          staffed,
                        })
                        if (attention.length === 0) return null
                        return (
                          <div className="mt-auto shrink-0 overflow-hidden">
                            <OperationalStatusStrip items={attention} compact />
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* MOBILE: Stacked Cards */}
      <div className="sm:hidden space-y-4">
        {dayShifts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-background rounded-lg border border-dashed">
            <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg">No shifts scheduled for this day</p>
          </div>
        ) : (
          dayShifts.map((shift) => (
            <div
              key={`mob-${shift.id}`}
              className="w-full rounded-xl border bg-background p-4 text-left shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-l-4"
              data-testid={`mob-day-shift-${shift.id}`}
              style={{ borderLeftColor: getBrandColor(shift.brand_id) }}
            >
              <button type="button" className="w-full text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm" onClick={() => onShiftClick?.(shift)}>
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between border-b pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-semibold tracking-tight text-foreground">{formatShiftTimeRange(shift)}</span>
                    <ShiftStatusBadge status={shift.status} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground mb-1">
                  <div>
                    <span className="font-medium mr-2">{t('brand')}:</span>
                    <span className="text-foreground">{getBrandName(shift.brand_id)}</span>
                  </div>
                  <div>
                    <span className="font-medium mr-2">{t('platform')}:</span>
                    <span className="text-foreground">{getPlatformName(shift.platform_id)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-sm bg-muted/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <UserIcon className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground w-16 shrink-0 font-medium">{t('host')}:</span>
                    <div className="flex flex-wrap gap-1">
                      {resolveStaffingLabelsForRole(shift, registrations, users, 'host', t).map(lbl => (
                        <span key={lbl.id} className={`font-medium ${lbl.isUnassigned ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                          {lbl.name}
                        </span>
                      )).reduce((prev, curr) => <>{prev}{prev ? ', ' : ''}{curr}</>, <></>)}
                    </div>
                  </div>
                </div>

                {(() => {
                  const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
                  const pendingCount = shiftRegistrations.filter(r => r.status === 'pending').length
                  const todayDate = getCurrentBusinessDate()
                  const isUpcoming = shift.date >= todayDate

                  const required = {
                    host: shift.required_host_count ?? 1,
                    support: shift.required_support_count ?? 0,
                    technical: shift.required_technical_count ?? 0,
                  }
                  const staffed = {
                    host: shiftRegistrations.filter(r => r.operational_role === 'host' && isStaffedRegistration(r)).length,
                    support: shiftRegistrations.filter(r => r.operational_role === 'support' && isStaffedRegistration(r)).length,
                    technical: shiftRegistrations.filter(r => r.operational_role === 'technical' && isStaffedRegistration(r)).length,
                  }

                  const attention = deriveShiftAttention({
                    shiftId: shift.id,
                    shiftDate: shift.date,
                    shiftStatus: shift.status,
                    pendingCount,
                    isUpcoming,
                    required,
                    staffed,
                  })
                  if (attention.length === 0) return null
                  return (
                    <div className="mt-2">
                      <OperationalStatusStrip items={attention} compact />
                    </div>
                  )
                })()}
              </div>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
