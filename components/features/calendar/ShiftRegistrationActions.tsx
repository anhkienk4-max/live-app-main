'use client'

import * as React from 'react'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { getShiftRoleCapacities, brandService, platformService } from '@/lib/services/dataService'
import { resolveRegistrationCta, runEligibleRegistration, type RegistrationCtaResult } from '@/lib/utils/shiftRegistration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface ShiftRegistrationActionsProps {
  allShifts?: Shift[]
  compact?: boolean
  currentUser: User | null
  disabled?: boolean
  onRegister: (role: OperationalRole) => Promise<void>
  registrations: ShiftRegistration[]
  role?: OperationalRole
  shift: Shift
  brandName?: string
  platformName?: string
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
  brandName,
  platformName,
}: ShiftRegistrationActionsProps) {
  const { t } = useTranslation()
  const [busyRole, setBusyRole] = React.useState<OperationalRole | null>(null)
  const [confirmRole, setConfirmRole] = React.useState<RegistrationCtaResult | null>(null)
  const [resolvedBrandName, setResolvedBrandName] = React.useState<string | undefined>(brandName)
  const [resolvedPlatformName, setResolvedPlatformName] = React.useState<string | undefined>(platformName)

  React.useEffect(() => {
    if (brandName) {
      setResolvedBrandName(brandName)
      return
    }
    if (shift.brand_name) {
      setResolvedBrandName(shift.brand_name)
      return
    }
    void brandService.getAll().then(all => {
      const match = all.find(b => b.id === shift.brand_id)
      if (match) setResolvedBrandName(match.name)
    }).catch(() => {})
  }, [brandName, shift.brand_id, shift.brand_name])

  React.useEffect(() => {
    if (platformName) {
      setResolvedPlatformName(platformName)
      return
    }
    if (shift.platform_name) {
      setResolvedPlatformName(shift.platform_name)
      return
    }
    void platformService.getAll().then(all => {
      const match = all.find(p => p.id === shift.platform_id)
      if (match) setResolvedPlatformName(match.name)
    }).catch(() => {})
  }, [platformName, shift.platform_id, shift.platform_name])

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
    if (busyRole || disabled || state.state !== 'eligible') return
    setBusyRole(state.role)
    try {
      const registered = await runEligibleRegistration(state, onRegister)
      if (registered) setConfirmRole(null)
    } catch {
      // The parent already displays the registration error; keep this dialog open without an unhandled rejection.
    } finally {
      setBusyRole(null)
    }
  }

  return (
    <>
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
                  onClick={() => setConfirmRole(state)}
                  size="sm"
                  type="button"
                >
                  {busyRole === state.role ? t('loading') : stateLabel}
                </Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog
      open={confirmRole !== null}
      onOpenChange={open => { if (!open && busyRole === null) setConfirmRole(null) }}
    >
      <DialogContent data-testid={`registration-confirm-dialog-${shift.id}`} size="sm">
        <DialogHeader>
          <DialogTitle>Xác nhận đăng ký ca</DialogTitle>
          <DialogDescription>
            Kiểm tra thông tin ca trước khi gửi yêu cầu. Việc đăng ký không đồng nghĩa với được duyệt.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Brand</dt>
          <dd>{resolvedBrandName || brandName || shift.brand_name || shift.brand_id}</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{resolvedPlatformName || platformName || shift.platform_name || shift.platform_id}</dd>
          <dt className="text-muted-foreground">Ngày</dt>
          <dd>{shift.date}</dd>
          <dt className="text-muted-foreground">Giờ</dt>
          <dd>{shift.start_time} – {shift.end_time}{shift.crosses_midnight ? ' (qua ngày)' : ''}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{confirmRole ? t(confirmRole.role) : ''}</dd>
        </dl>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid={`registration-pending-notice-${shift.id}`}>
          Sau khi xác nhận, yêu cầu sẽ ở trạng thái <strong>Chờ duyệt</strong> cho tới khi Admin/Leader quyết định.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            data-testid={`registration-confirm-cancel-${shift.id}`}
            disabled={busyRole !== null}
            onClick={() => setConfirmRole(null)}
            type="button"
            variant="outline"
          >
            Hủy
          </Button>
          <Button
            data-testid={`registration-confirm-submit-${shift.id}`}
            disabled={busyRole !== null || confirmRole?.state !== 'eligible'}
            onClick={() => { if (confirmRole) void runRegister(confirmRole) }}
            type="button"
          >
            {busyRole !== null ? t('loading') : 'Xác nhận gửi đăng ký'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
