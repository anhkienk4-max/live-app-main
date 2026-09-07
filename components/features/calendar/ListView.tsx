'use client'

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
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'
  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getRoleStaffingNames = (shift: Shift, role: OperationalRole) => {
    return resolveStaffingLabelsForRole(shift, registrations, users, role, t)
      .map(l => l.name)
      .join(', ')
  }

  const sortedShifts = [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  })

  if (sortedShifts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground bg-background rounded-lg border border-dashed">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-lg">No shifts found matching your criteria</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sortedShifts.map((shift) => {
        const isSelected = selectedShiftIds?.has(shift.id) ?? false
        return (
          <div
            key={shift.id}
            className={`w-full rounded-xl border p-4 text-left shadow-sm transition-all flex items-center gap-4 bg-background border-l-4 hover:shadow focus-within:ring-2 focus-within:ring-ring ${
              isSelected ? 'bg-primary/5 border-primary/20' : ''
            }`}
            data-testid={`list-shift-${shift.id}`}
            style={{ borderLeftColor: getBrandColor(shift.brand_id) }}
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
                  <div className="text-sm font-semibold text-foreground">{getBrandName(shift.brand_id)}</div>
                  <div className="text-sm text-muted-foreground">{getPlatformName(shift.platform_id)}</div>
                  <div className="text-sm text-muted-foreground"><span className="font-medium mr-1">{t('studio')}:</span> {shift.studio || t('notUpdated')}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium mr-1">{t('importHostNames')}:</span> {getRoleStaffingNames(shift, 'host')}
                  </div>
                  <div className="text-sm text-muted-foreground"><span className="font-medium mr-1">{t('importAssistantNames')}:</span> {getRoleStaffingNames(shift, 'support')}</div>
                  <div className="text-sm text-muted-foreground"><span className="font-medium mr-1">{t('importTechnicalNames')}:</span> {getRoleStaffingNames(shift, 'technical')}</div>
                </div>
                <div className="ml-4 shrink-0">
                  <ShiftStatusBadge status={shift.status} />
                </div>
              </div>
              {/* E5 Exception Strip */}
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
                  <div className="mt-3 pr-4">
                    <OperationalStatusStrip items={attention} compact />
                  </div>
                )
              })()}
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
