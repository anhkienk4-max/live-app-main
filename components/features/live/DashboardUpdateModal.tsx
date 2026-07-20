'use client'

import * as React from 'react'
import { dashboardUpdateService, ocrService } from '@/lib/services/dataService'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { OcrCropBox, OcrReviewData, ReportDashboardPlatform, ReportMetricKey, Shift } from '@/lib/types/database.types'
import { commonReportMetricKeys, parseOcrValue, platformMetricKeys } from '@/lib/utils/ocrMetrics'
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
import { metricStatusTranslationKeys, metricTranslationKeys } from '@/lib/reportMetricLabels'
import { defaultOcrCrop } from '@/lib/utils/ocrImage'
import { OcrCropPreview } from '@/components/features/reports/OcrCropPreview'
import { OcrMetricFilterBar, OcrMetricReviewField } from '@/components/features/reports/OcrMetricReviewField'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { AlertTriangle, Loader2, RefreshCw, ScanText, Upload, X } from 'lucide-react'
import { getReportMetricInputProps } from '@/lib/utils/reportMetricInput'

interface DashboardUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  platformName?: string
  onSuccess: () => void
}

interface FormData {
  revenue: string
  gmv: string
  orders: string
  peak_viewers: string
  current_viewers: string
  total_views: string
  total_viewers: string
  likes: string
  comments: string
  shares: string
  notes: string
  screenshot_url: string
}

const emptyForm = (): FormData => ({
  revenue: '', gmv: '', orders: '', peak_viewers: '', current_viewers: '',
  total_views: '', total_viewers: '', likes: '', comments: '', shares: '', notes: '', screenshot_url: '',
})

export function DashboardUpdateModal({ open, onOpenChange, shift, platformName, onSuccess }: DashboardUpdateModalProps) {
  const inferredDashboardPlatform = inferDashboardPlatform(platformName)
  const [formData, setFormData] = React.useState<FormData>(emptyForm)
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const [ocrReview, setOcrReview] = React.useState<OcrReviewData | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [metricValues, setMetricValues] = React.useState<Partial<Record<ReportMetricKey, string>>>({})
  const [rawOcrText, setRawOcrText] = React.useState('')
  const [metricFilter, setMetricFilter] = React.useState<OcrMetricFilter>('data')
  const [showReviewWarning, setShowReviewWarning] = React.useState(false)
  const [dashboardPlatform, setDashboardPlatform] = React.useState<ReportDashboardPlatform>(inferredDashboardPlatform)
  const [cropBox, setCropBox] = React.useState<OcrCropBox>(defaultOcrCrop(inferredDashboardPlatform))
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()

  React.useEffect(() => {
    if (open) {
      setFormData(emptyForm())
      setErrors({})
      setOcrReview(null)
      setMetricValues({})
      setRawOcrText('')
      setDashboardPlatform(inferredDashboardPlatform)
      setCropBox(defaultOcrCrop(inferredDashboardPlatform))
      setMetricFilter('data')
      setShowReviewWarning(false)
    }
  }, [inferredDashboardPlatform, open])

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}
    const revenueValue = formData.revenue || metricValues.revenue || metricValues.sales || metricValues.gmv
    const ordersValue = formData.orders || metricValues.orders || metricValues.sku_orders
    const peakValue = formData.peak_viewers || metricValues.peak_concurrent_viewers || metricValues.pcu

    if (!revenueValue || Number(revenueValue) < 0) {
      newErrors.revenue = t('validationFillRequired')
    }
    if (!ordersValue || Number(ordersValue) < 0) {
      newErrors.orders = t('validationFillRequired')
    }
    if (!peakValue || Number(peakValue) < 0) {
      newErrors.peak_viewers = t('validationFillRequired')
    }
    if (!formData.current_viewers || parseInt(formData.current_viewers) < 0) {
      newErrors.current_viewers = t('validationFillRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData({ ...formData, screenshot_url: URL.createObjectURL(file) })
      setCropBox(defaultOcrCrop(dashboardPlatform))
      toast({ 
        title: t('dashboardScreenshot'),
        description: t('dashboardImageRequiredHelp'),
        variant: 'success' 
      })
    }
  }

  const visibleMetricKeys = [...commonReportMetricKeys, ...platformMetricKeys[dashboardPlatform]]
  const formFieldByMetric: Partial<Record<ReportMetricKey, keyof FormData>> = {
    revenue: 'revenue',
    sales: 'revenue',
    gmv: 'gmv',
    orders: 'orders',
    sku_orders: 'orders',
    peak_concurrent_viewers: 'peak_viewers',
    pcu: 'peak_viewers',
    current_viewers: 'current_viewers',
    total_views: 'total_views',
    total_viewers: 'total_viewers',
    likes: 'likes',
    comments: 'comments',
    shares: 'shares',
  }

  const mirrorMetricToForm = (key: ReportMetricKey, value: string) => {
    const field = formFieldByMetric[key]
    if (field) setFormData(current => ({ ...current, [field]: value }))
  }

  const setMetric = (key: ReportMetricKey, value: string) => {
    setMetricValues(current => ({ ...current, [key]: value }))
    mirrorMetricToForm(key, value)
    setOcrReview(current => current
      ? markMetricManual(current, key, value, currentUser?.id || 'unknown')
      : current)
  }

  const confirmMetric = (key: ReportMetricKey) => {
    if (!currentUser) return
    setOcrReview(current => current
      ? confirmReviewMetric(current, key, metricValues[key] || '', currentUser.id)
      : current)
  }

  const resetMetric = (key: ReportMetricKey) => {
    setOcrReview(current => {
      if (!current) return current
      const next = resetMetricToOcr(current, key)
      const value = reviewInputValues(next)[key] || ''
      setMetricValues(values => ({ ...values, [key]: value }))
      mirrorMetricToForm(key, value)
      return next
    })
  }

  const clearMetric = (key: ReportMetricKey) => {
    if (!currentUser) return
    setMetricValues(current => ({ ...current, [key]: '' }))
    mirrorMetricToForm(key, '')
    setOcrReview(current => current ? clearReviewMetric(current, key, currentUser.id) : current)
  }

  const confirmAllMetrics = () => {
    if (!currentUser) return
    setOcrReview(current => current ? confirmAllReviewMetrics(current, metricValues, currentUser.id) : current)
  }

  const mapUnmappedField = (index: number, key: ReportMetricKey) => {
    const field = ocrReview?.unmapped_fields?.[index]
    if (!field) return
    const parsed = parseOcrValue(field.original_value)
    setMetricValues(current => ({ ...current, [key]: parsed == null ? '' : String(parsed) }))
    setOcrReview(current => current ? {
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
    } : current)
  }

  const scanScreenshot = async () => {
    if (!formData.screenshot_url) return
    if (dashboardPlatform === 'other') {
      toast({ title: t('dashboardPlatformRequired'), description: t('dashboardPlatformRequiredHelp'), variant: 'destructive' })
      return
    }
    setScanning(true)
    try {
      const review = await ocrService.extractDashboardMetrics(
        dashboardPlatform,
        rawOcrText || undefined,
        formData.screenshot_url,
        cropBox,
      )
      setOcrReview(review)
      if (review.status === 'unavailable' || review.status === 'failed') {
        toast({ title: t('ocrResults'), description: t('ocrUnavailableHelp'), variant: 'destructive' })
        return
      }
      const recognizedValues = reviewInputValues(review)
      setMetricValues(recognizedValues)
      const value = (key: ReportMetricKey) => {
        return recognizedValues[key] || ''
      }
      setFormData(current => ({
        ...current,
        revenue: value('revenue') || value('sales') || value('gmv') || current.revenue,
        gmv: value('gmv') || current.gmv,
        orders: value('orders') || value('sku_orders') || current.orders,
        peak_viewers: value('peak_concurrent_viewers') || value('pcu') || current.peak_viewers,
        current_viewers: value('current_viewers') || current.current_viewers,
        total_views: value('total_views') || current.total_views,
        total_viewers: value('total_viewers') || current.total_viewers,
        likes: value('likes') || current.likes,
        comments: value('comments') || current.comments,
        shares: value('shares') || current.shares,
      }))
    } finally {
      setScanning(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast({ title: t('validationError'), description: t('validationFillRequired'), variant: 'destructive' })
      return
    }
    if (reviewRequiredCount(ocrReview) > 0) {
      setShowReviewWarning(true)
      return
    }
    void persistUpdate()
  }

  const persistUpdate = async () => {
    setSubmitting(true)

    try {
      const normalizedMetrics = Object.fromEntries(Object.entries(metricValues).map(([key, value]) => [
        key,
        value?.trim() ? Number.isFinite(Number(value)) ? Number(value) : value : null,
      ]))
      const metricNumber = (key: ReportMetricKey) => {
        const value = normalizedMetrics[key]
        return typeof value === 'number' ? value : undefined
      }
      await dashboardUpdateService.create({
        shift_id: shift.id,
        time: new Date().toISOString(),
        revenue: optionalNumber(formData.revenue) ?? metricNumber('revenue') ?? metricNumber('sales') ?? metricNumber('gmv')!,
        gmv: optionalNumber(formData.gmv) ?? metricNumber('gmv') ?? metricNumber('sales'),
        orders: optionalNumber(formData.orders) ?? metricNumber('orders') ?? metricNumber('sku_orders')!,
        peak_viewers: optionalNumber(formData.peak_viewers) ?? metricNumber('peak_concurrent_viewers') ?? metricNumber('pcu')!,
        current_viewers: parseInt(formData.current_viewers),
        total_views: optionalNumber(formData.total_views),
        total_viewers: optionalNumber(formData.total_viewers),
        likes: optionalNumber(formData.likes),
        comments: optionalNumber(formData.comments),
        shares: optionalNumber(formData.shares),
        screenshot_url: formData.screenshot_url || undefined,
        notes: formData.notes || undefined,
        dashboard_platform: dashboardPlatform,
        normalized_metrics: normalizedMetrics,
        ocr_review: ocrReview || undefined,
        raw_ocr_output: ocrReview?.raw_output,
      })

      toast({ title: t('updateSubmitted'), description: t('updateSubmittedHelp'), variant: 'success' })
      
      onSuccess()
      onOpenChange(false)
    } catch {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const unresolvedCount = reviewRequiredCount(ocrReview)
  const filteredMetricKeys = visibleMetricKeys.filter(key =>
    metricMatchesFilter(metricFilter, metricValues[key] || '', ocrReview?.metrics[key]),
  )

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('liveSnapshotTitle')}</DialogTitle>
          <DialogDescription>{t('liveSnapshotDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('metricRevenue')} (VND) <span className="text-red-500">*</span>
              </label>
              <Input
                {...getReportMetricInputProps('revenue')}
                placeholder="0.00"
                value={formData.revenue}
                onChange={(e) => setMetric('revenue', e.target.value)}
                className={errors.revenue ? 'border-red-500' : ''}
              />
              {errors.revenue && <div className="text-xs text-red-500 mt-1">{errors.revenue}</div>}
            </div>

            <MetricInput metricKey="gmv" label={`${t('currentGmv')} (VND)`} value={formData.gmv} onChange={value => setMetric('gmv', value)} />

            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('metricOrders')} <span className="text-red-500">*</span>
              </label>
              <Input
                {...getReportMetricInputProps('orders')}
                placeholder="0"
                value={formData.orders}
                onChange={(e) => setMetric('orders', e.target.value)}
                className={errors.orders ? 'border-red-500' : ''}
              />
              {errors.orders && <div className="text-xs text-red-500 mt-1">{errors.orders}</div>}
            </div>

            <MetricInput metricKey="total_views" label={t('totalViews')} value={formData.total_views} onChange={value => setMetric('total_views', value)} />
            <MetricInput metricKey="total_viewers" label={t('totalViewers')} value={formData.total_viewers} onChange={value => setMetric('total_viewers', value)} />
            <MetricInput metricKey="likes" label={t('metricLikes')} value={formData.likes} onChange={value => setMetric('likes', value)} />
            <MetricInput metricKey="comments" label={t('metricComments')} value={formData.comments} onChange={value => setMetric('comments', value)} />
            <MetricInput metricKey="shares" label={t('metricShares')} value={formData.shares} onChange={value => setMetric('shares', value)} />

            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('peakViewers')} <span className="text-red-500">*</span>
              </label>
              <Input
                {...getReportMetricInputProps('peak_concurrent_viewers')}
                placeholder="0"
                value={formData.peak_viewers}
                onChange={(e) => setMetric('peak_concurrent_viewers', e.target.value)}
                className={errors.peak_viewers ? 'border-red-500' : ''}
              />
              {errors.peak_viewers && <div className="text-xs text-red-500 mt-1">{errors.peak_viewers}</div>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('currentViewers')} <span className="text-red-500">*</span>
              </label>
              <Input
                {...getReportMetricInputProps('current_viewers')}
                placeholder="0"
                value={formData.current_viewers}
                onChange={(e) => setMetric('current_viewers', e.target.value)}
                className={errors.current_viewers ? 'border-red-500' : ''}
              />
              {errors.current_viewers && <div className="text-xs text-red-500 mt-1">{errors.current_viewers}</div>}
            </div>
          </div>

          {/* Screenshot Upload */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
            <label className="text-sm font-medium mb-2 block">{t('dashboardScreenshot')}</label>
            {formData.screenshot_url ? (
              <div className="relative">
                <img 
                  src={formData.screenshot_url} 
                  alt={t('dashboardScreenshot')}
                  className="w-full h-40 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2"
                  onClick={() => { setFormData({ ...formData, screenshot_url: '' }); setOcrReview(null) }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">{t('uploadScreenshot')}</span>
                <span className="text-xs text-gray-500 mt-1">{t('uploadFileHint')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            )}
            <label className="mt-3 block text-sm font-medium">{t('platformDashboardType')} *
              <Select
                value={dashboardPlatform}
                disabled={inferredDashboardPlatform !== 'other'}
                onValueChange={value => {
                  const next = value as ReportDashboardPlatform
                  setDashboardPlatform(next)
                  setCropBox(defaultOcrCrop(next))
                  setOcrReview(null)
                  setMetricValues({})
                }}
              >
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder={t('selectDashboardPlatform')} /></SelectTrigger>
                <SelectContent><SelectItem value="tiktok_shop">TikTok Shop</SelectItem><SelectItem value="shopee_live">Shopee Live</SelectItem></SelectContent>
              </Select>
            </label>
            {formData.screenshot_url && <div className="mt-3"><OcrCropPreview imageUrl={formData.screenshot_url} platform={dashboardPlatform} value={cropBox} onChange={setCropBox} disabled={scanning} /></div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!formData.screenshot_url || scanning} onClick={scanScreenshot}>{scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}{ocrReview ? t('rescanOcr') : t('scanOcr')}</Button>
              {ocrReview && <Button type="button" variant="ghost" onClick={() => { setOcrReview(null); setFormData(current => ({ ...emptyForm(), screenshot_url: current.screenshot_url })) }}><RefreshCw className="mr-2 h-4 w-4" />{t('resetResults')}</Button>}
            </div>
            <label className="mt-3 block text-sm font-medium">{t('trustedOcrText')} ({t('optional')})
              <Textarea className="mt-1 min-h-28 font-mono text-xs" value={rawOcrText} onChange={event => setRawOcrText(event.target.value)} placeholder={'Sales: 21.281.718,00\nOrders: 109\nPCU: 107'} />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{t('trustedOcrHelp')}</span>
            </label>
            </div>
            <div className="min-h-40 rounded-lg border p-3">
              <p className="mb-2 font-medium">{t('ocrResults')} · {dashboardPlatform === 'tiktok_shop' ? 'TikTok Shop' : dashboardPlatform === 'shopee_live' ? 'Shopee Live' : t('selectDashboardPlatform')}</p>
              {scanning ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : ocrReview ? (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {ocrReview.engine && <p className="rounded bg-muted p-2 text-xs">{t('engine')}: {ocrReview.engine} · {t('recognitionLanguage')}: {ocrReview.recognition_language} · {t('overallConfidence')}: {ocrReview.overall_confidence?.toFixed(1) ?? '—'}%</p>}
                  {Object.entries(ocrReview.metrics).map(([key, metric]) => <div key={key} className={`rounded border p-2 text-sm ${metric.status === 'review_required' ? 'border-amber-400 bg-amber-50' : metric.status === 'rejected' ? 'border-red-300 bg-red-50' : ''}`}><div className="flex justify-between gap-2"><span className="font-medium">{t(metricTranslationKeys[key as ReportMetricKey])}</span><span>{t(metricStatusTranslationKeys[metric.status || 'empty'])}</span></div><p className="text-xs text-muted-foreground">{t('originalLabel')}: {metric.original_label || '—'} · {t('originalValue')}: {metric.raw_value || '—'} → {metric.candidate_value ?? '—'} · {t('confidence')}: {metric.value_confidence == null ? metric.confidence : `${Math.round(metric.value_confidence)}%`}</p><p className="text-xs text-muted-foreground">{t('labelSource')}: {metric.label_source === 'platform_layout' ? t('platformLayout') : t('ocrText')} · {t('valuePass')}: {metric.value_source_pass === 'label' ? t('labelPass') : metric.value_source_pass === 'numeric' ? t('numericPass') : metric.value_source_pass === 'card' ? t('cardPass') : t('unknownSource')}</p>{metric.bounding_box && <p className="text-xs text-muted-foreground">{t('boundingBox')}: {Math.round(metric.bounding_box.x)}, {Math.round(metric.bounding_box.y)}, {Math.round(metric.bounding_box.width)}×{Math.round(metric.bounding_box.height)}</p>}{metric.rejection_reason && <p className="mt-1 text-xs text-amber-800">{t(metric.status === 'review_required' ? 'reviewRequiredHelp' : 'rejectedMetricHelp')}</p>}</div>)}
                </div>
              ) : <p className="text-sm text-muted-foreground">{t('ocrEmptyHelp')}</p>}
              {ocrReview?.status === 'unavailable' && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800">{t('ocrUnavailableHelp')}</p>}
              {ocrReview?.unmapped_fields && ocrReview.unmapped_fields.length > 0 && <div className="mt-3 space-y-2"><p className="font-medium">{t('rejectedUnmappedOcrFields')}</p>{ocrReview.unmapped_fields.map((field, index) => <div className="grid gap-2 rounded border p-2" key={`${field.original_label}-${index}`}><p className="text-xs">{t('originalLabel')}: {field.original_label} · {t('originalValue')}: {field.original_value || '—'} · {t('source')}: {field.source || t('unknownSource')}</p>{field.rejection_reason && <p className="text-xs text-amber-800">{t('unmappedMetricHelp')}</p>}<Select onValueChange={value => mapUnmappedField(index, value as ReportMetricKey)}><SelectTrigger><SelectValue placeholder={t('mapManually')} /></SelectTrigger><SelectContent>{visibleMetricKeys.map(key => <SelectItem key={key} value={key}>{t(metricTranslationKeys[key])}</SelectItem>)}</SelectContent></Select></div>)}</div>}
            </div>
          </div>

          <section className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{t('platformAwareLiveMetrics')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t(dashboardPlatform === 'shopee_live'
                    ? 'shopeeLiveSchema'
                    : dashboardPlatform === 'tiktok_shop'
                      ? 'tiktokShopSchema'
                      : 'otherPlatformSchema')}
                </p>
              </div>
              <OcrMetricFilterBar value={metricFilter} onChange={setMetricFilter} reviewCount={unresolvedCount} />
            </div>
            {unresolvedCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">{t('reviewRequiredCount', { count: unresolvedCount })}</p>
                  <p>{t('reviewRequiredHelp')}</p>
                </div>
              </div>
            )}
            {metricGroups.map(group => {
              const allowed = new Set([...commonReportMetricKeys, ...platformMetricKeys[dashboardPlatform]])
              const keys = group.keys.filter(key => allowed.has(key) && filteredMetricKeys.includes(key))
              if (!keys.length) return null
              return (
                <div key={group.title}>
                  <h4 className="mb-2 text-sm font-semibold">{t(group.title)}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {keys.map(key => (
                      <OcrMetricReviewField
                        key={key}
                        metricKey={key}
                        metric={ocrReview?.metrics[key]}
                        value={metricValues[key] || ''}
                        editable
                        canReview={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
                        onChange={value => setMetric(key, value)}
                        onConfirm={() => confirmMetric(key)}
                        onReset={() => resetMetric(key)}
                        onClear={() => clearMetric(key)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {unresolvedCount > 0 && currentUser && hasPermission(currentUser, 'reports.submit') && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={confirmAllMetrics}>{t('confirmAllReviewed')}</Button>
              </div>
            )}
          </section>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-2 block">{t('notesOptional')}</label>
            <Textarea
              placeholder={t('notesPlaceholder')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* Actions */}
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('addUpdate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog
      open={showReviewWarning}
      onOpenChange={setShowReviewWarning}
      title={t('liveReviewWarning', { count: unresolvedCount })}
      description={t('draftCanKeepReview')}
      cancelText={t('backToReview')}
      confirmText={t('saveAnyway')}
      onConfirm={() => void persistUpdate()}
    />
  </>)
}

function MetricInput({ metricKey, label, value, onChange }: { metricKey: ReportMetricKey; label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-medium">{label}<Input className="mt-1" {...getReportMetricInputProps(metricKey)} value={value} onChange={event => onChange(event.target.value)} /></label>
}

function inferDashboardPlatform(platformName?: string): ReportDashboardPlatform {
  if (/shopee/i.test(platformName || '')) return 'shopee_live'
  if (/tiktok/i.test(platformName || '')) return 'tiktok_shop'
  return 'other'
}

const optionalNumber = (value: string): number | undefined => value.trim() === '' ? undefined : Number(value)

const metricGroups: Array<{ title: TranslationKey; keys: ReportMetricKey[] }> = [
  { title: 'salesAndOrders', keys: ['sales', 'revenue', 'gmv', 'orders', 'buyers', 'items_sold', 'average_basket_size', 'average_order_value', 'gpm', 'gmv_per_hour', 'estimated_gmv'] },
  { title: 'viewersAndTraffic', keys: ['total_views', 'total_viewers', 'engaged_viewers', 'peak_concurrent_viewers', 'pcu', 'current_viewers', 'impressions', 'average_view_duration_seconds'] },
  { title: 'engagement', keys: ['comments', 'comment_rate', 'likes', 'shares', 'new_followers'] },
  { title: 'productFunnel', keys: ['add_to_cart', 'product_clicks', 'sku_orders'] },
  { title: 'conversion', keys: ['ctr', 'live_ctr', 'click_rate', 'click_to_order_rate', 'conversion_rate', 'ctor', 'roi_gmv_max'] },
  { title: 'platformSpecificMetrics', keys: ['advertising_cost', 'live_duration_seconds'] },
]
