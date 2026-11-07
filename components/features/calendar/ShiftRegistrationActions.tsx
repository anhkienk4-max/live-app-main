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
  onCancel?: (registrationId: string) => Promise<void>
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
  onCancel,
  registrations,
  role,
  shift,
  brandName,
  platformName,
}: ShiftRegistrationActionsProps) {
  const { language, t } = useTranslation()
  const enrichedShift = shift as Shift & { brand_name?: string; platform_name?: string }
  const [busyRole, setBusyRole] = React.useState<OperationalRole | null>(null)
  const [confirmRole, setConfirmRole] = React.useState<RegistrationCtaResult | null>(null)
  const [loadedBrand, setLoadedBrand] = React.useState<{ id: string; name: string } | null>(null)
  const [loadedPlatform, setLoadedPlatform] = React.useState<{ id: string; name: string } | null>(null)
  const [brandFetchDone, setBrandFetchDone] = React.useState(false)
  const [platformFetchDone, setPlatformFetchDone] = React.useState(false)
  const resolvedBrandName = brandName ?? enrichedShift.brand_name
    ?? (loadedBrand?.id === shift.brand_id ? loadedBrand.name : undefined)
  const resolvedPlatformName = platformName ?? enrichedShift.platform_name
    ?? (loadedPlatform?.id === shift.platform_id ? loadedPlatform.name : undefined)
  const isBrandResolving = !brandName && !enrichedShift.brand_name && !brandFetchDone
  const isPlatformResolving = !platformName && !enrichedShift.platform_name && !platformFetchDone

  React.useEffect(() => {
    if (brandName || enrichedShift.brand_name) return
    let cancelled = false
    void brandService.getAll().then(all => {
      const match = all.find(b => b.id === shift.brand_id)
      if (!cancelled) {
        if (match) setLoadedBrand({ id: shift.brand_id, name: match.name })
        setBrandFetchDone(true)
      }
    }).catch(() => {
      if (!cancelled) setBrandFetchDone(true)
    })
    return () => { cancelled = true }
  }, [brandName, shift.brand_id, enrichedShift.brand_name])

  React.useEffect(() => {
    if (platformName || enrichedShift.platform_name) return
    let cancelled = false
    void platformService.getAll().then(all => {
      const match = all.find(p => p.id === shift.platform_id)
      if (!cancelled) {
        if (match) setLoadedPlatform({ id: shift.platform_id, name: match.name })
        setPlatformFetchDone(true)
      }
    }).catch(() => {
      if (!cancelled) setPlatformFetchDone(true)
    })
    return () => { cancelled = true }
  }, [platformName, shift.platform_id, enrichedShift.platform_name])

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
                {(state.state === 'pending' || state.state === 'approved') && state.registration && onCancel ? (
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${state.state === 'approved' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                      {stateLabel}
                    </span>
                    <Button
                      data-testid={`cancel-shift-registration-${shift.id}-${state.role}`}
                      disabled={disabled || busyRole !== null}
                      onClick={async () => {
                        if (window.confirm('Bạn có chắc chắn muốn hủy đăng ký ca này?')) {
                          setBusyRole(state.role)
                          try {
                            await onCancel(state.registration!.id)
                          } finally {
                            setBusyRole(null)
                          }
                        }
                      }}
                      size="sm"
                      variant="outline"
                      type="button"
                      className="h-8 text-xs border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {busyRole === state.role ? t('loading') : 'Hủy đăng ký'}
                    </Button>
                  </div>
                ) : (
                  <Button
                    data-testid={`register-shift-${shift.id}-${state.role}`}
                    disabled={disabled || busyRole !== null || state.state !== 'eligible'}
                    onClick={() => setConfirmRole(state)}
                    size="sm"
                    type="button"
                  >
                    {busyRole === state.role ? t('loading') : stateLabel}
                  </Button>
                )}
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
          <dd data-testid="registration-confirm-brand-name">
            {resolvedBrandName || (isBrandResolving ? (language === 'vi' ? 'Đang tải...' : 'Loading...') : (language === 'vi' ? '— Chưa phân loại —' : '— Unassigned —'))}
          </dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd data-testid="registration-confirm-platform-name">
            {resolvedPlatformName || (isPlatformResolving ? (language === 'vi' ? 'Đang tải...' : 'Loading...') : (language === 'vi' ? '— Chưa phân loại —' : '— Unassigned —'))}
          </dd>
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
