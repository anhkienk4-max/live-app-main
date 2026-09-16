'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Download, Filter, LayoutGrid, List, Lock, LockOpen, RotateCcw, Search, Table2 } from 'lucide-react'
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
  RegistrationStatus,
  Shift,
  ShiftRegistration,
  User,
  DeletionImpact,
} from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { ActionBar } from '@/components/ui/action-bar'
import { buildStaffingApprovalActions } from '@/lib/ui/action-priority'
import { exportShiftStaffingToExcel } from '@/lib/utils/excelUtils'
import { formatShiftEndDate, formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { selectMyShiftEntries, type MyShiftEntry } from '@/lib/utils/myShifts'
import { getVisibleOperationalRoles, getVisibleRoleCapacities, matchesRoleFilter, type RoleSelection } from '@/lib/utils/shiftRegistrationRoleView'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'

import { ShiftRegistrationActions } from '@/components/features/calendar/ShiftRegistrationActions'
import { deriveStaffingAttention } from '@/lib/ui/operational-attention'
import { AttentionBanner } from '@/components/ui/operational-status'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import {
  buildStudioFilterOptions,
  calendarTimeScope,
  filterCalendarShifts,
  type CalendarTimeFilter,
  UNASSIGNED_STUDIO_FILTER,
} from '@/lib/utils/calendarFilters'

type Mode = 'open' | 'mine'
type Filters = {
  search: string
  time: CalendarTimeFilter
  customFrom: string
  customTo: string
  brandIds: string[]
  platformIds: string[]
  campaignIds: string[]
  studios: string[]
  roles: OperationalRole[]
  registrationStatuses: RegistrationStatus[]
}
type CapacityMap = Record<string, ShiftRoleCapacity[]>
type ViewMode = 'card' | 'compact' | 'table'

const initialFilters: Filters = {
  search: '',
  time: 'all',
  customFrom: '',
  customTo: '',
  brandIds: [],
  platformIds: [],
  campaignIds: [],
  studios: [],
  roles: [],
  registrationStatuses: [],
}

type OperationalLoadResult = { shifts: Shift[]; registrations: ShiftRegistration[] }
type OperationalLoadState = {
  active: boolean
  latest: Promise<OperationalLoadResult | null> | null
  value: number
}

const nextLoadVersion = (version: OperationalLoadState) => ++version.value
const isCurrentLoadVersion = (version: OperationalLoadState, expected: number) => version.active && version.value === expected

function useOperationalLoadState() {
  const state = React.useRef<OperationalLoadState>({ active: true, latest: null, value: 0 })
  const isActive = React.useCallback(() => state.current.active, [])
  const nextVersion = React.useCallback(() => nextLoadVersion(state.current), [])
  const isCurrent = React.useCallback((expected: number) => isCurrentLoadVersion(state.current, expected), [])
  const getLatest = React.useCallback(() => state.current.active ? state.current.latest : null, [])
  const setLatest = React.useCallback((request: Promise<OperationalLoadResult | null>) => { state.current.latest = request }, [])

  React.useEffect(() => {
    const loadState = state.current
    loadState.active = true
    return () => { loadState.active = false }
  }, [])

  return { getLatest, isActive, isCurrent, nextVersion, setLatest }
}

export function ShiftRegistrationBoard({ mode }: { mode: Mode }) {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const router = useRouter()
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
  const [showFilters, setShowFilters] = React.useState(false)
  const { getLatest, isActive, isCurrent, nextVersion, setLatest } = useOperationalLoadState()

  const loadReferenceData = React.useCallback(async () => {
    try {
      const [loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers] = await Promise.all([
        brandService.getAll(),
        platformService.getAll(),
        campaignService.getAll(),
        userService.getAll(),
      ])
      if (!isActive()) return
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
    } catch (error) {
      if (isActive()) setLoadError(error)
    }
  }, [isActive])

  const loadRegistrationOperationalData = React.useCallback(() => {
    const loadVersion = nextVersion()
    const request = (async () => {
      try {
        const [loadedShifts, loadedRegistrations] = await Promise.all([
          shiftService.getAll(),
          shiftRegistrationService.getAll(),
        ])
        if (!isCurrent(loadVersion)) {
          return getLatest()
        }
        setShifts(loadedShifts)
        setRegistrations(loadedRegistrations)
        setCapacities(Object.fromEntries(loadedShifts.map(shift => [
          shift.id,
          getShiftRoleCapacities(shift, loadedRegistrations),
        ])))
        return { shifts: loadedShifts, registrations: loadedRegistrations }
      } catch (error) {
        if (isCurrent(loadVersion)) setLoadError(error)
        return null
      } finally {
        if (isCurrent(loadVersion)) setLoading(false)
      }
    })()
    setLatest(request)
    return request
  }, [getLatest, isCurrent, nextVersion, setLatest])

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    await Promise.all([loadReferenceData(), loadRegistrationOperationalData()])
  }, [loadReferenceData, loadRegistrationOperationalData])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadData() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadData])
  React.useEffect(() => {
    const stored = window.localStorage.getItem('livestream-ops-open-shift-view')
    if (stored !== 'card' && stored !== 'compact' && stored !== 'table') return
    const frame = window.requestAnimationFrame(() => setViewMode(stored))
    return () => window.cancelAnimationFrame(frame)
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
      const refreshed = await loadRegistrationOperationalData()
      if (openShiftId && refreshed) {
        const refreshedShift = refreshed.shifts.find(shift => shift.id === openShiftId)

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
    const actionId = removalTarget.kind === 'cancel'
      ? removalTarget.registration.id
      : `remove-${removalTarget.registration.id}`
    setBusyId(actionId)
    try {
      if (removalTarget.kind === 'cancel') await shiftRegistrationService.cancel(removalTarget.registration.id, currentUser.id, reason, removalTarget.registration.version)
      else await shiftRegistrationService.removeAssignment(removalTarget.registration.id, currentUser.id, reason, removalTarget.registration.version)
      toast({ title: t('success'), description: removalTarget.kind === 'cancel' ? t('registrationCancelled') : t('removeAssignment'), variant: 'success' })
      setRemovalTarget(null)
      await loadRegistrationOperationalData()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    } finally {
      setBusyId(null)
    }
  }

  const [currentTime] = React.useState(() => Date.now())
  const timeScope = calendarTimeScope(filters.time, new Date(currentTime), filters.customFrom, filters.customTo)
  const studioOptions = React.useMemo(() => buildStudioFilterOptions(shifts), [shifts])
  const filteredBoardShifts = React.useMemo(() => filterCalendarShifts(
    shifts,
    {
      brandIds: filters.brandIds,
      platformIds: filters.platformIds,
      campaignIds: filters.campaignIds,
      studios: filters.studios,
      statuses: [],
      hostIds: [],
      supportIds: [],
      technicalIds: [],
      time: filters.time,
      customFrom: filters.customFrom,
      customTo: filters.customTo,
    },
    filters.search,
    { currentDate: new Date(currentTime), brands, platforms, campaigns, registrations },
  ), [brands, campaigns, currentTime, filters, platforms, registrations, shifts])
  const filteredBoardShiftIds = React.useMemo(() => new Set(filteredBoardShifts.map(shift => shift.id)), [filteredBoardShifts])
  const visibleShifts = React.useMemo(() => {
    return filteredBoardShifts
      .filter(shift => shift.status === 'scheduled' && (resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.endAt.getTime() ?? 0) > currentTime)
      .filter(shift => filters.roles.length === 0 || getVisibleRoleCapacities(capacities[shift.id] || [], filters.roles).some(capacity =>
        filters.roles.includes(capacity.role)
      ))
      .sort((left, right) => `${left.date}${left.start_time}`.localeCompare(`${right.date}${right.start_time}`))
  }, [capacities, currentTime, filteredBoardShifts, filters.roles])

  const visibleMyEntries = React.useMemo(() => selectMyShiftEntries({
    shifts,
    registrations,
    userId: currentUser?.id || '',
    filters: {
      date: '',
      brand: [],
      platform: [],
      campaign: [],
      role: filters.roles,
      registrationStatus: filters.registrationStatuses,
    },
  }).filter(entry => filteredBoardShiftIds.has(entry.shift.id)), [currentUser?.id, filteredBoardShiftIds, filters.registrationStatuses, filters.roles, registrations, shifts])

  const activeFilterCount = [
    filters.brandIds,
    filters.platformIds,
    filters.campaignIds,
    filters.studios,
    filters.roles,
    ...(mode === 'mine' ? [filters.registrationStatuses] : []),
  ].reduce((count, values) => count + values.length, 0) + (filters.search.trim() ? 1 : 0) + (filters.time === 'all' ? 0 : 1)
  const hasActiveFilters = activeFilterCount > 0

  const pendingApprovals = registrations.filter(registration =>
    registration.status === 'pending' &&
    matchesRoleFilter(registration, filters.roles) &&
    visibleShifts.some(shift => shift.id === registration.shift_id)
  )

  if (loading || userLoading || !currentUser) return <ContentSkeleton />
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  return (
    <div className="space-y-4">
      <Card className="border-none bg-background p-2 shadow-sm sm:p-3">
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={t('searchShifts')}
                className="pl-9"
                data-testid={`registration-${mode}-search`}
                onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
                placeholder={t('searchShifts')}
                value={filters.search}
              />
            </div>
            <Button
              aria-expanded={showFilters}
              data-testid={`registration-${mode}-filter-toggle`}
              onClick={() => setShowFilters(current => !current)}
              size="sm"
              type="button"
              variant={showFilters ? 'secondary' : 'outline'}
            >
              <Filter className="mr-2 h-4 w-4" />
              {t('filters')}
              {hasActiveFilters && <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">{activeFilterCount}</span>}
            </Button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3" data-testid={`registration-${mode}-filters`}>
              <MultiSelectFilter label={t('brand')} value={filters.brandIds} onChange={brandIds => setFilters(current => ({ ...current, brandIds }))} options={brands.map(brand => ({ value: brand.id, label: brand.name }))} placeholder={t('all')} testId="registration-brand-filter" />
              <MultiSelectFilter label={t('platform')} value={filters.platformIds} onChange={platformIds => setFilters(current => ({ ...current, platformIds }))} options={platforms.map(platform => ({ value: platform.id, label: platform.name }))} placeholder={t('all')} testId="registration-platform-filter" />
              <MultiSelectFilter label={t('campaign')} value={filters.campaignIds} onChange={campaignIds => setFilters(current => ({ ...current, campaignIds }))} options={campaigns.map(campaign => ({ value: campaign.id, label: campaign.name }))} placeholder={t('all')} testId="registration-campaign-filter" />
              <div>
                <label className="mb-1 block text-xs font-medium">{t('time')}</label>
                <Select value={filters.time} onValueChange={time => setFilters(current => ({ ...current, time: time as CalendarTimeFilter }))}>
                  <SelectTrigger data-testid="registration-time-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')}</SelectItem>
                    <SelectItem value="today">{t('today')}</SelectItem>
                    <SelectItem value="current_week">{t('week')}</SelectItem>
                    <SelectItem value="current_month">{t('month')}</SelectItem>
                    <SelectItem value="custom">{t('customRange')}</SelectItem>
                  </SelectContent>
                </Select>
                {!timeScope.valid && <p className="mt-1 text-xs text-red-600" role="alert">{timeScope.error}</p>}
              </div>
              {filters.time === 'custom' && <>
                <label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.customFrom} onChange={event => setFilters(current => ({ ...current, customFrom: event.target.value }))} /></label>
                <label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.customTo} onChange={event => setFilters(current => ({ ...current, customTo: event.target.value }))} /></label>
              </>}
              <MultiSelectFilter label={t('studio')} value={filters.studios} onChange={studios => setFilters(current => ({ ...current, studios }))} options={studioOptions.map(option => ({ ...option, label: option.value === UNASSIGNED_STUDIO_FILTER ? t('notAssigned') : option.label }))} placeholder={t('all')} testId="registration-studio-filter" />
              <MultiSelectFilter label={t('role')} value={filters.roles} onChange={roles => setFilters(current => ({ ...current, roles: roles as OperationalRole[] }))} options={getVisibleOperationalRoles('all').map(role => ({ value: role, label: t(role) }))} placeholder={t('all')} testId="registration-role-filter" />
              {mode === 'mine' && (
                <MultiSelectFilter
                  label={t('registrationStatus')}
                  onChange={registrationStatuses => setFilters(current => ({ ...current, registrationStatuses: registrationStatuses as RegistrationStatus[] }))}
                  options={(['pending', 'approved', 'manually_assigned'] as RegistrationStatus[]).map(status => ({ value: status, label: status === 'manually_assigned' ? t('manuallyAssigned') : t(status) }))}
                  placeholder={t('all')}
                  testId="registration-status-filter"
                  value={filters.registrationStatuses}
                />
              )}
              <div className="flex items-end">
                <Button className="w-full" disabled={!hasActiveFilters} onClick={() => setFilters(initialFilters)} size="sm" type="button" variant="outline">
                  <RotateCcw className="mr-2 h-3 w-3" />{t('resetFilters')}
                </Button>
              </div>
            </div>
          )}
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
        <Card className="border-amber-200 bg-amber-50/30 shadow-none">
          {deriveStaffingAttention({ pendingCount: pendingApprovals.length }).map(item => (
            <div key={item.key} className="mb-3">
              <AttentionBanner item={item} className="border-0 rounded-b-none border-b border-amber-200/50 bg-transparent" />
            </div>
          ))}
          <CardContent className="space-y-2 px-4 pb-4">
            {pendingApprovals.map(registration => {
              const shift = shifts.find(candidate => candidate.id === registration.shift_id)
              const staff = users.find(user => user.id === registration.user_id) || { full_name: registration.user_id }
              if (!shift) return null
              return (
                <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/50 bg-background/80 p-3 shadow-sm">
                  <div>
                    <p className="font-medium text-sm">{staff.full_name} <span className="text-muted-foreground font-normal mx-1">·</span> {t(registration.operational_role)}</p>
                    <p className="text-xs text-muted-foreground">{shift.title || shift.id} <span className="mx-1">·</span> {shift.date} {formatShiftTimeRange(shift)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{format(new Date(registration.requested_at), 'dd/MM/yyyy HH:mm')}{registration.review_notes ? ` · ${registration.review_notes}` : ''}</p>
                  </div>
                  <ActionBar
                    compact
                    collapseAt="sm"
                    actions={buildStaffingApprovalActions(
                      { isBusy: busyId === registration.id, canApprove: true, canReject: true, canRemove: true },
                      {
                        approve: () => runAction(registration.id, () => shiftRegistrationService.approve(registration.id, currentUser.id, undefined, registration.version), t('registrationApproved')),
                        reject: () => runAction(registration.id, () => shiftRegistrationService.reject(registration.id, currentUser.id, undefined, registration.version), t('rejected')),
                        remove: () => setRemovalTarget({ registration, kind: 'unassign' }),
                      },
                      { approve: t('approve'), reject: t('reject'), remove: t('removeAssignment') }
                    )}
                  />
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
          <MyShiftTable entries={visibleMyEntries} brands={brands} platforms={platforms} campaigns={campaigns} onManage={(shift) => router.push(`/shifts/${shift.id}`)} />
        ) : viewMode === 'compact' ? (
          <MyShiftCompactList entries={visibleMyEntries} brands={brands} platforms={platforms} campaigns={campaigns} onManage={(shift) => router.push(`/shifts/${shift.id}`)} />
        ) : (
          <MyShiftCards entries={visibleMyEntries} brands={brands} platforms={platforms} campaigns={campaigns} onManage={(shift) => router.push(`/shifts/${shift.id}`)} />
        )
      ) : viewMode === 'table' ? (
        <ShiftSummaryTable
          allShifts={shifts}
          currentUser={currentUser}
          onRegister={(shiftId, role) => runAction(`${shiftId}-${role}`, () => shiftRegistrationService.register(shiftId, currentUser.id, role), t('registrationPending'), shiftId)}
          shifts={visibleShifts}
          registrations={registrations}
          roleFilter={filters.roles}
          brands={brands}
          platforms={platforms}
          onManage={(shift) => router.push(`/shifts/${shift.id}`)}
        />
      ) : viewMode === 'compact' ? (
        <CompactShiftList
          allShifts={shifts}
          brands={brands}
          campaigns={campaigns}
          capacities={capacities}
          currentUser={currentUser}
          onManage={(shift) => router.push(`/shifts/${shift.id}`)}
          onRegister={(shiftId, role) => runAction(`${shiftId}-${role}`, () => shiftRegistrationService.register(shiftId, currentUser.id, role), t('registrationPending'), shiftId)}
          platforms={platforms}
          registrations={registrations}
          roleFilter={filters.roles}
          shifts={visibleShifts}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2 min-[1900px]:grid-cols-3">
          {visibleShifts.map(shift => {
            const shiftRegistrations = registrations.filter(registration => registration.shift_id === shift.id)
            const mine = shiftRegistrations.filter(registration =>
              registration.user_id === currentUser.id &&
              !['cancelled', 'rejected', 'removed'].includes(registration.status)
            )
            const visibleCapacities = getVisibleRoleCapacities(capacities[shift.id] || [], filters.roles)
            const fullyStaffed = visibleCapacities.every(capacity => capacity.approved >= capacity.required)
            return (
              <Card key={shift.id} className="shadow-sm border-border overflow-hidden">
                <CardHeader className="p-4 pb-2 bg-muted/10 border-b">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{shift.title || `${brandName(brands, shift.brand_id)} live`}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} · {formatShiftTimeRange(shift)}</p>
                      {formatShiftEndDate(shift) && <p className="mt-1 text-xs text-indigo-700">{t('endsNextDay')}: {displayDate(formatShiftEndDate(shift)!)}</p>}
                    </div>
                    <Badge variant={shift.registration_locked ? 'secondary' : 'outline'}>{fullyStaffed ? t('full') : shift.registration_locked ? t('closed') : t('openShifts')}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      data-testid={`open-shift-detail-card-${shift.id}`}
                      onClick={() => router.push(`/shifts/${shift.id}`)}
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs font-medium"
                    >
                      {t('viewShiftDetail')}
                    </Button>
                    <ShiftRegistrationActions
                      allShifts={shifts}
                      compact
                      currentUser={currentUser}
                      onRegister={role => runAction(`${shift.id}-${role}`, () => shiftRegistrationService.register(shift.id, currentUser.id, role), t('registrationPending'), shift.id)}
                      registrations={registrations}
                      shift={shift}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Info label={t('brand')} value={brandName(brands, shift.brand_id)} />
                    <Info label={t('platform')} value={platformName(platforms, shift.platform_id)} />
                    <Info label={t('campaign')} value={campaignName(campaigns, shift.campaign_id)} />
                  </div>
                  <div className="space-y-2">
                    {visibleCapacities.map(capacity => {
                      const myRegistration = mine.find(registration => registration.operational_role === capacity.role)
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
                          {myRegistration && (
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <Badge className={isStaffedRegistration(myRegistration) ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>{registrationLabel(myRegistration, t)}</Badge>
                              {myRegistration.source === 'manual_assignment' || myRegistration.status === 'manually_assigned' ? (
                                <Badge variant="outline">{t('assignedByManager')}</Badge>
                              ) : hasPermission(currentUser, 'shifts.cancel_registration') && !shift.registration_locked ? (
                                <Button size="sm" variant="outline" disabled={busyId === myRegistration.id} onClick={() => setRemovalTarget({ registration: myRegistration, kind: 'cancel' })}>{t('cancelRegistration')}</Button>
                              ) : null}
                            </div>
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

      <LifecycleActionDialog open={Boolean(removalTarget)} onOpenChange={open => !open && setRemovalTarget(null)} title={removalTarget?.kind === 'cancel' ? 'Cancel registration' : 'Remove assignment'} impact={removalImpact} confirmText={removalTarget?.kind === 'cancel' ? 'Cancel registration' : 'Remove assignment'} onConfirm={confirmRemoval} />
    </div>
  )
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
  const router = useRouter()
  const { t } = useTranslation()
  return <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2 min-[1900px]:grid-cols-3">
    {entries.map(({ shift, registrations }) => <Card key={shift.id} data-testid={`my-shift-card-${shift.id}`}>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div>
        <CardTitle className="text-lg">{shift.title || `${brandName(brands, shift.brand_id)} live`}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} Â· {formatShiftTimeRange(shift)}</p>
      </div><div className="flex flex-wrap gap-1">{registrations.map(registration => <Badge key={registration.id} variant="secondary">{t(registration.operational_role)}</Badge>)}</div></div></CardHeader>
      <CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Info label={t('brand')} value={brandName(brands, shift.brand_id)} /><Info label={t('platform')} value={platformName(platforms, shift.platform_id)} />
        <Info label={t('campaign')} value={campaignName(campaigns, shift.campaign_id)} /><Info label={t('status')} value={registrations.map(registration => registrationLabel(registration, t)).join(', ')} />
      </div><div className="flex justify-end"><Button data-testid={`open-my-shift-detail-card-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewShiftDetail')}</Button></div></CardContent>
    </Card>)}
  </div>
}

function MyShiftCompactList({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const router = useRouter()
  const { t } = useTranslation()
  return <div className="space-y-3">{entries.map(({ shift, registrations }) => <Card key={shift.id} data-testid={`my-shift-compact-${shift.id}`}><CardContent className="grid gap-3 pt-5 md:grid-cols-[minmax(220px,1.5fr)_minmax(100px,.7fr)_minmax(120px,.8fr)_auto] md:items-center">
    <div className="min-w-0"><p className="truncate font-semibold">{shift.title || `${brandName(brands, shift.brand_id)} live`}</p><p className="text-sm text-muted-foreground">{shift.date} Â· {formatShiftTimeRange(shift)} Â· {platformName(platforms, shift.platform_id)}</p><p className="truncate text-xs text-muted-foreground">{campaignName(campaigns, shift.campaign_id)}</p></div>
    <Info label={t('role')} value={registrations.map(registration => t(registration.operational_role)).join(', ')} /><Info label={t('status')} value={registrations.map(registration => registrationLabel(registration, t)).join(', ')} />
    <div className="flex items-center gap-2 md:justify-end"><Button data-testid={`open-my-shift-detail-compact-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></div>
  </CardContent></Card>)}</div>
}

function MyShiftTable({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const router = useRouter()
  const { t } = useTranslation()
  return <Card><CardContent className="overflow-x-auto pt-5"><div className="w-full overflow-x-auto min-w-0">
<table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left">
    <th className="p-2">{t('date')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('campaign')}</th><th className="p-2">{t('role')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('actions')}</th>
  </tr></thead><tbody>{entries.map(({ shift, registrations }) => <tr className="border-b" key={shift.id} data-testid={`my-shift-row-${shift.id}`}>
    <td className="whitespace-nowrap p-2">{shift.date} Â· {formatShiftTimeRange(shift)}</td><td className="p-2 font-medium">{shift.title || 'â€”'}</td><td className="p-2">{brandName(brands, shift.brand_id)}</td><td className="p-2">{platformName(platforms, shift.platform_id)}</td><td className="p-2">{campaignName(campaigns, shift.campaign_id)}</td><td className="p-2">{registrations.map(registration => t(registration.operational_role)).join(', ')}</td><td className="p-2">{registrations.map(registration => <Badge className="mr-1" key={registration.id} variant="outline">{registrationLabel(registration, t)}</Badge>)}</td><td className="p-2"><Button data-testid={`open-my-shift-detail-table-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></td>
  </tr>)}</tbody></table>
</div></CardContent></Card>
}

function CompactShiftList({
  allShifts,
  shifts,
  capacities,
  registrations,
  roleFilter,
  brands,
  platforms,
  campaigns,
  currentUser,
  onRegister,
  onManage,
}: {
  allShifts: Shift[]
  shifts: Shift[]
  capacities: CapacityMap
  registrations: ShiftRegistration[]
  roleFilter: RoleSelection
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  currentUser: User
  onRegister: (shiftId: string, role: OperationalRole) => Promise<void>
  onManage: (shift: Shift) => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  return <div className="space-y-3">{shifts.map(shift => {
    const roleValue = (role: OperationalRole) => {
      const capacity = capacities[shift.id]?.find(item => item.role === role)
      return `${capacity?.approved || 0}/${capacity?.required || 0}`
    }
    const visibleRoles = getVisibleOperationalRoles(roleFilter)
    const pending = registrations.filter(item => item.shift_id === shift.id && item.status === 'pending' && matchesRoleFilter(item, roleFilter)).length
    return <Card key={shift.id}><CardContent className="grid gap-3 pt-5 md:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(90px,.6fr))_auto] md:items-center">
      <div className="min-w-0"><p className="truncate font-semibold">{shift.title || `${brandName(brands, shift.brand_id)} live`}</p><p className="text-sm text-muted-foreground">{shift.date} · {formatShiftTimeRange(shift)} · {platformName(platforms, shift.platform_id)}</p><p className="truncate text-xs text-muted-foreground">{campaignName(campaigns, shift.campaign_id)}</p></div>
      {visibleRoles.map(role => <Info key={role} label={t(role)} value={roleValue(role)} />)}
      <div className="flex items-center gap-2 md:justify-end">
        <Badge variant={pending ? 'outline' : 'secondary'}>{t('pending')}: {pending}</Badge>
        <ShiftRegistrationActions allShifts={allShifts} compact currentUser={currentUser} onRegister={role => onRegister(shift.id, role)} registrations={registrations} shift={shift} />
        <Button data-testid={`open-shift-detail-compact-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button>
      </div>
    </CardContent></Card>
  })}</div>
}

function ShiftSummaryTable({
  allShifts,
  currentUser,
  onRegister,
  shifts,
  registrations,
  roleFilter,
  brands,
  platforms,
  onManage,
}: {
  allShifts: Shift[]
  currentUser: User
  onRegister: (shiftId: string, role: OperationalRole) => Promise<void>
  shifts: Shift[]
  registrations: ShiftRegistration[]
  roleFilter: RoleSelection
  brands: Brand[]
  platforms: Platform[]
  onManage: (shift: Shift) => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  return <Card><CardContent className="overflow-x-auto pt-5"><div className="w-full overflow-x-auto min-w-0">
<table className="w-full min-w-[900px] text-sm">
    <thead><tr className="border-b text-left"><th className="p-2">{t('date')}</th><th className="p-2">{t('time')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('role')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('actions')}</th></tr></thead>
    <tbody>{shifts.map(shift => {
      const visibleCapacities = getVisibleRoleCapacities(getShiftRoleCapacities(shift, registrations), roleFilter)
      return <tr className="border-b" data-testid={`open-shift-row-${shift.id}`} key={shift.id}>
        <td className="whitespace-nowrap p-2">{shift.date}</td>
        <td className="whitespace-nowrap p-2">{formatShiftTimeRange(shift)}</td>
        <td className="p-2">{brandName(brands, shift.brand_id)}</td>
        <td className="p-2">{platformName(platforms, shift.platform_id)}</td>
        <td className="p-2">{visibleCapacities.map(capacity => t(capacity.role)).join(', ')}</td>
        <td className="p-2">{visibleCapacities.map(capacity => `${t(capacity.role)} ${capacity.approved}/${capacity.required}`).join(' · ')}</td>
        <td className="p-2"><div className="flex items-center gap-2"><ShiftRegistrationActions allShifts={allShifts} compact currentUser={currentUser} onRegister={role => onRegister(shift.id, role)} registrations={registrations} shift={shift} /><Button data-testid={`open-shift-detail-table-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></div></td>
      </tr>
    })}</tbody>
  </table>
</div></CardContent></Card>
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
