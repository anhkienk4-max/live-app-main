'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Check, Loader2, Pencil, RotateCcw, ScanText, Upload, X } from 'lucide-react'
import { ocrService, reportImageService, reportService } from '@/lib/services/dataService'
import {
  Brand,
  Campaign,
  FinalReportRecap,
  NormalizedReportMetrics,
  OcrCropBox,
  OcrReviewData,
  Platform,
  ReportDashboardPlatform,
  ReportImageCategory,
  ReportMetricKey,
  Shift,
  ShiftRegistration,
  User,
} from '@/lib/types/database.types'
import { commonReportMetricKeys, numericMetric, parseOcrValue, platformMetricKeys } from '@/lib/utils/ocrMetrics'
import {
  clearReviewMetric,
  confirmAllReviewMetrics,
  confirmReviewMetric,
  markMetricManual,
  mergeMetricValues,
  metricMatchesFilter,
  resetMetricToOcr,
  reviewInputValues,
  reviewRequiredCount,
  type OcrMetricFilter,
} from '@/lib/utils/ocrReview'
import { metricTranslationKeys } from '@/lib/reportMetricLabels'
import { defaultOcrCrop } from '@/lib/utils/ocrImage'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { OcrCropPreview } from '@/components/features/reports/OcrCropPreview'
import { OcrMetricFilterBar, OcrMetricReviewField } from '@/components/features/reports/OcrMetricReviewField'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  emptyFinalReportRecap,
  finalReportRecapFields,
  normalizeFinalReportRecap,
} from '@/lib/utils/finalReportRecap'

const imageCategories: ReportImageCategory[] = ['dashboard', 'livestream', 'host', 'support', 'technical', 'voucher', 'product', 'other']
const emptyReview = (): OcrReviewData => ({ status: 'waiting', metrics: {} })
type PendingImage = { url: string; name: string; type: ReportImageCategory; mime: string; size: number }

export function ReportFormModal({
  open,
  onOpenChange,
  completedShifts,
  brands,
  platforms,
  campaigns,
  users,
  registrations,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  completedShifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  onSuccess: () => void
}) {
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [shiftId, setShiftId] = React.useState('')
  const [dashboardPlatform, setDashboardPlatform] = React.useState<ReportDashboardPlatform>('other')
  const [cropBox, setCropBox] = React.useState<OcrCropBox>(defaultOcrCrop('other'))
  const [metrics, setMetrics] = React.useState<Partial<Record<ReportMetricKey, string>>>({})
  const [review, setReview] = React.useState<OcrReviewData>(emptyReview)
  const [ocrAcknowledged, setOcrAcknowledged] = React.useState(false)
  const [editingMetrics, setEditingMetrics] = React.useState(false)
  const [images, setImages] = React.useState<PendingImage[]>([])
  const [category, setCategory] = React.useState<ReportImageCategory>('dashboard')
  const [replayUrl, setReplayUrl] = React.useState('')
  const [dashboardUrl, setDashboardUrl] = React.useState('')
  const [insightsGood, setInsightsGood] = React.useState('')
  const [insightsImprovement, setInsightsImprovement] = React.useState('')
  const [finalRecap, setFinalRecap] = React.useState<FinalReportRecap>(emptyFinalReportRecap)
  const [reviewing, setReviewing] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [rawOcrText, setRawOcrText] = React.useState('')
  const [metricFilter, setMetricFilter] = React.useState<OcrMetricFilter>('data')
  const [showReviewWarning, setShowReviewWarning] = React.useState(false)

  const selectedShift = completedShifts.find(shift => shift.id === shiftId)

  React.useEffect(() => {
    if (!open) return
    const initialShift = completedShifts[0]
    const initialPlatform = inferDashboardPlatform(initialShift, platforms)
    setShiftId(initialShift?.id || '')
    setDashboardPlatform(initialPlatform)
    setCropBox(defaultOcrCrop(initialPlatform))
    setMetrics({})
    setReview(emptyReview())
    setOcrAcknowledged(false)
    setEditingMetrics(false)
    setImages([])
    setReplayUrl('')
    setDashboardUrl('')
    setInsightsGood('')
    setInsightsImprovement('')
    setFinalRecap(emptyFinalReportRecap())
    setRawOcrText('')
    setMetricFilter('data')
    setShowReviewWarning(false)
  // Opening the modal initializes a fresh draft. Prop-array identity changes
  // while it is open must not erase OCR candidates or autofilled metrics.
  }, [open])

  const changeShift = (value: string) => {
    const nextShift = completedShifts.find(shift => shift.id === value)
    const nextPlatform = inferDashboardPlatform(nextShift, platforms)
    setShiftId(value)
    setDashboardPlatform(nextPlatform)
    setCropBox(defaultOcrCrop(nextPlatform))
    resetExtracted()
  }

  const resetExtracted = () => {
    setMetrics({})
    setReview(emptyReview())
    setOcrAcknowledged(false)
    setEditingMetrics(false)
  }

  const runOcrReview = async () => {
    if (dashboardPlatform === 'other') {
      toast({ title: t('dashboardPlatformRequired'), description: t('dashboardPlatformRequiredHelp'), variant: 'destructive' })
      return
    }
    if (!images.some(image => image.type === 'dashboard')) {
      toast({ title: t('dashboardImageRequired'), description: t('dashboardImageRequiredHelp'), variant: 'destructive' })
      return
    }
    setReviewing(true)
    setOcrAcknowledged(false)
    setEditingMetrics(false)
    setReview({ status: 'processing', source_platform: dashboardPlatform, metrics: {} })
    try {
      const dashboardImage = images.find(image => image.type === 'dashboard')
      const candidate = await ocrService.extractDashboardMetrics(
        dashboardPlatform,
        rawOcrText || undefined,
        dashboardImage?.url,
        cropBox,
      )
      const incomingMetricValues = reviewInputValues(candidate)
      setReview(candidate)
      if (candidate.raw_output?.trim()) {
        setRawOcrText(current => current.trim() ? current : candidate.raw_output || '')
      }
      setMetrics(current => {
        const merged = mergeMetricValues(current, incomingMetricValues)
        if (
          process.env.NODE_ENV !== 'production'
          || process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
        ) {
          console.debug('[OCR pipeline:form merge]', {
            platform: dashboardPlatform,
            candidateCount: Object.keys(candidate.metrics).length,
            beforeMerge: incomingMetricValues,
            afterMerge: merged,
            renderedMetricKeys: [...commonReportMetricKeys, ...platformMetricKeys[dashboardPlatform]],
          })
        }
        return merged
      })
      setEditingMetrics(true)
      toast({
        title: candidate.status === 'unavailable' ? t('dashboardImageRequired') : t('metricReviewRequired'),
        description: candidate.status === 'unavailable' ? t('ocrUnavailableHelp') : t('ocrReviewHelp'),
        variant: candidate.status === 'unavailable' ? 'destructive' : 'success',
      })
    } catch (error) {
      setReview({ status: 'failed', source_platform: dashboardPlatform, metrics: {}, error_message: error instanceof Error ? error.message : t('ocrFailed') })
    } finally {
      setReviewing(false)
    }
  }

  const setMetric = (key: ReportMetricKey, value: string) => {
    setMetrics(current => ({ ...current, [key]: value }))
    setOcrAcknowledged(false)
    setReview(current => markMetricManual(current, key, value, currentUser?.id || 'unknown'))
  }

  const confirmMetric = (key: ReportMetricKey) => {
    if (!currentUser) return
    setReview(current => confirmReviewMetric(current, key, metrics[key] || '', currentUser.id))
  }

  const resetMetric = (key: ReportMetricKey) => {
    setReview(current => {
      const next = resetMetricToOcr(current, key)
      setMetrics(values => ({ ...values, [key]: reviewInputValues(next)[key] || '' }))
      return next
    })
    setOcrAcknowledged(false)
  }

  const clearMetric = (key: ReportMetricKey) => {
    if (!currentUser) return
    setMetrics(current => ({ ...current, [key]: '' }))
    setReview(current => clearReviewMetric(current, key, currentUser.id))
    setOcrAcknowledged(false)
  }

  const confirmAllMetrics = () => {
    if (!currentUser) return
    setReview(current => confirmAllReviewMetrics(current, metrics, currentUser.id))
    setOcrAcknowledged(true)
  }

  const mapUnmappedField = (index: number, key: ReportMetricKey) => {
    const field = review.unmapped_fields?.[index]
    if (!field) return
    const parsed = parseOcrValue(field.original_value)
    setMetrics(current => ({ ...current, [key]: parsed == null ? '' : String(parsed) }))
    setReview(current => ({
      ...current,
      metrics: {
        ...current.metrics,
        [key]: {
          value: parsed,
          confidence: field.confidence,
          needs_review: true,
          original_label: field.original_label,
          raw_value: field.original_value,
          normalized_key: key,
          source: 'manual',
          status: 'review_required',
        },
      },
      unmapped_fields: current.unmapped_fields?.filter((_, fieldIndex) => fieldIndex !== index),
    }))
    setOcrAcknowledged(false)
  }

  const addImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length) {
      setImages(current => [...current, ...files.map(file => ({
        url: URL.createObjectURL(file), name: file.name, type: category, mime: file.type, size: file.size,
      }))])
    }
    event.target.value = ''
  }

  const removeImage = (image: PendingImage) => {
    URL.revokeObjectURL(image.url)
    setImages(current => current.filter(candidate => candidate !== image))
  }

  const validateSubmission = () => {
    if (!currentUser || !hasPermission(currentUser, 'reports.submit')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return false
    }
    if (!selectedShift) {
      toast({ title: t('validationError'), description: t('chooseLiveOrCompletedShift'), variant: 'destructive' })
      return false
    }
    if (!images.some(image => image.type === 'dashboard')) {
      toast({ title: t('validationError'), description: t('dashboardImageRequiredHelp'), variant: 'destructive' })
      return false
    }
    if (!['review_required', 'unavailable'].includes(review.status)) {
      toast({ title: t('metricReviewRequired'), description: t('metricReviewRequiredHelp'), variant: 'destructive' })
      return false
    }
    return true
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!validateSubmission()) return
    if (reviewRequiredCount(review) > 0) {
      setShowReviewWarning(true)
      return
    }
    void persistDraft()
  }

  const persistDraft = async () => {
    if (!currentUser || !selectedShift) return
    const normalized = buildMetrics(commonReportMetricKeys, metrics)
    const platformSpecific = buildMetrics(platformMetricKeys[dashboardPlatform], metrics)
    const revenue = numberFrom(normalized.revenue) ?? numberFrom(platformSpecific.sales) ?? numberFrom(normalized.gmv) ?? 0
    const orders = numberFrom(normalized.orders) ?? 0
    const viewers = numberFrom(normalized.engaged_viewers) ?? numberFrom(platformSpecific.total_viewers) ?? numberFrom(normalized.total_views) ?? 0
    const durationSeconds = numberFrom(normalized.live_duration_seconds)

    setSubmitting(true)
    try {
      const report = await reportService.create({
        shift_id: selectedShift.id,
        revenue,
        orders,
        peak_viewer: numberFrom(normalized.peak_concurrent_viewers) ?? numberFrom(platformSpecific.pcu) ?? 0,
        average_viewer: viewers,
        viewers,
        likes: numberFrom(normalized.likes) ?? 0,
        comments: numberFrom(normalized.comments) ?? 0,
        shares: numberFrom(normalized.shares) ?? 0,
        gmv: numberFrom(normalized.gmv) ?? revenue,
        product_clicks: numberFrom(normalized.product_clicks) ?? numberFrom(platformSpecific.add_to_cart) ?? 0,
        ctr: numberFrom(normalized.ctr) ?? 0,
        cvr: numberFrom(normalized.conversion_rate) ?? numberFrom(platformSpecific.click_to_order_rate) ?? 0,
        average_order_value: numberFrom(normalized.average_order_value) ?? numberFrom(platformSpecific.average_basket_size) ?? 0,
        live_duration_minutes: durationSeconds == null ? 0 : durationSeconds / 60,
        dashboard_platform: dashboardPlatform,
        normalized_metrics: normalized,
        platform_metrics: platformSpecific,
        raw_ocr_output: review.raw_output,
        ocr_review: review,
        insights_good: insightsGood || undefined,
        insights_improvement: insightsImprovement || undefined,
        final_recap: normalizeFinalReportRecap(finalRecap),
        replay_url: replayUrl || undefined,
        dashboard_url: dashboardUrl || undefined,
        metrics_confirmed: false,
        status: 'draft',
        submitted_by: currentUser.id,
      })
      await Promise.all(images.map(image => reportImageService.create({
        report_id: report.id,
        image_url: image.url,
        image_type: image.type,
        original_name: image.name,
        mime_type: image.mime,
        size_bytes: image.size,
      })))
      toast({ title: t('submitted'), description: t('finalReportSavedHelp'), variant: 'success' })
      onSuccess()
    } catch (error) {
      toast({ title: t('saveFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const grouped = images.reduce<Record<string, PendingImage[]>>((result, image) => {
    ;(result[image.type] ??= []).push(image)
    return result
  }, {})
  const visibleMetricKeys = [...commonReportMetricKeys, ...platformMetricKeys[dashboardPlatform]]
  const lowConfidence = reviewRequiredCount(review)
  const filteredMetricKeys = visibleMetricKeys.filter(key =>
    metricMatchesFilter(metricFilter, metrics[key] || '', review.metrics[key]),
  )
  const dashboardImage = images.find(image => image.type === 'dashboard')
  const inferredPlatform = inferDashboardPlatform(selectedShift, platforms)

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="h-[calc(100vh-1rem)] overflow-y-auto sm:h-[92vh]">
        <DialogHeader>
          <DialogTitle>{t('createFinalReport')}</DialogTitle>
          <DialogDescription>{t('createFinalReportDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium">{t('liveOrCompletedShift')} *<Select value={shiftId} onValueChange={changeShift}><SelectTrigger className="mt-1 w-full"><SelectValue placeholder={t('chooseLiveOrCompletedShift')} /></SelectTrigger><SelectContent>{completedShifts.map(shift => <SelectItem key={shift.id} value={shift.id}>{entityName(brands, shift.brand_id)} · {entityName(platforms, shift.platform_id)} · {format(new Date(`${shift.date}T00:00:00`), 'dd/MM/yyyy')} {shift.start_time} · {t(shift.status)}</SelectItem>)}</SelectContent></Select></label>
            <label className="text-sm font-medium">{t('platformDashboardType')} *<Select value={dashboardPlatform} disabled={inferredPlatform !== 'other'} onValueChange={value => { const next = value as ReportDashboardPlatform; setDashboardPlatform(next); setCropBox(defaultOcrCrop(next)); resetExtracted() }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tiktok_shop">TikTok Shop</SelectItem><SelectItem value="shopee_live">Shopee Live</SelectItem>{inferredPlatform === 'other' && <SelectItem value="other">{t('selectDashboardPlatform')}</SelectItem>}</SelectContent></Select></label>
          </div>

          {selectedShift && (
            <div className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Entity label={t('brand')} value={entityName(brands, selectedShift.brand_id)} />
              <Entity label={t('platform')} value={entityName(platforms, selectedShift.platform_id)} />
              <Entity label={t('campaign')} value={entityName(campaigns, selectedShift.campaign_id)} />
              <Entity label={t('roles')} value={roleSummary(selectedShift, users, registrations, { host: t('host'), support: t('support'), technical: t('technical') })} />
            </div>
          )}

          <section className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-semibold">{t('uploadDashboardEvidence')}</h3><p className="text-sm text-muted-foreground">{t('dashboardEvidenceHelp')}</p></div>
              <div className="flex flex-wrap gap-2"><Select value={category} onValueChange={value => setCategory(value as ReportImageCategory)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{imageCategories.map(item => <SelectItem key={item} value={item}>{t(item)}</SelectItem>)}</SelectContent></Select><Button type="button" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{t('uploadDashboard')}</Button><input ref={fileInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={addImages} /></div>
            </div>
            {Object.entries(grouped).map(([type, categoryImages]) => <div key={type}><p className="mb-2 text-sm font-medium capitalize">{t(type as ReportImageCategory)} ({categoryImages.length})</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{categoryImages.map(image => <div className="relative min-w-0" key={image.url}><img src={image.url} alt={image.name} className="aspect-video w-full rounded border object-cover" /><p className="truncate pt-1 text-xs">{image.name}</p><Button aria-label={`${t('removeImage')} ${image.name}`} type="button" size="icon" variant="destructive" className="absolute -right-2 -top-2 h-6 w-6" onClick={() => removeImage(image)}><X className="h-3 w-3" /></Button></div>)}</div></div>)}
          </section>

          <section className="space-y-4 rounded-lg border border-dashed p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t('ocrReview')}</h3><OcrStatus status={review.status} /></div><p className="mt-1 text-sm text-muted-foreground">{t('ocrReviewHelp')}</p>{review.engine && <p className="mt-1 text-xs text-muted-foreground">{t('engine')}: {review.engine} · {t('recognitionLanguage')}: {review.recognition_language} · {t('overallConfidence')}: {review.overall_confidence?.toFixed(1) ?? '—'}%</p>}</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={resetExtracted} disabled={reviewing}><RotateCcw className="mr-2 h-4 w-4" />{t('resetResults')}</Button>
                {review.status === 'review_required' && <Button type="button" variant="outline" onClick={() => setEditingMetrics(value => !value)}><Pencil className="mr-2 h-4 w-4" />{editingMetrics ? t('finishEditing') : t('editOcrMetrics')}</Button>}
                <Button type="button" onClick={runOcrReview} disabled={reviewing}>{reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}{review.status === 'review_required' ? t('rescanOcr') : t('scanOcr')}</Button>
              </div>
            </div>
            {dashboardImage && <OcrCropPreview imageUrl={dashboardImage.url} platform={dashboardPlatform} value={cropBox} onChange={value => { setCropBox(value); resetExtracted() }} disabled={reviewing} />}
            <label className="block text-sm font-medium">{t('trustedOcrText')} ({t('optional')})
              <Textarea className="mt-1 min-h-32 font-mono text-xs" value={rawOcrText} onChange={event => setRawOcrText(event.target.value)} placeholder={'Sales: 21.281.718,00\nEngaged Viewer: 521\nOrders: 109'} />
            </label>
            {lowConfidence > 0 && <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />{t('lowConfidenceCount', { count: lowConfidence })}</p>}
            {review.status === 'failed' && <p className="text-sm text-red-700">{review.error_message}</p>}
            {(review.status === 'review_required' || review.status === 'unavailable') && <>
              <OcrMetricFilterBar value={metricFilter} onChange={setMetricFilter} reviewCount={lowConfidence} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {filteredMetricKeys.map(key => <OcrMetricReviewField
                  key={key}
                  metricKey={key}
                  metric={review.metrics[key]}
                  value={metrics[key] || ''}
                  editable={editingMetrics}
                  canReview={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
                  onChange={value => setMetric(key, value)}
                  onEdit={() => setEditingMetrics(true)}
                  onConfirm={() => confirmMetric(key)}
                  onReset={() => resetMetric(key)}
                  onClear={() => clearMetric(key)}
                />)}
              </div>
              {review.unmapped_fields && review.unmapped_fields.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><h4 className="font-semibold text-amber-900">{t('rejectedUnmappedOcrFields')}</h4><div className="mt-2 space-y-2">{review.unmapped_fields.map((field, index) => <div className="grid gap-2 rounded border border-amber-200 bg-white p-2 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,.8fr)] sm:items-center" key={`${field.original_label}-${index}`}><div className="text-sm text-amber-900"><p>{t('originalLabel')}: {field.original_label} · {t('originalValue')}: {field.original_value || '—'}</p><p className="text-xs">{t('source')}: {field.source || t('unknownSource')}{field.rejection_reason ? ` · ${t('unmappedMetricHelp')}` : ''}</p></div><Select onValueChange={value => mapUnmappedField(index, value as ReportMetricKey)}><SelectTrigger><SelectValue placeholder={t('mapToNormalizedMetric')} /></SelectTrigger><SelectContent>{visibleMetricKeys.map(key => <SelectItem value={key} key={key}>{t(metricTranslationKeys[key])}</SelectItem>)}</SelectContent></Select></div>)}</div></div>}
              {review.raw_output && <details className="rounded-lg bg-muted/50 p-3 text-sm"><summary className="cursor-pointer font-medium">{t('rawOcrOutput')}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{review.raw_output}</pre></details>}
              <div className="flex justify-end"><Button type="button" variant={ocrAcknowledged ? 'outline' : 'default'} onClick={confirmAllMetrics}><Check className="mr-2 h-4 w-4" />{ocrAcknowledged ? t('metricsReviewedForDraft') : t('confirmAllReviewed')}</Button></div>
            </>}
          </section>

          <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">{t('replayUrl')}<Input className="mt-1" type="url" value={replayUrl} onChange={event => setReplayUrl(event.target.value)} /></label><label className="text-sm font-medium">{t('dashboardUrl')}<Input className="mt-1" type="url" value={dashboardUrl} onChange={event => setDashboardUrl(event.target.value)} /></label><label className="text-sm font-medium">{t('whatWentWell')}<Textarea className="mt-1" value={insightsGood} onChange={event => setInsightsGood(event.target.value)} /></label><label className="text-sm font-medium">{t('improvementAreas')}<Textarea className="mt-1" value={insightsImprovement} onChange={event => setInsightsImprovement(event.target.value)} /></label></div>

          {selectedShift && (
            <section className="space-y-4 rounded-lg border p-4">
              <div>
                <h3 className="font-semibold">{t('endOfLiveRecap')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('endOfLiveRecapHelp')}</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {finalReportRecapFields.map(field => (
                  <label className="text-sm font-medium" key={field.key}>
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
            </section>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('cancel')}</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('saveFinalReport')}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog
      open={showReviewWarning}
      onOpenChange={setShowReviewWarning}
      title={t('reportReviewWarning', { count: lowConfidence })}
      description={t('draftCanKeepReview')}
      cancelText={t('backToReview')}
      confirmText={t('saveAnyway')}
      onConfirm={() => void persistDraft()}
    />
  </>)
}

function inferDashboardPlatform(shift: Shift | undefined, platforms: Platform[]): ReportDashboardPlatform {
  const name = platforms.find(platform => platform.id === shift?.platform_id)?.name.toLowerCase() || ''
  if (name.includes('tiktok')) return 'tiktok_shop'
  if (name.includes('shopee')) return 'shopee_live'
  return 'other'
}

function parseMetricInput(key: ReportMetricKey, value: string): number | string | null {
  if (!value.trim()) return null
  if (key === 'started_at' || key === 'ended_at') return value.trim()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildMetrics(keys: ReportMetricKey[], values: Partial<Record<ReportMetricKey, string>>): NormalizedReportMetrics {
  return Object.fromEntries(keys.map(key => [key, parseMetricInput(key, values[key] || '')]))
}

const numberFrom = (value: NormalizedReportMetrics[ReportMetricKey]) => numericMetric(value)
const entityName = (items: Array<{ id: string; name: string }>, id?: string) => items.find(item => item.id === id)?.name || '—'

function Entity({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
}

function roleSummary(
  shift: Shift,
  users: User[],
  registrations: ShiftRegistration[],
  labels: Record<'host' | 'support' | 'technical', string>,
) {
  const names = (role: 'host' | 'support' | 'technical', assigned?: string) => {
    const ids = new Set([
      ...(assigned ? [assigned] : []),
      ...registrations.filter(item => item.shift_id === shift.id && item.operational_role === role && item.status === 'approved').map(item => item.user_id),
    ])
    return [...ids].map(id => users.find(user => user.id === id)?.full_name).filter(Boolean).join(', ') || '—'
  }
  return `${labels.host}: ${names('host', shift.host_id)} · ${labels.support}: ${names('support', shift.support_id)} · ${labels.technical}: ${names('technical', shift.technical_id)}`
}

function OcrStatus({ status }: { status: OcrReviewData['status'] }) {
  const { t } = useTranslation()
  const label = {
    waiting: t('pending'),
    processing: t('loading'),
    review_required: t('statusReviewRequired'),
    confirmed: t('statusConfirmed'),
    failed: t('error'),
    unavailable: t('manualInput'),
  }[status]
  const className = status === 'confirmed' ? 'bg-green-100 text-green-800' : status === 'failed' ? 'bg-red-100 text-red-800' : status === 'review_required' || status === 'unavailable' ? 'bg-amber-100 text-amber-800' : ''
  return <Badge className={className} variant="outline">{label}</Badge>
}
