'use client'

import * as React from 'react'
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
import { Brand, Campaign, DeletionImpact, OperationalRole, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { reportMetricValue, calculateNullableAnalyticsMetrics } from '@/lib/utils/analytics'
import {
  downloadReportTemplate,
  exportReportImageMetadataToExcel,
  exportReportsToExcel,
  exportReportDetailToExcel,
} from '@/lib/utils/excelUtils'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { ReportsView } from './ReportsView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { ReportDetailModal } from './ReportDetailModal'
import { ReportFormModal } from './ReportFormModal'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
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
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [reports, setReports] = React.useState<Report[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters>(emptyFilters)
  const [showFilters, setShowFilters] = React.useState(false)
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(null)
  const [showForm, setShowForm] = React.useState(false)
  const [removeTarget, setRemoveTarget] = React.useState<Report | null>(null)
  const [removeImpact, setRemoveImpact] = React.useState<DeletionImpact | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedReports, loadedShifts, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers, loadedRegistrations] = await Promise.all([
        reportService.getAll(),
        shiftService.getAll(),
        brandService.getAll(),
        platformService.getAll(),
        campaignService.getAll(),
        userService.getAll(),
        shiftRegistrationService.getAll(),
      ])
      setReports(loadedReports)
      setShifts(loadedShifts)
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
      setRegistrations(loadedRegistrations)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadData() })
    return () => cancelAnimationFrame(frame)
  }, [loadData])
  const myShiftIds = React.useMemo(() => new Set(registrations
    .filter(registration => registration.user_id === currentUser?.id && isStaffedRegistration(registration))
    .map(registration => registration.shift_id)), [currentUser?.id, registrations])

  const requestRemove = async (report: Report) => {
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
  const nameById = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const matchesRole = React.useCallback((shift: Shift, role: OperationalRole, userId: string) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return assignment === userId || registrations.some(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === userId &&
      registration.operational_role === role &&
      isStaffedRegistration(registration)
    )
  }, [registrations])
  const completedShifts = React.useMemo(() => {
    const reported = new Set(reports.map(report => report.shift_id))
    return shifts.filter(shift =>
      ['preparing', 'live', 'paused', 'completed'].includes(shift.status) &&
      !reported.has(shift.id) &&
      (currentUser && hasPermission(currentUser, 'reports.review') || myShiftIds.has(shift.id))
    )
  }, [currentUser, myShiftIds, reports, shifts])

  const filteredReports = React.useMemo(() => reports.filter(report => {
    const shift = shiftById.get(report.shift_id)
    if (!shift) return false
    if (filters.start && shift.date < filters.start) return false
    if (filters.end && shift.date > filters.end) return false
    if (!matchesMultiSelect(shift.brand_id, filters.brandIds)) return false
    if (!matchesMultiSelect(shift.platform_id, filters.platformIds)) return false
    if (!matchesMultiSelect(shift.campaign_id, filters.campaignIds)) return false
    if (filters.hostIds.length > 0 && !filters.hostIds.some(userId => matchesRole(shift, 'host', userId))) return false
    if (filters.supportIds.length > 0 && !filters.supportIds.some(userId => matchesRole(shift, 'support', userId))) return false
    if (filters.technicalIds.length > 0 && !filters.technicalIds.some(userId => matchesRole(shift, 'technical', userId))) return false
    const status = report.status || (report.metrics_confirmed ? 'confirmed' : 'draft')
    if (filters.reportStatuses.length > 0 && !filters.reportStatuses.includes(status)) return false
    const metricsStatus = report.metrics_confirmed ? 'confirmed' : 'unconfirmed'
    if (filters.metricsStatuses.length > 0 && !filters.metricsStatuses.includes(metricsStatus)) return false
    if (filters.search) {
      const query = filters.search.toLowerCase()
      const haystack = [report.id, nameById(brands, shift.brand_id), nameById(platforms, shift.platform_id), nameById(campaigns, shift.campaign_id)].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  }), [brands, campaigns, filters, matchesRole, platforms, reports, shiftById])

  const confirmed = filteredReports.filter(report => report.status === 'confirmed' && report.metrics_confirmed === true)
  const revenueValues = confirmed.map(report => reportMetricValue(report, 'revenue')).filter((value): value is number => value !== null)
  const totalRevenue = revenueValues.length ? revenueValues.reduce((sum, value) => sum + value, 0) : null
  const aov = calculateNullableAnalyticsMetrics(confirmed).averageOrderValue
  const exportContext = {
    shifts,
    campaigns,
    users,
    brands: new Map(brands.map(brand => [brand.id, brand.name])),
    platforms: new Map(platforms.map(platform => [platform.id, platform.name])),
    registrations,
  }

  const exportImages = async () => {
    if (!currentUser || !hasPermission(currentUser, 'reports.export')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    const images = (await Promise.all(filteredReports.map(report => reportImageService.getByReport(report.id)))).flat()
    exportReportImageMetadataToExcel(images, filteredReports)
    toast({ title: t('success'), description: t('exportImageMetadata'), variant: 'success' })
  }

  if (loading || userLoading) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <SummaryMetric label={t('reportCount')} value={filteredReports.length.toLocaleString()} />
          <SummaryMetric label={t('confirmedRevenue')} value={totalRevenue === null ? '—' : formatCurrency(totalRevenue)} />
          <SummaryMetric label={t('averageOrderValue')} value={aov === null ? '—' : formatCurrency(aov)} />
          <SummaryMetric label={t('needsReview')} value={filteredReports.filter(report => !report.metrics_confirmed).length.toLocaleString()} />
        </div>
        {currentUser && hasPermission(currentUser, 'reports.submit') && (
          <div className="flex items-center gap-2">
            <div className="text-right text-[11px] leading-tight"><p className="font-medium text-slate-700">{t('finalReportWorkflow')}</p><p className="hidden text-amber-800 sm:block">{completedShifts.length ? t('reportDraftReady', { count: completedShifts.length }) : t('noReportDraftReady')}</p></div>
            <Button size="sm" onClick={() => setShowForm(true)} disabled={!completedShifts.length} data-testid="open-final-report-modal"><Plus className="mr-1.5 h-4 w-4" />{t('createFinalReport')}</Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 bg-background" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder={t('reportSearchPlaceholder')} />
            </div>
            <Button variant={showFilters ? 'secondary' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="reports-filter-panel" className="shrink-0"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setFilters(emptyFilters)} title={t('resetFilters')}><RotateCcw className="h-4 w-4" /></Button>
            {currentUser && hasPermission(currentUser, 'reports.export') && (
              <>
                <div className="hidden md:block">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                      <Download className="mr-2 h-4 w-4" />{t('exportFilteredReports')}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => exportReportsToExcel(filteredReports, exportContext)} disabled={!filteredReports.length}>
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
                      { key: 'export-reports', label: t('exportFilteredReports'), icon: <FileSpreadsheet className="h-4 w-4" />, onClick: () => exportReportsToExcel(filteredReports, exportContext), disabled: !filteredReports.length },
                      { key: 'export-images', label: t('exportImageMetadata'), icon: <FileImage className="h-4 w-4" />, onClick: () => void exportImages(), disabled: !filteredReports.length },
                      { key: 'download-template', label: t('downloadReportTemplate'), icon: <Download className="h-4 w-4" />, onClick: downloadReportTemplate }
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {showFilters && (
          <div id="reports-filter-panel" className="grid gap-4 rounded-md bg-muted/40 p-4 md:grid-cols-4 lg:grid-cols-5">
            <label className="text-xs font-medium text-foreground">{t('startDate')}<Input className="mt-1.5 bg-background" type="date" value={filters.start} onChange={event => setFilters(current => ({ ...current, start: event.target.value }))} /></label>
            <label className="text-xs font-medium text-foreground">{t('endDate')}<Input className="mt-1.5 bg-background" type="date" value={filters.end} onChange={event => setFilters(current => ({ ...current, end: event.target.value }))} /></label>
            <EntityFilter label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => ({ ...current, brandIds: value }))} />
            <EntityFilter label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => ({ ...current, platformIds: value }))} />
            <EntityFilter label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => ({ ...current, campaignIds: value }))} />
            <EntityFilter label={t('host')} value={filters.hostIds} options={users.filter(user => user.operational_roles?.includes('host')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, hostIds: value }))} />
            <EntityFilter label={t('support')} value={filters.supportIds} options={users.filter(user => user.operational_roles?.includes('support')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, supportIds: value }))} />
            <EntityFilter label={t('technical')} value={filters.technicalIds} options={users.filter(user => user.operational_roles?.includes('technical')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, technicalIds: value }))} />
            <StatusFilter label={t('reportStatus')} value={filters.reportStatuses} values={['draft', 'in_review', 'confirmed', 'reopened', 'archived']} onChange={value => setFilters(current => ({ ...current, reportStatuses: value }))} />
            <StatusFilter label={t('metricsStatus')} value={filters.metricsStatuses} values={['confirmed', 'unconfirmed']} onChange={value => setFilters(current => ({ ...current, metricsStatuses: value }))} />
          </div>
        )}
      </div>

      <ReportsView reports={filteredReports} shifts={shifts} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations}
        onView={setSelectedReport} onExport={currentUser && hasPermission(currentUser, 'reports.export') ? report => exportReportDetailToExcel(report, exportContext) : undefined}
        onRemove={report => { void requestRemove(report) }} currentUser={currentUser} />

      {showForm && <ReportFormModal open={showForm} onOpenChange={setShowForm} completedShifts={completedShifts} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onSuccess={() => { void loadData(); setShowForm(false) }} />}
      {selectedReport && <ReportDetailModal open report={selectedReport} shift={shiftById.get(selectedReport.shift_id)!} brands={brands} platforms={platforms} users={users} registrations={registrations} onOpenChange={open => !open && setSelectedReport(null)} onUpdated={() => { void loadData(); setSelectedReport(null) }} campaigns={campaigns} />}
      <LifecycleActionDialog open={Boolean(removeTarget)} onOpenChange={open => { if (!open) { setRemoveTarget(null); setRemoveImpact(null) } }} title={removeTarget?.metrics_confirmed ? t('archiveConfirmedReport') : t('deleteUnconfirmedReport')} impact={removeImpact} confirmText={removeTarget?.metrics_confirmed ? t('archive') : t('delete')} onConfirm={removeReport} />
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
