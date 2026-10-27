'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { Download, Filter, LayoutGrid, List, Lock, LockOpen, RotateCcw, Search, Table2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  shiftRegistrationService,
  shiftService,
  getShiftRoleCapacities,
  isStaffedRegistration,
  type ShiftRoleCapacity,
} from '@/lib/services/dataService'
import { getCalendarReferences } from '@/lib/services/calendarReferenceData'
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
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { useTranslation } from '@/lib/i18n'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { readPage } from '@/lib/utils/pagination'
import type { ListFilters } from '@/lib/services/operationsPageService'
import { ActionBar } from '@/components/ui/action-bar'
import { buildStaffingApprovalActions } from '@/lib/ui/action-priority'
import { CalendarExportDialog } from '@/components/features/shifts/CalendarExportDialog'
import { formatShiftEndDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
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
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { ShiftRegistrationActions } from '@/components/features/calendar/ShiftRegistrationActions'
import { deriveStaffingAttention } from '@/lib/ui/operational-attention'
import { AttentionBanner } from '@/components/ui/operational-status'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import {
  buildStudioFilterOptions,
  calendarTimeScope,
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
  const { t } = useTranslation()
  const { toast } = useToast()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [capacities, setCapacities] = React.useState<CapacityMap>({})
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [manualSelections, setManualSelections] = React.useState<Record<string, string>>({})
  const pagination = useListPagination(mode, 10)
  const { params, navigate, page, pageSize } = pagination
  const rawFilters = params.get(mode + '_filters') ?? ''
  const filters = React.useMemo((): Filters => {
    try {
      const parsed = JSON.parse(rawFilters)
      return { ...initialFilters, ...parsed,
        ...Object.fromEntries(['brandIds', 'platformIds', 'campaignIds', 'studios', 'roles', 'registrationStatuses'].map(key => [key, Array.isArray(parsed[key]) ? parsed[key].filter((value: unknown) => typeof value === 'string') : []])),
        search: typeof parsed.search === 'string' ? parsed.search : '',
      }
    } catch { return initialFilters }
  }, [rawFilters])
  const setFilters = (value: Filters | ((current: Filters) => Filters)) => {
    const next = typeof value === 'function' ? value(filters) : value
    navigate({ [mode + '_filters']: JSON.stringify(next), [mode + '_page']: null, [mode + '_pending']: null })
  }
  const pendingPage = readPage(params.get(mode + '_pending'))
  const [total, setTotal] = React.useState(0)
  const [pendingTotal, setPendingTotal] = React.useState(0)
  const [pendingIds, setPendingIds] = React.useState<string[]>([])
  const [studios, setStudios] = React.useState<string[]>([])
  const [currentTime] = React.useState(() => Date.now())
  const timeScope = calendarTimeScope(filters.time, new Date(currentTime), filters.customFrom, filters.customTo)
  const queryFilters = JSON.stringify({
    search: filters.search, brandIds: filters.brandIds, platformIds: filters.platformIds,
    campaignIds: filters.campaignIds, studios: filters.studios, roles: filters.roles,
    registrationStatuses: filters.registrationStatuses, from: timeScope.from, to: timeScope.to,
  } satisfies ListFilters)
  const identity = currentUser ? currentUser.id + ':' + (currentUser.system_permission ?? currentUser.role) : ''
  const requestKey = identity + ':' + mode + ':' + page + ':' + pageSize + ':' + pendingPage + ':' + queryFilters
  const [loadedKey, setLoadedKey] = React.useState('')
  const boardRoot = React.useRef<HTMLDivElement>(null)
  const previousRequestKey = React.useRef(requestKey)
  React.useEffect(() => {
    if (previousRequestKey.current === requestKey) return
    previousRequestKey.current = requestKey
    const frame = window.requestAnimationFrame(() => {
      const root = boardRoot.current
      const viewportTop = root?.closest('main')?.getBoundingClientRect().top ?? 0
      if (root && root.getBoundingClientRect().top < viewportTop) root.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [requestKey])

  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [removalTarget, setRemovalTarget] = React.useState<{ registration: ShiftRegistration; kind: 'cancel' | 'unassign' } | null>(null)
  const viewValue = params.get(mode + '_view')
  const viewMode: ViewMode = viewValue === 'table' || viewValue === 'card' ? viewValue : 'compact'
  const [detailShift, setDetailShift] = React.useState<Shift | null>(null)
  const [exportShiftId, setExportShiftId] = React.useState<string | null>(null)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [showFilters, setShowFilters] = React.useState(false)
  const { getLatest, isActive, isCurrent, nextVersion, setLatest } = useOperationalLoadState()

  const referenceVersion = React.useRef(0)
  const loadReferenceData = React.useCallback(async () => {
    const version = ++referenceVersion.current
    try {
      if (!currentUser) return
      const { brands: loadedBrands, platforms: loadedPlatforms, campaigns: loadedCampaigns, users: loadedUsers } = await getCalendarReferences(currentUser)
      if (!isActive() || version !== referenceVersion.current) return
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
    } catch (error) {
      if (isActive() && version === referenceVersion.current) setLoadError(error)
    }
  }, [currentUser, isActive])

  const loadRegistrationOperationalData = React.useCallback((signal?: AbortSignal) => {
    const loadVersion = nextVersion()
    const request = (async () => {
      try {
        if (!identity) return null
        const result = await shiftService.getRegistrationPage(mode, { page, pageSize, pendingPage, filters: JSON.parse(queryFilters) }, signal)
        const loadedShifts = result.items
        const loadedRegistrations = result.registrations
        if (!isCurrent(loadVersion)) {
          return getLatest()
        }
        if (result.page !== page || result.pendingPage !== pendingPage) {
          navigate({ [mode + '_page']: String(result.page), [mode + '_pending']: String(result.pendingPage) }, true)
        }
        setTotal(result.total)
        setPendingTotal(result.pendingTotal)
        setPendingIds(result.pendingIds)
        setStudios(result.studios)
        setLoadedKey(requestKey)
        setShifts(loadedShifts)
        setRegistrations(loadedRegistrations)
        setCapacities(Object.fromEntries(loadedShifts.map(shift => [
          shift.id,
          getShiftRoleCapacities(shift, loadedRegistrations),
        ])))
        return { shifts: loadedShifts, registrations: loadedRegistrations }
      } catch (error) {
        if (isCurrent(loadVersion) && !(error instanceof Error && error.name === 'AbortError')) setLoadError(error)
        return null
      } finally {
        if (isCurrent(loadVersion)) setLoading(false)
      }
    })()
    setLatest(request)
    return request
  }, [getLatest, identity, isCurrent, mode, navigate, nextVersion, page, pageSize, pendingPage, queryFilters, requestKey, setLatest])

  const loadData = React.useCallback(async (signal?: AbortSignal) => {
    setLoadError(null)
    setLoading(true)
    await Promise.all([loadReferenceData(), loadRegistrationOperationalData(signal)])
  }, [loadReferenceData, loadRegistrationOperationalData])
  useShiftChangeRefresh(() => loadData())

  React.useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (!identity) return
      setLoadError(null)
      setLoading(true)
      void loadRegistrationOperationalData(controller.signal)
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort(); nextVersion() }
  }, [identity, loadRegistrationOperationalData, nextVersion, requestKey])
  React.useEffect(() => {
    const timer = window.setTimeout(() => { if (identity) void loadReferenceData() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [identity, loadReferenceData])

  React.useEffect(()=>{
    if(viewValue)return
    const stored=window.localStorage.getItem('livestream-ops-'+mode+'-shift-view')??window.localStorage.getItem('livestream-ops-open-shift-view')
    if(stored==='table'||stored==='compact'||stored==='card')navigate({[mode+'_view']:stored,...(!params.get(mode+'_size')?{[mode+'_size']:stored==='table'?'20':'10'}:{})},true)
  },[mode,navigate,params,viewValue])

  const changeViewMode = (next: ViewMode) => {
    window.localStorage.setItem('livestream-ops-'+mode+'-shift-view',next)
    navigate({ [mode + '_view']: next, [mode + '_page']: null, [mode + '_size']: next === 'table' ? '20' : '10', [mode + '_pending']: null })
  }

  const runAction = async (id: string, action: () => Promise<unknown>, success: string, openShiftId?: string, throwAfterToast = false) => {
    setBusyId(id)
    try {
      await action()
      toast({ title: t('success'), description: success, variant: 'success' })
      const refreshed = await loadRegistrationOperationalData()
      if (openShiftId && refreshed) {
        const refreshedShift = refreshed.shifts.find(shift => shift.id === openShiftId)
        if (refreshedShift) setDetailShift(refreshedShift)
      }
    } catch (error) {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : t('validationError'),
        variant: 'destructive',
      })
      if (throwAfterToast) throw error
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

  const studioOptions = React.useMemo(() => buildStudioFilterOptions(studios.map(studio => ({ studio }) as Shift)), [studios])
  const visibleShifts = shifts
  const visibleMyEntries = React.useMemo(() => selectMyShiftEntries({
    shifts, registrations, userId: currentUser?.id || '',
    filters: { date: '', brand: [], platform: [], campaign: [], role: filters.roles, registrationStatus: filters.registrationStatuses },
  }), [currentUser?.id, filters.registrationStatuses, filters.roles, registrations, shifts])

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
    pendingIds.includes(registration.id) && registration.status === 'pending' &&
    matchesRoleFilter(registration, filters.roles) &&
    visibleShifts.some(shift => shift.id === registration.shift_id)
  )

  if (userLoading || !currentUser) return <ContentSkeleton />

  return (
    <div ref={boardRoot} className="space-y-4">
      <CalendarExportDialog open={exportOpen} onOpenChange={setExportOpen} shiftId={exportShiftId ?? undefined} selectedIds={exportShiftId ? [exportShiftId] : []} filters={JSON.parse(queryFilters)} listScope={mode} />
      {!!loadError && <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />}
      <Card className="border-none bg-background p-2 shadow-sm sm:p-3">
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {hasPermission(currentUser, 'shifts.export') && <Button size="sm" variant="outline" onClick={() => { setExportShiftId(null); setExportOpen(true) }}><Download className="mr-2 h-4 w-4" />{t('exportExcel')}</Button>}
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
          <p className="text-sm text-muted-foreground">{total} {mode === 'mine' ? t('myShifts').toLowerCase() : t('openShifts').toLowerCase()}</p>
          <div className="inline-flex rounded-lg border bg-background p-1" aria-label={mode === 'mine' ? 'My shift view' : 'Open shift view'}>
            <ViewButton active={viewMode === 'card'} onClick={() => changeViewMode('card')} icon={<LayoutGrid className="h-4 w-4" />} label={t('cardView')} />
            <ViewButton active={viewMode === 'compact'} onClick={() => changeViewMode('compact')} icon={<List className="h-4 w-4" />} label={t('compactView')} />
            <ViewButton active={viewMode === 'table'} onClick={() => changeViewMode('table')} icon={<Table2 className="h-4 w-4" />} label={t('tableView')} />
          </div>
        </div>
      )}

      {loading && loadedKey === requestKey && <div role="status" className="text-xs text-muted-foreground">{t('loading')}</div>}
      {loadedKey !== requestKey ? <ContentSkeleton /> : <>
      {mode === 'open' && hasPermission(currentUser, 'shifts.approve_registration') && pendingTotal > 0 && (
        <Card className="border-amber-200 bg-amber-50/30 shadow-none">
          {deriveStaffingAttention({ pendingCount: pendingTotal }).map(item => (
            <div key={item.key} className="mb-3">
              <AttentionBanner item={item} className="border-0 rounded-b-none border-b border-amber-200/50 bg-transparent" />
            </div>
          ))}
          <CardContent className="space-y-2 px-4 pb-4">
            <p className="text-xs text-muted-foreground">{t('pendingOnCurrentPage')}</p>
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
          <HistoryPagination page={pendingPage} pageSize={20} total={pendingTotal} onPageChange={value => navigate({ [mode + '_pending']: String(value) })} />
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
          onRegister={(shiftId, role) => runAction(`${shiftId}-${role}`, () => shiftRegistrationService.register(shiftId, currentUser.id, role), t('registrationPending'), shiftId, true)}
          shifts={visibleShifts}
          registrations={registrations}
          roleFilter={filters.roles}
          brands={brands}
          platforms={platforms}
          onManage={setDetailShift}
        />
      ) : viewMode === 'compact' ? (
        <CompactShiftList
          allShifts={shifts}
          brands={brands}
          campaigns={campaigns}
          capacities={capacities}
          currentUser={currentUser}
          onManage={setDetailShift}
          onRegister={(shiftId, role) => runAction(`${shiftId}-${role}`, () => shiftRegistrationService.register(shiftId, currentUser.id, role), t('registrationPending'), shiftId, true)}
          platforms={platforms}
          registrations={registrations}
          roleFilter={filters.roles}
          shifts={visibleShifts}
          users={users}
          busyId={busyId}
          onCancelRegistration={reg => setRemovalTarget({ registration: reg, kind: 'cancel' })}
          onRemoveAssignment={reg => setRemovalTarget({ registration: reg, kind: 'unassign' })}
          onAssignManually={async (shiftId, role, userId, version) => {
            await runAction(
              `assign-${shiftId}-${role}`,
              () => shiftRegistrationService.assignManually(shiftId, userId, role, currentUser.id, version),
              t('registrationApproved'),
            )
          }}
          manualSelections={manualSelections}
          setManualSelections={setManualSelections}
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
                      onClick={() => setDetailShift(shift)}
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs font-medium"
                    >
                      {t('viewShiftDetail')}
                    </Button>
                    <ShiftRegistrationActions
                      allShifts={shifts}
                       brandName={brandName(brands, shift.brand_id)}
                       platformName={platformName(platforms, shift.platform_id)}
                      compact
                      currentUser={currentUser}
                      onRegister={role => runAction(`${shift.id}-${role}`, () => shiftRegistrationService.register(shift.id, currentUser.id, role), t('registrationPending'), shift.id, true)}
                      registrations={registrations}
                      shift={shift}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Info label={t('brand')} value={brandName(brands, shift.brand_id)} />
                    <Info label={t('platform')} value={platformName(platforms, shift.platform_id)} />
                    <Info label={t('campaign')} value={campaignName(campaigns, shift.campaign_id)} />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {visibleCapacities.map(capacity => <div key={capacity.role} className="rounded-lg border p-2 text-xs">
                      <p className="font-medium">{t(capacity.role)} · {capacity.approved}/{capacity.required}</p>
                      <p className="text-muted-foreground">{t('pending')}: {capacity.pending} · {t('missingCount')}: {capacity.remaining}</p>
                    </div>)}
                  </div>
                  {mine.length > 0 && <div className="flex flex-wrap gap-2">{mine.map(registration => <Badge key={registration.id} variant="outline">{t(registration.operational_role)} · {registrationLabel(registration, t)}</Badge>)}</div>}
                  {(hasPermission(currentUser, 'shifts.export') || hasPermission(currentUser, 'shifts.lock')) && (
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                      {hasPermission(currentUser, 'shifts.export') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setExportShiftId(shift.id); setExportOpen(true) }}
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
      <HistoryPagination page={page} pageSize={pageSize} total={total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
      </>}
      {detailShift && loadedKey === requestKey && (
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
          onUpdate={(updatedShift?: Shift) => {
            void (async () => {
              if (updatedShift) {
                setDetailShift(updatedShift)
                await loadRegistrationOperationalData()
              } else {
                const refreshed = await loadRegistrationOperationalData()
                const refreshedShift = refreshed?.shifts.find(shift => shift.id === detailShift.id)
                if (refreshedShift) setDetailShift({ ...refreshedShift })
              }
            })()
          }}
          onDelete={() => {
            setDetailShift(null)
            void loadRegistrationOperationalData()
          }}
        />
      )}
      <LifecycleActionDialog open={Boolean(removalTarget)} onOpenChange={open => !open && setRemovalTarget(null)} title={removalTarget?.kind === 'cancel' ? 'Cancel registration' : 'Remove assignment'} impact={removalImpact} confirmText={removalTarget?.kind === 'cancel' ? 'Cancel registration' : 'Remove assignment'} onConfirm={confirmRemoval} />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium">{value}</p></div>
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
    {entries.map(({ shift, registrations }) => <Card key={shift.id} data-testid={`my-shift-card-${shift.id}`}>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div>
        <CardTitle className="text-lg">{shift.title || `${brandName(brands, shift.brand_id)} live`}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} · {formatShiftTimeRange(shift)}</p>
      </div><div className="flex flex-wrap gap-1">{registrations.map(registration => <Badge key={registration.id} variant="secondary">{t(registration.operational_role)}</Badge>)}</div></div></CardHeader>
      <CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <Info label={t('brand')} value={brandName(brands, shift.brand_id)} /><Info label={t('platform')} value={platformName(platforms, shift.platform_id)} />
        <Info label={t('campaign')} value={campaignName(campaigns, shift.campaign_id)} /><Info label={t('status')} value={registrations.map(registration => registrationLabel(registration, t)).join(', ')} />
      </div><div className="flex justify-end"><Button data-testid={`open-my-shift-detail-card-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewShiftDetail')}</Button></div></CardContent>
    </Card>)}
  </div>
}

function MyShiftCompactList({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const { t } = useTranslation()
  return <div className="space-y-3">{entries.map(({ shift, registrations }) => <Card key={shift.id} data-testid={`my-shift-compact-${shift.id}`}><CardContent className="grid gap-3 pt-5 md:grid-cols-[minmax(220px,1.5fr)_minmax(100px,.7fr)_minmax(120px,.8fr)_auto] md:items-center">
    <div className="min-w-0"><p className="truncate font-semibold">{shift.title || `${brandName(brands, shift.brand_id)} live`}</p><p className="text-sm text-muted-foreground">{shift.date} · {formatShiftTimeRange(shift)} · {platformName(platforms, shift.platform_id)}</p><p className="truncate text-xs text-muted-foreground">{campaignName(campaigns, shift.campaign_id)}</p></div>
    <Info label={t('role')} value={registrations.map(registration => t(registration.operational_role)).join(', ')} /><Info label={t('status')} value={registrations.map(registration => registrationLabel(registration, t)).join(', ')} />
    <div className="flex items-center gap-2 md:justify-end"><Button data-testid={`open-my-shift-detail-compact-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></div>
  </CardContent></Card>)}</div>
}

function MyShiftTable({ entries, brands, platforms, campaigns, onManage }: MyShiftViewProps) {
  const { t } = useTranslation()
  return <Card><CardContent className="overflow-x-auto pt-5"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left">
    <th className="p-2">{t('date')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('campaign')}</th><th className="p-2">{t('role')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('actions')}</th>
  </tr></thead><tbody>{entries.map(({ shift, registrations }) => <tr className="border-b" key={shift.id} data-testid={`my-shift-row-${shift.id}`}>
    <td className="whitespace-nowrap p-2">{shift.date} · {formatShiftTimeRange(shift)}</td><td className="p-2 font-medium">{shift.title || '—'}</td><td className="p-2">{brandName(brands, shift.brand_id)}</td><td className="p-2">{platformName(platforms, shift.platform_id)}</td><td className="p-2">{campaignName(campaigns, shift.campaign_id)}</td><td className="p-2">{registrations.map(registration => t(registration.operational_role)).join(', ')}</td><td className="p-2">{registrations.map(registration => <Badge className="mr-1" key={registration.id} variant="outline">{registrationLabel(registration, t)}</Badge>)}</td><td className="p-2"><Button data-testid={`open-my-shift-detail-table-${shift.id}`} size="sm" variant="outline" onClick={() => onManage(shift)}>{t('viewDetails')}</Button></td>
  </tr>)}</tbody></table></CardContent></Card>
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
  users,
  currentUser,
  onRegister,
  onManage,
  busyId,
  onCancelRegistration,
  onRemoveAssignment,
  onAssignManually,
  manualSelections,
  setManualSelections,
}: {
  allShifts: Shift[]
  shifts: Shift[]
  capacities: CapacityMap
  registrations: ShiftRegistration[]
  roleFilter: RoleSelection
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users?: User[]
  currentUser: User
  onRegister: (shiftId: string, role: OperationalRole) => Promise<void>
  onManage: (shift: Shift) => void
  busyId?: string | null
  onCancelRegistration?: (registration: ShiftRegistration) => void
  onRemoveAssignment?: (registration: ShiftRegistration) => void
  onAssignManually?: (shiftId: string, role: OperationalRole, userId: string, version?: number) => Promise<void>
  manualSelections?: Record<string, string>
  setManualSelections?: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const { t } = useTranslation()
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2.5">
      {shifts.map(shift => {
        const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
        const mine = shiftRegistrations.filter(r =>
          r.user_id === currentUser.id &&
          !['cancelled', 'rejected', 'removed'].includes(r.status)
        )
        const myRegistration = mine[0]
        const visibleCapacities = getVisibleRoleCapacities(capacities[shift.id] || [], roleFilter)
        const fullyStaffed = visibleCapacities.every(c => c.approved >= c.required)
        const totalMissing = visibleCapacities.reduce((acc, c) => acc + (c.remaining > 0 ? c.remaining : 0), 0)
        const pending = shiftRegistrations.filter(item => item.status === 'pending' && matchesRoleFilter(item, roleFilter)).length
        const isExpanded = expandedIds.has(shift.id)
        const canManageAssignments = hasPermission(currentUser, 'shifts.approve_registration')

        return (
          <Card key={shift.id} className="overflow-hidden max-w-full border border-slate-200 bg-white shadow-xs transition-colors hover:border-slate-300" data-testid={`open-shift-card-${shift.id}`}>
            <CardContent className="p-3.5 space-y-2.5 max-w-full">
              {/* Header: Title, Brand, Platform, Studio, Date, Time & Status */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-foreground break-words">
                      {shift.title || `${brandName(brands, shift.brand_id)} live`}
                    </span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {brandName(brands, shift.brand_id)}
                    </span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {platformName(platforms, shift.platform_id)}
                    </span>
                    {shift.studio && (
                      <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                        {shift.studio}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} · {formatShiftTimeRange(shift)}
                    {campaignName(campaigns, shift.campaign_id) && ` · ${campaignName(campaigns, shift.campaign_id)}`}
                  </p>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {fullyStaffed ? (
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs">
                      {t('fullyStaffed')}
                    </Badge>
                  ) : shift.registration_locked ? (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {t('closed')}
                    </Badge>
                  ) : totalMissing > 0 ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium">
                      {t('needsStaffing')}: {totalMissing}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {t('openShifts')}
                    </Badge>
                  )}
                  {pending > 0 && (
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 text-xs">
                      {t('pending')}: {pending}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Occupancy Chips and Action Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                {/* Staffing Occupancy Chips */}
                <div className="flex flex-wrap items-center gap-1.5" aria-label={t('staffing')}>
                  {visibleCapacities.map(cap => {
                    const isFull = cap.approved >= cap.required
                    return (
                      <span
                        key={cap.role}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                          isFull
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                        title={`${t(cap.role)}: ${cap.approved}/${cap.required}${cap.pending ? ` (${cap.pending} ${t('pending')})` : ''}`}
                      >
                        <span>{cap.role === 'host' ? t('host') : cap.role === 'support' ? t('support') : t('technical')}</span>
                        <span className="font-semibold">{cap.approved}/{cap.required}</span>
                      </span>
                    )
                  })}
                </div>

                {/* Primary Actions: Quick Register & View Details */}
                <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 justify-start sm:justify-end">
                  {myRegistration && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge className={isStaffedRegistration(myRegistration) ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                        {registrationLabel(myRegistration, t)}
                      </Badge>
                      {hasPermission(currentUser, 'shifts.cancel_registration') && !shift.registration_locked && onCancelRegistration && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={busyId === myRegistration.id}
                          onClick={() => onCancelRegistration(myRegistration)}
                        >
                          {t('cancelRegistration')}
                        </Button>
                      )}
                    </div>
                  )}

                  <ShiftRegistrationActions
                    allShifts={allShifts}
                    compact
                    currentUser={currentUser}
                    onRegister={role => onRegister(shift.id, role)}
                    registrations={registrations}
                    shift={shift}
                  />

                  <Button
                    data-testid={`open-shift-detail-compact-${shift.id}`}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-medium"
                    onClick={() => onManage(shift)}
                  >
                    {t('viewDetails')}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => toggleExpand(shift.id)}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    title={isExpanded ? 'Collapse details' : 'Expand details'}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Expandable Section: Roster details & Leader manual assignment */}
              {isExpanded && (
                <div className="pt-2 border-t border-slate-100 space-y-3 bg-slate-50/60 p-3 rounded-md text-xs">
                  {visibleCapacities.map(capacity => {
                    const assignmentKey = `${shift.id}-${capacity.role}`
                    const approvedAssignments = shiftRegistrations.filter(r =>
                      r.operational_role === capacity.role && isStaffedRegistration(r)
                    )
                    const eligibleUsers = (users || []).filter(u =>
                      u.operational_roles?.includes(capacity.role) &&
                      !shiftRegistrations.some(r =>
                        r.user_id === u.id &&
                        r.operational_role === capacity.role &&
                        (r.status === 'pending' || isStaffedRegistration(r))
                      )
                    )

                    return (
                      <div key={capacity.role} className="space-y-1.5 border-b pb-2 last:border-b-0 last:pb-0">
                        <div className="flex items-center justify-between font-medium">
                          <span className="capitalize">{t(capacity.role)} ({capacity.approved}/{capacity.required})</span>
                          <span className="text-muted-foreground">
                            {approvedAssignments.length > 0
                              ? approvedAssignments.map(a => users?.find(u => u.id === a.user_id)?.full_name || a.user_id).join(', ')
                              : t('notAssigned')}
                          </span>
                        </div>

                        {canManageAssignments && approvedAssignments.map(reg => (
                          <div key={reg.id} className="flex items-center justify-between text-[11px] text-muted-foreground pl-2">
                            <span>{users?.find(u => u.id === reg.user_id)?.full_name || reg.user_id}</span>
                            {onRemoveAssignment && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px] text-red-600 hover:text-red-700"
                                disabled={busyId === `remove-${reg.id}` || shift.registration_locked}
                                onClick={() => onRemoveAssignment(reg)}
                              >
                                {t('removeAssignment')}
                              </Button>
                            )}
                          </div>
                        ))}

                        {canManageAssignments && !shift.registration_locked && capacity.approved < capacity.required && manualSelections && setManualSelections && onAssignManually && (
                          <div className="flex items-center gap-2 pt-1">
                            <Select
                              value={manualSelections[assignmentKey] || ''}
                              onValueChange={value => setManualSelections(current => ({ ...current, [assignmentKey]: value }))}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder={t('chooseStaff')} /></SelectTrigger>
                              <SelectContent>
                                {eligibleUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!manualSelections[assignmentKey] || busyId === `assign-${assignmentKey}`}
                              onClick={() => onAssignManually(shift.id, capacity.role, manualSelections[assignmentKey], shift.version)}
                            >
                              {t('assignStaff')}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
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
  const { t } = useTranslation()
  return <Card><CardContent className="overflow-x-auto pt-5"><table className="w-full min-w-[900px] text-sm">
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
