'use client'

import * as React from 'react'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { getShiftRoleCapacities } from '@/lib/services/dataService'
import { resolveRegistrationCta, runEligibleRegistration, type RegistrationCtaResult } from '@/lib/utils/shiftRegistration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogBody, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface ShiftRegistrationActionsProps {
  allShifts?: Shift[]
  compact?: boolean
  currentUser: User | null
  disabled?: boolean
  onRegister: (role: OperationalRole) => Promise<void>
  registrations: ShiftRegistration[]
  role?: OperationalRole
  shift: Shift
}

export function ShiftRegistrationActions({
  allShifts,
  compact = false,
  currentUser,
  disabled = false,
  onRegister,
  registrations,
  role,
  shift,
}: ShiftRegistrationActionsProps) {
  const { t } = useTranslation()
  const [busyRole, setBusyRole] = React.useState<OperationalRole | null>(null)
  const capacities = React.useMemo(() => getShiftRoleCapacities(shift, registrations), [registrations, shift])

  if (!currentUser || !hasPermission(currentUser, 'shifts.register')) return null

  const states = resolveRegistrationCta({
    allShifts: allShifts?.length ? allShifts : [shift],
    registrations,
    shift,
    user: currentUser,
  })

  const visibleStates = states.filter(state => !role || state.role === role)
  if (visibleStates.length === 0) return null

  const runRegister = async (state: RegistrationCtaResult) => {
    if (busyRole || disabled) return
    setBusyRole(state.role)
    try {
      await runEligibleRegistration(state, onRegister)
    } finally {
      setBusyRole(null)
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className={compact ? 'h-8' : undefined}
            data-testid={`open-registration-roles-${shift.id}`}
            disabled={disabled}
            size="sm"
            type="button"
          />
        }
      >
        {t('register')}
      </DialogTrigger>
      <DialogContent data-testid={`registration-role-dialog-${shift.id}`} size="sm">
<DialogHeader>
          <DialogTitle>{t('register')}</DialogTitle>
          <DialogDescription>{t('registrationStatus')}</DialogDescription>
        </DialogHeader>
<DialogBody>
<div className="space-y-2" data-testid={`registration-role-options-${shift.id}`}>
          {visibleStates.map(state => {
            const capacity = capacities.find(item => item.role === state.role)
            const stateLabel = state.state === 'eligible' ? t('register')
              : state.state === 'pending' ? t('pending')
              : state.state === 'approved' ? t('approved')
              : state.state === 'full' ? t('full')
              : state.state === 'conflict' ? t('scheduleConflict')
              : state.state === 'closed' ? t('registrationClosed')
              : t('roleNotEligible')
            return (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3" data-testid={`registration-role-${shift.id}-${state.role}-${state.state}`} key={state.role}>
                <div className="min-w-0">
                  <p className="font-medium">{t(state.role)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('confirmedCount')}: {capacity?.approved ?? 0}/{capacity?.required ?? 0} · {t('pending')}: {capacity?.pending ?? 0}
                  </p>
                </div>
                <Button
                  data-testid={`register-shift-${shift.id}-${state.role}`}
                  disabled={disabled || busyRole !== null || state.state !== 'eligible'}
                  onClick={() => void runRegister(state)}
                  size="sm"
                  type="button"
                >
                  {busyRole === state.role ? t('loading') : stateLabel}
                </Button>
              </div>
            )
          })}
        </div>
</DialogBody>
</DialogContent>
    </Dialog>
  )
}
