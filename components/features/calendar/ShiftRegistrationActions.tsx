'use client'

import * as React from 'react'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { resolveRegistrationCta, type RegistrationCtaResult } from '@/lib/utils/shiftRegistration'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ShiftRegistrationActionsProps {
  allShifts?: Shift[]
  compact?: boolean
  currentUser: User | null
  disabled?: boolean
  onRegister: (role: OperationalRole) => Promise<void>
  registrations: ShiftRegistration[]
  shift: Shift
}

export function ShiftRegistrationActions({
  allShifts,
  compact = false,
  currentUser,
  disabled = false,
  onRegister,
  registrations,
  shift,
}: ShiftRegistrationActionsProps) {
  const { t } = useTranslation()
  const [busyRole, setBusyRole] = React.useState<OperationalRole | null>(null)

  if (!currentUser || !hasPermission(currentUser, 'shifts.register')) return null

  const states = resolveRegistrationCta({
    allShifts: allShifts?.length ? allShifts : [shift],
    registrations,
    shift,
    user: currentUser,
  })

  const visibleStates = states.filter(state => state.state !== 'not_eligible')
  if (visibleStates.length === 0) return null

  const runRegister = async (state: RegistrationCtaResult) => {
    if (state.state !== 'eligible' || busyRole || disabled) return
    setBusyRole(state.role)
    try {
      await onRegister(state.role)
    } finally {
      setBusyRole(null)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'border-t pt-3'}`} data-testid={`shift-registration-actions-${shift.id}`}>
      {visibleStates.map(state => {
        const label = t(state.role)
        if (state.state === 'eligible') {
          return (
            <Button
              data-testid={`register-shift-${shift.id}-${state.role}`}
              disabled={disabled || busyRole !== null}
              key={state.role}
              onClick={() => void runRegister(state)}
              size="sm"
              type="button"
            >
              {t('registerForRole', { role: label })}
            </Button>
          )
        }
        if (state.state === 'pending') {
          return <Badge key={state.role} variant="secondary">{label}: {t('registrationPending')}</Badge>
        }
        if (state.state === 'approved') {
          return <Badge key={state.role} variant="secondary">{label}: {t('registrationApproved')}</Badge>
        }
        if (state.state === 'full') {
          return <Badge key={state.role} variant="outline">{label}: {t('full')}</Badge>
        }
        if (state.state === 'conflict') {
          return <Badge key={state.role} variant="outline">{label}: {t('scheduleConflict')}</Badge>
        }
        return <Badge key={state.role} variant="outline">{label}: {t('registrationClosed')}</Badge>
      })}
    </div>
  )
}
