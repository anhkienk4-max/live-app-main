'use client'

import * as React from 'react'
import { Shift, Brand, Platform, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { ShiftCard } from '@/components/features/shifts/ShiftCard'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from 'lucide-react'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'

import { CalendarFilterContext } from '@/lib/utils/calendarFilters'

interface ListViewProps {
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  registrations?: ShiftRegistration[]
  allShifts?: Shift[]
  currentUser?: User | null
  onRegister?: (shiftId: string, role: OperationalRole) => Promise<void>
  onShiftClick?: (shift: Shift) => void
  selectedShiftIds?: Set<string>
  onToggleSelectShift?: (shiftId: string) => void
}

export function ListView({
  shifts,
  brands,
  platforms,
  /* users not needed in UI directly anymore but kept for prop consistency */
  registrations = [],
  allShifts = shifts,
  currentUser = null,
  onRegister,
  onShiftClick,
  selectedShiftIds,
  onToggleSelectShift,
}: ListViewProps) {
  const context: CalendarFilterContext = { currentDate: new Date(), brands, platforms, registrations }
  const brandsById = React.useMemo(() => new Map(brands.map(brand => [brand.id, brand])), [brands])

  const sortedShifts = React.useMemo(() => [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  }), [shifts])
  const rows = React.useMemo(() => sortedShifts.map(shift => {
    return {
      shift,
      brandColor: brandsById.get(shift.brand_id)?.color || '#2563EB'
    }
  }), [brandsById, sortedShifts])

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground bg-background rounded-lg border border-dashed">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-lg">No shifts found matching your criteria</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map(({ brandColor, shift }) => {
        const isSelected = selectedShiftIds?.has(shift.id) ?? false
        return (
          <div
            key={shift.id}
            className={`w-full rounded-xl border p-4 text-left shadow-sm transition-all flex items-center gap-4 bg-background border-l-4 hover:shadow focus-within:ring-2 focus-within:ring-ring ${
              isSelected ? 'bg-primary/5 border-primary/20' : ''
            }`}
            data-testid={`list-shift-${shift.id}`}
            style={{ borderLeftColor: brandColor }}
          >
            {onToggleSelectShift && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelectShift(shift.id)}
                aria-label={`Select shift ${shift.title || shift.id}`}
                className="shrink-0"
              />
            )}
            <ShiftCard shift={(shift)} variant="expanded" onClick={() => onShiftClick?.((shift))} context={context} showDate={true} />
            {onRegister && (
              <div className="shrink-0 border-l pl-4">
                <ShiftRegistrationActions
                  allShifts={allShifts}
                  compact
                  currentUser={currentUser}
                  onRegister={role => onRegister(shift.id, role)}
                  registrations={registrations}
                  shift={shift}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
