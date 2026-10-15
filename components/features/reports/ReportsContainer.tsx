'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Download, FileImage, FileSpreadsheet, Filter, Plus, RotateCcw, Search } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  brandService,
  campaignService,
  platformService,
  reportImageService,
  reportService,
  shiftRegistrationService,
  shiftService,
  userService,
  isStaffedRegistration,
} from '@/lib/services/dataService'
import { Brand, Campaign, DeletionImpact, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import {
  downloadReportTemplate,
  exportReportImageMetadataToExcel,
  exportReportsToExcel,
  exportReportDetailToExcel,
} from '@/lib/utils/excelUtils'
import { clearReportShiftQuery, loadReportTarget } from '@/lib/utils/reportTarget'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { ReportsView } from './ReportsView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { ReportDetailModal } from './ReportDetailModal'
import { ReportFormModal } from './ReportFormModal'
import { ReportShiftPicker } from './ReportShiftPicker'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

type Filters = {
  start: string
  end: string
  brandIds: string[]
  platformIds: string[]
  campaignIds: string[]
  hostIds: string[]
  supportIds: string[]
  technicalIds: string[]
  reportStatuses: string[]
  metricsStatuses: string[]
  search: string
}

const emptyFilters: Filters = {
  start: '',
  end: '',
  brandIds: [],
  platformIds: [],
  campaignIds: [],
  hostIds: [],
  supportIds: [],
  technicalIds: [],
  reportStatuses: [],
  metricsStatuses: [],
  search: '',
}

export function ReportsContainer() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const deepLinkShiftId = searchParams.get('shiftId')

  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [reports, setReports] = React.useState<Report[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [reportTotal, setReportTotal] = React.useState(0)
  const [reportPage, setReportPage] = React.useState(1)
  const [reportPageSize, setReportPageSize] = React.useState<10 | 20 | 50>(20)
  const [reportSummary, setReportSummary] = React.useState<{ revenue: number | null; aov: number | null; needsReview: number } | null>(null)
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters>(emptyFilters)
  const [showFilters, setShowFilters] = React.useState(false)
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(null)
  const [deepLinkedShift, setDeepLinkedShift] = React.useState<Shift | null>(null)
  const [targetRegistrations, setTargetRegistrations] = React.useState<ShiftRegistration[]>([])
  const [targetIdentity, setTargetIdentity] = React.useState('')
  const targetVersion = React.useRef(0)
  const [showForm, setShowForm] = React.useState(false)
  const [showShiftPicker, setShowShiftPicker] = React.useState(false)
  const [formInitialShiftId, setFormInitialShiftId] = React.useState<string | undefined>(undefined)
  const [formInitialReport, setFormInitialReport] = React.useState<Report | undefined>(undefined)
  const [removeTarget, setRemoveTarget] = React.useState<Report | null>(null)
  const [removeImpact, setRemoveImpact] = React.useState<DeletionImpact | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [loadErrorIdentity, setLoadErrorIdentity] = React.useState('')
  const handledDeepLink = React.useRef<string | null>(null)
  const identity = currentUser ? currentUser.id + ':' + resolveSystemPermission(currentUser) : ''
  const [loadedIdentity, setLoadedIdentity] = React.useState('')
  const requestVersion = React.useRef(0)
  const identityForExport = React.useRef(identity)
  React.useEffect(() => { identityForExport.current = identity }, [identity])

  const deferredSearch = React.useDeferredValue(filters.search)
  const encodedFilters = JSON.stringify({
    search: deferredSearch, from: filters.start || undefined, to: filters.end || undefined,
    brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds,
    hostIds: filters.hostIds, supportIds: filters.supportIds, technicalIds: filters.technicalIds,
    reportStatuses: filters.reportStatuses, metricsStatuses: filters.metricsStatuses,
  })
  const loadData = React.useCallback(async () => {
    const version = ++requestVersion.current
    if (!identity) return
    setLoading(true)
    setLoadError(null)
    try {
      const [page, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers] = await Promise.all([
        reportService.getFilteredPage({ page: reportPage, pageSize: reportPageSize, filters: JSON.parse(encodedFilters) }),
        brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(),
      ])
      const relevantShifts = await shiftService.getByIds(page.items.map(report => report.shift_id))
      const loadedRegistrations = await shiftRegistrationService.getForShifts(relevantShifts.map(shift => shift.id))
      if (version !== requestVersion.current) return
      setReports(page.items)
      setReportTotal(page.total)
      if (page.page !== reportPage) setReportPage(page.page)
      // Do not present the current page's sum as an all-filtered aggregate.
      const summary = (page as typeof page & { summary?: { revenue: number | null; aov: number | null; needsReview: number } }).summary
      setReportSummary(summary ?? null)
      setShifts(relevantShifts)
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
      setRegistrations(loadedRegistrations)
      setLoadedIdentity(identity)
    } catch (error) {
      if (version === requestVersion.current) {
        setLoadError(error)
        setLoadErrorIdentity(identity)
      }
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [encodedFilters, identity, reportPage, reportPageSize])

  React.useEffect(() => () => { targetVersion.current++ }, [identity, encodedFilters, reportPage, reportPageSize])
  const invalidateTarget = React.useCallback(() => { targetVersion.current++ }, [])

  const closeTarget = () => {
    targetVersion.current++
    setShowForm(false)
    setSelectedReport(null)
    setDeepLinkedShift(null)
    setTargetRegistrations([])
    setTargetIdentity('')
  }

  const openTarget = React.useCallback(async (shiftId: string, detail = false) => {
    if (!currentUser) return
    const version = ++targetVersion.current
    setShowForm(false)
    setSelectedReport(null)
    try {
      const staffing = await shiftRegistrationService.getForShift(shiftId)
      const staffed = new Set(staffing.filter(registration =>
        registration.user_id === currentUser.id && isStaffedRegistration(registration)
      ).map(registration => registration.shift_id))
      const target = await loadReportTarget(shiftId, {
        getShift: id => shiftService.getById(id),
        getReport: id => reportService.getByShift(id),
      }, currentUser, staffed)
      if (version !== targetVersion.current || identityForExport.current !== identity) return
      setDeepLinkedShift(target.shift)
      setTargetRegistrations(staffing)
      setTargetIdentity(identity)
      setShowShiftPicker(false)
      if (target.mode === 'detail' || detail && target.report) setSelectedReport(target.report!)
      else {
        setFormInitialShiftId(target.shift.id)
        setFormInitialReport(target.report)
        setShowForm(true)
      }
    } catch (error) {
      if (version === targetVersion.current && identityForExport.current === identity) throw error
    }
  }, [currentUser, identity])

  const showTargetError = (error: unknown) => toast({ title: t('reportTargetUnavailable'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })

  React.useEffect(() => {
    const timer = setTimeout(() => setReportPage(1), 0)
    return () => clearTimeout(timer)
  }, [encodedFilters])

  React.useEffect(() => {
    const versionRef = requestVersion
    const timer = setTimeout(() => { void loadData() }, 0)
    return () => { clearTimeout(timer); versionRef.current += 1 }
  }, [loadData])

  // Modal state from an earlier account/permission must not survive a role switch.
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSelectedReport(null)
      setDeepLinkedShift(null)
      setShowForm(false)
      setShowShiftPicker(false)
      setFormInitialReport(undefined)
      setFormInitialShiftId(undefined)
      setRemoveTarget(null)
      setRemoveImpact(null)
      handledDeepLink.current = null
    })
    return () => window.cancelAnimationFrame(frame)
  }, [identity])

  const requestRemove = async (report: Report) => {
    if (!currentUser) return
    const images = await reportImageService.getByReport(report.id)
    const shift = shifts.find(candidate => candidate.id === report.shift_id)
    const archive = Boolean(report.metrics_confirmed)
    setRemoveTarget(report)
    setRemoveImpact({
      entity_type: 'report',
      entity_id: report.id,
      entity_name: `${t('finalReport')} · ${shift?.title || shift?.date || report.shift_id}`,
      action: archive ? 'archive' : 'delete',
      consequence: archive
        ? t('archiveReportConsequence')
        : t('deleteReportConsequence'),
      reversible: archive,
      related_records: images.length ? [{ entity_type: 'report_image', entity_id: '*', entity_name: t('uploadedReportImages'), count: images.length }] : [],
    })
  }

  const removeReport = async (reason: string) => {
    if (!currentUser || !removeTarget) return
    try {
      if (removeTarget.metrics_confirmed) await reportService.archive(removeTarget.id, currentUser.id, reason)
      else await reportService.removeDraft(removeTarget.id, currentUser.id, reason)
      toast({ title: removeTarget.metrics_confirmed ? t('reportArchived') : t('draftReportDeleted'), variant: 'success' })
      setRemoveTarget(null)
      setRemoveImpact(null)
      await loadData()
    } catch (error) {
      toast({ title: t('reportActionFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  const shiftById = React.useMemo(() => new Map(shifts.map(shift => [shift.id, shift])), [shifts])
  const activeFilterCount = React.useMemo(() => {
    let count = 0
    if (filters.start) count++
    if (filters.end) count++
    count += filters.brandIds.length
    count += filters.platformIds.length
    count += filters.campaignIds.length
    count += filters.hostIds.length
    count += filters.supportIds.length
    count += filters.technicalIds.length
    count += filters.reportStatuses.length
    count += filters.metricsStatuses.length
    return count
  }, [filters])

  // Resolve direct links outside the current page; never reuse stale identity data.
  React.useEffect(() => {
    if (!deepLinkShiftId || identity !== loadedIdentity || loading || userLoading ||
        handledDeepLink.current === deepLinkShiftId || !currentUser) return
    let active = true
    const targetRef = targetVersion
    const version = requestVersion.current
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await openTarget(deepLinkShiftId)
          if (!active || version !== requestVersion.current) return
          handledDeepLink.current = deepLinkShiftId
        } catch (error) {
          if (!active || version !== requestVersion.current) return
          handledDeepLink.current = deepLinkShiftId
          toast({ title: t('reportTargetUnavailable'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
        }
        if (active && version === requestVersion.current && searchParams.has('shiftId')) {
          router.replace(clearReportShiftQuery(pathname, searchParams.toString()), { scroll: false })
        }
      })()
    }, 0)
    return () => { active = false; clearTimeout(timer); targetRef.current++ }
  }, [currentUser, deepLinkShiftId, identity, loadedIdentity, loading, openTarget, pathname, router, searchParams, t, toast, userLoading])

  // Server already applies all filters across all pages.

  const filteredReports = reports
  const totalRevenue = reportSummary?.revenue ?? null
  const aov = reportSummary?.aov ?? null

  const exportContext = {
    shifts,
    campaigns,
    users,
    brands: new Map(brands.map(brand => [brand.id, brand.name])),
    platforms: new Map(platforms.map(platform => [platform.id, platform.name])),
    registrations,
  }

  // Full dataset reads are deliberately restricted to an explicit export action.
  const loadFullExport = async () => {
    if (!currentUser || !hasPermission(currentUser, 'reports.export')) throw new Error(t('permissionDenied'))
    const originalIdentity = identity
    const allReports = await reportService.getAllFiltered(JSON.parse(encodedFilters))
    const ids = [...new Set(allReports.map(report => report.shift_id))]
    const allShifts: Shift[] = []
    const allRegistrations: ShiftRegistration[] = []
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      const [batchShifts, batchRegistrations] = await Promise.all([
        shiftService.getByIds(batch),
        shiftRegistrationService.getForShifts(batch),
      ])
      allShifts.push(...batchShifts)
      allRegistrations.push(...batchRegistrations)
    }
    if (originalIdentity !== identityForExport.current || allShifts.length !== ids.length) throw new Error('EXPORT_DATA_CHANGED')
    return { allReports, context: {
      shifts: allShifts, campaigns, users,
      brands: new Map(brands.map(brand => [brand.id, brand.name])),
      platforms: new Map(platforms.map(platform => [platform.id, platform.name])),
      registrations: allRegistrations,
    } }
  }
  const exportFiltered = async () => {
    try {
      const { allReports, context } = await loadFullExport()
      exportReportsToExcel(allReports, context)
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }
  const exportImages = async () => {
    try {
      const { allReports } = await loadFullExport()
      const images = []
      for (const report of allReports) images.push(...await reportImageService.getByReport(report.id))
      exportReportImageMetadataToExcel(images, allReports)
      toast({ title: t('success'), description: t('exportImageMetadata'), variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  if (loading || userLoading || !identity) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError && loadErrorIdentity === identity) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />
  if (identity !== loadedIdentity) return <div className="py-12 text-center">{t('loading')}</div>

  return (
    <div className="space-y-4">
      {/* Metrics Banner */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <SummaryMetric label={t('reportCount')} value={reportTotal.toLocaleString()} />
          <SummaryMetric label={t('confirmedRevenue')} value={totalRevenue === null ? '—' : formatCurrency(totalRevenue)} />
          <SummaryMetric label={t('averageOrderValue')} value={aov === null ? '—' : formatCurrency(aov)} />
          <SummaryMetric label={t('needsReview')} value={reportSummary ? reportSummary.needsReview.toLocaleString() : '—'} />
        </div>
        {currentUser && hasPermission(currentUser, 'reports.submit') && (
          <div className="flex items-center gap-2">
            <div className="text-right text-[11px] leading-tight">
              <p className="font-medium text-slate-700">{t('finalReportWorkflow')}</p>
              <p className="hidden text-amber-800 sm:block">
                {t('chooseLiveOrCompletedShift')}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setShowShiftPicker(true)
              }}
              data-testid="open-final-report-modal"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('createFinalReport')}
            </Button>
          </div>
        )}
      </div>

      {/* Search & Filter Bar (UX-P2-01: Collapsible filters with active count badge) */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 bg-background"
                value={filters.search}
                onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
                placeholder={t('reportSearchPlaceholder')}
              />
            </div>
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="reports-filter-panel"
              className="shrink-0"
            >
              <Filter className="mr-2 h-4 w-4" />
              {t('filters')}
              {activeFilterCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFilters(emptyFilters)}
              title={t('resetFilters')}
              className={activeFilterCount > 0 || filters.search ? 'text-destructive hover:bg-destructive/10' : ''}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            {currentUser && hasPermission(currentUser, 'reports.export') && (
              <>
                <div className="hidden md:block">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                      <Download className="mr-2 h-4 w-4" />{t('exportFilteredReports')}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { void exportFiltered() }} disabled={!filteredReports.length}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />{t('exportFilteredReports')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void exportImages()} disabled={!filteredReports.length}>
                        <FileImage className="mr-2 h-4 w-4" />{t('exportImageMetadata')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={downloadReportTemplate}>
                        <Download className="mr-2 h-4 w-4" />{t('downloadReportTemplate')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="md:hidden">
                  <MobileActionMenu
                    breakpoint="md"
                    actions={[
                      { key: 'export-reports', label: t('exportFilteredReports'), icon: <FileSpreadsheet className="h-4 w-4" />, onClick: () => { void exportFiltered() }, disabled: !filteredReports.length },
                      { key: 'export-images', label: t('exportImageMetadata'), icon: <FileImage className="h-4 w-4" />, onClick: () => void exportImages(), disabled: !filteredReports.length },
                      { key: 'download-template', label: t('downloadReportTemplate'), icon: <Download className="h-4 w-4" />, onClick: downloadReportTemplate }
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div id="reports-filter-panel" className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <label className="text-xs font-medium text-foreground">
                {t('startDate')}
                <Input
                  className="mt-1.5 bg-background"
                  type="date"
                  value={filters.start}
                  onChange={event => setFilters(current => ({ ...current, start: event.target.value }))}
                />
              </label>
              <label className="text-xs font-medium text-foreground">
                {t('endDate')}
                <Input
                  className="mt-1.5 bg-background"
                  type="date"
                  value={filters.end}
                  onChange={event => setFilters(current => ({ ...current, end: event.target.value }))}
                />
              </label>
              <EntityFilter label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => ({ ...current, brandIds: value }))} />
              <EntityFilter label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => ({ ...current, platformIds: value }))} />
              <EntityFilter label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => ({ ...current, campaignIds: value }))} />
              <StatusFilter label={t('reportStatus')} value={filters.reportStatuses} values={['draft', 'in_review', 'confirmed', 'reopened', 'archived']} onChange={value => setFilters(current => ({ ...current, reportStatuses: value }))} />
              <StatusFilter label={t('metricsStatus')} value={filters.metricsStatuses} values={['confirmed', 'unconfirmed']} onChange={value => setFilters(current => ({ ...current, metricsStatuses: value }))} />
              <EntityFilter label={t('host')} value={filters.hostIds} options={users.filter(user => user.operational_roles?.includes('host')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, hostIds: value }))} />
              <EntityFilter label={t('support')} value={filters.supportIds} options={users.filter(user => user.operational_roles?.includes('support')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, supportIds: value }))} />
              <EntityFilter label={t('technical')} value={filters.technicalIds} options={users.filter(user => user.operational_roles?.includes('technical')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, technicalIds: value }))} />
            </div>
            {activeFilterCount > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs">
                <span className="text-muted-foreground">{activeFilterCount} {t('filters').toLowerCase()} đang áp dụng</span>
                <button
                  type="button"
                  onClick={() => setFilters(emptyFilters)}
                  className="font-medium text-destructive hover:underline"
                >
                  {t('clearFilters')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ReportsView
        reports={filteredReports}
        shifts={shifts}
        page={reportPage}
        pageSize={reportPageSize}
        total={reportTotal}
        onPageChange={setReportPage}
        onPageSizeChange={size => { setReportPageSize(size); setReportPage(1) }}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        registrations={registrations}
        currentUser={currentUser}
        onView={report => { void openTarget(report.shift_id, true).catch(showTargetError) }}
        onExport={currentUser && hasPermission(currentUser, 'reports.export') ? report => exportReportDetailToExcel(report, exportContext) : undefined}
        onRemove={report => { void requestRemove(report) }}
        hasActiveFilters={activeFilterCount > 0 || Boolean(filters.search)}
        onResetFilters={() => setFilters(emptyFilters)}
        totalUnfilteredReports={reportTotal}
        onCreateReport={currentUser && hasPermission(currentUser, 'reports.submit') ? () => setShowShiftPicker(true) : undefined}
      />

      {showShiftPicker && currentUser && hasPermission(currentUser, 'reports.submit') && (
        <ReportShiftPicker
          open={showShiftPicker}
          onOpenChange={open => { if (!open) targetVersion.current++; setShowShiftPicker(open) }}
          currentUser={currentUser}
          onInvalidateTarget={invalidateTarget}
          onTarget={target => { void openTarget(target.shift.id).catch(showTargetError) }}
        />
      )}
      {showForm && targetIdentity === identity && (
        <ReportFormModal
          open={showForm}
          onOpenChange={open => { if (!open) closeTarget() }}
          initialShiftId={formInitialShiftId}
          initialReport={formInitialReport}
          completedShifts={deepLinkedShift ? [deepLinkedShift] : []}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          registrations={targetRegistrations}
          onSuccess={() => { closeTarget(); void loadData() }}
        />
      )}
      {selectedReport && targetIdentity === identity && (
        <ReportDetailModal
          open
          report={selectedReport}
          shift={(deepLinkedShift?.id === selectedReport.shift_id ? deepLinkedShift : shiftById.get(selectedReport.shift_id))!}
          brands={brands}
          platforms={platforms}
          users={users}
          registrations={targetRegistrations}
          onOpenChange={open => { if (!open) closeTarget() }}
          onUpdated={() => { closeTarget(); void loadData() }}
          campaigns={campaigns}
        />
      )}
      <LifecycleActionDialog
        open={Boolean(removeTarget)}
        onOpenChange={open => { if (!open) { setRemoveTarget(null); setRemoveImpact(null) } }}
        title={removeTarget?.metrics_confirmed ? t('archiveConfirmedReport') : t('deleteUnconfirmedReport')}
        impact={removeImpact}
        confirmText={removeTarget?.metrics_confirmed ? t('archive') : t('delete')}
        onConfirm={removeReport}
      />
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="whitespace-nowrap"><span className="text-slate-500">{label} </span><span className="font-semibold text-slate-900">{value}</span></div>
}

function EntityFilter({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

function StatusFilter({ label, value, values, onChange }: { label: string; value: string[]; values: string[]; onChange: (value: string[]) => void }) {
  const { t, translate } = useTranslation()
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={values.map(status => ({ value: status, label: status === 'in_review' ? t('inReview') : status === 'draft' ? t('draft') : status === 'confirmed' ? t('confirmed') : status === 'reopened' ? t('reopened') : status === 'archived' ? t('archived') : translate(status) }))} />
}
