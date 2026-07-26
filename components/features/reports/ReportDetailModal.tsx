'use client'

import * as React from 'react'
import { Report, Shift, Brand, Platform, User, Campaign, FinalReportRecap, OcrReviewData, ShiftRegistration, NormalizedReportMetrics, ReportMetricKey, LiveReportImage } from '@/lib/types/database.types'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { liveReportImageService, ocrService, reportImageService, reportService } from '@/lib/services/dataService'
import { ReportImage } from '@/lib/types/database.types'
import { format } from 'date-fns'
import { AlertTriangle, DollarSign, TrendingUp, Users, ThumbsUp, MessageCircle, Share2, ExternalLink, Star, Download, Check, X, Pencil, RotateCcw, ScanText, Trash2, History, LockOpen, Upload } from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useToast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { exportReportDetailToExcel } from '@/lib/utils/excelUtils'
import { numericMetric } from '@/lib/utils/ocrMetrics'
import {
  clearReviewMetric,
  confirmAllReviewMetrics,
  confirmReviewMetric,
  markMetricManual,
  metricMatchesFilter,
  resetMetricToOcr,
  reviewInputValues,
  reviewRequiredCount,
  type OcrMetricFilter,
} from '@/lib/utils/ocrReview'
import {
  isCanonicalMetricKey,
  metricValueToInput,
  parseMetricInputValue,
  platformCanonicalMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'
import { serializeCanonicalMetrics } from '@/lib/utils/ocrMetricSerialization'
import { metricTranslationKeys } from '@/lib/reportMetricLabels'
import { defaultOcrCrop } from '@/lib/utils/ocrImage'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { DeletionImpact } from '@/lib/types/database.types'
import { OcrCropPreview } from '@/components/features/reports/OcrCropPreview'
import { OcrMetricFilterBar, OcrMetricReviewField } from '@/components/features/reports/OcrMetricReviewField'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'
import {
  emptyFinalReportRecap,
  finalReportRecapFields,
  normalizeFinalReportRecap,
} from '@/lib/utils/finalReportRecap'
import { LiveReportImageEditor, LiveReportImageGallery } from '@/components/features/reports/LiveReportImageGallery'
import {
  moveLiveReportImage,
  resolveLiveReportImagePermissions,
} from '@/lib/utils/liveReportImages'

interface ReportDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: Report
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  users: User[]
  campaigns?: Campaign[]
  registrations?: ShiftRegistration[]
  onUpdated?: () => void
}

export function FinalReportRecapReadOnly({ recap }: { recap?: FinalReportRecap }) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {finalReportRecapFields.map(field => (
        <div className="min-w-0" key={field.key}>
          <p className="text-sm font-medium">{t(field.translationKey)}</p>
          <p
            className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm"
            data-testid={`final-recap-${field.key}`}
          >
            {recap?.[field.key] || t('noInsightsProvided')}
          </p>
        </div>
      ))}
    </div>
  )
}

export function ReportDetailModal({ 
  open, 
  onOpenChange, 
  report, 
  shift, 
  brands, 
  platforms,
  users,
  campaigns = [],
  registrations = [],
  onUpdated,
}: ReportDetailModalProps) {
  const [images, setImages] = React.useState<ReportImage[]>([])
  const [liveImages, setLiveImages] = React.useState<LiveReportImage[]>([])
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [reviewNotes, setReviewNotes] = React.useState('')
  const [finalRecap, setFinalRecap] = React.useState<FinalReportRecap>({
    ...emptyFinalReportRecap(),
    ...report.final_recap,
  })
  const [busy, setBusy] = React.useState(false)
  const reportMetricValues = React.useMemo(() => initialMetricValues(report), [report])
  const [metricValues, setMetricValues] = React.useState<MetricState>(reportMetricValues)
  const [reviewData, setReviewData] = React.useState<OcrReviewData>(report.ocr_review || { status: 'review_required', metrics: {} })
  const [editingMetrics, setEditingMetrics] = React.useState(false)
  const [removeImageTarget, setRemoveImageTarget] = React.useState<ReportImage | null>(null)
  const [showReopen, setShowReopen] = React.useState(false)
  const [metricFilter, setMetricFilter] = React.useState<OcrMetricFilter>('data')
  const [showConfirmWarning, setShowConfirmWarning] = React.useState(false)
  const [revisionPage, setRevisionPage] = React.useState(1)
  const [revisionPageSize, setRevisionPageSize] = React.useState(10)
  const uploadInputRef = React.useRef<HTMLInputElement>(null)
  const dashboardImage = images.find(image => image.image_type === 'dashboard')
  React.useEffect(() => { if (open) void reportImageService.getByReport(report.id).then(setImages) }, [open, report.id])
  React.useEffect(() => { if (open) void liveReportImageService.getByReport(report.id).then(setLiveImages) }, [open, report.id])
  React.useEffect(() => {
    if (open) {
      setFinalRecap({
        ...emptyFinalReportRecap(),
        ...report.final_recap,
      })
    }
  }, [open, report])
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || t('noData')
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || t('noData')
  const getUserName = (id?: string) => id ? users.find(u => u.id === id)?.full_name || t('noData') : t('noData')

  const confirmReport = async () => {
    if (!currentUser || !hasPermission(currentUser, 'reports.review')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    const unresolved = reviewRequiredCount(reviewData)
    if (unresolved > 0) {
      setMetricFilter('review_required')
      setShowConfirmWarning(true)
      return
    }
    setBusy(true)
    try {
      const normalized = serializeCanonicalMetrics(report.dashboard_platform || 'other', metricValues)
      const platformSpecific = normalized
      const revenue = numberValue(normalized.revenue) ?? numberValue(platformSpecific.sales) ?? numberValue(normalized.gmv) ?? report.revenue
      const orders = numberValue(normalized.orders) ?? report.orders
      const viewers = numberValue(normalized.engaged_viewers) ?? numberValue(platformSpecific.total_viewers) ?? numberValue(normalized.total_views) ?? report.viewers ?? report.average_viewer
      const duration = numberValue(normalized.live_duration_seconds)
      await reportService.confirmMetrics(report.id, {
        revenue,
        gmv: numberValue(normalized.gmv) ?? revenue,
        orders,
        viewers,
        peak_viewer: numberValue(normalized.peak_concurrent_viewers) ?? numberValue(platformSpecific.pcu) ?? report.peak_viewer,
        average_viewer: viewers,
        likes: numberValue(normalized.likes) ?? report.likes,
        comments: numberValue(normalized.comments) ?? report.comments,
        shares: numberValue(normalized.shares) ?? report.shares,
        product_clicks: numberValue(normalized.product_clicks) ?? numberValue(platformSpecific.add_to_cart) ?? report.product_clicks,
        ctr: numberValue(normalized.ctr) ?? report.ctr,
        cvr: numberValue(normalized.conversion_rate) ?? numberValue(platformSpecific.click_to_order_rate) ?? report.cvr,
        average_order_value: numberValue(normalized.average_order_value) ?? numberValue(platformSpecific.average_basket_size) ?? report.average_order_value,
        live_duration_minutes: duration == null ? report.live_duration_minutes : duration / 60,
        normalized_metrics: normalized,
        platform_metrics: platformSpecific,
        review_notes: reviewNotes || undefined,
        ocr_review: reviewData,
        final_recap: normalizeFinalReportRecap(finalRecap),
      }, reviewData, currentUser.id)
      toast({ title: t('confirmed'), description: t('confirmedOnly'), variant: 'success' })
      onUpdated?.()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const saveDraft = async () => {
    if (!currentUser) return
    const normalized = serializeCanonicalMetrics(report.dashboard_platform || 'other', metricValues)
    const platformSpecific = normalized
    setBusy(true)
    try {
      await reportService.update(report.id, {
        revenue: numberValue(normalized.revenue) ?? numberValue(platformSpecific.sales) ?? report.revenue,
        orders: numberValue(normalized.orders) ?? report.orders,
        peak_viewer: numberValue(normalized.peak_concurrent_viewers) ?? numberValue(platformSpecific.pcu) ?? report.peak_viewer,
        average_viewer: numberValue(normalized.engaged_viewers) ?? numberValue(platformSpecific.total_viewers) ?? report.average_viewer,
        normalized_metrics: normalized,
        platform_metrics: platformSpecific,
        status: report.status === 'reopened' ? 'reopened' : 'draft',
        metrics_confirmed: false,
        review_notes: reviewNotes || undefined,
        ocr_review: reviewData,
        final_recap: normalizeFinalReportRecap(finalRecap),
      }, currentUser.id, reviewNotes || 'Saved report draft revision')
      toast({ title: t('saveDraftRevision'), variant: 'success' })
      onUpdated?.()
    } finally {
      setBusy(false)
    }
  }

  const rejectReport = async () => {
    if (!currentUser || !hasPermission(currentUser, 'reports.review')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    if (!reviewNotes.trim()) {
      toast({ title: t('validationError'), description: t('reviewNotesRequired'), variant: 'destructive' })
      return
    }
    setBusy(true)
    await reportService.rejectReview(report.id, currentUser.id, reviewNotes)
    setBusy(false)
    onUpdated?.()
  }

  const exportDetail = () => exportReportDetailToExcel(report, {
    shifts: [shift],
    campaigns,
    users,
    registrations,
    brands: new Map(brands.map(brand => [brand.id, brand.name])),
    platforms: new Map(platforms.map(platform => [platform.id, platform.name])),
  })

  const rerunOcr = async () => {
    const platform = report.dashboard_platform || 'other'
    if (platform === 'other') {
      toast({ title: t('dashboardPlatformRequired'), description: t('dashboardPlatformRequiredHelp'), variant: 'destructive' })
      return
    }
    setReviewData({ status: 'processing', source_platform: platform, metrics: {} })
    try {
      const next = await ocrService.extractDashboardMetrics(
        platform,
        report.raw_ocr_output,
        dashboardImage?.image_url,
        reviewData.crop_box || defaultOcrCrop(platform),
      )
      if (currentUser) await reportService.recordOcrRun(report.id, currentUser.id, next, true)
      setReviewData(next)
      setMetricValues(current => ({ ...current, ...reviewInputValues(next) }))
      setEditingMetrics(false)
    } catch (error) {
      setReviewData({ status: 'failed', source_platform: platform, metrics: {}, error_message: t('ocrFailedHelp') })
      toast({ title: t('ocrFailed'), description: t('ocrFailedHelp'), variant: 'destructive' })
    }
  }

  const resetExtracted = async () => {
    if (!currentUser) return
    try {
      await reportService.resetOcr(report.id, currentUser.id, reviewNotes || 'Reset OCR extraction for review')
      toast({ title: t('resetResults'), variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      return
    }
    setMetricValues(reportMetricValues)
    setReviewData(report.ocr_review || { status: 'review_required', metrics: {} })
    setEditingMetrics(false)
  }

  const removeImageImpact: DeletionImpact | null = removeImageTarget ? {
    entity_type: 'report_image',
    entity_id: removeImageTarget.id,
    entity_name: removeImageTarget.original_name || removeImageTarget.image_type,
    action: 'delete',
    consequence: t('removeEvidenceConsequence'),
    reversible: false,
    related_records: [{ entity_type: 'report', entity_id: report.id, entity_name: `Report ${report.id}` }],
  } : null

  const removeImage = async (reason: string) => {
    if (!currentUser || !removeImageTarget) return
    try {
      await reportImageService.remove(removeImageTarget.id, currentUser.id, reason)
      setImages(current => current.filter(image => image.id !== removeImageTarget.id))
      toast({ title: t('imageRemoved'), variant: 'success' })
      setRemoveImageTarget(null)
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  const reopenImpact: DeletionImpact = {
    entity_type: 'report',
    entity_id: report.id,
    entity_name: `${t('finalReport')} · ${shift.title || shift.date}`,
    action: 'reopen',
    consequence: t('reopenReportConsequence'),
    reversible: true,
    related_records: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }],
  }

  const reopenReport = async (reason: string) => {
    if (!currentUser) return
    await reportService.reopen(report.id, currentUser.id, reason)
    toast({ title: t('reportReopened'), description: t('reportReopenedHelp'), variant: 'success' })
    setShowReopen(false)
    onUpdated?.()
  }

  const uploadImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser) return
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    try {
      const created = await Promise.all(files.map(file => reportImageService.create({
        report_id: report.id,
        image_url: URL.createObjectURL(file),
        image_type: 'dashboard',
        original_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: currentUser.id,
      })))
      setImages(current => [...current, ...created])
      toast({ title: t('evidenceUploaded'), description: t('evidenceUploadedHelp', { count: created.length }), variant: 'success' })
    } catch (error) {
      toast({ title: t('uploadFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally {
      event.target.value = ''
    }
  }

  const addLiveImages = async (incoming: LiveReportImage[]) => {
    if (!currentUser) return
    try {
      await Promise.all(incoming.map(image => liveReportImageService.create({
        report_id: report.id,
        category: image.category,
        title: image.title,
        description: image.description,
        captured_at: image.captured_at,
        file_url: image.file_url,
        thumbnail_url: image.thumbnail_url,
        file_name: image.file_name,
        mime_type: image.mime_type,
        size_bytes: image.size_bytes,
        sort_order: image.sort_order,
        is_cover: image.is_cover,
        uploaded_by: currentUser.id,
      }, currentUser.id)))
      setLiveImages(await liveReportImageService.getByReport(report.id))
      toast({ title: t('evidenceUploaded'), description: t('evidenceUploadedHelp', { count: incoming.length }), variant: 'success' })
    } catch (error) {
      toast({ title: t('uploadFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  const updateLiveImage = async (
    image: LiveReportImage,
    patch: Pick<LiveReportImage, 'category' | 'title' | 'description' | 'captured_at'>,
  ) => {
    if (!currentUser) return
    try {
      await liveReportImageService.updateMetadata(image.id, patch, currentUser.id)
      setLiveImages(await liveReportImageService.getByReport(report.id))
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  const deleteLiveImage = async (image: LiveReportImage) => {
    if (!currentUser) return
    try {
      setLiveImages(await liveReportImageService.remove(image.id, currentUser.id))
      toast({ title: t('imageRemoved'), variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  const reorderLiveImage = async (image: LiveReportImage, direction: -1 | 1) => {
    if (!currentUser) return
    try {
      const next = moveLiveReportImage(liveImages, image.id, direction)
      setLiveImages(await liveReportImageService.reorder(report.id, next.map(candidate => candidate.id), currentUser.id))
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  const setLiveImageCover = async (image: LiveReportImage) => {
    if (!currentUser) return
    try {
      setLiveImages(await liveReportImageService.setCover(image.id, currentUser.id))
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  const metricKeys = [...platformCanonicalMetricKeys(report.dashboard_platform || 'other')]
  const unresolvedCount = reviewRequiredCount(reviewData)
  const filteredMetricKeys = metricKeys.filter(key =>
    metricMatchesFilter(metricFilter, metricValues[key], reviewData.metrics[key]),
  )
  const revisions = [...(report.revisions || [])].reverse()
  const visibleRevisions = revisions.slice((revisionPage - 1) * revisionPageSize, revisionPage * revisionPageSize)
  const currentUserAssigned = Boolean(currentUser && (
    shift.host_id === currentUser.id ||
    shift.support_id === currentUser.id ||
    shift.technical_id === currentUser.id ||
    registrations.some(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === currentUser.id &&
      (registration.status === 'approved' || registration.status === 'manually_assigned')
    )
  ))
  const canEditFinalRecap = Boolean(
    currentUser &&
    !report.metrics_confirmed &&
    (hasPermission(currentUser, 'reports.review') || report.submitted_by === currentUser.id || currentUserAssigned),
  )
  const liveImagePermissions = resolveLiveReportImagePermissions({
    reportConfirmed: report.metrics_confirmed || report.status === 'confirmed',
    isSubmitter: Boolean(currentUser && report.submitted_by === currentUser.id),
    canReview: Boolean(currentUser && hasPermission(currentUser, 'reports.review')),
  })

  const setMetric = (key: CanonicalMetricKey, value: string) => {
    setMetricValues(current => ({ ...current, [key]: parseMetricInputValue(value) }))
    setReviewData(current => markMetricManual(current, key, value, currentUser?.id || 'unknown'))
  }

  const confirmMetric = (key: CanonicalMetricKey) => {
    if (!currentUser) return
    setReviewData(current => confirmReviewMetric(current, key, metricValues[key] ?? null, currentUser.id))
  }

  const resetMetric = (key: CanonicalMetricKey) => {
    setReviewData(current => {
      const next = resetMetricToOcr(current, key)
      setMetricValues(values => ({ ...values, [key]: reviewInputValues(next)[key] ?? null }))
      return next
    })
  }

  const clearMetric = (key: CanonicalMetricKey) => {
    if (!currentUser) return
    setMetricValues(current => ({ ...current, [key]: null }))
    setReviewData(current => clearReviewMetric(current, key, currentUser.id))
  }

  const confirmAllMetrics = () => {
    if (!currentUser) return
    setReviewData(current => confirmAllReviewMetrics(current, metricValues, currentUser.id))
  }

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="h-[calc(100vh-1rem)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden sm:h-[92vh]">
        <DialogHeader>
          <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)} - {t('finalReport')}</DialogTitle>
              <div className="text-sm text-gray-600 mt-1">
                {format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} · {formatShiftTimeRange(shift)}
              </div>
            </div>
            <Badge variant="outline">{shift.status}</Badge>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge className={report.metrics_confirmed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>{report.status === 'reopened' ? t('reopened') : report.metrics_confirmed ? t('confirmed') : t('needsReview')}</Badge>
          <div className="flex flex-wrap gap-2">{report.metrics_confirmed && currentUser && hasPermission(currentUser, 'reports.review') && <Button variant="outline" size="sm" onClick={() => setShowReopen(true)}><LockOpen className="mr-2 h-4 w-4" />{t('reopenReport')}</Button>}{currentUser && hasPermission(currentUser, 'reports.export') && <Button variant="outline" size="sm" onClick={exportDetail}><Download className="mr-2 h-4 w-4" />{t('exportReportDetail')}</Button>}</div>
        </div>

        <DialogBody className="space-y-4 pb-1">
        {!report.metrics_confirmed && currentUser && hasPermission(currentUser, 'reports.review') && (
          <Card className="border-amber-200">
            <CardContent className="space-y-4 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{t('reportOcrReview')}</h3><Badge variant="outline">{reviewData.status === 'review_required' ? t('statusReviewRequired') : reviewData.status === 'confirmed' ? t('statusConfirmed') : reviewData.status === 'failed' ? t('error') : reviewData.status === 'processing' ? t('loading') : reviewData.status === 'unavailable' ? t('manualInput') : t('pending')}</Badge></div><p className="text-sm text-muted-foreground">{t('ocrReviewHelp')}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void resetExtracted()}><RotateCcw className="mr-2 h-4 w-4" />{t('resetResults')}</Button><Button type="button" variant="outline" onClick={() => setEditingMetrics(value => !value)}><Pencil className="mr-2 h-4 w-4" />{editingMetrics ? t('finishEditing') : t('editOcrMetrics')}</Button><Button type="button" variant="outline" disabled={reviewData.status === 'processing'} onClick={() => void rerunOcr()}><ScanText className="mr-2 h-4 w-4" />{t('rescanOcr')}</Button></div></div>
              {dashboardImage && <><OcrCropPreview imageUrl={dashboardImage.image_url} platform={report.dashboard_platform || 'other'} value={reviewData.crop_box || defaultOcrCrop(report.dashboard_platform || 'other')} onChange={() => undefined} review={reviewData} disabled />{reviewData.raw_output && <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-xs">{reviewData.raw_output}</pre>}{reviewData.raw_diagnostic_output && <details className="rounded-lg bg-muted/50 p-3 text-xs"><summary className="cursor-pointer font-medium">{t('rawOcrOutput')}</summary><pre className="mt-2 whitespace-pre-wrap break-words">{reviewData.raw_diagnostic_output}</pre></details>}</>}
              {unresolvedCount > 0 && <p className="flex items-center gap-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" />{t('reportReviewWarning', { count: unresolvedCount })}</p>}
              <OcrMetricFilterBar value={metricFilter} onChange={setMetricFilter} reviewCount={unresolvedCount} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {filteredMetricKeys.map(field => <OcrMetricReviewField
                  key={field}
                  metricKey={field}
                  metric={reviewData.metrics[field]}
                  value={metricValueToInput(metricValues[field])}
                  editable={editingMetrics}
                  canReview
                  onChange={value => setMetric(field, value)}
                  onEdit={() => setEditingMetrics(true)}
                  onConfirm={() => confirmMetric(field)}
                  onReset={() => resetMetric(field)}
                  onClear={() => clearMetric(field)}
                />)}
              </div>
              {reviewData.unmapped_fields && reviewData.unmapped_fields.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><h4 className="font-semibold text-amber-900">{t('rejectedUnmappedOcrFields')}</h4>{reviewData.unmapped_fields.map((field, index) => <div className="mt-2 text-sm text-amber-900" key={`${field.original_label}-${index}`}><p>{t('originalLabel')}: {field.original_label} · {t('originalValue')}: {field.original_value || '—'}</p><p className="text-xs">{t('source')}: {field.source || t('unknownSource')}{field.rejection_reason ? ` · ${t('unmappedMetricHelp')}` : ''}</p></div>)}</div>}
              {reviewData.status === 'unavailable' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('ocrUnavailableHelp')}</p>}
              <label className="text-xs font-medium">{t('reviewNotes')}<Textarea className="mt-1" value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} /></label>
              <div className="flex flex-wrap justify-end gap-2">{unresolvedCount > 0 && <Button variant="outline" onClick={confirmAllMetrics}><Check className="mr-2 h-4 w-4" />{t('confirmAllReviewed')}</Button>}<Button variant="outline" disabled={busy} onClick={() => void saveDraft()}><Pencil className="mr-2 h-4 w-4" />{t('saveDraftRevision')}</Button><Button variant="outline" disabled={busy} onClick={() => void rejectReport()}><X className="mr-2 h-4 w-4" />{t('rejectReport')}</Button><Button disabled={busy || reviewData.status === 'processing' || reviewData.status === 'failed'} onClick={() => void confirmReport()}><Check className="mr-2 h-4 w-4" />{t('confirmMetrics')}</Button></div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="min-w-0">
          <div className="sticky top-0 z-20 bg-popover pb-3">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="overview">{t('reportOverview')}</TabsTrigger>
            <TabsTrigger value="insights">{t('reportInsights')}</TabsTrigger>
            <TabsTrigger value="details">{t('reportDetails')}</TabsTrigger>
            <TabsTrigger value="images">{t('reportImages')}</TabsTrigger>
            <TabsTrigger value="versions">{t('reportVersions')}</TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('totalRevenue')}</div>
                      <div className="text-2xl font-bold text-green-600">{formatCurrency(report.revenue)}</div>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('metricOrders')}</div>
                      <div className="text-2xl font-bold">{report.orders}</div>
                    </div>
                    <TrendingUp className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('peakViewers')}</div>
                      <div className="text-2xl font-bold">{report.peak_viewer}</div>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('averageViewers')}</div>
                      <div className="text-2xl font-bold">{report.average_viewer}</div>
                    </div>
                    <Users className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {(report.normalized_metrics || report.platform_metrics) && (
              <Card>
                <CardContent className="pt-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t('platformAwareMetrics')}</h3><Badge variant="outline">{report.dashboard_platform === 'tiktok_shop' ? 'TikTok Shop' : report.dashboard_platform === 'shopee_live' ? 'Shopee Live' : t('otherPlatform')}</Badge></div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {metricKeys.map(key => {
                      const value = report.platform_metrics?.[key] ?? report.normalized_metrics?.[key]
                      if (value == null || value === '') return null
                      return <div className="rounded-lg border p-3" key={key}><p className="text-xs text-muted-foreground">{t(metricTranslationKeys[key])}</p><p className="mt-1 break-words font-semibold">{formatMetricValue(key, value)}</p></div>
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Engagement */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">{t('engagementMetrics')}</h3>
                <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
                  <div className="flex items-center gap-3">
                    <ThumbsUp className="h-6 w-6 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">{t('metricLikes')}</div>
                      <div className="text-xl font-bold">{report.likes?.toLocaleString() ?? '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-6 w-6 text-green-600" />
                    <div>
                      <div className="text-sm text-gray-600">{t('metricComments')}</div>
                      <div className="text-xl font-bold">{report.comments}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Share2 className="h-6 w-6 text-purple-600" />
                    <div>
                      <div className="text-sm text-gray-600">{t('metricShares')}</div>
                      <div className="text-xl font-bold">{report.shares}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Products */}
            {report.top_products && report.top_products.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">{t('topPerformingProducts')}</h3>
                  <div className="w-full overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[420px] text-sm"><thead className="bg-muted/50"><tr><th className="w-16 p-3 text-left">#</th><th className="p-3 text-left">{t('product')}</th></tr></thead><tbody>{report.top_products.map((product, idx) => <tr className="border-t" key={idx}><td className="p-3"><span className="inline-flex items-center gap-1 font-medium text-yellow-700"><Star className="h-4 w-4" />{idx + 1}</span></td><td className="p-3 font-medium">{product}</td></tr>)}</tbody></table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Links */}
            <div className="grid gap-4 md:grid-cols-2">
              {report.replay_url && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">{t('replayLink')}</div>
                        <div className="font-mono text-sm text-blue-600 truncate">{report.replay_url}</div>
                      </div>
                      <Button size="sm" onClick={() => window.open(report.replay_url, '_blank')}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {report.dashboard_url && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">{t('dashboardLink')}</div>
                        <div className="font-mono text-sm text-blue-600 truncate">{report.dashboard_url}</div>
                      </div>
                      <Button size="sm" onClick={() => window.open(report.dashboard_url, '_blank')}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-green-900 mb-4">{t('whatWentWell')}</h3>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">
                    {report.insights_good || t('noInsightsProvided')}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-orange-900 mb-4">{t('improvementAreas')}</h3>
                  <p className="text-sm text-orange-800 whitespace-pre-wrap">
                    {report.insights_improvement || t('noInsightsProvided')}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <h3 className="font-semibold">{t('endOfLiveRecap')}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t('endOfLiveRecapHelp')}</p>
                </div>
                {canEditFinalRecap
                  ? <div className="grid gap-4 lg:grid-cols-2">
                      {finalReportRecapFields.map(field => (
                        <label className="min-w-0 text-sm font-medium" key={field.key}>
                          {t(field.translationKey)}
                          <Textarea
                            className="mt-1 min-h-28"
                            data-testid={`final-recap-${field.key}`}
                            placeholder={t(field.placeholderKey)}
                            value={finalRecap[field.key] || ''}
                            onChange={event => setFinalRecap(current => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))}
                          />
                        </label>
                      ))}
                    </div>
                  : <FinalReportRecapReadOnly recap={report.final_recap} />}
                {canEditFinalRecap && (
                  <div className="flex justify-end">
                    <Button disabled={busy} onClick={() => void saveDraft()}>
                      <Pencil className="mr-2 h-4 w-4" />{t('saveRecap')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">{t('sessionDetails')}</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('brand')}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBrandColor(shift.brand_id) }}></div>
                      <div className="font-medium">{getBrandName(shift.brand_id)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('platform')}</div>
                    <div className="font-medium">{getPlatformName(shift.platform_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('date')}</div>
                    <div className="font-medium">{format(new Date(shift.date), 'MMMM d, yyyy')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('time')}</div>
                    <div className="font-medium">{formatShiftTimeRange(shift)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('host')}</div>
                    <div className="font-medium">{getUserName(shift.host_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('support')}</div>
                    <div className="font-medium">{getUserName(shift.support_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('technical')}</div>
                    <div className="font-medium">{getUserName(shift.technical_id)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">{t('reportMetadata')}</h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('submittedOn')}</div>
                    <div className="font-medium">{format(new Date(report.created_at), 'dd/MM/yyyy HH:mm')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">{t('reportId')}</div>
                    <div className="font-mono text-sm">{report.id}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="images" className="space-y-4">
            {liveImagePermissions.canEdit && (
              <LiveReportImageEditor
                images={liveImages}
                uploadedBy={currentUser?.id}
                editable
                canDelete={liveImagePermissions.canDelete}
                canReorderAndSetCover={liveImagePermissions.canReorderAndSetCover}
                onAdd={addLiveImages}
                onUpdate={updateLiveImage}
                onDelete={deleteLiveImage}
                onMove={reorderLiveImage}
                onSetCover={setLiveImageCover}
              />
            )}
            <LiveReportImageGallery images={liveImages} />

            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{t('uploadDashboardEvidence')}</p>
                    <p className="text-xs text-muted-foreground">{t('dashboardEvidenceHelp')}</p>
                  </div>
                  {liveImagePermissions.canEdit && (
                    <>
                      <Button onClick={() => uploadInputRef.current?.click()}>
                        <Upload className="mr-2 h-4 w-4" />{t('uploadDashboard')}
                      </Button>
                      <input
                        ref={uploadInputRef}
                        className="sr-only"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        multiple
                        onChange={uploadImages}
                      />
                    </>
                  )}
                </div>
                {images.filter(image => image.image_type === 'dashboard').length === 0
                  ? <p className="text-sm text-gray-500">{t('noEvidenceImages')}</p>
                  : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {images.filter(image => image.image_type === 'dashboard').map(image => (
                        <div className="space-y-2 rounded-lg border p-2" key={image.id}>
                          <img
                            src={image.image_url}
                            alt={image.original_name || image.image_type}
                            className="aspect-video w-full rounded-md object-cover"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate text-xs">{image.original_name || image.image_type}</p>
                            {liveImagePermissions.canEdit && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t('removeUploadedReportImage')}
                                title={t('removeUploadedReportImage')}
                                onClick={() => setRemoveImageTarget(image)}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="versions" className="space-y-3">
            <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[55vh] space-y-3 overflow-auto p-6"><h3 className="mb-4 flex items-center gap-2 font-semibold"><History className="h-4 w-4" />{t('reportVersionHistory')}</h3>{visibleRevisions.map(revision => <div className="rounded-lg border p-3" key={revision.version}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{t('version')} {revision.version} · {revision.event.replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{format(new Date(revision.created_at), 'dd/MM/yyyy HH:mm')} · {getUserName(revision.created_by)}</p></div><Badge variant="outline">{revision.status}</Badge></div>{revision.reason && <p className="mt-2 text-sm">{revision.reason}</p>}<div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div>{t('metricRevenue')}: {formatCurrency(revision.metrics.revenue)}</div><div>{t('metricOrders')}: {revision.metrics.orders}</div><div>{t('peak')}: {revision.metrics.peak_viewer}</div><div>{t('reportImages')}: {revision.image_references.length}</div></div></div>)}{!revisions.length && <p className="text-sm text-muted-foreground">{t('noRevisionSnapshots')}</p>}</div><HistoryPagination page={revisionPage} pageSize={revisionPageSize} total={revisions.length} onPageChange={setRevisionPage} onPageSizeChange={size => { setRevisionPageSize(size); setRevisionPage(1) }} /></CardContent></Card>
          </TabsContent>
        </Tabs>
        </DialogBody>
      </DialogContent>
    </Dialog>
    <LifecycleActionDialog open={Boolean(removeImageTarget)} onOpenChange={open => !open && setRemoveImageTarget(null)} title={t('removeUploadedReportImage')} impact={removeImageImpact} confirmText={t('removeImage')} onConfirm={removeImage} />
    <LifecycleActionDialog open={showReopen} onOpenChange={setShowReopen} title={t('reopenReport')} impact={reopenImpact} confirmText={t('reopenReport')} variant="default" onConfirm={reopenReport} />
    <AlertDialog
      open={showConfirmWarning}
      onOpenChange={setShowConfirmWarning}
      title={t('reportReviewWarning', { count: unresolvedCount })}
      description={t('cannotConfirmReviewMetrics')}
      cancelText={t('cancel')}
      confirmText={t('backToReview')}
      onConfirm={() => setMetricFilter('review_required')}
    />
  </>)
}

function initialMetricValues(report: Report): MetricState {
  const extractedValues = report.ocr_review ? reviewInputValues(report.ocr_review) : {}
  const legacy = report.dashboard_platform === 'shopee_live'
    ? {
        sales: report.revenue,
        orders: report.orders,
        total_viewers: report.viewers ?? report.average_viewer,
        pcu: report.peak_viewer,
        add_to_cart: report.product_clicks,
        ctr: report.ctr,
        click_to_order_rate: report.cvr,
        average_basket_size: report.average_order_value,
        live_duration_seconds: report.live_duration_minutes == null ? null : report.live_duration_minutes * 60,
        likes: report.likes,
        comments: report.comments,
        shares: report.shares,
      }
    : {
        gmv: report.gmv ?? report.revenue,
        sku_orders: report.orders,
        current_viewers: report.peak_viewer,
        total_views: report.viewers ?? report.average_viewer,
        product_clicks: report.product_clicks,
        live_ctr: report.ctr,
        ctor: report.cvr,
        average_order_value: report.average_order_value,
        comments: report.comments,
        shares: report.shares,
      }
  const normalized = {
    ...legacy,
    ...report.normalized_metrics,
    ...report.platform_metrics,
    ...extractedValues,
  }
  return Object.fromEntries(
    Object.entries(normalized).flatMap(([key, value]) =>
      isCanonicalMetricKey(key) && typeof value === 'number' && Number.isFinite(value)
        ? [[key, value]]
        : [],
    ),
  )
}

const numberValue = (value: NormalizedReportMetrics[ReportMetricKey]) => numericMetric(value)

function formatMetricValue(key: ReportMetricKey, value: string | number) {
  if (typeof value === 'string') return value
  if (['revenue', 'gmv', 'average_order_value', 'gmv_per_hour', 'gpm', 'advertising_cost', 'sales', 'average_basket_size'].includes(key)) return formatCurrency(value)
  if (['ctr', 'conversion_rate', 'click_rate', 'live_ctr', 'ctor', 'comment_rate', 'click_to_order_rate'].includes(key)) return `${value.toLocaleString()}%`
  if (key === 'average_view_duration_seconds' || key === 'live_duration_seconds') return `${value.toLocaleString()} s`
  return value.toLocaleString()
}
