'use client'

import * as React from 'react'
import { Shift, Brand, Platform, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { ShiftCard } from '@/components/features/shifts/ShiftCard'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from 'lucide-react'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'

import { CalendarFilterContext } from '@/lib/utils/calendarFilters'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { useTranslation } from '@/lib/i18n'

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
  users,
  registrations = [],
  allShifts = shifts,
  currentUser = null,
  onRegister,
  onShiftClick,
  selectedShiftIds,
  onToggleSelectShift,
}: ListViewProps) {
  const { t } = useTranslation()
  const context: CalendarFilterContext = { currentDate: new Date(), brands, platforms, registrations }
  const brandsById = React.useMemo(() => new Map(brands.map(brand => [brand.id, brand])), [brands])
  const usersById = React.useMemo(() => new Map(users.map(user => [user.id, user])), [users])

  const sortedShifts = React.useMemo(() => [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  }), [shifts])
  const rows = React.useMemo(() => sortedShifts.map(shift => {
    return {
      shift,
      brandColor: brandsById.get(shift.brand_id)?.color || '#2563EB',
      staffing: (['host', 'support', 'technical'] as const).map(role => ({ role,
        names: resolveStaffingLabelsForRole(shift, registrations.filter(row => row.shift_id === shift.id), users, role, t, usersById)
          .filter(label => !label.isUnassigned).map(label => label.name).join(', '),
      })),
    }
  }), [brandsById, registrations, sortedShifts, t, users, usersById])

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground bg-background rounded-lg border border-dashed">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-lg">No shifts found matching your criteria</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(({ brandColor, shift, staffing }) => {
        const isSelected = selectedShiftIds?.has(shift.id) ?? false
        return (
          <div
            key={shift.id}
            className={`w-full min-w-0 flex-wrap rounded-lg border p-2 text-left transition-all flex items-center gap-2 bg-background border-l-4 focus-within:ring-2 focus-within:ring-ring ${
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
            <div className="min-w-0 flex-1">
              <p className="px-1.5 text-xs text-muted-foreground">{shift.date.split('-').reverse().join('/')} · {formatShiftTimeRange(shift)}</p>
              <ShiftCard shift={(shift)} variant="compact" users={users} onClick={() => onShiftClick?.((shift))} context={context} className="min-h-10" showDate={true} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 px-1.5 text-xs text-muted-foreground">{staffing.filter(row => row.names).map(row => <p key={row.role}><span>{t(row.role === 'host' ? 'importHostNames' : row.role === 'support' ? 'importAssistantNames' : 'importTechnicalNames')}:</span> {row.names}</p>)}</div>
            </div>
            {onRegister && (
              <div className="shrink-0 sm:border-l sm:pl-2">
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
