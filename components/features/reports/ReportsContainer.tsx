'use client'

import * as React from 'react'
import { DollarSign, Download, FileImage, FileSpreadsheet, FileText, Filter, Plus, RotateCcw, Search, TrendingUp, Trash2 } from 'lucide-react'
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
import { deriveReportAttention } from '@/lib/ui/operational-attention'
import { AttentionItem } from '@/components/ui/operational-status'
import { buildReportActions } from '@/lib/ui/action-priority'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { ReportsView, MappedReport, MappedMetric } from './ReportsView'
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
  const userName = (id?: string) => id ? users.find(user => user.id === id)?.full_name || '—' : '—'
  const matchesRole = React.useCallback((shift: Shift, role: OperationalRole, userId: string) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return assignment === userId || registrations.some(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === userId &&
      registration.operational_role === role &&
      isStaffedRegistration(registration)
    )
  }, [registrations])
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

  const confirmed = filteredReports.filter(report => report.metrics_confirmed)
  const totalRevenue = confirmed.reduce((sum, report) => sum + (reportRevenue(report) ?? 0), 0)
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


  const mappedReports: MappedReport[] = React.useMemo(() => {
    return filteredReports.map(r => {
      const shift = shiftById.get(r.shift_id)
      const isConfirmed = r.metrics_confirmed
      const rev = typeof r.normalized_metrics?.revenue === 'number' ? r.normalized_metrics.revenue : (typeof r.platform_metrics?.sales === 'number' ? r.platform_metrics.sales : (r.revenue ?? r.gmv ?? 0))
      return {
        id: r.id,
        shift_id: r.shift_id,
        date: shift?.date || '',
        shift: `${nameById(brands, shift?.brand_id)}`,
        campaign: nameById(campaigns, shift?.campaign_id),
        brand: nameById(brands, shift?.brand_id),
        platform: nameById(platforms, shift?.platform_id),
        studio: 'N/A',
        time: shift?.date || '',
        duration_minutes: 180,
        revenue: formatCurrency(rev),
        orders: r.orders != null ? r.orders.toString() : '0',
        ctr: 'N/A',
        aov: r.orders ? formatCurrency(rev / r.orders) : 'N/A',
        quality: isConfirmed ? 'Tốt' : 'Partial',
        qualityClass: isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
        status: isConfirmed ? 'Đã xác nhận' : (r.status === 'in_review' ? 'Chờ duyệt' : 'Bản nháp'),
        statusClass: isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800',
        updated: r.updated_at || '',
        metrics_confirmed: !!r.metrics_confirmed,
        analytics_eligible: !!r.metrics_confirmed
      }
    })
  }, [filteredReports, shiftById, brands, campaigns, platforms])

  const canonicalMetrics: MappedMetric[] = React.useMemo(() => [
      { key: 'rev', label: 'Doanh thu (GMV)', value: '0', unit: '₫', source: 'KOC Platform', confidence: 'High', freshness: 'Real-time', review: 'Khớp', required: true, status: 'confirmed' }
  ], [])

  const filterNode = (
    <>
      <div className="flex h-8 min-w-[200px] flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] text-slate-400">
        <Search className="h-3.5 w-3.5 text-slate-400" />
        <Input className="border-0 p-0 h-full w-full text-xs bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0" value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Tìm báo cáo, ca live, brand..." />
      </div>
      <Button variant={showFilters ? 'secondary' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
        <Filter className="mr-2 h-3.5 w-3.5" />Bộ lọc
      </Button>
      {showFilters && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl bg-white p-4 shadow-xl md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-80 md:rounded-lg md:border md:border-slate-200 md:shadow-lg">
          <div className="space-y-4">
            <EntityFilter label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => ({ ...current, brandIds: value }))} />
            <EntityFilter label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => ({ ...current, platformIds: value }))} />
            <EntityFilter label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => ({ ...current, campaignIds: value }))} />
          </div>
        </div>
      )}
    </>
  )

  return (
    <>
      <ReportsView 
        reports={mappedReports} 
        canonicalMetrics={canonicalMetrics} 
        onCreateReport={() => setShowForm(true)} 
        onExport={() => exportReportsToExcel(filteredReports, exportContext)}
        filterNode={filterNode}
      />
      {showForm && <ReportFormModal open={showForm} onOpenChange={setShowForm} completedShifts={completedShifts} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onSuccess={() => { void loadData(); setShowForm(false) }} />}
    </>
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

function EntityFilter({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

function StatusFilter({ label, value, values, onChange }: { label: string; value: string[]; values: string[]; onChange: (value: string[]) => void }) {
  const { t, translate } = useTranslation()
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={values.map(status => ({ value: status, label: status === 'in_review' ? t('inReview') : status === 'draft' ? t('draft') : status === 'confirmed' ? t('confirmed') : status === 'reopened' ? t('reopened') : status === 'archived' ? t('archived') : translate(status) }))} />
}

function Value({ label, value }: { label: string; value: string }) {
  return <div><p className="text-micro font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="truncate text-sm font-semibold">{value}</p></div>
}

function reportRevenue(report: Report): number | undefined {
  if (typeof report.normalized_metrics?.revenue === 'number') return report.normalized_metrics.revenue
  if (typeof report.platform_metrics?.sales === 'number') return report.platform_metrics.sales
  if (report.revenue != null) return report.revenue
  return report.gmv
}
