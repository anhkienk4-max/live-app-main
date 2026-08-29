'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { enUS, vi } from 'date-fns/locale'
import { ExternalLink, FileText, Lock, LockOpen, Pencil, Radio, UserPlus } from 'lucide-react'
import {
  Brand,
  Campaign,
  OperationalRole,
  Platform,
  Report,
  Shift,
  ShiftRegistration,
  User,
} from '@/lib/types/database.types'
import {
  isStaffedRegistration,
  shiftRegistrationService,
  shiftService,
} from '@/lib/services/dataService'
import { hasPermission } from '@/lib/permissions'
import { formatShiftEndDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShiftRegistrationActions } from './ShiftRegistrationActions'
import { resolveRegistrationCta } from '@/lib/utils/shiftRegistration'

interface DaySessionsDialogProps {
  open: boolean
  date: Date | null
  shifts: Shift[]
  allShifts?: Shift[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  reports: Report[]
  currentUser: User | null
  onOpenChange: (open: boolean) => void
  onViewShift: (shift: Shift) => void
  onEditShift: (shift: Shift) => void
  onChanged: () => Promise<void> | void
}

const roleAssignmentField: Record<OperationalRole, 'host_id' | 'support_id' | 'technical_id'> = {
  host: 'host_id',
  support: 'support_id',
  technical: 'technical_id',
}

const roleImportedNameField: Record<OperationalRole, 'host_names' | 'assistant_names' | 'technical_names'> = {
  host: 'host_names',
  support: 'assistant_names',
  technical: 'technical_names',
}

export function resolveDaySessionRoleNames({
  fallback,
  registrations,
  role,
  shift,
  users,
}: {
  fallback: string
  registrations: ShiftRegistration[]
  role: OperationalRole
  shift: Shift
  users: User[]
}) {
  const directAssignment = shift[roleAssignmentField[role]]
  const assignedUserIds = new Set([
    ...(directAssignment ? [directAssignment] : []),
    ...registrations
      .filter(registration =>
        registration.shift_id === shift.id &&
        registration.operational_role === role &&
        isStaffedRegistration(registration),
      )
      .map(registration => registration.user_id),
  ])
  const assignedNames = [...assignedUserIds]
    .map(userId => users.find(user => user.id === userId)?.full_name?.trim())
    .filter((name): name is string => Boolean(name))

  if (assignedNames.length > 0) return assignedNames.join(', ')

  const importedNames = shift[roleImportedNameField[role]]
    ?.map(name => name.trim())
    .filter(Boolean) ?? []

  return importedNames.join(', ') || fallback
}

export function DaySessionsDialog({
  open,
  date,
  shifts,
  allShifts,
  brands,
  platforms,
  campaigns,
  users,
  registrations,
  reports,
  currentUser,
  onOpenChange,
  onViewShift,
  onEditShift,
  onChanged,
}: DaySessionsDialogProps) {
  const { language, t } = useTranslation()
  const { toast } = useToast()
  const [busyAction, setBusyAction] = React.useState('')
  const locale = language === 'vi' ? vi : enUS
  const dateValue = date ? format(date, 'yyyy-MM-dd') : ''
  const dayShifts = shifts
    .filter(shift => shift.date === dateValue)
    .sort((left, right) => left.start_time.localeCompare(right.start_time))

  const entityName = (items: Array<{ id: string; name: string }>, id?: string) =>
    id ? items.find(item => item.id === id)?.name || t('notUpdated') : t('notUpdated')
  const userName = (id?: string) =>
    id ? users.find(user => user.id === id)?.full_name || t('notUpdated') : t('notUpdated')
  const roleNames = (shift: Shift, role: OperationalRole) => resolveDaySessionRoleNames({
    fallback: t('notUpdated'),
    registrations,
    role,
    shift,
    users,
  })

  const runAction = async (key: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusyAction(key)
    try {
      await action()
      await onChanged()
      toast({ title: t('success'), description: successMessage, variant: 'success' })
    } catch (error) {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : t('validationError'),
        variant: 'destructive',
      })
    } finally {
      setBusyAction('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[80vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:w-[calc(100vw-2rem)] sm:max-w-[900px]" size="lg">
        <DialogHeader>
          <DialogTitle>
            {t('liveSessionsOn', {
              date: date
                ? format(date, language === 'vi' ? 'dd/MM/yyyy' : 'MM/dd/yyyy', { locale })
                : '',
            })}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4 pb-1">
          {dayShifts.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">{t('noSessionsForDay')}</div>
          )}
          {dayShifts.map(shift => {
            const overnightEndDate = formatShiftEndDate(shift)
            const report = reports.find(candidate => candidate.shift_id === shift.id)
            const myRegistrations = currentUser
              ? registrations.filter(registration =>
                  registration.shift_id === shift.id &&
                  registration.user_id === currentUser.id &&
                  (registration.status === 'pending' || isStaffedRegistration(registration)),
                )
              : []
            const pendingRegistrations = registrations.filter(registration =>
              registration.shift_id === shift.id && registration.status === 'pending',
            )
            const registrationStates = currentUser
              ? resolveRegistrationCta({ allShifts: allShifts ?? shifts, registrations, shift, user: currentUser })
              : []
            const registrationStatus = myRegistrations.length
              ? myRegistrations.map(registration =>
                  `${t(registration.operational_role)}: ${
                    registration.status === 'manually_assigned'
                      ? t('manuallyAssigned')
                      : t(registration.status)
                  }`,
                ).join(', ')
              : registrationStates.some(state => state.state === 'eligible')
                ? t('available')
                : registrationStates.find(state => state.state === 'full')
                  ? t('full')
                  : registrationStates.find(state => state.state === 'conflict')
                    ? t('scheduleConflict')
                    : t('registrationClosed')

            return (
              <Card className="overflow-hidden" key={shift.id}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold" title={shift.title}>
                        {shift.title || `${entityName(brands, shift.brand_id)} live`}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {shift.date} · {formatShiftTimeRange(shift)}
                      </p>
                      {overnightEndDate && (
                        <p className="text-xs text-indigo-700">{t('endsNextDay')}: {overnightEndDate}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={shift.status === 'live' ? 'destructive' : 'outline'}>
                        {shift.status === 'live' ? t('liveStatus') : t(shift.status)}
                      </Badge>
                      <Badge variant="secondary">{registrationStatus}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Info label={t('brand')} value={entityName(brands, shift.brand_id)} />
                    <Info label={t('platform')} value={entityName(platforms, shift.platform_id)} />
                    <Info label={t('campaign')} value={entityName(campaigns, shift.campaign_id)} />
                    <Info label={t('studio')} value={shift.studio || t('notUpdated')} />
                    <Info label={t('host')} value={roleNames(shift, 'host')} />
                    <Info label={t('support')} value={roleNames(shift, 'support')} />
                    <Info label={t('technical')} value={roleNames(shift, 'technical')} />
                    <Info
                      label={t('reportStatus')}
                      value={report
                        ? report.status === 'in_review'
                          ? t('inReview')
                          : t(report.status || (report.metrics_confirmed ? 'confirmed' : 'draft'))
                        : t('notUpdated')}
                    />
                  </div>

                  {shift.live_link && (
                    <a
                      className="inline-flex max-w-full items-center gap-1 truncate text-sm text-blue-700 underline-offset-4 hover:underline"
                      href={shift.live_link}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('liveUrl')}: {shift.live_link}</span>
                    </a>
                  )}

                  {pendingRegistrations.length > 0 && currentUser && hasPermission(currentUser, 'shifts.approve_registration') && (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                      {pendingRegistrations.map(registration => (
                        <div className="flex flex-wrap items-center justify-between gap-2" key={registration.id}>
                          <p className="text-sm">{userName(registration.user_id)} · {t(registration.operational_role)}</p>
                          <div className="flex gap-2">
                            <Button
                              disabled={Boolean(busyAction)}
                              onClick={() => void runAction(
                                `approve-${registration.id}`,
                                () => shiftRegistrationService.approve(registration.id, currentUser.id),
                                t('registrationApproved'),
                              )}
                              size="xs"
                            >
                              {t('approve')}
                            </Button>
                            <Button
                              disabled={Boolean(busyAction)}
                              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => void runAction(
                                `reject-${registration.id}`,
                                () => shiftRegistrationService.reject(registration.id, currentUser.id),
                                t('rejected'),
                              )}
                              size="xs"
                              variant="outline"
                            >
                              {t('reject')}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="hidden sm:flex flex-wrap gap-2">
                    <Button data-testid={`day-session-view-shift-${shift.id}`} onClick={() => onViewShift(shift)} size="sm" variant="outline">
                      {t('viewShiftDetail')}
                    </Button>
                    {['preparing', 'live', 'paused'].includes(shift.status) && (
                      <Button onClick={() => window.location.assign('/live')} size="sm" variant="outline">
                        <Radio className="mr-1 h-4 w-4" />{t('openLiveMonitor')}
                      </Button>
                    )}
                    {shift.status === 'completed' && (
                      <Button onClick={() => window.location.assign('/reports')} size="sm" variant="outline">
                        <FileText className="mr-1 h-4 w-4" />{t('openFinalReport')}
                      </Button>
                    )}
                    <ShiftRegistrationActions
                      allShifts={allShifts ?? shifts}
                      currentUser={currentUser}
                      disabled={Boolean(busyAction)}
                      onRegister={role => currentUser
                        ? runAction(
                            `register-${shift.id}-${role}`,
                            () => shiftRegistrationService.register(shift.id, currentUser.id, role),
                            t('registrationPending'),
                          )
                        : Promise.resolve()}
                      registrations={registrations}
                      shift={shift}
                    />
                    {myRegistrations.map(registration => {
                      const isManualAssignment = registration.source === 'manual_assignment' || registration.status === 'manually_assigned'
                      return (
                        <div key={registration.id} className="flex flex-wrap items-center gap-2">
                          {isManualAssignment ? (
                            <Badge variant="outline">{t('assignedByManager')}</Badge>
                          ) : (
                            <Button
                              disabled={Boolean(busyAction) || Boolean(shift.registration_locked)}
                              onClick={() => void runAction(
                                `cancel-${registration.id}`,
                                () => shiftRegistrationService.cancel(registration.id, currentUser!.id),
                                t('registrationCancelled'),
                              )}
                              size="sm"
                              variant="outline"
                            >
                              {t('cancelRegistration')} · {t(registration.operational_role)}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                    {currentUser && hasPermission(currentUser, 'shifts.edit') && (
                      <>
                        <Button onClick={() => onEditShift(shift)} size="sm" variant="outline">
                          <Pencil className="mr-1 h-4 w-4" />{t('editShift')}
                        </Button>
                        <Button onClick={() => onViewShift(shift)} size="sm" variant="outline">
                          <UserPlus className="mr-1 h-4 w-4" />{t('manageStaff')}
                        </Button>
                      </>
                    )}
                    {currentUser && hasPermission(currentUser, 'shifts.lock') && shift.status === 'scheduled' && (
                      shift.registration_locked
                        ? <Button
                            disabled={Boolean(busyAction)}
                            onClick={() => void runAction(
                              `reopen-${shift.id}`,
                              () => shiftService.reopen(shift.id),
                              t('reopenShift'),
                            )}
                            size="sm"
                            variant="outline"
                          >
                            <LockOpen className="mr-1 h-4 w-4" />{t('reopenShift')}
                          </Button>
                        : <Button
                            disabled={Boolean(busyAction)}
                            onClick={() => void runAction(
                              `lock-${shift.id}`,
                              () => shiftService.lock(shift.id),
                              t('lockShift'),
                            )}
                            size="sm"
                            variant="outline"
                          >
                            <Lock className="mr-1 h-4 w-4" />{t('lockShift')}
                          </Button>
                    )}
                  </div>
                  
                  <div className="sm:hidden flex gap-2 mt-2 w-full">
                    <Button className="flex-1" data-testid={`day-session-view-shift-${shift.id}-mobile`} onClick={() => onViewShift(shift)} size="sm" variant="outline">
                      {t('viewShiftDetail')}
                    </Button>
                    <MobileActionMenu
                      breakpoint="sm"
                      actions={[
                        ...( ['preparing', 'live', 'paused'].includes(shift.status) ? [{ key: 'live', label: t('openLiveMonitor'), icon: <Radio className="h-4 w-4" />, onClick: () => window.location.assign('/live') }] : [] ),
                        ...( shift.status === 'completed' ? [{ key: 'report', label: t('openFinalReport'), icon: <FileText className="h-4 w-4" />, onClick: () => window.location.assign('/reports') }] : [] ),
                        ...( currentUser && hasPermission(currentUser, 'shifts.edit') ? [
                          { key: 'edit', label: t('editShift'), icon: <Pencil className="h-4 w-4" />, onClick: () => onEditShift(shift) },
                          { key: 'manage', label: t('manageStaff'), icon: <UserPlus className="h-4 w-4" />, onClick: () => onViewShift(shift) }
                        ] : [] ),
                        ...( currentUser && hasPermission(currentUser, 'shifts.lock') && shift.status === 'scheduled' ? [
                          shift.registration_locked
                            ? { key: 'reopen', label: t('reopenShift'), icon: <LockOpen className="h-4 w-4" />, onClick: () => void runAction(`reopen-${shift.id}`, () => shiftService.reopen(shift.id), t('reopenShift')) }
                            : { key: 'lock', label: t('lockShift'), icon: <Lock className="h-4 w-4" />, onClick: () => void runAction(`lock-${shift.id}`, () => shiftService.lock(shift.id), t('lockShift')) }
                        ] : [] )
                      ]}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium" title={value}>{value}</p>
    </div>
  )
}
