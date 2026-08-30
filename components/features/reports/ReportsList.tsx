'use client'

import * as React from 'react'
import { DollarSign, Download, FileImage, FileSpreadsheet, FileText, Filter, Plus, RotateCcw, Search, TrendingUp, Trash2, MoreHorizontal } from 'lucide-react'
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
import {
  downloadReportTemplate,
  exportReportImageMetadataToExcel,
  exportReportsToExcel,
  exportReportDetailToExcel,
} from '@/lib/utils/excelUtils'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { ActionBar } from '@/components/ui/action-bar'
import { buildReportActions } from '@/lib/ui/action-priority'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ReportDetailModal } from './ReportDetailModal'
import { ReportFormModal } from './ReportFormModal'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'

type Filters = {
  start: string
  end: string
  brand: string
  platform: string
  campaign: string
  host: string
  support: string
  technical: string
  reportStatus: string
  metricsStatus: string
  search: string
}

const emptyFilters: Filters = {
  start: '',
  end: '',
  brand: 'all',
  platform: 'all',
  campaign: 'all',
  host: 'all',
  support: 'all',
  technical: 'all',
  reportStatus: 'all',
  metricsStatus: 'all',
  search: '',
}

export function ReportsList() {
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

  React.useEffect(() => { void loadData() }, [loadData])
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
  const userName = (id?: string) => id ? users.find(user => user.id === id)?.full_name || '—' : '—'
  const matchesRole = (shift: Shift, role: OperationalRole, userId: string) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return assignment === userId || registrations.some(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === userId &&
      registration.operational_role === role &&
      isStaffedRegistration(registration)
    )
  }
  const roleNames = (shift: Shift, role: OperationalRole) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    const ids = new Set([
      ...(assignment ? [assignment] : []),
      ...registrations.filter(registration => registration.shift_id === shift.id && registration.operational_role === role && isStaffedRegistration(registration)).map(registration => registration.user_id),
    ])
    return [...ids].map(userName).join(', ') || '—'
  }

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
    if (filters.brand !== 'all' && shift.brand_id !== filters.brand) return false
    if (filters.platform !== 'all' && shift.platform_id !== filters.platform) return false
    if (filters.campaign !== 'all' && shift.campaign_id !== filters.campaign) return false
    if (filters.host !== 'all' && !matchesRole(shift, 'host', filters.host)) return false
    if (filters.support !== 'all' && !matchesRole(shift, 'support', filters.support)) return false
    if (filters.technical !== 'all' && !matchesRole(shift, 'technical', filters.technical)) return false
    const status = report.status || (report.metrics_confirmed ? 'confirmed' : 'draft')
    if (filters.reportStatus !== 'all' && status !== filters.reportStatus) return false
    if (filters.metricsStatus === 'confirmed' && !report.metrics_confirmed) return false
    if (filters.metricsStatus === 'unconfirmed' && report.metrics_confirmed) return false
    if (filters.search) {
      const query = filters.search.toLowerCase()
      const haystack = [report.id, nameById(brands, shift.brand_id), nameById(platforms, shift.platform_id), nameById(campaigns, shift.campaign_id)].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  }), [brands, campaigns, filters, platforms, registrations, reports, shiftById])

  const confirmed = filteredReports.filter(report => report.metrics_confirmed)
  const totalRevenue = confirmed.reduce((sum, report) => sum + confirmedRevenue(report), 0)
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
    <div className="space-y-6">
      {currentUser && hasPermission(currentUser, 'reports.submit') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <div><p className="font-semibold">{t('finalReportWorkflow')}</p><p className="text-sm text-muted-foreground">{completedShifts.length ? t('reportDraftReady', { count: completedShifts.length }) : t('noReportDraftReady')}</p></div>
          <Button onClick={() => setShowForm(true)} disabled={!completedShifts.length} data-testid="open-final-report-modal"><Plus className="mr-2 h-4 w-4" />{t('createFinalReport')}</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title={t('reportCount')} value={filteredReports.length.toLocaleString()} icon={<FileText className="h-5 w-5 text-blue-600" />} />
        <Metric title={t('confirmedRevenue')} value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-green-600" />} />
        <Metric title={t('averageOrderValue')} value={formatCurrency(confirmed.reduce((sum, report) => sum + (typeof report.normalized_metrics?.average_order_value === 'number' ? report.normalized_metrics.average_order_value : report.average_order_value ?? (report.orders ? confirmedRevenue(report) / report.orders : 0)), 0))} icon={<TrendingUp className="h-5 w-5 text-purple-600" />} />
        <Metric title={t('needsReview')} value={filteredReports.filter(report => !report.metrics_confirmed).length.toLocaleString()} icon={<FileText className="h-5 w-5 text-amber-600" />} />
      </div>

      {completedShifts.length > 0 && <Card className="border-orange-200 bg-orange-50"><CardContent className="pt-5"><p className="font-semibold text-orange-900">{t('reportDraftCandidates', { count: completedShifts.length })}</p><p className="text-sm text-orange-700">{t('reportDraftPolicy')}</p></CardContent></Card>}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-none">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-2">
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
            <EntityFilter label={t('brand')} value={filters.brand} options={brands} onChange={value => setFilters(current => ({ ...current, brand: value }))} />
            <EntityFilter label={t('platform')} value={filters.platform} options={platforms} onChange={value => setFilters(current => ({ ...current, platform: value }))} />
            <EntityFilter label={t('campaign')} value={filters.campaign} options={campaigns} onChange={value => setFilters(current => ({ ...current, campaign: value }))} />
            <EntityFilter label={t('host')} value={filters.host} options={users.filter(user => user.operational_roles?.includes('host')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, host: value }))} />
            <EntityFilter label={t('support')} value={filters.support} options={users.filter(user => user.operational_roles?.includes('support')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, support: value }))} />
            <EntityFilter label={t('technical')} value={filters.technical} options={users.filter(user => user.operational_roles?.includes('technical')).map(user => ({ id: user.id, name: user.full_name }))} onChange={value => setFilters(current => ({ ...current, technical: value }))} />
            <StatusFilter label={t('reportStatus')} value={filters.reportStatus} values={['draft', 'in_review', 'confirmed', 'reopened', 'archived']} onChange={value => setFilters(current => ({ ...current, reportStatus: value }))} />
            <StatusFilter label={t('metricsStatus')} value={filters.metricsStatus} values={['confirmed', 'unconfirmed']} onChange={value => setFilters(current => ({ ...current, metricsStatus: value }))} />
          </div>
        )}
      </div>

      {filteredReports.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noReports')}</CardContent></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredReports.map(report => {
            const shift = shiftById.get(report.shift_id)
            if (!shift) return null
            const reportStatus = report.status || (report.metrics_confirmed ? 'confirmed' : 'draft')
            const statusLabel = reportStatus === 'in_review' ? t('inReview') : t(reportStatus)
            const canRemove = Boolean(currentUser && (hasPermission(currentUser, 'reports.review') || report.submitted_by === currentUser.id))
            const canArchive = Boolean(currentUser && hasPermission(currentUser, 'audit.restore'))
            return (
              <Card key={report.id} className="flex flex-col shadow-none transition-shadow hover:shadow-sm">
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">{shift.date}</Badge>
                    <Badge variant={report.metrics_confirmed ? 'default' : 'secondary'} className={report.metrics_confirmed ? 'bg-green-600/10 text-green-700 hover:bg-green-600/20 dark:text-green-400' : 'bg-amber-600/10 text-amber-700 hover:bg-amber-600/20 dark:text-amber-400'}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="mt-2.5">
                    <CardTitle className="text-base font-semibold leading-none tracking-tight">{nameById(brands, shift.brand_id)}</CardTitle>
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">{nameById(platforms, shift.platform_id)} · {nameById(campaigns, shift.campaign_id)}</p>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col p-4 pt-0">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-3 mb-4 flex-1">
                    <Value label={t('revenue')} value={formatCurrency(confirmedRevenue(report))} />
                    <Value label={t('orders')} value={report.orders.toLocaleString()} />
                    <Value label={t('host')} value={roleNames(shift, 'host')} />
                    <Value label={t('metricsStatus')} value={report.metrics_confirmed ? t('confirmed') : t('needsReview')} />
                  </div>
                  <ActionBar
                    stretch
                    compact
                    collapseAt="sm"
                    className="mt-auto w-full"
                    actions={buildReportActions(
                      {
                        canDelete: Boolean((!report.metrics_confirmed && canRemove) || (report.metrics_confirmed && canArchive)),
                        canExport: currentUser ? hasPermission(currentUser, 'reports.export') : false,
                        isConfirmed: Boolean(report.metrics_confirmed),
                      },
                      {
                        onView: () => setSelectedReport(report),
                        onExport: () => exportReportDetailToExcel(report, exportContext),
                        onDelete: () => void requestRemove(report),
                      },
                      {
                        view: t('viewDetails'),
                        export: t('exportExcel'),
                        archive: t('archiveReport'),
                        delete: t('deleteDraftReport'),
                      },
                      {
                        export: <Download />,
                        archive: <Trash2 />,
                        delete: <Trash2 />,
                      }
                    )}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showForm && <ReportFormModal open={showForm} onOpenChange={setShowForm} completedShifts={completedShifts} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onSuccess={() => { void loadData(); setShowForm(false) }} />}
      {selectedReport && <ReportDetailModal open report={selectedReport} shift={shiftById.get(selectedReport.shift_id)!} brands={brands} platforms={platforms} users={users} registrations={registrations} onOpenChange={open => !open && setSelectedReport(null)} onUpdated={() => { void loadData(); setSelectedReport(null) }} campaigns={campaigns} />}
      <LifecycleActionDialog open={Boolean(removeTarget)} onOpenChange={open => { if (!open) { setRemoveTarget(null); setRemoveImpact(null) } }} title={removeTarget?.metrics_confirmed ? t('archiveConfirmedReport') : t('deleteUnconfirmedReport')} impact={removeImpact} confirmText={removeTarget?.metrics_confirmed ? t('archive') : t('delete')} onConfirm={removeReport} />
    </div>
  )
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center p-4">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

function EntityFilter({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium text-foreground">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1.5 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}

function StatusFilter({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  const { t, translate } = useTranslation()
  return <label className="text-xs font-medium text-foreground">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1.5 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{values.map(status => <SelectItem key={status} value={status}>{status === 'in_review' ? t('inReview') : status === 'draft' ? t('draft') : status === 'confirmed' ? t('confirmed') : status === 'reopened' ? t('reopened') : status === 'archived' ? t('archived') : translate(status)}</SelectItem>)}</SelectContent></Select></label>
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="truncate text-sm font-semibold">{value}</p></div>
}

function confirmedRevenue(report: Report) {
  if (typeof report.normalized_metrics?.revenue === 'number') return report.normalized_metrics.revenue
  if (typeof report.platform_metrics?.sales === 'number') return report.platform_metrics.sales
  return report.revenue
}
