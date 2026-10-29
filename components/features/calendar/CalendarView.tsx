'use client'

import * as React from 'react'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { shiftRegistrationService, shiftService, reportService } from '@/lib/services/dataService'
import { getCalendarReferences } from '@/lib/services/calendarReferenceData'
import { readCalendarWindow } from '@/lib/services/calendarWindow'
import { invalidatePageCache, pageCacheKey, readPageCache, writePageCache } from '@/lib/services/operationsPageCache'
import type { ShiftListPage } from '@/lib/services/operationsPageService'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { Shift, Brand, Platform, Campaign, User, OperationalRole, ShiftRegistration, Report } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Clock,
  Calendar as CalendarIcon,
  Search,
  Filter,
  UserCheck,
  X,
  Download,
  Trash2,
} from 'lucide-react'
import { format, addMonths, addDays, addWeeks, startOfWeek } from 'date-fns'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { ListView } from './ListView'
import { ShiftFormModal } from '../shifts/ShiftFormModal'
import { ShiftFormDialog } from '../shifts/ShiftFormDialog'
import { ShiftDetailModal } from '../shifts/ShiftDetailModal'
import { ShiftPreviewDrawer } from '../shifts/ShiftPreviewDrawer'
import { DaySessionsDialog } from './DaySessionsDialog'
import { BulkStaffingApprovalDialog } from './BulkStaffingApprovalDialog'
import { BulkDeleteShiftsDialog } from './BulkDeleteShiftsDialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import { enUS, vi } from 'date-fns/locale'
import { pendingRegistrationsInScope, shiftsInCalendarScope } from '@/lib/utils/calendarStaffingApproval'
import { CalendarExportDialog } from '../shifts/CalendarExportDialog'
import { PageLoadError } from '@/components/ui/page-load-error'
import {
  buildStudioFilterOptions,
  effectiveListTimeFilter,
  filterCalendarShifts,
  calendarTimeScope,
  getVisibleShiftSelection,
  toggleAllVisibleShiftSelection,
  UNASSIGNED_STUDIO_FILTER,
  type CalendarFilterState,
} from '@/lib/utils/calendarFilters'
import { calendarAuthorityScope, calendarDataScope } from '@/lib/utils/calendarRange'

const DEFAULT_CALENDAR_FILTERS: CalendarFilterState = {
  brandIds: [],
  platformIds: [],
  campaignIds: [],
  studios: [],
  statuses: [],
  hostIds: [],
  supportIds: [],
  technicalIds: [],
  operationalRoles: [],
  staffingStates: [],
  registrationStates: [],
  hasImportedStaffing: false,
  time: 'all',
  customFrom: '',
  customTo: '',
}
const EMPTY_SHIFTS: Shift[] = []


function ActiveFilterChips({ filters, setFilters, onClearAll, t, brands, platforms, campaigns, users }: { filters: CalendarFilterState, setFilters: (f: CalendarFilterState) => void, onClearAll: () => void, t: (key: string) => string, brands: Brand[], platforms: Platform[], campaigns: Campaign[], users: User[] }) {
  const activeChips: { id: string, label: string, onRemove: () => void }[] = []

  if (filters.brandIds.length > 0) {
    const names = filters.brandIds.map(id => brands.find(b => b.id === id)?.name || id).join(', ')
    activeChips.push({ id: 'brands', label: `${t('brand')}: ${names}`, onRemove: () => setFilters({ ...filters, brandIds: [] }) })
  }
  if (filters.platformIds.length > 0) {
    const names = filters.platformIds.map(id => platforms.find(p => p.id === id)?.name || id).join(', ')
    activeChips.push({ id: 'platforms', label: `${t('platform')}: ${names}`, onRemove: () => setFilters({ ...filters, platformIds: [] }) })
  }
  if (filters.campaignIds.length > 0) {
    const names = filters.campaignIds.map(id => campaigns.find(c => c.id === id)?.name || id).join(', ')
    activeChips.push({ id: 'campaigns', label: `${t('campaign')}: ${names}`, onRemove: () => setFilters({ ...filters, campaignIds: [] }) })
  }
  if (filters.studios.length > 0) {
    activeChips.push({ id: 'studios', label: `${t('studio')}: ${filters.studios.join(', ')}`, onRemove: () => setFilters({ ...filters, studios: [] }) })
  }
  if (filters.statuses.length > 0) {
    activeChips.push({ id: 'statuses', label: `${t('status')}: ${filters.statuses.join(', ')}`, onRemove: () => setFilters({ ...filters, statuses: [] }) })
  }
  if (filters.hostIds.length > 0) {
    const names = filters.hostIds.map(id => users.find(u => u.id === id)?.full_name || id).join(', ')
    activeChips.push({ id: 'hosts', label: `${t('host')}: ${names}`, onRemove: () => setFilters({ ...filters, hostIds: [] }) })
  }
  if (filters.supportIds.length > 0) {
    const names = filters.supportIds.map(id => users.find(u => u.id === id)?.full_name || id).join(', ')
    activeChips.push({ id: 'support', label: `${t('support')}: ${names}`, onRemove: () => setFilters({ ...filters, supportIds: [] }) })
  }
  if (filters.technicalIds.length > 0) {
    const names = filters.technicalIds.map(id => users.find(u => u.id === id)?.full_name || id).join(', ')
    activeChips.push({ id: 'technical', label: `${t('technical')}: ${names}`, onRemove: () => setFilters({ ...filters, technicalIds: [] }) })
  }
  if (filters.time !== 'all') {
    let timeLabel = t(filters.time) || filters.time
    if (filters.time === 'custom') timeLabel = `${filters.customFrom} - ${filters.customTo}`
    activeChips.push({ id: 'time', label: `${t('time')}: ${timeLabel}`, onRemove: () => setFilters({ ...filters, time: 'all', customFrom: '', customTo: '' }) })
  }

  if (filters.operationalRoles.length > 0) {
    const roleLabels: Record<string, string> = { host: t('host'), support: t('support'), technical: t('technical') }
    const names = filters.operationalRoles.map(r => roleLabels[r] || r).join(', ')
    activeChips.push({ id: 'operationalRoles', label: `${t('role')}: ${names}`, onRemove: () => setFilters({ ...filters, operationalRoles: [] }) })
  }
  if (filters.staffingStates.length > 0) {
    const stateLabels: Record<string, string> = { fully_staffed: t('fullyStaffed'), missing_staff: t('staffingGap') }
    const names = filters.staffingStates.map(s => stateLabels[s] || s).join(', ')
    activeChips.push({ id: 'staffingStates', label: `${t('staffing')}: ${names}`, onRemove: () => setFilters({ ...filters, staffingStates: [] }) })
  }
  if (filters.registrationStates.length > 0) {
    const regLabels: Record<string, string> = { approved: t('approved'), pending: t('pending'), rejected: t('rejected'), manually_assigned: t('manuallyAssigned') }
    const names = filters.registrationStates.map(s => regLabels[s] || s).join(', ')
    activeChips.push({ id: 'registrationStates', label: `${t('registrationStatus')}: ${names}`, onRemove: () => setFilters({ ...filters, registrationStates: [] }) })
  }
  if (filters.hasImportedStaffing) {
    activeChips.push({ id: 'importedStaffing', label: t('importedStaffingLabels'), onRemove: () => setFilters({ ...filters, hasImportedStaffing: false }) })
  }
  if (activeChips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {activeChips.map(chip => (
        <span key={chip.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {chip.label}
          <button type="button" onClick={chip.onRemove} className="rounded-full p-0.5 hover:bg-primary/20 focus:bg-primary/20 focus:outline-none" aria-label={`Remove filter ${chip.label}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline focus:outline-none">
        {t('clearAll') || 'Clear All'}
      </button>
    </div>
  )
}

export function CalendarView({ createRequest = 0 }: { createRequest?: number }) {
  const { currentUser } = useCurrentUser()
  const { language, t } = useTranslation()
  const { toast } = useToast()
  const dateLocale = language === 'vi' ? vi : enUS
  const timeFilterLabels = language === 'vi'
    ? { all: 'Tất cả thời gian', week: 'Tuần đang xem', month: 'Tháng đang xem', studios: 'Tất cả Studio', unassigned: 'Chưa gán Studio' }
    : { all: 'All time', week: 'Current week', month: 'Current month', studios: 'All studios', unassigned: 'Unassigned' }
  const listPagination = useListPagination('calendar_list', 10)
  const { params, navigate: listNavigate } = listPagination
  const mobileFullCalendar = params.get('calendar_mobile_mode') === 'full'
  const rawView = params.get('calendar_view')
  const view = rawView === 'month' || rawView === 'week' || rawView === 'day' || rawView === 'list' ? rawView
    : hasPermission(currentUser, 'shifts.approve_registration') ? 'week' : 'month'
  const [today] = React.useState(() => format(new Date(), 'yyyy-MM-dd'))
  const rawDate = params.get('calendar_date') ?? today
  const currentDate = React.useMemo(() => {
    const parsed = new Date(rawDate + 'T12:00:00')
    return Number.isFinite(parsed.getTime()) && format(parsed, 'yyyy-MM-dd') === rawDate ? parsed : new Date(today + 'T12:00:00')
  }, [rawDate, today])
  const setCurrentDate = (date: Date) => listNavigate({ calendar_date: format(date, 'yyyy-MM-dd'), calendar_list_page: null })
  const setView = React.useCallback((value: 'month' | 'week' | 'day' | 'list') => listNavigate({ calendar_view: value, calendar_list_page: null }), [listNavigate])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [reportsReady, setReportsReady] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [windowComplete, setWindowComplete] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [showForm, setShowForm] = React.useState(false)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [previewShift, setPreviewShift] = React.useState<Shift | null>(null)
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [editingShift, setEditingShift] = React.useState<Shift | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [draftFilters, setDraftFilters] = React.useState<CalendarFilterState>(DEFAULT_CALENDAR_FILTERS)
  const [draftTime, setDraftTime] = React.useState<CalendarFilterState['time']>('all')
  const [showBulkStaffingApproval, setShowBulkStaffingApproval] = React.useState(false)
  const [bulkApprovalLoading, setBulkApprovalLoading] = React.useState(false)
  const [showBulkDelete, setShowBulkDelete] = React.useState(false)
  const searchTerm = params.get('calendar_search') ?? ''
  const [searchInput, setSearchInput] = React.useState(searchTerm)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearchInput(searchTerm), 0)
    return () => window.clearTimeout(timer)
  }, [searchTerm])
  React.useEffect(() => {
    if (searchInput === searchTerm) return
    const timer = window.setTimeout(() => listNavigate({ calendar_search: searchInput || null, calendar_list_page: null }, true), 250)
    return () => window.clearTimeout(timer)
  }, [listNavigate, searchInput, searchTerm])
  const [selectedShiftIds, setSelectedShiftIds] = React.useState<Set<string>>(new Set())
  const encodedFilters = params.get('calendar_filters') ?? ''
  const filters = React.useMemo((): CalendarFilterState => {
    try {
      const parsed = JSON.parse(encodedFilters)
      return { ...DEFAULT_CALENDAR_FILTERS, ...parsed,
        ...Object.fromEntries(Object.keys(DEFAULT_CALENDAR_FILTERS).filter(key => Array.isArray(DEFAULT_CALENDAR_FILTERS[key as keyof CalendarFilterState])).map(key => [key, Array.isArray(parsed[key]) ? parsed[key].filter((value: unknown) => typeof value === 'string') : []])),
        time: ['all', 'today', 'current_week', 'current_month', 'custom'].includes(parsed.time) ? parsed.time : 'all',
        customFrom: typeof parsed.customFrom === 'string' ? parsed.customFrom : '',
        customTo: typeof parsed.customTo === 'string' ? parsed.customTo : '',
        hasImportedStaffing: parsed.hasImportedStaffing === true,
      }
    } catch { return DEFAULT_CALENDAR_FILTERS }
  }, [encodedFilters])
  const setFilters = (value: CalendarFilterState) => listNavigate({ calendar_filters: JSON.stringify(value), calendar_list_page: null })
  const rawTime = params.get('calendar_time')
  const listTimeOverride = rawTime === 'all' || rawTime === 'today' || rawTime === 'current_week' || rawTime === 'current_month' || rawTime === 'custom' ? rawTime : null
  const listTimeFilter = effectiveListTimeFilter(filters.time, listTimeOverride)
  const dataScope = React.useMemo(
    () => calendarDataScope(view, currentDate, view === 'list' ? listTimeFilter : filters.time, filters.customFrom, filters.customTo, false),
    [currentDate, filters.customFrom, filters.customTo, filters.time, listTimeFilter, view],
  )
  const authorityScope = React.useMemo(() => calendarAuthorityScope(dataScope), [dataScope])
  const canSelectListShifts = view === 'list' && !!currentUser && (
    hasPermission(currentUser, 'shifts.export') || hasPermission(currentUser, 'shifts.delete')
  )

  const { page: listPage, pageSize: listSize } = listPagination
  const [listTotal, setListTotal] = React.useState(0)
  const listQuery = JSON.stringify({
    search: searchTerm, brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds,
    studios: filters.studios, statuses: filters.statuses, hostIds: filters.hostIds, supportIds: filters.supportIds,
    technicalIds: filters.technicalIds, operationalRoles: filters.operationalRoles, staffingStates: filters.staffingStates,
    registrationStates: filters.registrationStates, hasImportedStaffing: filters.hasImportedStaffing,
    from: dataScope.startDate, to: dataScope.endDate,
  })
  const operationalQuery = view === 'list' ? listQuery : JSON.stringify({ from: authorityScope.startDate, to: authorityScope.endDate })
  const previousListQuery = React.useRef(listQuery)
  const calendarRoot = React.useRef<HTMLDivElement>(null)
  const scrollContext = view + ':' + rawDate + ':' + listPage + ':' + listSize + ':' + listQuery
  const previousScrollContext = React.useRef(scrollContext)
  React.useEffect(() => {
    if (previousScrollContext.current === scrollContext) return
    previousScrollContext.current = scrollContext
    const frame = window.requestAnimationFrame(() => {
      const root = calendarRoot.current
      const viewportTop = root?.closest('main')?.getBoundingClientRect().top ?? 0
      if (root && root.getBoundingClientRect().top < viewportTop) root.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [scrollContext])
  React.useEffect(() => {
    if (previousListQuery.current === listQuery) return
    previousListQuery.current = listQuery
    if (view === 'list') listNavigate({ calendar_list_page: null }, true)
  }, [listNavigate, listQuery, view])

  const identity=currentUser?currentUser.id+':'+(currentUser.system_permission??currentUser.role)+':'+currentUser.updated_at:''
  const [loadedIdentity,setLoadedIdentity]=React.useState('')
  const requestKey = identity + ':' + view + ':' + listPage + ':' + listSize + ':' + operationalQuery
  const [loadedKey, setLoadedKey] = React.useState('')
  const requestVersion = React.useRef(0)
  const requestController = React.useRef<AbortController | null>(null)

  const loadReferenceData = React.useCallback(() => {
    if (!currentUser) return Promise.resolve()
    return getCalendarReferences(currentUser).then(data => {
      setBrands(data.brands); setPlatforms(data.platforms); setCampaigns(data.campaigns); setUsers(data.users)
    })
  }, [currentUser])

  const loadData = React.useCallback(async (reuseCache = false) => {
    if (!identity) return
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    const version = ++requestVersion.current
    const filters = JSON.parse(operationalQuery)
    const cacheKey = pageCacheKey(identity, 'calendar_window', { view, page: listPage, pageSize: listSize, filters })
    if (!reuseCache) invalidatePageCache()
    else {
      const cached = readPageCache<ShiftListPage>(cacheKey)
      if (cached) {
        setLoadError(null)
        setLoading(false)
        setLoadingMore(false)
        setWindowComplete(true)
        setListTotal(cached.total)
        setShifts(cached.items)
        setRegistrations(cached.registrations)
        setLoadedIdentity(identity)
        setLoadedKey(requestKey)
        return
      }
    }
    setLoading(true)
    setLoadingMore(false)
    setWindowComplete(false)
    setLoadError(null)
    try {
      const result = view === 'list'
        ? await shiftService.getCalendarPage({ page: listPage, pageSize: listSize, filters }, controller.signal)
        : await readCalendarWindow(filters, controller.signal, first => {
            // First 50 shifts are available before the remaining pages in this window.
            // Incomplete windows are never persisted or used for bulk approval.
            if (version !== requestVersion.current || controller.signal.aborted) return
            setShifts(first.items)
            setRegistrations(first.registrations)
            setListTotal(first.total)
            setLoadedIdentity(identity)
            setLoadedKey(requestKey)
            setLoading(false)
            setLoadingMore(true)
            setWindowComplete(false)
          })
      if (version !== requestVersion.current || controller.signal.aborted) return
      if (view === 'list' && result.page !== listPage) listNavigate({ calendar_list_page: String(result.page) }, true)
      writePageCache(cacheKey, result)
      setWindowComplete(true)
      setListTotal(result.total)
      setShifts(result.items)
      setRegistrations(result.registrations)
      setLoadedIdentity(identity)
      setLoadedKey(requestKey)
    } catch (error: unknown) {
      if (version === requestVersion.current && !controller.signal.aborted) {
        setShifts([])
        setRegistrations([])
        setLoadedKey('')
        setWindowComplete(false)
        setLoadError(error)
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [identity, listNavigate, listPage, operationalQuery, listSize, requestKey, view])
  useShiftChangeRefresh(() => loadData(false))

  React.useEffect(() => {
    const generation = requestVersion
    const frame = window.requestAnimationFrame(() => { void loadData(true) })
    return () => { window.cancelAnimationFrame(frame); requestController.current?.abort(); ++generation.current }
  }, [loadData])

  React.useEffect(() => {
    let active = true
    const frame = window.requestAnimationFrame(() => {
      void loadReferenceData().catch(error => { if (active) setLoadError(error) })
    })
    return () => { active = false; window.cancelAnimationFrame(frame) }
  }, [loadReferenceData])

  React.useEffect(() => {
    if (createRequest > 0) {
      const timer = setTimeout(() => setShowForm(true), 0)
      return () => {
        clearTimeout(timer)
      }
    }
    return undefined
  }, [createRequest])

  const registerForShift = React.useCallback(async (shiftId: string, role: OperationalRole) => {
    if (!currentUser) return
    try {
      await shiftRegistrationService.register(shiftId, currentUser.id, role)
      await loadData()
      const refreshedShift = await shiftService.getById(shiftId)
      if (refreshedShift) setSelectedShift(refreshedShift)
      toast({ title: t('success'), description: t('registrationPending'), variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }, [currentUser, loadData, t, toast])

  const displayFilters = React.useMemo(() => {
    if (view !== 'list' && filters.time === 'all' && dataScope.startDate && dataScope.endDate) {
      return { ...filters, time: 'custom' as const, customFrom: view === 'week' || view === 'day' ? authorityScope.startDate! : dataScope.startDate, customTo: dataScope.endDate }
    }
    return { ...filters, time: view === 'list' ? listTimeFilter : filters.time }
  }, [authorityScope.startDate, dataScope.endDate, dataScope.startDate, filters, listTimeFilter, view])
  const filteredShifts = React.useMemo(
    () => filterCalendarShifts(shifts, displayFilters, searchTerm, {
      currentDate,
      brands,
      platforms,
      campaigns,
      registrations,
    }),
    [shifts, displayFilters, searchTerm, currentDate, brands, platforms, campaigns, registrations],
  )
  const dayReportIds = selectedDay ? filteredShifts.filter(shift => shift.date === format(selectedDay, 'yyyy-MM-dd')).map(shift => shift.id).join(',') : ''
  React.useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setReportsReady(false)
      setReports([])
      if (!dayReportIds) return
      void reportService.getForShifts(dayReportIds.split(',')).then(data => {
        if (active) { setReports(data); setReportsReady(true) }
      }).catch(error => { if (active) toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' }) })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [dayReportIds, t, toast])
  const listShifts = view === 'list' && loadedKey === requestKey ? shifts : EMPTY_SHIFTS
  const [selectionScope, setSelectionScope] = React.useState(listShifts)
  if (selectionScope !== listShifts) {
    setSelectionScope(listShifts)
    setSelectedShiftIds(current => {
      const next = new Set(getVisibleShiftSelection(listShifts, current).selectedVisibleShiftIds)
      return next.size === current.size ? current : next
    })
  }
  const visibleSelection = React.useMemo(
    () => getVisibleShiftSelection(listShifts, selectedShiftIds),
    [listShifts, selectedShiftIds],
  )
  const selectedVisibleShiftIdSet = React.useMemo(
    () => new Set(visibleSelection.selectedVisibleShiftIds),
    [visibleSelection.selectedVisibleShiftIds],
  )

  const studioOptions = React.useMemo(() => buildStudioFilterOptions(shifts), [shifts])
  const calendarScopeShifts = React.useMemo(
    () => loadedKey === requestKey ? shiftsInCalendarScope(view === 'list' ? listShifts : filteredShifts, view, currentDate) : EMPTY_SHIFTS,
    [currentDate, filteredShifts, listShifts, loadedKey, requestKey, view],
  )
  const pendingStaffingRegistrations = React.useMemo(
    () => pendingRegistrationsInScope(registrations, calendarScopeShifts),
    [calendarScopeShifts, registrations],
  )
  const pendingStaffingCount = calendarScopeShifts.reduce((count, shift) => count + (shift.staffing_summary?.reduce((total, role) => total + role.pending, 0) ?? pendingStaffingRegistrations.filter(row => row.shift_id === shift.id).length), 0)
  const openBulkStaffingApproval = async () => {
    if (bulkApprovalLoading || loadingMore || !windowComplete || loadedKey !== requestKey) return
    const version = requestVersion.current
    setBulkApprovalLoading(true)
    try {
      const records = await shiftRegistrationService.getForShifts(calendarScopeShifts.map(shift => shift.id))
      if (version !== requestVersion.current) return
      setRegistrations(records)
      setShowBulkStaffingApproval(true)
    } catch (error) { toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' }) }
    finally { setBulkApprovalLoading(false) }
  }

  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'month' || view === 'list') {
      setCurrentDate(direction === 'prev' ? addMonths(currentDate, -1) : addMonths(currentDate, 1))
    } else if (view === 'week') {
      setCurrentDate(direction === 'prev' ? addWeeks(currentDate, -1) : addWeeks(currentDate, 1))
    } else if (view === 'day') {
      setCurrentDate(direction === 'prev' ? addDays(currentDate, -1) : addDays(currentDate, 1))
    }
  }

  const clearFilters = () => {
    setSearchInput('')
    listNavigate({ calendar_filters: null, calendar_search: null, calendar_time: null, calendar_list_page: null })
  }

  const openFilters = () => {
    setDraftFilters(filters)
    setDraftTime(view === 'list' ? listTimeFilter : filters.time)
    setShowFilters(true)
  }
  const applyFilters = () => {
    if (!calendarTimeScope(draftTime, currentDate, draftFilters.customFrom, draftFilters.customTo).valid) return
    listNavigate({
      calendar_filters: JSON.stringify({ ...draftFilters, time: view === 'list' ? filters.time : draftTime }),
      ...(view === 'list' ? { calendar_time: draftTime } : {}),
      calendar_list_page: null,
    })
    setShowFilters(false)
  }

  const changeView = (nextView: 'month' | 'week' | 'day' | 'list') => {
    setView(nextView)
  }

  const activeFilterCount = [
    filters.brandIds,
    filters.platformIds,
    filters.campaignIds,
    filters.studios,
    filters.statuses,
    filters.hostIds,
    filters.supportIds,
    filters.technicalIds,
    filters.operationalRoles,
    filters.staffingStates,
    filters.registrationStates,
  ].reduce((count, values) => count + values.length, 0) + ((view === 'list' ? listTimeFilter : filters.time) !== 'all' ? 1 : 0) + (searchTerm ? 1 : 0) + (filters.hasImportedStaffing ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  const toggleSelectShift = (shiftId: string) => {
    setSelectedShiftIds(prev => {
      const next = new Set(prev)
      if (next.has(shiftId)) {
        next.delete(shiftId)
      } else {
        next.add(shiftId)
      }
      return next
    })
  }

  const toggleAllVisibleShifts = () => {
    setSelectedShiftIds(current => toggleAllVisibleShiftSelection(listShifts, current))
  }

  const getViewTitle = () => {
    switch (view) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: dateLocale })
      case 'week':
        return t('weekOf', { date: format(startOfWeek(currentDate), 'PP', { locale: dateLocale }) })
      case 'day':
        return format(currentDate, 'PPPP', { locale: dateLocale })
      case 'list':
        if (listTimeFilter === 'all') return t('allShifts')
        if (listTimeFilter === 'custom') return `${t('customRange')}: ${filters.customFrom} - ${filters.customTo}`
        if (listTimeFilter === 'current_week') return t('weekOf', { date: format(currentDate, 'PP', { locale: dateLocale }) })
        if (listTimeFilter === 'today') return t('today')
        return format(currentDate, 'MMMM yyyy', { locale: dateLocale })
      default:
        return format(currentDate, 'MMMM yyyy', { locale: dateLocale })
    }
  }

  const filterFields = (() => {
    const filters = draftFilters
    const setFilters = setDraftFilters
    const listTimeFilter = draftTime
    const changeTimeFilter = (time: CalendarFilterState['time']) => {
      setDraftTime(time)
      setDraftFilters(current => ({ ...current, time }))
    }
    const timeScope = calendarTimeScope(draftTime, currentDate, filters.customFrom, filters.customTo)
    return <>
            <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-4">
<MultiSelectFilter label={t('brand')} value={filters.brandIds} onChange={brandIds => setFilters({ ...filters, brandIds })} options={brands.map(brand => ({ value: brand.id, label: brand.name }))} placeholder={`${t('all')} ${t('brands')}`} testId="calendar-brand-filter" />
<MultiSelectFilter label={t('platform')} value={filters.platformIds} onChange={platformIds => setFilters({ ...filters, platformIds })} options={platforms.map(platform => ({ value: platform.id, label: platform.name }))} placeholder={`${t('all')} ${t('platforms')}`} testId="calendar-platform-filter" />
<MultiSelectFilter label={t('studio')} value={filters.studios} onChange={studios => setFilters({ ...filters, studios })} options={studioOptions.map(option => ({ value: option.value, label: option.value === UNASSIGNED_STUDIO_FILTER ? timeFilterLabels.unassigned : option.label }))} placeholder={timeFilterLabels.studios} testId="calendar-studio-filter" />
<MultiSelectFilter label={t('status')} value={filters.statuses} onChange={statuses => setFilters({ ...filters, statuses: statuses as CalendarFilterState['statuses'] })} options={['scheduled','preparing','live','paused','completed','cancelled'].map(status => ({ value: status, label: status === 'live' ? t('liveStatus') : (t as (key: string) => string)(status) }))} placeholder={t('all')} testId="calendar-status-filter" />
            </div>

              <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
                 <MultiSelectFilter label={t('campaign')} value={filters.campaignIds} onChange={campaignIds => setFilters({ ...filters, campaignIds })} options={campaigns.map(campaign => ({ value: campaign.id, label: campaign.name }))} placeholder={`${t('all')} ${t('campaigns')}`} testId="calendar-campaign-filter" />
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('time')}</label>
                  <Select value={view === 'list' ? listTimeFilter : filters.time} onValueChange={(value) => changeTimeFilter(value as CalendarFilterState['time'])}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{timeFilterLabels.all}</SelectItem>
                      <SelectItem value="today">{t('today')}</SelectItem>
                    <SelectItem value="current_week">{timeFilterLabels.week}</SelectItem>
                    <SelectItem value="current_month">{timeFilterLabels.month}</SelectItem>
                    <SelectItem value="custom">{t('customRange')}</SelectItem>
                  </SelectContent>
                </Select>
                {!timeScope.valid && <p className="mt-1 text-xs text-red-600" role="alert">{timeScope.error}</p>}
              </div>
              {(view === 'list' ? listTimeFilter : filters.time) === 'custom' && <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('startDate')}</label>
                  <Input type="date" value={filters.customFrom} onChange={(event) => setFilters({ ...filters, customFrom: event.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('endDate')}</label>
                  <Input type="date" value={filters.customTo} onChange={(event) => setFilters({ ...filters, customTo: event.target.value })} />
                </div>
              </>}
              <MultiSelectFilter label={t('host')} value={filters.hostIds} onChange={hostIds => setFilters({ ...filters, hostIds })} options={users.filter(u => u.operational_roles?.includes('host')).map(u => ({ value: u.id, label: u.full_name }))} placeholder={`${t('all')} ${t('host')}`} testId="calendar-host-filter" />
              <MultiSelectFilter label={t('support')} value={filters.supportIds} onChange={supportIds => setFilters({ ...filters, supportIds })} options={users.filter(u => u.operational_roles?.includes('support')).map(u => ({ value: u.id, label: u.full_name }))} placeholder={`${t('all')} ${t('support')}`} testId="calendar-support-filter" />
              <MultiSelectFilter label={t('technical')} value={filters.technicalIds} onChange={technicalIds => setFilters({ ...filters, technicalIds })} options={users.filter(u => u.operational_roles?.includes('technical')).map(u => ({ value: u.id, label: u.full_name }))} placeholder={`${t('all')} ${t('technical')}`} testId="calendar-technical-filter" />
              <MultiSelectFilter label={t('role')} value={filters.operationalRoles} onChange={operationalRoles => setFilters({ ...filters, operationalRoles })} options={[{ value: 'host', label: t('host') }, { value: 'support', label: t('support') }, { value: 'technical', label: t('technical') }]} placeholder={t('all')} testId="calendar-role-filter" />
              <MultiSelectFilter label={t('staffing')} value={filters.staffingStates} onChange={staffingStates => setFilters({ ...filters, staffingStates })} options={[{ value: 'fully_staffed', label: t('fullyStaffed') }, { value: 'missing_staff', label: t('staffingGap') }]} placeholder={t('all')} testId="calendar-staffing-state-filter" />
              <MultiSelectFilter label={t('registrationStatus')} value={filters.registrationStates} onChange={registrationStates => setFilters({ ...filters, registrationStates })} options={[{ value: 'approved', label: t('approved') }, { value: 'pending', label: t('pending') }, { value: 'rejected', label: t('rejected') }, { value: 'manually_assigned', label: t('manuallyAssigned') }]} placeholder={t('all')} testId="calendar-registration-state-filter" />
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="imported-staffing" checked={filters.hasImportedStaffing} onCheckedChange={(checked: boolean | 'indeterminate') => setFilters({ ...filters, hasImportedStaffing: !!checked })} />
                <label htmlFor="imported-staffing" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {t('importedStaffingLabels')}
                </label>
              </div>
            </div>
  </>
  })()

  if (loadedIdentity && loadedIdentity !== identity) return <ContentSkeleton />

  return (
    <div ref={calendarRoot} className="min-w-0 space-y-0">
      {/* Unified Command Toolbar */}
      <div className="sticky top-0 z-30 flex flex-col bg-background pb-2">
          <ActiveFilterChips filters={{ ...filters, time: view === 'list' ? listTimeFilter : filters.time }} setFilters={value => {
            if (view === 'list') listNavigate({ calendar_filters: JSON.stringify({ ...value, time: filters.time }), calendar_time: value.time, calendar_list_page: null })
            else setFilters(value)
          }} onClearAll={clearFilters} t={t} brands={brands} platforms={platforms} campaigns={campaigns} users={users} />
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between px-0 pb-2 border-b border-border">
          {/* Left: Date Navigation */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-2">
            <>
                <Button variant="outline" size="icon" aria-label={t('previousNavigation')} onClick={() => navigate('prev')} className="h-9 w-9">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => setCurrentDate(new Date())} className="h-9">
                  {t('today')}
                </Button>
                <Button variant="outline" size="icon" aria-label={t('nextNavigation')} onClick={() => navigate('next')} className="h-9 w-9">
                  <ChevronRight className="h-4 w-4" />
                </Button>
            </>
            <h2 className="flex min-w-0 basis-full items-center text-sm font-semibold sm:basis-auto sm:text-base sm:ml-2">
              <CalendarIcon className="h-5 w-5 shrink-0 mr-2 text-muted-foreground" />
              <span className="min-w-0">{getViewTitle()}</span>
            </h2>
          </div>

          {/* Right: View Toggles & Primary Actions */}
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="grid w-full min-w-0 grid-cols-4 rounded-md border bg-muted/20 p-1 sm:flex sm:w-fit">
              <Button variant={view === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('month')} className="min-w-0 px-1 text-xs sm:h-7 sm:px-2.5">
                <LayoutGrid className="hidden h-3.5 w-3.5 mr-1.5 sm:block" />
                {t('month')}
              </Button>
              <Button variant={view === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('week')} className="min-w-0 px-1 text-xs sm:h-7 sm:px-2.5">
                {t('week')}
              </Button>
              <Button variant={view === 'day' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('day')} className="min-w-0 px-1 text-xs sm:h-7 sm:px-2.5">
                <Clock className="hidden h-3.5 w-3.5 mr-1.5 sm:block" />
                {t('day')}
              </Button>
              <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('list')} className="min-w-0 px-1 text-xs sm:h-7 sm:px-2.5">
                <List className="hidden h-3.5 w-3.5 mr-1.5 sm:block" />
                {t('list')}
              </Button>
            </div>
            {(view === 'month' || view === 'week') && (
              <div className="grid w-full grid-cols-2 rounded-md border bg-muted/20 p-1 sm:hidden" role="group" aria-label={language === 'vi' ? 'Kiểu hiển thị lịch trên điện thoại' : 'Mobile calendar layout'} data-testid="calendar-mobile-layout-toggle">
                <Button type="button" size="sm" variant={!mobileFullCalendar ? 'secondary' : 'ghost'} aria-pressed={!mobileFullCalendar} data-testid="calendar-mobile-compact" onClick={() => listNavigate({ calendar_mobile_mode: null })} className="min-w-0 text-xs">
                  {language === 'vi' ? 'Lịch gọn' : 'Compact'}
                </Button>
                <Button type="button" size="sm" variant={mobileFullCalendar ? 'secondary' : 'ghost'} aria-pressed={mobileFullCalendar} data-testid="calendar-mobile-full" onClick={() => listNavigate({ calendar_mobile_mode: 'full' })} className="min-w-0 text-xs">
                  {language === 'vi' ? 'Lịch đầy đủ' : 'Full calendar'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Search + Secondary Actions */}
        <div className="pt-2">
          <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 basis-full flex-1 sm:min-w-56 sm:basis-auto">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label={t('searchShifts')}
                  data-testid="calendar-search"
                  placeholder={t('searchShifts')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button
                variant={showFilters ? 'secondary' : 'outline'}
                size="sm"
                data-testid="calendar-filter-toggle"
                aria-expanded={showFilters}
                onClick={openFilters}
                className="shrink-0 h-9"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('filters')}
                {hasActiveFilters && <span className="ml-2 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">{activeFilterCount}</span>}
              </Button>
              {hasPermission(currentUser, 'shifts.export') && (
<Button variant="outline" size="sm" className="h-9" data-testid="export-schedule-dropdown-btn" onClick={() => setExportOpen(true)}><Download className="mr-2 h-4 w-4" />{t('exportExcel')}</Button>
              )}

              {canSelectListShifts && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  role="checkbox"
                  aria-checked={visibleSelection.allVisibleSelected ? true : visibleSelection.partiallySelected ? 'mixed' : false}
                  onClick={toggleAllVisibleShifts}
                  disabled={visibleSelection.visibleShiftIds.length === 0}
                  data-testid="toggle-all-visible-shifts"
                >
                  {visibleSelection.allVisibleSelected ? t('deselectAll') : t('selectAll')}
                </Button>
              )}
              {view === 'list' && currentUser && hasPermission(currentUser, 'shifts.delete') && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9"
                  onClick={() => setShowBulkDelete(true)}
                  disabled={visibleSelection.selectedVisibleShiftIds.length === 0}
                  data-testid="open-bulk-delete-shifts"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('deleteSelectedCount', { count: visibleSelection.selectedVisibleShiftIds.length })}
                </Button>
              )}
              {currentUser && hasPermission(currentUser, 'shifts.approve_registration') && (
                <Button type="button" variant="outline" size="sm" className="h-9"
                  data-testid="calendar-open-staffing-gaps"
                  onClick={() => window.location.assign('/staffing?gap=missing')}>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Ca cần bổ sung nhân sự
                </Button>
              )}
              {currentUser && hasPermission(currentUser, 'shifts.approve_registration') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => void openBulkStaffingApproval()}
                  disabled={bulkApprovalLoading || loadingMore || !windowComplete || loadedKey !== requestKey}
                  data-testid="open-bulk-staffing-approval"
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  {t('bulkStaffingApproval')} ({pendingStaffingCount})
                </Button>
              )}
            </div>

            <Dialog open={showFilters} onOpenChange={setShowFilters}>
              <DialogContent data-testid="calendar-filter-drawer" size="lg" className="top-0 right-0 bottom-0 left-auto flex h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:h-auto sm:max-h-[92dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg">
                <DialogHeader><DialogTitle>{t('filters')} ({activeFilterCount})</DialogTitle></DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto pb-2">{filterFields}</div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-popover pt-3">
                  <Button variant="outline" onClick={() => { setDraftFilters(DEFAULT_CALENDAR_FILTERS); setDraftTime('all') }}>{t('resetFilters')}</Button>
                  <Button variant="outline" onClick={() => setShowFilters(false)}>{t('close')}</Button>
                  <Button onClick={applyFilters} disabled={!calendarTimeScope(draftTime, currentDate, draftFilters.customFrom, draftFilters.customTo).valid} data-testid="calendar-filter-apply">{language === 'vi' ? 'Áp dụng' : 'Apply'}</Button>
                </div>
              </DialogContent>
            </Dialog>
        </div>
      </div>

      {!!loadError && <PageLoadError error={loadError} onRetry={() => { void loadData(); void loadReferenceData().catch(setLoadError) }} />}
      {/* Calendar Views */}
      <Card className="min-w-0 overflow-hidden gap-0 py-0" aria-busy={loading || loadingMore || loadedKey !== requestKey}>
        {loadedKey !== requestKey && <ContentSkeleton />}
        {loading && loadedKey === requestKey && <div role="status" className="px-3 py-1 text-xs text-muted-foreground">{t('loading')}</div>}
         {loadingMore && loadedKey === requestKey && <div role="status" data-testid="calendar-progressive-loading" className="px-3 py-1 text-xs text-muted-foreground">{language === 'vi' ? `Đang tải ca trong kỳ: ${shifts.length}/${listTotal}. Dữ liệu chưa đầy đủ.` : `Loading shifts in range: ${shifts.length}/${listTotal}. Data is incomplete.`}</div>}
        {loadedKey === requestKey && <>
        {view === 'month' && <>
          <div className={mobileFullCalendar ? "max-w-full overflow-x-auto lg:block" : "hidden max-w-full overflow-x-auto lg:block"} role="region" aria-label={t('month')} tabIndex={0} data-testid="calendar-full-month-view"><div className="min-w-[760px]"><MonthView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} registrations={registrations} onShiftClick={setPreviewShift} onDayClick={setSelectedDay} /></div></div>
          <section className={mobileFullCalendar ? "hidden" : "min-w-0 lg:hidden"} data-testid="calendar-compact-month-view">
            <MonthView compact complete={windowComplete} currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} registrations={registrations} onDayClick={setSelectedDay} />
          </section>
        </>}
        {view === 'week' && <div className="w-full"><WeekView fullOnMobile={mobileFullCalendar} currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} users={users} registrations={registrations} onShiftClick={setPreviewShift} hasActiveFilters={hasActiveFilters} currentUser={currentUser} onClearFilters={clearFilters} onCreateShift={() => setShowForm(true)} /></div>}
        {view === 'day' && <DayView currentDate={currentDate} shifts={filteredShifts} allShifts={shifts} onRegister={registerForShift} registrations={registrations} currentUser={currentUser} brands={brands} platforms={platforms} users={users} onShiftClick={setPreviewShift} hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} onCreateShift={() => setShowForm(true)} />}
        {view === 'list' && (
          <ListView
            shifts={listShifts}
            brands={brands}
            platforms={platforms}
            users={users}
            allShifts={shifts}
            registrations={registrations}
            currentUser={currentUser}
            onRegister={registerForShift}
            onShiftClick={setPreviewShift}
            selectedShiftIds={canSelectListShifts ? selectedVisibleShiftIdSet : undefined}
            onToggleSelectShift={canSelectListShifts ? toggleSelectShift : undefined}
          />
        )}
        {view === 'list' && <HistoryPagination page={listPage} pageSize={listSize} total={listTotal} onPageChange={listPagination.setPage} onPageSizeChange={listPagination.setPageSize} />}
        </>}
      </Card>

      <CalendarExportDialog open={exportOpen} onOpenChange={setExportOpen} selectedIds={[...selectedVisibleShiftIdSet]} filters={JSON.parse(listQuery)} />
      {/* Modals */}
      {showForm && (
        <ShiftFormModal
          open={showForm}
          onOpenChange={setShowForm}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          registrations={registrations}
          onSuccess={() => {
            loadData()
            setShowForm(false)
          }}
        />
      )}

      {editingShift && (
        <ShiftFormDialog
          open={!!editingShift}
          onOpenChange={(open) => !open && setEditingShift(null)}
          shift={editingShift}
          duplicateFrom={null}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          registrations={registrations}
          templates={[]}
          onSuccess={async (updatedShift) => {
            await loadData()
            setEditingShift(null)
            if (updatedShift) setSelectedShift({ ...updatedShift })
          }}
        />
      )}

      <DaySessionsDialog
        key={selectedDay ? format(selectedDay, 'yyyy-MM-dd') : 'closed'}
        open={!!selectedDay}
        date={selectedDay}
        shifts={filteredShifts}
        allShifts={shifts}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        registrations={registrations}
        reports={reports}
        reportsReady={reportsReady}
        currentUser={currentUser}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        onViewShift={(shift) => {
          setSelectedDay(null)
          setPreviewShift(shift)
        }}
        onEditShift={(shift) => {
          setSelectedDay(null)
          setEditingShift(shift)
        }}
        onChanged={loadData}
      />

      {currentUser && hasPermission(currentUser, 'shifts.delete') && (
        <BulkDeleteShiftsDialog
          open={showBulkDelete}
          onOpenChange={setShowBulkDelete}
          selectedShifts={listShifts.filter(shift => selectedVisibleShiftIdSet.has(shift.id))}
          brands={brands}
          platforms={platforms}
          onSuccess={(deletedIds) => {
            setSelectedShiftIds(previous => {
              const next = new Set(previous)
              deletedIds.forEach(id => next.delete(id))
              return next
            })
            void loadData()
          }}
        />
      )}

      {currentUser && hasPermission(currentUser, 'shifts.approve_registration') && (
        <BulkStaffingApprovalDialog
          open={showBulkStaffingApproval}
          registrations={pendingStaffingRegistrations}
          shifts={calendarScopeShifts}
          users={users}
          currentUser={currentUser}
          onOpenChange={setShowBulkStaffingApproval}
          onChanged={loadData}
          onOpenShift={(shift) => {
            setShowBulkStaffingApproval(false)
            setPreviewShift(shift)
          }}
        />
      )}

      {previewShift && (
        <ShiftPreviewDrawer
          open={!!previewShift}
          onOpenChange={(open) => !open && setPreviewShift(null)}
          shift={previewShift}
          brands={brands}
          platforms={platforms}
          registrations={registrations}
          users={users}
          onViewFullShift={(shift) => {
            setPreviewShift(null)
            setSelectedShift(shift)
          }}
          onPrimaryAction={undefined}
        />
      )}

      {selectedShift && (
        <ShiftDetailModal
          open={!!selectedShift}
          onOpenChange={(open) => !open && setSelectedShift(null)}
          shift={selectedShift}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          allShifts={shifts}
          exportFilters={JSON.parse(listQuery)}
          allRegistrations={registrations}
          onUpdate={(updatedShift?: Shift) => {
            void (async () => {
              if (updatedShift) {
                setSelectedShift(updatedShift)
                await loadData()
              } else {
                await loadData()
                const refreshedShift = await shiftService.getById(selectedShift.id)
                if (refreshedShift) setSelectedShift({ ...refreshedShift })
              }
            })()
          }}
          onEdit={() => {
            setEditingShift(selectedShift)
            setSelectedShift(null)
          }}
          onDelete={() => {
            loadData()
            setSelectedShift(null)
          }}
        />
      )}
    </div>
  )
}
