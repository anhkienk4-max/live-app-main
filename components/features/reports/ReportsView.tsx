'use client'

import * as React from 'react'
import { useMemo, useState, type ReactNode } from 'react'
import { Archive, Download, Eye, FileText, Plus, RotateCcw } from 'lucide-react'
import type { Brand, Campaign, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShiftTimeRange, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { reportMetricValue } from '@/lib/utils/analytics'
import { isStaffedRegistration } from '@/lib/services/dataService'
import { Badge } from '@/components/ui/badge'
import { ActionBar } from '@/components/ui/action-bar'
import { buildReportActions } from '@/lib/ui/action-priority'
import { deriveReportAttention } from '@/lib/ui/operational-attention'
import { AttentionItem } from '@/components/ui/operational-status'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type DetailTab = 'overview' | 'metrics' | 'evidence' | 'staffing' | 'notes' | 'activity'

export function ReportsView({
  reports,
  shifts,
  brands,
  platforms,
  campaigns,
  users,
  registrations,
  currentUser,
  onView,
  onExport,
  onRemove,
  hasActiveFilters,
  onResetFilters,
  totalUnfilteredReports,
  onCreateReport,
  completedShiftsCount,
  page: externalPage,
  pageSize: externalSize,
  total: externalTotal,
  onPageChange,
  onPageSizeChange,
}: {
  reports: Report[]
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  currentUser: User | null
  onView: (report: Report) => void
  onExport?: (report: Report) => void
  onRemove: (report: Report) => void
  hasActiveFilters?: boolean
  onResetFilters?: () => void
  totalUnfilteredReports?: number
  onCreateReport?: () => void
  completedShiftsCount?: number
  page?: number
  pageSize?: 10 | 20 | 50
  total?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: 10 | 20 | 50) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')

  const serverPaged = externalPage !== undefined && externalSize !== undefined && externalTotal !== undefined
  const effectiveSize = externalSize ?? pageSize
  const total = externalTotal ?? reports.length
  const totalPages = Math.max(1, Math.ceil(total / effectiveSize))
  const safePage = Math.min(externalPage ?? page, totalPages)
  const visible = serverPaged ? reports : reports.slice((safePage - 1) * effectiveSize, safePage * effectiveSize)
  const selected = reports.find(report => report.id === selectedId) ?? reports[0]
  const selectedShift = selected && shifts.find(item => item.id === selected.shift_id)

  const staffIds = useMemo(() => selected && selectedShift ? [...new Set([
    ...registrations.filter(item => item.shift_id === selected.shift_id && isStaffedRegistration(item)).map(item => item.user_id),
    ...[selectedShift.host_id, selectedShift.support_id, selectedShift.technical_id].filter((id): id is string => Boolean(id)),
  ])] : [], [registrations, selected, selectedShift])

  const name = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name ?? '—' : '—'
  const reportRevenue = selected ? reportMetricValue(selected, 'revenue') : null
  const reportOrders = selected ? reportMetricValue(selected, 'orders') : null
  const averageOrderValue = reportRevenue !== null && reportOrders !== null && reportOrders > 0 ? reportRevenue / reportOrders : null

  const detailedMetrics = selected ? [
    ...Object.entries(selected.normalized_metrics ?? {}).map(([key, value]) => ({ key, value, source: 'Normalized' })),
    ...Object.entries(selected.platform_metrics ?? {}).map(([key, value]) => ({ key, value, source: 'Platform' })),
  ].filter((metric): metric is { key: string; value: string | number; source: string } => metric.value !== null && metric.value !== undefined && metric.value !== '') : []

  const metrics = selected ? [
    { label: t('revenue'), value: reportRevenue === null ? null : formatCurrency(reportRevenue) },
    { label: t('orders'), value: reportOrders === null ? null : reportOrders.toLocaleString() },
    { label: t('averageOrderValue'), value: averageOrderValue === null ? null : formatCurrency(averageOrderValue) },
    { label: t('ctr'), value: reportMetricValue(selected, 'ctr') === null ? null : `${reportMetricValue(selected, 'ctr')!.toFixed(2)}%` },
    { label: t('peakViewers'), value: selected?.peak_viewer == null ? null : selected.peak_viewer.toLocaleString() },
  ].filter((metric): metric is { label: string; value: string } => metric.value !== null) : []

  return (
    <div className="space-y-3">
      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label={t('reports')}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold">{t('reports')}</h2>
            <span className="truncate text-xs text-slate-500">
              {reports.length} · {reports.filter(report => report.status === 'confirmed' && report.metrics_confirmed === true).length} {t('confirmed')}
            </span>
          </div>
          {selected && <span className="hidden truncate text-xs text-slate-500 md:block">{selectedShift?.title ?? selected.id}</span>}
        </div>

        {/* Mobile View: Dedicated cards list (UX-P1-02: replaces horizontal scroll min-w-[1060px]) */}
        <div className="block divide-y divide-slate-100 md:hidden">
          {visible.map(report => {
            const shift = shifts.find(item => item.id === report.shift_id)
            const duration = shift && resolveShiftDateTime(shift.date, shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), shift.timezone)
            const revenue = reportMetricValue(report, 'revenue')
            const orders = reportMetricValue(report, 'orders')
            const status = report.status ?? (report.metrics_confirmed ? 'confirmed' : 'draft')
            const canRemove = Boolean(currentUser && (hasPermission(currentUser, 'reports.review') || report.submitted_by === currentUser.id))
            const canArchive = Boolean(currentUser && hasPermission(currentUser, 'audit.restore'))
            const canDeleteAction = report.metrics_confirmed ? canArchive : canRemove
            const hostUser = users.find(u => u.id === shift?.host_id)
            const isSelected = selected?.id === report.id

            return (
              <div
                key={report.id}
                data-testid="mobile-report-card"
                className={`p-3.5 transition-colors ${isSelected ? 'bg-blue-50/50' : 'bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="text-left font-semibold text-sm text-slate-900 hover:text-blue-700"
                      onClick={() => { setSelectedId(report.id); setDetailTab('overview') }}
                    >
                      {shift?.title ?? report.id}
                    </button>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {shift ? `${shift.date} · ${formatShiftTimeRange(shift)}` : '—'} · {shift?.studio ?? '—'}
                      {duration?.valid ? ` · ${duration.durationMinutes} ${t('minuteShort')}` : ''}
                    </p>
                    <p className="max-w-[220px] truncate text-[11px] text-slate-400" title={report.id}>{report.id}</p>
                  </div>
                  <Badge variant="secondary" className={report.metrics_confirmed ? 'bg-emerald-50 text-emerald-700 shrink-0 text-xs' : 'bg-amber-50 text-amber-700 shrink-0 text-xs'}>
                    {status === 'in_review' ? t('inReview') : t(status)}
                  </Badge>
                </div>

                {deriveReportAttention(report.id, status, shift?.date).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {deriveReportAttention(report.id, status, shift?.date).map(item => (
                      <AttentionItem key={item.key} item={item} />
                    ))}
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{name(brands, shift?.brand_id)}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{name(platforms, shift?.platform_id)}</span>
                  {shift?.campaign_id && <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">{name(campaigns, shift?.campaign_id)}</span>}
                  {hostUser && <span className="text-slate-500">Host: <span className="font-medium text-slate-700">{hostUser.full_name}</span></span>}
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 text-xs">
                  <div>
                    <span className="text-slate-500">{t('revenue')}: </span>
                    <span className="font-semibold text-slate-900">{revenue === null ? '—' : formatCurrency(revenue)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">{t('orders')}: </span>
                    <span className="font-semibold text-slate-900">{orders === null ? '—' : orders.toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-800"
                    onClick={() => { setSelectedId(report.id); setDetailTab('overview') }}
                  >
                    {isSelected ? `✓ ${t('currentlyViewing')}` : t('viewDetails')}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 min-h-[32px] px-2.5 text-xs" onClick={() => onView(report)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t('viewDetails')}
                    </Button>
                    {onExport && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 min-h-[32px] min-w-[32px] p-0" onClick={() => onExport(report)} title={t('exportExcel')}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDeleteAction && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onRemove(report)} title={report.metrics_confirmed ? t('archiveReport') : t('delete')}>
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop View: Compact Table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1060px] text-left text-xs">
            <thead className="border-b bg-slate-50 text-slate-500">
              <tr>
                {(['finalReport', 'brand', 'platform', 'revenue', 'orders', 'reportStatus', 'updatedAt', 'actions'] as const).map(key => (
                  <th className="whitespace-nowrap px-3 py-2 font-medium" key={key}>{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(report => {
                const shift = shifts.find(item => item.id === report.shift_id)
                const duration = shift && resolveShiftDateTime(shift.date, shift.start_time.slice(0, 5), shift.end_time.slice(0, 5), shift.timezone)
                const revenue = reportMetricValue(report, 'revenue')
                const orders = reportMetricValue(report, 'orders')
                const status = report.status ?? (report.metrics_confirmed ? 'confirmed' : 'draft')
                const canRemove = Boolean(currentUser && (hasPermission(currentUser, 'reports.review') || report.submitted_by === currentUser.id))
                const canArchive = Boolean(currentUser && hasPermission(currentUser, 'audit.restore'))
                const reportStaffIds = new Set([
                  ...registrations.filter(item => item.shift_id === report.shift_id && isStaffedRegistration(item)).map(item => item.user_id),
                  ...[shift?.host_id, shift?.support_id, shift?.technical_id].filter((id): id is string => Boolean(id)),
                ])
                return (
                  <tr key={report.id} className={`align-middle hover:bg-slate-50 ${selected?.id === report.id ? 'bg-blue-50/60' : ''}`}>
                    <td className="max-w-[300px] px-3 py-2">
                      <button aria-pressed={selected?.id === report.id} className="text-left font-semibold text-blue-700 hover:underline" onClick={() => { setSelectedId(report.id); setDetailTab('overview') }}>
                        {shift?.title ?? report.id}
                      </button>
                      <p className="mt-0.5 text-slate-500">{shift ? `${shift.date} · ${formatShiftTimeRange(shift)}` : '—'} · {shift?.studio ?? '—'}{duration?.valid ? ` · ${duration.durationMinutes} ${t('minuteShort')}` : ''}</p>
                      <p className="max-w-[240px] truncate text-slate-400" title={report.id}>{report.id}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{name(brands, shift?.brand_id)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {name(platforms, shift?.platform_id)}
                      <p className="text-slate-400">{name(campaigns, shift?.campaign_id)}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{revenue === null ? '—' : formatCurrency(revenue)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{orders === null ? '—' : orders.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={report.metrics_confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                        {status === 'in_review' ? t('inReview') : t(status)}
                      </Badge>
                      {deriveReportAttention(report.id, status, shift?.date).map(item => (
                        <AttentionItem key={item.key} item={item} />
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {report.updated_at ? new Date(report.updated_at).toLocaleString() : '—'}
                      <p className="text-slate-400">{reportStaffIds.size} {t('staffing').toLowerCase()}</p>
                    </td>
                    <td className="px-3 py-2">
                      <ActionBar
                        compact
                        iconOnly
                        actions={buildReportActions(
                          { status, canDelete: report.metrics_confirmed ? canArchive : canRemove, canExport: Boolean(onExport) },
                          { onView: () => onView(report), onExport: onExport ? () => onExport(report) : undefined, onDelete: () => onRemove(report) },
                          { view: t('viewDetails'), export: t('exportExcel'), archive: t('archiveReport'), delete: t('delete') },
                          { view: <Eye />, export: <Download />, archive: <Archive />, delete: <Archive /> },
                        )}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Reason-aware Empty State (UX-P2-04) */}
        {!reports.length && (
          <div className="px-4 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <FileText className="h-6 w-6" />
            </div>
            {hasActiveFilters ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">{t('noReports')}</p>
                <p className="text-xs text-slate-500">{t('noReports')}</p>
                {onResetFilters && (
                  <Button variant="outline" size="sm" onClick={onResetFilters} className="mt-2">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    {t('clearFilters')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800">
                  {totalUnfilteredReports === 0
                    ? 'Chưa có báo cáo ca trực nào được tạo'
                    : (currentUser && hasPermission(currentUser, 'reports.submit')
                      ? 'Chưa có báo cáo ca trực nào được tạo'
                      : 'Chưa có báo cáo ca trực nào được tạo.')}
                </p>
                {completedShiftsCount !== undefined && <p className="text-xs text-slate-500">
                  {completedShiftsCount > 0 ? t('reportDraftReady', { count: completedShiftsCount }) : t('noReportDraftReady')}
                </p>}
                {onCreateReport ? (
                  <Button size="sm" onClick={onCreateReport} className="mt-2" data-testid="empty-create-report-button">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t('createFinalReport')}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* History Pagination: Render ONLY when data exists */}
        {total > 0 && (
          <HistoryPagination
            page={safePage}
            pageSize={effectiveSize}
            total={total}
            onPageChange={onPageChange ?? setPage}
            onPageSizeChange={size => {
              if (onPageSizeChange) onPageSizeChange(size as 10 | 20 | 50)
              else { setPageSize(size); setPage(1) }
            }}
          />
        )}
      </section>

      {/* Selected Report Inspector */}
      {selected && selectedShift && (
        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label={t('reportDetails')}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">{selectedShift.title}</h2>
                <Badge variant="secondary" className={selected.metrics_confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                  {selected.metrics_confirmed ? t('confirmed') : t('needsReview')}
                </Badge>
                <span className="max-w-40 truncate text-xs text-slate-500" title={selected.id}>
                  {selected.id}{selected.version_number ? ` · v${selected.version_number}` : ''}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {selectedShift.date} · {formatShiftTimeRange(selectedShift)} · {selectedShift.studio ?? '—'} · {name(platforms, selectedShift.platform_id)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onView(selected)}>
                <Eye className="mr-1.5 h-4 w-4" />
                {t('viewDetails')}
              </Button>
              {onExport && (
                <Button size="sm" onClick={() => onExport(selected)}>
                  <Download className="mr-1.5 h-4 w-4" />
                  {t('exportExcel')}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-5 sm:divide-y-0">
            {metrics.length ? metrics.map(metric => (
              <div key={metric.label} className="min-w-0 px-4 py-2.5">
                <p className="truncate text-[11px] font-medium text-slate-500">{metric.label}</p>
                <p className="mt-0.5 truncate text-base font-semibold text-slate-900">{metric.value}</p>
              </div>
            )) : <p className="col-span-full px-4 py-3 text-sm text-slate-500">{t('metricsUnavailable')}</p>}
          </div>

          <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-2 text-xs text-slate-600">
            <span className="font-medium">Shift:</span> {selectedShift.title}{' '}
            <span className="inline-block max-w-40 truncate align-bottom" title={selected.shift_id}>({selected.shift_id})</span>{' '}
            <span className="mx-1 text-slate-400">→</span>{' '}
            <span className="font-medium">Report:</span>{' '}
            <span className="inline-block max-w-40 truncate align-bottom" title={selected.id}>{selected.id}</span>
            {selected.confirmed_at && (
              <span className="ml-3">
                {t('confirmed')}: {new Date(selected.confirmed_at).toLocaleString()}
                {selected.confirmed_by ? ` · ${users.find(user => user.id === selected.confirmed_by)?.full_name ?? '—'}` : ''}
              </span>
            )}
          </div>

          <Tabs value={detailTab} onValueChange={value => setDetailTab(value as DetailTab)} className="min-w-0">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b border-slate-200 bg-white px-3 py-0">
              <TabsTrigger value="overview">{t('reportOverview')}</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="evidence">OCR &amp; Evidence</TabsTrigger>
              <TabsTrigger value="staffing">{t('staffing')}</TabsTrigger>
              <TabsTrigger value="notes">Notes &amp; Recap</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="m-0 p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <DetailField label={t('brand')} value={name(brands, selectedShift.brand_id)} />
                <DetailField label={t('platform')} value={name(platforms, selectedShift.platform_id)} />
                <DetailField label={t('campaign')} value={name(campaigns, selectedShift.campaign_id)} />
                <DetailField label={t('studio')} value={selectedShift.studio ?? '—'} />
                <DetailField label={t('reportStatus')} value={statusLabel(selected, t)} />
                <DetailField label={t('reviewedBy')} value={selected.reviewed_by ? users.find(user => user.id === selected.reviewed_by)?.full_name ?? '—' : '—'} />
                <DetailField label={t('createdAt')} value={new Date(selected.created_at).toLocaleString()} />
                <DetailField label={t('updatedAt')} value={new Date(selected.updated_at).toLocaleString()} />
              </div>
            </TabsContent>
            <TabsContent value="metrics" className="m-0 p-4">
              {metrics.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {metrics.map(metric => <DetailField key={metric.label} label={metric.label} value={metric.value} />)}
                </div>
              ) : <EmptyDetail>{t('metricsUnavailable')}</EmptyDetail>}
              {detailedMetrics.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Metric</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                        <th className="px-3 py-2 font-medium">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailedMetrics.map((metric, index) => (
                        <tr key={`${metric.source}-${metric.key}-${index}`}>
                          <td className="px-3 py-2">{metric.key.replaceAll('_', ' ')}</td>
                          <td className="px-3 py-2 font-medium">{metric.value}</td>
                          <td className="px-3 py-2 text-slate-500">{metric.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="evidence" className="m-0 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label={t('ocrReviewStatus')} value={selected.ocr_review?.status ?? '—'} />
                <DetailField label={t('rawOcrOutput')} value={selected.raw_ocr_output ? t('available') : '—'} />
              </div>
              {selected.raw_ocr_output && (
                <details className="mt-3 rounded-md border bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-medium">{t('rawOcrOutput')}</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">{selected.raw_ocr_output}</pre>
                </details>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span>{t('reportImages')} · {t('rawOcrAndEvidence')}</span>
                <Button size="sm" variant="outline" onClick={() => onView(selected)}>
                  <Eye className="mr-1.5 h-4 w-4" />
                  {t('viewDetails')}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="staffing" className="m-0 p-4">
              {staffIds.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {staffIds.map(id => (
                    <DetailField
                      key={id}
                      label={users.find(user => user.id === id)?.operational_roles?.join(', ') ?? t('staffing')}
                      value={users.find(user => user.id === id)?.full_name ?? '—'}
                    />
                  ))}
                </div>
              ) : <EmptyDetail>{t('noStaffAssigned')}</EmptyDetail>}
            </TabsContent>
            <TabsContent value="notes" className="m-0 p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <DetailField label={t('whatWentWell')} value={selected.insights_good || '—'} />
                <DetailField label={t('needsImprovement')} value={selected.insights_improvement || '—'} />
                {selected.final_recap && (
                  <DetailField
                    label="Final recap"
                    value={Object.entries(selected.final_recap).filter(([, value]) => Boolean(value)).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`).join('\n') || '—'}
                  />
                )}
              </div>
            </TabsContent>
            <TabsContent value="activity" className="m-0 p-4">
              {selected.revisions?.length ? (
                <ol className="space-y-2">
                  {selected.revisions.map((revision, index) => (
                    <li key={`${revision.version}-${revision.created_at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <span className="font-medium">{revision.event.replaceAll('_', ' ')} · v{revision.version}</span>
                      <span className="text-xs text-slate-500">{new Date(revision.created_at).toLocaleString()} · {users.find(user => user.id === revision.created_by)?.full_name ?? '—'}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField label={t('submittedBy')} value={selected.submitted_by ? users.find(user => user.id === selected.submitted_by)?.full_name ?? '—' : '—'} />
                  <DetailField label={t('createdAt')} value={new Date(selected.created_at).toLocaleString()} />
                  <DetailField label={t('updatedBy')} value={selected.updated_by ? users.find(user => user.id === selected.updated_by)?.full_name ?? '—' : '—'} />
                  <DetailField label={t('updatedAt')} value={new Date(selected.updated_at).toLocaleString()} />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      )}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 px-3 py-2">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{value}</p>
    </div>
  )
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">{children}</p>
}

function statusLabel(report: Report, t: ReturnType<typeof useTranslation>['t']) {
  const status = report.status ?? (report.metrics_confirmed ? 'confirmed' : 'draft')
  return status === 'in_review' ? t('inReview') : t(status)
}
