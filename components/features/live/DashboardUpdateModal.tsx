'use client'

import * as React from 'react'
import { dashboardUpdateService, ocrService } from '@/lib/services/dataService'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { OcrCropBox, OcrReviewData, ReportDashboardPlatform, Shift } from '@/lib/types/database.types'
import { parseOcrValue } from '@/lib/utils/ocrMetrics'
import {
  canonicalizeOcrReview,
  clearOcrDerivedMetricState,
  clearReviewMetric,
  confirmAllReviewMetrics,
  confirmReviewMetric,
  markMetricManual,
  metricMatchesFilter,
  ocrCandidateMetricKeys,
  parseAndApplyOcrText,
  resetMetricToOcr,
  reviewInputValues,
  reviewRequiredCount,
  shouldInitializeOcrSelection,
  type OcrMetricFilter,
  type OcrTextApplicationResult,
} from '@/lib/utils/ocrReview'
import {
  applySelectedMetricsToState,
  parseMetricInputValue,
  platformCanonicalMetricKeys,
  shopeeMainMetricKeys,
  shopeeSupplementaryMetricKeys,
  tiktokCentralMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'
import { serializeLiveMetricState } from '@/lib/utils/ocrMetricSerialization'
import { metricStatusTranslationKeys, metricTranslationKeys } from '@/lib/reportMetricLabels'
import { defaultOcrCrop } from '@/lib/utils/ocrImage'
import { proposeTikTokKpiCrop } from '@/lib/services/imageOcrService'
import { requestVisionOcr, VisionOcrClientError } from '@/lib/services/visionOcrService'
import {
  compareVisionMetrics,
  hybridResultsToMetricValues,
  mergeHybridResultsIntoReview,
  resolveHybridMetric,
} from '@/lib/utils/visionOcrHybrid'
import { toVisionPlatform, type HybridMetricResult } from '@/lib/visionOcr/types'
import { OcrCropPreview } from '@/components/features/reports/OcrCropPreview'
import { OcrMetricFilterBar } from '@/components/features/reports/OcrMetricReviewField'
import { OcrTextApplicationSummary } from '@/components/features/reports/OcrTextApplicationSummary'
import { OcrBoundMetricFields } from '@/components/features/reports/OcrBoundMetricFields'
import { OcrCandidateDiagnosticsTable } from '@/components/features/reports/OcrCandidateDiagnosticsTable'
import {
  VisionOcrActionGroup,
  VisionOcrReviewPanel,
  type VisionOcrMode,
} from '@/components/features/reports/VisionOcrControls'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { AlertTriangle, Loader2, RefreshCw, ScanText, Upload, X } from 'lucide-react'

interface DashboardUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  platformName?: string
  onSuccess: () => void
}

interface FormData {
  notes: string
  screenshot_url: string
}

const emptyForm = (): FormData => ({
  notes: '', screenshot_url: '',
})

export function DashboardUpdateModal({ open, onOpenChange, shift, platformName, onSuccess }: DashboardUpdateModalProps) {
  const inferredDashboardPlatform = inferDashboardPlatform(platformName)
  const initializedShiftIdRef = React.useRef<string | null>(null)
  const manualMetricKeysRef = React.useRef(new Set<CanonicalMetricKey>())
  const ocrDerivedMetricKeysRef = React.useRef(new Set<CanonicalMetricKey>())
  const cropProposalKeyRef = React.useRef('')
  const [formData, setFormData] = React.useState<FormData>(emptyForm)
  const [submitting, setSubmitting] = React.useState(false)
  const [ocrReview, setOcrReview] = React.useState<OcrReviewData | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [proposingCrop, setProposingCrop] = React.useState(false)
  const [metricValues, setMetricValues] = React.useState<MetricState>({})
  const [rawOcrText, setRawOcrText] = React.useState('')
  const [ocrApplicationResult, setOcrApplicationResult] = React.useState<OcrTextApplicationResult | null>(null)
  const [metricFilter, setMetricFilter] = React.useState<OcrMetricFilter>('data')
  const [showReviewWarning, setShowReviewWarning] = React.useState(false)
  const [dashboardPlatform, setDashboardPlatform] = React.useState<ReportDashboardPlatform>(inferredDashboardPlatform)
  const [cropBox, setCropBox] = React.useState<OcrCropBox>(defaultOcrCrop(inferredDashboardPlatform))
  const [visionMode, setVisionMode] = React.useState<VisionOcrMode | null>(null)
  const [visionResults, setVisionResults] = React.useState<HybridMetricResult[]>([])
  const [visionScanning, setVisionScanning] = React.useState(false)
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()

  React.useEffect(() => {
    if (!open) {
      initializedShiftIdRef.current = null
      return
    }
    if (!shouldInitializeOcrSelection(initializedShiftIdRef.current, shift.id, open)) return
    initializedShiftIdRef.current = shift.id
    manualMetricKeysRef.current.clear()
    ocrDerivedMetricKeysRef.current.clear()
    setFormData(emptyForm())
    setOcrReview(null)
    setMetricValues({})
    setRawOcrText('')
    setOcrApplicationResult(null)
    setDashboardPlatform(inferredDashboardPlatform)
    setCropBox(defaultOcrCrop(inferredDashboardPlatform))
    setMetricFilter('data')
    setShowReviewWarning(false)
    setVisionMode(null)
    setVisionResults([])
    setVisionScanning(false)
  }, [inferredDashboardPlatform, open, shift.id])

  React.useEffect(() => {
    if (dashboardPlatform !== 'tiktok_shop' || !formData.screenshot_url) {
      cropProposalKeyRef.current = ''
      setProposingCrop(false)
      return
    }
    const proposalKey = `${dashboardPlatform}:${formData.screenshot_url}`
    if (cropProposalKeyRef.current === proposalKey) return
    cropProposalKeyRef.current = proposalKey
    setProposingCrop(true)
    setCropBox(defaultOcrCrop('tiktok_shop'))
    let active = true
    void proposeTikTokKpiCrop(formData.screenshot_url)
      .then(proposal => {
        if (active && cropProposalKeyRef.current === proposalKey) {
          setCropBox(proposal.crop_box)
        }
      })
      .catch(() => {
        // The broad central fallback remains visible and editable.
      })
      .finally(() => {
        if (active && cropProposalKeyRef.current === proposalKey) setProposingCrop(false)
      })
    return () => {
      active = false
    }
  }, [dashboardPlatform, formData.screenshot_url])

  const validateForm = (): boolean => {
    if (dashboardPlatform === 'other') return false
    try {
      serializeLiveMetricState(dashboardPlatform, metricValues)
      return true
    } catch {
      return false
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (dashboardPlatform === 'tiktok_shop') setProposingCrop(true)
      setFormData({ ...formData, screenshot_url: URL.createObjectURL(file) })
      setCropBox(defaultOcrCrop(dashboardPlatform))
      toast({ 
        title: t('dashboardScreenshot'),
        description: t('dashboardImageRequiredHelp'),
        variant: 'success' 
      })
    }
  }

  const visibleMetricKeys = [...platformCanonicalMetricKeys(dashboardPlatform)]

  const setMetric = (key: CanonicalMetricKey, value: string) => {
    manualMetricKeysRef.current.add(key)
    setMetricValues(current => ({ ...current, [key]: parseMetricInputValue(value) }))
    setOcrReview(current => current
      ? markMetricManual(current, key, value, currentUser?.id || 'unknown')
      : current)
  }

  const confirmMetric = (key: CanonicalMetricKey) => {
    if (!currentUser) return
    setOcrReview(current => current
      ? confirmReviewMetric(current, key, metricValues[key] ?? null, currentUser.id)
      : current)
  }

  const resetMetric = (key: CanonicalMetricKey) => {
    setOcrReview(current => {
      if (!current) return current
      const next = resetMetricToOcr(current, key)
      const value = reviewInputValues(next)[key] ?? null
      manualMetricKeysRef.current.delete(key)
      ocrDerivedMetricKeysRef.current.add(key)
      setMetricValues(values => ({ ...values, [key]: value }))
      return next
    })
  }

  const clearMetric = (key: CanonicalMetricKey) => {
    if (!currentUser) return
    manualMetricKeysRef.current.add(key)
    setMetricValues(current => ({ ...current, [key]: null }))
    setOcrReview(current => current ? clearReviewMetric(current, key, currentUser.id) : current)
  }

  const confirmAllMetrics = () => {
    if (!currentUser) return
    setOcrReview(current => current ? confirmAllReviewMetrics(current, metricValues, currentUser.id) : current)
  }

  const mapUnmappedField = (index: number, key: CanonicalMetricKey) => {
    const field = ocrReview?.unmapped_fields?.[index]
    if (!field) return
    const parsed = parseOcrValue(field.original_value)
    const mappedValue = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
    manualMetricKeysRef.current.add(key)
    setMetricValues(current => ({ ...current, [key]: mappedValue }))
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

  const applyRawOcrText = (
    text = rawOcrText,
    reviewOverride?: OcrReviewData,
  ) => {
    if (!text.trim() || dashboardPlatform === 'other') return null
    const result = parseAndApplyOcrText({
      platform: dashboardPlatform,
      rawText: text,
      currentMetrics: metricValues,
      overwriteOcrValues: true,
      protectedKeys: manualMetricKeysRef.current,
      existingCandidates: reviewOverride,
    })
    setMetricValues(current => parseAndApplyOcrText({
      platform: dashboardPlatform,
      rawText: text,
      currentMetrics: current,
      overwriteOcrValues: true,
      protectedKeys: manualMetricKeysRef.current,
      existingCandidates: reviewOverride,
    }).metrics)
    result.appliedKeys.forEach(key => ocrDerivedMetricKeysRef.current.add(key))
    setOcrReview(result.review)
    setOcrApplicationResult(result)
    toast({
      title: t('ocrResults'),
      description: t('ocrApplySummary', {
        applied: result.appliedKeys.length,
        review: result.reviewRequiredKeys.length,
      }),
      variant: result.appliedKeys.length > 0 ? 'success' : 'destructive',
    })
    return result
  }

  const scanScreenshot = async () => {
    if (scanning || proposingCrop) return null
    if (!formData.screenshot_url) return null
    if (dashboardPlatform === 'other') {
      toast({ title: t('dashboardPlatformRequired'), description: t('dashboardPlatformRequiredHelp'), variant: 'destructive' })
      return null
    }
    setScanning(true)
    const overwriteManualEdits = ocrReview !== null
    try {
      const review = canonicalizeOcrReview(await ocrService.extractDashboardMetrics(
        dashboardPlatform,
        rawOcrText || undefined,
        formData.screenshot_url,
        cropBox,
      ))
      const incomingMetricKeys = ocrCandidateMetricKeys(review)
      const recognizedText = rawOcrText.trim() || review.raw_output?.trim() || ''
      if (recognizedText) {
        setRawOcrText(recognizedText)
      }
      if (incomingMetricKeys.length === 0 && recognizedText) {
        applyRawOcrText(recognizedText, review)
        return review
      }
      setOcrReview(review)
      if (incomingMetricKeys.length === 0 && (review.status === 'unavailable' || review.status === 'failed')) {
        toast({ title: t('ocrResults'), description: t('ocrUnavailableHelp'), variant: 'destructive' })
        return review
      }
      setMetricValues(current => applySelectedMetricsToState(current, review, {
        protectedKeys: manualMetricKeysRef.current,
        overwriteProtected: overwriteManualEdits,
      }))
      incomingMetricKeys.forEach(key => ocrDerivedMetricKeysRef.current.add(key))
      if (overwriteManualEdits) {
        incomingMetricKeys.forEach(key => manualMetricKeysRef.current.delete(key))
      }
      return review
    } catch {
      toast({ title: t('ocrResults'), description: t('ocrUnavailableHelp'), variant: 'destructive' })
      return null
    } finally {
      setScanning(false)
    }
  }

  const visionErrorMessage = (error: unknown) => {
    if (!(error instanceof VisionOcrClientError)) return t('visionOcrFailed')
    if (error.code === 'AI_OCR_DISABLED') return t('visionOcrDisabled')
    if (error.code === 'AI_PROVIDER_NOT_CONFIGURED') return t('visionOcrNotConfigured')
    if (error.code === 'AUTHENTICATION_REQUIRED' || error.code === 'PERMISSION_DENIED') return t('visionOcrPermissionDenied')
    if (error.code === 'INVALID_CROP' || error.code === 'INVALID_IMAGE') return t('visionOcrInvalidCrop')
    if (error.code === 'AI_OCR_TIMEOUT') return t('visionOcrTimeout')
    if (error.code === 'RATE_LIMITED') return t('visionOcrRateLimited')
    return t('visionOcrFailed')
  }

  const applyVisionResults = (
    results: HybridMetricResult[],
    forceKeys: ReadonlySet<CanonicalMetricKey> = new Set(),
  ) => {
    const selected = hybridResultsToMetricValues(results)
    setMetricValues(current => {
      const next = { ...current }
      for (const [rawKey, value] of Object.entries(selected)) {
        const key = rawKey as CanonicalMetricKey
        if (forceKeys.has(key) || !manualMetricKeysRef.current.has(key)) {
          next[key] = value
          ocrDerivedMetricKeysRef.current.add(key)
        }
      }
      return next
    })
    setOcrReview(current => mergeHybridResultsIntoReview(current, results))
  }

  const runVisionMode = async (mode: VisionOcrMode) => {
    if (scanning || visionScanning || proposingCrop) return
    setVisionMode(mode)
    if (mode === 'local') {
      await scanScreenshot()
      setVisionMode(null)
      return
    }
    const visionPlatform = toVisionPlatform(dashboardPlatform)
    if (!formData.screenshot_url || !visionPlatform) {
      toast({ title: t('ocrResults'), description: t('visionOcrInvalidCrop'), variant: 'destructive' })
      setVisionMode(null)
      return
    }
    setVisionScanning(true)
    try {
      const localReview = mode === 'compare' ? await scanScreenshot() : null
      const response = await requestVisionOcr({ platform: dashboardPlatform, imageUrl: formData.screenshot_url, cropBox })
      const results = compareVisionMetrics({
        platform: visionPlatform,
        localReview,
        aiMetrics: response.metrics,
        manualValues: metricValues,
        protectedKeys: manualMetricKeysRef.current,
      })
      setVisionResults(results)
      applyVisionResults(results)
    } catch (error) {
      toast({ title: t('ocrResults'), description: visionErrorMessage(error), variant: 'destructive' })
    } finally {
      setVisionScanning(false)
      setVisionMode(null)
    }
  }

  const resolveVisionResult = (
    key: CanonicalMetricKey,
    source: 'local' | 'ai' | 'manual',
    manualValue?: number | null,
  ) => {
    const next = visionResults.map(result => result.key === key ? resolveHybridMetric(result, source, manualValue) : result)
    if (source === 'manual') manualMetricKeysRef.current.add(key)
    else manualMetricKeysRef.current.delete(key)
    setVisionResults(next)
    applyVisionResults(next, new Set([key]))
  }

  const resetOcrResults = () => {
    setMetricValues(current => clearOcrDerivedMetricState(
      current,
      ocrDerivedMetricKeysRef.current,
      manualMetricKeysRef.current,
    ))
    ocrDerivedMetricKeysRef.current.clear()
    setOcrReview(null)
    setOcrApplicationResult(null)
    setVisionResults([])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (scanning || visionScanning || submitting) return

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
      if (dashboardPlatform === 'other') throw new Error('Dashboard platform is required.')
      const serializedMetrics = serializeLiveMetricState(dashboardPlatform, metricValues)
      await dashboardUpdateService.create({
        shift_id: shift.id,
        time: new Date().toISOString(),
        ...serializedMetrics,
        screenshot_url: formData.screenshot_url || undefined,
        notes: formData.notes || undefined,
        dashboard_platform: dashboardPlatform,
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
  const mainMetricKeys = dashboardPlatform === 'shopee_live'
    ? shopeeMainMetricKeys
    : dashboardPlatform === 'tiktok_shop'
      ? tiktokCentralMetricKeys
      : []
  const supplementaryMetricKeys = dashboardPlatform === 'shopee_live'
    ? shopeeSupplementaryMetricKeys
    : []
  const filteredMainMetricKeys = mainMetricKeys.filter(key =>
    metricMatchesFilter(metricFilter, metricValues[key], ocrReview?.metrics[key]),
  )
  const filteredSupplementaryMetricKeys = supplementaryMetricKeys.filter(key =>
    metricMatchesFilter(metricFilter, metricValues[key], ocrReview?.metrics[key]),
  )

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('liveSnapshotTitle')}</DialogTitle>
          <DialogDescription>{t('liveSnapshotDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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
                  data-testid="live-dashboard-image-upload"
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
                  resetOcrResults()
                }}
              >
                <SelectTrigger className="mt-1 w-full" data-testid="live-platform-selector"><SelectValue placeholder={t('selectDashboardPlatform')} /></SelectTrigger>
                <SelectContent><SelectItem value="tiktok_shop">TikTok Shop</SelectItem><SelectItem value="shopee_live">Shopee Live</SelectItem></SelectContent>
              </Select>
            </label>
            {formData.screenshot_url && <div className="mt-3"><OcrCropPreview imageUrl={formData.screenshot_url} platform={dashboardPlatform} value={cropBox} onChange={setCropBox} onRetry={scanScreenshot} review={ocrReview} disabled={scanning || visionScanning || proposingCrop} /></div>}
            <div className="mt-3 space-y-2">
              <VisionOcrActionGroup
                activeMode={visionMode}
                busy={scanning || visionScanning || proposingCrop}
                disabled={!formData.screenshot_url || dashboardPlatform === 'other'}
                localButtonTestId="live-run-ocr-button"
                onRun={runVisionMode}
              />
              {ocrReview && <Button type="button" variant="ghost" disabled={scanning || visionScanning} onClick={resetOcrResults}><RefreshCw className="mr-2 h-4 w-4" />{t('resetResults')}</Button>}
            </div>
            <VisionOcrReviewPanel results={visionResults} onResolve={resolveVisionResult} />
            <label className="mt-3 block text-sm font-medium">{t('trustedOcrText')} ({t('optional')})
              <Textarea className="mt-1 min-h-28 font-mono text-xs" value={rawOcrText} onChange={event => setRawOcrText(event.target.value)} placeholder={'Sales: 21.281.718,00\nOrders: 109\nPCU: 107'} data-testid="live-ocr-corrected-text" />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{t('trustedOcrHelp')}</span>
            </label>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              disabled={!rawOcrText.trim() || dashboardPlatform === 'other' || scanning || visionScanning}
              onClick={() => applyRawOcrText()}
              data-testid="apply-live-ocr-text"
            >
              <ScanText className="mr-2 h-4 w-4" />{t('applyOcrData')}
            </Button>
            <OcrTextApplicationSummary result={ocrApplicationResult} />
            <OcrCandidateDiagnosticsTable
              review={ocrReview}
              canExport={Boolean(currentUser && hasPermission(currentUser, 'audit.view'))}
            />
            {ocrReview?.raw_diagnostic_output && <details className="rounded-lg bg-muted/50 p-3 text-sm" data-testid="live-ocr-raw-diagnostics"><summary className="cursor-pointer font-medium">{t('rawOcrOutput')}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{ocrReview.raw_diagnostic_output}</pre></details>}
            </div>
            <div className="min-h-40 rounded-lg border p-3" data-testid="live-ocr-completion-status" data-ocr-status={scanning ? 'processing' : ocrReview?.status || 'waiting'}>
              <p className="mb-2 font-medium">{t('ocrResults')} · {dashboardPlatform === 'tiktok_shop' ? 'TikTok Shop' : dashboardPlatform === 'shopee_live' ? 'Shopee Live' : t('selectDashboardPlatform')}</p>
              {scanning ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : ocrReview ? (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {ocrReview.engine && <p className="rounded bg-muted p-2 text-xs">{t('engine')}: {ocrReview.engine} · {t('recognitionLanguage')}: {ocrReview.recognition_language} · {t('overallConfidence')}: {ocrReview.overall_confidence?.toFixed(1) ?? '—'}%</p>}
                  {Object.entries(ocrReview.metrics).map(([key, metric]) => <div key={key} className={`rounded border p-2 text-sm ${metric.status === 'review_required' || metric.status === 'low_confidence' ? 'border-amber-400 bg-amber-50' : metric.status === 'rejected' ? 'border-red-300 bg-red-50' : ''}`}><div className="flex justify-between gap-2"><span className="font-medium">{t(metricTranslationKeys[key as CanonicalMetricKey])}</span><span>{t(metricStatusTranslationKeys[metric.status || 'empty'])}</span></div><p className="text-xs text-muted-foreground">{t('originalLabel')}: {metric.original_label || '—'} · {t('originalValue')}: {metric.raw_value || '—'} → {metric.candidate_value ?? '—'} · {t('confidence')}: {metric.value_confidence == null ? metric.confidence : `${Math.round(metric.value_confidence)}%`}</p><p className="text-xs text-muted-foreground">{t('labelSource')}: {metric.label_source === 'platform_layout' ? t('platformLayout') : t('ocrText')} · {t('valuePass')}: {metric.value_source_pass === 'label' ? t('labelPass') : metric.value_source_pass === 'numeric' ? t('numericPass') : metric.value_source_pass === 'card' ? t('cardPass') : t('unknownSource')}</p>{metric.bounding_box && <p className="text-xs text-muted-foreground">{t('boundingBox')}: {Math.round(metric.bounding_box.x)}, {Math.round(metric.bounding_box.y)}, {Math.round(metric.bounding_box.width)}×{Math.round(metric.bounding_box.height)}</p>}{metric.rejection_reason && <p className="mt-1 text-xs text-amber-800">{t(metric.status === 'review_required' || metric.status === 'low_confidence' ? 'reviewRequiredHelp' : 'rejectedMetricHelp')}</p>}</div>)}
                </div>
              ) : <p className="text-sm text-muted-foreground">{t('ocrEmptyHelp')}</p>}
              {ocrReview?.status === 'unavailable' && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800">{t('ocrUnavailableHelp')}</p>}
              {ocrReview?.unmapped_fields && ocrReview.unmapped_fields.length > 0 && <div className="mt-3 space-y-2" data-testid="live-ocr-unmapped-section"><p className="font-medium">{t('rejectedUnmappedOcrFields')}</p>{ocrReview.unmapped_fields.map((field, index) => <div className="grid gap-2 rounded border p-2" key={`${field.original_label}-${index}`} data-testid="ocr-unmapped-field" data-ocr-original-label={field.original_label}><p className="text-xs">{t('originalLabel')}: {field.original_label} · {t('originalValue')}: {field.original_value || '—'} · {t('source')}: {field.source || t('unknownSource')}</p>{field.rejection_reason && <p className="text-xs text-amber-800">{t('unmappedMetricHelp')}</p>}<Select onValueChange={value => mapUnmappedField(index, value as CanonicalMetricKey)}><SelectTrigger><SelectValue placeholder={t('mapManually')} /></SelectTrigger><SelectContent>{visibleMetricKeys.map(key => <SelectItem key={key} value={key}>{t(metricTranslationKeys[key])}</SelectItem>)}</SelectContent></Select></div>)}</div>}
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
            <div data-testid="ocr-main-metrics" data-ocr-platform={dashboardPlatform}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OcrBoundMetricFields
                  metricKeys={filteredMainMetricKeys}
                  values={metricValues}
                  review={ocrReview}
                  editable
                  canReview={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
                  onChange={setMetric}
                  onConfirm={confirmMetric}
                  onReset={resetMetric}
                  onClear={clearMetric}
                />
              </div>
            </div>
            {filteredSupplementaryMetricKeys.length > 0 && (
              <div data-testid="ocr-supplementary-metrics">
                <h4 className="mb-2 text-sm font-semibold">{t('platformSpecificMetrics')}</h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <OcrBoundMetricFields
                    metricKeys={filteredSupplementaryMetricKeys}
                    values={metricValues}
                    review={ocrReview}
                    editable
                    canReview={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
                    onChange={setMetric}
                    onConfirm={confirmMetric}
                    onReset={resetMetric}
                    onClear={clearMetric}
                  />
                </div>
              </div>
            )}
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
            <Button type="submit" disabled={submitting || scanning || visionScanning}>
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

function inferDashboardPlatform(platformName?: string): ReportDashboardPlatform {
  if (/shopee/i.test(platformName || '')) return 'shopee_live'
  if (/tiktok/i.test(platformName || '')) return 'tiktok_shop'
  return 'other'
}
