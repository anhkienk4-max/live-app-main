'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Check, Clock3, Download, LayoutGrid, List, Lock, LockOpen, RotateCcw, Table2, UserPlus, X } from 'lucide-react'
import {
  brandService,
  campaignService,
  platformService,
  shiftRegistrationService,
  shiftService,
  userService,
  getShiftRoleCapacities,
  isStaffedRegistration,
  type ShiftRoleCapacity,
} from '@/lib/services/dataService'
import {
  Brand,
  Campaign,
  OperationalRole,
  Platform,
  Shift,
  ShiftRegistration,
  User,
  DeletionImpact,
} from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { exportShiftStaffingToExcel } from '@/lib/utils/excelUtils'
import { formatShiftEndDate, formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { selectMyShiftEntries, type MyShiftEntry } from '@/lib/utils/myShifts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { ShiftRegistrationActions } from '@/components/features/calendar/ShiftRegistrationActions'

type Mode = 'open' | 'mine'
type Filters = { date: string; brand: string; platform: string; campaign: string; role: string }
type CapacityMap = Record<string, ShiftRoleCapacity[]>
type ViewMode = 'card' | 'compact' | 'table'

const initialFilters: Filters = { date: '', brand: 'all', platform: 'all', campaign: 'all', role: 'all' }
const roles: OperationalRole[] = ['host', 'support', 'technical']

export function ShiftRegistrationBoard({ mode }: { mode: Mode }) {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [capacities, setCapacities] = React.useState<CapacityMap>({})
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [filters, setFilters] = React.useState<Filters>(initialFilters)
  const [manualSelections, setManualSelections] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [removalTarget, setRemovalTarget] = React.useState<{ registration: ShiftRegistration; kind: 'cancel' | 'unassign' } | null>(null)
  const [viewMode, setViewMode] = React.useState<ViewMode>('card')
  const [detailShift, setDetailShift] = React.useState<Shift | null>(null)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedShifts, loadedRegistrations, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers] = await Promise.all([
        shiftService.getAll(),
        shiftRegistrationService.getAll(),
        brandService.getAll(),
        platformService.getAll(),
        campaignService.getAll(),
        userService.getAll(),
      ])
      setShifts(loadedShifts)
      setRegistrations(loadedRegistrations)
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
      setCapacities(Object.fromEntries(loadedShifts.map(shift => [
        shift.id,
        getShiftRoleCapacities(shift, loadedRegistrations),
      ])))
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void loadData() }, [loadData])
  React.useEffect(() => {
    const stored = window.localStorage.getItem('livestream-ops-open-shift-view')
    if (stored === 'card' || stored === 'compact' || stored === 'table') setViewMode(stored)
  }, [])

  const changeViewMode = (next: ViewMode) => {
    setViewMode(next)
    window.localStorage.setItem('livestream-ops-open-shift-view', next)
  }

  const runAction = async (id: string, action: () => Promise<unknown>, success: string, openShiftId?: string) => {
    setBusyId(id)
    try {
      await action()
      toast({ title: t('success'), description: success, variant: 'success' })
      await loadData()
      if (openShiftId) {
        const refreshedShift = await shiftService.getById(openShiftId)
        if (refreshedShift) setDetailShift(refreshedShift)
      }
    } catch (error) {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : t('validationError'),
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  const removalImpact: DeletionImpact | null = removalTarget ? {
    entity_type: 'shift_registration',
    entity_id: removalTarget.registration.id,
    entity_name: `${users.find(user => user.id === removalTarget.registration.user_id)?.full_name || removalTarget.registration.user_id} · ${removalTarget.registration.operational_role}`,
    action: 'cancel',
    consequence: removalTarget.kind === 'cancel'
      ? 'Your registration will be cancelled and the position will become available again.'
      : 'The approved assignment will be removed by an authorized leader. The action remains in audit history.',
    reversible: false,
    related_records: [{ entity_type: 'shift', entity_id: removalTarget.registration.shift_id, entity_name: shifts.find(shift => shift.id === removalTarget.registration.shift_id)?.title || removalTarget.registration.shift_id }],
  } : null

  const confirmRemoval = async (reason: string) => {
    if (!currentUser || !removalTarget) return
    try {
      if (removalTarget.kind === 'cancel') await shiftRegistrationService.cancel(removalTarget.registration.id, currentUser.id, reason, removalTarget.registration.version)
      else await shiftRegistrationService.removeAssignment(removalTarget.registration.id, currentUser.id, reason, removalTarget.registration.version)
      toast({ title: t('success'), description: removalTarget.kind === 'cancel' ? t('registrationCancelled') : t('removeAssignment'), variant: 'success' })
      setRemovalTarget(null)
      await loadData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  const visibleShifts = React.useMemo(() => {
    const userShiftIds = new Set(registrations
      .filter(registration =>
        registration.user_id === currentUser?.id &&
        (registration.status === 'pending' || isStaffedRegistration(registration))
      )
      .map(registration => registration.shift_id))
    return shifts
      .filter(shift => mode === 'open'
        ? shift.status === 'scheduled' && (resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.endAt.getTime() ?? 0) > Date.now()
        : userShiftIds.has(shift.id))
      .filter(shift => !filters.date || shift.date === filters.date)
      .filter(shift => filters.brand === 'all' || shift.brand_id === filters.brand)
      .filter(shift => filters.platform === 'all' || shift.platform_id === filters.platform)
      .filter(shift => filters.campaign === 'all' || shift.campaign_id === filters.campaign)
      .filter(shift => filters.role === 'all' || (capacities[shift.id] || []).some(capacity =>
        capacity.role === filters.role &&
        (mode === 'open' ? true : registrations.some(registration =>
          registration.shift_id === shift.id &&
          registration.user_id === currentUser?.id &&
          registration.operational_role === filters.role
        ))
      ))
      .sort((left, right) => `${left.date}${left.start_time}`.localeCompare(`${right.date}${right.start_time}`))
  }, [capacities, currentUser?.id, filters, mode, registrations, shifts])

  const visibleMyEntries = React.useMemo(() => selectMyShiftEntries({
    shifts,
    registrations,
    userId: currentUser?.id || '',
    filters,
  }), [currentUser?.id, filters, registrations, shifts])

  const pendingApprovals = registrations.filter(registration =>
    registration.status === 'pending' &&
    visibleShifts.some(shift => shift.id === registration.shift_id)
  )

  if (loading || userLoading || !currentUser) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-medium">{t('date')}<Input className="mt-1" type="date" value={filters.date} onChange={event => setFilters(current => ({ ...current, date: event.target.value }))} /></label>
          <FilterSelect label={t('brand')} value={filters.brand} onChange={value => setFilters(current => ({ ...current, brand: value }))} options={brands} />
          <FilterSelect label={t('platform')} value={filters.platform} onChange={value => setFilters(current => ({ ...current, platform: value }))} options={platforms} />
          <FilterSelect label={t('campaign')} value={filters.campaign} onChange={value => setFilters(current => ({ ...current, campaign: value }))} options={campaigns} />
          <label className="text-xs font-medium">{t('role')}<Select value={filters.role} onValueChange={value => setFilters(current => ({ ...current, role: value }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{roles.map(role => <SelectItem key={role} value={role}>{t(role)}</SelectItem>)}</SelectContent></Select></label>
          <div className="flex items-end"><Button className="w-full" variant="outline" onClick={() => setFilters(initialFilters)}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button></div>
        </CardContent>
      </Card>

      {(mode === 'open' || mode === 'mine') && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{mode === 'mine' ? visibleMyEntries.length : visibleShifts.length} {mode === 'mine' ? t('myShifts').toLowerCase() : t('openShifts').toLowerCase()}</p>
          <div className="inline-flex rounded-lg border bg-background p-1" aria-label={mode === 'mine' ? 'My shift view' : 'Open shift view'}>
            <ViewButton active={viewMode === 'card'} onClick={() => changeViewMode('card')} icon={<LayoutGrid className="h-4 w-4" />} label={t('cardView')} />
            <ViewButton active={viewMode === 'compact'} onClick={() => changeViewMode('compact')} icon={<List className="h-4 w-4" />} label={t('compactView')} />
            <ViewButton active={viewMode === 'table'} onClick={() => changeViewMode('table')} icon={<Table2 className="h-4 w-4" />} label={t('tableView')} />
          </div>
        </div>
      )}

      {mode === 'open' && hasPermission(currentUser, 'shifts.approve_registration') && pendingApprovals.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader><CardTitle className="text-base">{t('pending')} ({pendingApprovals.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pendingApprovals.map(registration => {
              const shift = shifts.find(candidate => candidate.id === registration.shift_id)
              const staff = users.find(user => user.id === registration.user_id)
              if (!shift || !staff) return null
              return (
                <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{staff.full_name} · {t(registration.operational_role)}</p>
                    <p className="text-xs text-muted-foreground">{shift.title || shift.id} · {shift.date} {formatShiftTimeRange(shift)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{format(new Date(registration.requested_at), 'dd/MM/yyyy HH:mm')}{registration.review_notes ? ` · ${registration.review_notes}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyId === registration.id} onClick={() => runAction(registration.id, () => shiftRegistrationService.approve(registration.id, currentUser.id, undefined, registration.version), t('registrationApproved'))}><Check className="mr-1 h-4 w-4" />{t('registrationApproved')}</Button>
                    <Button size="sm" variant="outline" disabled={busyId === registration.id} onClick={() => runAction(registration.id, () => shiftRegistrationService.reject(registration.id, currentUser.id, undefined, registration.version), t('rejected'))}><X className="mr-1 h-4 w-4" />{t('reject')}</Button>
                    <Button size="sm" variant="ghost" disabled={busyId === registration.id} onClick={() => setRemovalTarget({ registration, kind: 'unassign' })}>{t('removeAssignment')}</Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {(mode === 'mine' ? visibleMyEntries.length === 0 : visibleShifts.length === 0) ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{mode === 'open' ? t('noOpenShifts') : t('noMyShifts')}</CardContent></Card>
      ) : mode === 'mine' ? (
        viewMode === 'table' ? (
          <MyShiftTable entries={visibleMyEntries} brands={brands} platforms={platforms} campaigns={campaigns} onManage={setDetailShift} />
        ) : viewMode === 'compact' ? (
          <MyShiftCompactList entries={visibleMyEntries} brands={brands} platforms={platforms} campaigns={campaigns} onManage={setDetailShift} />
        ) : (
          <MyShiftCards entries={visibleMyEntries} brands={brands} platforms={platforms} campaigns={campaigns} onManage={setDetailShift} />
        )
      ) : viewMode === 'table' ? (
        <ShiftSummaryTable
          allShifts={shifts}
          currentUser={currentUser}
          onRegister={(shiftId, role) => runAction(`${shiftId}-${role}`, () => shiftRegistrationService.register(shiftId, currentUser.id, role), t('registrationPending'), shiftId)}
          shifts={visibleShifts}
          registrations={registrations}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          onManage={setDetailShift}
        />
      ) : viewMode === 'compact' ? (
        <CompactShiftList shifts={visibleShifts} capacities={capacities} registrations={registrations} brands={brands} platforms={platforms} campaigns={campaigns} onManage={setDetailShift} />
      ) : (
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2 min-[1900px]:grid-cols-3">
          {visibleShifts.map(shift => {
            const shiftRegistrations = registrations.filter(registration => registration.shift_id === shift.id)
            const mine = shiftRegistrations.filter(registration =>
              registration.user_id === currentUser.id &&
              !['cancelled', 'rejected', 'removed'].includes(registration.status)
            )
            const fullyStaffed = (capacities[shift.id] || []).every(capacity => capacity.approved >= capacity.required)
            return (
              <Card key={shift.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{shift.title || `${brandName(brands, shift.brand_id)} live`}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} · {formatShiftTimeRange(shift)}</p>
                      {formatShiftEndDate(shift) && <p className="mt-1 text-xs text-indigo-700">{t('endsNextDay')}: {displayDate(formatShiftEndDate(shift)!)}</p>}
                    </div>
                    <Badge variant={shift.registration_locked ? 'secondary' : 'outline'}>{fullyStaffed ? t('full') : shift.registration_locked ? t('closed') : t('openShifts')}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    data-testid={`open-shift-detail-card-${shift.id}`}
                    onClick={() => setDetailShift(shift)}
                    size="sm"
                    variant="outline"
                  >
                    {t('viewShiftDetail')}
                  </Button>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Info label={t('brand')} value={brandName(brands, shift.brand_id)} />
                    <Info label={t('platform')} value={platformName(platforms, shift.platform_id)} />
                    <Info label={t('campaign')} value={campaignName(campaigns, shift.campaign_id)} />
                  </div>
                  <div className="space-y-2">
                    {(capacities[shift.id] || []).map(capacity => {
                      const myRegistration = mine.find(registration => registration.operational_role === capacity.role)
                      const eligible = currentUser.operational_roles?.includes(capacity.role)
                      const assignmentKey = `${shift.id}-${capacity.role}`
                      const approvedAssignments = shiftRegistrations.filter(registration =>
                        registration.operational_role === capacity.role && isStaffedRegistration(registration)
                      )
                      const eligibleUsers = users.filter(user =>
                        user.operational_roles?.includes(capacity.role) &&
                        !shiftRegistrations.some(registration =>
                          registration.user_id === user.id &&
                          registration.operational_role === capacity.role &&
                          (registration.status === 'pending' || isStaffedRegistration(registration))
                        )
                      )
                      const canManageAssignments = hasPermission(currentUser, 'shifts.approve_registration')
                      return (
                        <div key={capacity.role} className="space-y-3 rounded-lg border p-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{t(capacity.role)}</span>
                                <Badge variant={capacity.remaining > 0 ? 'outline' : 'secondary'}>{capacity.approved}/{capacity.required}</Badge>
                              </div>
                              <Badge variant={capacity.remaining > 0 ? 'outline' : 'secondary'}>{capacity.remaining > 0 ? t('available') : t('full')}</Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                              <RoleSummary label={t('confirmedCount')} value={capacity.approved} />
                              <RoleSummary label={t('pendingCount')} value={capacity.pending} />
                              <RoleSummary label={t('missingCount')} value={capacity.remaining} />
                            </div>
                          </div>
                          {myRegistration ? (
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <Badge className={isStaffedRegistration(myRegistration) ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>{registrationLabel(myRegistration, t)}</Badge>
                              {myRegistration.source === 'manual_assignment' || myRegistration.status === 'manually_assigned' ? (
                                <Badge variant="outline">{t('assignedByManager')}</Badge>
                              ) : hasPermission(currentUser, 'shifts.cancel_registration') && !shift.registration_locked ? (
                                <Button size="sm" variant="outline" disabled={busyId === myRegistration.id} onClick={() => setRemovalTarget({ registration: myRegistration, kind: 'cancel' })}>{t('cancelRegistration')}</Button>
                              ) : null}
                            </div>
                          ) : mode === 'open' && !shift.registration_locked && eligible && capacity.remaining > 0 ? (
                            <Button size="sm" disabled={busyId === `${shift.id}-${capacity.role}`} onClick={() => runAction(`${shift.id}-${capacity.role}`, () => shiftRegistrationService.register(shift.id, currentUser.id, capacity.role), t('registrationPending'))}><UserPlus className="mr-1 h-4 w-4" />{t('register')}</Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              {eligible ? <Lock className="mr-1 h-3 w-3" /> : <Clock3 className="mr-1 h-3 w-3" />}
                              {!eligible ? t('roleNotEligible') : shift.registration_locked ? t('closed') : t('full')}
                            </Button>
                          )}
                          {canManageAssignments && (
                            <div className="space-y-2 border-t pt-3">
                              {approvedAssignments.map(registration => (
                                <div key={registration.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="min-w-0 font-medium">{users.find(user => user.id === registration.user_id)?.full_name || registration.user_id}<Badge className="ml-2 whitespace-nowrap" variant="outline">{registrationLabel(registration, t)}</Badge></span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === `remove-${registration.id}` || shift.registration_locked}
                                    onClick={() => setRemovalTarget({ registration, kind: 'unassign' })}
                                  >
                                    {t('removeAssignment')}
                                  </Button>
                                </div>
                              ))}
                              {!shift.registration_locked && capacity.approved < capacity.required && (
                                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
                                  <Select value={manualSelections[assignmentKey] || ''} onValueChange={value => setManualSelections(current => ({ ...current, [assignmentKey]: value }))}>
                                    <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={t('chooseStaff')} /></SelectTrigger>
                                    <SelectContent>{eligibleUsers.map(user => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    disabled={!manualSelections[assignmentKey] || busyId === `assign-${assignmentKey}`}
                                    onClick={() => runAction(
                                      `assign-${assignmentKey}`,
                                      () => shiftRegistrationService.assignManually(shift.id, manualSelections[assignmentKey], capacity.role, currentUser.id, shift.version),
                                      t('registrationApproved'),
                                    )}
                                  >
                                    {t('assignStaff')}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {(hasPermission(currentUser, 'shifts.export') || hasPermission(currentUser, 'shifts.lock')) && (
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                      {hasPermission(currentUser, 'shifts.export') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => exportShiftStaffingToExcel(shift, shiftRegistrations, new Map(users.map(user => [user.id, user.full_name])))}
                        >
                          <Download className="mr-1 h-4 w-4" />{t('exportStaffing')}
                        </Button>
                      )}
                      {hasPermission(currentUser, 'shifts.lock') && (shift.registration_locked
                        ? <Button size="sm" variant="outline" disabled={busyId === `lock-${shift.id}` || shift.status !== 'scheduled'} onClick={() => runAction(`lock-${shift.id}`, () => shiftService.reopen(shift.id, undefined, shift.version), t('reopenShift'))}><LockOpen className="mr-1 h-4 w-4" />{t('reopenShift')}</Button>
                        : <Button size="sm" variant="outline" disabled={busyId === `lock-${shift.id}`} onClick={() => runAction(`lock-${shift.id}`, () => shiftService.lock(shift.id, undefined, shift.version), t('lockShift'))}><Lock className="mr-1 h-4 w-4" />{t('lockShift')}</Button>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      {detailShift && (
        <ShiftDetailModal
          open
          onOpenChange={open => { if (!open) setDetailShift(null) }}
          shift={detailShift}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          allShifts={shifts}
          allRegistrations={registrations}
          onUpdate={() => {
            void (async () => {
              await loadData()
              const refreshed = await shiftService.getById(detailShift.id)
              if (refreshed) setDetailShift({ ...refreshed })
            })()
          }}
          onDelete={() => {
            setDetailShift(null)
            void loadData()
          }}
        />
      )}
      <LifecycleActionDialog open={Boolean(removalTarget)} onOpenChange={open => !open && setRemovalTarget(null)} title={removalTarget?.kind === 'cancel' ? 'Cancel registration' : 'Remove assignment'} impact={removalImpact} confirmText={removalTarget?.kind === 'cancel' ? 'Cancel registration' : 'Remove assignment'} onConfirm={confirmRemoval} />
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }> }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium">{value}</p></div>
}

function RoleSummary({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 rounded-md bg-muted/50 p-2"><p className="break-words text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <Button type="button" size="sm" variant={active ? 'secondary' : 'ghost'} className="whitespace-nowrap" aria-label={label} aria-pressed={active} title={label} onClick={onClick}>{icon}<span className="ml-2 hidden sm:inline">{label}</span></Button>
}

type MyShiftViewProps = {
  entries: MyShiftEntry[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  onManage: (shift: Shift) => void
}

function MyShiftCards({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const { t } = useTranslation()
  return <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2 min-[1900px]:grid-cols-3">
    {entries.map(({ shift, registration }) => <Card key={registration.id} data-testid={`my-shift-card-${registration.id}`}>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div>
        <CardTitle className="text-lg">{shift.title || `${brandName(brands, shift.brand_id)} live`}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} Â· {formatShiftTimeRange(shift)}</p>
      </div><Badge variant="secondary">{t(registration.operational_role)}</Badge></div></CardHeader>
      <CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Info label={t('brand')} value={brandName(brands, shift.brand_id)} /><Info label={t('platform')} value={platformName(platforms, shift.platform_id)} />
        <Info label={t('campaign')} value={campaignName(campaigns, shift.campaign_id)} /><Info label={t('status')} value={registrationLabel(registration, t)} />
      </div><div className="flex justify-end"><Button data-testid={`open-my-shift-detail-card-${registration.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewShiftDetail')}</Button></div></CardContent>
    </Card>)}
  </div>
}

function MyShiftCompactList({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const { t } = useTranslation()
  return <div className="space-y-3">{entries.map(({ shift, registration }) => <Card key={registration.id} data-testid={`my-shift-compact-${registration.id}`}><CardContent className="grid gap-3 pt-5 md:grid-cols-[minmax(220px,1.5fr)_minmax(100px,.7fr)_minmax(120px,.8fr)_auto] md:items-center">
    <div className="min-w-0"><p className="truncate font-semibold">{shift.title || `${brandName(brands, shift.brand_id)} live`}</p><p className="text-sm text-muted-foreground">{shift.date} Â· {formatShiftTimeRange(shift)} Â· {platformName(platforms, shift.platform_id)}</p><p className="truncate text-xs text-muted-foreground">{campaignName(campaigns, shift.campaign_id)}</p></div>
    <Info label={t('role')} value={t(registration.operational_role)} /><Info label={t('status')} value={registrationLabel(registration, t)} />
    <div className="flex items-center gap-2 md:justify-end"><Button data-testid={`open-my-shift-detail-compact-${registration.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></div>
  </CardContent></Card>)}</div>
}

function MyShiftTable({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const { t } = useTranslation()
  return <Card><CardContent className="overflow-x-auto pt-5"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left">
    <th className="p-2">{t('date')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('campaign')}</th><th className="p-2">{t('role')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('actions')}</th>
  </tr></thead><tbody>{entries.map(({ shift, registration }) => <tr className="border-b" key={registration.id} data-testid={`my-shift-row-${registration.id}`}>
    <td className="whitespace-nowrap p-2">{shift.date} Â· {formatShiftTimeRange(shift)}</td><td className="p-2 font-medium">{shift.title || 'â€”'}</td><td className="p-2">{brandName(brands, shift.brand_id)}</td><td className="p-2">{platformName(platforms, shift.platform_id)}</td><td className="p-2">{campaignName(campaigns, shift.campaign_id)}</td><td className="p-2">{t(registration.operational_role)}</td><td className="p-2"><Badge variant="outline">{registrationLabel(registration, t)}</Badge></td><td className="p-2"><Button data-testid={`open-my-shift-detail-table-${registration.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></td>
  </tr>)}</tbody></table></CardContent></Card>
}

function CompactShiftList({
  shifts,
  capacities,
  registrations,
  brands,
  platforms,
  campaigns,
  onManage,
}: {
  shifts: Shift[]
  capacities: CapacityMap
  registrations: ShiftRegistration[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  onManage: (shift: Shift) => void
}) {
  const { t } = useTranslation()
  return <div className="space-y-3">{shifts.map(shift => {
    const roleValue = (role: OperationalRole) => {
      const capacity = capacities[shift.id]?.find(item => item.role === role)
      return `${capacity?.approved || 0}/${capacity?.required || 0}`
    }
    const pending = registrations.filter(item => item.shift_id === shift.id && item.status === 'pending').length
    return <Card key={shift.id}><CardContent className="grid gap-3 pt-5 md:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(90px,.6fr))_auto] md:items-center">
      <div className="min-w-0"><p className="truncate font-semibold">{shift.title || `${brandName(brands, shift.brand_id)} live`}</p><p className="text-sm text-muted-foreground">{shift.date} · {formatShiftTimeRange(shift)} · {platformName(platforms, shift.platform_id)}</p><p className="truncate text-xs text-muted-foreground">{campaignName(campaigns, shift.campaign_id)}</p></div>
      <Info label={t('host')} value={roleValue('host')} />
      <Info label={t('support')} value={roleValue('support')} />
      <Info label={t('technical')} value={roleValue('technical')} />
      <div className="flex items-center gap-2 md:justify-end"><Badge variant={pending ? 'outline' : 'secondary'}>{t('pending')}: {pending}</Badge><Button data-testid={`open-shift-detail-compact-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></div>
    </CardContent></Card>
  })}</div>
}

function ShiftSummaryTable({
  allShifts,
  currentUser,
  onRegister,
  shifts,
  registrations,
  brands,
  platforms,
  campaigns,
  onManage,
}: {
  allShifts: Shift[]
  currentUser: User
  onRegister: (shiftId: string, role: OperationalRole) => Promise<void>
  shifts: Shift[]
  registrations: ShiftRegistration[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  onManage: (shift: Shift) => void
}) {
  const { t } = useTranslation()
  return <Card><CardContent className="overflow-x-auto pt-5"><table className="w-full min-w-[900px] text-sm">
    <thead><tr className="border-b text-left"><th className="p-2">{t('date')}</th><th className="p-2">{t('time')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('role')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('actions')}</th></tr></thead>
    <tbody>{shifts.flatMap(shift => roles.map(role => <tr className="border-b" key={`${shift.id}-${role}`}><td className="whitespace-nowrap p-2">{shift.date}</td><td className="whitespace-nowrap p-2">{formatShiftTimeRange(shift)}</td><td className="p-2">{brandName(brands, shift.brand_id)}</td><td className="p-2">{platformName(platforms, shift.platform_id)}</td><td className="p-2">{t(role)}</td><td className="p-2"><ShiftRegistrationActions allShifts={allShifts} compact currentUser={currentUser} onRegister={nextRole => onRegister(shift.id, nextRole)} registrations={registrations} role={role} shift={shift} /></td><td className="p-2"><Button data-testid={`open-shift-detail-table-${shift.id}-${role}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></td></tr>))}</tbody>
  </table></CardContent></Card>
}

function registrationLabel(
  registration: ShiftRegistration,
  translate: (key: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'manuallyAssigned' | 'removed') => string,
) {
  if (registration.status === 'manually_assigned') return translate('manuallyAssigned')
  if (registration.status === 'removed') return translate('removed')
  if (registration.status === 'available') return ''
  return translate(registration.status)
}

const brandName = (brands: Brand[], id: string) => brands.find(brand => brand.id === id)?.name || '—'
const platformName = (platforms: Platform[], id: string) => platforms.find(platform => platform.id === id)?.name || '—'
const campaignName = (campaigns: Campaign[], id?: string) => campaigns.find(campaign => campaign.id === id)?.name || '—'
const displayDate = (value: string) => value.split('-').reverse().join('/')
