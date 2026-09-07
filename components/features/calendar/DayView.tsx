'use client'

import { format } from 'date-fns'
import { Shift, Brand, Platform, User, ShiftRegistration } from '@/lib/types/database.types'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'
import { Clock, User as UserIcon } from 'lucide-react'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'
import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { deriveShiftAttention } from '@/lib/ui/operational-attention'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'

interface DayViewProps {
  currentDate: Date
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  registrations?: ShiftRegistration[]
  allShifts?: Shift[]
  currentUser?: User | null
  onRegister?: (shiftId: string, role: ShiftRegistration['operational_role']) => Promise<void>
  onShiftClick?: (shift: Shift) => void
}

export function DayView({ currentDate, shifts, brands, platforms, users, registrations = [], allShifts = shifts, currentUser = null, onRegister, onShiftClick }: DayViewProps) {
  const { t } = useTranslation()
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const dayShifts = shifts.filter(s => s.date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time))

  const getBrandColor = (brandId: string) => brands.find(b => b.id === brandId)?.color || '#2563EB'
  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'

  return (
    <div>
      <h3 className="text-xl font-bold mb-4 text-foreground">{format(currentDate, 'EEEE, MMMM d, yyyy')}</h3>
      {dayShifts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-background rounded-lg border border-dashed">
          <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <p className="text-lg">No shifts scheduled for this day</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dayShifts.map((shift) => (
            <div
              key={shift.id}
              className="w-full rounded-xl border bg-background p-4 text-left shadow-sm transition-all hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-l-4"
              data-testid={`day-shift-${shift.id}`}
              style={{ borderLeftColor: getBrandColor(shift.brand_id) }}
            >
              <button type="button" className="w-full text-left" onClick={() => onShiftClick?.(shift)}>
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between border-b pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-semibold tracking-tight text-foreground">{formatShiftTimeRange(shift)}</span>
                    <ShiftStatusBadge status={shift.status} />
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground mb-1">
                  <div>
                    <span className="font-medium mr-2">{t('brand')}:</span>
                    <span className="text-foreground">{getBrandName(shift.brand_id)}</span>
                  </div>
                  <div>
                    <span className="font-medium mr-2">{t('platform')}:</span>
                    <span className="text-foreground">{getPlatformName(shift.platform_id)}</span>
                  </div>
                  <div>
                    <span className="font-medium mr-2">{t('studio')}:</span>
                    <span className="text-foreground">{shift.studio || t('notUpdated')}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 text-sm bg-muted/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <UserIcon className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground w-20 shrink-0 font-medium">{t('host')}:</span>
                    <div className="flex flex-wrap gap-1">
                      {resolveStaffingLabelsForRole(shift, registrations, users, 'host', t).map(lbl => (
                        <span key={lbl.id} className={`font-medium ${lbl.isUnassigned ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                          {lbl.name}
                        </span>
                      )).reduce((prev, curr) => <>{prev}{prev ? ', ' : ''}{curr}</>, <></>)}
                    </div>
                  </div>
                  {(shift.required_support_count ?? 0) > 0 && (
                    <div className="flex items-start gap-2">
                      <UserIcon className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground w-20 shrink-0 font-medium">{t('support')}:</span>
                      <div className="flex flex-wrap gap-1">
                        {resolveStaffingLabelsForRole(shift, registrations, users, 'support', t).map(lbl => (
                          <span key={lbl.id} className={`font-medium ${lbl.isUnassigned ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                            {lbl.name}
                          </span>
                        )).reduce((prev, curr) => <>{prev}{prev ? ', ' : ''}{curr}</>, <></>)}
                      </div>
                    </div>
                  )}
                  {(shift.required_technical_count ?? 0) > 0 && (
                    <div className="flex items-start gap-2">
                      <UserIcon className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground w-20 shrink-0 font-medium">{t('technical')}:</span>
                      <div className="flex flex-wrap gap-1">
                        {resolveStaffingLabelsForRole(shift, registrations, users, 'technical', t).map(lbl => (
                          <span key={lbl.id} className={`font-medium ${lbl.isUnassigned ? 'text-muted-foreground italic' : 'text-foreground'}`}>
                            {lbl.name}
                          </span>
                        )).reduce((prev, curr) => <>{prev}{prev ? ', ' : ''}{curr}</>, <></>)}
                      </div>
                    </div>
                  )}
                </div>

                {shift.product_notes && (
                  <div className="mt-2 text-sm text-muted-foreground bg-muted/40 p-3 rounded-lg border">
                    {shift.product_notes}
                  </div>
                )}

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
                    <div className="mt-2">
                      <OperationalStatusStrip items={attention} compact />
                    </div>
                  )
                })()}
              </div>
              </button>
              {onRegister && (
                <div className="mt-4 pt-4 border-t">
                  <ShiftRegistrationActions
                    allShifts={allShifts}
                    currentUser={currentUser}
                    onRegister={role => onRegister(shift.id, role)}
                    registrations={registrations}
                    shift={shift}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
