'use client'

import { Shift, Brand, Platform, User, ShiftRegistration, OperationalRole } from '@/lib/types/database.types'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { format, parseISO } from 'date-fns'
import { Calendar } from 'lucide-react'
import { getCurrentBusinessDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { deriveShiftAttention } from '@/lib/ui/operational-attention'
import { OperationalStatusStrip } from '@/components/ui/operational-status'

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
  const getUserName = (userId?: string) => userId ? users.find(u => u.id === userId)?.full_name || t('notAssigned') : t('notAssigned')
  const getStatusLabel = (status: Shift['status']) => t(status === 'live' ? 'liveStatus' : status)
  const staffingName = (userId: string | undefined, importedNames: string[] | undefined) =>
    userId ? getUserName(userId) : importedNames?.join(', ') || t('notAssigned')

  const sortedShifts = [...shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.start_time.localeCompare(b.start_time)
  })

  if (sortedShifts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <p className="text-lg">No shifts found matching your criteria</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortedShifts.map((shift) => {
        const isSelected = selectedShiftIds?.has(shift.id) ?? false
        return (
          <div
            key={shift.id}
            className={`w-full rounded-lg border p-4 text-left transition-all hover:shadow-lg flex items-center gap-3 ${
              isSelected ? 'bg-blue-50/50 border-blue-300' : ''
            }`}
            data-testid={`list-shift-${shift.id}`}
            style={{ borderLeft: `4px solid ${getBrandColor(shift.brand_id)}` }}
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
              aria-label={`${shift.title || getBrandName(shift.brand_id)} · ${formatShiftTimeRange(shift)} · ${getStatusLabel(shift.status)}`}
              className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              onClick={() => onShiftClick?.(shift)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6 flex-1">
                  <div className="text-sm font-semibold min-w-[110px]">
                    {format(new Date(shift.date), 'MMM d, yyyy')}
                  </div>
                  <div className="min-w-[150px] text-sm font-medium">{formatShiftTimeRange(shift)}</div>
                  <div className="min-w-[150px] text-sm font-semibold text-gray-900">{shift.title?.trim() || `${getBrandName(shift.brand_id)} live`}</div>
                  <div className="text-sm text-gray-700">{getBrandName(shift.brand_id)}</div>
                  <div className="text-sm text-gray-600">{getPlatformName(shift.platform_id)}</div>
                  <div className="text-sm text-gray-500"><span className="font-medium">{t('studio')}:</span> {shift.studio || t('notUpdated')}</div>
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">{t('importHostNames')}:</span> {staffingName(shift.host_id, shift.host_names)}
                  </div>
                  <div className="text-sm text-gray-500"><span className="font-medium">{t('importAssistantNames')}:</span> {staffingName(shift.support_id, shift.assistant_names)}</div>
                  <div className="text-sm text-gray-500"><span className="font-medium">{t('importTechnicalNames')}:</span> {staffingName(shift.technical_id, shift.technical_names)}</div>
                </div>
                <Badge variant={shift.status === 'live' ? 'destructive' : shift.status === 'completed' ? 'default' : 'secondary'}>
                  {getStatusLabel(shift.status)}
                </Badge>
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
              <ShiftRegistrationActions
                allShifts={allShifts}
                compact
                currentUser={currentUser}
                onRegister={role => onRegister(shift.id, role)}
                registrations={registrations}
                shift={shift}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
