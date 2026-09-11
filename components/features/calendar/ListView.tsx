'use client'

import * as React from 'react'
import { Shift, Brand, Platform, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { format } from 'date-fns'
import { Calendar } from 'lucide-react'
import { getCurrentBusinessDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { deriveShiftAttention } from '@/lib/ui/operational-attention'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'

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
  const brandsById = React.useMemo(() => new Map(brands.map(brand => [brand.id, brand])), [brands])
  const platformsById = React.useMemo(() => new Map(platforms.map(platform => [platform.id, platform])), [platforms])
  const usersById = React.useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const registrationsByShiftId = React.useMemo(() => {
    const byShiftId = new Map<string, ShiftRegistration[]>()
    registrations.forEach(registration => {
      const shiftRegistrations = byShiftId.get(registration.shift_id) ?? []
      shiftRegistrations.push(registration)
      byShiftId.set(registration.shift_id, shiftRegistrations)
    })
    return byShiftId
  }, [registrations])

  const sortedShifts = React.useMemo(() => [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  }), [shifts])
  const todayDate = getCurrentBusinessDate()

  const rows = React.useMemo(() => sortedShifts.map(shift => {
    const shiftRegistrations = registrationsByShiftId.get(shift.id) ?? []
    let pendingCount = 0
    const staffed = { host: 0, support: 0, technical: 0 }
    for (const registration of shiftRegistrations) {
      if (registration.status === 'pending') pendingCount += 1
      if (isStaffedRegistration(registration)) staffed[registration.operational_role] += 1
    }

    const staffingNames = {
      host: resolveStaffingLabelsForRole(shift, shiftRegistrations, users, 'host', t, usersById).map(label => label.name).join(', '),
      support: resolveStaffingLabelsForRole(shift, shiftRegistrations, users, 'support', t, usersById).map(label => label.name).join(', '),
      technical: resolveStaffingLabelsForRole(shift, shiftRegistrations, users, 'technical', t, usersById).map(label => label.name).join(', '),
    }
    const required = {
      host: shift.required_host_count ?? 1,
      support: shift.required_support_count ?? 0,
      technical: shift.required_technical_count ?? 0,
    }
    const attention = deriveShiftAttention({
      shiftId: shift.id,
      shiftDate: shift.date,
      shiftStatus: shift.status,
      pendingCount,
      isUpcoming: shift.date >= todayDate,
      required,
      staffed,
    })

    return {
      shift,
      brandColor: brandsById.get(shift.brand_id)?.color || '#2563EB',
      brandName: brandsById.get(shift.brand_id)?.name || 'Unknown',
      platformName: platformsById.get(shift.platform_id)?.name || 'Unknown',
      staffingNames,
      attention,
    }
  }), [brandsById, platformsById, registrationsByShiftId, sortedShifts, t, todayDate, users, usersById])

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
      {rows.map(({ attention, brandColor, brandName, platformName, shift, staffingNames }) => {
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
            <button
              type="button"
              className="flex-1 text-left focus-visible:outline-none rounded"
              onClick={() => onShiftClick?.(shift)}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 flex-1">
                  <div className="text-sm font-semibold min-w-[110px] text-foreground">
                    {format(new Date(shift.date), 'MMM d, yyyy')}
                  </div>
                  <div className="min-w-[150px] text-sm font-semibold tracking-tight">{formatShiftTimeRange(shift)}</div>
                  <div className="text-sm font-semibold text-foreground">{brandName}</div>
                  <div className="text-sm text-muted-foreground">{platformName}</div>
                  <div className="text-sm text-muted-foreground"><span className="font-medium mr-1">{t('studio')}:</span> {shift.studio || t('notUpdated')}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium mr-1">{t('importHostNames')}:</span> {staffingNames.host}
                  </div>
                  <div className="text-sm text-muted-foreground"><span className="font-medium mr-1">{t('importAssistantNames')}:</span> {staffingNames.support}</div>
                  <div className="text-sm text-muted-foreground"><span className="font-medium mr-1">{t('importTechnicalNames')}:</span> {staffingNames.technical}</div>
                </div>
                <div className="ml-4 shrink-0">
                  <ShiftStatusBadge status={shift.status} />
                </div>
              </div>
              {/* E5 Exception Strip */}
              {attention.length > 0 && (
                <div className="mt-3 pr-4">
                  <OperationalStatusStrip items={attention} compact />
                </div>
              )}
            </button>
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
