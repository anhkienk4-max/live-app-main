'use client'

import * as React from 'react'
import { shiftRegistrationService, shiftService, brandService, platformService, campaignService, userService, reportService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User, OperationalRole, ShiftRegistration, Report } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Clock,
  Calendar as CalendarIcon,
  Search,
  Filter,
  Plus,
  UserCheck,
  X,
  Download,
  FileSpreadsheet,
  FileText,
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
import { DaySessionsDialog } from './DaySessionsDialog'
import { BulkStaffingApprovalDialog } from './BulkStaffingApprovalDialog'
import { BulkDeleteShiftsDialog } from './BulkDeleteShiftsDialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { useToast } from '@/components/ui/toast'
import { enUS, vi } from 'date-fns/locale'
import { pendingRegistrationsInScope, shiftsInCalendarScope } from '@/lib/utils/calendarStaffingApproval'
import {
  buildScheduleExportRows,
  buildScheduleExportFilename,
  downloadScheduleExportXlsx,
  downloadScheduleExportCsv,
  brandsToNameMap,
  platformsToNameMap,
  campaignsToNameMap,
  usersToNameMap,
} from '@/lib/utils/scheduleExportUtils'
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
    activeChips.push({ id: 'time', label: `Time: ${timeLabel}`, onRemove: () => setFilters({ ...filters, time: 'all', customFrom: '', customTo: '' }) })
  }

  if (filters.operationalRoles.length > 0) {
    const roleLabels: Record<string, string> = { host: t('host'), support: t('support'), technical: t('technical') }
    const names = filters.operationalRoles.map(r => roleLabels[r] || r).join(', ')
    activeChips.push({ id: 'operationalRoles', label: `Role: ${names}`, onRemove: () => setFilters({ ...filters, operationalRoles: [] }) })
  }
  if (filters.staffingStates.length > 0) {
    const stateLabels: Record<string, string> = { fully_staffed: 'Fully Staffed', missing_staff: 'Missing Staff' }
    const names = filters.staffingStates.map(s => stateLabels[s] || s).join(', ')
    activeChips.push({ id: 'staffingStates', label: `Staffing: ${names}`, onRemove: () => setFilters({ ...filters, staffingStates: [] }) })
  }
  if (filters.registrationStates.length > 0) {
    const regLabels: Record<string, string> = { approved: 'Approved', pending: 'Pending', rejected: 'Rejected', manually_assigned: 'Manually Assigned' }
    const names = filters.registrationStates.map(s => regLabels[s] || s).join(', ')
    activeChips.push({ id: 'registrationStates', label: `Registration: ${names}`, onRemove: () => setFilters({ ...filters, registrationStates: [] }) })
  }
  if (filters.hasImportedStaffing) {
    activeChips.push({ id: 'importedStaffing', label: 'Imported Staffing', onRemove: () => setFilters({ ...filters, hasImportedStaffing: false }) })
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
  const [currentDate, setCurrentDate] = React.useState(new Date())
  const [view, setView] = React.useState<'month' | 'week' | 'day' | 'list'>('month')
  const viewSwitchedByUser = React.useRef(false)
  const initializedViewForRole = React.useRef(false)

  React.useEffect(() => {
    if (currentUser && !initializedViewForRole.current) {
      initializedViewForRole.current = true
      if (!viewSwitchedByUser.current) {
        setView((currentUser.role === 'admin' || currentUser.role === 'leader') ? 'week' : 'month')
      }
    }
  }, [currentUser])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [showForm, setShowForm] = React.useState(false)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null)
  const [editingShift, setEditingShift] = React.useState<Shift | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [showBulkStaffingApproval, setShowBulkStaffingApproval] = React.useState(false)
  const [showBulkDelete, setShowBulkDelete] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedShiftIds, setSelectedShiftIds] = React.useState<Set<string>>(new Set())
  const [filters, setFilters] = React.useState<CalendarFilterState>(DEFAULT_CALENDAR_FILTERS)
  const [listTimeOverride, setListTimeOverride] = React.useState<CalendarFilterState['time'] | null>(null)
  const [nonListTimeOverride, setNonListTimeOverride] = React.useState<CalendarFilterState['time'] | null>(null)
  const listTimeFilter = effectiveListTimeFilter(filters.time, listTimeOverride)
  const dataScope = React.useMemo(
    () => calendarDataScope(view, currentDate, view === 'list' ? listTimeFilter : filters.time, filters.customFrom, filters.customTo, nonListTimeOverride === 'all'),
    [currentDate, filters.customFrom, filters.customTo, filters.time, listTimeFilter, nonListTimeOverride, view],
  )
  const authorityScope = React.useMemo(() => calendarAuthorityScope(dataScope), [dataScope])
  const canSelectListShifts = view === 'list' && !!currentUser && (
    hasPermission(currentUser, 'shifts.export') || hasPermission(currentUser, 'shifts.delete')
  )

  const referenceLoad = React.useRef<Promise<void> | null>(null)
  const requestVersion = React.useRef(0)
  const hasLoadedData = React.useRef(false)

  const loadReferenceData = React.useCallback(() => {
    if (referenceLoad.current) return referenceLoad.current
    const request = Promise.all([
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      userService.getAll(),
    ]).then(([brandsData, platformsData, campaignsData, usersData]) => {
      setBrands(brandsData)
      setPlatforms(platformsData)
      setCampaigns(campaignsData)
      setUsers(usersData)
    }).catch(error => {
      referenceLoad.current = null
      throw error
    })
    referenceLoad.current = request
    return request
  }, [])

  const loadData = React.useCallback(async () => {
    const version = ++requestVersion.current
    const initialLoad = !hasLoadedData.current
    if (initialLoad) setLoading(true)
    setLoadError(null)
    try {
      const [shiftsData] = await Promise.all([
        dataScope.allTime
          ? shiftService.getAllComplete()
          : !authorityScope.startDate || !authorityScope.endDate
            ? shiftService.getAll()
          : shiftService.getInRange(authorityScope.startDate, authorityScope.endDate),
        loadReferenceData(),
      ])
      const shiftIds = shiftsData.map(shift => shift.id)
      const [registrationsData, reportsData] = await Promise.all([
        shiftRegistrationService.getForShifts(shiftIds),
        reportService.getForShifts(shiftIds),
      ])
      if (version !== requestVersion.current) return
      setShifts(shiftsData)
      setRegistrations(registrationsData)
      setReports(reportsData)
      hasLoadedData.current = true
    } catch (error: unknown) {
      if (version === requestVersion.current && !hasLoadedData.current) setLoadError(error)
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [authorityScope.endDate, authorityScope.startDate, dataScope.allTime, loadReferenceData])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadData() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadData])

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
      return { ...filters, time: 'custom' as const, customFrom: dataScope.startDate, customTo: dataScope.endDate }
    }
    return { ...filters, time: view === 'list' ? listTimeFilter : filters.time }
  }, [dataScope.endDate, dataScope.startDate, filters, listTimeFilter, view])
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
  const shiftsByMonth = React.useMemo(() => {
    const byMonth = new Map<string, Shift[]>()
    shifts.forEach(shift => {
      const monthShifts = byMonth.get(shift.date.slice(0, 7)) ?? []
      monthShifts.push(shift)
      byMonth.set(shift.date.slice(0, 7), monthShifts)
    })
    return byMonth
  }, [shifts])
  const listSourceShifts = React.useMemo(
    () => view === 'list' && listTimeFilter === 'current_month'
      ? shiftsByMonth.get(format(currentDate, 'yyyy-MM')) ?? EMPTY_SHIFTS
      : shifts,
    [currentDate, listTimeFilter, shifts, shiftsByMonth, view],
  )
  const listFilters = React.useMemo(
    () => ({ ...filters, time: listTimeFilter }),
    [filters, listTimeFilter],
  )
  const listShifts = React.useMemo(
    () => view === 'list' ? filterCalendarShifts(listSourceShifts, listFilters, searchTerm, {
      currentDate,
      brands,
      platforms,
      campaigns,
      registrations,
    }) : EMPTY_SHIFTS,
    [listSourceShifts, listFilters, searchTerm, currentDate, brands, platforms, campaigns, registrations, view],
  )
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
  const timeScope = React.useMemo(
    () => calendarTimeScope(view === 'list' ? listTimeFilter : filters.time, currentDate, filters.customFrom, filters.customTo),
    [filters.time, filters.customFrom, filters.customTo, currentDate, listTimeFilter, view],
  )

  const calendarScopeShifts = React.useMemo(
    () => shiftsInCalendarScope(view === 'list' ? listShifts : filteredShifts, view, currentDate),
    [currentDate, filteredShifts, listShifts, view],
  )
  const pendingStaffingRegistrations = React.useMemo(
    () => pendingRegistrationsInScope(registrations, calendarScopeShifts),
    [calendarScopeShifts, registrations],
  )

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
    setFilters(DEFAULT_CALENDAR_FILTERS)
    setSearchTerm('')
    if (view === 'list') setListTimeOverride(null)
    else setNonListTimeOverride(null)
  }

  const changeTimeFilter = (time: CalendarFilterState['time']) => {
    if (view === 'list') {
      setListTimeOverride(time)
    } else {
      setFilters({ ...filters, time })
      setNonListTimeOverride(time === 'all' ? 'all' : null)
    }
  }

  const changeView = (nextView: 'month' | 'week' | 'day' | 'list') => {
    viewSwitchedByUser.current = true
    if (nextView === 'list' && view !== 'list') setListTimeOverride(null)
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

  const handleExport = (formatType: 'xlsx' | 'csv', scope: 'filtered' | 'selected') => {
    const exportShifts = view === 'list' ? listShifts : filteredShifts
    const targetShifts = scope === 'selected'
      ? exportShifts.filter(s => selectedVisibleShiftIdSet.has(s.id))
      : exportShifts

    if (targetShifts.length === 0) {
      toast({
        title: t('exportExcel'),
        description: 'No shifts available to export.',
        variant: 'destructive',
      })
      return
    }

    const brandsMap = brandsToNameMap(brands)
    const platformsMap = platformsToNameMap(platforms)
    const campaignsMap = campaignsToNameMap(campaigns)
    const usersMap = usersToNameMap(users)

    const rows = buildScheduleExportRows(
      targetShifts,
      brandsMap,
      platformsMap,
      campaignsMap,
      usersMap,
      registrations,
    )
    const filename = buildScheduleExportFilename(scope, targetShifts, formatType, currentDate)

    if (formatType === 'xlsx') {
      downloadScheduleExportXlsx(rows, filename)
    } else {
      downloadScheduleExportCsv(rows, filename)
    }

    toast({
      title: 'Export successful',
      description: `Exported ${targetShifts.length} shift(s) to ${filename}`,
      variant: 'success',
    })
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

  if (loading) return <div className="text-center py-12">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoadError(null); setLoading(true); void loadData() }} />

  return (
    <div className="min-w-0 space-y-0">
      {/* Unified Command Toolbar */}
      <div className="flex flex-col">
          <ActiveFilterChips filters={filters} setFilters={setFilters} onClearAll={clearFilters} t={t} brands={brands} platforms={platforms} campaigns={campaigns} users={users} />
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between px-0 pb-2 border-b border-border">
          {/* Left: Date Navigation */}
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
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
            <h2 className="flex min-w-0 shrink-0 items-center text-base font-bold sm:text-lg lg:text-xl ml-1 sm:ml-2 whitespace-nowrap">
              <CalendarIcon className="h-5 w-5 mr-2 text-muted-foreground" />
              {getViewTitle()}
            </h2>
          </div>

          {/* Right: View Toggles & Primary Actions */}
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="flex w-fit overflow-hidden rounded-md border bg-muted/20 p-1">
              <Button variant={view === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('month')} className="h-7 text-xs">
                <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
                {t('month')}
              </Button>
              <Button variant={view === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('week')} className="h-7 text-xs">
                {t('week')}
              </Button>
              <Button variant={view === 'day' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('day')} className="h-7 text-xs">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                {t('day')}
              </Button>
              <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => changeView('list')} className="h-7 text-xs">
                <List className="h-3.5 w-3.5 mr-1.5" />
                {t('list')}
              </Button>
            </div>

          </div>
        </div>

        {/* Search + Secondary Actions */}
        <div className="pt-2">
          <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 shrink-0 sm:min-w-56">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('searchShifts')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button
                variant={showFilters ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="shrink-0 h-9"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('filters')}
                {hasActiveFilters && <span className="ml-2 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">{activeFilterCount}</span>}
              </Button>
              {hasPermission(currentUser, 'shifts.export') && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" size="sm" className="h-9" data-testid="export-schedule-dropdown-btn">
                        <Download className="h-4 w-4 mr-2" />
                        {t('exportExcel')}
                        {visibleSelection.selectedVisibleShiftIds.length > 0 && (
                          <span className="ml-2 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs">
                            {visibleSelection.selectedVisibleShiftIds.length}
                          </span>
                        )}
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExport('xlsx', 'filtered')} data-testid="export-filtered-xlsx">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Filtered XLSX
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('csv', 'filtered')} data-testid="export-filtered-csv">
                      <FileText className="h-4 w-4 mr-2" />
                      Filtered CSV
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleExport('xlsx', 'selected')}
                      disabled={visibleSelection.selectedVisibleShiftIds.length === 0}
                      data-testid="export-selected-xlsx"
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Selected XLSX
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleExport('csv', 'selected')}
                      disabled={visibleSelection.selectedVisibleShiftIds.length === 0}
                      data-testid="export-selected-csv"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Selected CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {hasPermission(currentUser, 'shifts.assign_staff') && (
                <Button size="sm" className="h-9" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('newShift')}
                </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => setShowBulkStaffingApproval(true)}
                  data-testid="open-bulk-staffing-approval"
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  {t('bulkStaffingApproval')} ({pendingStaffingRegistrations.length})
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
                 <MultiSelectFilter label={t('brand')} value={filters.brandIds} onChange={brandIds => setFilters({ ...filters, brandIds })} options={brands.map(brand => ({ value: brand.id, label: brand.name }))} placeholder={`${t('all')} ${t('brands')}`} testId="calendar-brand-filter" />
                 <MultiSelectFilter label={t('platform')} value={filters.platformIds} onChange={platformIds => setFilters({ ...filters, platformIds })} options={platforms.map(platform => ({ value: platform.id, label: platform.name }))} placeholder={`${t('all')} ${t('platforms')}`} testId="calendar-platform-filter" />
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
              <MultiSelectFilter label={t('studio')} value={filters.studios} onChange={studios => setFilters({ ...filters, studios })} options={studioOptions.map(option => ({ value: option.value, label: option.value === UNASSIGNED_STUDIO_FILTER ? timeFilterLabels.unassigned : option.label }))} placeholder={timeFilterLabels.studios} testId="calendar-studio-filter" />
              <MultiSelectFilter label={t('status')} value={filters.statuses} onChange={statuses => setFilters({ ...filters, statuses: statuses as CalendarFilterState['statuses'] })} options={['scheduled','preparing','live','paused','completed','cancelled'].map(status => ({ value: status, label: status === 'live' ? t('liveStatus') : (t as (key: string) => string)(status) }))} placeholder={t('all')} testId="calendar-status-filter" />
              <MultiSelectFilter label={t('host')} value={filters.hostIds} onChange={hostIds => setFilters({ ...filters, hostIds })} options={users.filter(u => u.operational_roles?.includes('host')).map(u => ({ value: u.id, label: u.full_name }))} placeholder={`${t('all')} ${t('host')}`} testId="calendar-host-filter" />
              <MultiSelectFilter label={t('support')} value={filters.supportIds} onChange={supportIds => setFilters({ ...filters, supportIds })} options={users.filter(u => u.operational_roles?.includes('support')).map(u => ({ value: u.id, label: u.full_name }))} placeholder={`${t('all')} ${t('support')}`} testId="calendar-support-filter" />
              <MultiSelectFilter label={t('technical')} value={filters.technicalIds} onChange={technicalIds => setFilters({ ...filters, technicalIds })} options={users.filter(u => u.operational_roles?.includes('technical')).map(u => ({ value: u.id, label: u.full_name }))} placeholder={`${t('all')} ${t('technical')}`} testId="calendar-technical-filter" />
              <MultiSelectFilter label={t('role')} value={filters.operationalRoles} onChange={operationalRoles => setFilters({ ...filters, operationalRoles })} options={[{ value: 'host', label: t('host') }, { value: 'support', label: t('support') }, { value: 'technical', label: t('technical') }]} placeholder={t('all')} testId="calendar-role-filter" />
              <MultiSelectFilter label="Staffing State" value={filters.staffingStates} onChange={staffingStates => setFilters({ ...filters, staffingStates })} options={[{ value: 'fully_staffed', label: 'Fully Staffed' }, { value: 'missing_staff', label: 'Missing Staff' }]} placeholder={t('all')} testId="calendar-staffing-state-filter" />
              <MultiSelectFilter label="Registration State" value={filters.registrationStates} onChange={registrationStates => setFilters({ ...filters, registrationStates })} options={[{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected' }, { value: 'manually_assigned', label: 'Manually Assigned' }]} placeholder={t('all')} testId="calendar-registration-state-filter" />
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="imported-staffing" checked={filters.hasImportedStaffing} onCheckedChange={(checked: boolean | 'indeterminate') => setFilters({ ...filters, hasImportedStaffing: !!checked })} />
                <label htmlFor="imported-staffing" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Has Imported Staffing
                </label>
              </div>
              {hasActiveFilters && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="h-3 w-3 mr-2" />
                    {t('resetFilters')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Calendar Views */}
      <Card className="min-w-0 overflow-hidden pt-4">
        {view === 'month' && <div className="max-w-full overflow-x-auto"><div className="min-w-[760px]"><MonthView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms} onShiftClick={setSelectedShift} onDayClick={setSelectedDay} /></div></div>}
        {view === 'week' && <div className="w-full"><WeekView currentDate={currentDate} shifts={filteredShifts} brands={brands} platforms={platforms}  registrations={registrations} onShiftClick={setSelectedShift} /></div>}
        {view === 'day' && <DayView currentDate={currentDate} shifts={filteredShifts} allShifts={shifts} registrations={registrations} currentUser={currentUser} brands={brands} platforms={platforms} users={users} onRegister={registerForShift} onShiftClick={setSelectedShift} />}
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
            onShiftClick={setSelectedShift}
            selectedShiftIds={canSelectListShifts ? selectedVisibleShiftIdSet : undefined}
            onToggleSelectShift={canSelectListShifts ? toggleSelectShift : undefined}
          />
        )}
      </Card>

      {/* Modals */}
      {showForm && (
        <ShiftFormModal
          open={showForm}
          onOpenChange={setShowForm}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
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
          templates={[]}
          onSuccess={async (updatedShift) => {
            await loadData()
            setEditingShift(null)
            if (updatedShift) setSelectedShift({ ...updatedShift })
          }}
        />
      )}

      <DaySessionsDialog
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
        currentUser={currentUser}
        onOpenChange={(open) => !open && setSelectedDay(null)}
        onViewShift={(shift) => {
          setSelectedDay(null)
          setSelectedShift(shift)
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
            setSelectedShift(shift)
          }}
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
